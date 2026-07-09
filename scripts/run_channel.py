"""
Hourly public-channel content engine (quiet overnight via cron).
Rotates premium content — jobs, CV tips, interview tips, mistakes, salary,
role spotlights, motivation — each with a reaction ask, a "Start & get matched"
funnel button, and cross-platform share buttons (WhatsApp / X / Telegram).
"""

from __future__ import annotations

import datetime as _dt
import html
import os
import random
from urllib.parse import quote

import requests

from d1 import query
from send_telegram import _api

CHANNEL = os.getenv("TELEGRAM_CHANNEL", "@dailyjobs_feed")
TOKEN = os.getenv("TELEGRAM_TOKEN", "").strip()
JOIN_URL = os.getenv("DASHBOARD_URL", "https://jobs-finder-dashboard.pages.dev")
BOT = os.getenv("BOT_USERNAME", "jobs_finder_agent_bot")
JOBS_PER_POST = int(os.getenv("CHANNEL_JOBS_PER_POST", "8"))
RULE = "──────────────"
CH_URL = f"https://t.me/{CHANNEL.replace('@','')}"

# Rotation across the day — jobs appear often, tips interleave (no repeats back-to-back).
ROTATION = ["jobs", "cv_tip", "jobs", "interview_tip", "jobs", "mistake",
            "role_spotlight", "jobs", "salary_tip", "motivation", "jobs",
            "did_you_know", "jobs", "interview_tip", "cv_tip", "role_spotlight",
            "jobs", "mistake"]

TIPS = {
    "cv_tip": [
        ("📄 <b>CV tip of the hour</b>", "Put your best number in the first line. “Cut downtime 20% across 3 sites” beats any adjective. Recruiters skim — lead with proof."),
        ("📄 <b>CV tip</b>", "Mirror the job ad's exact words. If it says “stakeholder management”, don't write “worked with people”. ATS bots rank on overlap."),
        ("📄 <b>CV tip</b>", "One page per 10 years of experience. If a bullet doesn't help you get THIS job, cut it."),
    ],
    "interview_tip": [
        ("🎯 <b>Interview tip</b>", "Prep 3 stories that each prove a different strength, then bend them to any question. One strong story beats ten vague answers."),
        ("🎯 <b>Interview tip</b>", "Always ask: “What does success look like in the first 90 days?” It makes you sound like a hire, not a candidate."),
        ("🎯 <b>Interview tip</b>", "Use STAR: Situation, Task, Action, Result — and never skip the Result. The number is what they remember."),
    ],
    "mistake": [
        ("🚫 <b>Mistake to avoid</b>", "Sending the same CV everywhere. Recruiters spot a generic CV in seconds. Tailor the summary + top skills to each role."),
        ("🚫 <b>Mistake to avoid</b>", "Listing duties instead of results. “Managed maintenance” is weak. “Cut breakdowns 30%” gets the call."),
        ("🚫 <b>Mistake to avoid</b>", "Applying late. The first 48 hours of a posting get the most attention — move fast, set alerts."),
    ],
    "salary_tip": [
        ("💰 <b>Salary tip</b>", "Never say a number first. “I'd love to understand the band for this role” puts the ball back in their court."),
        ("💰 <b>Salary tip</b>", "Anchor high but reasonable. Research the market range, then aim for the top third — you can always meet in the middle."),
    ],
    "motivation": [
        ("🔥 <b>Keep going</b>", "Every “no” is data, not a verdict. Tweak one thing — your CV, your targeting, or your volume — and send the next one."),
        ("🔥 <b>Real talk</b>", "The best job you'll ever get is one application away from a “no” you almost didn't send. Keep applying."),
    ],
    "did_you_know": [
        ("💡 <b>Did you know?</b>", "Most jobs get filled by people who applied in the first 3 days. Speed beats a “perfect” application sent a week late."),
        ("💡 <b>Did you know?</b>", "A tailored cover letter can lift your reply rate a lot — and takes 2 minutes when it's auto-written for you."),
    ],
}


def _rotation_key() -> str:
    hour = _dt.datetime.now(_dt.timezone.utc).hour
    return ROTATION[hour % len(ROTATION)]


def pick_diverse_jobs(n: int) -> list[dict]:
    rows = query("SELECT title, company, location, salary, url FROM job_pool WHERE url != '' ORDER BY discovered_at DESC LIMIT 400")
    random.shuffle(rows)
    seen, out = set(), []
    for r in rows:
        c = (r.get("company") or "").lower()
        if c and c in seen:
            continue
        seen.add(c); out.append(r)
        if len(out) >= n:
            break
    return out


def buttons() -> list:
    share_text = "Free AI job-finder — matched jobs + an auto-written CV & cover letter, straight to your phone. Join 👉"
    wa = f"https://wa.me/?text={quote(share_text + ' ' + CH_URL)}"
    x = f"https://twitter.com/intent/tweet?text={quote(share_text)}&url={quote(CH_URL)}"
    tg = f"https://t.me/share/url?url={quote(CH_URL)}&text={quote(share_text)}"
    return [
        [{"text": "🚀 Start & get matched", "url": f"https://t.me/{BOT}?start=channel"}],
        [{"text": "📲 WhatsApp", "url": wa}, {"text": "𝕏 Share", "url": x}, {"text": "✈️ Telegram", "url": tg}],
    ]


def send(text: str) -> bool:
    if not TOKEN:
        print("[channel:noop]", text[:100]); return True
    data = {"chat_id": CHANNEL, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    import json as _json
    data["reply_markup"] = _json.dumps({"inline_keyboard": buttons()})
    try:
        r = requests.post(_api("sendMessage"), data=data, timeout=30); r.raise_for_status(); return True
    except Exception as exc:
        print("[channel] send failed:", exc); return False


def _react_line() -> str:
    return "\n\n👍 🔥 ❤️  <b>React</b> if this helped · <b>Tag a friend</b> who's job hunting"


def content_jobs() -> str:
    jobs = pick_diverse_jobs(JOBS_PER_POST)
    if not jobs:
        return content_tip("interview_tip")
    lines = [f"🔥 <b>Jobs hiring right now</b>\n{RULE}"]
    for j in jobs:
        t = html.escape((j.get("title") or "")[:60]); co = html.escape((j.get("company") or "")[:38])
        loc = html.escape((j.get("location") or "")[:28]); sal = f" · 💰 {html.escape(j['salary'])}" if j.get("salary") else ""
        lines.append(f"▸ <a href=\"{html.escape(j.get('url',''), quote=True)}\">{t}</a>\n   <i>{co}</i> · {loc}{sal}")
    lines.append(f"{RULE}\n🎯 Want these <b>tailored to you</b> with an auto-written CV + cover letter for each? Start below 👇")
    return "\n".join(lines) + _react_line()


def content_tip(kind: str) -> str:
    label, tip = random.choice(TIPS[kind])
    return f"{label}\n{RULE}\n{tip}\n\n<i>Get jobs matched to you + an AI that writes your CV — free.</i>" + _react_line()


def content_role_spotlight() -> str:
    jobs = pick_diverse_jobs(4)
    if not jobs:
        return content_tip("cv_tip")
    lines = [f"🌟 <b>Roles worth a look</b>\n{RULE}"]
    for j in jobs:
        t = html.escape((j.get("title") or "")[:60]); co = html.escape((j.get("company") or "")[:38])
        lines.append(f"• <a href=\"{html.escape(j.get('url',''), quote=True)}\">{t}</a> — <i>{co}</i>")
    lines.append(f"{RULE}\nWe find hundreds like these daily and match them to YOU. Start free 👇")
    return "\n".join(lines) + _react_line()


def _footer() -> str:
    return (f"\n{RULE}\n"
            f"🔗 <b>Sign up free</b> — find every job matching your profile, with a tailored CV & cover letter auto-written for each:\n"
            f"{JOIN_URL}")


def main() -> None:
    kind = _rotation_key()
    if kind == "jobs":
        text = content_jobs()
    elif kind == "role_spotlight":
        text = content_role_spotlight()
    else:
        text = content_tip(kind)
    send(text + _footer())
    print(f"channel: posted '{kind}'")


if __name__ == "__main__":
    main()

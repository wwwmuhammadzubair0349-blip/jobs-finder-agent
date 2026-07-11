"""
Hourly public-channel content engine (quiet overnight via cron).

Telegram: premium HTML posts (jobs / tips / spotlights) with reaction asks,
share buttons and a signup footer. Job links go to OUR web landing pages.

WhatsApp (CallMeBot): the same digest, natively formatted for WhatsApp
(*bold*, clean layout, all brand links), sent to the owner's DM — followed by
a SEPARATE "forward this" instruction message so the digest itself stays
clean and forward-ready for the WhatsApp Channel.
"""

from __future__ import annotations

import datetime as _dt
import html
import os
import random
import time
from urllib.parse import quote

import requests

from d1 import query
from send_telegram import _api

CHANNEL = os.getenv("TELEGRAM_CHANNEL", "@dailyjobs_feed")
TOKEN = os.getenv("TELEGRAM_TOKEN", "").strip()
JOIN_URL = os.getenv("DASHBOARD_URL", "https://jobs-finder-dashboard.pages.dev")
BOT = os.getenv("BOT_USERNAME", "jobs_finder_agent_bot")
IV_BOT = os.getenv("INTERVIEW_BOT_USERNAME", "interview_prep_coach_bot")
AA_BOT = os.getenv("AUTO_APPLY_BOT_USERNAME", "auto_jobs_apply_bot")
JOBS_PER_POST = int(os.getenv("CHANNEL_JOBS_PER_POST", "8"))
CMB_PHONE = os.getenv("CALLMEBOT_PHONE", "").strip()
CMB_KEY = os.getenv("CALLMEBOT_APIKEY", "").strip()

RULE = "──────────────"          # Telegram divider
WRULE = "━━━━━━━━━━━━━"          # WhatsApp divider
CH_URL = f"https://t.me/{CHANNEL.replace('@','')}"

# Rotation across the day — jobs appear often, tips interleave.
ROTATION = ["jobs", "cv_tip", "jobs", "interview_tip", "jobs", "mistake",
            "role_spotlight", "jobs", "salary_tip", "motivation", "jobs",
            "did_you_know", "jobs", "interview_tip", "cv_tip", "role_spotlight",
            "jobs", "mistake"]

TIPS = {
    "cv_tip": [
        ("📄 CV tip of the hour", "Put your best number in the first line. “Cut downtime 20% across 3 sites” beats any adjective. Recruiters skim — lead with proof."),
        ("📄 CV tip", "Mirror the job ad's exact words. If it says “stakeholder management”, don't write “worked with people”. ATS bots rank on overlap."),
        ("📄 CV tip", "One page per 10 years of experience. If a bullet doesn't help you get THIS job, cut it."),
    ],
    "interview_tip": [
        ("🎯 Interview tip", "Prep 3 stories that each prove a different strength, then bend them to any question. One strong story beats ten vague answers."),
        ("🎯 Interview tip", "Always ask: “What does success look like in the first 90 days?” It makes you sound like a hire, not a candidate."),
        ("🎯 Interview tip", "Use STAR: Situation, Task, Action, Result — and never skip the Result. The number is what they remember."),
    ],
    "mistake": [
        ("🚫 Mistake to avoid", "Sending the same CV everywhere. Recruiters spot a generic CV in seconds. Tailor the summary + top skills to each role."),
        ("🚫 Mistake to avoid", "Listing duties instead of results. “Managed maintenance” is weak. “Cut breakdowns 30%” gets the call."),
        ("🚫 Mistake to avoid", "Applying late. The first 48 hours of a posting get the most attention — move fast, set alerts."),
    ],
    "salary_tip": [
        ("💰 Salary tip", "Never say a number first. “I'd love to understand the band for this role” puts the ball back in their court."),
        ("💰 Salary tip", "Anchor high but reasonable. Research the market range, then aim for the top third — you can always meet in the middle."),
    ],
    "motivation": [
        ("🔥 Keep going", "Every “no” is data, not a verdict. Tweak one thing — your CV, your targeting, or your volume — and send the next one."),
        ("🔥 Real talk", "The best job you'll ever get is one application away from a “no” you almost didn't send. Keep applying."),
    ],
    "did_you_know": [
        ("💡 Did you know?", "Most jobs get filled by people who applied in the first 3 days. Speed beats a “perfect” application sent a week late."),
        ("💡 Did you know?", "A tailored cover letter can lift your reply rate a lot — and takes 2 minutes when it's auto-written for you."),
    ],
}


def _rotation_key() -> str:
    hour = _dt.datetime.now(_dt.timezone.utc).hour
    return ROTATION[hour % len(ROTATION)]


def job_link(j: dict) -> str:
    """Public links go to OUR job landing pages (brand + SEO + signup CTA)."""
    if j.get("slug"):
        return f"{JOIN_URL}/jobs/{j['slug']}"
    return j.get("url", "")


def short_link(j: dict) -> str:
    """Tiny redirect link (/j/<code>) — keeps WhatsApp/captions compact."""
    slug = j.get("slug") or ""
    code = slug.rsplit("-", 1)[-1] if "-" in slug else ""
    if code and code.isalnum():
        return f"{JOIN_URL}/j/{code}"
    return job_link(j)


def pick_diverse_jobs(n: int) -> list[dict]:
    rows = query("SELECT title, company, location, salary, url, slug FROM job_pool WHERE url != '' ORDER BY discovered_at DESC LIMIT 400")
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


# --------------------------------------------------------------------------- #
# Telegram                                                                     #
# --------------------------------------------------------------------------- #
def buttons() -> list:
    share_text = "Free AI job-finder — matched jobs + an auto-written CV & cover letter, straight to your phone. Join 👉"
    wa = f"https://wa.me/?text={quote(share_text + ' ' + CH_URL)}"
    x = f"https://twitter.com/intent/tweet?text={quote(share_text)}&url={quote(CH_URL)}"
    tg = f"https://t.me/share/url?url={quote(CH_URL)}&text={quote(share_text)}"
    return [
        [{"text": "🚀 Start & get matched", "url": f"https://t.me/{BOT}?start=channel"}],
        [{"text": "🎤 Interview Coach", "url": f"https://t.me/{IV_BOT}?start=channel"},
         {"text": "🤖 Auto-Apply", "url": f"https://t.me/{AA_BOT}?start=channel"}],
        [{"text": "📲 WhatsApp", "url": wa}, {"text": "𝕏 Share", "url": x}, {"text": "✈️ Telegram", "url": tg}],
    ]


def send_telegram(text: str) -> bool:
    if not TOKEN:
        print("[channel:noop]", text[:100]); return True
    import json as _json
    data = {"chat_id": CHANNEL, "text": text, "parse_mode": "HTML",
            "disable_web_page_preview": True,
            "reply_markup": _json.dumps({"inline_keyboard": buttons()})}
    try:
        r = requests.post(_api("sendMessage"), data=data, timeout=30); r.raise_for_status(); return True
    except Exception as exc:
        print("[channel] telegram failed:", exc); return False


def _react_line() -> str:
    return "\n\n👍 🔥 ❤️  <b>React</b> if this helped · <b>Tag a friend</b> who's job hunting"


def _tg_footer() -> str:
    return (f"\n{RULE}\n"
            f"🔗 <b>Sign up free</b> — find every job matching your profile, with a tailored CV & cover letter auto-written for each:\n"
            f"{JOIN_URL}")


def tg_jobs(jobs: list[dict]) -> str:
    lines = [f"🔥 <b>Jobs hiring right now</b>\n{RULE}"]
    for j in jobs:
        t = html.escape((j.get("title") or "")[:60]); co = html.escape((j.get("company") or "")[:38])
        loc = html.escape((j.get("location") or "")[:28]); sal = f" · 💰 {html.escape(j['salary'])}" if j.get("salary") else ""
        lines.append(f"▸ <a href=\"{html.escape(job_link(j), quote=True)}\">{t}</a>\n   <i>{co}</i> · {loc}{sal}")
    lines.append(f"{RULE}\n🎯 Want these <b>tailored to you</b> with an auto-written CV + cover letter for each? Start below 👇")
    return "\n".join(lines) + _react_line()


def tg_tip(label: str, tip: str) -> str:
    return f"<b>{html.escape(label)}</b>\n{RULE}\n{html.escape(tip)}\n\n<i>Get jobs matched to you + an AI that writes your CV — free.</i>" + _react_line()


def tg_spotlight(jobs: list[dict]) -> str:
    lines = [f"🌟 <b>Roles worth a look</b>\n{RULE}"]
    for j in jobs:
        t = html.escape((j.get("title") or "")[:60]); co = html.escape((j.get("company") or "")[:38])
        lines.append(f"• <a href=\"{html.escape(job_link(j), quote=True)}\">{t}</a> — <i>{co}</i>")
    lines.append(f"{RULE}\nWe find hundreds like these daily and match them to YOU. Start free 👇")
    return "\n".join(lines) + _react_line()


# --------------------------------------------------------------------------- #
# WhatsApp — native premium formatting, forward-ready                          #
# --------------------------------------------------------------------------- #
def wa_footer() -> str:
    return (f"{WRULE}\n"
            f"🎯 *Get jobs tailored to YOU — free*\n"
            f"Auto-written CV + cover letter for every match:\n"
            f"🌐 {JOIN_URL}\n\n"
            f"✈️ *Jobs bot:* https://t.me/{BOT}\n"
            f"🧠 *Interview coach:* https://t.me/{IV_BOT}\n"
            f"🤖 *Auto-apply:* https://t.me/{AA_BOT}\n"
            f"📢 *Daily jobs channel:* {CH_URL}")


def wa_jobs(jobs: list[dict]) -> str:
    """Size-aware: only add jobs while the FULL message (header + jobs + footer)
    stays under CallMeBot's safe limit — never a half-cut digest."""
    header = "🔥 *JOBS HIRING RIGHT NOW*\n" + WRULE + "\n"
    footer = wa_footer()
    budget = 1800 - len(header) - len(footer)

    blocks, used = [], 0
    for j in jobs:
        t = (j.get("title") or "")[:55]
        co = (j.get("company") or "")[:32]
        loc = (j.get("location") or "")[:24]
        sal = f" · 💰 {j['salary']}" if j.get("salary") else ""
        meta = " · ".join(x for x in [co, loc] if x) + sal
        block = f"\n▸ *{t}*\n   {meta}\n   {short_link(j)}\n"
        if used + len(block) > budget:
            break
        blocks.append(block); used += len(block)
    return header + "".join(blocks) + "\n" + footer


def wa_tip(label: str, tip: str) -> str:
    return f"*{label}*\n{WRULE}\n\n{tip}\n\n{wa_footer()}"


def wa_spotlight(jobs: list[dict]) -> str:
    header = "🌟 *ROLES WORTH A LOOK*\n" + WRULE + "\n"
    footer = wa_footer()
    budget = 1800 - len(header) - len(footer)
    blocks, used = [], 0
    for j in jobs:
        t = (j.get("title") or "")[:55]; co = (j.get("company") or "")[:32]
        block = f"\n• *{t}* — {co}\n   {short_link(j)}\n"
        if used + len(block) > budget:
            break
        blocks.append(block); used += len(block)
    return header + "".join(blocks) + "\n" + footer


def send_whatsapp(text: str) -> bool:
    if not (CMB_PHONE and CMB_KEY):
        return False
    try:
        r = requests.get(
            "https://api.callmebot.com/whatsapp.php",
            params={"phone": CMB_PHONE, "text": text[:1900], "apikey": CMB_KEY},
            timeout=60,
        )
        ok = r.status_code < 400
        print(f"[whatsapp] callmebot HTTP {r.status_code}")
        return ok
    except Exception as exc:
        print("[whatsapp] failed:", exc)
        return False


# --------------------------------------------------------------------------- #
def main() -> None:
    kind = _rotation_key()
    if kind == "jobs":
        jobs = pick_diverse_jobs(JOBS_PER_POST)
        if not jobs:
            kind = "interview_tip"
        else:
            tg_text, wa_text = tg_jobs(jobs), wa_jobs(jobs)
    if kind == "role_spotlight":
        jobs = pick_diverse_jobs(4)
        if not jobs:
            kind = "cv_tip"
        else:
            tg_text, wa_text = tg_spotlight(jobs), wa_spotlight(jobs)
    if kind not in ("jobs", "role_spotlight"):
        label, tip = random.choice(TIPS[kind])
        tg_text, wa_text = tg_tip(label, tip), wa_tip(label, tip)

    send_telegram(tg_text + _tg_footer())

    # WhatsApp: ONE compact, forward-ready digest (short links keep it well
    # under CallMeBot's limit; no second message — CallMeBot merges them).
    send_whatsapp(wa_text)

    print(f"channel: posted '{kind}'")


if __name__ == "__main__":
    main()

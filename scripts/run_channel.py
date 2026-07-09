"""
Daily public-channel poster. Sends a premium mix to the Telegram channel:
- a rotating tip (interview / CV / job-search / mistake-to-avoid), and
- a batch of ~10 fresh, diverse jobs pulled RANDOMLY from the shared pool
  (varied categories & countries), each with a "join" call-to-action.

Designed to attract people to sign up. Runs once/day via its own cron.
"""

from __future__ import annotations

import html
import os
import random

from d1 import query
from send_telegram import _api  # reuse the bot API base
import requests

CHANNEL = os.getenv("TELEGRAM_CHANNEL", "@dailyjobs_feed")
TOKEN = os.getenv("TELEGRAM_TOKEN", "").strip()
JOIN_URL = os.getenv("DASHBOARD_URL", "https://jobs-finder-dashboard.pages.dev")
JOBS_PER_DAY = int(os.getenv("CHANNEL_JOBS_PER_DAY", "10"))

TIPS = [
    ("💡 <b>CV tip</b>", "Mirror the exact words from the job ad in your CV's top third. ATS bots rank on keyword overlap — if the ad says “stakeholder management”, don't write “worked with people”."),
    ("🎯 <b>Interview tip</b>", "Prepare 3 stories that each prove a different strength, then bend them to whatever they ask. One strong story beats ten vague answers."),
    ("🚫 <b>Mistake to avoid</b>", "Never send the same CV to every job. Recruiters spot a generic CV in seconds. Tailor the summary and top skills to each role — even small tweaks double your callbacks."),
    ("🔍 <b>Job-search tip</b>", "Apply within the first 48 hours of a posting. Early applicants get seen far more often — set alerts and move fast."),
    ("✉️ <b>Cover-letter tip</b>", "Open with why THIS company, not why you want a job. One specific, genuine line about them beats three paragraphs about you."),
    ("📈 <b>Career tip</b>", "Track every application in one place. Knowing your reply rate tells you whether to fix your CV, your targeting, or your volume."),
    ("🧠 <b>Interview tip</b>", "Always ask: “What does success look like in the first 90 days?” It shows you think like a hire, not a candidate."),
    ("🚫 <b>Mistake to avoid</b>", "Don't list responsibilities — list results. “Managed maintenance” is weak; “cut downtime 20% across 3 sites” gets interviews."),
]


def send(text: str, buttons: list | None = None) -> bool:
    if not TOKEN:
        print("[channel:noop]", text[:120]); return True
    data = {"chat_id": CHANNEL, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if buttons:
        import json as _json
        data["reply_markup"] = _json.dumps({"inline_keyboard": buttons})
    try:
        r = requests.post(_api("sendMessage"), data=data, timeout=30)
        r.raise_for_status(); return True
    except Exception as exc:
        print("[channel] send failed:", exc); return False


def pick_diverse_jobs(n: int) -> list[dict]:
    rows = query(
        "SELECT title, company, location, salary, url, source FROM job_pool WHERE url != '' ORDER BY discovered_at DESC LIMIT 400")
    random.shuffle(rows)
    seen_company = set()
    out = []
    for r in rows:
        c = (r.get("company") or "").lower()
        if c and c in seen_company:
            continue
        seen_company.add(c)
        out.append(r)
        if len(out) >= n:
            break
    return out


def main() -> None:
    join = [[{"text": "🚀 Get YOUR tailored jobs + CV", "url": JOIN_URL}]]

    # 1) rotating premium tip
    label, tip = random.choice(TIPS)
    send(f"{label}\n{tip}\n\n<i>Want a CV auto-tailored to every job you apply for?</i>", join)

    # 2) diverse jobs
    jobs = pick_diverse_jobs(JOBS_PER_DAY)
    if not jobs:
        print("no pool jobs to post"); return

    lines = ["🔥 <b>Fresh jobs today</b>\n"]
    for j in jobs:
        t = html.escape(j.get("title", "")[:60])
        co = html.escape(j.get("company", "")[:40])
        loc = html.escape(j.get("location", "")[:30])
        sal = f" · 💰 {html.escape(j['salary'])}" if j.get("salary") else ""
        url = j.get("url", "")
        lines.append(f"• <a href=\"{html.escape(url, quote=True)}\">{t}</a> — {co} · {loc}{sal}")
    lines.append(f"\n👉 <b>Get jobs like these tailored to YOU</b>, with an auto-written CV + cover letter for each: {JOIN_URL}")
    send("\n".join(lines), join)
    print(f"channel: posted 1 tip + {len(jobs)} jobs")


if __name__ == "__main__":
    main()

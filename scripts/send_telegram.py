"""
Telegram delivery.

    send_job(job, files) -> bool          # job card + apply link + attached PDFs + ATS text
    send_message(text)   -> bool          # plain HTML message (alerts, analyst brief)
    send_document(path, caption="")       # single file

Locally (no TELEGRAM_TOKEN) everything no-ops and prints, so dev needs no bot.
"""

from __future__ import annotations

import envload  # noqa: F401  (loads .env before reading TELEGRAM_* below)

import html
import os
from pathlib import Path

import requests

from log_issue import log_issue

TOKEN = os.getenv("TELEGRAM_TOKEN", "").strip()
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
_TIMEOUT = 40


def enabled() -> bool:
    return bool(TOKEN and CHAT_ID)


def _api(method: str) -> str:
    return f"https://api.telegram.org/bot{TOKEN}/{method}"


def send_message(text: str, disable_preview: bool = False, reply_markup: dict | None = None, chat_id: str | None = None) -> bool:
    target = chat_id or CHAT_ID
    if not TOKEN or not target:
        print(f"[telegram:noop] {text[:200]}")
        return True
    data = {
        "chat_id": target,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": disable_preview,
    }
    if reply_markup:
        import json as _json
        data["reply_markup"] = _json.dumps(reply_markup)
    try:
        resp = requests.post(_api("sendMessage"), data=data, timeout=_TIMEOUT)
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        log_issue("send_telegram", f"sendMessage failed: {exc}", "error")
        return False


def send_document(path: Path, caption: str = "", chat_id: str | None = None) -> bool:
    target = chat_id or CHAT_ID
    if not TOKEN or not target:
        print(f"[telegram:noop] document {path}")
        return True
    path = Path(path)
    if not path.exists():
        log_issue("send_telegram", f"missing document {path}", "warning")
        return False
    try:
        with path.open("rb") as fh:
            resp = requests.post(
                _api("sendDocument"),
                data={"chat_id": target, "caption": caption[:1000], "parse_mode": "HTML"},
                files={"document": (path.name, fh)},
                timeout=90,
            )
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        log_issue("send_telegram", f"sendDocument {path.name} failed: {exc}", "error")
        return False


def _job_caption(job: dict) -> str:
    title = html.escape(job.get("title", "Role"))
    company = html.escape(job.get("company", ""))
    location = html.escape(job.get("location", ""))
    remote = " · 🌍 Remote" if job.get("remote") else ""
    salary = f"\n💰 {html.escape(str(job.get('salary')))}" if job.get("salary") else ""
    score = job.get("match_score")
    why = html.escape(job.get("why", ""))
    url = job.get("url", "")

    score_line = f"\n🎯 <b>{score:.0f}% match</b> — {why}" if score is not None else ""
    return (
        f"🏢 <b>{title}</b>\n"
        f"🏬 {company}\n"
        f"📍 {location}{remote}{salary}"
        f"{score_line}\n\n"
        f"👉 <a href=\"{html.escape(url, quote=True)}\">Apply now</a>"
    )


def _apply_steps_text(job: dict, cv_data: dict) -> str:
    steps = (cv_data or {}).get("apply_steps") or []
    if not steps:
        return ""
    lines = ["\n📝 <b>How to apply</b>"]
    for i, s in enumerate(steps[:6], 1):
        lines.append(f"{i}. {html.escape(str(s))}")
    return "\n".join(lines)


def _applied_keyboard(job: dict) -> dict:
    # callback_data ≤ 64 bytes; job id like "adzuna:abcd1234..." fits.
    jid = (job.get("id") or job.get("url") or "")[:58]
    return {"inline_keyboard": [[
        {"text": "✅ Mark as Applied", "callback_data": f"ap:{jid}"},
        {"text": "🔗 Open job", "url": job.get("url", "") or "https://t.me"},
    ]]}


def _card_keyboard(job: dict) -> dict:
    """Job card buttons — CV/Cover generate on demand (saves LLM tokens)."""
    jid = (job.get("id") or "")[:58]
    return {"inline_keyboard": [
        [{"text": "📄 Get CV", "callback_data": f"cv:{jid}"},
         {"text": "✉️ Get Cover Letter", "callback_data": f"cl:{jid}"}],
        [{"text": "✅ Mark as Applied", "callback_data": f"ap:{jid}"},
         {"text": "🔗 Open job", "url": job.get("url", "") or "https://t.me"}],
    ]}


def send_job_card(job: dict, chat_id: str | None = None) -> bool:
    """Lightweight new-job alert — NO CV/cover attached. The user taps
    'Get CV' / 'Get Cover Letter' to generate them on demand (cached after)."""
    caption = _job_caption(job) + "\n\n📄 Tap <b>Get CV</b> or <b>Get Cover Letter</b> below — tailored to this job, ready in ~2 min (then saved for instant re-download)."
    return send_message(caption, reply_markup=_card_keyboard(job), chat_id=chat_id)


def send_prepared_cv(job: dict, files: dict, cv_data: dict | None = None,
                     which: str = "both", chat_id: str | None = None) -> bool:
    """Deliver the generated CV and/or cover letter after an on-demand request."""
    title = job.get("title", "")
    ok = True
    if which in ("cv", "both") and files.get("cv_pdf"):
        ok = send_document(Path(files["cv_pdf"]), caption=f"📄 Your tailored CV — {title}", chat_id=chat_id) and ok
    if which in ("cl", "both") and files.get("cover_pdf"):
        ok = send_document(Path(files["cover_pdf"]), caption=f"✉️ Your cover letter — {title}", chat_id=chat_id) and ok
    if which in ("cv", "both") and files.get("cv_txt"):
        ok = send_document(Path(files["cv_txt"]), caption="📋 Plain-text ATS CV (copy/paste)", chat_id=chat_id) and ok
    steps = _apply_steps_text(job, cv_data or {})
    if steps:
        send_message(steps, chat_id=chat_id)
    return ok


def send_job(job: dict, files: dict, cv_data: dict | None = None, chat_id: str | None = None) -> bool:
    """files: {'cv_pdf', 'cover_pdf', 'cv_txt'}; cv_data carries apply_steps."""
    caption = _job_caption(job) + _apply_steps_text(job, cv_data or {})
    ok = send_message(caption, reply_markup=_applied_keyboard(job), chat_id=chat_id)

    cv_pdf = files.get("cv_pdf")
    cover_pdf = files.get("cover_pdf")
    cv_txt = files.get("cv_txt")

    if cv_pdf:
        ok = send_document(Path(cv_pdf), caption=f"📄 Tailored CV — {job.get('title','')}", chat_id=chat_id) and ok
    if cover_pdf:
        ok = send_document(Path(cover_pdf), caption="✉️ Cover letter", chat_id=chat_id) and ok
    if cv_txt:
        ok = send_document(Path(cv_txt), caption="📋 Plain-text ATS CV (copy/paste)", chat_id=chat_id) and ok
    return ok


def send_ready_to_apply(job: dict, files: dict, site: str, chat_id: str | None = None) -> bool:
    """Semi-auto (Option A): job is on LinkedIn/Indeed etc. where we must NOT
    auto-submit. Prepare everything and hand the user a one-tap apply."""
    title = html.escape(job.get("title", "Role"))
    company = html.escape(job.get("company", ""))
    score = job.get("match_score")
    url = job.get("url", "") or "https://t.me"
    score_line = f" · <b>{score:.0f}% match</b>" if score is not None else ""

    caption = (
        f"🎯 <b>Ready to apply</b> — {title}\n"
        f"🏬 {company} · <i>{html.escape(site)}</i>{score_line}\n\n"
        f"Your tailored <b>CV + cover letter</b> are attached 👇\n"
        f"Tap below, open <b>Easy Apply</b>, attach the CV, and submit — 30 seconds, from your own account."
    )
    keyboard = {"inline_keyboard": [[{"text": f"📲 Open on {site}", "url": url}]]}
    ok = send_message(caption, reply_markup=keyboard, chat_id=chat_id)

    if files.get("cv_pdf"):
        ok = send_document(Path(files["cv_pdf"]), caption=f"📄 Tailored CV — {job.get('title','')}", chat_id=chat_id) and ok
    if files.get("cover_pdf"):
        ok = send_document(Path(files["cover_pdf"]), caption="✉️ Cover letter", chat_id=chat_id) and ok
    return ok


def send_alert(text: str) -> bool:
    return send_message(f"🚨 <b>Jobs Finder alert</b>\n{html.escape(text)}")


if __name__ == "__main__":
    print("enabled:", enabled())
    send_message("✅ Jobs Finder Agent: Telegram test message.")

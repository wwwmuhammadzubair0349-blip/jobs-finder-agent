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


def send_message(text: str, disable_preview: bool = False) -> bool:
    if not enabled():
        print(f"[telegram:noop] {text[:200]}")
        return True
    try:
        resp = requests.post(
            _api("sendMessage"),
            data={
                "chat_id": CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": disable_preview,
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        log_issue("send_telegram", f"sendMessage failed: {exc}", "error")
        return False


def send_document(path: Path, caption: str = "") -> bool:
    if not enabled():
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
                data={"chat_id": CHAT_ID, "caption": caption[:1000], "parse_mode": "HTML"},
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


def send_job(job: dict, files: dict) -> bool:
    """files: {'cv_pdf': Path, 'cover_pdf': Path, 'cv_txt': Path}"""
    ok = send_message(_job_caption(job))
    cv_pdf = files.get("cv_pdf")
    cover_pdf = files.get("cover_pdf")
    cv_txt = files.get("cv_txt")

    if cv_pdf:
        ok = send_document(Path(cv_pdf), caption=f"📄 Tailored CV — {job.get('title','')}") and ok
    if cover_pdf:
        ok = send_document(Path(cover_pdf), caption="✉️ Cover letter") and ok
    if cv_txt:
        ok = send_document(Path(cv_txt), caption="📋 Plain-text ATS CV (copy/paste)") and ok
    return ok


def send_alert(text: str) -> bool:
    return send_message(f"🚨 <b>Jobs Finder alert</b>\n{html.escape(text)}")


if __name__ == "__main__":
    print("enabled:", enabled())
    send_message("✅ Jobs Finder Agent: Telegram test message.")

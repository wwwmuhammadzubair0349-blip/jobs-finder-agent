"""
Phase 1 auto-apply: when a job's description contains an application email
("send your CV to hr@company.com"), send the user's tailored CV + cover letter
FROM THE USER'S OWN GMAIL (app password, stored encrypted).

Guardrails: opt-in per user, min match score, daily cap, Telegram receipt for
every application, and failures surface to Telegram + issues.
"""

from __future__ import annotations

import datetime as _dt
import re
import smtplib
from email.message import EmailMessage
from pathlib import Path

from d1 import execute, query
from enc import decrypt
from log_issue import log_issue

# Never "apply" to these — job boards, no-reply, tracking domains.
_EMAIL_BLACKLIST = re.compile(
    r"noreply|no-reply|donotreply|do-not-reply|unsubscribe|example\.com|"
    r"indeed\.|adzuna\.|jooble\.|linkedin\.|remotive\.|remoteok\.|glassdoor\.|"
    r"privacy|support@|info@jobs|newsletter", re.I)

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_APPLY_HINTS = re.compile(r"(send|submit|forward|email|share|apply|cv|resume|c\.v)", re.I)

# Sites we must NOT auto-submit to (ban risk) — instead we prepare everything
# and send a one-tap "ready to apply" message (semi-auto / Option A).
_SEMI_AUTO = {
    "linkedin.com": "LinkedIn",
    "indeed.": "Indeed",
    "glassdoor.": "Glassdoor",
    "bayt.com": "Bayt",
    "naukrigulf.com": "Naukrigulf",
}


def semi_auto_site(url: str) -> str | None:
    u = (url or "").lower()
    for frag, name in _SEMI_AUTO.items():
        if frag in u:
            return name
    return None


def find_apply_email(description: str) -> str | None:
    """Return the most likely application email in a JD, or None."""
    desc = description or ""
    candidates = []
    for m in _EMAIL_RE.finditer(desc):
        email = m.group(0).strip(".").lower()
        if _EMAIL_BLACKLIST.search(email):
            continue
        # score: proximity to apply-ish words within 120 chars
        window = desc[max(0, m.start() - 120):m.end() + 60]
        score = 2 if _APPLY_HINTS.search(window) else 1
        if any(k in email for k in ("hr@", "career", "job", "recruit", "talent", "hiring", "cv")):
            score += 1
        candidates.append((score, email))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


# ---- guardrails -------------------------------------------------------------- #
def get_auto_settings(settings: dict) -> dict:
    aa = settings.get("auto_apply") or {}
    return {
        "enabled": bool(aa.get("enabled")),
        "gmail_address": (aa.get("gmail_address") or "").strip(),
        "gmail_app_password_enc": aa.get("gmail_app_password_enc") or "",
        "min_score": int(aa.get("min_score") or 70),
        "daily_cap": int(aa.get("daily_cap") or 10),
    }


def applies_today(user_id: str) -> int:
    day = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
    rows = query("SELECT applies FROM usage WHERE user_id = ? AND day = ?", [user_id, day])
    return int(rows[0]["applies"] or 0) if rows else 0


def bump_applies(user_id: str) -> None:
    day = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
    execute(
        "INSERT INTO usage (user_id, day, searches, cvs, applies) VALUES (?,?,0,0,1) "
        "ON CONFLICT(user_id, day) DO UPDATE SET applies = COALESCE(applies,0) + 1",
        [user_id, day])


# ---- sending ------------------------------------------------------------------ #
def send_application(aa: dict, profile: dict, job: dict, cv_data: dict, files: dict) -> bool:
    """Email the tailored application from the user's own Gmail."""
    to_addr = job.get("_apply_email")
    if not to_addr:
        return False
    password = decrypt(aa["gmail_app_password_enc"]).replace(" ", "")
    from_addr = aa["gmail_address"]
    name = profile.get("full_name", "")

    msg = EmailMessage()
    msg["Subject"] = f"Application for {job.get('title','the advertised role')} — {name}"
    msg["From"] = f"{name} <{from_addr}>"
    msg["To"] = to_addr
    if profile.get("email") and "@example." not in profile["email"]:
        msg["Reply-To"] = profile["email"]

    cl = cv_data.get("cover_letter") or {}
    body_lines = [cl.get("greeting", "Dear Hiring Team,"), ""]
    for p in cl.get("paragraphs", []):
        body_lines += [p, ""]
    body_lines += [cl.get("signoff", f"Kind regards,\n{name}"), "",
                   f"Phone: {profile.get('phone','')}",
                   f"Email: {profile.get('email','')}"]
    msg.set_content("\n".join(body_lines))

    for key, label in (("cv_pdf", "CV"), ("cover_pdf", "Cover_Letter")):
        path = files.get(key)
        if path and Path(path).exists():
            msg.add_attachment(Path(path).read_bytes(), maintype="application",
                               subtype="pdf", filename=Path(path).name)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=45) as smtp:
        smtp.login(from_addr, password)
        smtp.send_message(msg)
    return True


def _mark_applied(user_id: str, job_id: str) -> None:
    bump_applies(user_id)
    execute("UPDATE user_jobs SET status='applied', applied_at=? WHERE user_id=? AND job_id=?",
            [_dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"), user_id, job_id])


def try_auto_apply(user: dict, settings: dict, profile: dict, job: dict,
                   cv_data: dict, files: dict, notify) -> bool:
    """Guarded autopilot: try email application first, then a supported ATS
    form. Returns True if an application was submitted."""
    aa = get_auto_settings(settings)
    if not (aa["enabled"] and aa["gmail_address"] and aa["gmail_app_password_enc"]):
        return False
    if (job.get("match_score") or 0) < aa["min_score"]:
        return False
    if applies_today(user["id"]) >= aa["daily_cap"]:
        return False

    # ---- 1) Email application (best for Gulf "send CV to ..." jobs) ----
    apply_email = find_apply_email(job.get("description", ""))
    if apply_email:
        job["_apply_email"] = apply_email
        try:
            send_application(aa, profile, job, cv_data, files)
            _mark_applied(user["id"], job["id"])
            notify(f"🤖✅ <b>Auto-applied</b> — {job.get('title','')}\n"
                   f"🏬 {job.get('company','')}\n"
                   f"📧 Sent from your Gmail to <code>{apply_email}</code> with your tailored CV + cover letter.")
            return True
        except smtplib.SMTPAuthenticationError:
            log_issue("auto_apply", f"Gmail auth failed for {user.get('email')}", "error")
            notify("⚠️ <b>Auto-apply paused</b> — your Gmail app password didn't work. "
                   "Update it on the dashboard (Auto-apply settings).")
            return False
        except Exception as exc:
            log_issue("auto_apply", f"email {job.get('title')}: {exc}", "warning")
            # fall through to form attempt

    # ---- 2) ATS form application (Greenhouse / Lever) ----
    try:
        from apply_forms import supported_ats, apply_via_form
        if supported_ats(job.get("url", "")):
            ok, reason = apply_via_form(job["url"], profile, files, dry_run=False)
            if ok:
                _mark_applied(user["id"], job["id"])
                notify(f"🤖✅ <b>Auto-applied</b> — {job.get('title','')}\n"
                       f"🏬 {job.get('company','')}\n"
                       f"📝 Submitted the application form with your CV.")
                return True
            if reason == "captcha" or reason.startswith("required-fields"):
                notify(f"📝 <b>Almost auto-applied</b> — {job.get('title','')} @ {job.get('company','')}\n"
                       f"This form needs a human step ({'CAPTCHA' if reason=='captcha' else 'extra questions'}). "
                       f"Your CV is ready — apply here: {job.get('url','')}")
    except Exception as exc:
        log_issue("auto_apply", f"form {job.get('title')}: {exc}", "warning")

    return False

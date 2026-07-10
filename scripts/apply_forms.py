"""
Phase 2 auto-apply: fill & submit standard ATS forms (Greenhouse, Lever) with
Playwright. Conservative by design — it only submits a CLEAN standard form
(name / email / phone / resume, no CAPTCHA, no unfilled required fields).
Anything non-standard falls back to a "ready to apply" Telegram nudge instead
of risking a bad submission.

    supported_ats(url) -> "greenhouse" | "lever" | None
    apply_via_form(url, profile, files, dry_run) -> (ok, reason)
"""

from __future__ import annotations

import re
from pathlib import Path

from log_issue import log_issue

_GREENHOUSE = re.compile(r"(boards|job-boards)\.greenhouse\.io|greenhouse\.io/embed", re.I)
_LEVER = re.compile(r"jobs\.lever\.co", re.I)


def supported_ats(url: str) -> str | None:
    u = url or ""
    if _GREENHOUSE.search(u):
        return "greenhouse"
    if _LEVER.search(u):
        return "lever"
    return None


def _split_name(full: str) -> tuple[str, str]:
    parts = (full or "").split()
    if not parts:
        return "Candidate", ""
    return parts[0], " ".join(parts[1:]) if len(parts) > 1 else ""


def _has_captcha(page) -> bool:
    try:
        return page.locator("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, [data-sitekey]").count() > 0
    except Exception:
        return False


def _fill_first(page, selectors: list[str], value: str) -> bool:
    if not value:
        return False
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible():
                loc.fill(value, timeout=4000)
                return True
        except Exception:
            continue
    return False


def _unfilled_required(page) -> int:
    """Count required, still-empty visible inputs we didn't fill — the safety gate."""
    try:
        return page.evaluate("""() => {
            const req = [...document.querySelectorAll('input[required], select[required], textarea[required]')];
            return req.filter(el => {
                const type = (el.type||'').toLowerCase();
                if (['hidden','file','submit','button'].includes(type)) return false;
                if (el.offsetParent === null) return false;      // not visible
                if (type === 'checkbox' || type === 'radio') return !el.checked;
                return !el.value || !el.value.trim();
            }).length;
        }""")
    except Exception:
        return 0


def apply_via_form(url: str, profile: dict, files: dict, dry_run: bool = False) -> tuple[bool, str]:
    ats = supported_ats(url)
    if not ats:
        return False, "unsupported-ats"

    resume = files.get("cv_pdf")
    if not (resume and Path(resume).exists()):
        return False, "no-resume-file"

    first, last = _split_name(profile.get("full_name", ""))
    email = profile.get("email", "")
    phone = profile.get("phone", "")
    if not email or "@example." in email:
        return False, "no-real-email"

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(1500)

            # Lever job page → click "Apply" to reach the form if needed.
            if ats == "lever" and "/apply" not in page.url:
                try:
                    page.get_by_role("link", name=re.compile("apply", re.I)).first.click(timeout=4000)
                    page.wait_for_timeout(1500)
                except Exception:
                    pass

            if _has_captcha(page):
                return False, "captcha"

            if ats == "greenhouse":
                _fill_first(page, ["#first_name", "input[name='first_name']", "input[autocomplete='given-name']"], first)
                _fill_first(page, ["#last_name", "input[name='last_name']", "input[autocomplete='family-name']"], last)
                _fill_first(page, ["#email", "input[name='email']", "input[type='email']"], email)
                _fill_first(page, ["#phone", "input[name='phone']", "input[type='tel']"], phone)
                submit_sel = ["#submit_app", "button[type='submit']", "input[type='submit']"]
            else:  # lever
                _fill_first(page, ["input[name='name']", "input[autocomplete='name']"], f"{first} {last}".strip())
                _fill_first(page, ["input[name='email']", "input[type='email']"], email)
                _fill_first(page, ["input[name='phone']", "input[type='tel']"], phone)
                li = (profile.get("links") or {}).get("linkedin")
                if li:
                    _fill_first(page, ["input[name='urls[LinkedIn]']", "input[name='urls[linkedin]']"], li)
                submit_sel = ["button[type='submit']", "#btn-submit", "button:has-text('Submit')"]

            # Resume upload (first file input on the page).
            try:
                fi = page.locator("input[type='file']").first
                if fi.count() > 0:
                    fi.set_input_files(str(resume), timeout=8000)
                    page.wait_for_timeout(2500)  # let the parser run
            except Exception:
                return False, "resume-upload-failed"

            # Safety gate: any required field we couldn't fill → don't submit.
            leftover = _unfilled_required(page)
            if leftover > 0:
                return False, f"required-fields:{leftover}"

            if dry_run:
                return True, "dry-run-fields-ok"

            # Submit
            for sel in submit_sel:
                try:
                    btn = page.locator(sel).first
                    if btn.count() > 0 and btn.is_visible():
                        btn.click(timeout=6000)
                        page.wait_for_timeout(4000)
                        break
                except Exception:
                    continue

            # Confirmation heuristic
            body = (page.inner_text("body") or "").lower()
            if any(k in body for k in ("thank you", "application received", "we received", "submitted", "success")):
                return True, "submitted"
            if page.locator("input[type='file']").count() == 0:  # form gone → likely submitted
                return True, "submitted"
            return False, "no-confirmation"
        except Exception as exc:
            log_issue("apply_forms", f"{ats} {url}: {exc}", "warning")
            return False, f"error:{str(exc)[:80]}"
        finally:
            browser.close()

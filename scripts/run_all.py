"""
run_all — one continuous-search tick (runs every 15-30 min, 24/7).

Cheap by default: most ticks find no NEW jobs (thanks to the seen_jobs dedupe)
and exit in seconds WITHOUT ever calling the LLM or Playwright. Heavy work
(tailoring + PDF rendering + Telegram) happens only for genuinely new matches.

CI-aware: UTF-8 stdout (via cf_store), a live `latest_run` blob in KV
(step_states + log_tail), quiet-hours handling for delivery, and a Telegram
alert if a critical step fails.
"""

from __future__ import annotations

import datetime as _dt
import sys
import time
import traceback
from pathlib import Path

from cf_store import kv_put, kv_available
from config import get_profile, get_search, get_settings, load_config, save_config
from log_issue import log_issue

_ROOT = Path(__file__).resolve().parent.parent
_OUTPUT = _ROOT / "output"
_SITE_CVS = _ROOT / "site" / "cvs"

_log_tail: list[str] = []
_step_states: dict[str, str] = {}
_started = _dt.datetime.now(_dt.timezone.utc)


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def log(msg: str) -> None:
    line = f"{_dt.datetime.now(_dt.timezone.utc).strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    _log_tail.append(line)
    del _log_tail[:-60]  # keep last 60 lines


def _push_run(status: str, finished: bool = False) -> None:
    blob = {
        "status": status,
        "step_states": _step_states,
        "log_tail": _log_tail[-40:],
        "started_at": _started.isoformat(timespec="seconds"),
        "finished_at": _now_iso() if finished else None,
    }
    try:
        kv_put("latest_run", blob)
    except Exception:
        pass


def step(name: str, critical: bool):
    """Decorator-ish context via closures; returns a runner."""
    def run(fn, *args, **kwargs):
        log(f"▶ {name}")
        _step_states[name] = "run"
        _push_run("running")
        t0 = time.time()
        try:
            result = fn(*args, **kwargs)
            _step_states[name] = "ok"
            log(f"✔ {name} ({time.time() - t0:.1f}s)")
            _push_run("running")
            return result
        except Exception as exc:
            _step_states[name] = "fail"
            log(f"✘ {name} FAILED: {exc}")
            log_issue(name, f"{exc}\n{traceback.format_exc()[-500:]}", "error" if critical else "warning")
            _push_run("running")
            if critical:
                _alert(f"Critical step '{name}' failed: {exc}")
                _finish("failed")
                sys.exit(1)
            return None
    return run


def _alert(text: str) -> None:
    try:
        from send_telegram import send_alert
        send_alert(text)
    except Exception:
        pass


def _finish(status: str) -> None:
    from update_status import compute_and_store
    try:
        compute_and_store({k: ("ok" if v == "ok" else "fail" if v == "fail" else "warn") for k, v in _step_states.items()})
    except Exception:
        pass
    _push_run(status, finished=True)
    log(f"── run {status} in {(_dt.datetime.now(_dt.timezone.utc) - _started).total_seconds():.1f}s ──")


# --------------------------------------------------------------------------- #
# Quiet hours                                                                  #
# --------------------------------------------------------------------------- #
def _in_quiet_hours(settings: dict) -> bool:
    qh = settings.get("quiet_hours")
    if not qh or not qh.get("start") or not qh.get("end"):
        return False
    tz_name = settings.get("timezone", "UTC")
    try:
        from zoneinfo import ZoneInfo
        now = _dt.datetime.now(ZoneInfo(tz_name))
    except Exception:
        now = _dt.datetime.now(_dt.timezone.utc)
    cur = now.hour * 60 + now.minute

    def _mins(hhmm: str) -> int:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)

    start, end = _mins(qh["start"]), _mins(qh["end"])
    if start <= end:
        return start <= cur < end
    return cur >= start or cur < end  # window crosses midnight


# --------------------------------------------------------------------------- #
# Main tick                                                                    #
# --------------------------------------------------------------------------- #
def main() -> None:
    from collect_jobs import _apify_allowed, collect_all
    from rank_jobs import rank
    from sync_cf import add_seen, get_seen, store_jobs, store_recent

    log(f"Jobs Finder tick @ {_now_iso()} (KV={'cloud' if kv_available() else 'local'})")
    _push_run("running")

    _cfg = load_config()
    profile = get_profile()
    search = get_search()
    settings = get_settings()
    quiet = _in_quiet_hours(settings)
    if quiet:
        log("🌙 quiet hours — will collect but defer processing/notifications")

    run = step("collect_jobs", critical=True)
    raw = run(collect_all, search, settings) or []
    log(f"collected {len(raw)} raw jobs")

    # mark apify run if it was actually used this tick
    if "apify" in (search.get("sources") or []) and _apify_allowed(settings):
        markers = dict(settings.get("credit_markers", {}) or {})
        markers["apify_last_run_iso"] = _now_iso()
        _cfg["credit_markers"] = markers
        try:
            save_config(_cfg)
        except Exception:
            pass

    seen = get_seen()
    run = step("rank_jobs", critical=True)
    ranked, new_jobs = run(rank, raw, profile, search, seen) or ([], [])
    log(f"{len(ranked)} above threshold; {len(new_jobs)} NEW this tick")

    store_jobs(ranked)

    # Fast exit: nothing new (the common case) → no LLM, no Playwright.
    if not new_jobs or quiet:
        if not new_jobs:
            log("no new jobs — cheap exit")
        # low-frequency analyst brief still allowed (uses cached ranked list)
        try:
            from agent_analyst import maybe_brief
            maybe_brief(ranked)
        except Exception as exc:
            log_issue("agent_analyst", str(exc), "warning")
        _finish("ok")
        return

    # Verify links on the new jobs only.
    run = step("verify_links", critical=False)
    verified = run(_verify, new_jobs)
    new_jobs = verified if verified is not None else new_jobs
    log(f"{len(new_jobs)} jobs with live apply links")

    # Process each new job: tailor → render → publish → send → mark seen.
    processed_recent: list[dict] = []
    sent_ids: list[str] = []
    for job in new_jobs:
        entry = _process_job(job, profile)
        if entry:
            processed_recent.append(entry)
            sent_ids.append(job["id"])
            if job.get("url"):
                sent_ids.append(job["url"].strip().lower())

    if processed_recent:
        store_recent(processed_recent)
    if sent_ids:
        add_seen(sent_ids)
        log(f"marked {len(processed_recent)} jobs seen")

    # Analyst brief (low-frequency, self-throttled).
    try:
        from agent_analyst import maybe_brief
        maybe_brief(ranked)
    except Exception as exc:
        log_issue("agent_analyst", str(exc), "warning")

    _finish("ok")


def _verify(new_jobs):
    from verify_links import verify_links
    ok, _dead = verify_links(new_jobs)
    return ok


def _process_job(job: dict, profile: dict) -> dict | None:
    """Full heavy path for one new job. Isolated so one failure won't kill the tick."""
    title = job.get("title", "")
    try:
        from agent_cv import tailor
        from render_cv import render
        from publish_cvs import publish
        from send_telegram import send_job

        log(f"  ✎ tailoring: {title} @ {job.get('company','')}")
        cv_data = tailor(job, profile)

        result = render(job, profile, cv_data, _OUTPUT)
        # also copy into site/cvs for GitHub Pages publishing
        _copy_to_site(result, job)

        urls = publish(result["slug"], result) or {}

        send_job(job, result)

        return {
            **{k: job.get(k) for k in ("id", "title", "company", "location", "remote", "salary", "url", "posted_at", "source")},
            "match_score": job.get("match_score"),
            "why": job.get("why"),
            "cv_url": urls.get("cv_url"),
            "cover_url": urls.get("cover_url"),
            "cv_txt_url": urls.get("cv_txt_url"),
            "sent_at": _now_iso(),
            "status": "new",
        }
    except Exception as exc:
        log_issue("process_job", f"{title}: {exc}", "warning")
        log(f"  ✘ failed: {title}: {exc}")
        return None


def _copy_to_site(result: dict, job: dict) -> None:
    import shutil
    dest = _SITE_CVS / result["slug"]
    dest.mkdir(parents=True, exist_ok=True)
    for key in ("cv_pdf", "cover_pdf", "cv_txt"):
        src = result.get(key)
        if src and Path(src).exists():
            shutil.copy2(src, dest / Path(src).name)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        _step_states["run_all"] = "fail"
        log(f"FATAL: {exc}")
        log_issue("run_all", f"{exc}\n{traceback.format_exc()[-800:]}", "error")
        _alert(f"Pipeline crashed: {exc}")
        _finish("failed")
        sys.exit(1)

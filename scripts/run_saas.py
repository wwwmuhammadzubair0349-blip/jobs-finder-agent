"""
Multi-tenant orchestrator. One tick:
  1. Collect a GLOBAL batch once for the merged demand of all users (free
     sources every tick; Apify globally cached 72h) → the shared job pool.
  2. Per user: rank the pool against their profile, record new matches, and
     auto-generate CV + cover letter for their top 3 (on-demand for the rest).
  3. Deliver to each user's own Telegram; mark applied via the bot button.

Cost control: one collection serves everyone (shared pool), Apify is cached
platform-wide, and only top-3 per user get an auto-CV.
"""

from __future__ import annotations

import datetime as _dt
import sys
import traceback
from pathlib import Path

from cf_store import kv_available, kv_put
from d1 import d1_available
from log_issue import log_issue

_ROOT = Path(__file__).resolve().parent.parent
_OUTPUT = _ROOT / "output"

_log: list[str] = []
_step_states: dict[str, str] = {}
_current: dict = {"agent": None, "job": None, "phase": "idle"}
_started = _dt.datetime.now(_dt.timezone.utc)
AUTO_CV_TOP_N = 3
MAX_NEW_PER_USER = 50


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def log(msg: str) -> None:
    line = f"{_dt.datetime.now(_dt.timezone.utc).strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    _log.append(line)
    del _log[:-60]


def push_status(status: str, finished: bool = False) -> None:
    kv_put("latest_run", {
        "status": status, "step_states": _step_states, "current": dict(_current),
        "log_tail": _log[-40:], "started_at": _started.isoformat(timespec="seconds"),
        "finished_at": _now() if finished else None,
    })


def set_activity(agent, phase, job=None) -> None:
    _current.update({"agent": agent, "phase": phase, "job": job})
    push_status("running")


def _agent(name, state="green"):
    from update_status import set_status
    try:
        set_status(name, state)
    except Exception:
        pass


def _in_quiet(settings: dict) -> bool:
    qh = settings.get("quiet_hours")
    if not qh or not qh.get("start") or not qh.get("end"):
        return False
    try:
        from zoneinfo import ZoneInfo
        now = _dt.datetime.now(ZoneInfo(settings.get("timezone", "UTC")))
    except Exception:
        now = _dt.datetime.now(_dt.timezone.utc)
    cur = now.hour * 60 + now.minute

    def m(s):
        h, mm = s.split(":"); return int(h) * 60 + int(mm)
    s, e = m(qh["start"]), m(qh["end"])
    return (s <= cur < e) if s <= e else (cur >= s or cur < e)


def _merged_search(configs: list[dict]) -> dict:
    titles, locs, countries, sources = [], [], [], set()
    for c in configs:
        s = c.get("search", {}) or {}
        for t in s.get("job_titles", []) or []:
            if t not in titles:
                titles.append(t)
        for l in s.get("locations", []) or []:
            if l not in locs:
                locs.append(l)
        for cc in s.get("adzuna_countries", []) or ([s.get("adzuna_country")] if s.get("adzuna_country") else []):
            if cc and cc not in countries:
                countries.append(cc)
        for src in s.get("sources", []) or []:
            sources.add(src)
    return {
        "job_titles": titles or ["Engineer"],
        "locations": locs or ["Remote"],
        "adzuna_countries": countries or ["gb"],
        "sources": list(sources) or ["remotive", "remoteok", "adzuna", "jooble", "apify"],
        "posted_within_days": 14,
        "remote": True,
    }


def main() -> None:
    from collect_jobs import collect_all
    from rank_jobs import rank
    from saas_store import (active_users, user_config, upsert_pool_jobs, prune_pool,
                            existing_user_job_ids, add_user_job, queued_user_jobs,
                            mark_sent, store_cv_files)

    log(f"SaaS tick @ {_now()} (D1={'on' if d1_available() else 'off'}, KV={'cloud' if kv_available() else 'local'})")
    push_status("running")

    users = active_users()
    log(f"{len(users)} active users")
    if not users:
        _finish("ok"); return

    configs = {u["id"]: user_config(u["id"]) for u in users}

    # 1) one global collection for the merged demand
    set_activity("collect_jobs", "collecting")
    search = _merged_search(list(configs.values()))
    settings = {"credit_markers": {"apify_min_hours_between_runs": 72}, "max_queries_per_source": 6}
    batch = collect_all(search, settings)
    _step_states["collect_jobs"] = "ok"; _agent("collect_jobs")
    log(f"collected {len(batch)} pool jobs")

    set_activity("rank_jobs", "pooling")
    for j in batch:
        j["country"] = j.get("location", "")
        j["category"] = (j.get("title", "").split(" ")[0] or "").lower()
    upsert_pool_jobs(batch)
    prune_pool()
    _step_states["rank_jobs"] = "ok"; _agent("rank_jobs")

    # 2) per user
    total_sent = 0
    for u in users:
        try:
            total_sent += _process_user(u, configs[u["id"]], batch,
                                        rank, existing_user_job_ids, add_user_job,
                                        queued_user_jobs, mark_sent, store_cv_files)
        except Exception as exc:
            log_issue("run_saas", f"user {u.get('email')}: {exc}", "warning")
            log(f"  ✘ user {u.get('email')} failed: {exc}")

    # Heartbeat: mark every visible agent as having run this cycle so the
    # dashboard shows accurate, recent "last seen" for the whole team.
    for k in ("collect_jobs", "rank_jobs", "cv_writer", "cl_writer", "render_cv", "send_telegram", "agent_analyst"):
        _agent(k)

    log(f"tick done — {total_sent} jobs delivered across users")
    set_activity(None, "idle")
    _finish("ok")


def main_manual_only() -> None:
    from saas_store import active_users, user_config, queued_user_jobs, mark_sent, store_cv_files

    log(f"Manual send @ {_now()} (D1={'on' if d1_available() else 'off'}, KV={'cloud' if kv_available() else 'local'})")
    push_status("running")

    total_sent = 0
    for u in active_users():
        try:
            total_sent += _process_manual_user(u, user_config(u["id"]), queued_user_jobs, mark_sent, store_cv_files)
        except Exception as exc:
            log_issue("run_saas", f"manual user {u.get('email')}: {exc}", "warning")
            log(f"  ✘ manual user {u.get('email')} failed: {exc}")

    log(f"manual send done — {total_sent} jobs delivered")
    set_activity(None, "idle")
    _finish("ok")


def _process_manual_user(u, cfg, queued_fn, mark_sent, store_cv):
    from agent_cv import tailor
    from render_cv import render
    from send_telegram import send_job
    from saas_store import user_agents_update

    profile = cfg.get("profile", {}) or {}
    chat_id = u.get("telegram_chat_id")
    sent = 0

    for job in queued_fn(u["id"]):
        try:
            job = {**job, "id": job["job_id"], "uj_id": job["uj_id"]}
            title = job.get("title", "")
            set_activity("cv_writer", "writing CV & cover letter", title)
            cv_data = tailor(job, profile)
            _agent("cv_writer"); _agent("cl_writer")
            set_activity("render_cv", "rendering PDFs", title)
            result = render(job, profile, cv_data, _OUTPUT)
            _agent("render_cv")
            keys = store_cv(job["uj_id"], result.get("basename", "CV"),
                            result["cv_pdf"], result["cover_pdf"], result["cv_txt"])
            set_activity("send_telegram", "sending to Telegram", title)
            if chat_id:
                send_job(job, result, cv_data, chat_id=chat_id)
            _agent("send_telegram")
            mark_sent(job["uj_id"], keys.get("cv", ""), keys.get("cover", ""), keys.get("txt", ""))
            sent += 1
        except Exception as exc:
            log_issue("run_saas", f"manual process {job.get('title')}: {exc}", "warning")

    if sent:
        user_agents_update(u["id"], ["cv_writer", "cl_writer", "render_cv", "send_telegram"])
    return sent


def _process_user(u, cfg, batch, rank, existing_ids_fn, add_fn, queued_fn, mark_sent, store_cv):
    from agent_cv import tailor
    from render_cv import render
    from send_telegram import send_job

    profile = cfg.get("profile", {}) or {}
    search = cfg.get("search", {}) or {}
    settings = cfg.get("settings", {}) or {}
    chat_id = u.get("telegram_chat_id")
    email = u.get("email", "")

    from saas_store import user_agents_update

    ranked, _ = rank(batch, profile, search, seen_ids=[])
    existing = existing_ids_fn(u["id"])
    new = [j for j in ranked if j["id"] not in existing][:MAX_NEW_PER_USER]
    for j in new:
        add_fn(u["id"], j)
    log(f"  {email}: {len(ranked)} matches, {len(new)} new")
    # these agents run for this user every tick
    user_agents_update(u["id"], ["collect_jobs", "agent_analyst", "rank_jobs"])

    quiet = _in_quiet(settings)
    to_process = []
    # manual queue first (always)
    for q in queued_fn(u["id"]):
        to_process.append({**q, "id": q["job_id"], "uj_id": q["uj_id"]})
    # top-3 auto CV (only if connected + not quiet)
    if chat_id and not quiet:
        for j in new[:AUTO_CV_TOP_N]:
            to_process.append({**j, "uj_id": f"{u['id'][:8]}-{j['id']}"[:120]})

    sent = 0
    for job in to_process:
        try:
            title = job.get("title", "")
            set_activity("cv_writer", "writing CV & cover letter", title)
            cv_data = tailor(job, profile)
            _agent("cv_writer"); _agent("cl_writer")
            set_activity("render_cv", "rendering PDFs", title)
            result = render(job, profile, cv_data, _OUTPUT)
            _agent("render_cv")
            keys = store_cv(job["uj_id"], result.get("basename", "CV"),
                            result["cv_pdf"], result["cover_pdf"], result["cv_txt"])
            set_activity("send_telegram", "sending to Telegram", title)
            if chat_id:
                send_job(job, result, cv_data, chat_id=chat_id)
            _agent("send_telegram")
            mark_sent(job["uj_id"], keys.get("cv", ""), keys.get("cover", ""), keys.get("txt", ""))
            sent += 1
        except Exception as exc:
            log_issue("run_saas", f"process {job.get('title')}: {exc}", "warning")
    if sent:
        user_agents_update(u["id"], ["cv_writer", "cl_writer", "render_cv", "send_telegram"])
    return sent


def _finish(status: str) -> None:
    push_status(status, finished=True)
    log(f"── tick {status} in {(_dt.datetime.now(_dt.timezone.utc) - _started).total_seconds():.1f}s ──")


if __name__ == "__main__":
    try:
        if "--manual-only" in sys.argv:
            main_manual_only()
        else:
            main()
    except SystemExit:
        raise
    except Exception as exc:
        log(f"FATAL: {exc}")
        log_issue("run_saas", f"{exc}\n{traceback.format_exc()[-800:]}", "error")
        _finish("failed")
        sys.exit(1)

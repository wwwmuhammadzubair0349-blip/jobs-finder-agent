"""
Push dashboard-facing state into KV.

    add_seen(ids)                         # extend seen_jobs (dedupe memory)
    get_seen() -> list[str]
    store_recent(recent_jobs)             # KV `recent_jobs` (Today view)
    store_jobs(ranked)                    # KV `jobs` (browse view, last ~100)
    record_application(entry)             # append to KV `applications`

seen_jobs keeps the last ~1000 ids/urls so 24/7 runs never re-send a job.
"""

from __future__ import annotations

import datetime as _dt

from cf_store import kv_get, kv_put


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


_SEEN_MAX = 5000
_JOBS_MAX = 4000      # "all jobs forever" — large persistent, deduped archive
_RECENT_MAX = 60
_DESC_MAX = 600       # trim descriptions so the archive stays within KV size limits


def get_seen() -> list[str]:
    seen = kv_get("seen_jobs", []) or []
    return seen if isinstance(seen, list) else []


def add_seen(ids) -> None:
    seen = get_seen()
    existing = set(seen)
    for i in ids:
        if i and i not in existing:
            seen.insert(0, i)
            existing.add(i)
    kv_put("seen_jobs", seen[:_SEEN_MAX])


def store_recent(recent_jobs: list[dict]) -> None:
    prev = kv_get("recent_jobs", []) or []
    if not isinstance(prev, list):
        prev = []
    combined = list(recent_jobs) + prev
    # de-dup by id preserving newest first
    seen_ids: set[str] = set()
    out = []
    for j in combined:
        jid = j.get("id") or j.get("url")
        if jid in seen_ids:
            continue
        seen_ids.add(jid)
        out.append(j)
    kv_put("recent_jobs", out[:_RECENT_MAX])


def _slim(job: dict) -> dict:
    j = dict(job)
    if j.get("description"):
        j["description"] = j["description"][:_DESC_MAX]
    return j


def store_jobs(ranked: list[dict]) -> None:
    """Merge this run's ranked jobs into the PERMANENT, deduped archive.

    Existing jobs keep their status/flags (e.g. applied, sent); new jobs are
    prepended. Deduped by id (and url) so the All Jobs tab never shows a
    duplicate and never loses a previously-discovered job.
    """
    existing = kv_get("jobs", []) or []
    if not isinstance(existing, list):
        existing = []

    by_key: dict[str, dict] = {}
    order: list[str] = []

    def key_of(j):
        return j.get("id") or (j.get("url") or "").strip().lower()

    # keep existing first (preserve their flags), newest-run info merged in
    for j in existing:
        k = key_of(j)
        if not k or k in by_key:
            continue
        by_key[k] = j
        order.append(k)

    for j in ranked:
        k = key_of(j)
        if not k:
            continue
        if k in by_key:
            # refresh score/why but preserve status flags already stored
            prev = by_key[k]
            merged = {**_slim(j), **{f: prev[f] for f in ("status", "sent_at", "applied_at", "cv_url", "cover_url") if f in prev}}
            by_key[k] = merged
        else:
            entry = _slim(j)
            entry.setdefault("status", "discovered")
            entry["first_seen"] = entry.get("first_seen") or _now_iso()
            by_key[k] = entry
            order.insert(0, k)  # newest first

    archive = [by_key[k] for k in order][:_JOBS_MAX]
    kv_put("jobs", archive)


def mark_job_status(job_key: str, status: str, extra: dict | None = None) -> bool:
    """Update one archived job's status (e.g. 'applied', 'sent'). Matches by
    id OR url. Returns True if a job was updated."""
    jobs = kv_get("jobs", []) or []
    changed = False
    for j in jobs:
        if j.get("id") == job_key or (j.get("url") or "").strip().lower() == job_key.strip().lower():
            j["status"] = status
            if extra:
                j.update(extra)
            changed = True
    if changed:
        kv_put("jobs", jobs)
    return changed


def record_application(entry: dict) -> None:
    apps = kv_get("applications", []) or []
    if not isinstance(apps, list):
        apps = []
    apps.insert(0, entry)
    kv_put("applications", apps[:500])

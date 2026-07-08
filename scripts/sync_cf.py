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

from cf_store import kv_get, kv_put

_SEEN_MAX = 1000
_JOBS_MAX = 100
_RECENT_MAX = 60


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


def store_jobs(ranked: list[dict]) -> None:
    kv_put("jobs", ranked[:_JOBS_MAX])


def record_application(entry: dict) -> None:
    apps = kv_get("applications", []) or []
    if not isinstance(apps, list):
        apps = []
    apps.insert(0, entry)
    kv_put("applications", apps[:500])

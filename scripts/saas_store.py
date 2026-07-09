"""
Higher-level D1 operations for the multi-tenant pipeline: users, the shared
job pool, per-user jobs, and CV storage in KV.
"""

from __future__ import annotations

import datetime as _dt
import json

from cf_store import kv_put_bytes
from d1 import execute, query


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# Users & configs                                                             #
# --------------------------------------------------------------------------- #
def active_users() -> list[dict]:
    return query("SELECT id, email, telegram_chat_id, plan FROM users WHERE status = 'active'")


def user_config(user_id: str) -> dict:
    rows = query("SELECT profile, search, settings FROM configs WHERE user_id = ?", [user_id])
    if not rows:
        return {"profile": {}, "search": {}, "settings": {}}
    r = rows[0]
    return {
        "profile": json.loads(r["profile"]) if r.get("profile") else {},
        "search": json.loads(r["search"]) if r.get("search") else {},
        "settings": json.loads(r["settings"]) if r.get("settings") else {},
    }


# --------------------------------------------------------------------------- #
# Shared job pool                                                             #
# --------------------------------------------------------------------------- #
def upsert_pool_jobs(jobs: list[dict], ttl_days: int = 30, chunk: int = 7) -> None:
    # D1 caps bound parameters at 100/query → 7 rows x 14 cols = 98.
    now = _now()
    expires = (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=ttl_days)).isoformat(timespec="seconds")
    cols = 14
    for i in range(0, len(jobs), chunk):
        part = jobs[i:i + chunk]
        placeholders = ",".join(["(" + ",".join(["?"] * cols) + ")"] * len(part))
        params = []
        for j in part:
            params += [
                j["id"], j.get("source", ""), j.get("title", ""), j.get("company", ""), j.get("location", ""),
                1 if j.get("remote") else 0, j.get("salary", ""), j.get("posted_at", ""), j.get("url", ""),
                (j.get("description", "") or "")[:1500], j.get("category", ""), j.get("country", ""), now, expires,
            ]
        execute(
            "INSERT INTO job_pool (id, source, title, company, location, remote, salary, posted_at, url, description, category, country, discovered_at, expires_at) "
            f"VALUES {placeholders} "
            "ON CONFLICT(id) DO UPDATE SET discovered_at=excluded.discovered_at, expires_at=excluded.expires_at",
            params,
        )


def prune_pool() -> None:
    execute("DELETE FROM job_pool WHERE expires_at < ?", [_now()])


# --------------------------------------------------------------------------- #
# Per-user jobs                                                                #
# --------------------------------------------------------------------------- #
def existing_user_job_ids(user_id: str) -> set[str]:
    rows = query("SELECT job_id FROM user_jobs WHERE user_id = ?", [user_id])
    return {r["job_id"] for r in rows}


def add_user_job(user_id: str, job: dict) -> str:
    uj_id = f"{user_id[:8]}-{job['id']}"[:120]
    execute(
        """INSERT INTO user_jobs (id, user_id, job_id, match_score, why, status, first_seen)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(user_id, job_id) DO NOTHING""",
        [uj_id, user_id, job["id"], job.get("match_score", 0), job.get("why", ""), "discovered", _now()],
    )
    return uj_id


def queued_user_jobs(user_id: str) -> list[dict]:
    return query(
        """SELECT uj.id AS uj_id, uj.job_id, jp.title, jp.company, jp.location, jp.remote, jp.salary,
                  jp.posted_at, jp.url, jp.source, jp.description, uj.match_score, uj.why
             FROM user_jobs uj JOIN job_pool jp ON jp.id = uj.job_id
            WHERE uj.user_id = ? AND uj.status = 'queued'""", [user_id])


def mark_sent(uj_id: str, cv_key: str, cover_key: str, cv_txt_key: str) -> None:
    execute(
        "UPDATE user_jobs SET status = CASE WHEN status='applied' THEN 'applied' ELSE 'sent' END, sent_at = ?, cv_key = ?, cover_key = ?, cv_txt_key = ? WHERE id = ?",
        [_now(), cv_key, cover_key, cv_txt_key, uj_id],
    )


# --------------------------------------------------------------------------- #
# CV storage (KV binary)                                                      #
# --------------------------------------------------------------------------- #
def store_cv_files(uj_id: str, basename: str, cv_pdf, cover_pdf, cv_txt) -> dict:
    """Store the rendered files in KV; return the keys. Keys embed the basename
    so downloads get a nice filename via the /api/cv Function."""
    from pathlib import Path
    keys = {}
    mapping = {"cv": cv_pdf, "cover": cover_pdf, "txt": cv_txt}
    for kind, path in mapping.items():
        if not path or not Path(path).exists():
            continue
        key = f"cvfile:{basename}:{kind}:{uj_id}"
        if kv_put_bytes(key, Path(path).read_bytes()):
            keys[kind] = key
    return keys


# --------------------------------------------------------------------------- #
# Apify global scrape gate (shared across all users)                          #
# --------------------------------------------------------------------------- #
def scrape_due(key: str, min_hours: int) -> bool:
    rows = query("SELECT scraped_at FROM pool_scrape WHERE key = ?", [key])
    if not rows:
        return True
    try:
        last = _dt.datetime.fromisoformat(rows[0]["scraped_at"])
        if last.tzinfo is None:
            last = last.replace(tzinfo=_dt.timezone.utc)
        return _dt.datetime.now(_dt.timezone.utc) - last >= _dt.timedelta(hours=min_hours)
    except Exception:
        return True


def mark_scraped(key: str) -> None:
    execute("INSERT INTO pool_scrape (key, scraped_at) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET scraped_at=excluded.scraped_at", [key, _now()])

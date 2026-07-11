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


def expire_plans() -> int:
    """Safety net: downgrade any paid plan whose expiry has passed (in case a
    Lemon Squeezy webhook was missed). Returns the number downgraded."""
    rows = query(
        "SELECT id FROM users WHERE plan != 'free' AND plan_expires_at IS NOT NULL AND plan_expires_at < ?",
        [_now()])
    for r in rows:
        execute("UPDATE users SET plan='free', plan_expires_at=NULL WHERE id=?", [r["id"]])
    return len(rows)


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
import re as _re


def job_slug(title: str, company: str, jid: str) -> str:
    """SEO slug: electrical-engineer-at-bgis-a1b2c3d4 (unique via id suffix)."""
    base = _re.sub(r"[^a-z0-9]+", "-", f"{title}-at-{company}".lower()).strip("-")[:70]
    suf = _re.sub(r"[^a-z0-9]", "", (jid.split(":")[-1] or "x").lower())[:8]
    return f"{base}-{suf}"


def upsert_pool_jobs(jobs: list[dict], ttl_days: int = 30, chunk: int = 6) -> None:
    # D1 caps bound parameters at 100/query → 6 rows x 15 cols = 90.
    now = _now()
    expires = (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=ttl_days)).isoformat(timespec="seconds")
    cols = 15
    for i in range(0, len(jobs), chunk):
        part = jobs[i:i + chunk]
        placeholders = ",".join(["(" + ",".join(["?"] * cols) + ")"] * len(part))
        params = []
        for j in part:
            params += [
                j["id"], j.get("source", ""), j.get("title", ""), j.get("company", ""), j.get("location", ""),
                1 if j.get("remote") else 0, j.get("salary", ""), j.get("posted_at", ""), j.get("url", ""),
                (j.get("description", "") or "")[:1500], j.get("category", ""), j.get("country", ""), now, expires,
                job_slug(j.get("title", ""), j.get("company", ""), j["id"]),
            ]
        execute(
            "INSERT INTO job_pool (id, source, title, company, location, remote, salary, posted_at, url, description, category, country, discovered_at, expires_at, slug) "
            f"VALUES {placeholders} "
            "ON CONFLICT(id) DO UPDATE SET salary=excluded.salary, title=excluded.title, "
            "company=excluded.company, location=excluded.location, remote=excluded.remote, "
            "description=excluded.description, discovered_at=excluded.discovered_at, "
            "expires_at=excluded.expires_at, slug=excluded.slug",
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
                  jp.posted_at, jp.url, jp.source, jp.description, uj.match_score, uj.why,
                  uj.cv_request, uj.cv_key, uj.cover_key
             FROM user_jobs uj JOIN job_pool jp ON jp.id = uj.job_id
            WHERE uj.user_id = ? AND uj.status = 'queued'""", [user_id])


def pending_autoapply_jobs(user_id: str, limit: int = 40) -> list[dict]:
    """Not-yet-applied matched jobs (best matches first) — candidates for auto-apply."""
    return query(
        """SELECT uj.job_id, jp.title, jp.company, jp.location, jp.url, jp.description,
                  uj.match_score, uj.why
             FROM user_jobs uj JOIN job_pool jp ON jp.id = uj.job_id
            WHERE uj.user_id = ? AND uj.status != 'applied' AND uj.applied_via IS NULL
            ORDER BY uj.match_score DESC LIMIT ?""", [user_id, limit])


def todays_auto_applied(user_id: str, day_prefix: str) -> list[dict]:
    """Jobs auto-applied today (for the daily summary). day_prefix like '2026-07-11'."""
    return query(
        """SELECT jp.title, jp.company FROM user_jobs uj JOIN job_pool jp ON jp.id = uj.job_id
            WHERE uj.user_id = ? AND uj.applied_via = 'auto' AND uj.applied_at LIKE ?
            ORDER BY uj.applied_at DESC""", [user_id, day_prefix + "%"])


def save_cv_keys(user_id: str, job_id: str, cv_key: str, cover_key: str, cv_txt_key: str) -> None:
    execute(
        "UPDATE user_jobs SET cv_key=?, cover_key=?, cv_txt_key=?, cv_request=NULL WHERE user_id=? AND job_id=?",
        [cv_key, cover_key, cv_txt_key, user_id, job_id])


def mark_applied_via(user_id: str, job_id: str, via: str) -> None:
    execute("UPDATE user_jobs SET applied_via=? WHERE user_id=? AND job_id=?", [via, user_id, job_id])


def set_job_status(user_id: str, job_id: str, status: str) -> None:
    """Set a user_job's status unless it's already applied (don't downgrade)."""
    execute("UPDATE user_jobs SET status=? WHERE user_id=? AND job_id=? AND status != 'applied'",
            [status, user_id, job_id])


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


# --------------------------------------------------------------------------- #
# Per-user agent status (each user sees THEIR own agents' activity)           #
# --------------------------------------------------------------------------- #
def user_agents_update(user_id: str, names: list[str]) -> None:
    from cf_store import kv_get, kv_put
    key = f"agents_status:{user_id}"
    cur = kv_get(key, []) or []
    by = {s.get("name"): s for s in cur if isinstance(s, dict)}
    now = _now()
    for n in names:
        by[n] = {"name": n, "state": "green", "last_run": now}
    kv_put(key, list(by.values()))


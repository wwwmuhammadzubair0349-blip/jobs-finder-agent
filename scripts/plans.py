"""
Single source of truth for paid plans + quota enforcement (Python side).

Mirror of webapp/functions/_shared/plans.js — keep them byte-compatible.
Quotas are counted in `usage_counters(user_id, metric, period_key, count)`.
period_key is computed in the USER'S timezone so limits are fair globally:
  - daily metrics   → "2026-07-10"
  - weekly metrics  → "2026-W28"  (ISO year-week)
"""

from __future__ import annotations

import datetime as _dt

from d1 import execute, query

UNLIMITED = 999  # practical ceiling — protects LLM cost, never shown as a wall

# Metrics: interview, autoapply, notif, cvprep, countries
PLANS: dict[str, dict] = {
    "free":    {"interview": 1, "autoapply": 1,  "notif": 3,         "cvprep": 1,         "countries": 1},
    "starter": {"interview": 1, "autoapply": 5,  "notif": 10,        "cvprep": 5,         "countries": 3},
    "pro":     {"interview": 3, "autoapply": 15, "notif": 25,        "cvprep": 15,        "countries": UNLIMITED},
    "proplus": {"interview": UNLIMITED, "autoapply": 40, "notif": UNLIMITED, "cvprep": UNLIMITED, "countries": UNLIMITED},
}

# Display metadata (used by the dashboard / Phase 2). Prices in USD / month.
PLAN_META: dict[str, dict] = {
    "free":    {"label": "Free",     "price": 0},
    "starter": {"label": "Starter",  "price": 5},
    "pro":     {"label": "Pro",      "price": 12},
    "proplus": {"label": "Pro Plus", "price": 25},
}


def _plan(plan: str) -> dict:
    return PLANS.get((plan or "free").lower(), PLANS["free"])


def metric_limit(plan: str, metric: str) -> tuple[int, str]:
    """Return (limit, period) for a plan+metric. Free's interview resets weekly."""
    limit = int(_plan(plan).get(metric, 0))
    period = "week" if (metric == "interview" and (plan or "free").lower() == "free") else "day"
    return limit, period


def period_key(period: str, tz: str = "UTC") -> str:
    """Current period key in the user's timezone."""
    try:
        from zoneinfo import ZoneInfo
        now = _dt.datetime.now(ZoneInfo(tz or "UTC"))
    except Exception:
        now = _dt.datetime.now(_dt.timezone.utc)
    if period == "week":
        iso = now.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    return now.strftime("%Y-%m-%d")


def usage_count(user_id: str, metric: str, pkey: str) -> int:
    rows = query(
        "SELECT count FROM usage_counters WHERE user_id=? AND metric=? AND period_key=?",
        [user_id, metric, pkey])
    return int(rows[0]["count"] or 0) if rows else 0


def bump(user_id: str, metric: str, pkey: str, n: int = 1) -> None:
    execute(
        "INSERT INTO usage_counters (user_id, metric, period_key, count) VALUES (?,?,?,?) "
        "ON CONFLICT(user_id, metric, period_key) DO UPDATE SET count = count + excluded.count",
        [user_id, metric, pkey, n])


def remaining(user_id: str, plan: str, metric: str, tz: str = "UTC") -> int:
    limit, period = metric_limit(plan, metric)
    used = usage_count(user_id, metric, period_key(period, tz))
    return max(0, limit - used)


def allow(user_id: str, plan: str, metric: str, tz: str = "UTC") -> bool:
    """True if the user is still under their limit (does NOT consume)."""
    limit, period = metric_limit(plan, metric)
    return usage_count(user_id, metric, period_key(period, tz)) < limit


def consume(user_id: str, plan: str, metric: str, tz: str = "UTC") -> bool:
    """Consume one credit. True if allowed (and counted), False if over limit."""
    limit, period = metric_limit(plan, metric)
    pkey = period_key(period, tz)
    if usage_count(user_id, metric, pkey) >= limit:
        return False
    bump(user_id, metric, pkey)
    return True


def once_per_day(user_id: str, tag: str, tz: str = "UTC") -> bool:
    """First call today (user tz) returns True, then False — for one-shot nudges."""
    pkey = period_key("day", tz)
    metric = f"nudge:{tag}"
    if usage_count(user_id, metric, pkey) >= 1:
        return False
    bump(user_id, metric, pkey)
    return True

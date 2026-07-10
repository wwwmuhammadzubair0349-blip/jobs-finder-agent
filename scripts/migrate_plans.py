"""
One-off, idempotent migration for the paid-plans feature (Phase 1):
  - users.plan_expires_at  (when a paid plan lapses back to free; NULL = free)
  - usage_counters table   (generic per-metric, per-period quota counters)
  - grandfather admin(s) to Pro Plus so testing never hits a wall

Run:  python scripts/migrate_plans.py
"""

from __future__ import annotations

from d1 import execute, query, d1_available


def _has_column(table: str, col: str) -> bool:
    return any(r.get("name") == col for r in query(f"PRAGMA table_info({table})"))


def main() -> None:
    if not d1_available():
        print("D1 not configured (need CF_* env). Aborting.")
        return

    # 1) users.plan_expires_at
    if _has_column("users", "plan_expires_at"):
        print("users.plan_expires_at — already present")
    else:
        execute("ALTER TABLE users ADD COLUMN plan_expires_at TEXT")
        print("users.plan_expires_at — added")

    # 2) usage_counters
    execute(
        "CREATE TABLE IF NOT EXISTS usage_counters ("
        " user_id TEXT NOT NULL,"
        " metric TEXT NOT NULL,"
        " period_key TEXT NOT NULL,"
        " count INTEGER NOT NULL DEFAULT 0,"
        " PRIMARY KEY (user_id, metric, period_key))")
    print("usage_counters — ready")

    # 3) grandfather admins to Pro Plus
    execute("UPDATE users SET plan='proplus' WHERE is_admin=1")
    admins = query("SELECT email, plan FROM users WHERE is_admin=1")
    for a in admins:
        print(f"admin {a.get('email')} → plan={a.get('plan')}")

    print("\nMigration complete.")


if __name__ == "__main__":
    main()

"""
Idempotent migration for paid-plans Phase 3 (Lemon Squeezy billing):
  - users.ls_subscription_id  (Lemon Squeezy subscription id)
  - users.ls_customer_id      (Lemon Squeezy customer id)
  (users.plan_expires_at already added in migrate_plans.py)

Run:  python scripts/migrate_billing.py
"""

from __future__ import annotations

from d1 import execute, query, d1_available


def _has_column(table: str, col: str) -> bool:
    return any(r.get("name") == col for r in query(f"PRAGMA table_info({table})"))


def main() -> None:
    if not d1_available():
        print("D1 not configured. Aborting.")
        return
    for col in ("ls_subscription_id", "ls_customer_id"):
        if _has_column("users", col):
            print(f"users.{col} — already present")
        else:
            execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")
            print(f"users.{col} — added")
    print("Billing migration complete.")


if __name__ == "__main__":
    main()

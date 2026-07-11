"""Idempotent migration: user_jobs.saved (favourite flag).
Run:  python scripts/migrate_saved.py
"""
from __future__ import annotations
from d1 import execute, query, d1_available


def _has(table, col):
    return any(r.get("name") == col for r in query(f"PRAGMA table_info({table})"))


def main():
    if not d1_available():
        print("D1 not configured."); return
    if _has("user_jobs", "saved"):
        print("user_jobs.saved — already present")
    else:
        execute("ALTER TABLE user_jobs ADD COLUMN saved INTEGER DEFAULT 0")
        print("user_jobs.saved — added")


if __name__ == "__main__":
    main()

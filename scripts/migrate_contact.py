"""
Idempotent migration for the contact form: contact_messages table.
Run:  python scripts/migrate_contact.py
"""

from __future__ import annotations

from d1 import execute, d1_available


def main() -> None:
    if not d1_available():
        print("D1 not configured. Aborting.")
        return
    execute(
        "CREATE TABLE IF NOT EXISTS contact_messages ("
        " id TEXT PRIMARY KEY,"
        " name TEXT,"
        " email TEXT,"
        " message TEXT,"
        " created_at TEXT,"
        " handled INTEGER DEFAULT 0)")
    print("contact_messages — ready")


if __name__ == "__main__":
    main()

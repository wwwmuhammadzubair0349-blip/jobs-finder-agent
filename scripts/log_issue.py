"""
Issue logging with severity, surfaced on the dashboard via KV key `issues`.

    log_issue(script, message, level="error")   # level: "error" | "warning"

Keeps the most recent ~200 issues. Also prints to stdout so CI logs capture it.
"""

from __future__ import annotations

import datetime as _dt

from cf_store import kv_get, kv_put

_MAX_ISSUES = 200


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def log_issue(script: str, message: str, level: str = "error") -> None:
    level = level if level in ("error", "warning") else "error"
    entry = {"at": _now_iso(), "script": script, "message": str(message)[:1000], "level": level}

    prefix = "ERROR" if level == "error" else "WARN"
    print(f"[{prefix}] {script}: {message}")

    try:
        issues = kv_get("issues", []) or []
        if not isinstance(issues, list):
            issues = []
        issues.insert(0, entry)
        kv_put("issues", issues[:_MAX_ISSUES])
    except Exception as exc:  # pragma: no cover
        print(f"[log_issue] could not persist issue: {exc}")

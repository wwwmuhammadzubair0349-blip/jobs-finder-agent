"""
Agent health → KV `agents_status`.

    set_status(name, state, note="")     # state: green|yellow|red
    compute_and_store(step_states)       # derive per-agent status from a run

Also exposes a helper to roll last-run ages into green/yellow/red.
"""

from __future__ import annotations

import datetime as _dt

from cf_store import kv_get, kv_put


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def set_status(name: str, state: str, note: str = "") -> None:
    statuses = kv_get("agents_status", []) or []
    if not isinstance(statuses, list):
        statuses = []
    statuses = [s for s in statuses if s.get("name") != name]
    statuses.append({"name": name, "state": state, "last_run": _now_iso(), "note": note})
    kv_put("agents_status", statuses)


def compute_and_store(step_states: dict) -> None:
    """step_states: {step_name: 'ok'|'warn'|'fail'|'skip'} from a run."""
    mapping = {"ok": "green", "skip": "green", "warn": "yellow", "fail": "red"}
    for step, outcome in step_states.items():
        set_status(step, mapping.get(outcome, "yellow"))


if __name__ == "__main__":
    compute_and_store({"collect_jobs": "ok", "agent_cv": "warn"})
    print(kv_get("agents_status"))

"""
Cloudflare D1 client for the pipeline (runs in GitHub Actions, talks to D1 via
REST). Uses CF_API_TOKEN + CF_ACCOUNT_ID + CF_D1_DATABASE_ID.

Local dev (no creds) → no-op with an in-memory fallback so `run_all` can still
be exercised offline.
"""

from __future__ import annotations

import envload  # noqa: F401
import os
from typing import Any

import requests

CF_API_TOKEN = os.getenv("CF_API_TOKEN", "").strip()
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "").strip()
CF_D1_DATABASE_ID = os.getenv("CF_D1_DATABASE_ID", "").strip()
_TIMEOUT = 30


def d1_available() -> bool:
    return bool(CF_API_TOKEN and CF_ACCOUNT_ID and CF_D1_DATABASE_ID)


def _url() -> str:
    return (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
            f"/d1/database/{CF_D1_DATABASE_ID}/query")


def query(sql: str, params: list | None = None) -> list[dict]:
    """Run one parameterized statement; return list of row dicts."""
    if not d1_available():
        return []
    try:
        resp = requests.post(
            _url(),
            headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
            json={"sql": sql, "params": params or []},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            print(f"[d1] error: {data.get('errors')}")
            return []
        result = data.get("result", [])
        if result and isinstance(result, list):
            return result[0].get("results", []) or []
        return []
    except requests.RequestException as exc:
        print(f"[d1] request failed: {exc}")
        return []


def execute(sql: str, params: list | None = None) -> bool:
    if not d1_available():
        return False
    try:
        resp = requests.post(
            _url(),
            headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
            json={"sql": sql, "params": params or []},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("success", False)
    except requests.RequestException as exc:
        print(f"[d1] execute failed: {exc}")
        return False


def execute_changes(sql: str, params: list | None = None) -> int:
    """Run a write and return the number of rows changed (meta.changes), or -1
    on failure. Lets callers do atomic conditional updates (e.g. quota consume)
    and know whether THIS statement actually modified a row."""
    if not d1_available():
        return -1
    try:
        resp = requests.post(
            _url(),
            headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
            json={"sql": sql, "params": params or []},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            return -1
        result = data.get("result", [])
        if result and isinstance(result, list):
            meta = result[0].get("meta") or {}
            return int(meta.get("changes", 0))
        return 0
    except requests.RequestException as exc:
        print(f"[d1] execute_changes failed: {exc}")
        return -1

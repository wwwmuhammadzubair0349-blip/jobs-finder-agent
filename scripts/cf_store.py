"""
Cloudflare KV client with a no-op local fallback.

In CI / production (when CF_* env vars are set) this reads & writes JSON blobs
to a Cloudflare KV namespace via the REST API. Locally (no CF vars) it falls
back to a single JSON file `config/_local_kv.json` so development needs zero
cloud services.

Public API:
    kv_get(key, default=None) -> parsed JSON (or default)
    kv_put(key, value)        -> None   (value is JSON-serialisable)
    kv_available()            -> bool   (True when talking to real KV)
"""

from __future__ import annotations

import envload  # noqa: F401  (loads .env before any os.getenv below)

import json
import os
import sys
import threading
from pathlib import Path
from typing import Any

import requests

# UTF-8 stdout/stderr everywhere (Windows consoles default to cp1252, which
# chokes on emoji in log lines). Imported by every script, so this runs once.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass

_ROOT = Path(__file__).resolve().parent.parent
_LOCAL_KV = _ROOT / "config" / "_local_kv.json"
_TIMEOUT = 20
_lock = threading.Lock()

CF_API_TOKEN = os.getenv("CF_API_TOKEN", "").strip()
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "").strip()
CF_KV_NAMESPACE_ID = os.getenv("CF_KV_NAMESPACE_ID", "").strip()


def kv_available() -> bool:
    """True when real Cloudflare KV credentials are configured."""
    return bool(CF_API_TOKEN and CF_ACCOUNT_ID and CF_KV_NAMESPACE_ID)


def _base_url() -> str:
    return (
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
        f"/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}"
    )


def _headers() -> dict:
    return {"Authorization": f"Bearer {CF_API_TOKEN}"}


# --------------------------------------------------------------------------- #
# Local fallback store                                                        #
# --------------------------------------------------------------------------- #
def _load_local() -> dict:
    if _LOCAL_KV.exists():
        try:
            return json.loads(_LOCAL_KV.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_local(data: dict) -> None:
    _LOCAL_KV.parent.mkdir(parents=True, exist_ok=True)
    _LOCAL_KV.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# --------------------------------------------------------------------------- #
# Public API                                                                  #
# --------------------------------------------------------------------------- #
def kv_get(key: str, default: Any = None) -> Any:
    if not kv_available():
        with _lock:
            return _load_local().get(key, default)

    url = f"{_base_url()}/values/{key}"
    try:
        resp = requests.get(url, headers=_headers(), timeout=_TIMEOUT)
        if resp.status_code == 404:
            return default
        resp.raise_for_status()
        text = resp.text
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
    except requests.RequestException:
        return default


def kv_put(key: str, value: Any) -> None:
    payload = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)

    if not kv_available():
        with _lock:
            data = _load_local()
            try:
                data[key] = json.loads(payload) if isinstance(payload, str) else payload
            except json.JSONDecodeError:
                data[key] = payload
            _save_local(data)
        return

    url = f"{_base_url()}/values/{key}"
    try:
        resp = requests.put(
            url,
            headers=_headers(),
            data=payload.encode("utf-8"),
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:  # pragma: no cover
        print(f"[cf_store] WARN: kv_put({key}) failed: {exc}")


def kv_put_bytes(key: str, data: bytes) -> bool:
    """Store raw bytes (e.g. a PDF) under a KV key. No-op locally."""
    if not kv_available():
        return False
    url = f"{_base_url()}/values/{key}"
    try:
        resp = requests.put(url, headers=_headers(), data=data, timeout=60)
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:  # pragma: no cover
        print(f"[cf_store] WARN: kv_put_bytes({key}) failed: {exc}")
        return False

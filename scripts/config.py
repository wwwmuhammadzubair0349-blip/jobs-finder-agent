"""
Config loader: single source of truth for profile + search + settings.

Reads the merged `config` blob from KV first (dashboard-editable). Falls back
to local `config/*.json` when a key is missing or KV is unavailable (local dev).

    load_config()  -> full merged config dict
    get_profile()  -> config["profile"]
    get_search()   -> config["search"]
    get_settings() -> flat settings (check_every_min, quiet_hours, timezone, ...)
    save_config(cfg) -> persist merged config back to KV
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from cf_store import kv_get, kv_put

_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_DIR = _ROOT / "config"


def _load_json(name: str, default: Any) -> Any:
    path = _CONFIG_DIR / name
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default
    return default


def _local_config() -> dict:
    settings = _load_json("settings.json", {})
    return {
        "profile": _load_json("profile.json", {}),
        "search": _load_json("search.json", {}),
        "sources": _load_json("search.json", {}).get("sources", ["remotive"]),
        "check_every_min": settings.get("check_every_min", 30),
        "quiet_hours": settings.get("quiet_hours"),
        "timezone": settings.get("timezone", "UTC"),
        "max_per_tick": settings.get("max_per_tick", 5),
        "match_threshold": settings.get("match_threshold", 55),
        "max_queries_per_source": settings.get("max_queries_per_source", 6),
        "credit_markers": settings.get("credit_markers", {}),
    }


def load_config() -> dict:
    """Merged config: KV wins per-key, local JSON fills the gaps."""
    local = _local_config()
    remote = kv_get("config", None)
    if not isinstance(remote, dict):
        return local

    merged = dict(local)
    for key, value in remote.items():
        if value is not None:
            merged[key] = value
    # search.max_per_tick / match_threshold may live under search too
    return merged


def get_profile() -> dict:
    return load_config().get("profile", {}) or {}


def get_search() -> dict:
    cfg = load_config()
    search = dict(cfg.get("search", {}) or {})
    # Top-level tuning knobs override / default into search view
    search.setdefault("max_per_tick", cfg.get("max_per_tick", 5))
    search.setdefault("match_threshold", cfg.get("match_threshold", 55))
    return search


def get_settings() -> dict:
    cfg = load_config()
    return {
        "check_every_min": cfg.get("check_every_min", 30),
        "quiet_hours": cfg.get("quiet_hours"),
        "timezone": cfg.get("timezone", "UTC"),
        "max_per_tick": cfg.get("max_per_tick", 5),
        "match_threshold": cfg.get("match_threshold", 55),
        "max_queries_per_source": cfg.get("max_queries_per_source", 6),
        "credit_markers": cfg.get("credit_markers", {}) or {},
    }


def save_config(cfg: dict) -> None:
    kv_put("config", cfg)

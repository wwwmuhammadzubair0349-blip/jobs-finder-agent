"""
Thin LLM provider adapter — swap provider/model from env in ONE place.

Supported LLM_PROVIDER values (all OpenAI-compatible chat endpoints except
anthropic which uses its own Messages API):
    groq | openai | openrouter | anthropic

    chat(messages, *, temperature=0.4, max_tokens=2000, force_json=False,
         timeout=60) -> str   (assistant message content)

Every call has a timeout. `force_json=True` requests native JSON mode where the
provider supports it (OpenAI-compatible response_format / Anthropic prefill).
"""

from __future__ import annotations

import envload  # noqa: F401  (loads .env before reading keys below)

import os
from typing import Any

import requests

PROVIDER = os.getenv("LLM_PROVIDER", "groq").strip().lower()
MODEL = os.getenv("LLM_MODEL", "").strip()
BASE_URL = os.getenv("LLM_BASE_URL", "").strip()


def _load_keys() -> list[str]:
    """Support multiple keys for failover: LLM_API_KEYS (comma-separated) wins;
    otherwise LLM_API_KEY (+ optional LLM_API_KEY_2)."""
    keys: list[str] = []
    multi = os.getenv("LLM_API_KEYS", "").strip()
    if multi:
        keys = [k.strip() for k in multi.split(",") if k.strip()]
    else:
        for name in ("LLM_API_KEY", "LLM_API_KEY_2"):
            v = os.getenv(name, "").strip()
            if v:
                keys.append(v)
    # de-dup, preserve order
    seen: set[str] = set()
    return [k for k in keys if not (k in seen or seen.add(k))]


API_KEYS = _load_keys()
API_KEY = API_KEYS[0] if API_KEYS else ""

_DEFAULT_MODELS = {
    "groq": "llama-3.3-70b-versatile",
    "openai": "gpt-4o-mini",
    "openrouter": "meta-llama/llama-3.3-70b-instruct",
    "anthropic": "claude-sonnet-5",
}

_OPENAI_COMPAT_BASE = {
    "groq": "https://api.groq.com/openai/v1",
    "openai": "https://api.openai.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}

_ANTHROPIC_BASE = "https://api.anthropic.com/v1"


class LLMError(RuntimeError):
    pass


def _model() -> str:
    return MODEL or _DEFAULT_MODELS.get(PROVIDER, "")


def is_configured() -> bool:
    return bool(API_KEYS)


def chat(
    messages: list[dict],
    *,
    temperature: float = 0.4,
    max_tokens: int = 2000,
    force_json: bool = False,
    timeout: int = 60,
) -> str:
    if not API_KEYS:
        raise LLMError("no LLM API key set (LLM_API_KEYS / LLM_API_KEY)")

    backend = _chat_anthropic if PROVIDER == "anthropic" else _chat_openai_compat

    last_err: Exception | None = None
    for idx, key in enumerate(API_KEYS):
        try:
            return backend(key, messages, temperature, max_tokens, force_json, timeout)
        except LLMError as exc:
            last_err = exc
            # rotate to the next key only when this one is rate-limited/exhausted
            if "429" in str(exc) and idx < len(API_KEYS) - 1:
                print(f"[llm] key #{idx + 1} rate-limited; failing over to key #{idx + 2}")
                continue
            raise
    raise last_err or LLMError("all LLM keys failed")


# --------------------------------------------------------------------------- #
# OpenAI-compatible providers (groq / openai / openrouter / custom)           #
# --------------------------------------------------------------------------- #
def _chat_openai_compat(api_key, messages, temperature, max_tokens, force_json, timeout) -> str:
    base = BASE_URL or _OPENAI_COMPAT_BASE.get(PROVIDER)
    if not base:
        raise LLMError(f"Unknown provider '{PROVIDER}' and no LLM_BASE_URL set")

    payload: dict[str, Any] = {
        "model": _model(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if force_json:
        payload["response_format"] = {"type": "json_object"}

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if PROVIDER == "openrouter":
        headers["HTTP-Referer"] = "https://github.com/jobs-finder-agent"
        headers["X-Title"] = "Jobs Finder Agent"

    resp = requests.post(
        f"{base}/chat/completions", headers=headers, json=payload, timeout=timeout
    )
    if resp.status_code == 429:
        raise LLMError("429 rate limited")
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"] or ""


# --------------------------------------------------------------------------- #
# Anthropic Messages API                                                       #
# --------------------------------------------------------------------------- #
def _chat_anthropic(api_key, messages, temperature, max_tokens, force_json, timeout) -> str:
    system = "\n\n".join(m["content"] for m in messages if m.get("role") == "system")
    convo = [m for m in messages if m.get("role") != "system"]

    if force_json:
        # Prefill an opening brace to force JSON-only output.
        convo = convo + [{"role": "assistant", "content": "{"}]

    payload: dict[str, Any] = {
        "model": _model(),
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": convo,
    }
    if system:
        payload["system"] = system

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    resp = requests.post(
        f"{_ANTHROPIC_BASE}/messages", headers=headers, json=payload, timeout=timeout
    )
    if resp.status_code == 429:
        raise LLMError("429 rate limited")
    resp.raise_for_status()
    data = resp.json()
    text = "".join(block.get("text", "") for block in data.get("content", []))
    if force_json:
        text = "{" + text  # re-attach the prefilled brace
    return text

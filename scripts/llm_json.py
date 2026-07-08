"""
Robust LLM JSON caller.

    llm_json(system, user, *, max_tokens=2000, temperature=0.3, retries=3)
        -> dict | list

Strategy:
  * ask with force_json where supported
  * strip code fences / leading prose
  * repair trailing commas and extract the outermost {...} / [...]
  * retry with backoff on parse failure or 429
"""

from __future__ import annotations

import json
import re
import time

from llm import LLMError, chat


def _extract_json(text: str) -> str:
    text = text.strip()
    # strip ```json ... ``` fences
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    # grab the outermost object or array
    first = min(
        [i for i in (text.find("{"), text.find("[")) if i != -1],
        default=-1,
    )
    if first > 0:
        text = text[first:]
    # find matching last brace/bracket
    last_obj = text.rfind("}")
    last_arr = text.rfind("]")
    last = max(last_obj, last_arr)
    if last != -1:
        text = text[: last + 1]
    return text


def _repair(text: str) -> str:
    # remove trailing commas before } or ]
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return text


def _parse(text: str):
    cleaned = _extract_json(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return json.loads(_repair(cleaned))


def llm_json(
    system: str,
    user: str,
    *,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    retries: int = 3,
):
    messages = [
        {"role": "system", "content": system + "\n\nRespond with valid JSON only. No prose, no markdown fences."},
        {"role": "user", "content": user},
    ]
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            raw = chat(
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                force_json=True,
                timeout=90,
            )
            return _parse(raw)
        except LLMError as exc:
            last_err = exc
            if "429" in str(exc):
                time.sleep(2 ** attempt + 1)
            else:
                time.sleep(1.5 * (attempt + 1))
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            last_err = exc
            # nudge the model harder on the next try
            messages.append({"role": "user", "content": "Your previous reply was not valid JSON. Return ONLY the JSON object."})
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"llm_json failed after {retries} attempts: {last_err}")

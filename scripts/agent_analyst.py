"""
agent_analyst — occasional, low-frequency brief so 24/7 running doesn't spam.

    maybe_brief(ranked_jobs, force=False) -> bool

Sends at most once per `_MIN_HOURS` (tracked in KV `analyst_last`). Summarises
counts, strongest matches, and one application tip (LLM if available, else a
deterministic template).
"""

from __future__ import annotations

import datetime as _dt
import html

from cf_store import kv_get, kv_put
from llm import chat, is_configured
from log_issue import log_issue
from send_telegram import send_message

_MIN_HOURS = 20


def _due(force: bool) -> bool:
    if force:
        return True
    last = kv_get("analyst_last", None)
    if not last:
        return True
    try:
        last_dt = _dt.datetime.fromisoformat(last)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=_dt.timezone.utc)
    except Exception:
        return True
    return _dt.datetime.now(_dt.timezone.utc) - last_dt >= _dt.timedelta(hours=_MIN_HOURS)


def _tip(top_titles: list[str]) -> str:
    if is_configured() and top_titles:
        try:
            txt = chat(
                [
                    {"role": "system", "content": "You are a concise job-search coach. One actionable sentence only."},
                    {"role": "user", "content": f"Give one application tip for someone applying to roles like: {', '.join(top_titles[:5])}."},
                ],
                temperature=0.6,
                max_tokens=80,
                timeout=30,
            )
            return txt.strip().split("\n")[0]
        except Exception as exc:
            log_issue("agent_analyst", f"tip failed: {exc}", "warning")
    return "Tailor your first sentence to the role and mirror the job's own keywords — recruiters skim fast."


def maybe_brief(ranked_jobs: list[dict], force: bool = False) -> bool:
    if not _due(force):
        return False

    ranked_jobs = ranked_jobs or []
    top = sorted(ranked_jobs, key=lambda j: j.get("match_score", 0), reverse=True)[:3]
    top_titles = [j.get("title", "") for j in top]

    lines = [f"📊 <b>Daily job brief</b> — {len(ranked_jobs)} matching roles tracked"]
    if top:
        lines.append("\n<b>Strongest matches:</b>")
        for j in top:
            lines.append(f"• {html.escape(j.get('title',''))} @ {html.escape(j.get('company',''))} — {j.get('match_score',0):.0f}%")
    lines.append(f"\n💡 {html.escape(_tip(top_titles))}")

    ok = send_message("\n".join(lines))
    if ok:
        kv_put("analyst_last", _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"))
    return ok


if __name__ == "__main__":
    maybe_brief([{"title": "Backend Engineer", "company": "Acme", "match_score": 82}], force=True)

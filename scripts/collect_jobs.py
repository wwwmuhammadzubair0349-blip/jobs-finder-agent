"""
Job collectors behind one common interface.

Each source is a function `collect(query, location, search, settings) -> list[job]`
returning the normalised shape:

    {
      "source":   str,
      "id":       str,          # stable per-source id (used for dedupe/seen)
      "title":    str,
      "company":  str,
      "location": str,
      "remote":   bool,
      "salary":   str | "",
      "posted_at": str,         # ISO8601 if known else ""
      "url":      str,          # apply / detail link
      "description": str,
    }

Sources: remotive & remoteok (no key), adzuna & jooble (free key), apify (paid,
throttled via credit-saver). Enable via config.search.sources.

    collect_all(search, settings) -> list[job]   # deduped-by-url within batch
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import os
import re
from typing import Callable

import requests

from log_issue import log_issue

_TIMEOUT = 25
_UA = "Mozilla/5.0 (compatible; JobsFinderAgent/1.0)"

# Country names we treat as region scope (not a city `where` filter) for Adzuna.
_COUNTRY_NAMES = {
    "united arab emirates", "uae", "saudi arabia", "qatar", "oman", "kuwait",
    "bahrain", "germany", "italy", "netherlands", "france", "spain", "united kingdom",
    "uk", "united states", "usa", "canada", "australia", "new zealand", "india",
    "singapore", "south africa", "pakistan", "ireland",
}


def _iso_days_ago(days: int) -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=days)


def _mk_id(source: str, url: str, title: str, company: str) -> str:
    basis = url or f"{title}|{company}"
    return f"{source}:{hashlib.sha1(basis.encode('utf-8')).hexdigest()[:16]}"


def _clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _looks_remote(text: str) -> bool:
    return bool(re.search(r"\bremote\b|work from home|wfh", (text or "").lower()))


# --------------------------------------------------------------------------- #
# Remotive — free JSON, remote jobs                                           #
# --------------------------------------------------------------------------- #
def collect_remotive(query, location, search, settings) -> list[dict]:
    try:
        resp = requests.get(
            "https://remotive.com/api/remote-jobs",
            params={"search": query, "limit": 50},
            headers={"User-Agent": _UA},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        jobs = resp.json().get("jobs", [])
    except Exception as exc:
        log_issue("collect_jobs", f"remotive '{query}': {exc}", "warning")
        return []

    out = []
    for j in jobs:
        out.append(
            {
                "source": "remotive",
                "id": _mk_id("remotive", j.get("url", ""), j.get("title", ""), j.get("company_name", "")),
                "title": j.get("title", ""),
                "company": j.get("company_name", ""),
                "location": j.get("candidate_required_location", "Remote"),
                "remote": True,
                "salary": j.get("salary", "") or "",
                "posted_at": j.get("publication_date", "") or "",
                "url": j.get("url", ""),
                "description": _clean_html(j.get("description", "")),
            }
        )
    return out


# --------------------------------------------------------------------------- #
# RemoteOK — free JSON                                                         #
# --------------------------------------------------------------------------- #
def collect_remoteok(query, location, search, settings) -> list[dict]:
    try:
        resp = requests.get(
            "https://remoteok.com/api",
            headers={"User-Agent": _UA},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        rows = resp.json()
    except Exception as exc:
        log_issue("collect_jobs", f"remoteok: {exc}", "warning")
        return []

    q = query.lower()
    out = []
    for j in rows:
        if not isinstance(j, dict) or "position" not in j:
            continue  # first element is legal notice
        hay = f"{j.get('position','')} {' '.join(j.get('tags',[]))}".lower()
        if q and q not in hay:
            continue
        out.append(
            {
                "source": "remoteok",
                "id": _mk_id("remoteok", j.get("url", ""), j.get("position", ""), j.get("company", "")),
                "title": j.get("position", ""),
                "company": j.get("company", ""),
                "location": j.get("location", "Remote") or "Remote",
                "remote": True,
                "salary": (f"${j.get('salary_min')}-${j.get('salary_max')}" if j.get("salary_min") else ""),
                "posted_at": j.get("date", "") or "",
                "url": j.get("url", ""),
                "description": _clean_html(j.get("description", "")),
            }
        )
    return out


# --------------------------------------------------------------------------- #
# Adzuna — free key, global                                                    #
# --------------------------------------------------------------------------- #
def collect_adzuna(query, location, search, settings) -> list[dict]:
    app_id = os.getenv("ADZUNA_APP_ID", "").strip()
    app_key = os.getenv("ADZUNA_APP_KEY", "").strip()
    if not (app_id and app_key):
        return []

    # Country is dashboard-editable (search.adzuna_country) → env → default.
    # NOT hardcoded: change it anytime from the Search tab without touching code.
    country = (search.get("adzuna_country") or os.getenv("ADZUNA_COUNTRY") or "gb").strip().lower()
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": query,
        "results_per_page": 30,
        "max_days_old": int(search.get("posted_within_days", 7)),
        "content-type": "application/json",
    }
    # Only use `where` for a city/region INSIDE the chosen country. A country
    # name (e.g. "United Arab Emirates") is not a valid `where` in a UK/DE index
    # and would return zero — so we drop it and search the whole adzuna_country.
    if location and location.lower() not in _COUNTRY_NAMES and location.lower() not in ("remote", "anywhere", ""):
        params["where"] = location
    try:
        resp = requests.get(
            f"https://api.adzuna.com/v1/api/jobs/{country}/search/1",
            params=params,
            headers={"User-Agent": _UA},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
    except Exception as exc:
        log_issue("collect_jobs", f"adzuna '{query}': {exc}", "warning")
        return []

    out = []
    for j in results:
        desc = j.get("description", "")
        salary = ""
        if j.get("salary_min"):
            salary = f"{int(j['salary_min'])}-{int(j.get('salary_max', j['salary_min']))}"
        out.append(
            {
                "source": "adzuna",
                "id": _mk_id("adzuna", j.get("redirect_url", ""), j.get("title", ""), j.get("company", {}).get("display_name", "")),
                "title": j.get("title", ""),
                "company": j.get("company", {}).get("display_name", ""),
                "location": j.get("location", {}).get("display_name", location or ""),
                "remote": _looks_remote(f"{j.get('title','')} {desc}"),
                "salary": salary,
                "posted_at": j.get("created", "") or "",
                "url": j.get("redirect_url", ""),
                "description": _clean_html(desc),
            }
        )
    return out


# --------------------------------------------------------------------------- #
# Jooble — free key                                                           #
# --------------------------------------------------------------------------- #
def collect_jooble(query, location, search, settings) -> list[dict]:
    key = os.getenv("JOOBLE_KEY", "").strip()
    if not key:
        return []
    try:
        resp = requests.post(
            f"https://jooble.org/api/{key}",
            json={"keywords": query, "location": "" if location.lower() == "remote" else location},
            headers={"User-Agent": _UA, "Content-Type": "application/json"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        jobs = resp.json().get("jobs", [])
    except Exception as exc:
        log_issue("collect_jobs", f"jooble '{query}': {exc}", "warning")
        return []

    out = []
    for j in jobs:
        out.append(
            {
                "source": "jooble",
                "id": _mk_id("jooble", j.get("link", ""), j.get("title", ""), j.get("company", "")),
                "title": j.get("title", ""),
                "company": j.get("company", ""),
                "location": j.get("location", location or ""),
                "remote": _looks_remote(f"{j.get('title','')} {j.get('snippet','')}"),
                "salary": j.get("salary", "") or "",
                "posted_at": j.get("updated", "") or "",
                "url": j.get("link", ""),
                "description": _clean_html(j.get("snippet", "")),
            }
        )
    return out


# --------------------------------------------------------------------------- #
# Apify — paid credits, credit-saver throttled in rank/run layer              #
# --------------------------------------------------------------------------- #
def collect_apify(query, location, search, settings) -> list[dict]:
    token = os.getenv("APIFY_TOKEN", "").strip()
    actor = os.getenv("APIFY_ACTOR", "").strip()
    if not (token and actor):
        return []
    try:
        resp = requests.post(
            f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items",
            params={"token": token},
            json={"queries": [query], "location": location, "rows": 25},
            headers={"User-Agent": _UA},
            timeout=120,
        )
        resp.raise_for_status()
        rows = resp.json()
    except Exception as exc:
        log_issue("collect_jobs", f"apify '{query}': {exc}", "warning")
        return []

    out = []
    for j in rows if isinstance(rows, list) else []:
        title = j.get("title") or j.get("positionName") or ""
        url = j.get("url") or j.get("jobUrl") or j.get("link") or ""
        company = j.get("company") or j.get("companyName") or ""
        desc = j.get("description") or j.get("descriptionText") or ""
        out.append(
            {
                "source": "apify",
                "id": _mk_id("apify", url, title, company),
                "title": title,
                "company": company,
                "location": j.get("location", location or ""),
                "remote": _looks_remote(f"{title} {desc}"),
                "salary": j.get("salary", "") or "",
                "posted_at": j.get("postedAt", "") or j.get("publishedAt", "") or "",
                "url": url,
                "description": _clean_html(desc),
            }
        )
    return out


_COLLECTORS: dict[str, Callable] = {
    "remotive": collect_remotive,
    "remoteok": collect_remoteok,
    "adzuna": collect_adzuna,
    "jooble": collect_jooble,
    "apify": collect_apify,
}


def collect_all(search: dict, settings: dict) -> list[dict]:
    """Run every enabled source across job_titles x locations; dedupe by url.

    To protect free-tier API limits when the user picks many titles/locations,
    each source only fires up to `max_queries_per_source` (default 12) title x
    location combinations per tick. A time-based offset rotates WHICH combos run
    each tick, so over successive ticks the whole matrix gets covered without
    ever blowing a daily request budget.
    """
    import datetime as _dt

    sources = search.get("sources") or ["remotive"]
    titles = search.get("job_titles") or ["Software Engineer"]
    locations = search.get("locations") or ["Remote"]
    cap = int(settings.get("max_queries_per_source", 6) or 6)

    # Credit-saver gate for Apify (checked here; marker updated in run_all)
    if "apify" in sources and not _apify_allowed(settings):
        sources = [s for s in sources if s != "apify"]

    # Full combo matrix, then a rotating window of size `cap`.
    combos = [(t, l) for t in titles for l in locations]
    if combos:
        tick_index = int(_dt.datetime.now(_dt.timezone.utc).timestamp() // 1200)  # ~20-min buckets
        start = (tick_index * cap) % len(combos)
        rotated = combos[start:] + combos[:start]
    else:
        rotated = []

    seen_urls: set[str] = set()
    seen_ids: set[str] = set()
    batch: list[dict] = []

    def _absorb(jobs):
        for job in jobs:
            key = (job.get("url") or "").strip().lower()
            if job["id"] in seen_ids or (key and key in seen_urls):
                continue
            seen_ids.add(job["id"])
            if key:
                seen_urls.add(key)
            batch.append(job)

    for source in sources:
        fn = _COLLECTORS.get(source)
        if not fn:
            log_issue("collect_jobs", f"unknown source '{source}'", "warning")
            continue

        # remoteok returns the whole feed regardless of query → hit it once.
        if source == "remoteok":
            queries = [("", "")]
        else:
            queries = rotated[:cap]

        # Adzuna: query EACH configured country database (multi-country support).
        if source == "adzuna":
            for country in _adzuna_countries(search):
                csearch = {**search, "adzuna_country": country}
                for title, loc in queries:
                    try:
                        _absorb(fn(title, loc, csearch, settings))
                    except Exception as exc:
                        log_issue("collect_jobs", f"adzuna {country} crashed: {exc}", "warning")
            continue

        for title, loc in queries:
            try:
                _absorb(fn(title, loc, search, settings))
            except Exception as exc:
                log_issue("collect_jobs", f"{source} crashed: {exc}", "warning")
    return batch


def _adzuna_countries(search: dict) -> list[str]:
    """List of Adzuna country codes to search — dashboard-editable, not hardcoded.
    Prefers search.adzuna_countries[]; falls back to single adzuna_country/env/gb."""
    multi = search.get("adzuna_countries")
    if isinstance(multi, list) and multi:
        return [c.strip().lower() for c in multi if c and c.strip()]
    single = (search.get("adzuna_country") or os.getenv("ADZUNA_COUNTRY") or "gb").strip().lower()
    return [single]


def _apify_allowed(settings: dict) -> bool:
    markers = settings.get("credit_markers", {}) or {}
    min_hours = markers.get("apify_min_hours_between_runs", 12)
    last = markers.get("apify_last_run_iso")
    if not last:
        return True
    try:
        last_dt = _dt.datetime.fromisoformat(last)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=_dt.timezone.utc)
    except Exception:
        return True
    return _dt.datetime.now(_dt.timezone.utc) - last_dt >= _dt.timedelta(hours=min_hours)


if __name__ == "__main__":
    import json
    from config import get_search, get_settings

    jobs = collect_all(get_search(), get_settings())
    print(f"Collected {len(jobs)} raw jobs")
    for j in jobs[:10]:
        print(f"  [{j['source']}] {j['title']} @ {j['company']} — {j['url']}")
    if jobs:
        print(json.dumps(jobs[0], indent=2)[:800])

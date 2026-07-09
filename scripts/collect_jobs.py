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
# Apify — Indeed + Google Jobs across EVERY user-defined country.              #
# 2-token failover, and a 72h cache so it only scrapes once every 3 days.      #
# --------------------------------------------------------------------------- #

# Country NAME → Indeed 2-letter code. Anything the user types that maps here
# gets scraped; nothing is hardcoded to a region.
_COUNTRY_CODES = {
    "pakistan": "PK", "united arab emirates": "AE", "uae": "AE", "saudi arabia": "SA",
    "qatar": "QA", "oman": "OM", "kuwait": "KW", "bahrain": "BH", "germany": "DE",
    "italy": "IT", "netherlands": "NL", "france": "FR", "spain": "ES", "malta": "MT",
    "united kingdom": "GB", "uk": "GB", "united states": "US", "usa": "US", "us": "US",
    "canada": "CA", "australia": "AU", "new zealand": "NZ", "india": "IN",
    "singapore": "SG", "south africa": "ZA", "ireland": "IE", "belgium": "BE",
    "switzerland": "CH", "austria": "AT", "poland": "PL", "portugal": "PT",
    "sweden": "SE", "norway": "NO", "denmark": "DK", "turkey": "TR", "egypt": "EG",
    "jordan": "JO", "lebanon": "LB", "morocco": "MA", "nigeria": "NG", "kenya": "KE",
    "malaysia": "MY", "philippines": "PH", "indonesia": "ID", "japan": "JP",
    "brazil": "BR", "mexico": "MX",
}


def _apify_tokens() -> list[str]:
    multi = os.getenv("APIFY_TOKENS", "").strip()
    if multi:
        toks = [t.strip() for t in multi.split(",") if t.strip()]
    else:
        toks = [t for t in [os.getenv("APIFY_TOKEN", "").strip()] if t]
    seen: set[str] = set()
    return [t for t in toks if not (t in seen or seen.add(t))]


def _country_code(name: str) -> str | None:
    return _COUNTRY_CODES.get((name or "").strip().lower())


def _apify_run(actor: str, payload: dict, timeout: int = 240) -> list[dict]:
    """Run an actor with token failover; return dataset items (or [])."""
    tokens = _apify_tokens()
    for idx, tok in enumerate(tokens):
        try:
            resp = requests.post(
                f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items",
                params={"token": tok},
                json=payload,
                headers={"User-Agent": _UA},
                timeout=timeout,
            )
            if resp.status_code in (401, 402, 403, 429) and idx < len(tokens) - 1:
                log_issue("collect_jobs", f"apify token #{idx+1} failed ({resp.status_code}) → next", "warning")
                continue
            resp.raise_for_status()
            rows = resp.json()
            return rows if isinstance(rows, list) else []
        except Exception as exc:
            if idx < len(tokens) - 1:
                log_issue("collect_jobs", f"apify token #{idx+1} error ({exc}) → next", "warning")
                continue
            log_issue("collect_jobs", f"apify actor {actor} failed: {exc}", "warning")
    return []


def _norm_indeed(j: dict) -> dict:
    title = j.get("positionName") or j.get("title") or ""
    company = j.get("company") or j.get("companyName") or ""
    url = j.get("url") or j.get("externalApplyLink") or ""
    desc = j.get("description") or j.get("descriptionText") or ""
    return {
        "source": "indeed",
        "id": _mk_id("indeed", url, title, company),
        "title": title,
        "company": company,
        "location": j.get("location", "") or "",
        "remote": _looks_remote(f"{title} {j.get('location','')} {desc}"),
        "salary": j.get("salary", "") or "",
        "posted_at": j.get("postingDateParsed") or j.get("postedAt", "") or "",
        "url": url,
        "description": _clean_html(desc),
    }


def _norm_google(j: dict) -> dict:
    title = j.get("title") or j.get("positionName") or ""
    company = j.get("companyName") or j.get("company") or ""
    url = j.get("applyLink") or j.get("url") or (j.get("applyOptions") or [{}])[0].get("link", "") if isinstance(j.get("applyOptions"), list) else (j.get("url") or "")
    desc = j.get("description") or j.get("descriptionText") or ""
    return {
        "source": "google",
        "id": _mk_id("google", url, title, company),
        "title": title,
        "company": company,
        "location": j.get("location", "") or "",
        "remote": _looks_remote(f"{title} {desc}"),
        "salary": (j.get("salary") or {}).get("text", "") if isinstance(j.get("salary"), dict) else (j.get("salary") or ""),
        "posted_at": j.get("postedAt", "") or j.get("metadata", {}).get("postedAt", "") if isinstance(j.get("metadata"), dict) else j.get("postedAt", ""),
        "url": url,
        "description": _clean_html(desc),
    }


def collect_apify_all(search: dict, settings: dict) -> list[dict]:
    """Scrape Indeed (+ Google Jobs if configured) across EVERY user country.
    Cached for 72h: returns the cached batch untouched between scrapes."""
    if not _apify_tokens():
        return []

    from cf_store import kv_get, kv_put

    markers = settings.get("credit_markers", {}) or {}
    min_hours = int(markers.get("apify_min_hours_between_runs", 72))
    cache = kv_get("apify_cache", None)
    if isinstance(cache, dict) and cache.get("jobs") is not None:
        ts = cache.get("ts")
        try:
            last = _dt.datetime.fromisoformat(ts)
            if last.tzinfo is None:
                last = last.replace(tzinfo=_dt.timezone.utc)
            if _dt.datetime.now(_dt.timezone.utc) - last < _dt.timedelta(hours=min_hours):
                return cache["jobs"]  # fresh enough → reuse, no scrape
        except Exception:
            pass

    # Time to scrape. Cover every country the user defined.
    titles = search.get("job_titles") or ["Engineer"]
    locations = search.get("locations") or []
    codes = []
    for loc in locations:
        c = _country_code(loc)
        if c and c not in codes:
            codes.append(c)
    if not codes:
        codes = ["GB"]  # nothing mappable → a sane default (still not hardcoded per-user)

    max_runs = int(settings.get("apify_max_runs", 10))
    indeed_actor = os.getenv("APIFY_INDEED_ACTOR", "misceres~indeed-scraper").strip()
    google_actor = os.getenv("APIFY_GOOGLE_ACTOR", "").strip()
    per_run = int(settings.get("apify_items_per_run", 25))

    # Build combos: every country with the top title first, then more titles.
    combos = []
    for t in titles:
        for c in codes:
            combos.append((t, c))
    combos = combos[:max_runs]

    out: list[dict] = []
    seen_ids: set[str] = set()
    for title, code in combos:
        if indeed_actor:
            items = _apify_run(indeed_actor, {
                "position": title, "country": code, "location": "",
                "maxItems": per_run, "parseCompanyDetails": False, "saveOnlyUniqueItems": True,
            })
            for it in items:
                job = _norm_indeed(it)
                if job["id"] not in seen_ids and job.get("url"):
                    seen_ids.add(job["id"]); out.append(job)
        if google_actor:
            items = _apify_run(google_actor, {
                "queries": [f"{title} {code}"], "maxItems": per_run, "csvFriendlyOutput": False,
            })
            for it in items:
                job = _norm_google(it)
                if job["id"] not in seen_ids and job.get("url"):
                    seen_ids.add(job["id"]); out.append(job)

    kv_put("apify_cache", {"ts": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"), "jobs": out})
    log_issue("collect_jobs", f"apify scraped {len(out)} jobs across {len(codes)} countries (cached 72h)", "warning")
    return out


_COLLECTORS: dict[str, Callable] = {
    "remotive": collect_remotive,
    "remoteok": collect_remoteok,
    "adzuna": collect_adzuna,
    "jooble": collect_jooble,
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
        # Apify (Indeed + Google) is handled holistically with its own 72h cache.
        if source == "apify":
            try:
                _absorb(collect_apify_all(search, settings))
            except Exception as exc:
                log_issue("collect_jobs", f"apify layer crashed: {exc}", "warning")
            continue

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

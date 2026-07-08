"""
Rank & filter collected jobs against the profile, then subtract already-seen.

    rank(jobs, profile, search, seen_ids) -> (ranked_all, new_jobs)

ranked_all: every job that clears freshness + match_threshold, scored & sorted.
new_jobs:   ranked_all minus anything whose id/url is in `seen_ids`, capped at
            search.max_per_tick — the genuinely NEW jobs to process this tick.

Scoring (0-100) blends: title/seniority overlap, skills keyword overlap,
location/remote fit, recency, and salary floor.
"""

from __future__ import annotations

import datetime as _dt
import re
from typing import Iterable

from dateutil import parser as dateparser
from rapidfuzz import fuzz


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9\+\#\.]+", (text or "").lower()))


def _parse_date(value: str):
    if not value:
        return None
    try:
        dt = dateparser.parse(value)
        if dt and dt.tzinfo is None:
            dt = dt.replace(tzinfo=_dt.timezone.utc)
        return dt
    except Exception:
        return None


def _recency_score(posted_at: str, within_days: int) -> float:
    dt = _parse_date(posted_at)
    if not dt:
        return 0.6  # unknown date → neutral-ish
    age_days = (_dt.datetime.now(_dt.timezone.utc) - dt).days
    if age_days < 0:
        age_days = 0
    if age_days >= within_days:
        return 0.1
    return max(0.1, 1.0 - (age_days / max(1, within_days)))


def _salary_ok(job: dict, min_salary: int) -> bool:
    if not min_salary:
        return True
    nums = [int(n.replace(",", "")) for n in re.findall(r"\d[\d,]{2,}", job.get("salary", ""))]
    if not nums:
        return True  # unknown salary doesn't disqualify
    return max(nums) >= min_salary


def score_job(job: dict, profile: dict, search: dict) -> tuple[float, str]:
    reasons = []
    title = job.get("title", "")
    desc = job.get("description", "")
    hay = _tokens(f"{title} {desc}")

    # 1) title / target-role overlap (0-30)
    target_roles = profile.get("target_roles", []) or search.get("job_titles", [])
    best_title = max((fuzz.token_set_ratio(title, r) for r in target_roles), default=0)
    title_score = 0.30 * (best_title / 100)
    if best_title >= 60:
        reasons.append(f"title {best_title:.0f}%")

    # 2) skills / tools keyword overlap (0-35)
    skills = [s.lower() for s in (profile.get("skills", []) + profile.get("tools", []))]
    inc = [k.lower() for k in search.get("keywords_include", [])]
    wanted = set(skills + inc)
    hits = {w for w in wanted if w in hay or any(w in tok for tok in hay)}
    skill_ratio = (len(hits) / len(wanted)) if wanted else 0
    skill_score = 0.35 * min(1.0, skill_ratio * 1.5)
    if hits:
        reasons.append(f"skills: {', '.join(sorted(list(hits))[:5])}")

    # 3) location / remote fit (0-15)
    loc_score = 0.0
    if search.get("remote") and job.get("remote"):
        loc_score = 0.15
        reasons.append("remote")
    else:
        locs = [l.lower() for l in search.get("locations", [])]
        jloc = job.get("location", "").lower()
        if any(l in jloc for l in locs if l and l != "remote"):
            loc_score = 0.13
            reasons.append("location fit")
        else:
            loc_score = 0.06

    # 4) recency (0-15)
    rec = _recency_score(job.get("posted_at", ""), int(search.get("posted_within_days", 7)))
    rec_score = 0.15 * rec

    # 5) seniority alignment (0-5)
    sen = (search.get("seniority") or profile.get("seniority") or "").lower()
    sen_score = 0.05 if (sen and sen in hay) else 0.02

    total = round((title_score + skill_score + loc_score + rec_score + sen_score) * 100, 1)

    # penalties: excluded keywords
    for bad in search.get("keywords_exclude", []):
        if bad.lower() in f"{title} {desc}".lower():
            total -= 15
            reasons.append(f"⚠ excludes '{bad}'")

    total = max(0.0, min(100.0, total))
    why = "; ".join(reasons[:4]) or "baseline match"
    return total, why


def _fuzzy_dupe(a: dict, b: dict) -> bool:
    return (
        fuzz.token_set_ratio(a.get("title", ""), b.get("title", "")) >= 90
        and fuzz.token_set_ratio(a.get("company", ""), b.get("company", "")) >= 88
    )


def rank(
    jobs: list[dict],
    profile: dict,
    search: dict,
    seen_ids: Iterable[str],
) -> tuple[list[dict], list[dict]]:
    seen = set(seen_ids or [])
    within = int(search.get("posted_within_days", 7))
    threshold = float(search.get("match_threshold", 55))
    min_salary = int(profile.get("min_salary", 0) or 0)

    # dedupe fuzzy within batch
    deduped: list[dict] = []
    for job in jobs:
        if any(_fuzzy_dupe(job, d) for d in deduped):
            continue
        deduped.append(job)

    ranked: list[dict] = []
    for job in deduped:
        # freshness
        dt = _parse_date(job.get("posted_at", ""))
        if dt and (_dt.datetime.now(_dt.timezone.utc) - dt).days > within:
            continue
        if not _salary_ok(job, min_salary):
            continue
        score, why = score_job(job, profile, search)
        if score < threshold:
            continue
        job = {**job, "match_score": score, "why": why}
        ranked.append(job)

    ranked.sort(key=lambda j: j["match_score"], reverse=True)

    # subtract already-seen → genuinely new
    new_jobs = [
        j for j in ranked
        if j["id"] not in seen and (j.get("url", "").strip().lower() not in seen)
    ]
    cap = int(search.get("max_per_tick", 5))
    new_jobs = new_jobs[:cap]

    return ranked, new_jobs


if __name__ == "__main__":
    from collect_jobs import collect_all
    from config import get_profile, get_search, get_settings

    search = get_search()
    profile = get_profile()
    raw = collect_all(search, get_settings())
    ranked, new = rank(raw, profile, search, seen_ids=[])
    print(f"raw={len(raw)} ranked={len(ranked)} new(this tick)={len(new)}")
    for j in ranked[:10]:
        print(f"  {j['match_score']:5.1f}  {j['title']} @ {j['company']}  — {j['why']}")

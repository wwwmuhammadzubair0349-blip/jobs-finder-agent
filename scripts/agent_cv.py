"""
agent_cv — produce a tailored CV + cover letter per job (strict JSON).

The AI reorders/re-weights the profile to THIS job, rewrites the summary,
injects the job's real keywords (ATS-friendly), and writes a 3-paragraph cover
letter. HARD RULE: use ONLY facts present in config.profile — never invent
experience, employers, dates, degrees, or skills the user doesn't have. Missing
skills are handled with honest transferable-experience phrasing.

    tailor(job, profile) -> {
        "summary": str,
        "skills": [str],            # reordered, job-weighted, from profile only
        "experience": [{title, company, location, start, end, bullets[]}],
        "education": [...], "certifications": [...],
        "cover_letter": {"greeting": str, "paragraphs": [str, str, str], "signoff": str},
        "keywords": [str],          # ATS keywords surfaced from the JD
    }

If the LLM is not configured, `tailor` falls back to a deterministic
profile-passthrough so the pipeline still renders a (generic) CV locally.
"""

from __future__ import annotations

import json

from llm import is_configured
from llm_json import llm_json
from log_issue import log_issue

_SYSTEM = """You are an expert technical CV writer and career coach.
You tailor a candidate's EXISTING profile to a specific job. You are ATS-aware:
you surface the job description's real keywords into the summary, skills, and
experience bullets so applicant-tracking systems rank the CV highly.

ABSOLUTE RULES:
- Use ONLY facts present in the candidate profile JSON. Never invent employers,
  job titles, dates, degrees, certifications, metrics, or skills not present.
- You MAY rephrase, reorder, re-weight, and emphasise existing bullets, and you
  MAY reword the summary, but the underlying facts must stay true.
- If the job needs a skill the candidate lacks, do NOT claim it. Instead lean on
  genuinely-related experience the candidate DOES have (transferable framing).
- Keep it concise, confident, concrete. No clichés ("team player", "go-getter"),
  no first-person fluff in the CV bullets (use strong action verbs).
- The cover letter is exactly 3 short paragraphs, addressed to the company/role,
  specific to this job, honest, and human."""

_USER_TMPL = """CANDIDATE PROFILE (the ONLY source of truth):
{profile}

TARGET JOB:
title: {title}
company: {company}
location: {location}
description:
{description}

Return a JSON object with EXACTLY these keys:
{{
  "summary": "2-4 line professional summary rewritten for THIS role",
  "skills": ["reordered/prioritised skills, only from the profile's skills+tools"],
  "experience": [
    {{"title","company","location","start","end","bullets":["rewritten, keyworded, truthful"]}}
  ],
  "education": [{{"degree","school","year"}}],
  "certifications": [{{"name","issuer","year"}}],
  "cover_letter": {{
    "greeting": "e.g. Dear Hiring Team at <company>,",
    "paragraphs": ["para1","para2","para3"],
    "signoff": "e.g. Kind regards,\\n<full name>"
  }},
  "keywords": ["8-15 ATS keywords pulled from the job description"]
}}
Keep every experience entry from the profile (same company/title/dates); only
rewrite the bullets. Output JSON only."""


def _fallback(job: dict, profile: dict) -> dict:
    name = profile.get("full_name", "")
    return {
        "summary": profile.get("professional_summary", ""),
        "skills": (profile.get("skills", []) or []) + (profile.get("tools", []) or []),
        "experience": profile.get("experience", []),
        "education": profile.get("education", []),
        "certifications": profile.get("certifications", []),
        "cover_letter": {
            "greeting": f"Dear Hiring Team at {job.get('company','')},",
            "paragraphs": [
                f"I am writing to apply for the {job.get('title','')} role. "
                + profile.get("professional_summary", ""),
                "My background aligns with what you are looking for, and I am confident "
                "I can contribute quickly.",
                "I would welcome the chance to discuss how my experience fits your team. "
                "Thank you for your consideration.",
            ],
            "signoff": f"Kind regards,\n{name}",
        },
        "keywords": [],
    }


def _sanitise(data: dict, job: dict, profile: dict) -> dict:
    """Guard against the model dropping keys or hallucinating structure."""
    base = _fallback(job, profile)
    if not isinstance(data, dict):
        return base
    out = dict(base)
    for key in ("summary", "skills", "experience", "education", "certifications", "keywords"):
        if data.get(key):
            out[key] = data[key]
    cl = data.get("cover_letter")
    if isinstance(cl, dict) and cl.get("paragraphs"):
        out["cover_letter"] = {
            "greeting": cl.get("greeting", base["cover_letter"]["greeting"]),
            "paragraphs": cl.get("paragraphs", base["cover_letter"]["paragraphs"]),
            "signoff": cl.get("signoff", base["cover_letter"]["signoff"]),
        }
    return out


def tailor(job: dict, profile: dict) -> dict:
    if not is_configured():
        log_issue("agent_cv", "LLM not configured — using profile passthrough", "warning")
        return _fallback(job, profile)

    user = _USER_TMPL.format(
        profile=json.dumps(profile, ensure_ascii=False, indent=2),
        title=job.get("title", ""),
        company=job.get("company", ""),
        location=job.get("location", ""),
        description=(job.get("description", "") or "")[:4000],
    )
    try:
        data = llm_json(_SYSTEM, user, max_tokens=2600, temperature=0.35)
        return _sanitise(data, job, profile)
    except Exception as exc:
        log_issue("agent_cv", f"tailor failed for {job.get('title')}: {exc}", "error")
        return _fallback(job, profile)


if __name__ == "__main__":
    from config import get_profile

    demo_job = {
        "title": "Backend Engineer",
        "company": "Acme",
        "location": "Remote",
        "description": "Python, FastAPI, PostgreSQL, Docker, AWS. Build scalable REST APIs.",
    }
    print(json.dumps(tailor(demo_job, get_profile()), indent=2)[:1200])

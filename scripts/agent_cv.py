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

_SYSTEM = """You are a seasoned CV writer who makes each application sound like
the CANDIDATE wrote it themselves — a real, competent human, not a machine.
You tailor the candidate's EXISTING profile to a specific job and you are
ATS-aware: you weave the job description's real keywords naturally into the
summary, skills, and experience so applicant-tracking systems rank it highly.

WRITE LIKE A HUMAN (very important):
- Natural, plain, confident language. Vary sentence length. Sound like a real
  professional talking about their own work — not a template.
- BAN these AI/CV clichés and buzzwords: "leverage", "spearheaded", "passionate",
  "dynamic", "results-driven", "synergy", "go-getter", "team player",
  "detail-oriented" (unless truly earned), "utilize" (say "use"), "in today's
  fast-paced world", "proven track record". Don't overuse em-dashes.
- Prefer concrete specifics and real numbers the profile gives you over generic
  adjectives. Show, don't boast.
- The cover letter must read like a thoughtful person wrote it in one sitting:
  warm but professional, specific to THIS company/role, no robotic symmetry, no
  filler. Exactly 3 short paragraphs.

ABSOLUTE HONESTY RULES:
- Use ONLY facts present in the candidate profile JSON. Never invent employers,
  job titles, dates, degrees, certifications, metrics, projects, or skills.
- You MAY rephrase, reorder, re-weight, and emphasise existing content, and you
  MAY reword the summary — but every underlying fact must stay true.
- If the job needs a skill the candidate lacks, do NOT claim it. Lean on
  genuinely-related experience they DO have (honest transferable framing)."""

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
    {{"title","company","location","start","end","bullets":["rewritten, keyworded, truthful, human-sounding"]}}
  ],
  "achievements": ["reordered/emphasised key achievements from the profile, most relevant first (only if profile has them)"],
  "projects": [{{"name","description":"tightened, relevant description"}}],
  "awards": [{{"name","issuer","year"}}],
  "education": [{{"degree","school","year"}}],
  "certifications": [{{"name","issuer","year"}}],
  "cover_letter": {{
    "greeting": "e.g. Dear Hiring Team at <company>,",
    "paragraphs": ["para1","para2","para3"],
    "signoff": "e.g. Kind regards,\\n<full name>"
  }},
  "keywords": ["8-15 ATS keywords pulled from the job description"],
  "apply_steps": ["4-6 short, concrete step-by-step actions to apply for THIS job (open link, attach the CV/cover letter, what to emphasise, any specific field/requirement to address)"]
}}
Keep every experience entry from the profile (same company/title/dates); only
rewrite the bullets. Output JSON only."""


def _fallback(job: dict, profile: dict) -> dict:
    name = profile.get("full_name", "")
    return {
        "summary": profile.get("professional_summary", ""),
        "skills": (profile.get("skills", []) or []) + (profile.get("tools", []) or []),
        "experience": profile.get("experience", []),
        "achievements": profile.get("achievements", []),
        "projects": profile.get("projects", []),
        "awards": profile.get("awards", []),
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
        "apply_steps": [
            f"Open the apply link for {job.get('title','')} at {job.get('company','')}.",
            "Download and attach the tailored CV (PDF) and cover letter.",
            "Paste the plain-text ATS CV if the form has a resume text box.",
            "In any 'why you' field, emphasise your most relevant experience for this role.",
            "Submit, then tap ✅ Applied below so it's tracked.",
        ],
    }


import re as _re

# Safe, case-preserving swaps for the most robotic AI/CV tells the model
# sometimes ignores. Only 1:1 word/phrase swaps that never break grammar.
_HUMANIZE = [
    (r"\butiliz(e|es|ed|ing)\b", {"e": "use", "es": "uses", "ed": "used", "ing": "using"}),
    (r"\butilis(e|es|ed|ing)\b", {"e": "use", "es": "uses", "ed": "used", "ing": "using"}),
    (r"\bleverag(e|es|ed|ing)\b", {"e": "use", "es": "uses", "ed": "used", "ing": "using"}),
    (r"\bspearhead(ed|ing|s)?\b", {None: "lead", "ed": "led", "ing": "leading", "s": "leads"}),
]
_SIMPLE = [
    ("proven track record of", "history of"),
    ("in today's fast-paced world", ""),
    ("results-driven ", ""),
    ("I am excited to apply", "I am writing to apply"),
]


def _humanize(text):
    if not isinstance(text, str) or not text:
        return text
    for pat, table in _HUMANIZE:
        rx = _re.compile(pat, _re.IGNORECASE)
        def sub(m, t=table):
            suf = m.group(1) if m.lastindex else None
            r = t.get(suf, t.get(None, m.group(0)))
            return r[:1].upper() + r[1:] if m.group(0)[:1].isupper() else r
        text = rx.sub(sub, text)
    for a, b in _SIMPLE:
        text = _re.sub(_re.escape(a), b, text, flags=_re.IGNORECASE)
    return _re.sub(r"\s{2,}", " ", text).strip()


def _humanize_all(cv: dict) -> dict:
    cv["summary"] = _humanize(cv.get("summary", ""))
    for e in cv.get("experience", []) or []:
        e["bullets"] = [_humanize(b) for b in (e.get("bullets") or [])]
    cv["achievements"] = [_humanize(a) for a in (cv.get("achievements") or [])]
    cl = cv.get("cover_letter") or {}
    cl["paragraphs"] = [_humanize(p) for p in (cl.get("paragraphs") or [])]
    cv["cover_letter"] = cl
    return cv


def _sanitise(data: dict, job: dict, profile: dict) -> dict:
    """Guard against the model dropping keys or hallucinating structure."""
    base = _fallback(job, profile)
    if not isinstance(data, dict):
        return base
    out = dict(base)
    for key in ("summary", "skills", "experience", "achievements", "projects", "awards",
                "education", "certifications", "keywords", "apply_steps"):
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
        data = llm_json(_SYSTEM, user, max_tokens=2600, temperature=0.4)
        return _humanize_all(_sanitise(data, job, profile))
    except Exception as exc:
        log_issue("agent_cv", f"tailor failed for {job.get('title')}: {exc}", "error")
        return _humanize_all(_fallback(job, profile))


if __name__ == "__main__":
    from config import get_profile

    demo_job = {
        "title": "Backend Engineer",
        "company": "Acme",
        "location": "Remote",
        "description": "Python, FastAPI, PostgreSQL, Docker, AWS. Build scalable REST APIs.",
    }
    print(json.dumps(tailor(demo_job, get_profile()), indent=2)[:1200])

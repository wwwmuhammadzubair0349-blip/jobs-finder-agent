"""
agent_cv — world-class, universal-ATS tailoring. Per job, the LLM rewrites
ONLY three things:
  1. the professional summary ("about me"),
  2. the skills list (reordered + keyworded to THIS job),
  3. each role's experience bullets (job descriptions).
Everything else — names, titles, companies, dates, education, certifications,
achievements, projects, awards, languages — is copied verbatim from the
profile, so facts can never drift.

    tailor(job, profile) -> full cv_data dict for render_cv
"""

from __future__ import annotations

import json
import re as _re

from llm import is_configured
from llm_json import llm_json
from log_issue import log_issue

_SYSTEM = """You are one of the world's best CV writers — the kind senior
executives quietly pay thousands for. You tailor a candidate's EXISTING
material to one specific job, and you are an ATS expert: you know applicant
tracking systems (Workday, Taleo, Greenhouse, SuccessFactors, iCIMS) rank on
exact keyword overlap with the job description, so you weave the JD's real
terms naturally into the summary, skills and bullets.

YOU MAY REWRITE ONLY: the summary, the skills list, and the bullets under each
role. Job titles, companies, dates, education and all other facts are FIXED and
are not part of your output.

WRITE LIKE A REAL HUMAN (critical):
- Plain, confident, specific. Vary sentence rhythm. No robotic symmetry.
- BANNED words/phrases: leverage, spearheaded, passionate, dynamic,
  results-driven, synergy, utilize, go-getter, team player, detail-oriented,
  "proven track record", "fast-paced environment". No clichés.
- Bullets: strong verb first, concrete action, real outcome, max 2 lines each.
- Quantify ONLY with numbers that literally appear in the candidate's material.
  Surface every real one (counts, team sizes, frequencies, durations). If the
  material has NO number for a bullet, you MUST write it without a number —
  an honest bullet with no metric is required over an invented one. Any number
  not present in the material is a firing offence.
- Summary: 2–4 tight lines. Who they are, their strongest relevant proof, and
  what they bring to THIS role. Mirror the job's own vocabulary honestly.
- Skills: 8–14 items, most job-relevant first, using the JD's exact phrasing
  where the candidate genuinely has that skill. Include only skills grounded in
  the candidate's own skills/tools/experience — never add what they lack.

HONESTY IS ABSOLUTE: rephrase and re-emphasise, never fabricate."""

_USER_TMPL = """TARGET JOB
title: {title}
company: {company}
location: {location}
description:
{description}

CANDIDATE MATERIAL (the only source of truth)
about: {summary}
skills: {skills}
tools: {tools}
achievements (context only, do not output): {achievements}

ROLES — rewrite ONLY the bullets for each (titles/companies/dates are fixed):
{roles}

Return a JSON object with EXACTLY these keys:
{{
  "summary": "2-4 line professional summary tailored to THIS job",
  "skills": ["8-14 skills, most relevant first, JD keywords the candidate truly has"],
  "experience_bullets": [
    ["3-5 rewritten bullets for role 1"],
    ["3-5 rewritten bullets for role 2 (and so on, one array per role, same order)"]
  ],
  "cover_letter": {{
    "greeting": "Dear Hiring Team at {company},",
    "paragraphs": ["para1 — why this company/role, one specific hook",
                   "para2 — strongest relevant proof from the candidate's real experience",
                   "para3 — confident close with a clear next step"],
    "signoff": "Kind regards,\\n{full_name}"
  }},
  "keywords": ["10-15 ATS keywords pulled from the job description"],
  "apply_steps": ["4-6 short concrete steps to apply well for THIS job"]
}}
Output JSON only."""


def _roles_block(profile: dict) -> str:
    lines = []
    for i, e in enumerate(profile.get("experience", []) or [], 1):
        lines.append(f"{i}. {e.get('title','')} — {e.get('company','')} ({e.get('start','')} – {e.get('end','')})")
        for b in (e.get("bullets") or []):
            lines.append(f"   • {b}")
    return "\n".join(lines) or "(no roles listed)"


def _static_sections(profile: dict) -> dict:
    """Everything that is copied verbatim — never rewritten per job."""
    return {
        "education": profile.get("education", []),
        "certifications": profile.get("certifications", []),
        "achievements": profile.get("achievements", []),
        "projects": profile.get("projects", []),
        "awards": profile.get("awards", []),
    }


def _fallback(job: dict, profile: dict) -> dict:
    name = profile.get("full_name", "")
    return {
        "summary": profile.get("professional_summary", ""),
        "skills": (profile.get("skills", []) or []) + (profile.get("tools", []) or []),
        "experience": profile.get("experience", []),
        **_static_sections(profile),
        "cover_letter": {
            "greeting": f"Dear Hiring Team at {job.get('company','')},",
            "paragraphs": [
                f"I am writing to apply for the {job.get('title','')} role. "
                + profile.get("professional_summary", ""),
                "My background lines up well with what you are looking for, and I can contribute from day one.",
                "I would welcome the chance to discuss how my experience fits your team. Thank you for your consideration.",
            ],
            "signoff": f"Kind regards,\n{name}",
        },
        "keywords": [],
        "apply_steps": [
            f"Open the apply link for {job.get('title','')} at {job.get('company','')}.",
            "Attach the tailored CV (PDF) and cover letter.",
            "Paste the plain-text ATS CV if the form has a resume text box.",
            "Submit, then tap ✅ Applied so it's tracked.",
        ],
    }


# ---- number guard: no metric may appear unless it exists in the profile ----- #
def _profile_numbers(profile: dict) -> set:
    return set(_re.findall(r"\d+(?:\.\d+)?", json.dumps(profile)))


def _guard_numbers(exp: list, profile: dict) -> list:
    """Revert any rewritten bullet containing a number that is NOT literally in
    the profile — fabricated metrics can never reach a CV."""
    allowed = _profile_numbers(profile)
    orig = profile.get("experience", []) or []
    for i, e in enumerate(exp):
        orig_b = (orig[i].get("bullets") if i < len(orig) else []) or []
        fixed = []
        for k, b in enumerate(e.get("bullets") or []):
            bad = [n for n in _re.findall(r"\d+(?:\.\d+)?", str(b)) if n not in allowed]
            if bad:
                if k < len(orig_b):
                    fixed.append(orig_b[k])   # fall back to the true original
            else:
                fixed.append(b)
        e["bullets"] = fixed or orig_b
    return exp


def _guard_summary(summary: str, profile: dict) -> str:
    allowed = _profile_numbers(profile)
    if any(n not in allowed for n in _re.findall(r"\d+(?:\.\d+)?", summary or "")):
        return profile.get("professional_summary", "") or summary
    return summary


# ---- honesty filter: keep only skills grounded in the profile --------------- #
def _grounded_skills(candidate: list, profile: dict) -> list:
    own = [s.lower() for s in (profile.get("skills", []) or []) + (profile.get("tools", []) or [])]
    own_text = " ".join(own)
    out = []
    for s in candidate or []:
        sl = str(s).lower().strip()
        if not sl:
            continue
        ok = any(sl == o or sl in o or o in sl for o in own) or all(w in own_text for w in sl.split()[:2])
        if ok and s not in out:
            out.append(s)
    return out or (profile.get("skills", []) or [])[:12]


# ---- de-AI-ify pass ---------------------------------------------------------- #
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
    cl = cv.get("cover_letter") or {}
    cl["paragraphs"] = [_humanize(p) for p in (cl.get("paragraphs") or [])]
    cv["cover_letter"] = cl
    return cv


def tailor(job: dict, profile: dict) -> dict:
    if not is_configured():
        log_issue("agent_cv", "LLM not configured — using profile passthrough", "warning")
        return _humanize_all(_fallback(job, profile))

    user = _USER_TMPL.format(
        title=job.get("title", ""),
        company=job.get("company", ""),
        location=job.get("location", ""),
        description=(job.get("description", "") or "")[:3500],
        summary=profile.get("professional_summary", ""),
        skills=", ".join(profile.get("skills", []) or []),
        tools=", ".join(profile.get("tools", []) or []),
        achievements="; ".join(profile.get("achievements", []) or [])[:600],
        roles=_roles_block(profile),
        full_name=profile.get("full_name", ""),
    )
    try:
        data = llm_json(_SYSTEM, user, max_tokens=1900, temperature=0.4)
        base = _fallback(job, profile)
        out = dict(base)

        if data.get("summary"):
            out["summary"] = _guard_summary(str(data["summary"]), profile)
        out["skills"] = _grounded_skills(data.get("skills"), profile)

        # Merge rewritten bullets back into the FIXED role entries.
        rb = data.get("experience_bullets")
        exp = [dict(e) for e in (profile.get("experience", []) or [])]
        if isinstance(rb, list):
            for i, e in enumerate(exp):
                if i < len(rb) and isinstance(rb[i], list) and rb[i]:
                    e["bullets"] = [str(b) for b in rb[i]][:5]
        out["experience"] = _guard_numbers(exp, profile)

        cl = data.get("cover_letter")
        if isinstance(cl, dict) and cl.get("paragraphs"):
            out["cover_letter"] = {
                "greeting": cl.get("greeting", base["cover_letter"]["greeting"]),
                "paragraphs": [str(p) for p in cl["paragraphs"]][:3],
                "signoff": cl.get("signoff", base["cover_letter"]["signoff"]),
            }
        if data.get("keywords"):
            out["keywords"] = data["keywords"]
        if data.get("apply_steps"):
            out["apply_steps"] = data["apply_steps"]

        return _humanize_all(out)
    except Exception as exc:
        log_issue("agent_cv", f"tailor failed for {job.get('title')}: {exc}", "error")
        return _humanize_all(_fallback(job, profile))


if __name__ == "__main__":
    from config import get_profile

    demo_job = {
        "title": "Electrical Engineer",
        "company": "Acme",
        "location": "Dubai",
        "description": "MEP, HVAC, LV systems, AutoCAD, preventive maintenance, testing and commissioning.",
    }
    print(json.dumps(tailor(demo_job, get_profile()), indent=2)[:1500])

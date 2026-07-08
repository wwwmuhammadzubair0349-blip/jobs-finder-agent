"""
render_cv — fill the fixed templates and render A4 PDFs via Playwright.

    render(job, profile, cv_data, out_dir) -> {
        "cv_pdf": Path, "cover_pdf": Path,
        "cv_txt": Path,            # plain-text ATS variant
        "slug": str,
    }

The template design/layout is identical every time; only cv_data content varies.
Also emits a plain-text ATS CV for pasting into forms.
"""

from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_ROOT = Path(__file__).resolve().parent.parent
_TEMPLATES = _ROOT / "templates"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES)),
    autoescape=select_autoescape(["html"]),
)


def slugify(job: dict) -> str:
    raw = f"{job.get('company','')}-{job.get('title','')}"
    slug = re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-")
    return (slug or "job")[:60]


def _titlecase_token(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", (s or "").strip()).strip("_")


def file_basename(job: dict, profile: dict) -> str:
    """FirstName_LastName_JobTitle → e.g. Muhammad_Zubair_Electrical_Engineer."""
    full = (profile.get("full_name") or "Candidate").split()
    first = _titlecase_token(full[0]) if full else "Candidate"
    last = _titlecase_token(full[-1]) if len(full) > 1 else ""
    name = f"{first}_{last}".strip("_") or "Candidate"
    jobt = _titlecase_token(job.get("title", "") or "Job")[:50]
    return f"{name}_{jobt}".strip("_")


def _render_html(cv_data: dict, profile: dict, job: dict) -> tuple[str, str]:
    cv_html = _env.get_template("cv.html").render(cv=cv_data, profile=profile, job=job)
    cover_html = _env.get_template("cover_letter.html").render(
        cover=cv_data.get("cover_letter", {}),
        profile=profile,
        job=job,
        today=_dt.date.today().strftime("%d %B %Y"),
    )
    return cv_html, cover_html


def _plain_text_cv(cv_data: dict, profile: dict) -> str:
    lines = []
    lines.append(profile.get("full_name", ""))
    if profile.get("headline"):
        lines.append(profile["headline"])
    contact = " | ".join(
        x for x in [
            profile.get("location", ""), profile.get("email", ""), profile.get("phone", ""),
            (profile.get("links", {}) or {}).get("linkedin", ""),
            (profile.get("links", {}) or {}).get("github", ""),
        ] if x
    )
    if contact:
        lines.append(contact)
    lines.append("")

    if cv_data.get("summary"):
        lines += ["PROFESSIONAL SUMMARY", cv_data["summary"], ""]

    if cv_data.get("skills"):
        lines += ["CORE SKILLS", ", ".join(cv_data["skills"]), ""]

    if cv_data.get("experience"):
        lines.append("EXPERIENCE")
        for j in cv_data["experience"]:
            head = f"{j.get('title','')} — {j.get('company','')}"
            meta = f"{j.get('start','')} - {j.get('end','')}".strip(" -")
            lines.append(f"{head}  ({meta})" if meta else head)
            for b in j.get("bullets", []):
                lines.append(f"- {b}")
            lines.append("")

    if cv_data.get("education"):
        lines.append("EDUCATION")
        for e in cv_data["education"]:
            lines.append(f"{e.get('degree','')}, {e.get('school','')} ({e.get('year','')})")
        lines.append("")

    if cv_data.get("certifications"):
        lines.append("CERTIFICATIONS")
        for c in cv_data["certifications"]:
            lines.append(f"{c.get('name','')} — {c.get('issuer','')} ({c.get('year','')})")
        lines.append("")

    if profile.get("languages"):
        lines += ["LANGUAGES", ", ".join(profile["languages"]), ""]

    return "\n".join(lines).strip() + "\n"


def _html_to_pdf(cv_html: str, cover_html: str, cv_pdf: Path, cover_pdf: Path) -> None:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page()
        for html, out in ((cv_html, cv_pdf), (cover_html, cover_pdf)):
            page.set_content(html, wait_until="networkidle")
            page.pdf(
                path=str(out),
                format="A4",
                print_background=True,
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
            )
        browser.close()


def render(job: dict, profile: dict, cv_data: dict, out_dir: Path) -> dict:
    slug = slugify(job)
    job_dir = Path(out_dir) / slug
    job_dir.mkdir(parents=True, exist_ok=True)

    cv_html, cover_html = _render_html(cv_data, profile, job)

    # keep raw HTML alongside for debugging / inspection
    (job_dir / "cv.html").write_text(cv_html, encoding="utf-8")
    (job_dir / "cover_letter.html").write_text(cover_html, encoding="utf-8")

    base = file_basename(job, profile)
    cv_pdf = job_dir / f"{base}_CV.pdf"
    cover_pdf = job_dir / f"{base}_CoverLetter.pdf"
    cv_txt = job_dir / f"{base}_CV.txt"
    cv_txt.write_text(_plain_text_cv(cv_data, profile), encoding="utf-8")

    _html_to_pdf(cv_html, cover_html, cv_pdf, cover_pdf)

    return {"cv_pdf": cv_pdf, "cover_pdf": cover_pdf, "cv_txt": cv_txt, "slug": slug, "basename": base}


if __name__ == "__main__":
    from agent_cv import tailor
    from config import get_profile

    job = {
        "title": "Backend Engineer",
        "company": "Acme",
        "location": "Remote",
        "description": "Python, FastAPI, PostgreSQL, Docker, AWS. Build scalable REST APIs.",
    }
    profile = get_profile()
    data = tailor(job, profile)
    result = render(job, profile, data, _ROOT / "output")
    print("Rendered:")
    for k, v in result.items():
        print(f"  {k}: {v}")

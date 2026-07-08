"""
Publish rendered CVs to the public `job-cvs` GitHub repo (GitHub Pages),
yielding public URLs {CVS_BASE_URL}/cvs/{slug}/cv.pdf.

Uses the GitHub Contents API (PUT /repos/{repo}/contents/{path}) with a
fine-grained PAT (CVS_DEPLOY_TOKEN, contents:write on that repo only) — no git
binary needed, works cleanly from CI. No-op locally when creds are absent.

    publish(slug, files) -> dict | None   # {cv_url, cover_url, cv_txt_url}
"""

from __future__ import annotations

import base64
import os
from pathlib import Path

import requests

from log_issue import log_issue

TOKEN = os.getenv("CVS_DEPLOY_TOKEN", "").strip()
REPO = os.getenv("CVS_REPO", "").strip()          # owner/repo
BASE_URL = os.getenv("CVS_BASE_URL", "").rstrip("/")
_TIMEOUT = 60


def enabled() -> bool:
    return bool(TOKEN and REPO and BASE_URL)


def _put_file(repo_path: str, content: bytes) -> bool:
    url = f"https://api.github.com/repos/{REPO}/contents/{repo_path}"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    # fetch existing sha (update requires it)
    sha = None
    try:
        r = requests.get(url, headers=headers, timeout=_TIMEOUT)
        if r.status_code == 200:
            sha = r.json().get("sha")
    except requests.RequestException:
        pass

    payload = {
        "message": f"publish {repo_path}",
        "content": base64.b64encode(content).decode("ascii"),
    }
    if sha:
        payload["sha"] = sha
    try:
        r = requests.put(url, headers=headers, json=payload, timeout=_TIMEOUT)
        r.raise_for_status()
        return True
    except requests.RequestException as exc:
        log_issue("publish_cvs", f"PUT {repo_path} failed: {exc}", "warning")
        return False


def publish(slug: str, files: dict) -> dict | None:
    if not enabled():
        return None

    mapping = {"cv_pdf": "cv_url", "cover_pdf": "cover_url", "cv_txt": "cv_txt_url"}
    urls: dict[str, str] = {}
    for fkey, url_key in mapping.items():
        path = files.get(fkey)
        if not path or not Path(path).exists():
            continue
        fname = Path(path).name  # real FirstName_LastName_Job_CV.pdf name
        repo_path = f"cvs/{slug}/{fname}"
        if _put_file(repo_path, Path(path).read_bytes()):
            urls[url_key] = f"{BASE_URL}/{repo_path}"
    return urls or None


if __name__ == "__main__":
    print("publish enabled:", enabled())

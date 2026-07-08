"""
Verify apply links resolve before the user ever sees them.

    verify_links(jobs) -> (ok_jobs, dead_jobs)

GET each url with a browser UA + timeout, following redirects. A job whose link
returns a hard error / times out is dropped (and logged as a warning) so no
broken apply link reaches Telegram.
"""

from __future__ import annotations

import requests

from log_issue import log_issue

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
_TIMEOUT = 15


def _alive(url: str) -> bool:
    if not url:
        return False
    headers = {"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml"}
    try:
        # HEAD first (cheap); fall back to GET if server dislikes HEAD
        resp = requests.head(url, headers=headers, timeout=_TIMEOUT, allow_redirects=True)
        if resp.status_code in (405, 403, 400) or resp.status_code >= 500:
            resp = requests.get(url, headers=headers, timeout=_TIMEOUT, allow_redirects=True, stream=True)
        return resp.status_code < 400
    except requests.RequestException:
        try:
            resp = requests.get(url, headers=headers, timeout=_TIMEOUT, allow_redirects=True, stream=True)
            return resp.status_code < 400
        except requests.RequestException:
            return False


def verify_links(jobs: list[dict]) -> tuple[list[dict], list[dict]]:
    ok, dead = [], []
    for job in jobs:
        if _alive(job.get("url", "")):
            ok.append(job)
        else:
            dead.append(job)
            log_issue("verify_links", f"dead link dropped: {job.get('title')} @ {job.get('company')} ({job.get('url')})", "warning")
    return ok, dead


if __name__ == "__main__":
    demo = [{"title": "t", "company": "c", "url": "https://example.com"}]
    print(verify_links(demo))

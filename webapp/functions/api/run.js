// POST /api/run — trigger the GitHub Actions search workflow (Run now button).
// Uses GITHUB_PAT (actions:write on the code repo only); never exposed to the
// browser. CODE_REPO = "owner/repo".
import { json } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env } = context;
  const pat = env.GITHUB_PAT;
  const repo = env.CODE_REPO;
  if (!pat || !repo) {
    return json({ error: "Run-now not configured (GITHUB_PAT / CODE_REPO missing)" }, { status: 501 });
  }

  const url = `https://api.github.com/repos/${repo}/actions/workflows/search.yml/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "jobs-finder-dashboard",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (resp.status === 204) return json({ ok: true });
  const text = await resp.text();
  return json({ error: `GitHub dispatch failed (${resp.status})`, detail: text.slice(0, 300) }, { status: 502 });
}

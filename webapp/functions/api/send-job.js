// POST /api/send-job { job } — queue a specific job for full processing
// (CV + cover letter + apply steps → Telegram) and trigger a pipeline run.
// Used by the "Send to Telegram" button on the All Jobs tab.
import { json, badRequest, kvJSON, kvPut } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env } = context;
  let body;
  try { body = await context.request.json(); } catch { return badRequest("invalid json"); }
  const job = body?.job;
  if (!job || (!job.url && !job.id)) return badRequest("job required");

  // Add to the manual queue (deduped by id/url).
  const queue = (await kvJSON(env, "manual_queue", [])) || [];
  const key = (j) => j.id || (j.url || "").toLowerCase();
  if (!queue.some((q) => key(q) === key(job))) {
    queue.push(job);
    await kvPut(env, "manual_queue", queue.slice(0, 50));
  }

  // Trigger a pipeline run to process the queue promptly.
  let dispatched = false;
  if (env.GITHUB_PAT && env.CODE_REPO) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${env.CODE_REPO}/actions/workflows/search.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GITHUB_PAT}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "jobs-finder-dashboard",
          },
          body: JSON.stringify({ ref: "main" }),
        }
      );
      dispatched = r.status === 204;
    } catch {}
  }

  return json({ ok: true, queued: true, dispatched });
}

// POST /api/send-job { job_id } — queue CV/CL generation + Telegram delivery only.
import { one, run } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env, data } = context;
  let body;
  try { body = await context.request.json(); } catch { return badRequest("invalid json"); }
  const jobId = body?.job_id || body?.job?.id;
  if (!jobId) return badRequest("job_id required");

  const uj = await one(env, "SELECT id FROM user_jobs WHERE user_id = ? AND job_id = ?", data.userId, jobId);
  if (!uj) return badRequest("job not found for this user");

  // Mark it queued; the pipeline picks up status='queued' rows.
  await run(env, "UPDATE user_jobs SET status = 'queued' WHERE id = ?", uj.id);

  let dispatched = false;
  if (env.GITHUB_PAT && env.CODE_REPO) {
    try {
      const r = await fetch(`https://api.github.com/repos/${env.CODE_REPO}/actions/workflows/manual-send.yml/dispatches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_PAT}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "jobs-finder",
        },
        body: JSON.stringify({ ref: "main" }),
      });
      dispatched = r.status === 204;
    } catch {}
  }
  return json({ ok: true, dispatched });
}

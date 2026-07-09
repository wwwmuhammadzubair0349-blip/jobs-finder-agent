// POST /api/application { job_url, status } — update this user's job status.
import { run } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";

const STATUSES = ["saved", "applied", "interview", "rejected", "offer"];

export async function onRequestPost(context) {
  const { env, data } = context;
  let body;
  try { body = await context.request.json(); } catch { return badRequest("invalid json"); }
  const { job_url, status } = body || {};
  if (!job_url || !STATUSES.includes(status)) return badRequest("job_url + valid status required");

  const appliedAt = status === "applied" ? new Date().toISOString() : null;
  await run(env,
    `UPDATE user_jobs SET status = ?, applied_at = COALESCE(?, applied_at)
       WHERE user_id = ? AND job_id IN (SELECT id FROM job_pool WHERE url = ?)`,
    status, appliedAt, data.userId, job_url);
  return json({ ok: true });
}

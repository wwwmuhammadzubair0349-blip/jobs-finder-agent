// POST /api/save-job { job_id, saved } — toggle a job as saved/favourite.
import { run } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env, data, request } = context;
  let b;
  try { b = await request.json(); } catch { return badRequest("invalid json"); }
  const jobId = b?.job_id;
  if (!jobId) return badRequest("job_id required");
  const saved = b?.saved ? 1 : 0;
  await run(env, "UPDATE user_jobs SET saved = ? WHERE user_id = ? AND job_id = ?", saved, data.userId, jobId);
  return json({ ok: true, saved: !!saved });
}

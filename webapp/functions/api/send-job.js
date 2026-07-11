// POST /api/send-job { job_id } — queue CV/CL generation + Telegram delivery only.
import { one, run } from "../_shared/db.js";
import { json, badRequest, rateLimit } from "../_shared/kv.js";
import { consume, userTimezone, PLAN_META } from "../_shared/plans.js";

export async function onRequestPost(context) {
  const { env, data } = context;
  // Abuse guard: cap prepare/dispatch calls per user (20 / 5 min).
  if (!(await rateLimit(env, `sendjob:${data.userId}`, 20, 300))) {
    return json({ ok: false, error: "rate", message: "Too many requests — slow down a moment." }, { status: 429 });
  }
  let body;
  try { body = await context.request.json(); } catch { return badRequest("invalid json"); }
  const jobId = body?.job_id || body?.job?.id;
  if (!jobId) return badRequest("job_id required");

  const uj = await one(env, "SELECT id, cv_key, status FROM user_jobs WHERE user_id = ? AND job_id = ?", data.userId, jobId);
  if (!uj) return badRequest("job not found for this user");

  // First prep for this job costs one CV/Cover credit (plan-gated). A resend of
  // already-generated docs (cv_key set) or a request already queued is free.
  if (!uj.cv_key && uj.status !== "queued") {
    const u = await one(env, "SELECT plan FROM users WHERE id = ?", data.userId);
    const tz = await userTimezone(env, data.userId);
    const ok = await consume(env, data.userId, u?.plan || "free", "cvprep", tz);
    if (!ok) {
      const label = (PLAN_META[u?.plan] || PLAN_META.free).label;
      return json({
        ok: false, error: "limit",
        message: `You've used today's CV & cover-letter preparations on your ${label} plan. Upgrade to prepare more.`,
      }, { status: 402 });
    }
  }

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

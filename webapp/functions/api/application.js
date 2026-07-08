// POST /api/application  { job_url, title, company, status }
// Upserts an application record in KV `applications`.
import { json, badRequest, kvJSON, kvPut } from "../_shared/kv.js";

const STATUSES = ["saved", "applied", "interview", "rejected", "offer"];

export async function onRequestPost(context) {
  const { env } = context;
  let body;
  try { body = await context.request.json(); } catch { return badRequest("invalid json"); }
  const { job_url, title, company, status } = body || {};
  if (!job_url || !STATUSES.includes(status)) return badRequest("job_url + valid status required");

  const apps = (await kvJSON(env, "applications", [])) || [];
  const now = new Date().toISOString();
  const idx = apps.findIndex((a) => a.job_url === job_url);
  const entry = { job_url, title: title || "", company: company || "", status, at: now };
  if (idx >= 0) apps[idx] = { ...apps[idx], ...entry };
  else apps.unshift(entry);

  await kvPut(env, "applications", apps.slice(0, 500));
  return json({ ok: true });
}

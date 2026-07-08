// GET /api/data — one call returns everything the dashboard renders.
// All KV reads are server-side; keys never reach the browser.
import { json, kvJSON } from "../_shared/kv.js";

export async function onRequestGet(context) {
  const { env } = context;
  const [recent, jobs, applications, status, issues, latestRun, config] = await Promise.all([
    kvJSON(env, "recent_jobs", []),
    kvJSON(env, "jobs", []),
    kvJSON(env, "applications", []),
    kvJSON(env, "agents_status", []),
    kvJSON(env, "issues", []),
    kvJSON(env, "latest_run", null),
    kvJSON(env, "config", {}),
  ]);

  return json({
    recent_jobs: recent || [],
    jobs: jobs || [],
    applications: applications || [],
    agents_status: status || [],
    issues: issues || [],
    latest_run: latestRun,
    // Only surface non-secret config bits for the header/schedule display.
    schedule: {
      check_every_min: config?.check_every_min ?? 30,
      quiet_hours: config?.quiet_hours ?? null,
      timezone: config?.timezone ?? "UTC",
      max_per_tick: config?.max_per_tick ?? 5,
      match_threshold: config?.match_threshold ?? 55,
    },
  });
}

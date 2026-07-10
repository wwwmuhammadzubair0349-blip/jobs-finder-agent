// GET /api/data — everything the dashboard renders, for the effective user.
// Jobs come from D1 (user_jobs joined job_pool). Engine status is global (KV),
// sanitised so one user never sees another user's job titles.
import { all, one, DEFAULT_SETTINGS } from "../_shared/db.js";
import { json, kvJSON } from "../_shared/kv.js";

export async function onRequestGet(context) {
  const { env, data } = context;
  const uid = data.userId;

  const rows = await all(env,
    `SELECT uj.id, uj.job_id, uj.match_score, uj.why, uj.status, uj.first_seen, uj.sent_at, uj.applied_at,
            uj.cv_key, uj.cover_key, uj.cv_txt_key, uj.applied_via,
            jp.title, jp.company, jp.location, jp.remote, jp.salary, jp.posted_at, jp.url, jp.source, jp.description, jp.slug
       FROM user_jobs uj JOIN job_pool jp ON jp.id = uj.job_id
      WHERE uj.user_id = ?
      ORDER BY uj.first_seen DESC LIMIT 500`, uid);

  const jobs = rows.map((r) => ({
    id: r.job_id, uj_id: r.id, slug: r.slug, title: r.title, company: r.company, location: r.location,
    remote: !!r.remote, salary: r.salary, posted_at: r.posted_at, url: r.url, source: r.source,
    description: r.description, match_score: r.match_score, why: r.why, status: r.status,
    applied_via: r.applied_via,
    first_seen: r.first_seen, sent_at: r.sent_at, applied_at: r.applied_at,
    cv_url: r.cv_key ? `/api/cv?k=${encodeURIComponent(r.cv_key)}` : null,
    cover_url: r.cover_key ? `/api/cv?k=${encodeURIComponent(r.cover_key)}` : null,
  }));

  const recent = jobs.filter((j) => j.sent_at).slice(0, 60);
  const applications = jobs
    .filter((j) => ["applied", "interview", "rejected", "offer", "saved"].includes(j.status))
    .map((j) => ({ job_url: j.url, title: j.title, company: j.company, status: j.status, at: j.applied_at || j.sent_at }));

  const cfg = await one(env, "SELECT settings FROM configs WHERE user_id = ?", uid);
  const settings = cfg?.settings ? JSON.parse(cfg.settings) : DEFAULT_SETTINGS;

  const [status, latestRun] = await Promise.all([
    kvJSON(env, `agents_status:${uid}`, []),   // per-user agent activity
    kvJSON(env, "latest_run", null),
  ]);

  // Sanitise engine activity: never expose another user's job title.
  let safeRun = latestRun;
  if (safeRun?.current && !data.isAdmin) {
    safeRun = { ...safeRun, current: { ...safeRun.current, job: safeRun.current.agent ? "processing…" : null } };
  }

  return json({
    jobs, recent_jobs: recent, applications,
    agents_status: status || [], latest_run: safeRun,
    issues: [],
    schedule: {
      check_every_min: settings.check_every_min ?? 30,
      quiet_hours: settings.quiet_hours ?? null,
      timezone: settings.timezone ?? "UTC",
    },
  });
}

// GET  /api/config          → full editable config (profile, search, schedule)
// POST /api/config { section, data }  → validate + merge one section into KV `config`
//   section ∈ "profile" | "search" | "schedule"
import { json, badRequest, kvJSON, kvPut } from "../_shared/kv.js";

const DEFAULT_PROFILE = {
  full_name: "", headline: "", location: "", phone: "", email: "",
  links: { linkedin: "", portfolio: "", github: "" },
  professional_summary: "", skills: [], tools: [], languages: [],
  experience: [], education: [], certifications: [],
  achievements: [], projects: [], awards: [], memberships: [],
  target_roles: [], seniority: "mid", work_pref: "remote",
  min_salary: 0, willing_to_relocate: false,
};
const DEFAULT_SEARCH = {
  job_titles: [], locations: [], remote: true, seniority: "mid",
  keywords_include: [], keywords_exclude: [],
  sources: ["remotive"], adzuna_country: "gb", adzuna_countries: ["gb"],
  posted_within_days: 7, match_threshold: 55, max_per_tick: 5,
};
const DEFAULT_SCHEDULE = {
  check_every_min: 30, quiet_hours: null, timezone: "UTC",
  max_per_tick: 5, match_threshold: 55,
};

export async function onRequestGet(context) {
  const cfg = (await kvJSON(context.env, "config", {})) || {};
  return json({
    profile: { ...DEFAULT_PROFILE, ...(cfg.profile || {}) },
    search: { ...DEFAULT_SEARCH, ...(cfg.search || {}) },
    schedule: {
      ...DEFAULT_SCHEDULE,
      check_every_min: cfg.check_every_min ?? DEFAULT_SCHEDULE.check_every_min,
      quiet_hours: cfg.quiet_hours ?? DEFAULT_SCHEDULE.quiet_hours,
      timezone: cfg.timezone ?? DEFAULT_SCHEDULE.timezone,
      max_per_tick: cfg.max_per_tick ?? DEFAULT_SCHEDULE.max_per_tick,
      match_threshold: cfg.match_threshold ?? DEFAULT_SCHEDULE.match_threshold,
    },
  });
}

export async function onRequestPost(context) {
  const { env } = context;
  let body;
  try { body = await context.request.json(); } catch { return badRequest("invalid json"); }
  const { section, data } = body || {};
  if (!["profile", "search", "schedule"].includes(section)) return badRequest("bad section");
  if (typeof data !== "object" || data === null) return badRequest("bad data");

  const cfg = (await kvJSON(env, "config", {})) || {};

  if (section === "profile") {
    cfg.profile = { ...DEFAULT_PROFILE, ...(cfg.profile || {}), ...data };
  } else if (section === "search") {
    cfg.search = { ...DEFAULT_SEARCH, ...(cfg.search || {}), ...data };
    cfg.match_threshold = clampInt(cfg.search.match_threshold, 0, 100, 55);
    cfg.max_per_tick = clampInt(cfg.search.max_per_tick, 1, 25, 5);
  } else if (section === "schedule") {
    cfg.check_every_min = clampInt(data.check_every_min, 5, 240, 30);
    cfg.timezone = typeof data.timezone === "string" ? data.timezone : (cfg.timezone || "UTC");
    cfg.quiet_hours = validQuiet(data.quiet_hours) ? data.quiet_hours : null;
    if (data.max_per_tick != null) cfg.max_per_tick = clampInt(data.max_per_tick, 1, 25, 5);
    if (data.match_threshold != null) cfg.match_threshold = clampInt(data.match_threshold, 0, 100, 55);
  }

  await kvPut(env, "config", cfg);
  return json({ ok: true });
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}
function validQuiet(q) {
  if (!q) return false;
  const re = /^\d{2}:\d{2}$/;
  return re.test(q.start || "") && re.test(q.end || "");
}

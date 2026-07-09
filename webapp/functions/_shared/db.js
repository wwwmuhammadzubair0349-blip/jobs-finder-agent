// D1 (SQLite) helpers for Pages Functions. `env.DB` is the binding.

export async function one(env, sql, ...params) {
  return await env.DB.prepare(sql).bind(...params).first();
}

export async function all(env, sql, ...params) {
  const r = await env.DB.prepare(sql).bind(...params).all();
  return r.results || [];
}

export async function run(env, sql, ...params) {
  return await env.DB.prepare(sql).bind(...params).run();
}

export function uuid() {
  return crypto.randomUUID();
}

// Human-friendly connection code, e.g. JF-7K2Q9X
export function connectionCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `JF-${s}`;
}

export function nowIso() {
  return new Date().toISOString();
}

// Default profile/search/settings for a brand-new user.
export const DEFAULT_PROFILE = {
  full_name: "", headline: "", location: "", phone: "", email: "",
  links: { linkedin: "", portfolio: "", github: "" },
  professional_summary: "", skills: [], tools: [], languages: [],
  experience: [], education: [], certifications: [],
  achievements: [], projects: [], awards: [], memberships: [],
  target_roles: [], seniority: "mid", work_pref: "remote",
  min_salary: 0, willing_to_relocate: false,
};
export const DEFAULT_SEARCH = {
  job_titles: [], locations: [], remote: true, seniority: "mid",
  keywords_include: [], keywords_exclude: [],
  sources: ["remotive", "remoteok", "adzuna", "jooble", "apify"],
  adzuna_countries: ["gb"], posted_within_days: 7,
  match_threshold: 55, max_per_tick: 5,
};
export const DEFAULT_SETTINGS = {
  check_every_min: 30, quiet_hours: null, timezone: "UTC",
  max_per_tick: 5, match_threshold: 55,
};

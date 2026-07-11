// GET/POST /api/admin-engine — global engine settings (admin only).
// Stored in KV `engine_config`; the pipeline reads it and applies overrides.
import { json, unauthorized, kvJSON, kvPut } from "../_shared/kv.js";

const DEFAULTS = {
  sources: ["remotive", "remoteok", "adzuna", "jooble", "apify"],
  posted_within_days: 14,
  match_threshold: 55,
  max_per_tick: 5,
};

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!data.isAdmin) return unauthorized();
  const cfg = await kvJSON(env, "engine_config", null);
  return json({ engine: { ...DEFAULTS, ...(cfg || {}) } });
}

export async function onRequestPost(context) {
  const { env, data, request } = context;
  if (!data.isAdmin) return unauthorized();
  let b;
  try { b = await request.json(); } catch { return json({ ok: false }, { status: 400 }); }
  const cfg = {
    sources: Array.isArray(b.sources) && b.sources.length ? b.sources : DEFAULTS.sources,
    posted_within_days: Math.max(1, Math.min(60, parseInt(b.posted_within_days, 10) || DEFAULTS.posted_within_days)),
    match_threshold: Math.max(0, Math.min(100, parseInt(b.match_threshold, 10) || DEFAULTS.match_threshold)),
    max_per_tick: Math.max(1, Math.min(50, parseInt(b.max_per_tick, 10) || DEFAULTS.max_per_tick)),
  };
  await kvPut(env, "engine_config", cfg);
  return json({ ok: true, engine: cfg });
}

// GET /api/config  → this user's profile/search/schedule (from D1 `configs`)
// POST /api/config { section, data } → validate + save one section
import { one, run, DEFAULT_PROFILE, DEFAULT_SEARCH, DEFAULT_SETTINGS } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";
import { encrypt } from "../_shared/enc.js";

function safeAuto(settings) {
  // Never expose the encrypted Gmail password to the browser.
  const aa = settings.auto_apply || {};
  return {
    enabled: !!aa.enabled,
    gmail_address: aa.gmail_address || "",
    has_password: !!aa.gmail_app_password_enc,
    min_score: aa.min_score ?? 70,
    daily_cap: aa.daily_cap ?? 10,
  };
}

async function loadConfig(env, userId) {
  const row = await one(env, "SELECT profile, search, settings FROM configs WHERE user_id = ?", userId);
  const p = row?.profile ? JSON.parse(row.profile) : {};
  const s = row?.search ? JSON.parse(row.search) : {};
  const st = row?.settings ? JSON.parse(row.settings) : {};
  return {
    profile: { ...DEFAULT_PROFILE, ...p },
    search: { ...DEFAULT_SEARCH, ...s },
    settings: { ...DEFAULT_SETTINGS, ...st },
  };
}

export async function onRequestGet(context) {
  const cfg = await loadConfig(context.env, context.data.userId);
  return json({
    profile: cfg.profile, search: cfg.search, schedule: cfg.settings,
    auto_apply: safeAuto(cfg.settings),
  });
}

export async function onRequestPost(context) {
  const { env, data } = context;
  let body;
  try { body = await context.request.json(); } catch { return badRequest("invalid json"); }
  const { section, data: payload } = body || {};
  if (!["profile", "search", "schedule", "auto_apply"].includes(section)) return badRequest("bad section");
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return badRequest("bad data");
  // Storage-abuse guard: a single config section must stay small (profiles are
  // text CV fields, not blobs). ~48KB of JSON is far above any real profile.
  try { if (JSON.stringify(payload).length > 48 * 1024) return badRequest("payload too large"); }
  catch { return badRequest("bad data"); }

  const cfg = await loadConfig(env, data.userId);
  let profile = cfg.profile, search = cfg.search, settings = cfg.settings;

  if (section === "profile") {
    profile = { ...profile, ...payload };
  } else if (section === "search") {
    search = { ...search, ...payload };
    search.match_threshold = clampInt(search.match_threshold, 0, 100, 55);
    search.max_per_tick = clampInt(search.max_per_tick, 1, 25, 5);
  } else if (section === "schedule") {
    settings.check_every_min = clampInt(payload.check_every_min, 5, 240, 30);
    settings.timezone = typeof payload.timezone === "string" ? payload.timezone : (settings.timezone || "UTC");
    settings.quiet_hours = validQuiet(payload.quiet_hours) ? payload.quiet_hours : null;
  } else if (section === "auto_apply") {
    const prev = settings.auto_apply || {};
    const aa = {
      enabled: !!payload.enabled,
      gmail_address: (payload.gmail_address || "").trim().toLowerCase(),
      min_score: clampInt(payload.min_score, 0, 100, 70),
      daily_cap: clampInt(payload.daily_cap, 1, 50, 10),
      gmail_app_password_enc: prev.gmail_app_password_enc || "",
    };
    // Only re-encrypt when the user typed a new password (16-char app password).
    const pw = (payload.gmail_app_password || "").replace(/\s+/g, "");
    if (pw && pw.length >= 12) {
      aa.gmail_app_password_enc = await encrypt(pw, env.AUTH_SECRET || "");
    }
    if (payload.clear_password) aa.gmail_app_password_enc = "";
    settings.auto_apply = aa;
  }

  await run(env,
    "INSERT INTO configs (user_id, profile, search, settings) VALUES (?,?,?,?) " +
    "ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile, search=excluded.search, settings=excluded.settings",
    data.userId, JSON.stringify(profile), JSON.stringify(search), JSON.stringify(settings));

  return json({ ok: true });
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? dflt : Math.max(lo, Math.min(hi, n));
}
function validQuiet(q) {
  const re = /^\d{2}:\d{2}$/;
  return q && re.test(q.start || "") && re.test(q.end || "");
}

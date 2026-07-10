// Single source of truth for paid plans + quota enforcement (Functions side).
// Mirror of scripts/plans.py — keep them byte-compatible.
// Quotas live in usage_counters(user_id, metric, period_key, count).
// period_key is computed in the USER'S timezone (daily "2026-07-10" or ISO
// weekly "2026-W28") so limits are fair globally.

export const UNLIMITED = 999; // practical ceiling — protects LLM cost, never shown as a wall

export const PLANS = {
  free:    { interview: 1, autoapply: 1,  notif: 3,         cvprep: 1,         countries: 1 },
  starter: { interview: 1, autoapply: 5,  notif: 10,        cvprep: 5,         countries: 3 },
  pro:     { interview: 3, autoapply: 15, notif: 25,        cvprep: 15,        countries: UNLIMITED },
  proplus: { interview: UNLIMITED, autoapply: 40, notif: UNLIMITED, cvprep: UNLIMITED, countries: UNLIMITED },
};

export const PLAN_META = {
  free:    { label: "Free",     price: 0 },
  starter: { label: "Starter",  price: 5 },
  pro:     { label: "Pro",      price: 12 },
  proplus: { label: "Pro Plus", price: 25 },
};

function planOf(plan) { return PLANS[(plan || "free").toLowerCase()] || PLANS.free; }

export function metricLimit(plan, metric) {
  const limit = Number(planOf(plan)[metric] || 0);
  const period = (metric === "interview" && (plan || "free").toLowerCase() === "free") ? "week" : "day";
  return { limit, period };
}

// --- period keys (must match plans.py exactly) --------------------------- //
function tzParts(tz) {
  // Returns {y, m, d} for "now" in the given IANA timezone.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date())) if (p.type !== "literal") parts[p.type] = p.value;
  return { y: +parts.year, m: +parts.month, d: +parts.day };
}

function isoWeekKey(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7;        // Mon=0..Sun=6
  dt.setUTCDate(dt.getUTCDate() - day + 3);     // Thursday of this ISO week
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function periodKey(period, tz = "UTC") {
  const { y, m, d } = tzParts(tz);
  if (period === "week") return isoWeekKey(y, m, d);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// --- counters ------------------------------------------------------------- //
export async function usageCount(env, userId, metric, pkey) {
  const r = await env.DB.prepare(
    "SELECT count FROM usage_counters WHERE user_id=? AND metric=? AND period_key=?"
  ).bind(userId, metric, pkey).first();
  return r ? Number(r.count || 0) : 0;
}

export async function bump(env, userId, metric, pkey, n = 1) {
  await env.DB.prepare(
    "INSERT INTO usage_counters (user_id, metric, period_key, count) VALUES (?,?,?,?) " +
    "ON CONFLICT(user_id, metric, period_key) DO UPDATE SET count = count + excluded.count"
  ).bind(userId, metric, pkey, n).run();
}

export async function remaining(env, userId, plan, metric, tz = "UTC") {
  const { limit, period } = metricLimit(plan, metric);
  const used = await usageCount(env, userId, metric, periodKey(period, tz));
  return Math.max(0, limit - used);
}

// Consume one credit. Returns true if allowed (and counted), false if over limit.
export async function consume(env, userId, plan, metric, tz = "UTC") {
  const { limit, period } = metricLimit(plan, metric);
  const pkey = periodKey(period, tz);
  const used = await usageCount(env, userId, metric, pkey);
  if (used >= limit) return false;
  await bump(env, userId, metric, pkey);
  return true;
}

// Per-metric usage snapshot for the dashboard meters.
export async function usageSummary(env, userId, plan, tz = "UTC") {
  const metrics = ["notif", "autoapply", "cvprep", "interview"];
  const out = {};
  for (const m of metrics) {
    const { limit, period } = metricLimit(plan, m);
    const used = await usageCount(env, userId, m, periodKey(period, tz));
    out[m] = { used, limit, remaining: Math.max(0, limit - used), period, unlimited: limit >= UNLIMITED };
  }
  return out;
}

// The user's IANA timezone from their saved settings (falls back to UTC).
export async function userTimezone(env, userId) {
  try {
    const r = await env.DB.prepare("SELECT settings FROM configs WHERE user_id=?").bind(userId).first();
    const s = r?.settings ? JSON.parse(r.settings) : {};
    return s.timezone || "UTC";
  } catch { return "UTC"; }
}

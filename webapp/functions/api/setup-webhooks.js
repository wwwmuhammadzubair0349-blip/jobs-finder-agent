// GET /api/setup-webhooks   (header:  X-Setup-Key: <SETUP_KEY or AUTH_SECRET>)
// One-shot admin utility: (re)registers both Telegram bot webhooks with the
// correct URL, secret token, and allowed_updates (message + callback_query),
// using the Function's own env secrets. Protected by a key so it can be invoked
// without a session cookie. Prefer a dedicated SETUP_KEY; falls back to
// AUTH_SECRET. The key is read from the X-Setup-Key HEADER (not the query
// string, which lands in access logs / proxies / browser history) and compared
// in constant time. Never returns any secret value.
import { json, unauthorized } from "../_shared/kv.js";

function ctEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const expected = env.SETUP_KEY || env.AUTH_SECRET || "";
  const url = new URL(request.url);
  // Header is preferred; query is still accepted for back-compat but discouraged.
  const provided = request.headers.get("X-Setup-Key") || url.searchParams.get("key") || "";
  if (!expected || !ctEqual(provided, expected)) return unauthorized();

  const base = (env.DASHBOARD_URL || "https://jobs-finder-dashboard.pages.dev").replace(/\/+$/, "");
  const allowed = ["message", "callback_query"];

  const aaToken = env.AUTO_APPLY_BOT_TOKEN || (await env.KV.get("aa_bot_token")) || "";
  const bots = [
    { name: "jobs", token: env.TELEGRAM_TOKEN, secret: env.TELEGRAM_WEBHOOK_SECRET, path: "/api/telegram" },
    { name: "interview", token: env.INTERVIEW_BOT_TOKEN, secret: env.INTERVIEW_WEBHOOK_SECRET, path: "/api/telegram-interview" },
    { name: "autoapply", token: aaToken, secret: env.AUTOAPPLY_WEBHOOK_SECRET, path: "/api/telegram-autoapply" },
  ];

  const out = [];
  for (const b of bots) {
    if (!b.token) { out.push({ bot: b.name, ok: false, error: "no token in env" }); continue; }
    const body = { url: base + b.path, allowed_updates: allowed, drop_pending_updates: false };
    if (b.secret) body.secret_token = b.secret;
    let set = null, info = null;
    try {
      const r = await fetch(`https://api.telegram.org/bot${b.token}/setWebhook`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      set = await r.json();
    } catch (e) { set = { ok: false, error: String(e) }; }
    try {
      const r2 = await fetch(`https://api.telegram.org/bot${b.token}/getWebhookInfo`);
      const j = await r2.json();
      const res = j.result || {};
      info = { url: res.url, allowed_updates: res.allowed_updates, pending: res.pending_update_count, last_error: res.last_error_message };
    } catch {}
    out.push({ bot: b.name, set_ok: !!set?.ok, set_desc: set?.description, webhook: info });
  }

  return json({ ok: true, results: out });
}

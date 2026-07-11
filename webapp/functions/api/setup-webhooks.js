// GET /api/setup-webhooks?key=<AUTH_SECRET>
// One-shot admin utility: (re)registers both Telegram bot webhooks with the
// correct URL, secret token, and allowed_updates (message + callback_query),
// using the Function's own env secrets. Protected by AUTH_SECRET so it can be
// invoked without a session cookie. Never returns any secret value.
import { json, unauthorized } from "../_shared/kv.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  if (!env.AUTH_SECRET || url.searchParams.get("key") !== env.AUTH_SECRET) return unauthorized();

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

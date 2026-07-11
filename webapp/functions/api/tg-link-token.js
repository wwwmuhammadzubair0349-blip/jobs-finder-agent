// POST /api/tg-link-token — issue a one-time Telegram connect link for the
// logged-in user. The token is single-use, expires in 3 minutes, and is bound
// to this account server-side. Because only an authenticated user can mint it,
// a leaked connection code can no longer hijack an account — linking now
// requires being logged in. The bot consumes the token on /start.
import { json } from "../_shared/kv.js";

const TTL = 180; // seconds

export async function onRequestPost(context) {
  const { env, data } = context;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); // 32 hex chars
  await env.KV.put(`tglink:${token}`, JSON.stringify({ uid: String(data.userId) }), { expirationTtl: TTL });
  const bot = env.BOT_USERNAME || "jobs_finder_agent_bot";
  const app = `tg://resolve?domain=${bot}&start=${token}`;                       // opens the installed app directly
  const web = `https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(app)}`;  // opens Telegram Web, carries the token
  return json({ ok: true, url: `https://t.me/${bot}?start=${token}`, app, web, bot, expires_in: TTL });
}

// POST /api/telegram-autoapply — Auto-Apply Notifier bot webhook.
// Companion bot that delivers auto-apply receipts + the daily summary from the
// pipeline. Here it handles /start, secure linking (shared one-time token) and
// a premium intro. Token from env or KV (aa_bot_token). Part of the team:
// Jobs bot + Interview Coach + this + the channel — all cross-promoted.
import { one, run } from "../_shared/db.js";
import { json } from "../_shared/kv.js";

const CODE_RE = /\bJF-[A-Z0-9]{6}\b/i;
const RULE = "──────────────";

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.AUTOAPPLY_WEBHOOK_SECRET && secret !== env.AUTOAPPLY_WEBHOOK_SECRET) return json({ ok: false }, { status: 401 });

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }
  const token = env.AUTO_APPLY_BOT_TOKEN || (await env.KV.get("aa_bot_token")) || "";
  const dash = env.DASHBOARD_URL || "https://jobs-finder-dashboard.pages.dev";
  const channel = (env.TELEGRAM_CHANNEL || "@dailyjobs_feed").replace("@", "");

  const msg = update.message;
  if (!msg || !msg.text) return json({ ok: true });
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const kb = teamKb("aa", channel);

  // Secure deep-link connect: /start <one-time-token> minted from the dashboard.
  const startTok = text.match(/^\/start\s+([a-f0-9]{16,64})$/i);
  if (startTok) {
    const key = `tglink:${startTok[1].toLowerCase()}`;
    const raw = await env.KV.get(key);
    if (!raw) { await send(token, chatId, `⌛ <b>This connect link expired</b>\n${RULE}\nOpen your dashboard and tap <b>Connect Telegram</b> for a fresh one.`, kb); return json({ ok: true }); }
    let uid = null; try { uid = JSON.parse(raw).uid; } catch {}
    const u = uid ? await one(env, "SELECT id FROM users WHERE id = ?", uid) : null;
    if (!u) { await env.KV.delete(key); await send(token, chatId, `⚠️ <b>Couldn't connect</b>\n${RULE}\nTry again from your dashboard.`); return json({ ok: true }); }
    const clash = await one(env, "SELECT id FROM users WHERE (telegram_chat_id = ? OR interview_chat_id = ?) AND id != ?", chatId, chatId, u.id);
    if (clash) { await send(token, chatId, `⚠️ <b>Already connected to another account</b>\n${RULE}\nUnlink it there first (Dashboard → Connect Telegram → Unlink), then connect here.`); return json({ ok: true }); }
    await env.KV.delete(key);
    await run(env, "UPDATE users SET telegram_chat_id = ?, interview_chat_id = ? WHERE id = ?", chatId, chatId, u.id);
    await send(token, chatId, connectedMsg(), kb);
    return json({ ok: true });
  }

  const already = await one(env, "SELECT id FROM users WHERE telegram_chat_id = ?", chatId);
  if (text.match(CODE_RE)) {
    await send(token, chatId, already ? alreadyMsg() : connectFirstMsg(), kb);
    return json({ ok: true });
  }

  // Greeting / anything else.
  await send(token, chatId, already ? introMsg() : connectFirstMsg(), kb);
  return json({ ok: true });
}

// --- messages -------------------------------------------------------------- //
function introMsg() {
  return `🤖 <b>I'm your Auto-Apply Notifier</b>\n${RULE}\n` +
    `When auto-apply is on, I work quietly in the background and ping you the moment an application goes out on your behalf:\n\n` +
    `✅ A <b>receipt for every job</b> I apply to — with the tailored CV & cover letter that were sent\n` +
    `📊 A clean <b>end-of-day summary</b> of everything applied\n\n` +
    `Flip auto-apply on in <b>Profile → Auto-apply</b> and relax — I'll take it from here. 🚀\n\n` +
    `👇 I'm one of your <b>4-agent team</b> — meet the others:`;
}
function connectedMsg() {
  return `✅ <b>Connected — I'm your Auto-Apply Notifier!</b>\n${RULE}\n` +
    `I'll send a receipt for every auto-application and a daily summary. Turn auto-apply on in <b>Profile → Auto-apply</b> and let your team do the work. 🚀\n\n` +
    `👇 Your full team:`;
}
function alreadyMsg() {
  return `✅ <b>You're already connected</b>\n${RULE}\n` +
    `I'm linked to your account and I'll notify you on every auto-application. To link a <i>different</i> account, unlink first in your dashboard.\n\n👇 Your team:`;
}
function connectFirstMsg() {
  return `🤖 <b>Auto-Apply Notifier</b>\n${RULE}\n` +
    `I tell you the moment your applications are auto-sent. First, connect from your dashboard — tap <b>Connect Telegram</b> and it links all your bots at once.\n\n` +
    `👇 Meet the rest of your team:`;
}

// --- team cross-promo ------------------------------------------------------ //
function btnUrl(text, url) { return { text, url }; }
function teamKb(current, channel) {
  const all = {
    jobs: btnUrl("💼 Jobs bot", "https://t.me/jobs_finder_agent_bot"),
    iv: btnUrl("🎤 Interview Coach", "https://t.me/interview_prep_coach_bot"),
    aa: btnUrl("🤖 Auto-Apply", "https://t.me/auto_jobs_apply_bot"),
  };
  const others = ["jobs", "iv", "aa"].filter((k) => k !== current).map((k) => all[k]);
  return [others, [btnUrl("📢 Daily Jobs channel", `https://t.me/${channel}`)]];
}

async function send(token, chatId, text, keyboard) {
  if (!token) return;
  const body = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch {}
}

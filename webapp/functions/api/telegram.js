// POST /api/telegram — Jobs bot webhook (multi-user).
// - Connection: user sends their code (JF-XXXXXX) → we link this chat to them.
// - Applied button: ap:<job_id> → mark that user's job applied.
import { one, run } from "../_shared/db.js";
import { json } from "../_shared/kv.js";

const CODE_RE = /\bJF-[A-Z0-9]{6}\b/i;

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) return json({ ok: false }, { status: 401 });

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }
  const token = env.TELEGRAM_TOKEN;

  // Applied button
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id || "");
    if ((cq.data || "").startsWith("ap:")) {
      const jobId = cq.data.slice(3);
      const user = await one(env, "SELECT id FROM users WHERE telegram_chat_id = ?", chatId);
      let done = false;
      if (user) {
        const r = await run(env,
          "UPDATE user_jobs SET status='applied', applied_at=? WHERE user_id=? AND job_id=?",
          new Date().toISOString(), user.id, jobId);
        done = (r.meta?.changes || 0) > 0;
      }
      await answer(token, cq.id, done ? "Marked as Applied ✅" : "Couldn't find that job");
      if (cq.message) await editMarkup(token, chatId, cq.message.message_id, { inline_keyboard: [[{ text: "✅ Applied", callback_data: "noop" }]] });
    } else {
      await answer(token, cq.id, "");
    }
    return json({ ok: true });
  }

  // Text message → connection flow
  const msg = update.message;
  if (msg && msg.text) {
    const chatId = String(msg.chat.id);
    const text = msg.text.trim();
    const m = text.match(CODE_RE);
    if (m) {
      const code = m[0].toUpperCase();
      const user = await one(env, "SELECT id, email FROM users WHERE connection_code = ?", code);
      if (user) {
        await run(env, "UPDATE users SET telegram_chat_id = ? WHERE id = ?", chatId, user.id);
        await send(token, chatId, "✅ <b>Connected!</b>\nYour tailored jobs, CVs and cover letters will arrive here. Good luck! 🚀");
      } else {
        await send(token, chatId, "❌ That code didn't match any account. Copy the exact code from your dashboard (looks like <code>JF-XXXXXX</code>).");
      }
    } else {
      await send(token, chatId, "👋 <b>Welcome to Jobs Finder.</b>\nTo connect, open your dashboard, copy your connection code (like <code>JF-XXXXXX</code>) and send it here.");
    }
  }
  return json({ ok: true });
}

async function send(token, chatId, text) {
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {}
}
async function answer(token, id, text) {
  if (!token) return;
  try { await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: id, text }) }); } catch {}
}
async function editMarkup(token, chatId, mid, markup) {
  if (!token) return;
  try { await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: mid, reply_markup: markup }) }); } catch {}
}

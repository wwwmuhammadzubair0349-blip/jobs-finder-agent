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
  const channel = (env.TELEGRAM_CHANNEL || "@dailyjobs_feed").replace("@", "");
  const dash = env.DASHBOARD_URL || "https://jobs-finder-dashboard.pages.dev";
  const RULE = "──────────────";

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
        // One code links ALL bots — chat id is the same across bots for a user.
        await run(env, "UPDATE users SET telegram_chat_id = ?, interview_chat_id = ? WHERE id = ?", chatId, chatId, user.id);
        await send(token, chatId,
          `✅ <b>You're connected!</b>\n${RULE}\n` +
          `Fresh matching jobs — each with a tailored <b>CV</b> + <b>cover letter</b> + how-to-apply steps — will land right here. 🚀\n\n` +
          `🧠 Your <b>Interview Coach bot</b> is linked too — open @interview_prep_coach_bot and press Start.`,
          [[btnUrl("📢 Follow the channel", `https://t.me/${channel}`)]]);
      } else {
        await send(token, chatId, `❌ <b>Code not recognised</b>\n${RULE}\nCopy the exact code from your dashboard (looks like <code>JF-XXXXXX</code>) and send it here.`);
      }
    } else {
      const already = await one(env, "SELECT id FROM users WHERE telegram_chat_id = ?", chatId);
      if (already) {
        await send(token, chatId, `✅ <b>You're all set.</b>\nNew matching jobs with a tailored CV & cover letter arrive here automatically.`,
          [[btnUrl("📢 Channel", `https://t.me/${channel}`)]]);
      } else {
        // Auto-welcome funnel: this fires when someone taps "Start" from a
        // channel post. Greet, explain, and invite them to create an account.
        await send(token, chatId,
          `👋 <b>Welcome to Jobs Finder!</b>\n${RULE}\n` +
          `I'm your personal job-hunting agent. Here's what I do, free:\n\n` +
          `🔎 Search jobs 24/7 across Indeed, LinkedIn, Adzuna & more — in every country you pick\n` +
          `✍️ Auto-write a tailored <b>CV + cover letter</b> for each match\n` +
          `✈️ Send them right here, ready to apply in minutes\n` +
          `🧠 Coach you through interviews with a real AI mock interview\n\n` +
          `👇 <b>Step 1:</b> create your free account, then send me the code it gives you.`,
          [
            [btnUrl("🚀 Create my free account", dash)],
            [btnUrl("📢 Follow the channel", `https://t.me/${channel}`)],
          ]);
      }
    }
  }
  return json({ ok: true });
}

function btnUrl(text, url) { return { text, url }; }
async function send(token, chatId, text, keyboard) {
  if (!token) return;
  const body = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

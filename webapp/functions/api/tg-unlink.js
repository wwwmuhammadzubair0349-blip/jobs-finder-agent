// POST /api/tg-unlink — disconnect this user's Telegram from BOTH bots.
// After this, the chat no longer maps to any account, so neither bot can read
// or send this user's data until they reconnect.
import { one, run } from "../_shared/db.js";
import { json } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env, data } = context;
  const u = await one(env, "SELECT telegram_chat_id, interview_chat_id FROM users WHERE id = ?", data.userId);
  const chatId = u?.telegram_chat_id || u?.interview_chat_id || null;
  await run(env, "UPDATE users SET telegram_chat_id = NULL, interview_chat_id = NULL WHERE id = ?", data.userId);
  // Drop any interview conversation state tied to that chat.
  if (chatId) { try { await env.KV.delete(`iv_conv:${chatId}`); } catch {} }
  return json({ ok: true });
}

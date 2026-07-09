// GET /api/me — who am I (used by the SPA on load). Includes connection code,
// Telegram link status, admin flag, and whether currently impersonating.
import { one } from "../_shared/db.js";
import { json } from "../_shared/kv.js";

export async function onRequestGet(context) {
  const { env, data } = context;
  // effective user (impersonated if admin switched)
  const u = await one(env, "SELECT id, email, connection_code, telegram_chat_id, interview_chat_id, plan, status FROM users WHERE id = ?", data.userId);
  return json({
    email: data.authUser.email,
    admin: data.isAdmin,
    impersonating: data.impersonating ? (u?.email || data.impersonating) : null,
    user: {
      email: u?.email,
      connection_code: u?.connection_code,
      telegram_connected: !!u?.telegram_chat_id,
      interview_connected: !!u?.interview_chat_id,
      plan: u?.plan,
    },
  });
}

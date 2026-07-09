// POST /api/code — regenerate this user's Telegram connection code.
import { one, run, connectionCode } from "../_shared/db.js";
import { json } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env, data } = context;
  let code = connectionCode();
  for (let i = 0; i < 3; i++) {
    const clash = await one(env, "SELECT id FROM users WHERE connection_code = ?", code);
    if (!clash) break;
    code = connectionCode();
  }
  await run(env, "UPDATE users SET connection_code = ? WHERE id = ?", code, data.userId);
  return json({ ok: true, connection_code: code });
}

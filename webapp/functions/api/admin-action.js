// POST /api/admin-action { user_id, action } — disable | enable | delete (admin).
import { one, run } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env, data } = context;
  if (!data.isAdmin) return json({ error: "forbidden" }, { status: 403 });

  let body;
  try { body = await context.request.json(); } catch { return badRequest("invalid json"); }
  const { user_id, action } = body || {};
  if (!user_id || !["disable", "enable", "delete"].includes(action)) return badRequest("user_id + valid action");

  const target = await one(env, "SELECT id, is_admin FROM users WHERE id = ?", user_id);
  if (!target) return badRequest("user not found");
  if (target.is_admin === 1) return json({ error: "cannot modify an admin account" }, { status: 403 });

  if (action === "delete") {
    await run(env, "DELETE FROM user_jobs WHERE user_id = ?", user_id);
    await run(env, "DELETE FROM configs WHERE user_id = ?", user_id);
    await run(env, "DELETE FROM users WHERE id = ?", user_id);
  } else {
    await run(env, "UPDATE users SET status = ? WHERE id = ?", action === "disable" ? "disabled" : "active", user_id);
  }
  return json({ ok: true });
}

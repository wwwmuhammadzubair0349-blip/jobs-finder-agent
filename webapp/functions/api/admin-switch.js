// POST /api/admin-switch { user_id | null } — admin "switch to user".
// Re-issues the session cookie with an impersonation target (or clears it).
import { createSessionCookie } from "../_shared/auth.js";
import { one } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env, data } = context;
  if (!data.isAdmin) return json({ error: "forbidden" }, { status: 403 });

  let body;
  try { body = await context.request.json(); } catch { body = {}; }
  const targetId = body?.user_id || null;

  if (targetId) {
    const u = await one(env, "SELECT id FROM users WHERE id = ?", targetId);
    if (!u) return badRequest("user not found");
  }

  const cookie = await createSessionCookie(
    { uid: data.authUser.id, email: data.authUser.email, admin: true, imp: targetId || undefined },
    env.AUTH_SECRET || ""
  );
  return json({ ok: true, impersonating: targetId }, { headers: { "Set-Cookie": cookie } });
}

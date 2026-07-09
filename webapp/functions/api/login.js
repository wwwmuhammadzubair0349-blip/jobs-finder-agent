// POST /api/login { email, password } — verify against D1, issue signed cookie.
// Rate limit: 5 failures per IP / 15 min (KV login_fails:{ip}).
import { createSessionCookie, verifyPassword } from "../_shared/auth.js";
import { one } from "../_shared/db.js";
import { json, badRequest, kvJSON } from "../_shared/kv.js";

const MAX_FAILS = 5;
const WINDOW = 15 * 60;

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const failKey = `login_fails:${ip}`;
  const fails = (await kvJSON(env, failKey, 0)) || 0;
  if (fails >= MAX_FAILS) return json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });

  let body;
  try { body = await request.json(); } catch { return badRequest("invalid body"); }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) return badRequest("Email and password required");

  const user = await one(env, "SELECT * FROM users WHERE email = ?", email);
  const ok = user && user.status !== "disabled" && (await verifyPassword(password, user.password_hash));
  if (!ok) {
    await env.KV.put(failKey, String(fails + 1), { expirationTtl: WINDOW });
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  await env.KV.delete(failKey);
  const cookie = await createSessionCookie(
    { uid: user.id, email: user.email, admin: user.is_admin === 1 },
    env.AUTH_SECRET || "",
    { remember: body.remember !== false }
  );
  return json({ ok: true, email: user.email, admin: user.is_admin === 1 }, { headers: { "Set-Cookie": cookie } });
}

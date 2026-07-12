// POST /api/login { email, password } — verify against D1, issue signed cookie.
// Rate limit: 5 failures per IP / 15 min (KV login_fails:{ip}).
import { createSessionCookie, verifyPassword } from "../_shared/auth.js";
import { one } from "../_shared/db.js";
import { json, badRequest, kvJSON } from "../_shared/kv.js";
import { verifyTurnstile } from "../_shared/turnstile.js";

const MAX_FAILS = 5;        // per source IP
const MAX_ACCT_FAILS = 15;  // per targeted account (defeats distributed-IP brute force)
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
  if (password.length > 200 || email.length > 160) return badRequest("Invalid credentials");

  // Per-account throttle: many IPs each under the IP cap can still hammer one
  // (public, e.g. admin) email — cap failures per account too.
  const acctKey = `login_fails_acct:${email}`;
  const acctFails = (await kvJSON(env, acctKey, 0)) || 0;
  if (acctFails >= MAX_ACCT_FAILS) return json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });

  // Human check (Cloudflare Turnstile). No-op until keys are configured.
  if (!(await verifyTurnstile(env, body.turnstile || body.cfToken, ip))) {
    return json({ error: "Please complete the human verification and try again." }, { status: 400 });
  }

  const user = await one(env, "SELECT * FROM users WHERE email = ?", email);
  const ok = user && user.status !== "disabled" && (await verifyPassword(password, user.password_hash));
  if (!ok) {
    await env.KV.put(failKey, String(fails + 1), { expirationTtl: WINDOW });
    await env.KV.put(acctKey, String(acctFails + 1), { expirationTtl: WINDOW });
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  await env.KV.delete(failKey);
  await env.KV.delete(acctKey);
  const cookie = await createSessionCookie(
    { uid: user.id, email: user.email, admin: user.is_admin === 1 },
    env.AUTH_SECRET || "",
    { remember: body.remember !== false }
  );
  return json({ ok: true, email: user.email, admin: user.is_admin === 1 }, { headers: { "Set-Cookie": cookie } });
}

// POST /api/login  { username, password }
// Verifies against AUTH_USER + AUTH_PASSWORD_HASH; issues a signed cookie.
// Rate limit: 5 failures per IP / 15 min (KV login_fails:{ip}), logged to issues.
import { createSessionCookie, verifyPassword } from "../_shared/auth.js";
import { json, badRequest, kvJSON, kvPut } from "../_shared/kv.js";

const MAX_FAILS = 5;
const WINDOW_SECONDS = 15 * 60;

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const failKey = `login_fails:${ip}`;

  const fails = (await kvJSON(env, failKey, 0)) || 0;
  if (fails >= MAX_FAILS) {
    return json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  let body;
  try { body = await request.json(); } catch { return badRequest("invalid body"); }
  const { username, password } = body || {};
  if (!username || !password) return badRequest("username and password required");

  const okUser = username === env.AUTH_USER;
  const okPass = okUser && (await verifyPassword(password, env.AUTH_PASSWORD_HASH || ""));

  if (!okUser || !okPass) {
    await env.KV.put(failKey, String(fails + 1), { expirationTtl: WINDOW_SECONDS });
    await logIssue(env, `failed login for '${username}' from ${ip}`);
    return json({ error: "Invalid credentials" }, { status: 401 });
  }

  await env.KV.delete(failKey);
  const cookie = await createSessionCookie(username, env.AUTH_SECRET || "");
  return json({ ok: true, user: username }, { headers: { "Set-Cookie": cookie } });
}

async function logIssue(env, message) {
  try {
    const issues = (await kvJSON(env, "issues", [])) || [];
    issues.unshift({ at: new Date().toISOString(), script: "login", message, level: "warning" });
    await kvPut(env, "issues", issues.slice(0, 200));
  } catch {}
}

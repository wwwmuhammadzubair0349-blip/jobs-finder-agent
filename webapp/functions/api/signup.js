// POST /api/signup { email, password } — create an account, then the user logs
// in on the next screen. No email verification (by design).
import { hashPassword } from "../_shared/auth.js";
import { one, run, uuid, connectionCode, nowIso, DEFAULT_PROFILE, DEFAULT_SEARCH, DEFAULT_SETTINGS } from "../_shared/db.js";
import { json, badRequest, rateLimit, clientIp } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const ip = clientIp(request);
  // Bot / abuse guard: max 5 new accounts per IP per hour.
  if (!(await rateLimit(env, `signup:${ip}`, 5, 3600))) {
    return json({ error: "Too many sign-ups from this network. Try again later." }, { status: 429 });
  }

  let body;
  try { body = await request.json(); } catch { return badRequest("invalid body"); }
  // Honeypot: real users never fill this hidden field; bots do.
  if ((body.website || body.hp || "").trim()) return json({ ok: true });
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) return badRequest("Enter a valid email");
  if (password.length < 6) return badRequest("Password must be at least 6 characters");
  if (password.length > 200) return badRequest("Password is too long");

  const existing = await one(env, "SELECT id FROM users WHERE email = ?", email);
  if (existing) return json({ error: "An account with this email already exists" }, { status: 409 });

  const id = uuid();
  const hash = await hashPassword(password);
  let code = connectionCode();
  // ensure code uniqueness
  for (let i = 0; i < 3; i++) {
    const clash = await one(env, "SELECT id FROM users WHERE connection_code = ?", code);
    if (!clash) break;
    code = connectionCode();
  }
  const isAdmin = email === (env.ADMIN_EMAIL || "").trim().toLowerCase() ? 1 : 0;

  await run(env,
    "INSERT INTO users (id, email, password_hash, connection_code, is_admin, plan, status, created_at, last_active) VALUES (?,?,?,?,?,?,?,?,?)",
    id, email, hash, code, isAdmin, "free", "active", nowIso(), nowIso());

  const profile = { ...DEFAULT_PROFILE, email };
  await run(env, "INSERT INTO configs (user_id, profile, search, settings) VALUES (?,?,?,?)",
    id, JSON.stringify(profile), JSON.stringify(DEFAULT_SEARCH), JSON.stringify(DEFAULT_SETTINGS));

  return json({ ok: true });
}

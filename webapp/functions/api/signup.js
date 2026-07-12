// POST /api/signup { email, password } — create an account, then the user logs
// in on the next screen. No email verification (by design).
import { hashPassword } from "../_shared/auth.js";
import { one, run, uuid, connectionCode, nowIso, DEFAULT_PROFILE, DEFAULT_SEARCH, DEFAULT_SETTINGS } from "../_shared/db.js";
import { json, badRequest, rateLimit, clientIp } from "../_shared/kv.js";
import { verifyTurnstile } from "../_shared/turnstile.js";

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
  // Human check (Cloudflare Turnstile). No-op until keys are configured.
  if (!(await verifyTurnstile(env, body.turnstile || body.cfToken, ip))) {
    return json({ error: "Please complete the human verification and try again." }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) return badRequest("Enter a valid email");
  if (password.length < 8) return badRequest("Password must be at least 8 characters");
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
  // Admin bootstrap: grant admin to ADMIN_EMAIL ONLY while no admin exists yet.
  // The support email is shown publicly, so without the "no admin yet" guard a
  // stranger could register it and mint a second admin. Once the real owner's
  // account exists, this can never grant admin again.
  let isAdmin = 0;
  const adminEmail = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (adminEmail && email === adminEmail) {
    const existingAdmin = await one(env, "SELECT id FROM users WHERE is_admin = 1 LIMIT 1");
    if (!existingAdmin) isAdmin = 1;
  }

  await run(env,
    "INSERT INTO users (id, email, password_hash, connection_code, is_admin, plan, status, created_at, last_active) VALUES (?,?,?,?,?,?,?,?,?)",
    id, email, hash, code, isAdmin, "free", "active", nowIso(), nowIso());

  const profile = { ...DEFAULT_PROFILE, email };
  await run(env, "INSERT INTO configs (user_id, profile, search, settings) VALUES (?,?,?,?)",
    id, JSON.stringify(profile), JSON.stringify(DEFAULT_SEARCH), JSON.stringify(DEFAULT_SETTINGS));

  return json({ ok: true });
}

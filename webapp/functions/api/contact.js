// POST /api/contact — public: store a contact-form message for the admin panel.
import { run, uuid, nowIso } from "../_shared/db.js";
import { json, badRequest, rateLimit, clientIp } from "../_shared/kv.js";
import { verifyTurnstile } from "../_shared/turnstile.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const ip = clientIp(request);
  if (!(await rateLimit(env, `contact:${ip}`, 5, 3600))) {
    return json({ ok: false, message: "Too many messages — please try again later." }, { status: 429 });
  }
  let b;
  try { b = await request.json(); } catch { return badRequest("invalid json"); }
  if ((b?.website || b?.hp || "").trim()) return json({ ok: true }); // honeypot
  // Human check (Cloudflare Turnstile). No-op until keys are configured.
  if (!(await verifyTurnstile(env, b?.turnstile || b?.cfToken, ip))) {
    return json({ ok: false, message: "Please complete the human verification and try again." }, { status: 400 });
  }

  const name = String(b?.name || "").trim().slice(0, 80);
  const email = String(b?.email || "").trim().slice(0, 120);
  const message = String(b?.message || "").trim().slice(0, 2000);
  if (!name || !email || !message) return json({ ok: false, message: "Please fill in every field." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, message: "Please enter a valid email." }, { status: 400 });

  try {
    await run(env,
      "INSERT INTO contact_messages (id, name, email, message, created_at, handled) VALUES (?,?,?,?,?,0)",
      uuid(), name, email, message, nowIso());
  } catch {
    return json({ ok: false, message: "Something went wrong — please email us instead." }, { status: 500 });
  }
  return json({ ok: true });
}

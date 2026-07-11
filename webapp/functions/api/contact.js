// POST /api/contact — public: store a contact-form message for the admin panel.
import { run, uuid, nowIso } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  let b;
  try { b = await request.json(); } catch { return badRequest("invalid json"); }

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

// GET  /api/admin-contacts        → list contact-form messages (admin only)
// POST /api/admin-contacts {id}    → mark a message handled (admin only)
import { all, run } from "../_shared/db.js";
import { json, unauthorized } from "../_shared/kv.js";

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!data.isAdmin) return unauthorized();
  const rows = await all(env,
    "SELECT id, name, email, message, created_at, handled FROM contact_messages ORDER BY created_at DESC LIMIT 200");
  return json({ messages: rows });
}

export async function onRequestPost(context) {
  const { env, data, request } = context;
  if (!data.isAdmin) return unauthorized();
  let b;
  try { b = await request.json(); } catch { return json({ ok: false }, { status: 400 }); }
  if (!b?.id) return json({ ok: false }, { status: 400 });
  await run(env, "UPDATE contact_messages SET handled = 1 WHERE id = ?", b.id);
  return json({ ok: true });
}

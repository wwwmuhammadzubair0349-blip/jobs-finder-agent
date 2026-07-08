// POST /api/logout — clears the session cookie.
import { clearCookie } from "../_shared/auth.js";
import { json } from "../_shared/kv.js";

export async function onRequestPost() {
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
}

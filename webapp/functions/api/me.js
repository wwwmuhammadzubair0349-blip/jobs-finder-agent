// GET /api/me — who am I (used by the SPA to check the session on load).
import { json } from "../_shared/kv.js";

export async function onRequestGet(context) {
  return json({ user: context.data.user });
}

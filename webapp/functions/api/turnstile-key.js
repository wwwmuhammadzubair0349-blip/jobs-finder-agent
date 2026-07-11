// GET /api/turnstile-key — returns the PUBLIC Turnstile site key (safe to expose).
// Empty string when not configured, which tells the frontend to skip the widget.
import { json } from "../_shared/kv.js";

export async function onRequestGet(context) {
  return json({ key: context.env.TURNSTILE_SITEKEY || "" });
}

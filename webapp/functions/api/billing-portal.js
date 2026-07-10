// GET /api/billing-portal → returns a fresh Lemon Squeezy customer-portal URL
// for the current user's subscription (manage / cancel / update card).
import { one } from "../_shared/db.js";
import { json } from "../_shared/kv.js";
import { LS_API, lsConfigured, lsHeaders } from "../_shared/billing.js";

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!lsConfigured(env)) return json({ ok: false, error: "billing_unconfigured" }, { status: 503 });
  const u = await one(env, "SELECT ls_subscription_id FROM users WHERE id = ?", data.userId);
  if (!u?.ls_subscription_id) return json({ ok: false, error: "no_subscription" }, { status: 404 });

  try {
    const r = await fetch(`${LS_API}/subscriptions/${u.ls_subscription_id}`, { headers: lsHeaders(env) });
    const j = await r.json();
    const url = j?.data?.attributes?.urls?.customer_portal;
    if (!url) return json({ ok: false, error: "portal_unavailable" }, { status: 502 });
    return json({ ok: true, url });
  } catch {
    return json({ ok: false, error: "portal_error" }, { status: 502 });
  }
}

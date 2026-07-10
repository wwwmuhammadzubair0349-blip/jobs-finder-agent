// POST /api/billing-webhook — Lemon Squeezy events (public path).
// Verifies the HMAC signature, then activates / downgrades the user's plan.
// User is mapped via custom_data.user_id (set at checkout), falling back to the
// stored subscription id or the billing email.
import { one, run } from "../_shared/db.js";
import { json } from "../_shared/kv.js";
import { verifySignature, variantToPlan } from "../_shared/billing.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const raw = await request.text();
  const sig = request.headers.get("X-Signature") || "";
  if (!(await verifySignature(env.LEMONSQUEEZY_WEBHOOK_SECRET, raw, sig))) {
    return json({ ok: false }, { status: 401 });
  }

  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: true }); }

  const d = body?.data || {};
  if (d.type !== "subscriptions") return json({ ok: true }); // ignore order/invoice events

  const attr = d.attributes || {};
  const subId = String(d.id || "");
  const custId = attr.customer_id != null ? String(attr.customer_id) : null;
  const status = attr.status || "";
  const plan = variantToPlan(env, attr.variant_id);
  const uid = body?.meta?.custom_data?.user_id || null;

  // Resolve the account this event belongs to.
  let user = null;
  if (uid) user = await one(env, "SELECT id FROM users WHERE id = ?", uid);
  if (!user && subId) user = await one(env, "SELECT id FROM users WHERE ls_subscription_id = ?", subId);
  if (!user && attr.user_email) user = await one(env, "SELECT id FROM users WHERE lower(email) = lower(?)", attr.user_email);
  if (!user) return json({ ok: true });

  const active = status === "active" || status === "on_trial";
  const cancelled = status === "cancelled";                 // valid until ends_at
  const dead = ["expired", "unpaid", "paused"].includes(status);

  if (active && plan) {
    await run(env,
      "UPDATE users SET plan = ?, plan_expires_at = ?, ls_subscription_id = ?, ls_customer_id = COALESCE(?, ls_customer_id) WHERE id = ?",
      plan, attr.renews_at || attr.ends_at || null, subId, custId, user.id);
  } else if (cancelled && plan) {
    await run(env,
      "UPDATE users SET plan = ?, plan_expires_at = ?, ls_subscription_id = ?, ls_customer_id = COALESCE(?, ls_customer_id) WHERE id = ?",
      plan, attr.ends_at || attr.renews_at || null, subId, custId, user.id);
  } else if (dead) {
    await run(env, "UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = ?", user.id);
  }

  return json({ ok: true });
}

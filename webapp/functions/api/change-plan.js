// POST /api/change-plan { plan } — switch an EXISTING subscriber to another
// paid plan by updating their Lemon Squeezy subscription (no new checkout).
//  - Upgrade   → immediate, prorated charge now.
//  - Downgrade → scheduled for end of the current period (no refund/credit;
//                benefits kept until the paid period ends — see the webhook).
import { one } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";
import { LS_API, lsConfigured, lsHeaders, planToVariant, planRank } from "../_shared/billing.js";

export async function onRequestPost(context) {
  const { env, data, request } = context;
  if (!lsConfigured(env)) return json({ ok: false, error: "billing_unconfigured" }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return badRequest("invalid json"); }
  const plan = (body?.plan || "").toLowerCase();
  const variant = planToVariant(env, plan);
  if (!variant) return badRequest("unknown or unpurchasable plan");

  const u = await one(env, "SELECT plan, ls_subscription_id FROM users WHERE id = ?", data.userId);
  if (!u?.ls_subscription_id) return json({ ok: false, error: "no_subscription" }, { status: 409 });
  if ((u.plan || "").toLowerCase() === plan) return json({ ok: true, unchanged: true });

  const upgrade = planRank(plan) > planRank(u.plan);
  const attributes = { variant_id: Number(variant) };
  if (upgrade) {
    attributes.invoice_immediately = true;         // charge the prorated difference now
  } else {
    attributes.disable_prorations = true;          // no refund/credit
    attributes.invoice_immediately = false;        // bill the lower price from next period
  }

  const payload = { data: { type: "subscriptions", id: String(u.ls_subscription_id), attributes } };
  try {
    const r = await fetch(`${LS_API}/subscriptions/${u.ls_subscription_id}`, {
      method: "PATCH", headers: lsHeaders(env), body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return json({ ok: false, error: "change_failed", detail: j?.errors?.[0]?.detail || null }, { status: 502 });
    }
    return json({ ok: true, direction: upgrade ? "upgrade" : "downgrade" });
  } catch {
    return json({ ok: false, error: "change_error" }, { status: 502 });
  }
}

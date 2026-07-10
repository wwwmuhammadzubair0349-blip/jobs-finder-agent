// POST /api/checkout { plan } → creates a Lemon Squeezy checkout for the
// current user and returns its URL. The user's id is embedded as custom data
// so the webhook can activate the right account after payment.
import { json, badRequest } from "../_shared/kv.js";
import { LS_API, lsConfigured, lsHeaders, planToVariant } from "../_shared/billing.js";

export async function onRequestPost(context) {
  const { env, data, request } = context;
  if (!lsConfigured(env)) return json({ ok: false, error: "billing_unconfigured", message: "Checkout isn't set up yet." }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return badRequest("invalid json"); }
  const plan = (body?.plan || "").toLowerCase();
  const variant = planToVariant(env, plan);
  if (!variant) return badRequest("unknown or unpurchasable plan");

  const email = data.authUser?.email || "";
  const dash = env.DASHBOARD_URL || "https://jobs-finder-dashboard.pages.dev";

  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email,
          custom: { user_id: String(data.userId) },
        },
        product_options: {
          redirect_url: `${dash}/?upgraded=1`,
          enabled_variants: [Number(variant)],
        },
        checkout_options: { embed: false, dark: true },
      },
      relationships: {
        store: { data: { type: "stores", id: String(env.LEMONSQUEEZY_STORE_ID) } },
        variant: { data: { type: "variants", id: String(variant) } },
      },
    },
  };

  try {
    const r = await fetch(`${LS_API}/checkouts`, { method: "POST", headers: lsHeaders(env), body: JSON.stringify(payload) });
    const j = await r.json();
    const url = j?.data?.attributes?.url;
    if (!r.ok || !url) return json({ ok: false, error: "checkout_failed", detail: j?.errors?.[0]?.detail || null }, { status: 502 });
    return json({ ok: true, url });
  } catch (e) {
    return json({ ok: false, error: "checkout_error" }, { status: 502 });
  }
}

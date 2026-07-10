// Lemon Squeezy billing helpers (shared by checkout + webhook + portal).
// Everything is config-driven: with no LEMONSQUEEZY_* env set, lsConfigured()
// is false and the endpoints return a friendly "not configured" response.

export const LS_API = "https://api.lemonsqueezy.com/v1";

export function lsConfigured(env) {
  return !!(env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID);
}

export function lsHeaders(env) {
  return {
    Authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

// plan id -> Lemon Squeezy variant id (from env). Free has no variant.
export function planToVariant(env, plan) {
  const map = {
    starter: env.LEMONSQUEEZY_VARIANT_STARTER,
    pro: env.LEMONSQUEEZY_VARIANT_PRO,
    proplus: env.LEMONSQUEEZY_VARIANT_PROPLUS,
  };
  return map[(plan || "").toLowerCase()] || null;
}

// Lemon Squeezy variant id -> our plan id (reverse of the above).
export function variantToPlan(env, variantId) {
  const v = String(variantId || "");
  if (v && v === String(env.LEMONSQUEEZY_VARIANT_STARTER)) return "starter";
  if (v && v === String(env.LEMONSQUEEZY_VARIANT_PRO)) return "pro";
  if (v && v === String(env.LEMONSQUEEZY_VARIANT_PROPLUS)) return "proplus";
  return null;
}

// Verify the webhook HMAC-SHA256 signature (hex) against the raw body.
export async function verifySignature(secret, rawBody, signatureHex) {
  if (!secret || !signatureHex) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const bytes = new Uint8Array(sig);
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    // constant-time-ish compare
    if (hex.length !== signatureHex.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

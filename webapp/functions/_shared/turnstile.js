// Cloudflare Turnstile — human verification for public forms (signup/login/contact).
// Fails OPEN when TURNSTILE_SECRET is not configured, so the app keeps working
// before you create the widget keys. Once the secret is set, a valid token is
// required. Site key is public and served via /api/turnstile-key.
export async function verifyTurnstile(env, token, ip) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return true; // not configured yet → don't block anyone
  if (!token || typeof token !== "string") return false;
  try {
    const form = new URLSearchParams();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const out = await r.json();
    return out.success === true;
  } catch {
    return false; // network/parse failure → treat as unverified
  }
}

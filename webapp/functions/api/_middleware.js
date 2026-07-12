// Guards every /api/* route except public ones. Verifies the signed session,
// loads the user from D1, and resolves the "effective" user id (supporting the
// admin "switch to user" impersonation).
import { verifySession } from "../_shared/auth.js";
import { one } from "../_shared/db.js";
import { unauthorized, json } from "../_shared/kv.js";

const PUBLIC_PATHS = ["/api/login", "/api/signup", "/api/logout", "/api/telegram", "/api/telegram-interview", "/api/telegram-autoapply", "/api/pool", "/api/setup-webhooks", "/api/billing-webhook", "/api/contact", "/api/turnstile-key"];

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  if (PUBLIC_PATHS.includes(url.pathname)) return next();

  // CSRF defense-in-depth: for cookie-authenticated mutating requests, reject a
  // cross-site Origin. Same-origin browser fetches send Origin = our host;
  // server-to-server callers (already excluded above) send none. Combined with
  // the SameSite=Lax cookie this makes cross-site state change infeasible.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("Origin");
    if (origin) {
      let ok = false;
      try { ok = new URL(origin).host === url.host; } catch { ok = false; }
      if (!ok) return json({ error: "cross-origin request blocked" }, { status: 403 });
    }
  }

  const session = await verifySession(request, env.AUTH_SECRET || "");
  if (!session?.uid) return unauthorized();

  const user = await one(env, "SELECT * FROM users WHERE id = ?", session.uid);
  if (!user || user.status === "disabled") return unauthorized();

  data.session = session;
  data.authUser = user;                       // the logged-in account
  data.isAdmin = user.is_admin === 1;
  // Admin can impersonate another user via session.imp.
  data.userId = (data.isAdmin && session.imp) ? session.imp : user.id;
  data.impersonating = data.isAdmin && session.imp ? session.imp : null;

  // touch last_active (best-effort, non-blocking)
  context.waitUntil?.(env.DB.prepare("UPDATE users SET last_active = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run().catch(() => {}));

  return next();
}

// Guards every /api/* route except login/logout. Verifies the signed session
// cookie and attaches the username to data.user for downstream handlers.
import { verifySession } from "../_shared/auth.js";
import { unauthorized } from "../_shared/kv.js";

const PUBLIC_PATHS = ["/api/login", "/api/logout"];

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  if (PUBLIC_PATHS.includes(url.pathname)) {
    return next();
  }

  const secret = env.AUTH_SECRET || "";
  const user = await verifySession(request, secret);
  if (!user) return unauthorized();

  data.user = user;
  return next();
}

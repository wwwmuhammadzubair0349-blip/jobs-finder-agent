// Self-built auth: PBKDF2 password verification + signed HttpOnly cookie.
// Runs on the Cloudflare Workers runtime (Web Crypto / SubtleCrypto).

const COOKIE_NAME = "jf_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const enc = new TextEncoder();

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(str);
}

// ---- password (pbkdf2$<iter>$<saltB64>$<hashB64>) --------------------------
export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = parseInt(iterStr, 10);
    const salt = b64ToBytes(saltB64);
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      key,
      256
    );
    const got = bytesToB64(new Uint8Array(bits));
    return timingSafeEqual(got, hashB64);
  } catch {
    return false;
  }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- signed cookie ---------------------------------------------------------
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToB64(new Uint8Array(sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSessionCookie(session, secret, opts = {}) {
  // session: { uid, email, admin, imp } — imp = impersonated user id (admin only)
  // opts.remember (default true): persistent 30-day cookie; false → browser-session
  // cookie that dies on close (payload still hard-expires after 24h).
  const remember = opts.remember !== false;
  const ttlMs = remember ? COOKIE_MAX_AGE * 1000 : 24 * 3600 * 1000;
  const payload = JSON.stringify({ ...session, exp: Date.now() + ttlMs });
  const body = b64url(payload);
  const sig = await hmac(secret, body);
  const value = `${body}.${sig}`;
  const maxAge = remember ? `; Max-Age=${COOKIE_MAX_AGE}` : "";
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/${maxAge}`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function verifySession(request, secret) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const [body, sig] = match[1].split(".");
  if (!body || !sig) return null;
  const expected = await hmac(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload; // { uid, email, admin, imp, exp }
  } catch {
    return null;
  }
}

// Create a PBKDF2 hash (for signup). Mirrors verifyPassword's format.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const iterations = 100000; // capped by Cloudflare's per-request CPU budget (higher 500s)
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256
  );
  return `pbkdf2$${iterations}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`;
}

export { COOKIE_NAME };

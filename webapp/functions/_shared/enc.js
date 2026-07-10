// AES-256-GCM for stored secrets. Key = SHA-256(AUTH_SECRET).
// Format: base64(iv[12] + ciphertext). Byte-compatible with scripts/enc.py.

async function key(secret) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(plain, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await key(secret);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  let bin = ""; for (const b of out) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function decrypt(token, secret) {
  const bin = atob(token);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  const k = await key(secret);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, k, raw.slice(12));
  return new TextDecoder().decode(pt);
}

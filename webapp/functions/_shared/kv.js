// KV helpers + JSON responses for Pages Functions. `env.KV` is the binding.

export async function kvJSON(env, key, fallback = null) {
  try {
    const val = await env.KV.get(key);
    if (val === null || val === undefined) return fallback;
    try { return JSON.parse(val); } catch { return val; }
  } catch {
    return fallback;
  }
}

export async function kvPut(env, key, value) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  await env.KV.put(key, body);
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(init.headers || {}) },
  });
}

export function badRequest(msg) {
  return json({ error: msg }, { status: 400 });
}
export function unauthorized() {
  return json({ error: "unauthorized" }, { status: 401 });
}

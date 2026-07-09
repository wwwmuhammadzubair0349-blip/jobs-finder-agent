// GET /api/cv?k=<kv-key> — stream a stored CV/cover PDF (or text) from KV.
// Ownership enforced: the key must belong to one of the effective user's jobs.
import { one } from "../_shared/db.js";

export async function onRequestGet(context) {
  const { env, data, request } = context;
  const key = new URL(request.url).searchParams.get("k");
  if (!key) return new Response("missing key", { status: 400 });

  const owned = await one(env,
    "SELECT id FROM user_jobs WHERE user_id = ? AND (cv_key = ? OR cover_key = ? OR cv_txt_key = ?)",
    data.userId, key, key, key);
  if (!owned) return new Response("not found", { status: 404 });

  const buf = await env.KV.get(key, { type: "arrayBuffer" });
  if (!buf) return new Response("not found", { status: 404 });

  const isText = key.endsWith(":txt");
  const isCover = key.includes(":cover");
  const fname = key.split(":").slice(1, 2)[0] || "document";
  return new Response(buf, {
    headers: {
      "Content-Type": isText ? "text/plain; charset=utf-8" : "application/pdf",
      "Content-Disposition": `inline; filename="${fname}${isCover ? "_CoverLetter" : "_CV"}.${isText ? "txt" : "pdf"}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

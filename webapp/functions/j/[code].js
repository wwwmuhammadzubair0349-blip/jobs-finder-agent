// GET /j/:code — short link → 301 to the full SEO job page (/jobs/<slug>).
// code = the 8-char unique suffix of the job slug. Keeps WhatsApp/SMS shares tiny.
export async function onRequestGet(context) {
  const { env, params, request } = context;
  const code = (params.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = new URL(request.url).origin;
  if (!code) return Response.redirect(`${base}/`, 302);

  let row = null;
  try {
    row = await env.DB.prepare("SELECT slug FROM job_pool WHERE slug LIKE '%-' || ? LIMIT 1").bind(code).first();
  } catch {}

  if (row?.slug) {
    return Response.redirect(`${base}/jobs/${row.slug}`, 301);
  }
  return Response.redirect(`${base}/`, 302);
}

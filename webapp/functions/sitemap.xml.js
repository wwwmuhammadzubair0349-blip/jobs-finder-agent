// GET /sitemap.xml — homepage + every live job landing page.
export async function onRequestGet(context) {
  const { env, request } = context;
  const base = new URL(request.url).origin;
  let rows = [];
  try {
    const r = await env.DB.prepare(
      "SELECT slug, discovered_at FROM job_pool WHERE slug IS NOT NULL AND slug != '' ORDER BY discovered_at DESC LIMIT 1000"
    ).all();
    rows = r.results || [];
  } catch {}

  const items = rows.map((u) =>
    `<url><loc>${base}/jobs/${xml(u.slug)}</loc>${u.discovered_at ? `<lastmod>${u.discovered_at.slice(0, 10)}</lastmod>` : ""}<changefreq>weekly</changefreq></url>`
  ).join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>` +
    items + `</urlset>`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

function xml(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

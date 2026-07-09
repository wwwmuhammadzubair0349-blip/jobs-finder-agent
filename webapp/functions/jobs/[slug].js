// GET /jobs/:slug — PUBLIC server-rendered job landing page.
// Full SEO: unique title/meta description, OG/Twitter tags, canonical URL,
// and JSON-LD JobPosting schema (Google Jobs indexable). Branded, with a
// signup CTA — every shared job is a marketing landing page.

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const slug = params.slug || "";
  const base = new URL(request.url).origin;

  let job = null;
  try {
    job = await env.DB.prepare(
      "SELECT slug, title, company, location, remote, salary, posted_at, url, description, discovered_at FROM job_pool WHERE slug = ?"
    ).bind(slug).first();
  } catch {}

  if (!job) return notFound(base);

  const title = `${job.title} at ${job.company || "—"} — Jobs Finder`;
  const descRaw = (job.description || `${job.title} position at ${job.company} in ${job.location}.`).replace(/\s+/g, " ").trim();
  const metaDesc = esc(descRaw.slice(0, 158));
  const canonical = `${base}/jobs/${esc(slug)}`;
  const posted = (job.posted_at || job.discovered_at || "").slice(0, 10);

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: descRaw.slice(0, 1500),
    datePosted: posted || undefined,
    hiringOrganization: { "@type": "Organization", name: job.company || "Unknown" },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location || "" } },
    ...(job.remote ? { jobLocationType: "TELECOMMUTE" } : {}),
    ...(job.salary ? { baseSalary: { "@type": "MonetaryAmount", value: { "@type": "QuantitativeValue", value: job.salary } } } : {}),
    directApply: false,
    url: canonical,
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${metaDesc}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Jobs Finder" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${metaDesc}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${metaDesc}" />
<meta name="theme-color" content="#0b0a1e" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234F46E5'/%3E%3Cstop offset='1' stop-color='%238B5CF6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='15' fill='url(%23g)'/%3E%3Ctext x='32' y='43' font-family='Arial' font-size='27' font-weight='800' fill='white' text-anchor='middle'%3EJF%3C/text%3E%3C/svg%3E" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  :root{--bg:#f4f5fa;--surface:#fff;--ink:#101223;--ink2:#3c4258;--muted:#6e7590;--hair:#e4e7f2;--accent:#4f46e5;--grad:linear-gradient(135deg,#4f46e5,#8b5cf6)}
  @media(prefers-color-scheme:dark){:root{--bg:#0a0c14;--surface:#131624;--ink:#eef0fa;--ink2:#c4c9dc;--muted:#8a91ac;--hair:#232840;--accent:#818cf8}}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  .strip{height:3px;background:var(--grad)}
  .wrap{max-width:680px;margin:0 auto;padding:22px 18px 60px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;margin-bottom:26px}
  .brand a{color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:10px}
  .mark{width:32px;height:32px;border-radius:10px;background:var(--grad);color:#fff;display:grid;place-items:center;font-size:13px;font-weight:800}
  .card{background:var(--surface);border:1px solid var(--hair);border-radius:18px;padding:24px;box-shadow:0 6px 24px rgba(21,23,43,.07)}
  h1{font-size:24px;letter-spacing:-.5px;margin:0 0 6px;text-wrap:balance}
  .sub{color:var(--muted);font-size:15px;margin-bottom:14px}
  .chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px}
  .chip{font-size:12.5px;padding:4px 11px;border-radius:9px;border:1px solid var(--hair);color:var(--ink2)}
  .desc{color:var(--ink2);font-size:14.5px;white-space:pre-wrap;margin-bottom:22px}
  .btn{display:inline-block;text-decoration:none;text-align:center;padding:13px 22px;border-radius:12px;font-weight:650;font-size:15px}
  .btn.primary{background:var(--grad);color:#fff;box-shadow:0 4px 16px rgba(79,70,229,.35)}
  .btn.ghost{border:1px solid var(--hair);color:var(--ink);margin-left:8px}
  .cta{margin-top:26px;background:linear-gradient(135deg,#0b0a1e,#1b1740);border-radius:18px;padding:24px;color:#fff}
  .cta h2{margin:0 0 6px;font-size:19px}
  .cta p{margin:0 0 16px;color:rgba(255,255,255,.65);font-size:14px}
  .cta .btn{background:#fff;color:#1b1740}
  .foot{text-align:center;color:var(--muted);font-size:12.5px;margin-top:28px}
  .foot a{color:var(--accent);text-decoration:none}
</style>
</head>
<body>
<div class="strip"></div>
<div class="wrap">
  <div class="brand"><a href="${base}/"><span class="mark">JF</span>Jobs Finder<span style="color:var(--accent)">.</span></a></div>
  <div class="card">
    <h1>${esc(job.title)}</h1>
    <div class="sub">${esc(job.company || "")}${job.location ? " · " + esc(job.location) : ""}</div>
    <div class="chips">
      ${job.remote ? '<span class="chip">🌍 Remote</span>' : ""}
      ${job.salary ? `<span class="chip">💰 ${esc(job.salary)}</span>` : ""}
      ${posted ? `<span class="chip">📅 Posted ${esc(posted)}</span>` : ""}
    </div>
    <div class="desc">${esc(descRaw.slice(0, 1300))}${descRaw.length > 1300 ? "…" : ""}</div>
    ${job.url ? `<a class="btn primary" href="${esc(job.url)}" rel="nofollow noopener">Apply for this job →</a>` : ""}
  </div>

  <div class="cta">
    <h2>Want a CV tailored to this exact job — free?</h2>
    <p>Jobs Finder matches jobs to your profile and auto-writes an ATS-friendly CV + cover letter for each one, delivered to your Telegram.</p>
    <a class="btn" href="${base}/?job=${esc(slug)}">Get my tailored CV</a>
  </div>

  <div class="foot">More jobs like this, daily → <a href="https://t.me/dailyjobs_feed">@dailyjobs_feed</a> · <a href="${base}/">jobs-finder</a></div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" },
  });
}

function notFound(base) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Job not found — Jobs Finder</title><meta name="robots" content="noindex"></head>
     <body style="font-family:sans-serif;text-align:center;padding:80px 20px;background:#f4f5fa;color:#101223">
     <div style="font-size:40px">🕵️</div><h1 style="letter-spacing:-.5px">This job has expired</h1>
     <p style="color:#6e7590">Jobs are kept fresh — this one is no longer available.</p>
     <a href="${base}/" style="display:inline-block;margin-top:10px;padding:12px 22px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#8b5cf6);color:#fff;text-decoration:none;font-weight:650">Find fresh jobs →</a>
     </body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

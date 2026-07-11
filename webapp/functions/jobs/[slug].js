// GET /jobs/:slug — PUBLIC server-rendered job landing page (full SEO +
// JSON-LD JobPosting). "Apply now" routes to signup — public visitors create
// an account to apply and get a tailored CV.
import { shell, BRAND, esc } from "../_shared/page.js";

function initials(name) {
  const w = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase() || "•";
}

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const slug = params.slug || "";
  const base = new URL(request.url).origin;

  let job = null;
  try {
    job = await env.DB.prepare(
      "SELECT slug, title, company, location, remote, salary, posted_at, url, description, source, discovered_at FROM job_pool WHERE slug = ?"
    ).bind(slug).first();
  } catch {}

  if (!job) {
    return new Response(shell({
      base, noindex: true, title: `Job not found — ${BRAND.name}`,
      description: "This job is no longer available.",
      hero: { eyebrow: "Jobs", title: "This job has expired" },
      body: `<div class="wrap"><div class="card" style="text-align:center"><p>Jobs are kept fresh — this one is no longer available.</p><a class="btn primary big" href="${base}/jobs">Browse fresh jobs →</a></div></div>`,
    }), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const descRaw = (job.description || `${job.title} position at ${job.company} in ${job.location}.`).replace(/\s+/g, " ").trim();
  const metaDesc = descRaw.slice(0, 158);
  const posted = (job.posted_at || job.discovered_at || "").slice(0, 10);

  const jsonLd = {
    "@context": "https://schema.org/", "@type": "JobPosting", title: job.title,
    description: descRaw.slice(0, 1500), datePosted: posted || undefined,
    hiringOrganization: { "@type": "Organization", name: job.company || "Unknown" },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location || "" } },
    ...(job.remote ? { jobLocationType: "TELECOMMUTE" } : {}),
    ...(job.salary ? { baseSalary: { "@type": "MonetaryAmount", value: { "@type": "QuantitativeValue", value: job.salary } } } : {}),
    directApply: false, url: `${base}/jobs/${slug}`,
  };

  const body = `
<div class="wrap" style="max-width:820px">
  <div class="card">
    <div class="jc-top" style="margin-bottom:14px">
      <div class="jc-logo" style="width:52px;height:52px;font-size:18px">${esc(initials(job.company))}</div>
      <div style="flex:1">
        <h2 style="margin:0;font-size:22px">${esc(job.title)}</h2>
        <div class="jc-sub" style="font-size:14px">${esc(job.company || "")}${job.location ? " · " + esc(job.location) : ""}</div>
      </div>
    </div>
    <div class="jc-tags" style="margin:0 0 18px">
      ${job.remote ? '<span class="jc-tag remote">🌍 Remote</span>' : ""}
      ${job.salary ? `<span class="jc-tag">💰 ${esc(job.salary)}</span>` : ""}
      ${job.source ? `<span class="jc-tag">${esc(job.source)}</span>` : ""}
      ${posted ? `<span class="jc-tag">📅 ${esc(posted)}</span>` : ""}
    </div>
    <p style="white-space:pre-wrap;color:var(--ink2);font-size:14.5px;line-height:1.65">${esc(descRaw.slice(0, 1400))}${descRaw.length > 1400 ? "…" : ""}</p>
    <div class="jc-actions" style="margin-top:20px">
      <a class="btn primary big" href="${base}/?auth=signup">Apply now →</a>
      <a class="btn ghost big" href="${base}/jobs">More jobs</a>
    </div>
  </div>
</div>
<section class="wrap" style="max-width:820px;padding-top:0">
  <div class="ctaband">
    <h2>Want a CV tailored to this exact job — free?</h2>
    <p>Jobs Finder matches jobs to your profile and auto-writes an ATS-friendly CV + cover letter for each, delivered to your Telegram.</p>
    <a class="btn big" href="${base}/?auth=signup">Get my tailored CV →</a>
  </div>
</section>`;

  return new Response(shell({
    base, title: `${esc(job.title)} at ${esc(job.company || "—")} — ${BRAND.name}`,
    description: metaDesc, canonicalPath: `/jobs/${slug}`, active: "jobs",
    headExtra: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    hero: null, body,
  }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
}

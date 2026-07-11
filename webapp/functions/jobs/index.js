// GET /jobs — PUBLIC browse page: premium job cards. "Apply now" routes to
// signup (public users must create an account to apply). Optional ?q= filter.
import { shell, BRAND, esc, cleanText } from "../_shared/page.js";

function initials(name) {
  const w = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase() || "•";
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const base = url.origin;
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60);

  let rows = [];
  try {
    const sql = "SELECT slug, title, company, location, remote, salary, source, description FROM job_pool";
    if (q) {
      const like = `%${q}%`;
      rows = (await env.DB.prepare(sql + " WHERE title LIKE ? OR company LIKE ? ORDER BY discovered_at DESC LIMIT 60").bind(like, like).all()).results || [];
    } else {
      rows = (await env.DB.prepare(sql + " ORDER BY discovered_at DESC LIMIT 60").all()).results || [];
    }
  } catch {}

  const cards = rows.map((j) => {
    const snip = cleanText(j.description).slice(0, 120);
    return `<div class="jcard">
      <div class="jc-top">
        <div class="jc-logo">${esc(initials(j.company))}</div>
        <div style="flex:1;min-width:0">
          <a class="jc-title" href="${base}/jobs/${esc(j.slug)}">${esc(cleanText(j.title))}</a>
          <div class="jc-sub">${esc(cleanText(j.company) || "")}${j.location ? " · " + esc(cleanText(j.location)) : ""}</div>
        </div>
      </div>
      <div class="jc-tags">
        ${j.remote ? '<span class="jc-tag remote">🌍 Remote</span>' : ""}
        ${j.salary ? `<span class="jc-tag">💰 ${esc(j.salary)}</span>` : ""}
        ${j.source ? `<span class="jc-tag">${esc(j.source)}</span>` : ""}
      </div>
      ${snip ? `<p class="jc-desc">${esc(snip)}…</p>` : '<p class="jc-desc"></p>'}
      <div class="jc-actions">
        <a class="btn primary" href="${base}/?auth=signup">Apply now →</a>
        <a class="btn ghost" href="${base}/jobs/${esc(j.slug)}">Details</a>
      </div>
    </div>`;
  }).join("") || `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--muted)">No jobs found${q ? ` for "${esc(q)}"` : ""}. Fresh jobs are added around the clock — check back soon.</div>`;

  const body = `
<div class="wrap" style="max-width:1180px">
  <form class="searchbar" method="get" action="${base}/jobs">
    <input name="q" value="${esc(q)}" placeholder="Search job title or company…" />
  </form>
  <div class="jobs-grid">${cards}</div>
</div>
<section class="wrap" style="max-width:1180px;padding-top:0">
  <div class="ctaband">
    <h2>Get jobs matched to <i>you</i> — free</h2>
    <p>We match roles to your profile and write a tailored CV + cover letter for each, delivered to your Telegram.</p>
    <a class="btn big" href="${base}/?auth=signup">Create my free account →</a>
  </div>
</section>`;

  return new Response(shell({
    base, wide: true, active: "jobs",
    title: q ? `${esc(q)} jobs — ${BRAND.name}` : `Browse jobs — ${BRAND.name}`,
    description: `Browse the latest jobs on ${BRAND.name}. Sign up free for matched jobs with an auto-written CV and cover letter.`,
    canonicalPath: "/jobs",
    hero: { eyebrow: "Jobs", title: "Browse fresh jobs", lead: "Roles discovered across the web, updated around the clock. Sign up free to get matches tailored to you — each with an auto-written CV." },
    body,
  }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

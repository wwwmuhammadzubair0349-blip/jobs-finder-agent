// GET /jobs — PUBLIC browse page: latest discovered jobs, each linking to its
// SEO landing page. Optional ?q= keyword filter. Big signup CTA.
import { shell, BRAND, esc } from "../_shared/page.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const base = url.origin;
  const q = (url.searchParams.get("q") || "").trim().slice(0, 60);

  let rows = [];
  try {
    if (q) {
      const like = `%${q}%`;
      rows = (await env.DB.prepare(
        "SELECT slug, title, company, location, remote, salary FROM job_pool WHERE title LIKE ? OR company LIKE ? ORDER BY discovered_at DESC LIMIT 60"
      ).bind(like, like).all()).results || [];
    } else {
      rows = (await env.DB.prepare(
        "SELECT slug, title, company, location, remote, salary FROM job_pool ORDER BY discovered_at DESC LIMIT 60"
      ).all()).results || [];
    }
  } catch {}

  const list = rows.map((j) => `
    <a class="jobrow" href="${base}/jobs/${esc(j.slug)}">
      <div class="t">${esc(j.title)}</div>
      <div class="s">${esc(j.company || "")}${j.location ? " · " + esc(j.location) : ""}</div>
      <div class="chips">
        ${j.remote ? '<span class="chip">🌍 Remote</span>' : ""}
        ${j.salary ? `<span class="chip">💰 ${esc(j.salary)}</span>` : ""}
      </div>
    </a>`).join("") || `<p class="muted">No jobs found${q ? ` for "${esc(q)}"` : ""}. Check back soon — fresh jobs are added around the clock.</p>`;

  const body = `
<div class="card">
  <h1>Browse jobs</h1>
  <p class="lead">Fresh roles discovered across the web. Sign up free to get matches tailored to you — each with an auto-written CV & cover letter.</p>
  <form method="get" action="${base}/jobs" style="margin:14px 0">
    <div class="field" style="margin:0"><input name="q" value="${esc(q)}" placeholder="Search job title or company…" /></div>
  </form>
  ${list}
</div>
<div class="card" style="margin-top:18px;text-align:center;background:linear-gradient(135deg,#0b0a1e,#1b1740);color:#fff;border:0">
  <h2 style="margin-top:0;color:#fff">Get jobs matched to <i>you</i> — free</h2>
  <p style="color:rgba(255,255,255,.7)">We match roles to your profile and write a tailored CV + cover letter for each, delivered to your Telegram.</p>
  <a class="btn" style="background:#fff;color:#1b1740" href="${base}/?auth=signup">Create my free account →</a>
</div>`;

  return new Response(shell({
    base, title: q ? `${esc(q)} jobs — ${BRAND.name}` : `Browse jobs — ${BRAND.name}`,
    description: `Browse the latest jobs on ${BRAND.name}. Sign up free for matched jobs with an auto-written CV and cover letter.`,
    body, canonicalPath: "/jobs",
  }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

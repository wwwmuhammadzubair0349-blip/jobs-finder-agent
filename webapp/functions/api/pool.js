// GET /api/pool — PUBLIC: the shared job pool (all users' discovered jobs).
//   ?q=text   filter by title/company/location
//   ?slug=x   fetch one specific job (deep-link target)
import { all, one } from "../_shared/db.js";
import { json } from "../_shared/kv.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const slug = (url.searchParams.get("slug") || "").trim();

  if (slug) {
    const job = await one(env,
      "SELECT id, slug, title, company, location, remote, salary, posted_at, url, source, description FROM job_pool WHERE slug = ?", slug);
    return json({ jobs: job ? [shape(job)] : [] });
  }

  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await all(env,
      `SELECT id, slug, title, company, location, remote, salary, posted_at, url, source, description
         FROM job_pool WHERE title LIKE ? OR company LIKE ? OR location LIKE ?
        ORDER BY discovered_at DESC LIMIT 120`, like, like, like);
  } else {
    rows = await all(env,
      `SELECT id, slug, title, company, location, remote, salary, posted_at, url, source, description
         FROM job_pool ORDER BY discovered_at DESC LIMIT 120`);
  }
  return json({ jobs: rows.map(shape) }, { headers: { "Cache-Control": "public, max-age=180" } });
}

function shape(r) {
  return {
    id: r.id, slug: r.slug, title: r.title, company: r.company, location: r.location,
    remote: !!r.remote, salary: r.salary, posted_at: r.posted_at, url: r.url, source: r.source,
    description: (r.description || "").slice(0, 400),
  };
}

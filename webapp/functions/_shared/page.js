// Shared branded HTML shell for public server-rendered pages
// (contact, privacy, terms, refund, jobs index). Keeps them consistent with
// the /jobs/:slug landing pages.

export const BRAND = {
  name: "Jobs Finder",
  email: "zkafridi317@gmail.com",
  whatsapp: "923044678929",           // wa.me link
  whatsappDisplay: "+92 304 4678929",
  channel: "dailyjobs_feed",
  bot: "jobs_finder_agent_bot",
};

export function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const STYLES = `
:root{--bg:#f4f5fa;--surface:#fff;--ink:#101223;--ink2:#3c4258;--muted:#6e7590;--hair:#e4e7f2;--accent:#4f46e5;--grad:linear-gradient(135deg,#4f46e5,#8b5cf6)}
@media(prefers-color-scheme:dark){:root{--bg:#0a0c14;--surface:#131624;--ink:#eef0fa;--ink2:#c4c9dc;--muted:#8a91ac;--hair:#232840;--accent:#818cf8}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.strip{height:3px;background:var(--grad)}
.nav{max-width:960px;margin:0 auto;padding:16px 18px;display:flex;align-items:center;gap:14px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;color:var(--ink)}
.brand:hover{text-decoration:none}
.mark{width:30px;height:30px;border-radius:9px;background:var(--grad);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800}
.nav .sp{flex:1}
.nav a.link{color:var(--ink2);font-size:14px}
.btn{display:inline-block;text-decoration:none;text-align:center;padding:10px 18px;border-radius:11px;font-weight:650;font-size:14.5px;cursor:pointer;border:0}
.btn:hover{text-decoration:none}
.btn.primary{background:var(--grad);color:#fff;box-shadow:0 4px 16px rgba(79,70,229,.32)}
.btn.ghost{border:1px solid var(--hair);color:var(--ink);background:var(--surface)}
.wrap{max-width:760px;margin:0 auto;padding:26px 18px 48px}
.card{background:var(--surface);border:1px solid var(--hair);border-radius:18px;padding:26px;box-shadow:0 6px 24px rgba(21,23,43,.06)}
h1{font-size:28px;letter-spacing:-.6px;margin:0 0 8px;text-wrap:balance}
h2{font-size:19px;letter-spacing:-.3px;margin:26px 0 8px}
p,li{color:var(--ink2);font-size:14.5px}
.lead{color:var(--muted);margin:0 0 8px}
.foot{border-top:1px solid var(--hair);margin-top:44px}
.foot-in{max-width:960px;margin:0 auto;padding:22px 18px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;color:var(--muted);font-size:13px}
.foot-in .sp{flex:1}
.foot-in a{color:var(--muted);margin-right:14px}
.field{margin:12px 0}
.field label{display:block;font-size:13px;font-weight:600;color:var(--ink);margin-bottom:5px}
.field input,.field textarea{width:100%;padding:11px 13px;border:1px solid var(--hair);border-radius:11px;background:var(--bg);color:var(--ink);font:inherit}
.field textarea{min-height:120px;resize:vertical}
.muted{color:var(--muted)}
.contact-row{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}
.pill{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid var(--hair);border-radius:12px;color:var(--ink);background:var(--surface);font-size:14px}
.ok{color:#16a34a;font-weight:600;margin-top:10px}
.jobrow{display:block;padding:14px 0;border-bottom:1px solid var(--hair);color:var(--ink)}
.jobrow:hover{text-decoration:none}
.jobrow .t{font-weight:650;font-size:15.5px}
.jobrow .s{color:var(--muted);font-size:13.5px;margin-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chip{font-size:12px;padding:3px 9px;border-radius:8px;border:1px solid var(--hair);color:var(--ink2)}
`;

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234F46E5'/%3E%3Cstop offset='1' stop-color='%238B5CF6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='15' fill='url(%23g)'/%3E%3Ctext x='32' y='43' font-family='Arial' font-size='27' font-weight='800' fill='white' text-anchor='middle'%3EJF%3C/text%3E%3C/svg%3E";

// Full page. `body` is inner HTML placed inside <div class="wrap">.
export function shell({ base, title, description, body, canonicalPath = "/", noindex = false }) {
  const canonical = `${base}${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
${noindex ? '<meta name="robots" content="noindex" />' : ""}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${BRAND.name}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta name="twitter:card" content="summary" />
<meta name="theme-color" content="#0b0a1e" />
<link rel="icon" href="${FAVICON}" />
<style>${STYLES}</style>
</head>
<body>
<div class="strip"></div>
<nav class="nav">
  <a class="brand" href="${base}/"><span class="mark">JF</span>${BRAND.name}<span style="color:var(--accent)">.</span></a>
  <span class="sp"></span>
  <a class="link" href="${base}/jobs">Jobs</a>
  <a class="link" href="${base}/#pricing">Pricing</a>
  <a class="btn primary" href="${base}/?auth=signup">Get started</a>
</nav>
<div class="wrap">
${body}
</div>
<footer class="foot"><div class="foot-in">
  <span>© ${new Date().getFullYear()} ${BRAND.name}</span>
  <span class="sp"></span>
  <a href="${base}/jobs">Browse jobs</a>
  <a href="${base}/contact">Contact</a>
  <a href="${base}/privacy">Privacy</a>
  <a href="${base}/terms">Terms</a>
  <a href="${base}/refund">Refunds</a>
  <a href="https://t.me/${BRAND.channel}">Telegram</a>
</div></footer>
</body>
</html>`;
}

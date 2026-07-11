// Shared branded HTML shell for public server-rendered pages
// (contact, privacy, terms, refund, jobs). Premium, consistent with the app.

export const BRAND = {
  name: "Jobs Finder",
  email: "zkafridi317@gmail.com",
  whatsapp: "923044678929",
  whatsappDisplay: "+92 304 4678929",
  channel: "dailyjobs_feed",
  bot: "jobs_finder_agent_bot",
};

export function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Repair mojibake + strip HTML/entities from scraped job text.
export function cleanText(s) {
  if (!s) return "";
  let t = String(s).replace(/�/g, "");
  if (/[ÂÃâ][-¿]/.test(t) && !/[^ -ÿ]/.test(t)) {
    try {
      const b = new Uint8Array(t.length);
      for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 0xff;
      t = new TextDecoder("utf-8", { fatal: false }).decode(b);
    } catch { /* leave */ }
  }
  t = t.replace(/�/g, "").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .replace(/&[a-z]+;/gi, " ").replace(/\s{2,}/g, " ").trim();
  return t;
}

const STYLES = `
:root{--bg:#f4f5fa;--surface:#fff;--surface-2:#f8f9fd;--ink:#101223;--ink2:#3c4258;--muted:#6e7590;--hair:#e4e7f2;--hair2:#d3d8e8;--accent:#4f46e5;--accent2:#8b5cf6;--accent-weak:#eef0ff;--grad:linear-gradient(135deg,#4f46e5,#8b5cf6);--ok:#16a34a;--shadow:0 1px 2px rgba(21,23,43,.05),0 8px 26px rgba(21,23,43,.07);--shadow-lg:0 16px 50px rgba(21,23,43,.16);--display:"Bricolage Grotesque",-apple-system,"Segoe UI",sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0a0c14;--surface:#131624;--surface-2:#171b2c;--ink:#eef0fa;--ink2:#c4c9dc;--muted:#8a91ac;--hair:#232840;--hair2:#2e3552;--accent:#818cf8;--accent2:#a78bfa;--accent-weak:#1d2040;--grad:linear-gradient(135deg,#6366f1,#a78bfa);--shadow:0 1px 2px rgba(0,0,0,.35),0 10px 30px rgba(0,0,0,.4);--shadow-lg:0 18px 56px rgba(0,0,0,.6)}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:radial-gradient(90% 380px at 50% -120px,color-mix(in srgb,var(--accent) 10%,transparent),transparent 70%),var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.strip{height:3px;background:var(--grad)}
h1,h2,h3{font-family:var(--display);letter-spacing:-.5px}

/* Nav */
.nav{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:10px;max-width:1240px;margin:0 auto;padding:15px 24px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px)}
.brand{display:inline-flex;align-items:center;gap:9px;font-family:var(--display);font-weight:800;font-size:18px;color:var(--ink)}
.brand:hover{text-decoration:none}
.mark{width:30px;height:30px;border-radius:9px;background:var(--grad);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800;box-shadow:0 2px 10px color-mix(in srgb,var(--accent) 40%,transparent)}
.nav-links{display:flex;gap:22px;margin-left:28px}
.nav .sp{flex:1}
.nav a.link{color:var(--ink2);font-size:14.5px;font-weight:500}
.nav a.link:hover{color:var(--ink);text-decoration:none}
.nav a.link.on{color:var(--accent)}
@media(max-width:860px){.nav-links{display:none}}
.btn{display:inline-flex;align-items:center;gap:6px;text-decoration:none;text-align:center;padding:9px 16px;border-radius:11px;font-weight:600;font-size:14px;cursor:pointer;border:1px solid var(--hair2);background:var(--surface);color:var(--ink);transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease}
.btn:hover{text-decoration:none;border-color:var(--accent)}
.btn.primary{background:var(--grad);color:#fff;border:0;box-shadow:0 3px 14px color-mix(in srgb,var(--accent) 35%,transparent)}
.btn.primary:hover{transform:translateY(-1px);box-shadow:0 6px 20px color-mix(in srgb,var(--accent) 45%,transparent)}
.btn.ghost{background:transparent}
.btn.big{padding:12px 22px;font-size:15px}

/* Page header */
.phead{max-width:var(--w,820px);margin:0 auto;padding:34px 24px 8px;text-align:center}
.phead .eyebrow{text-transform:uppercase;letter-spacing:1.4px;font-size:12px;font-weight:700;color:var(--accent);margin:0 0 8px}
.phead h1{font-size:clamp(28px,5vw,42px);font-weight:800;margin:0 0 10px;text-wrap:balance}
.phead .lead{color:var(--muted);font-size:16px;max-width:640px;margin:0 auto;line-height:1.6}
.wrap{max-width:var(--w,820px);margin:0 auto;padding:20px 24px 40px}

.card{background:var(--surface);border:1px solid var(--hair);border-radius:20px;padding:28px;box-shadow:var(--shadow)}
.card h2{font-size:20px;margin:26px 0 8px;font-weight:750}.card h2:first-child{margin-top:0}
.card p,.card li{color:var(--ink2);font-size:14.5px}
.card ul{padding-left:20px}
.muted{color:var(--muted)}

/* Contact bits */
.field{margin:12px 0}
.field label{display:block;font-size:13px;font-weight:600;color:var(--ink);margin-bottom:5px}
.field input,.field textarea{width:100%;padding:12px 14px;border:1px solid var(--hair2);border-radius:12px;background:var(--surface-2);color:var(--ink);font:inherit;transition:border-color .15s,box-shadow .15s}
.field input:focus,.field textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak)}
.field textarea{min-height:130px;resize:vertical}
.contact-row{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.pill{display:inline-flex;align-items:center;gap:8px;padding:11px 15px;border:1px solid var(--hair);border-radius:12px;color:var(--ink);background:var(--surface-2);font-size:14px;font-weight:500}
.pill:hover{border-color:var(--accent);text-decoration:none}
.ok{color:var(--ok);font-weight:600;margin-top:12px}

/* Jobs grid */
.jobs-grid{display:grid;gap:16px;grid-template-columns:1fr}
@media(min-width:640px){.jobs-grid{grid-template-columns:1fr 1fr}}
@media(min-width:1000px){.jobs-grid{grid-template-columns:repeat(3,1fr)}}
.jcard{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--hair);border-radius:18px;padding:18px;box-shadow:var(--shadow);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.jcard:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);text-decoration:none}
.jc-top{display:flex;align-items:flex-start;gap:12px}
.jc-logo{width:44px;height:44px;border-radius:12px;background:var(--grad);color:#fff;display:grid;place-items:center;font-family:var(--display);font-weight:800;font-size:16px;flex:none}
.jc-title{font-family:var(--display);font-weight:700;font-size:16px;letter-spacing:-.2px;color:var(--ink);line-height:1.25;text-wrap:balance}
.jc-sub{color:var(--muted);font-size:13px;margin-top:3px}
.jc-tags{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}
.jc-tag{font-size:11.5px;padding:3px 9px;border-radius:8px;background:var(--surface-2);border:1px solid var(--hair);color:var(--ink2)}
.jc-tag.remote{color:#0ea5e9;border-color:color-mix(in srgb,#0ea5e9 30%,var(--hair))}
.jc-desc{color:var(--ink2);font-size:13px;line-height:1.5;margin:0 0 14px;flex:1}
.jc-actions{display:flex;gap:8px;margin-top:auto}
.jc-actions .btn{flex:1;justify-content:center}
.searchbar{max-width:560px;margin:0 auto 26px}
.searchbar input{width:100%;padding:13px 16px;border:1px solid var(--hair2);border-radius:14px;background:var(--surface);color:var(--ink);font:inherit;box-shadow:var(--shadow)}
.searchbar input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak)}

/* CTA band */
.ctaband{position:relative;overflow:hidden;max-width:1180px;margin:24px auto;padding:40px 28px;text-align:center;background:linear-gradient(135deg,#0b0a1e,#241a52);border-radius:24px;color:#fff}
.ctaband h2{font-size:clamp(21px,3.4vw,28px);font-weight:800;margin:0 0 8px}
.ctaband p{color:rgba(255,255,255,.72);margin:0 0 18px}
.ctaband .btn{background:#fff;color:#1b1740;font-weight:700}

/* Footer */
.foot{border-top:1px solid var(--hair);margin-top:40px;background:var(--surface)}
.foot-top{max-width:1180px;margin:0 auto;padding:36px 24px 22px;display:grid;gap:24px;grid-template-columns:1fr}
@media(min-width:720px){.foot-top{grid-template-columns:1.4fr 1fr 1fr}}
.foot-brand .brand{margin-bottom:10px}
.foot-tag{color:var(--muted);font-size:13.5px;max-width:34ch;line-height:1.6}
.foot-col h4{font-family:var(--display);font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:0 0 12px;font-weight:700}
.foot-col a{display:block;color:var(--ink2);font-size:14px;margin-bottom:9px}
.foot-col a:hover{color:var(--accent);text-decoration:none}
.foot-bar{border-top:1px solid var(--hair);max-width:1180px;margin:0 auto;padding:16px 24px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:var(--muted);font-size:13px}
.foot-bar .sp{flex:1}
`;

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234F46E5'/%3E%3Cstop offset='1' stop-color='%238B5CF6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='15' fill='url(%23g)'/%3E%3Ctext x='32' y='43' font-family='Arial' font-size='27' font-weight='800' fill='white' text-anchor='middle'%3EJF%3C/text%3E%3C/svg%3E";

function header(base, active) {
  const on = (k) => (active === k ? " on" : "");
  return `<nav class="nav">
  <a class="brand" href="${base}/"><span class="mark">JF</span>${BRAND.name}<span style="color:var(--accent)">.</span></a>
  <div class="nav-links">
    <a class="link${on("jobs")}" href="${base}/jobs">Jobs</a>
    <a class="link" href="${base}/#how">How it works</a>
    <a class="link" href="${base}/#pricing">Pricing</a>
    <a class="link${on("contact")}" href="${base}/contact">Contact</a>
  </div>
  <span class="sp"></span>
  <a class="btn ghost" href="${base}/?auth=login">Log in</a>
  <a class="btn primary" href="${base}/?auth=signup">Get started</a>
</nav>`;
}

function footer(base) {
  return `<footer class="foot">
  <div class="foot-top">
    <div class="foot-brand">
      <a class="brand" href="${base}/"><span class="mark">JF</span>${BRAND.name}<span style="color:var(--accent)">.</span></a>
      <div class="foot-tag">Your job hunt on autopilot — matched jobs with a tailored CV &amp; cover letter for each, straight to your Telegram.</div>
    </div>
    <div class="foot-col"><h4>Product</h4>
      <a href="${base}/">Home</a>
      <a href="${base}/jobs">Browse jobs</a>
      <a href="${base}/#pricing">Pricing</a>
      <a href="${base}/?auth=signup">Get started</a>
    </div>
    <div class="foot-col"><h4>Company</h4>
      <a href="${base}/contact">Contact</a>
      <a href="${base}/privacy">Privacy</a>
      <a href="${base}/terms">Terms</a>
      <a href="${base}/refund">Refunds</a>
      <a href="https://t.me/${BRAND.channel}" rel="noopener">Telegram</a>
    </div>
  </div>
  <div class="foot-bar"><span>© ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</span><span class="sp"></span><span>Made for job seekers, worldwide 🌍</span></div>
</footer>`;
}

// Full page. `body` is inner HTML. Options: wide (bool), headExtra (string),
// active (nav key), hero ({eyebrow,title,lead}).
export function shell({ base, title, description, body, canonicalPath = "/", noindex = false, wide = false, headExtra = "", active = "", hero = null }) {
  const canonical = `${base}${canonicalPath}`;
  const heroHtml = hero ? `<header class="phead">
    ${hero.eyebrow ? `<p class="eyebrow">${esc(hero.eyebrow)}</p>` : ""}
    <h1>${esc(hero.title)}</h1>
    ${hero.lead ? `<p class="lead">${esc(hero.lead)}</p>` : ""}
  </header>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
${noindex ? '<meta name="robots" content="noindex" />' : ""}
<meta property="og:type" content="website" /><meta property="og:site_name" content="${BRAND.name}" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" /><meta name="twitter:card" content="summary" />
<meta name="theme-color" content="#0b0a1e" />
<link rel="icon" href="${FAVICON}" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&display=swap" rel="stylesheet" />
${headExtra}
<style>${STYLES}${wide ? "\n:root{--w:1180px}" : ""}</style>
</head>
<body>
<div class="strip"></div>
${header(base, active)}
${heroHtml}
${body}
${footer(base)}
</body>
</html>`;
}

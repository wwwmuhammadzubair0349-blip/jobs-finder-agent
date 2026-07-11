// GET /privacy — Privacy Policy.
import { shell, BRAND, esc } from "./_shared/page.js";

export async function onRequestGet(context) {
  const base = new URL(context.request.url).origin;
  const updated = "July 2026";
  const body = `
<div class="card">
  <h1>Privacy Policy</h1>
  <p class="lead">Last updated: ${updated}</p>
  <p>${BRAND.name} ("we", "us") helps you find jobs and prepares tailored CVs, cover letters and interview practice. This policy explains what we collect, why, and your choices.</p>

  <h2>Information we collect</h2>
  <ul>
    <li><b>Account:</b> your email address and a securely hashed password.</li>
    <li><b>Profile you provide:</b> name, contact details, work history, education, skills and job preferences — used to match jobs and write your documents.</li>
    <li><b>Delivery:</b> your Telegram chat ID (once you connect the bot) so we can send you jobs and documents.</li>
    <li><b>Auto-apply (optional):</b> if you enable it, the email address and app password you provide are stored <b>encrypted</b> (AES-256-GCM) and used only to send applications from your own inbox on your behalf. You can remove it at any time.</li>
    <li><b>Usage:</b> jobs matched, documents generated, and feature usage counts (to enforce plan limits).</li>
    <li><b>Billing:</b> handled by our payment provider (Lemon Squeezy). We store your plan and subscription reference, not your card details.</li>
  </ul>

  <h2>How we use it</h2>
  <ul>
    <li>To search for and match jobs to your profile.</li>
    <li>To generate tailored CVs, cover letters and interview practice (text is processed by our AI provider to produce your documents).</li>
    <li>To deliver results to your Telegram and dashboard.</li>
    <li>To auto-apply to jobs only when you explicitly enable it.</li>
    <li>To operate your subscription and enforce plan limits.</li>
  </ul>

  <h2>Service providers</h2>
  <p>We share the minimum necessary with providers that run the service: <b>Cloudflare</b> (hosting, database), <b>Groq</b> (AI text generation), <b>Lemon Squeezy</b> (payments), <b>Telegram</b> (delivery), and job data sources (e.g. Adzuna, Apify and similar). We never sell your personal data.</p>

  <h2>Security</h2>
  <p>Passwords are hashed; sensitive credentials such as your auto-apply app password are encrypted at rest. Access is limited and traffic is served over HTTPS.</p>

  <h2>Retention & your rights</h2>
  <p>We keep your data while your account is active. You can request access, correction or deletion of your data, or delete your account, by contacting us. Deleting your account removes your profile and stored credentials.</p>

  <h2>Contact</h2>
  <p>Questions about privacy? Email <a href="mailto:${BRAND.email}">${esc(BRAND.email)}</a> or WhatsApp ${esc(BRAND.whatsappDisplay)}.</p>
</div>`;
  return new Response(shell({ base, title: `Privacy Policy — ${BRAND.name}`, description: `How ${BRAND.name} collects, uses and protects your data.`, body, canonicalPath: "/privacy" }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

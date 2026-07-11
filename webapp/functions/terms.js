// GET /terms — Terms of Service.
import { shell, BRAND, esc } from "./_shared/page.js";

export async function onRequestGet(context) {
  const base = new URL(context.request.url).origin;
  const body = `
<div class="wrap">
  <div class="card">
  <p class="muted" style="margin-top:0">Last updated: July 2026</p>
  <p>By creating an account or using ${BRAND.name} (the "Service"), you agree to these terms. If you don't agree, please don't use the Service.</p>

  <h2>What the Service does</h2>
  <p>${BRAND.name} searches for jobs, generates tailored CVs, cover letters and interview practice, and — if you enable it — helps you apply. We do not guarantee interviews, job offers, or that any application is received or accepted by an employer.</p>

  <h2>Your responsibilities</h2>
  <ul>
    <li>Provide accurate profile information. You are responsible for reviewing every CV, cover letter and application before it's used.</li>
    <li>Use the Service lawfully and not to spam, misrepresent yourself, or violate any job platform's terms.</li>
    <li>Keep your login credentials secure.</li>
  </ul>

  <h2>Auto-apply</h2>
  <p>If you enable auto-apply, you authorise us to send applications from the email account you connect, on your behalf, subject to the limits of your plan. You can disable it at any time. You remain responsible for the content of applications sent.</p>

  <h2>Plans &amp; billing</h2>
  <p>Paid plans are billed monthly through our payment provider, Lemon Squeezy, who acts as merchant of record. Upgrades take effect immediately (prorated); downgrades take effect at the end of your current billing period. You can cancel anytime — see our <a href="${base}/refund">Refund &amp; Cancellation Policy</a>.</p>

  <h2>Availability &amp; changes</h2>
  <p>We aim for high availability but provide the Service "as is" without warranties. We may change, suspend or discontinue features, and may update these terms; continued use means you accept the updates.</p>

  <h2>Limitation of liability</h2>
  <p>To the extent permitted by law, ${BRAND.name} is not liable for indirect or consequential damages, or for outcomes of job applications. Our total liability is limited to the amount you paid in the last three months.</p>

  <h2>Contact</h2>
  <p>Email <a href="mailto:${BRAND.email}">${esc(BRAND.email)}</a> or WhatsApp ${esc(BRAND.whatsappDisplay)}.</p>
  </div>
</div>`;
  return new Response(shell({
    base, title: `Terms of Service — ${BRAND.name}`, description: `The terms for using ${BRAND.name}.`,
    body, canonicalPath: "/terms", hero: { eyebrow: "Legal", title: "Terms of Service" },
  }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

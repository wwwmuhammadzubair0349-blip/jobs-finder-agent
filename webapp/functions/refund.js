// GET /refund — Refund & Cancellation Policy.
import { shell, BRAND, esc } from "./_shared/page.js";

export async function onRequestGet(context) {
  const base = new URL(context.request.url).origin;
  const body = `
<div class="card">
  <h1>Refund & Cancellation Policy</h1>
  <p class="lead">Last updated: July 2026</p>

  <h2>Cancel anytime</h2>
  <p>You can cancel your subscription at any time from <b>Manage billing</b> in your dashboard. When you cancel, you keep access to your paid plan until the end of the current billing period, then your account moves to the Free plan. We don't charge you again after you cancel.</p>

  <h2>Upgrades & downgrades</h2>
  <ul>
    <li><b>Upgrade:</b> takes effect immediately. You're charged a prorated amount for the rest of the current period.</li>
    <li><b>Downgrade:</b> takes effect at the end of your current billing period — you keep your current benefits until then, and are billed the lower price from the next renewal. No partial refund is issued for a downgrade.</li>
  </ul>

  <h2>Refunds</h2>
  <p>Because plans are low-cost monthly subscriptions that you can cancel at any time, we generally do not offer refunds for time already elapsed. If you were charged in error, or something clearly went wrong, contact us within <b>14 days</b> of the charge and we'll review it in good faith. Payments are processed by Lemon Squeezy (our merchant of record), and approved refunds are returned to your original payment method.</p>

  <h2>How to cancel or request a refund</h2>
  <p>Use <b>Manage billing</b> in your dashboard, or contact us at <a href="mailto:${BRAND.email}">${esc(BRAND.email)}</a> / WhatsApp ${esc(BRAND.whatsappDisplay)} and we'll help.</p>
</div>`;
  return new Response(shell({ base, title: `Refund & Cancellation — ${BRAND.name}`, description: `Cancellation and refund policy for ${BRAND.name} subscriptions.`, body, canonicalPath: "/refund" }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

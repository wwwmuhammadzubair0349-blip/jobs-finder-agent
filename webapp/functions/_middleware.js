// Root middleware — runs for EVERY request (static + Functions). Adds security
// headers site-wide. Nested functions/api/_middleware.js handles auth after this.
export async function onRequest(context) {
  const res = await context.next();
  const h = new Headers(res.headers);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=(), usb=()");
  h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("X-DNS-Prefetch-Control", "off");
  // CSP: only same-origin resources; Google Fonts for the display typeface;
  // inline styles/scripts (React style props, server-page JSON-LD/form JS) are
  // allowed but external script injection, framing and cross-site forms are not.
  h.set("Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

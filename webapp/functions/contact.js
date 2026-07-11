// GET /contact — public contact page: a form that saves to the admin panel
// (POST /api/contact). No direct email/WhatsApp/Telegram — form only.
import { shell, BRAND } from "./_shared/page.js";

export async function onRequestGet(context) {
  const base = new URL(context.request.url).origin;
  const siteKey = context.env.TURNSTILE_SITEKEY || "";
  const tsScript = siteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : "";
  const tsWidget = siteKey ? `<div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="auto" style="margin:4px 0"></div>` : "";
  const body = `
<div class="wrap">
  <div class="card">
    <h2>Send us a message</h2>
    <p class="muted" style="margin-top:-6px">Fill in the form below and our team will get back to you by email — usually within a day.</p>
    <form id="cf">
      <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />
      <div class="field"><label>Your name</label><input name="name" required maxlength="80" placeholder="Jane Doe" /></div>
      <div class="field"><label>Your email</label><input name="email" type="email" required maxlength="120" placeholder="you@email.com" /></div>
      <div class="field"><label>Message</label><textarea name="message" required maxlength="2000" placeholder="How can we help?"></textarea></div>
      ${tsWidget}
      <button class="btn primary big" type="submit" id="sb">Send message</button>
      <div class="ok" id="okmsg" style="display:none">✅ Thanks! Your message has been sent — we'll get back to you soon.</div>
      <div style="color:#dc2626;font-size:14px;margin-top:10px;display:none" id="errmsg"></div>
    </form>
  </div>
</div>
${tsScript}
<script>
  var f=document.getElementById('cf');
  f.addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=document.getElementById('sb'),ok=document.getElementById('okmsg'),er=document.getElementById('errmsg');
    er.style.display='none';
    var tk=(f.querySelector('[name="cf-turnstile-response"]')||{}).value||'';
    btn.disabled=true;btn.textContent='Sending…';
    try{
      var fd=new FormData(f);
      var r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:fd.get('name'),email:fd.get('email'),message:fd.get('message'),website:fd.get('website'),turnstile:tk})});
      var j=await r.json();
      if(r.ok&&j.ok){f.reset();ok.style.display='block';btn.style.display='none';}
      else{throw new Error(j.message||'Please try again.');}
    }catch(ex){er.textContent=ex.message||'Could not send — please try again.';er.style.display='block';btn.disabled=false;btn.textContent='Send message';if(window.turnstile){try{window.turnstile.reset();}catch(_){}}}
  });
</script>`;
  return new Response(shell({
    base, title: `Contact — ${BRAND.name}`,
    description: `Get in touch with ${BRAND.name} — send us a message and we'll reply by email.`,
    body, canonicalPath: "/contact", active: "contact",
    hero: { eyebrow: "Contact", title: "Get in touch", lead: "Questions, feedback, or need help? Send us a message and we'll reply by email — usually within a day." },
  }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

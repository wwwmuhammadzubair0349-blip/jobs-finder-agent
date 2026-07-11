// GET /contact — public contact page: email, WhatsApp, and a form that saves
// to the admin panel (POST /api/contact).
import { shell, BRAND, esc } from "./_shared/page.js";

export async function onRequestGet(context) {
  const base = new URL(context.request.url).origin;
  const body = `
<div class="card">
  <h1>Contact us</h1>
  <p class="lead">Questions, feedback, or need help? Reach us any way you like — we usually reply within a day.</p>

  <div class="contact-row">
    <a class="pill" href="mailto:${BRAND.email}">✉️ ${esc(BRAND.email)}</a>
    <a class="pill" href="https://wa.me/${BRAND.whatsapp}" rel="noopener">💬 WhatsApp ${esc(BRAND.whatsappDisplay)}</a>
    <a class="pill" href="https://t.me/${BRAND.channel}" rel="noopener">📢 @${esc(BRAND.channel)}</a>
  </div>

  <h2>Send us a message</h2>
  <form id="cf">
    <div class="field"><label>Your name</label><input name="name" required maxlength="80" placeholder="Jane Doe" /></div>
    <div class="field"><label>Your email</label><input name="email" type="email" required maxlength="120" placeholder="you@email.com" /></div>
    <div class="field"><label>Message</label><textarea name="message" required maxlength="2000" placeholder="How can we help?"></textarea></div>
    <button class="btn primary" type="submit" id="sb">Send message</button>
    <div class="ok" id="okmsg" style="display:none">✅ Thanks! Your message has been sent — we'll get back to you soon.</div>
    <div style="color:#dc2626;font-size:14px;margin-top:8px;display:none" id="errmsg"></div>
  </form>
</div>
<script>
  var f=document.getElementById('cf');
  f.addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=document.getElementById('sb'),ok=document.getElementById('okmsg'),er=document.getElementById('errmsg');
    er.style.display='none';btn.disabled=true;btn.textContent='Sending…';
    try{
      var fd=new FormData(f);
      var r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:fd.get('name'),email:fd.get('email'),message:fd.get('message')})});
      var j=await r.json();
      if(r.ok&&j.ok){f.reset();ok.style.display='block';btn.style.display='none';}
      else{throw new Error(j.message||'Please try again.');}
    }catch(ex){er.textContent=ex.message||'Could not send — try email instead.';er.style.display='block';btn.disabled=false;btn.textContent='Send message';}
  });
</script>`;
  return new Response(shell({ base, title: `Contact — ${BRAND.name}`, description: `Get in touch with ${BRAND.name} — email, WhatsApp, or send us a message.`, body, canonicalPath: "/contact" }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

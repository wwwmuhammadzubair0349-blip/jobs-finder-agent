import React from "react";
import { PLANS, planEmoji } from "./plans";

const STEPS = [
  { n: "1", t: "Tell us who you are", d: "Add your profile once — skills, experience, target roles. Two minutes." },
  { n: "2", t: "Agents hunt 24/7", d: "We search Indeed, LinkedIn, Adzuna, Jooble & more across the countries you pick." },
  { n: "3", t: "Get matches + docs", d: "Each match arrives with a tailored CV & cover letter — on your Telegram, ready to apply." },
];

const FEATURES = [
  { icon: "🔎", t: "Always-on search", d: "Fresh, matched jobs around the clock — you never scroll a job board again." },
  { icon: "✍️", t: "A CV per job", d: "ATS-friendly CV + cover letter auto-written for each role, in your voice." },
  { icon: "🤖", t: "Auto-apply", d: "Opt in and we apply for you from your own inbox — safely, within your limits." },
  { icon: "🧠", t: "AI interview coach", d: "Realistic mock interviews with feedback and tips after every answer." },
  { icon: "✈️", t: "Straight to Telegram", d: "Everything lands on your phone. Tap to download or apply in minutes." },
  { icon: "📊", t: "One clean dashboard", d: "Track matches, applications and your pipeline in one place." },
];

const STATS = [
  { v: "24/7", l: "Always searching" },
  { v: "6+", l: "Job sources" },
  { v: "60s", l: "CV per job" },
  { v: "Free", l: "To start" },
];

const FAQ = [
  { q: "Is it really free?", a: "Yes — the Free plan searches jobs, sends alerts and prepares documents at no cost, no credit card. Upgrade only if you want more each day." },
  { q: "How does it write my CV?", a: "It takes your profile and tailors an ATS-friendly CV + cover letter to each specific job — matching keywords and highlighting the right experience." },
  { q: "Is auto-apply safe?", a: "It's opt-in and sends from your own email, within daily limits you control. You review everything, and can turn it off anytime." },
  { q: "Do I need Telegram?", a: "It's the easiest way to receive jobs and documents on your phone, but you can also use the web dashboard for everything." },
  { q: "Can I cancel anytime?", a: "Absolutely. Cancel in one click — you keep your plan until the end of the period, then move to Free. No lock-in." },
];

export default function Landing({ onAuth }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/"><span className="brand-mark sm">JF</span>Jobs Finder<span className="grad-dot">.</span></a>
        <nav className="lp-nav-links">
          <a className="lp-navlink" href="/jobs">Jobs</a>
          <a className="lp-navlink" href="#how">How it works</a>
          <a className="lp-navlink" href="#pricing">Pricing</a>
          <a className="lp-navlink" href="/contact">Contact</a>
        </nav>
        <span className="lp-nav-sp" />
        <button className="btn ghost sm" onClick={() => onAuth("login")}>Log in</button>
        <button className="btn primary sm" onClick={() => onAuth("signup")}>Get started</button>
      </header>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-aurora a1" /><div className="lp-aurora a2" />
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <div className="lp-badge">🚀 Your job hunt, on autopilot</div>
            <h1 className="lp-h1">Stop scrolling job boards.<br /><span className="grad-text">Let agents do the hunt.</span></h1>
            <p className="lp-sub">Jobs Finder searches the web 24/7, writes a tailored CV &amp; cover letter for every match, and sends them to your Telegram — while you get on with your day.</p>
            <div className="lp-cta">
              <button className="btn primary lp-btn" onClick={() => onAuth("signup")}>Start free →</button>
              <a className="btn ghost lp-btn" href="/jobs">Browse jobs</a>
            </div>
            <div className="lp-trust">🔒 Free to start · No credit card · 2-minute setup</div>
            <div className="lp-stats">
              {STATS.map((s) => (
                <div className="lp-stat" key={s.l}><div className="lp-stat-v">{s.v}</div><div className="lp-stat-l">{s.l}</div></div>
              ))}
            </div>
          </div>

          {/* Product preview */}
          <div className="lp-art" aria-hidden="true">
            <div className="lp-art-panel">
              <div className="lp-mock lp-mock-job">
                <div className="lp-mock-top">
                  <div className="lp-mock-logo">TC</div>
                  <div style={{ flex: 1 }}>
                    <div className="lp-mock-title">Senior Electrical Engineer</div>
                    <div className="lp-mock-sub">TechCorp · Remote · $95k</div>
                  </div>
                  <div className="lp-ring"><span>92</span></div>
                </div>
                <div className="lp-mock-tags"><span>🌍 Remote</span><span>⚡ MEP</span><span>Adzuna</span></div>
                <div className="lp-mock-actions"><span className="lp-mock-btn primary">📄 CV ready</span><span className="lp-mock-btn">✉️ Cover</span></div>
              </div>
              <div className="lp-mock lp-mock-tg">
                <span className="lp-tg-ico">✈️</span>
                <div><b>New match sent</b><div className="lp-mock-sub">Tailored CV &amp; cover letter attached</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats-free divider trust bar */}
      <div className="lp-strap">Trusted to search Indeed · LinkedIn · Adzuna · Jooble · RemoteOK &amp; more</div>

      {/* How it works */}
      <section className="lp-section" id="how">
        <p className="lp-eyebrow">How it works</p>
        <h2 className="lp-h2">From profile to interview-ready in minutes</h2>
        <div className="lp-steps">
          {STEPS.map((s) => (
            <div className="lp-step" key={s.n}>
              <div className="lp-step-n">{s.n}</div>
              <div className="lp-step-t">{s.t}</div>
              <div className="lp-step-d">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="lp-section">
        <p className="lp-eyebrow">Everything you need</p>
        <h2 className="lp-h2">One agent team, working for your career</h2>
        <div className="lp-feats">
          {FEATURES.map((f) => (
            <div className="lp-feat" key={f.t}>
              <div className="lp-feat-ico">{f.icon}</div>
              <div className="lp-feat-t">{f.t}</div>
              <div className="lp-feat-d">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="lp-section" id="pricing">
        <p className="lp-eyebrow">Pricing</p>
        <h2 className="lp-h2">Start free. Upgrade when it's working.</h2>
        <div className="lp-prices">
          {PLANS.map((p) => (
            <div className={`lp-price${p.popular ? " pop" : ""}`} key={p.id}>
              {p.popular && <div className="lp-flag">★ Most popular</div>}
              <div className="lp-price-h">{planEmoji(p.id)} {p.label}</div>
              <div className="lp-price-amt">{p.price === 0 ? <b>Free</b> : <><span className="cur">$</span><b>{p.price}</b><span className="per">/mo</span></>}</div>
              <div className="lp-price-tag">{p.tagline}</div>
              <ul className="lp-price-feats">{p.features.map((f, i) => <li key={i}><span className="tick">✓</span>{f}</li>)}</ul>
              <button className={`btn sm ${p.popular ? "primary" : "ghost"}`} onClick={() => onAuth("signup")}>{p.price === 0 ? "Start free" : "Get " + p.label}</button>
            </div>
          ))}
        </div>
        <p className="lp-fineprint">Prices in USD. Cancel anytime · upgrades are prorated · downgrades apply at period end.</p>
      </section>

      {/* FAQ */}
      <section className="lp-section" id="faq">
        <p className="lp-eyebrow">FAQ</p>
        <h2 className="lp-h2">Good questions, answered</h2>
        <div className="lp-faq">
          {FAQ.map((f) => (
            <details className="lp-faq-item" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-section">
        <div className="lp-final">
          <div className="lp-aurora a1" style={{ opacity: 0.4 }} />
          <h2>Your next job is already out there.</h2>
          <p>Let your agents find it — and write the CV — while you sleep.</p>
          <button className="btn lp-btn lp-final-btn" onClick={() => onAuth("signup")}>Create my free account →</button>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-in">
          <a className="lp-brand" href="/" style={{ fontSize: 15 }}><span className="brand-mark sm">JF</span>Jobs Finder<span className="grad-dot">.</span></a>
          <span className="lp-nav-sp" />
          <a href="/jobs">Jobs</a>
          <a href="/contact">Contact</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/refund">Refunds</a>
          <a href="https://t.me/dailyjobs_feed" target="_blank" rel="noreferrer">Telegram</a>
        </div>
      </footer>
    </div>
  );
}

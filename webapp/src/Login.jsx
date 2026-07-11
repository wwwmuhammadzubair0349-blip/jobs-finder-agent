import React, { useState, useEffect, useRef } from "react";
import { api } from "./api";

// Loads the Cloudflare Turnstile script once and renders a widget into `elRef`.
// Calls onToken with the verification token (or "" on expiry/error). Returns a
// reset() so callers can clear a spent token after a failed submit.
function useTurnstile(elRef, onToken) {
  const widgetId = useRef(null);
  const [key, setKey] = useState("");
  useEffect(() => {
    let dead = false;
    api.turnstileKey().then((r) => { if (!dead) setKey(r.key || ""); }).catch(() => {});
    return () => { dead = true; };
  }, []);
  useEffect(() => {
    if (!key || !elRef.current) return;
    const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    function render() {
      if (!window.turnstile || !elRef.current || widgetId.current !== null) return;
      widgetId.current = window.turnstile.render(elRef.current, {
        sitekey: key, theme: "auto",
        callback: (t) => onToken(t),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    }
    if (window.turnstile) { render(); return; }
    let s = document.querySelector(`script[src="${SRC}"]`);
    if (!s) { s = document.createElement("script"); s.src = SRC; s.async = true; s.defer = true; document.head.appendChild(s); }
    const iv = setInterval(() => { if (window.turnstile) { clearInterval(iv); render(); } }, 120);
    return () => clearInterval(iv);
  }, [key]);
  return {
    enabled: !!key,
    reset: () => { try { if (widgetId.current !== null) window.turnstile.reset(widgetId.current); } catch {} },
  };
}

const FEATURES = [
  { icon: "🔎", title: "Searches 24/7", text: "Indeed, LinkedIn, Adzuna, Jooble & more — across every country you choose." },
  { icon: "✍️", title: "A tailored CV for every job", text: "ATS-friendly CV + cover letter, auto-written for each role in your voice." },
  { icon: "✈️", title: "Delivered to Telegram", text: "Matches land on your phone, ready to apply in minutes." },
  { icon: "🧠", title: "AI interview coach", text: "Real mock interviews with feedback on every answer." },
];

export default function Login({ onLogin, initialMode = "signup", onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setP] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [hp, setHp] = useState(""); // honeypot — must stay empty
  const [token, setToken] = useState(""); // Turnstile token
  const tsEl = useRef(null);
  const ts = useTurnstile(tsEl, setToken);

  async function submit(e) {
    e.preventDefault();
    if (mode === "signup") {
      if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
      if (password !== confirm) { setErr("Passwords don't match."); return; }
    }
    if (ts.enabled && !token) { setErr("Please complete the human verification below."); return; }
    setErr(""); setNote(""); setBusy(true);
    try {
      if (mode === "signup") {
        await api.signup(email, password, hp, token);
        localStorage.setItem("jf_new_user", "1");
        setMode("login");
        setNote("Account created 🎉 — log in to get started.");
      } else {
        const r = await api.login(email, password, remember, token);
        onLogin(r);
      }
    } catch (e) {
      setErr(e.message || "Something went wrong");
      ts.reset(); setToken(""); // tokens are single-use
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <aside className="brand-pane">
        <div className="aurora a1" />
        <div className="aurora a2" />
        <div className="aurora a3" />
        <div className="brand-pane-inner">
          <div className="brand-row">
            <span className="brand-mark">JF</span>
            <span className="brand-word">Jobs Finder<span className="grad-dot">.</span></span>
          </div>

          <h1 className="hero-line">Your job hunt,<br /><span className="grad-text">on autopilot.</span></h1>
          <p className="hero-sub">We find the jobs, write a tailored CV &amp; cover letter for each, and send them to your Telegram — while you get on with your day.</p>

          <div className="features">
            {FEATURES.map((f, i) => (
              <div className="feature" key={f.title} style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                <div className="feature-ico">{f.icon}</div>
                <div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-text">{f.text}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="trust-row">🔒 Free to start · No credit card · 2-minute setup</div>
        </div>
      </aside>

      <main className="form-pane">
        {onBack && <button type="button" className="btn ghost sm auth-back" onClick={onBack}>← Home</button>}
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-head">
            <div className="auth-title">{mode === "signup" ? "Create your account" : "Welcome back"}</div>
            <div className="auth-sub">{mode === "signup" ? "Start getting matched jobs in minutes." : "Your agents kept working while you were away."}</div>
          </div>

          <div className="seg">
            <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); setErr(""); }}>Sign up free</button>
            <button type="button" className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setErr(""); }}>Log in</button>
          </div>

          {/* Honeypot: hidden from humans, catches form-filling bots. */}
          <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@email.com" autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />
          </div>
          {mode === "signup" && (
            <div className="field">
              <label>Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Re-enter your password" />
            </div>
          )}

          {mode === "login" && (
            <label className="checkbox remember-row">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me for 30 days
            </label>
          )}

          <div ref={tsEl} className="turnstile-box" style={{ marginTop: 4 }} />

          <button className="btn primary big" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create my free account" : "Log in"}</button>
          {note && <div className="ok-msg">{note}</div>}
          <div className="err-msg">{err}</div>
          <p className="fineprint">{mode === "signup" ? "Join job seekers who'd rather interview than scroll." : "Good to see you again."}</p>
        </form>
      </main>
    </div>
  );
}

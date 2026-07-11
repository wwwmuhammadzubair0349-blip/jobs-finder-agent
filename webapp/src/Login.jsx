import React, { useState } from "react";
import { api } from "./api";

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
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setNote(""); setBusy(true);
    try {
      if (mode === "signup") {
        await api.signup(email, password);
        localStorage.setItem("jf_new_user", "1");
        setMode("login");
        setNote("Account created 🎉 — log in to get started.");
      } else {
        const r = await api.login(email, password, remember);
        onLogin(r);
      }
    } catch (e) {
      setErr(e.message || "Something went wrong");
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

          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@email.com" autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="At least 6 characters" />
          </div>

          {mode === "login" && (
            <label className="checkbox remember-row">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me for 30 days
            </label>
          )}

          <button className="btn primary big" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create my free account" : "Log in"}</button>
          {note && <div className="ok-msg">{note}</div>}
          <div className="err-msg">{err}</div>
          <p className="fineprint">{mode === "signup" ? "Join job seekers who'd rather interview than scroll." : "Good to see you again."}</p>
        </form>
      </main>
    </div>
  );
}

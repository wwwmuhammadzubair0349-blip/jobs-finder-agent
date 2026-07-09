import React, { useState } from "react";
import { api } from "./api";

const FEATURES = [
  { icon: "🔎", title: "Searches 24/7", text: "Indeed, LinkedIn, Adzuna, Jooble & more — across every country you choose." },
  { icon: "✍️", title: "Tailored CV, every job", text: "An ATS-friendly CV + cover letter auto-written for each role — in your voice." },
  { icon: "✈️", title: "Straight to Telegram", text: "New matches land on your phone, ready to apply in minutes." },
  { icon: "🧠", title: "Interview prep bot", text: "Get tailored interview questions & answers for any job you pick." },
];

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

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
        const r = await api.login(email, password);
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
      <div className="landing-inner fade">
        <header className="brand-hero">
          <div className="brand-mark">💼</div>
          <h1 className="brand-title">Jobs Finder<span className="dot">.</span></h1>
          <p className="brand-tag">Your job hunt, on autopilot.</p>
          <p className="brand-sub">We find the jobs, write a tailored CV & cover letter for each, and send them to your Telegram — while you get on with your day.</p>
        </header>

        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <div className="feature-ico">{f.icon}</div>
              <div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-text">{f.text}</div>
              </div>
            </div>
          ))}
        </div>

        <form className="auth-card" onSubmit={submit}>
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
          <button className="btn primary big" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create my free account" : "Log in"}</button>
          {note && <div className="ok-msg">{note}</div>}
          <div className="err-msg">{err}</div>
          <p className="fineprint">{mode === "signup" ? "No credit card. Start getting matched jobs in minutes." : "Welcome back — your agents are waiting."}</p>
        </form>

        <p className="landing-foot">Built for job seekers who'd rather interview than scroll.</p>
      </div>
    </div>
  );
}

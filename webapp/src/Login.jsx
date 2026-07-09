import React, { useState } from "react";
import { api } from "./api";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | signup
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
        setMode("login");
        setNote("Account created — now log in.");
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
    <div className="login-wrap">
      <form className="login-card fade" onSubmit={submit}>
        <h1>Jobs Finder<span style={{ color: "var(--accent)" }}>.</span></h1>
        <p className="sub">Your 24/7 job hunt — tailored CVs, cover letters, and interview prep on autopilot.</p>

        <div className="seg">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setErr(""); }}>Log in</button>
          <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); setErr(""); }}>Sign up</button>
        </div>

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        </div>
        <button className="btn primary" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}</button>
        {note && <div style={{ color: "var(--ok)", fontSize: 13, marginTop: 10 }}>{note}</div>}
        <div className="err-msg">{err}</div>
      </form>
    </div>
  );
}

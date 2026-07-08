import React, { useState } from "react";
import { api } from "./api";

export default function Login({ onLogin }) {
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await api.login(username, password);
      onLogin(r.user);
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card fade" onSubmit={submit}>
        <h1>Jobs Finder<span style={{ color: "var(--accent)" }}>.</span></h1>
        <p className="sub">Your 24/7 job search, tailored CVs & cover letters.</p>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="err-msg">{err}</div>
      </form>
    </div>
  );
}

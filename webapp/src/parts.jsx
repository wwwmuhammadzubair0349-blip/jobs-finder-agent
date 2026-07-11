import React from "react";
import { IconExt } from "./icons";
import { cleanText } from "./util";

export function Kpi({ value, label }) {
  return (
    <div className="kpi">
      <div className="v num">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function ScoreRing({ score }) {
  const pct = Math.max(0, Math.min(100, score || 0));
  const color = pct >= 75 ? "var(--ok)" : pct >= 55 ? "var(--accent)" : "var(--warn)";
  const r = 20, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return (
    <div className="score">
      <div className="ring">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r={r} fill="none" stroke="var(--hair)" strokeWidth="5" />
          <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
            transform="rotate(-90 26 26)" />
          <text x="26" y="30" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">{Math.round(pct)}</text>
        </svg>
      </div>
      <div className="lbl">match</div>
    </div>
  );
}

export function monogram(name) {
  const w = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase() || "•";
}

const STATUSES = ["saved", "applied", "interview", "rejected", "offer"];
const INTERACTIVE = ["A", "SELECT", "OPTION", "BUTTON", "INPUT", "SVG", "PATH"];

function Badges({ job, applied, autoApplied, ready }) {
  return (
    <>
      {applied && <span className="tag" style={{ color: "var(--ok)", borderColor: "var(--ok)" }}>{autoApplied ? "🤖 Auto-applied" : "✓ Applied"}</span>}
      {ready && <span className="tag" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>🎯 Ready to apply</span>}
      {job.cv_url && !applied && !ready && <span className="tag" style={{ color: "var(--ok)", borderColor: "color-mix(in srgb, var(--ok) 40%, var(--hair))" }}>📄 Docs ready</span>}
    </>
  );
}

function SaveStar({ job, onSave }) {
  const [saved, setSaved] = React.useState(!!job.saved);
  if (!onSave) return null;
  async function toggle(e) {
    e.stopPropagation();
    const next = !saved; setSaved(next);
    try { await onSave(job, next); } catch { setSaved(!next); }
  }
  return (
    <button className={`save-star${saved ? " on" : ""}`} title={saved ? "Saved" : "Save job"} onClick={toggle}>
      {saved ? "★" : "☆"}
    </button>
  );
}

export function JobCard({ job, appStatus, onStatus, onSend, onShare, onSave, onOpen, onInterview }) {
  const url = job.url;
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const applied = job.status === "applied" || appStatus === "applied";
  const autoApplied = applied && job.applied_via === "auto";
  const ready = job.status === "ready" && !applied;

  async function send(e) {
    e?.stopPropagation();
    if (!onSend) return;
    setSending(true);
    try { await onSend(job); setSent(true); } finally { setSending(false); }
  }
  function cardClick(e) {
    if (onOpen && !INTERACTIVE.includes((e.target.tagName || "").toUpperCase())) onOpen(job);
  }

  return (
    <div className={`card fade jobcard${onOpen ? " clickable" : ""}`} onClick={cardClick}>
      <div className="job-top">
        <div className="jc-head">
          <div className="jc-mono">{monogram(job.company)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="job-title">{cleanText(job.title)}</div>
            <div className="job-sub">{cleanText(job.company)}{job.location ? ` · ${cleanText(job.location)}` : ""}</div>
          </div>
        </div>
        <div className="jc-side">
          <SaveStar job={job} onSave={onSave} />
          {job.match_score != null && <ScoreRing score={job.match_score} />}
        </div>
      </div>

      <div className="job-meta">
        <Badges job={job} applied={applied} autoApplied={autoApplied} ready={ready} />
        {job.remote && <span className="tag remote">🌍 Remote</span>}
        {job.salary && <span className="tag">💰 {job.salary}</span>}
        {job.source && <span className="tag">{job.source}</span>}
      </div>

      {job.why && <div className="why">🎯 {job.why}</div>}

      <div className="row-actions">
        {url && <a className="btn primary sm" href={url} target="_blank" rel="noreferrer">Apply <IconExt /></a>}
        {job.cv_url && <a className="btn sm" href={job.cv_url} target="_blank" rel="noreferrer">📄 CV</a>}
        {job.cover_url && <a className="btn sm" href={job.cover_url} target="_blank" rel="noreferrer">✉️ Cover</a>}
        {onSend && !job.cv_url && <button className="btn sm" onClick={send} disabled={sending || sent}>{sent ? "✓ Preparing…" : sending ? "…" : "📄 Prepare CV & Cover"}</button>}
        {onInterview && <button className="btn sm" onClick={(e) => { e.stopPropagation(); onInterview(job); }}>🎤 Interview</button>}
        {onOpen && <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); onOpen(job); }}>Details →</button>}
      </div>
    </div>
  );
}

// Rich job details modal — opens from any card.
export function JobDetail({ job, appStatus, onStatus, onSend, onShare, onSave, onInterview, onClose }) {
  const [saved, setSaved] = React.useState(!!job.saved);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const applied = job.status === "applied" || appStatus === "applied";
  const autoApplied = applied && job.applied_via === "auto";
  const ready = job.status === "ready" && !applied;

  async function toggleSave() {
    const next = !saved; setSaved(next);
    try { await onSave?.(job, next); } catch { setSaved(!next); }
  }
  async function send() { if (!onSend) return; setSending(true); try { await onSend(job); setSent(true); } finally { setSending(false); } }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal jobdetail fade" onClick={(e) => e.stopPropagation()}>
        <div className="jd-head">
          <div className="jc-mono lg">{monogram(job.company)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="jd-title">{cleanText(job.title)}</div>
            <div className="job-sub">{cleanText(job.company)}{job.location ? ` · ${cleanText(job.location)}` : ""}</div>
          </div>
          {onSave && <button className={`save-star${saved ? " on" : ""}`} onClick={toggleSave} title={saved ? "Saved" : "Save"}>{saved ? "★" : "☆"}</button>}
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="job-meta" style={{ marginTop: 6 }}>
          <Badges job={job} applied={applied} autoApplied={autoApplied} ready={ready} />
          {job.remote && <span className="tag remote">🌍 Remote</span>}
          {job.salary && <span className="tag">💰 {job.salary}</span>}
          {job.match_score != null && <span className="tag">🎯 {Math.round(job.match_score)}% match</span>}
          {job.source && <span className="tag">{job.source}</span>}
          {job.posted_at && <span className="tag">📅 {String(job.posted_at).slice(0, 10)}</span>}
        </div>

        {job.why && <div className="why" style={{ marginTop: 12 }}>🎯 Why it fits: {job.why}</div>}

        <div className="jd-desc">{cleanText(job.description) || "No description captured for this job."}</div>

        <div className="jd-actions">
          {job.url && <a className="btn primary" href={job.url} target="_blank" rel="noreferrer">Apply on site <IconExt /></a>}
          {job.cv_url
            ? <a className="btn" href={job.cv_url} target="_blank" rel="noreferrer">📄 Download CV</a>
            : onSend && <button className="btn" onClick={send} disabled={sending || sent}>{sent ? "✓ Preparing…" : sending ? "…" : "📄 Prepare CV & Cover"}</button>}
          {job.cover_url && <a className="btn" href={job.cover_url} target="_blank" rel="noreferrer">✉️ Download Cover</a>}
          {onInterview && <button className="btn" onClick={() => { onClose?.(); onInterview(job); }}>🎤 Prepare interview</button>}
          {onShare && job.slug && <button className="btn ghost" onClick={() => onShare(job)}>🔗 Share</button>}
        </div>

        {onStatus && (
          <div className="jd-track">
            <span className="hint">Track status</span>
            <select className="status" value={appStatus || ""} onChange={(e) => onStatus(job, e.target.value)}>
              <option value="" disabled>Set status…</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

export function Empty({ icon = "🗂", title, sub }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 600, color: "var(--ink-2)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

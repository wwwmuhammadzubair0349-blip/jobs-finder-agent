import React from "react";
import { IconExt } from "./icons";

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

const STATUSES = ["saved", "applied", "interview", "rejected", "offer"];

export function JobCard({ job, appStatus, onStatus }) {
  const url = job.url;
  return (
    <div className="card fade">
      <div className="job-top">
        <div>
          <div className="job-title">{job.title}</div>
          <div className="job-sub">{job.company}{job.location ? ` · ${job.location}` : ""}</div>
        </div>
        {job.match_score != null && <ScoreRing score={job.match_score} />}
      </div>

      <div className="job-meta">
        {job.remote && <span className="tag remote">🌍 Remote</span>}
        {job.salary && <span className="tag">💰 {job.salary}</span>}
        {job.source && <span className="tag">{job.source}</span>}
      </div>

      {job.why && <div className="why">🎯 {job.why}</div>}

      <div className="row-actions">
        {url && <a className="btn primary sm" href={url} target="_blank" rel="noreferrer">Apply <IconExt /></a>}
        {job.cv_url && <a className="btn sm" href={job.cv_url} target="_blank" rel="noreferrer">CV</a>}
        {job.cover_url && <a className="btn sm" href={job.cover_url} target="_blank" rel="noreferrer">Cover letter</a>}
        {onStatus && (
          <select className="status" value={appStatus || ""} onChange={(e) => onStatus(job, e.target.value)}>
            <option value="" disabled>Track…</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
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

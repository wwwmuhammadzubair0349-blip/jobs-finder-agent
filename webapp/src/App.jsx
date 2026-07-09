import React, { useEffect, useState, useCallback, useRef } from "react";
import { api } from "./api";
import Login from "./Login";
import Tour from "./Tour";
import { Kpi, JobCard, Empty } from "./parts";
import { ProfileEditor, SearchEditor, ScheduleEditor } from "./Editors";
import { IconToday, IconJobs, IconApps, IconProfile, IconSearch, IconClock, IconAlert, IconRun, IconRefresh, IconOut, IconSun } from "./icons";

const TABS = [
  { id: "today", label: "Today", icon: IconToday },
  { id: "jobs", label: "All jobs", icon: IconJobs },
  { id: "apps", label: "Applications", icon: IconApps },
  { id: "profile", label: "Profile", icon: IconProfile },
  { id: "search", label: "Search", icon: IconSearch },
  { id: "schedule", label: "Schedule", icon: IconClock },
];

export default function App() {
  const [me, setMe] = useState(undefined); // undefined=loading, null=logged out
  const [theme, setTheme] = useState(() => localStorage.getItem("jf_theme") || "");

  const loadMe = useCallback(() => api.me().then(setMe).catch(() => setMe(null)), []);
  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => {
    if (theme) { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("jf_theme", theme); }
  }, [theme]);

  if (me === undefined) return <div className="login-wrap"><div className="pill">Loading…</div></div>;
  if (!me) return <Login onLogin={loadMe} />;
  return <Dashboard me={me} reloadMe={loadMe} onLogout={() => { api.logout(); setMe(null); }} theme={theme} setTheme={setTheme} />;
}

function isProfileComplete(config) {
  if (!config) return true; // don't nag until loaded
  const p = config.profile || {}, s = config.search || {};
  return !!(p.full_name && p.full_name.trim() && (s.job_titles || []).length &&
            ((p.skills || []).length || (p.experience || []).length));
}

function Dashboard({ me, reloadMe, onLogout, theme, setTheme }) {
  const [tab, setTab] = useState("today");
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [toast, setToast] = useState("");
  const [running, setRunning] = useState(false);
  const [showTour, setShowTour] = useState(() => !localStorage.getItem("jf_tour_done"));
  const [nagDismissed, setNagDismissed] = useState(false);
  const pollRef = useRef(null);
  const lastJson = useRef("");
  const complete = isProfileComplete(config);

  const load = useCallback(async () => {
    try {
      const d = await api.data();
      const s = JSON.stringify(d);
      // Only re-render when something actually changed → zero flicker.
      if (s !== lastJson.current) { lastJson.current = s; setData(d); }
    } catch (e) { if (e.unauthorized) onLogout(); }
  }, [onLogout]);

  const loadConfig = useCallback(async () => {
    try { setConfig(await api.getConfig()); } catch {}
  }, []);

  useEffect(() => { load(); loadConfig(); }, [load, loadConfig]);

  // Silent auto-refresh every 4s; pause when tab hidden.
  useEffect(() => {
    function tick() { if (!document.hidden) load(); }
    pollRef.current = setInterval(tick, 4000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(pollRef.current); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  async function saveConfig(section, payload) {
    await api.saveConfig(section, payload);
    flash("Saved");
    loadConfig();
  }

  async function setApp(job, status) {
    await api.setApplication({ job_url: job.url, title: job.title, company: job.company, status });
    flash(`Marked ${status}`);
    load();
  }

  async function runNow() {
    if (!complete) { setTab("profile"); flash("Complete your profile first to get jobs"); return; }
    setRunning(true);
    try { await api.runNow(); flash("Run triggered"); }
    catch (e) { flash(e.message || "Run failed"); }
    finally { setTimeout(() => setRunning(false), 4000); }
  }

  function finishTour() { localStorage.setItem("jf_tour_done", "1"); localStorage.removeItem("jf_new_user"); setShowTour(false); }

  async function sendJob(job) {
    await api.sendJob(job);
    flash("Queued → preparing CV & sending to Telegram");
  }

  const issues = data?.issues || [];
  const errCount = issues.filter((i) => i.level === "error" && withinHours(i.at, 48)).length;

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">Jobs Finder<span className="dot">.</span></span>
        <RunState latest={data?.latest_run} />
        <span className="spacer" />
        <button className="icon-btn" title="Run now" onClick={runNow} disabled={running}><IconRun /></button>
        <button className="icon-btn" title="Refresh" onClick={load}><IconRefresh /></button>
        <button className="icon-btn" title="Theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><IconSun /></button>
        <button className="icon-btn" title="Sign out" onClick={onLogout}><IconOut /></button>
      </div>

      {me.impersonating && (
        <div className="imp-bar">
          👁 Viewing as <b>{me.impersonating}</b>
          <button className="btn sm" onClick={async () => { await api.adminSwitch(null); reloadMe(); load(); flash("Back to admin"); }}>Exit</button>
        </div>
      )}

      <ActivityBar latest={data?.latest_run} />

      <div className="content">
        {tab === "today" && <Today me={me} data={data} onApp={setApp} onSend={sendJob} reloadMe={reloadMe} />}
        {tab === "admin" && <AdminPanel reloadMe={reloadMe} flash={flash} />}
        {tab === "jobs" && <AllJobs data={data} onApp={setApp} onSend={sendJob} />}
        {tab === "apps" && <Applications data={data} />}
        {tab === "profile" && (config ? <ProfileEditor key="p" initial={config.profile} onSave={saveConfig} /> : <Loading />)}
        {tab === "search" && (config ? <SearchEditor key="s" initial={config.search} onSave={saveConfig} /> : <Loading />)}
        {tab === "schedule" && (config ? <ScheduleEditor key="c" initial={config.schedule} onSave={saveConfig} /> : <Loading />)}
      </div>

      <nav className="tabbar">
        {(me.admin ? [...TABS, { id: "admin", label: "Admin", icon: IconProfile }] : TABS).map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} style={{ position: "relative" }}>
            <t.icon />
            {t.id === "issues" && errCount > 0 && <span className="badge">{errCount}</span>}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {showTour && <Tour onDone={finishTour} />}

      {!showTour && config && !complete && !nagDismissed && (
        <div className="modal-back" onClick={() => setNagDismissed(true)}>
          <div className="tour-card fade" onClick={(e) => e.stopPropagation()}>
            <div className="tour-emoji">📝</div>
            <h2>Complete your profile</h2>
            <p>Add your name, job titles and skills so the agents can find and tailor jobs for you. It takes 2 minutes and it's what makes the matches great.</p>
            <div className="tour-actions">
              <button className="btn ghost" onClick={() => setNagDismissed(true)}>Later</button>
              <button className="btn primary" onClick={() => { setTab("profile"); setNagDismissed(true); }}>Complete profile</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast fade">{toast}</div>}
    </div>
  );
}

function Loading() { return <><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></>; }

function RunState({ latest }) {
  if (!latest) return null;
  const status = latest.status || "idle";
  const color = status === "running" ? "var(--info)" : status === "failed" ? "var(--err)" : "var(--ok)";
  return <span className="pill"><span className="status-dot" style={{ background: color }} />{status}</span>;
}

const AGENT_LABELS = {
  collect_jobs: "🔎 Searching job boards",
  rank_jobs: "📊 Scoring matches",
  cv_writer: "✍️ Writing your tailored CV",
  cl_writer: "✉️ Writing your cover letter",
  agent_cv: "✍️ Writing your CV & cover letter",
  render_cv: "📄 Designing the PDFs",
  send_telegram: "✈️ Sending to your Telegram",
  agent_analyst: "🧠 Preparing your brief",
};

// Agent-team cards (user-facing). Link Checker & Publisher run in the
// background but are hidden here to keep the team focused on what the user sees.
const AGENTS = [
  { key: "collect_jobs", name: "Scraper", emoji: "🔎" },
  { key: "rank_jobs", name: "Ranker", emoji: "📊" },
  { key: "cv_writer", name: "CV Writer", emoji: "✍️" },
  { key: "cl_writer", name: "Cover Letter Writer", emoji: "✉️" },
  { key: "render_cv", name: "Designer", emoji: "📄" },
  { key: "send_telegram", name: "Telegram", emoji: "✈️" },
  { key: "agent_analyst", name: "Analyst", emoji: "🧠" },
];

function AgentTeam({ status, current }) {
  const byName = Object.fromEntries((status || []).map((s) => [s.name, s]));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {AGENTS.map((a) => {
        const s = byName[a.key];
        const active = current && current.agent === a.key;
        const state = active ? "green" : s?.state || "gray";
        const dot = state === "green" ? "var(--ok)" : state === "red" ? "var(--err)" : state === "yellow" ? "var(--warn)" : "var(--hair-strong)";
        return (
          <div className="card" key={a.key} style={{ margin: 0, padding: 12, ...(active ? { borderColor: "var(--accent)" } : {}) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {active ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <span className="status-dot" style={{ background: dot }} />}
              <span style={{ fontWeight: 600, fontSize: 14 }}>{a.emoji} {a.name}</span>
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
              {active ? "working now…" : s?.last_run ? `active · ${timeAgo(s.last_run)}` : "idle"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LogTerminal({ latest }) {
  const lines = latest?.log_tail || [];
  return (
    <div style={{
      background: "#0d1117", color: "#c9d1d9", borderRadius: 12, padding: "12px 14px",
      fontFamily: "var(--num)", fontSize: 11.5, lineHeight: 1.6, maxHeight: 220, overflow: "auto",
      border: "1px solid var(--hair)",
    }}>
      {lines.length === 0 ? <div style={{ opacity: 0.5 }}>No recent activity.</div>
        : lines.map((l, i) => <div key={i} style={{ whiteSpace: "pre-wrap" }}>{l}</div>)}
    </div>
  );
}

function ActivityBar({ latest }) {
  if (!latest || latest.status !== "running") return null;
  const cur = latest.current || {};
  const agent = cur.agent;
  const label = AGENT_LABELS[agent] || (agent ? `⚙️ ${agent}` : "⚙️ Working…");
  return (
    <div style={{
      margin: "10px 16px 0", padding: "11px 14px", borderRadius: 12,
      background: "var(--accent-weak)", border: "1px solid var(--accent)",
      display: "flex", alignItems: "center", gap: 10,
    }} className="fade">
      <span className="spinner" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--accent)" }}>{label}</div>
        {cur.job && <div style={{ fontSize: 12, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>on: {cur.job}</div>}
      </div>
    </div>
  );
}

/* ---------------- Today ---------------- */
function Today({ me, data, onApp, onSend, reloadMe }) {
  const [filter, setFilter] = useState("today");
  if (!data) return <Loading />;
  const allJobs = data.jobs || [];
  const apps = data.applications || [];
  const appMap = Object.fromEntries(apps.map((a) => [a.job_url, a.status]));
  const eff = (j) => appMap[j.url] || j.status;

  const total = allJobs.length;
  const todayJobs = allJobs.filter((j) => withinHours(j.first_seen || j.sent_at, 24));
  const appliedJobs = allJobs.filter((j) => eff(j) === "applied");
  const interviewJobs = allJobs.filter((j) => eff(j) === "interview");

  const KPIS = [
    { id: "total", value: total, label: "Total jobs" },
    { id: "today", value: todayJobs.length, label: "Found today" },
    { id: "applied", value: appliedJobs.length, label: "Applied" },
    { id: "interviews", value: interviewJobs.length, label: "Interviews" },
  ];
  const lists = { total: allJobs, today: todayJobs, applied: appliedJobs, interviews: interviewJobs };
  const shown = (lists[filter] || []).slice(0, 60);
  const titleMap = { total: "All jobs", today: "Found today", applied: "Applied", interviews: "Interviews" };

  return (
    <div className="fade">
      <div className="kpis">
        {KPIS.map((k) => (
          <button key={k.id} className="kpi" onClick={() => setFilter(k.id)}
            style={{ textAlign: "left", cursor: "pointer", ...(filter === k.id ? { borderColor: "var(--accent)", boxShadow: "0 0 0 2px var(--accent-weak)" } : {}) }}>
            <div className="v num">{k.value}</div>
            <div className="l">{k.label}</div>
          </button>
        ))}
      </div>

      <ConnectCard me={me} reloadMe={reloadMe} />

      <AgentGrid status={data.agents_status || []} current={data.latest_run?.current} running={data.latest_run?.status === "running"} />

      <p className="section-title">{titleMap[filter]} · {shown.length}</p>
      {shown.length === 0
        ? <Empty icon="🛰" title={`No ${titleMap[filter].toLowerCase()} yet`} sub={filter === "today" ? "New matches from the next search will appear here." : "Tap another stat above."} />
        : shown.map((j) => <JobCard key={j.id || j.url} job={j} appStatus={appMap[j.url]} onStatus={onApp} onSend={onSend} />)}
    </div>
  );
}

// Agent grid — all agents fit on screen (no side-scroll), premium pulse on active.
function AgentGrid({ status, current, running }) {
  const byName = Object.fromEntries((status || []).map((s) => [s.name, s]));
  return (
    <div style={{ marginBottom: 8 }}>
      <p className="section-title">🤖 Agent team {running && <span style={{ color: "var(--info)" }}>· live</span>}</p>
      <div className="agent-grid">
        {AGENTS.map((a) => {
          const s = byName[a.key];
          const active = current && current.agent === a.key;
          const recent = s?.last_run && withinHours(s.last_run, 1);
          const state = active ? "green" : s?.state === "red" ? "red" : (recent ? "green" : (s?.state || "gray"));
          const dot = state === "green" ? "var(--ok)" : state === "red" ? "var(--err)" : state === "yellow" ? "var(--warn)" : "var(--hair-strong)";
          return (
            <div key={a.key} className={`agent-cell${active ? " active" : ""}`} title={a.name}>
              <span className={`agent-avatar${active ? " spin" : ""}`}>{a.emoji}</span>
              <span className="agent-name">{a.name}</span>
              <span className="agent-when">
                <span className="status-dot" style={{ background: dot }} />
                {active ? <b style={{ color: "var(--accent)" }}>working…</b> : s?.last_run ? timeAgo(s.last_run) : "idle"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Telegram connection status + code.
function ConnectCard({ me, reloadMe }) {
  const u = me.user || {};
  const [busy, setBusy] = useState(false);
  const connected = u.telegram_connected;
  async function regen() { setBusy(true); try { await api.regenCode(); reloadMe(); } finally { setBusy(false); } }
  if (connected) {
    return (
      <div className="card" style={{ borderColor: "color-mix(in srgb, var(--ok) 45%, var(--hair))", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 650 }}>Telegram connected</div>
          <div className="hint">Jobs bot ✓ &nbsp;·&nbsp; Interview-prep bot ✓ — both linked. Open @interview_prep_coach_bot and press Start to use interview prep.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ borderColor: "color-mix(in srgb, var(--warn) 45%, var(--hair))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🔌</span><span style={{ fontWeight: 650 }}>Telegram not connected</span>
      </div>
      <div className="hint" style={{ margin: "6px 0 10px" }}>Send this code to the Jobs bot — it links the Interview-prep bot (and any future bots) automatically:</div>
      <div className="code-chip">{u.connection_code || "—"}</div>
      <div className="row-actions" style={{ marginTop: 10 }}>
        <a className="btn primary sm" href="https://t.me/jobs_finder_agent_bot" target="_blank" rel="noreferrer">Open Jobs bot</a>
        <a className="btn sm" href="https://t.me/interview_prep_coach_bot" target="_blank" rel="noreferrer">Interview bot</a>
        <button className="btn ghost sm" onClick={regen} disabled={busy}>New code</button>
      </div>
    </div>
  );
}

// Admin panel with switch-to-user.
function AdminPanel({ reloadMe, flash }) {
  const [users, setUsers] = useState(null);
  const load = useCallback(() => api.adminUsers().then((r) => setUsers(r.users)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!users) return <Loading />;
  async function act(u, action) {
    if (action === "delete" && !confirm(`Delete ${u.email}? This removes all their data.`)) return;
    await api.adminAction(u.id, action); flash(`${action} ${u.email}`); load();
  }
  return (
    <div className="fade">
      <p className="section-title">All users · {users.length}</p>
      {users.map((u) => (
        <div className="card" key={u.id}>
          <div className="job-top">
            <div>
              <div className="job-title" style={{ fontSize: 15 }}>{u.email} {u.is_admin && <span className="tag">admin</span>}</div>
              <div className="hint">{u.jobs} jobs · {u.applied} applied · {u.telegram_connected ? "TG ✓" : "TG ✗"} · {u.status} · active {timeAgo(u.last_active)}</div>
            </div>
          </div>
          {!u.is_admin && (
            <div className="row-actions">
              <button className="btn primary sm" onClick={async () => { await api.adminSwitch(u.id); reloadMe(); flash(`Viewing as ${u.email}`); }}>Switch to user</button>
              {u.status === "active"
                ? <button className="btn sm" onClick={() => act(u, "disable")}>Disable</button>
                : <button className="btn sm" onClick={() => act(u, "enable")}>Enable</button>}
              <button className="btn ghost sm" onClick={() => act(u, "delete")} style={{ color: "var(--err)" }}>Delete</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- All jobs ---------------- */
function AllJobs({ data, onApp, onSend }) {
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  if (!data) return <Loading />;
  const jobs = data.jobs || [];
  const apps = data.applications || [];
  const appMap = Object.fromEntries(apps.map((a) => [a.job_url, a.status]));
  const filtered = jobs.filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q.toLowerCase()));

  // match-score distribution
  const buckets = [[0, 55], [55, 70], [70, 85], [85, 101]];
  const dist = buckets.map(([lo, hi]) => ({ label: `${lo}–${hi === 101 ? 100 : hi}`, n: jobs.filter((j) => (j.match_score || 0) >= lo && (j.match_score || 0) < hi).length }));
  const maxN = Math.max(1, ...dist.map((d) => d.n));

  return (
    <div className="fade">
      <div className="field"><input placeholder="Search jobs…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {jobs.length > 0 && (
        <div className="card">
          <p className="section-title" style={{ marginTop: 0 }}>Match-score distribution</p>
          <div className="bars">
            {dist.map((d) => (
              <div className="bar-row" key={d.label}>
                <span className="num" style={{ color: "var(--muted)" }}>{d.label}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.n / maxN) * 100}%`, background: "var(--accent)" }} /></div>
                <span className="num" style={{ textAlign: "right" }}>{d.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {filtered.length === 0 ? <Empty title="No matching jobs" /> :
        filtered.map((j) => (
          <div key={j.id || j.url} onClick={(e) => { if (!["A", "SELECT", "OPTION", "BUTTON"].includes(e.target.tagName)) setDetail(j); }}>
            <JobCard job={j} appStatus={appMap[j.url]} onStatus={onApp} onSend={onSend} />
          </div>
        ))}
      {detail && <JobModal job={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function JobModal({ job, onClose }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal fade" onClick={(e) => e.stopPropagation()}>
        <div className="job-top">
          <div><div className="job-title">{job.title}</div><div className="job-sub">{job.company} · {job.location}</div></div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="job-meta">
          {job.remote && <span className="tag remote">Remote</span>}
          {job.salary && <span className="tag">{job.salary}</span>}
          {job.match_score != null && <span className="tag">{Math.round(job.match_score)}% match</span>}
          {job.source && <span className="tag">{job.source}</span>}
        </div>
        {job.why && <div className="why">🎯 {job.why}</div>}
        <p style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)", fontSize: 14 }}>{job.description || "No description captured."}</p>
        <div className="row-actions">
          {job.url && <a className="btn primary" href={job.url} target="_blank" rel="noreferrer">Apply</a>}
          {job.cv_url && <a className="btn" href={job.cv_url} target="_blank" rel="noreferrer">CV</a>}
          {job.cover_url && <a className="btn" href={job.cover_url} target="_blank" rel="noreferrer">Cover letter</a>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Applications ---------------- */
const PIPE = ["saved", "applied", "interview", "offer", "rejected"];
const PIPE_COLOR = { saved: "var(--muted)", applied: "var(--info)", interview: "var(--accent)", offer: "var(--ok)", rejected: "var(--err)" };

function Applications({ data }) {
  if (!data) return <Loading />;
  const apps = data.applications || [];
  const counts = Object.fromEntries(PIPE.map((s) => [s, apps.filter((a) => a.status === s).length]));
  const maxN = Math.max(1, ...Object.values(counts));

  return (
    <div className="fade">
      <div className="card">
        <p className="section-title" style={{ marginTop: 0 }}>Pipeline</p>
        <div className="funnel">
          {PIPE.map((s) => (
            <div className="bar-row" key={s} style={{ gridTemplateColumns: "84px 1fr 30px" }}>
              <span style={{ textTransform: "capitalize" }}>{s}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(counts[s] / maxN) * 100}%`, background: PIPE_COLOR[s] }} /></div>
              <span className="num" style={{ textAlign: "right" }}>{counts[s]}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="section-title">History</p>
      {apps.length === 0 ? <Empty icon="📮" title="No applications tracked yet" sub="Use the Track dropdown on any job." /> :
        apps.map((a) => (
          <div className="card" key={a.job_url + a.at}>
            <div className="job-top">
              <div><div className="job-title" style={{ fontSize: 15 }}>{a.title || a.job_url}</div><div className="job-sub">{a.company}</div></div>
              <span className="tag" style={{ color: PIPE_COLOR[a.status], borderColor: PIPE_COLOR[a.status], textTransform: "capitalize" }}>{a.status}</span>
            </div>
            <div className="hint">{a.job_url && <a href={a.job_url} target="_blank" rel="noreferrer">Open posting</a>} · {timeAgo(a.at)}</div>
          </div>
        ))}
    </div>
  );
}

/* ---------------- Agents ---------------- */
function Agents({ issues, status, latest }) {
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level !== "error");
  const [showWarns, setShowWarns] = useState(false);
  const running = latest?.status === "running";
  return (
    <div className="fade">
      <p className="section-title">🤖 Agent team {running && <span style={{ color: "var(--info)" }}>· live</span>}</p>
      <AgentTeam status={status} current={latest?.current} />

      <p className="section-title" style={{ marginTop: 18 }}>Live activity log</p>
      <LogTerminal latest={latest} />

      <p className="section-title" style={{ marginTop: 18 }}>Errors (48h)</p>
      {errors.length === 0 ? <div className="hint" style={{ padding: "0 2px 12px" }}>No errors 🎉</div> :
        errors.slice(0, 30).map((i, k) => (
          <div className="issue error" key={k}><div>{i.message}</div><div className="meta">{i.script} · {timeAgo(i.at)}</div></div>
        ))}

      <button className="btn sm ghost" onClick={() => setShowWarns((v) => !v)}>{showWarns ? "Hide" : "Show"} warnings ({warns.length})</button>
      {showWarns && warns.slice(0, 40).map((i, k) => (
        <div className="issue warning" key={k} style={{ marginTop: 8 }}><div>{i.message}</div><div className="meta">{i.script} · {timeAgo(i.at)}</div></div>
      ))}
    </div>
  );
}

/* ---------------- utils ---------------- */
function withinHours(iso, hours) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < hours * 3600 * 1000;
}
function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

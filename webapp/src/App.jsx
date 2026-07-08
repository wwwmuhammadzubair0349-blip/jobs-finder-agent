import React, { useEffect, useState, useCallback, useRef } from "react";
import { api } from "./api";
import Login from "./Login";
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
  { id: "issues", label: "Issues", icon: IconAlert },
];

export default function App() {
  const [user, setUser] = useState(undefined); // undefined=loading, null=logged out
  const [theme, setTheme] = useState(() => localStorage.getItem("jf_theme") || "");

  useEffect(() => { api.me().then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  useEffect(() => {
    if (theme) { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("jf_theme", theme); }
  }, [theme]);

  if (user === undefined) return <div className="login-wrap"><div className="pill">Loading…</div></div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Dashboard user={user} onLogout={() => { api.logout(); setUser(null); }} theme={theme} setTheme={setTheme} />;
}

function Dashboard({ user, onLogout, theme, setTheme }) {
  const [tab, setTab] = useState("today");
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [toast, setToast] = useState("");
  const [running, setRunning] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try { setData(await api.data()); }
    catch (e) { if (e.unauthorized) onLogout(); }
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
    setRunning(true);
    try { await api.runNow(); flash("Run triggered"); }
    catch (e) { flash(e.message || "Run failed"); }
    finally { setTimeout(() => setRunning(false), 4000); }
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

      <div className="content">
        {tab === "today" && <Today data={data} onApp={setApp} />}
        {tab === "jobs" && <AllJobs data={data} onApp={setApp} />}
        {tab === "apps" && <Applications data={data} />}
        {tab === "profile" && (config ? <ProfileEditor key="p" initial={config.profile} onSave={saveConfig} /> : <Loading />)}
        {tab === "search" && (config ? <SearchEditor key="s" initial={config.search} onSave={saveConfig} /> : <Loading />)}
        {tab === "schedule" && (config ? <ScheduleEditor key="c" initial={config.schedule} onSave={saveConfig} /> : <Loading />)}
        {tab === "issues" && <Issues issues={issues} status={data?.agents_status || []} />}
      </div>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} style={{ position: "relative" }}>
            <t.icon />
            {t.id === "issues" && errCount > 0 && <span className="badge">{errCount}</span>}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

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

/* ---------------- Today ---------------- */
function Today({ data, onApp }) {
  if (!data) return <Loading />;
  const recent = data.recent_jobs || [];
  const apps = data.applications || [];
  const appMap = Object.fromEntries(apps.map((a) => [a.job_url, a.status]));
  const topMatch = recent.reduce((m, j) => Math.max(m, j.match_score || 0), 0);
  const cvsReady = recent.filter((j) => j.cv_url).length;
  const weekApps = apps.filter((a) => withinHours(a.at, 168)).length;

  return (
    <div className="fade">
      <div className="kpis">
        <Kpi value={recent.length} label="Jobs found" />
        <Kpi value={`${Math.round(topMatch)}%`} label="Top match" />
        <Kpi value={cvsReady} label="CVs ready" />
        <Kpi value={weekApps} label="Applied / week" />
      </div>
      <p className="section-title">Fresh matches</p>
      {recent.length === 0
        ? <Empty icon="🛰" title="No jobs yet" sub="The next search tick will drop new matches here." />
        : recent.map((j) => <JobCard key={j.id || j.url} job={j} appStatus={appMap[j.url]} onStatus={onApp} />)}
    </div>
  );
}

/* ---------------- All jobs ---------------- */
function AllJobs({ data, onApp }) {
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
          <div key={j.id || j.url} onClick={(e) => { if (e.target.tagName !== "A" && e.target.tagName !== "SELECT" && e.target.tagName !== "OPTION") setDetail(j); }}>
            <JobCard job={j} appStatus={appMap[j.url]} onStatus={onApp} />
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

/* ---------------- Issues ---------------- */
function Issues({ issues, status }) {
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level !== "error");
  const [showWarns, setShowWarns] = useState(false);
  return (
    <div className="fade">
      <p className="section-title">Agent health</p>
      <div className="card">
        {status.length === 0 ? <div className="hint">No status recorded yet.</div> :
          status.map((s) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <span className={`status-dot dot-${s.state === "green" ? "green" : s.state === "red" ? "red" : "yellow"}`} />
              <span style={{ flex: 1 }}>{s.name}</span>
              <span className="hint">{timeAgo(s.last_run)}</span>
            </div>
          ))}
      </div>

      <p className="section-title">Errors (48h)</p>
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

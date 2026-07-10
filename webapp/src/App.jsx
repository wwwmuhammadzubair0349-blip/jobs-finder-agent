import React, { useEffect, useState, useCallback, useRef } from "react";
import { api } from "./api";
import Login from "./Login";
import Tour from "./Tour";
import { Kpi, JobCard, Empty } from "./parts";
import { ProfileEditor, SearchEditor, ScheduleEditor, AutoApplyEditor } from "./Editors";
import { IconToday, IconJobs, IconApps, IconProfile, IconSearch, IconClock, IconAlert, IconRun, IconRefresh, IconOut, IconSun, IconGlobe } from "./icons";

const TABS = [
  { id: "today", label: "Today", icon: IconToday },
  { id: "jobs", label: "My jobs", icon: IconJobs },
  { id: "pool", label: "All jobs", icon: IconGlobe },
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
  // Profile popup shows once per session — the in-page CTAs carry it after that.
  const [nagDismissed, setNagDismissed] = useState(() => !!sessionStorage.getItem("jf_nag_done"));
  const dismissNag = () => { sessionStorage.setItem("jf_nag_done", "1"); setNagDismissed(true); };
  const pollRef = useRef(null);
  const lastJson = useRef("");
  const complete = isProfileComplete(config);
  // Deep link: /?job=<slug> → open All jobs focused on that job.
  const [targetSlug, setTargetSlug] = useState(() => new URLSearchParams(window.location.search).get("job") || "");
  useEffect(() => {
    if (targetSlug) { setTab("pool"); window.history.replaceState({}, "", "/"); }
  }, []); // eslint-disable-line

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

  async function shareJob(job) {
    if (!job.slug) return;
    const url = `${window.location.origin}/jobs/${job.slug}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${job.title} at ${job.company}`, url }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(url); flash("Job link copied 🔗"); } catch {}
  }

  const issues = data?.issues || [];
  const errCount = issues.filter((i) => i.level === "error" && withinHours(i.at, 48)).length;

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand"><span className="brand-badge">JF</span>Jobs Finder<span className="dot">.</span></span>
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
        {tab === "today" && <Today me={me} data={data} onApp={setApp} onSend={sendJob} onShare={shareJob} reloadMe={reloadMe} complete={complete} goProfile={() => setTab("profile")} onRun={runNow} />}
        {tab === "admin" && <AdminPanel reloadMe={reloadMe} flash={flash} />}
        {tab === "jobs" && <AllJobs data={data} onApp={setApp} onSend={sendJob} onShare={shareJob} complete={complete} goProfile={() => setTab("profile")} onRun={runNow} />}
        {tab === "pool" && <PoolTab targetSlug={targetSlug} clearTarget={() => setTargetSlug("")} onShare={shareJob} />}
        {tab === "apps" && <Applications data={data} />}
        {tab === "profile" && (config ? <ProfileEditor key="p" initial={config.profile} onSave={saveConfig} /> : <Loading />)}
        {tab === "search" && (config ? <SearchEditor key="s" initial={config.search} onSave={saveConfig} /> : <Loading />)}
        {tab === "schedule" && (config ? <><ScheduleEditor key="c" initial={config.schedule} onSave={saveConfig} /><AutoApplyEditor key="aa" initial={config.auto_apply || {}} onSave={saveConfig} /></> : <Loading />)}
      </div>

      <nav className="tabbar">
        <div className="side-brand">
          <span className="brand-badge">JF</span>
          <span className="side-brand-word">Jobs Finder<span style={{ color: "var(--accent)" }}>.</span></span>
        </div>
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
        <div className="modal-back" onClick={dismissNag}>
          <div className="tour-card fade" onClick={(e) => e.stopPropagation()}>
            <div className="tour-emoji">📝</div>
            <h2>Complete your profile</h2>
            <p>Add your name, job titles and skills so the agents can find and tailor jobs for you. It takes 2 minutes and it's what makes the matches great.</p>
            <div className="tour-actions">
              <button className="btn ghost" onClick={dismissNag}>Later</button>
              <button className="btn primary" onClick={() => { setTab("profile"); dismissNag(); }}>Complete profile</button>
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
  applicant: "🤖 Auto-applying for you",
};

// Agent-team cards (user-facing). Link Checker & Publisher run in the
// background but are hidden here to keep the team focused on what the user sees.
const AGENTS = [
  { key: "collect_jobs", name: "Scraper", emoji: "🔎" },
  { key: "agent_analyst", name: "Analyst", emoji: "🧠" },
  { key: "rank_jobs", name: "Ranker", emoji: "📊" },
  { key: "cv_writer", name: "CV Writer", emoji: "✍️" },
  { key: "cl_writer", name: "Cover Letter Writer", emoji: "✉️" },
  { key: "render_cv", name: "Designer", emoji: "📄" },
  { key: "send_telegram", name: "Telegram", emoji: "✈️" },
  { key: "applicant", name: "Applicant", emoji: "🤖" },
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
// Empty-state CTA: profile not complete → the app is never "empty", it always
// shows the next step instead.
function ProfileCta({ goProfile }) {
  return (
    <div className="card">
      <div className="empty" style={{ padding: "28px 14px" }}>
        <div className="big">📝</div>
        <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17.5, color: "var(--ink)", textWrap: "balance" }}>
          Complete your profile to start getting jobs
        </div>
        <div style={{ fontSize: 13.5, marginTop: 6, maxWidth: "36ch", marginInline: "auto" }}>
          Your agents can't search until they know who you are. Add your name, job titles and skills — it takes 2 minutes.
        </div>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={goProfile}>Complete profile →</button>
      </div>
    </div>
  );
}

// Profile done, jobs just haven't arrived yet → show life, not a dead end.
function HuntingCta({ onRun }) {
  return (
    <div className="card">
      <div className="empty" style={{ padding: "28px 14px" }}>
        <div className="big">🛰</div>
        <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17.5, color: "var(--ink)" }}>
          Your agents are on the hunt
        </div>
        <div style={{ fontSize: 13.5, marginTop: 6, maxWidth: "36ch", marginInline: "auto" }}>
          First matches usually land within ~20 minutes. Want them sooner?
        </div>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={onRun}>▶ Run first search now</button>
      </div>
    </div>
  );
}

// Setup checklist — visible until profile + Telegram are both done.
function SetupChecklist({ complete, telegram, goProfile }) {
  if (complete && telegram) return null;
  return (
    <div className="card">
      <p className="section-title" style={{ margin: "0 0 8px" }}>Getting set up</p>
      <div className="check-row" role={!complete ? "button" : undefined} onClick={!complete ? goProfile : undefined}>
        <span className={`check-dot ${complete ? "done" : ""}`}>{complete ? "✓" : "1"}</span>
        <div style={{ flex: 1 }}>
          <div className="check-title">Complete your profile</div>
          <div className="hint">{complete ? "Done — your agents know who you are." : "Name, job titles & skills — powers every match."}</div>
        </div>
        {!complete && <span className="btn primary sm">Do it</span>}
      </div>
      <div className="check-row">
        <span className={`check-dot ${telegram ? "done" : ""}`}>{telegram ? "✓" : "2"}</span>
        <div style={{ flex: 1 }}>
          <div className="check-title">Connect Telegram</div>
          <div className="hint">{telegram ? "Connected — jobs arrive on your phone." : "Use the card below — send your code to the Jobs bot."}</div>
        </div>
      </div>
    </div>
  );
}

function Today({ me, data, onApp, onSend, onShare, reloadMe, complete, goProfile, onRun }) {
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

      <SetupChecklist complete={complete} telegram={me.user?.telegram_connected} goProfile={goProfile} />

      <ConnectCard me={me} reloadMe={reloadMe} />

      <AgentGrid status={data.agents_status || []} current={data.latest_run?.current} running={data.latest_run?.status === "running"} />

      <p className="section-title">{titleMap[filter]} · {shown.length}</p>
      {shown.length === 0
        ? (!complete
            ? <ProfileCta goProfile={goProfile} />
            : (filter === "today" || filter === "total")
              ? <HuntingCta onRun={onRun} />
              : <Empty icon="🗂" title={`No ${titleMap[filter].toLowerCase()} yet`} sub="Tap another stat above." />)
        : <div className="job-list">{shown.map((j) => <JobCard key={j.id || j.url} job={j} appStatus={appMap[j.url]} onStatus={onApp} onSend={onSend} onShare={onShare} />)}</div>}
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
          const ms = s?.last_run ? (Date.now() - new Date(s.last_run).getTime()) : Infinity;
          const active = ms < 45000;          // this user's agent worked in the last 45s
          const recent = ms < 3600000;        // within the last hour
          const state = active || recent ? "green" : s?.state === "red" ? "red" : (s?.state || "gray");
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
  const [copied, setCopied] = useState(false);
  const connected = u.telegram_connected;
  async function regen() { setBusy(true); try { await api.regenCode(); reloadMe(); } finally { setBusy(false); } }
  async function copyCode() {
    try { await navigator.clipboard.writeText(u.connection_code || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  if (connected) {
    return (
      <div className="card" style={{ borderColor: "color-mix(in srgb, var(--ok) 45%, var(--hair))", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 650 }}>Telegram connected</div>
          <div className="hint">Jobs, CVs & interview prep arrive on your phone.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ borderColor: "color-mix(in srgb, var(--warn) 45%, var(--hair))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🔌</span><span style={{ fontWeight: 650 }}>Telegram not connected</span>
      </div>
      <div className="hint" style={{ margin: "6px 0 10px" }}>Open our Jobs bot and send it this code — everything connects with that one code:</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="code-chip">{u.connection_code || "—"}</div>
        <button className="btn sm" onClick={copyCode}>{copied ? "✓ Copied" : "📋 Copy"}</button>
      </div>
      <div className="row-actions" style={{ marginTop: 10 }}>
        <a className="btn primary sm" href="https://t.me/jobs_finder_agent_bot" target="_blank" rel="noreferrer">✈ Open Jobs bot</a>
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
function AllJobs({ data, onApp, onSend, onShare, complete, goProfile, onRun }) {
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
      {jobs.length === 0 ? (!complete ? <ProfileCta goProfile={goProfile} /> : <HuntingCta onRun={onRun} />) :
       filtered.length === 0 ? <Empty title="No matching jobs" /> :
        <div className="job-list">
          {filtered.map((j) => (
            <div key={j.id || j.url} onClick={(e) => { if (!["A", "SELECT", "OPTION", "BUTTON"].includes(e.target.tagName)) setDetail(j); }}>
              <JobCard job={j} appStatus={appMap[j.url]} onStatus={onApp} onSend={onSend} onShare={onShare} />
            </div>
          ))}
        </div>}
      {detail && <JobModal job={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ---------------- All jobs (global pool) ---------------- */
function PoolTab({ targetSlug, clearTarget, onShare }) {
  const [jobs, setJobs] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await api.pool();
        let list = r.jobs || [];
        if (targetSlug) {
          let hit = list.find((j) => j.slug === targetSlug);
          if (!hit) {
            const single = await api.pool("", targetSlug);
            hit = (single.jobs || [])[0];
            if (hit) list = [hit, ...list];
          } else {
            list = [hit, ...list.filter((j) => j.slug !== targetSlug)];
          }
        }
        if (live) setJobs(list);
      } catch { if (live) setJobs([]); }
    })();
    return () => { live = false; };
  }, [targetSlug]);

  if (!jobs) return <Loading />;
  const filtered = jobs.filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fade">
      <div className="field"><input placeholder="Search all discovered jobs…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p className="section-title">Every job we've discovered · {filtered.length}</p>
      {filtered.length === 0 ? <Empty icon="🌍" title="Nothing found" sub="Try a different search." /> :
        <div className="job-list">
          {filtered.map((j) => (
            <div key={j.id} className="card" style={j.slug === targetSlug ? { borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-weak)" } : {}}>
              {j.slug === targetSlug && <div className="tag" style={{ marginBottom: 8, color: "var(--accent)", borderColor: "var(--accent)" }}>🔗 Shared job</div>}
              <div className="job-title">{j.title}</div>
              <div className="job-sub">{j.company}{j.location ? ` · ${j.location}` : ""}</div>
              <div className="job-meta">
                {j.remote && <span className="tag remote">🌍 Remote</span>}
                {j.salary && <span className="tag">💰 {j.salary}</span>}
                {j.source && <span className="tag">{j.source}</span>}
              </div>
              {j.description && <div className="hint" style={{ margin: "4px 0 8px" }}>{j.description.slice(0, 150)}…</div>}
              <div className="row-actions">
                {j.url && <a className="btn primary sm" href={j.url} target="_blank" rel="noreferrer">Apply <IconExtMini /></a>}
                <button className="btn sm" onClick={() => onShare(j)}>🔗 Share</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}
const IconExtMini = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>);

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

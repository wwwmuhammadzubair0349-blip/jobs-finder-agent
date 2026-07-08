import React, { useState } from "react";

const listToStr = (a) => (Array.isArray(a) ? a.join(", ") : "");
const strToList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

function SaveBar({ dirty, busy, onSave, saved }) {
  return (
    <div style={{ position: "sticky", bottom: 88, marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
      {saved && <span style={{ color: "var(--ok)", fontSize: 13 }}>✓ Saved</span>}
      <button className="btn primary" disabled={!dirty || busy} onClick={onSave}>{busy ? "Saving…" : "Save changes"}</button>
    </div>
  );
}

/* ---------------- Profile ---------------- */
export function ProfileEditor({ initial, onSave }) {
  const [p, setP] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setP((o) => ({ ...o, [k]: v })); setDirty(true); setSaved(false); };
  const setLink = (k, v) => { setP((o) => ({ ...o, links: { ...(o.links || {}), [k]: v } })); setDirty(true); setSaved(false); };

  const setExp = (i, k, v) => { const e = [...(p.experience || [])]; e[i] = { ...e[i], [k]: v }; set("experience", e); };
  const setBul = (i, v) => setExp(i, "bullets", v.split("\n").filter((x) => x.trim() !== "").length ? v.split("\n") : []);
  const addExp = () => set("experience", [...(p.experience || []), { title: "", company: "", location: "", start: "", end: "", bullets: [] }]);
  const rmExp = (i) => set("experience", (p.experience || []).filter((_, x) => x !== i));

  const setEdu = (i, k, v) => { const e = [...(p.education || [])]; e[i] = { ...e[i], [k]: v }; set("education", e); };
  const addEdu = () => set("education", [...(p.education || []), { degree: "", school: "", year: "" }]);
  const rmEdu = (i) => set("education", (p.education || []).filter((_, x) => x !== i));

  async function save() {
    setBusy(true);
    try { await onSave("profile", p); setDirty(false); setSaved(true); }
    finally { setBusy(false); }
  }

  return (
    <div className="fade">
      <p className="section-title">Identity</p>
      <div className="grid2">
        <div className="field"><label>Full name</label><input value={p.full_name || ""} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div className="field"><label>Headline</label><input value={p.headline || ""} onChange={(e) => set("headline", e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Location</label><input value={p.location || ""} onChange={(e) => set("location", e.target.value)} /></div>
        <div className="field"><label>Phone</label><input value={p.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
      </div>
      <div className="field"><label>Email</label><input value={p.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label>LinkedIn</label><input value={p.links?.linkedin || ""} onChange={(e) => setLink("linkedin", e.target.value)} /></div>
        <div className="field"><label>GitHub</label><input value={p.links?.github || ""} onChange={(e) => setLink("github", e.target.value)} /></div>
      </div>
      <div className="field"><label>Portfolio</label><input value={p.links?.portfolio || ""} onChange={(e) => setLink("portfolio", e.target.value)} /></div>

      <p className="section-title">Summary & skills</p>
      <div className="field"><label>Professional summary</label><textarea value={p.professional_summary || ""} onChange={(e) => set("professional_summary", e.target.value)} /><div className="hint">Baseline — the AI rewrites this per job.</div></div>
      <div className="field"><label>Skills (comma-separated)</label><input value={listToStr(p.skills)} onChange={(e) => set("skills", strToList(e.target.value))} /></div>
      <div className="field"><label>Tools (comma-separated)</label><input value={listToStr(p.tools)} onChange={(e) => set("tools", strToList(e.target.value))} /></div>
      <div className="field"><label>Languages (comma-separated)</label><input value={listToStr(p.languages)} onChange={(e) => set("languages", strToList(e.target.value))} /></div>

      <p className="section-title">Experience</p>
      {(p.experience || []).map((x, i) => (
        <div className="card" key={i}>
          <div className="grid2">
            <div className="field"><label>Title</label><input value={x.title || ""} onChange={(e) => setExp(i, "title", e.target.value)} /></div>
            <div className="field"><label>Company</label><input value={x.company || ""} onChange={(e) => setExp(i, "company", e.target.value)} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Start (YYYY-MM)</label><input value={x.start || ""} onChange={(e) => setExp(i, "start", e.target.value)} /></div>
            <div className="field"><label>End</label><input value={x.end || ""} onChange={(e) => setExp(i, "end", e.target.value)} /></div>
          </div>
          <div className="field"><label>Location</label><input value={x.location || ""} onChange={(e) => setExp(i, "location", e.target.value)} /></div>
          <div className="field"><label>Bullets (one per line)</label><textarea value={(x.bullets || []).join("\n")} onChange={(e) => setBul(i, e.target.value)} /></div>
          <button className="btn ghost sm" onClick={() => rmExp(i)}>Remove</button>
        </div>
      ))}
      <button className="btn sm" onClick={addExp}>+ Add experience</button>

      <p className="section-title" style={{ marginTop: 20 }}>Education</p>
      {(p.education || []).map((x, i) => (
        <div className="card" key={i}>
          <div className="grid2">
            <div className="field"><label>Degree</label><input value={x.degree || ""} onChange={(e) => setEdu(i, "degree", e.target.value)} /></div>
            <div className="field"><label>Year</label><input value={x.year || ""} onChange={(e) => setEdu(i, "year", e.target.value)} /></div>
          </div>
          <div className="field"><label>School</label><input value={x.school || ""} onChange={(e) => setEdu(i, "school", e.target.value)} /></div>
          <button className="btn ghost sm" onClick={() => rmEdu(i)}>Remove</button>
        </div>
      ))}
      <button className="btn sm" onClick={addEdu}>+ Add education</button>

      <p className="section-title" style={{ marginTop: 20 }}>Targets</p>
      <div className="field"><label>Target roles (comma-separated)</label><input value={listToStr(p.target_roles)} onChange={(e) => set("target_roles", strToList(e.target.value))} /></div>
      <div className="grid2">
        <div className="field"><label>Seniority</label>
          <select value={p.seniority || "mid"} onChange={(e) => set("seniority", e.target.value)}>
            {["junior", "mid", "senior", "lead", "principal"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>Work preference</label>
          <select value={p.work_pref || "remote"} onChange={(e) => set("work_pref", e.target.value)}>
            {["remote", "hybrid", "onsite"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="grid2">
        <div className="field"><label>Minimum salary</label><input type="number" value={p.min_salary || 0} onChange={(e) => set("min_salary", parseInt(e.target.value || "0", 10))} /></div>
        <div className="field"><label className="checkbox"><input type="checkbox" checked={!!p.willing_to_relocate} onChange={(e) => set("willing_to_relocate", e.target.checked)} /> Willing to relocate</label></div>
      </div>

      <SaveBar dirty={dirty} busy={busy} saved={saved} onSave={save} />
    </div>
  );
}

/* ---------------- Search ---------------- */
const ALL_SOURCES = ["remotive", "remoteok", "adzuna", "jooble", "apify"];

export function SearchEditor({ initial, onSave }) {
  const [s, setS] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setS((o) => ({ ...o, [k]: v })); setDirty(true); setSaved(false); };
  const toggleSource = (src) => {
    const cur = new Set(s.sources || []);
    cur.has(src) ? cur.delete(src) : cur.add(src);
    set("sources", ALL_SOURCES.filter((x) => cur.has(x)));
  };
  async function save() { setBusy(true); try { await onSave("search", s); setDirty(false); setSaved(true); } finally { setBusy(false); } }

  return (
    <div className="fade">
      <div className="field"><label>Job titles (comma-separated)</label><input value={listToStr(s.job_titles)} onChange={(e) => set("job_titles", strToList(e.target.value))} /></div>
      <div className="field"><label>Locations (comma-separated)</label><input value={listToStr(s.locations)} onChange={(e) => set("locations", strToList(e.target.value))} /></div>
      <div className="field"><label className="checkbox"><input type="checkbox" checked={!!s.remote} onChange={(e) => set("remote", e.target.checked)} /> Remote roles</label></div>
      <div className="field"><label>Keywords to include</label><input value={listToStr(s.keywords_include)} onChange={(e) => set("keywords_include", strToList(e.target.value))} /></div>
      <div className="field"><label>Keywords to exclude</label><input value={listToStr(s.keywords_exclude)} onChange={(e) => set("keywords_exclude", strToList(e.target.value))} /></div>

      <div className="field">
        <label>Sources</label>
        <div className="job-meta">
          {ALL_SOURCES.map((src) => {
            const on = (s.sources || []).includes(src);
            return <button key={src} className="tag" style={on ? { background: "var(--accent-weak)", borderColor: "var(--accent)", color: "var(--accent)" } : {}} onClick={() => toggleSource(src)}>{on ? "✓ " : ""}{src}</button>;
          })}
        </div>
        <div className="hint">remotive & remoteok need no key. adzuna/jooble need a free key; apify costs credits (throttled).</div>
      </div>

      <div className="field">
        <label>Adzuna country</label>
        <select value={s.adzuna_country || "gb"} onChange={(e) => set("adzuna_country", e.target.value)}>
          {[["au","Australia"],["gb","United Kingdom"],["us","United States"],["ca","Canada"],["de","Germany"],["fr","France"],["in","India"],["nz","New Zealand"],["nl","Netherlands"],["sg","Singapore"],["za","South Africa"],["ae","UAE"]].map(([c,n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        <div className="hint">Which country's Adzuna database to search. Change anytime — not fixed in code.</div>
      </div>
      <div className="grid2">
        <div className="field"><label>Posted within (days)</label><input type="number" value={s.posted_within_days ?? 7} onChange={(e) => set("posted_within_days", parseInt(e.target.value || "7", 10))} /></div>
        <div className="field"><label>Match threshold (0–100)</label><input type="number" value={s.match_threshold ?? 55} onChange={(e) => set("match_threshold", parseInt(e.target.value || "55", 10))} /></div>
      </div>
      <div className="field"><label>Max new jobs per check</label><input type="number" value={s.max_per_tick ?? 5} onChange={(e) => set("max_per_tick", parseInt(e.target.value || "5", 10))} /><div className="hint">Caps how many NEW jobs get fully processed each tick; the rest carry over.</div></div>

      <SaveBar dirty={dirty} busy={busy} saved={saved} onSave={save} />
    </div>
  );
}

/* ---------------- Schedule ---------------- */
export function ScheduleEditor({ initial, onSave }) {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [s, setS] = useState({ ...initial, timezone: initial.timezone || browserTz });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [quietOn, setQuietOn] = useState(!!initial.quiet_hours);
  const set = (k, v) => { setS((o) => ({ ...o, [k]: v })); setDirty(true); setSaved(false); };
  const setQuiet = (k, v) => { setS((o) => ({ ...o, quiet_hours: { ...(o.quiet_hours || { start: "00:00", end: "07:00" }), [k]: v } })); setDirty(true); setSaved(false); };

  async function save() {
    setBusy(true);
    const payload = { ...s, timezone: browserTz, quiet_hours: quietOn ? (s.quiet_hours || { start: "00:00", end: "07:00" }) : null };
    try { await onSave("schedule", payload); setDirty(false); setSaved(true); } finally { setBusy(false); }
  }

  return (
    <div className="fade">
      <div className="card">
        <div className="job-sub" style={{ marginBottom: 10 }}>Runs continuously (24/7). This sets how often it checks and whether to stay quiet overnight.</div>
        <div className="field">
          <label>Check every</label>
          <select value={s.check_every_min || 30} onChange={(e) => { set("check_every_min", parseInt(e.target.value, 10)); }}>
            {[15, 20, 30, 45, 60, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
          <div className="hint">The GitHub Actions cron is the hard floor (default every 20 min). This value is advisory unless the cron is set lower.</div>
        </div>
        <div className="field"><label className="checkbox"><input type="checkbox" checked={quietOn} onChange={(e) => { setQuietOn(e.target.checked); setDirty(true); setSaved(false); }} /> Quiet hours (hold notifications)</label></div>
        {quietOn && (
          <div className="grid2">
            <div className="field"><label>From</label><input type="time" value={s.quiet_hours?.start || "00:00"} onChange={(e) => setQuiet("start", e.target.value)} /></div>
            <div className="field"><label>To</label><input type="time" value={s.quiet_hours?.end || "07:00"} onChange={(e) => setQuiet("end", e.target.value)} /></div>
          </div>
        )}
        <div className="field"><label>Timezone (auto-detected)</label><input value={browserTz} disabled /></div>
      </div>
      <SaveBar dirty={dirty} busy={busy} saved={saved} onSave={save} />
    </div>
  );
}

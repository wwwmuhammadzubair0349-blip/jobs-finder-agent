import React, { useState } from "react";
import { limitFor, UNLIMITED, PLAN_EMOJI } from "./plans";
import { COUNTRIES, ADZUNA, nameOf } from "./countries";

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

/* ---------------- Auto-apply (autopilot) ---------------- */
export function AutoApplyEditor({ initial, onSave, plan = "free" }) {
  const planCap = limitFor(plan, "autoapply");
  const [a, setA] = useState({
    enabled: !!initial.enabled,
    gmail_address: initial.gmail_address || "",
    min_score: initial.min_score ?? 70,
    daily_cap: Math.min(initial.daily_cap ?? 10, planCap),
  });
  const [pw, setPw] = useState("");
  const [hasPw, setHasPw] = useState(!!initial.has_password);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setA((o) => ({ ...o, [k]: v })); setDirty(true); setSaved(false); };

  async function save() {
    setBusy(true);
    const payload = { ...a };
    if (pw.trim()) payload.gmail_app_password = pw.trim();
    try {
      await onSave("auto_apply", payload);
      if (pw.trim()) setHasPw(true);
      setPw(""); setDirty(false); setSaved(true);
    } finally { setBusy(false); }
  }

  const ready = a.gmail_address && (hasPw || pw.trim());

  return (
    <div className="fade">
      <div className="card" style={{ borderColor: a.enabled ? "color-mix(in srgb, var(--ok) 45%, var(--hair))" : "var(--hair)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🤖</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Auto-apply (autopilot)</div>
            <div className="hint">When a strong match appears, we apply for you automatically — emailing your tailored CV + cover letter to the job's contact, or submitting standard application forms. From <b>your own Gmail</b>, so replies come straight to you.</div>
          </div>
        </div>

        <label className="checkbox" style={{ margin: "14px 0 4px" }}>
          <input type="checkbox" checked={a.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          <b>Enable auto-apply</b>
        </label>
        {a.enabled && !ready && <div className="hint" style={{ color: "var(--warn)" }}>Add your Gmail + app password below to start.</div>}

        <div className="field" style={{ marginTop: 12 }}>
          <label>Your Gmail address</label>
          <input type="email" value={a.gmail_address} onChange={(e) => set("gmail_address", e.target.value)} placeholder="you@gmail.com" />
        </div>

        <div className="field">
          <label>Gmail App Password {hasPw && <span style={{ color: "var(--ok)" }}>· saved ✓</span>}</label>
          <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setDirty(true); setSaved(false); }} placeholder={hasPw ? "•••• saved — type to replace" : "16-character app password"} autoComplete="new-password" />
          <div className="hint">
            Not your normal password — a one-off code from Google.
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"> Create an app password →</a> (needs 2-Step Verification on). Stored encrypted; revoke anytime.
          </div>
        </div>

        <div className="grid2">
          <div className="field"><label>Only apply if match ≥</label><input type="number" min="0" max="100" value={a.min_score} onChange={(e) => set("min_score", parseInt(e.target.value || "70", 10))} /><div className="hint">Recommended 70+</div></div>
          <div className="field"><label>Max applications / day</label><input type="number" min="1" max={planCap} value={a.daily_cap} onChange={(e) => set("daily_cap", Math.min(parseInt(e.target.value || "1", 10), planCap))} /><div className="hint">Your plan allows up to <b>{planCap}</b>/day {PLAN_EMOJI[plan] || ""}</div></div>
        </div>

        <div className="hint" style={{ marginTop: 4 }}>You get a Telegram receipt for every application, and you can turn this off anytime.</div>
      </div>
      <SaveBar dirty={dirty} busy={busy} saved={saved} onSave={save} />
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

  const setProj = (i, k, v) => { const e = [...(p.projects || [])]; e[i] = { ...e[i], [k]: v }; set("projects", e); };
  const addProj = () => set("projects", [...(p.projects || []), { name: "", description: "" }]);
  const rmProj = (i) => set("projects", (p.projects || []).filter((_, x) => x !== i));

  const setAward = (i, k, v) => { const e = [...(p.awards || [])]; e[i] = { ...e[i], [k]: v }; set("awards", e); };
  const addAward = () => set("awards", [...(p.awards || []), { name: "", issuer: "", year: "" }]);
  const rmAward = (i) => set("awards", (p.awards || []).filter((_, x) => x !== i));

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

      <p className="section-title" style={{ marginTop: 20 }}>Key achievements</p>
      <div className="field">
        <textarea value={(p.achievements || []).join("\n")} onChange={(e) => set("achievements", e.target.value.split("\n").filter((x) => x.trim() !== ""))} placeholder="One achievement per line — awards, savings, projects delivered, targets exceeded…" />
        <div className="hint">Concrete wins with numbers where you have them. One per line.</div>
      </div>

      <p className="section-title" style={{ marginTop: 20 }}>Projects</p>
      {(p.projects || []).map((x, i) => (
        <div className="card" key={i}>
          <div className="field"><label>Project name</label><input value={x.name || ""} onChange={(e) => setProj(i, "name", e.target.value)} /></div>
          <div className="field"><label>What you did</label><textarea value={x.description || ""} onChange={(e) => setProj(i, "description", e.target.value)} /></div>
          <button className="btn ghost sm" onClick={() => rmProj(i)}>Remove</button>
        </div>
      ))}
      <button className="btn sm" onClick={addProj}>+ Add project</button>

      <p className="section-title" style={{ marginTop: 20 }}>Awards & honours</p>
      {(p.awards || []).map((x, i) => (
        <div className="card" key={i}>
          <div className="grid2">
            <div className="field"><label>Award</label><input value={x.name || ""} onChange={(e) => setAward(i, "name", e.target.value)} /></div>
            <div className="field"><label>Year</label><input value={x.year || ""} onChange={(e) => setAward(i, "year", e.target.value)} /></div>
          </div>
          <div className="field"><label>Issuer</label><input value={x.issuer || ""} onChange={(e) => setAward(i, "issuer", e.target.value)} /></div>
          <button className="btn ghost sm" onClick={() => rmAward(i)}>Remove</button>
        </div>
      ))}
      <button className="btn sm" onClick={addAward}>+ Add award</button>

      <p className="section-title" style={{ marginTop: 20 }}>Professional memberships</p>
      <div className="field">
        <input value={listToStr(p.memberships)} onChange={(e) => set("memberships", strToList(e.target.value))} placeholder="e.g. IEEE, Engineering Council (comma-separated)" />
      </div>

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

export function SearchEditor({ initial, onSave, plan = "free" }) {
  const maxCountries = limitFor(plan, "countries");
  // Source of truth for country selection = a Set of country codes. If the
  // saved selection exceeds the current plan's limit (e.g. after a downgrade),
  // trim it and prompt the user to save.
  const initAll = (initial.countries && initial.countries.length) ? initial.countries : (initial.adzuna_countries || []);
  const overLimit = initAll.length > maxCountries;
  const [s, setS] = useState(initial);
  const [sel, setSel] = useState(new Set(initAll.slice(0, maxCountries)));
  const [dirty, setDirty] = useState(overLimit);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nudge, setNudge] = useState(overLimit ? `Your plan allows ${maxCountries} ${maxCountries === 1 ? "country" : "countries"} — extras were removed. Save to apply.` : "");
  const set = (k, v) => { setS((o) => ({ ...o, [k]: v })); setDirty(true); setSaved(false); };
  function addCountry(c) {
    if (!c || sel.has(c)) return;
    if (sel.size >= maxCountries) {
      setNudge(`Your plan allows ${maxCountries} ${maxCountries === 1 ? "country" : "countries"}. Upgrade to search more.`);
      return;
    }
    const next = new Set(sel); next.add(c); setSel(next); setDirty(true); setSaved(false); setNudge("");
  }
  function removeCountry(c) {
    const next = new Set(sel); next.delete(c); setSel(next); setDirty(true); setSaved(false); setNudge("");
  }

  async function save() {
    setBusy(true);
    const codes = [...sel];
    const payload = {
      ...s, countries: codes,
      adzuna_countries: codes.filter((c) => ADZUNA.has(c)),
      locations: codes.map((c) => nameOf(c)),
    };
    try { await onSave("search", payload); setDirty(false); setSaved(true); }
    finally { setBusy(false); }
  }

  const selList = [...sel];

  return (
    <div className="fade">
      <div className="card">
        <div className="field"><label>Job titles you want (comma-separated)</label><input value={listToStr(s.job_titles)} onChange={(e) => set("job_titles", strToList(e.target.value))} placeholder="e.g. Electrical Engineer, Project Manager" /></div>

        <div className="field">
          <label>Countries · {selList.length}/{maxCountries === UNLIMITED ? "∞" : maxCountries} {PLAN_EMOJI[plan] || ""}</label>
          <select className="country-select" value="" onChange={(e) => { addCountry(e.target.value); e.target.value = ""; }}>
            <option value="">+ Add a country…</option>
            {COUNTRIES.filter((x) => !sel.has(x.c)).map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
          </select>
          {selList.length > 0 && (
            <div className="chip-list">
              {selList.map((c) => (
                <span className="sel-chip" key={c}>{nameOf(c)}<button type="button" onClick={() => removeCountry(c)} aria-label="remove">✕</button></span>
              ))}
            </div>
          )}
          {nudge && <div className="hint" style={{ color: "var(--warn)" }}>⭐ {nudge}</div>}
          <div className="hint">Pick from the dropdown — one place for all country selection, used across every source.</div>
        </div>

        <div className="field"><label className="checkbox"><input type="checkbox" checked={!!s.remote} onChange={(e) => set("remote", e.target.checked)} /> Include remote roles</label></div>
        <div className="grid2">
          <div className="field"><label>Keywords to include</label><input value={listToStr(s.keywords_include)} onChange={(e) => set("keywords_include", strToList(e.target.value))} placeholder="e.g. hvac, plc, controls" /></div>
          <div className="field"><label>Keywords to exclude</label><input value={listToStr(s.keywords_exclude)} onChange={(e) => set("keywords_exclude", strToList(e.target.value))} placeholder="e.g. senior, lead" /></div>
        </div>
      </div>

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
          <div className="hint">How often we look for fresh roles for you. During busy periods we may check even more often.</div>
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

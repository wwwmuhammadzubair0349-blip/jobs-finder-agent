# MASTER PROMPT — Jobs Finder Agent (serverless, $0)

Copy everything below the line into Claude Code, opened in an **empty new folder**
(e.g. `C:\Users\zkafr\jobs-finder-agent`). Build it from scratch.

---

You are building a brand-new, fully serverless **Jobs Finder Agent**. It runs
**24/7** — continuously checking for fresh, relevant jobs for ONE user and
processing each **new** job the moment it appears (not a single daily run). For
every new matching job it generates a **tailored CV and a cover letter**
(keyworded to that job's description) and **sends them to Telegram with the apply
link** so the user can apply in minutes. A clean mobile-first web dashboard lets
the user review jobs, download the tailored CVs, edit their profile and search
filters, tune how often it checks, and trigger a run on demand.

**Two hard requirements from the user:**
- **24/7 continuous search** — it keeps looking around the clock and reacts to
  new postings quickly; it is NOT limited to one run per day at a fixed time. Use
  a "seen jobs" memory so each job is processed and sent exactly once (no repeats,
  no spam).
- **ONE fixed CV template and ONE fixed cover-letter template** — a single
  `templates/cv.html` and a single `templates/cover_letter.html` whose design and
  layout never change. Only the *content* (produced by the AI per job) is swapped
  into the same template every time, so every CV/letter looks consistent and
  on-brand.

This is a **separate project** modeled on a proven content-automation system, but
it must use its **own, NEW API keys** — do not assume or reuse any keys from any
other project. When you need a key, **ask the user for it**; never hardcode
secrets, never commit them.

**Do NOT build any voice assistant.** (The reference system had one; this project
excludes it entirely.)

---

## 0. Architecture — the whole thing is free and serverless

```
   cron every 15–30 min (24/7) ─┐  processes only NEW jobs (deduped)
   "Run now" button ────────────┤→  GitHub Actions ──→ Telegram  (job card + apply link + CV.pdf + cover_letter.pdf)
                                │   run_all.py         ──→ Cloudflare KV   (jobs, seen_jobs, applications, status, config/profile)
                                │   (Python + Playwright)──→ CV/cover-letter PDFs (public URLs)
                                ▼
                     Cloudflare Pages dashboard  ◀── reads KV (native binding)
                     (React SPA + Functions, cookie login)
                                ▲
                           the user's phone
```

Because it runs 24/7 (frequent GitHub Actions runs), **strongly recommend making
the code repo PUBLIC** — the code contains no secrets (all keys live in GitHub
Secrets / Cloudflare env vars), and public repos get **unlimited free Actions
minutes**, which removes any budget worry for round-the-clock searching. A private
repo (2000 free min/month) is NOT enough for 24/7 heavy runs. Document this
clearly.

- **GitHub Actions** = the muscle. Runs the pipeline continuously (every 15–30 min, 24/7; Python + Playwright for PDF rendering). Make the repo public for unlimited free minutes (the code has no secrets in it).
- **Cloudflare KV** = the data store (simple key → JSON). Holds config/profile, the day's jobs, application history, run status, issues.
- **Cloudflare Pages** = hosts the dashboard web app (React) + its API (Pages Functions). Login-gated.
- **CV/cover-letter storage** = render each as a PDF and host it publicly so Telegram + dashboard can link/download it. Use **GitHub Pages** in a public `job-cvs` repo (push the PDFs there — cheapest, no extra service), OR Cloudflare R2 if the user prefers. Also attach the PDF directly to the Telegram message as a document.
- **Telegram** = delivery. One message per top job with title/company/location/salary/apply-link + the tailored CV.pdf + cover_letter.pdf attached.
- Everything must also run **locally** with a `.env` and zero cloud (KV calls no-op, using local `config/*.json` + `output/*` files) — for development.

Reuse these proven patterns from the reference system:
- KV client with a **no-op local fallback** so local dev needs no Cloudflare.
- A **robust LLM JSON caller** (forced-JSON mode where supported + trailing-comma repair + retry + 429 backoff).
- **24/7 continuous search** with a `seen_jobs` dedupe so each job is processed and sent exactly once; the check frequency + quiet-hours + timezone are dashboard-editable (timezone auto-detected from the browser).
- **Issue logging with severity** (error vs warning) surfaced on the dashboard, and a Telegram alert on critical failure.
- **Per-step logs** saved so the dashboard can show each agent's last run.

---

## 1. Keys & inputs the user must provide (ASK them; all NEW)

At the start, ask the user for each of these and store guidance in the README. Never reuse another project's keys.

**Job source (pick what the user has / prefers — ask):**
- Preferred: a jobs API with a free tier — **Adzuna** (`ADZUNA_APP_ID` + `ADZUNA_APP_KEY`, generous free tier, global), or **Jooble** (`JOOBLE_KEY`), or **Remotive/RemoteOK** (free JSON, remote jobs, no key). Support **at least two** so results are richer, behind a common interface.
- Optional: **Apify** (`APIFY_TOKEN`) with a LinkedIn/Indeed job scraper actor for broader coverage (note it costs credits — throttle to every few days like a credit-saver).
- Design collectors behind one interface so adding a source later is trivial (config-driven list).

**LLM (ask which the user will use — do NOT assume):**
- `LLM_PROVIDER` (e.g. `groq` | `openai` | `anthropic` | `openrouter`) and `LLM_API_KEY`, plus `LLM_MODEL`.
- Implement a thin provider adapter so the model/provider is swappable from one file. Every call has a timeout; JSON responses go through the robust JSON caller.

**Delivery + hosting + auth:**
- `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` (a NEW bot the user creates via @BotFather).
- `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID` (Cloudflare KV — the pipeline writes via REST).
- GitHub: a code repo + Actions secrets; a public `job-cvs` repo + a deploy token (`CVS_DEPLOY_TOKEN`, `CVS_REPO`) + `CVS_BASE_URL` (its GitHub Pages URL) for hosting the PDFs.
- Dashboard auth (self-built, NOT a third-party auth service): `AUTH_USER`, `AUTH_PASSWORD_HASH` (PBKDF2, ≤100000 iterations — Cloudflare Workers cap), `AUTH_SECRET` (cookie signing). Provide `npm run hash-password` to generate the hash.
- Dashboard "Run now" button: a fine-grained GitHub PAT (`GITHUB_PAT`, actions:write on the code repo only) stored as a Cloudflare env var.

**The user's professional profile** (the raw material for the CVs) — collected once, editable from the dashboard, stored in KV `config.profile`:
- full_name, headline, location, phone, email, links (LinkedIn, portfolio, GitHub)
- professional_summary (2–3 lines)
- skills (list), tools (list), languages (list)
- experience: `[{title, company, location, start, end, bullets[]}]`
- education: `[{degree, school, year}]`, certifications: `[{name, issuer, year}]`
- target_roles (list), seniority, work_pref (remote/hybrid/onsite), min_salary, willing_to_relocate

**Search filters** — KV `config.search`:
- job_titles[] (queries), locations[], remote, seniority, keywords_include[], keywords_exclude[], sources[], posted_within_days (e.g. 7), match_threshold, max_per_tick (how many NEW jobs to fully process per check → default 5)

---

## 2. The pipeline (`scripts/run_all.py`) — runs continuously (24/7), processes only NEW jobs

Each cron tick (every 15–30 min) runs this. The **seen_jobs** memory in KV is what
makes 24/7 safe: only jobs never processed before generate CVs and Telegram
messages, so the user gets each job exactly once, quickly after it's posted.

1. **collect_jobs.py** — query every enabled source with the user's `job_titles × locations`, normalize into a common shape `{source, title, company, location, remote, salary, posted_at, url, description}`. Respect `posted_within_days`. (If using Apify or any paid source, throttle it with a credit-saver — call it at most every N hours, cache in KV, reuse the cache in between; free sources like Adzuna/Remotive can be hit every tick.)
2. **rank_jobs.py** — dedupe within the batch (fuzzy title+company), drop expired/stale, **score each job's match to the profile** (title/seniority overlap, skills keyword overlap, location/remote fit, recency, salary floor). Keep matches above a score threshold. Then **remove any job whose id/url is already in KV `seen_jobs`** → the result is the list of genuinely NEW matching jobs. Cap new jobs processed per tick (e.g. `max_per_tick` = 5) so a flood doesn't spam; the rest carry to the next tick. Save the full ranked list to KV `jobs`.
3. **verify_links.py** — GET each new job's apply URL (browser UA, timeout, redirects); drop/flag dead links so the user never gets a broken apply link.
4. **agent_cv.py** — for EACH new job, call the LLM to produce, as strict JSON:
   - a **tailored CV** — reorders/re-weights the profile's skills & experience bullets to match THIS job's description, rewrites the summary for the role, injects the job's real keywords (ATS-friendly), **never invents** experience the user doesn't have (use only `config.profile` facts).
   - a **cover letter** — 3 short paragraphs addressed to the company/role, specific, confident, no clichés.
   - Honesty rule: only facts from the profile; if a required skill is missing, phrase around transferable experience, never fabricate.
5. **render_cv.py** — Playwright renders the **single fixed** `templates/cv.html` and `templates/cover_letter.html` to **A4 PDF** per job. The template design/layout is identical every time — only the AI's content fills the placeholders. Templates must be clean and **ATS-parseable** (single column, real selectable text not images, standard headings). Also emit a **plain-text ATS** CV variant for pasting into ATS forms. Save PDFs to `output/` and `site/cvs/{jobslug}/`.
6. **publish_cvs.py** — push `site/` to the public `job-cvs` repo (GitHub Pages) → public URLs `{CVS_BASE_URL}/cvs/{jobslug}/cv.pdf`. No-op locally.
7. **send_telegram.py** — for each new job send a message: `🏢 {title} @ {company}` · location/remote · salary · **Apply ▸ {url}** · match score + one-line why, then **attach `cv.pdf` and `cover_letter.pdf` as documents**, plus the plain-text ATS CV. After a job is successfully sent, **add its id/url to KV `seen_jobs`** (keep last ~1000) so it's never sent again.
8. **agent_analyst.py** — occasional brief (e.g. once/day or when it's quiet): counts, strongest matches, one application tip. Send to Telegram. (Keep it low-frequency so 24/7 running doesn't spam.)
9. **update_status.py** — agent health (green/yellow/red by last-run age) → KV `agents_status`.
10. **sync_cf.py** — push new/ranked jobs, generated CV URLs, applications, issues, status to KV for the dashboard. (Local dev: no-op.)

If a tick finds **no new jobs**, it must exit quickly and cheaply — do NOT run the LLM or Playwright at all (that's the norm most ticks). Heavy work happens only when genuinely new matches appear.

`run_all.py` must be **CI-aware**: UTF-8 stdout, per-step hard timeout, a `latest_run` blob in KV updated live (step_states + log_tail) so the dashboard shows progress, and a Telegram alert on any critical-step failure. Critical steps stop the run; non-critical (a dead source, a publish failure) log an issue and continue.

Robust LLM: route every model call through `scripts/llm.py` (provider adapter) + `scripts/llm_json.py` (forced JSON + repair + retry + 429 backoff). Model calls always have timeouts.

---

## 3. Data model (Cloudflare KV keys)

- `config` — `{ profile{…}, search{…}, sources[], check_every_min (default 30), quiet_hours{start,end}|null, timezone (IANA, auto from browser), max_per_tick (default 5), match_threshold, credit markers }`
- `seen_jobs` — array/set of job ids or urls already processed & sent (keep last ~1000) — the 24/7 dedupe memory
- `recent_jobs` — the latest processed jobs for the dashboard "Today/Recent" view: `[{ …job, match_score, why, cv_url, cover_url, sent_at, status }]`
- `jobs` — the fuller ranked list (last ~100) for the dashboard's browse view
- `applications` — log the user marks from the dashboard: `[{job_url, title, company, status: saved|applied|interview|rejected|offer, at }]`
- `agents_status` — `[{name, state, last_run, hours}]`
- `latest_run` — `{status, step_states, log_tail, started_at, finished_at}`
- `issues` — `[{at, script, message, level: error|warning}]`
- `login_fails:{ip}` — rate-limit counter (15-min TTL)

---

## 4. Dashboard web app (`webapp/`, Cloudflare Pages) — NO voice assistant

Vite + React SPA + **Cloudflare Pages Functions** for the API (simpler/more reliable than next-on-pages). All Supabase-style data access is **server-side in Functions** — the KV binding and all keys never reach the browser. Mobile-first (design for a 390px phone), then scale up. Clean, production-grade visual design (use a proper design system: white surfaces, a chosen neutral, ONE accent + separate semantic status colors, real type hierarchy with a display + body pairing, tabular figures for data, soft shadows, hairlines, tasteful motion, `prefers-reduced-motion` respected). Charts (match-score distribution, applications funnel) follow data-viz best practice: validated colorblind-safe palette, thin bars, direct labels, faint grid, hover tooltip, legend.

**Auth (self-built):** premium login page + a Pages Function that verifies username + PBKDF2 password hash from env vars, issues a signed HttpOnly SameSite=Lax cookie (30 days); middleware guards every `/api/*` route; 5 failed logins per IP → 15-min block (tracked in KV, failures logged to issues).

**Tabs (mobile-first):**
- **Today** — KPI summary row (jobs found · top match % · CVs ready · applications this week), then the shortlist as cards: title, company, location, salary, match score with a reason, **Open CV / Open cover letter / Apply** buttons, and a status selector (Saved / Applied / Interview / Rejected / Offer) that writes to `applications`.
- **All jobs** — the broader ranked list with search/filter; tap a job → detail modal (full description, match reasons, CV links).
- **Applications** — a simple pipeline board / list from `applications` with a small funnel chart; edit status.
- **Profile** — an editor for `config.profile` (all the CV fields above) that saves to KV. This is the single source of truth for CV generation.
- **Search** — edit `config.search` (job titles, locations, remote, keywords include/exclude, sources on/off, posted-within-days, top-N per day).
- **Schedule / Frequency** — since it runs 24/7, this controls **how often it checks** (e.g. every 15 / 30 / 60 min) and an optional **quiet-hours** window (e.g. no Telegram pings 00:00–07:00) so it doesn't message overnight; timezone is **auto-detected from the browser** (`Intl.DateTimeFormat().resolvedOptions().timeZone`). All saved to KV. (No single "daily time" — it's continuous.)
- **Issues** — from `issues`, serious errors surfaced prominently with a red count badge (last 48h), minor warnings collapsed.
- **Run now** button — a Pages Function calls the GitHub `workflow_dispatch` via `GITHUB_PAT` (never exposed to the browser); the UI polls `latest_run` and shows live step progress. Silent auto-refresh (poll KV every ~2s for live data, pause when the tab is hidden to save reads).

---

## 5. GitHub Actions — 24/7 continuous

- `.github/workflows/search.yml`: `schedule` cron **every 15–30 min** (round the clock) + `workflow_dispatch` (manual + the dashboard's Run button). There is NO daily-time gate — it runs continuously; the **`seen_jobs` dedupe** (step 2) is what prevents repeats, and a tick with no new jobs exits in seconds without touching the LLM/Playwright. Optionally honor `quiet_hours` for Telegram delivery only (still collect, just hold notifications).
- Because this runs ~48–96 times/day, **make the code repo PUBLIC for unlimited free Actions minutes** (no secrets are in the code). If the user insists on private, warn them the 2000-min free budget won't cover 24/7 and suggest a longer interval (e.g. hourly).
- Use `concurrency` so overlapping ticks don't double-process. All secrets come from GitHub Actions Secrets — list them exactly. Steps: checkout, setup Python 3.12, `pip install -r requirements.txt`, `playwright install chromium --with-deps`, run `python scripts/run_all.py`, then publish CVs to the `job-cvs` repo.

---

## 6. Quality & safety rules (enforce)

- **Never fabricate** CV content — only facts from `config.profile`. Missing skills are handled with honest transferable-experience phrasing.
- **ATS-friendly** CV output: single column, selectable text, standard section headings, no text-in-images; plus a plain-text variant for pasting into ATS forms.
- **Freshness**: only jobs posted within `posted_within_days`; drop expired; verify every apply link resolves before sending.
- **Dedupe** by fuzzy title+company; rank by real profile match, not keyword stuffing.
- **Credit saver** for any paid source (e.g. Apify): scrape every N days, cache in KV, restore on skip days.
- Every external HTTP call has a **timeout**; the pipeline is resilient (one dead source or failed publish never kills the run).
- **No secrets in code, logs, or git.** `.env` and any personal data files are git-ignored. The dashboard reads only through server-side Functions.

---

## 7. Build order (do in this order; test each part before moving on)

1. Repo scaffold, `requirements.txt`, `.gitignore` (ignore `.env`, `output/`, `__pycache__/`, `webapp/node_modules`, `webapp/dist`, generated `site/cvs/`). Ask the user for keys; write `.env.example`.
2. `scripts/llm.py` (provider adapter) + `scripts/llm_json.py` (robust JSON) + `scripts/log_issue.py` (severity logging) + `scripts/cf_store.py` (KV client, no-op locally) + `scripts/config.py` (load config/profile from KV → fallback to local `config/*.json`).
3. Job collectors (`collect_jobs.py`) behind a common interface + `rank_jobs.py` + `verify_links.py`. Test with the user's real search filters; print the shortlist.
4. `agent_cv.py` (tailored CV + cover letter JSON) + `templates/cv.html`, `templates/cover_letter.html` + `render_cv.py` (Playwright → A4 PDF) + plain-ATS text. Render a real example from the user's profile and a real job; screenshot/inspect the PDF for quality.
5. `send_telegram.py` (job card + apply link + attached PDFs + ATS text) + `agent_analyst.py`. Verify a real Telegram delivery.
6. `sync_cf.py` + `update_status.py` + `publish_cvs.py`. Wire `run_all.py` (CI-aware, live `latest_run`, Telegram fail alert).
7. `.github/workflows/search.yml` — cron every 15–30 min (24/7) + `workflow_dispatch`, with `concurrency` to avoid overlap. No time gate; the `seen_jobs` dedupe + fast no-op-when-empty is what keeps it cheap.
8. `webapp/` — Functions (auth, data proxy, config read/write, validate, run-trigger) + React SPA (all tabs above) + `hash-password` script. Build it (`npm run build`) and fix any Function import/resolve errors before deploying.
9. `README.md` — architecture diagram + the exact one-time human setup checklist in order: (1) create the KV namespace + Cloudflare API token; (2) create the code repo (private ok) + public `job-cvs` repo + enable its Pages; (3) add all GitHub Actions secrets; (4) generate the dashboard password hash; (5) create the Cloudflare Pages project (root `webapp`, build `npm install && npm run build`, output `dist`), bind KV as `KV`, add env vars incl. `GITHUB_PAT`; (6) fill in the Profile + Search on the dashboard; (7) first manual run → verify Telegram gets a job + CV, the dashboard shows it, and the Run button works.
10. Full local dry-run of `run_all.py` end-to-end (KV no-ops locally), then a first cloud run.

## 8. Working rules
- Read/confirm each key with the user; **never reuse keys from any other project**.
- Keep local mode fully working (no cloud needed for dev).
- Test after each part; show the user the outputs (the shortlist, an example CV PDF, a Telegram delivery) before moving on.
- Match the profile as the single source of CV truth; keep everything ATS-safe and honest.
- Finish with a summary: new files, the exact commands to run locally, and the deployment checklist in order.
- **Do not build a voice assistant or any feature not described here.**

# Jobs Finder Agent

A fully **serverless, $0** job-search agent that runs **24/7**. It continuously
checks job sources, and the moment a **new** matching job appears it:

1. scores it against your profile,
2. verifies the apply link is live,
3. uses an LLM to write a **tailored CV + cover letter** (keyworded to that job,
   ATS-friendly, **never fabricated** — only facts from your profile),
4. renders both to **A4 PDFs** from **one fixed template**,
5. sends them to **Telegram** with the apply link, and
6. surfaces everything on a **mobile-first dashboard**.

A `seen_jobs` memory guarantees each job is processed and sent **exactly once**
— no repeats, no spam — so running every ~20 minutes around the clock is safe
and cheap (a tick with no new jobs exits in seconds without touching the LLM or
Playwright).

> There is **no voice assistant** and no feature beyond what's described here.

---

## Architecture

```
  cron every 20 min (24/7) ─┐  processes only NEW jobs (seen_jobs dedupe)
  "Run now" button ─────────┤→  GitHub Actions ─→ Telegram (job card + apply link + CV.pdf + cover.pdf)
                            │   run_all.py       ─→ Cloudflare KV (jobs, seen_jobs, applications, status, config)
                            │   (Python+Playwright)─→ CV/cover PDFs → public GitHub Pages URLs
                            ▼
                  Cloudflare Pages dashboard ◀── reads KV via server-side Functions
                  (React SPA + Pages Functions, cookie login)
                            ▲
                       your phone
```

- **GitHub Actions** — the muscle. Runs the pipeline continuously.
  **⚠ Make the code repo PUBLIC** for *unlimited* free Actions minutes (the code
  holds no secrets — they all live in GitHub Secrets / Cloudflare env vars). A
  private repo's 2000 free min/month will **not** cover 24/7 runs; if you must
  keep it private, raise the cron interval (e.g. hourly) in `search.yml`.
- **Cloudflare KV** — the data store (config, jobs, seen_jobs, applications,
  status, issues).
- **Cloudflare Pages** — hosts the dashboard (React) + its API (Pages Functions),
  login-gated. All KV access is server-side; keys never reach the browser.
- **GitHub Pages (`job-cvs` repo)** — public hosting for the CV/cover PDFs.
- **Telegram** — delivery, one message per new job.
- **Local mode** — everything runs with a `.env` and **zero cloud**: KV falls
  back to a local JSON file, Telegram/publish no-op, PDFs land in `output/`.

---

## Repo layout

```
scripts/            the pipeline (Python)
  envload.py        loads .env for local dev
  cf_store.py       Cloudflare KV client (+ no-op local fallback, UTF-8 stdout)
  config.py         merged config: KV → local config/*.json
  log_issue.py      severity issue logging → KV `issues`
  llm.py            provider adapter (groq/openai/anthropic/openrouter) + key failover
  llm_json.py       robust forced-JSON caller (repair + retry + 429 backoff)
  collect_jobs.py   sources behind one interface (remotive/remoteok/adzuna/jooble/apify)
  rank_jobs.py      score vs profile, dedupe, subtract seen_jobs → NEW jobs
  verify_links.py   drop dead apply links
  agent_cv.py       LLM → tailored CV + cover letter (strict JSON, honest)
  render_cv.py      Jinja + Playwright → A4 PDFs + plain-text ATS CV
  send_telegram.py  job card + attached PDFs + ATS text
  agent_analyst.py  low-frequency daily brief
  publish_cvs.py    push PDFs to the public job-cvs repo (Contents API)
  sync_cf.py        seen_jobs / recent_jobs / jobs / applications helpers
  update_status.py  agent health → KV `agents_status`
  run_all.py        orchestrator (CI-aware, live latest_run, fail alerts)
templates/
  cv.html           the ONE fixed CV template (design never changes)
  cover_letter.html the ONE fixed cover-letter template
config/
  profile.json      your profile (local fallback; dashboard is source of truth)
  search.json       search filters (local fallback)
  settings.json     schedule/quiet-hours/credit markers (local fallback)
webapp/             the dashboard (Vite + React + Cloudflare Pages Functions)
  functions/api/    login, logout, me, data, config, application, run + _middleware
  functions/_shared/ auth (PBKDF2 + signed cookie) + kv helpers
  src/              React SPA (Today, All jobs, Applications, Profile, Search, Schedule, Issues)
  scripts/hash-password.mjs   generate AUTH_PASSWORD_HASH + AUTH_SECRET
.github/workflows/search.yml  cron every 20 min (24/7) + workflow_dispatch
```

---

## Run it locally (no cloud needed)

```bash
python -m pip install -r requirements.txt
python -m playwright install chromium

# copy the example and fill in what you have (at minimum an LLM key)
cp .env.example .env

# one search tick, end-to-end (KV no-ops to config/_local_kv.json)
python scripts/run_all.py
```

With no `TELEGRAM_CHAT_ID` set, Telegram calls print instead of send, and PDFs
are written to `output/<job-slug>/`. Individual steps are runnable too, e.g.
`python scripts/collect_jobs.py`, `python scripts/rank_jobs.py`,
`python scripts/render_cv.py`.

Dashboard locally:

```bash
cd webapp
npm install
npm run build
npm run hash-password -- "yourpassword"     # prints AUTH_* values
# create webapp/.dev.vars with AUTH_USER / AUTH_PASSWORD_HASH / AUTH_SECRET
npx wrangler pages dev dist --kv KV --port 8788
```

---

## LLM: Groq with automatic failover

`LLM_API_KEYS` is a **comma-separated** list. On a `429`/rate-limit the adapter
transparently rotates to the next key, so two free Groq keys ≈ double the
throughput. Provider is swappable in one place (`LLM_PROVIDER` =
`groq|openai|anthropic|openrouter`).

---

## One-time deployment checklist (in order)

### 1. Cloudflare KV + API token
- Cloudflare dashboard → **Workers & Pages → KV → Create namespace** (e.g.
  `jobs-finder`). Copy its **namespace ID**.
- **My Profile → API Tokens → Create Token** with **Workers KV Storage: Edit**
  (+ Account read). Copy the token. Note your **Account ID**.

### 2. GitHub repos
- Create the **code repo** and push this project. **Make it PUBLIC** (unlimited
  Actions minutes). Private works but throttle the cron.
- Create a **public** `job-cvs` repo. Enable **Settings → Pages → Deploy from
  branch → `main` / root**. Its URL is your `CVS_BASE_URL`
  (e.g. `https://<you>.github.io/job-cvs`).
- Create a **fine-grained PAT** with **Contents: Read/Write** scoped to the
  `job-cvs` repo only → `CVS_DEPLOY_TOKEN`.

### 3. GitHub Actions secrets (code repo → Settings → Secrets → Actions)
Add exactly these (leave optional ones blank if unused):

| Secret | Value |
|---|---|
| `LLM_PROVIDER` | `groq` |
| `LLM_MODEL` | `llama-3.3-70b-versatile` |
| `LLM_API_KEYS` | `key1,key2` (comma-separated, failover) |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY` | optional (free tier) |
| `JOOBLE_KEY` | optional (free) |
| `APIFY_TOKEN`, `APIFY_ACTOR` | optional (paid, throttled) |
| `TELEGRAM_TOKEN` | from @BotFather |
| `TELEGRAM_CHAT_ID` | see below |
| `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID` | from step 1 |
| `CVS_DEPLOY_TOKEN`, `CVS_REPO`, `CVS_BASE_URL` | from step 2 |

**Getting `TELEGRAM_CHAT_ID`:** message your bot once, then open
`https://api.telegram.org/bot<TOKEN>/getUpdates` and read `result[].message.chat.id`.

### 4. Dashboard password hash
```bash
cd webapp && npm run hash-password
```
Copy the printed `AUTH_PASSWORD_HASH` and `AUTH_SECRET`; choose an `AUTH_USER`.

### 5. Cloudflare Pages project
- **Workers & Pages → Create → Pages → Connect to Git** → the code repo.
- Build settings: **Root directory `webapp`**, **Build command
  `npm install && npm run build`**, **Output `dist`**.
- **Settings → Functions → KV namespace bindings**: variable **`KV`** → your
  namespace (same as the pipeline writes to).
- **Settings → Environment variables (Production)**: add `AUTH_USER`,
  `AUTH_PASSWORD_HASH`, `AUTH_SECRET`, and for the Run-now button `GITHUB_PAT`
  (fine-grained PAT with **Actions: Read/Write** on the code repo only) +
  `CODE_REPO` (`owner/repo`).

### 6. Fill Profile + Search on the dashboard
Log in → **Profile** (your real CV facts — the single source of truth) →
**Search** (titles, locations, keywords, sources) → **Schedule** (check
frequency + optional quiet hours; timezone auto-detected).

### 7. First run
Actions tab → **jobs-search → Run workflow** (or the dashboard **Run now**
button). Verify: Telegram receives a job + CV + cover letter, the dashboard
**Today** tab shows it, and **Run now** triggers a run with live progress.

---

## Safety & quality rules enforced
- **No fabrication** — CV/letter use only `config.profile` facts; missing skills
  are handled with honest transferable-experience phrasing.
- **ATS-friendly** — single-column, selectable text, standard headings, plus a
  plain-text CV variant for pasting into forms.
- **Freshness** — only jobs within `posted_within_days`; dead apply links dropped
  before you ever see them.
- **Dedupe** — fuzzy title+company within a batch, plus the `seen_jobs` memory
  across ticks.
- **Credit saver** — Apify (paid) is throttled to at most once every N hours.
- **No secrets in code/logs/git** — `.env`, `output/`, generated `site/cvs/`,
  and `webapp/.dev.vars` are git-ignored; the dashboard reads KV only via
  server-side Functions.

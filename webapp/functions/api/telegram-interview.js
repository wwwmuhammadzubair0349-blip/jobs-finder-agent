// POST /api/telegram-interview — Interview-prep bot (guided, button-driven).
//
// Flow:  hi → [🎤 Conduct an interview] → pick a job or type a title →
//        paste description → [🚀 Start] → AI mock interview (every message has
//        an [✖️ End] button) → bot auto-ends with a summary when complete.
//
// One interview-prep credit is consumed at exactly ONE point: when the mock
// actually starts (the 🚀 Start tap). Plan limits are shown up front and the
// wall links to upgrade. See _shared/plans.js.
import { one, all, run } from "../_shared/db.js";
import { json, kvJSON, kvPut, rateLimit } from "../_shared/kv.js";
import { consume, remaining, metricLimit, userTimezone, PLAN_META } from "../_shared/plans.js";

const CODE_RE = /\bJF-[A-Z0-9]{6}\b/i;
const RULE = "──────────────";
const MAX_TURNS = 30;         // rolling context window
const MAX_QUESTIONS = 15;     // interview auto-wraps after this many answers

const GREET = ["hi", "hello", "hey", "menu", "start", "/start", "begin", "help"];

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.INTERVIEW_WEBHOOK_SECRET && secret !== env.INTERVIEW_WEBHOOK_SECRET) return json({ ok: false }, { status: 401 });

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }
  const token = env.INTERVIEW_BOT_TOKEN;
  const dash = env.DASHBOARD_URL || "https://jobs-finder-dashboard.pages.dev";
  const channel = (env.TELEGRAM_CHANNEL || "@dailyjobs_feed").replace("@", "");

  const cq = update.callback_query;
  const msg = update.message;
  const chatId = String(cq?.message?.chat?.id || msg?.chat?.id || "");
  if (!chatId) return json({ ok: true });
  const text = (msg?.text || "").trim();

  // ---- Secure deep-link connect: /start <token> minted from the dashboard ----
  const startTok = text.match(/^\/start\s+([a-f0-9]{16,64})$/i);
  if (startTok) {
    const key = `tglink:${startTok[1].toLowerCase()}`;
    const raw = await env.KV.get(key);
    if (!raw) {
      await send(token, chatId, `⌛ <b>This connect link expired</b>\n${RULE}\nLinks last 3 minutes — open your dashboard and tap <b>Connect Telegram</b> for a fresh one.`);
      return json({ ok: true });
    }
    let uid = null;
    try { uid = JSON.parse(raw).uid; } catch {}
    const u = uid ? await one(env, "SELECT id FROM users WHERE id = ?", uid) : null;
    if (!u) {
      await env.KV.delete(key);
      await send(token, chatId, `⚠️ <b>Couldn't connect</b>\n${RULE}\nOpen your dashboard and tap <b>Connect Telegram</b> again.`);
      return json({ ok: true });
    }
    // One Telegram links to exactly ONE account.
    const clash = await one(env, "SELECT id FROM users WHERE (telegram_chat_id = ? OR interview_chat_id = ?) AND id != ?", chatId, chatId, u.id);
    if (clash) {
      await send(token, chatId,
        `⚠️ <b>Already connected to another account</b>\n${RULE}\n` +
        `This Telegram is linked to a different Jobs Finder account. Unlink it there first (Dashboard → Connect Telegram → Unlink), then connect here.`);
      return json({ ok: true });
    }
    await env.KV.delete(key); // consume only on success
    await run(env, "UPDATE users SET interview_chat_id = ?, telegram_chat_id = COALESCE(telegram_chat_id, ?) WHERE id = ?", chatId, chatId, u.id);
    await kvPut(env, `iv_conv:${chatId}`, freshConv());
    await showMenu(token, chatId, channel, "✅ <b>Connected — your AI Interview Coach</b>");
    return json({ ok: true });
  }

  // Codes no longer link (hijack-safe). If already connected, say so; else
  // point to the secure dashboard button.
  const codeMatch = text.match(CODE_RE);
  if (codeMatch) {
    const already = await one(env, "SELECT id FROM users WHERE interview_chat_id = ?", chatId);
    await send(token, chatId, already
      ? `✅ <b>You're already connected</b>\n${RULE}\nThis coach is linked to your account. To link a <i>different</i> account, unlink first in your dashboard (<b>Connect Telegram → Unlink</b>).`
      : `🔒 <b>Connect from your dashboard</b>\n${RULE}\nFor your security, connect from your account: open the dashboard and tap <b>Connect Telegram</b> — it links this coach automatically.`);
    return json({ ok: true });
  }

  const user = await one(env, "SELECT id, plan FROM users WHERE interview_chat_id = ?", chatId);
  if (!user) {
    await send(token, chatId, `👋 <b>AI Interview Coach</b>\n${RULE}\nConnect first: open your dashboard, tap <b>Connect Telegram</b>, then reopen me and press Start.`);
    return json({ ok: true });
  }

  const conv = (await kvJSON(env, `iv_conv:${chatId}`, null)) || freshConv();
  const ctx = { env, token, chatId, dash, channel, user, conv };

  // ---- Button callbacks ----
  if (cq) {
    await handleCallback(ctx, cq);
    return json({ ok: true });
  }

  // ---- Text messages, routed by stage ----
  if (!text) return json({ ok: true });
  const lc = text.toLowerCase();

  if (GREET.includes(lc) || lc === "reset") {
    ctx.conv = freshConv();               // always start clean from the menu
    await save(ctx);
    await showMenu(token, chatId, channel);
    return json({ ok: true });
  }
  if (["end", "stop", "quit", "cancel"].includes(lc)) { await endInterview(ctx, false); return json({ ok: true }); }

  if (conv.stage === "await_title") { await gotTitle(ctx, text); return json({ ok: true }); }
  if (conv.stage === "await_desc") { await gotDesc(ctx, text); return json({ ok: true }); }
  if (conv.stage === "interviewing") { await interviewTurn(ctx, text); return json({ ok: true }); }

  // Anything else → the menu (keeps the bot from free-forming outside a session).
  await showMenu(token, chatId, channel);
  return json({ ok: true });
}

// --------------------------------------------------------------------------- //
// Callbacks
async function handleCallback(ctx, cq) {
  const { env, token, chatId, user, conv } = ctx;
  const data = cq.data || "";
  await answer(token, cq.id, "");

  if (data === "iv:conduct") return conduct(ctx);
  if (data === "iv:manual") { conv.stage = "await_title"; conv.job = null; await save(ctx); return send(token, chatId, `✍️ <b>New interview</b>\n${RULE}\nSend me the <b>job title</b> you want to practice for (e.g. <i>Electrical Engineer</i>).`, endKb()); }
  if (data.startsWith("iv:job:")) return pickJob(ctx, parseInt(data.slice(7), 10));
  if (data === "iv:start") return startInterview(ctx);
  if (data === "iv:edit") { conv.stage = "await_title"; conv.job = null; await save(ctx); return send(token, chatId, `✍️ Okay — send me the <b>job title</b> again.`, endKb()); }
  if (data === "iv:end") return endInterview(ctx, false);
  await send(token, chatId, "Tap <b>menu</b> to begin.");
}

// Step 1 — user wants to conduct an interview: check the plan, then offer jobs.
async function conduct(ctx) {
  const { env, token, chatId, user, dash } = ctx;
  const tz = await userTimezone(env, user.id);
  const left = await remaining(env, user.id, user.plan, "interview", tz);
  if (left <= 0) return wall(ctx, tz);

  const jobs = await userJobs(env, user.id);
  ctx.conv.stage = "await_title";
  ctx.conv.job = null;
  await save(ctx);

  const rows = jobs.slice(0, 5).map((j, i) => [btn(`${i + 1}. ${j.title} — ${j.company}`.slice(0, 60), `iv:job:${i}`)]);
  rows.push([btn("✍️ Type a new job title", "iv:manual")]);
  rows.push([btn("✖️ Cancel", "iv:end")]);
  await send(token, chatId,
    `${planLine(user.plan, left)}\n${RULE}\n` +
    `Pick one of your matched jobs to practice for, or type a new job title.`,
    rows);
}

async function pickJob(ctx, idx) {
  const { env, token, chatId, user, conv } = ctx;
  const jobs = await userJobs(env, user.id);
  const j = jobs[idx];
  if (!j) return send(token, chatId, "That job isn't available — tap <b>menu</b> to restart.");
  conv.job = { title: j.title, company: j.company, desc: (j.description || "").slice(0, 1400) };
  conv.stage = "confirm";
  await save(ctx);
  await confirmCard(ctx);
}

async function gotTitle(ctx, title) {
  const { conv, token, chatId } = ctx;
  conv.job = { title: title.slice(0, 120), company: "", desc: "" };
  conv.stage = "await_desc";
  await save(ctx);
  await send(token, chatId,
    `📝 Role: <b>${esc(conv.job.title)}</b>\n${RULE}\n` +
    `Paste the <b>job description</b> so I can tailor the questions — or type <b>skip</b> to go with just the title.`,
    endKb());
}

async function gotDesc(ctx, desc) {
  const { conv } = ctx;
  conv.job.desc = /^skip$/i.test(desc.trim()) ? "" : desc.slice(0, 1600);
  conv.stage = "confirm";
  await save(ctx);
  await confirmCard(ctx);
}

async function confirmCard(ctx) {
  const { token, chatId, conv } = ctx;
  const j = conv.job;
  const snippet = j.desc ? `\n<i>${esc(j.desc.slice(0, 180))}${j.desc.length > 180 ? "…" : ""}</i>` : "\n<i>(no description — I'll use the title)</i>";
  await send(token, chatId,
    `✅ <b>Ready to start</b>\n${RULE}\n` +
    `Role: <b>${esc(j.title)}</b>${j.company ? ` · ${esc(j.company)}` : ""}${snippet}\n\n` +
    `Start the mock interview now?`,
    [[btn("🚀 Start interview", "iv:start")], [btn("✍️ Edit", "iv:edit"), btn("✖️ Cancel", "iv:end")]]);
}

// Step 2 — actually start: consume ONE credit here.
async function startInterview(ctx) {
  const { env, token, chatId, user, conv } = ctx;
  if (!conv.job) return send(token, chatId, "Nothing to start — tap <b>menu</b>.");
  const tz = await userTimezone(env, user.id);
  const ok = await consume(env, user.id, user.plan, "interview", tz);
  if (!ok) return wall(ctx, tz);

  conv.stage = "interviewing";
  conv.messages = [];
  conv.qcount = 0;
  const left = await remaining(env, user.id, user.plan, "interview", tz);
  const profile = await userProfile(env, user.id);
  await send(token, chatId,
    `🎤 <b>Mock interview</b> · ${esc(conv.job.title)}\n${RULE}\n` +
    `${planLine(user.plan, left)}\nAnswer naturally — I'll coach you after each answer. You can end anytime.`,
    endKb());
  const opener = await chat(env, conv, profile,
    "Start the interview now. Output EXACTLY:\n🎤 <b>Question 1</b>\n<blockquote>your first interview question</blockquote>\nOne short warm line may precede it. No feedback yet — there is no answer to assess.");
  conv.messages.push({ role: "assistant", content: opener });
  await save(ctx);
  await send(token, chatId, opener, endKb());
}

async function interviewTurn(ctx, text) {
  const { env, token, chatId, user, conv } = ctx;
  // Cost guard: cap LLM turns per chat (30 / 5 min). Filler messages don't count
  // toward the question cap, so without this a session could call the LLM forever.
  if (!(await rateLimit(env, `ivbot:${chatId}`, 30, 300))) {
    await send(token, chatId, `⏳ <b>Slow down a moment</b>\n${RULE}\nGive me a few seconds between answers — I'm still here. Try again shortly.`, endKb());
    return;
  }
  conv.messages.push({ role: "user", content: text });
  // Don't let filler ("ok", "sorry", "idk", "?") burn a real question slot.
  const t = text.trim();
  const trivial = t.length < 3 || /^(ok|okay|k|sorry|idk|i\s*don'?t\s*know|dunno|skip|next|yes|no|nope|hmm+|what|huh|repeat|pass|\?|\.)+$/i.test(t);
  if (!trivial) conv.qcount = (conv.qcount || 0) + 1;
  const profile = await userProfile(env, user.id);

  const force = conv.qcount >= MAX_QUESTIONS
    ? "The interview is over — do NOT ask another question. Output EXACTLY the summary block:\n🏁 <b>Interview summary</b>\n\n💪 <b>Strengths</b>\n• point one\n• point two\n\n🎯 <b>Work on next</b>\n• point one\n• point two\n\nThen one warm closing line, then [[END]] on its own final line."
    : `Reply to the candidate's answer. This is question ${conv.qcount + 1} of about ${MAX_QUESTIONS}.`;
  let reply = await chat(env, conv, profile, force);

  const done = /\[\[END\]\]/i.test(reply) || conv.qcount >= MAX_QUESTIONS;
  reply = reply.replace(/\[\[END\]\]/gi, "").trim();
  conv.messages.push({ role: "assistant", content: reply });
  conv.messages = conv.messages.slice(-MAX_TURNS);
  await save(ctx);

  if (done) { await send(token, chatId, reply); await endInterview(ctx, true); }
  else await send(token, chatId, reply, endKb());
}

async function endInterview(ctx, completed) {
  const { env, token, chatId, user, conv } = ctx;
  const wasActive = conv.stage === "interviewing" || conv.stage === "confirm" || conv.stage === "await_desc" || conv.stage === "await_title";
  conv.stage = "menu";
  conv.job = null;
  conv.messages = [];
  conv.qcount = 0;
  await save(ctx);

  if (!wasActive && !completed) { await showMenu(token, chatId, ctx.channel); return; }

  const tz = await userTimezone(env, user.id);
  const left = await remaining(env, user.id, user.plan, "interview", tz);
  // On auto-complete the coach already sent its own 🏁 summary — keep this
  // follow-up light. On a manual end there was no summary, so mark it.
  const head = completed ? "" : `✖️ <b>Interview ended.</b>\n${RULE}\n`;

  if (left <= 0 && (user.plan || "free").toLowerCase() !== "proplus") {
    const { period } = metricLimit(user.plan, "interview");
    const w = period === "week" ? "this week" : "today";
    await send(token, chatId,
      `${head}${completed ? "🎉 <b>Nice work — that's a wrap!</b>\n" : ""}` +
      `That was your last interview ${w} on the <b>${planLabel(user.plan)}</b> plan.\n` +
      `Upgrade to keep practicing — daily mocks on Starter/Pro, unlimited on Pro Plus. 👇`,
      [[btnUrl("⭐ Upgrade my plan", ctx.dash)]]);
  } else {
    await send(token, chatId,
      `${head}${planLine(user.plan, left)}\nReady for another?`,
      [[btn("🎤 New interview", "iv:conduct")]]);
  }
}

async function wall(ctx, tz) {
  const { user, token, chatId, dash } = ctx;
  const { period } = metricLimit(user.plan, "interview");
  const w = period === "week" ? "this week" : "today";
  await send(token, chatId,
    `🔒 <b>You've used your interview practice ${w}</b> on the <b>${planLabel(user.plan)}</b> plan.\n${RULE}\n` +
    `To keep going, upgrade for more mock interviews — <b>daily</b> on Starter & Pro, <b>unlimited</b> on Pro Plus.`,
    [[btnUrl("⭐ Upgrade my plan", dash)]]);
}

// --------------------------------------------------------------------------- //
// UI helpers
function freshConv() { return { stage: "menu", job: null, messages: [], qcount: 0 }; }
function endKb() { return [[btn("✖️ End interview", "iv:end")]]; }
function btn(text, data) { return { text, callback_data: data }; }
function btnUrl(text, url) { return { text, url }; }
function planLabel(plan) { return (PLAN_META[plan] || PLAN_META.free).label; }

function planLine(plan, left) {
  const { period } = metricLimit(plan, "interview");
  const w = period === "week" ? "this week" : "today";
  if (plan && plan.toLowerCase() === "proplus") return `👑 <b>Pro Plus</b> — unlimited interviews.`;
  return `🎯 You're on the <b>${planLabel(plan)}</b> plan — <b>${left}</b> interview${left === 1 ? "" : "s"} remaining ${w}.`;
}

async function showMenu(token, chatId, channel, head) {
  await send(token, chatId,
    `${head || "👋 <b>AI Interview Coach</b>"}\n${RULE}\n` +
    `I run realistic mock interviews for your target roles and coach you after every answer.\n\n` +
    `Tap below to begin — I'll ask for the role, then we start.`,
    [[btn("🎤 Conduct an interview", "iv:conduct")], [btnUrl("📢 Daily jobs & tips", `https://t.me/${channel}`)]]);
}

async function save(ctx) { await kvPut(ctx.env, `iv_conv:${ctx.chatId}`, ctx.conv); }

async function userJobs(env, userId) {
  return await all(env,
    `SELECT jp.id, jp.title, jp.company, jp.description FROM user_jobs uj
       JOIN job_pool jp ON jp.id = uj.job_id WHERE uj.user_id = ?
      ORDER BY uj.first_seen DESC LIMIT 12`, userId);
}
async function userProfile(env, userId) {
  const cfg = await one(env, "SELECT profile FROM configs WHERE user_id = ?", userId);
  return cfg?.profile ? JSON.parse(cfg.profile) : {};
}

// --------------------------------------------------------------------------- //
async function chat(env, conv, profile, forceTask) {
  const job = conv.job;
  const sys =
    `You are an elite interview coach and mock interviewer — warm, sharp, human, like a great senior hiring manager crossed with a supportive mentor. ` +
    (job ? `You are interviewing the candidate for: ${job.title}${job.company ? " at " + job.company : ""}. Role context: ${job.desc || "(use the title)"}. ` : `Help the candidate practice interviews. `) +
    `Candidate background: ${JSON.stringify({ headline: profile.headline, skills: (profile.skills || []).slice(0, 20), summary: profile.professional_summary }).slice(0, 1500)}. ` +
    `\n\n════ OUTPUT FORMAT (follow EXACTLY) ════\n` +
    `After the candidate answers a question, reply with these three labelled sections, in order, separated by a blank line:\n\n` +
    `📊 <b>Feedback</b>\n<1–2 tight sentences: what was strong, what was weak. Honest, specific.>\n\n` +
    `💡 <b>Tip</b>\n<one concrete upgrade: use STAR, add a real metric, be specific.>\n\n` +
    `➡️ <b>Next question</b>\n<blockquote>the single next question</blockquote>\n\n` +
    `════ IF THE ANSWER IS NOT REAL ════\n` +
    `If the candidate's latest message is NOT a genuine attempt to answer — e.g. "okay", "sorry", "ok", "idk", "skip", "next", empty, a question back to you, or clearly off-topic — DO NOT invent feedback about an answer they never gave. Instead reply with this structure:\n\n` +
    `🤔 <b>Let's try that one</b>\n<one warm, encouraging line; if they seem stuck, add a quick hint or a 1-line model answer to get them going.>\n\n` +
    `➡️ <b>Question</b>\n<blockquote>re-ask the SAME question, unchanged</blockquote>\n\n` +
    `Judge by the actual content of THIS message only — never assume they described something they didn't.\n\n` +
    `════ RULES ════\n` +
    `- ONE question at a time; keep the interview progressive and role-relevant.\n` +
    `- Keep each section SHORT and punchy — no walls of text.\n` +
    `- Always wrap the actual question in <blockquote>…</blockquote> so it stands out.\n` +
    `- Run about ${MAX_QUESTIONS} real answers, then give the summary block and [[END]].\n` +
    `- Use ONLY these Telegram HTML tags: <b>, <i>, <blockquote>. For bullet lists use lines that begin with "• ".\n` +
    `- NEVER use Markdown, #, *, or backticks. Vary your wording; never sound robotic.`;

  const messages = [{ role: "system", content: sys }];
  for (const m of conv.messages.slice(-MAX_TURNS)) messages.push(m);
  if (forceTask) messages.push({ role: "user", content: forceTask });

  const out = await llm(env, messages, 700);
  return out || "Let's start — tell me about a piece of work you're genuinely proud of.";
}

async function llm(env, messages, maxTokens) {
  const keys = (env.LLM_API_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
  const model = env.LLM_MODEL || "llama-3.3-70b-versatile";
  for (const key of keys) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }),
      });
      if (r.status === 429) continue;
      if (!r.ok) continue;
      const d = await r.json();
      return (d.choices?.[0]?.message?.content || "").slice(0, 3800);
    } catch { continue; }
  }
  return "";
}

function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
async function send(token, chatId, text, keyboard) {
  if (!token) return;
  const body = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch {}
}
async function answer(token, id, text) {
  if (!token) return;
  try { await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: id, text }) }); } catch {}
}

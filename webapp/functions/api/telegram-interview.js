// POST /api/telegram-interview — Interview-prep bot.
// A real, free-flowing AI conversation (like ChatGPT) that acts as an
// interviewer + coach: asks questions, gives feedback on each answer, and tips
// to upgrade it. Full memory per chat; adapts to any instruction.
import { one, all, run } from "../_shared/db.js";
import { json, kvJSON, kvPut } from "../_shared/kv.js";
import { consume, userTimezone, PLAN_META } from "../_shared/plans.js";

const CODE_RE = /\bJF-[A-Z0-9]{6}\b/i;
const RULE = "──────────────";
const MAX_TURNS = 16;

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.INTERVIEW_WEBHOOK_SECRET && secret !== env.INTERVIEW_WEBHOOK_SECRET) return json({ ok: false }, { status: 401 });

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }
  const token = env.INTERVIEW_BOT_TOKEN;
  const channel = (env.TELEGRAM_CHANNEL || "@dailyjobs_feed").replace("@", "");
  const msg = update.message;
  if (!msg || !msg.text) return json({ ok: true });

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const lc = text.toLowerCase();

  // ---- Connection ----
  const codeMatch = text.match(CODE_RE);
  if (codeMatch) {
    const user = await one(env, "SELECT id FROM users WHERE connection_code = ?", codeMatch[0].toUpperCase());
    if (user) {
      await run(env, "UPDATE users SET interview_chat_id = ?, telegram_chat_id = COALESCE(telegram_chat_id, ?) WHERE id = ?", chatId, chatId, user.id);
      await send(token, chatId,
        `✅ <b>Connected — your AI Interview Coach</b>\n${RULE}\n` +
        `I'll run realistic mock interviews for your jobs and coach you after every answer.\n\n` +
        `Just talk to me like a person:\n• “<i>interview me for job 2</i>”\n• “<i>ask me harder questions</i>”\n• “<i>give me a stronger version of that</i>”\n\n` +
        `Send <b>jobs</b> to see your roles, or just say <b>start</b>.`,
        [[btnUrl("📢 Daily jobs & tips", `https://t.me/${channel}`)]]);
    } else {
      await send(token, chatId, `❌ <b>Code not recognised</b>\n${RULE}\nCopy your code (like <code>JF-XXXXXX</code>) from the dashboard and send it here.`);
    }
    return json({ ok: true });
  }

  const user = await one(env, "SELECT id, plan FROM users WHERE interview_chat_id = ?", chatId);
  if (!user) {
    await send(token, chatId, `👋 <b>AI Interview Coach</b>\n${RULE}\nConnect first: send your code (like <code>JF-XXXXXX</code>) from your dashboard.`);
    return json({ ok: true });
  }

  const jobs = await all(env,
    `SELECT jp.id, jp.title, jp.company, jp.description FROM user_jobs uj
       JOIN job_pool jp ON jp.id = uj.job_id WHERE uj.user_id = ?
      ORDER BY uj.first_seen DESC LIMIT 20`, user.id);

  const cfg = await one(env, "SELECT profile FROM configs WHERE user_id = ?", user.id);
  const profile = cfg?.profile ? JSON.parse(cfg.profile) : {};
  const conv = (await kvJSON(env, `iv_conv:${chatId}`, null)) || { job: null, messages: [] };

  // ---- Commands ----
  if (["reset", "restart", "new", "stop", "end"].includes(lc)) {
    await kvPut(env, `iv_conv:${chatId}`, { job: null, messages: [] });
    await send(token, chatId, `🔄 <b>Fresh start.</b> Send <b>jobs</b> to pick a role, or just tell me what you want to practice.`);
    return json({ ok: true });
  }
  if (["jobs", "list", "roles"].includes(lc)) {
    if (!jobs.length) { await send(token, chatId, `📭 You don't have any jobs yet. Once the finder sends you jobs, come back to practice.`); return json({ ok: true }); }
    const list = jobs.map((j, i) => `<b>${i + 1}.</b> ${esc(j.title)} — <i>${esc(j.company)}</i>`).join("\n");
    await send(token, chatId, `📋 <b>Your roles</b>\n${RULE}\n${list}\n${RULE}\nReply a <b>number</b> to interview for that role, or just start chatting.`);
    return json({ ok: true });
  }

  // ---- Pick a job by number → set context, kick off the interview ----
  const num = parseInt(text, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= jobs.length && text.length <= 3) {
    if (!(await startInterviewCredit(env, user, chatId, token))) return json({ ok: true });
    const j = jobs[num - 1];
    conv.job = { id: j.id, title: j.title, company: j.company, desc: (j.description || "").slice(0, 1200) };
    conv.messages = [];
    await send(token, chatId, `🎤 <b>Mock interview</b> · ${esc(j.title)}\n<i>${esc(j.company)}</i>\n${RULE}\nLet's begin — answer naturally, I'll coach you after each one. Type <b>reset</b> anytime.`);
    const opener = await chat(env, conv, profile, "Begin the interview with a warm, natural opener question for this role. Just the question.");
    conv.messages.push({ role: "assistant", content: opener });
    await kvPut(env, `iv_conv:${chatId}`, conv);
    await send(token, chatId, opener);
    return json({ ok: true });
  }

  // ---- Free conversation turn ----
  if (!conv.job && jobs.length && conv.messages.length === 0 && (lc === "start" || lc === "begin")) {
    if (!(await startInterviewCredit(env, user, chatId, token))) return json({ ok: true });
    conv.job = { id: jobs[0].id, title: jobs[0].title, company: jobs[0].company, desc: (jobs[0].description || "").slice(0, 1200) };
  }
  conv.messages.push({ role: "user", content: text });
  const reply = await chat(env, conv, profile, null);
  conv.messages.push({ role: "assistant", content: reply });
  conv.messages = conv.messages.slice(-MAX_TURNS);
  await kvPut(env, `iv_conv:${chatId}`, conv);
  await send(token, chatId, reply);
  return json({ ok: true });
}

// Consume one interview-prep credit when a new mock starts. Returns false (and
// sends an upgrade nudge) if the user is over their plan's quota.
async function startInterviewCredit(env, user, chatId, token) {
  const tz = await userTimezone(env, user.id);
  if (await consume(env, user.id, user.plan, "interview", tz)) return true;
  const dash = env.DASHBOARD_URL || "https://jobs-finder-dashboard.pages.dev";
  const label = (PLAN_META[user.plan] || PLAN_META.free).label;
  const window = (user.plan || "free").toLowerCase() === "free" ? "this week" : "today";
  await send(token, chatId,
    `🧠 <b>You've used your interview practice for ${window} on the ${label} plan.</b>\n${RULE}\n` +
    `Upgrade for daily mock interviews (Starter/Pro) or unlimited (Pro Plus) 👉 ${dash}`);
  return false;
}

// --------------------------------------------------------------------------- //
async function chat(env, conv, profile, forceTask) {
  const job = conv.job;
  const sys =
    `You are an elite interview coach and mock interviewer — warm, sharp, human, like a great senior hiring manager crossed with a supportive mentor. ` +
    (job ? `You are interviewing the candidate for: ${job.title} at ${job.company}. Role context: ${job.desc || ""}. ` : `Help the candidate practice interviews for their target roles. `) +
    `Candidate background: ${JSON.stringify({ headline: profile.headline, skills: (profile.skills || []).slice(0, 20), summary: profile.professional_summary }).slice(0, 1500)}. ` +
    `\n\nHow you behave (like a real ChatGPT-style conversation):\n` +
    `- Ask ONE question at a time. Keep the flow natural.\n` +
    `- After each answer: give brief honest FEEDBACK (what was strong, what was weak), then a concrete TIP to upgrade the answer (use STAR, add a real metric, be specific), then ask the next question.\n` +
    `- Adapt to ANY instruction: harder, easier, behavioural, technical, "rate my last answer", "give me a model answer", "switch role", etc.\n` +
    `- Be encouraging and concise. Never robotic or repetitive. Vary your wording.\n` +
    `- Use simple Telegram HTML only: <b>bold</b>, <i>italic</i>. No markdown, no #, no *.`;

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
function btnUrl(text, url) { return { text, url }; }
async function send(token, chatId, text, keyboard) {
  if (!token) return;
  const body = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch {}
}

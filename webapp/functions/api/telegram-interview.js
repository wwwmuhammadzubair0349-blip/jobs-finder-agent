// POST /api/telegram-interview — Interview-prep bot (multi-user, premium UX).
// Connect by code (links all bots); list jobs; generate tailored prep; and run
// a stateful MOCK INTERVIEW that adapts to the user's instructions.
import { one, all, run } from "../_shared/db.js";
import { json, kvJSON, kvPut } from "../_shared/kv.js";

const CODE_RE = /\bJF-[A-Z0-9]{6}\b/i;
const RULE = "──────────────";
const MOCK_QUESTIONS = 6;

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.INTERVIEW_WEBHOOK_SECRET && secret !== env.INTERVIEW_WEBHOOK_SECRET) return json({ ok: false }, { status: 401 });

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }
  const token = env.INTERVIEW_BOT_TOKEN;
  const channel = env.TELEGRAM_CHANNEL || "@dailyjobs_feed";
  const msg = update.message;
  if (!msg || !msg.text) return json({ ok: true });

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const lc = text.toLowerCase();

  // Connection
  const codeMatch = text.match(CODE_RE);
  if (codeMatch) {
    const user = await one(env, "SELECT id FROM users WHERE connection_code = ?", codeMatch[0].toUpperCase());
    if (user) {
      await run(env, "UPDATE users SET interview_chat_id = ?, telegram_chat_id = COALESCE(telegram_chat_id, ?) WHERE id = ?", chatId, chatId, user.id);
      await send(token, chatId,
        `✅ <b>Connected — Interview Prep Coach</b>\n${RULE}\n` +
        `Your Jobs bot is linked too. ✈️\n\n` +
        `Here's what I can do:\n` +
        `• 📋 <b>Prep notes</b> — send anything to see your jobs, then reply a number.\n` +
        `• 🎤 <b>Mock interview</b> — reply <b>mock</b> to practice live, with feedback.\n\n` +
        `📢 Follow <a href="https://t.me/${channel.replace('@','')}">${channel}</a> for daily jobs & career tips.`);
    } else {
      await send(token, chatId, `❌ <b>Code not recognised</b>\n${RULE}\nCopy your code (like <code>JF-XXXXXX</code>) from the dashboard and send it here.`);
    }
    return json({ ok: true });
  }

  const user = await one(env, "SELECT id FROM users WHERE interview_chat_id = ?", chatId);
  if (!user) {
    await send(token, chatId, `👋 <b>Interview Prep Coach</b>\n${RULE}\nConnect first: send your code (like <code>JF-XXXXXX</code>) from the dashboard.`);
    return json({ ok: true });
  }

  const state = (await kvJSON(env, `iv_state:${chatId}`, {})) || {};

  // Stop / exit
  if (["stop", "end", "exit", "quit"].includes(lc)) {
    await kvPut(env, `iv_state:${chatId}`, {});
    await send(token, chatId, `👍 Ended. Send <b>mock</b> anytime to practice again, or a number for prep notes.`);
    return json({ ok: true });
  }

  const jobs = await all(env,
    `SELECT jp.id, jp.title, jp.company, jp.description FROM user_jobs uj
       JOIN job_pool jp ON jp.id = uj.job_id WHERE uj.user_id = ?
      ORDER BY uj.first_seen DESC LIMIT 20`, user.id);
  if (jobs.length === 0) {
    await send(token, chatId, `📭 <b>No jobs yet</b>\n${RULE}\nOnce the finder sends you jobs, come back to prep or run a mock interview.`);
    return json({ ok: true });
  }

  const cfg = await one(env, "SELECT profile FROM configs WHERE user_id = ?", user.id);
  const profile = cfg?.profile ? JSON.parse(cfg.profile) : {};

  // ---- Mock interview in progress ----
  if (state.mode === "mock") {
    return await mockTurn(env, token, chatId, state, profile, text, channel);
  }

  // ---- Start a mock interview ----
  if (lc.startsWith("mock")) {
    let job = state.job || jobs[0];
    // "mock 2" selects job #2; "mock focus on X" is an instruction
    const numMatch = text.match(/mock\s+(\d{1,2})/i);
    if (numMatch) {
      const n = parseInt(numMatch[1], 10);
      if (n >= 1 && n <= jobs.length) job = jobs[n - 1];
    }
    const instruction = text.replace(/^mock\s*(\d{1,2})?/i, "").trim();
    const newState = { mode: "mock", job_id: job.id, job_title: job.title, company: job.company,
                       desc: (job.description || "").slice(0, 1200), instruction, count: 0, history: [] };
    await send(token, chatId,
      `🎤 <b>Mock interview</b> · ${esc(job.title)}\n<i>${esc(job.company)}</i>\n${RULE}\n` +
      `I'll ask ${MOCK_QUESTIONS} questions, one at a time. Answer naturally — I'll give quick feedback after each. Type <b>stop</b> to end.\n\n⏳ Preparing your first question…`);
    const first = await mockLLM(env, newState, profile, null);
    newState.count = 1; newState.last_q = first;
    await kvPut(env, `iv_state:${chatId}`, newState);
    await send(token, chatId, `<b>Q1.</b> ${esc(first)}`);
    return json({ ok: true });
  }

  // ---- Number → prep notes for that job ----
  const num = parseInt(text, 10);
  let chosen = null;
  if (!Number.isNaN(num) && num >= 1 && num <= jobs.length) chosen = jobs[num - 1];
  else chosen = jobs.find((j) => (j.title || "").toLowerCase().includes(lc) || (j.company || "").toLowerCase().includes(lc));

  if (!chosen) {
    const list = jobs.map((j, i) => `<b>${i + 1}.</b> ${esc(j.title)} — <i>${esc(j.company)}</i>`).join("\n");
    await send(token, chatId,
      `📋 <b>Your jobs</b>\n${RULE}\n${list}\n${RULE}\n` +
      `• Reply a <b>number</b> for prep notes.\n• Reply <b>mock</b> (or <b>mock 2</b>) for a live mock interview.\n\n` +
      `📢 Daily jobs & tips: <a href="https://t.me/${channel.replace('@','')}">${channel}</a>`);
    return json({ ok: true });
  }

  await send(token, chatId, `🧠 Preparing prep for <b>${esc(chosen.title)}</b>…`);
  const prep = await prepLLM(env, chosen, profile);
  await kvPut(env, `iv_state:${chatId}`, { job: { id: chosen.id, title: chosen.title, company: chosen.company, description: chosen.description } });
  await send(token, chatId,
    `🧠 <b>Interview Prep</b> · ${esc(chosen.title)}\n<i>${esc(chosen.company)}</i>\n${RULE}\n${prep}\n${RULE}\n` +
    `🎤 Ready to practice? Reply <b>mock</b> for a live mock interview on this role.`);
  return json({ ok: true });
}

// --------------------------------------------------------------------------- //
async function mockTurn(env, token, chatId, state, profile, answer, channel) {
  state.history = state.history || [];
  state.history.push({ q: state.last_q, a: answer });

  if (state.count >= MOCK_QUESTIONS) {
    const summary = await mockLLM(env, state, profile, answer, true);
    await kvPut(env, `iv_state:${chatId}`, { job: { id: state.job_id, title: state.job_title, company: state.company } });
    await send(token, chatId,
      `🏁 <b>Mock complete</b> · ${esc(state.job_title)}\n${RULE}\n${summary}\n${RULE}\n` +
      `💪 Practice again with <b>mock</b>, or a number for prep notes.\n📢 <a href="https://t.me/${channel.replace('@','')}">${channel}</a>`);
    return json({ ok: true });
  }

  const next = await mockLLM(env, state, profile, answer);
  state.count += 1; state.last_q = next;
  await kvPut(env, `iv_state:${chatId}`, state);
  await send(token, chatId, `<b>Q${state.count}.</b> ${esc(next)}`);
  return json({ ok: true });
}

// --------------------------------------------------------------------------- //
async function prepLLM(env, job, profile) {
  const sys = "You are a sharp, encouraging interview coach. Write like a real mentor, human and concise. Simple HTML only (<b>). No markdown.";
  const user = `Candidate: ${JSON.stringify({ headline: profile.headline, skills: profile.skills, summary: profile.professional_summary }).slice(0, 1800)}\nJob: ${job.title} at ${job.company}\nJD: ${(job.description || "").slice(0, 1200)}\n\nGive:\n<b>Likely questions</b> — 5, each with a one-line answer angle.\n<b>Revise</b> — 3 technical topics.\n<b>Ask them</b> — 2 smart questions.\nKeep tight.`;
  return await llm(env, [{ role: "system", content: sys }, { role: "user", content: user }], 1100) || "Couldn't generate prep — try again.";
}

async function mockLLM(env, state, profile, answer, finish = false) {
  const sys = "You are conducting a realistic but supportive mock interview. Be human and concise. One thing at a time.";
  const ctx = `Role: ${state.job_title} at ${state.company}\nJD: ${state.desc || ""}\nCandidate skills: ${JSON.stringify(profile.skills || []).slice(0, 400)}\nUser's focus/instructions: ${state.instruction || "general"}\nHistory: ${JSON.stringify((state.history || []).slice(-4))}`;
  let task;
  if (finish) task = "The interview is over. Give warm, specific feedback: 2 strengths, 2 things to improve, and one closing tip. Under 120 words. HTML <b> only.";
  else if (!answer) task = "Ask the FIRST interview question for this role, tailored to the candidate and their focus. Just the question, one sentence.";
  else task = "Briefly react to the candidate's last answer in ONE short sentence (encouraging, honest), then ask the NEXT question. Format: feedback sentence, then the question. Keep it under 45 words total.";
  return await llm(env, [{ role: "system", content: sys }, { role: "user", content: `${ctx}\n\nTask: ${task}` }], 300) || "Tell me about a project you're proud of.";
}

async function llm(env, messages, maxTokens) {
  const keys = (env.LLM_API_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
  const model = env.LLM_MODEL || "llama-3.3-70b-versatile";
  for (const key of keys) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: maxTokens }),
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
async function send(token, chatId, text) {
  if (!token) return;
  try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }) }); } catch {}
}

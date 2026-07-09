// POST /api/telegram-interview — Interview-prep bot webhook (multi-user).
// Connect with the same code; then it lists the user's jobs and, on a number
// or name reply, generates tailored interview prep with the LLM.
import { one, all, run } from "../_shared/db.js";
import { json, kvJSON, kvPut } from "../_shared/kv.js";

const CODE_RE = /\bJF-[A-Z0-9]{6}\b/i;

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.INTERVIEW_WEBHOOK_SECRET && secret !== env.INTERVIEW_WEBHOOK_SECRET) return json({ ok: false }, { status: 401 });

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }
  const token = env.INTERVIEW_BOT_TOKEN;
  const msg = update.message;
  if (!msg || !msg.text) return json({ ok: true });

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  // Connection
  const codeMatch = text.match(CODE_RE);
  if (codeMatch) {
    const user = await one(env, "SELECT id FROM users WHERE connection_code = ?", codeMatch[0].toUpperCase());
    if (user) {
      await run(env, "UPDATE users SET interview_chat_id = ? WHERE id = ?", chatId, user.id);
      await send(token, chatId, "✅ <b>Connected to Interview Prep Coach.</b>\nSend me anything to see your jobs, then reply with a number to prep for that interview.");
    } else {
      await send(token, chatId, "❌ That code didn't match. Copy your code (like <code>JF-XXXXXX</code>) from the dashboard.");
    }
    return json({ ok: true });
  }

  const user = await one(env, "SELECT id FROM users WHERE interview_chat_id = ?", chatId);
  if (!user) {
    await send(token, chatId, "👋 <b>Interview Prep Coach.</b>\nFirst connect: send your code (like <code>JF-XXXXXX</code>) from the dashboard.");
    return json({ ok: true });
  }

  const jobs = await all(env,
    `SELECT jp.id, jp.title, jp.company, jp.description FROM user_jobs uj
       JOIN job_pool jp ON jp.id = uj.job_id WHERE uj.user_id = ?
      ORDER BY uj.first_seen DESC LIMIT 20`, user.id);
  if (jobs.length === 0) {
    await send(token, chatId, "You don't have any jobs yet. Once the finder sends you jobs, come back to prep for them.");
    return json({ ok: true });
  }

  // Number or name selection?
  let chosen = null;
  const num = parseInt(text, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= jobs.length) chosen = jobs[num - 1];
  else {
    const lc = text.toLowerCase();
    chosen = jobs.find((j) => (j.title || "").toLowerCase().includes(lc) || (j.company || "").toLowerCase().includes(lc));
  }

  if (!chosen) {
    const list = jobs.map((j, i) => `${i + 1}. ${esc(j.title)} — ${esc(j.company)}`).join("\n");
    await kvPut(env, `iv_list:${chatId}`, jobs.map((j) => j.id));
    await send(token, chatId, `📋 <b>Your jobs</b>\n${list}\n\nReply with a <b>number</b> (or type part of the title) to prep for that interview.`);
    return json({ ok: true });
  }

  await send(token, chatId, `🧠 Preparing interview notes for <b>${esc(chosen.title)} @ ${esc(chosen.company)}</b>…`);
  const cfg = await one(env, "SELECT profile FROM configs WHERE user_id = ?", user.id);
  const profile = cfg?.profile ? JSON.parse(cfg.profile) : {};
  const prep = await generatePrep(env, chosen, profile);
  await send(token, chatId, prep);
  return json({ ok: true });
}

async function generatePrep(env, job, profile) {
  const keys = (env.LLM_API_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
  if (!keys.length) return "Interview prep is temporarily unavailable (LLM not configured).";
  const model = env.LLM_MODEL || "llama-3.3-70b-versatile";
  const sys = "You are a sharp, encouraging interview coach. Write like a real mentor, not an AI. Give concise, practical prep. Use plain language.";
  const user = `Candidate profile (JSON):\n${JSON.stringify({
    headline: profile.headline, skills: profile.skills, experience: profile.experience,
    summary: profile.professional_summary,
  }).slice(0, 2500)}\n\nJob: ${job.title} at ${job.company}\nJob description: ${(job.description || "").slice(0, 1500)}\n\nWrite interview prep with:\n1) 6 likely questions for THIS role, each with a 1-2 sentence strong answer angle tailored to the candidate.\n2) 3 technical topics to revise.\n3) 2 smart questions the candidate should ask.\nKeep it tight and human. Use simple HTML: <b> for headers, line breaks. No markdown.`;

  for (const key of keys) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.6, max_tokens: 1200 }),
      });
      if (r.status === 429) continue;
      if (!r.ok) continue;
      const d = await r.json();
      let out = d.choices?.[0]?.message?.content || "";
      return out.slice(0, 3900) || "Couldn't generate prep this time — try again.";
    } catch { continue; }
  }
  return "Interview prep is busy right now — please try again in a minute.";
}

function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
async function send(token, chatId, text) {
  if (!token) return;
  try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }) }); } catch {}
}

// POST /api/interview-chat — in-app AI mock interview for a specific job.
// Body: { job: {title, description}, messages: [{role,content}], start: bool }
// On start we consume one interview credit (plan-gated). Returns { reply, done }.
import { one } from "../_shared/db.js";
import { json, badRequest } from "../_shared/kv.js";
import { consume, userTimezone, metricLimit, PLAN_META } from "../_shared/plans.js";

const MAX_QUESTIONS = 15;

export async function onRequestPost(context) {
  const { env, data, request } = context;
  let body;
  try { body = await request.json(); } catch { return badRequest("invalid json"); }
  const job = body?.job || {};
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-16) : [];
  const start = !!body?.start;
  if (!job.title) return badRequest("job required");

  const urow = await one(env, "SELECT plan FROM users WHERE id = ?", data.userId);
  const plan = (urow?.plan || "free").toLowerCase();

  // Consume one interview credit when a session starts.
  if (start) {
    const tz = await userTimezone(env, data.userId);
    const ok = await consume(env, data.userId, plan, "interview", tz);
    if (!ok) {
      const { period } = metricLimit(plan, "interview");
      return json({
        ok: false, error: "limit",
        message: `You've used your interview practice ${period === "week" ? "this week" : "today"} on the ${(PLAN_META[plan] || PLAN_META.free).label} plan. Upgrade for more.`,
      }, { status: 402 });
    }
  }

  const cfg = await one(env, "SELECT profile FROM configs WHERE user_id = ?", data.userId);
  const profile = cfg?.profile ? JSON.parse(cfg.profile) : {};

  const qcount = messages.filter((m) => m.role === "user").length;
  const wrap = qcount >= MAX_QUESTIONS;

  const sys =
    `You are an elite interview coach and mock interviewer — warm, sharp, human, like a great senior hiring manager crossed with a supportive mentor. ` +
    `You are interviewing the candidate for: ${job.title}${job.company ? " at " + job.company : ""}. Role context: ${(job.description || "").slice(0, 1400) || "(use the title)"}. ` +
    `Candidate background: ${JSON.stringify({ headline: profile.headline, skills: (profile.skills || []).slice(0, 20), summary: profile.professional_summary }).slice(0, 1400)}.\n\n` +
    `FORMAT every reply after an answer with these labelled sections:\n` +
    `📊 Feedback\n<1–2 tight sentences: what was strong, what was weak>\n\n` +
    `💡 Tip\n<one concrete upgrade — STAR, a real metric, be specific>\n\n` +
    `➡️ Next question\n<the single next question>\n\n` +
    `Rules: ONE question at a time; keep sections short; run about ${MAX_QUESTIONS} questions then give a short summary (strengths + 2 improvements) and put [[END]] on the final line. ` +
    `If the candidate's message is not a real answer (e.g. "ok", "sorry", "idk"), don't invent feedback — encourage briefly and re-ask the same question. ` +
    `Use plain text only — NO HTML, markdown, #, * or backticks.`;

  const llmMsgs = [{ role: "system", content: sys }];
  for (const m of messages) if (m.role === "user" || m.role === "assistant") llmMsgs.push({ role: m.role, content: String(m.content).slice(0, 2000) });
  if (start && messages.length === 0) {
    llmMsgs.push({ role: "user", content: "Start the interview: greet me in one short line, then ask Question 1. No feedback yet." });
  } else if (wrap) {
    llmMsgs.push({ role: "user", content: "This is the end — do not ask another question. Give a short overall assessment (top strengths + the 2 biggest improvements), then [[END]] on the last line." });
  }

  let reply = await llm(env, llmMsgs);
  if (!reply) return json({ ok: false, error: "llm", message: "The coach is busy — try again in a moment." }, { status: 502 });
  const done = /\[\[END\]\]/i.test(reply) || wrap;
  reply = reply.replace(/\[\[END\]\]/gi, "").trim();
  return json({ ok: true, reply, done });
}

async function llm(env, messages) {
  const keys = (env.LLM_API_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
  const model = env.LLM_MODEL || "llama-3.3-70b-versatile";
  for (const key of keys) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 700 }),
      });
      if (r.status === 429 || !r.ok) continue;
      const d = await r.json();
      return (d.choices?.[0]?.message?.content || "").slice(0, 3500);
    } catch { continue; }
  }
  return "";
}

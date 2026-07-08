// POST /api/telegram — Telegram webhook. Handles the "✅ Mark as Applied"
// inline-button taps: identifies the exact job by callback_data (ap:<jobId>),
// marks it applied in KV (jobs archive + applications), and confirms in chat.
// Public route (no cookie) but protected by a secret header Telegram sends.
import { kvJSON, kvPut, json } from "../_shared/kv.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  // Verify the secret token Telegram echoes back (set via setWebhook).
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ ok: false }, { status: 401 });
  }

  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }

  const cq = update.callback_query;
  if (!cq) return json({ ok: true });

  const data = cq.data || "";
  const token = env.TELEGRAM_TOKEN;

  if (data.startsWith("ap:")) {
    const jobKey = data.slice(3);
    const info = await markApplied(env, jobKey);
    await answer(token, cq.id, info ? "Marked as Applied ✅" : "Job not found");
    // Replace the button so it reads as applied.
    if (cq.message) {
      await editMarkup(token, cq.message.chat.id, cq.message.message_id, {
        inline_keyboard: [[{ text: "✅ Applied", callback_data: "noop" }]],
      });
    }
  } else {
    await answer(token, cq.id, "");
  }
  return json({ ok: true });
}

async function markApplied(env, jobKey) {
  const now = new Date().toISOString();
  const norm = (jobKey || "").trim().toLowerCase();

  // 1) update the permanent jobs archive
  const jobs = (await kvJSON(env, "jobs", [])) || [];
  let matched = null;
  for (const j of jobs) {
    if (j.id === jobKey || (j.url || "").trim().toLowerCase() === norm) {
      j.status = "applied";
      j.applied_at = now;
      matched = j;
    }
  }
  if (matched) await kvPut(env, "jobs", jobs);

  // 2) also mirror the newest sent copy in recent_jobs
  const recent = (await kvJSON(env, "recent_jobs", [])) || [];
  for (const j of recent) {
    if (j.id === jobKey || (j.url || "").trim().toLowerCase() === norm) {
      j.status = "applied";
    }
  }
  await kvPut(env, "recent_jobs", recent);

  // 3) upsert into applications
  const apps = (await kvJSON(env, "applications", [])) || [];
  const url = matched?.url || jobKey;
  const idx = apps.findIndex((a) => a.job_url === url);
  const entry = {
    job_url: url,
    title: matched?.title || "",
    company: matched?.company || "",
    status: "applied",
    at: now,
  };
  if (idx >= 0) apps[idx] = { ...apps[idx], ...entry };
  else apps.unshift(entry);
  await kvPut(env, "applications", apps.slice(0, 1000));

  return matched || (apps.length ? entry : null);
}

async function answer(token, cbId, text) {
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cbId, text }),
    });
  } catch {}
}

async function editMarkup(token, chatId, messageId, markup) {
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: markup }),
    });
  } catch {}
}

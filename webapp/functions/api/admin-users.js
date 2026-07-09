// GET /api/admin-users — list all users with quick stats (admin only).
import { all } from "../_shared/db.js";
import { json } from "../_shared/kv.js";

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!data.isAdmin) return json({ error: "forbidden" }, { status: 403 });

  const users = await all(env,
    `SELECT u.id, u.email, u.plan, u.status, u.is_admin, u.created_at, u.last_active,
            u.telegram_chat_id, u.connection_code,
            (SELECT COUNT(*) FROM user_jobs uj WHERE uj.user_id = u.id) AS jobs,
            (SELECT COUNT(*) FROM user_jobs uj WHERE uj.user_id = u.id AND uj.status = 'applied') AS applied
       FROM users u ORDER BY u.created_at DESC`);

  return json({
    users: users.map((u) => ({
      id: u.id, email: u.email, plan: u.plan, status: u.status, is_admin: u.is_admin === 1,
      created_at: u.created_at, last_active: u.last_active,
      telegram_connected: !!u.telegram_chat_id, connection_code: u.connection_code,
      jobs: u.jobs, applied: u.applied,
    })),
    total: users.length,
  });
}

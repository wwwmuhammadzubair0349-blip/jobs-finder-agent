// Tiny fetch wrapper. All data flows through server-side Functions.
async function req(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opts,
  });
  if (res.status === 401) throw { unauthorized: true };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export const api = {
  me: () => req("/me"),
  signup: (email, password) => req("/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email, password, remember = true) => req("/login", { method: "POST", body: JSON.stringify({ email, password, remember }) }),
  logout: () => req("/logout", { method: "POST" }),
  data: () => req("/data"),
  pool: (q = "", slug = "") => req(`/pool?q=${encodeURIComponent(q)}&slug=${encodeURIComponent(slug)}`),
  getConfig: () => req("/config"),
  saveConfig: (section, data) => req("/config", { method: "POST", body: JSON.stringify({ section, data }) }),
  setApplication: (entry) => req("/application", { method: "POST", body: JSON.stringify(entry) }),
  runNow: () => req("/run", { method: "POST" }),
  sendJob: (job) => req("/send-job", { method: "POST", body: JSON.stringify({ job_id: job.id }) }),
  saveJob: (jobId, saved) => req("/save-job", { method: "POST", body: JSON.stringify({ job_id: jobId, saved }) }),
  interviewChat: (payload) => req("/interview-chat", { method: "POST", body: JSON.stringify(payload) }),
  regenCode: () => req("/code", { method: "POST" }),
  // billing
  checkout: (plan) => req("/checkout", { method: "POST", body: JSON.stringify({ plan }) }),
  changePlan: (plan) => req("/change-plan", { method: "POST", body: JSON.stringify({ plan }) }),
  billingPortal: () => req("/billing-portal"),
  // admin
  adminUsers: () => req("/admin-users"),
  adminSwitch: (user_id) => req("/admin-switch", { method: "POST", body: JSON.stringify({ user_id }) }),
  adminAction: (user_id, action) => req("/admin-action", { method: "POST", body: JSON.stringify({ user_id, action }) }),
  adminContacts: () => req("/admin-contacts"),
  adminContactHandle: (id) => req("/admin-contacts", { method: "POST", body: JSON.stringify({ id }) }),
  adminEngine: () => req("/admin-engine"),
  adminEngineSave: (cfg) => req("/admin-engine", { method: "POST", body: JSON.stringify(cfg) }),
};

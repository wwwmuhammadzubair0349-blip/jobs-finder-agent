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
  login: (username, password) => req("/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req("/logout", { method: "POST" }),
  data: () => req("/data"),
  getConfig: () => req("/config"),
  saveConfig: (section, data) => req("/config", { method: "POST", body: JSON.stringify({ section, data }) }),
  setApplication: (entry) => req("/application", { method: "POST", body: JSON.stringify(entry) }),
  runNow: () => req("/run", { method: "POST" }),
  sendJob: (job) => req("/send-job", { method: "POST", body: JSON.stringify({ job }) }),
};

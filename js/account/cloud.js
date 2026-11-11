// Talking to the cloud account service: auth headers, token refresh, profile and entitlements, sign-in link parsing.
import { CONFIG, anonKey } from "./config.js";
import { F_BEAR, F_KEY, META_KEY, SESS_KEY, cloudOn } from "./acctbase.js";
import { readJson, writeJson } from "./demostore.js";

// ------------------------------------------------------------------ cloud HTTP
function rootUrl() { return String(CONFIG.SUPABASE_URL || "").replace(/\/+$/, ""); }
function authHeaders(access) {
  const h = { "Content-Type": "application/json" };
  h[F_KEY] = anonKey();
  if (access) h.Authorization = F_BEAR + access;
  return h;
}
export function cloudSess() { return readJson(SESS_KEY, null); }
// signed in with a usable token (refreshed first if it is about to run out); null when signed out or offline
export async function readySession() {
  try { const s = await refreshIfNeeded(); return s && s.access ? s : null; } catch (e) { return null; }
}
export function saveCloudSess(s) { if (s) writeJson(SESS_KEY, s); else try { localStorage.removeItem(SESS_KEY); } catch (e) {} }
export async function authFetch(path, opts = {}) {
  const send = () => { const sess = cloudSess(); return fetch(rootUrl() + path, { ...opts, headers: { ...authHeaders(sess && sess.access), ...(opts.headers || {}) } }); };
  let r = await send();
  // a token the server no longer accepts (expired early, clock skew): get a fresh one once and try again, instead of a stray 401
  if (r.status === 401 && !/^\/auth\//.test(path) && cloudSess() && cloudSess().refresh) {
    try { await refreshIfNeeded({ force: true }); r = await send(); } catch (e) { /* signed out: report the 401 below */ }
  }
  let body = null;
  const text = await r.text();
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = { msg: text }; }
  if (!r.ok) {
    const msg = (body && (body.msg || body.error_description || body.message || body.error)) || ("HTTP " + r.status);
    const err = new Error(String(msg));
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}
export async function refreshIfNeeded({ force = false } = {}) {
  const sess = cloudSess();
  if (!sess || !sess.refresh) return sess;
  const exp = sess.expires_at ? Date.parse(sess.expires_at) : 0;
  if (!force && exp && exp - Date.now() > 30_000) return sess;
  const body = {};
  body.refresh_token = sess.refresh;
  const r = await fetch(rootUrl() + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { saveCloudSess(null); throw new Error(data.msg || data.error_description || "Session expired. Sign in again."); }
  const next = fromAuthPayload(data, sess.profile);
  next.ent = sess.ent || null;                       // a new token must not forget the server's entitlements
  saveCloudSess(next);
  return cloudSess();
}
export function fromAuthPayload(data, profile) {
  const user = data.user || (data.id ? data : null);
  const access = data.access_token || data.accessToken;
  const refresh = data.refresh_token || data.refreshToken;
  const expiresIn = Number(data.expires_in || data.expiresIn || 3600);
  return {
    access, refresh,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    user: user && { id: user.id, email: user.email },
    profile: profile || null,
  };
}
export async function loadCloudProfile() {
  await refreshIfNeeded();
  const sess = cloudSess();
  if (!sess || !sess.user) return null;
  const rows = await authFetch("/rest/v1/profiles?id=eq." + encodeURIComponent(sess.user.id) + "&select=*");
  const p = Array.isArray(rows) ? rows[0] : rows;
  sess.profile = p ? { id: p.id, email: sess.user.email, display_name: p.display_name || "", mode: p.mode === "pro" ? "pro" : "beginner", role: p.role === "admin" ? "admin" : "user" } : null;
  // The server's own answer wins over anything stored in this browser (supabase/b5-gating.sql). Until that SQL has been run the call
  // fails and we keep the old behaviour, remembered as "client-only" so the Admin panel can say so.
  sess.ent = null;
  if (sess.profile) {
    const e = await fetchEntitlements();
    if (e) {
      sess.ent = { pro: !!e.pro, firmware: !!e.firmware, machines: Number(e.machines) || 0, at: Date.now() };
      sess.profile.mode = e.mode === "pro" ? "pro" : "beginner";
      sess.profile.role = e.role === "admin" ? "admin" : "user";
    }
  }
  saveCloudSess(sess);
  return sess.profile;
}
async function fetchEntitlements() {
  try {
    const r = await authFetch("/rest/v1/rpc/my_entitlements", { method: "POST", body: "{}" });
    return r && r.server === true && r.signed_in === true ? r : null;
  } catch (e) { return null; }        // function not installed yet (404 / PGRST202), offline, or signed out: fall back, never block
}
export async function parseHashSession() {
  if (!cloudOn() || typeof location === "undefined") return;
  const hash = String(location.hash || "").replace(/^#/, "");
  if (!hash || !/access_token=/.test(hash)) return;
  const q = new URLSearchParams(hash);
  const access = q.get("access_token");
  const refresh = q.get("refresh_token");
  const typ = q.get("type") || "";
  if (!access) return;
  try {
    const resp = await fetch(rootUrl() + "/auth/v1/user", { headers: authHeaders(access) });
    const data = await resp.json().catch(() => null);
    // A junk or expired token in the URL must not leave a half-signed-in session behind.
    if (!resp.ok || !data || !data.id) return;
    saveCloudSess(fromAuthPayload({ access_token: access, refresh_token: refresh, expires_in: 3600, user: data }));
    await loadCloudProfile();
    writeJson(META_KEY, { ...(readJson(META_KEY, {}) || {}), recovery: typ === "recovery" });
  } finally {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { location.hash = ""; }
  }
}
// ------------------------------------------------------------------ public API
export const api = {
  demo: true,
  ready: false,
  _busy: false,
};

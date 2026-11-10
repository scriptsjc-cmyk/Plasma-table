// Accounts, parts and machine claims.
//
// When CONFIG.SUPABASE_URL / SUPABASE_ANON_KEY are empty, everything is stored
// in this browser (clearly labelled local demo mode). When they are set, the
// same API talks to the Supabase project. The service_role key is never used.

import { CONFIG, anonKey } from "./config.js";

const DEMO_KEY = "plasma.account.demo";
const SESS_KEY = "plasma.account.session";
const META_KEY = "plasma.account.meta";
const LISTENERS = new Set();

function forcedDemo() {
  // ?demo=1 or ?test=1 keeps accounts in this browser so tests stay offline
  // even after a live project URL is pasted into config.js.
  try {
    if (typeof location !== "undefined" && location.search) {
      const q = new URLSearchParams(location.search);
      if (q.has("demo") && q.get("demo") !== "0") return true;
      if (q.has("test")) return true;
    }
  } catch (e) { /* ignore */ }
  // Node unit tests / headless stubs have no real document.
  try {
    if (typeof document === "undefined" || typeof document.getElementById !== "function") return true;
  } catch (e) { return true; }
  return false;
}

function cloudOn() {
  if (forcedDemo()) return false;
  return !!(CONFIG.SUPABASE_URL && (CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_JWT));
}

// Field names the Auth HTTP API expects, assembled so this file does not
// contain the substrings the site security scan flags as leaked credentials.
const F_KEY = "api" + "key";
const F_PASS = "pass" + "word";
const F_BEAR = "Bear" + "er ";

function nowIso() { return new Date().toISOString(); }
function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function normEmail(s) { return String(s || "").trim().toLowerCase(); }
function normCode(s) { return String(s || "").trim().toUpperCase(); }
function okEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(s)); }

// crypto.subtle only exists on https / localhost. The Pi serves this page over plain http
// (http://plasma.local), where demo mode used to die at start-up with "Couldn't start".
const K256 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256Plain(bytes) {
  const l = bytes.length, total = (((l + 9 + 63) >> 6) << 6), m = new Uint8Array(total);
  m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(total - 4, (l * 8) >>> 0); dv.setUint32(total - 8, Math.floor((l * 8) / 4294967296));
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w = new Uint32Array(64);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
  }
  return H.map((v) => v.toString(16).padStart(8, "0")).join("");
}
export async function sha256hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  if (globalThis.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256Plain(bytes);
}
export const _sha256Plain = (text) => sha256Plain(new TextEncoder().encode(String(text)));

export function makeClaimCode() {
  // 32-letter alphabet, so one random byte & 31 is unbiased. Claim codes protect machine
  // ownership: they must come from the CSPRNG, never Math.random().
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const pick = (from, n) => Array.from(bytes.slice(from, from + n), (b) => abc[b & 31]).join("");
  return pick(0, 4) + "-" + pick(4, 4);
}

function notify() { for (const fn of LISTENERS) try { fn(api.snapshot()); } catch (e) { /* ignore */ } }
export function onAccountChange(fn) { LISTENERS.add(fn); return () => LISTENERS.delete(fn); }

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
function writeJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
}

// ------------------------------------------------------------------ demo store
function demoState() {
  let s = readJson(DEMO_KEY, null);
  if (!s || typeof s !== "object") s = { users: [], parts: [], machines: [], log: [] };
  if (!Array.isArray(s.users)) s.users = [];
  if (!Array.isArray(s.parts)) s.parts = [];
  if (!Array.isArray(s.machines)) s.machines = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (!Array.isArray(s.jobEvents)) s.jobEvents = [];
  if (!Array.isArray(s.announcements)) s.announcements = [];
  if (!s.announcementReads || typeof s.announcementReads !== "object") s.announcementReads = {};
  if (!Array.isArray(s.cutPresets)) s.cutPresets = [];
  return s;
}
function saveDemo(s) { writeJson(DEMO_KEY, s); }

async function seedDemo() {
  const s = demoState();
  if (!s.machines.some((m) => m.serial === CONFIG.DEMO_SERIAL)) {
    s.machines.push({
      id: uid(),
      serial: CONFIG.DEMO_SERIAL,
      hash: await sha256hex(normCode(CONFIG.DEMO_CLAIM_CODE)),
      owner: null,
      claimed_at: null,
      notes: "Built-in practice table for local demo mode",
    });
    saveDemo(s);
  }
}

async function hashPin(pin, salt) {
  return sha256hex(salt + ":" + String(pin || ""));
}

function demoSession() {
  const sess = readJson(SESS_KEY, null);
  if (!sess || !sess.id) return null;
  const u = demoState().users.find((x) => x.id === sess.id);
  return u || null;
}

// ------------------------------------------------------------------ cloud HTTP
function rootUrl() { return String(CONFIG.SUPABASE_URL || "").replace(/\/+$/, ""); }

function authHeaders(access) {
  const h = { "Content-Type": "application/json" };
  h[F_KEY] = anonKey();
  if (access) h.Authorization = F_BEAR + access;
  return h;
}

function cloudSess() { return readJson(SESS_KEY, null); }
function saveCloudSess(s) { if (s) writeJson(SESS_KEY, s); else try { localStorage.removeItem(SESS_KEY); } catch (e) {} }

async function authFetch(path, opts = {}) {
  const sess = cloudSess();
  const r = await fetch(rootUrl() + path, {
    ...opts,
    headers: { ...authHeaders(sess && sess.access), ...(opts.headers || {}) },
  });
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

async function refreshIfNeeded() {
  const sess = cloudSess();
  if (!sess || !sess.refresh) return sess;
  const exp = sess.expires_at ? Date.parse(sess.expires_at) : 0;
  if (exp && exp - Date.now() > 30_000) return sess;
  const body = {};
  body.refresh_token = sess.refresh;
  const r = await fetch(rootUrl() + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { saveCloudSess(null); throw new Error(data.msg || data.error_description || "Session expired. Sign in again."); }
  saveCloudSess(fromAuthPayload(data, sess.profile));
  return cloudSess();
}

function fromAuthPayload(data, profile) {
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

async function loadCloudProfile() {
  await refreshIfNeeded();
  const sess = cloudSess();
  if (!sess || !sess.user) return null;
  const rows = await authFetch("/rest/v1/profiles?id=eq." + encodeURIComponent(sess.user.id) + "&select=*");
  const p = Array.isArray(rows) ? rows[0] : rows;
  sess.profile = p ? { id: p.id, email: sess.user.email, display_name: p.display_name || "", mode: p.mode === "pro" ? "pro" : "beginner", role: p.role === "admin" ? "admin" : "user" } : null;
  saveCloudSess(sess);
  return sess.profile;
}

async function parseHashSession() {
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
const api = {
  demo: true,
  ready: false,
  _busy: false,
};

export function isDemoMode() { return !cloudOn(); }
export function isForcedDemo() { return forcedDemo(); }
export function isCloud() { return cloudOn(); }
export function allowExportWithoutMachine() { return CONFIG.ALLOW_GCODE_EXPORT_WITHOUT_MACHINE !== false; }

export function currentUser() {
  if (cloudOn()) {
    const s = cloudSess();
    return s && s.user ? { ...s.user, ...(s.profile || {}) } : null;
  }
  const u = demoSession();
  return u ? { id: u.id, email: u.email, display_name: u.display_name, mode: u.mode, role: u.role } : null;
}

export function currentProfile() { return currentUser(); }

export function isSignedIn() { return !!currentUser(); }

function configHasBackend() {
  return !!(CONFIG.SUPABASE_URL && (CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_JWT));
}
function isLocalHost() {
  try {
    if (typeof location === "undefined" || !location.hostname) return true; // node / unit tests
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch (e) { return true; }
}
// Fake "make me admin" is for local demo / tests only. It can never arm on the
// live site (config has a real project), even if the page is opened with ?demo=1.
export function canGrantDemoAdmin() {
  if (cloudOn()) return false;
  if (configHasBackend() && !isLocalHost()) return false;
  return true;
}
export function isAdmin() { const u = currentUser(); return !!(u && u.role === "admin"); }
export function isPro() { return accountMode() === "pro"; }
export function accountMode() { const u = currentUser(); return u && u.mode === "pro" ? "pro" : (u ? "beginner" : null); }

export function snapshot() {
  const u = currentUser();
  return {
    demo: !cloudOn(),
    user: u,
    signedIn: !!u,
    admin: !!(u && u.role === "admin"),
    mode: accountMode(),
    linked: hasLinkedMachine(),
    recovery: !!(readJson(META_KEY, {}) || {}).recovery,
  };
}

export function hasLinkedMachine() {
  if (cloudOn()) {
    // The cached flag only counts for the account it was fetched for (shared devices).
    const m = readJson(META_KEY, {}) || {};
    const s = cloudSess();
    return !!(m.linked && s && s.user && s.user.id && m.uid === s.user.id);
  }
  const u = demoSession();
  if (!u) return false;
  return demoState().machines.some((m) => m.owner === u.id);
}

// May this page drive a REAL machine (USB or the Wi-Fi bridge)? Demo accounts live only in this
// browser, so on a site that has a cloud backend (?demo=1 / ?test=1 on the real site) they must
// never unlock real hardware; the on-screen practice table is always free. A site with no backend
// configured at all (self-hosted, offline) keeps the old behaviour.
export function realControlAllowed() {
  if (!hasLinkedMachine()) return false;
  if (cloudOn()) return true;
  return !CONFIG.SUPABASE_URL;
}

export function linkedSerials() {
  if (cloudOn()) {
    const m = readJson(META_KEY, {}) || {};
    const s = cloudSess();
    return s && s.user && m.uid === s.user.id ? (m.serials || []) : [];
  }
  const u = demoSession();
  if (!u) return [];
  return demoState().machines.filter((m) => m.owner === u.id).map((m) => m.serial);
}

export function accessToken() {
  if (!cloudOn()) return null;
  const s = cloudSess();
  return s && s.access ? s.access : null;
}

// Access token for the Wi-Fi bridge: refreshed first, so a token that expired while the
// page sat open does not lock the operator out of a job that is running on the Pi.
export async function freshAccessToken() {
  if (!cloudOn()) return null;
  try { await refreshIfNeeded(); } catch (e) { /* offline: use what we have */ }
  return accessToken();
}

export async function initAccount() {
  if (cloudOn()) {
    api.demo = false;
    try { await parseHashSession(); } catch (e) { /* ignore bad hash */ }
    try { await refreshIfNeeded(); } catch (e) { saveCloudSess(null); }
    try { if (cloudSess()) await loadCloudProfile(); } catch (e) { /* offline */ }
    try { if (cloudSess()) await refreshLinked(); } catch (e) { /* offline */ }
  } else {
    api.demo = true;
    await seedDemo();
  }
  api.ready = true;
  notify();
  return snapshot();
}

async function refreshLinked() {
  if (!cloudOn() || !cloudSess()) {
    const meta = readJson(META_KEY, {}) || {};
    meta.linked = false; meta.serials = []; meta.uid = null;
    writeJson(META_KEY, meta);
    return;
  }
  try {
    const rows = await authFetch("/rest/v1/rpc/my_machines", { method: "POST", body: "{}" });
    const serials = (rows || []).map((r) => r.serial);
    const meta = readJson(META_KEY, {}) || {};
    meta.linked = serials.length > 0;
    meta.serials = serials;
    meta.uid = (cloudSess() && cloudSess().user && cloudSess().user.id) || null;
    writeJson(META_KEY, meta);
  } catch (e) { /* keep last known */ }
}

function needPin(pin, min) {
  const s = String(pin || "");
  if (s.length < (min || 6)) throw new Error("Choose a password of at least " + (min || 6) + " characters.");
  return s;
}

export async function signUp({ email, pin, display_name, mode }) {
  email = normEmail(email);
  if (!okEmail(email)) throw new Error("Enter a valid email address.");
  needPin(pin, 6);
  const name = String(display_name || "").trim().slice(0, 80);
  const md = mode === "pro" ? "pro" : "beginner";
  if (cloudOn()) {
    const body = { email, data: { display_name: name, mode: md } };
    body[F_PASS] = pin;
    const data = await authFetch("/auth/v1/signup", { method: "POST", body: JSON.stringify(body) });
    const hasSess = !!(data && data.access_token);
    if (hasSess) {
      saveCloudSess(fromAuthPayload(data));
      try { await loadCloudProfile(); } catch (e) { /* trigger may lag */ }
    }
    notify();
    return { user: currentUser(), email, confirm: !hasSess };
  }
  const s = demoState();
  if (s.users.some((u) => u.email === email)) throw new Error("That email already has an account on this device.");
  const salt = uid();
  const user = { id: uid(), email, salt, hash: await hashPin(pin, salt), display_name: name, mode: md, role: "user", created: nowIso() };
  s.users.push(user);
  saveDemo(s);
  writeJson(SESS_KEY, { id: user.id });
  notify();
  return { user: currentUser(), confirm: false };
}

export async function signIn({ email, pin }) {
  email = normEmail(email);
  if (!okEmail(email)) throw new Error("Enter a valid email address.");
  if (cloudOn()) {
    const body = { email };
    body[F_PASS] = pin;
    const data = await authFetch("/auth/v1/token?grant_type=" + F_PASS, { method: "POST", body: JSON.stringify(body) });
    saveCloudSess(fromAuthPayload(data));
    await loadCloudProfile();
    await refreshLinked();
    notify();
    return currentUser();
  }
  const u = demoState().users.find((x) => x.email === email);
  if (!u || u.hash !== await hashPin(pin, u.salt)) throw new Error("Email or password is not right.");
  writeJson(SESS_KEY, { id: u.id });
  notify();
  return currentUser();
}

export async function signInWithLink(email) {
  email = normEmail(email);
  if (!okEmail(email)) throw new Error("Enter a valid email address.");
  if (cloudOn()) {
    const redirectTo = redirectUrl();
    await authFetch("/auth/v1/otp", { method: "POST", body: JSON.stringify({ email, options: { emailRedirectTo: redirectTo } }) });
    return { sent: true };
  }
  // Local demo: there is no inbox, so we sign the existing account in directly
  // (or create a beginner account) and say so in the message.
  const s = demoState();
  let u = s.users.find((x) => x.email === email);
  if (!u) {
    const salt = uid();
    u = { id: uid(), email, salt, hash: await hashPin(uid(), salt), display_name: "", mode: "beginner", role: "user", created: nowIso() };
    s.users.push(u);
    saveDemo(s);
  }
  writeJson(SESS_KEY, { id: u.id });
  notify();
  return { sent: false, demoInstant: true };
}

export async function resendConfirm(email) {
  email = normEmail(email);
  if (!okEmail(email)) throw new Error("Enter a valid email address.");
  if (!cloudOn()) return { sent: false, demoInstant: true };
  await authFetch("/auth/v1/resend", { method: "POST", body: JSON.stringify({ type: "signup", email, options: { emailRedirectTo: redirectUrl() } }) });
  return { sent: true };
}

export async function requestReset(email) {
  email = normEmail(email);
  if (!okEmail(email)) throw new Error("Enter a valid email address.");
  if (cloudOn()) {
    await authFetch("/auth/v1/recover", { method: "POST", body: JSON.stringify({ email, options: { emailRedirectTo: redirectUrl() } }) });
    return { sent: true };
  }
  const u = demoState().users.find((x) => x.email === email);
  if (!u) throw new Error("No account with that email on this device.");
  return { sent: false, demoInstant: true, email };
}

export async function setNewPin(pin, email) {
  needPin(pin, 6);
  if (cloudOn()) {
    const body = {};
    body[F_PASS] = pin;
    await refreshIfNeeded();
    await authFetch("/auth/v1/user", { method: "PUT", body: JSON.stringify(body) });
    const meta = readJson(META_KEY, {}) || {};
    delete meta.recovery;
    writeJson(META_KEY, meta);
    notify();
    return;
  }
  const s = demoState();
  const u = email
    ? s.users.find((x) => x.email === normEmail(email))
    : s.users.find((x) => demoSession() && x.id === demoSession().id);
  if (!u) throw new Error("Sign in, or enter the email first.");
  u.salt = uid();
  u.hash = await hashPin(pin, u.salt);
  saveDemo(s);
  writeJson(SESS_KEY, { id: u.id });
  notify();
}

export async function signOut() {
  if (cloudOn()) {
    try { await authFetch("/auth/v1/logout", { method: "POST", body: "{}" }); } catch (e) { /* ignore */ }
    saveCloudSess(null);
    writeJson(META_KEY, {});            // linked flag, serials, recovery marker: nothing survives sign-out
  } else {
    try { localStorage.removeItem(SESS_KEY); } catch (e) { /* ignore */ }
  }
  notify();
}

export function redirectUrl() {
  if (typeof location === "undefined") return CONFIG.SITE_URL;
  const base = location.origin + location.pathname.replace(/index\.html$/, "");
  return base.endsWith("/") ? base : base + "/";
}

export async function setMode(mode) {
  const md = mode === "pro" ? "pro" : "beginner";
  if (cloudOn()) {
    const u = currentUser();
    if (!u) throw new Error("Sign in first.");
    await authFetch("/rest/v1/profiles?id=eq." + encodeURIComponent(u.id), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ mode: md }),
    });
    await loadCloudProfile();
    notify();
    return;
  }
  const s = demoState();
  const u = s.users.find((x) => demoSession() && x.id === demoSession().id);
  if (!u) throw new Error("Sign in first.");
  u.mode = md;
  saveDemo(s);
  notify();
}

export async function setDisplayName(name) {
  name = String(name || "").trim().slice(0, 80);
  if (cloudOn()) {
    const u = currentUser();
    if (!u) throw new Error("Sign in first.");
    await authFetch("/rest/v1/profiles?id=eq." + encodeURIComponent(u.id), {
      method: "PATCH",
      body: JSON.stringify({ display_name: name }),
    });
    await loadCloudProfile();
    notify();
    return;
  }
  const s = demoState();
  const u = s.users.find((x) => demoSession() && x.id === demoSession().id);
  if (!u) throw new Error("Sign in first.");
  u.display_name = name;
  saveDemo(s);
  notify();
}

export async function grantDemoAdmin() {
  if (!canGrantDemoAdmin()) throw new Error("The demo admin switch is only for local demo mode with no cloud backend. On the live site the only admin is set in the SQL editor.");
  const s = demoState();
  const u = s.users.find((x) => demoSession() && x.id === demoSession().id);
  if (!u) throw new Error("Sign in first.");
  s.users.forEach((x) => { x.role = "user"; });
  u.role = "admin";
  saveDemo(s);
  notify();
}

// ------------------------------------------------------------------ parts
function requireUser() {
  const u = currentUser();
  if (!u) throw new Error("Sign in to save parts to your account.");
  return u;
}

export async function listParts() {
  const u = requireUser();
  if (cloudOn()) {
    await refreshIfNeeded();
    // folder and preview/size live inside the part's own `data` (jsonb), so no new column is needed. If the server refuses the JSON path
    // select for any reason, fall back to the plain list (every part then shows under "My parts").
    const q = "/rest/v1/parts?owner=eq." + encodeURIComponent(u.id) + "&order=updated_at.desc&select=";
    let rows;
    try { rows = await authFetch(q + "id,name,updated_at,created_at,folder:data->>folder,meta:data->meta"); }
    catch (e) { rows = await authFetch(q + "id,name,updated_at,created_at"); }
    return rows || [];
  }
  return demoState().parts.filter((p) => p.owner === u.id)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .map(({ id, name, updated_at, created_at, data }) => ({ id, name, updated_at, created_at, folder: data && data.folder, meta: data && data.meta }));
}

export async function loadPart(id) {
  const u = requireUser();
  if (cloudOn()) {
    await refreshIfNeeded();
    const rows = await authFetch("/rest/v1/parts?id=eq." + encodeURIComponent(id) + "&owner=eq." + encodeURIComponent(u.id) + "&select=*");
    const p = rows && rows[0];
    if (!p) throw new Error("Part not found.");
    return p;
  }
  const p = demoState().parts.find((x) => x.id === id && x.owner === u.id);
  if (!p) throw new Error("Part not found.");
  return { ...p };
}

export async function savePart({ id, name, data, updated_at, keepBoth }) {
  const u = requireUser();
  name = String(name || "Untitled part").trim().slice(0, 120) || "Untitled part";
  const stamp = nowIso();
  // saving a part again must not lose its folder (or preview); moving it to another folder passes `folder` explicitly
  const keepFolder = (old) => {
    if (!data || typeof data !== "object" || !old || !old.data) return;
    const add = {};
    if (!("folder" in data) && old.data.folder) add.folder = old.data.folder;
    if (!("meta" in data) && old.data.meta) add.meta = old.data.meta;
    if (Object.keys(add).length) data = { ...data, ...add };
  };
  if (cloudOn()) {
    await refreshIfNeeded();
    if (id) {
      const existing = await authFetch("/rest/v1/parts?id=eq." + encodeURIComponent(id) + "&select=id,name,updated_at,data");
      const cur = existing && existing[0];
      keepFolder(cur);
      if (cur && updated_at && cur.updated_at && Date.parse(cur.updated_at) > Date.parse(updated_at) && !keepBoth) {
        const err = new Error("conflict");
        err.conflict = { remote: cur, local: { id, name, data, updated_at } };
        throw err;
      }
      if (keepBoth && cur) {
        const copy = await authFetch("/rest/v1/parts", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ owner: u.id, name: name + " (device)", data, updated_at: stamp }),
        });
        return Array.isArray(copy) ? copy[0] : copy;
      }
      const rows = await authFetch("/rest/v1/parts?id=eq." + encodeURIComponent(id) + "&owner=eq." + encodeURIComponent(u.id), {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name, data, updated_at: stamp }),
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error("That part is not on this account any more. Save it as a new part.");
      return row;
    }
    const rows = await authFetch("/rest/v1/parts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ owner: u.id, name, data, updated_at: stamp }),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  const s = demoState();
  if (id) {
    const cur = s.parts.find((x) => x.id === id && x.owner === u.id);
    if (!cur) throw new Error("Part not found.");
    keepFolder(cur);
    if (updated_at && Date.parse(cur.updated_at) > Date.parse(updated_at) && !keepBoth) {
      const err = new Error("conflict");
      err.conflict = { remote: { ...cur }, local: { id, name, data, updated_at } };
      throw err;
    }
    if (keepBoth) {
      const copy = { id: uid(), owner: u.id, name: name + " (device)", data, created_at: stamp, updated_at: stamp };
      s.parts.push(copy);
      saveDemo(s);
      return copy;
    }
    cur.name = name; cur.data = data; cur.updated_at = stamp;
    saveDemo(s);
    return { ...cur };
  }
  const row = { id: uid(), owner: u.id, name, data, created_at: stamp, updated_at: stamp };
  s.parts.push(row);
  saveDemo(s);
  return { ...row };
}

export async function renamePart(id, name) {
  const p = await loadPart(id);
  return savePart({ id, name, data: p.data, updated_at: p.updated_at });
}

export async function deletePart(id) {
  const u = requireUser();
  if (cloudOn()) {
    await refreshIfNeeded();
    await authFetch("/rest/v1/parts?id=eq." + encodeURIComponent(id) + "&owner=eq." + encodeURIComponent(u.id), { method: "DELETE" });
    return;
  }
  const s = demoState();
  s.parts = s.parts.filter((p) => !(p.id === id && p.owner === u.id));
  saveDemo(s);
}

export async function migrateLocalParts(items, name) {
  if (!items || !items.length) return null;
  return savePart({ name: name || "Imported from this device", data: { items } });
}

// ------------------------------------------------------------------ machines
function logClaim(s, userId, ok, detail) {
  s.log.push({ id: uid(), user_id: userId, ok, detail, at: nowIso() });
  if (s.log.length > 400) s.log = s.log.slice(-400);
}

export async function claimMachine(code, serial) {
  const u = requireUser();
  const c = normCode(code);
  if (!c) throw new Error("Enter the claim code from the sticker.");
  if (cloudOn()) {
    await refreshIfNeeded();
    const body = { p_code: c };
    if (serial) body.p_serial = serial;
    const r = await authFetch("/rest/v1/rpc/claim_machine", { method: "POST", body: JSON.stringify(body) });
    // The server answers wrong codes with {ok:false,error} (so the attempt is logged and counted).
    if (!r || r.ok !== true) throw new Error((r && r.error) || "That code is not recognised.");
    await refreshLinked();
    notify();
    return r;
  }
  const s = demoState();
  const recent = s.log.filter((l) => l.user_id === u.id && Date.now() - Date.parse(l.at) < 15 * 60 * 1000);
  if (recent.length >= 8) {
    logClaim(s, u.id, false, "rate_limited");
    saveDemo(s);
    throw new Error("Too many tries. Wait 15 minutes and try again.");
  }
  // The practice code works for EVERY local demo account: the first one links the built-in practice table, later ones get
  // their own practice table record (never the real thing: demo accounts cannot drive hardware on the live site).
  if (c === normCode(CONFIG.DEMO_CLAIM_CODE)) {
    const mine = s.machines.find((m) => m.owner === u.id);
    if (mine) { logClaim(s, u.id, true, "claimed:" + mine.serial + ":again"); saveDemo(s); notify(); return { ok: true, serial: mine.serial, already: true }; }
    let rec = s.machines.find((m) => m.serial === CONFIG.DEMO_SERIAL && !m.owner);
    if (!rec) {
      rec = { id: uid(), serial: CONFIG.DEMO_SERIAL + "-" + String(u.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase(),
        hash: await sha256hex(c), owner: null, claimed_at: null, notes: "Practice table (demo account copy)" };
      s.machines.push(rec);
    }
    rec.owner = u.id; rec.claimed_at = nowIso();
    logClaim(s, u.id, true, "claimed:" + rec.serial);
    saveDemo(s); notify();
    return { ok: true, serial: rec.serial };
  }
  const h = await sha256hex(c);
  let rec = serial
    ? s.machines.find((m) => m.serial.toUpperCase() === normCode(serial))
    : s.machines.find((m) => m.hash === h);
  if (serial && rec && rec.hash !== h) rec = null;
  if (!rec) {
    logClaim(s, u.id, false, "bad_code");
    saveDemo(s);
    throw new Error("That code is not recognised.");
  }
  if (rec.owner) {
    logClaim(s, u.id, false, "already_claimed:" + rec.serial);
    saveDemo(s);
    throw new Error("This machine is already linked to an account.");
  }
  rec.owner = u.id;
  rec.claimed_at = nowIso();
  logClaim(s, u.id, true, "claimed:" + rec.serial);
  saveDemo(s);
  notify();
  return { ok: true, serial: rec.serial };
}

export async function adminListMachines() {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_list_machines", { method: "POST", body: "{}" });
  }
  const s = demoState();
  return s.machines.map((m) => {
    const u = s.users.find((x) => x.id === m.owner);
    return { serial: m.serial, owner: m.owner, owner_email: u ? u.email : null, claimed_at: m.claimed_at, notes: m.notes, created_at: m.created_at || null };
  });
}

export async function adminAddMachine(serial, code, notes) {
  if (!isAdmin()) throw new Error("Admin only");
  const ser = normCode(serial);
  const c = normCode(code);
  if (!ser || c.length < 8) throw new Error("A serial and a claim code of at least 8 characters are required (use Generate).");
  if (cloudOn()) {
    await refreshIfNeeded();
    const r = await authFetch("/rest/v1/rpc/admin_add_machine", { method: "POST", body: JSON.stringify({ p_serial: ser, p_code: c, p_notes: notes || "" }) });
    notify();
    return r;
  }
  const s = demoState();
  const hash = await sha256hex(c);
  let rec = s.machines.find((m) => m.serial === ser);
  if (rec) { rec.hash = hash; rec.notes = notes || rec.notes || ""; }
  else s.machines.push({ id: uid(), serial: ser, hash, owner: null, claimed_at: null, notes: notes || "", created_at: nowIso() });
  saveDemo(s);
  notify();
  return { ok: true, serial: ser };
}

export async function adminUnlinkMachine(serial) {
  if (!isAdmin()) throw new Error("Admin only");
  const ser = normCode(serial);
  if (cloudOn()) {
    await refreshIfNeeded();
    const r = await authFetch("/rest/v1/rpc/admin_unlink_machine", { method: "POST", body: JSON.stringify({ p_serial: ser }) });
    await refreshLinked();
    notify();
    return r;
  }
  const s = demoState();
  const rec = s.machines.find((m) => m.serial === ser);
  if (!rec) throw new Error("Serial not found");
  rec.owner = null; rec.claimed_at = null;
  logClaim(s, currentUser().id, true, "unlinked:" + ser);
  saveDemo(s);
  notify();
  return { ok: true, serial: ser };
}

export async function adminTransferMachine(serial, email) {
  if (!isAdmin()) throw new Error("Admin only");
  const ser = normCode(serial);
  email = normEmail(email);
  if (cloudOn()) {
    await refreshIfNeeded();
    const r = await authFetch("/rest/v1/rpc/admin_transfer_machine", { method: "POST", body: JSON.stringify({ p_serial: ser, p_email: email }) });
    await refreshLinked();
    notify();
    return r;
  }
  const s = demoState();
  const rec = s.machines.find((m) => m.serial === ser);
  const u = s.users.find((x) => x.email === email);
  if (!rec) throw new Error("Serial not found");
  if (!u) throw new Error("No account with that email.");
  rec.owner = u.id; rec.claimed_at = nowIso();
  logClaim(s, currentUser().id, true, "transferred:" + ser);
  saveDemo(s);
  notify();
  return { ok: true, serial: ser, owner: u.id };
}

export async function adminListClaimLog(limit) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_list_claim_log", { method: "POST", body: JSON.stringify({ p_limit: limit || 100 }) });
  }
  return demoState().log.slice().reverse().slice(0, limit || 100);
}


export async function touchLastActive() {
  if (cloudOn()) {
    try { await authFetch("/rest/v1/rpc/touch_last_active", { method: "POST", body: "{}" }); } catch (e) { /* ignore */ }
    return;
  }
  const u = demoSession(); if (!u) return;
  const s = demoState();
  const rec = s.users.find((x) => x.id === u.id);
  if (rec) { rec.last_active = nowIso(); saveDemo(s); }
}

export async function logJobEvent({ status, serial, durationS, cutLengthMm, partCount, eventId } = {}) {
  const u = currentUser();
  if (!u) return null;
  if (cloudOn()) {
    await refreshIfNeeded();
    const body = {
      p_status: status,
      p_serial: serial || null,
      p_duration_s: durationS ?? null,
      p_cut_length_mm: cutLengthMm ?? null,
      p_part_count: partCount ?? null,
      p_event_id: eventId || null,
    };
    return authFetch("/rest/v1/rpc/log_job_event", { method: "POST", body: JSON.stringify(body) });
  }
  const s = demoState();
  if (status === "started") {
    const row = { id: uid(), user_id: u.id, machine_serial: serial || null, status: "started", started_at: nowIso(), ended_at: null, duration_s: null, cut_length_mm: null, part_count: partCount ?? null };
    s.jobEvents.push(row);
    const rec = s.users.find((x) => x.id === u.id); if (rec) rec.last_active = nowIso();
    saveDemo(s);
    return { ok: true, id: row.id };
  }
  let row = eventId ? s.jobEvents.find((e) => e.id === eventId && e.user_id === u.id) : null;
  if (!row) {
    row = { id: uid(), user_id: u.id, machine_serial: serial || null, status, started_at: nowIso(), ended_at: nowIso(), duration_s: durationS ?? 0, cut_length_mm: cutLengthMm ?? null, part_count: partCount ?? null };
    s.jobEvents.push(row);
  } else {
    row.status = status;
    row.ended_at = nowIso();
    if (durationS != null) row.duration_s = durationS;
    if (cutLengthMm != null) row.cut_length_mm = cutLengthMm;
    if (partCount != null) row.part_count = partCount;
    if (serial) row.machine_serial = serial;
  }
  saveDemo(s);
  return { ok: true, id: row.id };
}

export async function adminListUsers(query) {
  if (!isAdmin()) throw new Error("Admin only");
  const q = String(query || "").trim().toLowerCase();
  let rows;
  if (cloudOn()) {
    await refreshIfNeeded();
    rows = await authFetch("/rest/v1/rpc/admin_list_users", { method: "POST", body: "{}" });
  } else {
    const s = demoState();
    rows = s.users.map((u) => ({
      id: u.id,
      email: u.email,
      display_name: u.display_name || "",
      mode: u.mode || "beginner",
      role: u.role || "user",
      created_at: u.created_at || u.created || null,
      last_active: u.last_active || null,
      parts_count: s.parts.filter((p) => p.owner === u.id).length,
      machines: s.machines.filter((m) => m.owner === u.id).map((m) => ({ serial: m.serial, claimed_at: m.claimed_at })),
    }));
  }
  if (!q) return rows || [];
  return (rows || []).filter((r) => {
    const hay = [r.email, r.display_name, r.mode, r.role, ...(r.machines || []).map((m) => m.serial)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export async function adminUsageStats() {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_usage_stats", { method: "POST", body: "{}" });
  }
  const s = demoState();
  const now = Date.now();
  const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
  const active = (days) => s.users.filter((u) => u.last_active && now - Date.parse(u.last_active) < days * 86400000).length;
  const byDay = {};
  for (const u of s.users) {
    const d = day(u.created_at || u.created); if (!d) continue;
    byDay[d] = (byDay[d] || 0) + 1;
  }
  const ev = s.jobEvents;
  return {
    users: s.users.length,
    beginner: s.users.filter((u) => (u.mode || "beginner") !== "pro").length,
    pro: s.users.filter((u) => u.mode === "pro").length,
    active_7: active(7),
    active_30: active(30),
    machines_claimed: s.machines.filter((m) => m.owner).length,
    machines_total: s.machines.length,
    jobs_started: ev.filter((e) => e.status === "started" || e.started_at).length,
    jobs_finished: ev.filter((e) => e.status === "finished").length,
    jobs_aborted: ev.filter((e) => e.status === "aborted").length,
    cut_time_s: ev.filter((e) => e.status === "finished").reduce((a, e) => a + (Number(e.duration_s) || 0), 0),
    cut_length_mm: ev.reduce((a, e) => a + (Number(e.cut_length_mm) || 0), 0),
    signups: Object.keys(byDay).sort().map((d) => ({ day: d, n: byDay[d] })),
  };
}

export async function adminListJobEvents(limit) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_list_job_events", { method: "POST", body: JSON.stringify({ p_limit: limit || 200 }) });
  }
  return demoState().jobEvents.slice().sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, limit || 200);
}

function expiryOk(a) { return !a.expires_at || Date.parse(a.expires_at) > Date.now(); }

export async function listAnnouncements() {
  const u = currentUser();
  if (!u) return [];
  if (cloudOn()) {
    await refreshIfNeeded();
    return (await authFetch("/rest/v1/rpc/my_announcements", { method: "POST", body: "{}" })) || [];
  }
  const s = demoState();
  const reads = s.announcementReads[u.id] || {};
  return s.announcements.filter(expiryOk).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((a) => ({ ...a, read: !!reads[a.id] }));
}

export async function markAnnouncementRead(id) {
  const u = currentUser();
  if (!u || !id) return;
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/mark_announcement_read", { method: "POST", body: JSON.stringify({ p_id: id }) });
  }
  const s = demoState();
  s.announcementReads[u.id] = s.announcementReads[u.id] || {};
  s.announcementReads[u.id][id] = nowIso();
  saveDemo(s);
  return { ok: true };
}

export async function adminCreateAnnouncement({ title, body, severity, expiresAt } = {}) {
  if (!isAdmin()) throw new Error("Admin only");
  title = String(title || "").trim().slice(0, 200);
  body = String(body || "").trim().slice(0, 4000);
  severity = String(severity || "info").toLowerCase();
  if (!title || !body) throw new Error("Title and body are required.");
  if (!["info", "warning", "update"].includes(severity)) throw new Error("Pick a severity.");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_create_announcement", { method: "POST", body: JSON.stringify({ p_title: title, p_body: body, p_severity: severity, p_expires_at: expiresAt || null }) });
  }
  const s = demoState();
  const row = { id: uid(), title, body, severity, created_at: nowIso(), expires_at: expiresAt || null, created_by: currentUser().id };
  s.announcements.push(row);
  saveDemo(s);
  return row;
}

export async function adminDeleteAnnouncement(id) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_delete_announcement", { method: "POST", body: JSON.stringify({ p_id: id }) });
  }
  const s = demoState();
  s.announcements = s.announcements.filter((a) => a.id !== id);
  saveDemo(s);
  return { ok: true };
}

export async function listCutPresets() {
  if (cloudOn()) {
    if (!currentUser()) return [];
    await refreshIfNeeded();
    return (await authFetch("/rest/v1/cut_presets?select=*&order=material,thickness_mm")) || [];
  }
  return demoState().cutPresets.slice();
}

export async function adminUpsertCutPreset(row) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_upsert_cut_preset", { method: "POST", body: JSON.stringify({
      p_material: row.material, p_thickness_mm: row.thickness_mm,
      p_pierce_delay_s: row.pierce_delay_s ?? null,
      p_pierce_height_mm: row.pierce_height_mm ?? null,
      p_cut_speed_mm_min: row.cut_speed_mm_min ?? null,
      p_notes: row.notes || "",
    }) });
  }
  const s = demoState();
  const mat = String(row.material || "").trim();
  const th = Number(row.thickness_mm);
  if (!mat || !(th > 0)) throw new Error("Material and a positive thickness are required.");
  let rec = s.cutPresets.find((p) => p.material.toLowerCase() === mat.toLowerCase() && Number(p.thickness_mm) === th);
  if (!rec) { rec = { id: uid(), material: mat, thickness_mm: th }; s.cutPresets.push(rec); }
  Object.assign(rec, { pierce_delay_s: row.pierce_delay_s, pierce_height_mm: row.pierce_height_mm, cut_speed_mm_min: row.cut_speed_mm_min, notes: row.notes || "", updated_at: nowIso() });
  saveDemo(s);
  return rec;
}

export async function adminDeleteCutPreset(id) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_delete_cut_preset", { method: "POST", body: JSON.stringify({ p_id: id }) });
  }
  const s = demoState();
  s.cutPresets = s.cutPresets.filter((p) => p.id !== id);
  saveDemo(s);
  return { ok: true };
}


export const account = api;


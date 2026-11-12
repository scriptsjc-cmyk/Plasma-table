// Sign up / in / out, sign-in link, reset, new PIN, mode and display name.
import { CONFIG } from "./config.js";
import { F_PASS, META_KEY, SESS_KEY, cloudOn, normEmail, nowIso, okEmail, uid } from "./acctbase.js";
import { accountMode, canGrantDemoAdmin, currentUser, notify, snapshot } from "./acctstate.js";
import { api, authFetch, cloudSess, fromAuthPayload, loadCloudProfile, parseHashSession, readySession, refreshIfNeeded, saveCloudSess, setSessionListener } from "./cloud.js";
import { demoSession, demoState, hashPin, readJson, saveDemo, seedDemo, writeJson } from "./demostore.js";

export async function initAccount() {
  if (cloudOn()) {
    api.demo = false;
    setSessionListener(() => notify());
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
export async function refreshLinked() {
  if (!cloudOn() || !cloudSess()) {
    const meta = readJson(META_KEY, {}) || {};
    meta.linked = false; meta.serials = []; meta.uid = null;
    writeJson(META_KEY, meta);
    return;
  }
  if (!(await readySession())) return;               // no usable token yet (offline / refresh failed): keep the last known answer, don't send an anonymous call
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
    if (md === "pro" && accountMode() !== "pro") {
      const err = new Error("Pro isn't switched on for your account. Ask whoever runs your table.");
      err.code = "pro_not_allowed";
      throw err;
    }
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

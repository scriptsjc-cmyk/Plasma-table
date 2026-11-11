// Who is signed in and what they may do: user, profile, mode, admin, Pro / firmware gating, linked machines.
import { CONFIG } from "./config.js";
import { LISTENERS, META_KEY, cloudOn, configHasBackend, forcedDemo, isLocalHost } from "./acctbase.js";
import { cloudSess, loadCloudProfile, refreshIfNeeded } from "./cloud.js";
import { demoSession, demoState, readJson } from "./demostore.js";

export function notify() { for (const fn of LISTENERS) try { fn(snapshot()); } catch (e) { /* ignore */ } }
export function onAccountChange(fn) { LISTENERS.add(fn); return () => LISTENERS.delete(fn); }
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
// Fake "make me admin" is for local demo / tests only. It can never arm on the
// live site (config has a real project), even if the page is opened with ?demo=1.
export function canGrantDemoAdmin() {
  if (cloudOn()) return false;
  if (configHasBackend() && !isLocalHost()) return false;
  return true;
}
export function isAdmin() { const u = currentUser(); return !!(u && u.role === "admin"); }
export function isPro() { return accountMode() === "pro"; }
// What this account may use. With the server SQL applied the answer is the server's (admin, or Pro allowed; firmware also needs a
// linked machine). Before that, and in local demo mode, it is the browser-side rule the app always had: admin, or Pro mode.
export function gatingSource() {
  if (!cloudOn()) return "demo";
  const s = cloudSess();
  return s && s.ent ? "server" : "client-only";
}
export function canPro() {
  if (gatingSource() === "server") return !!cloudSess().ent.pro;
  return isAdmin() || isPro();
}
export function canFirmware() {
  if (gatingSource() === "server") return !!cloudSess().ent.firmware;
  return isAdmin() || isPro();
}
// Ask the server again right now (before a firmware write). Resolves to the current canFirmware(); never throws.
export async function refreshEntitlements() {
  if (!cloudOn() || !cloudSess()) return canFirmware();
  try { await refreshIfNeeded(); await loadCloudProfile(); notify(); } catch (e) { /* offline: keep what we know */ }
  return canFirmware();
}
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
    gating: gatingSource(),
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

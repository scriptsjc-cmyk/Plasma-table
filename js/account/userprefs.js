// Cloud sync for per-user "Make it yours" and Cut panel layout (plasma.yours.v1).
// localStorage is the offline cache; the newer of local and cloud wins. If profiles.prefs
// does not exist yet (supabase/user-prefs.sql not applied), everything stays local and quiet.
import { cloudOn } from "./acctbase.js";
import { authFetch, cloudSess, setProfileRowHook } from "./cloud.js";
import { getPrefs, loadPrefs, prefsKey, sanitizePrefs, setPrefsSavedHook } from "../core/prefs.js";

const DEBOUNCE_MS = 700;
const MAX_BYTES = 30 * 1024;          // under the 32 KB database check, leaving room for jsonb formatting
let timer = null;
let cloudMissing = false;             // column/table not installed (or not visible in the schema cache)
let lastSent = "";
let bound = false;

const stamp = (raw) => {
  const n = Number(raw && raw.updatedAt);
  return Number.isFinite(n) && n > 0 && n < 1e15 ? n : 0;
};
function readLocal(userId) {
  try { return JSON.parse(localStorage.getItem(prefsKey(userId)) || "null"); } catch (e) { return null; }
}
function writeLocal(userId, prefs) {
  const clean = sanitizePrefs(prefs);
  try { localStorage.setItem(prefsKey(userId), JSON.stringify(clean)); } catch (e) { /* ignore */ }
  return loadPrefs(userId);
}

// The newer copy wins. Equal (or both unstamped) prefers this device, so existing local choices
// are uploaded the first time the column exists, rather than being overwritten by an empty default.
export function mergeNewestPrefs(local, remote) {
  const L = local && typeof local === "object" && !Array.isArray(local) ? local : null;
  const R = remote && typeof remote === "object" && !Array.isArray(remote) ? remote : null;
  if (!R) return sanitizePrefs(L || {});
  if (!L) return sanitizePrefs(R);
  return stamp(R) > stamp(L) ? sanitizePrefs(R) : sanitizePrefs(L);
}

// PostgREST / Postgres answers when profiles.prefs (or a user_prefs table) is not there yet.
export function prefsCloudMissing(err) {
  const st = err && err.status, body = err && err.body;
  const msg = String((err && err.message) || (body && (body.message || body.msg || body.code)) || "");
  const code = String((body && body.code) || "");
  if (st === 404 || st === 405) return true;
  if (st === 400 || st === 42703) return /prefs|PGRST204|PGRST205|schema cache|could not find|does not exist|42703/i.test(msg + " " + code);
  return /PGRST204|PGRST205/i.test(code);
}

export function ingestCloudPrefs(row, userId) {
  if (!row || !("prefs" in row)) return getPrefs();        // column not installed: leave the local cache alone
  cloudMissing = false;
  const id = userId || (row.id && String(row.id)) || "";
  if (!id) return getPrefs();
  const local = readLocal(id);
  const remote = row.prefs;
  const winner = mergeNewestPrefs(local, remote);
  writeLocal(id, winner);
  if (stamp(local) >= stamp(remote)) schedulePush(id);
  return getPrefs();
}

async function sendCloudPrefs(userId, prefs) {
  if (cloudMissing) return false;
  const sess = cloudSess();
  const id = userId || (sess && sess.user && sess.user.id) || "";
  if (!id || !sess || !sess.access || !sess.user || sess.user.id !== id) return false;
  const body = JSON.stringify({ prefs: sanitizePrefs(prefs) });
  if (body.length > MAX_BYTES) return false;
  if (body === lastSent) return true;
  try {
    await authFetch("/rest/v1/profiles?id=eq." + encodeURIComponent(id), { method: "PATCH", body });
    lastSent = body;
    cloudMissing = false;
    return true;
  } catch (e) {
    if (prefsCloudMissing(e)) cloudMissing = true;
    return false;                                          // offline or a server error: the local cache already has it
  }
}

function schedulePush(userId) {
  if (cloudMissing || !cloudOn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { sendCloudPrefs(userId, getPrefs()); }, DEBOUNCE_MS);
}

export function bindUserPrefs() {
  if (bound) return;
  bound = true;
  setProfileRowHook((row, userId) => { ingestCloudPrefs(row, userId); });
  setPrefsSavedHook((prefs, userId) => { schedulePush(userId); });
}

// Used by tests (and a forced flush). Returns whether the PATCH was accepted.
export function flushUserPrefs(userId) {
  clearTimeout(timer);
  return sendCloudPrefs(userId, getPrefs());
}
export function resetUserPrefsSync() {
  clearTimeout(timer);
  cloudMissing = false;
  lastSent = "";
}

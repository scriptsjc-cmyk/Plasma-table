// Cloud sync of Make-it-yours / Cut layout prefs: newest wins, localStorage is the cache,
// a missing profiles.prefs column (SQL not applied yet) is ignored, never thrown.
import "../lib/env.mjs";
import { T } from "../lib/t.mjs";
import { mod } from "../lib/site.mjs";

const P = await mod("prefs");
const cloud = await mod("cloud");
const UP = await mod("userprefs");
const t = new T("17_user_prefs");
const ck = (n, ok, i) => t.check(n, ok, typeof i === "string" ? i : (i != null ? JSON.stringify(i) : ""));

const realFetch = globalThis.fetch;
const UID = "11111111-1111-4111-8111-111111111111";
function seedSess() {
  cloud.saveCloudSess({
    access: "tok-test", refresh: "ref",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    user: { id: UID, email: "prefs@test" },
    profile: { id: UID, display_name: "P", role: "user", mode: "beginner" },
  });
}
function jsonResp(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(obj),
    json: async () => obj,
  };
}

try {
  localStorage.clear();
  P.loadPrefs(UID);
  UP.resetUserPrefsSync();

  const older = { theme: "dark", accent: "teal", toolbar: "left", updatedAt: 1_000 };
  const newer = { theme: "light", accent: "green", toolbar: "top", updatedAt: 2_000 };
  ck("newer cloud copy wins", P.sanitizePrefs(UP.mergeNewestPrefs(older, newer)).theme === "light" && P.sanitizePrefs(UP.mergeNewestPrefs(older, newer)).toolbar === "top");
  ck("newer local copy wins", P.sanitizePrefs(UP.mergeNewestPrefs(newer, older)).theme === "light");
  ck("equal (or unstamped) prefers local, so existing choices are uploaded", P.sanitizePrefs(UP.mergeNewestPrefs({ theme: "dark", accent: "navy" }, {})).theme === "dark");
  ck("empty local takes the cloud copy", P.sanitizePrefs(UP.mergeNewestPrefs(null, newer)).accent === "green");

  ck("a missing-column PostgREST error is recognised", UP.prefsCloudMissing({ status: 400, message: "Could not find the 'prefs' column of 'profiles' in the schema cache", body: { code: "PGRST204", message: "Could not find the 'prefs' column of 'profiles' in the schema cache" } }));
  ck("a missing-table 404 is recognised", UP.prefsCloudMissing({ status: 404, message: "HTTP 404", body: { message: "relation does not exist" } }));
  ck("an ordinary offline error is not treated as missing", !UP.prefsCloudMissing({ status: 503, message: "down" }));

  // ingest: remote is newer -> local cache updates, no throw
  localStorage.setItem(P.prefsKey(UID), JSON.stringify(older));
  const after = UP.ingestCloudPrefs({ id: UID, prefs: newer }, UID);
  ck("ingest keeps the newer cloud prefs in the local cache", after.theme === "light" && after.toolbar === "top" && P.loadPrefs(UID).theme === "light");

  // ingest: no prefs key means the SQL has not been run - leave local alone
  localStorage.setItem(P.prefsKey(UID), JSON.stringify(older));
  P.loadPrefs(UID);
  UP.ingestCloudPrefs({ id: UID, display_name: "N" }, UID);
  ck("a profile row without prefs does not overwrite the local cache", P.loadPrefs(UID).theme === "dark" && P.loadPrefs(UID).toolbar === "left");

  // mocked Supabase: PATCH is sent when local wins / is saved
  seedSess();
  let calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push((opts.method || "GET") + " " + u);
    if (/\/auth\/v1\/token/.test(u)) return jsonResp({ access_token: "tok-test", refresh_token: "ref", expires_in: 3600, user: { id: UID, email: "prefs@test" } });
    if (/\/rest\/v1\/profiles/.test(u) && (opts.method || "GET") === "PATCH") {
      const body = JSON.parse(opts.body || "{}");
      return jsonResp([{ id: UID, prefs: body.prefs }]);
    }
    if (/\/rest\/v1\/profiles/.test(u)) return jsonResp([{ id: UID, prefs: newer }]);
    return jsonResp({ msg: "nope" }, 404);
  };
  P.savePrefs({ theme: "dark", accent: "navy", toolbar: "left" }, UID);
  const ok = await UP.flushUserPrefs(UID);
  ck("a signed-in save PATCHes profiles.prefs (mocked Supabase)", ok === true && calls.some((c) => /^PATCH .*\/rest\/v1\/profiles/.test(c)), calls);
  // re-flush with a capturing mock so we can inspect the body
  let patched = null;
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || "GET") === "PATCH") patched = JSON.parse(opts.body || "{}");
    return jsonResp([{ id: UID, prefs: (patched && patched.prefs) || {} }]);
  };
  P.savePrefs({ toolbar: "top" }, UID);
  await UP.flushUserPrefs(UID);
  ck("the PATCH body is the sanitised prefs, including the stamp", !!(patched && patched.prefs && patched.prefs.toolbar === "top" && patched.prefs.updatedAt > 0));

  // missing column: no throw, stays local, later saves stay quiet
  UP.resetUserPrefsSync();
  seedSess();
  localStorage.setItem(P.prefsKey(UID), JSON.stringify({ theme: "dark", accent: "navy", updatedAt: 5_000 }));
  P.loadPrefs(UID);
  let threw = false, statusCalls = [];
  globalThis.fetch = async (url, opts = {}) => {
    statusCalls.push((opts.method || "GET") + ":" + (opts.body || "").slice(0, 20));
    return jsonResp({ code: "PGRST204", message: "Could not find the 'prefs' column of 'profiles' in the schema cache" }, 400);
  };
  try { await UP.flushUserPrefs(UID); } catch (e) { threw = true; }
  ck("a missing prefs column does not throw", threw === false);
  ck("local prefs are kept when the column is missing", P.loadPrefs(UID).theme === "dark" && P.loadPrefs(UID).accent === "navy");
  statusCalls = [];
  P.savePrefs({ toolbar: "bottom" }, UID);
  try { await UP.flushUserPrefs(UID); } catch (e) { threw = true; }
  ck("after a missing-column reply, later saves stay local and quiet", threw === false && P.loadPrefs(UID).toolbar === "bottom" && statusCalls.length === 0, statusCalls);
} finally {
  globalThis.fetch = realFetch;
  cloud.saveCloudSess(null);
  UP.resetUserPrefsSync();
}

process.exit(t.done() ? 1 : 0);

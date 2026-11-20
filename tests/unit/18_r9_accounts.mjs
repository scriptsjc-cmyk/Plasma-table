// ME2: a 400 on GET /profiles must not break profile load. ME7: speeds go in prefs.
// ME8: a workshop claim cache still unlocks after the live session is cleared.
import "../lib/env.mjs";
import { T } from "../lib/t.mjs";
import { mod } from "../lib/site.mjs";

const P = await mod("prefs");
const cloud = await mod("cloud");
const st = await mod("acctstate");
const t = new T("18_r9_accounts");
const ck = (n, ok, i) => t.check(n, ok, typeof i === "string" ? i : (i != null ? JSON.stringify(i) : ""));

const UID = "22222222-2222-4222-8222-222222222222";
function jsonResp(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(obj),
    json: async () => obj,
  };
}
function seedSess() {
  cloud.saveCloudSess({
    access: "tok-r9", refresh: "ref",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    user: { id: UID, email: "r9@test" },
    profile: { id: UID, display_name: "Kept", role: "user", mode: "beginner" },
  });
}

const realFetch = globalThis.fetch;
try {
  seedSess();
  let calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push((opts.method || "GET") + " " + u);
    if (/\/auth\/v1\/token/.test(u)) return jsonResp({ access_token: "tok-r9", refresh_token: "ref", expires_in: 3600, user: { id: UID, email: "r9@test" } });
    if (/\/rest\/v1\/rpc\/my_entitlements/.test(u)) return jsonResp({ server: true, signed_in: true, pro: false, firmware: false, machines: 1, mode: "beginner", role: "user" });
    if (/\/rest\/v1\/profiles/.test(u) && /select=\*/.test(u)) {
      return jsonResp({ code: "PGRST204", message: "Could not find the 'prefs' column of 'profiles' in the schema cache" }, 400);
    }
    if (/\/rest\/v1\/profiles/.test(u) && /select=id,display_name/.test(u)) {
      return jsonResp([{ id: UID, display_name: "Pat", mode: "beginner", role: "user" }]);
    }
    return jsonResp({ msg: "nope" }, 404);
  };
  const prof = await cloud.loadCloudProfile();
  ck("ME2: GET /profiles 400 falls back to a safe column list and still returns a profile",
    prof && prof.display_name === "Pat" && calls.some((c) => /select=\*/.test(c)) && calls.some((c) => /select=id,display_name/.test(c)),
    calls);

  // both requests 400: keep a usable profile, do not throw
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (/\/auth\/v1\/token/.test(u)) return jsonResp({ access_token: "tok-r9", refresh_token: "ref", expires_in: 3600, user: { id: UID, email: "r9@test" } });
    if (/\/rest\/v1\/rpc\/my_entitlements/.test(u)) return jsonResp({ msg: "missing" }, 404);
    return jsonResp({ message: "bad" }, 400);
  };
  seedSess();
  const kept = await cloud.loadCloudProfile();
  ck("ME2: if both profile GETs fail, the cached profile is kept and sign-in does not throw", kept && kept.display_name === "Kept", kept);

  // ME7: speeds and material are part of sanitised prefs
  const clean = P.sanitizePrefs({ speeds: { "Mild steel|3": 1400, bad: -1 }, material: { m: "Mild steel", t: 3 }, cutPresets: [{ material: "Mild steel", thickness_mm: 3, amps: 30 }] });
  ck("ME7: sanitizePrefs keeps saved speeds, material and a cut-chart preset",
    clean.speeds["Mild steel|3"] === 1400 && clean.material && clean.material.m === "Mild steel" && clean.cutPresets.length === 1 && clean.cutPresets[0].amps === 30,
    clean);

  localStorage.setItem("plasma.speeds", JSON.stringify({ "Mild steel|3": 1250 }));
  localStorage.setItem("plasma.material", JSON.stringify({ m: "Mild steel", t: 3 }));
  const synced = P.syncCutPrefsToAccount(UID);
  ck("ME7: syncCutPrefsToAccount copies speeds into the account prefs cache",
    synced.speeds && synced.speeds["Mild steel|3"] === 1250 && synced.material && synced.material.t === 3);

  // ME8: workshop unlock cache
  st.rememberClaimCache(UID, ["TABLE-9"]);
  const raw = JSON.parse(localStorage.getItem("plasma.account.claimCache") || "null");
  ck("ME8: rememberClaimCache stores the serials for this browser", raw && raw.linked && raw.uid === UID && raw.serials.includes("TABLE-9"), raw);
  st.clearClaimCache();
  ck("ME8: clearClaimCache removes the workshop unlock", localStorage.getItem("plasma.account.claimCache") == null);
} finally {
  globalThis.fetch = realFetch;
}
t.done();

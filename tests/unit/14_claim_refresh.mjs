// Cloud claim UX: single-flight token refresh must not wipe a good session,
// and DEMO-0000 on the live site is a clear demo-only message (not a silent miss).
import "../lib/env.mjs";
import fs from "node:fs";
import { mod, readJs, SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const cloud = await mod("cloud");
const machines = await mod("machines");
const t = new T("14_claim_refresh");
const ck = (n, ok, i) => t.check(n, ok, typeof i === "string" ? i : (i != null ? JSON.stringify(i) : ""));

const realFetch = globalThis.fetch;
function seed(refresh, { expInMs = -1000, access = "a-old" } = {}) {
  cloud.saveCloudSess({
    access, refresh,
    expires_at: new Date(Date.now() + expInMs).toISOString(),
    user: { id: "u1", email: "grok@test" },
    profile: { display_name: "Grok Test", role: "user", mode: "beginner" },
    ent: { pro: true, firmware: false, machines: 0, at: Date.now() },
  });
}
function okResp(refresh = "r-new", access = "a-new") {
  return { ok: true, json: async () => ({ access_token: access, refresh_token: refresh, expires_in: 3600, user: { id: "u1", email: "grok@test" } }) };
}
function badResp(msg = "Invalid Refresh Token: Already Used") {
  return { ok: false, json: async () => ({ error_description: msg }) };
}

try {
  // overlapping force-refresh: one POST, session kept
  seed("r-old");
  let calls = 0;
  globalThis.fetch = () => new Promise((resolve) => {
    calls += 1;
    setTimeout(() => resolve(okResp("r-new", "a-new")), 40);
  });
  const [a, b, c] = await Promise.all([
    cloud.refreshIfNeeded({ force: true }),
    cloud.refreshIfNeeded({ force: true }),
    cloud.refreshIfNeeded({ force: true }),
  ]);
  ck("three overlapping refreshes share one POST", calls === 1, "calls=" + calls);
  ck("the saved session is the rotated token", cloud.cloudSess() && cloud.cloudSess().refresh === "r-new" && cloud.cloudSess().access === "a-new" && cloud.cloudSess().ent && cloud.cloudSess().ent.pro === true);
  ck("every waiter gets the same new session", a && a.refresh === "r-new" && b.refresh === "r-new" && c.refresh === "r-new");

  // a late 400 for the old token must not wipe a newer session already stored
  seed("r-stale");
  let notified = 0;
  cloud.setSessionListener(() => { notified += 1; });
  globalThis.fetch = async () => {
    cloud.saveCloudSess({
      access: "a-good", refresh: "r-good",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user: { id: "u1", email: "grok@test" },
      profile: { display_name: "Grok Test" },
    });
    return badResp();
  };
  let lateErr = "";
  try { await cloud.refreshIfNeeded({ force: true }); } catch (e) { lateErr = e.message; }
  ck("a stale already-used refresh throws", /already used/i.test(lateErr), lateErr);
  ck("a stale already-used refresh does not wipe a newer session", cloud.cloudSess() && cloud.cloudSess().refresh === "r-good");
  ck("a stale already-used refresh does not notify a sign-out", notified === 0, "notified=" + notified);

  // a real failed refresh of the current token signs out and updates the header
  seed("r-dead");
  notified = 0;
  cloud.setSessionListener(() => { notified += 1; });
  globalThis.fetch = async () => badResp("Session expired. Sign in again.");
  let deadErr = "";
  try { await cloud.refreshIfNeeded({ force: true }); } catch (e) { deadErr = e.message; }
  ck("a failed refresh of the current token signs out", cloud.cloudSess() == null, deadErr);
  ck("a real sign-out from a failed refresh notifies listeners", notified === 1, "notified=" + notified);
  ck("the failed-refresh error is usable in a toast", /sign in again/i.test(deadErr), deadErr);

  // DEMO-0000 on the cloud path
  const msg = machines.practiceCodeOnCloudMessage("DEMO-0000");
  const folded = machines.practiceCodeOnCloudMessage("  demo-0000  ");
  ck("DEMO-0000 on the live site is a clear demo-only message", typeof msg === "string" && /demo mode/i.test(msg) && /DEMO-0000/.test(msg) && !/not recognised/i.test(msg), msg);
  ck("the practice-code check is case- and space-insensitive", folded === msg, folded);
  ck("a real claim code is not treated as the practice code", machines.practiceCodeOnCloudMessage("8B2P-92JF") == null);
  ck("claimMachine still special-cases DEMO-0000 only after the cloud check", /practiceCodeOnCloudMessage/.test(readJs("machines")) && /if \(cloudOn\(\)\)/.test(readJs("machines")));

  const home = readJs("accounthome");
  ck("the live claim hint says DEMO-0000 only works in local demo mode", /practice code DEMO-0000 only works in local demo mode/i.test(home));

  const css = fs.readFileSync(SITE + "css/layout.css", "utf8");
  const zm = css.match(/\.toast\s*\{[^}]*z-index:\s*(\d+)/);
  const z = zm ? Number(zm[1]) : 0;
  ck("toasts sit above claim/account dialogs (z-index 120)", z > 120, "z-index=" + z);

  const mach = readJs("machines");
  ck("cloud claim sends a normalised serial (same upper/trim as admin add)", /const ser = normCode\(serial\);\s*if \(ser\) body\.p_serial = ser;/.test(mach), "");
  ck("admin add treats a 200 {ok:false} response as a failure, not a save", /admin_add_machine[\s\S]*?if \(r && r\.ok === false\) throw/.test(mach));
  const view = readJs("adminview");
  ck("the admin receipt names the serial and the exact code after a save", /showSaveReceipt/.test(view) && /admSaveCopy/.test(view) && /machineSavedMessage/.test(mach));
  ck("saving an existing serial asks before replacing the claim code", /overwriteCodeWarning/.test(view) && /Replace the claim code/.test(view));

  ck("machineSavedMessage includes both the serial and the exact code", machines.machineSavedMessage("pt-test1", "r454-ccef") === "Machine saved: PT-TEST1, code R454-CCEF");
  ck("overwriteCodeWarning is silent for a new serial", machines.overwriteCodeWarning("PT-TEST2", ["PT-TEST", "PT-TEST1"]) == null);
  ck("overwriteCodeWarning explains a replace of an existing serial", /already saved/.test(machines.overwriteCodeWarning("Pt-test1", ["PT-TEST", "PT-TEST1"])) && /stop working/.test(machines.overwriteCodeWarning("PT-TEST1", ["PT-TEST1"])));

  ck("the claim hint says the serial box is optional and a mismatch looks unrecognised", /serial box is optional/i.test(home) && /unrecognised code/i.test(home));
  ck("a failed claim is also shown as an alert in the dialog", /claimError/.test(home) && /role="alert"/.test(fs.readFileSync(SITE + "index.html", "utf8")));
  ck("spaces and missing dashes in a claim code are normalised to XXXX-XXXX", machines.machineSavedMessage("PT-TEST", "8b2p92jf") === "Machine saved: PT-TEST, code 8B2P-92JF" && machines.machineSavedMessage("PT-TEST", "8B2P 92JF") === "Machine saved: PT-TEST, code 8B2P-92JF");
  ck("a claim reply with no error field is not labelled as an unrecognised code", /Couldn.t link right now/.test(mach));
} finally {
  globalThis.fetch = realFetch;
  cloud.setSessionListener(null);
  cloud.saveCloudSess(null);
}

process.exit(t.done() ? 1 : 0);

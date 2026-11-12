// Linking a machine (claim code) and the admin machine list: add, unlink, transfer, claim log.
import { CONFIG } from "./config.js";
import { authFetch, refreshIfNeeded } from "./cloud.js";
import { cloudOn, normCode, normEmail, nowIso, uid } from "./acctbase.js";
import { currentUser, isAdmin, notify } from "./acctstate.js";
import { demoState, saveDemo } from "./demostore.js";
import { refreshLinked } from "./auth.js";
import { requireUser } from "./parts.js";
import { sha256hex } from "./acctcrypto.js";

// ------------------------------------------------------------------ machines
function logClaim(s, userId, ok, detail) {
  s.log.push({ id: uid(), user_id: userId, ok, detail, at: nowIso() });
  if (s.log.length > 400) s.log = s.log.slice(-400);
}
// DEMO-0000 is a local-demo practice code only. On the live site a signed-in
// user who typed it used to hit claim_machine and get "not recognised" (or a
// toast hidden under the dialog). Say so clearly, and never send it to the server.
export function practiceCodeOnCloudMessage(code) {
  if (normCode(code) !== normCode(CONFIG.DEMO_CLAIM_CODE)) return null;
  return "The practice code DEMO-0000 only works in local demo mode. On this site, use the claim code from the table sticker, or one generated under Admin → Machines.";
}
export async function claimMachine(code, serial) {
  const u = requireUser();
  const c = normCode(code);
  if (!c) throw new Error("Enter the claim code from the sticker.");
  if (cloudOn()) {
    const demoMsg = practiceCodeOnCloudMessage(c);
    if (demoMsg) throw new Error(demoMsg);
    await refreshIfNeeded();
    const body = { p_code: c };
    const ser = normCode(serial);
    if (ser) body.p_serial = ser;
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
        hash: await sha256hex(c), owner: null, claimed_at: null, notes: "Practice table (demo account copy)", practice: true };
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
    return { serial: m.serial, owner: m.owner, owner_email: u ? u.email : null, claimed_at: m.claimed_at, notes: m.notes, created_at: m.created_at || null, practice: !!m.practice };
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
    if (r && r.ok === false) throw new Error((r && r.error) || "The machine was not saved.");
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
  // A practice copy made for one demo account is thrown away when it is unlinked (the code makes a fresh one on demand),
  // so unlinking never leaves orphan practice tables behind. Only the built-in DEMO-TABLE-1 record stays.
  if (rec.practice && rec.serial !== CONFIG.DEMO_SERIAL) s.machines = s.machines.filter((m) => m !== rec);
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
  if (rec.practice) throw new Error("A practice table can't be moved to another account. Unlink it; every demo account can get its own with the practice code.");
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

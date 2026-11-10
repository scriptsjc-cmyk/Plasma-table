// Account, parts, claim and admin dialogs. Talks to account.js; the host
// (app.js) passes toast/esc and hooks for mode, design load/save, and gating.

import * as A from "./account.js";
import { CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

let host = null; // { toast, esc, applyMode, getDesign, loadDesign, fileName, refreshGate }
let pendingMigrate = false;

function toast(msg, err) { if (host && host.toast) host.toast(msg, err); }
function esc(s) { return host && host.esc ? host.esc(s) : String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

export function acctOverlayOpen() {
  return $$(".acctdlg").some((el) => !el.classList.contains("hidden"));
}

function closeAll() {
  const shouldMigrate = pendingMigrate;
  pendingMigrate = false;
  $$(".acctdlg").forEach((el) => el.classList.add("hidden"));
  if (shouldMigrate && $("migrateDlg")) $("migrateDlg").classList.remove("hidden");
}
function openDlg(id) {
  const migrateWait = pendingMigrate;
  pendingMigrate = false; // opening something else shouldn't immediately pop migrate
  $$(".acctdlg").forEach((el) => el.classList.add("hidden"));
  pendingMigrate = id === "accountDlg" ? migrateWait : false;
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function pane(name) {
  $$("#acctBody [data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== name));
}

function fillSignedIn() {
  const u = A.currentUser();
  const demo = A.isDemoMode();
  $("acctPill").textContent = u ? (u.display_name || u.email || "Account") : "Sign in";
  $("acctPill").classList.toggle("in", !!u);
  $("demoAcctBar") && $("demoAcctBar").classList.toggle("hidden", !demo);
  const signed = $("acctSigned");
  if (!signed) return;
  if (!u) return;
  $("acctWho").textContent = (u.display_name ? u.display_name + " · " : "") + (u.email || "");
  $("acctName").value = u.display_name || "";
  $$('input[name="acctMode"]').forEach((r) => { r.checked = r.value === (u.mode === "pro" ? "pro" : "beginner"); });
  const serials = A.linkedSerials();
  $("acctMachines").innerHTML = serials.length
    ? "<ul>" + serials.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>"
    : "<p class='muted'>No machine linked yet. Design and save are free; running a job needs a claimed table.</p>";
  $("acctAdminBtn").classList.toggle("hidden", !A.isAdmin());
  $("acctDemoAdmin").classList.toggle("hidden", !demo || A.isAdmin());
  $("acctDemoTag").classList.toggle("hidden", !demo);
}

async function refreshPartsList() {
  const box = $("partsList");
  if (!box) return;
  if (!A.isSignedIn()) { box.innerHTML = "<p class='muted'>Sign in to see saved parts.</p>"; return; }
  try {
    const rows = await A.listParts();
    if (!rows.length) { box.innerHTML = "<p class='muted'>No parts saved yet.</p>"; return; }
    box.innerHTML = rows.map((p) => {
      const when = p.updated_at ? new Date(p.updated_at).toLocaleString() : "";
      return `<div class="partrow" data-id="${esc(p.id)}">
        <div><b>${esc(p.name)}</b><div class="muted small">${esc(when)}</div></div>
        <div class="row">
          <button type="button" class="small" data-act="load">Open</button>
          <button type="button" class="small" data-act="rename">Rename</button>
          <button type="button" class="small warn" data-act="del">Delete</button>
        </div>
      </div>`;
    }).join("");
  } catch (e) { box.innerHTML = "<p class='muted'>" + esc(e.message) + "</p>"; }
}

async function refreshAdmin() {
  if (!A.isAdmin()) return;
  const box = $("adminTable");
  try {
    const rows = await A.adminListMachines();
    if (!rows.length) { box.innerHTML = "<p class='muted'>No machines yet. Add a serial and claim code.</p>"; return; }
    box.innerHTML = `<table class="accttable"><thead><tr><th>Serial</th><th>Linked account</th><th>Claimed</th><th>Notes</th><th></th></tr></thead><tbody>` +
      rows.map((m) => `<tr data-serial="${esc(m.serial)}">
        <td><b>${esc(m.serial)}</b></td>
        <td>${esc(m.owner_email || "—")}</td>
        <td class="small">${esc(m.claimed_at ? new Date(m.claimed_at).toLocaleString() : "—")}</td>
        <td class="small">${esc(m.notes || "")}</td>
        <td class="row">
          <button type="button" class="small" data-act="unlink" ${m.owner ? "" : "disabled"}>Unlink</button>
          <button type="button" class="small" data-act="transfer">Transfer</button>
        </td>
      </tr>`).join("") + "</tbody></table>";
  } catch (e) { box.innerHTML = "<p class='muted'>" + esc(e.message) + "</p>"; }
  const log = $("adminLog");
  if (log) {
    try {
      const ev = await A.adminListClaimLog(30);
      log.innerHTML = ev.length
        ? "<ul class='small'>" + ev.map((l) => `<li>${esc(l.at || "")} — ${l.ok ? "ok" : "no"} — ${esc(l.detail || "")}</li>`).join("") + "</ul>"
        : "<p class='muted'>No claim attempts yet.</p>";
    } catch (e) { log.textContent = e.message; }
  }
}

export function openAccount(paneName) {
  openDlg("accountDlg");
  if (A.snapshot().recovery) paneName = "newpin";
  if (A.isSignedIn() && paneName !== "newpin") {
    pane("home");
    fillSignedIn();
    refreshPartsList();
  } else {
    pane(paneName || "in");
  }
}

export function openClaim() {
  if (!A.isSignedIn()) { openAccount("in"); toast("Sign in first, then link your machine."); return; }
  openDlg("claimDlg");
  $("claimCode").value = "";
  $("claimSerial").value = "";
  $("claimHint").textContent = A.isDemoMode()
    ? "Local demo: use claim code " + CONFIG.DEMO_CLAIM_CODE + " to unlock the practice table."
    : "The claim code is on the sticker that came with the table. It can only be used once.";
}

export function openGate(why) {
  $("gateWhy").textContent = why || "Link your machine to run jobs";
  openDlg("gateDlg");
}

export function openAdmin() {
  if (!A.isAdmin()) { toast("Admin only", true); return; }
  openDlg("adminDlg");
  refreshAdmin();
}

export function closeAccountUi() { closeAll(); }

export function paintAccountChrome() {
  fillSignedIn();
  if (host && host.applyMode) host.applyMode(A.accountMode());
  if (host && host.refreshGate) host.refreshGate();
}

async function afterAuth(migratable) {
  fillSignedIn();
  if (host && host.applyMode) host.applyMode(A.accountMode());
  if (host && host.refreshGate) host.refreshGate();
  pane("home");
  await refreshPartsList();
  if (migratable && host && host.getDesign) {
    const items = host.getDesign();
    if (items && items.length) pendingMigrate = true;
  }
}

function bind() {
  $("acctPill").onclick = () => openAccount();
  $("demoAcctBar") && ($("demoAcctBar").onclick = () => openAccount());

  $("accountDlg").addEventListener("click", (e) => { if (e.target === $("accountDlg")) closeAll(); });
  $("claimDlg").addEventListener("click", (e) => { if (e.target === $("claimDlg")) closeAll(); });
  $("adminDlg").addEventListener("click", (e) => { if (e.target === $("adminDlg")) closeAll(); });
  $("gateDlg").addEventListener("click", (e) => { if (e.target === $("gateDlg")) closeAll(); });
  $("migrateDlg").addEventListener("click", (e) => { if (e.target === $("migrateDlg")) closeAll(); });
  $("conflictDlg").addEventListener("click", (e) => { if (e.target === $("conflictDlg")) closeAll(); });

  $$(".acctdlg .acct-close, .acctdlg [data-close]").forEach((b) => (b.onclick = closeAll));

  $("goSignUp").onclick = () => pane("up");
  $("goSignIn").onclick = () => pane("in");
  $("goReset").onclick = () => pane("reset");
  $("goLink").onclick = () => pane("link");
  $("confirmGoIn").onclick = () => pane("in");
  $("btnResendConfirm").onclick = async () => {
    try {
      const email = $("confirmEmail").dataset.email || $("confirmEmail").textContent;
      const r = await A.resendConfirm(email);
      toast(r.demoInstant ? "Demo: no email is sent in local demo mode." : "Confirmation email sent again. Check your inbox.");
    } catch (err) { toast(err.message, true); }
  };
  $("backIn1").onclick = () => pane("in");
  $("backIn2").onclick = () => pane("in");
  $("backIn3").onclick = () => pane("in");

  $("formSignIn").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await A.signIn({ email: $("inEmail").value, pin: $("inPin").value });
      toast("Signed in");
      await afterAuth(true);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

  $("formSignUp").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const mode = ($$('input[name="suMode"]').find((r) => r.checked) || {}).value;
      const r = await A.signUp({ email: $("upEmail").value, pin: $("upPin").value, display_name: $("upName").value, mode });
      if (r.confirm) {
        $("confirmEmail").textContent = r.email || $("upEmail").value;
        $("confirmEmail").dataset.email = r.email || $("upEmail").value;
        pane("confirm");
        toast("Check your email to confirm the account, then sign in.");
      } else {
        toast("Account created");
        if (A.isSignedIn()) await afterAuth(true);
        else pane("in");
      }
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

  $("formLink").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const r = await A.signInWithLink($("linkEmail").value);
      toast(r.demoInstant ? "Demo: signed in on this device (no email was sent)." : "Check your email for the sign-in link.");
      if (A.isSignedIn()) await afterAuth(true);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

  $("formReset").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const r = await A.requestReset($("resetEmail").value);
      if (r.demoInstant) {
        $("newPinEmail").value = $("resetEmail").value;
        pane("newpin");
        toast("Demo: choose a new login phrase. No email was sent.");
      } else toast("If that account exists, a reset email is on its way.");
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

  $("formNewPin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await A.setNewPin($("newPin").value, $("newPinEmail").value);
      toast("Login phrase updated");
      await afterAuth(false);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

  $("btnAcctSave").onclick = async () => {
    try {
      await A.setDisplayName($("acctName").value);
      const mode = ($$('input[name="acctMode"]').find((r) => r.checked) || {}).value;
      await A.setMode(mode);
      toast("Saved");
      fillSignedIn();
      if (host && host.applyMode) host.applyMode(A.accountMode());
    } catch (err) { toast(err.message, true); }
  };

  $("btnSignOut").onclick = async () => {
    await A.signOut();
    if (host && host.rememberPart) host.rememberPart(null);   // the next person must not save over this account's part id
    toast("Signed out");
    fillSignedIn();
    if (host && host.applyMode) host.applyMode(null);
    if (host && host.refreshGate) host.refreshGate();
    pane("in");
  };

  $("btnOpenClaim").onclick = () => openClaim();
  $("btnOpenParts").onclick = () => { $("partsCard").scrollIntoView({ block: "nearest" }); };
  $("acctAdminBtn").onclick = () => openAdmin();
  $("acctDemoAdmin").onclick = async () => {
    try { await A.grantDemoAdmin(); toast("This demo account is now an admin."); fillSignedIn(); }
    catch (err) { toast(err.message, true); }
  };

  $("btnSavePart").onclick = async () => { try { await saveCurrent(); } catch (err) { toast(err.message, true); } };

  $("partsList").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const row = b.closest(".partrow");
    const id = row && row.dataset.id;
    if (!id) return;
    try {
      if (b.dataset.act === "load") {
        const p = await A.loadPart(id);
        if (host && host.loadDesign) host.loadDesign(p);
        toast("Opened “" + p.name + "”");
        closeAll();
      } else if (b.dataset.act === "rename") {
        const name = prompt("New name", row.querySelector("b").textContent);
        if (!name) return;
        await A.renamePart(id, name);
        await refreshPartsList();
      } else if (b.dataset.act === "del") {
        if (!confirm("Delete this part from your account?")) return;
        await A.deletePart(id);
        await refreshPartsList();
        toast("Deleted");
      }
    } catch (err) { toast(err.message, true); }
  });

  $("formClaim").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const r = await A.claimMachine($("claimCode").value, $("claimSerial").value);
      toast("Linked " + r.serial);
      closeAll();
      fillSignedIn();
      if (host && host.refreshGate) host.refreshGate();
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

  $("gateSignIn").onclick = () => openAccount("in");
  $("gateClaim").onclick = () => openClaim();

  $("migrateYes").onclick = async () => {
    try {
      const items = host && host.getDesign ? host.getDesign() : [];
      const name = (host && host.fileName && host.fileName()) || "Imported from this device";
      const p = await A.migrateLocalParts(items, name);
      if (p && host && host.rememberPart) host.rememberPart(p);
      toast("Saved to your account");
      closeAll();
      openAccount();
    } catch (err) { toast(err.message, true); }
  };
  $("migrateNo").onclick = closeAll;

  $("conflictMine").onclick = async () => {
    const job = $("conflictDlg")._job;
    if (!job) return closeAll();
    try {
      const p = await A.savePart({ ...job, keepBoth: false, updated_at: new Date().toISOString() });
      if (host && host.rememberPart) host.rememberPart(p);
      toast("Kept your copy");
      closeAll();
    } catch (err) { toast(err.message, true); }
  };
  $("conflictBoth").onclick = async () => {
    const job = $("conflictDlg")._job;
    if (!job) return closeAll();
    try {
      const p = await A.savePart({ ...job, keepBoth: true });
      if (host && host.rememberPart) host.rememberPart(p);
      toast("Kept both copies");
      closeAll();
    } catch (err) { toast(err.message, true); }
  };
  $("conflictTheirs").onclick = async () => {
    const job = $("conflictDlg")._job;
    if (!job || !job.conflict) return closeAll();
    try {
      if (host && host.loadDesign) host.loadDesign(job.conflict.remote);
      toast("Loaded the other copy");
      closeAll();
    } catch (err) { toast(err.message, true); }
  };

  $("btnGenCode").onclick = () => { $("admCode").value = A.makeClaimCode(); };
  $("formAddMachine").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await A.adminAddMachine($("admSerial").value, $("admCode").value, $("admNotes").value);
      $("admSerial").value = ""; $("admCode").value = ""; $("admNotes").value = "";
      toast("Machine saved");
      await refreshAdmin();
    } catch (err) { toast(err.message, true); }
  });
  $("adminTable").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const ser = b.closest("tr").dataset.serial;
    try {
      if (b.dataset.act === "unlink") {
        if (!confirm("Unlink " + ser + " from its account?")) return;
        await A.adminUnlinkMachine(ser);
        toast("Unlinked " + ser);
      } else if (b.dataset.act === "transfer") {
        const email = prompt("Transfer " + ser + " to which email?");
        if (!email) return;
        await A.adminTransferMachine(ser, email);
        toast("Transferred " + ser);
      }
      await refreshAdmin();
      if (host && host.refreshGate) host.refreshGate();
    } catch (err) { toast(err.message, true); }
  });
}

export async function saveCurrent() {
  if (!A.isSignedIn()) { openAccount("in"); throw new Error("Sign in to save parts to your account."); }
  if (!host || !host.getDesign) throw new Error("Nothing to save.");
  const items = host.getDesign();
  if (!items || !items.length) throw new Error("The drawing is empty.");
  const name = ($("partName") && $("partName").value.trim()) || (host.fileName && host.fileName()) || "Untitled part";
  const cur = host.currentPart ? host.currentPart() : null;
  try {
    const p = await A.savePart({
      id: cur && cur.id,
      name,
      data: { items },
      updated_at: cur && cur.updated_at,
    });
    if (host.rememberPart) host.rememberPart(p);
    if ($("partName")) $("partName").value = p.name;
    toast("Saved “" + p.name + "”");
    await refreshPartsList();
    return p;
  } catch (err) {
    if (err && err.conflict) {
      $("conflictDlg")._job = { id: cur && cur.id, name, data: { items }, updated_at: cur && cur.updated_at, conflict: err.conflict };
      $("conflictText").textContent = "This part was also changed somewhere else. Keep yours (last write wins), keep both, or open the other copy?";
      openDlg("conflictDlg");
      return null;
    }
    throw err;
  }
}

export function showConflict(job) {
  $("conflictDlg")._job = job;
  openDlg("conflictDlg");
}

export async function initAccountUi(opts) {
  host = opts || {};
  await A.initAccount();
  bind();
  A.onAccountChange(() => paintAccountChrome());
  paintAccountChrome();
  if (A.snapshot().recovery) openAccount("newpin");
  return A.snapshot();
}

export { A as accountApi };

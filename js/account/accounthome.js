// The account dialog itself (signed-in view), claim and gate dialogs, and the account chrome (pill, gating).
import { $, $$, askKeepDrawing, closeAll, declineMigrate, esc, host, openDlg, pane, toast } from "./uibase.js";
import { CONFIG } from "./config.js";
import { currentAdminTab, refreshAdmin, refreshAdminAnnounce, refreshAdminPresets, refreshAdminStats, refreshAdminUsers, showAdminTab } from "./adminview.js";
import { metaCache, refreshPartsList, setPartsRows } from "./partslist.js";
import { paintAnnouncements } from "./announceui.js";
import { renderAdvancedMachine } from "../machine/admin-machine.js";
import * as A from "./account.js";

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
  const serials = A.linkedSerials();
  $("acctMachines").innerHTML = serials.length
    ? "<ul>" + serials.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>"
    : "<p class='muted'>No machine linked yet. Design and save are free; running a job needs a claimed table.</p>";
  $("acctAdminBtn").classList.toggle("hidden", !A.isAdmin());
  $("acctDemoAdmin").classList.toggle("hidden", !A.canGrantDemoAdmin() || A.isAdmin());
  $("acctDemoTag").classList.toggle("hidden", !demo);
}
export function openAccount(paneName) {
  openDlg("accountDlg");
  if (A.snapshot().recovery) paneName = "newpin";
  if (A.isSignedIn() && paneName !== "newpin") {
    pane("home");
    fillSignedIn();
  } else {
    pane(paneName || "in");
  }
}
// round 5 item 13: the saved parts are their own screen (Account keeps profile, machine link and sign out)
export function openParts() {
  if (!A.isSignedIn()) { openAccount("in"); toast("Sign in to see your saved parts."); return; }
  openDlg("partsDlg");
  refreshPartsList();
}
export function openClaim() {
  if (!A.isSignedIn()) { openAccount("in"); toast("Sign in first, then link your machine."); return; }
  openDlg("claimDlg");
  $("claimCode").value = "";
  $("claimSerial").value = "";
  $("claimHint").textContent = A.isDemoMode()
    ? "Local demo: use the practice code " + CONFIG.DEMO_CLAIM_CODE + ". Each demo account gets its own practice table; it exists only in this browser."
    : "The claim code is on the sticker that came with the table. It can only be used once.";
}
export function openGate(why) {
  const signed = A.isSignedIn();
  $("gateWhy").textContent = why || (signed ? "Locked: link a machine to run jobs. You are signed in." : "Locked: sign in, then link a machine to run jobs.");
  $("gateSignIn").classList.toggle("hidden", signed);       // no "Sign in" offer to someone who already is
  openDlg("gateDlg");
}
// Says whether Pro / firmware limits are backed by the server (supabase/b5-gating.sql has been run) or only by this browser.
function paintGating() {
  const el = $("adminGating"); if (!el) return;
  const g = A.gatingSource();
  el.textContent = g === "server" ? "Pro and firmware limits are enforced by the server."
    : g === "demo" ? "Local demo: Pro and firmware limits are checked in this browser only (there is no server)."
    : "Pro and firmware limits are only checked in this browser. To enforce them on the server, run supabase/b5-gating.sql once in the Supabase SQL editor.";
  el.dataset.gating = g;
}
export function openAdmin(tab) {
  if (!A.isAdmin()) { toast("Admin only", true); return; }
  openDlg("adminDlg");
  paintGating();
  if (tab) showAdminTab(tab);
  refreshAdmin();
  refreshAdminUsers();
  refreshAdminStats();
  refreshAdminAnnounce();
  refreshAdminPresets();
  if ((tab || currentAdminTab()) === "advanced") renderAdvancedMachine();
}
export function closeAccountUi() { closeAll(); }
export function paintAccountChrome() {
  fillSignedIn();
  paintAnnouncements();
  if (host && host.applyMode) host.applyMode(A.accountMode());
  if (host && host.refreshGate) host.refreshGate();
}
export async function afterAuth(migratable) {
  fillSignedIn();
  if (host && host.applyMode) host.applyMode(A.accountMode());
  if (host && host.refreshGate) host.refreshGate();
  pane("home");
  await refreshPartsList();
  claimWorkspace(migratable);
}
// round 5 item 10: the drawing, recent files and material on this device belong to whoever last signed in here. When someone else
// signs in, a drawing is offered once ("Keep this drawing?"); "Start fresh", or no drawing at all, clears the lot.
const OWNER_KEY = "plasma.workspaceOwner";
function claimWorkspace(migratable) {
  const u = A.currentUser(); if (!u) return;
  let owner = null; try { owner = localStorage.getItem(OWNER_KEY); } catch (e) { /* ignore */ }
  if (owner === u.id) return;
  try { localStorage.setItem(OWNER_KEY, u.id); } catch (e) { /* ignore */ }
  const items = host && host.getDesign ? host.getDesign() : [];
  if (migratable && items && items.length) askKeepDrawing();
  else if (owner && host && host.startFresh) host.startFresh();
}
export function bindDialogs() {
  $("acctPill").onclick = () => openAccount();
  $("demoAcctBar") && ($("demoAcctBar").onclick = () => openAccount());
  $("accountDlg").addEventListener("click", (e) => { if (e.target === $("accountDlg")) closeAll(); });
  $("claimDlg").addEventListener("click", (e) => { if (e.target === $("claimDlg")) closeAll(); });
  $("adminDlg").addEventListener("click", (e) => { if (e.target === $("adminDlg")) closeAll(); });
  $("gateDlg").addEventListener("click", (e) => { if (e.target === $("gateDlg")) closeAll(); });
  $("migrateDlg").addEventListener("click", (e) => { if (e.target === $("migrateDlg")) closeAll(); });
  $("conflictDlg").addEventListener("click", (e) => { if (e.target === $("conflictDlg")) closeAll(); });
  $("saveDlg").addEventListener("click", (e) => { if (e.target === $("saveDlg")) closeAll(); });
  $("partsDlg").addEventListener("click", (e) => { if (e.target === $("partsDlg")) closeAll(); });
  $$(".acctdlg .acct-close, .acctdlg [data-close]").forEach((b) => (b.onclick = closeAll));
}
export function bindHome() {
  $("btnAcctParts").onclick = openParts;
  $("menuParts").onclick = openParts;
  $("btnAcctSave").onclick = async () => {
    try {
      await A.setDisplayName($("acctName").value);
      toast("Saved");
      fillSignedIn();
    } catch (err) { toast(err.message, true); }
  };
  $("btnSignOut").onclick = async () => {
    await A.signOut();
    if (host && host.rememberPart) host.rememberPart(null);   // the next person must not save over this account's part id
    // nothing of the previous (local demo) account may stay on screen: lists, name boxes, sign-in fields, cached previews
    setPartsRows([]); metaCache.clear();
    for (const id of ["partsList", "acctMachines"]) if ($(id)) $(id).innerHTML = "";
    for (const id of ["partName", "acctName", "acctWho"]) if ($(id)) { if ("value" in $(id)) $(id).value = ""; else $(id).textContent = ""; }
    document.querySelectorAll("#accountDlg form").forEach((f) => { try { f.reset(); } catch (e) { /* ignore */ } });
    toast("Signed out");
    fillSignedIn();
    if (host && host.applyMode) host.applyMode(null);
    if (host && host.refreshGate) host.refreshGate();
    pane("in");
  };
  $("btnOpenClaim").onclick = () => openClaim();
  $("acctAdminBtn").onclick = () => openAdmin();
  $("acctDemoAdmin").onclick = async () => {
    try { await A.grantDemoAdmin(); toast("This demo account is now an admin."); fillSignedIn(); }
    catch (err) { toast(err.message, true); }
  };
  $("formClaim").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const r = await A.claimMachine($("claimCode").value, $("claimSerial").value);
      toast("Linked " + r.serial);
      closeAll();
      paintAccountChrome();         // header, machine list and the Start / Connect lock notes, without a reload
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
  $("migrateNo").onclick = () => { declineMigrate(); if (host && host.startFresh) host.startFresh(); };
}

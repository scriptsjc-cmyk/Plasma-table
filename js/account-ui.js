// Account, parts, claim and admin dialogs. Talks to account.js; the host
// (app.js) passes toast/esc and hooks for mode, design load/save, and gating.

import * as A from "./account.js";
import { CONFIG } from "./config.js";
import { initAdminMachine, renderAdvancedMachine } from "./admin-machine.js";

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
  $("acctDemoAdmin").classList.toggle("hidden", !A.canGrantDemoAdmin() || A.isAdmin());
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
          <button type="button" class="small go" data-act="edit" title="Open it in the full-screen shape editor">Edit</button>
          <button type="button" class="small" data-act="dup" title="Make a copy of this part in this list">Duplicate</button>
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


function when(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString(); } catch (e) { return String(iso); } }
function currentAdminTab() {
  const b = document.querySelector(".admtab.sel");
  return (b && b.dataset.admtab) || "users";
}
function showAdminTab(name) {
  $$(".admtab").forEach((b) => b.classList.toggle("sel", b.dataset.admtab === name));
  $$(".admpane").forEach((p) => p.classList.toggle("hidden", p.dataset.admpane !== name));
  if (name === "advanced") renderAdvancedMachine();
}

async function refreshAdminUsers(query) {
  const box = $("adminUsers"); if (!box) return;
  if (!A.isAdmin()) { box.replaceChildren(); return; }
  try {
    const rows = await A.adminListUsers(query != null ? query : ($("adminUserQ") && $("adminUserQ").value));
    box.replaceChildren();
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No users match."; box.appendChild(p); return; }
    for (const u of rows) {
      const div = document.createElement("div");
      div.className = "userrow";
      const h = document.createElement("b"); h.textContent = u.email || "—";
      const sub = document.createElement("div"); sub.className = "muted";
      const machines = (u.machines || []).map((m) => m.serial + (m.claimed_at ? " (claimed " + when(m.claimed_at) + ")" : "")).join(", ");
      sub.textContent = [u.display_name || "", u.mode || "beginner", "joined " + when(u.created_at), "last active " + when(u.last_active), (u.parts_count || 0) + " parts", machines ? "machines: " + machines : "no machine"].filter(Boolean).join(" · ");
      div.append(h, sub);
      box.appendChild(div);
    }
  } catch (e) { box.replaceChildren(); const p = document.createElement("p"); p.className = "muted"; p.textContent = e.message; box.appendChild(p); }
}

async function refreshAdminStats() {
  const box = $("adminStats"); if (!box) return;
  if (!A.isAdmin()) return;
  try {
    const s = await A.adminUsageStats();
    box.replaceChildren();
    const grid = document.createElement("div"); grid.className = "statgrid";
    const items = [
      [s.users, "Users"], [s.active_7, "Active (7 days)"], [s.active_30, "Active (30 days)"],
      [s.beginner, "Beginner"], [s.pro, "Pro"],
      [s.machines_claimed, "Claimed machines"],
      [s.jobs_started, "Jobs started"], [s.jobs_finished, "Jobs finished"], [s.jobs_aborted, "Jobs aborted"],
      [s.cut_time_s != null ? Math.round(s.cut_time_s / 60) : "—", "Cut minutes"],
      [s.cut_length_mm != null ? Math.round(Number(s.cut_length_mm) / 1000 * 10) / 10 : "—", "Metres cut"],
    ];
    for (const [n, label] of items) {
      const c = document.createElement("div"); c.className = "statcard";
      const b = document.createElement("b"); b.textContent = String(n ?? "—");
      const sp = document.createElement("span"); sp.textContent = label;
      c.append(b, sp); grid.appendChild(c);
    }
    box.appendChild(grid);
    const signups = s.signups || [];
    if (signups.length) {
      const cap = document.createElement("h3"); cap.textContent = "Sign-ups over time";
      const chart = document.createElement("div"); chart.className = "signupchart";
      const max = Math.max(1, ...signups.map((d) => d.n));
      for (const d of signups) {
        const i = document.createElement("i");
        i.style.height = Math.max(4, (d.n / max) * 80) + "px";
        i.title = d.day + ": " + d.n;
        chart.appendChild(i);
      }
      box.append(cap, chart);
    }
  } catch (e) { box.textContent = e.message; }
  const evBox = $("adminJobEvents");
  if (!evBox) return;
  try {
    const ev = await A.adminListJobEvents(50);
    evBox.replaceChildren();
    if (!ev.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No jobs logged yet."; evBox.appendChild(p); return; }
    const table = document.createElement("table"); table.className = "accttable";
    table.innerHTML = "<thead><tr><th>When</th><th>Status</th><th>Serial</th><th>Duration</th><th>Cut (mm)</th><th>Parts</th></tr></thead>";
    const tb = document.createElement("tbody");
    for (const r of ev) {
      const tr = document.createElement("tr");
      for (const v of [when(r.started_at || r.created_at), r.status || "", r.machine_serial || "—", r.duration_s != null ? r.duration_s + " s" : "—", r.cut_length_mm != null ? r.cut_length_mm : "—", r.part_count != null ? r.part_count : "—"]) {
        const td = document.createElement("td"); td.textContent = String(v); tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    table.appendChild(tb); evBox.appendChild(table);
  } catch (e) { evBox.textContent = e.message; }
}

function announcementNode(a) {
  const div = document.createElement("div");
  div.className = "annrow sev-" + (a.severity || "info");
  const h = document.createElement("b"); h.textContent = a.title || "";
  const body = document.createElement("div"); body.textContent = a.body || "";
  const meta = document.createElement("div"); meta.className = "muted";
  meta.textContent = (a.severity || "info") + " · " + when(a.created_at) + (a.expires_at ? " · expires " + when(a.expires_at) : "");
  div.append(h, body, meta);
  return div;
}

async function refreshAdminAnnounce() {
  const box = $("adminAnnList"); if (!box) return;
  if (!A.isAdmin()) return;
  try {
    const rows = await A.listAnnouncements();
    box.replaceChildren();
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No announcements yet."; box.appendChild(p); return; }
    for (const a of rows) {
      const n = announcementNode(a);
      const del = document.createElement("button"); del.type = "button"; del.className = "small warn"; del.textContent = "Delete";
      del.onclick = async () => {
        try { await A.adminDeleteAnnouncement(a.id); toast("Deleted"); await refreshAdminAnnounce(); await paintAnnouncements(); }
        catch (err) { toast(err.message, true); }
      };
      n.appendChild(del);
      box.appendChild(n);
    }
  } catch (e) { box.textContent = e.message; }
}

async function refreshAdminPresets() {
  const box = $("adminPresets"); if (!box) return;
  try {
    const rows = await A.listCutPresets();
    box.replaceChildren();
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No presets yet."; box.appendChild(p); return; }
    const table = document.createElement("table"); table.className = "accttable";
    table.innerHTML = "<thead><tr><th>Material</th><th>mm</th><th>Pierce s</th><th>Height</th><th>Speed</th><th></th></tr></thead>";
    const tb = document.createElement("tbody");
    for (const r of rows) {
      const tr = document.createElement("tr");
      for (const v of [r.material, r.thickness_mm, r.pierce_delay_s ?? "—", r.pierce_height_mm ?? "—", r.cut_speed_mm_min ?? "—"]) {
        const td = document.createElement("td"); td.textContent = String(v); tr.appendChild(td);
      }
      const td = document.createElement("td");
      if (A.isAdmin()) {
        const b = document.createElement("button"); b.type = "button"; b.className = "small warn"; b.textContent = "Delete";
        b.onclick = async () => { try { await A.adminDeleteCutPreset(r.id); await refreshAdminPresets(); } catch (err) { toast(err.message, true); } };
        td.appendChild(b);
      }
      tr.appendChild(td); tb.appendChild(tr);
    }
    table.appendChild(tb); box.appendChild(table);
  } catch (e) { box.textContent = e.message; }
}

let announceQueue = [];
export async function paintAnnouncements() {
  const bar = $("announceBar");
  if (!bar) return;
  if (!A.isSignedIn()) {
    bar.classList.add("hidden");
    announceQueue = [];
    return;
  }
  try {
    const rows = (await A.listAnnouncements()).filter((a) => !a.read);
    announceQueue = rows;
    const a = rows[0];
    if (!a) { bar.classList.add("hidden"); return; }
    $("announceTitle").textContent = a.title || "";
    $("announceBody").textContent = a.body || "";
    bar.classList.remove("hidden", "sev-info", "sev-warning", "sev-update");
    bar.classList.add("sev-" + (a.severity || "info"));
    bar.dataset.id = a.id;
  } catch (e) { bar.classList.add("hidden"); }
}

export function openAnnounceInbox() {
  const dlg = $("announceDlg"); if (!dlg) return;
  openDlg("announceDlg");
  fillAnnounceInbox();
}

async function fillAnnounceInbox() {
  const box = $("announceInbox"); if (!box) return;
  box.replaceChildren();
  try {
    const rows = await A.listAnnouncements();
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No announcements."; box.appendChild(p); return; }
    for (const a of rows) {
      const n = announcementNode(a);
      if (!a.read) {
        const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = "Mark read";
        b.onclick = async () => { await A.markAnnouncementRead(a.id); await paintAnnouncements(); fillAnnounceInbox(); };
        n.appendChild(b);
      }
      box.appendChild(n);
    }
  } catch (e) { box.textContent = e.message; }
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
  $("gateWhy").textContent = why || "Locked: sign in, then link a machine to run jobs.";
  openDlg("gateDlg");
}

export function openAdmin(tab) {
  if (!A.isAdmin()) { toast("Admin only", true); return; }
  openDlg("adminDlg");
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
  $("saveDlg").addEventListener("click", (e) => { if (e.target === $("saveDlg")) closeAll(); });
  const doSave = (mode) => async () => {
    $("saveDlg")._name = $("saveName").value.trim() || "Untitled part";
    closeAll();
    try { await saveCurrent(mode); } catch (err) { toast(err.message, true); }
  };
  $("saveOver").onclick = doSave("over");
  $("saveCopy").onclick = doSave("copy");
  $("btnUndoSave").onclick = () => undoSave();
  $("btnUndoX").onclick = () => { $("undoSave").classList.add("hidden"); undoJob = null; };

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
        toast("Demo: choose a new password. No email was sent.");
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
      toast("Password updated");
      await afterAuth(false);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

  if ($("btnStartDesign")) {
    $("btnStartDesign").onclick = () => {
      closeAll();
      if (host && host.startDesigning) host.startDesigning();
    };
  }

  $$('input[name="acctMode"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked && host && host.applyMode) host.applyMode(r.value);
      if (r.checked) A.setMode(r.value).catch(() => {});
    });
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
      } else if (b.dataset.act === "edit") {
        const p = await A.loadPart(id);
        if (host && host.loadDesign) host.loadDesign(p);
        closeAll();
        if (host && host.openEditor) host.openEditor();
        toast("Editing “" + p.name + "”. Save… offers overwrite or a copy.");
      } else if (b.dataset.act === "dup") {
        const p = await A.loadPart(id);
        const c = await A.savePart({ name: p.name + " (copy)", data: p.data });
        await refreshPartsList();
        toast("Made “" + c.name + "”");
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
      await refreshAdminUsers();
      if (host && host.refreshGate) host.refreshGate();
    } catch (err) { toast(err.message, true); }
  });

  $$(".admtab").forEach((b) => {
    b.onclick = () => {
      showAdminTab(b.dataset.admtab);
      if (b.dataset.admtab === "users") refreshAdminUsers();
      if (b.dataset.admtab === "stats") refreshAdminStats();
      if (b.dataset.admtab === "announce") refreshAdminAnnounce();
      if (b.dataset.admtab === "machines") refreshAdmin();
      if (b.dataset.admtab === "presets") refreshAdminPresets();
    };
  });
  $("adminUserQ") && $("adminUserQ").addEventListener("input", () => { refreshAdminUsers(); });
  $("formAnnounce") && $("formAnnounce").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const exp = $("annExp").value ? new Date($("annExp").value).toISOString() : null;
      await A.adminCreateAnnouncement({ title: $("annTitle").value, body: $("annBody").value, severity: $("annSev").value, expiresAt: exp });
      $("annTitle").value = ""; $("annBody").value = "";
      toast("Announcement published");
      await refreshAdminAnnounce();
      await paintAnnouncements();
    } catch (err) { toast(err.message, true); }
  });
  $("formPreset") && $("formPreset").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await A.adminUpsertCutPreset({
        material: $("preMat").value,
        thickness_mm: Number($("preThk").value),
        pierce_delay_s: $("preDelay").value === "" ? null : Number($("preDelay").value),
        pierce_height_mm: $("preHeight").value === "" ? null : Number($("preHeight").value),
        cut_speed_mm_min: $("preSpeed").value === "" ? null : Number($("preSpeed").value),
        notes: $("preNotes").value,
      });
      toast("Preset saved");
      await refreshAdminPresets();
    } catch (err) { toast(err.message, true); }
  });
  $("announceDismiss") && ($("announceDismiss").onclick = async () => {
    const id = $("announceBar").dataset.id;
    if (id) await A.markAnnouncementRead(id);
    await paintAnnouncements();
  });
  $("announceOpen") && ($("announceOpen").onclick = () => openAnnounceInbox());
  $("announceDlg") && $("announceDlg").addEventListener("click", (e) => { if (e.target === $("announceDlg")) closeAll(); });
}

// Save: a brand-new drawing saves straight away. A part that came from the account asks first: save over it
// (an Undo bar puts the old version back) or save as a copy in the same parts list.
export async function saveCurrent(mode) {
  if (!A.isSignedIn()) { openAccount("in"); throw new Error("Sign in to save parts to your account."); }
  if (!host || !host.getDesign) throw new Error("Nothing to save.");
  const items = host.getDesign();
  if (!items || !items.length) throw new Error("The drawing is empty.");
  const cur = host.currentPart ? host.currentPart() : null;
  const name0 = ($("partName") && $("partName").value.trim()) || (host.fileName && host.fileName()) || "Untitled part";
  if (cur && cur.id && !mode) {
    $("saveTitle").textContent = "Save “" + (cur.name || name0) + "”";
    $("saveName").value = cur.name || name0;
    $("saveText").textContent = "Save over the original keeps one part (an Undo button appears so you can put the old one back). Save as copy adds a new part next to it and leaves the original alone.";
    $("saveOver").classList.remove("hidden");
    openDlg("saveDlg");
    setTimeout(() => $("saveName").select && $("saveName").select(), 30);
    return null;
  }
  const name = $("saveDlg")._name || name0;
  $("saveDlg")._name = null;
  if (mode === "copy") {
    const base = String(name).replace(/ \(copy( \d+)?\)$/, "");
    const nm = name === (cur && cur.name) ? base + " (copy)" : name;
    const p = await A.savePart({ name: nm, data: { items } });
    if (host.rememberPart) host.rememberPart(p);
    if ($("partName")) $("partName").value = p.name;
    toast("Saved a copy: “" + p.name + "”");
    await refreshPartsList();
    return p;
  }
  let prev = null;
  if (mode === "over" && cur && cur.id) { try { prev = await A.loadPart(cur.id); } catch { prev = null; } }
  try {
    const p = await A.savePart({ id: cur && cur.id, name, data: { items }, updated_at: cur && cur.updated_at });
    if (host.rememberPart) host.rememberPart(p);
    if ($("partName")) $("partName").value = p.name;
    toast("Saved “" + p.name + "”");
    await refreshPartsList();
    if (prev) offerUndo(p, prev);
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

let undoTimer = null, undoJob = null;
function offerUndo(saved, prev) {
  undoJob = { saved, prev };
  $("undoText").textContent = "Saved over “" + saved.name + "”.";
  $("undoSave").classList.remove("hidden");
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $("undoSave").classList.add("hidden"); undoJob = null; }, 60000);
}
export async function undoSave() {
  if (!undoJob) return false;
  const { saved, prev } = undoJob; undoJob = null;
  clearTimeout(undoTimer); $("undoSave").classList.add("hidden");
  try {
    const p = await A.savePart({ id: saved.id, name: prev.name, data: prev.data, updated_at: saved.updated_at });
    if (host.loadDesign) host.loadDesign(p);
    toast("Put back the previous version of “" + p.name + "”");
    await refreshPartsList();
    return true;
  } catch (err) { toast(err.message, true); return false; }
}

export function showConflict(job) {
  $("conflictDlg")._job = job;
  openDlg("conflictDlg");
}

export async function initAccountUi(opts) {
  host = opts || {};
  await A.initAccount();
  bind();
  initAdminMachine({
    toast,
    isAdmin: () => A.isAdmin(),
    isPro: () => A.isPro() || A.isAdmin(),
    send: host.sendAdvanced,
    confirm: host.confirm,
    readSettings: host.readSettings,
    writeSettings: host.writeSettings,
    calMove: host.calMove,
    addPattern: host.addPattern,
  });
  A.onAccountChange(() => paintAccountChrome());
  paintAccountChrome();
  try { await A.touchLastActive(); } catch (e) { /* ignore */ }
  if (A.snapshot().recovery) openAccount("newpin");
  return A.snapshot();
}

export { A as accountApi };

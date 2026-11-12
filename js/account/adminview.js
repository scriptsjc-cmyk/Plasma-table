// The admin dialog: machines, users, usage stats, announcements, cut presets.
import { $, $$, esc, host, toast, when } from "./uibase.js";
import { announcementNode, paintAnnouncements } from "./announceui.js";
import { renderAdvancedMachine } from "../machine/admin-machine.js";
import * as A from "./account.js";
import { askConfirm } from "../core/safeprompt.js";

export async function refreshAdmin() {
  if (!A.isAdmin()) return;
  const box = $("adminTable");
  try {
    const rows = await A.adminListMachines();
    if (!rows.length) { box.innerHTML = "<p class='muted'>No machines yet. Add a serial and claim code.</p>"; return; }
    box.innerHTML = `<table class="accttable"><thead><tr><th>Serial</th><th>Linked account</th><th>Claimed</th><th>Notes</th><th></th></tr></thead><tbody>` +
      rows.map((m) => `<tr data-serial="${esc(m.serial)}">
        <td><b>${esc(m.serial)}</b>${m.practice ? " <span class='small muted'>practice</span>" : ""}</td>
        <td>${esc(m.owner_email || "—")}</td>
        <td class="small">${esc(m.claimed_at ? new Date(m.claimed_at).toLocaleString() : "—")}</td>
        <td class="small">${esc(m.notes || "")}</td>
        <td class="row">
          <button type="button" class="small" data-act="unlink" ${m.owner ? "" : "disabled"}>Unlink</button>
          <button type="button" class="small" data-act="transfer" ${m.practice ? "disabled title='Practice tables stay with their own account'" : ""}>Transfer</button>
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
export function currentAdminTab() {
  const b = document.querySelector(".admtab.sel");
  return (b && b.dataset.admtab) || "users";
}
export function showAdminTab(name) {
  $$(".admtab").forEach((b) => b.classList.toggle("sel", b.dataset.admtab === name));
  $$(".admpane").forEach((p) => p.classList.toggle("hidden", p.dataset.admpane !== name));
  if (name === "advanced") renderAdvancedMachine();
}
export async function refreshAdminUsers(query) {
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
export async function refreshAdminStats() {
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
export async function refreshAdminAnnounce() {
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
export async function refreshAdminPresets() {
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
function listedAdminSerials() {
  return [...document.querySelectorAll("#adminTable tr[data-serial]")].map((tr) => tr.dataset.serial);
}
async function copySavedCode(code) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(code);
    else {
      const i = document.createElement("textarea"); i.value = code; document.body.appendChild(i); i.select();
      document.execCommand("copy"); i.remove();
    }
    toast("Copied " + code);
  } catch (e) { toast("Copy failed — the code is still on the page", true); }
}
function showSaveReceipt(serial, code) {
  const box = $("admSaveReceipt"), text = $("admSaveReceiptText");
  if (!box || !text) return;
  text.textContent = A.machineSavedMessage(serial, code);
  box.dataset.code = code;
  box.classList.remove("hidden");
}
export function bindAdmin() {
  $("btnGenCode").onclick = () => { $("admCode").value = A.makeClaimCode(); };
  if ($("admSaveCopy")) $("admSaveCopy").onclick = () => { const c = $("admSaveReceipt") && $("admSaveReceipt").dataset.code; if (c) copySavedCode(c); };
  if ($("admSaveDismiss")) $("admSaveDismiss").onclick = () => { const box = $("admSaveReceipt"); if (box) { box.classList.add("hidden"); box.dataset.code = ""; } };
  $("formAddMachine").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const serialVal = $("admSerial").value, codeVal = $("admCode").value;
      const warn = A.overwriteCodeWarning(serialVal, listedAdminSerials());
      if (warn) {
        const ok = await askConfirm({ title: "Replace the claim code?", body: warn, ok: "Replace code", cancel: "Cancel", danger: true });
        if (!ok) return;
      }
      const r = await A.adminAddMachine(serialVal, codeVal, $("admNotes").value);
      const saved = (r && r.serial) || serialVal;
      const code = (r && r.code) || codeVal;
      $("admSerial").value = ""; $("admCode").value = ""; $("admNotes").value = "";
      showSaveReceipt(saved, code);
      await refreshAdmin();
    } catch (err) { toast(err.message, true); }
  });
  $("adminTable").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const ser = b.closest("tr").dataset.serial;
    try {
      if (b.dataset.act === "unlink") {
        if (!(await askConfirm({ title: "Unlink this machine?", body: "Unlink " + ser + " from its account?", ok: "Unlink", cancel: "Cancel", danger: true }))) return;
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
}

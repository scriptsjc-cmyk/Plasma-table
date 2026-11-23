// r15 Round 9: the ☰ windows "Set up your new table" (9.2), "Cut history" (9.6) and "Send a problem report" (9.3).
// Nothing here talks to the machine: the guide only opens the right place (it never presses Connect or starts a test).
import { $, toast } from "../core/dom.js";
import { S, M } from "../core/state.js";
import { showTab, goStep } from "../core/hooks.js";
import { showScreen } from "./flow.js";
import { askConfirm } from "../core/safeprompt.js";
import { setSetupTab } from "../machine/setupbed.js";
import { readHistory, clearHistory, resultText } from "../core/cuthistory.js";
// report.js loads when a report is made, not at start-up (every start-up file costs a round trip on a slow connection)
const reportMod = () => import("../core/report.js");
import { RUN } from "./about.js";

const store = () => { try { return window.localStorage; } catch (e) { return null; } };
const DLGS = ["guideDlg", "historyDlg", "reportDlg"];
const openDlg = (id) => { const d = $(id); if (!d) return; d.classList.remove("hidden"); const f = d.querySelector("button, textarea"); if (f) f.focus({ preventScroll: true }); };
const closeDlg = (id) => { const d = $(id); if (d) d.classList.add("hidden"); };
const saveFile = (name, text, type) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};

// ---------------------------------------------------------------- 9.2 the setup guide
export const GUIDE_KEY = "plasma.setupGuide.v1";
const machineSetup = (tab) => { showScreen("cut"); showTab("setup"); setSetupTab(tab); };
const GUIDE = [
  // r18 (Josh 23 Nov): the plasma cutter comes first – it sets the cut chart (amps, air, speeds, limits)
  { id: "plasma", title: "Choose your plasma cutter", body: "The ANDELI CUT-65DS comes with the table. If you use a different cutter, pick it here – the amps, air, speeds and thickness limits follow it. You can change it later in Settings › Torch.",
    open: () => { closeDlg("guideDlg"); import("../machine/settings.js").then((m) => m.openSettings("torch")).catch(() => {}); },
    picker: true, auto: () => { try { return !!localStorage.getItem("plasma.profile"); } catch (e) { return false; } } },
  { id: "connect", title: "Connect the table", body: "Plug the table into this computer with the USB cable (or pair it by Bluetooth) and switch it on. Then press Connect on Cut › Setup.",
    // Connect sits on Cut › Setup, which opens once a part is chosen: point at it there (never press it)
    open: () => {
      showScreen("cut"); showTab("cut");
      if (!S.prepared) { goStep(1); toast("Choose any part first (the test coupon is fine). Connect is on the next step, Setup."); return; }
      goStep(3); const b = $("btnConnect"); if (b) { b.scrollIntoView({ block: "center" }); b.classList.add("guide-flash"); setTimeout(() => b.classList.remove("guide-flash"), 2500); }
    },
    auto: () => !!(S.connected && !S.demo) },
  { id: "motors", title: "Check the motor directions", body: "On Machine setup › Motors, jog each axis a short way and say whether it moved the right way. Reverse any that didn't.", open: () => machineSetup("motors") },
  { id: "torch", title: "Test the torch", body: "On Machine setup › Torch, check every input light, then run the touch-off test and the torch test.", open: () => machineSetup("torch") },
  { id: "edges", title: "Set the edges", body: "On Machine setup › Edges, home the table and set how far the torch can go. The app keeps every cut inside them.", open: () => machineSetup("edges"),
    auto: () => !!(S.safety && S.safety.limits) },
  { id: "coupon", title: "Cut a test coupon", body: "On Cut › Part, choose 🧪 Cut-test coupon in the material you have, cut it, and record how it came out. That sets your speed for that sheet.",
    open: () => { showScreen("cut"); showTab("cut"); goStep(1); const b = $("btnCoupon"); if (b) { b.scrollIntoView({ block: "center" }); b.classList.add("guide-flash"); setTimeout(() => b.classList.remove("guide-flash"), 2500); } } },
];
function guideState() { try { const v = JSON.parse((store() || { getItem: () => null }).getItem(GUIDE_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
function setGuide(id, on) { const s = guideState(); if (on) s[id] = new Date().toISOString(); else delete s[id]; try { store().setItem(GUIDE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
function paintGuide() {
  const ol = $("guideSteps"); if (!ol) return;
  const st = guideState();
  for (const g of GUIDE) if (!st[g.id] && g.auto && g.auto()) { setGuide(g.id, true); st[g.id] = new Date().toISOString(); }
  ol.replaceChildren();
  let n = 0;
  for (const g of GUIDE) {
    const done = !!st[g.id]; if (done) n++;
    const li = document.createElement("li"); li.dataset.guide = g.id; li.className = "guidestep" + (done ? " done" : "");
    const h = document.createElement("h3"); h.textContent = g.title + (done ? " ✓" : "");
    const p = document.createElement("p"); p.className = "muted small"; p.textContent = g.body;
    const row = document.createElement("div"); row.className = "row wrap";
    const o = document.createElement("button"); o.type = "button"; o.dataset.guideOpen = ""; o.textContent = "Open"; o.onclick = () => { closeDlg("guideDlg"); g.open(); };
    const d = document.createElement("button"); d.type = "button"; d.dataset.guideDone = ""; d.textContent = done ? "Not done yet" : "Done";
    d.setAttribute("aria-pressed", done ? "true" : "false");
    d.onclick = () => { setGuide(g.id, !done); paintGuide(); };
    if (g.picker) {                                   // r18: choose the plasma right here
      const lab = document.createElement("label"); lab.className = "guidepick";
      lab.append("Plasma cutter ");
      const sel = document.createElement("select"); sel.id = "guidePlasma"; sel.setAttribute("aria-label", "Plasma cutter");
      import("../cut/plasmapick.js").then((P) => {
        for (const pl of P.PLASMAS) { const opt = document.createElement("option"); opt.value = pl.id; opt.textContent = `${pl.name} – ${pl.note}`; sel.appendChild(opt); }
        sel.value = P.currentPlasmaId();
      }).catch(() => {});
      sel.onchange = async () => { const { choosePlasma } = await import("../machine/settings.js"); const r = await choosePlasma(sel.value); if (r && r.ok) { setGuide("plasma", true); paintGuide(); } };
      lab.appendChild(sel); li.append(h, p, lab, row);
      row.append(o, d); ol.appendChild(li); continue;
    }
    row.append(o, d); li.append(h, p, row); ol.appendChild(li);
  }
  if ($("guideCount")) $("guideCount").textContent = `${n} of ${GUIDE.length} done.`;
}

// ---------------------------------------------------------------- 9.6 cut history
const two = (n) => String(n).padStart(2, "0");
const when = (iso) => { const d = new Date(iso); return `${two(d.getDate())} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`; };
const dur = (s) => s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
function paintHistory() {
  const body = $("historyRows"); if (!body) return;
  const list = store() ? readHistory(store()) : [];
  body.replaceChildren();
  for (const e of list) {
    const tr = document.createElement("tr"); if (e.practice) tr.className = "practice";
    const cells = [when(e.at), e.part, e.material || "—", e.thickness != null ? `${e.thickness} mm` : "—", dur(e.seconds), resultText(e) + (e.practice ? " · Practice" : "")];
    for (const c of cells) { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); }
    body.appendChild(tr);
  }
  $("historyEmpty").classList.toggle("hidden", list.length > 0);
  $("btnHistoryCsv").disabled = !list.length; $("btnHistoryClear").disabled = !list.length;
}
const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
export function historyCsv(list) {
  const head = ["Date", "Part", "Material", "Thickness (mm)", "Time (s)", "Result", "Practice"];
  return [head.join(","), ...list.map((e) => [e.at, e.part, e.material, e.thickness ?? "", e.seconds, resultText(e), e.practice ? "yes" : "no"].map(csvCell).join(","))].join("\n") + "\n";
}

// ---------------------------------------------------------------- 9.3 problem report
async function buildReport() {
  let version = RUN || null;
  try { const r = await fetch("version.json?" + Date.now(), { cache: "no-store" }); if (r.ok) version = await r.json(); } catch (e) { /* offline: the version this page runs */ }
  const env = { ua: navigator.userAgent, screen: `${screen.width}x${screen.height}`, view: `${innerWidth}x${innerHeight}`, lang: navigator.language, mode: document.body.dataset.mode || "" };
  const connected = S.connected ? { practice: !!S.demo, kind: (M && M.grbl && M.grbl.t && M.grbl.t.kind) || "", fluidnc: !!S.fluidnc, state: (S.status && S.status.state) || "" } : null;
  const { collectReport } = await reportMod();
  return collectReport(store() || { getItem: () => null }, { version, env, connected, note: ($("reportNote") && $("reportNote").value) || "" });
}
async function paintReportPreview() { const pre = $("reportPreview"); if (pre) { const rep = await buildReport(); pre.textContent = (await reportMod()).reportText(rep); } }

export function bindTools() {
  const wire = (btn, dlg, paint) => { const b = $(btn); if (b) b.addEventListener("click", () => { paint(); openDlg(dlg); }); };
  wire("menuSetupGuide", "guideDlg", paintGuide);
  wire("menuCutHistory", "historyDlg", paintHistory);
  wire("menuReport", "reportDlg", () => { paintReportPreview(); });
  for (const id of DLGS) {
    const d = $(id); if (!d) continue;
    d.addEventListener("click", (e) => { if (e.target === d) closeDlg(id); });
    const c = d.querySelector(".acct-close"); if (c) c.onclick = () => closeDlg(id);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = DLGS.find((id) => $(id) && !$(id).classList.contains("hidden"));
    if (open) { closeDlg(open); e.preventDefault(); }
  });
  if ($("btnHistoryCsv")) $("btnHistoryCsv").onclick = () => { const list = store() ? readHistory(store()) : []; saveFile("porta-plasma-cut-history.csv", historyCsv(list), "text/csv"); };
  if ($("btnHistoryClear")) $("btnHistoryClear").onclick = async () => {
    const ok = await askConfirm({ title: "Clear the cut history?", body: "This removes every row on this device. It can't be undone.", ok: "Clear history", danger: true });
    if (ok && store()) { clearHistory(store()); paintHistory(); }
  };
  if ($("btnReportDownload")) $("btnReportDownload").onclick = async () => { const rep = await buildReport(); const R = await reportMod(); saveFile(R.reportFileName(), R.reportText(rep), "application/json"); toast("Report saved. Send the file to support."); };
  if ($("btnReportCopy")) $("btnReportCopy").onclick = async () => {
    try { const rep = await buildReport(); await navigator.clipboard.writeText((await reportMod()).reportText(rep)); toast("Report copied."); } catch (e) { toast("Couldn't copy here. Use Download report instead.", true); }
  };
  if ($("reportNote")) $("reportNote").addEventListener("input", () => { clearTimeout(paintReportPreview._t); paintReportPreview._t = setTimeout(paintReportPreview, 300); });
}

// Opening, adding and replacing files; drag and drop; start over; edit-drawing and resize.
import { parseDXF } from "./dxf.js";
import { parseSVG } from "./svg.js";
import { contoursToEditable } from "./editable.js";
import { screen, showScreen } from "../ui/flow.js";
import { evalExpr } from "../core/expr.js";
import * as Setup from "../cut/setup.js";
import { askSize, scaleContours, sizeCheckWanted } from "./sizecheck.js";
import { designChanged } from "../cut/camedit.js";
import { $, esc, toast } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { S, sketch } from "../core/state.js";
import { goStep } from "../ui/nav.js";
import { refresh } from "../ui/refresh.js";
import { loadJob } from "../cut/prepare.js";
import { clickVerb } from "../ui/laptop.js";
import { showSource, useShape, useShapeSoon } from "./useshape.js";
import { setShapeFs } from "./protools.js";
import { navBusy } from "../cut/checklist.js";

// ------------------------------------------------------------------ step 1: file
// A drawing is already on the bed: a second DXF/SVG asks whether it joins the sheet or replaces what is there (never silently throws work away)
function askAddOrReplace(f) {
  return new Promise((res) => {
    $("importAskText").textContent = `You already have parts on the bed. What should “${f.name}” do?`;
    const dlg = $("importAskDlg"); dlg.classList.remove("hidden");
    const done = (v) => { dlg.classList.add("hidden"); res(v); };
    $("importAskAdd").onclick = () => done("add"); $("importAskReplace").onclick = () => done("replace"); $("importAskCancel").onclick = () => done("cancel");
    setTimeout(() => $("importAskAdd").focus(), 30);
  });
}
const bedHasParts = () => !!((sketch && sketch.items.length) || (S.design && S.src === "file" && S.prepared) || (S.gcode && S.prepared));
// Everything that arrives on the cutting screen (file picker, drag-drop) comes through here.
export async function handleFiles(list) {
  const fl = [...list].filter(Boolean);
  if (!fl.length || (S.job && S.job.running)) return;
  if (fl.length === 1) { await importOne(fl[0]); return; }
  const ok = fl.filter((f) => /\.(dxf|svg)$/i.test(f.name));
  if (ok.length < fl.length) toast("Only DXF or SVG files can be laid out together. G-code goes one file at a time.", true);
  if (ok.length) await addPartsFlow(ok);
}
// put more parts on the bed (saved parts and/or several drawing files, each with a quantity)
export async function addPartsFlow(files) {
  if ((S.gcode && !S.design) || (S.design && S.design.straight)) { toast("A G-code file or a straight cut can't be mixed with drawings. " + clickVerb() + " “Start over” first.", true); return; }
  if (S.prepared) goStep(3); else { S.src = "shape"; }          // step 3 turns a loaded drawing into movable parts first
  if (files) await Setup.addFilesToSheet(files); else Setup.openAdd();
}
export function startOver() {
  S.job = null; S.prepared = null; S.gcode = null; S.design = null; S.currentPart = null; S.fileName = ""; S.startCut = 1; S.resume = null;
  if (sketch && sketch.items.length) { sketch.layout = null; sketch.remember(); sketch.items = []; sketch.pick([]); sketch.commit(); }
  S.src = "file"; $("file").value = "";
  $("dropTitle").textContent = "Upload a file"; $("drop").classList.remove("loaded", "drop-open"); $("drop").classList.add("drop-slim");
  $("warnings").innerHTML = "";
  goStep(1); refresh();
}
async function importOne(f) {
  if (!f) return;
  const ext = f.name.toLowerCase().split(".").pop();
  if (bedHasParts() && (ext === "dxf" || ext === "svg") && !(S.job && S.job.running) && !(S.design && S.design.straight) && !(S.gcode && !S.design)) {
    const a = await askAddOrReplace(f);
    if (a === "cancel") return;
    if (a === "add") { await addPartsFlow([f]); return; }
  }
  readFile(f);
}
function readFile(f) {
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => openText(f.name, String(rd.result), true);
  rd.readAsText(f);
}
function fileKind(name) {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "dxf" ? "dxf" : ext === "svg" ? "svg" : "gcode";
}
// open a file's text: DXF/SVG become a design (we make the cut paths), anything else is G-code
function openText(name, text, remember, scale) {
  const kind = fileKind(name);
  try {
    if (kind === "gcode") { S.design = null; S.gcode = text; }
    else {
      const r = kind === "dxf" ? parseDXF(text) : parseSVG(text);
      S.design = { name, contours: r.contours, warnings: r.warnings, units: r.units };
      S.gcode = null;
    }
  } catch (e) {
    S.design = null; S.gcode = null; S.prepared = null;
    $("warnings").innerHTML = `<li>${esc(e.message)}</li>`;
    refresh();
    return;
  }
  S.fileName = name;
  S.src = "file";                                          // a freshly opened file: step 3 turns it into parts on the bed
  S.design && (S.design.straight = false);
  designChanged(-1);                                    // a new file: forget old cut order, tabs and start points
  const finish = (k) => {
    $("dropTitle").textContent = "✓ " + name;
    $("drop").classList.add("loaded", "drop-slim");
    $("drop").classList.remove("drop-open");
    if (remember) saveRecent(name, text, k);
    loadJob();
    if (S.prepared) goStep(3);                             // straight onto the bed
  };
  if (S.design && scale && scale !== 1) { S.design.contours = scaleContours(S.design.contours, scale); }
  // "This drawing is W x H mm. Is that right?" – only for a file the person just opened (not a recent one with its scale remembered)
  if (S.design && remember && sizeCheckWanted()) {
    S.prepared = null;
    askSize(S.design, S.design.units, finish);
    return;
  }
  finish(scale || 1);
}
function setFile(name, text, remember, scale) { openText(name, text, remember, scale); }
// An imported drawing becomes shapes the editor understands (lines + true arcs; one part per outline, holes travel
// with their part) so every click-a-line tool works on it: set length, square up, angle, curve, move, resize, holes.
export async function editDrawing() {
  const d = S.design;
  if (!d || d.straight || !d.contours || !d.contours.length) { toast("Open a drawing first.", true); return; }
  const e = contoursToEditable(d.contours);
  if (!e) { toast("There is nothing in this drawing the editor can use.", true); return; }
  if (sketch.items.length && !(await askConfirm({ title: "Replace the shapes already on the maker?", body: "The shape maker already has shapes on it. Replace them with this drawing? (Undo brings them back.)", ok: "Replace", cancel: "Cancel" }))) return;
  sketch.importParts(e.parts, true);
  S.currentPart = null;
  S.fileName = String(d.name || "Imported drawing").replace(/\.[^.]+$/, "");
  if ($("partName")) $("partName").value = S.fileName;
  S.src = "shape";
  if (!showScreen("make")) return;
  showSource("shape");
  useShape();
  setShapeFs(true);
  const cv = d.curveNote || (d.warnings || []).find((w) => /can't be edited as true curves/.test(w));
  toast(`Opened ${e.parts.length} part${e.parts.length > 1 ? "s" : ""} for editing (${e.arcs} arc${e.arcs === 1 ? "" : "s"}, ${e.lines} straight edge${e.lines === 1 ? "" : "s"}).` + (cv ? " " + cv : ""), !!cv);
}
// exact width x height for the picked part (custom parts can also be stretched)
export function openResize() {
  const list = sketch.picked(), it = list.length === 1 ? list[0] : null;
  if (!it) { toast("Pick one part first, then use Width × height.", true); return; }
  if (!sketch.canResize(it)) { toast("This part is locked or turned at an odd angle, so it can't be resized here.", true); return; }
  const b = sketch.boxOf(it), W = Math.round((b[2] - b[0]) * 100) / 100, H = Math.round((b[3] - b[1]) * 100) / 100;
  const dlg = $("resizeDlg"); dlg._id = it.id; dlg._ratio = W / H; dlg._which = "w";
  $("resizeNow").textContent = `Now ${W} × ${H} mm.`;
  $("rsW").value = W; $("rsH").value = H; $("rsKeep").checked = it.type === "custom" ? S.keepProp !== false : true;
  $("rsKeep").disabled = it.type !== "custom";
  dlg.classList.remove("hidden");
  setTimeout(() => $("rsW").select(), 30);
}
function bindResize() {
  const dlg = $("resizeDlg"), close = () => { dlg.classList.add("hidden"); S.uiBlockUntil = Date.now() + 450; };
  $("rsW").addEventListener("input", () => { dlg._which = "w"; if ($("rsKeep").checked) { const v = evalExpr($("rsW").value); if (Number.isFinite(v)) $("rsH").value = Math.round(v / dlg._ratio * 100) / 100; } });
  $("rsH").addEventListener("input", () => { dlg._which = "h"; if ($("rsKeep").checked) { const v = evalExpr($("rsH").value); if (Number.isFinite(v)) $("rsW").value = Math.round(v * dlg._ratio * 100) / 100; } });
  $("rsKeep").addEventListener("change", () => { S.keepProp = $("rsKeep").checked; });
  $("rsCancel").onclick = close;
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  $("rsOk").onclick = () => {
    const it = sketch.item(dlg._id); if (!it) { close(); return; }
    const W = evalExpr($("rsW").value), H = evalExpr($("rsH").value);
    if (!(W > 0 && H > 0)) { toast("Type a width and a height in mm.", true); return; }
    let ok;
    if (it.type === "custom") ok = sketch.resizeCustomTo(it, W, H, $("rsKeep").checked, dlg._which);
    else { sketch.remember(); sketch.resizeTo(it, W, H); sketch.commit(); sketch.onSelect(); ok = true; }
    if (!ok) { toast("That size isn't possible for this part (too small, too big or locked).", true); return; }
    close(); useShapeSoon(); toast("Resized");
  };
}
export function openEditor() { S.src = "shape"; if (screen() !== "make") showScreen("make"); showSource("shape"); useShape(); setShapeFs(true); }
function recentList() {
  try { return JSON.parse(localStorage.getItem("plasma.recent") || "[]"); } catch (e) { return []; }
}
function saveRecent(name, text, scale) {
  try {
    const list = recentList().filter((r) => r.name !== name);
    list.unshift({ name, text, scale: scale && scale !== 1 ? scale : undefined });
    while (list.length > 6 || JSON.stringify(list).length > 1500000) list.pop();
    localStorage.setItem("plasma.recent", JSON.stringify(list));
  } catch (e) { /* storage full - fine */ }
  renderRecent();
}
// a fresh workspace for the next account: the recent-files list goes too
export function clearRecent() {
  try { localStorage.removeItem("plasma.recent"); } catch (e) { /* ignore */ }
  renderRecent();
}
export function renderRecent() {
  const list = recentList();
  $("recentWrap").classList.toggle("hidden", !list.length);
  $("recent").innerHTML = list.map((r, i) => `<button data-recent="${i}">${esc(r.name)}</button>`).join("");
}
export function bindFiles() {
  $("btnClearBed").onclick = async () => { if (!bedHasParts() || await askConfirm({ title: "Start over?", body: "Take everything off the bed and start over?", ok: "Start over", cancel: "Cancel", danger: true })) startOver(); };
  $("btnPickSaved").onclick = () => addPartsFlow(null);
  if ($("btnEditDrawing")) $("btnEditDrawing").onclick = editDrawing;
  bindResize();
  // step 1
  const drop = $("drop");
  const openDrop = () => { drop.classList.add("drop-open"); drop.classList.remove("drop-slim"); };
  const slimDrop = () => { if (!drop.classList.contains("drag")) { drop.classList.remove("drop-open"); drop.classList.add("drop-slim"); } };
  drop.addEventListener("click", openDrop);
  drop.addEventListener("focusin", openDrop);
  drop.addEventListener("dragenter", () => { drop.classList.add("drag"); openDrop(); });
  drop.addEventListener("dragleave", () => { drop.classList.remove("drag"); });
  drop.addEventListener("focusout", () => setTimeout(slimDrop, 100));
  $("file").onchange = () => { const fl = [...$("file").files]; $("file").value = ""; handleFiles(fl); };   // several files = they all go on the bed, each with a quantity
  const cutDrop = () => screen() === "cut" && S.tab === "cut" && !navBusy();
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (cutDrop()) drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  document.addEventListener("drop", (e) => {
    if (!$("importDlg").classList.contains("hidden")) return;     // the Import DXFs dialog handles its own drops
    if (!cutDrop() || !e.dataTransfer) return;
    if (document.querySelector(".acctdlg:not(.hidden), .shapelib:not(.hidden), .numpad:not(.hidden)")) return;   // a dialog open: its own drop zone (if any) handles it
    handleFiles(e.dataTransfer.files);
  });
  $("recent").onclick = (e) => {
    const b = e.target.closest("[data-recent]");
    if (b) { const r = recentList()[Number(b.dataset.recent)]; if (r) setFile(r.name, r.text, false, r.scale); }
  };
}

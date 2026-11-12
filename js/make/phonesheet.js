// Phone (narrow / coarse-pointer) Make-a-part chrome: a compact tool bar,
// an on-demand bottom sheet for the selected shape, and a type-in size box
// for rectangle and circle. Laptop layout is left to the existing toolbar prefs.
import { $, toast } from "../core/dom.js";
import { sketch } from "../core/state.js";
import { screen } from "../ui/flow.js";
import { shapeDef } from "./sketch.js";
import { variantsFor, variantKey } from "./variants.js";
import { evalExpr } from "../core/expr.js";
import { runPro } from "./cad.js";
import { getToolIds, toolInfo, openToolbarCustom } from "./toolbarcustom.js";

const PHONE_MQ = "(max-width: 699px), ((max-height: 520px) and (max-width: 950px)), ((max-width: 900px) and (any-pointer: coarse))";

function editorIsAdvanced() {
  return document.body.classList.contains("pro-mode") || document.body.classList.contains("advanced-mode");
}

export function isPhoneUi() {
  try { return !!(window.matchMedia && window.matchMedia(PHONE_MQ).matches); }
  catch (e) { return false; }
}

export function syncPhoneUi() {
  document.body.classList.toggle("phone-ui", isPhoneUi());
  const on = isPhoneUi() && screen() === "make" && editorIsAdvanced();
  const bar = $("phoneBar");
  if (bar) { bar.classList.toggle("hidden", !on); bar.hidden = !on; }
  if (!on) closePhoneSheet();
  else {
    paintPhoneBar();
    paintPhoneSheet();
  }
}

export function closePhoneSheet(exceptSize) {
  const sheet = $("phoneSheet");
  if (sheet) { sheet.classList.add("hidden"); sheet.hidden = true; }
  document.body.classList.remove("phone-sheet-open", "phone-more-open");
  if (!exceptSize) closeDrawSize();
}

function openPhoneSheet() {
  const sheet = $("phoneSheet");
  if (!sheet) return;
  sheet.classList.remove("hidden"); sheet.hidden = false;
  document.body.classList.add("phone-sheet-open");
}

export function closeDrawSize() {
  const dlg = $("drawSizeDlg");
  if (dlg) { dlg.classList.add("hidden"); dlg.hidden = true; }
  drawKind = null;
}

let drawKind = null;
export function openDrawSize(kind) {
  const dlg = $("drawSizeDlg"), fields = $("drawSizeFields"), title = $("drawSizeTitle"), body = $("drawSizeBody");
  if (!dlg || !fields) return;
  drawKind = kind === "disc" ? "disc" : "rect";
  title.textContent = drawKind === "disc" ? "Circle size" : "Rectangle size";
  body.textContent = "Type the size in millimetres, then Add. You can change it later.";
  fields.innerHTML = drawKind === "disc"
    ? `<label>Diameter (mm)<input id="drawSizeD" type="number" min="2" step="any" inputmode="decimal" value="100"></label>`
    : `<label>Width (mm)<input id="drawSizeW" type="number" min="2" step="any" inputmode="decimal" value="100"></label>
       <label>Height (mm)<input id="drawSizeH" type="number" min="2" step="any" inputmode="decimal" value="60"></label>`;
  dlg.classList.remove("hidden"); dlg.hidden = false;
  const first = fields.querySelector("input"); if (first) first.focus();
}

function confirmDrawSize() {
  const max = (sketch && sketch.maxMm) || 2600;
  const num = (id) => { const el = $(id); return el ? evalExpr(el.value) : NaN; };
  if (drawKind === "disc") {
    const d = num("drawSizeD");
    if (!(d >= 2 && d <= max)) { toast("Enter a diameter of at least 2 mm.", true); return; }
    closeDrawSize();
    sketch.add("disc", false, { d });
  } else {
    const w = num("drawSizeW"), h = num("drawSizeH");
    if (!(w >= 2 && w <= max) || !(h >= 2 && h <= max)) { toast("Enter a width and height of at least 2 mm.", true); return; }
    closeDrawSize();
    sketch.add("rect", false, { w, h });
  }
  sketch.fitView();
  if (sketch.items.length) sketch.pick([sketch.items[sketch.items.length - 1].id]);
  sketch.commit && sketch.commit();
  sketch.onSelect && sketch.onSelect();
  paintPhoneSheet();
}

function paintPhoneBar() {
  const bar = $("phoneBar"); if (!bar) return;
  const tool = sketch && sketch.tool;
  bar.querySelectorAll("[data-ph]").forEach((b) => {
    const k = b.dataset.ph;
    const on = (k === "line" && tool === "draw") || (k === "measure" && tool === "measure") || (k === "select" && tool !== "draw" && tool !== "measure");
    b.classList.toggle("on", !!on);
  });
  const undo = bar.querySelector('[data-ph="undo"]');
  if (undo) undo.disabled = !(sketch && sketch.past && sketch.past.length);
}

function cornerButtons(it) {
  const useful = variantsFor(it.type);
  if (!useful.length) return "";
  const cur = (typeof variantKey === "function" && sketch.currentVariantKey) ? sketch.currentVariantKey() : "";
  const btns = useful.slice(0, 6).map((v) => {
    const d = shapeDef(v.id); const label = v.label || (d ? d.name : v.id);
    const key = variantKey(v);
    return `<button type="button" data-var="${key}" class="${key === cur ? "sel" : ""}">${label}</button>`;
  }).join("");
  return btns ? `<h4>Corners / version</h4><div class="varrow">${btns}</div>` : "";
}

function selectedSheetHtml() {
  const it = sketch && sketch.selected();
  if (!it || sketch.picked().length !== 1) return "";
  const sh = shapeDef(it.type) || { name: it.type, params: [] };
  const b = sketch.boxOf(it);
  const params = (it.type === "custom" ? [] : (sh.params || [])).map(([k, label]) =>
    `<label>${label}<input type="number" step="any" min="0" inputmode="decimal" data-p="${k}" value="${it.p[k]}"></label>`).join("");
  return `<div class="selhead"><b>${sh.name || it.type}</b></div>
    <div class="grid2">${params}
      <label>Position X<input type="number" step="any" inputmode="decimal" data-pos="x" value="${Math.round(b[0] * 10) / 10}"></label>
      <label>Position Y<input type="number" step="any" inputmode="decimal" data-pos="y" value="${Math.round(b[1] * 10) / 10}"></label>
    </div>
    ${cornerButtons(it)}`;
}

function moreSheetHtml() {
  const skip = new Set(["undo"]); // Undo is already on the compact bar
  const btns = getToolIds().filter((id) => !skip.has(id)).map((id) => {
    const info = toolInfo(id) || { label: id };
    return `<button type="button" data-more="${id}">${info.label}</button>`;
  }).join("");
  return `<h3>More tools</h3>
    <div class="skbtns">${btns}
      <button type="button" data-more="customise">Customise toolbar</button>
    </div>
    <p class="muted small">The same tools as on a laptop; pick which ones appear here with Customise toolbar.</p>`;
}

export function paintPhoneSheet() {
  if (!isPhoneUi() || screen() !== "make" || !editorIsAdvanced()) { closePhoneSheet(true); return; }
  const body = $("phoneSheetBody"); if (!body) return;
  if (document.body.classList.contains("phone-more-open")) {
    body.innerHTML = moreSheetHtml();
    openPhoneSheet();
    return;
  }
  const html = selectedSheetHtml();
  if (!html) {
    if (!document.body.classList.contains("phone-more-open")) closePhoneSheet(true);
    return;
  }
  body.innerHTML = html;
  openPhoneSheet();
}

function onPhoneBar(e) {
  const b = e.target.closest("[data-ph]"); if (!b) return;
  const k = b.dataset.ph;
  if (k === "undo") { if (sketch.past && sketch.past.length) sketch.undo(); }
  else if (k === "select") { if (sketch.tool) { sketch.tool = ""; sketch.draw(); } }
  else if (k === "line") { runPro("draw"); }
  else if (k === "measure") { runPro("measure"); }
  else if (k === "rect" || k === "disc") { openDrawSize(k); }
  else if (k === "more") {
    const open = !document.body.classList.contains("phone-more-open");
    document.body.classList.toggle("phone-more-open", open);
    b.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) paintPhoneSheet(); else paintPhoneSheet();
  }
  paintPhoneBar();
}

function applySheetInput(e) {
  const i = e.target;
  if (!i || !i.matches("input")) return;
  const v = evalExpr(i.value);
  if (i.value.trim() === "" || !Number.isFinite(v)) return;
  const it = sketch.selected(); if (!it || it.lock) return;
  if (i.dataset.p) {
    const k = i.dataset.p;
    if (["w", "h", "d", "a", "b", "len", "wid", "s"].includes(k) && (v < 2 || v > (sketch.maxMm || 2600))) return;
    it.p[k] = v;
  } else if (i.dataset.pos) {
    const b = sketch.boxOf(it);
    if (i.dataset.pos === "x") it.x += v - b[0]; else it.y += v - b[1];
  }
  sketch.draw(); sketch.onChange && sketch.onChange(true);
}

function onSheetClick(e) {
  const v = e.target.closest("[data-var]");
  if (v) {
    const it = sketch.selected();
    const spec = it && variantsFor(it.type).find((x) => variantKey(x) === v.dataset.var);
    if (spec) sketch.applyVariant(spec);
    paintPhoneSheet(); return;
  }
  const more = e.target.closest("[data-more]");
  if (!more) return;
  const k = more.dataset.more;
  if (k === "customise") { openToolbarCustom(); return; }
  if (k === "redo" && sketch.future && sketch.future.length) sketch.redo();
  else if (k === "fit") sketch.fitView();
  else if (k === "del") sketch.remove();
  else if (k === "dup") sketch.duplicate();
  else if (k === "rot") sketch.rotateBy(90);
  else if (k === "mir") sketch.mirror();
  else if (k === "join") sketch.join();
  else if (k === "snap") {
    sketch.opts.snap = sketch.opts.snap ? 0 : 1;
    try { sketch.saveOpts && sketch.saveOpts(); } catch (err) { /* ignore */ }
    toast(sketch.opts.snap ? "Snap on" : "Snap off");
  } else if (k === "offset" || k === "linarray" || k === "polar" || k === "draw" || k === "measure" || k === "subtract" || k === "nest") runPro(k);
  else if (k === "presets" || k === "lib" || k === "text" || k === "trace" || k === "size" || k === "resize" || k === "dims" || k === "ver" || k === "fillet" || k === "chamfer" || k === "edge" || k === "alignl" || k === "alignb" || k === "fs") {
    import("./quickbar.js").then((m) => m.quickAction(k)).catch(() => {});
  } else if (k === "rect" || k === "disc" || k === "triangle" || k === "slot" || k === "sector" || k === "hole" || k === "slothole" || k === "boltcircle") {
    import("./quickbar.js").then((m) => m.quickAction(k)).catch(() => {});
  }
  paintPhoneBar();
  paintPhoneSheet();
}

export function bindPhoneSheet() {
  syncPhoneUi();
  const mq = window.matchMedia && window.matchMedia(PHONE_MQ);
  if (mq) {
    const on = () => syncPhoneUi();
    if (mq.addEventListener) mq.addEventListener("change", on); else if (mq.addListener) mq.addListener(on);
  }
  document.addEventListener("editor-mode", syncPhoneUi);
  if ($("phoneBar")) $("phoneBar").addEventListener("click", onPhoneBar);
  if ($("phoneSheetClose")) $("phoneSheetClose").addEventListener("click", () => {
    document.body.classList.remove("phone-more-open");
    closePhoneSheet();
  });
  if ($("phoneSheet")) {
    $("phoneSheet").addEventListener("input", applySheetInput);
    $("phoneSheet").addEventListener("click", onSheetClick);
  }
  if ($("drawSizeOk")) $("drawSizeOk").addEventListener("click", confirmDrawSize);
  if ($("drawSizeCancel")) $("drawSizeCancel").addEventListener("click", closeDrawSize);
  if ($("drawSizeDlg")) $("drawSizeDlg").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); confirmDrawSize(); }
    if (e.key === "Escape") { e.preventDefault(); closeDrawSize(); }
  });
  // The selected-shape sheet is kept in sync by renderShapeForm → onShapeFormPainted.
}

// Called from renderShapeForm so the sheet follows the current pick.
export function onShapeFormPainted() {
  if (isPhoneUi()) { paintPhoneBar(); paintPhoneSheet(); }
}

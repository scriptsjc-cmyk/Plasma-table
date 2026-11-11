// Click a dimension on the drawing to type a new size (with Tab / arrows), plus the old number pad.
import { evalExpr } from "../core/expr.js";
import { S, sketch } from "../core/state.js";
import { $, toast } from "../core/dom.js";

function dimSeedOf(dim) {
  const seed = { w: () => { const b = sketch.boxOf(dim.it); return b[2] - b[0]; },
    h: () => { const b = sketch.boxOf(dim.it); return b[3] - b[1]; },
    d: () => { const b = sketch.boxOf(dim.it); return b[2] - b[0]; },
    x: () => sketch.boxOf(dim.it)[0], y: () => sketch.boxOf(dim.it)[1],
    hx: () => dim._v, hy: () => dim._v,
    "edge-len": () => dim._v }[dim.kind];
  return seed ? seed() : null;
}
function applyDimValue(dim, v) {
  const isSize = dim.kind === "w" || dim.kind === "h" || dim.kind === "d";
  if (isSize && (v < 2 || v > (sketch.maxMm || 2600))) { toast("Size must be at least 2 mm and no bigger than the table.", true); return false; }
  if (dim.kind === "w") sketch.setWidth(v);
  else if (dim.kind === "h") sketch.setHeight(v);
  else if (dim.kind === "d") sketch.setDiameter(v);
  else if (dim.kind === "x" || dim.kind === "y") sketch.setPos(dim.kind, v);
  else if (dim.kind === "hx" || dim.kind === "hy") sketch.setHoleOffset(dim.kind === "hx" ? "x" : "y", v);
  else if (dim.kind === "edge-len") sketch.setEdgeLength(v, ($("edgeFixed") && $("edgeFixed").value) || "start");
  else return false;
  return true;
}
function positionDimEdit(dim) {
  const box = $("dimEdit"); if (!box) return;
  let x = 16, y = 80;
  if (dim && Number.isFinite(dim.x) && Number.isFinite(dim.y)) { x = dim.x; y = dim.y + 12; }
  else {
    const cv = $("preview");
    if (cv) { const r = cv.getBoundingClientRect(); x = r.left + 16; y = r.top + 16; }
  }
  const w = Math.min(280, innerWidth - 24), h = Math.ceil(box.getBoundingClientRect().height) || 170;   // measured, so the OK row is never cut off
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  y = Math.max(8, Math.min(y, innerHeight - h - 8));
  box.style.left = x + "px"; box.style.top = y + "px";
}
function dimHitsList() {
  try { sketch.draw(); } catch (e) { /* ignore */ }
  return (sketch && sketch.dimHits) ? sketch.dimHits.slice() : [];
}
export function openDimEdit(dim) {
  const box = $("dimEdit"), inp = $("dimEditInput");
  if (!box || !inp || !dim) return;
  box._dim = dim;
  $("dimEditLabel").textContent = dim.label || "Size (mm)";
  const seed = dimSeedOf(dim);
  inp.value = seed != null && Number.isFinite(seed) ? String(Math.round(seed * 1000) / 1000) : "";
  box.classList.remove("hidden"); box.hidden = false;
  positionDimEdit(dim);
  // focus at once, so the first key typed lands in the box; again on the next frame only if the tap that opened it took focus away
  const grab = () => { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } };
  grab();
  requestAnimationFrame(() => { if (document.activeElement !== inp && !box.classList.contains("hidden")) grab(); });
}
// the operator row under the size box (shown on touch screens): inserts at the cursor without taking focus off the box
function bindDimOps() {
  const row = $("dimOps"), inp = $("dimEditInput"); if (!row || !inp) return;
  row.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) e.preventDefault(); });   // keep the keypad up and the caret where it is
  row.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "dimOk") { applyDimEdit(); return; }
    const op = b.dataset.op; if (!op) return;
    const a = inp.selectionStart ?? inp.value.length, z = inp.selectionEnd ?? a;
    inp.setRangeText(op, a, z, "end");
    inp.focus({ preventScroll: true });
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
export function closeDimEdit() {
  const box = $("dimEdit"); if (!box) return;
  box.classList.add("hidden"); box.hidden = true; box._dim = null;
  S.uiBlockUntil = Date.now() + 450;
}
export function applyDimEdit() {
  const box = $("dimEdit"), inp = $("dimEditInput");
  if (!box || !inp || !box._dim) return false;
  const raw = inp.value.trim();
  const v = evalExpr(raw);
  if (!Number.isFinite(v)) { toast("Use a number, or something like 100/2 or (30+10)/2", true); return false; }
  if (!applyDimValue(box._dim, v)) return false;
  closeDimEdit();
  return true;
}
export function nudgeDimEdit(dir) {
  const box = $("dimEdit"), inp = $("dimEditInput");
  if (!box || !inp || !box._dim) return;
  const cur = evalExpr(inp.value.trim());
  if (!Number.isFinite(cur)) return;
  const step = (sketch && sketch.opts && sketch.opts.snap) ? sketch.opts.snap : 1;
  const next = Math.round((cur + dir * step) * 1000) / 1000;
  inp.value = String(next);
  applyDimValue(box._dim, next);
  inp.select();
}
export function tabDimEdit() {
  const box = $("dimEdit"); if (!box || !box._dim) return;
  const hits = dimHitsList();
  if (!hits.length) return;
  const cur = box._dim;
  let i = hits.findIndex((h) => h.it === cur.it && h.kind === cur.kind);
  if (i < 0) i = 0;
  const next = hits[(i + 1) % hits.length];
  openDimEdit(next);
}
// Kept names so existing tests and onDimTap hooks still work. The on-screen
// calculator pad stays in the DOM but is no longer opened.
export function openNumPad(dim) { openDimEdit(dim); }
export function closeNumPad() { closeDimEdit(); }
export function bindDimEdit() {
  bindDimOps();
  $("numPadKeys").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    const k = b.dataset.k, el = $("numPadValue");
    if ($("numPad")._cur) { el.textContent = (k === "⌫" || k === ".") ? "" : ""; $("numPad")._cur = false; }
    let s = $("numPad")._cur === false ? el.textContent : "";
    if (k === "⌫") s = s.slice(0, -1);
    else s += k;
    el.textContent = s;
  });
  $("numPadEnter").onclick = () => { if ($("numPad")._apply) $("numPad")._apply(); };
  $("numPadCancel").onclick = closeNumPad;
  $("numPad").addEventListener("click", (e) => { if (e.target === $("numPad")) closeNumPad(); });
}

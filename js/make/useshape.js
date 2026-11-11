// Sends the drawing to the cut side (useShape) and the sketch toolbar.
import { copies } from "./shapes.js";
import { screen } from "../ui/flow.js";
import { designChanged } from "../cut/camedit.js";
import { S, sketch } from "../core/state.js";
import { $, $$, toast } from "../core/dom.js";
import { loadJob } from "../cut/prepare.js";
import { refresh } from "../ui/refresh.js";
import { setShapeFs } from "./protools.js";
import { goStep } from "../ui/nav.js";
import { drawPreview, fromView, toView } from "../cut/preview.js";
import { cmd } from "../machine/access.js";
import { renderShapeForm } from "./shapeform.js";
import { isProMode } from "../ui/mode.js";

let shapeTimer = null;
export function syncShapeForm() {
  const it = sketch.selected(); if (!it) return;
  const b = sketch.boxOf(it);
  $$("#shapeForm [data-p]").forEach((i) => { if (document.activeElement !== i) i.value = it.p[i.dataset.p]; });
  $$("#shapeForm [data-pos]").forEach((i) => { if (document.activeElement !== i) i.value = Math.round(b[i.dataset.pos === "x" ? 0 : 1] * 10) / 10; });
}
export function useShapeSoon() { clearTimeout(shapeTimer); shapeTimer = setTimeout(useShape, 250); }
export function useShape() {
  clearTimeout(shapeTimer);
  if (S.src !== "shape") return;
  let c = sketch.contours();
  if (!c.length) {
    S.design = null; S.prepared = null; S.fileName = "";
    $("warnings").innerHTML = ""; refresh(); return;
  }
  designChanged(c.length);
  const nx = Number($("cpX").value) || 1, ny = Number($("cpY").value) || 1;
  if (nx * ny > 1) c = copies(c, nx, ny, Number($("cpGap").value) || 0);
  S.design = { name: sketch.name() + (nx * ny > 1 ? ` ×${nx * ny}` : ""), contours: c, warnings: [] };
  S.gcode = null; S.fileName = S.design.name;
  loadJob();
}
// "Straight cut / sheet trim": one line, no drawing. Optionally a typed start point (needs the machine homed).
export function useStraight(dir, L, sx, sy) {
  if (S.shapeFs) setShapeFs(false);
  showSource("file");
  const pts = dir === "y" ? [[0, 0], [0, L]] : [[0, 0], [L, 0]];
  S.design = { name: `Straight cut ${L} mm along ${dir.toUpperCase()}`, contours: [{ pts, closed: false }], warnings: [], straight: true };
  S.gcode = null; S.fileName = S.design.name;
  designChanged(-2);
  loadJob();
  if (!S.prepared) return;
  if (sx != null || sy != null) {
    if (!S.connected) toast("Connect (or try the demo) to type a start point. You can set it in Get set up instead.", true);
    else if (!S.safety.referenced) toast("Home the machine first, then a typed start point can be used.", true);
    else {
      const mp = S.status.MPos || [0, 0, 0], cur = toView(mp[0], mp[1]);
      const X = Number.isFinite(sx) ? sx : cur[0], Y = Number.isFinite(sy) ? sy : cur[1];
      const [mx, my] = fromView(X, Y);
      if (cmd("set_origin", { x: mx, y: my })) { S.zeroSet = true; toast(`Start point set at X ${Math.round(X)}, Y ${Math.round(Y)} mm. The torch did not move.`); }
    }
  }
  goStep(3);
}
// B5 37: the one-tap cut-test coupon. A small design in the current material/thickness; it lands on the bed like any other part and is never started for you.
export function useCoupon(contours, name, meta) {
  if (S.shapeFs) setShapeFs(false);
  showSource("file");
  S.design = { name, contours, warnings: [], straight: true, coupon: { ...meta } };      // "straight": stays as one fixed piece (not turned into movable bed parts), like a straight cut
  S.gcode = null; S.fileName = name;
  designChanged(-2);
  loadJob();
  if (S.prepared) goStep(3);
}
export function showSource(src, opts) {
  S.src = src; S.bgChoosing = false;
  $("srcShape").classList.toggle("hidden", src !== "shape");
  if (src === "shape") {
    renderShapeForm(); useShape();
    if (isProMode() && screen() === "make" && !S.shapeFs && !(opts && opts.noFs)) setShapeFs(true);
  }
  drawPreview();
}
export function bindSketchBar() {
  $("skAll").onclick = () => sketch.pickAll();
  $("skSnap").onchange = () => { sketch.setSnap(Number($("skSnap").value)); sketch.draw(); };
  $("skGuides").onchange = () => sketch.setGuides($("skGuides").checked);
  $("skUndo").onclick = () => sketch.undo();
  $("skRedo").onclick = () => sketch.redo();
  $("skFit").onclick = () => sketch.fitView();
  $("skClear").onclick = () => { if (confirm("Remove every shape from the drawing?")) sketch.clear(); };
  ["cpX", "cpY", "cpGap"].forEach((id) => $(id).addEventListener("input", useShapeSoon));
}

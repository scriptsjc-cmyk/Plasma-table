// Pro tools: full-screen drawing, the tool buttons and their state.
import { S, sketch } from "../core/state.js";
import { $ } from "../core/dom.js";
import { drawPreview } from "../cut/preview.js";
import { goStep, renderQuickBar, runPro, showSource } from "../core/hooks.js";

// ---- full-screen "Make a shape" editor
export function setShapeFs(on) {
  on = !!on;
  if (S.shapeFs === on && document.body.classList.contains("shape-fs") === on) {
    if (on && S.src !== "shape") showSource("shape");
    if (on && S.cur !== 1) goStep(1);
    renderQuickBar();
    return;
  }
  S.shapeFs = on;
  // the full-screen editor starts with nothing picked when the pick was only made to show the Beginner size boxes (so one Esc leaves it)
  if (on && sketch.autoPick != null && sketch.sel.ids.length === 1 && sketch.sel.ids[0] === sketch.autoPick) { sketch.pick([]); sketch.autoPick = null; }
  if (on && S.src !== "shape") { showSource("shape"); }
  if (on && S.cur !== 1) goStep(1);
  document.body.classList.toggle("shape-fs", on);
  const bar = $("fsBar"); if (bar) { bar.classList.toggle("hidden", !on); bar.hidden = !on; }
  if (on && !sketch.opts.pro) { /* every tool is in the palette; Pro only adds the side panel */ }
  renderQuickBar();
  setTimeout(() => { try { sketch.resize && sketch.resize(); } catch (e) { /* ignore */ } sketch.fitView(); drawPreview(); }, 30);
}
export function renderProTools() {
  const box = $("proTools");
  if (!box) return;
  const on = !!(sketch && sketch.opts.pro);
  box.classList.toggle("hidden", !on);
  if (!on) { $("toolBar").classList.add("hidden"); return; }
  const tool = sketch.tool;
  box.innerHTML = `
    <button data-pro="draw" class="${tool === "draw" ? "on" : ""}">✎ Draw outline</button>
    <button data-pro="measure" class="${tool === "measure" ? "on" : ""}">📏 Measure</button>
    <button data-pro="nest">⊞ Auto-arrange</button>
    <button data-pro="points" class="${sketch.opts.pointSnap ? "on" : ""}">Snap to points</button>`;
  $("toolBar").classList.toggle("hidden", tool !== "draw");
  $("toolFinish").textContent = "Close outline";
}
export function bindProTools() {
  $("proTools").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pro]"); if (b) runPro(b.dataset.pro);
  });
  $("toolFinish").onclick = () => { sketch.finishDraw(); renderProTools(); };
  $("toolCancel").onclick = () => { sketch.setTool(null); renderProTools(); };
}

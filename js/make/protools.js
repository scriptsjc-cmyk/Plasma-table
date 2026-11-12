// Pro tools: full-screen drawing, the tool buttons and their state.
import { S, sketch } from "../core/state.js";
import { $ } from "../core/dom.js";
import { drawPreview } from "../cut/preview.js";
import { goStep, renderQuickBar, runPro, showSource } from "../core/hooks.js";

// ---- full-screen "Make a shape" editor
// r8 item 10: the full-screen editor is gone. Callers still exist; keep a no-op that always turns it off.
export function setShapeFs(_on) {
  S.shapeFs = false;
  document.body.classList.remove("shape-fs");
  const bar = $("fsBar"); if (bar) { bar.classList.add("hidden"); bar.hidden = true; }
  renderQuickBar();
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

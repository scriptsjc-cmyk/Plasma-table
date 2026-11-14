// Pro tools: full-screen drawing, the tool buttons and their state.
import { S, sketch } from "../core/state.js";
import { $ } from "../core/dom.js";
import { drawPreview } from "../cut/preview.js";
import { goStep, renderQuickBar, runPro, showSource } from "../core/hooks.js";
import { closeDrawHud, cancelDrawHud, toggleDrawArc } from "./drawhud.js";

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
  // C47: Draw, Measure, Auto-arrange and Snap live on the tools rail only.
  // This side panel is for the selected part's properties (the shape form below).
  box.innerHTML = "";
  box.classList.add("hidden");
  const tool = sketch.tool;
  $("toolBar").classList.toggle("hidden", tool !== "draw");
  if ($("toolFinish")) $("toolFinish").textContent = "Close outline";
  if ($("toolArc")) {
    $("toolArc").textContent = "Arc";
    $("toolArc").classList.toggle("on", !!(sketch && sketch.drawArc));
    $("toolArc").setAttribute("aria-pressed", sketch && sketch.drawArc ? "true" : "false");
    $("toolArc").title = sketch && sketch.drawArc ? "Next segment is a curve. Click again for a straight line." : "Next segment will be a curve (A)";
  }
}
export function bindProTools() {
  $("proTools").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pro]"); if (b) runPro(b.dataset.pro);
  });
  $("toolFinish").onclick = () => { sketch.finishDraw(); closeDrawHud(); renderProTools(); };
  $("toolCancel").onclick = () => { sketch.setTool(null); cancelDrawHud(); renderProTools(); };
  if ($("toolArc")) $("toolArc").onclick = () => { toggleDrawArc(); renderProTools(); };
}

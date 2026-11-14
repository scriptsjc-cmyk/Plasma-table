// r8: Simple Snap toggle, and the remembered empty-canvas drag mode (box select vs pan).
import { $ } from "../core/dom.js";
import { sketch } from "../core/state.js";
import { getPrefs, savePrefs } from "../core/prefs.js";

export function paintMakeSelStatus() {
  const el = $("makeSelStatus");
  if (!el || !sketch) return;
  const n = sketch.picked().length;
  if (n === 0) el.textContent = "Shift-click or Ctrl-click to pick more than one part, or drag a box around them.";
  else if (n === 1) el.textContent = "1 part selected. Shift-click or Ctrl-click to pick more, then Join or Cut out.";
  else el.textContent = n + " parts selected. Shift-click or Ctrl-click to pick more. Then Join or Cut out.";
}

export function paintMakeHeaderTools() {
  const snap = $("btnSimpleSnap");
  if (snap && sketch) {
    const on = !!sketch.opts.snap;
    snap.setAttribute("aria-pressed", on ? "true" : "false");
    snap.classList.toggle("on", on);
  }
  const pan = $("btnDragPan");
  if (pan) {
    const dragPans = !!getPrefs().emptyDragPan;
    pan.setAttribute("aria-pressed", dragPans ? "false" : "true");
    pan.classList.toggle("on", !dragPans);
    pan.textContent = dragPans ? "Drag pans" : "Drag selects";
    pan.title = dragPans
      ? "Drag pans: dragging empty canvas pans the view. Click to switch to box select. Space never pans — Space is STOP."
      : "Drag selects: drag a box on empty canvas to pick every part it covers. Click to switch to pan. Space never pans — Space is STOP.";
  }
}

export function bindMakeHeaderTools() {
  const snap = $("btnSimpleSnap");
  if (snap) {
    snap.onclick = () => {
      if (!sketch) return;
      const step = sketch.toggleSnap ? sketch.toggleSnap() : (sketch.opts.snap = sketch.opts.snap ? 0 : 1);
      try { savePrefs({ snap: !!step, snapStep: step || getPrefs().snapStep }); } catch (e) { /* ignore */ }
      sketch.draw();
      paintMakeHeaderTools();
    };
  }
  const pan = $("btnDragPan");
  if (pan) {
    pan.onclick = () => {
      savePrefs({ emptyDragPan: !getPrefs().emptyDragPan });
      paintMakeHeaderTools();
    };
  }
  paintMakeHeaderTools();
  paintMakeSelStatus();
}

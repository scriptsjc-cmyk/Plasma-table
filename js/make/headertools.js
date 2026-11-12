// r8: Simple Snap toggle, and the remembered empty-canvas drag mode (box select vs pan).
import { $ } from "../core/dom.js";
import { sketch } from "../core/state.js";
import { getPrefs, savePrefs } from "../core/prefs.js";

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
    pan.textContent = dragPans ? "Pan view" : "Box select";
    pan.title = dragPans
      ? "Dragging empty canvas pans the view. Click to switch to box select. Space never pans — Space is STOP."
      : "Drag on empty canvas to draw a selection box. Click to switch to pan. Space never pans — Space is STOP.";
  }
}

export function bindMakeHeaderTools() {
  const snap = $("btnSimpleSnap");
  if (snap) {
    snap.onclick = () => {
      if (!sketch) return;
      sketch.opts.snap = sketch.opts.snap ? 0 : 1;
      try { sketch.saveOpts && sketch.saveOpts(); } catch (e) { /* ignore */ }
      try { savePrefs({ snap: !!sketch.opts.snap }); } catch (e) { /* ignore */ }
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
}

// Editable drawing-sheet size in Advanced tools.
import { $ } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { applyChrome, drawingSheet, getPrefs, savePrefs } from "../core/prefs.js";

export function currentSheet() {
  return drawingSheet(S.cfg && S.cfg.travel_mm);
}

export function paintSheetSize() {
  const box = $("sheetSizeBox");
  if (!box) return;
  const on = !!(sketch && sketch.opts && sketch.opts.pro);
  box.classList.toggle("hidden", !on);
  if (!on) return;
  const s = currentSheet();
  const w = $("sheetSizeW"), h = $("sheetSizeH");
  if (w && document.activeElement !== w) w.value = String(s.w);
  if (h && document.activeElement !== h) h.value = String(s.h);
}

function apply() {
  const num = (id, fallback) => {
    const el = $(id); const v = el ? Number(el.value) : NaN;
    return Number.isFinite(v) && v >= 50 && v <= 20000 ? v : fallback;
  };
  const cur = currentSheet();
  savePrefs({ sheetW: num("sheetSizeW", cur.w), sheetH: num("sheetSizeH", cur.h) });
  applyChrome();
  if (sketch && sketch.draw) { sketch.fitView(); sketch.draw(); }
}

export function bindSheetSize() {
  ["sheetSizeW", "sheetSizeH"].forEach((id) => {
    const el = $(id); if (!el) return;
    el.addEventListener("change", apply);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
  });
  paintSheetSize();
}

// Make a part: the picture controls. "Zoom to fit", "Expand picture" (opens the full-screen editor; its Done button shrinks it again) and, on a laptop / desktop,
// the divider between the controls and the picture (drag it, or focus it and use the arrow keys; the width is remembered).
import { sketch } from "../core/state.js";
import { $ } from "../core/dom.js";
import { setShapeFs } from "./protools.js";
import { drawPreview } from "../cut/preview.js";
import { resetPreviewCam } from "../cut/previewnav.js";

const KEY = "plasma.makeSplit", MIN = 300, MIN_PICTURE = 320, CHROME = 40;     // CHROME: the divider, the gaps and the grid padding
const grid = () => document.querySelector(".cutgrid");

// the controls column width in px: at least MIN, and the picture always keeps at least MIN_PICTURE px
export function clampSplit(px, gridWidth) { return Math.round(Math.max(MIN, Math.min(Number(px) || 0, gridWidth - MIN_PICTURE - CHROME))); }

function setSplit(px, { save = true } = {}) {
  const g = grid(); if (!g) return;
  const gw = g.getBoundingClientRect().width || innerWidth, w = clampSplit(px, gw);
  g.style.setProperty("--make-ctl-w", w + "px");
  $("makeSplit").setAttribute("aria-valuenow", String(Math.round(100 * w / gw)));     // % of the width given to the controls
  if (save) try { localStorage.setItem(KEY, String(w)); } catch (e) { /* ignore */ }
  drawPreview();
}

export function bindPicture() {
  $("btnPicFit").addEventListener("click", () => { if (sketch && sketch.active) sketch.fitView(); else { resetPreviewCam(); drawPreview(); } });
  $("btnPicFs").addEventListener("click", () => setShapeFs(true));      // the full-screen editor's own Done button brings it back
  const bar = $("makeSplit");
  let saved = null; try { saved = Number(localStorage.getItem(KEY)) || null; } catch (e) { /* ignore */ }
  if (saved) setSplit(saved, { save: false });
  bar.addEventListener("pointerdown", (e) => {
    e.preventDefault(); bar.setPointerCapture(e.pointerId); bar.classList.add("dragging");
    const left = grid().getBoundingClientRect().left;
    const move = (ev) => setSplit(ev.clientX - left - 8, { save: false });
    const up = (ev) => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); bar.removeEventListener("pointercancel", up);
      bar.classList.remove("dragging"); setSplit(ev.clientX - left - 8); if (sketch && sketch.active) sketch.fitView(); };
    bar.addEventListener("pointermove", move); bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault(); e.stopPropagation();
    const now = grid().querySelector(".stepPane").getBoundingClientRect().width;
    setSplit(now + (e.key === "ArrowRight" ? 40 : -40)); if (sketch && sketch.active) sketch.fitView();
  });
}

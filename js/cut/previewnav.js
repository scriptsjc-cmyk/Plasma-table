// Pan and zoom the cut-preview (when the sketch editor is not on the canvas):
// two-finger drag pans, pinch or Ctrl+wheel zooms, wheel / trackpad pans. One-finger stays unused
// here so a tap never starts a cut-side edit.
import { $ } from "../core/dom.js";
import { S, sketch } from "../core/state.js";

// cam is a multiplier and pixel offset on top of the fitted view that drawCanvas already computes.
const cam = { s: 1, x: 0, y: 0 };
const pointers = new Map();
let drag = null;

export function previewCam() { return cam; }
export function resetPreviewCam() { cam.s = 1; cam.x = 0; cam.y = 0; }
export function applyPreviewCam(ctx, w, h) {
  if (cam.s === 1 && !cam.x && !cam.y) return;
  ctx.translate(w / 2 + cam.x, h / 2 + cam.y);
  ctx.scale(cam.s, cam.s);
  ctx.translate(-w / 2, -h / 2);
}

function sketchOn() { return !!(sketch && sketch.active); }

function bind() {
  const cv = $("preview"); if (!cv || cv.dataset.previewNav === "1") return;
  cv.dataset.previewNav = "1";
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const redraw = () => { const ev = new Event("preview-nav"); cv.dispatchEvent(ev); };

  cv.addEventListener("pointerdown", (e) => {
    if (sketchOn()) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / already released */ }
    const [sx, sy] = pos(e);
    pointers.set(e.pointerId, [sx, sy]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      drag = { kind: "pinch", d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, s: cam.s, x: cam.x, y: cam.y };
      e.preventDefault();
      return;
    }
    // one-finger on the cut preview does not pan (that would surprise; two fingers / wheel / space+drag do)
    if (e.button === 1 || e.button === 2) {
      drag = { kind: "pan", sx, sy, x: cam.x, y: cam.y };
      e.preventDefault();
    }
  });
  cv.addEventListener("pointermove", (e) => {
    if (sketchOn() || !pointers.has(e.pointerId) && !drag) return;
    const [sx, sy] = pos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [sx, sy]);
    if (!drag) return;
    if (drag.kind === "pinch") {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const k = drag.d > 0 ? dist / drag.d : 1;
      cam.s = Math.max(0.25, Math.min(8, drag.s * k));
      cam.x = drag.x + (mx - drag.mx);
      cam.y = drag.y + (my - drag.my);
      e.preventDefault();
      redraw();
      return;
    }
    if (drag.kind === "pan") {
      cam.x = drag.x + (sx - drag.sx);
      cam.y = drag.y + (sy - drag.sy);
      e.preventDefault();
      redraw();
    }
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (drag && drag.kind === "pinch" && pointers.size) return;
    drag = null;
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener("wheel", (e) => {
    if (sketchOn()) return;
    e.preventDefault();
    const [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k = Math.exp(-e.deltaY * 0.0015);
      const next = Math.max(0.25, Math.min(8, cam.s * k));
      const r = cv.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      cam.x = sx - cx + (cam.x - (sx - cx)) * (next / cam.s);
      cam.y = sy - cy + (cam.y - (sy - cy)) * (next / cam.s);
      cam.s = next;
    } else {
      cam.x -= e.deltaX;
      cam.y -= e.deltaY;
    }
    redraw();
  }, { passive: false });
  cv.addEventListener("dblclick", (e) => {
    if (sketchOn()) return;
    resetPreviewCam();
    redraw();
    e.preventDefault();
  });
  cv.addEventListener("contextmenu", (e) => { if (!sketchOn()) e.preventDefault(); });
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) {
    cv.addEventListener(ev, (e) => { if (!sketchOn()) e.preventDefault(); });
  }
}

export function bindPreviewNav(redraw) {
  bind();
  const cv = $("preview");
  if (cv && redraw) cv.addEventListener("preview-nav", () => redraw());
}

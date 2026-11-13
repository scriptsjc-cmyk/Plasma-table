// Laptop Setup and Cut only: show the bed rotated 180° so the sheet corner (0, 0) and
// the gantry sit at the top-right, matching someone standing at the far side of the table.
// This is a view transform only. Machine coordinates, G-code and commands are unchanged.
import { isLaptopUi } from "../ui/laptop.js";
import { screen } from "../ui/flow.js";
import { S } from "../core/state.js";

export function bedViewRotated() {
  if (typeof window === "undefined") return false;
  try { if (!isLaptopUi()) return false; } catch (e) { return false; }
  if (screen() !== "cut") return false;
  if (S.tab === "setup") return false;           // Machine setup has no bed picture; its jog stays in machine space
  const step = Number(S.cur);
  return step === 3 || step === 4;
}

export function flipScreen(sx, sy, w, h) { return [w - sx, h - sy]; }

// Involutive: the same call maps a screen point into (or back out of) the unrotated canvas.
export function applyBedScreen(sx, sy, w, h) {
  return bedViewRotated() ? flipScreen(sx, sy, w, h) : [sx, sy];
}

// Pointer / wheel pan: keep the picture following the hand after the 180° flip.
export function shiftView(view, dsx, dsy) {
  if (!view || !(view.s > 0)) return;
  const k = 1 / view.s;
  if (bedViewRotated()) { view.vx += dsx * k; view.vy -= dsy * k; }
  else { view.vx -= dsx * k; view.vy += dsy * k; }
}

export function jogToMachine(axis, dir) {
  dir = Number(dir);
  if (bedViewRotated() && (axis === "X" || axis === "Y")) return [axis, -dir];
  return [axis, dir];
}

export function screenBoxToWorld(toWorld, sx0, sy0, sx1, sy1) {
  const pts = [toWorld(sx0, sy0), toWorld(sx1, sy0), toWorld(sx0, sy1), toWorld(sx1, sy1)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function visibleWorld(toWorld, w, h) { return screenBoxToWorld(toWorld, 0, 0, w, h); }

export function syncJogPadLabels() {
  const rot = bedViewRotated();
  for (const b of document.querySelectorAll(".j[data-axis]")) {
    const axis = b.dataset.axis;
    if (axis === "Z") continue;
    const dir = Number(b.dataset.dir);
    const shown = rot ? -dir : dir;
    const lab = axis + (shown > 0 ? "+" : "−");
    const small = b.querySelector("small");
    if (small) small.textContent = lab;
    b.setAttribute("aria-label", "Jog " + lab);
  }
}


// Map a world-space axis-aligned rect through X/Y (works when those mappers are 180°-flipped).
export function worldRect(X, Y, x, y, w, h) {
  const x0 = X(x), y0 = Y(y), x1 = X(x + w), y1 = Y(y + h);
  return [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
}

function arrow(ctx, x0, y0, x1, y1) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0), L = 8;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - L * Math.cos(a - 0.4), y1 - L * Math.sin(a - 0.4));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - L * Math.cos(a + 0.4), y1 - L * Math.sin(a + 0.4));
  ctx.stroke();
}

// Tiny upright +X / +Y hints in machine space, so the rotated view is not ambiguous.
export function drawAxisHints(ctx, toScreen) {
  if (!bedViewRotated() || !toScreen) return;
  const [ox, oy] = toScreen(0, 0);
  const [ux, uy] = toScreen(1, 0);
  const sc = Math.hypot(ux - ox, uy - oy) || 1;
  const mm = Math.max(80, 44 / sc);
  const [xx, xy] = toScreen(mm, 0), [yx, yy] = toScreen(0, mm);
  ctx.save();
  ctx.strokeStyle = "#c05600"; ctx.fillStyle = "#c05600";
  ctx.lineWidth = 1.5; ctx.lineCap = "round";
  arrow(ctx, ox, oy, xx, xy);
  arrow(ctx, ox, oy, yx, yy);
  ctx.font = "11px Barlow, system-ui";
  ctx.textAlign = xx < ox ? "right" : "left";
  ctx.textBaseline = "middle";
  ctx.fillText("+X", xx + (xx < ox ? -6 : 6), xy);
  ctx.textAlign = "center";
  ctx.textBaseline = yy > oy ? "top" : "bottom";
  ctx.fillText("+Y", yx, yy + (yy > oy ? 5 : -5));
  ctx.restore();
  if (ctx.canvas) ctx.canvas.dataset.axes = "on";
}

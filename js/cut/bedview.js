// Laptop Machine setup and Cut: flip the bed picture top-to-bottom (Y only) so it
// matches the table as seen from where the operator stands (at the FRONT).
// The X gantry rail runs left-right along the BACK (top of the screen). Home /
// the sheet corner (0, 0) is the back-left, drawn at the top-left. +X points
// right along the rail; +Y points toward the operator (down the screen).
// Get-to-cutting Setup/Cut jog follows that picture (Up = away = −Y).
// Machine setup jog stays in machine space, as it did before the bed picture:
// Up = +Y = toward the gantry rail at the back. That is a display/jog mapping
// only. Machine coordinates, G-code and the board's Y direction are unchanged.
import { isLaptopUi } from "../ui/laptop.js";
import { screen } from "../ui/flow.js";
import { S } from "../core/state.js";

export function bedViewRotated() {
  if (typeof window === "undefined") return false;
  try { if (!isLaptopUi()) return false; } catch (e) { return false; }
  if (screen() !== "cut") return false;
  if (S.tab === "setup") return true;            // Machine setup bed uses the same Y-only flip; jog pads follow
  const step = Number(S.cur);
  return step === 3 || step === 4;
}

// The sheet / home corner (layout 0, 0) as it appears in the current view.
// On a laptop bed picture that is the top-left of the screen (the table's back-left).
// On a phone, or on Make a part, the picture is unflipped and that corner is bottom-left.
export function sheetCornerName({ long = false } = {}) {
  if (bedViewRotated()) return long ? "top-left (the back-left corner of the table)" : "top-left";
  return "bottom-left";
}

// Involutive Y-only flip (mirror top to bottom). X is unchanged.
export function flipScreen(sx, sy, w, h) { return [sx, h - sy]; }

// Involutive: the same call maps a screen point into (or back out of) the unflipped canvas.
export function applyBedScreen(sx, sy, w, h) {
  return bedViewRotated() ? flipScreen(sx, sy, w, h) : [sx, sy];
}

// Pointer / wheel pan: keep the picture following the hand after the Y flip.
export function shiftView(view, dsx, dsy) {
  if (!view || !(view.s > 0)) return;
  const k = 1 / view.s;
  view.vx -= dsx * k;
  view.vy += (bedViewRotated() ? -dsy : dsy) * k;
}

// Picture flip is not the same as jog flip. Machine setup shows the operator
// view but keeps the pre-bed-picture jog: Up sends machine +Y (toward the rail).
export function jogFollowsBedView() {
  if (!bedViewRotated()) return false;
  try { if (S.tab === "setup") return false; } catch (e) { return false; }
  return true;
}

export function jogToMachine(axis, dir) {
  dir = Number(dir);
  // Y is mirrored on the Setup/Cut picture, so invert only Y there.
  if (jogFollowsBedView() && axis === "Y") return [axis, -dir];
  return [axis, dir];
}

export function screenBoxToWorld(toWorld, sx0, sy0, sx1, sy1) {
  const pts = [toWorld(sx0, sy0), toWorld(sx1, sy0), toWorld(sx0, sy1), toWorld(sx1, sy1)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function visibleWorld(toWorld, w, h) { return screenBoxToWorld(toWorld, 0, 0, w, h); }

export function syncJogPadLabels() {
  const rot = jogFollowsBedView();
  for (const b of document.querySelectorAll(".j[data-axis]")) {
    const axis = b.dataset.axis;
    if (axis === "Z") continue;
    const dir = Number(b.dataset.dir);
    const shown = (rot && axis === "Y") ? -dir : dir;
    const lab = axis + (shown > 0 ? "+" : "−");
    const small = b.querySelector("small");
    if (small) small.textContent = lab;
    b.setAttribute("aria-label", "Jog " + lab);
  }
}


// Map a world-space axis-aligned rect through X/Y (works when those mappers flip Y).
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

// Tiny upright +X / +Y hints in machine space, so the flipped view is not ambiguous.
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

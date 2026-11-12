// Shared geometry helpers for parametric preset parts.
import { arcPoints, circleContour, signedArea, selfIntersects } from "../../core/geom.js";
import { roundedRect, slot, roundCorners, dedupe } from "../shape-helpers.js";
import { coneDevelopment, squareToRound } from "../duct.js";

export { arcPoints, circleContour, signedArea, selfIntersects, roundedRect, slot, roundCorners, dedupe, coneDevelopment, squareToRound };

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
export const pos = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

export function holeIn(cx, cy, d, x0, y0, x1, y1, edge = 1) {
  const r = d / 2;
  return d > 0 && cx - r >= x0 + edge && cx + r <= x1 - edge && cy - r >= y0 + edge && cy + r <= y1 - edge
    ? circleContour(cx, cy, r) : null;
}

export const moveC = (c, dx, dy) => ({
  ...c,
  pts: c.pts.map(([x, y]) => [x + dx, y + dy]),
  circle: c.circle ? { ...c.circle, cx: c.circle.cx + dx, cy: c.circle.cy + dy } : undefined,
});

export function boxOfPts(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

export function boxOfPiece(piece) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of piece) for (const q of c.pts) {
    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
  }
  return [x0, y0, x1, y1];
}

export const ROW_MAX = 1200;
export const PIECE_GAP = 12;

export function packPieces(pieces, rowMax = ROW_MAX, gap = PIECE_GAP) {
  const out = [], placed = [];
  let x = 0, y = 0, rowH = 0;
  for (const piece of pieces) {
    const b = boxOfPiece(piece), w = b[2] - b[0], h = b[3] - b[1];
    if (x > 0 && x + w > rowMax) { x = 0; y += rowH + gap; rowH = 0; }
    const dx = x - b[0], dy = y - b[1];
    const moved = piece.map((c) => moveC(c, dx, dy));
    placed.push(moved);
    out.push(...moved);
    x += w + gap; rowH = Math.max(rowH, h);
  }
  return { contours: out, placed };
}

export function shiftToOrigin(pts) {
  const [x0, y0] = boxOfPts(pts);
  return pts.map(([x, y]) => [x - x0, y - y0]);
}

export function contour(pts, closed = true) {
  const p = dedupe(shiftToOrigin(pts));
  return { pts: p, closed };
}

export function rectContour(w, h, x = 0, y = 0) {
  return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true };
}

export function poly(pts) {
  return contour(pts);
}

export function boltHoles(cx, cy, pcd, n, d, start = Math.PI / 2) {
  const holes = [];
  if (!(d > 0 && pcd > d + 1 && n >= 2)) return holes;
  const r = pcd / 2;
  for (let i = 0; i < n; i++) {
    const a = start + (i * 2 * Math.PI) / n;
    holes.push(circleContour(cx + r * Math.cos(a), cy + r * Math.sin(a), d / 2));
  }
  return holes;
}

// Flat annular-sector pattern for a cone / reducer, shifted into the first quadrant.
export function coneSector(d1, d2, h) {
  const cd = coneDevelopment(d1, d2, h);
  if (!cd || !(cd.Ro > cd.Ri + 1) || cd.Ro > 2500) return null;
  const a0 = Math.PI / 2 + cd.ang / 2, a1 = Math.PI / 2 - cd.ang / 2;
  const outer = [[cd.Ro * Math.cos(a0), cd.Ro * Math.sin(a0)], ...arcPoints(0, 0, cd.Ro, a0, a1, false)];
  const inner = [[cd.Ri * Math.cos(a1), cd.Ri * Math.sin(a1)], ...arcPoints(0, 0, cd.Ri, a1, a0, true)];
  const pts = dedupe([...outer, ...inner]);
  if (pts.length < 6 || Math.abs(signedArea(pts)) < 1 || selfIntersects(pts)) return null;
  return { pts: shiftToOrigin(pts), closed: true };
}

// Two facing cosine waves with a straight band between them (elbow gore / lobster-back segment).
export function sineGore(d, amp, band = 12, n = 48) {
  const w = Math.PI * d, A = Math.max(4, amp), gap = Math.max(8, band);
  // Two facing waves kept apart by `gap`, so they never cross (amp can be large).
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const x = (w * i) / n;
    const wave = A * (1 + Math.cos((2 * Math.PI * i) / n));
    top.push([x, gap + wave]);
    bot.push([x, -wave]);
  }
  const pts = [...top, ...bot.reverse()];
  if (selfIntersects(pts) || Math.abs(signedArea(pts)) < 1) return null;
  return { pts: shiftToOrigin(pts), closed: true };
}

export function shape(id, name, icon, group, aka, tip, params, make, extra = {}) {
  return { id, name, icon, group, aka, tip, params, make, ...extra };
}

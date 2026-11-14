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

// Open score line used as a fold / bend mark (etched, never cut through).
export function bendLine(x0, y0, x1, y1) {
  return { pts: [[x0, y0], [x1, y1]], closed: false, role: "bend", op: "score" };
}

// Developed strip: a rectangle plus a score line at each face junction.
export function strip(len, widths) {
  const list = Array.isArray(widths) ? widths : [];
  const H = list.reduce((a, b) => a + b, 0);
  const c = [rectContour(len, H)];
  let y = 0;
  for (let i = 0; i < list.length - 1; i++) {
    y += list[i];
    c.push(bendLine(0, y, len, y));
  }
  return c;
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

export function shape(id, name, icon, group, aka, tip, params, make, extra = {}) {
  return { id, name, icon, group, aka, tip, params, make, ...extra };
}

// True mitre-plane development of a gored (lobster-back) elbow.
// α = θ / 2(n−1). Wave height of each mitre edge is d·tan(α).
// End gores have one square (pipe) end; middle gores have two in-phase mitre edges
// (long at the extrados, short at the throat). CLR is the centreline radius.
export function mitreHalfAngle(bendRad, pieces) {
  const n = Math.max(2, Math.round(Number(pieces) || 2));
  return (Number(bendRad) || 0) / (2 * (n - 1));
}
export function goreWaveHeight(d, bendDeg, pieces) {
  const a = mitreHalfAngle((Number(bendDeg) || 0) * Math.PI / 180, pieces);
  return Math.abs(d) * Math.tan(a);
}
export function mitreGore(d, bendDeg, pieces, clr, kind = "end", samples = 64) {
  const dia = Number(d) || 0, R = dia / 2;
  const n = Math.max(2, Math.round(Number(pieces) || 2));
  const a = mitreHalfAngle((Number(bendDeg) || 0) * Math.PI / 180, n);
  if (!(R > 0.5) || !(a > 1e-6) || a >= Math.PI / 2 - 1e-3) return null;
  const tanA = Math.tan(a);
  const amp = R * tanA;
  let rad = Number(clr);
  if (!Number.isFinite(rad) || rad <= 0) rad = 1.5 * dia;
  if (rad < R + 1) rad = R + 1;
  const L = rad * tanA;                     // centreline length of an end gore (half of a middle gore)
  const steps = Math.max(24, Math.min(96, Math.round(samples) || 64));
  const circ = Math.PI * dia;
  const top = [], bot = [];
  for (let i = 0; i <= steps; i++) {
    const x = (circ * i) / steps;
    const c = Math.cos((2 * Math.PI * i) / steps);    // +1 at the extrados (x=0 and x=circ)
    if (kind === "mid") {
      // Both edges wavy and in phase: wide at the back, narrow at the throat.
      bot.push([x, amp * (1 - c)]);
      top.push([x, 2 * L + amp * (1 + c)]);
    } else {
      bot.push([x, 0]);
      top.push([x, L + amp * c]);
    }
  }
  if (top.some((p) => p[1] <= bot[top.indexOf(p)][1] + 0.2)) return null;
  const pts = [...top, ...bot.reverse()];
  if (selfIntersects(pts) || Math.abs(signedArea(pts)) < 1) return null;
  return { pts: shiftToOrigin(pts), closed: true };
}
export function elbowGores(d, bendDeg, pieces, clr) {
  const n = Math.max(2, Math.min(12, Math.round(Number(pieces) || 2)));
  const end = mitreGore(d, bendDeg, n, clr, "end");
  if (!end) return [];
  const piecesOut = [[end]];
  if (n >= 3) {
    const mid = mitreGore(d, bendDeg, n, clr, "mid");
    if (!mid) return [];
    for (let i = 0; i < n - 2; i++) piecesOut.push([mid]);
  }
  piecesOut.push([end]);
  return packPieces(piecesOut).contours;
}


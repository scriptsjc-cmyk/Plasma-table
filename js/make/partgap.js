// r15 10.2: the distance between the part being dragged and its nearest neighbour.
// a, b: lists of contours ({ pts, closed }) in world mm. Returns { d, a: [x, y], b: [x, y], overlap } or null.
import { pointInPoly } from "../core/geom.js";

function segs(cs) {
  const out = [];
  for (const c of cs || []) {
    const p = c && c.pts; if (!p || p.length < 2) continue;
    const n = p.length, m = c.closed === false ? n - 1 : n;
    for (let i = 0; i < m; i++) out.push([p[i], p[(i + 1) % n]]);
  }
  return out;
}
function nearestOnSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}
function cross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function box(cs) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of cs || []) for (const [x, y] of c.pts || []) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
}
const inside = (cs, p) => (cs || []).some((c) => c.closed !== false && c.pts && c.pts.length >= 3 && pointInPoly(p, c.pts));

export function minGap(a, b, maxDist = Infinity) {
  const A = segs(a), B = segs(b);
  if (!A.length || !B.length) return null;
  const ba = box(a), bb = box(b);
  const bx = Math.max(0, ba[0] - bb[2], bb[0] - ba[2]), by = Math.max(0, ba[1] - bb[3], bb[1] - ba[3]);
  if (Math.hypot(bx, by) > maxDist) return null;
  for (const [p, q] of A) for (const [r, s] of B) if (cross(p, q, r, s)) return { d: 0, a: p, b: p, overlap: true };
  if (inside(b, a[0].pts[0]) || inside(a, b[0].pts[0])) return { d: 0, a: a[0].pts[0], b: a[0].pts[0], overlap: true };
  let best = null;
  const tryPt = (p, sa, sb, flip) => {
    const q = nearestOnSeg(p, sa, sb), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!best || d < best.d) best = flip ? { d, a: q, b: p } : { d, a: p, b: q };
  };
  for (const [p, q] of A) for (const [r, s] of B) { tryPt(p, r, s, false); tryPt(q, r, s, false); tryPt(r, p, q, true); tryPt(s, p, q, true); }
  if (!best || best.d > maxDist) return null;
  return { d: best.d, a: best.a, b: best.b, overlap: false };
}

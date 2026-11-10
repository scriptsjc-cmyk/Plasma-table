// Turn imported drawing geometry (DXF / SVG outlines, which arrive as many short straight segments) into the shape
// maker's own editable geometry: corner points with a "bulge" per edge (0 = straight line, otherwise a true arc).
// Runs of points that sit on one circle become ONE arc again, full circles become four quarter arcs, and everything
// else stays straight lines. Splines can't be edited as curves, so they come in as short straight lines (the
// importer counts them so the screen can say so).
import { expandContour, pointInPoly } from "./geom.js";

const TOL = 0.006;            // mm: how far a point may sit off a fitted circle and still count as part of the arc
const R1 = (v) => Math.round(v * 100) / 100;

function circle3(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { cx, cy, r: Math.hypot(a[0] - cx, a[1] - cy) };
}
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// does points i..j (cyclic, in `pts`) lie on one circle, turning one way, sweeping < 300 degrees? -> {sweep} or null
function arcRun(pts, i, j) {
  const n = pts.length, cnt = ((j - i + n) % n);
  if (cnt < 3) return null;                           // an arc needs a few points, or any 3 points would "fit"
  let lo = Infinity, hi = 0;                          // flattened arcs have evenly spaced points; a line + arc mix does not
  for (let k = 0; k < cnt; k++) { const a0 = pts[(i + k) % n], b0 = pts[(i + k + 1) % n], l = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]); lo = Math.min(lo, l); hi = Math.max(hi, l); }
  if (lo < 1e-9 || hi / lo > 1.6) return null;
  const at = (k) => pts[(i + k) % n];
  const a = at(0), c = at(cnt), b = at(Math.floor(cnt / 2));
  const C = circle3(a, b, c);
  if (!C || C.r > 1e5 || C.r < 0.05) return null;
  let sweep = 0, prev = Math.atan2(a[1] - C.cy, a[0] - C.cx), dir = 0;
  for (let k = 0; k <= cnt; k++) {
    const p = at(k);
    if (Math.abs(Math.hypot(p[0] - C.cx, p[1] - C.cy) - C.r) > TOL * Math.max(1, C.r / 50)) return null;
    if (k) {
      const ang = Math.atan2(p[1] - C.cy, p[0] - C.cx), d = wrap(ang - prev);
      if (Math.abs(d) < 1e-9) return null;
      if (!dir) dir = Math.sign(d); else if (Math.sign(d) !== dir) return null;
      sweep += d; prev = ang;
    }
  }
  // a real flattened arc turns only a little at each point; a hexagon or a rectangle's corners turn a lot (those stay straight lines)
  if (Math.abs(sweep) / cnt > 0.5) return null;
  return Math.abs(sweep) <= 300 * Math.PI / 180 ? { sweep } : null;
}

function fitRing(pts) {
  const n = pts.length;
  if (n < 3) return { pts, bulges: pts.map(() => 0), arcs: 0 };
  // start where an edge length changes most (a line meeting an arc) or, failing that, at the sharpest corner,
  // so an arc is never cut in half by the start of the list
  let s = 0, best = -1;
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], q = pts[i], r = pts[(i + 1) % n];
    const l1 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-9, l2 = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1e-9;
    const t = Math.abs(wrap(Math.atan2(r[1] - q[1], r[0] - q[0]) - Math.atan2(q[1] - p[1], q[0] - p[0])));
    const score = Math.abs(Math.log(l1 / l2)) * 10 + t;
    if (score > best) { best = score; s = i; }
  }
  const P = pts.slice(s).concat(pts.slice(0, s));
  const outP = [], outB = []; let arcs = 0;
  for (let i = 0; i < n;) {
    let jBest = -1, sw = 0;
    // longest arc starting here: grow while the points still fit one circle
    for (let j = i + 3; j <= n; j++) {
      const r = arcRun(P, i, j % n);
      if (!r) { if (j - i > 5) break; else continue; }
      jBest = j; sw = r.sweep;
    }
    if (jBest > 0 && jBest - i >= 3) {
      outP.push(P[i]); outB.push(Math.tan(sw / 4)); arcs++; i = jBest;
    } else { outP.push(P[i]); outB.push(0); i++; }
  }
  return { pts: outP, bulges: outB, arcs };
}

// bounding box of a ring including the swing of its arcs
function ringBox(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  const n = g.pts.length;
  for (let i = 0; i < n; i++) {
    const p = g.pts[i]; add(p[0], p[1]);
    const b = g.bulges[i]; if (!b || (!g.closed && i === n - 1)) continue;
    const q = g.pts[(i + 1) % n], th = 4 * Math.atan(b), ch = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (ch < 1e-9) continue;
    const R = ch / (2 * Math.sin(Math.abs(th) / 2)), mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const h = Math.sqrt(Math.max(0, R * R - (ch / 2) ** 2)) * (Math.abs(th) > Math.PI ? -1 : 1) * Math.sign(b);
    const cx = mx - ((q[1] - p[1]) / ch) * h, cy = my + ((q[0] - p[0]) / ch) * h, a0 = Math.atan2(p[1] - cy, p[0] - cx);
    for (let k = 1; k < 24; k++) { const a = a0 + (th * k) / 24; add(cx + R * Math.cos(a), cy + R * Math.sin(a)); }
  }
  return [x0, y0, x1, y1];
}
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };

// contours: [{ pts, closed, circle? }] in mm.
// Returns { parts: [{ cs, x, y }], arcs, lines } : one editable part per outer outline (holes inside it travel with it,
// each part stored relative to its own lower-left corner at x, y), or null if there is nothing to edit.
export function contoursToEditable(contours) {
  const rings = []; let arcs = 0, lines = 0;
  for (const c of contours) {
    if (c.circle) {
      const { cx, cy, r } = c.circle, k = Math.tan(Math.PI / 8);
      rings.push({ pts: [[cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]], bulges: [k, k, k, k], closed: true });
      arcs += 4; continue;
    }
    if (!c.pts || c.pts.length < 2) continue;
    const pts = c.pts.map(([x, y]) => [x, y]);
    const closed = c.closed !== false;
    if (closed && pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
    if (closed && pts.length < 3) continue;
    const r = closed ? fitRing(pts) : { pts, bulges: pts.map(() => 0), arcs: 0 };
    arcs += r.arcs; lines += r.pts.length - r.arcs;
    rings.push({ pts: r.pts, bulges: r.bulges, closed });
  }
  if (!rings.length) return null;
  // who sits inside whom: depth 0 = a part, depth 1 = a hole in it, depth 2 = a part inside that hole ...
  const flat = rings.map((g) => (g.closed ? expandContour({ pts: g.pts, closed: true, bulges: g.bulges }).pts : null));
  const info = rings.map((g, i) => ({ i, a: flat[i] ? area(flat[i]) : 0, parent: -1 }));
  for (const me of info) {
    if (!flat[me.i]) continue;
    let best = -1;
    for (const o of info) {
      if (o === me || !flat[o.i] || o.a <= me.a) continue;
      if (pointInPoly(flat[me.i][0], flat[o.i]) && (best < 0 || o.a < info[best].a)) best = o.i;
    }
    me.parent = best;
  }
  const depth = (k) => { let d = 0; for (let p = info[k].parent; p >= 0; p = info[p].parent) d++; return d; };
  const groups = [];
  for (const me of info) {
    if (!flat[me.i] || depth(me.i) % 2 === 0) groups.push([me.i]);
  }
  for (const me of info) {
    if (!flat[me.i] || depth(me.i) % 2 === 0) continue;
    const g = groups.find((gr) => gr[0] === me.parent);
    if (g) g.push(me.i); else groups.push([me.i]);
  }
  for (let i = 0; i < rings.length; i++) if (!flat[i]) groups.push([i]);          // open lines
  const parts = groups.map((ids) => {
    const gs = ids.map((i) => rings[i]);
    const boxes = gs.map(ringBox);
    const x0 = Math.min(...boxes.map((b) => b[0])), y0 = Math.min(...boxes.map((b) => b[1]));
    return {
      x: R1(x0), y: R1(y0),
      cs: gs.map((g) => ({ pts: g.pts.map(([x, y]) => [R1(x - x0), R1(y - y0)]), closed: g.closed, bulges: g.bulges.map((b) => Math.round(b * 1e6) / 1e6) })),
    };
  });
  return { parts, arcs, lines };
}

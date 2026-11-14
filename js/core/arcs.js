// Arc fitting, intersections, 3-point / tangent arcs, splines, and drawing export (DXF / SVG).
// Used by Join/Offset, CAM (G2/G3), Trim/Extend/Break, and curve tools.
import { bulgeFromPoint, detectCircle } from "./geom.js";

export const ARC_FIT_TOL = 0.08; // mm: max deviation when recovering or fitting arcs
export const MAX_FIT_RADIUS = 5e4;

export function almost(a, b, t = 1e-6) {
  return Math.abs(a - b) <= t;
}
export function hypot2(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return dx * dx + dy * dy;
}
export function mid2(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
export function unit(dx, dy) {
  const L = Math.hypot(dx, dy);
  return L > 1e-12 ? [dx / L, dy / L] : [0, 0];
}

export function circleFrom3(a, b, c) {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  if (!(r > 1e-9) || r > MAX_FIT_RADIUS) return null;
  return { cx: ux, cy: uy, r };
}

export function circleOfBulge(p, q, bulge) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < 1e-12) return null;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const c = Math.hypot(dx, dy);
  if (c < 1e-12) return null;
  const h = (b * c) / 2; // sagitta with sign: positive CCW (left of p→q)
  const r = (h / 2) + (c * c) / (8 * h);
  // centre is along the perpendicular, offset from the chord mid
  // For bulge b, offset d = r - h?  mid-to-centre = (c/2)/b - (c/2)*b? Standard:
  // distance from chord mid to centre is (r - sagitta) with sign, sagitta = |h|...
  // bulge b = tan(sweep/4), sweep = 4 atan(b), r = c / (2 sin(sweep/2)) = c (1+b^2)/(4|b|) * sign?
  const absB = Math.abs(b);
  const radius = Math.abs((c * (1 + b * b)) / (4 * b));
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
  // unit left normal of p→q (CCW)
  const nx = -dy / c, ny = dx / c;
  // centre is on the left for b>0, at distance (r - sagitta) from mid toward the left
  // sagitta = b * c / 2, and r - s = (c/2)(1/b - b)/2 wait:
  // d = (c/2) * (1 - b*b) / (2b)  = c (1-b²)/(4b)
  const d = c * (1 - b * b) / (4 * b);
  return { cx: mx + nx * d, cy: my + ny * d, r: radius };
}

export function bulgeFromCircle(p, q, cx, cy, signHint) {
  const a1 = Math.atan2(p[1] - cy, p[0] - cx);
  const a2 = Math.atan2(q[1] - cy, q[0] - cx);
  let sweep = a2 - a1;
  const hint = signHint == null ? 0 : Math.sign(signHint);
  if (hint > 0 && sweep <= 0) sweep += Math.PI * 2;
  else if (hint < 0 && sweep >= 0) sweep -= Math.PI * 2;
  else if (!hint) {
    // smaller arc
    if (sweep > Math.PI) sweep -= Math.PI * 2;
    if (sweep < -Math.PI) sweep += Math.PI * 2;
  }
  if (Math.abs(sweep) < 1e-12) return 0;
  return Math.tan(sweep / 4);
}

export function bulgeToIJ(p, q, bulge) {
  const c = circleOfBulge(p, q, bulge);
  if (!c) return null;
  return { I: c.cx - p[0], J: c.cy - p[1], G: bulge > 0 ? 3 : 2, r: c.r, cx: c.cx, cy: c.cy };
}

export function arcAngles(p, q, bulge) {
  const c = circleOfBulge(p, q, bulge);
  if (!c) return null;
  const a1 = Math.atan2(p[1] - c.cy, p[0] - c.cx);
  const a2 = Math.atan2(q[1] - c.cy, q[0] - c.cx);
  let sweep = a2 - a1;
  if (bulge > 0 && sweep <= 0) sweep += Math.PI * 2;
  if (bulge < 0 && sweep >= 0) sweep -= Math.PI * 2;
  return { ...c, a1, a2, sweep };
}

function angOnArc(ang, a1, sweep) {
  const two = Math.PI * 2;
  let d = ang - a1;
  if (sweep > 0) {
    while (d < -1e-9) d += two;
    while (d > two + 1e-9) d -= two;
    return d >= -1e-7 && d <= sweep + 1e-7;
  }
  while (d > 1e-9) d -= two;
  while (d < -two - 1e-9) d += two;
  return d <= 1e-7 && d >= sweep - 1e-7;
}

export function pointOnArc(p, q, bulge, t) {
  const a = arcAngles(p, q, bulge);
  if (!a) return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const ang = a.a1 + a.sweep * t;
  return [a.cx + a.r * Math.cos(ang), a.cy + a.r * Math.sin(ang)];
}

export function paramOnEdge(p, q, bulge, pt) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < 1e-12) {
    const dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy;
    if (l2 < 1e-18) return 0;
    return ((pt[0] - p[0]) * dx + (pt[1] - p[1]) * dy) / l2;
  }
  const a = arcAngles(p, q, bulge);
  if (!a || Math.abs(a.sweep) < 1e-12) return 0;
  const ang = Math.atan2(pt[1] - a.cy, pt[0] - a.cx);
  let d = ang - a.a1;
  const two = Math.PI * 2;
  if (a.sweep > 0) {
    while (d < -1e-9) d += two;
    while (d > two + 1e-9) d -= two;
  } else {
    while (d > 1e-9) d -= two;
    while (d < -two - 1e-9) d += two;
  }
  return d / a.sweep;
}

export function splitEdgeAt(p, q, bulge, pt) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < 1e-12) return { mid: [pt[0], pt[1]], b1: 0, b2: 0 };
  const c = circleOfBulge(p, q, b);
  if (!c) return { mid: [pt[0], pt[1]], b1: 0, b2: 0 };
  return { mid: [pt[0], pt[1]], b1: bulgeFromCircle(p, pt, c.cx, c.cy, b), b2: bulgeFromCircle(pt, q, c.cx, c.cy, b) };
}

function vertexTurn(a, b, c) {
  const v1x = b[0] - a[0], v1y = b[1] - a[1], l1 = Math.hypot(v1x, v1y);
  const v2x = c[0] - b[0], v2y = c[1] - b[1], l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-12 || l2 < 1e-12) return 0;
  return Math.atan2((v1x / l1) * (v2y / l2) - (v1y / l1) * (v2x / l2), (v1x / l1) * (v2x / l2) + (v1y / l1) * (v2y / l2));
}
// A sharp polyline corner (e.g. three corners of a rectangle, which always lie on a semicircle)
// must not be "fitted" as an arc.
const MAX_ARC_TURN = 50 * Math.PI / 180;
function colinearTol(a, b, c, tol) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 1e-12) return Math.hypot(c[0] - a[0], c[1] - a[1]) <= tol;
  const cross = Math.abs((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / L;
  if (cross > tol) return false;
  const t = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / (L * L);
  return t >= -0.02 && t <= 1.02;
}

function monotonicOnCircle(pts, i, j, circ, bulge) {
  let prev = 0;
  for (let k = i; k <= j; k++) {
    const t = paramOnEdge(pts[i], pts[j], bulge, pts[k]);
    if (t < prev - 1e-4 || t > 1.02) return false;
    prev = t;
  }
  return true;
}

export function fitArcs(pts, closed, tol = ARC_FIT_TOL) {
  const src = (pts || []).map((p) => [p[0], p[1]]);
  if (closed && src.length >= 3) {
    const circ = detectCircle(src, Math.max(tol, 0.15));
    if (circ) return { pts: src, bulges: src.map(() => 0), closed: true, circle: circ };
  }
  if (closed && src.length > 2) {
    const a = src[0], b = src[src.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-8) src.push([a[0], a[1]]);
  }
  if (src.length < 2) return { pts: src, bulges: [], closed: !!closed };
  const outP = [src[0]], outB = [];
  let i = 0;
  while (i < src.length - 1) {
    // Grow a straight run first so a shallow arc cannot swallow a true straight side.
    // A tight line tolerance stops the first point of a small fillet being eaten as "colinear".
    const lineTol = Math.min(tol, 0.025);
    let lineJ = i + 1;
    for (let j = i + 2; j < src.length; j++) {
      if (colinearTol(src[i], src[i + 1], src[j], lineTol)) lineJ = j;
      else break;
    }
    const firstSeg = Math.hypot(src[i + 1][0] - src[i][0], src[i + 1][1] - src[i][1]);
    const nextOff = (i + 2 < src.length) && !colinearTol(src[i], src[i + 1], src[i + 2], lineTol);
    // A long straight is usually only two vertices (the offset of a straight edge).
    // Emit it as a line before an arc can swallow the next corner.
    if (lineJ > i + 1 || (nextOff && firstSeg > 5)) {
      outP.push([src[lineJ][0], src[lineJ][1]]);
      outB.push(0);
      i = lineJ;
      continue;
    }
    let bestJ = i + 1, bestBulge = 0, foundArc = false;
    // Do not let a run grow past ~180° (keeps two semicircles for a full-circle path).
    for (let j = i + 2; j < src.length; j++) {
      const mid = src[Math.floor((i + j) / 2)];
      const circ = circleFrom3(src[i], mid, src[j]);
      if (!circ) break;
      let ok = true;
      const chordTol = Math.min(tol, 0.02 + 0.00025 * Math.hypot(src[j][0] - src[i][0], src[j][1] - src[i][1]));
      for (let k = i; k <= j; k++) {
        const d = Math.abs(Math.hypot(src[k][0] - circ.cx, src[k][1] - circ.cy) - circ.r);
        if (d > chordTol) { ok = false; break; }
      }
      if (!ok) break;
      const chord = Math.hypot(src[j][0] - src[i][0], src[j][1] - src[i][1]);
      if (chord < 1e-9) break;
      // bulgeFromPoint treats the mid index as mid-chord sagitta, which is wrong
      // when that point is not at the chord centre. Use the fitted circle instead.
      // Unique minor arc through the fitted circle (we already reject |bulge| > 1).
      const b = bulgeFromCircle(src[i], src[j], circ.cx, circ.cy, 0);
      // Reject shallow "arcs" (a straight side plus a hint of the next fillet).
      if (!Number.isFinite(b) || Math.abs(b) < 0.08) continue;
      const sag = Math.abs((b * chord) / 2);
      if (sag < Math.max(tol, 0.015 * chord)) continue;
      if (Math.abs(b) > 1.0001) break;
      if (!monotonicOnCircle(src, i, j, circ, b)) break;
      let sharp = false, midSample = false;
      for (let k = i + 1; k < j; k++) {
        if (Math.abs(vertexTurn(src[k - 1], src[k], src[k + 1])) > MAX_ARC_TURN) { sharp = true; break; }
        const t = paramOnEdge(src[i], src[j], b, src[k]);
        if (t > 0.25 && t < 0.75) {
          const dx = src[j][0] - src[i][0], dy = src[j][1] - src[i][1], L = Math.hypot(dx, dy) || 1;
          const chordD = Math.abs((src[k][0] - src[i][0]) * dy - (src[k][1] - src[i][1]) * dx) / L;
          if (chordD > tol) midSample = true;
        }
      }
      if (sharp) break;
      // A long straight with only rounded ends has no mid-chord sample; do not invent a shallow arc.
      if (!midSample) continue;
      bestJ = j; bestBulge = b; foundArc = true;
    }
    if (!foundArc) { bestJ = i + 1; bestBulge = 0; }
    outP.push([src[bestJ][0], src[bestJ][1]]);
    outB.push(bestBulge);
    i = bestJ;
  }
  if (closed && outP.length > 2) {
    const a = outP[0], b = outP[outP.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) {
      outP.pop();
      // closing bulge is the last entry and stays, one per vertex
    }
  }
  while (outB.length < outP.length) outB.push(0);
  if (!closed && outB.length > outP.length - 1) outB.length = Math.max(0, outP.length - 1);
  return { pts: outP, bulges: outB, closed: !!closed };
}

export function fitContour(c, tol = ARC_FIT_TOL) {
  if (!c || !c.pts || c.pts.length < 2) return c;
  if (c.circle && c.circle.r > 0) return { ...c, circle: c.circle };
  const closed = c.closed !== false;
  const fitted = fitArcs(c.pts, closed, tol);
  const o = { ...c, pts: fitted.pts, bulges: fitted.bulges, closed };
  if (fitted.circle) o.circle = fitted.circle;
  return o;
}

// ---- intersections ----
export function lineLine(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return [];
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return [{ t, u, p: [a[0] + t * rx, a[1] + t * ry] }];
}

function lineCircleHits(a, b, cx, cy, r) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const fx = a[0] - cx, fy = a[1] - cy;
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (A < 1e-18 || disc < -1e-12) return [];
  const s = Math.sqrt(Math.max(0, disc));
  const ts = [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  const uniq = [];
  for (const t of ts) {
    if (!Number.isFinite(t)) continue;
    if (uniq.some((u) => Math.abs(u - t) < 1e-9)) continue;
    uniq.push(t);
  }
  return uniq.map((t) => ({ t, p: [a[0] + t * dx, a[1] + t * dy] }));
}

function circleCircleHits(c1, c2) {
  const dx = c2.cx - c1.cx, dy = c2.cy - c1.cy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-12) return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h2 = c1.r * c1.r - a * a;
  if (h2 < -1e-8) return [];
  const h = Math.sqrt(Math.max(0, h2));
  const mx = c1.cx + a * dx / d, my = c1.cy + a * dy / d;
  const nx = -dy / d, ny = dx / d;
  if (h < 1e-8) return [{ p: [mx, my] }];
  return [{ p: [mx + nx * h, my + ny * h] }, { p: [mx - nx * h, my - ny * h] }];
}

function onArc(p, q, bulge, pt, pad = 1e-6) {
  const t = paramOnEdge(p, q, bulge, pt);
  return t >= -pad && t <= 1 + pad;
}

export function edgeEdgeHits(a0, a1, ab, b0, b1, bb, opts = {}) {
  const openA = !!opts.openA, openB = !!opts.openB; // unused, keep for extend rays
  const A = Number(ab) || 0, B = Number(bb) || 0;
  const hits = [];
  const add = (p, tA, tB) => {
    if (!p || !Number.isFinite(p[0])) return;
    hits.push({ p: [p[0], p[1]], tA, tB });
  };
  if (Math.abs(A) < 1e-12 && Math.abs(B) < 1e-12) {
    for (const h of lineLine(a0, a1, b0, b1)) add(h.p, h.t, h.u);
  } else if (Math.abs(A) < 1e-12) {
    const c = circleOfBulge(b0, b1, B);
    if (!c) return [];
    for (const h of lineCircleHits(a0, a1, c.cx, c.cy, c.r)) {
      if (onArc(b0, b1, B, h.p)) add(h.p, h.t, paramOnEdge(b0, b1, B, h.p));
    }
  } else if (Math.abs(B) < 1e-12) {
    const c = circleOfBulge(a0, a1, A);
    if (!c) return [];
    for (const h of lineCircleHits(b0, b1, c.cx, c.cy, c.r)) {
      if (onArc(a0, a1, A, h.p)) add(h.p, paramOnEdge(a0, a1, A, h.p), h.t);
    }
  } else {
    const c1 = circleOfBulge(a0, a1, A), c2 = circleOfBulge(b0, b1, B);
    if (!c1 || !c2) return [];
    for (const h of circleCircleHits(c1, c2)) {
      if (onArc(a0, a1, A, h.p) && onArc(b0, b1, B, h.p)) {
        add(h.p, paramOnEdge(a0, a1, A, h.p), paramOnEdge(b0, b1, B, h.p));
      }
    }
  }
  return hits;
}

export function rayHits(origin, dir, p, q, bulge, minDist = 1e-6) {
  // Ray origin + t*dir (t in mm) against an edge.
  const L = 1e6;
  const end = [origin[0] + dir[0] * L, origin[1] + dir[1] * L];
  const hits = edgeEdgeHits(origin, end, 0, p, q, bulge);
  return hits.filter((h) => h.tA * L > minDist).map((h) => ({ p: h.p, t: h.tA * L, tE: h.tB }));
}

export function arcRayHits(p, q, bulge, fromStart, otherP, otherQ, otherB, minT = 1e-6) {
  // Continue the arc beyond the chosen end until it meets other edge.
  const a = arcAngles(p, q, bulge);
  if (!a) return [];
  const end = fromStart ? p : q;
  const c = circleOfBulge(otherP, otherQ, otherB);
  const hits = [];
  if (Math.abs(otherB || 0) < 1e-12) {
    for (const h of lineCircleHits(otherP, otherQ, a.cx, a.cy, a.r)) {
      if (h.t < -1e-6 || h.t > 1 + 1e-6) continue;
      hits.push(h.p);
    }
  } else if (c) {
    for (const h of circleCircleHits(a, c)) {
      if (onArc(otherP, otherQ, otherB, h.p)) hits.push(h.p);
    }
  }
  const out = [];
  for (const pt of hits) {
    if (Math.hypot(pt[0] - end[0], pt[1] - end[1]) < 1e-4) continue;
    // parameter beyond the end, in the extend direction
    const ang = Math.atan2(pt[1] - a.cy, pt[0] - a.cx);
    // extend: from the end, continue the same rotation sense
    const endAng = fromStart ? a.a1 : a.a2;
    const sense = fromStart ? -Math.sign(a.sweep) : Math.sign(a.sweep);
    let d = ang - endAng;
    const two = Math.PI * 2;
    if (sense > 0) {
      while (d <= 1e-7) d += two;
    } else {
      while (d >= -1e-7) d -= two;
    }
    if (Math.abs(d) < minT) continue;
    out.push({ p: pt, t: Math.abs(d), ang });
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}

// ---- 3-point and tangent arcs ----
export function arcThrough3(a, b, c) {
  const circ = circleFrom3(a, b, c);
  if (!circ) return null;
  const bulge = bulgeFromPoint(a, c, b);
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-12) return null;
  return { p: a, q: c, mid: b, bulge, circle: circ };
}

export function tangentArcFrom(p, tangent, q) {
  // Circle tangent at p to unit-or-any tangent vector, passing through q.
  const T = unit(tangent[0], tangent[1]);
  if (!T[0] && !T[1]) return null;
  const cands = [];
  for (const sgn of [1, -1]) {
    const N = [-T[1] * sgn, T[0] * sgn];
    const vx = p[0] - q[0], vy = p[1] - q[1];
    const den = 2 * (N[0] * vx + N[1] * vy);
    if (Math.abs(den) < 1e-12) continue;
    const n = (vx * vx + vy * vy) / den;
    // C = p + n * (-N)?  C = p + n N, |C-p|=|C-q|
    // derivation used C = p + n N,  n = -|P-Q|^2 / (2 N·(P-Q))
    const n2 = -(vx * vx + vy * vy) / (2 * (N[0] * (p[0] - q[0]) + N[1] * (p[1] - q[1])));
    if (!(n2 > 1e-9) || n2 > MAX_FIT_RADIUS) continue;
    const cx = p[0] + n2 * N[0], cy = p[1] + n2 * N[1];
    const bulge = bulgeFromCircle(p, q, cx, cy, null);
    if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-12) continue;
    cands.push({ p, q, bulge, circle: { cx, cy, r: n2 }, score: Math.abs(bulge) });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.score - b.score);
  return cands[0];
}

export function edgeTangentAt(p, q, bulge, atStart) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < 1e-12) {
    const T = unit(q[0] - p[0], q[1] - p[1]);
    return atStart ? T : T;
  }
  const a = arcAngles(p, q, b);
  if (!a) return unit(q[0] - p[0], q[1] - p[1]);
  const ang = atStart ? a.a1 : a.a2;
  // tangent of a CCW circle is (-sin, cos); clockwise opposite
  const s = Math.sign(a.sweep) || 1;
  return unit(-Math.sin(ang) * s, Math.cos(ang) * s);
}

export function edgeNormalAt(p, q, bulge, atStart) {
  const T = edgeTangentAt(p, q, bulge, atStart);
  return [-T[1], T[0]];
}

// ---- spline (centripetal Catmull-Rom) then optional arc fit ----
function crPoint(p0, p1, p2, p3, t, alpha = 0.5) {
  const tj = (pi, pj, ti) => {
    const d = Math.pow(Math.max(1e-12, hypot2(pi, pj)), alpha * 0.5);
    return ti + d;
  };
  const t0 = 0;
  const t1 = tj(p0, p1, t0);
  const t2 = tj(p1, p2, t1);
  const t3 = tj(p2, p3, t2);
  const tVal = t1 + (t2 - t1) * t;
  const lerp = (pa, pb, ta, tb, tt) => {
    if (Math.abs(tb - ta) < 1e-12) return pa;
    const u = (tt - ta) / (tb - ta);
    return [pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u];
  };
  const a1 = lerp(p0, p1, t0, t1, tVal);
  const a2 = lerp(p1, p2, t1, t2, tVal);
  const a3 = lerp(p2, p3, t2, t3, tVal);
  const b1 = lerp(a1, a2, t0, t2, tVal);
  const b2 = lerp(a2, a3, t1, t3, tVal);
  return lerp(b1, b2, t1, t2, tVal);
}

export function sampleSpline(pts, closed, perSeg = 16) {
  const p = (pts || []).map((q) => [q[0], q[1]]);
  if (p.length < 2) return p.slice();
  if (p.length === 2) {
    const out = [];
    for (let i = 0; i <= perSeg; i++) {
      const t = i / perSeg;
      out.push([p[0][0] + (p[1][0] - p[0][0]) * t, p[0][1] + (p[1][1] - p[0][1]) * t]);
    }
    return out;
  }
  const n = p.length;
  const out = [];
  const at = (i) => {
    if (closed) return p[(i + n) % n];
    if (i < 0) return [2 * p[0][0] - p[1][0], 2 * p[0][1] - p[1][1]];
    if (i >= n) return [2 * p[n - 1][0] - p[n - 2][0], 2 * p[n - 1][1] - p[n - 2][1]];
    return p[i];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const steps = perSeg;
    for (let s = 0; s < steps; s++) {
      out.push(crPoint(p0, p1, p2, p3, s / steps));
    }
  }
  if (!closed) out.push(at(n - 1));
  else out.push(out[0].slice());
  return out;
}

export function splineToContour(pts, closed, tol = 0.12) {
  const sampled = sampleSpline(pts, closed, 20);
  return fitContour({ pts: sampled, closed: !!closed }, tol);
}

export function parsePointList(text, mode = "xy") {
  const rows = String(text || "").split(/\r?\n|,|;|\t/).join("\n").split("\n");
  // Also accept "x,y" pairs on one line or many. Re-parse more carefully:
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "Paste or type at least two points.", pts: [] };
  const nums = [];
  // Split into records: newline, or semicolon; each record is two numbers (comma or space or tab).
  const recs = raw.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
  const pairs = [];
  if (recs.length === 1) {
    const vals = recs[0].split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    if (vals.length >= 4 && vals.length % 2 === 0) {
      for (let i = 0; i < vals.length; i += 2) pairs.push([vals[i], vals[i + 1]]);
    }
  }
  if (!pairs.length) {
    for (const rec of recs) {
      const vals = rec.split(/[\s,]+/).map((s) => Number(s)).filter((n) => Number.isFinite(n));
      if (vals.length >= 2) pairs.push([vals[0], vals[1]]);
    }
  }
  if (pairs.length < 2) return { ok: false, reason: "Need at least two points (x,y or r,θ).", pts: [] };
  const polar = mode === "polar" || mode === "rtheta" || mode === "r,θ";
  const pts = pairs.map(([a, b]) => {
    if (polar) {
      const th = b * Math.PI / 180;
      return [a * Math.cos(th), a * Math.sin(th)];
    }
    return [a, b];
  });
  if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
    return { ok: false, reason: "A number in that list is not valid.", pts: [] };
  }
  return { ok: true, pts, reason: "" };
}

// ---- drawing export (design geometry, not the kerfed toolpath) ----
function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  const s = v.toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

export function contoursToDxf(contours) {
  const lines = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const ent = (type, kvs) => {
    lines.push("0", type, "8", "0");
    for (const [c, v] of kvs) { lines.push(String(c), String(v)); }
  };
  for (const c of contours || []) {
    if (!c || !c.pts || !c.pts.length) continue;
    if (c.circle && c.circle.r > 0) {
      ent("CIRCLE", [[10, fmt(c.circle.cx)], [20, fmt(c.circle.cy)], [40, fmt(c.circle.r)]]);
      continue;
    }
    const pts = c.pts, n = pts.length, closed = c.closed !== false;
    const bs = c.bulges || [];
    const edges = closed ? n : n - 1;
    if (edges < 1) continue;
    // R12 POLYLINE + VERTEX (group 42 = bulge)
    lines.push("0", "POLYLINE", "8", "0", "66", "1", "70", closed ? "1" : "0");
    for (let i = 0; i < n; i++) {
      const b = Number(bs[i]) || 0;
      lines.push("0", "VERTEX", "8", "0", "10", fmt(pts[i][0]), "20", fmt(pts[i][1]));
      if (Math.abs(b) > 1e-12 && (closed || i < n - 1)) lines.push("42", fmt(b));
    }
    lines.push("0", "SEQEND");
  }
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n") + "\n";
}

export function contoursToSvg(contours) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (x, y) => {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  };
  const paths = [];
  for (const c of contours || []) {
    if (!c) continue;
    if (c.circle && c.circle.r > 0) {
      const { cx, cy, r } = c.circle;
      include(cx - r, cy - r); include(cx + r, cy + r);
      // two semicircle arcs keep a true circle in SVG
      paths.push(`M ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)}`);
      continue;
    }
    const pts = c.pts || [];
    if (pts.length < 2) continue;
    const n = pts.length, closed = c.closed !== false, bs = c.bulges || [];
    for (const p of pts) include(p[0], p[1]);
    if (c.circle) { /* already handled */ }
    let d = `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
    const edges = closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const b = Number(bs[i]) || 0;
      if (Math.abs(b) < 1e-12) d += ` L ${fmt(q[0])} ${fmt(q[1])}`;
      else {
        const info = circleOfBulge(p, q, b);
        const large = Math.abs(b) > 1 ? 1 : 0;
        const sweep = b > 0 ? 1 : 0; // CCW
        const r = info ? info.r : 0;
        d += ` A ${fmt(r)} ${fmt(r)} 0 ${large} ${sweep} ${fmt(q[0])} ${fmt(q[1])}`;
        if (info) {
          include(info.cx - info.r, info.cy - info.r);
          include(info.cx + info.r, info.cy + info.r);
        }
      }
    }
    if (closed) d += " Z";
    paths.push(d);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
  const pad = 2;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  // Flip Y so the drawing looks the right way up in a browser (CAD Y is up).
  const body = paths.map((d) => `  <path d="${d}" fill="none" stroke="#111" stroke-width="0.4"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" width="${fmt(w)}mm" height="${fmt(h)}mm">\n  <g transform="translate(${fmt(-minX)} ${fmt(maxY)}) scale(1 -1)">\n${body}\n  </g>\n</svg>\n`;
}

export function hasTrueArc(contours) {
  return (contours || []).some((c) => (c.circle && c.circle.r > 0) || (c.bulges || []).some((b) => Math.abs(b) > 1e-9));
}

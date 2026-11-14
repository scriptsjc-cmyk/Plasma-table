// 2D geometry helpers for the CAD import and shape maker.
// A contour is { pts: [[x,y],...], closed: bool, circle?: {cx, cy, r} }.
// Closed contours don't repeat the first point at the end.

export const TOL = 0.02;   // chord tolerance when turning curves into straight segments (mm)
const EPS = 1e-9;

export function arcPoints(cx, cy, r, a0, a1, ccw, tol = TOL) {
  // points from angle a0 to a1 (radians), excluding the start point
  let sweep = ccw ? a1 - a0 : a0 - a1;
  while (sweep <= EPS) sweep += 2 * Math.PI;
  if (sweep > 2 * Math.PI + EPS) sweep -= 2 * Math.PI;
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / Math.max(r, tol))));
  const n = Math.max(2, Math.ceil(sweep / Math.max(step, 0.01)));
  const out = [];
  for (let k = 1; k <= n; k++) {
    const a = ccw ? a0 + (sweep * k) / n : a0 - (sweep * k) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function circleContour(cx, cy, r) {
  const pts = [[cx + r, cy], ...arcPoints(cx, cy, r, 0, 2 * Math.PI - 1e-6, true)];
  pts.pop();
  return { pts: cleanPts(pts, true), closed: true, circle: { cx, cy, r } };
}

// polyline vertex with DXF-style bulge to the next vertex -> points (excluding start)
export function bulgePoints(p, q, bulge, tol = TOL) {
  if (Math.abs(bulge) < 1e-9) return [q];
  const theta = 4 * Math.atan(bulge);           // included angle, +ve = CCW
  const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (chord < EPS) return [q];
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
  const d = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
  const ux = (q[0] - p[0]) / chord, uy = (q[1] - p[1]) / chord;
  // centre is to the left of p->q for a CCW arc under 180 degrees
  const sgn = (theta > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const cx = mx - uy * d * sgn, cy = my + ux * d * sgn;
  const a0 = Math.atan2(p[1] - cy, p[0] - cx), a1 = Math.atan2(q[1] - cy, q[0] - cx);
  const pts = arcPoints(cx, cy, r, a0, a1, theta > 0, tol);
  pts[pts.length - 1] = [q[0], q[1]];
  return pts;
}

export function cleanPts(pts, closed) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push([p[0], p[1]]);
  }
  if (closed && out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  }
  return out;
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function pointInPoly(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-300) + xi) inside = !inside;
  }
  return inside;
}

export function bbox(contours) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of contours) for (const [x, y] of c.pts) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return x0 === Infinity ? [0, 0, 0, 0] : [x0, y0, x1, y1];
}


// Offset a closed polygon. Polygon must be counter-clockwise.
// d > 0 grows it, d < 0 shrinks it. Outside corners get a round join (like the
// torch going round the corner), inside corners a sharp one.
export function offsetPolygon(pts, d, tol = TOL) {
  const n = pts.length;
  if (n < 3 || Math.abs(d) < 1e-9) return pts.map((p) => [...p]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1]], e2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    if (l1 < EPS || l2 < EPS) continue;
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2]; // outward normals (CCW)
    const cross = e1[0] * e2[1] - e1[1] * e2[0];
    const dot = e1[0] * e2[0] + e1[1] * e2[1];
    const a = [p1[0] + d * n1[0], p1[1] + d * n1[1]], b = [p1[0] + d * n2[0], p1[1] + d * n2[1]];
    if (Math.abs(cross) < 1e-9 * l1 * l2 && dot > 0) { out.push(a); continue; } // straight on
    if (cross * d > 0) {
      // gap between the offset edges: round join about the corner
      out.push(a);
      const a0 = Math.atan2(n1[1], n1[0]), a1 = Math.atan2(n2[1], n2[0]);
      const arc = arcPoints(p1[0], p1[1], Math.abs(d), d > 0 ? a0 : a0 + Math.PI, d > 0 ? a1 : a1 + Math.PI, d > 0 ? cross > 0 : cross > 0, tol);
      out.push(...arc);
    } else {
      // offset edges overlap: meet at their intersection (sharp corner)
      const den = n1[0] * n2[1] - n1[1] * n2[0];
      if (Math.abs(den) < 1e-12) { out.push(a); continue; }
      // solve p1 + d*n1 + s*e1 = p1 + d*n2 + t*e2  ->  intersection of the two offset lines
      const rx = b[0] - a[0], ry = b[1] - a[1];
      const s = (rx * e2[1] - ry * e2[0]) / (e1[0] * e2[1] - e1[1] * e2[0]);
      out.push([a[0] + s * e1[0], a[1] + s * e1[1]]);
    }
  }
  return cleanPts(out, true);
}

export function segX(a, b, c, d) {
  const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
  const d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
}
export function selfIntersects(pts, limit = 4000) {
  const n = pts.length;
  if (n > limit) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segX(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

// True if the loop is a circle within `tol` mm (or 1% of radius). Used to keep
// discs as discs when offsetting (C12) rather than tessellating them.
export function detectCircle(pts, tol = 0.15) {
  if (!pts || pts.length < 8) return null;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  const rs = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const r = rs.reduce((s, v) => s + v, 0) / rs.length;
  if (!(r > 0.5)) return null;
  let maxDev = 0;
  for (const v of rs) maxDev = Math.max(maxDev, Math.abs(v - r));
  if (maxDev > Math.max(tol, r * 0.01)) return null;
  return { cx, cy, r };
}

// Why an offset result is unusable: self-crossing, inverted (a shrink that grew),
// or a sliver too thin to cut. Returns a plain-English reason or null if it's fine.
export function assessOffset(orig, off, d) {
  if (!off || off.length < 3) return "That offset is too tight for this shape.";
  if (selfIntersects(off)) return "That offset makes the outline cross itself.";
  const a0 = Math.abs(signedArea(orig)), a1 = Math.abs(signedArea(off));
  const b0 = bbox([{ pts: orig }]), b1 = bbox([{ pts: off }]);
  const w0 = b0[2] - b0[0], h0 = b0[3] - b0[1], w1 = b1[2] - b1[0], h1 = b1[3] - b1[1];
  const min0 = Math.min(w0, h0);
  const mm = (v) => Math.max(0.1, Math.round(v * 10) / 10).toFixed(1);
  if (d < 0) {
    if (min0 > 0 && Math.abs(d) >= min0 / 2 - 0.05) {
      return "That shrink is larger than half the part. Use " + mm(min0 / 2 - 0.1) + " mm or less.";
    }
    if (a1 > a0 * 1.05 || w1 > w0 + 1 || h1 > h0 + 1) {
      return "That offset would invert the part into a much larger shape. Use a smaller shrink distance.";
    }
    if (Math.min(w1, h1) < 2 || a1 < 4) {
      return "That offset would leave a sliver too thin to cut cleanly. Use a smaller distance.";
    }
  }
  return null;
}

// Offset a closed loop, keeping a true circle when the source is circular.
// Returns { ok, pts, circle? } or { ok: false, reason }.
export function offsetLoop(pts, d, hint) {
  const circ = (hint && hint.circle) || detectCircle(pts);
  if (circ) {
    const r = circ.r + d;
    if (!(r > 0.2)) return { ok: false, reason: "That offset would collapse the circle. Use a smaller shrink distance." };
    const c = circleContour(circ.cx, circ.cy, r);
    const reason = d < 0 ? assessOffset(pts, c.pts, d) : null;
    if (reason) return { ok: false, reason };
    return { ok: true, pts: c.pts, circle: c.circle };
  }
  let oriented = pts;
  try {
    const off = offsetPolygon(oriented, d);
    const reason = assessOffset(oriented, off, d);
    if (reason) return { ok: false, reason };
    return { ok: true, pts: off };
  } catch (e) {
    return { ok: false, reason: "Couldn't offset that shape." };
  }
}

// ------------------------------------------------------------------ union of outlines (for "Join")
// Greiner-Hormann polygon union. Shapes are grown by a hair and nudged a hair so that edges
// that exactly touch (very common on a 1 mm grid) still overlap cleanly. Returns
// { outer: pts, holes: [pts...] } or null if the two don't touch.
const ccw = (pts) => (signedArea(pts) < 0 ? [...pts].reverse() : pts);
function ghUnion(A, B) {
  const mk = (pts) => {
    const nodes = pts.map(([x, y]) => ({ x, y, inter: false }));
    nodes.forEach((n, i) => { n.next = nodes[(i + 1) % nodes.length]; n.prev = nodes[(i - 1 + nodes.length) % nodes.length]; });
    return nodes;
  };
  const LA = mk(A), LB = mk(B);
  const ins = (a, node) => {           // insert intersection node after vertex a, ordered by alpha
    let at = a;
    while (at.next.inter && at.next.alpha < node.alpha) at = at.next;
    node.prev = at; node.next = at.next; at.next.prev = node; at.next = node;
  };
  let count = 0;
  for (const a of LA) {
    const a2 = A[(LA.indexOf(a) + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b = B[j], b2 = B[(j + 1) % B.length];
      const dxa = a2[0] - a.x, dya = a2[1] - a.y, dxb = b2[0] - b[0], dyb = b2[1] - b[1];
      const den = dxa * dyb - dya * dxb;
      if (Math.abs(den) < 1e-14) continue;
      const ta = ((b[0] - a.x) * dyb - (b[1] - a.y) * dxb) / den;
      const tb = ((b[0] - a.x) * dya - (b[1] - a.y) * dxa) / den;
      if (ta <= 0 || ta >= 1 || tb <= 0 || tb >= 1) continue;
      const x = a.x + ta * dxa, y = a.y + ta * dya;
      const na = { x, y, inter: true, alpha: ta }, nb = { x, y, inter: true, alpha: tb };
      na.neighbor = nb; nb.neighbor = na;
      ins(a, na); ins(LB[j], nb);
      count++;
    }
  }
  if (!count) {
    if (classifyContainment(A, [{ pts: B }]) === "inside") return { loops: [B] };
    if (classifyContainment(B, [{ pts: A }]) === "inside") return { loops: [A] };
    return null;
  }
  const mark = (start, other) => {
    let inside = pointInPoly([start.x, start.y], other), n = start;
    do { if (n.inter) { n.entry = inside; inside = !inside; } n = n.next; } while (n !== start);   // union: flags inverted
  };
  mark(LA[0], B); mark(LB[0], A);
  const loops = [];
  for (;;) {
    let start = null, n = LA[0];
    do { if (n.inter && !n.visited) { start = n; break; } n = n.next; } while (n !== LA[0]);
    if (!start) break;
    const poly = [];
    let cur = start;
    do {
      cur.visited = true; cur.neighbor.visited = true;
      poly.push([cur.x, cur.y]);
      if (cur.entry) { cur = cur.next; while (!cur.inter) { poly.push([cur.x, cur.y]); cur = cur.next; } }
      else { cur = cur.prev; while (!cur.inter) { poly.push([cur.x, cur.y]); cur = cur.prev; } }
      cur = cur.neighbor;
    } while (!cur.visited);
    if (poly.length >= 3) loops.push(poly);
  }
  return { loops };
}
export function unionOutlines(list) {
  const GROW = 0.02;
  let cur = ccw(offsetPolygon(ccw(list[0]), GROW));
  let holes = [];
  for (let k = 1; k < list.length; k++) {
    const nudge = [0.0013 * k, 0.0029 * k];
    const B = ccw(offsetPolygon(ccw(list[k]), GROW)).map(([x, y]) => [x + nudge[0], y + nudge[1]]);
    const r = ghUnion(cur, B);
    if (!r) return null;
    const byArea = r.loops.map((p) => ({ p, a: Math.abs(signedArea(p)) })).sort((a, b) => b.a - a.a);
    cur = ccw(cleanPts(byArea[0].p, true));
    holes.push(...byArea.slice(1).map((x) => cleanPts(x.p, true)));
  }
  // gaps that a later shape filled in aren't holes any more
  holes = holes.filter((h) => h.length >= 3 && !list.some((o) => pointInPoly(h[0], o) && pointInPoly(h[Math.floor(h.length / 2)], o)));
  return { outer: cur, holes: holes.map((h) => (signedArea(h) > 0 ? [...h].reverse() : h)) };
}


// A minus B. If B sits fully inside A, B becomes a hole. If they overlap on an
// edge (a notch), a Greiner-Hormann difference is used. Returns
// { outer: pts, holes: [pts...] } or null if they do not overlap.
export function differenceOutlines(A, B) {
  A = ccw(cleanPts(A, true)); B = ccw(cleanPts(B, true));
  if (A.length < 3 || B.length < 3) return null;
  const aInB = classifyContainment(A, [{ pts: B }]) === "inside";
  const bInA = classifyContainment(B, [{ pts: A }]) === "inside";
  const r = ghUnion(A, B);
  if (!r) {
    if (bInA && !aInB) return { outer: A, holes: [signedArea(B) > 0 ? [...B].reverse() : B] };
    return null;
  }
  if (bInA && !aInB && r.loops.length <= 1) {
    // no crossings: clean hole
    return { outer: A, holes: [signedArea(B) > 0 ? [...B].reverse() : B] };
  }
  // overlapping: take the difference via a second walk that treats B as a hole
  const d = ghDifference(A, B);
  if (!d) return bInA ? { outer: A, holes: [signedArea(B) > 0 ? [...B].reverse() : B] } : null;
  return d;
}

function ghDifference(A, B) {
  // Same intersection plumbing as ghUnion, but entry flags are set for A−B:
  // walk along A outside B, and along B in reverse when inside A.
  const mk = (pts) => {
    const nodes = pts.map(([x, y]) => ({ x, y, inter: false }));
    nodes.forEach((n, i) => { n.next = nodes[(i + 1) % nodes.length]; n.prev = nodes[(i - 1 + nodes.length) % nodes.length]; });
    return nodes;
  };
  const LA = mk(A), LB = mk(B);
  const ins = (a, node) => {
    let at = a;
    while (at.next.inter && at.next.alpha < node.alpha) at = at.next;
    node.prev = at; node.next = at.next; at.next.prev = node; at.next = node;
  };
  let count = 0;
  for (const a of LA) {
    const a2 = A[(LA.indexOf(a) + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b = B[j], b2 = B[(j + 1) % B.length];
      const dxa = a2[0] - a.x, dya = a2[1] - a.y, dxb = b2[0] - b[0], dyb = b2[1] - b[1];
      const den = dxa * dyb - dya * dxb;
      if (Math.abs(den) < 1e-14) continue;
      const ta = ((b[0] - a.x) * dyb - (b[1] - a.y) * dxb) / den;
      const tb = ((b[0] - a.x) * dya - (b[1] - a.y) * dxa) / den;
      if (ta <= 1e-9 || ta >= 1 - 1e-9 || tb <= 1e-9 || tb >= 1 - 1e-9) continue;
      const x = a.x + ta * dxa, y = a.y + ta * dya;
      const na = { x, y, inter: true, alpha: ta }, nb = { x, y, inter: true, alpha: tb };
      na.neighbor = nb; nb.neighbor = na;
      ins(a, na); ins(LB[j], nb);
      count++;
    }
  }
  if (!count) return null;
  const mark = (start, other, invert) => {
    let inside = pointInPoly([start.x, start.y], other), n = start;
    do { if (n.inter) { n.entry = invert ? !inside : inside; inside = !inside; } n = n.next; } while (n !== start);
  };
  // A−B: walk A *outside* B (entry when leaving B), and walk B *inside* A in reverse.
  mark(LA[0], B, false);
  mark(LB[0], A, true);
  const loops = [];
  for (;;) {
    let start = null, n = LA[0];
    do { if (n.inter && !n.visited) { start = n; break; } n = n.next; } while (n !== LA[0]);
    if (!start) break;
    const poly = [];
    let cur = start, guard = 0;
    do {
      cur.visited = true; if (cur.neighbor) cur.neighbor.visited = true;
      poly.push([cur.x, cur.y]);
      if (cur.entry) { cur = cur.next; while (!cur.inter) { poly.push([cur.x, cur.y]); cur = cur.next; } }
      else { cur = cur.prev; while (!cur.inter) { poly.push([cur.x, cur.y]); cur = cur.prev; } }
      cur = cur.neighbor;
    } while (cur && !cur.visited && ++guard < 20000);
    if (poly.length >= 3) loops.push(cleanPts(poly, true));
  }
  if (!loops.length) return null;
  const byArea = loops.map((p) => ({ p, a: Math.abs(signedArea(p)) })).sort((a, b) => b.a - a.a);
  const outer = ccw(byArea[0].p);
  const holes = byArea.slice(1).map((x) => (signedArea(x.p) > 0 ? [...x.p].reverse() : x.p));
  return { outer, holes };
}


// ---- custom-outline bulges (DXF-style: tan of 1/4 included angle, + = CCW) ----
export function bulgeRadius(p, q, bulge) {
  if (Math.abs(bulge) < 1e-9) return Infinity;
  const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (chord < EPS) return 0;
  const theta = 4 * Math.atan(bulge);
  return chord / (2 * Math.sin(Math.abs(theta) / 2));
}

export function bulgeMidpoint(p, q, bulge) {
  if (Math.abs(bulge) < 1e-9) return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const pts = bulgePoints(p, q, bulge);
  return pts[Math.floor((pts.length - 1) / 2)] || [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
}

// Mid-arc sagitta signed the same way as the bulge (left of p→q is positive).
export function bulgeFromSagitta(p, q, sagitta) {
  const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (chord < EPS) return 0;
  const s = Number(sagitta) || 0;
  if (Math.abs(s) < 1e-9) return 0;
  return (2 * s) / chord;
}

export function bulgeFromPoint(p, q, m) {
  const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (chord < EPS) return 0;
  const ux = (q[0] - p[0]) / chord, uy = (q[1] - p[1]) / chord;
  const vx = m[0] - p[0], vy = m[1] - p[1];
  // through-point bulge: sagitta at mid-chord is a decent first estimate
  const mx = p[0] + ux * (chord / 2), my = p[1] + uy * (chord / 2);
  const s = (m[0] - mx) * -uy + (m[1] - my) * ux;
  return bulgeFromSagitta(p, q, s);
}

export function bulgeFromRadius(p, q, radius, left) {
  const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (chord < EPS) return 0;
  const r = Math.abs(Number(radius) || 0);
  if (r < chord / 2 - 1e-6) return 0;
  const half = Math.asin(Math.min(1, (chord / 2) / r));
  const b = Math.tan(half / 2);
  return left === false ? -b : b;
}

// Tessellate a contour's bulges into a polyline (kerf offset and CAM stay on segments).
export function expandContour(c, tol = TOL) {
  if (!c || !c.pts || !c.pts.length) return c;
  const pts = c.pts;
  const closed = !!c.closed;
  const n = pts.length;
  const bulges = c.bulges || [];
  let any = false;
  for (let i = 0; i < n; i++) if (Math.abs(Number(bulges[i]) || 0) > 1e-9) { any = true; break; }
  if (!any) return { pts: pts.map((p) => [p[0], p[1]]), closed, holes: c.holes, circle: c.circle };
  const out = [];
  const edges = closed ? n : Math.max(0, n - 1);
  for (let i = 0; i < edges; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    out.push([p[0], p[1]]);
    const b = Number(bulges[i]) || 0;
    if (Math.abs(b) > 1e-9) {
      const mid = bulgePoints(p, q, b, tol);
      for (let k = 0; k < mid.length - 1; k++) out.push(mid[k]);
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
  return { pts: cleanPts(out, closed), closed, holes: c.holes };
}

// Do two closed polylines cross each other (strictly)? Used to keep a hole inside its outline while editing.
export function polysCross(A, B, limit = 4000) {
  if (A.length > limit || B.length > limit) return false;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) if (segX(a, b, B[j], B[(j + 1) % B.length])) return true;
  }
  return false;
}

// Centre / radius / start angle / signed sweep of a bulge arc, or null for a straight edge.
function bulgeArc(p, q, bulge) {
  if (Math.abs(bulge) < 1e-9) return null;
  const theta = 4 * Math.atan(bulge);
  const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (chord < EPS) return null;
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
  const d = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
  const ux = (q[0] - p[0]) / chord, uy = (q[1] - p[1]) / chord;
  const sgn = (theta > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const cx = mx - uy * d * sgn, cy = my + ux * d * sgn;
  return { cx, cy, r, a0: Math.atan2(p[1] - cy, p[0] - cx), theta };
}

// Split the arc p->q at a point ON the arc. `near` (optional) is projected onto the arc; default = middle.
// Returns { mid, b1, b2 } so that p->mid and mid->q together trace exactly the same arc.
export function splitBulge(p, q, bulge, near) {
  const A = bulgeArc(p, q, bulge);
  if (!A) {
    const m = near ? [near[0], near[1]] : [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    return { mid: m, b1: 0, b2: 0 };
  }
  let f = 0.5;
  if (near) {
    const ang = Math.atan2(near[1] - A.cy, near[0] - A.cx);
    const TAU = Math.PI * 2;
    let delta = A.theta > 0 ? ang - A.a0 : A.a0 - ang;
    delta = ((delta % TAU) + TAU) % TAU;
    f = Math.max(0.1, Math.min(0.9, delta / Math.abs(A.theta)));
  }
  const a = A.a0 + Math.sign(A.theta) * f * Math.abs(A.theta);
  const mid = [A.cx + A.r * Math.cos(a), A.cy + A.r * Math.sin(a)];
  const t1 = f * A.theta, t2 = (1 - f) * A.theta;
  return { mid, b1: Math.tan(t1 / 4), b2: Math.tan(t2 / 4) };
}

// ---- containment / boolean helpers (shared by Join, holes, and cut-contour filtering) ----
const ON_EPS = 1e-6;

export function pointOnSeg(pt, a, b, eps = ON_EPS) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (l2 < eps * eps) return Math.hypot(pt[0] - a[0], pt[1] - a[1]) <= eps;
  let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2;
  if (t < -1e-12 || t > 1 + 1e-12) return false;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy)) <= eps;
}

export function pointOnPolyBoundary(pt, pts, eps = ON_EPS) {
  if (!pts || pts.length < 2) return false;
  for (let i = 0; i < pts.length; i++) if (pointOnSeg(pt, pts[i], pts[(i + 1) % pts.length], eps)) return true;
  return false;
}

// Even-odd winding through a list of loops (outers and holes). A point on a boundary is not “in”.
export function inMaterial(pt, contours) {
  if (!contours || !contours.length) return false;
  let n = 0;
  for (const c of contours) {
    const pts = c.pts || c;
    if (pts && pts.length >= 3 && pointInPoly(pt, pts)) n++;
  }
  return n % 2 === 1;
}

export function onAnyBoundary(pt, contours, eps = ON_EPS) {
  if (!contours) return false;
  for (const c of contours) if (pointOnPolyBoundary(pt, c.pts || c, eps)) return true;
  return false;
}

// How polygon `pts` sits against a host made of loops (outer + holes).
// "inside" = fully in the host material (vertices may sit on the outline).
// "outside" = no interior overlap (a shared corner or edge is still outside).
// "overlap" = crosses the outline or has points both in and out of the material.
export function classifyContainment(pts, hostCs, eps = 0.05) {
  if (!pts || pts.length < 3 || !hostCs || !hostCs.length) return "outside";
  for (const h of hostCs) {
    const hp = h.pts || h;
    if (hp && hp.length >= 3 && polysCross(pts, hp)) return "overlap";
  }
  let inC = 0, outC = 0;
  const consider = (p) => {
    if (onAnyBoundary(p, hostCs, eps)) return;
    if (inMaterial(p, hostCs)) inC++; else outC++;
  };
  for (let i = 0; i < pts.length; i++) {
    consider(pts[i]);
    const q = pts[(i + 1) % pts.length];
    consider([(pts[i][0] + q[0]) / 2, (pts[i][1] + q[1]) / 2]);
  }
  if (inC > 0 && outC > 0) return "overlap";
  if (inC > 0) return "inside";
  return "outside";
}

// Split a part's loops into outers and holes by nesting (not “first loop is the outer”).
export function classifyLoops(contours) {
  const list = (contours || []).filter((c) => ((c && c.pts) || c || []).length >= 3);
  const outers = [], holes = [];
  for (let i = 0; i < list.length; i++) {
    const pts = list[i].pts || list[i];
    let n = 0;
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      if (classifyContainment(pts, [list[j]]) === "inside") n++;
    }
    if (n % 2 === 1) holes.push(list[i]);
    else outers.push(list[i]);
  }
  return { outers, holes };
}

// True if two outlines share a stretch of edge (not just a vertex) long enough to weld.
export function shareEdge(A, B, minLen = 0.5) {
  const edges = (pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
  const on = (p, a, b) => pointOnSeg(p, a, b, 0.05);
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (const [a1, a2] of edges(A)) {
    if (len(a1, a2) < minLen) continue;
    for (const [b1, b2] of edges(B)) {
      if (len(b1, b2) < minLen) continue;
      // colinear-ish overlap: both ends of the shorter projection sit on the other
      const hits = [on(b1, a1, a2), on(b2, a1, a2), on(a1, b1, b2), on(a2, b1, b2)];
      if (hits.filter(Boolean).length < 2) continue;
      // length of the overlapping span
      const ux = a2[0] - a1[0], uy = a2[1] - a1[1], L = Math.hypot(ux, uy) || 1;
      const ts = [a1, a2, b1, b2].map((p) => ((p[0] - a1[0]) * ux + (p[1] - a1[1]) * uy) / (L * L));
      const lo = Math.max(Math.min(ts[0], ts[1]), Math.min(ts[2], ts[3]));
      const hi = Math.min(Math.max(ts[0], ts[1]), Math.max(ts[2], ts[3]));
      if ((hi - lo) * L >= minLen) return true;
    }
  }
  return false;
}

function canWeld(A, B) {
  const rel = classifyContainment(A, [{ pts: B }]);
  if (rel === "overlap" || rel === "inside") return true;
  return shareEdge(A, B, 0.5);
}

// Union every outline that overlaps or shares an edge; a shared corner is not enough.
// Disjoint outlines stay as separate outers.
export function unionMany(outers) {
  let remaining = (outers || []).map((o) => (o && o.pts) || o).filter((p) => p && p.length >= 3);
  const resultOuters = [], resultHoles = [];
  while (remaining.length) {
    let cur = remaining.shift();
    let progressed = true;
    while (progressed) {
      progressed = false;
      const next = [];
      for (const b of remaining) {
        if (!canWeld(cur, b)) { next.push(b); continue; }
        const r = unionOutlines([cur, b]);
        if (r) {
          cur = r.outer;
          if (r.holes && r.holes.length) resultHoles.push(...r.holes);
          progressed = true;
        } else next.push(b);
      }
      remaining = next;
    }
    resultOuters.push(cur);
  }
  return { outers: resultOuters, holes: resultHoles };
}


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
    if (pointInPoly(A[0], B)) return { loops: [B] };
    if (pointInPoly(B[0], A)) return { loops: [A] };
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
  const aInB = pointInPoly(A[0], B) && pointInPoly(A[Math.floor(A.length / 2)], B);
  const bInA = pointInPoly(B[0], A) && pointInPoly(B[Math.floor(B.length / 2)], A);
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

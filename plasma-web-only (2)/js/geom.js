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

export function translate(contours, dx, dy) {
  return contours.map((c) => ({
    ...c,
    pts: c.pts.map(([x, y]) => [x + dx, y + dy]),
    circle: c.circle ? { ...c.circle, cx: c.circle.cx + dx, cy: c.circle.cy + dy } : undefined,
  }));
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

function segX(a, b, c, d) {
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

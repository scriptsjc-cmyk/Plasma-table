// Small geometry helpers shared by the shape definitions (moved out of shapes.js unchanged).
import { arcPoints, circleContour } from "../core/geom.js";

export function roundedRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  if (r <= 0.01) return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true };
  const p = [[x + r, y], [x + w - r, y], ...arcPoints(x + w - r, y + r, r, -Math.PI / 2, 0, true),
    [x + w, y + h - r], ...arcPoints(x + w - r, y + h - r, r, 0, Math.PI / 2, true),
    [x + r, y + h], ...arcPoints(x + r, y + h - r, r, Math.PI / 2, Math.PI, true),
    [x, y + r], ...arcPoints(x + r, y + r, r, Math.PI, 1.5 * Math.PI, true)];
  p.pop(); // last arc point equals the first point
  return { pts: p, closed: true };
}

export function chamferRect(x, y, w, h, c) {
  c = Math.max(0, Math.min(c, w / 2 - 0.01, h / 2 - 0.01));
  if (c <= 0.01) return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true };
  return { pts: [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]], closed: true };
}
export function slot(cx, cy, len, wid) {
  const r = wid / 2, s = Math.max(0, len - wid) / 2;
  if (s <= 0) return circleContour(cx, cy, r);
  const p = [[cx - s, cy - r], [cx + s, cy - r], ...arcPoints(cx + s, cy, r, -Math.PI / 2, Math.PI / 2, true),
    [cx - s, cy + r], ...arcPoints(cx - s, cy, r, Math.PI / 2, 1.5 * Math.PI, true)];
  p.pop();
  return { pts: p, closed: true };
}


// fillet only convex corners (leave concave / re-entrant corners sharp)
export function roundCorners(pts, r) {
  const n = pts.length, out = [];
  if (!(r > 0) || n < 3) return pts;
  let area = 0;
  for (let i = 0; i < n; i++) { const q = pts[(i + 1) % n]; area += pts[i][0] * q[1] - q[0] * pts[i][1]; }
  const ccw = area > 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    if (l1 < 1e-9 || l2 < 1e-9) { out.push(p1); continue; }
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    const convex = ccw ? cross > 1e-9 : cross < -1e-9;
    if (!convex) { out.push(p1); continue; }
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))));
    if (!(ang > 1e-3) || !Number.isFinite(ang)) { out.push(p1); continue; }
    let d = r / Math.tan(ang / 2);
    d = Math.min(d, l1 / 2 - 0.01, l2 / 2 - 0.01);
    if (!(d > 0.01)) { out.push(p1); continue; }
    const rr = d * Math.tan(ang / 2);
    const a = [p1[0] + (v1[0] / l1) * d, p1[1] + (v1[1] / l1) * d], b = [p1[0] + (v2[0] / l2) * d, p1[1] + (v2[1] / l2) * d];
    const bis = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2], bl = Math.hypot(...bis);
    if (!(bl > 1e-9)) { out.push(p1); continue; }
    const cd = Math.hypot(d, rr);
    const c = [p1[0] + (bis[0] / bl) * cd, p1[1] + (bis[1] / bl) * cd];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    const arcA = arcPoints(c[0], c[1], rr, a0, a1, true);
    const arcB = arcPoints(c[0], c[1], rr, a0, a1, false);
    const score = (arc) => arc.reduce((s, q) => s + Math.hypot(q[0] - p1[0], q[1] - p1[1]), 0) / Math.max(1, arc.length);
    const arc = score(arcA) <= score(arcB) ? arcA : arcB;
    if (arc.some((q) => Math.hypot(q[0] - p1[0], q[1] - p1[1]) > Math.abs(d) + rr * 2 + 0.5)) { out.push(p1); continue; }
    out.push(a, ...arc);
  }
  return dedupe(out);
}

export function dedupe(pts) {
  const out = [];
  for (const q of pts) if (!out.length || Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > 1e-6) out.push(q);
  return out;
}


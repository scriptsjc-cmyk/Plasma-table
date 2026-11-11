// Small helpers shared by the Sketch class files (shape lookup, geometry bits) and the mixin() that joins them.
import { SHAPES } from "./shapes.js";
import { expandContour } from "../core/geom.js";

export const KEY = "plasma.sketch", KEY_OPTS = "plasma.sketch.opts";
export const MIN = 2;                               // smallest size (mm)
const CUSTOM = {
  id: "custom", name: "Joined part", icon: "⬟", uniform: true,
  tip: "Shapes joined into one part. Its holes go with it. Resize it with the Size % box or a corner.",
  params: [["scale", "Size %", 100]],
};
export const def = (type) => (type === "custom" ? CUSTOM : SHAPES.find((s) => s.id === type));
// shapes made of several separate outlines (hole patterns, and flat-pattern sets like the square-to-round pieces): size, hit-test and place by ALL their outlines
export const wholeSet = (type) => { const d = def(type); return !!(d && (d.multi || d.sheet)); };
export const shapeDef = def;
export const short = (it) => def(it.type).name.split(/ [/(]/)[0].replace(/ with .*/, "").toLowerCase();
export const r1 = (v) => Math.round(v * 10) / 10;
export const themeColor = (name, fallback) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
  catch { return fallback; }
};
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const MAX_BULGE = 4;   // tan(1/4 of the included angle): 4 is a 304 degree arc; anything bigger is a hostile / corrupt value
export const clampBulge = (b) => (Number.isFinite(+b) ? Math.max(-MAX_BULGE, Math.min(MAX_BULGE, +b)) : 0);
export function mapC(c, f) {
  const o = { ...c, pts: c.pts.map(f) };
  if (c.circle) { const [cx, cy] = f([c.circle.cx, c.circle.cy]); o.circle = { ...c.circle, cx, cy }; }
  if (c.bulges) o.bulges = c.bulges.slice();
  return o;
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 < 1e-18) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function distToEdge(px, py, p, q, bulge) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < 1e-9) return distToSeg(px, py, p[0], p[1], q[0], q[1]);
  const exp = expandContour({ pts: [p, q], closed: false, bulges: [b] });
  let best = Infinity;
  for (let i = 0; i < exp.pts.length - 1; i++) {
    const a = exp.pts[i], c = exp.pts[i + 1];
    best = Math.min(best, distToSeg(px, py, a[0], a[1], c[0], c[1]));
  }
  return best;
}
export const rot = ([x, y], deg) => {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};
export const boxOverlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
export const unionBox = (bs) => bs.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
// Copies the methods of the given classes onto Sketch.prototype (the Sketch class is split over several files; see sketch.js).
export function mixin(target, ...parts) {
  for (const P of parts) for (const k of Object.getOwnPropertyNames(P.prototype)) { if (k !== "constructor") Object.defineProperty(target.prototype, k, Object.getOwnPropertyDescriptor(P.prototype, k)); }
}

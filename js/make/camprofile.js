// Cam plate profile (C37): a closed plate from a base circle, lift, and motion law.
// Displacement-diagram sheets are out of scope; this is only the cuttable cam plate.
import { fitContour } from "../core/arcs.js";
import { circleContour } from "../core/geom.js";

export const CAM_LAWS = [
  { id: 0, key: "shm", name: "Simple harmonic (SHM)" },
  { id: 1, key: "cycloid", name: "Cycloidal" },
  { id: 2, key: "cv", name: "Constant velocity" },
];

export function camDisplacement(u, law) {
  const x = Math.max(0, Math.min(1, Number(u) || 0));
  const k = typeof law === "string" ? law : (law === 1 ? "cycloid" : law === 2 ? "cv" : "shm");
  if (k === "cv") return x;
  if (k === "cycloid") return x - Math.sin(2 * Math.PI * x) / (2 * Math.PI);
  return 0.5 * (1 - Math.cos(Math.PI * x));
}

export function camRadiusAt(deg, p) {
  const baseR = Math.max(1, (Number(p.base) || 80) / 2);
  const lift = Math.max(0, Number(p.lift) || 0);
  let rise = Math.max(0, Number(p.rise) || 0);
  let dwell = Math.max(0, Number(p.dwell) || 0);
  let fall = Math.max(0, Number(p.fall) || 0);
  const sum = rise + dwell + fall;
  if (sum > 360 && sum > 0) {
    const k = 360 / sum;
    rise *= k; dwell *= k; fall *= k;
  }
  const rest = Math.max(0, 360 - rise - dwell - fall);
  const a = ((Number(deg) % 360) + 360) % 360;
  let h = 0;
  if (a < rise) h = camDisplacement(rise ? a / rise : 0, p.law) * lift;
  else if (a < rise + dwell) h = lift;
  else if (a < rise + dwell + fall) h = (1 - camDisplacement(fall ? (a - rise - dwell) / fall : 1, p.law)) * lift;
  else h = 0;
  // unused rest dwell sits on the base circle
  void rest;
  return baseR + h;
}

export function camPlateContours(p = {}) {
  const step = Math.max(1, Math.min(5, Number(p.step) || 2));
  const pts = [];
  for (let a = 0; a < 360 - 0.5 * step; a += step) {
    const r = camRadiusAt(a, p);
    const th = a * Math.PI / 180;
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  if (pts.length < 6) return [];
  // close exactly on the first point
  const c0 = fitContour({ pts, closed: true }) || { pts, closed: true };
  // shift so the box sits at 0,0
  let x0 = Infinity, y0 = Infinity;
  for (const q of c0.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); }
  const plate = {
    ...c0,
    pts: c0.pts.map(([x, y]) => [x - x0, y - y0]),
    closed: true,
    bulges: (c0.bulges || []).slice(),
  };
  const out = [plate];
  const hole = Math.max(0, Number(p.id) || 0);
  if (hole > 0) {
    const cx = -x0, cy = -y0;
    out.push(circleContour(cx, cy, hole / 2));
  }
  return out;
}

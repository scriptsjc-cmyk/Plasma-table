// Gears, sprockets and toothed wheels (plasma-cut approximations).
import { circleContour, holeIn, clamp, shape, shiftToOrigin, signedArea, selfIntersects, dedupe } from "./helpers.js";

function trapGear(teeth, module, hole, paDeg = 20) {
  const z = Math.max(6, Math.min(60, Math.round(teeth) || 12));
  const m = Math.max(3, module);
  const pitchR = z * m / 2;
  const addendum = m;
  const dedendum = 1.2 * m;
  const outerR = pitchR + addendum;
  const rootR = Math.max(pitchR - dedendum, outerR * 0.45);
  const pa = (paDeg * Math.PI) / 180;
  // tooth thickness at the pitch circle, as an angle
  const toothAng = Math.PI / z;
  const tipHalf = (toothAng / 2) * (0.55);
  const rootHalf = (toothAng / 2) * (1.15);
  const pts = [];
  for (let i = 0; i < z; i++) {
    const a0 = (i * 2 * Math.PI) / z;
    const a = (off) => a0 + off;
    pts.push([rootR * Math.cos(a(-rootHalf)), rootR * Math.sin(a(-rootHalf))]);
    pts.push([outerR * Math.cos(a(-tipHalf)), outerR * Math.sin(a(-tipHalf))]);
    pts.push([outerR * Math.cos(a(tipHalf)), outerR * Math.sin(a(tipHalf))]);
    pts.push([rootR * Math.cos(a(rootHalf)), rootR * Math.sin(a(rootHalf))]);
  }
  const clean = dedupe(shiftToOrigin(pts));
  if (clean.length < 8 || Math.abs(signedArea(clean)) < 1 || selfIntersects(clean)) return [];
  const c = [{ pts: clean, closed: true }];
  const [x0, y0] = (() => {
    // centre after shift: bounding-box mid is the gear centre (symmetric)
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of clean) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
    return [(minx + maxx) / 2, (miny + maxy) / 2];
  })();
  const hd = Math.min(hole, rootR * 1.4);
  const h = hd > 4 ? circleContour(x0, y0, hd / 2) : null;
  if (h) c.push(h);
  return c;
}

function sprocket(teeth, pitch, roller, hole) {
  const z = Math.max(7, Math.min(40, Math.round(teeth) || 12));
  const p = Math.max(6, pitch);
  const rr = Math.max(2, Math.min(p * 0.4, roller / 2));
  const pitchR = p / (2 * Math.sin(Math.PI / z));
  const outerR = pitchR + rr * 0.85;
  const rootR = Math.max(pitchR - rr * 1.15, outerR * 0.4);
  const pts = [];
  const nArc = 6;
  for (let i = 0; i < z; i++) {
    const a0 = (i * 2 * Math.PI) / z;
    const half = Math.PI / z * 0.45;
    // tip
    pts.push([outerR * Math.cos(a0 - half * 0.4), outerR * Math.sin(a0 - half * 0.4)]);
    pts.push([outerR * Math.cos(a0 + half * 0.4), outerR * Math.sin(a0 + half * 0.4)]);
    // roller seat as a concave dip at the root, approximated by going into the root
    const seat = a0 + Math.PI / z;
    for (let k = 0; k <= nArc; k++) {
      const t = k / nArc;
      const ang = a0 + half + (seat - half - a0) * t; // not used
    }
    const dip = a0 + Math.PI / z;
    pts.push([rootR * Math.cos(dip - half * 0.2), rootR * Math.sin(dip - half * 0.2)]);
    pts.push([rootR * Math.cos(dip + half * 0.2), rootR * Math.sin(dip + half * 0.2)]);
  }
  const clean = dedupe(shiftToOrigin(pts));
  if (clean.length < 8 || Math.abs(signedArea(clean)) < 1 || selfIntersects(clean)) return [];
  const c = [{ pts: clean, closed: true }];
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of clean) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
  const hd = Math.min(hole, (maxx - minx) * 0.3);
  if (hd > 4) c.push(circleContour((minx + maxx) / 2, (miny + maxy) / 2, hd / 2));
  return c;
}

export const GEAR_PRESETS = [
  shape("spurgearsm", "Spur gear", "⚙", "gearing", "spur gear involute teeth",
    "Plasma-cut spur gear (trapezoid tooth approximation). Set the tooth count, module and bore.",
    [["teeth", "Number of teeth", 14], ["module", "Module (mm)", 6], ["hole", "Bore Ø", 16]],
    (p) => trapGear(p.teeth, p.module, p.hole)),
  shape("spurgearmed", "Spur gear (coarse)", "⚙", "gearing", "coarse spur gear",
    "Coarser spur gear with fewer, thicker teeth.",
    [["teeth", "Number of teeth", 10], ["module", "Module (mm)", 8], ["hole", "Bore Ø", 18]],
    (p) => trapGear(p.teeth, p.module, p.hole)),
  shape("piniongear", "Pinion", "⚙", "gearing", "pinion small gear",
    "Small pinion to mesh with a larger gear of the same module.",
    [["teeth", "Number of teeth", 8], ["module", "Module (mm)", 6], ["hole", "Bore Ø", 12]],
    (p) => trapGear(p.teeth, p.module, p.hole)),
  shape("sprocketstd", "Roller-chain sprocket", "⊛", "gearing", "sprocket roller chain",
    "Roller-chain sprocket (approximate tooth pockets).",
    [["teeth", "Number of teeth", 13], ["pitch", "Chain pitch (mm)", 12.7], ["roller", "Roller Ø", 7.75], ["hole", "Bore Ø", 16]],
    (p) => sprocket(p.teeth, p.pitch, p.roller, p.hole)),
  shape("timingblank", "Timing-pulley blank", "◉", "gearing", "timing pulley blank",
    "Timing-pulley blank: a disc with a bore and a flange-like rim (cut teeth later if you want).",
    [["od", "Outside Ø", 80], ["id", "Bore Ø", 16], ["flange", "Flange Ø (0 = none)", 92]],
    (p) => {
      const od = Math.max(p.od, p.id + 8);
      const r = (p.flange > od ? p.flange : od) / 2;
      const c = [circleContour(r, r, p.flange > od ? p.flange / 2 : od / 2)];
      c.push(circleContour(r, r, p.id / 2));
      return c;
    }),
  shape("ratchetwheel", "Ratchet wheel", "⛭", "gearing", "ratchet wheel pawl",
    "Ratchet wheel with saw-tooth teeth and a centre bore.",
    [["teeth", "Number of teeth", 12], ["od", "Outside Ø", 100], ["id", "Bore Ø", 16], ["depth", "Tooth depth", 10]],
    (p) => {
      const z = Math.max(6, Math.min(40, Math.round(p.teeth) || 12));
      const Ro = p.od / 2, Ri = Math.max(Ro - Math.max(4, p.depth), Ro * 0.55);
      const pts = [];
      for (let i = 0; i < z; i++) {
        const a0 = (i * 2 * Math.PI) / z, a1 = ((i + 1) * 2 * Math.PI) / z;
        pts.push([Ro * Math.cos(a0), Ro * Math.sin(a0)]);
        pts.push([Ri * Math.cos(a1), Ri * Math.sin(a1)]);
      }
      const clean = dedupe(shiftToOrigin(pts));
      if (selfIntersects(clean)) return [];
      const c = [{ pts: clean, closed: true }];
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const [x, y] of clean) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
      const hd = Math.min(p.id, (maxx - minx) * 0.35);
      if (hd > 4) c.push(circleContour((minx + maxx) / 2, (miny + maxy) / 2, hd / 2));
      return c;
    }),
  shape("internalring", "Internal gear ring", "◎", "gearing", "internal ring gear",
    "Internal gear ring: a ring with teeth on the inside.",
    [["teeth", "Number of teeth", 24], ["module", "Module (mm)", 5], ["rim", "Rim width", 14]],
    (p) => {
      const z = Math.max(10, Math.min(60, Math.round(p.teeth) || 24));
      const m = Math.max(3, p.module);
      const pitchR = z * m / 2;
      const innerTip = pitchR - m;          // tips of internal teeth point inward
      const innerRoot = pitchR + 1.1 * m;
      const outerR = innerRoot + Math.max(8, p.rim);
      const toothAng = Math.PI / z;
      const tipHalf = toothAng / 2 * 0.5;
      const rootHalf = toothAng / 2 * 1.1;
      const pts = [];
      for (let i = 0; i < z; i++) {
        const a0 = (i * 2 * Math.PI) / z;
        const a = (off) => a0 + off;
        pts.push([innerRoot * Math.cos(a(-rootHalf)), innerRoot * Math.sin(a(-rootHalf))]);
        pts.push([innerTip * Math.cos(a(-tipHalf)), innerTip * Math.sin(a(-tipHalf))]);
        pts.push([innerTip * Math.cos(a(tipHalf)), innerTip * Math.sin(a(tipHalf))]);
        pts.push([innerRoot * Math.cos(a(rootHalf)), innerRoot * Math.sin(a(rootHalf))]);
      }
      const clean = dedupe(shiftToOrigin(pts));
      if (clean.length < 8 || selfIntersects(clean)) return [];
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const [x, y] of clean) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
      return [circleContour(cx, cy, outerR), { pts: clean, closed: true }];
    }),
  shape("chainring", "Chainring", "☀", "gearing", "chainring bicycle",
    "Bicycle-style chainring: a toothed ring with five mounting holes on a pitch circle.",
    [["teeth", "Number of teeth", 32], ["module", "Module (mm)", 4], ["pcd", "Mounting pitch circle Ø", 74], ["hole", "Mounting hole Ø", 6], ["bore", "Centre bore Ø", 34]],
    (p) => {
      const gear = trapGear(p.teeth, p.module, 0);
      if (!gear.length) return [];
      const outline = gear[0];
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const [x, y] of outline.pts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
      const c = [outline];
      const bore = holeIn(cx, cy, p.bore, minx, miny, maxx, maxy, 2);
      if (bore) c.push(bore);
      const pcd = clamp(p.pcd, p.bore + p.hole + 6, (maxx - minx) * 0.55);
      const r = pcd / 2;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const h = holeIn(cx + r * Math.cos(a), cy + r * Math.sin(a), p.hole, minx, miny, maxx, maxy, 1);
        if (h) c.push(h);
      }
      return c;
    }),
];

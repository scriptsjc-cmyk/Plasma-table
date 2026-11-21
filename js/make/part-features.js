// r15 Round 2: features on a part (holes, slots, patterns, cut-outs, text, etch lines, corners).
// A feature is a small record kept on the sketch item (it.feats) and measured from the part's bottom-left corner,
// exactly as typed. Before anything is cut, features are flattened to ordinary contours (sketch-geom contoursOf),
// so cam.js and the G-code never see them. A part with no features is cut exactly as before.
import { TOL, pointInPoly, polysCross } from "../core/geom.js";
import { textToContours } from "./textshape.js";

export const FEATURE_KINDS = {
  hole:   { label: "Hole",            icon: "○", keys: [["d", "Ø", 10]] },
  slot:   { label: "Slot",            icon: "⊂⊃", keys: [["len", "Length", 30], ["wid", "Width", 8.5], ["rot", "Angle °", 0]] },
  bolt:   { label: "Bolt circle",     icon: "⊚", keys: [["n", "Count", 4], ["d", "Ø", 6.5], ["pcd", "Circle Ø (PCD)", 60], ["ang", "Start angle °", 0]] },
  grid:   { label: "Grid of holes",   icon: "⁘", keys: [["cols", "Across", 2], ["rows", "Up", 2], ["px", "Pitch across", 40], ["py", "Pitch up", 40], ["d", "Ø", 8]] },
  edge:   { label: "Holes in a line", icon: "⋯", keys: [["n", "Count", 3], ["pitch", "Pitch", 30], ["d", "Ø", 8], ["rot", "Angle °", 0]] },
  rect:   { label: "Rectangle cut-out", icon: "▭", keys: [["w", "Width", 40], ["h", "Height", 20], ["r", "Corner radius", 0], ["rot", "Angle °", 0]] },
  shape:  { label: "Shape cut-out",   icon: "△", keys: [["shape", "Shape", "triangle"], ["w", "Width", 40], ["h", "Height", 30], ["rot", "Angle °", 0]] },
  text:   { label: "Text",            icon: "T", keys: [["text", "Text", "TEXT"], ["h", "Letter height", 10]], op: "score" },
  etch:   { label: "Etch line",       icon: "╱", keys: [["len", "Length", 40], ["rot", "Angle °", 0]], op: "score" },
  corner: { label: "Corners",         icon: "◜", keys: [["r", "Radius", 10]] },
};
export const CUTOUT_SHAPES = ["triangle", "hexagon", "diamond"];
export const FEATURE_OPS = [["cut", "Cut"], ["score", "Etch"], ["mark", "Mark"]];
const STRING_KEYS = new Set(["shape", "text", "op", "from"]);
const INT_KEYS = new Set(["n", "cols", "rows"]);
const NUM = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
// store what was typed, only trimming float noise (100.00000000001 -> 100)
export const exact = (v) => Math.round(Number(v) * 1e6) / 1e6;

export function newFeature(kind, id, W, H) {
  const k = FEATURE_KINDS[kind]; if (!k) return null;
  const f = { id, k: kind, x: exact(W / 2), y: exact(H / 2) };
  for (const [key, , d] of k.keys) f[key] = d;
  if (k.op) f.op = k.op;
  return f;
}

export function sanitizeFeature(f) {
  if (!f || !FEATURE_KINDS[f.k]) return null;
  const k = FEATURE_KINDS[f.k];
  const out = { id: Math.round(NUM(f.id, 0)), k: f.k, x: exact(NUM(f.x, 0)), y: exact(NUM(f.y, 0)) };
  if (!(out.id > 0)) return null;
  for (const [key, , d] of k.keys) out[key] = STRING_KEYS.has(key) ? String(f[key] ?? d).slice(0, 80) : clampKey(key, NUM(f[key], d));
  if (f.op === "score" || f.op === "mark" || f.op === "cut") out.op = f.op;
  if (f.hide) out.hide = true;
  if (f.from === "centre") out.from = "centre";
  if (Number(f.link) > 0) out.link = Math.round(Number(f.link));
  return out;
}

function clampKey(key, v) {
  if (INT_KEYS.has(key)) return Math.max(1, Math.min(64, Math.round(v)));
  return exact(v);
}

// set one field the way a typed value arrives; returns false when the value can't be used
export function setFeatureValue(f, key, raw) {
  const k = FEATURE_KINDS[f.k]; if (!k) return false;
  if (key === "op") { if (!["cut", "score", "mark"].includes(raw)) return false; f.op = raw; return true; }
  if (STRING_KEYS.has(key)) { if (key === "shape" && !CUTOUT_SHAPES.includes(raw)) return false; f[key] = String(raw).slice(0, 80); return true; }
  const v = Number(raw);
  if (!Number.isFinite(v)) return false;
  if (!(key === "x" || key === "y" || k.keys.some(([kk]) => kk === key))) return false;
  if (["d", "len", "wid", "w", "h", "pcd", "pitch", "px", "py"].includes(key) && !(v > 0)) return false;
  if (key === "r" && v < 0) return false;
  f[key] = clampKey(key, v);
  return true;
}

// ---------------------------------------------------------------- geometry (part frame: bottom-left corner = 0,0)
const rad = (deg) => (deg * Math.PI) / 180;
function cs(deg) {                                   // exact at quarter turns, so 90° stays exact
  const q = ((deg % 360) + 360) % 360;
  if (q === 0) return [1, 0]; if (q === 90) return [0, 1]; if (q === 180) return [-1, 0]; if (q === 270) return [0, -1];
  return [Math.cos(rad(deg)), Math.sin(rad(deg))];
}
const turn = (pts, deg, cx, cy) => { const [c, s] = cs(deg); return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]); };
// a circle with a multiple of 4 segments, so its box is centred exactly on the typed centre
function segs(r, sweep = 2 * Math.PI) {
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - TOL / Math.max(r, TOL))));
  return Math.max(2, Math.ceil(sweep / Math.max(step, 0.01)));
}
export function circleAt(cx, cy, r) {
  const n = Math.max(8, Math.ceil(segs(r) / 4) * 4), pts = [];
  for (let i = 0; i < n; i++) { const [c, s] = cs((360 * i) / n); pts.push([cx + r * c, cy + r * s]); }
  return { pts, closed: true, circle: { cx, cy, r } };
}
function slotPts(len, wid) {
  const r = wid / 2, a = Math.max(0, len / 2 - r), n = Math.max(2, Math.ceil(segs(r, Math.PI) / 2) * 2), pts = [];
  for (let i = 0; i <= n; i++) { const [c, s] = cs(-90 + (180 * i) / n); pts.push([a + r * c, r * s]); }
  for (let i = 0; i <= n; i++) { const [c, s] = cs(90 + (180 * i) / n); pts.push([-a + r * c, r * s]); }
  return pts;
}
function roundRectPts(w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const pts = [], n = Math.max(1, Math.ceil(segs(r, Math.PI / 2)));
  const corners = [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= n; i++) { const [c, s] = cs(a0 + (90 * i) / n); pts.push([cx + r * c, cy + r * s]); }
  return pts;
}
function shapePts(shape, w, h) {
  if (shape === "hexagon") return [[-w / 2, 0], [-w / 4, -h / 2], [w / 4, -h / 2], [w / 2, 0], [w / 4, h / 2], [-w / 4, h / 2]];
  if (shape === "diamond") return [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]];
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [0, h / 2]];   // triangle, point up, box centred on the typed centre
}
// hole centres of a pattern feature (relative to the part corner)
export function holeCentres(f) {
  if (f.k === "hole") return [[f.x, f.y]];
  if (f.k === "bolt") {
    const out = [], R = f.pcd / 2;
    for (let i = 0; i < f.n; i++) { const [c, s] = cs(f.ang + (360 * i) / f.n); out.push([f.x + R * c, f.y + R * s]); }
    return out;
  }
  if (f.k === "grid") {
    const out = [];
    for (let j = 0; j < f.rows; j++) for (let i = 0; i < f.cols; i++) out.push([f.x + (i - (f.cols - 1) / 2) * f.px, f.y + (j - (f.rows - 1) / 2) * f.py]);
    return out;
  }
  if (f.k === "edge") {
    const [c, s] = cs(f.rot), out = [];
    for (let i = 0; i < f.n; i++) { const t = (i - (f.n - 1) / 2) * f.pitch; out.push([f.x + t * c, f.y + t * s]); }
    return out;
  }
  return [];
}
export const isHoleFeature = (f) => ["hole", "bolt", "grid", "edge"].includes(f.k);

// the contours one feature cuts / etches, in the part frame
export function featureContours(f) {
  const op = f.op && f.op !== "cut" ? f.op : null;
  const tag = (c) => (op ? { ...c, op } : c);
  if (isHoleFeature(f)) return holeCentres(f).map(([x, y]) => tag(circleAt(x, y, f.d / 2)));
  if (f.k === "slot") return [tag({ pts: turn(slotPts(f.len, f.wid), f.rot, f.x, f.y), closed: true })];
  if (f.k === "rect") return [tag({ pts: turn(roundRectPts(f.w, f.h, f.r), f.rot, f.x, f.y), closed: true })];
  if (f.k === "shape") return [tag({ pts: turn(shapePts(f.shape, f.w, f.h), f.rot, f.x, f.y), closed: true })];
  if (f.k === "etch") return [{ pts: turn([[-f.len / 2, 0], [f.len / 2, 0]], f.rot, f.x, f.y), closed: false, op: op || "score" }];
  if (f.k === "text") {
    let t; try { t = textToContours(String(f.text || ""), { size: f.h }); } catch (e) { return []; }
    const dx = f.x - t.width / 2, dy = f.y - t.height / 2;
    return t.contours.map((c) => tag({ pts: c.pts.map(([x, y]) => [x + dx, y + dy]), closed: true }));
  }
  return [];                                   // corner: lives on the outline (it.p.r), nothing extra to cut
}

// every shown feature, flattened, shifted by (ox, oy) = the outline's bottom-left corner in the shape's own frame
export function flattenFeatures(feats, ox = 0, oy = 0) {
  const out = [];
  for (const f of feats || []) {
    if (f.hide) continue;
    for (const c of featureContours(f)) out.push({ ...c, pts: c.pts.map(([x, y]) => [x + ox, y + oy]), circle: c.circle ? { ...c.circle, cx: c.circle.cx + ox, cy: c.circle.cy + oy } : undefined, feat: f.id });
  }
  return out.map((c) => { if (!c.circle) delete c.circle; return c; });
}

// ---------------------------------------------------------------- live checks
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function minDist(A, B) {
  let m = Infinity;
  for (const p of A) for (let j = 0; j < B.length; j++) m = Math.min(m, segDist(p, B[j], B[(j + 1) % B.length]));
  return m;
}
const overlaps = (A, B) => polysCross(A, B) || pointInPoly(A[0], B) || pointInPoly(B[0], A);

// outline = the part's outer contour in the part frame (bottom-left = 0,0). Returns Map id -> [messages].
export function featureIssues(feats, outline, thickness = 3) {
  const t = Number.isFinite(thickness) && thickness > 0 ? thickness : 3;
  const res = new Map(), add = (id, m) => { if (!res.has(id)) res.set(id, []); if (!res.get(id).includes(m)) res.get(id).push(m); };
  const live = (feats || []).filter((f) => !f.hide && f.k !== "corner");
  const shapes = live.map((f) => ({ f, cs: featureContours(f).filter((c) => c.closed !== false) }));
  const gap = Math.max(1, t);
  for (const { f, cs: fc } of shapes) {
    if (isHoleFeature(f) && f.d < 1.5 * t) add(f.id, `Hole Ø${f.d} is smaller than 1.5 × thickness (${exact(1.5 * t)} mm), so it may not cut cleanly.`);
    if (!outline || !outline.length) continue;
    const allPts = featureContours(f).flatMap((c) => c.pts);
    if (allPts.some((p) => !pointInPoly(p, outline)) || fc.some((c) => polysCross(c.pts, outline))) add(f.id, "Part of this is outside the part.");
    else if (fc.length && fc.some((c) => (!c.op) && minDist(c.pts, outline) < gap)) add(f.id, `Too close to the edge (keep at least ${exact(gap)} mm of metal).`);
  }
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const A = shapes[i], B = shapes[j];
    if (A.f.op && A.f.op !== "cut") continue; if (B.f.op && B.f.op !== "cut") continue;
    if (A.cs.some((a) => B.cs.some((b) => overlaps(a.pts, b.pts)))) { add(A.f.id, "Overlaps another feature."); add(B.f.id, "Overlaps another feature."); }
  }
  // holes within one pattern running into each other
  for (const { f, cs: fc } of shapes) if (fc.length > 1 && isHoleFeature(f)) {
    const cc = holeCentres(f);
    if (cc.some((p, i) => cc.some((q, j) => j > i && Math.hypot(p[0] - q[0], p[1] - q[1]) < f.d))) add(f.id, "Holes in this pattern overlap.");
  }
  return res;
}

// ---------------------------------------------------------------- one-line summary for the list row
export function featureSummary(f) {
  const n = (v) => String(exact(v));
  switch (f.k) {
    case "hole": return `Ø${n(f.d)} at ${n(f.x)}, ${n(f.y)}`;
    case "slot": return `${n(f.len)} × ${n(f.wid)}${f.rot ? `, ${n(f.rot)}°` : ""} at ${n(f.x)}, ${n(f.y)}`;
    case "bolt": return `${f.n} × Ø${n(f.d)} on ${n(f.pcd)} PCD${f.ang ? ` at ${n(f.ang)}°` : ""}`;
    case "grid": return `${f.cols} × ${f.rows} × Ø${n(f.d)}, pitch ${n(f.px)} × ${n(f.py)}`;
    case "edge": return `${f.n} × Ø${n(f.d)}, pitch ${n(f.pitch)}`;
    case "rect": return `${n(f.w)} × ${n(f.h)}${f.r ? ` R${n(f.r)}` : ""} at ${n(f.x)}, ${n(f.y)}`;
    case "shape": return `${f.shape} ${n(f.w)} × ${n(f.h)} at ${n(f.x)}, ${n(f.y)}`;
    case "text": return `"${f.text}" ${n(f.h)} high`;
    case "etch": return `${n(f.len)} long${f.rot ? `, ${n(f.rot)}°` : ""}`;
    case "corner": return `R${n(f.r)}`;
    default: return "";
  }
}

// ---------------------------------------------------------------- duplicate / mirror / pattern
const mirAng = (a) => exact(((180 - a) % 360 + 360) % 360);
// mirror about the part's vertical centre line (W = part width)
export function mirrored(src, W) {
  const m = { ...src, x: exact(W - src.x) };
  if ("rot" in src) m.rot = mirAng(src.rot);
  if ("ang" in src) m.ang = mirAng(src.ang);
  return m;
}
// after editing f, bring its linked partners into line (a mirror twin follows its source and vice versa)
export function syncLinks(feats, f, W) {
  const src = f.link ? feats.find((x) => x.id === f.link) : f;
  if (!src) return;
  if (f !== src) Object.assign(src, { ...mirrored(f, W), id: src.id, link: src.link, hide: src.hide });
  if (src.hide === undefined) delete src.hide;
  if (src.link === undefined) delete src.link;
  for (const tw of feats) if (tw.link === src.id && tw !== src) {
    const hide = tw.hide;
    Object.assign(tw, { ...mirrored(src, W), id: tw.id, link: src.id });
    if (hide) tw.hide = true; else delete tw.hide;
  }
}
// a single hole becomes a 2 × 1 grid on the same centre; other kinds are copied 20 mm along
export function patternOf(f, id) {
  if (f.k === "hole") return { id, k: "grid", x: f.x, y: f.y, cols: 2, rows: 1, px: exact(Math.max(20, f.d * 2)), py: exact(Math.max(20, f.d * 2)), d: f.d, ...(f.op ? { op: f.op } : {}) };
  return null;
}

// ---------------------------------------------------------------- hooks the sketch calls (kept here, plan 8.6)
// a feature's own contour was dragged on the canvas: move the whole feature (its handle is its centre)
export function moveFeatureBy(it, fid, dx, dy, W) {
  const f = (it.feats || []).find((x) => x.id === fid); if (!f) return false;
  f.x = exact(f.x + dx); f.y = exact(f.y + dy);
  syncLinks(it.feats, f, W);
  return true;
}
// picking another version of a shape keeps every value the new version also has (3D P1-1), unless the version sets it
export function keepMatching(newP, oldP, specP = {}) {
  for (const k of Object.keys(newP)) if (!(k in specP) && oldP && Number.isFinite(Number(oldP[k])) && k in oldP) newP[k] = Number(oldP[k]);
  return newP;
}

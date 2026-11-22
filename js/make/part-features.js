// r15 Round 2: features on a part (holes, slots, patterns, cut-outs, text, etch lines, corners).
// A feature is a small record kept on the sketch item (it.feats) and measured from the part's bottom-left corner,
// exactly as typed. Before anything is cut, features are flattened to ordinary contours (sketch-geom contoursOf),
// so cam.js and the G-code never see them. A part with no features is cut exactly as before.
import { smallHoleRule, drillMark } from "./holerule.js";
import { TOL, bulgeMidpoint, expandContour, pointInPoly, polysCross, signedArea } from "../core/geom.js";
import { textToContours } from "./textshape.js";

export const FEATURE_KINDS = {
  hole:   { label: "Hole",            icon: "○", keys: [["d", "Ø", 10]] },
  slot:   { label: "Slot",            icon: "⊂⊃", keys: [["len", "Length", 30], ["wid", "Width", 8.5], ["rot", "Angle °", 0]] },
  bolt:   { label: "Bolt circle",     icon: "⊚", keys: [["n", "Count", 4], ["d", "Ø", 6.5], ["pcd", "Circle Ø (PCD)", 60], ["ang", "Start angle °", 0]] },
  grid:   { label: "Grid of holes",   icon: "⁘", keys: [["cols", "Across", 2], ["rows", "Up", 2], ["px", "Pitch across", 40], ["py", "Pitch up", 40], ["d", "Ø", 8]] },
  edge:   { label: "Holes in a line", icon: "⋯", keys: [["n", "Count", 3], ["pitch", "Pitch", 30], ["d", "Ø", 8], ["rot", "Angle °", 0]] },
  arc:    { label: "Holes along a curve", icon: "◠", keys: [["n", "Count", 5], ["d", "Ø", 6], ["r", "Curve radius", 40], ["a0", "From °", 0], ["a1", "To °", 180]] },   // r15 10.3
  rect:   { label: "Rectangle cut-out", icon: "▭", keys: [["w", "Width", 40], ["h", "Height", 20], ["r", "Corner radius", 0], ["rot", "Angle °", 0]] },
  shape:  { label: "Shape cut-out",   icon: "△", keys: [["shape", "Shape", "triangle"], ["w", "Width", 40], ["h", "Height", 30], ["rot", "Angle °", 0]] },
  text:   { label: "Text",            icon: "T", keys: [["text", "Text", "TEXT"], ["h", "Letter height", 10]], op: "score" },
  etch:   { label: "Etch line",       icon: "╱", keys: [["len", "Length", 40], ["rot", "Angle °", 0]], op: "score" },
  corner: { label: "Corners",         icon: "◜", keys: [["r", "Radius", 10]] },
};
export const CUTOUT_SHAPES = ["triangle", "hexagon", "diamond"];
export const CORNER_KINDS = ["round", "chamfer", "relief"];
export const FEATURE_OPS = [["cut", "Cut"], ["score", "Etch"], ["mark", "Mark"]];
// r15 6.3: a hole (or pattern of holes) can also be marked for drilling: an etched cross at each centre, not cut
export const featureOps = (f) => (f && isHoleFeature(f) ? [...FEATURE_OPS, ["drill", "Mark for drilling"]] : FEATURE_OPS);
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
  if (f.op === "score" || f.op === "mark" || f.op === "cut" || (f.op === "drill" && isHoleFeature(f))) out.op = f.op;
  if (f.hide) out.hide = true;
  if (f.from === "centre") out.from = "centre";
  if (f.k === "hole" && f.arcs && Number(f.arcs.n) >= 2) out.arcs = { n: Math.max(2, Math.min(64, Math.round(Number(f.arcs.n)))), a0: exact(NUM(f.arcs.a0, 0)), b: Math.abs(NUM(f.arcs.b, 0)), cw: !!f.arcs.cw };
  if (Number(f.link) > 0) out.link = Math.round(Number(f.link));
  if (f.pat && PATTERNABLE.has(f.k)) { const p = sanitizePattern(f.pat); if (p) out.pat = p; }
  if (f.k === "corner" && f.at != null) {             // a Corners row that shapes the outline itself (plan 2.12)
    out.kind = CORNER_KINDS.includes(f.kind) ? f.kind : "round";
    out.at = f.at === "all" || f.at === "inside" ? f.at : Array.isArray(f.at) ? [...new Set(f.at.map((v) => Math.round(Number(v))).filter((v) => v >= 0 && v < 512))].sort((a, b) => a - b) : "all";
    if (out.kind === "chamfer") out.ang = exact(Math.max(1, Math.min(89, NUM(f.ang, 45))));
  }
  if (f.k === "shape") {
    const pts = drawnPts(f.pts);
    if (f.shape === "drawn" && pts) out.pts = pts;
    else if (!CUTOUT_SHAPES.includes(out.shape)) out.shape = "triangle";
  }
  return out;
}

function clampKey(key, v) {
  if (INT_KEYS.has(key)) return Math.max(1, Math.min(64, Math.round(v)));
  return exact(v);
}

// set one field the way a typed value arrives; returns false when the value can't be used
export function setFeatureValue(f, key, raw, fr) {
  const k = FEATURE_KINDS[f.k]; if (!k) return false;
  if (key === "pt") {                                   // pattern type: none / grid / circle / line (fr = the part's W, H for a circle's centre)
    if (raw === "none") { delete f.pat; return true; }
    if (!PATTERNABLE.has(f.k) || !["grid", "circle", "line"].includes(raw)) return false;
    const old = f.pat || {}, b = singleBox(f), step = exact(Math.ceil(Math.max(b[2] - b[0], b[3] - b[1]) + 10));
    f.pat = sanitizePattern(raw === "grid" ? { t: "grid", cols: old.cols || 2, rows: old.rows || 1, px: old.px || step, py: old.py || step }
      : raw === "circle" ? { t: "circle", n: old.n || 4, cx: fr ? fr.W / 2 : 0, cy: fr ? fr.H / 2 : 0 }
      : { t: "line", n: old.n || 3, pitch: old.pitch || step, ang: 0 });
    return true;
  }
  if (/^p(cols|rows|px|py|n|cx|cy|pitch|ang)$/.test(key)) {
    if (!f.pat) return false;
    const pk = key.slice(1), v = Number(raw);
    if (!Number.isFinite(v) || !(pk in f.pat)) return false;
    if (PAT_INT.has(pk) && !(v >= 1)) return false;
    if ((pk === "px" || pk === "py" || pk === "pitch") && v === 0) return false;
    f.pat[pk] = PAT_INT.has(pk) ? Math.max(1, Math.min(64, Math.round(v))) : exact(v);
    return true;
  }
  if (key === "op") { if (!["cut", "score", "mark"].includes(raw) && !(raw === "drill" && isHoleFeature(f))) return false; f.op = raw; return true; }
  if (f.k === "corner" && f.at != null) {
    if (key === "kind") { if (!CORNER_KINDS.includes(raw)) return false; f.kind = raw; if (raw === "chamfer" && !(f.ang > 0)) f.ang = 45; if (raw !== "chamfer") delete f.ang; return true; }
    if (key === "at") { if (raw !== "all" && raw !== "inside") return false; f.at = raw; return true; }
    if (key === "ang") { const a = Number(raw); if (!(a >= 1 && a <= 89)) return false; f.ang = exact(a); return true; }
  }
  if (STRING_KEYS.has(key)) { if (key === "shape" && !CUTOUT_SHAPES.includes(raw) && !(raw === "drawn" && f.pts)) return false; f[key] = String(raw).slice(0, 80); return true; }
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
// a hole that came from a drawing is cut exactly as the drawing drew it (the same arcs from the same start point, as a
// polyline like any other drawn outline), so opening a DXF never changes its cut, pierce point or order (plan 2.16/2.17)
function drawnCircle(cx, cy, r, { n, a0, b: b0, cw }) {
  const pts = [], b = (b0 > 0 ? b0 : Math.tan(Math.PI / (2 * n))) * (cw ? -1 : 1);   // the drawing's own bulge value
  for (let i = 0; i < n; i++) { const [c, s2] = cs(a0 + ((cw ? -360 : 360) * i) / n); pts.push([cx + r * c, cy + r * s2]); }
  return expandContour({ pts, closed: true, bulges: pts.map(() => b) });
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
// a drawn cut-out (from the Cut out tool): its points relative to its box centre, at the size it was drawn
function drawnPts(pts) {
  if (!Array.isArray(pts) || pts.length < 3 || pts.length > 5000) return null;
  const out = pts.map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [NaN, NaN]));
  return out.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) ? out : null;
}
function boxOf(pts) { return pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]); }
function shapePts(shape, w, h, drawn) {
  if (shape === "drawn" && drawn) {                  // scaled to the typed width / height (unchanged size = the exact drawn points)
    const b = boxOf(drawn), W0 = b[2] - b[0], H0 = b[3] - b[1];
    const sx = W0 > 0 && Math.abs(w - W0) > 1e-6 ? w / W0 : 1, sy = H0 > 0 && Math.abs(h - H0) > 1e-6 ? h / H0 : 1;
    return drawn.map(([x, y]) => [x * sx, y * sy]);
  }
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
  if (f.k === "arc") {                              // r15 10.3: evenly from a0 to a1 round (x, y); a full turn has no doubled hole
    const span = f.a1 - f.a0, full = Math.abs(Math.abs(span) - 360) < 1e-6 || Math.abs(span) > 360, out = [];
    for (let i = 0; i < f.n; i++) {
      const a = full ? f.a0 + (360 * i) / f.n : f.a0 + (f.n === 1 ? span / 2 : (span * i) / (f.n - 1));
      const [c, s] = cs(a); out.push([f.x + f.r * c, f.y + f.r * s]);
    }
    return out;
  }
  if (f.k === "edge") {
    const [c, s] = cs(f.rot), out = [];
    for (let i = 0; i < f.n; i++) { const t = (i - (f.n - 1) / 2) * f.pitch; out.push([f.x + t * c, f.y + t * s]); }
    return out;
  }
  return [];
}
export const isHoleFeature = (f) => ["hole", "bolt", "grid", "edge", "arc"].includes(f.k);

// r15 10.3: fit "Holes along a curve" to an outline's longest curved run (a flattened arc: many short edges turning the
// same way, each by less than 20°). The holes sit `inset` mm inside that edge (at least Ø + 3 mm of metal). null = no curve.
export function fitArcToOutline(pts, d = 6) {
  const n = pts ? pts.length : 0;
  if (n < 6) return null;
  const turn = (i) => {
    const A = pts[(i - 1 + n) % n], P = pts[i], Q = pts[(i + 1) % n];
    const ax = P[0] - A[0], ay = P[1] - A[1], bx = Q[0] - P[0], by = Q[1] - P[1];
    return Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180 / Math.PI;
  };
  const T = pts.map((_, i) => turn(i));
  const curvy = (i, sg) => Math.abs(T[i]) > 0.2 && Math.abs(T[i]) < 20 && Math.sign(T[i]) === sg;
  let best = null;
  for (let s = 0; s < n; s++) {
    const sg = Math.sign(T[s]);
    if (!curvy(s, sg) || curvy((s - 1 + n) % n, sg)) continue;          // start of a run
    let len = 0; while (len < n && curvy((s + len) % n, sg)) len++;
    if (len >= 3 && (!best || len > best.len)) best = { s, len, sg };
  }
  if (!best && T.every((t, i) => curvy(i, Math.sign(T[0])))) best = { s: 0, len: n, sg: Math.sign(T[0]) };
  if (!best) return null;
  const full = best.len >= n;
  const at = (k) => pts[((best.s - 1 + k) % n + n) % n];                 // the run spans the points either side of its turning vertices
  const p1 = at(0), p3 = at(full ? Math.floor((2 * n) / 3) : best.len + 1), p2 = at(full ? Math.floor(n / 3) : Math.round((best.len + 1) / 2));
  const ax = p1[0], ay = p1[1], bx = p2[0], by = p2[1], cx = p3[0], cy = p3[1];
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-9) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
  const R = Math.hypot(ax - ux, ay - uy);
  const inset = exact(Math.max(Number(d) + 3, Math.round(R * 0.15)));
  if (!(R - inset > d)) return null;
  const ang = (p) => Math.atan2(p[1] - uy, p[0] - ux) * 180 / Math.PI;
  let a0 = ang(p1), a1 = ang(p3);
  if (full) { a0 = 0; a1 = 360; }
  else if (best.sg > 0) { while (a1 <= a0) a1 += 360; }                   // the run turns anticlockwise: go a0 -> a1 up
  else { while (a1 >= a0) a1 -= 360; }
  const r2 = (v) => Math.round(v * 100) / 100;
  return { x: r2(ux), y: r2(uy), r: r2(R - inset), a0: r2(a0), a1: r2(a1), inset };
}

// the contours one feature cuts / etches, in the part frame
// ---------------------------------------------------------------- Pattern on any feature (plan 2.6): copies of the one row
// pat = { t: "grid", cols, rows, px, py } (copies step from the original) | { t: "circle", n, cx, cy } (turned round a centre,
// part frame) | { t: "line", n, pitch, ang }. The original always stays where it was typed; holes use their own pattern kinds.
export const PATTERNABLE = new Set(["slot", "rect", "shape", "text", "etch"]);
const PAT_INT = new Set(["cols", "rows", "n"]);
export function sanitizePattern(p) {
  if (!p || !["grid", "circle", "line"].includes(p.t)) return null;
  const I = (v, d) => Math.max(1, Math.min(64, Math.round(NUM(v, d)))), X = (v, d) => exact(NUM(v, d));
  if (p.t === "grid") return { t: "grid", cols: I(p.cols, 2), rows: I(p.rows, 1), px: X(p.px, 40), py: X(p.py, 40) };
  if (p.t === "circle") return { t: "circle", n: I(p.n, 4), cx: X(p.cx, 0), cy: X(p.cy, 0) };
  return { t: "line", n: I(p.n, 3), pitch: X(p.pitch, 30), ang: X(p.ang, 0) };
}
// [dx, dy, turn°] of each copy (copy 0 = the original), turn about (cx, cy)
function patternMoves(p) {
  const out = [];
  if (p.t === "grid") { for (let j = 0; j < p.rows; j++) for (let i = 0; i < p.cols; i++) out.push([i * p.px, j * p.py, 0]); }
  else if (p.t === "line") { const [c, s] = cs(p.ang); for (let i = 0; i < p.n; i++) out.push([i * p.pitch * c, i * p.pitch * s, 0]); }
  else for (let i = 0; i < p.n; i++) out.push([0, 0, (360 * i) / p.n]);
  return out;
}
function moveContour(c, [dx, dy, a], p) {
  if (!a) return { ...c, pts: c.pts.map(([x, y]) => [x + dx, y + dy]) };
  const [co, si] = cs(a), R = ([x, y]) => [p.cx + (x - p.cx) * co - (y - p.cy) * si, p.cy + (x - p.cx) * si + (y - p.cy) * co];
  return { ...c, pts: c.pts.map(R) };
}
// the contours of each copy, grouped (used by the live checks to find copies that overlap)
export function patternCopies(f) {
  const one = singleContours(f);
  if (!f.pat || !PATTERNABLE.has(f.k)) return [one];
  return patternMoves(f.pat).map((m) => one.map((c) => moveContour(c, m, f.pat)));
}
export function featureContours(f) { return patternCopies(f).flat(); }
function singleContours(f) {
  if (f.op === "drill" && isHoleFeature(f)) return holeCentres(f).flatMap(([x, y]) => drillMark(x, y, f.d));   // r15 6.3
  const op = f.op && f.op !== "cut" ? f.op : null;
  const tag = (c) => (op ? { ...c, op } : c);
  if (f.k === "hole" && f.arcs) return [tag(drawnCircle(f.x, f.y, f.d / 2, f.arcs))];
  if (isHoleFeature(f)) return holeCentres(f).map(([x, y]) => tag(circleAt(x, y, f.d / 2)));
  if (f.k === "slot") return [tag({ pts: turn(slotPts(f.len, f.wid), f.rot, f.x, f.y), closed: true })];
  if (f.k === "rect") return [tag({ pts: turn(roundRectPts(f.w, f.h, f.r), f.rot, f.x, f.y), closed: true })];
  if (f.k === "shape") return [tag({ pts: turn(shapePts(f.shape, f.w, f.h, f.pts), f.rot, f.x, f.y), closed: true })];
  if (f.k === "etch") return [{ pts: turn([[-f.len / 2, 0], [f.len / 2, 0]], f.rot, f.x, f.y), closed: false, op: op || "score" }];
  if (f.k === "text") {
    let t; try { t = textToContours(String(f.text || ""), { size: f.h }); } catch (e) { return []; }
    const dx = f.x - t.width / 2, dy = f.y - t.height / 2;
    return t.contours.map((c) => tag({ pts: c.pts.map(([x, y]) => [x + dx, y + dy]), closed: true }));
  }
  return [];                                   // corner: shapes the outline itself (it.p.r, or applyCorners), nothing extra to cut
}

// ---------------------------------------------------------------- Corners rows on any outline (plan 2.12)
// The sharp corners of an outline polyline, in order from its first point: the k-th one is corner k (stable when sizes change).
export function cornerIndices(pts) {
  const n = pts.length, out = [], o = signedArea(pts) > 0 ? 1 : -1;
  if (n < 3) return out;
  for (let i = 0; i < n; i++) {
    const A = pts[(i - 1 + n) % n], P = pts[i], Q = pts[(i + 1) % n];
    const ax = P[0] - A[0], ay = P[1] - A[1], bx = Q[0] - P[0], by = Q[1] - P[1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 0.05 || lb < 0.05) continue;
    const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    if (Math.abs(turn) < (20 * Math.PI) / 180 || Math.abs(turn) > Math.PI - 1e-3) continue;   // arc segments are not corners
    out.push({ i, inside: turn * o < 0 });
  }
  return out;
}
export const cornerRows = (feats) => (feats || []).filter((f) => f.k === "corner" && f.at != null && !f.hide && f.r > 0);
const pickedBy = (f, k, c) => f.at === "all" || (f.at === "inside" ? c.inside : Array.isArray(f.at) && f.at.includes(k));
// the outline with its Corners rows applied (later rows win at a corner they share); returns how many corners took it
export function applyCorners(c, rows) {
  const pts = c.pts, n = pts.length, list = cornerIndices(pts), spec = new Map();
  list.forEach((cn, k) => { for (const f of rows) if (pickedBy(f, k, cn) && !(f.kind === "relief" && !cn.inside)) spec.set(cn.i, { f, cn }); });
  const cut = new Map();                                // vertex -> [trim back along the edge in, trim along the edge out, bulge]
  for (const [i, { f, cn }] of spec) {
    const A = pts[(i - 1 + n) % n], P = pts[i], Q = pts[(i + 1) % n];
    const v1 = [A[0] - P[0], A[1] - P[1]], v2 = [Q[0] - P[0], Q[1] - P[1]], l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))));
    const s = Math.sign(-v1[0] * v2[1] + v1[1] * v2[0]) || 1;                 // which way the outline turns here
    let d1, d2, b = 0;
    if (f.kind === "chamfer") { const phi = rad(f.ang || 45), den = Math.sin(Math.PI - ang - phi); if (!(den > 1e-6)) continue; d1 = f.r; d2 = (f.r * Math.sin(phi)) / den; }
    else if (f.kind === "relief") {
      d1 = d2 = f.r / 2;
      const T1 = [P[0] + (v1[0] / l1) * d1, P[1] + (v1[1] / l1) * d1], T2 = [P[0] + (v2[0] / l2) * d2, P[1] + (v2[1] / l2) * d2];
      const bis = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2], bl = Math.hypot(...bis); if (!(bl > 1e-9)) continue;
      const mid = [P[0] - (bis[0] / bl) * d1, P[1] - (bis[1] / bl) * d1], mag = Math.tan((2 * Math.PI - ang) / 4);
      const off = (bb) => { const m = bulgeMidpoint(T1, T2, bb); return Math.hypot(m[0] - mid[0], m[1] - mid[1]); };
      b = off(mag) <= off(-mag) ? mag : -mag;
    } else { d1 = d2 = f.r / Math.tan(ang / 2); b = s * Math.tan((Math.PI - ang) / 4); }
    if (!(d1 > 0.05 && d2 > 0.05 && d1 < l1 - 0.05 && d2 < l2 - 0.05)) continue;
    cut.set(i, [d1, d2, b, cn]);
  }
  // two trims on one edge must not meet
  for (const i of [...cut.keys()]) { const j = (i + 1) % n, a = cut.get(i), z = cut.get(j); if (a && z && a[1] + z[0] > Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) - 0.05) cut.delete(j); }
  if (!cut.size) return { c, done: 0, asked: spec.size };
  const P2 = [], B2 = [];
  for (let i = 0; i < n; i++) {
    const t = cut.get(i), P = pts[i];
    if (!t) { P2.push(P); B2.push(0); continue; }
    const A = pts[(i - 1 + n) % n], Q = pts[(i + 1) % n], l1 = Math.hypot(A[0] - P[0], A[1] - P[1]), l2 = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    P2.push([P[0] + ((A[0] - P[0]) / l1) * t[0], P[1] + ((A[1] - P[1]) / l1) * t[0]]); B2.push(t[2]);
    P2.push([P[0] + ((Q[0] - P[0]) / l2) * t[1], P[1] + ((Q[1] - P[1]) / l2) * t[1]]); B2.push(0);
  }
  const out = expandContour({ pts: P2, bulges: B2, closed: true });
  return { c: { ...c, pts: out.pts }, done: cut.size, asked: spec.size };
}

// every shown feature, flattened, shifted by (ox, oy) = the outline's bottom-left corner in the shape's own frame
function singleBox(f) { const pts = singleContours(f).flatMap((c) => c.pts); return pts.length ? boxOf(pts) : [0, 0, 0, 0]; }
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
  const gap = 1.5 * t;                                 // plan 2.10: keep 1.5 x thickness of metal to the outline
  for (const { f, cs: fc } of shapes) {
    const small = isHoleFeature(f) && f.op !== "drill" ? smallHoleRule(f.d, t) : null;   // r15 6.3: the one small-hole rule
    if (small) add(f.id, small.text);
    if (!outline || !outline.length) continue;
    const allPts = featureContours(f).flatMap((c) => c.pts);
    if (allPts.some((p) => !pointInPoly(p, outline)) || fc.some((c) => polysCross(c.pts, outline))) add(f.id, "Part of this is outside the part.");
    else if (fc.length && fc.some((c) => (!c.op) && minDist(c.pts, outline) < gap)) add(f.id, `Too close to the edge (keep at least ${exact(gap)} mm of metal).`);
  }
  for (const { f } of shapes) if (f.pat && PATTERNABLE.has(f.k)) {
    const cp = patternCopies(f).map((g) => g.filter((c) => c.closed !== false));
    if (cp.some((a, i) => cp.some((b, j) => j > i && a.some((x) => b.some((y) => overlaps(x.pts, y.pts)))))) add(f.id, "Copies in this pattern overlap.");
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
  const base = featureSummaryOne(f), p = f.pat && PATTERNABLE.has(f.k) ? f.pat : null, n = (v) => String(exact(v));
  if (!p) return base;
  if (p.t === "grid") return `${base} · ${p.cols} × ${p.rows}, pitch ${n(p.px)} × ${n(p.py)}`;
  if (p.t === "circle") return `${base} · ${p.n} round ${n(p.cx)}, ${n(p.cy)}`;
  return `${base} · ${p.n} in a line, pitch ${n(p.pitch)}${p.ang ? ` at ${n(p.ang)}°` : ""}`;
}
function featureSummaryOne(f) {
  const n = (v) => String(exact(v));
  switch (f.k) {
    case "hole": return `Ø${n(f.d)} at ${n(f.x)}, ${n(f.y)}`;
    case "slot": return `${n(f.len)} × ${n(f.wid)}${f.rot ? `, ${n(f.rot)}°` : ""} at ${n(f.x)}, ${n(f.y)}`;
    case "bolt": return `${f.n} × Ø${n(f.d)} on ${n(f.pcd)} PCD${f.ang ? ` at ${n(f.ang)}°` : ""}`;
    case "grid": return `${f.cols} × ${f.rows} × Ø${n(f.d)}, pitch ${n(f.px)} × ${n(f.py)}`;
    case "edge": return `${f.n} × Ø${n(f.d)}, pitch ${n(f.pitch)}`;
    case "arc": return `${f.n} × Ø${n(f.d)} on R${n(f.r)}`;
    case "rect": return `${n(f.w)} × ${n(f.h)}${f.r ? ` R${n(f.r)}` : ""} at ${n(f.x)}, ${n(f.y)}`;
    case "shape": return `${f.shape === "drawn" ? "drawn shape" : f.shape} ${n(f.w)} × ${n(f.h)} at ${n(f.x)}, ${n(f.y)}`;
    case "text": return `"${f.text}" ${n(f.h)} high at ${n(f.x)}, ${n(f.y)}`;
    case "etch": return `${n(f.len)} long${f.rot ? `, ${n(f.rot)}°` : ""}`;
    case "corner": {
      if (f.at == null) return `R${n(f.r)}`;
      const where = f.at === "all" ? "all corners" : f.at === "inside" ? "all inside corners" : `${f.at.length} corner${f.at.length === 1 ? "" : "s"}`;
      return `${f.kind === "chamfer" ? `Chamfer ${n(f.r)}${f.ang && f.ang !== 45 ? ` × ${n(f.ang)}°` : ""}` : f.kind === "relief" ? `Relief Ø${n(f.r)}` : `R${n(f.r)}`} at ${where}`;
    }
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
  if (src.pts) { m.pts = src.pts.map(([x, y]) => [-x, y]); m.rot = exact(((-src.rot % 360) + 360) % 360); }   // a drawn shape is mirrored, not turned
  if (src.pat) {                                        // the copies mirror with it
    const p = { ...src.pat };
    if (p.t === "grid") p.px = exact(-p.px); else if (p.t === "circle") p.cx = exact(W - p.cx); else p.ang = mirAng(p.ang);
    m.pat = p;
  }
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
export function patternOf(f, id, fr) {
  if (f.k === "hole") return { id, k: "grid", x: f.x, y: f.y, cols: 2, rows: 1, px: exact(Math.max(20, f.d * 2)), py: exact(Math.max(20, f.d * 2)), d: f.d, ...(f.op ? { op: f.op } : {}) };
  if (!PATTERNABLE.has(f.k)) return null;
  const g = { ...f, id }; setFeatureValue(g, "pt", "grid", fr);
  return g;
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

// handles: a small cross at each shown feature's centre while its part is picked (the open row's is filled).
// Dragging inside a feature moves it (sketch moveHole -> moveFeatureBy). Called from sketch-view.
export function drawFeatureHandles(sk, ctx, S, C, it) {
  const feats = (it.feats || []).filter((f) => !f.hide && f.k !== "corner");
  if (!feats.length) return;
  const at = sk.partToWorld(it, feats.map((f) => [f.x, f.y]));
  feats.forEach((f, i) => {
    if (!at[i]) return;
    const [X, Y] = S(at[i][0], at[i][1]), open = sk.featOpen === f.id;
    ctx.save();
    ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X - 6, Y); ctx.lineTo(X + 6, Y); ctx.moveTo(X, Y - 6); ctx.lineTo(X, Y + 6); ctx.stroke();
    ctx.beginPath(); ctx.arc(X, Y, open ? 5 : 3.5, 0, 7); ctx.fillStyle = open ? C.sel : C.canvas; ctx.fill(); ctx.stroke();
    ctx.restore();
  });
}

// ---------------------------------------------------------------- loose holes -> features (plan 2.16)
// A separate hole / slot / bolt circle / grid / row item sitting fully inside a part can become one feature row of
// that part. Only offered when the rebuilt feature cuts the same holes (centres within 0.05 mm, same sizes). Centres are
// kept to 0.01 mm.
const tidy = (v) => exact(Math.round(v * 100) / 100);       // 0.01 mm: never moves a hole by more than 0.005
const tidyAng = (a) => tidy(((a % 360) + 360) % 360);
function looseToFeature(sk, host, o, id) {
  const cs = sk.contoursOf(o); if (!cs.length) return null;
  const circ = cs.filter((c) => c.circle);
  const P = (pts) => sk.worldToPart(host, pts);
  const centres = P(circ.map((c) => [c.circle.cx, c.circle.cy]));
  const mean = (a) => [a.reduce((s, q) => s + q[0], 0) / a.length, a.reduce((s, q) => s + q[1], 0) / a.length];
  const ang = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const p = o.p || {};
  let f = null;
  if (o.type === "hole" && centres.length === 1) {
    // a hole item's box is its circle's box, so its true centre is the box corner + the radius (the drawn polygon can sit 0.02 off)
    const [c] = P([[o.x + p.d / 2, o.y + p.d / 2]]);
    f = { k: "hole", x: tidy(c[0]), y: tidy(c[1]), d: exact(p.d) };
  }
  else if (o.type === "slothole" && cs.length === 1) {
    const b = cs[0].pts.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const [c] = P([[(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]]);
    const [a0, a1] = P([[0, 0], [Math.cos(((o.rot || 0) * Math.PI) / 180), Math.sin(((o.rot || 0) * Math.PI) / 180)]]);
    f = { k: "slot", x: tidy(c[0]), y: tidy(c[1]), len: exact(p.len), wid: exact(p.wid), rot: tidyAng(ang(a0, a1)) };
  } else if (o.type === "boltcircle" && centres.length >= 1) {
    const m = mean(centres);
    f = { k: "bolt", x: tidy(m[0]), y: tidy(m[1]), n: centres.length, d: exact(p.hole), pcd: exact(p.pcd), ang: tidyAng(ang(m, centres[0])) };
  } else if ((o.type === "holegrid" || o.type === "cornerholes") && centres.length >= 1) {
    const xs = [...new Set(centres.map((q) => Math.round(q[0] * 20) / 20))].sort((a, b) => a - b);
    const ys = [...new Set(centres.map((q) => Math.round(q[1] * 20) / 20))].sort((a, b) => a - b);
    const m = mean(centres);
    f = { k: "grid", x: tidy(m[0]), y: tidy(m[1]), cols: xs.length, rows: ys.length, px: tidy(xs.length > 1 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : 20), py: tidy(ys.length > 1 ? (ys[ys.length - 1] - ys[0]) / (ys.length - 1) : 20), d: exact(2 * circ[0].circle.r) };
  } else if (o.type === "holerow" && centres.length >= 1) {
    const m = mean(centres), n = centres.length;
    f = { k: "edge", x: tidy(m[0]), y: tidy(m[1]), n, pitch: exact(p.sp), d: exact(p.hole), rot: n > 1 ? tidyAng(ang(centres[0], centres[n - 1])) : 0 };
  }
  if (!f) return null;
  f = sanitizeFeature({ ...f, id });
  if (!f) return null;
  // the rebuilt feature must cut the same holes
  const want = o.type === "slothole" ? null : centres.map((q, i) => [q[0], q[1], 2 * circ[i].circle.r]);
  if (want) {
    const got = holeCentres(f);
    if (got.length !== want.length) return null;
    const used = new Set();
    for (const [x, y, d] of want) {
      const j = got.findIndex((g, k) => !used.has(k) && Math.hypot(g[0] - x, g[1] - y) < 0.05);
      if (j < 0 || Math.abs(f.d - d) > 0.05) return null;
      used.add(j);
    }
  }
  if (o.op === "score" || o.op === "mark") f.op = o.op;
  if (Array.isArray(o.drill) && o.drill.length && isHoleFeature(f)) f.op = "drill";      // r15 6.3: a loose hole marked for drilling stays marked
  return f;
}
// the loose hole items inside host that can become its features: [{ item, feat }]
export function adoptableHoles(sk, host) {
  if (!host || host.lock || sk.isHole(host) || sk.layout) return [];
  let id = Math.max(0, ...(host.feats || []).map((f) => f.id));
  const out = [];
  for (const o of sk.ownedHoles(host)) {
    if (o.lock || o.hide) continue;
    const f = looseToFeature(sk, host, o, id + 1);
    if (f) { id++; out.push({ item: o, feat: f }); }
  }
  return out;
}

// ---------------------------------------------------------------- Join keeps features (plan 2.13)
// Re-measure each part's features in the new combined outline's frame: same place, same direction on the sheet.
// Ids are renumbered (two parts may both have a feature 1); mirror links follow the new ids.
export function carryFeatures(sk, fromParts, to) {
  const out = []; let id = 0;
  const axes = (it) => { const [o, x, y] = sk.partToWorld(it, [[0, 0], [1, 0], [0, 1]]); return o ? { o, x: [x[0] - o[0], x[1] - o[1]], y: [y[0] - o[0], y[1] - o[1]] } : null; };
  for (const p of fromParts) {
    const fs = p.feats || []; if (!fs.length) continue;
    const a = axes(p); if (!a) continue;
    const turn = (Math.atan2(a.x[1], a.x[0]) * 180) / Math.PI, flip = a.x[0] * a.y[1] - a.x[1] * a.y[0] < 0;
    const ids = new Map();
    for (const f of fs) ids.set(f.id, ++id);
    for (const f of fs) {
      const [w] = sk.partToWorld(p, [[f.x, f.y]]); const [q] = sk.worldToPart(to, [w]);
      const g = { ...f, id: ids.get(f.id), x: exact(Math.round(q[0] * 1e4) / 1e4), y: exact(Math.round(q[1] * 1e4) / 1e4) };
      for (const k of ["rot", "ang"]) if (k in g) g[k] = exact(((((flip ? 180 - g[k] : g[k]) + turn) % 360) + 360) % 360);
      if (f.link) { if (ids.has(f.link)) g.link = ids.get(f.link); else delete g.link; }
      if (g.k === "corner") continue;                     // the combined outline has its own corners
      out.push(g);
    }
  }
  return out;
}

// Cut out tool (plan 2.13): a cutter lying inside the part becomes a row measured in the part's own frame.
// A round cutter (a disc) becomes a Hole; anything else a drawn Shape cut-out with its exact points.
export function cutterToFeature(sk, host, contour, circle, id) {
  if (circle) {
    const [[x, y]] = sk.worldToPart(host, [[circle.cx, circle.cy]]);
    return { id, k: "hole", x: exact(x), y: exact(y), d: exact(2 * circle.r) };
  }
  const pts = sk.worldToPart(host, contour.pts); if (pts.length < 3) return null;
  const b = boxOf(pts), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  return { id, k: "shape", shape: "drawn", x: exact(cx), y: exact(cy), w: exact(b[2] - b[0]), h: exact(b[3] - b[1]), rot: 0,
    pts: pts.map(([x, y]) => [Math.round((x - cx) * 1e9) / 1e9, Math.round((y - cy) * 1e9) / 1e9]) };
}

// ---------------------------------------------------------------- DXF / SVG imports: circles inside the outline -> Hole rows (plan 2.16)
// A closed loop that is a true circle (equal-bulge arcs round one centre, as the drawing gave it) and sits inside
// the part's only outline becomes a Hole feature with the drawing's exact centre and size; it is dropped from the outline.
function loopCircle(c) {
  // only a true circle as the drawing gave it: n equal-bulge arcs making one full turn round one centre. A polygon that
  // merely looks round stays in the outline (turning it into a hole row would change the cut).
  const pts = c.pts || [], n = pts.length, bs = c.bulges || [];
  if (c.closed === false || c.op || c.role || n < 2 || n > 64) return null;
  const b0 = Number(bs[0]) || 0;
  if (!(Math.abs(b0) > 1e-9) || bs.length < n || bs.slice(0, n).some((b) => Math.abs((Number(b) || 0) - b0) > 1e-9)) return null;
  if (Math.abs(n * 4 * Math.atan(Math.abs(b0)) - 2 * Math.PI) > 1e-4) return null;   // DXF bulges are often written to 6 places
  const cx = pts.reduce((s2, p) => s2 + p[0], 0) / n, cy = pts.reduce((s2, p) => s2 + p[1], 0) / n;
  const rs = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)), r = rs.reduce((s2, v) => s2 + v, 0) / n;
  if (!(r > 0.05) || rs.some((v) => Math.abs(v - r) > 1e-6 * Math.max(1, r))) return null;
  const a0 = (Math.atan2(pts[0][1] - cy, pts[0][0] - cx) * 180) / Math.PI;
  return { cx, cy, r, arcs: { n, a0: exact(a0), b: Math.abs(b0), cw: b0 < 0 } };
}
export function adoptCircleHoles(it) {
  if (!it || it.type !== "custom" || !it.shape || !Array.isArray(it.shape.cs)) return 0;
  const cs = it.shape.cs, out = cs[0];
  if (!out || out.closed === false || out.op || out.role || out.pts.length < 3) return 0;
  // only a part with one outline: any other closed loop lying wholly outside it is a second outline -> leave the part alone
  if (cs.slice(1).some((c) => c.closed !== false && !c.op && !c.role && c.pts.every((p) => !pointInPoly(p, out.pts)))) return 0;
  const k = (it.p && it.p.scale ? it.p.scale : 100) / 100;
  if (Math.abs(k - 1) > 1e-9) return 0;
  // features are measured from the outline's own box, the same expanded outline the sketch uses (sketch-geom baseContours)
  const ex = expandContour(out);
  let x0 = Infinity, y0 = Infinity;
  for (const [x, y] of ex.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
  let id = Math.max(0, ...(it.feats || []).map((f) => f.id));
  const feats = [], keep = [];
  for (const c of cs) {
    const ci = c !== out && loopCircle(c);
    if (ci && pointInPoly([ci.cx, ci.cy], ex.pts) && !polysCross(circleAt(ci.cx, ci.cy, ci.r).pts, ex.pts)) {
      feats.push({ id: ++id, k: "hole", x: exact(ci.cx - x0), y: exact(ci.cy - y0), d: exact(2 * ci.r), arcs: ci.arcs });   // cut as the drawing drew it
    } else keep.push(c);
  }
  if (!feats.length) return 0;
  it.shape.cs = keep;
  it.feats = [...(it.feats || []), ...feats];
  it._key = undefined;
  return feats.length;
}

// Fold models and a small offline 3D viewer for formed / bent preset parts.
// The flat pattern from shape.make() is still what gets cut. This only visualises the folded result.
// No external library: painter's-algorithm polygons on canvas (and the same projection as SVG thumbs).
import { segmentsFor } from "./duct.js";
import { pipeEnds, flangeOn, flangeDims } from "./pipeflanges.js";
import { FOLD } from "./flat3d.js";
import { jobThickness } from "./bends.js";

const V = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mag = (a) => Math.hypot(a[0], a[1], a[2]) || 1;
const norm = (a) => scl(a, 1 / mag(a));

export function face(w, h, holes = []) {
  return { w: Math.max(0, w), h: Math.max(0, h), holes, children: [] };
}
// edge: 0 bottom (y=0), 1 right (x=w), 2 top (y=h), 3 left (x=0). angleDeg > 0 folds toward the face normal.
export function attach(parent, edge, angleDeg, child, along = 0) {
  parent.children.push({ edge, angle: (angleDeg * Math.PI) / 180, face: child, along });
  return parent;
}

function edgeFrame(w, h, edge, along) {
  if (edge === 0) return { o: V(along, 0, 0), ax: V(1, 0, 0), ay: V(0, -1, 0) };           // child y goes outward from bottom
  if (edge === 1) return { o: V(w, along, 0), ax: V(0, 1, 0), ay: V(1, 0, 0) };
  if (edge === 2) return { o: V(along, h, 0), ax: V(1, 0, 0), ay: V(0, 1, 0) };
  return { o: V(0, along, 0), ax: V(0, 1, 0), ay: V(-1, 0, 0) };
}

function rotAxis(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), k = norm(axis);
  // Rodrigues
  return add(add(scl(v, c), scl(cross(k, v), s)), scl(k, dot(k, v) * (1 - c)));
}

function mapPt(o, xA, yA, x, y) { return add(o, add(scl(xA, x), scl(yA, y))); }

function poseFace(face, o, xA, yA, out) {
  const n = norm(cross(xA, yA));
  const w = face.w, h = face.h;
  const pts = [mapPt(o, xA, yA, 0, 0), mapPt(o, xA, yA, w, 0), mapPt(o, xA, yA, w, h), mapPt(o, xA, yA, 0, h)];
  const holes = (face.holes || []).map((q) => {
    if (q.r) {
      const ring = [];
      for (let i = 0; i < 48; i++) {
        const a = (i * 2 * Math.PI) / 48;
        ring.push(mapPt(o, xA, yA, q.cx + q.r * Math.cos(a), q.cy + q.r * Math.sin(a)));
      }
      return ring;
    }
    return (q.pts || []).map(([x, y]) => mapPt(o, xA, yA, x, y));
  });
  out.push({ pts, n, holes, w, h });
  for (const ch of face.children || []) {
    const fr = edgeFrame(w, h, ch.edge, ch.along || 0);
    const hingeO = mapPt(o, xA, yA, fr.o[0], fr.o[1]);
    const edgeDir = norm(add(scl(xA, fr.ax[0]), scl(yA, fr.ax[1])));
    const away = norm(add(scl(xA, fr.ay[0]), scl(yA, fr.ay[1])));
    // Positive angle folds toward the parent normal (walls fold "up" off a base).
    // Child's x still runs along the edge from `along`, so hole positions stay put.
    let foldAxis = cross(away, n);
    foldAxis = mag(foldAxis) < 1e-9 ? edgeDir : norm(foldAxis);
    const cX = edgeDir;
    if (ch.angle) FOLD.used = true;
    const cY = rotAxis(away, foldAxis, (ch.angle || 0) * FOLD.t);   // r15 5.7: the Unfold slider scales every fold
    poseFace(ch.face, hingeO, cX, cY, out);
  }
}

export function assemble(root, parts) {
  const faces = [];
  const list = parts || [root];
  let dx = 0;
  for (const r of list) {
    if (!r) continue;
    // Base lies in the XZ plane: parent +X → world +X, parent +Y → world −Z, normal is +Y (up).
    poseFace(r, V(dx, 0, 0), V(1, 0, 0), V(0, 0, -1), faces);
    dx += (r.w || 0) + 20;
  }
  sitOnTable(faces);
  const panels = faces.map((f) => ({ w: f.w, h: f.h }));
  return { faces, panels };
}
function sitOnTable(faces) {
  let y0 = Infinity;
  for (const f of faces) for (const p of f.pts) y0 = Math.min(y0, p[1]);
  if (Number.isFinite(y0) && Math.abs(y0) > 1e-9) {
    for (const f of faces) for (const p of f.pts) p[1] -= y0;
  }
}

function hole(cx, cy, d) { return d > 0 ? { cx, cy, r: d / 2 } : null; }
const holes = (...hs) => hs.filter(Boolean);

// ------------------------------------------------------------------ builders (used by existing presets and new folded parts)

export function foldAngle(len, a, b, hs = []) {
  const A = face(len, a, hs.filter((h) => h.leg === 0));
  attach(A, 2, 90, face(len, b, hs.filter((h) => h.leg === 1)));
  return assemble(A);
}
export function foldU(len, web, leg, hs = [], ends = 0) {
  const W = face(len, web, hs);
  attach(W, 0, 90, face(len, leg));
  attach(W, 2, 90, face(len, leg));
  if (Math.round(ends) >= 1) {
    attach(W, 3, 90, face(web, leg));
    attach(W, 1, 90, face(web, leg));
  }
  return assemble(W);
}
export function foldC(len, web, leg, fl, ends = 0) {
  // C-channel: legs fold up, return flanges fold inward.
  // Walls on parent edges 0 and 1 have an outward normal, so inward is a negative angle.
  const W = face(len, web);
  const L1 = face(len, leg), L2 = face(len, leg);
  attach(L1, 2, -90, face(len, fl));
  attach(L2, 2, 90, face(len, fl));
  attach(W, 0, 90, L1);
  attach(W, 2, 90, L2);
  if (Math.round(ends) >= 1) {
    attach(W, 3, 90, face(web, leg));
    attach(W, 1, 90, face(web, leg));
  }
  return assemble(W);
}
export function foldHat(len, web, leg, fl) {
  // Hat: same as a C but the flanges fold outward. Sit it on the flanges (web up).
  const W = face(len, web);
  const L1 = face(len, leg), L2 = face(len, leg);
  attach(L1, 2, 90, face(len, fl));
  attach(L2, 2, -90, face(len, fl));
  attach(W, 0, 90, L1);
  attach(W, 2, 90, L2);
  const m = assemble(W);
  for (const f of m.faces) {
    f.pts.forEach((p) => { p[1] = -p[1]; });
    f.n = [f.n[0], -f.n[1], f.n[2]];
  }
  sitOnTable(m.faces);
  return m;
}
export function foldZ(len, a, mid, b) {
  const M = face(len, mid);
  attach(M, 0, 90, face(len, a));
  attach(M, 2, -90, face(len, b));
  return assemble(M);
}
export function foldOpenBox(l, w, h, sideHoles = []) {
  const bot = face(l, w);
  attach(bot, 0, 90, face(l, h, sideHoles[0]));
  attach(bot, 2, 90, face(l, h, sideHoles[1]));
  attach(bot, 3, 90, face(w, h, sideHoles[2]));
  attach(bot, 1, 90, face(w, h, sideHoles[3]));
  return assemble(bot);
}
export function foldLiddedBox(l, w, h) {
  const box = foldOpenBox(l, w, h);
  // Lid hinged at the back (z = −w), slightly open so you can see inside.
  const lid = face(l, w);
  const top = [];
  const ang = (22 * Math.PI) / 180;
  poseFace(lid, V(0, h, -w), V(1, 0, 0), V(0, Math.sin(ang), Math.cos(ang)), top);
  const faces = box.faces.concat(top);
  sitOnTable(faces);
  return { faces, panels: box.panels.concat([{ w: l, h: w }]) };
}
export function foldTrayCross(l, w, h, tab = 0) {
  // one-piece tray: bottom with four sides (and optional tabs on the length sides, folding inward)
  const bot = face(l, w);
  const long = face(l, h);            // parent edge 0: outward normal, inward = −90
  if (tab > 0) { attach(long, 3, -90, face(h, tab)); attach(long, 1, -90, face(h, tab)); }
  const long2 = face(l, h);           // parent edge 2: inward normal, inward = +90
  if (tab > 0) { attach(long2, 3, 90, face(h, tab)); attach(long2, 1, 90, face(h, tab)); }
  attach(bot, 0, 90, long);
  attach(bot, 2, 90, long2);
  attach(bot, 3, 90, face(w, h));
  attach(bot, 1, 90, face(w, h));
  return assemble(bot);
}
function wallWithHem(len, h, hem, inwardSign) {
  const w = face(len, h);
  if (hem > 0) attach(w, 2, 90 * inwardSign, face(len, hem));
  return w;
}
export function foldOpenHem(l, w, h, hem = 0, tab = 0, frontH = h) {
  if (!(hem > 0) && !(Math.abs(frontH - h) > 0.05) && !(tab > 0)) return foldTrayCross(l, w, h, tab);
  const bot = face(l, w);
  const long = wallWithHem(l, frontH, hem, -1);
  if (tab > 0) { attach(long, 3, -90, face(frontH, tab)); attach(long, 1, -90, face(frontH, tab)); }
  const long2 = wallWithHem(l, h, hem, 1);
  if (tab > 0) { attach(long2, 3, 90, face(h, tab)); attach(long2, 1, 90, face(h, tab)); }
  attach(bot, 0, 90, long);
  attach(bot, 2, 90, long2);
  attach(bot, 3, 90, wallWithHem(w, h, hem, 1));
  attach(bot, 1, 90, wallWithHem(w, h, hem, -1));
  return assemble(bot);
}
export function foldLiddedCross(l, w, h, tab = 0, lidHoles = []) {
  const bot = face(l, w);
  const long = face(l, h);
  if (tab > 0) { attach(long, 3, -90, face(h, tab)); attach(long, 1, -90, face(h, tab)); }
  const long2 = face(l, h);
  if (tab > 0) { attach(long2, 3, 90, face(h, tab)); attach(long2, 1, 90, face(h, tab)); }
  attach(long2, 2, 70, face(l, w, lidHoles));
  attach(bot, 0, 90, long);
  attach(bot, 2, 90, long2);
  attach(bot, 3, 90, face(w, h));
  attach(bot, 1, 90, face(w, h));
  return assemble(bot);
}
export function foldCuboid(l, w, h) {
  const bot = face(l, w);
  const back = face(l, h);
  attach(back, 2, 90, face(l, w));
  attach(bot, 0, 90, face(l, h));
  attach(bot, 2, 90, back);
  attach(bot, 3, 90, face(w, h));
  attach(bot, 1, 90, face(w, h));
  return assemble(bot);
}

// r15 5.7: the 3D is drawn at the sheet the part is cut from: its own bend thickness, else the job's, else its own
// thickness field, else 3 mm.
export function displayThickness(p) {
  const bt = Number(p && p.bt);
  if (Number.isFinite(bt) && bt > 0.05) return bt;
  const job = jobThickness();
  if (job > 0.05) return job;
  const t = Number(p && (p.thick != null ? p.thick : p.t));
  return (Number.isFinite(t) && t > 0.05) ? t : 3;
}
export function thicken(model, t) {
  if (!(t > 0.05) || !model || !model.faces || !model.faces.length || model.thick) return model;
  attachSmoothNormals(model.faces);
  const midEdges = new Map();
  for (const f of model.faces) {
    const pts = f.pts, n = pts.length;
    for (let i = 0; i < n; i++) {
      const k = edgeKey(pts[i], pts[(i + 1) % n]);
      let e = midEdges.get(k);
      if (!e) midEdges.set(k, e = { faces: [] });
      e.faces.push(f);
    }
  }
  const faces = [];
  for (const f of model.faces) {
    if (f.ghost) { faces.push({ ...f, pts: f.pts.map((q) => q.slice()), holes: (f.holes || []).map((r) => r.map((q) => q.slice())) }); continue; }
    const nrm = norm(f.n);
    const half = ((Number(f.thk) > 0.05 ? Number(f.thk) : t) / 2);
    const vns = (f.vn && f.vn.length === f.pts.length) ? f.vn.map(norm) : f.pts.map(() => nrm);
    const offV = (pts, s) => (pts || []).map((p, i) => add(p, scl(vns[i] || nrm, s)));
    const offN = (pts, s) => (pts || []).map((p) => add(p, scl(nrm, s)));
    const front = offV(f.pts, half), back = offV(f.pts, -half);
    const fHoles = (f.holes || []).map((ring) => offN(ring, half));
    const bHoles = (f.holes || []).map((ring) => offN(ring, -half).reverse());
    faces.push({ ...f, pts: front, n: nrm, holes: fHoles });
    faces.push({ ...f, pts: back.slice().reverse(), n: scl(nrm, -1), holes: bHoles, edge: true });
    const npts = f.pts.length;
    for (let i = 0; i < npts; i++) {
      const j = (i + 1) % npts;
      // Skip thickness caps on smooth shared meridians so a tube is a shell, not a cage of fins.
      const midE = midEdges.get(edgeKey(f.pts[i], f.pts[j]));
      const midFaces = midE ? midE.faces : [f];
      if (midFaces.length === 2 && !isSharpPair(midFaces[0], midFaces[1])) continue;
      const a = back[i], b = back[j], c = front[j], d = front[i];
      faces.push({ pts: [a, b, c, d], n: norm(cross(sub(b, a), sub(d, a))), holes: [], w: 0, h: 0, edge: true, ...(f.accent ? { accent: true } : {}) });
    }
    for (const ring of f.holes || []) {
      const rh = offN(ring, half), rb = offN(ring, -half), nh = ring.length;
      for (let i = 0; i < nh; i++) {
        const j = (i + 1) % nh;
        const a = rb[i], b = rb[j], c = rh[j], d = rh[i];
        faces.push({ pts: [a, b, c, d], n: norm(cross(sub(b, a), sub(d, a))), holes: [], w: 0, h: 0, edge: true, holeWall: true });
      }
    }
  }
  sitOnTable(faces);
  return { faces, panels: model.panels, thick: t };
}
function viewModel(model, p) {
  if (!model) return null;
  const v = thicken(model, displayThickness(p));
  if (v && v !== model) { v.base = model; v.unfoldable = model.unfoldable; }
  return v;
}
export function foldFrustum(d1, d2, h, segs = 72) {
  const faces = [], R = d1 / 2, r = d2 / 2;
  const slant = Math.hypot(h, R - r);
  // approximate each facet width at mid
  for (let i = 0; i < segs; i++) {
    const a0 = (i * 2 * Math.PI) / segs, a1 = ((i + 1) * 2 * Math.PI) / segs;
    const pts = [
      V(R * Math.cos(a0), 0, R * Math.sin(a0)),
      V(R * Math.cos(a1), 0, R * Math.sin(a1)),
      V(r * Math.cos(a1), h, r * Math.sin(a1)),
      V(r * Math.cos(a0), h, r * Math.sin(a0)),
    ];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    const w = (Math.PI * (d1 + d2) / 2) / segs;
    faces.push({ pts, n, holes: [], w, h: slant, smooth: true });
  }
  return { faces, panels: [{ w: Math.PI * ((d1 + d2) / 2), h: slant }] };
}
export function foldTube(d, h, segs = 72) {
  return foldFrustum(d, d, h, segs);
}

function basisOf(axis) {
  const a = norm(axis);
  const tmp = Math.abs(a[1]) < 0.85 ? V(0, 1, 0) : V(1, 0, 0);
  const xA = norm(cross(tmp, a));
  const yA = cross(a, xA);
  return { a, xA, yA };
}
function tubeFaces(d, origin, axis, len, segs = 48, opts = {}) {
  const r0 = opts.r0 != null ? opts.r0 : d / 2;
  const r1 = opts.r1 != null ? opts.r1 : r0;
  const { a, xA, yA } = basisOf(axis);
  const ring = (s, rad, th) => add(add(origin, scl(a, s)), add(scl(xA, rad * Math.cos(th)), scl(yA, rad * Math.sin(th))));
  const faces = [];
  const L = Math.max(0.5, Number(len) || 0);
  for (let i = 0; i < segs; i++) {
    const t0 = (i * 2 * Math.PI) / segs, t1 = ((i + 1) * 2 * Math.PI) / segs;
    const pts = [ring(0, r0, t0), ring(0, r0, t1), ring(L, r1, t1), ring(L, r1, t0)];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    faces.push({ pts, n, holes: [], w: (Math.PI * (r0 + r1)) / segs, h: L, smooth: true, ghost: !!opts.ghost, gore: opts.gore });
  }
  return faces;
}
function lineHitCylinder(P0, dir, C0, Cdir, R) {
  const a = norm(dir), h = norm(Cdir);
  const W0 = sub(P0, C0);
  const U = sub(W0, scl(h, dot(W0, h)));
  const V = sub(a, scl(h, dot(a, h)));
  const A = dot(V, V), B = 2 * dot(U, V), C = dot(U, U) - R * R;
  if (A < 1e-12) return Math.abs(C) < 1e-6 ? 0 : null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const s0 = (-B - Math.sqrt(disc)) / (2 * A), s1 = (-B + Math.sqrt(disc)) / (2 * A);
  const cand = [s0, s1].filter((s) => Number.isFinite(s)).sort((x, y) => x - y);
  return cand.length ? cand[0] : null;
}
function fishmouthBranch(d, orig, axis, headerOrig, headerAxis, headerD, skirt, segs = 48, opts = {}) {
  const r = d / 2, R = headerD / 2;
  const { a, xA, yA } = basisOf(axis);
  const cutS = [];
  let peak = -Infinity, trough = Infinity;
  for (let i = 0; i <= segs; i++) {
    const th = (i * 2 * Math.PI) / segs;
    const off = add(scl(xA, r * Math.cos(th)), scl(yA, r * Math.sin(th)));
    const hit = lineHitCylinder(add(orig, off), a, headerOrig, headerAxis, R);
    const v = hit == null ? 0 : hit;
    cutS.push(v);
    peak = Math.max(peak, v);
    trough = Math.min(trough, v);
  }
  if (!Number.isFinite(peak)) return { faces: [], peak: 0, trough: 0, sTop: 0 };
  const sk = Math.max(8, Number(skirt) || 0);
  // away: skirt sticks out from the first (near) hit, back toward the origin, so the
  // branch sits on the header instead of running through it.
  const sTop = opts.away !== false ? trough - sk : peak + sk;
  const faces = [];
  for (let i = 0; i < segs; i++) {
    const t0 = (i * 2 * Math.PI) / segs, t1 = ((i + 1) * 2 * Math.PI) / segs;
    const p = (ss, th) => add(add(orig, scl(a, ss)), add(scl(xA, r * Math.cos(th)), scl(yA, r * Math.sin(th))));
    const a0 = p(cutS[i], t0), a1 = p(cutS[i + 1], t1), b1 = p(sTop, t1), b0 = p(sTop, t0);
    const pts = sTop < (cutS[i] + cutS[i + 1]) / 2 ? [a0, b0, b1, a1] : [a0, a1, b1, b0];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    faces.push({ pts, n, holes: [], w: (2 * Math.PI * r) / segs, h: Math.abs(sTop - trough), smooth: true, ghost: !!opts.ghost });
  }
  return { faces, peak, trough, sTop };
}
function plateFaces(cx, cz, w, d, y = 0, ghost = true) {
  const hw = w / 2, hd = d / 2;
  const pts = [V(cx - hw, y, cz - hd), V(cx + hw, y, cz - hd), V(cx + hw, y, cz + hd), V(cx - hw, y, cz + hd)];
  return [{ pts, n: V(0, 1, 0), holes: [], w, h: d, ghost: !!ghost }];
}

// r15 5.4: a pipe template's 3D: the piece you cut (accent) on the pipe it wraps (grey, steel).
function asTemplate(faces) { for (const f of faces) if (!f.ghost) f.accent = true; return faces; }
const pipeRun = (d) => Math.max(40, 0.8 * d);
// the branch pipe carrying on past the template's straight (skirt) edge
function branchRun(d, orig, axis, sTop, segs) {
  const { a, xA, yA } = basisOf(axis), r = d / 2, s1 = sTop - pipeRun(d), faces = [];
  const p = (ss, th) => add(add(orig, scl(a, ss)), add(scl(xA, r * Math.cos(th)), scl(yA, r * Math.sin(th))));
  for (let i = 0; i < segs; i++) {                        // same facets as the branch, so the two meet edge to edge
    const t0 = (i * 2 * Math.PI) / segs, t1 = ((i + 1) * 2 * Math.PI) / segs;
    const pts = [p(sTop, t0), p(s1, t0), p(s1, t1), p(sTop, t1)];
    faces.push({ pts, n: norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0]))), holes: [], w: (2 * Math.PI * r) / segs, h: sTop - s1, smooth: true });
  }
  return faces;
}

// Branch pipe with a 90° fishmouth onto a ghosted header.
export function foldFishmouth(d, d2, skirt, segs = 48) {
  const R = Math.max(d2, d) / 2;
  const hLen = Math.max(2.6 * R, d + 40);
  const headerOrig = V(0, R, -hLen / 2);
  const header = tubeFaces(R * 2, headerOrig, V(0, 0, 1), hLen, segs, { ghost: true });
  // Approach the header from above along -Y so the first hit is the top saddle.
  const origin = V(0, R * 2 + 120, 0);
  const br = fishmouthBranch(d, origin, V(0, -1, 0), headerOrig, V(0, 0, 1), R * 2, skirt, segs);
  const faces = header.concat(asTemplate(br.faces), branchRun(d, origin, V(0, -1, 0), br.sTop, segs));
  sitOnTable(faces);
  return { faces, panels: [{ w: Math.PI * d, h: Math.abs((br.sTop || 0) - (br.trough || 0)) || (skirt + R) }] };
}

// Header wrap with a saddle hole and a ghosted branch sitting in it.
export function foldSaddleHole(d, len, branch, segs = 48) {
  const R = Math.max(4, d / 2), r = Math.max(4, branch / 2);
  const L = Math.max(len, 2 * r + 20);
  const yc = L / 2;
  // Header along +Y, centre on Y. Hole on the +X side.
  const raw = tubeFaces(d, V(0, 0, 0), V(0, 1, 0), L, segs);
  const inside = (p) => {
    const dy = p[1] - yc, dz = p[2];
    return (dy * dy + dz * dz) < (r * r - 0.8) && p[0] > 0;
  };
  const faces = raw.filter((f) => {
    const mid = f.pts.reduce((s, q) => add(s, q), V(0, 0, 0));
    const c = scl(mid, 1 / f.pts.length);
    return !inside(c);
  });
  // Ghost branch on the +X side, sitting in the hole (approach from +X, skirt away).
  const reach = Math.max(40, r * 1.6);
  const br = fishmouthBranch(branch, V(R + reach + 40, yc, 0), V(-1, 0, 0), V(0, 0, 0), V(0, 1, 0), d, reach, segs, { ghost: true });
  const out = faces.concat(br.faces);
  sitOnTable(out);
  return { faces: out, panels: [{ w: Math.PI * d, h: L }], openings: 1 };   // the hole is the facets left out
}

// Pipe with a bevelled / coped end sitting on a ghosted plate.
export function foldPipeOnFlat(d, rise, skirt, segs = 48) {
  const r = Math.max(4, d / 2);
  const riseN = Math.max(0, Number(rise) || 0);
  const yCut = (th) => riseN * (1 - Math.cos(th)) / 2;
  let peak = 0;
  for (let i = 0; i <= segs; i++) peak = Math.max(peak, yCut((i * 2 * Math.PI) / segs));
  const yTop = peak + Math.max(8, Number(skirt) || 0);
  const faces = plateFaces(0, 0, d * 2.2, d * 2.2, 0, true);
  for (let i = 0; i < segs; i++) {
    const t0 = (i * 2 * Math.PI) / segs, t1 = ((i + 1) * 2 * Math.PI) / segs;
    const pts = [
      V(r * Math.cos(t0), yCut(t0), r * Math.sin(t0)),
      V(r * Math.cos(t1), yCut(t1), r * Math.sin(t1)),
      V(r * Math.cos(t1), yTop, r * Math.sin(t1)),
      V(r * Math.cos(t0), yTop, r * Math.sin(t0)),
    ];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    faces.push({ pts, n, holes: [], w: (2 * Math.PI * r) / segs, h: yTop, smooth: true, accent: true });
  }
  const yRun = yTop + pipeRun(d);                       // the pipe carrying on above the template (same facets, so they meet)
  for (let i = 0; i < segs; i++) {
    const t0 = (i * 2 * Math.PI) / segs, t1 = ((i + 1) * 2 * Math.PI) / segs;
    const pts = [V(r * Math.cos(t0), yTop, r * Math.sin(t0)), V(r * Math.cos(t1), yTop, r * Math.sin(t1)), V(r * Math.cos(t1), yRun, r * Math.sin(t1)), V(r * Math.cos(t0), yRun, r * Math.sin(t0))];
    faces.push({ pts, n: norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0]))), holes: [], w: (2 * Math.PI * r) / segs, h: yRun - yTop, smooth: true });
  }
  sitOnTable(faces);
  return { faces, panels: [{ w: Math.PI * d, h: yTop }] };
}

// Assembled tee: header with a saddle hole and a fishmouth branch, both solid.
export function foldTee(branchD, headerD, headerLen, skirt, segs = 48) {
  const R = Math.max(4, headerD / 2), r = Math.max(4, branchD / 2);
  const L = Math.max(headerLen, 2 * r + 30);
  const yc = L / 2;
  const raw = tubeFaces(headerD, V(0, 0, 0), V(0, 1, 0), L, segs);
  const inside = (p) => {
    const dy = p[1] - yc, dz = p[2];
    return (dy * dy + dz * dz) < (r * r - 0.8) && p[0] > 0;
  };
  const header = raw.filter((f) => {
    const mid = f.pts.reduce((s, q) => add(s, q), V(0, 0, 0));
    return !inside(scl(mid, 1 / f.pts.length));
  });
  const reach = Math.max(Number(skirt) || 0, r + 30, 40);
  const bo = V(R + reach + 40, yc, 0);
  const br = fishmouthBranch(branchD, bo, V(-1, 0, 0), V(0, 0, 0), V(0, 1, 0), headerD, reach, segs);
  const run = pipeRun(headerD);
  const faces = asTemplate(header).concat(asTemplate(br.faces), branchRun(branchD, bo, V(-1, 0, 0), br.sTop, segs),
    tubeFaces(headerD, V(0, -run, 0), V(0, 1, 0), run, segs), tubeFaces(headerD, V(0, L, 0), V(0, 1, 0), run, segs));
  sitOnTable(faces);
  return { faces, panels: [{ w: Math.PI * headerD, h: L }, { w: Math.PI * branchD, h: (br.sTop - br.trough) || (skirt + R) }], openings: 1 };
}


function faceCentre(f) {
  const mid = f.pts.reduce((s, q) => add(s, q), V(0, 0, 0));
  return scl(mid, 1 / f.pts.length);
}
function insideBranchCyl(p, orig, axis, r, s0, s1) {
  const a = norm(axis);
  const w = sub(p, orig);
  const s = dot(w, a);
  const rad2 = mag(sub(w, scl(a, s)));
  return s >= Math.min(s0, s1) && s <= Math.max(s0, s1) && rad2 < r - 0.4;
}
function punchBranchHoles(header, branches, r) {
  return header.filter((f) => {
    const c = faceCentre(f);
    return !branches.some((b) => insideBranchCyl(c, b.orig, b.axis, r, b.trough - 2, b.peak + r * 2));
  });
}
// Header with two 45° branches (Y).
export function foldYBranch(branchD, headerD, len, rise, segs = 48) {
  const R = Math.max(4, headerD / 2), r = Math.max(4, branchD / 2);
  const L = Math.max(len, 2 * r + 40);
  const yc = L * 0.45;
  const header = tubeFaces(headerD, V(0, 0, 0), V(0, 1, 0), L, segs);
  const ang = Math.PI / 4;
  const skirt = Math.max(len * 0.6, r + 20);
  const mk = (sign) => {
    const axis = V(sign * Math.sin(ang), Math.cos(ang), 0);
    const back = Math.max(80, R + r + 40);
    const join = V(0, yc, 0);
    const orig = sub(join, scl(axis, back));
    const br = fishmouthBranch(branchD, orig, axis, V(0, 0, 0), V(0, 1, 0), headerD, skirt, segs);
    return { ...br, orig, axis };
  };
  const a = mk(1), b = mk(-1), run = pipeRun(headerD);
  const faces = asTemplate(punchBranchHoles(header, [a, b], r).concat(a.faces, b.faces)).concat(
    tubeFaces(headerD, V(0, -run, 0), V(0, 1, 0), run, segs),
    branchRun(branchD, a.orig, a.axis, a.sTop, segs), branchRun(branchD, b.orig, b.axis, b.sTop, segs));
  sitOnTable(faces);
  return { faces, panels: [{ w: Math.PI * headerD, h: L }, { w: Math.PI * branchD, h: skirt + R }, { w: Math.PI * branchD, h: skirt + R }] };
}

// Pants / britches: larger header splitting into two saddled branches.
export function foldBritches(branchD, headerD, len, segs = 48) {
  const R = Math.max(4, headerD / 2), r = Math.max(4, branchD / 2);
  const L = Math.max(len, 2 * r + 30);
  const header = tubeFaces(headerD, V(0, 0, 0), V(0, 1, 0), L, segs);
  const ang = Math.PI / 5;
  const yc = L * 0.7;
  const skirt = Math.max(len, r + 24);
  const mk = (sign) => {
    const axis = V(sign * Math.sin(ang), Math.cos(ang), 0);
    const join = V(sign * R * 0.15, yc, 0);
    const orig = sub(join, scl(axis, Math.max(80, R + r + 40)));
    const br = fishmouthBranch(branchD, orig, axis, V(0, 0, 0), V(0, 1, 0), headerD, skirt, segs);
    return { ...br, orig, axis };
  };
  const a = mk(1), b = mk(-1), run = pipeRun(headerD);
  const faces = asTemplate(punchBranchHoles(header, [a, b], r).concat(a.faces, b.faces)).concat(
    tubeFaces(headerD, V(0, -run, 0), V(0, 1, 0), run, segs),
    branchRun(branchD, a.orig, a.axis, a.sTop, segs), branchRun(branchD, b.orig, b.axis, b.sTop, segs));
  sitOnTable(faces);
  return { faces, panels: [{ w: Math.PI * headerD, h: L }, { w: Math.PI * branchD, h: skirt + R }, { w: Math.PI * branchD, h: skirt + R }] };
}
function triArea(pts) {
  const nrm = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
  return mag(nrm) / 2;
}
function outwardN(pts, centre) {
  let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  const mid = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3, (pts[0][2] + pts[1][2] + pts[2][2]) / 3];
  if (dot(n, sub(mid, centre)) < 0) n = scl(n, -1);
  return n;
}
// True triangulation development (same as js/make/duct.js): four flat mid-side
// triangles plus a corner fan from each rectangle corner to the quarter-arc, using
// the same segment count (and seam at mid-arc) as the flat pattern.
export function foldS2r(a, b, d, h, segs, ox = 0, oy = 0) {
  const R = d / 2, H = h;
  const n = segs || segmentsFor(R);
  const faces = [];
  const centre = V(ox, H / 2, oy);
  const corners = [V(-a / 2, 0, -b / 2), V(a / 2, 0, -b / 2), V(a / 2, 0, b / 2), V(-a / 2, 0, b / 2)];
  // Mid-side circle points, in the same order as the sides (front −Z, right +X, back +Z, left −X).
  const midTh = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const circ = (th) => V(ox + R * Math.cos(th), H, oy + R * Math.sin(th));
  const push = (pts, extra) => {
    const area = triArea(pts);
    faces.push({ pts, n: outwardN(pts, centre), holes: [], w: Math.sqrt(area), h: Math.sqrt(area), smooth: true, ...extra });
  };
  for (let s = 0; s < 4; s++) {
    push([corners[s], corners[(s + 1) % 4], circ(midTh[s])], { flat: true });
  }
  // Each quarter-arc is split into 2n triangles (n per half, meeting at the seam).
  const steps = 2 * n;
  for (let s = 0; s < 4; s++) {
    const apex = corners[(s + 1) % 4];
    const th0 = midTh[s], th1 = midTh[s] + Math.PI / 2;
    for (let i = 0; i < steps; i++) {
      const a0 = th0 + (i / steps) * (th1 - th0);
      const a1 = th0 + ((i + 1) / steps) * (th1 - th0);
      push([apex, circ(a0), circ(a1)], { flat: false });
    }
  }
  const area = faces.reduce((s, f) => s + f.w * f.h, 0);
  return { faces, panels: [{ w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)) }], n };
}
export function foldElbow(d, bendDeg, pieces, segs = 32, clr, d2) {
  const nGore = Math.max(2, Math.round(Number(pieces) || 2));
  const bend = (Math.max(5, Number(bendDeg) || 90) * Math.PI) / 180;
  const R0 = Math.max(4, Number(d) || 0) / 2;
  const R1 = Math.max(4, Number(d2) > 0 ? Number(d2) : (Number(d) || 0)) / 2;
  const rad = Math.max(Number(clr) > 0 ? Number(clr) : 1.5 * Math.max(Number(d) || 0, Number(d2) > 0 ? Number(d2) : (Number(d) || 0)), R0 + R1 + 1);
  const alpha = bend / (2 * (nGore - 1));
  const Lend = rad * Math.tan(alpha);
  const Lmid = 2 * Lend;
  const dir = (i) => {
    const ang = 2 * alpha * i;
    return V(Math.cos(ang), Math.sin(ang), 0);
  };
  const nrmE = (i) => {
    const ang = 2 * alpha * i;
    return V(Math.sin(ang), -Math.cos(ang), 0);
  };
  const bin = V(0, 0, 1);
  const joints = [V(0, 0, 0)];
  let P = V(0, 0, 0);
  const lengths = [];
  for (let i = 0; i < nGore; i++) {
    const L = (i === 0 || i === nGore - 1) ? Lend : Lmid;
    lengths.push(L);
    P = add(P, scl(dir(i), L));
    joints.push(P);
  }
  const totalL = lengths.reduce((s, v) => s + v, 0);
  const rAt = (t) => R0 + (R1 - R0) * t;
  const jointN = (k) => norm(add(dir(k - 1), dir(k)));
  const ringOn = (i, planeP, planeN, r) => {
    const D = dir(i), N = nrmE(i), pts = [];
    for (let k = 0; k < segs; k++) {
      const th = (k / segs) * 2 * Math.PI;
      const radial = add(scl(N, Math.cos(th)), scl(bin, Math.sin(th)));
      const denom = dot(D, planeN);
      const s = Math.abs(denom) < 1e-9 ? 0 : -dot(add(sub(joints[i], planeP), scl(radial, r)), planeN) / denom;
      pts.push(add(add(joints[i], scl(D, s)), scl(radial, r)));
    }
    return pts;
  };
  const faces = [];
  let acc = 0;
  for (let i = 0; i < nGore; i++) {
    const rA = rAt(acc / totalL), rB = rAt((acc + lengths[i]) / totalL);
    acc += lengths[i];
    const n0 = (i === 0) ? dir(0) : jointN(i);
    const n1 = (i === nGore - 1) ? dir(nGore - 1) : jointN(i + 1);
    const ring0 = ringOn(i, joints[i], n0, rA);
    const ring1 = ringOn(i, joints[i + 1], n1, rB);
    const hLen = lengths[i];
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      const pts = [ring0[k], ring0[k2], ring1[k2], ring1[k]];
      const nn = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
      faces.push({ pts, n: nn, holes: [], w: (Math.PI * (rA + rB)) / segs, h: hLen, smooth: true, gore: i });
    }
  }
  // Leave mid-surface unshifted so endFrames (flanges) stay on the openings; thicken() sits the view.
  return { faces, panels: [{ w: Math.PI * (R0 + R1), h: totalL }] };
}
export function foldRectElbow(w, h, r, bendDeg) {
  const faces = [];
  const bend = (Math.max(15, bendDeg) * Math.PI) / 180;
  const segs = 8;
  const hw = w / 2, hh = h / 2;
  // r is treated as an inner radius; the centre-line must clear the half-width
  const rad = Math.max(r, 8) + hw;
  const frame = (ang) => ({
    c: V(rad * (1 - Math.cos(ang)), 0, rad * Math.sin(ang)),
    n: V(Math.cos(ang), 0, -Math.sin(ang)),
  });
  const ringPt = (f, u, v) => add(f.c, add(scl(f.n, u), V(0, v, 0)));
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * bend, a1 = ((i + 1) / segs) * bend;
    const f0 = frame(a0), f1 = frame(a1);
    for (let k = 0; k < 4; k++) {
      const [uA, vA] = corners[k], [uB, vB] = corners[(k + 1) % 4];
      const pts = [ringPt(f0, uA, vA), ringPt(f0, uB, vB), ringPt(f1, uB, vB), ringPt(f1, uA, vA)];
      const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
      faces.push({ pts, n, holes: [], w: mag(sub(pts[1], pts[0])), h: mag(sub(pts[3], pts[0])) });
    }
  }
  const stub = Math.max(h, 50);
  const stubAt = (ang, along) => {
    const f = frame(ang);
    const tan = V(Math.sin(ang), 0, Math.cos(ang)); // matches frame tangent
    const end = { c: add(f.c, scl(tan, along)), n: f.n };
    const ring = (fr, u, v) => add(fr.c, add(scl(fr.n, u), V(0, v, 0)));
    for (let k = 0; k < 4; k++) {
      const [uA, vA] = corners[k], [uB, vB] = corners[(k + 1) % 4];
      const pts = [ring(f, uA, vA), ring(f, uB, vB), ring(end, uB, vB), ring(end, uA, vA)];
      const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
      faces.push({ pts, n, holes: [], w: mag(sub(pts[1], pts[0])), h: Math.abs(along) });
    }
  };
  stubAt(0, -stub);
  stubAt(bend, stub);
  sitOnTable(faces);
  return { faces, panels: [{ w: (w + h) * 2, h: rad * bend + 2 * stub }] };
}
export function foldUSaddle(wid, d, leg, segs = 12) {
  const faces = [];
  const R = Math.max(d, 8) / 2, W = Math.max(wid, 2);
  const pt = (x, a) => V(x, R * Math.sin(a), R * Math.cos(a));
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI, a1 = ((i + 1) / segs) * Math.PI;
    const pts = [pt(0, a0), pt(W, a0), pt(W, a1), pt(0, a1)];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    faces.push({ pts, n, holes: [], w: W, h: R * (a1 - a0) });
  }
  // legs hang down from each side of the half-wrap
  faces.push({ pts: [V(0, 0, R), V(W, 0, R), V(W, -leg, R), V(0, -leg, R)], n: V(0, 0, 1), holes: [], w: W, h: leg });
  faces.push({ pts: [V(0, 0, -R), V(0, -leg, -R), V(W, -leg, -R), V(W, 0, -R)], n: V(0, 0, -1), holes: [], w: W, h: leg });
  sitOnTable(faces);
  return { faces, panels: [{ w: W, h: Math.PI * R + 2 * leg }] };
}
export function foldHopper(a, b, a2, b2, h) {
  const faces = [];
  const bot = [[-a / 2, 0, -b / 2], [a / 2, 0, -b / 2], [a / 2, 0, b / 2], [-a / 2, 0, b / 2]];
  const top = [[-a2 / 2, h, -b2 / 2], [a2 / 2, h, -b2 / 2], [a2 / 2, h, b2 / 2], [-a2 / 2, h, b2 / 2]];
  for (let i = 0; i < 4; i++) {
    const pts = [bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    const w = mag(sub(bot[(i + 1) % 4], bot[i]));
    const hh = mag(sub(top[i], bot[i]));
    faces.push({ pts, n, holes: [], w, h: hh });
  }
  return { faces, panels: faces.map((f) => ({ w: f.w, h: f.h })) };
}
export function addTopFlanges(model, a2, b2, h, lip) {
  if (!(lip > 0)) return model;
  const faces = model.faces.slice();
  const t = [[-a2 / 2, h, -b2 / 2], [a2 / 2, h, -b2 / 2], [a2 / 2, h, b2 / 2], [-a2 / 2, h, b2 / 2]];
  const out = [V(0, 0, -1), V(1, 0, 0), V(0, 0, 1), V(-1, 0, 0)];
  // r15 1.7: each strip is mitred at both ends, so the four meet in one closed frame (strips that stopped square left
  // open corners and looked like two flanges drawn over each other)
  for (let i = 0; i < 4; i++) {
    const p0 = t[i], p1 = t[(i + 1) % 4], o = out[i], prev = out[(i + 3) % 4], next = out[(i + 1) % 4];
    const q0 = add(p0, scl(add(o, prev), lip)), q1 = add(p1, scl(add(o, next), lip));
    const pts = [p0, p1, q1, q0];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    faces.push({ pts, n, holes: [], w: mag(sub(p1, p0)), h: lip });
  }
  sitOnTable(faces);
  return { faces, panels: faces.map((f) => ({ w: f.w, h: f.h })) };
}
export function foldScoop(w, d, h, r) {
  const faces = [];
  const rr = Math.max(0, Math.min(r, w / 2, d));
  const pts = [V(0, 0, rr), V(0, 0, d), V(w, 0, d), V(w, 0, rr)];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = 0 - (i * Math.PI) / n;
    pts.push(V(w / 2 + (w / 2) * Math.cos(a), 0, rr + rr * Math.sin(a)));
  }
  faces.push({ pts, n: V(0, 1, 0), holes: [], w, h: d });
  faces.push({ pts: [V(0, 0, d), V(w, 0, d), V(w, h, d), V(0, h, d)], n: V(0, 0, 1), holes: [], w, h });
  faces.push({ pts: [V(0, 0, 0), V(0, 0, d), V(0, h, d), V(0, h, 0)], n: V(-1, 0, 0), holes: [], w: d, h });
  faces.push({ pts: [V(w, 0, 0), V(w, h, 0), V(w, h, d), V(w, 0, d)], n: V(1, 0, 0), holes: [], w: d, h });
  return { faces, panels: [{ w, h: d }, { w: d, h }, { w: d, h }, { w, h }] };
}

function flangeFrame3(a, b, lip, z = 0) {
  // four lips around a rectangle at z
  const root = face(a, b);
  if (lip > 0) {
    attach(root, 0, 90, face(a, lip));
    attach(root, 2, 90, face(a, lip));
    attach(root, 1, 90, face(b, lip));
    attach(root, 3, 90, face(b, lip));
  }
  const m = assemble(root);
  if (z) m.faces.forEach((f) => f.pts.forEach((p) => { p[1] += z; }));
  return m;
}

// ------------------------------------------------------------------ registry for existing fold / formed presets (make() is not touched)

function coneOf(p) { return foldFrustum(p.d, p.d2 || p.d, p.h); }
function s2rOf(p) { return foldS2r(p.a, p.b, p.d, p.h, undefined, p.ox || 0, p.oy || 0); }

export const FOLD_MODELS = {
  openbox: (p) => foldOpenHem(p.len, p.wid, p.ht, p.hem || 0, p.tab || 0),
  liddedbox: (p) => foldLiddedCross(p.len, p.wid, p.ht, p.tab || 0),
  trayflat: (p) => foldOpenHem(p.len, p.wid, p.ht, 0, p.tab || 0),
  uchannel: (p) => foldU(p.len, p.web, p.leg, [], p.ends),
  cchannel: (p) => foldC(p.len, p.web, p.leg, p.flange, p.ends),
  angleiron: (p) => foldAngle(p.len, p.a, p.b),
  cuboidwrap: (p) => foldCuboid(p.len, p.wid, p.ht),
  fiveside: (p) => {
    const bot = face(p.wid, p.dep);
    attach(bot, 3, 90, face(p.dep, p.ht));
    attach(bot, 1, 90, face(p.dep, p.ht));
    const back = face(p.wid, p.ht);
    attach(back, 2, 80, face(p.wid, p.dep));         // lid, slightly open
    attach(bot, 2, 90, back);
    return assemble(bot);
  },
  totebox: (p) => foldOpenHem(p.len, p.wid, p.ht, 0, 0),
  enclfront: (p) => {
    const iw = p.iw, ih = p.ih;
    const holes = (iw > 8 && ih > 8) ? [{ pts: [[(p.w - iw) / 2, (p.h - ih) / 2], [(p.w + iw) / 2, (p.h - ih) / 2], [(p.w + iw) / 2, (p.h + ih) / 2], [(p.w - iw) / 2, (p.h + ih) / 2]] }] : [];
    const bot = face(p.w, p.d);
    const front = face(p.w, p.h, holes);
    const back = face(p.w, p.h);
    attach(back, 2, 70, face(p.w, p.d));
    attach(bot, 0, 90, front);
    attach(bot, 2, 90, back);
    attach(bot, 3, 90, face(p.d, p.h));
    attach(bot, 1, 90, face(p.d, p.h));
    return assemble(bot);
  },
  jbox: (p) => {
    const hs = p.hole > 0 ? [
      { cx: p.inset, cy: p.inset, r: p.hole / 2 }, { cx: p.s - p.inset, cy: p.inset, r: p.hole / 2 },
      { cx: p.s - p.inset, cy: p.s - p.inset, r: p.hole / 2 }, { cx: p.inset, cy: p.s - p.inset, r: p.hole / 2 },
    ] : [];
    return foldLiddedCross(p.s, p.s, p.ht, 0, hs);
  },
  drawerbox: (p) => {
    const bot = face(p.w, p.d);
    attach(bot, 3, 90, face(p.d, p.h));
    attach(bot, 1, 90, face(p.d, p.h));
    attach(bot, 2, 90, face(p.w, p.h));
    attach(bot, 0, 90, face(p.w, Math.max(p.front, p.h)));
    return assemble(bot);
  },
  shoebox: (p) => {
    const base = foldOpenBox(p.len, p.wid, p.ht);
    const lid = foldOpenBox(p.len + 2 * Math.max(0.5, p.clear), p.wid + 2 * Math.max(0.5, p.clear), p.lidht);
    lid.faces.forEach((f) => f.pts.forEach((q) => { q[0] -= 10; q[1] += p.ht + 8; }));
    return { faces: base.faces.concat(lid.faces), panels: base.panels.concat(lid.panels) };
  },
  crateflaps: (p) => {
    const bot = face(p.len, p.wid);
    const wall = face(p.len, p.ht);
    attach(wall, 2, 60, face(p.len, p.wid / 2));
    const wall2 = face(p.len, p.ht);
    attach(wall2, 2, 60, face(p.len, p.wid / 2));
    const side = face(p.wid, p.ht);
    attach(side, 2, 60, face(p.wid, p.len / 2));
    const side2 = face(p.wid, p.ht);
    attach(side2, 2, 60, face(p.wid, p.len / 2));
    attach(bot, 0, 90, wall);
    attach(bot, 2, 90, wall2);
    attach(bot, 3, 90, side);
    attach(bot, 1, 90, side2);
    return assemble(bot);
  },
  lidonly: (p) => foldOpenHem(p.len, p.wid, p.ht, 0, 0),
  s2r: s2rOf, s2roffset: s2rOf, r2s: s2rOf,
  cone: coneOf, conesteep: coneOf, coneshallow: coneOf, silocone: coneOf,
  conecentric: (p) => foldFrustum(p.d, p.d2, p.h),
  coneecc: (p) => foldFrustum(p.d, p.d2, p.h),
  r2roffset: (p) => foldFrustum(p.d, p.d2, p.h),
  cyclonehop: (p) => foldFrustum(p.d, p.d2, p.h),
  coneadapter: (p) => foldFrustum(p.d, p.d2, p.h),
  tube: (p) => foldTube(p.d, p.h),
  recttrans: (p) => foldHopper(p.a, p.b, p.a2, p.b2, p.h),
  recttransoff: (p) => foldHopper(p.a, p.b, p.a2, p.b2, p.h),
  hopperrect: (p) => foldHopper(p.a, p.b, p.a2, p.b2, p.h),
  sqrpyramid: (p) => foldHopper(p.a, p.a, Math.max(4, p.a2), Math.max(4, p.a2), p.h),
  elbow2: (p) => foldElbow(p.d, p.bend, p.n || 2, 48, p.clr),
  elbow3: (p) => foldElbow(p.d, p.bend, p.n || 3, 48, p.clr),
  elbow4: (p) => foldElbow(p.d, p.bend, p.n || 4, 48, p.clr),
  elbow5: (p) => foldElbow(p.d, p.bend, p.n || 5, 48, p.clr),
  elbow45: (p) => foldElbow(p.d, p.bend, p.n || 3, 48, p.clr),
  redelbow: (p) => foldElbow(p.d, p.bend, 3, 32, p.clr, p.d2),
  rectelbow: (p) => foldRectElbow(p.w, p.h, p.r, p.bend),
  scoop: (p) => foldScoop(p.w, p.d, p.h, p.r),
  valleyflash: (p) => foldAngle(p.len, p.leg, p.leg),
  fishmouth: (p) => foldFishmouth(p.d, p.d2 || p.d, p.skirt || 30),
  fishflat: (p) => foldPipeOnFlat(p.d, p.rise || 25, p.skirt || 30),
  saddlehole: (p) => foldSaddleHole(p.d, p.len, p.branch),
  takeoff: (p) => foldTube(p.d, p.len),
  britches: (p) => foldBritches(p.d, p.d2, p.len),
  teetemp: (p) => foldTee(p.d, p.d2, p.len, p.skirt || 25),
  ybranch: (p) => foldYBranch(p.d, p.d2, p.len, p.rise || 20),
  ductcap: (p) => foldDisc(p.d, p.hole > 8 ? p.hole : 0),
  rectcap: (p) => flangeFrame3(p.w, p.h, p.lip),
};


function circleRing(origin, xA, yA, rad, segs = 64) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i * 2 * Math.PI) / segs;
    pts.push(add(origin, add(scl(xA, rad * Math.cos(a)), scl(yA, rad * Math.sin(a)))));
  }
  return pts;
}
export function foldDisc(d, hole = 0, segs = 64) {
  const R = Math.max(0, d) / 2;
  const origin = V(0, 0, 0), xA = V(1, 0, 0), yA = V(0, 0, 1);
  const pts = circleRing(origin, xA, yA, R, segs);
  const holes = hole > 0 ? [circleRing(origin, xA, yA, hole / 2, 48)] : [];
  const area = Math.PI * (R * R - (hole / 2) * (hole / 2));
  const faces = [{ pts, n: V(0, 1, 0), holes, w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)) }];
  return { faces, panels: [{ w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)) }] };
}
function existingLip(id, p, end) {
  const lip = Number(p && p.lip) || 0;
  if (!(lip > 0.5)) return 0;
  if (id === "s2r" || id === "s2roffset" || id === "r2s") {
    if (end.key === "fl1") return lip;
    if (end.key === "fl2") return Math.round(p.ring == null ? 1 : p.ring) >= 1 ? lip : 0;
    return 0;
  }
  if (id === "fanduct") return end.key === "fl1" ? lip : 0;
  if (id === "takeoff" || id === "ductcap") return end.key === "fl1" ? lip : 0;
  if (id === "cyclonehop") return end.key === "fl1" ? lip : 0;      // r15 5.3: only the top (big-end) ring is cut
  if (id === "conecentric" || id === "coneadapter") return lip;
  return 0;
}
function endFrames(id, p) {
  const h = Number(p && (p.h != null ? p.h : p.len)) || 0;
  const x = V(1, 0, 0), z = V(0, 0, 1), up = V(0, 1, 0), dn = V(0, -1, 0);
  const pairY = (o2, ox = 0, oy = 0) => ([
    { origin: V(ox, 0, oy), xA: x, yA: z, outward: dn },
    { origin: V(ox, o2, oy), xA: x, yA: z, outward: up },
  ]);
  switch (id) {
    case "tube":
    case "cone":
    case "conesteep":
    case "coneshallow":
    case "conecentric":
    case "coneecc":
    case "r2roffset":
    case "silocone":
    case "cyclonehop":
    case "coneadapter":
    case "recttrans":
    case "recttransoff":
    case "hopperrect":
    case "hopflange":
    case "sqrpyramid":
      return pairY(h);
    case "s2r":
    case "s2roffset":
    case "r2s":
    case "fanduct":
      return pairY(h, p.ox || 0, p.oy || 0);
    case "takeoff":
      return [{ origin: V(0, p.len || 0, 0), xA: x, yA: z, outward: up }];
    case "ductcap":
    case "rectcap":
      return [{ origin: V(0, 0, 0), xA: x, yA: z, outward: dn }];
    case "elbow2":
    case "elbow3":
    case "elbow4":
    case "elbow5":
    case "elbow45":
    case "redelbow": {
      const bend = ((p.bend || 90) * Math.PI) / 180;
      const rad = (Number(p.clr) > 0 ? Number(p.clr) : 1.5 * p.d);
      const o2 = V(rad * Math.sin(bend), rad * (1 - Math.cos(bend)), 0);
      const ax = V(Math.cos(bend), Math.sin(bend), 0);
      const yA2 = V(Math.sin(bend), -Math.cos(bend), 0);
      return [
        { origin: V(0, 0, 0), xA: V(0, 0, 1), yA: V(0, 1, 0), outward: V(-1, 0, 0) },
        { origin: o2, xA: V(0, 0, 1), yA: yA2, outward: ax },
      ];
    }
    case "rectelbow": {
      const bend = (Math.max(15, p.bend || 90) * Math.PI) / 180;
      const hw = (p.w || 0) / 2;
      const rad = Math.max(p.r || 0, 8) + hw;
      const stub = Math.max(p.h || 0, 50);
      const tan = (ang) => V(Math.sin(ang), 0, Math.cos(ang));
      const centre = (ang) => V(rad * (1 - Math.cos(ang)), 0, rad * Math.sin(ang));
      const nrm = (ang) => V(Math.cos(ang), 0, -Math.sin(ang));
      const o1 = add(centre(0), scl(tan(0), -stub));
      const o2 = add(centre(bend), scl(tan(bend), stub));
      return [
        { origin: o1, xA: nrm(0), yA: V(0, 1, 0), outward: scl(tan(0), -1) },
        { origin: o2, xA: nrm(bend), yA: V(0, 1, 0), outward: tan(bend) },
      ];
    }
    case "britches":
    case "ybranch":
    case "teetemp":
      return pairY(p.len || h);
    default:
      return [];
  }
}
function flangeFace(end, p, bolts, lip, frame) {
  const outward = norm(frame.outward);
  const midOf = (thk) => add(frame.origin, scl(outward, thk / 2));
  if (end.kind === "round") {
    const dim = bolts ? flangeDims(end.d, p) : { od: end.d + 2 * lip, bore: end.d, pcd: 0, n: 0, hole: 0, thk: (Number(p.flthk) > 0.05 ? Number(p.flthk) : 8), lip };
    const mid = midOf(dim.thk);
    const outer = circleRing(mid, frame.xA, frame.yA, dim.od / 2);
    const holes = [circleRing(mid, frame.xA, frame.yA, dim.bore / 2)];
    if (bolts) {
      for (let i = 0; i < dim.n; i++) {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / dim.n;
        const c = add(mid, add(scl(frame.xA, (dim.pcd / 2) * Math.cos(a)), scl(frame.yA, (dim.pcd / 2) * Math.sin(a))));
        holes.push(circleRing(c, frame.xA, frame.yA, dim.hole / 2, 48));
      }
    }
    const area = Math.PI * ((dim.od / 2) ** 2 - (dim.bore / 2) ** 2);
    return { face: { pts: outer, n: outward, holes, w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)), flange: true, thk: dim.thk },
      panel: { w: Math.PI * ((dim.od + dim.bore) / 2), h: (dim.od - dim.bore) / 2 } };
  }
  const dim = bolts ? flangeDims(Math.min(end.w, end.h), p) : { lip, thk: (Number(p.flthk) > 0.05 ? Number(p.flthk) : 8) };
  const L = dim.lip, thk = dim.thk, mid = midOf(thk);
  const pt = (u, v) => add(mid, add(scl(frame.xA, u), scl(frame.yA, v)));
  const hw = end.w / 2 + L, hh = end.h / 2 + L, iw = end.w / 2, ih = end.h / 2;
  const outer = [pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)];
  const inner = [pt(-iw, -ih), pt(-iw, ih), pt(iw, ih), pt(iw, -ih)];
  const holes = [inner];
  if (bolts) {
    const n = dim.n, hole = dim.hole;
    const x0 = -(end.w / 2 + L / 2), y0 = -(end.h / 2 + L / 2);
    const x1 = end.w / 2 + L / 2, y1 = end.h / 2 + L / 2;
    const pw = x1 - x0, ph = y1 - y0, peri = 2 * (pw + ph);
    for (let i = 0; i < n; i++) {
      let s = (i / n) * peri, u, v;
      if (s <= pw) { u = x0 + s; v = y0; }
      else if ((s -= pw) <= ph) { u = x1; v = y0 + s; }
      else if ((s -= ph) <= pw) { u = x1 - s; v = y1; }
      else { s -= pw; u = x0; v = y1 - s; }
      holes.push(circleRing(pt(u, v), frame.xA, frame.yA, hole / 2, 48));
    }
  }
  const area = (end.w + 2 * L) * (end.h + 2 * L) - end.w * end.h;
  return { face: { pts: outer, n: outward, holes, w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)), flange: true, thk },
    panel: { w: 2 * (end.w + end.h) + 4 * L, h: L } };
}
export function addPipeFlanges3d(sh, model, p) {
  if (!model || !sh) return model;
  const ends = pipeEnds(sh.id, p);
  if (!ends || !ends.length) return model;
  const frames = endFrames(sh.id, p);
  const faces = model.faces.slice();
  const panels = (model.panels || []).slice();
  ends.forEach((end, i) => {
    const frame = frames[i] || frames[0];
    if (!frame) return;
    const bolts = flangeOn(p, end.key);
    const lip = bolts ? 0 : existingLip(sh.id, p, end);
    if (!bolts && !(lip > 0.5)) return;
    if ((end.kind === "round" && !(end.d > 8)) || (end.kind === "rect" && !(end.w > 8 && end.h > 8))) return;
    const built = flangeFace(end, p, bolts, lip, frame);
    if (!built) return;
    faces.push(built.face);
    panels.push(built.panel);
  });
  return { ...model, faces, panels };
}

export function isFoldPart(sh) {
  return !!(sh && (typeof sh.fold === "function" || FOLD_MODELS[sh.id]));
}
// opts.fold: how far to fold (1 folded, the default; 0 flat) for the Unfold slider (r15 5.7)
export function foldModel(sh, p, opts = {}) {
  if (!sh) return null;
  const t = Number(opts && opts.fold);
  FOLD.t = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 1;
  FOLD.used = false;
  try {
    const mid = typeof sh.fold === "function" ? sh.fold(p) : (FOLD_MODELS[sh.id] ? FOLD_MODELS[sh.id](p) : null);
    const m = mid ? addPipeFlanges3d(sh, mid, p) : null;
    if (m) m.unfoldable = FOLD.used;
    return m;
  } catch (e) { return null; } finally { FOLD.t = 1; FOLD.used = false; }
}

// r15 5.7: the part's overall sizes and where to label them on the 3D view
export function modelDims(model) {
  const fs = ((model && model.faces) || []).filter((f) => !f.ghost);
  if (!fs.length) return { x: 0, y: 0, z: 0, box: null };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of fs) for (const q of f.pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  return { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2], box: [lo, hi] };
}
const mmText = (v) => `${Math.round(v * 10) / 10} mm`;
export function dimLabels(model, cam, w, h, pad = Math.max(16, Math.round(Math.min(w, h) * 0.06)), sizes) {
  const d = modelDims(model);
  if (!d.box) return [];
  const sz = sizes || d, [lo, hi] = d.box;
  const fs = model.faces.filter((f) => !f.ghost);
  const { xy } = projector(fs.length ? fs : model.faces, cam, w, h, pad);
  const depth = (p) => rotCam(p, cam)[2];
  // bottom corners; the edges along x and z nearest the viewer, and the upright at the left-most bottom corner
  const zNear = depth(V((lo[0] + hi[0]) / 2, lo[1], hi[2])) > depth(V((lo[0] + hi[0]) / 2, lo[1], lo[2])) ? hi[2] : lo[2];
  const xNear = depth(V(hi[0], lo[1], (lo[2] + hi[2]) / 2)) > depth(V(lo[0], lo[1], (lo[2] + hi[2]) / 2)) ? hi[0] : lo[0];
  const corners = [V(lo[0], lo[1], lo[2]), V(hi[0], lo[1], lo[2]), V(lo[0], lo[1], hi[2]), V(hi[0], lo[1], hi[2])];
  const left = corners.reduce((a, b) => (xy(b)[0] < xy(a)[0] ? b : a));
  const edges = [
    { a: V(lo[0], lo[1], zNear), b: V(hi[0], lo[1], zNear), v: sz.x },
    { a: V(xNear, lo[1], lo[2]), b: V(xNear, lo[1], hi[2]), v: sz.z },
    { a: left, b: V(left[0], hi[1], left[2]), v: sz.y },
  ];
  const c = xy(V((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2));
  return edges.filter((e) => e.v > 0.05).map((e) => {
    const A = xy(e.a), B = xy(e.b), m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    let ox = m[0] - c[0], oy = m[1] - c[1];
    const L = Math.hypot(ox, oy) || 1;
    ox /= L; oy /= L;
    return { text: mmText(e.v), x: m[0] + ox * 16, y: m[1] + oy * 16, a: [A[0] + ox * 7, A[1] + oy * 7], b: [B[0] + ox * 7, B[1] + oy * 7] };
  });
}
function drawDims(ctx, cv, model, cam, w, h, pad) {
  const base = model.base || model, d = modelDims(base);
  const labels = dimLabels(model, cam, w, h, pad, d);
  cv._dims = labels;
  if (w < 220 || !labels.length) return;
  ctx.save();
  ctx.strokeStyle = "rgba(43, 49, 56, 0.7)";   // neutral ink: blue means "the template you cut" ctx.lineWidth = 1;
  ctx.font = "600 11px Barlow, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const l of labels) {
    ctx.beginPath(); ctx.moveTo(l.a[0], l.a[1]); ctx.lineTo(l.b[0], l.b[1]); ctx.stroke();
    const tw = ctx.measureText(l.text).width + 8;
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillRect(l.x - tw / 2, l.y - 8, tw, 16);
    ctx.fillStyle = "#2b3138"; ctx.fillText(l.text, l.x, l.y);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ projection / drawing

export const DEFAULT_CAM = { yaw: 0.85, pitch: 0.52 };

const KEY_L = norm(V(0.42, 0.78, 0.48));
const FILL_L = norm(V(-0.55, 0.28, 0.22));
const SHARP_COS = Math.cos((35 * Math.PI) / 180);   // dihedral >= 35° is a sharp edge
const SMOOTH_COS = Math.cos((75 * Math.PI) / 180);  // curved shells keep facets unstroken
const STEEL = [188, 196, 204], EDGE = "#2c333c";

function wrinkleLimit(f, g) {
  if (f && g && f.gore != null && g.gore != null && f.gore !== g.gore) return SHARP_COS;
  if (f && g && f.smooth && g.smooth) return -1;
  return (f && g && (f.smooth || g.smooth)) ? SMOOTH_COS : SHARP_COS;
}
function isSharpPair(f, g) {
  if (f && g && f.gore != null && g.gore != null && f.gore !== g.gore) return true;
  if (f && g && f.smooth && g.smooth) return false;
  return dot(f.n, g.n) < wrinkleLimit(f, g);
}

function rotCam(p, cam) {
  const y = cam.yaw, x = cam.pitch;
  const cy = Math.cos(y), sy = Math.sin(y), cx = Math.cos(x), sx = Math.sin(x);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cx - z1 * sx;
  const z2 = p[1] * sx + z1 * cx;
  return [x1, y2, z2];
}

function boundsOf(faces, cam) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of faces) for (const p of f.pts) {
    const q = rotCam(p, cam);
    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
    z0 = Math.min(z0, q[2]); z1 = Math.max(z1, q[2]);
  }
  return [x0, y0, x1, y1, z0, z1];
}

function qk(n) {
  const v = Math.round(Number(n) * 1e4) / 1e4;
  return Object.is(v, -0) ? 0 : v;
}
function vertKey(p) {
  return `${qk(p[0])},${qk(p[1])},${qk(p[2])}`;
}

function shadeN(n) {
  const nd = n[2] < 0 ? scl(n, -1) : n;
  const key = Math.max(0, dot(nd, KEY_L));
  const fill = Math.max(0, dot(nd, FILL_L));
  const half = norm(add(KEY_L, V(0, 0, 1)));
  const spec = Math.pow(Math.max(0, dot(nd, half)), 28);
  return Math.max(0.2, Math.min(1.18, 0.24 + 0.66 * key + 0.22 * fill + 0.26 * spec));
}

const ACCENT_RGB = [38, 122, 196];              // the app's accent (CAD blue), a touch lighter so it still shades
function accentRgb(c) {
  const k = Math.max(0.3, Math.min(1.15, c));
  return `rgb(${Math.round(ACCENT_RGB[0] * k)},${Math.round(ACCENT_RGB[1] * k)},${Math.round(ACCENT_RGB[2] * k)})`;
}
function steelRgb(c) {
  const k = Math.max(0.18, Math.min(1.15, c));
  return `rgb(${Math.round(STEEL[0] * k)},${Math.round(STEEL[1] * k)},${Math.round(STEEL[2] * k)})`;
}

function attachSmoothNormals(faces) {
  const buckets = new Map();
  for (const f of faces) {
    f.vn = f.pts.map(() => f.n);
    for (const p of f.pts) {
      const k = vertKey(p);
      let list = buckets.get(k);
      if (!list) buckets.set(k, list = []);
      list.push(f);
    }
  }
  for (const f of faces) {
    const fn = f.n;
    f.vn = f.pts.map((p) => {
      const neigh = buckets.get(vertKey(p)) || [f];
      let ax = 0, ay = 0, az = 0, n = 0;
      for (const g of neigh) {
        if (dot(fn, g.n) >= wrinkleLimit(f, g)) { ax += g.n[0]; ay += g.n[1]; az += g.n[2]; n++; }
      }
      if (n < 2) return fn;
      return norm(V(ax, ay, az));
    });
  }
}

function edgeKey(a, b) {
  const ka = vertKey(a), kb = vertKey(b);
  return ka < kb ? ka + "|" + kb : kb + "|" + ka;
}

function collectEdges(faces) {
  const map = new Map();
  for (const f of faces) {
    const pts = f.pts, n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const k = edgeKey(a, b);
      let e = map.get(k);
      if (!e) map.set(k, e = { a, b, faces: [] });
      e.faces.push(f);
    }
  }
  return [...map.values()];
}

function projector(faces, cam, w, h, pad = 10) {
  const [x0, y0, x1, y1] = boundsOf(faces, cam);
  const bw = Math.max(1e-6, x1 - x0), bh = Math.max(1e-6, y1 - y0);
  const s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = (w - bw * s) / 2 - x0 * s, oy = (h + bh * s) / 2 + y0 * s;
  const xy = (p) => {
    const q = rotCam(p, cam);
    return [ox + q[0] * s, oy - q[1] * s, q[2]];
  };
  return { xy, s, ox, oy };
}

function projectFaces(faces, cam, w, h, pad = 10) {
  attachSmoothNormals(faces);
  const { xy } = projector(faces, cam, w, h, pad);
  const out = faces.map((f) => {
    const qs = f.pts.map((p) => rotCam(p, cam));
    const depth = qs.reduce((a, p) => a + p[2], 0) / qs.length;
    const nCam = rotCam(f.n, cam);
    const vnCam = (f.vn || f.pts.map(() => f.n)).map((v) => rotCam(v, cam));
    const lits = vnCam.map(shadeN);
    const lit = lits.reduce((a, v) => a + v, 0) / lits.length;
    const path = qs.map((p, i) => {
      const q = xy(f.pts[i]);
      return [q[0], q[1]];
    });
    const holes = (f.holes || []).map((ring) => ring.map((p) => {
      const q = xy(p);
      return [q[0], q[1]];
    }));
    return { path, holes, depth, lit, lits, back: nCam[2] < -0.02, nCam, src: f };
  });
  out.sort((a, b) => a.depth - b.depth);
  return out;
}

function fillShaded(ctx, path, holes, lits, back, src) {
  if (path.length < 3) return;
  const rgb = src && src.accent ? accentRgb : steelRgb;
  ctx.beginPath();
  path.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.closePath();
  for (const hole of holes || []) {
    if (hole.length < 3) continue;
    hole.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
  }
  const cols = (lits && lits.length) ? lits : [1];
  let lo = 0, hi = 0;
  for (let i = 1; i < cols.length; i++) {
    if (cols[i] < cols[lo]) lo = i;
    if (cols[i] > cols[hi]) hi = i;
  }
  const spread = cols[hi] - cols[lo];
  if (!back && spread > 0.04 && path[lo] && path[hi]) {
    const g = ctx.createLinearGradient(path[lo][0], path[lo][1], path[hi][0], path[hi][1]);
    g.addColorStop(0, rgb(cols[lo]));
    g.addColorStop(1, rgb(cols[hi]));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = rgb(back ? Math.min(0.5, (cols[0] || 0.5) * 0.72) : (cols.reduce((a, v) => a + v, 0) / cols.length));
  }
  ctx.fill("evenodd");
}

function drawGroundShadow(ctx, faces, cam, w, h, pad) {
  const { xy } = projector(faces, cam, w, h, pad);
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const f of faces) for (const p of f.pts) {
    minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
    minz = Math.min(minz, p[2]); maxz = Math.max(maxz, p[2]);
  }
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  const rx = Math.max(4, (maxx - minx) / 2) * 1.18, rz = Math.max(4, (maxz - minz) / 2) * 1.18;
  ctx.save();
  ctx.filter = "blur(7px)";
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#1a222c";
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const q = xy(V(cx + rx * Math.cos(a), 0, cz + rz * Math.sin(a)));
    i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSharpEdges(ctx, faces, cam, w, h, pad, strokeW, ghostPass = false) {
  const { xy } = projector(faces, cam, w, h, pad);
  ctx.save();
  ctx.strokeStyle = ghostPass ? "rgba(70, 90, 110, 0.55)" : EDGE;
  ctx.lineWidth = ghostPass ? strokeW * 0.8 : strokeW;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (ghostPass) ctx.setLineDash([3, 2.2]);
  ctx.beginPath();
  for (const e of collectEdges(faces)) {
    const walls = e.faces.filter((f) => f.holeWall);
    if (walls.length === e.faces.length) continue;
    const allGhost = e.faces.every((f) => f.ghost);
    const anyGhost = e.faces.some((f) => f.ghost);
    if (ghostPass ? !allGhost : allGhost) continue;
    if (!ghostPass && anyGhost && allGhost) continue;
    const ncs = e.faces.map((f) => rotCam(f.n, cam));
    let sharp = e.faces.length !== 2;
    if (e.faces.length === 2) sharp = isSharpPair(e.faces[0], e.faces[1]);
    const front = ncs.map((n) => n[2] > 0.0);
    const sil = e.faces.length === 1 ? front[0] : (front[0] !== front[1]);
    if (!sharp && !sil) continue;
    if (front.every((v) => !v) && !sil) continue;
    const a = xy(e.a), b = xy(e.b);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawFoldCanvas(cv, model, cam = DEFAULT_CAM) {
  if (!cv || !model || !model.faces || !model.faces.length) return;
  const dpr = Math.max(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const w = cv.clientWidth || cv.width || 320, h = cv.clientHeight || cv.height || 180;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#eef3f7");
  bg.addColorStop(1, "#cfd8e2");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const pad = Math.max(16, Math.round(Math.min(w, h) * 0.06));
  const solidFaces = model.faces.filter((f) => !f.ghost);
  const ghostFaces = model.faces.filter((f) => f.ghost);
  drawGroundShadow(ctx, solidFaces.length ? solidFaces : model.faces, cam, w, h, pad);
  if (ghostFaces.length) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    for (const p of projectFaces(ghostFaces, cam, w, h, pad)) fillShaded(ctx, p.path, p.holes, p.lits, p.back, p.src);
    ctx.restore();
    drawSharpEdges(ctx, ghostFaces, cam, w, h, pad, Math.max(0.9, Math.min(w, h) / 280), true);
  }
  const polys = projectFaces(solidFaces.length ? solidFaces : model.faces, cam, w, h, pad);
  for (const p of polys) fillShaded(ctx, p.path, p.holes, p.lits, p.back, p.src);
  drawSharpEdges(ctx, solidFaces.length ? solidFaces : model.faces, cam, w, h, pad, Math.max(0.9, Math.min(w, h) / 280));
  drawDims(ctx, cv, model, cam, w, h, pad);              // r15 5.7
}

export function foldThumbSvg(model, w = 96, h = 72, cam = DEFAULT_CAM) {
  if (!model || !model.faces || !model.faces.length) return "";
  const pad = 6;
  const polys = projectFaces(model.faces, cam, w, h, pad);
  const { xy } = projector(model.faces, cam, w, h, pad);
  let body = "";
  for (const p of polys) {
    const ring = (pts) => pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ") + "Z";
    const fill = (p.src && p.src.accent ? accentRgb : steelRgb)(p.back ? 0.5 : p.lit);
    const op = p.src && p.src.ghost ? ' fill-opacity="0.32"' : "";
    body += `<path d="${ring(p.path)}${p.holes.map(ring).join("")}" fill="${fill}" fill-rule="evenodd"${op}/>`;
  }
  let edges = "";
  for (const e of collectEdges(model.faces)) {
    if (e.faces.every((f) => f.holeWall)) continue;
    const ncs = e.faces.map((f) => rotCam(f.n, cam));
    let sharp = e.faces.length !== 2;
    if (e.faces.length === 2) sharp = isSharpPair(e.faces[0], e.faces[1]);
    const front = ncs.map((n) => n[2] > 0);
    const sil = e.faces.length === 1 ? front[0] : (front[0] !== front[1]);
    if (!sharp && !sil) continue;
    if (front.every((v) => !v) && !sil) continue;
    const a = xy(e.a), b = xy(e.b);
    edges += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  }
  if (edges) body += `<path d="${edges}" fill="none" stroke="#2c333c" stroke-width="0.7" stroke-linejoin="round"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`;
}

// Persist orbit per part so re-painting the form doesn't snap the view back.
const orbit = { yaw: DEFAULT_CAM.yaw, pitch: DEFAULT_CAM.pitch, key: "" };
// Phone "Folded view" starts collapsed; remember if the user opened it this session.
const phoneFold = { open: false };

function isPhoneFold() {
  return typeof document !== "undefined" && (
    document.body.classList.contains("phone-ui") || !document.body.classList.contains("laptop-ui")
  );
}

function modelForCanvas(canvas) {
  const lb = canvas && canvas.closest("#fold3dLightbox");
  if (lb && lb._model) return lb._model;
  const h = canvas && canvas.closest(".fold3d-host");
  return h && h._model;
}

function redrawFoldCanvases(model) {
  if (!model || typeof document === "undefined") return;
  for (const cv of document.querySelectorAll("canvas.fold3d")) {
    const m = modelForCanvas(cv) || model;
    if (m) drawFoldCanvas(cv, m, orbit);
  }
}

function closeFoldLightbox() {
  const ov = typeof document !== "undefined" && document.getElementById("fold3dLightbox");
  if (ov) { ov.hidden = true; ov._model = null; }
}

function openFoldLightbox(host) {
  if (typeof document === "undefined" || !host || !host._model || isPhoneFold()) return;
  let ov = document.getElementById("fold3dLightbox");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "fold3dLightbox";
    ov.className = "fold3d-lb";
    ov.innerHTML = `<div class="fold3d-lb-inner" role="dialog" aria-label="Enlarged folded 3D view"><button type="button" class="fold3d-lb-close" aria-label="Close">✕</button><canvas class="fold3d fold3d-lb-canvas" width="1280" height="800" aria-label="Folded 3D view, drag to turn"></canvas></div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov) closeFoldLightbox(); });
    ov.querySelector(".fold3d-lb-close").addEventListener("click", closeFoldLightbox);
    bindOrbit(ov.querySelector("canvas.fold3d"));
    if (!window.__fold3dEsc) {
      window.__fold3dEsc = true;
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeFoldLightbox(); });
    }
  }
  ov._model = host._model;
  ov.hidden = false;
  const cv = ov.querySelector("canvas.fold3d");
  requestAnimationFrame(() => drawFoldCanvas(cv, ov._model, orbit));
}

export function mountFoldView(host, sh, params) {
  if (!host) return;
  const full = foldModel(sh, params);
  const key0 = sh && sh.id;
  if (host._foldKey !== key0) { host._foldKey = key0; host._fold = 1; }   // a new part starts folded
  host._sh = sh; host._params = params;
  const amt = full && full.unfoldable ? (host._fold != null ? host._fold : 1) : 1;
  const mid = amt < 1 ? foldModel(sh, params, { fold: amt }) : full;
  const model = viewModel(mid, params);
  if (!model || !model.faces.length) { host.replaceChildren(); host.hidden = true; return; }
  host.hidden = false;
  const key = sh && sh.id;
  if (orbit.key !== key) { orbit.key = key; orbit.yaw = DEFAULT_CAM.yaw; orbit.pitch = DEFAULT_CAM.pitch; }
  const phone = isPhoneFold();
  let canvas = host.querySelector("canvas.fold3d");
  if (!canvas) {
    const thumb = foldThumbSvg(model, 56, 40);
    const open = phone ? (phoneFold.open ? " open" : "") : " open";
    host.innerHTML = `<details class="fold3d-box"${open}><summary class="fold3d-sum"><span class="fold3d-sum-label">Folded view</span><span class="fold3d-mini">${thumb}</span></summary><div class="fold3d-wrap"><canvas class="fold3d" width="720" height="480" aria-label="Folded 3D view, drag to turn. The drawing is the flat pattern you cut."></canvas><button type="button" class="fold3d-expand">Expand</button><label class="fold3d-unfold" hidden><span>Unfold</span><input type="range" min="0" max="100" step="1" value="100" aria-label="Unfold: 0 is flat, 100 is folded"></label><p class="fold3d-cap"></p></div></details>`;
    canvas = host.querySelector("canvas.fold3d");
    bindOrbit(canvas);
    const box = host.querySelector("details.fold3d-box");
    if (box) box.addEventListener("toggle", () => {
      if (isPhoneFold()) phoneFold.open = box.open;
      if (box.open && host._model) drawFoldCanvas(canvas, host._model, orbit);
    });
    const exp = host.querySelector(".fold3d-expand");
    if (exp) exp.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openFoldLightbox(host); });
    const sl = host.querySelector(".fold3d-unfold input");
    if (sl) sl.addEventListener("input", () => {
      host._fold = Math.max(0, Math.min(1, Number(sl.value) / 100));
      const m = viewModel(foldModel(host._sh, host._params, { fold: host._fold }), host._params);
      if (!m) return;
      host._model = m;
      drawFoldCanvas(canvas, m, orbit);
    });
    if (typeof ResizeObserver !== "undefined" && !host._foldRo) {
      host._foldRo = new ResizeObserver(() => {
        if (host._model) {
          const cv = host.querySelector("canvas.fold3d");
          if (cv && cv.getClientRects().length) drawFoldCanvas(cv, host._model, orbit);
        }
      });
      const wrap = host.querySelector(".fold3d-wrap");
      if (wrap) host._foldRo.observe(wrap);
    }
  } else {
    const mini = host.querySelector(".fold3d-mini");
    if (mini) mini.innerHTML = foldThumbSvg(model, 56, 40);
  }
  drawFoldCanvas(canvas, model, orbit);
  host._model = model;
  const unf = host.querySelector(".fold3d-unfold");
  if (unf) {
    unf.hidden = !(full && full.unfoldable);
    const inp = unf.querySelector("input");
    if (inp) inp.value = String(Math.round(amt * 100));
  }
  // r15 5.4: a pipe template says what the colours are
  const cap = host.querySelector(".fold3d-cap");
  if (cap) cap.textContent = sh && sh.template
    ? "Template — wrap it round the pipe to mark the cut. Blue: the template you cut; grey: the pipe. Drag to turn."
    : "Folded view — drag to turn. The drawing is the flat pattern you cut.";
  host._sh = sh;
  host._params = params;
  const lb = typeof document !== "undefined" && document.getElementById("fold3dLightbox");
  if (lb && !lb.hidden) { lb._model = model; const lbc = lb.querySelector("canvas.fold3d"); if (lbc) drawFoldCanvas(lbc, model, orbit); }
}

function bindOrbit(canvas) {
  if (!canvas || canvas._foldOrbit) return;
  canvas._foldOrbit = true;
  let dragging = false, lx = 0, ly = 0;
  const redraw = () => {
    const m = modelForCanvas(canvas);
    if (m) redrawFoldCanvases(m);
  };
  const down = (x, y) => { dragging = true; lx = x; ly = y; canvas.style.cursor = "grabbing"; };
  const move = (x, y) => {
    if (!dragging) return;
    orbit.yaw += (x - lx) * 0.01;
    orbit.pitch = Math.max(-1.2, Math.min(1.2, orbit.pitch + (y - ly) * 0.01));
    lx = x; ly = y; redraw();
  };
  const up = () => { dragging = false; canvas.style.cursor = "grab"; };
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); down(e.clientX, e.clientY); });
  canvas.addEventListener("pointermove", (e) => { if (dragging) { e.preventDefault(); move(e.clientX, e.clientY); } });
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("lostpointercapture", up);
}

// Combined tile: 3D as the main picture, with a small flat-pattern inset so both are visible.
export function foldTileSvg(sh, flatSvg, w = 96, h = 72, params) {
  const model = viewModel(foldModel(sh, params), params);
  if (!model) return flatSvg || "";
  const main = foldThumbSvg(model, w, h);
  if (!flatSvg) return main;
  // nest the flat thumb in the lower-left
  const iw = 30, ih = 22, ix = 3, iy = h - ih - 3;
  const inner = String(flatSvg).replace(/<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" class="fold-thumb">
    ${main.replace(/<\/?svg[^>]*>/g, "")}
    <rect x="${ix - 1}" y="${iy - 1}" width="${iw + 2}" height="${ih + 2}" rx="2" fill="#fff" stroke="#9aa3ad" stroke-width="0.8"/>
    <g transform="translate(${ix} ${iy})">${inner.replace(/viewBox="[^"]*"/, "").replace(/width="[^"]*"/, `width="${iw}"`).replace(/height="[^"]*"/, `height="${ih}"`)}</g>
  </svg>`;
}

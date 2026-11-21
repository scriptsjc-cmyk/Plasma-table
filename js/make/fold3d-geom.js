// r15 8.5 (split from fold3d.js): the 3D builders - faces, folds, rolled and pipe parts - and thickening for the view.
// The flat pattern from shape.make() is still what gets cut. This only builds the folded result.
import { segmentsFor, pipeSaddle, coneDevelopment } from "./duct.js";
import { FOLD } from "./flat3d.js";
import { jobThickness } from "./bends.js";
import { V, add, sub, scl, dot, cross, mag, norm } from "./vec3.js";
import { reducingElbow } from "./redelbow.js";

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
// r15 7.5: each point moves once, holes with their faces. (Faces and their edge caps share point arrays, so a shared point
// was moved two or three times, and holes were left where they were: harmless only when the shift was 0.)
function sitOnTable(faces) {
  let y0 = Infinity;
  for (const f of faces) for (const p of f.pts) y0 = Math.min(y0, p[1]);
  if (Number.isFinite(y0) && Math.abs(y0) > 1e-9) {
    const done = new Set();
    for (const f of faces) for (const ring of [f.pts, ...(f.holes || [])]) for (const p of ring) {
      if (!Array.isArray(p) || done.has(p)) continue;
      done.add(p); p[1] -= y0;
    }
  }
}

export function hole(cx, cy, d) { return d > 0 ? { cx, cy, r: d / 2 } : null; }
export const holes = (...hs) => hs.filter(Boolean);

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
    // r15 5.10: a folded face (side ±1) is thickened from its drawn surface toward the inside of its bends; others about the middle
    const tt = Number(f.thk) > 0.05 ? Number(f.thk) : t;
    const hi = f.side > 0 ? tt : f.side < 0 ? 0 : tt / 2, lo = tt - hi;   // front at +hi along n, back at -lo
    const vns = (f.vn && f.vn.length === f.pts.length) ? f.vn.map(norm) : f.pts.map(() => nrm);
    const offV = (pts, s) => (pts || []).map((p, i) => add(p, scl(vns[i] || nrm, s)));
    const offN = (pts, s) => (pts || []).map((p) => add(p, scl(nrm, s)));
    const front = offV(f.pts, hi), back = offV(f.pts, -lo);
    const fHoles = (f.holes || []).map((ring) => offN(ring, hi));
    const bHoles = (f.holes || []).map((ring) => offN(ring, -lo).reverse());
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
      const rh = offN(ring, hi), rb = offN(ring, -lo), nh = ring.length;
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
export function viewModel(model, p) {
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
// r15 7.5: the round duct take-off from its cut pieces: the saddle collar (the cut saddle wrapped round the branch, its
// shaped edge down on the main duct, longest at the sides), the tube blank on top of it, and the
// flange ring (added with the pipe ends). The main duct is drawn as a ghost so its Ø shows. (It was the tube alone.)
export function takeoffCollarH(p) { const s = pipeSaddle(p.d, Math.max(p.d2, p.d), 20); return s ? s.h : 0; }
export function foldTakeoff(p) {
  const d = p.d, D = Math.max(p.d2, d), r = d / 2, R = D / 2, s = pipeSaddle(d, D, 20, 48);
  const faces = [];
  const H = s ? s.h : 0;
  if (s) {
    const n = 48, curve = s.pts.slice(0, n + 1);
    const at = (i, y) => { const th = -Math.PI + (2 * Math.PI * i) / n; return V(r * Math.sin(th), y, r * Math.cos(th)); };
    for (let i = 0; i < n; i++) {
      const pts = [at(i, curve[i][1]), at(i + 1, curve[i + 1][1]), at(i + 1, H), at(i, H)];
      let nn = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
      const mid = (2 * i + 1) * Math.PI / n - Math.PI, out = V(Math.sin(mid), 0, Math.cos(mid));
      if (dot(nn, out) < 0) { pts.reverse(); nn = scl(nn, -1); }
      faces.push({ pts, n: nn, holes: [], w: (Math.PI * d) / n, h: H, smooth: true });
    }
  }
  for (const f of foldTube(d, p.len).faces) faces.push({ ...f, pts: f.pts.map((q) => V(q[0], q[1] + H, q[2])) });
  // the main duct the take-off sits on (not cut here): it runs across the collar's sides (x = r·sinθ is across it), its
  // axis √(R² − r²) below the collar's lowest points, so the shaped edge lies on it (r15 7.5-saddle)
  const yAxis = -Math.sqrt(Math.max(0, R * R - r * r)), L = Math.max(2.5 * d, D);
  faces.push(...tubeFaces(D, V(0, yAxis, -L / 2), V(0, 0, 1), L, 48, { ghost: true }));
  return { faces, panels: [{ w: Math.PI * d, h: H }, { w: Math.PI * d, h: p.len }] };
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
// r15 7.5: the wrap exactly as cut (πd × len, the round hole of the branch Ø in its middle) rolled onto the header. Away
// from the hole one facet per step round; round the hole small cells, kept when their middle is outside the cut circle,
// so the hole is the cut hole's size. The hole is declared as an opening (its edge is the cells left out).
export function foldSaddleHole(d, len, branch, segs = 96) {
  const R = Math.max(4, d / 2), r = Math.max(2, branch / 2), w = Math.PI * d, L = Math.max(1, len);
  const hole = 2 * r + 8 <= Math.min(w, L);                 // the cut has no hole otherwise
  const s0 = w / 2, yc = L / 2, faces = [];
  // flat (s along the wrap, y along the pipe) → header along +Y, the hole's middle (s = w/2) facing +X
  const P = (sv, y) => { const th = (sv / w) * 2 * Math.PI - Math.PI; return V(R * Math.cos(th), y, R * Math.sin(th)); };
  const quad = (sa, sb, ya, yb) => {
    const pts = [P(sa, ya), P(sb, ya), P(sb, yb), P(sa, yb)], n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    const out = norm(V(pts[0][0] + pts[1][0], 0, pts[0][2] + pts[1][2]));
    faces.push(dot(n, out) >= 0 ? { pts, n, holes: [], w: sb - sa, h: yb - ya, smooth: true } : { pts: pts.slice().reverse(), n: scl(n, -1), holes: [], w: sb - sa, h: yb - ya, smooth: true });
  };
  const ds = w / segs, rows = Math.max(12, Math.ceil((2 * r) / 3));
  for (let i = 0; i < segs; i++) {
    const sa = i * ds, sb = sa + ds;
    if (!hole || sb <= s0 - r || sa >= s0 + r) { quad(sa, sb, 0, L); continue; }
    const subs = 2, dy = (2 * r) / rows;
    quad(sa, sb, 0, yc - r); quad(sa, sb, yc + r, L);
    for (let k = 0; k < subs; k++) for (let j = 0; j < rows; j++) {
      const a0 = sa + (k * ds) / subs, a1 = a0 + ds / subs, y0 = yc - r + j * dy, y1 = y0 + dy;
      const cs = (a0 + a1) / 2 - s0, cy = (y0 + y1) / 2 - yc;
      if (cs * cs + cy * cy >= r * r) quad(a0, a1, y0, y1);
    }
  }
  // ghost branch on the +X side, sitting in the hole
  const reach = Math.max(40, r * 1.6);
  const out = faces.concat(hole ? fishmouthBranch(branch, V(R + reach + 40, yc, 0), V(-1, 0, 0), V(0, 0, 0), V(0, 1, 0), d, reach, 48, { ghost: true }).faces : []);
  sitOnTable(out);
  return { faces: out, panels: [{ w, h: L }], openings: hole ? 1 : 0 };
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
// The lobster-back elbows' (elbow2–5) flange frames still use these mitred-end sizes (with d2 = d there is no cone).
export function redElbowDims(p) {
  const ta = Math.tan((((Number(p.bend) || 90) * Math.PI) / 180) / 4);
  const clr = Number(p.clr) > 0 ? Number(p.clr) : 1.5 * p.d, R = p.d / 2, r = (p.d2 || p.d) / 2;
  const cd = coneDevelopment(p.d, p.d2 || p.d, p.h);
  const hc = cd && cd.Ro > cd.Ri + 1 && cd.Ro <= 2500 ? p.h : 0;          // the cut has no cone otherwise
  return { ta, R, r, hc, L1: Math.max(clr, R + 1) * ta, L2: Math.max(clr, r + 1) * ta };
}
// r15 7.5-redelbow (Josh 21 Nov): the reducing elbow is built from its cut gores (js/make/redelbow.js): each gore's
// grid is its flat piece wrapped onto the cone and placed, so the 3D is exactly what is cut.
export function foldRedElbow(p, segs = 48) {
  const e = reducingElbow(p), faces = [];
  if (!e.ok) return { faces, panels: [] };
  e.pieces.forEach((pc, k) => {
    const g = pc.grid(segs, 4);
    for (let i = 0; i < segs; i++) for (let j = 0; j < 4; j++) {
      const pts = [g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]];
      const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
      faces.push({ pts, n, holes: [], w: mag(sub(pts[1], pts[0])), h: mag(sub(pts[3], pts[0])), smooth: true, gore: k });
    }
  });
  return { faces, panels: e.pieces.map((pc) => ({ w: Math.max(...pc.flat.map((q) => q[0])), h: Math.max(...pc.flat.map((q) => q[1])) })) };
}
// r15 7.5: built from the cut pieces: two cheeks (sectors from the throat radius out by the duct height, 16 steps like the
// cut) set the cheek spacing w apart, and the throat and back wrappers rolled between them. (It used to bend a w-deep,
// h-high section, sizes swapped, with straight stubs on both ends that are not cut.)
export const rectElbowDims = (w, h, r, bendDeg) => ({ ang: (Math.min(180, Math.max(20, Number(bendDeg) || 90)) * Math.PI) / 180, ri: Math.max(10, Number(r) || 0), ro: Math.max(10, Number(r) || 0) + h, w });
export function foldRectElbow(w, h, r, bendDeg) {
  const { ang, ri, ro } = rectElbowDims(w, h, r, bendDeg), segs = 16, faces = [];
  const P = (rad, a, y) => V(rad * Math.cos(a), y, rad * Math.sin(a));
  const push = (pts, want, extra = {}) => {
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    if (dot(n, want) < 0) { pts = pts.slice().reverse(); n = scl(n, -1); }
    faces.push({ pts, n, holes: [], w: mag(sub(pts[1], pts[0])), h: mag(sub(pts[3], pts[0])), ...extra });
  };
  for (let i = 0; i < segs; i++) {
    const a0 = (i * ang) / segs, a1 = ((i + 1) * ang) / segs, am = (a0 + a1) / 2, rad = V(Math.cos(am), 0, Math.sin(am));
    push([P(ri, a0, 0), P(ro, a0, 0), P(ro, a1, 0), P(ri, a1, 0)], V(0, -1, 0));            // cheek on the table
    push([P(ri, a0, w), P(ro, a0, w), P(ro, a1, w), P(ri, a1, w)], V(0, 1, 0));             // cheek on top
    push([P(ri, a0, 0), P(ri, a1, 0), P(ri, a1, w), P(ri, a0, w)], scl(rad, -1), { smooth: true });   // throat wrapper
    push([P(ro, a0, 0), P(ro, a1, 0), P(ro, a1, w), P(ro, a0, w)], rad, { smooth: true });            // back wrapper
  }
  sitOnTable(faces);
  return { faces, panels: [{ w: ro - ri, h: ro * ang }, { w: ro - ri, h: ro * ang }, { w, h: ri * ang }, { w, h: ro * ang }] };
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
// ox / oy move the top opening as rectangularTransition does (cut y is 3D z). r15 7.5: the offset one used to ignore ox.
export function foldHopper(a, b, a2, b2, h, ox = 0, oy = 0) {
  const faces = [];
  const bot = [[-a / 2, 0, -b / 2], [a / 2, 0, -b / 2], [a / 2, 0, b / 2], [-a / 2, 0, b / 2]];
  const top = [[ox - a2 / 2, h, oy - b2 / 2], [ox + a2 / 2, h, oy - b2 / 2], [ox + a2 / 2, h, oy + b2 / 2], [ox - a2 / 2, h, oy + b2 / 2]];
  for (let i = 0; i < 4; i++) {
    const pts = [bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    const w = mag(sub(bot[(i + 1) % 4], bot[i]));
    const hh = mag(sub(top[i], bot[i]));
    faces.push({ pts, n, holes: [], w, h: hh });
  }
  return { faces, panels: faces.map((f) => ({ w: f.w, h: f.h })) };
}
// ends (optional, r15 7.5): per top edge (front −Z, right +X, back +Z, left −X) [s0, s1], where the strip's outer edge
// starts and ends along the edge, measured from its two corners (negative = past the corner), as the cut lip has them.
// Without it the four strips are mitred into one closed frame.
export function addTopFlanges(model, a2, b2, h, lip, ends) {
  if (!(lip > 0)) return model;
  const faces = model.faces.slice();
  const t = [[-a2 / 2, h, -b2 / 2], [a2 / 2, h, -b2 / 2], [a2 / 2, h, b2 / 2], [-a2 / 2, h, b2 / 2]];
  const out = [V(0, 0, -1), V(1, 0, 0), V(0, 0, 1), V(-1, 0, 0)];
  // r15 1.7: each strip is mitred at both ends, so the four meet in one closed frame (strips that stopped square left
  // open corners and looked like two flanges drawn over each other)
  for (let i = 0; i < 4; i++) {
    const p0 = t[i], p1 = t[(i + 1) % 4], o = out[i], prev = out[(i + 3) % 4], next = out[(i + 1) % 4];
    const e = ends && ends[i], U = norm(sub(p1, p0));
    const q0 = e ? add(add(p0, scl(o, lip)), scl(U, e[0])) : add(p0, scl(add(o, prev), lip));
    const q1 = e ? add(add(p1, scl(o, lip)), scl(U, e[1])) : add(p1, scl(add(o, next), lip));
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

export function flangeFrame3(a, b, lip, z = 0) {
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
const SHARP_COS = Math.cos((35 * Math.PI) / 180);   // dihedral >= 35° is a sharp edge
const SMOOTH_COS = Math.cos((75 * Math.PI) / 180);  // curved shells keep facets unstroken

function wrinkleLimit(f, g) {
  if (f && g && f.gore != null && g.gore != null && f.gore !== g.gore) return SHARP_COS;
  if (f && g && f.smooth && g.smooth) return -1;
  return (f && g && (f.smooth || g.smooth)) ? SMOOTH_COS : SHARP_COS;
}
export function isSharpPair(f, g) {
  if (f && g && f.gore != null && g.gore != null && f.gore !== g.gore) return true;
  if (f && g && f.smooth && g.smooth) return false;
  return dot(f.n, g.n) < wrinkleLimit(f, g);
}

function qk(n) {
  const v = Math.round(Number(n) * 1e4) / 1e4;
  return Object.is(v, -0) ? 0 : v;
}
function vertKey(p) {
  return `${qk(p[0])},${qk(p[1])},${qk(p[2])}`;
}

export function attachSmoothNormals(faces) {
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

export function edgeKey(a, b) {
  const ka = vertKey(a), kb = vertKey(b);
  return ka < kb ? ka + "|" + kb : kb + "|" + ka;
}

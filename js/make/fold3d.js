// Fold models and a small offline 3D viewer for formed / bent preset parts.
// The flat pattern from shape.make() is still what gets cut. This only visualises the folded result.
// No external library: painter's-algorithm polygons on canvas (and the same projection as SVG thumbs).

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
      for (let i = 0; i < 16; i++) {
        const a = (i * 2 * Math.PI) / 16;
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
    const cY = rotAxis(away, foldAxis, ch.angle || 0);
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
export function foldU(len, web, leg, hs = []) {
  const W = face(len, web, hs);
  attach(W, 0, 90, face(len, leg));
  attach(W, 2, 90, face(len, leg));
  return assemble(W);
}
export function foldC(len, web, leg, fl) {
  // C-channel: legs fold up, return flanges fold inward.
  // Walls on parent edges 0 and 1 have an outward normal, so inward is a negative angle.
  const W = face(len, web);
  const L1 = face(len, leg), L2 = face(len, leg);
  attach(L1, 2, -90, face(len, fl));
  attach(L2, 2, 90, face(len, fl));
  attach(W, 0, 90, L1);
  attach(W, 2, 90, L2);
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
export function foldFrustum(d1, d2, h, segs = 24) {
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
    faces.push({ pts, n, holes: [], w, h: slant });
  }
  return { faces, panels: [{ w: Math.PI * ((d1 + d2) / 2), h: slant }] };
}
export function foldTube(d, h, segs = 24) {
  return foldFrustum(d, d, h, segs);
}
export function foldS2r(a, b, d, h, segs = 16) {
  const faces = [];
  const corners = [[-a / 2, 0, -b / 2], [a / 2, 0, -b / 2], [a / 2, 0, b / 2], [-a / 2, 0, b / 2]];
  const r = d / 2;
  for (let s = 0; s < 4; s++) {
    const p0 = corners[s], p1 = corners[(s + 1) % 4];
    const nSeg = segs / 4;
    for (let i = 0; i < nSeg; i++) {
      const t0 = (s + i / nSeg) * 2 * Math.PI / 4 - Math.PI / 4 - Math.PI / 2;
      const t1 = (s + (i + 1) / nSeg) * 2 * Math.PI / 4 - Math.PI / 4 - Math.PI / 2;
      // map side parameter to circle (circle centred above origin)
      const aa0 = ((s * nSeg + i) / segs) * 2 * Math.PI - Math.PI / 2;
      const aa1 = ((s * nSeg + i + 1) / segs) * 2 * Math.PI - Math.PI / 2;
      const q0 = [p0[0] + (p1[0] - p0[0]) * (i / nSeg), 0, p0[2] + (p1[2] - p0[2]) * (i / nSeg)];
      const q1 = [p0[0] + (p1[0] - p0[0]) * ((i + 1) / nSeg), 0, p0[2] + (p1[2] - p0[2]) * ((i + 1) / nSeg)];
      const r0 = V(r * Math.cos(aa0), h, r * Math.sin(aa0));
      const r1 = V(r * Math.cos(aa1), h, r * Math.sin(aa1));
      const pts = [q0, q1, r1, r0];
      const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
      faces.push({ pts, n, holes: [], w: mag(sub(q1, q0)), h: mag(sub(r0, q0)) });
    }
  }
  return { faces, panels: faces.map((f) => ({ w: f.w, h: f.h })) };
}
export function foldElbow(d, bendDeg, pieces, segs = 16) {
  const faces = [];
  const R = d / 2;
  const bend = (bendDeg * Math.PI) / 180;
  const rad = Math.max(d, 1.2 * d);             // centre-line radius
  const steps = Math.max(2, pieces) * 4;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * bend, a1 = ((i + 1) / steps) * bend;
    for (let k = 0; k < segs; k++) {
      const t0 = (k / segs) * 2 * Math.PI, t1 = ((k + 1) / segs) * 2 * Math.PI;
      const ring = (ang, t) => {
        const cx = rad * Math.sin(ang), cy = rad * (1 - Math.cos(ang)), cz = 0;
        const tx = Math.cos(ang), ty = Math.sin(ang);
        return V(cx + R * Math.cos(t) * tx, cy + R * Math.cos(t) * ty, cz + R * Math.sin(t));
      };
      const pts = [ring(a0, t0), ring(a0, t1), ring(a1, t1), ring(a1, t0)];
      const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
      faces.push({ pts, n, holes: [], w: (2 * Math.PI * R) / segs, h: rad * (a1 - a0) });
    }
  }
  return { faces, panels: [{ w: Math.PI * d, h: rad * bend }] };
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
  for (let i = 0; i < 4; i++) {
    const p0 = t[i], p1 = t[(i + 1) % 4], o = out[i];
    const q0 = add(p0, scl(o, lip)), q1 = add(p1, scl(o, lip));
    const pts = [p0, p1, q1, q0];
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
    faces.push({ pts, n, holes: [], w: mag(sub(p1, p0)), h: lip });
  }
  sitOnTable(faces);
  return { faces, panels: faces.map((f) => ({ w: f.w, h: f.h })) };
}
export function foldDustpan(back, front, d, h) {
  const bot = face(front, d); // will look a bit rectangular; sides attach to depth edges
  // better as an explicit quad bottom
  const faces = [];
  const inset = (front - back) / 2;
  const bpts = [V(0, 0, 0), V(front, 0, 0), V(front - inset, 0, d), V(inset, 0, d)];
  faces.push({ pts: bpts, n: V(0, 1, 0), holes: [], w: front, h: d });
  const sideW = Math.hypot(d, inset);
  // back wall
  faces.push({ pts: [V(inset, 0, d), V(front - inset, 0, d), V(front - inset, h, d), V(inset, h, d)], n: V(0, 0, 1), holes: [], w: back, h });
  // sides (tapered)
  faces.push({ pts: [V(0, 0, 0), V(inset, 0, d), V(inset, h, d), V(0, h, 0)], n: norm(V(-d, 0, inset)), holes: [], w: sideW, h });
  faces.push({ pts: [V(front, 0, 0), V(front, h, 0), V(front - inset, h, d), V(front - inset, 0, d)], n: norm(V(d, 0, inset)), holes: [], w: sideW, h });
  return { faces, panels: [{ w: front, h: d }, { w: sideW, h }, { w: sideW, h }, { w: back, h }] };
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
function s2rOf(p) { return foldS2r(p.a, p.b, p.d, p.h); }

export const FOLD_MODELS = {
  openbox: (p) => foldOpenBox(p.len, p.wid, p.ht),
  liddedbox: (p) => foldLiddedBox(p.len, p.wid, p.ht),
  trayflat: (p) => foldOpenBox(p.len, p.wid, p.ht),
  uchannel: (p) => {
    const m = foldU(p.len, p.web, p.leg);
    if (Math.round(p.ends) >= 1) {
      const e1 = face(p.web, p.leg), e2 = face(p.web, p.leg);
      const extra = assemble(e1, [e1, e2]);
      // stand the ends at each end of the channel
      return { faces: m.faces.concat(extra.faces), panels: m.panels.concat([{ w: p.web, h: p.leg }, { w: p.web, h: p.leg }]) };
    }
    return m;
  },
  cchannel: (p) => {
    const m = foldC(p.len, p.web, p.leg, p.flange);
    return { faces: m.faces, panels: m.panels.concat([{ w: p.web, h: p.leg }, { w: p.web, h: p.leg }]) };
  },
  angleiron: (p) => foldAngle(p.len, p.a, p.b),
  cuboidwrap: (p) => foldLiddedBox(p.len, p.wid, p.ht),
  fiveside: (p) => {
    const bot = face(p.wid, p.dep);
    attach(bot, 3, 90, face(p.dep, p.ht));
    attach(bot, 1, 90, face(p.dep, p.ht));
    const back = face(p.wid, p.ht);
    attach(back, 2, 80, face(p.wid, p.dep));         // lid, slightly open
    attach(bot, 2, 90, back);
    return assemble(bot);
  },
  totebox: (p) => foldOpenBox(p.len, p.wid, p.ht),
  enclfront: (p) => foldLiddedBox(p.w, p.d, p.h),
  jbox: (p) => foldLiddedBox(p.s, p.s, p.ht),
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
  lidonly: (p) => foldOpenBox(p.len, p.wid, p.ht),
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
  elbow2: (p) => foldElbow(p.d, p.bend, 2),
  elbow3: (p) => foldElbow(p.d, p.bend, 3),
  elbow4: (p) => foldElbow(p.d, p.bend, 4),
  elbow5: (p) => foldElbow(p.d, p.bend, 5),
  elbow45: (p) => foldElbow(p.d, p.bend, 3),
  redelbow: (p) => foldElbow((p.d + p.d2) / 2, p.bend, 4),
  rectelbow: (p) => foldRectElbow(p.w, p.h, p.r, p.bend),
  dustpan: (p) => foldDustpan(p.w, p.front, p.d, p.h),
  scoop: (p) => foldScoop(p.w, p.d, p.h, p.r),
  panflash: (p) => foldZ(p.w, p.up, p.d, 0.1) && foldAngle(p.w, p.d, p.up),
  valleyflash: (p) => foldAngle(p.len, p.leg, p.leg),
  skylightcurb: (p) => foldOpenBox(p.w + 2 * p.apron, p.d + 2 * p.apron, p.up),
  chimsquare: (p) => foldOpenBox(p.base, p.base, p.collar),
  chimround: (p) => foldFrustum(p.base * 0.6, p.d, p.collar),
  cricketflash: (p) => foldAngle(p.w, p.h, p.rise),
  roofjack: (p) => foldFrustum(p.d + 2 * p.collar, p.d, p.collar),
  fishmouth: (p) => foldTube(p.d, (p.skirt || 30) + (p.d2 || p.d) / 2),
  fishflat: (p) => foldTube(p.d, (p.skirt || 30) + (p.rise || 25)),
  saddlehole: (p) => foldTube(p.d, p.len),
  takeoff: (p) => foldTube(p.d, p.len),
  britches: (p) => {
    const a = foldTube(p.d, p.len), b = foldTube(p.d, p.len), c = foldTube(p.d2, p.len);
    b.faces.forEach((f) => f.pts.forEach((q) => { q[0] += p.d; }));
    c.faces.forEach((f) => f.pts.forEach((q) => { q[2] += p.d; }));
    return { faces: a.faces.concat(b.faces, c.faces), panels: a.panels.concat(b.panels, c.panels) };
  },
  teetemp: (p) => {
    const main = foldTube(p.d2, p.len), br = foldTube(p.d, p.skirt + p.d2 / 2);
    br.faces.forEach((f) => f.pts.forEach((q) => { const y = q[1]; q[1] = q[2] + p.d2 / 2; q[2] = y; }));
    return { faces: main.faces.concat(br.faces), panels: main.panels.concat(br.panels) };
  },
  ybranch: (p) => {
    const main = foldTube(p.d2, p.len), br = foldTube(p.d, p.len);
    br.faces.forEach((f) => f.pts.forEach((q) => { q[0] += p.d; q[1] += p.rise || 0; }));
    return { faces: main.faces.concat(br.faces), panels: main.panels.concat(br.panels) };
  },
  ductcap: (p) => foldFrustum(p.d + 2 * (p.lip || 0), p.d + 2 * (p.lip || 0), 2),
  rectcap: (p) => flangeFrame3(p.w, p.h, p.lip),
};

export function isFoldPart(sh) {
  return !!(sh && (typeof sh.fold === "function" || FOLD_MODELS[sh.id]));
}
export function foldModel(sh, p) {
  if (!sh) return null;
  try {
    if (typeof sh.fold === "function") return sh.fold(p);
    const fn = FOLD_MODELS[sh.id];
    return fn ? fn(p) : null;
  } catch (e) { return null; }
}

// ------------------------------------------------------------------ projection / drawing

export const DEFAULT_CAM = { yaw: 0.85, pitch: 0.52 };

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

function projectFaces(faces, cam, w, h, pad = 10) {
  const [x0, y0, x1, y1] = boundsOf(faces, cam);
  const bw = Math.max(1e-6, x1 - x0), bh = Math.max(1e-6, y1 - y0);
  const s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = (w - bw * s) / 2 - x0 * s, oy = (h + bh * s) / 2 + y0 * s;
  const light = norm(V(0.35, 0.7, 0.55));
  const out = faces.map((f) => {
    const qs = f.pts.map((p) => rotCam(p, cam));
    const depth = qs.reduce((a, p) => a + p[2], 0) / qs.length;
    const n = rotCam(f.n, cam);
    const nd = dot(norm(n), light);
    const lit = Math.max(0.32, Math.min(1, 0.46 + 0.42 * nd + 0.22 * Math.abs(nd)));
    const path = qs.map((p) => [ox + p[0] * s, oy - p[1] * s]);
    const holes = (f.holes || []).map((ring) => ring.map((p) => {
      const q = rotCam(p, cam);
      return [ox + q[0] * s, oy - q[1] * s];
    }));
    return { path, holes, depth, lit, back: n[2] < -0.02 };
  });
  out.sort((a, b) => a.depth - b.depth);         // far first
  return out;
}

const STEEL = [170, 178, 186], EDGE = "#3d4650";

export function drawFoldCanvas(cv, model, cam = DEFAULT_CAM) {
  if (!cv || !model || !model.faces || !model.faces.length) return;
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  const w = cv.clientWidth || cv.width || 320, h = cv.clientHeight || cv.height || 180;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#e8edf2"; ctx.fillRect(0, 0, w, h);
  const polys = projectFaces(model.faces, cam, w, h, 16);
  for (const p of polys) {
    if (p.path.length < 3) continue;
    ctx.beginPath();
    p.path.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    for (const hole of p.holes) {
      if (hole.length < 3) continue;
      hole.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath();
    }
    const c = p.back ? 0.55 : p.lit;
    ctx.fillStyle = `rgb(${Math.round(STEEL[0] * c)},${Math.round(STEEL[1] * c)},${Math.round(STEEL[2] * c)})`;
    ctx.fill("evenodd");
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.9; ctx.stroke();
  }
}

export function foldThumbSvg(model, w = 96, h = 72, cam = DEFAULT_CAM) {
  if (!model || !model.faces || !model.faces.length) return "";
  const polys = projectFaces(model.faces, cam, w, h, 6);
  const d = polys.map((p) => {
    const ring = (pts) => pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ") + " Z";
    return ring(p.path) + p.holes.map(ring).join("");
  }).join(" ");
  // a soft average fill; individual lighting is approximated by overlapping paths with evenodd
  let body = "";
  for (const p of polys) {
    const ring = (pts) => pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ") + "Z";
    const c = p.back ? 0.55 : p.lit;
    const fill = `rgb(${Math.round(STEEL[0] * c)},${Math.round(STEEL[1] * c)},${Math.round(STEEL[2] * c)})`;
    body += `<path d="${ring(p.path)}${p.holes.map(ring).join("")}" fill="${fill}" fill-rule="evenodd" stroke="#3d4650" stroke-width="0.7"/>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`;
}

// Persist orbit per part so re-painting the form doesn't snap the view back.
const orbit = { yaw: DEFAULT_CAM.yaw, pitch: DEFAULT_CAM.pitch, key: "" };

export function mountFoldView(host, sh, params) {
  if (!host) return;
  const model = foldModel(sh, params);
  if (!model || !model.faces.length) { host.replaceChildren(); host.hidden = true; return; }
  host.hidden = false;
  const key = sh && sh.id;
  if (orbit.key !== key) { orbit.key = key; orbit.yaw = DEFAULT_CAM.yaw; orbit.pitch = DEFAULT_CAM.pitch; }
  let canvas = host.querySelector("canvas.fold3d");
  if (!canvas) {
    host.innerHTML = `<div class="fold3d-wrap"><canvas class="fold3d" width="360" height="200" aria-label="Folded 3D view, drag to turn. The drawing is the flat pattern you cut."></canvas><p class="fold3d-cap">Folded view — drag to turn. The drawing is the flat pattern you cut.</p></div>`;
    canvas = host.querySelector("canvas.fold3d");
    bindOrbit(canvas);
  }
  drawFoldCanvas(canvas, model, orbit);
  host._model = model;
  host._sh = sh;
  host._params = params;
}

function bindOrbit(canvas) {
  let dragging = false, lx = 0, ly = 0;
  const host = () => canvas.closest(".fold3d-host");
  const redraw = () => {
    const h = host();
    if (h && h._model) drawFoldCanvas(canvas, h._model, orbit);
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
  const model = foldModel(sh, params);
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

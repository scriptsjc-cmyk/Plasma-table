// r15 5.2: build the folded 3D straight from the flat pattern and its fold lines, so the 3D shows exactly what gets cut.
// A piece is its closed outline, its holes and its fold (bend) lines. Each fold line splits the panel it crosses; the
// largest panel (or the one holding `root`) lies flat and every other panel turns about its fold line by the line's
// angle (deg, default 90) "up" (towards the viewer of the flat pattern) or "down". Holes ride on the panel they are cut in.
// Pieces cut apart are placed with a pose: the flat frame's x and y axes and origin in the world (y is up).

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => scl(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const EPS = 1e-7;

export const FLAT_POSE = { o: [0, 0, 0], ax: [1, 0, 0], ay: [0, 0, -1] };   // lying on the table, flat y going away
const isBend = (c) => c && c.role === "bend" && c.pts && c.pts.length === 2;
const isClosed = (c) => c && c.closed !== false && c.role !== "bend" && c.pts && c.pts.length >= 3;

function area(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function inside(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function centroid(pts) {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], k = p[0] * q[1] - q[0] * p[1];
    a += k; x += (p[0] + q[0]) * k; y += (p[1] + q[1]) * k;
  }
  if (Math.abs(a) < EPS) return pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
  return [x / (3 * a), y / (3 * a)];
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const u = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy);
}
const onRing = (p, pts, tol) => pts.some((a, i) => segDist(p, a, pts[(i + 1) % pts.length]) < tol);
const same = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

// Split one panel along the chord of the bend line's infinite line that holds the bend's midpoint.
function splitPanel(panel, a, b, tol) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(L > tol)) return null;
  const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const ring = panel.pts, n = ring.length, hits = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n], e = [q[0] - p[0], q[1] - p[1]];
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = [p[0] - m[0], p[1] - m[1]];
    const s = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    hits.push({ s, i, u: Math.max(0, Math.min(1, u)), P: [m[0] + s * d[0], m[1] + s * d[1]] });
  }
  const lo = hits.filter((h) => h.s < -tol).sort((x, y) => y.s - x.s)[0];
  const hi = hits.filter((h) => h.s > tol).sort((x, y) => x.s - y.s)[0];
  if (!lo || !hi) return null;
  // ring with both chord ends inserted (or matched to an existing corner)
  const out = [];
  let iLo = -1, iHi = -1;
  const place = (h) => {
    for (let k = 0; k < out.length; k++) if (same(out[k], h.P, tol)) return k;
    return -1;
  };
  for (let i = 0; i < n; i++) {
    out.push(ring[i]);
    const here = [lo, hi].filter((h) => h.i === i).sort((x, y) => x.u - y.u);
    for (const h of here) {
      if (same(h.P, ring[i], tol)) continue;
      if (same(h.P, ring[(i + 1) % n], tol)) continue;
      out.push(h.P);
    }
  }
  iLo = place(lo); iHi = place(hi);
  if (iLo < 0 || iHi < 0 || iLo === iHi) return null;
  const walk = (s, e) => { const r = []; for (let k = s; ; k = (k + 1) % out.length) { r.push(out[k]); if (k === e) break; } return r; };
  const A = walk(iLo, iHi), B = walk(iHi, iLo);
  if (A.length < 3 || B.length < 3 || Math.abs(area(A)) < tol || Math.abs(area(B)) < tol) return null;
  return { A: { pts: A, holes: [] }, B: { pts: B, holes: [] }, p: out[iLo], q: out[iHi] };
}

// Panels and hinges of one piece.
export function panelsOf(contours, extraBends = []) {
  const closed = contours.filter(isClosed);
  if (!closed.length) return { panels: [], hinges: [] };
  const outer = closed.reduce((best, c) => (Math.abs(area(c.pts)) > Math.abs(area(best.pts)) ? c : best));
  let pts = outer.pts.slice();
  if (area(pts) < 0) pts.reverse();
  const span = Math.max(...pts.map((p) => Math.abs(p[0])), ...pts.map((p) => Math.abs(p[1])), 1);
  const tol = Math.max(1e-6, span * 1e-7) * 10;
  let panels = [{ pts, holes: closed.filter((c) => c !== outer && inside(centroid(c.pts), outer.pts)).map((c) => c.pts) }];
  const hinges = [];
  for (const bl of contours.filter(isBend).concat(extraBends.filter(isBend))) {
    const [a, b] = bl.pts, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const pi = panels.findIndex((pl) => inside(m, pl.pts) && !onRing(m, pl.pts, tol));
    if (pi < 0) continue;
    const old = panels[pi], sp = splitPanel(old, a, b, tol);
    if (!sp) continue;
    for (const h of old.holes) (inside(centroid(h), sp.A.pts) ? sp.A : sp.B).holes.push(h);
    for (const h of hinges) {
      for (const k of ["A", "B"]) if (h[k] === old) {
        const mid = [(h.p[0] + h.q[0]) / 2, (h.p[1] + h.q[1]) / 2];
        h[k] = onRing(mid, sp.A.pts, tol) ? sp.A : sp.B;
      }
    }
    panels.splice(pi, 1, sp.A, sp.B);
    hinges.push({ A: sp.A, B: sp.B, p: sp.p, q: sp.q, deg: Number.isFinite(bl.deg) ? bl.deg : 90, dir: bl.dir === "down" ? -1 : 1 });
  }
  return { panels, hinges };
}

// 3 × 4 transforms: { R: [[..],[..],[..]], t: [..] }
const ID = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
const mulV = (R, v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];
const apply = (T, v) => add(mulV(T.R, v), T.t);
function compose(T1, T2) {
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => T1.R[i][0] * T2.R[0][j] + T1.R[i][1] * T2.R[1][j] + T1.R[i][2] * T2.R[2][j]));
  return { R, t: add(mulV(T1.R, T2.t), T1.t) };
}
function rodrigues(k, th) {
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c, [x, y, z] = k;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}
function hingeT(h, child) {
  const P = [h.p[0], h.p[1], 0], d = norm([h.q[0] - h.p[0], h.q[1] - h.p[1], 0]);
  let v = [-d[1], d[0], 0];
  const c = centroid(child.pts);
  if (dot(v, [c[0] - P[0], c[1] - P[1], 0]) < 0) v = scl(v, -1);
  const k = cross(v, [0, 0, 1]);
  const R = rodrigues(norm(k), (h.deg * Math.PI / 180) * h.dir);
  return { R, t: sub(P, mulV(R, P)) };
}

// Fold one piece into world faces.
export function foldFlat(contours, opts = {}) {
  const { panels, hinges } = panelsOf(contours || [], opts.bends || []);
  if (!panels.length) return [];
  let root = panels.reduce((best, p) => (Math.abs(area(p.pts)) > Math.abs(area(best.pts)) ? p : best));
  if (opts.root) root = panels.find((p) => inside(opts.root, p.pts)) || root;
  const T = new Map([[root, ID]]), queue = [root];
  while (queue.length) {
    const cur = queue.shift();
    for (const h of hinges) {
      const other = h.A === cur ? h.B : h.B === cur ? h.A : null;
      if (!other || T.has(other)) continue;
      T.set(other, compose(T.get(cur), hingeT(h, other)));
      queue.push(other);
    }
  }
  const pose = opts.pose || FLAT_POSE;
  const ax = pose.ax, ay = pose.ay, nz = norm(cross(ax, ay));
  const world = (v) => add(pose.o, add(add(scl(ax, v[0]), scl(ay, v[1])), scl(nz, v[2])));
  const wdir = (v) => norm(add(add(scl(ax, v[0]), scl(ay, v[1])), scl(nz, v[2])));
  const faces = [];
  for (const pl of panels) {
    const Tp = T.get(pl) || ID;
    const map = (p) => world(apply(Tp, [p[0], p[1], 0]));
    const xs = pl.pts.map((p) => p[0]), ys = pl.pts.map((p) => p[1]);
    faces.push({
      pts: pl.pts.map(map),
      n: wdir(mulV(Tp.R, [0, 0, 1])),
      holes: pl.holes.map((r) => r.map(map)),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
      ...(opts.thk ? { thk: opts.thk } : {}),
    });
  }
  return faces;
}

export function sitOnTable(faces) {
  let y0 = Infinity;
  for (const f of faces) if (!f.ghost) for (const p of f.pts) y0 = Math.min(y0, p[1]);
  if (!Number.isFinite(y0)) for (const f of faces) for (const p of f.pts) y0 = Math.min(y0, p[1]);
  if (Number.isFinite(y0) && Math.abs(y0) > 1e-12) {
    for (const f of faces) { for (const p of f.pts) p[1] -= y0; for (const r of f.holes || []) for (const p of r) p[1] -= y0; }
  }
  return faces;
}

// Several pieces: [{ contours, pose, root, bends } | { faces }] → one model sitting on the table.
export function assembleFlat(items, opts = {}) {
  const faces = [];
  for (const it of items || []) {
    if (!it) continue;
    if (it.faces) faces.push(...it.faces);
    else faces.push(...foldFlat(it.contours, it));
  }
  if (opts.sit !== false) sitOnTable(faces);
  return { faces, panels: faces.filter((f) => !f.ghost).map((f) => ({ w: f.w, h: f.h })) };
}

// Move a piece's contours so its outline's bounding box starts at 0, 0 (packPieces moves pieces about).
export function atOrigin(piece) {
  let x0 = Infinity, y0 = Infinity;
  for (const c of piece) if (c && c.pts) for (const [x, y] of c.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
  return piece.map((c) => ({ ...c, pts: c.pts.map(([x, y]) => [x - x0, y - y0]) }));
}

// A rolled cone collar from its flat annular sector (outer radius Ro, inner Ri, sweep ang): the big end's
// circumference is the outer arc, so its radius is Ro·ang/2π. Stands on (cx, y0, cz), big end down.
export function rollSector(Ro, Ri, ang, centre = [0, 0, 0], segs = 72) {
  const R1 = (Ro * ang) / (2 * Math.PI), R2 = (Ri * ang) / (2 * Math.PI);
  const sl = Ro - Ri, h = Math.sqrt(Math.max(0, sl * sl - (R1 - R2) * (R1 - R2)));
  const [cx, y0, cz] = centre, faces = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i * 2 * Math.PI) / segs, a1 = ((i + 1) * 2 * Math.PI) / segs;
    const pts = [
      [cx + R1 * Math.cos(a0), y0, cz + R1 * Math.sin(a0)], [cx + R1 * Math.cos(a1), y0, cz + R1 * Math.sin(a1)],
      [cx + R2 * Math.cos(a1), y0 + h, cz + R2 * Math.sin(a1)], [cx + R2 * Math.cos(a0), y0 + h, cz + R2 * Math.sin(a0)],
    ];
    faces.push({ pts, n: norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0]))), holes: [], w: (Math.PI * (R1 + R2)) / segs, h: sl, smooth: true });
  }
  return faces;
}

// One folded piece straight from its pattern: specs[i] ({ deg, dir }) sets the i-th fold line (default 90° up).
export function foldPattern(contours, specs = [], opts = {}) {
  let i = 0;
  const cs = (contours || []).map((c) => (isBend(c) ? { ...c, ...(specs[i++] || {}) } : c));
  return assembleFlat([{ contours: cs, root: opts.root, bends: opts.bends }]);
}

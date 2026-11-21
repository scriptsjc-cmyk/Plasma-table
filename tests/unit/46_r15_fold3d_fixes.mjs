// r15 5.9 / 5.10 (Josh 21 Nov): two 3D-only fixes; the cut pieces don't change (tmp/precheck.sh).
// 5.10 a folded piece is thickened toward the inside of its bends (from the drawn surface), not about the middle,
//      so its outside sizes are the drawn sizes and the outer corners close.
// 5.9  skylight curb flashing: the upstands no longer pass through each other at the corners. The head and sill pans
//      wrap their upstand ends round the curb corners; the two side pans lap over them, one sheet out and one sheet up.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const F = await import("../../js/make/flat3d.js");
const D = await import("../../js/make/fold3d.js");
const t = new T("46_r15_fold3d_fixes");
const J = (x) => JSON.stringify(x === undefined ? null : x).slice(0, 400);
const solid = (m) => (m && m.faces ? m.faces.filter((f) => !f.ghost) : []);
function bbox(fs) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of fs) for (const p of f.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return hi.map((h, k) => +(h - lo[k]).toFixed(6));
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
// where the thickened front and back faces of one standing face sit, along its normal (sitting on the table moves only y)
function offsets(f, tt) {
  const n = f.n, th = D.thicken({ faces: [{ ...f, pts: f.pts.map((q) => q.slice()), holes: [] }], panels: [] }, tt);
  const front = th.faces.find((g) => !g.edge), back = th.faces.find((g) => g.edge && near(g.n[0], -n[0]) && near(g.n[2], -n[2]) && g.pts.length === f.pts.length);
  const along = (q) => (q[0] - f.pts[0][0]) * n[0] + (q[2] - f.pts[0][2]) * n[2];
  return [front ? along(front.pts[0]) : NaN, back ? along(back.pts[0]) : NaN];
}

// ---- 5.10 an L: 100 wide, a 40 base and a 30 flange (fold line at y = 30), 3 mm sheet
const L = (dir) => [{ pts: [[0, 0], [100, 0], [100, 70], [0, 70]], closed: true }, { pts: [[0, 30], [100, 30]], closed: false, role: "bend", dir }];
for (const dir of ["up", "down"]) {
  const m = F.foldPattern(L(dir));
  t.check(`5.10 a piece folded ${dir} knows the inside of its bend (side ${dir === "up" ? "+1" : "-1"})`, solid(m).every((f) => f.side === (dir === "up" ? 1 : -1)), J(solid(m).map((f) => f.side)));
  const b = bbox(solid(D.thicken(m, 3)));
  t.check(`5.10 folded ${dir}, thickened 3 mm: the outside sizes are the drawn ones (100 × 40 base, 30 high; was 41.5 × 31.5)`, near(b[0], 100) && near(b[1], 30) && near(b[2], 40), J(b));
}
{ // a Z (one up, one down): no side wins, so it stays about the middle
  const z = [{ pts: [[0, 0], [100, 0], [100, 90], [0, 90]], closed: true }, { pts: [[0, 30], [100, 30]], closed: false, role: "bend", dir: "up" }, { pts: [[0, 60], [100, 60]], closed: false, role: "bend", dir: "down" }];
  const m = F.foldPattern(z);
  t.check("5.10 a piece with as many up as down folds keeps the middle (no side)", solid(m).every((f) => !f.side), J(solid(m).map((f) => f.side)));
  const vf = solid(m).find((f) => Math.abs(f.n[1]) < 0.02);   // the standing middle panel
  t.check("5.10 ... and is thickened 1 mm either side of the drawn surface", vf && near(offsets(vf, 2)[0], 1) && near(offsets(vf, 2)[1], -1), J(vf && offsets(vf, 2)));
}
{ // a piece can say which side is the drawn one
  const m = F.assembleFlat([{ contours: L("up"), side: -1 }]);
  t.check("5.10 a model can set the side itself (side: -1 wins over the fold)", solid(m).every((f) => f.side === -1), J(solid(m).map((f) => f.side)));
}
{ // faces with no fold (rolled, hand-built) keep the middle
  const fs = F.rollSector(200, 100, Math.PI, [0, 0, 0], 12);
  t.check("5.10 rolled / hand-built faces (no fold) are not given a side", fs.every((f) => !f.side));
  const plate = { pts: [[0, 0, 0], [0, 50, 0], [0, 50, 80], [0, 0, 80]], n: [1, 0, 0], holes: [], w: 80, h: 50 };
  t.check("5.10 ... and a face with no side is still thickened about the middle (+1 / -1 mm for 2 mm)", near(offsets(plate, 2)[0], 1) && near(offsets(plate, 2)[1], -1), J(offsets(plate, 2)));
  const up = { ...plate, side: 1 }, dn = { ...plate, side: -1 };
  t.check("5.10 side +1: the sheet lies on the + side of the drawn surface (0 / +2); side -1: on the - side (0 / -2)", near(offsets(up, 2)[0], 2) && near(offsets(up, 2)[1], 0) && near(offsets(dn, 2)[0], 0) && near(offsets(dn, 2)[1], -2), J([offsets(up, 2), offsets(dn, 2)]));
}

// ---- 5.9 skylight curb flashing
const s = A.SHAPES.find((x) => x.id === "skylightcurb");
const p = { ...Object.fromEntries(s.params.map(([k, , d]) => [k, d])), bt: 2 };
const tk = 2, w = p.w, d = p.d, a = p.apron;
const fs = solid(A.foldModel(s, p));
const vert = fs.filter((f) => Math.abs(f.n[1]) < 0.02), horiz = fs.filter((f) => Math.abs(f.n[1]) > 0.99);
// each standing face as a segment on the roof plan (x, z)
const seg = (f) => { const xs = f.pts.map((q) => q[0]), zs = f.pts.map((q) => q[2]); const dx = Math.max(...xs) - Math.min(...xs), dz = Math.max(...zs) - Math.min(...zs); return dx >= dz ? { k: "x", c: (Math.max(...zs) + Math.min(...zs)) / 2, lo: Math.min(...xs), hi: Math.max(...xs) } : { k: "z", c: (Math.max(...xs) + Math.min(...xs)) / 2, lo: Math.min(...zs), hi: Math.max(...zs) }; };
const segs = vert.map(seg), bad = [];
for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
  const A1 = segs[i], B1 = segs[j];
  if (A1.k === B1.k) { if (near(A1.c, B1.c, 1e-6) && Math.min(A1.hi, B1.hi) - Math.max(A1.lo, B1.lo) > 1e-6) bad.push(["same plane", A1, B1]); continue; }
  const X = A1.k === "x" ? A1 : B1, Z = A1.k === "x" ? B1 : A1;   // X runs along x at z = X.c; Z runs along z at x = Z.c
  const inX = Z.c > X.lo + 1e-6 && Z.c < X.hi - 1e-6, inZ = X.c > Z.lo + 1e-6 && X.c < Z.hi - 1e-6;
  if (inX && inZ) bad.push(["cross", X, Z]);
}
t.check("5.9 skylight: no two upstands pass through each other or lie in each other at the corners", bad.length === 0, J(bad.slice(0, 2)));
const flatOver = [];
for (let i = 0; i < horiz.length; i++) for (let j = i + 1; j < horiz.length; j++) {
  const bi = horiz[i], bj = horiz[j];
  if (!near(bi.pts[0][1], bj.pts[0][1])) continue;
  const r = (f) => [Math.min(...f.pts.map((q) => q[0])), Math.max(...f.pts.map((q) => q[0])), Math.min(...f.pts.map((q) => q[2])), Math.max(...f.pts.map((q) => q[2]))];
  const P = r(bi), Q = r(bj);
  if (Math.min(P[1], Q[1]) - Math.max(P[0], Q[0]) > 1e-6 && Math.min(P[3], Q[3]) - Math.max(P[2], Q[2]) > 1e-6) flatOver.push([P, Q]);
}
t.check("5.9 skylight: the aprons lap at the corners (side pans one sheet up), never in the same plane", flatOver.length === 0, J(flatOver.slice(0, 2)));
const onCurbEnd = (sx, sz) => vert.some((f) => f.pts.every((q) => near(q[0], sx * w / 2)) && f.pts.every((q) => sz * q[2] <= d / 2 + 1e-6 && sz * q[2] >= d / 2 - a - 1e-6));
t.check("5.9 skylight: the head and sill upstands wrap round all four curb corners (an end against each curb side)", [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([sx, sz]) => onCurbEnd(sx, sz)));
const sideMid = (sx) => vert.some((f) => f.pts.every((q) => near(q[0], sx * (w / 2 + tk))) && near(Math.max(...f.pts.map((q) => q[2])) - Math.min(...f.pts.map((q) => q[2])), d + 2 * tk));
t.check("5.9 skylight: the side pans' upstands stand one sheet outside the head and sill (x = ±(w/2 + t), d + 2t long)", sideMid(1) && sideMid(-1));
const sideEnd = (sz) => vert.filter((f) => f.pts.every((q) => near(q[2], sz * (d / 2 + tk)))).length;
t.check("5.9 skylight: the side pans wrap round the head and sill too (two ends at z = ±(d/2 + t))", sideEnd(1) === 2 && sideEnd(-1) === 2, J([sideEnd(1), sideEnd(-1)]));
t.check("5.9 skylight: 4 aprons, 4 upstands, 8 wrapped ends", horiz.length === 4 && vert.length === 12, J([horiz.length, vert.length]));
const cut = s.make(p).map((c) => c.pts.map((q) => q.map((v) => +v.toFixed(6))));
t.check("5.9 skylight: the cut pieces are four plain rectangles as before (no fold lines or snips added)", cut.length === 4 && cut.every((c) => c.length === 4) && !s.make(p).some((c) => c.role === "bend"), J(cut.length));
process.exit(t.done() ? 1 : 0);

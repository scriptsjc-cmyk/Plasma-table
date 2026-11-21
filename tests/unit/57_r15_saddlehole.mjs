// r15 7.5-saddlehole (Josh 21 Nov): the hole in the header wrap is the true intersection of a branch (radius r) with
// the header (radius R), axes crossing at 90°. On the unrolled wrap, a header point an arc s from the hole's middle and
// y along the pipe from it is inside the branch when (R·sin(s/R))² + y² < r², so the hole edge is
//   s(θ) = R·asin((r/R)·sinθ),  y(θ) = r·cosθ:
// 2r long along the pipe but 2R·asin(r/R) wide round it (wider than a circle; for 100 on 110 it is 7.5 mm wider).
// It used to be a plain Ø branch circle, which leaves gaps at the sides of the branch.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const t = new T("57_r15_saddlehole");
const ck = (n, ok, i = "") => t.check(n, ok, String(i));
const sh = A.SHAPES.find((s) => s.id === "saddlehole");
const defaults = Object.fromEntries(sh.params.map((q) => [q[0], q[2]]));
const area2 = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const box = (pts) => [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];

for (const [D, b, len] of [[120, 70, 160], [110, 100, 200], [200, 50, 120], [150, 150, 260], [90, 40, 100]]) {
  const tag = `Ø${b} branch in a Ø${D} header`;
  const R = D / 2, r = b / 2, p = { ...defaults, d: D, branch: b, len };
  const cs = sh.make(p).filter((c) => c.closed !== false && c.op !== "mark" && c.role !== "bend");
  const [wrap, hole] = cs.slice().sort((x, y) => area2(y.pts) - area2(x.pts));
  if (!ck(`${tag}: cuts the wrap and one hole`, cs.length === 2 && !!hole, cs.length)) continue;
  const [x0, y0, x1, y1] = box(wrap.pts), w = Math.PI * D;
  ck(`${tag}: the wrap is πD × length`, Math.abs(x1 - x0 - w) < 0.01 && Math.abs(y1 - y0 - len) < 0.01, `${(x1 - x0).toFixed(2)} × ${(y1 - y0).toFixed(2)}`);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // every point of the hole edge, wrapped round the header, lies on the branch surface
  const off = Math.max(...hole.pts.map(([x, y]) => Math.abs(Math.hypot(R * Math.sin((x - cx) / R), y - cy) - r)));
  ck(`${tag}: wrapped onto the header, the hole edge lies on the branch (within 0.01 mm)`, off < 0.01, off.toFixed(4) + " mm");
  // and between the points too (no straight chords cutting across the curve by more than 0.05 mm)
  let chord = 0;
  hole.pts.forEach((a, i) => { const q = hole.pts[(i + 1) % hole.pts.length], m = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2]; chord = Math.max(chord, Math.abs(Math.hypot(R * Math.sin((m[0] - cx) / R), m[1] - cy) - r)); });
  ck(`${tag}: the hole edge is smooth (chords within 0.05 mm)`, chord < 0.05, chord.toFixed(4) + " mm");
  const [hx0, hy0, hx1, hy1] = box(hole.pts), wide = 2 * R * Math.asin(Math.min(1, r / R));
  ck(`${tag}: the hole is 2r = ${b} long along the pipe and 2R·asin(r/R) = ${wide.toFixed(2)} wide round it`, Math.abs(hy1 - hy0 - b) < 0.02 && Math.abs(hx1 - hx0 - wide) < 0.02, `${(hy1 - hy0).toFixed(2)} × ${(hx1 - hx0).toFixed(2)}`);
  ck(`${tag}: the hole is centred in the wrap`, Math.abs((hx0 + hx1) / 2 - cx) < 0.01 && Math.abs((hy0 + hy1) / 2 - cy) < 0.01);
  // the 3D wrap is built from the cut: it has a hole of the same shape (no wrap left inside the branch, none missing outside it)
  const m = A.foldModel(sh, p), solid = (m.faces || []).filter((f) => !f.ghost && !f.flange);
  const a3 = solid.reduce((s, f) => { let a = 0; for (let i = 1; i < f.pts.length - 1; i++) { const u = f.pts[i].map((v, k) => v - f.pts[0][k]), v2 = f.pts[i + 1].map((v, k) => v - f.pts[0][k]); a += Math.hypot(u[1] * v2[2] - u[2] * v2[1], u[2] * v2[0] - u[0] * v2[2], u[0] * v2[1] - u[1] * v2[0]) / 2; } return s + a; }, 0);
  const missing = w * len * (Math.sin(Math.PI / 96) / (Math.PI / 96)) - a3, holeA = area2(hole.pts);
  ck(`${tag}: the 3D wrap is missing the hole's area (within 3 %)`, Math.abs(missing - holeA) / holeA < 0.03, `${missing.toFixed(0)} vs ${holeA.toFixed(0)} mm²`);
}
// a branch bigger than the header cannot sit in it: no hole, and a note says why
{
  const p = { ...defaults, d: 80, branch: 100, len: 200 };
  const cs = sh.make(p).filter((c) => c.closed !== false);
  const note = typeof sh.note === "function" ? sh.note(p) : sh.note;
  ck("a branch bigger than the header: just the wrap, and a note explains", cs.length === 1 && /bigger|larger/i.test(note || ""), note);
}
process.exit(t.done() ? 1 : 0);

// r15 7.5-redelbow (Josh 21 Nov): a real reducing elbow. n gores that taper and turn: one right cone from the big
// end Ø to the small end Ø is cut by mitre planes tilted ±β (β = bend / 2(n−1)), and each gore is turned half a
// turn about its joint plane's normal through the centre of the joint ellipse, so the ellipse lands on itself and
// neighbouring gores meet exactly while the axis turns 2β per joint. Each flat pattern is that gore's part of the
// cone's development. (It used to be a cone sector plus two equal-Ø gores that cannot be joined into an elbow.)
//
// The module gives each flat piece and wrap(x, y): where a point of that flat piece goes in the formed elbow.
// This test does not trust its maths: it checks wrap is a true development (no stretching), that each piece's seam
// closes, that each joint is one plane curve shared by both gores, and that the two ends are round, the right Ø
// and turned by the bend angle. Then that the preset cuts exactly those pieces and the 3D is built from them.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const { reducingElbow } = await import("../../js/make/redelbow.js");
const t = new T("56_r15_redelbow");
const ck = (n, ok, i = "") => t.check(n, ok, String(i));
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a), unit = (a) => a.map((v) => v / len(a));
const segDist = (p, a, b) => { const ab = sub(b, a), u = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))); return len(sub(p, a.map((v, i) => v + u * ab[i]))); };
const toPoly = (P, Q) => Math.min(...Q.slice(0, -1).map((q, i) => segDist(P, q, Q[i + 1])));
const hausdorff = (P, Q) => Math.max(...P.map((p) => toPoly(p, Q)), ...Q.map((q) => toPoly(q, P)));
const area2 = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
// plane fit: normal from the three most spread points, then the worst distance
const planeOf = (pts) => { const c = pts.reduce((s, p) => s.map((v, i) => v + p[i] / pts.length), [0, 0, 0]); const a = pts[0], b = pts[Math.floor(pts.length / 3)], d = pts[Math.floor((2 * pts.length) / 3)]; const n = unit(cross(sub(b, a), sub(d, a))); return { c, n, off: Math.max(...pts.map((p) => Math.abs(dot(sub(p, c), n)))) }; };

// The flat piece's boundary, split into its runs: the module marks them (edge: "a" = big-end side, "b" = small-end side, "seam").
const runs = (pc) => { const r = { a: [], b: [], seam: [] }; pc.flat.forEach((p, i) => r[pc.edge[i]].push(p)); return r; };

const SIZES = [
  { d: 120, d2: 80, bend: 90, clr: 180, n: 4 },
  { d: 200, d2: 100, bend: 90, clr: 300, n: 5 },
  { d: 100, d2: 90, bend: 45, clr: 150, n: 3 },
  { d: 150, d2: 60, bend: 60, clr: 260, n: 4 },
  { d: 160, d2: 110, bend: 90, clr: 240, n: 6 },
];
for (const P of SIZES) {
  const tag = `${P.d}→${P.d2} ${P.bend}° CLR ${P.clr} ×${P.n}`;
  const e = reducingElbow({ ...P, t: 0, seam: 0 });
  if (!ck(`${tag}: builds ${P.n} gores`, e && e.ok && e.pieces.length === P.n, e && e.reason)) continue;
  let stretch = 0, seamGap = 0, joinGap = 0, flatJoin = 0, notPlanar = 0;
  const ends = [];
  e.pieces.forEach((pc, k) => {
    // 1. no stretching: any two nearby points keep their distance when wrapped
    const xs = pc.flat.map((p) => p[0]), ys = pc.flat.map((p) => p[1]);
    const inside = (x, y) => { let c = false; for (let i = 0, j = pc.flat.length - 1; i < pc.flat.length; j = i++) { const [xi, yi] = pc.flat[i], [xj, yj] = pc.flat[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    for (let s = 0; s < 400; s++) {
      const x = Math.min(...xs) + ((s * 0.6180339) % 1) * (Math.max(...xs) - Math.min(...xs)), y = Math.min(...ys) + ((s * 0.4142135) % 1) * (Math.max(...ys) - Math.min(...ys));
      if (!inside(x, y)) continue;
      for (const [dx, dy] of [[0.5, 0], [0, 0.5], [0.35, 0.35]]) {
        if (!inside(x + dx, y + dy)) continue;
        const d3 = len(sub(pc.wrap(x + dx, y + dy), pc.wrap(x, y))), d2 = Math.hypot(dx, dy);
        stretch = Math.max(stretch, Math.abs(d3 - d2) / d2);
      }
    }
    // 2. the seam closes: the two seam edges wrap onto the same line
    const R = runs(pc);
    const wa = R.a.map((p) => pc.wrap(...p)), wb = R.b.map((p) => pc.wrap(...p));
    seamGap = Math.max(seamGap, len(sub(wa[0], wa[wa.length - 1])), len(sub(wb[0], wb[wb.length - 1])));
    // 3. each joint is a plane curve
    if (k > 0) notPlanar = Math.max(notPlanar, planeOf(wa).off);
    if (k < e.pieces.length - 1) notPlanar = Math.max(notPlanar, planeOf(wb).off);
    // 4. this gore's small-end edge and the next gore's big-end edge are the same curve, the same length in the flat
    if (k < e.pieces.length - 1) {
      const nx = e.pieces[k + 1], wn = runs(nx).a.map((p) => nx.wrap(...p));
      joinGap = Math.max(joinGap, hausdorff(wb, wn));
      const L = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
      flatJoin = Math.max(flatJoin, Math.abs(L(R.b) - L(runs(nx).a)) / L(R.b));
    }
    if (k === 0) ends.push(wa);
    if (k === e.pieces.length - 1) ends.push(wb);
  });
  ck(`${tag}: every flat piece is a true development (no stretch over 0.1 %)`, stretch < 1e-3, (stretch * 100).toFixed(3) + " %");
  ck(`${tag}: every piece rolls up with its seam closed (within 0.05 mm)`, seamGap < 0.05, seamGap.toFixed(3) + " mm");
  ck(`${tag}: every joint is a flat mitre (within 0.05 mm of a plane)`, notPlanar < 0.05, notPlanar.toFixed(3) + " mm");
  ck(`${tag}: neighbouring gores meet edge to edge (within 0.1 mm)`, joinGap < 0.1, joinGap.toFixed(3) + " mm");
  ck(`${tag}: the joint edges are the same length on both flat pieces (within 0.2 %)`, flatJoin < 2e-3, (flatJoin * 100).toFixed(3) + " %");
  const [big, small] = ends.map(planeOf), rad = (pts, c) => pts.map((p) => len(sub(p, c)));
  const rb = rad(ends[0], big.c), rs = rad(ends[1], small.c);
  ck(`${tag}: the big end is a round, flat Ø ${P.d} opening`, big.off < 0.05 && rb.every((r) => Math.abs(2 * r - P.d) < 0.1), `Ø ${(2 * Math.min(...rb)).toFixed(2)}–${(2 * Math.max(...rb)).toFixed(2)}`);
  ck(`${tag}: the small end is a round, flat Ø ${P.d2} opening`, small.off < 0.05 && rs.every((r) => Math.abs(2 * r - P.d2) < 0.1), `Ø ${(2 * Math.min(...rs)).toFixed(2)}–${(2 * Math.max(...rs)).toFixed(2)}`);
  const turn = (Math.acos(Math.min(1, Math.abs(dot(big.n, small.n)))) * 180) / Math.PI;
  ck(`${tag}: the two ends are turned ${P.bend}° (within 0.1°)`, Math.abs(turn - P.bend) < 0.1, turn.toFixed(3) + "°");
  // the ends sit about CLR from the bend centre: their centres are CLR·(tan … ) apart like a lobster-back of that CLR (within 5 %)
  const chord = len(sub(big.c, small.c)), want = 2 * P.clr * Math.sin((P.bend * Math.PI) / 360);
  ck(`${tag}: the ends are a ${P.clr} mm centreline radius apart (chord within 5 %)`, Math.abs(chord - want) / want < 0.05, `${chord.toFixed(1)} vs ${want.toFixed(1)}`);
  // the diameter falls gore by gore
  const dias = e.pieces.map((pc) => 2 * Math.max(...rad(runs(pc).a.map((p) => pc.wrap(...p)), planeOf(runs(pc).a.map((p) => pc.wrap(...p))).c)));
  ck(`${tag}: the gores taper from the big end to the small end`, dias.every((v, i) => i === 0 || v < dias[i - 1]), dias.map((v) => v.toFixed(1)).join(" > "));

  // the preset cuts exactly these pieces (moved, not changed) and the 3D is built from them
  const s = A.SHAPES.find((x) => x.id === "redelbow"), p = { ...Object.fromEntries(s.params.map((q) => [q[0], q[2]])), ...P, t: 0, seam: 0 };
  const cut = s.make(p).filter((c) => c.closed !== false && c.op !== "mark" && c.role !== "bend");
  const norm0 = (pts) => { const x0 = Math.min(...pts.map((q) => q[0])), y0 = Math.min(...pts.map((q) => q[1])); return pts.map((q) => [q[0] - x0, q[1] - y0]); };
  const same = e.pieces.every((pc) => cut.some((c) => c.pts.length === pc.flat.length && norm0(c.pts).every((q, i) => Math.hypot(q[0] - norm0(pc.flat)[i][0], q[1] - norm0(pc.flat)[i][1]) < 1e-6)));
  ck(`${tag}: the preset cuts exactly the ${P.n} developed gores`, cut.length === P.n && same, `${cut.length} cut outlines`);
  const m = A.foldModel(s, p), faces = (m.faces || []).filter((f) => !f.ghost && !f.flange);
  const gores = [...new Set(faces.map((f) => f.gore))].filter((g) => g != null);
  ck(`${tag}: the 3D has ${P.n} gores`, gores.length === P.n, gores.join(","));
  const area3 = (g) => faces.filter((f) => f.gore === g).reduce((x, f) => { let a = 0; for (let i = 1; i < f.pts.length - 1; i++) a += len(cross(sub(f.pts[i], f.pts[0]), sub(f.pts[i + 1], f.pts[0]))) / 2; return x + a; }, 0);
  const areaBad = e.pieces.map((pc, k) => Math.abs(area3(k) - area2(pc.flat)) / area2(pc.flat)).filter((r) => r > 0.01);
  ck(`${tag}: each 3D gore has its flat piece's area (within 1 %)`, areaBad.length === 0, areaBad.map((r) => (r * 100).toFixed(2) + " %").join(", "));
  const onCut = faces.every((f) => f.pts.every((q) => e.pieces[f.gore].near(q) < 0.05));
  ck(`${tag}: every 3D point lies on its wrapped flat piece (within 0.05 mm)`, onCut);
}

// sizes that cannot make an elbow say why instead of cutting nonsense
for (const [bad, why] of [[{ d: 120, d2: 80, bend: 90, clr: 40, n: 4 }, "CLR smaller than the big end's radius"], [{ d: 80, d2: 120, bend: 90, clr: 200, n: 4 }, "small end bigger than the big end"], [{ d: 100, d2: 100, bend: 90, clr: 150, n: 4 }, "no taper (that is a lobster-back elbow)"], [{ d: 120, d2: 80, bend: 90, clr: 180, n: 1 }, "one piece"]]) {
  const e = reducingElbow({ ...bad, t: 0, seam: 0 });
  ck(`${why}: no pieces, and a reason is given`, e && !e.ok && e.pieces.length === 0 && /\w{4}/.test(e.reason || ""), e && e.reason);
}
// material thickness: the opening sizes follow the thickness basis like the other elbows
{
  const e = reducingElbow({ d: 120, d2: 80, bend: 90, clr: 180, n: 4, t: 2, allow: 0, seam: 0 });
  const pc = e.pieces[0], a = runs(pc).a.map((p) => pc.wrap(...p)), c = planeOf(a).c, r = Math.max(...a.map((p) => len(sub(p, c))));
  ck("inside basis with 2 mm sheet: the big end is developed at Ø 116", Math.abs(2 * r - 116) < 0.1, (2 * r).toFixed(2));
}
// a seam allowance adds a strip on each piece (wider flat, same rolled size)
{
  const a0 = reducingElbow({ d: 120, d2: 80, bend: 90, clr: 180, n: 4, t: 0, seam: 0 }), a1 = reducingElbow({ d: 120, d2: 80, bend: 90, clr: 180, n: 4, t: 0, seam: 10 });
  ck("a 10 mm seam allowance makes every piece bigger", a1.pieces.every((pc, k) => area2(pc.flat) > area2(a0.pieces[k].flat) + 100));
}
process.exit(t.done() ? 1 : 0);

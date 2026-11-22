// r15 5.1 bend allowance: folded flat patterns take the bend deduction off, from the sheet thickness, the inside bend
// radius and a K-factor (or a measured deduction saved per thickness); sizes are said to be outside or inside.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const B = await import("../../js/make/bends.js");
const t = new T("34_r15_bends");
const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

// ---- the formula (90° air bend): outside sizes lose 2(R+T) − BA per bend, inside sizes 2R − BA, BA = π/2 (R + K·T)
const ba = (R, T, K) => (Math.PI / 2) * (R + K * T);
t.check("BD outside, 1 mm sheet, R 1, K 0.44", near(B.bendDeduction({ t: 1, r: 1, k: 0.44 }), 2 * 2 - ba(1, 1, 0.44)), String(B.bendDeduction({ t: 1, r: 1, k: 0.44 })));
t.check("BD inside, 2 mm sheet, R 3, K 0.5", near(B.bendDeduction({ t: 2, r: 3, k: 0.5, inside: true }), 2 * 3 - ba(3, 2, 0.5)), String(B.bendDeduction({ t: 2, r: 3, k: 0.5, inside: true })));
t.check("no sheet thickness: nothing taken off", B.bendDeduction({ t: 0, r: 1, k: 0.44 }) === 0);

const sh = (id) => A.SHAPES.find((s) => s.id === id);
const defaults = (s) => Object.fromEntries(s.params.map(([k, , d]) => [k, d]));
const bb = (cs) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const c of cs) if (c.role !== "bend") for (const [x, y] of c.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; };
const bends = (cs) => cs.filter((c) => c.role === "bend");
const holes = (cs) => cs.filter((c) => c.circle).map((c) => c.circle);

// ---- every folded preset with straight, square bend lines gets the bend fields; triangulated ones (cones, transitions) don't
const withB = A.SHAPES.filter((s) => s.params.some(([k]) => k === "bt"));
t.check("at least 20 folded presets have the bend fields", withB.length >= 20, String(withB.length));
for (const id of ["foldlbr", "foldubr", "foldzbr", "openbox"]) t.check(`${id} has Sheet thickness, Inside bend radius, Sizes are, K-factor, Measured deduction`,
  ["bt", "bir", "bsz", "bk", "bd"].every((k) => sh(id) && sh(id).params.some(([q]) => q === k)), JSON.stringify(sh(id) && sh(id).params.map(([k]) => k)));
for (const id of ["s2r", "hopflange", "recttrans", "cone"]) t.check(`${id} (triangulated / rolled) has no bend-deduction fields`, !!sh(id) && !sh(id).params.some(([k]) => k === "bt"));
const bsz = sh("foldlbr").params.find(([k]) => k === "bsz");
t.check("Sizes are: Outside / Inside / As cut", bsz && bsz[3] && bsz[3].type === "select" && bsz[3].options.map((o) => o.l).join("|").match(/Outside.*\|Inside.*\|As cut/), JSON.stringify(bsz));

// ---- L-bracket, 2 mm sheet, R 2, K 0.44, outside sizes: one bend
B.setBendContext({ thickness: () => null, measured: () => null });
const L = sh("foldlbr"), p0 = defaults(L);
const flat0 = L.make({ ...p0, bsz: 2 });                  // as cut = the old pattern
const BD = B.bendDeduction({ t: 2, r: 2, k: 0.44 });
const flat = L.make({ ...p0, bt: 2, bir: 2, bk: 0.44, bsz: 0 });
const b0 = bb(flat0), b1 = bb(flat);
t.check("L-bracket: the strip is shorter by one bend deduction", near(b1.h, b0.h - BD), `${r4(b0.h)} -> ${r4(b1.h)} (BD ${r4(BD)})`);
t.check("L-bracket: the width is unchanged", near(b1.w, b0.w), `${b0.w} -> ${b1.w}`);
t.check("L-bracket: the bend line sits at the first leg less half a deduction", bends(flat).length === 1 && near(bends(flat)[0].pts[0][1], p0.a - BD / 2) && near(bends(flat)[0].pts[1][1], p0.a - BD / 2), JSON.stringify(bends(flat).map((c) => c.pts)));
const h0 = holes(flat0), h1 = holes(flat);
t.check("L-bracket: holes keep their size; first-leg holes stay put, second-leg holes move by one deduction", h0.length === h1.length && h0.length >= 2
  && h0.every((h, i) => near(h.r, h1[i].r) && near(h.cx, h1[i].cx) && (h.cy < p0.a ? near(h.cy, h1[i].cy) : near(h.cy - BD, h1[i].cy))), JSON.stringify({ h0, h1 }));
t.check("L-bracket: 'As cut' gives exactly the pattern from before (no bend fields)", JSON.stringify(flat0) === JSON.stringify(L.make(p0)) || bb(L.make({ ...p0, bt: 0 })).h === b0.h);

// ---- inside sizes: a 90° bend adds length when 2R < BA
const fin = L.make({ ...p0, bt: 2, bir: 1, bk: 0.44, bsz: 1 });
const BDi = B.bendDeduction({ t: 2, r: 1, k: 0.44, inside: true });
t.check("L-bracket, inside sizes: the strip changes by the inside deduction", near(bb(fin).h, b0.h - BDi), `${r4(bb(fin).h)} vs ${r4(b0.h - BDi)}`);

// ---- U-bracket: two bends
const U = sh("foldubr"), pu = defaults(U), u0 = bb(U.make({ ...pu, bsz: 2 })), u1 = bb(U.make({ ...pu, bt: 1.5, bir: 0, bk: 0.44 }));
const BDu = B.bendDeduction({ t: 1.5, r: 1.5, k: 0.44 });
t.check("U-bracket: two bends, two deductions; inside radius 0 = the sheet thickness", near(u1.h, u0.h - 2 * BDu), `${r4(u0.h)} -> ${r4(u1.h)} (2 × ${r4(BDu)})`);

// ---- cross-shaped open box: bends both ways, the box shrinks in X and in Y
const O = sh("openbox"), po = defaults(O), o0 = bb(O.make({ ...po, bsz: 2 })), o1 = bb(O.make({ ...po, bt: 1, bir: 1, bk: 0.44, bsz: 0 }));   // r16 A1: the open box now starts on Inside; this checks the Outside deduction, so it asks for Outside
const BDo = B.bendDeduction({ t: 1, r: 1, k: 0.44 });
const nx = bends(O.make({ ...po, bsz: 2 })).filter((c) => near(c.pts[0][0], c.pts[1][0])).length, ny = bends(O.make({ ...po, bsz: 2 })).filter((c) => near(c.pts[0][1], c.pts[1][1])).length;
const xs = new Set(bends(O.make({ ...po, bsz: 2 })).filter((c) => near(c.pts[0][0], c.pts[1][0])).map((c) => r4(c.pts[0][0]))).size;
const ys = new Set(bends(O.make({ ...po, bsz: 2 })).filter((c) => near(c.pts[0][1], c.pts[1][1])).map((c) => r4(c.pts[0][1]))).size;
t.check("open box: X shrinks by one deduction per bend position across, Y per bend position along", nx > 0 && ny > 0 && near(o1.w, o0.w - xs * BDo) && near(o1.h, o0.h - ys * BDo), JSON.stringify({ o0, o1, xs, ys, BDo }));

// ---- 0 = the job's thickness; a measured deduction saved for that thickness wins (outside sizes)
B.setBendContext({ thickness: () => 1.5, measured: () => null });
t.check("Sheet thickness 0 uses the job's (1.5 mm)", near(bb(L.make({ ...p0, bt: 0, bir: 0, bk: 0.44 })).h, b0.h - B.bendDeduction({ t: 1.5, r: 1.5, k: 0.44 })));
B.setBendContext({ thickness: () => 1.5, measured: (th) => (th === 1.5 ? 2.5 : null) });
t.check("a measured 2.5 mm deduction saved for 1.5 mm is used", near(bb(L.make({ ...p0, bt: 0, bir: 0, bk: 0.44 })).h, b0.h - 2.5));
t.check("the preset's own Measured deduction field wins over the saved one", near(bb(L.make({ ...p0, bt: 0, bd: 3 })).h, b0.h - 3));
B.setBendContext({ thickness: () => null, measured: () => null });
t.check("no job thickness and none typed: the pattern is as cut", near(bb(L.make({ ...p0, bt: 0 })).h, b0.h));

// ---- every preset with the fields: with a 1 mm sheet the flat pattern shrinks by (bend positions × BD) each way, and stays valid
let bad = [];
for (const s of withB) {
  const p = defaults(s);
  const c0 = s.make({ ...p, bsz: 2 }), c1 = s.make({ ...p, bt: 1, bir: 1, bk: 0.44, bsz: 0 });   // r16 A1: Outside asked for (Inside-labelled presets now start on Inside)
  const k0 = bb(c0), k1 = bb(c1);
  const bx = new Set(bends(c0).filter((c) => near(c.pts[0][0], c.pts[1][0])).map((c) => r4(c.pts[0][0]))).size;
  const by = new Set(bends(c0).filter((c) => near(c.pts[0][1], c.pts[1][1])).map((c) => r4(c.pts[0][1]))).size;
  const ok = c1.length === c0.length && c1.every((c) => c.pts.every((q) => q.every(Number.isFinite))) && k1.w <= k0.w + 1e-6 && k1.h <= k0.h + 1e-6 && (bx + by > 0) && k1.w + k1.h < k0.w + k0.h - 0.5;
  if (!ok) bad.push(`${s.id}: ${r4(k0.w)}×${r4(k0.h)} -> ${r4(k1.w)}×${r4(k1.h)} bends ${bx}/${by} n ${c0.length}/${c1.length}`);
}
t.check("every preset with bend fields shrinks by its bends and stays valid", bad.length === 0, bad.slice(0, 6).join("; "));

// ---- a preset whose bends aren't 90° (ridge cap, 45°) uses its own angle
const RC = sh("ridgecap"), pr = defaults(RC), rc0 = bb(RC.make({ ...pr, bsz: 2 })), rc1 = bb(RC.make({ ...pr, bt: 1, bir: 1, bk: 0.44 }));
const BD45 = B.bendDeduction({ t: 1, r: 1, k: 0.44, deg: 45 }), nb = bends(RC.make({ ...pr, bsz: 2 })).length;
t.check("ridge cap: 45° bends take the 45° deduction off", nb >= 1 && near(rc1.h, rc0.h - nb * BD45) && BD45 < BDo, JSON.stringify({ rc0, rc1, BD45, nb }));

// ---- the size form says what was taken off and whether sizes are outside or inside
const note = typeof L.note === "function" ? L.note({ ...p0, bt: 2, bir: 2, bk: 0.44, bsz: 0 }) : "";
t.check("the note says the deduction per bend and that sizes are outside", /3\.4\d? mm/.test(note) && /per bend/i.test(note) && /outside/i.test(note), note);
const note2 = L.note({ ...p0, bsz: 2 });
t.check("As cut: the note says nothing is taken off for the bends", /nothing.*bend|no bend allowance/i.test(note2), note2);

process.exit(t.done() ? 1 : 0);

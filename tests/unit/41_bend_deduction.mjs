// r15 7.6: the bend deduction worked through by hand for one case, so a change to the bend maths is caught.
// A 100 × 50 × 50 U-channel (web 100, legs 50, 50 wide) in 2 mm sheet, inside radius = T = 2, K 0.44, outside sizes:
//   BA = π/2 · (R + K·T) = π/2 · 2.88 = 4.523893…      setback = R + T = 4
//   BD = 2 · setback − BA = 3.476107…  per bend           flat = 50 + 100 + 50 − 2 · BD = 193.047786…
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const B = await import("../../js/make/bends.js");
const t = new T("41_bend_deduction");
const BD = 8 - (Math.PI / 2) * (2 + 0.44 * 2), FLAT = 200 - 2 * BD;
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
B.setBendContext({ thickness: () => null });
t.check("bendDeduction(2 mm, R 2, K 0.44, 90°) = 3.476107 mm", near(B.bendDeduction({ t: 2, r: 2, k: 0.44 }), BD), String(B.bendDeduction({ t: 2, r: 2, k: 0.44 })));
t.check("inside radius 0 means R = T (same answer)", near(B.bendDeduction({ t: 2, r: 0, k: 0.44 }), BD));
const s = A.SHAPES.find((x) => x.id === "foldubr");
const p = { ...Object.fromEntries(s.params.map(([k, , d]) => [k, d])), web: 100, leg: 50, len: 50, hole: 0, bt: 2, bir: 0, bk: 0.44, bd: 0 };
const cs = s.make(p);
const outline = cs.find((c) => c.closed !== false && c.role !== "bend" && c.pts.length >= 4);
const ys = outline.pts.map((q) => q[1]), xs = outline.pts.map((q) => q[0]);
const H = Math.max(...ys) - Math.min(...ys), W = Math.max(...xs) - Math.min(...xs);
t.check(`the U-channel's flat strip is ${FLAT.toFixed(6)} long (200 − 2 × ${BD.toFixed(6)}) and 50 wide`, near(H, FLAT, 1e-4) && near(W, 50, 1e-6), JSON.stringify([H, W]));
const bends = cs.filter((c) => c.role === "bend").map((c) => c.pts[0][1] - Math.min(...ys)).sort((a, b) => a - b);
t.check(`its two fold lines sit ${(50 - BD / 2).toFixed(6)} from each end (leg − BD / 2)`, bends.length === 2 && near(bends[0], 50 - BD / 2, 1e-4) && near(FLAT - bends[1], 50 - BD / 2, 1e-4), JSON.stringify(bends));
t.check("the note says what it used (2 mm, inside radius 2, K 0.44)", /2 mm/.test(B.bendNote(p)) && /radius 2/.test(B.bendNote(p)) && /0\.44/.test(B.bendNote(p)), B.bendNote(p));
process.exit(t.done() ? 1 : 0);

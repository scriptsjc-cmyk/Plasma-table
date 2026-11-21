// r15 5.5 fold direction on the flat pattern: each fold line says whether it folds up (towards you, as drawn) or
// down, and the 3D folds the same way.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const D = await import("../../js/make/folddirs.js");
const t = new T("38_r15_folddirs");
const defaults = (s) => Object.fromEntries(s.params.map(([k, , d]) => [k, d]));
const sh = (id) => A.SHAPES.find((s) => s.id === id);
const dirs = (id) => sh(id).make(defaults(sh(id))).filter((c) => c.role === "bend").map((c) => (c.dir === "down" ? "D" : "U") + (Number.isFinite(c.deg) && c.deg !== 90 ? c.deg : ""));

t.check("folddirs exports FOLD_DIRS, markFolds and foldLabel", D.FOLD_DIRS && typeof D.markFolds === "function" && typeof D.foldLabel === "function");
t.check("foldLabel: up / down / angle", D.foldLabel({ role: "bend" }) === "▲ Up" && D.foldLabel({ role: "bend", dir: "down" }) === "▼ Down" && D.foldLabel({ role: "bend", deg: 45 }) === "▲ Up 45°");
for (const [id, want] of [["foldzbr", "UD"], ["zbracket", "UD"], ["hatsect", "UDDU"], ["usaddle", "UDDU"], ["furring", "UDDU"], ["firepit", "UD"], ["bbqside", "UD"], ["foldubr", "UU"], ["cabletray", "UUUU"]]) {
  t.check(`${id}: fold lines ${want.split("").map((x) => (x === "U" ? "up" : "down")).join(", ")}`, dirs(id).join("") === want, dirs(id).join(""));
}
t.check("ridge cap: both folds 45°", dirs("ridgecap").join(",") === "U45,U45", dirs("ridgecap").join(","));
t.check("the bend allowance keeps the fold directions", (() => { const s = sh("foldzbr"), p = { ...defaults(s), bt: 2 }; return s.make(p).filter((c) => c.role === "bend").map((c) => c.dir || "up").join() === "up,down"; })());
// the 3D folds the way the drawing says: Z-bracket legs end up on opposite sides of the web
{
  const s = sh("foldzbr"), p = defaults(s), m = A.foldModel(s, p);
  const flats = m.faces.filter((f) => Math.abs(f.n[1]) > 0.99).map((f) => f.pts[0][1]).sort((a, b) => a - b);
  t.check("Z-bracket 3D: one leg at the bottom, one at the top", flats.length === 2 && Math.abs(flats[1] - flats[0] - p.web) < 1e-6, JSON.stringify(flats));
  const F = await import("../../js/make/flat3d.js");
  const flipped = F.foldPattern(s.makeFlat(p).map((c) => (c.role === "bend" ? { ...c, dir: "up" } : c)), [], { root: [p.len / 2, p.a / 2] });
  const fl2 = flipped.faces.filter((f) => Math.abs(f.n[1]) > 0.99);
  t.check("…and folding both lines up would give a U instead (so the direction is used)", fl2.length === 1);
}
process.exit(t.done() ? 1 : 0);

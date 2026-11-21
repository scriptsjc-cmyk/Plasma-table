// r15 6.4: a better automatic cut order: nearest-next plus a 2-opt pass, so the torch travels less between cuts.
// Holes are still cut before the outline they sit in. A Pro order typed in the cut list still wins.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const t = new T("45_r15_cut_order");
const J = (x) => JSON.stringify(x).slice(0, 300);
const circ = (cx, cy, r, n = 48) => ({ pts: Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]), closed: true, circle: { cx, cy, r } });
const rect = (x, y, w, h) => ({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true });
const opts = { kerf: 1.5, leadIn: 3, name: "o", holeSpiral: false };
// rapid travel of a job: sum of the torch-off moves between cuts
function travel(g) {
  let x = 0, y = 0, d = 0, on = false;
  for (const l of g.split("\n")) {
    const X = /X(-?[\d.]+)/.exec(l), Y = /Y(-?[\d.]+)/.exec(l);
    if (l === "M3") on = true; else if (l === "M5") on = false;
    if (X || Y) { const nx = X ? +X[1] : x, ny = Y ? +Y[1] : y; if (!on && /^G0/.test(l)) d += Math.hypot(nx - x, ny - y); x = nx; y = ny; }
  }
  return d;
}
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---- a sheet of small parts scattered at random: 2-opt never travels more than nearest-next, and usually less
{
  let better = 0, worse = 0, total0 = 0, total1 = 0, depthOk = true;
  for (let trial = 0; trial < 12; trial++) {
    const cs = [];
    for (let i = 0; i < 26; i++) { const x = Math.round(rnd() * 900), y = Math.round(rnd() * 500); cs.push(rect(x, y, 30, 30), circ(x + 15, y + 15, 5)); }
    const a = A.designToGcode(cs, { ...opts, tidyOrder: false }), b = A.designToGcode(cs, opts);
    const ta = travel(a.gcode), tb = travel(b.gcode); total0 += ta; total1 += tb;
    if (tb < ta - 1e-6) better++; if (tb > ta + 1e-6) worse++;
    const d = b.cutInfo.map((c) => c.depth);
    if (d.some((v, i) => i && v > d[i - 1])) depthOk = false;
  }
  t.check("2-opt never makes the travel longer than nearest-next", worse === 0, J({ worse }));
  t.check("on scattered parts it shortens the travel (most layouts, and overall)", better >= 8 && total1 < total0 * 0.97, J({ better, total0: Math.round(total0), total1: Math.round(total1) }));
  t.check("holes are still cut before outlines (deepest first)", depthOk);
}
// ---- a case nearest-next gets wrong: from the corner it takes the near holes first and has to cross the plate back
{
  const holes = [[130, 10], [110, 50], [150, 40], [30, 80], [50, 80], [10, 90], [90, 80]];
  const cs = [rect(0, 0, 200, 100), ...holes.map(([x, y]) => circ(x, y, 3))];
  const a = A.designToGcode(cs, { ...opts, tidyOrder: false }), b = A.designToGcode(cs, opts);
  t.check("7 holes in a plate: the tidied order travels at least a quarter less than nearest-next", travel(b.gcode) < travel(a.gcode) * 0.75, J([travel(a.gcode), travel(b.gcode)]));
  t.check("the outline is still cut last, after every hole", b.cutInfo[b.cutInfo.length - 1].hole === false && b.cutInfo.slice(0, -1).every((c) => c.hole), J(b.cutInfo.map((c) => c.hole)));
  t.check("autoOrder reports the tidied order", JSON.stringify(b.autoOrder) === JSON.stringify(b.cutInfo.map((c) => c.key)), J(b.autoOrder));
}
// ---- the cuts themselves don't change, only their order
{
  const cs = [rect(0, 0, 300, 200), circ(40, 40, 8), circ(260, 160, 8), circ(150, 100, 20), rect(100, 30, 40, 20), circ(40, 160, 8), circ(260, 40, 8)];
  const a = A.designToGcode(cs, { ...opts, tidyOrder: false }), b = A.designToGcode(cs, opts);
  const runs = (g) => g.split("M5").map((s) => s.trim()).filter((s) => /M3/.test(s)).sort();
  t.check("same cuts, only reordered", JSON.stringify(runs(a.gcode)) === JSON.stringify(runs(b.gcode)));
  // ---- a hand order from the Pro cut list still wins
  const want = [6, 2, 1];
  const c = A.designToGcode(cs, { ...opts, order: want });
  t.check("a Pro cut-list order still comes first, as typed", JSON.stringify(c.cutInfo.slice(0, 3).map((x) => x.key)) === JSON.stringify(want), J(c.cutInfo.map((x) => x.key)));
}
// ---- big jobs stay quick
{
  const cs = [];
  for (let i = 0; i < 400; i++) cs.push(circ(5 + (i % 40) * 22 + (i % 3), 5 + Math.floor(i / 40) * 22, 4));
  const t0 = Date.now(); A.designToGcode([rect(-10, -10, 920, 240), ...cs], opts); const ms = Date.now() - t0;
  t.check("400 holes: the order is worked out in under 2 s", ms < 2000, `${ms} ms`);
}
t.done();

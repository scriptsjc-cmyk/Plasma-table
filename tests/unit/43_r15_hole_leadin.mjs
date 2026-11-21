// r15 6.2: round holes get a spiral lead-in: the torch pierces near the hole's centre and spirals out onto the line,
// meeting it smoothly (no straight lead stabbing the edge). Used automatically; an explicit Straight / Arc lead stays as it was.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const t = new T("43_r15_hole_leadin");
const J = (x) => JSON.stringify(x).slice(0, 400);
const circ = (cx, cy, r, n = 72) => ({ pts: Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]), closed: true, circle: { cx, cy, r } });
const rect = (x, y, w, h) => ({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true });
const KERF = 1.5, half = KERF / 2;
const num = (l, k) => { const m = new RegExp(k + "(-?[\\d.]+)").exec(l); return m ? Number(m[1]) : null; };
// the runs of a G-code text: [{ pierce:[x,y], moves:[line...] }]
function runs(g) {
  const out = []; let cur = null, last = null;
  for (const l of g.split("\n")) {
    if (/^G0 /.test(l)) last = [num(l, "X"), num(l, "Y")];
    else if (l === "M3") { cur = { pierce: last, moves: [] }; out.push(cur); }
    else if (l === "M5") cur = null;
    else if (cur && /^G[123] /.test(l)) cur.moves.push(l);
  }
  return out;
}
// points along a G2/G3 move from p
function arcPts(p, l, n = 24) {
  const q = [num(l, "X"), num(l, "Y")], i = num(l, "I"), j = num(l, "J");
  if (i == null) return [q];
  const c = [p[0] + i, p[1] + j], r = Math.hypot(i, j), a0 = Math.atan2(p[1] - c[1], p[0] - c[0]), a1 = Math.atan2(q[1] - c[1], q[0] - c[0]);
  let sw = /^G3/.test(l) ? a1 - a0 : a0 - a1; while (sw <= 1e-6) sw += 2 * Math.PI;
  const dir = /^G3/.test(l) ? 1 : -1;
  return Array.from({ length: n }, (_, k) => { const a = a0 + dir * sw * ((k + 1) / n); return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
}
const plate = (holes) => [rect(0, 0, 140, 100), ...holes];
const opts = { kerf: KERF, leadIn: 3, name: "p" };

// ---- one Ø20 hole in a plate
{
  const g = A.designToGcode(plate([circ(50, 50, 10)]), opts);
  const sh = g.shift, cx = 50 + sh[0], cy = 50 + sh[1], r = 10 - half;
  const hole = runs(g.gcode)[0];
  const lead = hole.moves.slice(0, -1), circle = hole.moves[hole.moves.length - 1];
  t.check("the hole is cut first, and pierces near its centre (within a third of the radius)", !!hole.pierce && Math.hypot(hole.pierce[0] - cx, hole.pierce[1] - cy) <= r / 3, J({ pierce: hole.pierce, cx, cy }));
  t.check("the lead-in is a spiral: two or more anticlockwise arcs before the hole's own circle", lead.length >= 2 && lead.every((l) => /^G3 /.test(l)), J(hole.moves));
  let p = hole.pierce, inside = true, rad = [];
  for (const l of lead) for (const q of arcPts(p, l)) { const d = Math.hypot(q[0] - cx, q[1] - cy); rad.push(d); if (d > r + 0.02) inside = false; p = arcPts(p, l, 1)[0]; }
  t.check("the spiral stays inside the hole (never past the cut line)", inside, J(Math.max(...rad)));
  t.check("the spiral grows outwards", rad.length > 4 && rad[rad.length - 1] > rad[0] + r * 0.4, J([rad[0], rad[rad.length - 1]]));
  const end = [num(lead[lead.length - 1], "X"), num(lead[lead.length - 1], "Y")];
  t.check("the spiral ends on the cut line", Math.abs(Math.hypot(end[0] - cx, end[1] - cy) - r) < 0.01, J(end));
  // tangent where it joins: the last arc's centre lies on the line from the join to the hole's centre
  const ll = lead[lead.length - 1], prev = (() => { let q = hole.pierce; for (const l of lead.slice(0, -1)) q = [num(l, "X"), num(l, "Y")]; return q; })();
  const ac = [prev[0] + num(ll, "I"), prev[1] + num(ll, "J")];
  const cross = (end[0] - cx) * (ac[1] - cy) - (end[1] - cy) * (ac[0] - cx);
  t.check("the spiral meets the line smoothly (tangent at the join)", Math.abs(cross) / r < 0.02, J({ ac, end, cx, cy }));
  t.check("the hole's own circle is unchanged: a full anticlockwise circle from the join", /^G3 /.test(circle) && Math.abs(num(circle, "X") - end[0]) < 0.002 && Math.abs(num(circle, "Y") - end[1]) < 0.002 && Math.abs(Math.hypot(num(circle, "I"), num(circle, "J")) - r) < 0.002, J(circle));
  const job = A.prepareJob(g.gcode, A.cutFor("Mild steel", 3), A.machine, false);
  t.check("the job builder takes it (one pierce per cut, no warnings about rapids)", job.stats.pierces === 2 && !job.warnings.some((w) => /rapid/.test(w)), J(job.warnings));
  const ci = g.cutInfo.find((c) => c.hole);
  t.check("cutInfo's lead is the pierce point near the centre", Math.hypot(ci.lead[0] - 50, ci.lead[1] - 50) <= r / 3, J(ci.lead));
}
// ---- the outline keeps its straight lead from outside
{
  const g = A.designToGcode(plate([circ(50, 50, 10)]), opts), outline = runs(g.gcode)[1];
  t.check("the part's outline keeps its plain lead (one straight move onto the line)", /^G1 /.test(outline.moves[0]), J(outline.moves.slice(0, 2)));
  const disc = A.designToGcode([circ(50, 50, 30)], opts), d = runs(disc.gcode)[0];
  t.check("a round part (a disc) is not spiralled: it keeps its lead from outside", d.moves.length === 2 && /^G1 /.test(d.moves[0]), J(d.moves));
}
// ---- options
{
  const cs = plate([circ(50, 50, 10)]);
  const off = runs(A.designToGcode(cs, { ...opts, holeSpiral: false }).gcode)[0];
  t.check("holeSpiral: false gives the old straight lead (one G1, then the circle)", off.moves.length === 2 && /^G1 /.test(off.moves[0]), J(off.moves));
  const st = runs(A.designToGcode(cs, { ...opts, leadType: "straight" }).gcode)[0];
  t.check("an explicit Straight lead is not changed into a spiral", st.moves.length === 2 && /^G1 /.test(st.moves[0]), J(st.moves));
  const ar = runs(A.designToGcode(cs, { ...opts, leadType: "arc" }).gcode)[0];
  t.check("an explicit Arc lead is not changed into a spiral (one arc lead, then the circle)", ar.moves.length === 2, J(ar.moves));
  const none = runs(A.designToGcode(cs, { ...opts, leadIn: 0 }).gcode)[0];
  t.check("lead-in 0: no spiral either", none.moves.length <= 2, J(none.moves));
}
// ---- small holes and awkward holes
{
  const g = A.designToGcode(plate([circ(30, 30, 3)]), opts), sh = g.shift, h = runs(g.gcode)[0], r = 3 - half;
  let p = h.pierce, inside = true;
  for (const l of h.moves.slice(0, -1)) { for (const q of arcPts(p, l)) if (Math.hypot(q[0] - 30 - sh[0], q[1] - 30 - sh[1]) > r + 0.02) inside = false; p = [num(l, "X"), num(l, "Y")]; }
  t.check("a Ø6 hole: the lead still stays inside the hole", inside && Math.hypot(h.pierce[0] - 30 - sh[0], h.pierce[1] - 30 - sh[1]) < r, J(h));
  // a ring part sitting inside a big hole: the hole's centre is metal, so no spiral there
  const island = [rect(0, 0, 200, 200), circ(100, 100, 60), circ(100, 100, 30), circ(100, 100, 10)];
  const gi = A.designToGcode(island, opts), shi = gi.shift;
  const big = gi.cutInfo.find((c) => c.hole && c.ring.length && Math.abs(Math.hypot(c.start[0] - 100, c.start[1] - 100) - (60 - half)) < 0.05);
  const inMetal = big && Math.hypot(big.lead[0] - 100, big.lead[1] - 100) < 30 + half;
  t.check("a hole with a part inside it doesn't pierce on that part", !!big && !inMetal, J(big && big.lead));
  // a hand-placed start point: the spiral ends there
  const gs = A.designToGcode(plate([circ(50, 50, 10)]), { ...opts, starts: { 1: [50, 60] } });
  const ci = gs.cutInfo.find((c) => c.hole);
  t.check("a hand-placed start: the spiral ends at that spot on the line", Math.hypot(ci.start[0] - 50, ci.start[1] - (60 - half)) < 0.05 && Math.hypot(ci.lead[0] - 50, ci.lead[1] - 50) < 10 / 3, J(ci));
}
t.done();

// r15 Round 1.4-1.7: presets that cut wrong. Holes never overlap (a figure-of-eight), each bracket hole sits on its own
// panel and the 3D shows the same holes, the fan duct's square flange has its opening, the gusset's flanges are really
// cut with fold lines, and the hopper's top flange has no odd notch at the seam and is drawn once in 3D.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { bb } from "../lib/analyze.mjs";

const A = await load();
const t = new T("32_r15_parts");
const defaults = (sh) => Object.fromEntries(sh.params.map(([k, , d]) => [k, d]));
const flat = (id, over = {}) => { const sk = A.newSketch(); sk.add(id, true); const it = sk.items[0]; it.x = 0; it.y = 0; Object.assign(it.p, over); return sk.contours(); };
const shapeOf = (id) => A.SHAPES.find((s) => s.id === id);
const foldOf = (id, over = {}) => { const sh = shapeOf(id); const p = { ...defaults(sh), ...over }; return A.foldModel ? A.foldModel(sh, p) : sh.fold(p); };
const circles = (cs) => cs.filter((c) => c.circle).map((c) => c.circle);
const bends = (cs) => cs.filter((c) => c.role === "bend");
const area = (c) => Math.abs(A.signedArea(c.pts));
const inside = (o, i) => i[0] >= o[0] - 1e-6 && i[1] >= o[1] - 1e-6 && i[2] <= o[2] + 1e-6 && i[3] <= o[3] + 1e-6;
const closed = (cs) => cs.filter((c) => c.closed !== false && c.role !== "bend");
const outers = (cs) => { const L = closed(cs).map((c) => ({ c, a: area(c), b: bb(c.pts) })); return L.filter((x) => !L.some((y) => y !== x && y.a > x.a && inside(y.b, x.b))); };

// 1.4: no preset cuts two holes that touch or overlap (at its default sizes)
const touching = [];
for (const sh of A.SHAPES) {
  let cs; try { cs = flat(sh.id); } catch (e) { continue; }
  const cc = circles(cs || []);
  for (let i = 0; i < cc.length; i++) for (let j = i + 1; j < cc.length; j++) {
    const d = Math.hypot(cc[i].cx - cc[j].cx, cc[i].cy - cc[j].cy);
    // crossing or touching circles (a ring's bore is concentric, not a clash)
    if (d > Math.abs(cc[i].r - cc[j].r) + 0.5 && d < cc[i].r + cc[j].r + 0.5) { touching.push(`${sh.id} (${cc[i].cx.toFixed(1)},${cc[i].cy.toFixed(1)}) / (${cc[j].cx.toFixed(1)},${cc[j].cy.toFixed(1)})`); break; }
  }
}
t.check("1.4: no preset cuts two holes on top of each other", touching.length === 0, touching.slice(0, 8).join("; "));

// 1.4: the sign bracket and the folded shelf bracket put one hole on each panel, and the 3D shows the same holes
for (const [id, legs] of [["signbr", ["wall", "arm"]], ["foldshelf", ["wall", "shelf"]]]) {
  const sh = shapeOf(id), p = defaults(sh), cs = flat(id), cc = circles(cs);
  const ys = bends(cs).map((b) => b.pts[0][1]).sort((a, b) => a - b);
  const edges = [0, ...ys, Infinity];
  const panelOf = (y) => edges.findIndex((e, k) => y > e && y < edges[k + 1]);
  const per = legs.map((_, k) => cc.filter((c) => panelOf(c.cy) === k).length);
  t.check(`1.4 ${id}: one hole on each of the ${legs.join(" and ")} panels`, per.every((n) => n === 1) && cc.length === legs.length, JSON.stringify({ per, holes: cc.map((c) => [c.cx, c.cy]) }));
  t.check(`1.4 ${id}: each hole is centred across the width`, cc.every((c) => Math.abs(c.cx - (p.wid || p.len) / 2) < 1e-6), JSON.stringify(cc.map((c) => c.cx)));
  const m = foldOf(id);
  const n3 = m.faces.reduce((s, f) => s + (f.holes || []).length, 0);
  t.check(`1.4 ${id}: the 3D shows the same ${cc.length} holes`, n3 === cc.length, `3D ${n3} vs flat ${cc.length}`);
  const big = flat(id, { hole: 8, inset: 25 });
  t.check(`1.4 ${id}: a bigger hole further in still cuts cleanly (no overlap)`, circles(big).length === legs.length, String(circles(big).length));
}

// 1.5: the fan duct's square flange has the duct opening in it (like the square-to-round)
{
  const sh = shapeOf("fanduct"), p = defaults(sh), cs = flat("fanduct");
  const sq = outers(cs).find((x) => Math.abs((x.b[2] - x.b[0]) - (p.a + 2 * p.lip)) < 0.5 && Math.abs((x.b[3] - x.b[1]) - (p.a + 2 * p.lip)) < 0.5);
  const hole = sq && closed(cs).find((c) => c !== sq.c && inside(sq.b, bb(c.pts)) && Math.abs(area(c) - p.a * p.a) < 1);
  t.check("1.5 fanduct: the square flange piece is there", !!sq, JSON.stringify(outers(cs).map((x) => x.b.map((v) => Math.round(v)))));
  t.check(`1.5 fanduct: it has a ${p.a} × ${p.a} opening, so it doesn't block the duct`, !!hole, "");
}

// 1.6: the gusset with flanges cuts its flanges, with a fold line along each leg; the flange size changes the cut part
{
  const sh = shapeOf("gusflange"), p = defaults(sh);
  const cs = flat("gusflange"), big = flat("gusflange", { flange: p.flange + 10 });
  t.check("1.6 gusflange: a fold line along each leg", bends(cs).length === 2, String(bends(cs).length));
  const web = (p.a * p.b) / 2, fl = p.flange * (p.a + p.b);
  const o = outers(cs).reduce((s, x) => s + x.a, 0);
  t.check("1.6 gusflange: cut area = triangle web + the two flanges (no extra corner square)", Math.abs(o - (web + fl)) < 1, `flat ${o.toFixed(1)} vs ${(web + fl).toFixed(1)}`);
  const ob = outers(big).reduce((s, x) => s + x.a, 0);
  t.check("1.6 gusflange: a wider flange makes a bigger cut part", ob - o > 10 * (p.a + p.b) - 1, `${o.toFixed(0)} -> ${ob.toFixed(0)}`);
  const m = foldOf("gusflange");
  const a3 = m.faces.reduce((s, f) => s + (f.pts.length === 3 ? (f.w * f.h) / 2 : f.w * f.h), 0);
  t.check("1.6 gusflange: the 3D and the cut part have the same area", Math.abs(a3 - o) / o < 0.02, `3D ${a3.toFixed(0)} vs flat ${o.toFixed(0)}`);
}

// 1.7: the hopper with flanges: the top flange meets the seam cleanly and is drawn once in 3D
{
  const sh = shapeOf("hopflange"), p = defaults(sh), cs = flat("hopflange");
  const body = outers(cs).sort((x, y) => y.a - x.a)[0];
  // a lip that runs past the seam leaves a short jog (< lip) at right angles to a seam edge: look for edges shorter than the lip
  const pts = body.c.pts, n = pts.length, short = [];
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 0.05 && L < p.lip - 0.5) short.push(L.toFixed(1)); }
  t.check("1.7 hopflange: no odd notch where the top flange meets the seam", short.length === 0, `short edges: ${short.join(", ")}`);
  const plain = outers(flat("hopflange", { lip: 0 })).sort((x, y) => y.a - x.a)[0];
  const grow = body.a - plain.a, want = p.lip * 2 * (p.a2 + p.b2);
  t.check("1.7 hopflange: the top flange is added outside the opening (not cut out of the sides)", grow > 0.8 * want && grow < 1.3 * want, `area change ${grow.toFixed(0)} mm² vs about ${want.toFixed(0)}`);
  const m = foldOf("hopflange");
  const key = (f) => f.pts.map((q) => q.map((v) => v.toFixed(2)).join(",")).sort().join("|");
  const seen = new Map(); let dup = 0;
  for (const f of m.faces) { const k = key(f); if (seen.has(k)) dup++; seen.set(k, 1); }
  t.check("1.7 hopflange: the top flange is drawn once in 3D (no duplicate faces)", dup === 0, `${dup} duplicate faces`);
  t.check("1.7 hopflange: four top flange faces in 3D", m.faces.length === 8, `${m.faces.length} faces`);
  // the four flange faces close up into one frame round the top opening, with mitred corners (no gaps, no crossing strips)
  const fl = m.faces.slice(4), quad = (f) => { const q = f.pts; let s2 = [0, 0, 0]; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length];
    s2 = [s2[0] + a[1] * b[2] - a[2] * b[1], s2[1] + a[2] * b[0] - a[0] * b[2], s2[2] + a[0] * b[1] - a[1] * b[0]]; } return Math.hypot(...s2) / 2; };
  const fa = fl.reduce((sum, f) => sum + quad(f), 0), frame = (p.a2 + 2 * p.lip) * (p.b2 + 2 * p.lip) - p.a2 * p.b2;
  t.check("1.7 hopflange: the 3D top flange is one closed frame (area = the frame round the opening)", Math.abs(fa - frame) / frame < 0.02, `3D ${fa.toFixed(0)} vs frame ${frame.toFixed(0)}`);
}

process.exit(t.done() ? 1 : 0);

// r15 Round 2: the part-features model (make/part-features.js). Exact typed numbers, pattern centres that never move,
// mirror links, live checks, and that a part with no features cuts exactly as before (flattening only adds contours).
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { mod } from "../lib/site.mjs";

const t = new T("33_part_features");
const A = await load();
const F = await mod("part-features");
const J = (x) => JSON.stringify(x).slice(0, 400);
const box = (pts) => pts.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const mid = (pts) => { const b = box(pts); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };

// new features land at the part centre, typed values are stored as typed
const h = F.newFeature("hole", 1, 200, 150);
t.check("new hole lands at the part centre", h.x === 100 && h.y === 75, J(h));
t.check("typed 100.1 + float noise is stored as 100.1", F.setFeatureValue(h, "x", "100.10000000001") && h.x === 100.1, J(h));
t.check("a negative diameter is refused", !F.setFeatureValue(h, "d", -3) && h.d === 10);
t.check("a hole cuts centred exactly on its typed centre", (() => { F.setFeatureValue(h, "x", 100); const c = F.featureContours(h)[0]; const m = mid(c.pts); return m[0] === 100 && Math.abs(m[1] - 75) < 1e-9 && c.circle && c.circle.r === 5; })());

// bolt circle: the centre is stored, so the count can change without moving it
const b = { ...F.newFeature("bolt", 2, 200, 150), n: 4, d: 6.5, pcd: 80, ang: 45 };
const c4 = F.holeCentres(b); b.n = 6; const c6 = F.holeCentres(b);
const avg = (cs) => [cs.reduce((a, p) => a + p[0], 0) / cs.length, cs.reduce((a, p) => a + p[1], 0) / cs.length];
t.check("bolt circle: 4 holes at 45° on 80 PCD", Math.abs(c4[0][0] - (100 + 40 * Math.SQRT1_2)) < 1e-9 && Math.abs(c4[0][1] - (75 + 40 * Math.SQRT1_2)) < 1e-9, J(c4));
t.check("bolt circle: 4 -> 6 holes keeps the centre", b.x === 100 && b.y === 75 && avg(c6).every((v, i) => Math.abs(v - [100, 75][i]) < 1e-9), J(avg(c6)));

// grid centred on its stored centre
const g = { ...F.newFeature("grid", 3, 200, 150), cols: 2, rows: 2, px: 176, py: 126, d: 8.5 };
t.check("grid: 2 x 2 on 176 x 126 sits 12 mm in from each corner", J(F.holeCentres(g)) === J([[12, 12], [188, 12], [12, 138], [188, 138]]), J(F.holeCentres(g)));

// slot: a vertical 30 x 8.5 slot has an exact 8.5 x 30 box
const s = { ...F.newFeature("slot", 4, 200, 150), len: 30, wid: 8.5, rot: 90, x: 40, y: 75 };
const sb = box(F.featureContours(s)[0].pts);
t.check("slot: vertical 30 x 8.5 box is exact", J(sb.map((v) => Math.round(v * 1e9) / 1e9)) === J([35.75, 60, 44.25, 90]), J(sb));

// mirror + link
const feats = [s];
const tw = { ...F.mirrored(s, 200), id: 5, link: 4 }; feats.push(tw);
t.check("mirror: twin at X 160, still vertical", tw.x === 160 && tw.rot === 90, J(tw));
s.len = 40; F.syncLinks(feats, s, 200);
t.check("mirror: editing the source updates the twin", tw.len === 40 && tw.x === 160, J(tw));
tw.y = 80; F.syncLinks(feats, tw, 200);
t.check("mirror: editing the twin updates the source", s.y === 80 && s.x === 40, J(s));
delete tw.link; s.len = 30; F.syncLinks(feats, s, 200);
t.check("mirror: after unlink the twin stays put", tw.len === 40, J(tw));

// live checks
const outline = [[0, 0], [200, 0], [200, 150], [0, 150]];
const bore = { ...F.newFeature("hole", 10, 200, 150), d: 60 };
const stray = { ...F.newFeature("hole", 11, 200, 150), d: 10, x: 128 };
let iss = F.featureIssues([bore, stray], outline, 3);
t.check("check: overlapping holes are both flagged", iss.has(10) && iss.has(11), J([...iss]));
stray.x = 150; stray.y = 110; iss = F.featureIssues([bore, stray], outline, 3);
t.check("check: moved clear, nothing is flagged", !iss.size, J([...iss]));
stray.d = 2; iss = F.featureIssues([bore, stray], outline, 3);
t.check("check: Ø2 in 3 mm plate is under 1.5 x thickness", (iss.get(11) || []).some((m) => /1\.5/.test(m)), J([...iss]));
stray.d = 10; stray.x = 3; iss = F.featureIssues([stray], outline, 3);
t.check("check: a hole past the edge is outside the part", (iss.get(11) || []).some((m) => /outside/i.test(m)), J([...iss]));
stray.x = 9.5; iss = F.featureIssues([stray], outline, 3);
t.check("check: 4.5 mm (1.5 x 3 mm) of metal to the edge is fine", !(iss.get(11) || []).length, J([...iss]));
stray.x = 9; iss = F.featureIssues([stray], outline, 3);
t.check("check: 4 mm of metal to the edge in 3 mm plate is too close (< 1.5 x thickness)", (iss.get(11) || []).some((m) => /close/i.test(m)), J([...iss]));

// text and etch: etched, one feature
const tx = { ...F.newFeature("text", 12, 200, 150), text: "PORTA 01", h: 10, y: 20 };
const tcs = F.featureContours(tx);
t.check("text: several contours, all etched", tcs.length > 4 && tcs.every((c) => c.op === "score"), tcs.length);
const e = F.featureContours(F.newFeature("etch", 13, 200, 150))[0];
t.check("etch line: an open etched line", e.closed === false && e.op === "score" && e.pts.length === 2, J(e));

// in a sketch: features flatten into the part's contours; no features = exactly as before
const sk = A.newSketch(); sk.add("rect", true, {}); const it = sk.items[0];
Object.assign(it.p, { w: 200, h: 150, r: 10 }); it.x = 25; it.y = 40;
const before = JSON.stringify(sk.contours());
it.feats = [{ ...bore }, { ...g }];
const cs = sk.contoursOf(it);
t.check("sketch: features add their contours after the outline", cs.length === 1 + 1 + 4 && cs.slice(1).every((c) => c.feat), cs.length);
const bm = mid(cs[1].pts);
t.check("sketch: the bore is cut at the outline corner + (100, 75)", Math.abs(bm[0] - 125) < 1e-9 && Math.abs(bm[1] - 115) < 1e-9, J(bm));
it.feats[0].hide = true;
t.check("sketch: a hidden feature is not cut", sk.contoursOf(it).length === 5);
delete it.feats;
t.check("sketch: no features -> contours identical to before", JSON.stringify(sk.contours()) === before);
const saved = sk.sanitizeItem(JSON.parse(JSON.stringify({ ...it, feats: [bore, { k: "nope", id: 9 }, { ...s, link: 4 }] })));
t.check("saved part: features survive a reload, unknown kinds dropped", saved.feats.length === 2 && saved.feats[1].link === 4 && saved.feats[0].d === 60, J(saved.feats));
const g1 = A.designToGcode(sk.contours(), { kerf: 1.5, leadIn: 3 }).gcode;
it.feats = [bore, g];
const g2 = A.designToGcode(sk.contours(), { kerf: 1.5, leadIn: 3 }).gcode;
t.check("gcode: the features add 5 pierces", (g2.match(/M3\b/g) || []).length - (g1.match(/M3\b/g) || []).length === 5, `${(g1.match(/M3\b/g) || []).length} -> ${(g2.match(/M3\b/g) || []).length}`);

// a version change keeps matching values (3D P1-1): rect R10 -> Corner holes keeps 200 x 150 R10
const vk = A.newSketch(); vk.add("rect", true, {}); const vi = vk.items[0]; Object.assign(vi.p, { w: 200, h: 150, r: 10 }); vi.feats = [{ ...bore }]; vk.pick([vi.id]);
vk.applyVariant(A.variantsFor("rect").find((v) => v.label === "Corner holes"));
t.check("version: Corner holes keeps 200 x 150 R10 and the features", vi.type === "plate" && vi.p.w === 200 && vi.p.h === 150 && vi.p.r === 10 && vi.feats.length === 1, J({ type: vi.type, p: vi.p }));
vk.applyVariant(A.variantsFor("plate").find((v) => v.id === "rect" && v.label === "Square corners"));
t.check("version: a version that sets a value still sets it (Square corners -> R0)", vi.type === "rect" && vi.p.r === 0 && vi.p.w === 200, J(vi.p));

// dragging a feature's contour on the canvas moves the whole feature, and its mirror twin follows (part width from the outline)
const dk = A.newSketch(); dk.add("rect", true, {}); const di = dk.items[0]; Object.assign(di.p, { w: 200, h: 150, r: 0 });
di.feats = [{ ...F.newFeature("slot", 1, 200, 150), x: 40, rot: 90 }, { ...F.newFeature("slot", 2, 200, 150), x: 160, rot: 90, link: 1 }];
dk.moveHole(di, 1, 5, 0);
t.check("drag: a feature moves as one and its mirror twin follows", di.feats[0].x === 45 && di.feats[1].x === 155 && !Object.keys(di.holes || {}).length, J(di.feats));

// feature handles sit on the feature centre, also on a turned / mirrored part
for (const [rotd, fx] of [[0, false], [90, false], [30, true]]) {
  const hk = A.newSketch(); hk.add("rect", true, {}); const hi = hk.items[0]; Object.assign(hi.p, { w: 200, h: 150, r: 10 }); hi.x = 25; hi.y = 40; hi.rot = rotd; hi.fx = fx;
  hi.feats = [{ ...F.newFeature("hole", 1, 200, 150), x: 40, y: 30, d: 12 }];
  const w = hk.partToWorld(hi, [[40, 30]])[0], c = hk.contoursOf(hi).find((q) => q.feat === 1), m = mid(c.pts);
  t.check(`handle: feature centre maps onto the cut hole (rot ${rotd}${fx ? ", mirrored" : ""})`, Math.hypot(w[0] - m[0], w[1] - m[1]) < 1e-6, J({ w, m }));
}

// loose holes inside a part become feature rows that cut the same holes (plan 2.16)
for (const [hrot, hfx] of [[0, false], [90, false], [30, true]]) {
  const ak = A.newSketch(); ak.add("rect", true, {}); const host = ak.items[0]; Object.assign(host.p, { w: 200, h: 150, r: 0 }); host.x = 0; host.y = 0;
  const add = (type, p, x, y, rot = 0) => { ak.add(type, true, {}); const o = ak.items[ak.items.length - 1]; Object.assign(o.p, p); o.x = x; o.y = y; o.rot = rot; o._key = undefined; return o; };
  add("hole", { d: 10 }, 20, 20); add("slothole", { len: 30, wid: 8 }, 60, 100, 90); add("boltcircle", { n: 6, pcd: 50, hole: 6, start: 90 }, 70, 40);
  add("holegrid", { cols: 3, rows: 2, sx: 20, sy: 15, hole: 5 }, 130, 20); add("cornerholes", { w: 40, h: 30, hole: 4 }, 130, 90); add("holerow", { n: 4, sp: 12, hole: 4 }, 20, 120);
  const holesOf = (sk) => sk.contours().slice(1).map((c) => { const b = box(c.pts); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, b[2] - b[0]]; });
  host.rot = hrot; host.fx = hfx; host._key = undefined;
  // turning the host would move the loose holes away; turn everything together as the app does (carryOwned)
  if (hrot || hfx) { for (const o of ak.items.slice(1)) o._key = undefined; }
  const before = holesOf(ak).map((h) => h.map((v) => Math.round(v * 10) / 10)).sort().join(";");
  const list = F.adoptableHoles(ak, host);
  if (!hrot && !hfx) {
    t.check("adopt: all 6 loose hole items are offered", list.length === 6, J(list.map((x) => x.item.type)));
    host.feats = list.map((x) => x.feat); ak.items = [host]; host._key = undefined;
    const after = holesOf(ak).map((h) => h.map((v) => Math.round(v * 10) / 10)).sort().join(";");
    t.check("adopt: the features cut the same holes as the loose items did", after === before, `${before}\n${after}`);
    t.check("adopt: one row per item (bolt circle / grid / row stay patterns)", J(host.feats.map((f) => f.k)) === J(["hole", "slot", "bolt", "grid", "grid", "edge"]), J(host.feats));
    t.check("adopt: bolt circle keeps n 6 / PCD 50 / start 90", host.feats[2].n === 6 && host.feats[2].pcd === 50 && host.feats[2].ang === 90, J(host.feats[2]));
  } else {
    t.check(`adopt: on a turned / mirrored host the offer only includes items that rebuild exactly (rot ${hrot}${hfx ? ", mirrored" : ""})`, list.length >= 2 && list.every((x) => {
      const sk2 = A.newSketch(); sk2.items = [JSON.parse(JSON.stringify(host))]; sk2.items[0].feats = [x.feat];
      const want = ak.contoursOf(x.item).map((c) => mid(c.pts)), got = sk2.contoursOf(sk2.items[0]).slice(1).map((c) => mid(c.pts));
      return want.length === got.length && want.every((w) => got.some((g) => Math.hypot(g[0] - w[0], g[1] - w[1]) < 0.06));
    }), J(list.map((x) => x.feat)));
  }
}

// Join keeps the features of both parts as rows on the new "Outline" (plan 2.13)
{
  const jk = A.newSketch();
  jk.add("rect", true, {}); const a = jk.items[0]; Object.assign(a.p, { w: 100, h: 60, r: 0 }); a.x = 0; a.y = 0;
  jk.add("rect", true, {}); const b2 = jk.items[1]; Object.assign(b2.p, { w: 60, h: 100, r: 0 }); b2.x = 90; b2.y = 0; b2.rot = 90; b2._key = undefined;
  a.feats = [{ ...F.newFeature("hole", 1, 100, 60), x: 20, y: 30, d: 10 }, { ...F.newFeature("slot", 2, 100, 60), x: 50, y: 30, len: 20, wid: 6, rot: 0 }];
  b2.feats = [{ ...F.newFeature("hole", 1, 60, 100), x: 30, y: 20, d: 8 }, { ...F.newFeature("hole", 2, 60, 100), x: 30, y: 80, d: 8, link: 1 }];
  a._key = b2._key = undefined;
  const worldHoles = (sk) => sk.contours().filter((c) => c.feat).map((c) => mid(c.pts).map((v) => Math.round(v * 100) / 100)).sort().join(";");
  const before = worldHoles(jk), pastLen = jk.past.length;
  jk.pick([a.id, b2.id]); jk.join();
  const o = jk.items[0];
  t.check("join: makes one custom part named Outline", jk.items.length === 1 && o.type === "custom" && o.name === "Outline", J(jk.items.map((i) => [i.type, i.name])));
  t.check("join: both parts' features are kept as rows (4), ids renumbered, the link follows", (o.feats || []).length === 4 && new Set(o.feats.map((f) => f.id)).size === 4 && o.feats[3].link === o.feats[2].id, J(o.feats));
  t.check("join: the features cut in the same places", worldHoles(jk) === before, `${before}\n${worldHoles(jk)}`);
  t.check("join: the outline itself has no baked-in feature holes", o.shape.cs.length === 1, o.shape.cs.length);
  const slot = o.feats.find((f) => f.k === "slot");
  t.check("join: the slot keeps its direction on the sheet", slot && slot.rot === 0, J(slot));
  jk.undo();
  t.check("join: one undo gives both parts back with their features", jk.items.length === 2 && (jk.items[0].feats || []).length === 2 && (jk.items[1].feats || []).length === 2 && jk.past.length === pastLen, J(jk.items.map((i) => (i.feats || []).length)));
}

process.exit(t.done() ? 1 : 0);

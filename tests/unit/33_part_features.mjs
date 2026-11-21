// r15 Round 2: the part-features model (make/part-features.js). Exact typed numbers, pattern centres that never move,
// mirror links, live checks, and that a part with no features cuts exactly as before (flattening only adds contours).
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { mod, REPO } from "../lib/site.mjs";

const t = new T("33_part_features");
const A = await load();
const F = await mod("part-features");
const J = (x) => String(JSON.stringify(x)).slice(0, 400);
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

// Pattern for any feature (plan 2.6 / 2.7): one row, copies built from the original's exact place
{
  const fr = { W: 200, H: 150 };
  const centres = (f) => F.featureContours(f).map((c) => mid(c.pts).map((v) => Math.round(v * 1e6) / 1e6));
  const sl = { ...F.newFeature("slot", 1, 200, 150), x: 40, y: 30, len: 20, wid: 6, rot: 0 };
  const g = F.patternOf(sl, 1, fr);
  t.check("pattern: Make a pattern on a slot keeps it ONE slot row with a 2-copy grid, the original unmoved", g && g.k === "slot" && g.x === 40 && g.y === 30 && g.pat && g.pat.t === "grid" && g.pat.cols === 2 && g.pat.rows === 1 && F.featureContours(g).length === 2, J(g));
  F.setFeatureValue(g, "pcols", 3, fr); F.setFeatureValue(g, "ppx", 40, fr);
  t.check("pattern: 3 across at pitch 40 -> slots at X 40, 80, 120 (exact)", J(centres(g)) === J([[40, 30], [80, 30], [120, 30]]), J(centres(g)));
  t.check("pattern: the row says so", /3 × 1/.test(F.featureSummary(g)) && /pitch 40/.test(F.featureSummary(g)), F.featureSummary(g));
  // round a centre: a rectangle cut-out 4 times round the part centre
  const rc = { ...F.newFeature("rect", 2, 200, 150), x: 100, y: 115, w: 20, h: 10, r: 0, rot: 0 };
  const cp = F.patternOf(rc, 2, fr); F.setFeatureValue(cp, "pt", "circle", fr); F.setFeatureValue(cp, "pn", 4, fr);
  t.check("pattern: round the part centre by default, 4 copies 90° apart", J(centres(cp)) === J([[100, 115], [60, 75], [100, 35], [140, 75]]), J(centres(cp)));
  const turned = F.featureContours(cp)[1], tb = box(turned.pts);
  t.check("pattern: copies round a circle are turned with it (the 20 × 10 cut-out stands 10 × 20 at 90°)", Math.abs((tb[2] - tb[0]) - 10) < 1e-6 && Math.abs((tb[3] - tb[1]) - 20) < 1e-6, J(tb));
  F.setFeatureValue(cp, "pn", 6, fr);
  t.check("pattern: changing the count never moves the original or the centre", J(centres(cp)[0]) === J([100, 115]) && cp.pat.cx === 100 && cp.pat.cy === 75, J(cp.pat));
  // in a line: etched text 3 times, 20 apart going up
  const tx = { ...F.newFeature("text", 3, 200, 150), x: 100, y: 20, text: "A", h: 8 };
  const one = F.featureContours(tx).length;
  const ln = F.patternOf(tx, 3, fr); F.setFeatureValue(ln, "pt", "line", fr); F.setFeatureValue(ln, "pn", 3, fr); F.setFeatureValue(ln, "ppitch", 20, fr); F.setFeatureValue(ln, "pang", 90, fr);
  const ys = F.featureContours(ln).map((c) => Math.round(box(c.pts)[1] * 1e6) / 1e6);
  t.check("pattern: text in a line - 3 copies, each 20 mm higher, still etched", F.featureContours(ln).length === 3 * one && new Set(ys).size === 3 && Math.abs(Math.max(...ys) - Math.min(...ys) - 40) < 1e-6 && F.featureContours(ln).every((c) => c.op === "score"), J(ys));
  // checks see the copies; mirror and save keep the pattern
  const tight = { ...g, pat: { ...g.pat, px: 10 } };
  t.check("pattern: copies closer than their size are flagged", (F.featureIssues([tight], [[0, 0], [200, 0], [200, 150], [0, 150]], 3).get(1) || []).some((m) => /overlap/i.test(m)), J([...F.featureIssues([tight], [[0, 0], [200, 0], [200, 150], [0, 150]], 3)]));
  const far = { ...g, pat: { ...g.pat, cols: 9 } };
  t.check("pattern: a copy past the edge is flagged", (F.featureIssues([far], [[0, 0], [200, 0], [200, 150], [0, 150]], 3).get(1) || []).some((m) => /outside|edge/i.test(m)), J([...F.featureIssues([far], [[0, 0], [200, 0], [200, 150], [0, 150]], 3)]));
  const tw = F.mirrored(g, 200);
  t.check("pattern: the mirror twin's copies mirror too (X 160, 120, 80)", J(centres(tw)) === J([[160, 30], [120, 30], [80, 30]]), J(centres(tw)));
  t.check("pattern: save / reload keeps the pattern", J(F.sanitizeFeature(JSON.parse(JSON.stringify(cp))).pat) === J(cp.pat));
  F.setFeatureValue(cp, "pt", "none", fr);
  t.check("pattern: Pattern None goes back to the single feature", !cp.pat && F.featureContours(cp).length === 1, J(cp));
  t.check("pattern: a hole still becomes a Grid of holes row (unchanged)", F.patternOf({ ...F.newFeature("hole", 9, 200, 150), d: 8 }, 9, fr).k === "grid");
}

// Cut out (plan 2.13): a shape cut from inside a part becomes a Shape cut-out row and the part stays editable
{
  const near = (a, b, tol = 1e-6) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < tol && Math.abs(p[1] - b[i][1]) < tol);
  const setup = (rot = 0) => {
    const ck = A.newSketch();
    ck.add("rect", true, {}); const host = ck.items[0]; Object.assign(host.p, { w: 200, h: 150, r: 10 }); host.x = 30; host.y = 20; host.rot = rot; host._key = undefined;
    host.feats = [{ ...F.newFeature("hole", 1, 200, 150), x: 30, y: 30, d: 8.5 }];
    ck.add("triangle", true, {}); const tri = ck.items[1];
    ck.add("disc", true, {}); const disc = ck.items[2]; disc.p.d = 12;
    return { ck, host, tri, disc };
  };
  const { ck, host, tri, disc } = setup();
  const hb = ck.boxOf(host);
  tri.x = hb[0] + 80; tri.y = hb[1] + 60; tri._key = undefined;                       // wholly inside the plate
  disc.x = hb[0] + 150; disc.y = hb[1] + 100; disc._key = undefined;
  const triWorld = ck.contoursOf(tri)[0].pts.map((p) => [...p]), discC = ck.contoursOf(disc)[0].circle;   // the disc cuts as this true circle
  const hostP = J(host.p), pastLen = ck.past.length;
  ck.pick([host.id, tri.id, disc.id]); ck.subtract();
  const o = ck.items[0];
  t.check("cut out: inside cutters leave ONE part, the same plate (type, sizes, id) - still editable", ck.items.length === 1 && o === host && o.type === "rect" && J(o.p) === hostP, J(ck.items.map((i) => [i.type, i.id])));
  const rows = (o.feats || []).map((f) => f.k);
  t.check("cut out: the triangle is a Shape cut-out row, the disc a Hole row, the plate's own row kept", J(rows) === J(["hole", "shape", "hole"]), J(o.feats));
  const sh = (o.feats || []).find((f) => f.k === "shape") || {};
  const cut = ck.contours().find((c) => c.feat === sh.id);
  t.check("cut out: the Shape cut-out cuts exactly where the triangle was (no 0.1 mm rounding)", !!cut && near(cut.pts, triWorld), J({ cut: cut && cut.pts.slice(0, 3), triWorld: triWorld.slice(0, 3) }));
  const dh = (o.feats || [])[2] || {};
  t.check("cut out: the disc's Hole row has its exact centre and Ø12", dh.d === 12 && Math.abs(dh.x + hb[0] - discC.cx) < 1e-6 && Math.abs(dh.y + hb[1] - discC.cy) < 1e-6, J(dh));
  t.check("cut out: the row reads as a drawn shape with its size", /drawn/i.test(F.featureSummary(sh)) && sh.w > 0 && sh.h > 0, F.featureSummary(sh));
  // the row stays editable: move it and change its width
  const w0 = sh.w; F.setFeatureValue(sh, "x", sh.x + 10); F.setFeatureValue(sh, "w", w0 * 2); o._key = undefined;
  const cut2 = ck.contours().find((c) => c.feat === sh.id), b2 = box(cut2.pts), b1 = box(triWorld);
  t.check("cut out: editing the row moves and resizes the cut-out", Math.abs((b2[2] - b2[0]) - 2 * (b1[2] - b1[0])) < 1e-6 && Math.abs((b2[0] + b2[2]) / 2 - ((b1[0] + b1[2]) / 2 + 10)) < 1e-6, J({ b1, b2 }));
  const back = A.newSketch(); back.items = JSON.parse(JSON.stringify(ck.items)).map((i) => back.sanitizeItem(i));
  t.check("cut out: a save / reload keeps the drawn cut-out", J(back.contours().find((c) => c.feat === sh.id).pts) === J(cut2.pts));
  ck.undo();
  t.check("cut out: one undo gives the plate, triangle and disc back", ck.items.length === 3 && (ck.items[0].feats || []).length === 1 && ck.past.length === pastLen, J(ck.items.map((i) => i.type)));
  // a turned plate: the row is measured in the plate's own frame and still cuts where the triangle was
  const r = setup(90); const rb = r.ck.boxOf(r.host);
  r.tri.x = rb[0] + 25; r.tri.y = rb[1] + 60; r.tri._key = undefined;
  const rw = r.ck.contoursOf(r.tri)[0].pts.map((p) => [...p]);
  r.ck.pick([r.host.id, r.tri.id]); r.ck.subtract();
  const rs = (r.host.feats || []).find((f) => f.k === "shape");
  t.check("cut out: on a plate turned 90° the cut-out still cuts where it was drawn", r.ck.items.length === 2 && rs && near(r.ck.contours().find((c) => c.feat === rs.id).pts, rw), J(rs));
  // a cutter with several loops: every hole of a bolt circle becomes a row (none dropped)
  const m = setup(); const mb = m.ck.boxOf(m.host);
  m.ck.pick([m.host.id]); m.ck.add("boltcircle", true, {}); const bc = m.ck.items.find((i) => i.type === "boltcircle"); bc.x = mb[0] + 60; bc.y = mb[1] + 40; bc._key = undefined;
  const bcC = m.ck.contoursOf(bc).map((c) => c.circle && [c.circle.cx, c.circle.cy, c.circle.r]);
  m.ck.pick([m.host.id, bc.id]); m.ck.subtract();
  const bh = (m.host.feats || []).slice(1);
  t.check("cut out: a bolt circle cutter gives one Hole row per hole, each at its exact centre", bcC.length >= 3 && bh.length === bcC.length && bh.every((f, i) => f.k === "hole" && Math.abs(f.x + mb[0] - bcC[i][0]) < 1e-6 && Math.abs(f.y + mb[1] - bcC[i][1]) < 1e-6 && Math.abs(f.d - 2 * bcC[i][2]) < 1e-6), J({ bh, bcC }));
  // a cutter across the edge changes the outline: that makes an "Outline" part, and the plate's rows are carried, not baked in
  const e = setup(); const eb = e.ck.boxOf(e.host);
  e.tri.x = eb[2] - 20; e.tri.y = eb[1] + 60; e.tri._key = undefined;
  e.ck.pick([e.host.id, e.tri.id]); e.ck.subtract();
  const eo = e.ck.items.find((i) => i.type === "custom") || {};
  t.check("cut out: across the edge -> one 'Outline' part with a notch, the plate's Hole kept as a row", e.ck.items.length === 2 && eo.type === "custom" && eo.name === "Outline" && J((eo.feats || []).map((f) => [f.k, f.d])) === J([["hole", 8.5]]) && eo.shape.cs.length === 1, J({ t: eo.type, n: eo.name, f: eo.feats, cs: eo.shape && eo.shape.cs.length }));
}

// Corners as a feature (plan 2.12): fillet / chamfer never turns a shape into a fixed outline
{
  const area = (pts) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const mkG = () => { const g = A.newSketch(); g.add("gusset", true, {}); const it = g.items[0]; it.p.cut = 30; it.x = 10; it.y = 10; it._key = undefined;
    it.feats = [{ ...F.newFeature("hole", 1, 100, 100), x: 30, y: 30, d: 8 }]; g.pick([it.id]); return { g, it }; };
  const { g, it } = mkG();
  const P0 = J(it.p), out0 = g.contoursOf(it)[0].pts.map((p) => [...p]), hole0 = J(mid(g.contours().find((c) => c.feat === 1).pts));
  const n0 = g.cornerList(it).length, past0 = g.past.length;
  t.check("corners: a gusset (no corner radius) has sharp corners to pick", n0 >= 3, n0);
  const n = g.chamferCorners(5, 45);
  const row = (it.feats || []).find((f) => f.k === "corner") || {};
  t.check("corners: Chamfer all on a gusset keeps it a gusset (same sizes) and adds ONE Corners row", it.type === "gusset" && J(it.p) === P0 && n === n0 && J([row.kind, row.r, row.at]) === J(["chamfer", 5, "all"]), J({ type: it.type, n, row }));
  t.check("corners: the row reads 'Chamfer 5 at all corners'", /chamfer 5 at all corners/i.test(F.featureSummary(row)), F.featureSummary(row));
  const out1 = g.contoursOf(it)[0].pts;
  t.check("corners: the cut outline is chamfered (more points, less area) and the part does not move", out1.length === out0.length + n0 && area(out1) < area(out0) && J(g.boxOf(it).slice(0, 2)) === J([10, 10]), J({ a0: area(out0), a1: area(out1), box: g.boxOf(it) }));
  t.check("corners: the part's holes stay exactly where they were", J(mid(g.contours().find((c) => c.feat === 1).pts)) === hole0);
  g.undo();
  t.check("corners: one undo removes the chamfer", !g.items[0].feats.some((f) => f.k === "corner") && g.past.length === past0 && J(g.contoursOf(g.items[0])[0].pts) === J(out0));
  // round one picked corner, then change its radius on the row
  const r2 = mkG(); const c0 = r2.g.cornerList(r2.it)[0];
  const hit = r2.g.cornerPickAt(c0.world[0] + 0.3, c0.world[1] - 0.2, 4, { mode: "round", radius: 6 });
  const rr = (r2.it.feats || []).find((f) => f.k === "corner") || {};
  t.check("corners: clicking one corner in Fillet mode adds 'R6 at 1 corner' (shape unchanged)", hit && r2.it.type === "gusset" && J([rr.kind, rr.r, rr.at]) === J(["round", 6, [0]]) && /R6 at 1 corner/.test(F.featureSummary(rr)), J(rr));
  const P = c0.world, d6 = Math.min(...r2.g.contoursOf(r2.it)[0].pts.map((q) => Math.hypot(q[0] - P[0], q[1] - P[1])));
  F.setFeatureValue(rr, "r", 12); r2.it._key = undefined;
  const d12 = Math.min(...r2.g.contoursOf(r2.it)[0].pts.map((q) => Math.hypot(q[0] - P[0], q[1] - P[1])));
  t.check("corners: the rounded corner pulls in from the sharp point, more for R12 than R6", d6 > 0.5 && d12 > d6 * 1.5, J({ d6, d12 }));
  const back = A.newSketch(); back.items = JSON.parse(JSON.stringify(r2.g.items)).map((i) => back.sanitizeItem(i));
  t.check("corners: a save / reload keeps the corner row and its cut", J(back.contoursOf(back.items[0])[0].pts) === J(r2.g.contoursOf(r2.it)[0].pts), J(back.items[0].feats));
  // a rectangle: rounding all corners still just sets its corner radius
  const rk = A.newSketch(); rk.add("rect", true, {}); const ri = rk.items[0]; Object.assign(ri.p, { w: 200, h: 150, r: 0 }); rk.pick([ri.id]);
  rk.cornerRow(ri, { kind: "round", r: 10, at: "all" });
  t.check("corners: Round all corners on a rectangle sets its corner radius (R10), no extra outline work", ri.type === "rect" && ri.p.r === 10, J({ p: ri.p, f: ri.feats }));
  // inside corners of an L bracket get rounded without making it a fixed outline
  const lk = A.newSketch(); lk.add("lbracket", true, {}); const li = lk.items[0]; li.p.r = 0; li._key = undefined; lk.pick([li.id]);
  const nIn = lk.filletInsideCorners(3);
  t.check("corners: All inside corners on an L bracket -> a row, still an L bracket", li.type === "lbracket" && nIn >= 1 && (li.feats || []).some((f) => f.k === "corner" && f.at === "inside"), J({ nIn, t: li.type, f: li.feats }));
  // Fillet pick mode on a shape with no radius keeps the shape (no conversion to a custom outline)
  const pk = mkG(); pk.g.startFilletPick(5, "round");
  t.check("corners: starting Fillet pick on a gusset does not turn it into a fixed outline", pk.g.items[0].type === "gusset" && !!pk.g.filletPick, pk.g.items[0].type);
  pk.g.endFilletPick();
}

// DXF / SVG imports: circles inside the only outline open as Hole rows (plan 2.16); anything else stays in the outline
{
  const b = Math.tan(Math.PI / 8), circ = (cx, cy, r) => ({ pts: [[cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]], bulges: [b, b, b, b] });
  const poly = (cx, cy, r, n) => ({ pts: Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]) });
  const R = 10, rr = Math.tan(Math.PI / 8);
  const rounded = { pts: [[R, 0], [200 - R, 0], [200, R], [200, 150 - R], [200 - R, 150], [R, 150], [0, 150 - R], [0, R]], bulges: [0, rr, 0, rr, 0, rr, 0, rr] };
  const ik = A.newSketch();
  ik.importParts([{ x: 0, y: 0, cs: [rounded, circ(20, 20, 4.25), poly(100, 75, 30, 64), circ(197, 75, 6), { pts: [[50, 120], [70, 120], [60, 135]] }] }], true, { adoptHoles: true });
  const it = ik.items[0];
  t.check("import: circles inside a rounded outline become Hole rows with exact centres", J((it.feats || []).map((f) => [f.k, f.x, f.y, f.d])) === J([["hole", 20, 20, 8.5]]), J(it.feats));
  // a 64-sided polygon only looks round: as a hole row it would cut as a true circle, so it stays in the outline (cut unchanged)
  t.check("import: a polygon circle, a circle crossing the edge and a triangle stay in the outline", it.shape.cs.length === 4, it.shape.cs.length);
  const plain = A.newSketch(); plain.importParts([{ x: 0, y: 0, cs: [rounded, circ(20, 20, 4.25)] }], true);
  t.check("import: without adoptHoles (other tools) nothing changes", !plain.items[0].feats && plain.items[0].shape.cs.length === 2);
  const two = A.newSketch(); two.importParts([{ x: 0, y: 0, cs: [{ pts: [[0, 0], [50, 0], [50, 50], [0, 50]] }, { pts: [[100, 0], [150, 0], [150, 50], [100, 50]] }, circ(25, 25, 5)] }], true, { adoptHoles: true });
  t.check("import: a part with two outlines keeps its circles (rows are measured from one outline)", !two.items[0].feats, J(two.items[0].feats));
}

// Josh: auto-adopting DXF circles must never change the cut. Same G-code (hole positions, sizes, order, lead-ins, pierce
// points) with and without adoptHoles, for the repo's own DXFs and a mixed part (circles drawn from odd start angles, CW).
{
  const fs = await import("node:fs");
  const D = await mod("dxf"), E = await mod("editable");
  const files = ["samples/plate_with_slot.dxf", "tests/data/plate.dxf", "tests/data/part02.dxf", "tests/data/inch.dxf",
    ...fs.readdirSync(REPO + "/tests/data/batch20").filter((f) => /^part\d+(_inches)?\.dxf$/.test(f)).map((f) => "tests/data/batch20/" + f)];
  const gcodeOf = (parts, adoptHoles) => { const sk = A.newSketch(); sk.importParts(parts, true, { adoptHoles }); return { sk, g: A.designToGcode(sk.contours(), { kerf: 1.5, leadIn: 3, name: "x" }).gcode }; };
  let adopted = 0; const bad = [];
  for (const f of files) {
    const e = E.contoursToEditable(D.parseDXF(fs.readFileSync(REPO + "/" + f, "utf8")).contours);
    const a = gcodeOf(e.parts, false), b = gcodeOf(e.parts, true);
    adopted += b.sk.items.reduce((n, i) => n + (i.feats || []).length, 0);
    if (a.g !== b.g) bad.push(f);
  }
  t.check("DXF import: adopting circles as Hole rows leaves every repo DXF's G-code byte-identical", !bad.length && adopted >= 12, J({ bad, adopted }));
  const odd = (cx, cy, r, n, a0, cw) => { const bb = Math.tan(Math.PI / (2 * n)) * (cw ? -1 : 1), pts = [];
    for (let i = 0; i < n; i++) { const a = ((a0 + (cw ? -360 : 360) * i / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return { pts, bulges: pts.map(() => +bb.toFixed(6)) }; };   // DXF writers round bulges to 6 places
  const parts = [{ x: 0, y: 0, cs: [{ pts: [[0, 0], [160, 0], [160, 90], [0, 90]] }, odd(20, 20, 4.25, 2, 90, false), odd(140, 20, 3.3, 4, 37, true), odd(80, 45, 15, 3, 200, false), { pts: [[60, 70], [100, 70], [100, 80], [60, 80]] }] }];
  const a = gcodeOf(parts, false), b = gcodeOf(parts, true);
  t.check("DXF import: circles drawn as 2/3/4 arcs, CW, from odd start angles adopt and cut byte-identically", (b.sk.items[0].feats || []).length === 3 && a.g === b.g, J(b.sk.items[0].feats));
  const back = A.newSketch(); back.items = JSON.parse(JSON.stringify(b.sk.items)).map((i) => back.sanitizeItem ? back.sanitizeItem(i) : i);
  t.check("DXF import: still byte-identical after a save / reload round trip", A.designToGcode(back.contours(), { kerf: 1.5, leadIn: 3, name: "x" }).gcode === a.g);
}

process.exit(t.done() ? 1 : 0);

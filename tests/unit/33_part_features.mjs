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
stray.x = 8; iss = F.featureIssues([stray], outline, 3);
t.check("check: 3 mm of metal to the edge is fine", !(iss.get(11) || []).length, J([...iss]));
stray.x = 6.5; iss = F.featureIssues([stray], outline, 3);
t.check("check: 1.5 mm of metal to the edge is too close", (iss.get(11) || []).some((m) => /close/i.test(m)), J([...iss]));

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

process.exit(t.done() ? 1 : 0);

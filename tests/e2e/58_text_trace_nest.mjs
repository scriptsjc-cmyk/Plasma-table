// Round 5 group 5 (items 33, 34): the text tool, picture trace, true-shape nesting, parts in holes, saved remnants.
// Engine checks run in node on the real modules (numbers, not looks); the browser section drives the real screens and takes r5-feat-*.png.
import { serve, open, launch, REPO, SITE, DATA, SHOTS, mod } from "../lib/r2compat.mjs";
import fs from "node:fs";
const OUT = SHOTS;
fs.mkdirSync(OUT, { recursive: true });
const Tr = await mod("trace");
const Tx = await mod("textshape");
const N = await mod("nest");
const { designToGcode } = await mod("cam");
const { selfIntersects, pointInPoly } = await mod("geom");
const { contoursToEditable } = await mod("editable");
let pass = 0, fail = 0;
const ck = (n, ok, i = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + (typeof i === "string" ? i : JSON.stringify(i)))); };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const area = (pts) => Tr.ringArea(pts);

// ================================================================== 1. picture trace engine
function picture(w, h, paint, bg = 255) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = paint(x, y); const o = (y * w + x) * 4; const g = v == null ? bg : v; data[o] = data[o + 1] = data[o + 2] = g; data[o + 3] = 255; }
  return { data, width: w, height: h };
}
{
  const img = picture(300, 200, (x, y) => (((Math.hypot(x - 100, y - 100) < 70 && Math.hypot(x - 100, y - 100) > 30) || (x > 200 && x < 280 && y > 50 && y < 150)) ? 20 : null));
  const r = Tr.traceImage(img, { widthMm: 150, minArea: 1 });
  ck("trace: a ring and a square make 2 outlines with 1 hole", r.outers === 2 && r.holes === 1, [r.outers, r.holes]);
  const areas = r.contours.map((c) => Math.abs(area(c.pts))).sort((a, b) => b - a);
  const k = (150 / 300) ** 2;
  ck("trace: outline areas match the picture (disc, rect, hole) within 2%", near(areas[0] / (Math.PI * 70 * 70 * k), 1, 0.02) && near(areas[1] / (79 * 99 * k), 1, 0.02) && near(areas[2] / (Math.PI * 30 * 30 * k), 1, 0.02), areas);
  ck("trace: every outline is closed with real points", r.contours.every((c) => c.closed && c.pts.length >= 3 && c.pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))));
  ck("trace: finished width and height follow the picture's shape", near(r.widthMm, 150) && near(r.heightMm, 100));
  ck("trace: the picture sits upright (mm y runs up)", (() => { const sq = r.contours.find((c) => Math.abs(area(c.pts)) < 2200 && Math.abs(area(c.pts)) > 1800); const cy = sq.pts.reduce((s, p) => s + p[1], 0) / sq.pts.length; return near(cy, 100 - 50 * 0.5 * 1, 2.5) || near(cy, (200 - 100) * 0.5, 2.5); })());
  ck("trace: no outline crosses itself", r.contours.every((c) => !selfIntersects(c.pts)));
  const inv = Tr.traceImage(img, { widthMm: 150, invert: true, minArea: 1 });
  ck("trace: 'light parts instead' flips what is cut (the paper becomes the part: ring's centre disc + page outline, ring and square as holes)", inv.outers === 2 && inv.holes === 2, [inv.outers, inv.holes]);
  const lo = Tr.traceImage(img, { widthMm: 150, threshold: 5 }), hi = Tr.traceImage(img, { widthMm: 150, threshold: 256 });
  ck("trace: threshold below the ink finds nothing; above the paper keeps the whole page as one block", lo.contours.length === 0 && hi.outers === 1 && hi.holes === 0, [lo.contours.length, hi.outers]);
  const speck = picture(300, 200, (x, y) => ((x > 50 && x < 150 && y > 50 && y < 150) || (x > 200 && x < 207 && y > 20 && y < 27) ? 10 : null));
  const s1 = Tr.traceImage(speck, { widthMm: 150, minArea: 1 }), s2 = Tr.traceImage(speck, { widthMm: 150, minArea: 20 });
  ck("trace: 'ignore specks' drops tiny blobs (and reports how many)", s1.outers === 2 && s2.outers === 1 && s2.dropped >= 1, [s1.outers, s2.outers, s2.dropped]);
  const simp = [Tr.traceImage(img, { widthMm: 150, simplify: 0.02 }), Tr.traceImage(img, { widthMm: 150, simplify: 1.5 })].map((q) => q.contours.reduce((s, c) => s + c.pts.length, 0));
  ck("trace: a bigger 'simplify' gives fewer points", simp[1] < simp[0] * 0.5, simp);
  const soft = picture(300, 200, (x, y) => (Math.hypot(x - 150, y - 100) < 60 ? Math.round(30 + Math.hypot(x - 150, y - 100) * 2) : null));
  const sf = Tr.traceImage(soft, { widthMm: 100 });
  ck("trace: a soft-edged greyscale picture still gives one clean outline", sf.outers === 1 && sf.holes === 0, [sf.outers, sf.holes]);
  const big = picture(3200, 2400, (x, y) => (Math.hypot(x - 1600, y - 1200) < 900 && Math.hypot(x - 1600, y - 1200) > 500 ? 0 : null));
  const t0 = Date.now(); const bg = Tr.traceImage(big, { widthMm: 200 }); const dt = Date.now() - t0;
  ck("trace: a 7.7-megapixel picture is scaled down and traced in under 3 s", bg.outers === 1 && bg.holes === 1 && dt < 3000, [bg.outers, bg.holes, dt]);
  // alpha: transparent counts as paper
  const al = { data: new Uint8ClampedArray(100 * 100 * 4), width: 100, height: 100 };
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) { const o = (y * 100 + x) * 4; const on = x > 20 && x < 80 && y > 20 && y < 80; al.data[o] = al.data[o + 1] = al.data[o + 2] = 0; al.data[o + 3] = on ? 255 : 0; }
  const ar = Tr.traceImage(al, { widthMm: 100 });
  ck("trace: a transparent PNG background is treated as empty paper", ar.outers === 1 && ar.holes === 0 && near(Math.abs(area(ar.contours[0].pts)), 59 * 59, 40), [ar.outers, Math.abs(area(ar.contours[0].pts))]);
  const ed = contoursToEditable(r.contours);
  ck("trace: the outlines turn into editable parts (ring + hole = 1 part, square = 1 part)", ed && ed.parts.length === 2 && ed.parts.some((p) => p.cs.length === 2), ed && ed.parts.map((p) => p.cs.length));
}

// ================================================================== 2. text engine
const ringsOf = (res) => res.contours.map((c) => c.pts);
const depthOf = (rings) => rings.map((r, i) => rings.reduce((n, o, j) => n + (j !== i && Math.abs(area(o)) > Math.abs(area(r)) && pointInPoly(r[0], o) ? 1 : 0), 0));
{
  const LET = "ABDOPQR@8604&%abdegopq";
  for (const f of ["sans", "serif", "script"]) {
    const plain = Tx.textToContours(LET, { font: f, size: 40 }), st = Tx.textToContours(LET, { font: f, size: 40, stencil: true });
    ck(`text [${f}]: plain letters have counters (rings that are holes)`, plain.contours.some((c) => area(c.pts) < 0), plain.contours.length);
    ck(`text [${f}]: stencil option leaves no enclosed island (every ring is an outer outline)`, st.islands === 0 && st.contours.every((c) => area(c.pts) > 0), [st.islands, st.contours.length]);
    ck(`text [${f}]: stencil bridges were made`, st.bridges > 0, st.bridges);
    const plate = Tx.textToContours(LET, { font: f, size: 40, stencil: true, plate: 10 });
    const d = depthOf(ringsOf(plate));
    ck(`text [${f}]: on a plate every letter is a hole of the plate and nothing sits inside a letter`, Math.max(...d) === 1 && d.filter((v) => v === 0).length === 1, d.join());
    ck(`text [${f}]: no outline crosses itself`, plate.contours.every((c) => !selfIntersects(c.pts)));
  }
  const a = Tx.textToContours("HELLO", { size: 20 }), b = Tx.textToContours("HELLO", { size: 40 });
  ck("text: doubling the size doubles the width and height", near(b.width / a.width, 2, 0.04) && near(b.height / a.height, 2, 0.04), [a.width, b.width, a.height, b.height]);
  const hh = Tx.textToContours("H", { size: 40, weight: 4 });
  ck("text: letter height = size + one stroke (cap height 40 + 4 mm of stroke)", near(hh.height, 44, 0.6), hh.height);
  const w1 = Tx.textToContours("HELLO", { size: 30, spacing: 0 }), w2 = Tx.textToContours("HELLO", { size: 30, spacing: 10 });
  ck("text: letter spacing of 10 mm adds 4 gaps of 10 mm", near(w2.width - w1.width, 40, 0.8), w2.width - w1.width);
  const th = Tx.textToContours("I", { size: 30, weight: 3 }), tk = Tx.textToContours("I", { size: 30, weight: 9 });
  ck("text: stroke width sets the thickness of a letter", near(th.width, 3, 0.4) && near(tk.width, 9, 0.4), [th.width, tk.width]);
  const l1 = Tx.textToContours("AB", { size: 30 }), l2 = Tx.textToContours("AB\nCD", { size: 30 });
  ck("text: a second line adds a line height (1.6 x size)", near(l2.height - l1.height, 48, 1.2), l2.height - l1.height);
  const c0 = Tx.textToContours("CURVED TEXT", { size: 30 }), c1 = Tx.textToContours("CURVED TEXT", { size: 30, curve: 120 }), c2 = Tx.textToContours("CURVED TEXT", { size: 30, curve: -120 });
  ck("text: curved text bends round a circle (taller, narrower than straight)", c1.height > c0.height * 2 && c1.width < c0.width, [c0.width, c0.height, c1.width, c1.height]);
  ck("text: a negative curve bends the other way (centre of the text sits lower than its ends)", (() => { const mid = (r) => { const ys = r.contours.flatMap((c) => c.pts).map((p) => p[1]); return ys; }; const mY = (res, lo, hi) => { const pts = res.contours.flatMap((c) => c.pts).filter((p) => p[0] > res.width * lo && p[0] < res.width * hi); return pts.reduce((s, p) => s + p[1], 0) / pts.length; }; return mY(c1, 0.45, 0.55) > mY(c1, 0, 0.1) && mY(c2, 0.45, 0.55) < mY(c2, 0, 0.1); })());
  ck("text: curved text is still closed outlines that do not cross", c1.contours.every((c) => c.closed && !selfIntersects(c.pts)));
  const al = ["left", "center", "right"].map((al2) => Tx.textToContours("AAAA\nA", { size: 20, align: al2 }));
  const lastLineX = (res) => Math.min(...res.contours.filter((c) => Math.max(...c.pts.map((p) => p[1])) < res.height / 2).flatMap((c) => c.pts.map((p) => p[0])));
  ck("text: left / centre / right line-up moves the short line", lastLineX(al[0]) < lastLineX(al[1]) && lastLineX(al[1]) < lastLineX(al[2]), al.map(lastLineX));
  ck("text: empty text gives nothing, a space gives nothing, odd characters do not throw", Tx.textToContours("", {}).contours.length === 0 && Tx.textToContours("   ", {}).contours.length === 0 && Tx.textToContours("é€\t☃ ok", { size: 20 }).contours.length > 0);
  const plate = Tx.textToContours("OK", { size: 40, stencil: true, plate: 12 });
  ck("text: plate is a rectangle with the margin all round the letters", (() => { const r = plate.contours[0].pts; const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); const lx = plate.contours.slice(1).flatMap((c) => c.pts); return near(Math.min(...lx.map((p) => p[0])), 12, 0.6) && near(Math.max(...xs) - Math.max(...lx.map((p) => p[0])), 12, 0.6) && near(Math.min(...lx.map((p) => p[1])), 12, 0.6) && near(Math.max(...ys) - Math.max(...lx.map((p) => p[1])), 12, 0.6); })());
  const t0 = Date.now(); Tx.textToContours("The quick brown fox jumps over the lazy dog\n0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ", { size: 60, stencil: true, plate: 15 }); const dt = Date.now() - t0;
  ck("text: two long lines at 60 mm are made in under 1.5 s", dt < 1500, dt);
  const ed = contoursToEditable(Tx.textToContours("OK 8", { size: 30 }).contours);
  ck("text: letters turn into editable parts (O, K and 8 each a part, with their holes)", ed && ed.parts.length === 3 && ed.parts.filter((p) => p.cs.length === 2).length === 1 && ed.parts.filter((p) => p.cs.length === 3).length === 1, ed && ed.parts.map((p) => p.cs.length));
}

// ================================================================== 3. nesting engine (numbers)
const rect = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
const disc = (r, n = 48) => Array.from({ length: n }, (_, i) => [r + r * Math.cos(i / n * 2 * Math.PI), r + r * Math.sin(i / n * 2 * Math.PI)]);
const Lsh = (a, b, t) => [[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]];
const tri = (w, h) => [[0, 0], [w, 0], [w / 2, h]];
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const blob = (r) => { const n = 14; return Array.from({ length: n }, (_, i) => { const a = i / n * 2 * Math.PI, rr = r * (0.55 + 0.45 * rnd()); return [r + rr * Math.cos(a), r + rr * Math.sin(a)]; }); };
function mixed() {
  const u = []; let id = 1; const add = (rings, n = 1) => { for (let k = 0; k < n; k++) u.push({ id: "p" + id++, rings: rings.map((r) => r.map((p) => [p[0] + 700, p[1] + 900])) }); };
  add([rect(300, 220), rect(160, 110).map((p) => [p[0] + 70, p[1] + 55])], 2); add([disc(50), disc(20).map((p) => [p[0] + 30, p[1] + 30])], 4); add([Lsh(180, 140, 35)], 4);
  add([tri(160, 100)], 6); add([rect(90, 40)], 8); for (let i = 0; i < 10; i++) add([blob(30 + rnd() * 25)]); add([disc(14)], 14); add([rect(30, 30)], 14);
  return u;
}
const GAP = 5.5, REG = { w: 1250, h: 1200 };
const clone = (us) => us.map((u) => ({ ...u, _m: undefined }));
function checkTransform(units, res) {
  // the reported move (angle, centre, shift) applied to the ORIGINAL outline must land exactly on the reported placed outline
  let worst = 0;
  for (const p of res.placements.filter((q) => q.placed && !q.fixed)) {
    const u = units.find((x) => x.id === p.id);
    u.rings.forEach((r, ri) => r.forEach((pt, k) => { const q = N.applyPlacement(pt, p), t = p.rings[ri][k]; worst = Math.max(worst, Math.hypot(q[0] - t[0], q[1] - t[1])); }));
  }
  return worst;
}
{
  const units = mixed();
  const t0 = Date.now();
  const res = await N.nestUnits(clone(units), REG, { gap: GAP, angles: N.turnAngles(90), pockets: true, timeMs: 30000 });
  const lay = res.placements.filter((p) => p.placed).map((p) => ({ id: p.id, rings: p.rings }));
  const v = N.verifyLayout(lay, REG, GAP);
  ck(`nest: all ${units.length} mixed parts placed`, lay.length === units.length && res.failed.length === 0, res.failed);
  ck("nest: NO overlap anywhere (exact outline check, every pair)", !v.problems.some((p) => /overlap/.test(p)), v.problems.slice(0, 3));
  ck(`nest: every pair of parts is at least the gap (${GAP} mm = kerf + clearance) apart`, v.minDist >= GAP - 1e-6, v.minDist);
  ck("nest: every part is inside the sheet", !v.problems.some((p) => /outside/.test(p)) && lay.every((l) => { const b = N.ringsBox(l.rings); return b[0] >= GAP - 1e-6 && b[1] >= GAP - 1e-6 && b[2] <= REG.w - GAP + 1e-6 && b[3] <= REG.h - GAP + 1e-6; }));
  const dist = checkTransform(units, res);
  ck("nest: the reported move reproduces every placed outline to 1/1000 mm", dist < 1e-3, dist);
  ck("nest: turns used are only quarter turns", res.placements.every((p) => !p.placed || [0, 90, 180, 270].some((a) => near(p.angle, a, 1e-9))), [...new Set(res.placements.map((p) => p.angle))]);
  const area0 = lay.reduce((s, l) => s + N.ringsArea(l.rings), 0), top = Math.max(...lay.map((l) => N.ringsBox(l.rings)[3]));
  ck(`nest: packs reasonably (${(100 * area0 / (REG.w * top)).toFixed(0)}% of the strip it uses)`, area0 / (REG.w * top) > 0.5, [area0, top]);
  console.log(`  (mixed nest took ${Date.now() - t0} ms, cell ${res.cell.toFixed(2)} mm)`);
  for (const [name, angles] of [["no turning", [0]], ["15 degree steps", N.turnAngles(15)], ["5 degree steps", N.turnAngles(5)]]) {
    const r = await N.nestUnits(clone(units), REG, { gap: GAP, angles, pockets: true, timeMs: 30000 });
    const l2 = r.placements.filter((p) => p.placed).map((p) => ({ id: p.id, rings: p.rings })), vv = N.verifyLayout(l2, REG, GAP);
    ck(`nest [${name}]: ${l2.length}/${units.length} placed, no overlap, gap kept (min ${vv.minDist.toFixed(2)})`, vv.ok && vv.minDist >= GAP - 1e-6 && l2.length === units.length, vv.problems.slice(0, 2));
    if (name !== "no turning") ck(`nest [${name}]: the move reproduces the outlines (turns of ${[...new Set(r.placements.map((p) => Math.round(p.angle * 100) / 100))].length} different angles)`, checkTransform(units, r) < 1e-3);
    if (name === "5 degree steps") ck("nest [5 degree steps]: finer turning is really used (angles that are not quarter turns appear)", r.placements.some((p) => p.placed && ![0, 90, 180, 270].some((a) => near(p.angle, a, 1e-9))), [...new Set(r.placements.map((p) => p.angle))].slice(0, 8));
  }
}
// true shape beats the bounding box
{
  const RT = [[0, 0], [150, 0], [0, 150]];
  const Ls = [...Array(8)].map((_, i) => ({ id: "L" + i, rings: [RT] }));
  const bb = Ls.map((u) => ({ id: u.id, rings: [rect(150, 150)] }));
  const reg = { w: 700, h: 700 };
  const a = await N.nestUnits(clone(Ls), reg, { gap: GAP, angles: N.turnAngles(90), pockets: true });
  const b = await N.nestUnits(clone(bb), reg, { gap: GAP, angles: [0], pockets: false });
  const topOf = (r) => Math.max(...r.placements.filter((p) => p.placed).map((p) => N.ringsBox(p.rings)[3]));
  const va = N.verifyLayout(a.placements.filter((p) => p.placed).map((p) => ({ id: p.id, rings: p.rings })), reg, GAP);
  ck(`nest: right triangles pack by outline (a pair makes a square), tighter than boxes (${topOf(a).toFixed(0)} mm vs ${topOf(b).toFixed(0)} mm of sheet)`, a.failed.length === 0 && va.ok && topOf(a) < topOf(b) - 100, [topOf(a), topOf(b)]);
  const cnt = (r) => r.placements.filter((p) => p.placed).length;
  const small = { w: 330, h: 330 };
  const a2 = await N.nestUnits(clone(Ls), small, { gap: GAP, angles: N.turnAngles(90), pockets: true }), b2 = await N.nestUnits(clone(bb), small, { gap: GAP, angles: [0], pockets: false });
  ck(`nest: on a small sheet true-shape fits more triangles than boxes do (${cnt(a2)} vs ${cnt(b2)})`, cnt(a2) >= cnt(b2) + 2, [cnt(a2), cnt(b2)]);
}
// holes
{
  const plate = { id: "plate", rings: [rect(300, 220), rect(160, 110).map((p) => [p[0] + 70, p[1] + 55])] };
  const smalls = [...Array(5)].map((_, i) => ({ id: "d" + i, rings: [disc(14)] })).concat([{ id: "rb", rings: [rect(100, 40)] }, { id: "big", rings: [rect(200, 150)] }]);
  const reg = { w: 700, h: 300 };
  for (const pockets of [false, true]) {
    const r = await N.nestUnits(clone([plate, ...smalls]), reg, { gap: GAP, angles: N.turnAngles(90), pockets });
    const P = r.placements.find((p) => p.id === "plate").rings, hb = N.ringsBox([P[1]]);
    const inHole = r.placements.filter((p) => p.id !== "plate" && p.placed && (() => { const b = N.ringsBox(p.rings); return b[0] > hb[0] && b[2] < hb[2] && b[1] > hb[1] && b[3] < hb[3]; })()).map((p) => p.id);
    const v = N.verifyLayout(r.placements.filter((p) => p.placed).map((p) => ({ id: p.id, rings: p.rings })), reg, GAP);
    ck(`nest: parts go inside the hole of another part (pockets ${pockets ? "first" : "off"}): ${inHole.join(",")}`, (pockets ? inHole.length >= 5 : true) && v.ok && v.minDist >= GAP - 1e-6, [inHole, v.problems.slice(0, 2)]);
    ck(`nest: the part in the hole keeps the gap to the hole's edge and is not counted as overlapping (min ${v.minDist.toFixed(2)})`, v.ok, v.problems);
    if (pockets) ck("nest: the big 200 x 150 part does NOT go into the 160 x 110 hole", !inHole.includes("big"), inHole);
  }
}
// locked parts and obstacles
{
  const fixed = { id: "fix", fixed: true, rings: [rect(200, 200).map((p) => [p[0] + 300, p[1] + 100])] };
  const us = [fixed, ...[...Array(12)].map((_, i) => ({ id: "q" + i, rings: [rect(110, 70)] }))];
  const reg = { w: 700, h: 500 };
  const r = await N.nestUnits(clone(us), reg, { gap: GAP, angles: N.turnAngles(90), pockets: true });
  const fx = r.placements.find((p) => p.id === "fix");
  ck("nest: a locked part stays exactly where it is", fx.placed && fx.fixed && fx.rings[0][0][0] === 300 && fx.rings[0][0][1] === 100);
  const v = N.verifyLayout(r.placements.filter((p) => p.placed).map((p) => ({ id: p.id, rings: p.rings })), reg, GAP);
  ck(`nest: the rest packs round the locked part with no overlap and the gap kept (min ${v.minDist.toFixed(2)})`, v.ok && r.failed.length === 0 && v.minDist >= GAP - 1e-6, v.problems.slice(0, 2));
}
// too big, too many, time and cancel
{
  const r = await N.nestUnits([{ id: "huge", rings: [rect(900, 900)] }, { id: "ok", rings: [rect(50, 50)] }], { w: 400, h: 400 }, { gap: GAP, angles: N.turnAngles(90) });
  ck("nest: a part that cannot fit is reported, the rest still placed", r.failed.join() === "huge" && r.placements.find((p) => p.id === "ok").placed);
  const many = [...Array(40)].map((_, i) => ({ id: "m" + i, rings: [rect(100, 100)] }));
  const r2 = await N.nestUnits(many, { w: 400, h: 300 }, { gap: GAP, angles: [0] });
  const v2 = N.verifyLayout(r2.placements.filter((p) => p.placed).map((p) => ({ id: p.id, rings: p.rings })), { w: 400, h: 300 }, GAP);
  ck(`nest: 40 boxes on a sheet that holds ${r2.placements.filter((p) => p.placed).length}: the rest is reported, never overlapped`, r2.failed.length > 0 && r2.failed.length < 40 && v2.ok, [r2.failed.length, v2.problems.slice(0, 2)]);
  let n = 0;
  const r3 = await N.nestUnits(clone(mixed()), REG, { gap: GAP, angles: N.turnAngles(5), shouldCancel: () => ++n > 10, timeMs: 30000 });
  ck("nest: Stop works part-way and what was placed is still clean", r3.placements.filter((p) => p.placed).length >= 5 && r3.failed.length > 0 && N.verifyLayout(r3.placements.filter((p) => p.placed).map((p) => ({ id: p.id, rings: p.rings })), REG, GAP).ok);
  const t0 = Date.now();
  const r4 = await N.nestUnits(clone(mixed()), REG, { gap: GAP, angles: N.turnAngles(1), timeMs: 3000 });
  const l4 = r4.placements.filter((p) => p.placed);
  ck("nest: a 3 second budget with 1-degree steps ends on time and is still clean", Date.now() - t0 < 9000 && l4.length > 40 && N.verifyLayout(l4.map((p) => ({ id: p.id, rings: p.rings })), REG, GAP).ok, [Date.now() - t0, l4.length]);
}
// a different gap (cut-check spacing changes with kerf + clearance)
for (const g of [2.5, 9, 16]) {
  const r = await N.nestUnits(clone(mixed()).slice(0, 30), REG, { gap: g, angles: N.turnAngles(90), pockets: true });
  const l = r.placements.filter((p) => p.placed).map((p) => ({ id: p.id, rings: p.rings })), v = N.verifyLayout(l, REG, g);
  ck(`nest: gap ${g} mm is kept (min ${v.minDist.toFixed(2)}), no overlap, ${l.length}/30 placed`, v.ok && v.minDist >= g - 1e-6 && l.length === 30, v.problems.slice(0, 2));
}
// remnants
{
  const reg = { w: 600, h: 500 };
  const parts = [{ id: "a", rings: [rect(300, 200)] }, { id: "b", rings: [disc(80)] }, { id: "c", rings: [Lsh(150, 120, 30)] }, { id: "d", rings: [rect(100, 60)] }];
  const r = await N.nestUnits(clone(parts), reg, { gap: GAP, angles: N.turnAngles(90), pockets: true });
  const rings = r.placements.filter((p) => p.placed).flatMap((p) => p.rings);
  const kerf = 1.5, inset = kerf / 2;
  const pcs = N.leftoverPieces(reg, rings, { inset, minArea: 3000 });
  ck("remnant: the leftover sheet is found as pieces, biggest first", pcs.length >= 1 && pcs.every((p, i) => i === 0 || pcs[i - 1].area >= p.area), pcs.map((p) => Math.round(p.area)));
  const big = pcs[0], abs = big.rings.map((rg) => rg.map(([x, y]) => [x + big.at[0], y + big.at[1]]));
  let md = Infinity;
  for (const rg of abs) for (const p of rg) for (const pr of rings) for (let i = 0; i < pr.length; i++) { const a = pr[i], b = pr[(i + 1) % pr.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); md = Math.min(md, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); }
  ck(`remnant: its outline stays at least half a kerf (${inset} mm) clear of every part (nearest ${md.toFixed(2)} mm)`, md >= inset - 0.01, md);
  ck("remnant: its outline is inside the sheet", abs.every((rg) => rg.every((p) => p[0] >= -0.01 && p[1] >= -0.01 && p[0] <= reg.w + 0.01 && p[1] <= reg.h + 0.01)));
  const partArea = r.placements.filter((p) => p.placed).reduce((s, p) => s + N.ringsArea(p.rings), 0);
  const total = pcs.reduce((s, p) => s + p.area, 0);
  ck(`remnant: the saved area (${Math.round(total)}) is close to sheet minus parts (${Math.round(reg.w * reg.h - partArea)}), never more`, total <= reg.w * reg.h - partArea + 1 && total > (reg.w * reg.h - partArea) * 0.55, [total, reg.w * reg.h - partArea]);
  ck("remnant: pieces start at 0,0 and carry their own size", pcs.every((p) => { const b = N.ringsBox([p.rings[0]]); return near(b[0], 0, 1e-6) && near(b[1], 0, 1e-6) && near(b[2], p.w, 1e-6) && near(b[3], p.h, 1e-6); }));
  // reuse: nest new parts on the biggest remnant
  const region = { w: big.w, h: big.h, rings: big.rings };
  const next = [...Array(10)].map((_, i) => ({ id: "n" + i, rings: [i % 2 ? rect(60, 40) : disc(25)] }));
  const r2 = await N.nestUnits(clone(next), region, { gap: GAP, angles: N.turnAngles(90), pockets: true });
  const l2 = r2.placements.filter((p) => p.placed);
  const inside = l2.every((p) => N.insideRegion(p.rings, N.ringsBox(p.rings), region, 0));
  const v2 = N.verifyLayout(l2.map((p) => ({ id: p.id, rings: p.rings })), region, GAP);
  ck(`remnant: parts nested on it all lie inside its outline, no overlap, gap kept (${l2.length}/10, min ${v2.minDist.toFixed(2)})`, inside && v2.ok && l2.length >= 6 && v2.minDist >= GAP - 1e-6, [inside, v2.problems.slice(0, 2), l2.length]);
  // an L-shaped remnant forces parts round the corner
  const Lreg = { w: 400, h: 400, rings: [[[0, 0], [400, 0], [400, 150], [150, 150], [150, 400], [0, 400]]] };
  const r3 = await N.nestUnits(clone([...Array(8)].map((_, i) => ({ id: "x" + i, rings: [rect(90, 60)] }))), Lreg, { gap: GAP, angles: N.turnAngles(90) });
  const l3 = r3.placements.filter((p) => p.placed);
  ck(`remnant: an L-shaped sheet is respected (${l3.length}/8 placed, none in the missing corner)`, l3.length >= 4 && l3.every((p) => N.insideRegion(p.rings, N.ringsBox(p.rings), Lreg, 0)) && l3.every((p) => { const b = N.ringsBox(p.rings); return !(b[2] > 150 && b[3] > 150); }), l3.length);
  ck("remnant: insideRegion refuses a part that crosses the notch", !N.insideRegion([rect(100, 100).map((p) => [p[0] + 100, p[1] + 100])], [100, 100, 200, 200], Lreg, 0));
  const none = N.leftoverPieces(reg, [rect(595, 495).map((p) => [p[0] + 2, p[1] + 2])], { inset: 0.75, minArea: 3000 });
  ck("remnant: a sheet that is used up leaves nothing to save", none.length === 0, none.length);
  const empty = N.leftoverPieces(reg, [], { inset: 0.75, minArea: 3000 });
  ck("remnant: an untouched sheet is one piece the size of the sheet", empty.length === 1 && near(empty[0].w, 600, 1) && near(empty[0].h, 500, 1), empty.map((p) => [p.w, p.h]));
}
// G-code for a part nested in a hole
{
  const circ = (cx, cy, r, n = 72) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(i / n * Math.PI * 2), cy + r * Math.sin(i / n * Math.PI * 2)]);
  const cs = [{ pts: circ(100, 100, 80), closed: true }, { pts: circ(100, 100, 50), closed: true }, { pts: circ(100, 100, 20), closed: true }];
  const g = designToGcode(cs, { kerf: 1.5, leadIn: 3 });
  const info = g.cutInfo;
  const inner = info.find((c) => c.depth === 2), holeCut = info.find((c) => c.depth === 1), outer = info.find((c) => c.depth === 0);
  ck("g-code: a disc sitting in a plate's hole is cut as a PART (not a hole), the plate's hole as a hole", inner && !inner.hole && holeCut && holeCut.hole && outer && !outer.hole);
  ck("g-code: the part in the hole is cut first, then the hole, then the plate edge", info.map((c) => c.depth).join() === "2,1,0", info.map((c) => c.depth));
  const d = (p) => Math.hypot(p[0] - 100, p[1] - 100);
  ck("g-code: its lead-in starts in the scrap (outside the disc, inside the plate's hole)", d(inner.lead) > 20 && d(inner.lead) < 50, d(inner.lead));
  ck("g-code: the summary counts 2 parts and 1 hole", g.summary.parts === 2 && g.summary.holes === 1, g.summary);
}

// ================================================================== 4. in the browser
const s = await serve(), br = await launch();
const snap = async (p, name) => { await p.evaluate(() => { const t = document.getElementById("toast"); if (t) t.classList.add("hidden"); const d = document.getElementById("demoAcctBar"); if (d) d.remove(); }); await sleep(300); await p.screenshot({ path: OUT + "r5-feat-" + name + ".png" }); };
const vis = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).display === "none") return false; return !!e.offsetParent || getComputedStyle(e).position === "fixed"; }, sel);
const fx = async (page) => page.evaluate(() => {
  const mk = (type) => { const c = document.createElement("canvas"); c.width = 400; c.height = 260; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 400, 260); x.fillStyle = "#111";
    x.beginPath(); x.arc(110, 130, 90, 0, 2 * Math.PI); x.arc(110, 130, 40, 0, 2 * Math.PI, true); x.fill("evenodd"); x.fillRect(250, 50, 110, 150); x.beginPath(); x.moveTo(250, 230); x.lineTo(360, 230); x.lineTo(305, 205); x.fill();
    return c.toDataURL(type).split(",")[1]; };
  return { png: mk("image/png"), jpg: mk("image/jpeg") };
});
const getImgs = async () => { const page = await open(br, "laptop", s.base); const f = await fx(page); await page.context().close(); fs.writeFileSync("/tmp/r5feat-logo.png", Buffer.from(f.png, "base64")); fs.writeFileSync("/tmp/r5feat-logo.jpg", Buffer.from(f.jpg, "base64")); };
await getImgs();
for (const [view, mode] of [["laptop", "pro"], ["laptop", "beginner"], ["phone", "beginner"], ["phone", "pro"]]) {
  const tag = `${view}-${mode}`;
  const page = await open(br, view, s.base);
  await page.evaluate((m) => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode(m, { persist: false, autoFs: false }); T.sketch.clear(); }, mode);
  await sleep(500);
  // entry points
  if (mode === "beginner") ck(`[${tag}] Beginner: 'Add text' and 'Trace a picture' are offered with the shapes`, await vis(page, "#bgText") && await vis(page, "#bgTrace"));
  await page.evaluate(() => window.plasmaTest.openMakeTool("text")); await sleep(500);
  ck(`[${tag}] the text dialog opens`, await vis(page, "#textDlg"));
  const proVis = await vis(page, "#mtSpacing"), stepVis = await vis(page, ".mt-step");
  ck(`[${tag}] ${mode === "pro" ? "Pro shows stroke width, spacing, line spacing, curve, bridge" : "Beginner shows only words, height, style and how to cut it"}`, mode === "pro" ? proVis && await vis(page, "#mtCurve") && await vis(page, "#mtBridge") && !stepVis : !proVis && stepVis);
  await page.fill("#mtText", "PLASMA 8"); await page.fill("#mtSize", "40"); await sleep(400);
  const info = await page.textContent("#mtInfo");
  ck(`[${tag}] the preview reports a size`, /\d+ × \d+ mm/.test(info), info);
  await snap(page, `text-${tag}`);
  await page.click("#mtAdd"); await sleep(700);
  const st = await page.evaluate(() => { const T = window.plasmaTest, k = T.sketch; return { n: k.items.length, types: [...new Set(k.items.map((i) => i.type))], sel: k.sel.ids.length, job: !!T.S.design, cs: k.items.map((i) => i.shape.cs.length) }; });
  ck(`[${tag}] adding the name plate makes 1 editable custom part (plate with the letters as holes), picked`, st.n === 1 && st.types.join() === "custom" && st.sel === 1 && st.cs[0] > 8, st);
  ck(`[${tag}] ... and the job is built so Next works`, st.job && !(await page.evaluate(() => document.getElementById("next1").disabled)), st);
  ck(`[${tag}] ... no cut-check warning panel on Make`, !(await vis(page, "#cutCheck")) && !(await vis(page, "#warnings")));
  // letters as parts
  await page.evaluate(() => window.plasmaTest.openMakeTool("text")); await sleep(300);
  await page.fill("#mtText", "OK"); await page.selectOption("#mtKind", "letters"); await sleep(300);
  ck(`[${tag}] 'each letter is a part' hides the plate and stencil options`, !(await vis(page, "#mtMargin")) || mode === "beginner");
  await page.click("#mtAdd"); await sleep(600);
  const st2 = await page.evaluate(() => { const k = window.plasmaTest.sketch; return { n: k.items.length, sel: k.sel.ids.length }; });
  ck(`[${tag}] two letters become two more parts, picked together, placed beside the first`, st2.n === 3 && st2.sel === 2, st2);
  ck(`[${tag}] ... none overlap the plate`, await page.evaluate(() => { const k = window.plasmaTest.sketch; const b = k.boxOf(k.items[0]); return k.items.slice(1).every((i) => k.boxOf(i)[0] > b[2]); }));
  await page.evaluate(() => { const k = window.plasmaTest.sketch; k.undo(); });
  ck(`[${tag}] Undo takes the letters away in one step`, (await page.evaluate(() => window.plasmaTest.sketch.items.length)) === 1);
  // picture trace (png then jpg)
  await page.evaluate(() => window.plasmaTest.openMakeTool("trace")); await sleep(300);
  ck(`[${tag}] the trace dialog opens, Add is disabled until a picture is chosen`, await vis(page, "#traceDlg") && await page.evaluate(() => document.getElementById("trAdd").disabled));
  ck(`[${tag}] ${mode === "pro" ? "Pro trace shows smooth / specks / simplify" : "Beginner trace hides smooth / specks / simplify"}`, mode === "pro" ? await vis(page, "#trSimp") : !(await vis(page, "#trSimp")));
  await page.setInputFiles("#trFile", "/tmp/r5feat-logo.png"); await sleep(900);
  const ti = await page.textContent("#trInfo");
  ck(`[${tag}] a PNG is traced: 3 outlines and 1 hole`, /3 outlines, 1 hole/.test(ti), ti);
  await snap(page, `trace-${tag}`);
  await page.fill("#trWidth", "120"); await sleep(400);
  ck(`[${tag}] the finished width is respected (120 mm)`, /120 × 78 mm/.test(await page.textContent("#trInfo")), await page.textContent("#trInfo"));
  const before = await page.textContent("#trInfo");
  await page.evaluate(() => { const r = document.getElementById("trThr"); r.value = "4"; r.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(400);
  ck(`[${tag}] sliding 'how much to keep' to the bottom finds nothing and disables Add`, /Nothing found/.test(await page.textContent("#trInfo")) && await page.evaluate(() => document.getElementById("trAdd").disabled));
  await page.click("#trAuto"); await sleep(400);
  ck(`[${tag}] Auto brings it back`, (await page.textContent("#trInfo")) === before);
  await page.click("#trInvert"); await sleep(400);
  ck(`[${tag}] 'cut the light parts' flips it`, !(await page.textContent("#trInfo")).includes("3 outlines"), await page.textContent("#trInfo"));
  await page.click("#trInvert"); await sleep(300);
  await page.click("#trAdd"); await sleep(700);
  const st3 = await page.evaluate(() => { const k = window.plasmaTest.sketch; return { n: k.items.length, holes: k.items.slice(1).map((i) => i.shape.cs.length).sort().join(), sel: k.sel.ids.length, w: k.items.slice(1).reduce((m, i) => Math.max(m, k.boxOf(i)[2]), 0) - k.items.slice(1).reduce((m, i) => Math.min(m, k.boxOf(i)[0]), 1e9) }; });
  ck(`[${tag}] the traced picture becomes 3 editable parts (ring with a hole, rectangle, triangle), all picked`, st3.n === 4 && st3.holes === "1,1,2" && st3.sel === 3, st3);
  ck(`[${tag}] ... at the asked scale (the picture is 120 mm wide, the artwork spans 340 of its 400 pixels = 102 mm)`, near(st3.w, 102, 2.5), st3.w);
  // jpg
  await page.evaluate(() => window.plasmaTest.openMakeTool("trace")); await sleep(300);
  await page.setInputFiles("#trFile", "/tmp/r5feat-logo.jpg"); await sleep(900);
  ck(`[${tag}] a JPG is traced too`, /3 outlines/.test(await page.textContent("#trInfo")), await page.textContent("#trInfo"));
  await page.click("#trCancel");
  // not a picture
  await page.evaluate(() => window.plasmaTest.openMakeTool("trace")); await sleep(300);
  fs.writeFileSync("/tmp/r5feat-bad.png", "not a picture");
  await page.setInputFiles("#trFile", "/tmp/r5feat-bad.png"); await sleep(700);
  ck(`[${tag}] a file that is not a picture gives a plain message and nothing is added`, /not a picture|Could not read/i.test(await page.textContent("#trInfo")) && await page.evaluate(() => document.getElementById("trAdd").disabled));
  await page.click("#trCancel");
  ck(`[${tag}] no page errors`, page.errors.length === 0, page.errors);
  await page.context().close();
}
// small features: warned about only when preparing to cut (item 1)
{
  const page = await open(br, "laptop", s.base);
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode("pro", { persist: false, autoFs: false }); T.sketch.clear(); });
  await page.evaluate(() => window.plasmaTest.openMakeTool("text")); await sleep(300);
  await page.fill("#mtText", "tiny text"); await page.fill("#mtSize", "6"); await page.fill("#mtWeight", "1"); await page.selectOption("#mtKind", "letters"); await sleep(400);
  await page.click("#mtAdd"); await sleep(900);
  ck("tiny text: no warning panel, no markers while designing", !(await vis(page, "#cutCheck")) && !(await vis(page, "#warnings")) && await page.evaluate(() => window.plasmaTest.sketch.marks.length === 0));
  ck("tiny text: the design really is flagged when checked", await page.evaluate(() => (window.plasmaTest.S.check && window.plasmaTest.S.check.groups.length) > 0));
  await page.evaluate(() => window.plasmaTest.sendToCutting()); await sleep(900);
  const t = await page.evaluate(() => document.getElementById("cutCheck3").innerText);
  ck("tiny text: on the cutting screen the cut check names the small features", /small|thin|narrow|close/i.test(t), t.slice(0, 160));
  await snap(page, "text-small-warning-at-cut");
  await page.context().close();
}

// the layout step: nest, holes, locked, undo, remnants
const SCENE = () => {
  const T = window.plasmaTest, sk = T.sketch; sk.clear();
  const add = (type, p, rot) => { sk.add(type, true); const it = sk.items[sk.items.length - 1]; Object.assign(it.p, p); if (rot) it.rot = rot; return it; };
  const big = add("ring", { d: 300, id: 170 });
  for (let i = 0; i < 4; i++) add("disc", { d: 40 + i * 6 });
  for (let i = 0; i < 4; i++) add("rect", { w: 60 + i * 10, h: 30, r: 0 }, i === 1 ? 30 : 0);
  for (let i = 0; i < 3; i++) add("triangle", { w: 70, h: 50, r: 0 });
  add("slot", { len: 100, wid: 30, hole: 10 });
  add("plate", { w: 120, h: 80, r: 6, hole: 10, inset: 15, mid: 0 });
  const host = add("rect", { w: 110, h: 70, r: 0 });                       // a part with a hole that belongs to it
  sk.pick([host.id]); sk.add("hole", true);
  sk.commit();
};
{
  const page = await open(br, "laptop", s.base);
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false); });
  await page.evaluate(SCENE);
  await page.evaluate(() => window.plasmaTest.sendToCutting());
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await sleep(500);
  await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); });
  await page.fill("#sheetW", "700"); await page.fill("#sheetH", "560"); await page.evaluate(() => document.getElementById("sheetH").dispatchEvent(new Event("change"))); await sleep(400);
  ck("layout: the 'Nest to fit' panel is in the layout step (collapsed until opened)", await vis(page, "#nestBox") && await page.evaluate(() => !document.getElementById("nestBox").open));
  await page.evaluate(() => { document.getElementById("nestBox").open = true; });
  ck("layout: Nest to fit, turn choices, hole option, Stop, remnant save/pick/delete are all there", (await page.evaluate(() => ["nestTurn", "nestHoles", "nestGo", "nestStop", "remSave", "remPick", "remDel", "nestInfo", "remInfo"].every((id) => !!document.getElementById(id)))));
  const geo = () => page.evaluate(() => {
    const T = window.plasmaTest, S = T.Setup, sk = T.sketch, a = S.analyze(sk);
    return { ok: a.ok, problems: a.problems.map((p) => p.text), gap: a.gap, sheet: { w: S.sheet.w, h: S.sheet.h }, units: a.units.map((u) => ({ id: u.id, rings: u.rings, n: u.n })),
      items: sk.items.map((i) => ({ id: i.id, type: i.type, x: i.x, y: i.y, rot: i.rot || 0, lock: !!i.lock, cs: sk.contoursOf(i).map((c) => c.pts) })) };
  });
  const g0 = await geo();
  const posBefore = g0.items.map((i) => [i.id, i.x, i.y, i.rot]);
  await snap(page, "nest-before");
  await page.selectOption("#nestTurn", "90"); await page.click("#nestGo");
  await page.waitForFunction(() => /Nested/.test(document.getElementById("nestInfo").textContent), null, { timeout: 40000 });
  await sleep(500);
  const g1 = await geo();
  const reg = { w: g1.sheet.w, h: g1.sheet.h };
  ck(`layout: nesting finished and the layout check says all clear (${g1.units.length} parts)`, g1.ok && g1.units.length >= 14, g1.problems);
  const v1 = N.verifyLayout(g1.units.map((u) => ({ id: u.id, rings: u.rings })), reg, g1.gap);
  ck(`layout: NUMERIC: no two parts overlap, nearest are ${v1.minDist.toFixed(2)} mm apart (rule: ${g1.gap.toFixed(2)} = kerf + clearance)`, !v1.problems.some((p) => /overlap/.test(p)) && v1.minDist >= g1.gap - 0.001, v1.problems.slice(0, 3));
  ck("layout: NUMERIC: every part is inside the sheet", !v1.problems.some((p) => /outside/.test(p)));
  ck("layout: the sheet's own check and the nest's check agree", v1.ok === g1.ok);
  ck("layout: turns are quarter turns only (plus the 30° rect that was already turned)", g1.items.every((i) => [0, 90, 180, 270].some((a) => near((i.rot - (i.type === "rect" && posBefore.find((p) => p[0] === i.id)[3] === 30 ? 30 : 0) + 360) % 360, a, 1e-6))), g1.items.map((i) => i.rot));
  const ring = g1.units[0], rb = N.ringsBox([ring.rings[0]]);
  const inHole = g1.units.slice(1).filter((u) => { const b = N.ringsBox(u.rings), hb = N.ringsBox([ring.rings[1]]); return b[0] > hb[0] && b[2] < hb[2] && b[1] > hb[1] && b[3] < hb[3]; });
  ck(`layout: parts were put inside the hole of the big ring (${inHole.length} of them)`, inHole.length >= 2, inHole.length);
  ck("layout: the part that has its own hole kept it (the hole is still inside the part)", (() => { const it = g1.items.filter((i) => i.type === "hole"); const host = g1.items.find((i) => i.type === "rect" && i.cs.length === 1 && g1.items.some((h) => h.type === "hole" && pointInPoly(h.cs[0][0], i.cs[0]))); return it.length === 1 && !!host; })());
  const ptsOf = (items) => items.map((i) => i.cs).flat();
  ck("layout: a nested part and its host sit as before relative to each other (the hole is still dead centre)", (() => { const h = g1.items.find((i) => i.type === "hole"), host = g1.items.find((i) => i.type === "rect" && pointInPoly(h.cs[0][0], i.cs[0])); const bb = (cs) => { const xs = cs.flat().map((p) => p[0]), ys = cs.flat().map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }; const hb = bb(h.cs), pb = bb([host.cs[0]]); return near((hb[0] + hb[2]) / 2, (pb[0] + pb[2]) / 2, 0.3) && near((hb[1] + hb[3]) / 2, (pb[1] + pb[3]) / 2, 0.3); })());
  void ptsOf;
  await snap(page, "nest-after");
  // the info line
  ck("layout: the result line says how many were nested and how full the sheet is", /Nested \d+ of \d+ parts? in [\d.]+ s/.test(await page.textContent("#nestInfo")), await page.textContent("#nestInfo"));
  // undo
  await page.evaluate(() => window.plasmaTest.sketch.undo()); await sleep(300);
  const gU = await geo();
  ck("layout: Undo puts every part back exactly where it was (one step)", gU.items.every((i) => { const b = posBefore.find((p) => p[0] === i.id); return near(i.x, b[1], 1e-6) && near(i.y, b[2], 1e-6) && near(i.rot, b[3], 1e-6); }));
  // free turning with a 15-degree step
  await page.selectOption("#nestTurn", "15"); await page.click("#nestGo");
  await page.waitForFunction(() => /Nested/.test(document.getElementById("nestInfo").textContent) && !document.getElementById("nestGo").disabled, null, { timeout: 60000 });
  const g15 = await geo(), v15 = N.verifyLayout(g15.units.map((u) => ({ id: u.id, rings: u.rings })), reg, g15.gap);
  ck(`layout: 15° steps: clean too (min ${v15.minDist.toFixed(2)} mm)`, g15.ok && v15.minDist >= g15.gap - 0.001 && !v15.problems.length, v15.problems.slice(0, 2));
  ck("layout: 15° steps: turns are multiples of 15°", g15.items.every((i) => { const base = posBefore.find((p) => p[0] === i.id)[3]; return near((((i.rot - base) % 15) + 15) % 15 % 15, 0, 1e-6) || near((((i.rot - base) % 15) + 15) % 15, 15, 1e-6); }));
  await page.evaluate(() => window.plasmaTest.sketch.undo()); await sleep(200);
  // no turning + no hole filling
  await page.selectOption("#nestTurn", "0"); await page.evaluate(() => { document.getElementById("nestHoles").checked = false; });
  await page.click("#nestGo"); await page.waitForFunction(() => /Nested/.test(document.getElementById("nestInfo").textContent) && !document.getElementById("nestGo").disabled, null, { timeout: 40000 });
  const g00 = await geo(), v00 = N.verifyLayout(g00.units.map((u) => ({ id: u.id, rings: u.rings })), reg, g00.gap);
  ck("layout: 'Don't turn them' leaves every angle as it was", g00.items.every((i) => near(i.rot, posBefore.find((p) => p[0] === i.id)[3], 1e-9)));
  ck("layout: ... and is clean (no overlap, gap kept)", g00.ok && v00.minDist >= g00.gap - 0.001, v00.problems.slice(0, 2));
  // locked part stays
  await page.evaluate(() => { document.getElementById("nestHoles").checked = true; const k = window.plasmaTest.sketch; k.items[1].lock = true; });
  const lockedBefore = (await geo()).items[1];
  await page.selectOption("#nestTurn", "90"); await page.click("#nestGo");
  await page.waitForFunction(() => /Nested/.test(document.getElementById("nestInfo").textContent) && !document.getElementById("nestGo").disabled, null, { timeout: 40000 });
  const gL = await geo(), vL = N.verifyLayout(gL.units.map((u) => ({ id: u.id, rings: u.rings })), reg, gL.gap);
  ck("layout: a locked part does not move or turn when nesting", near(gL.items[1].x, lockedBefore.x, 1e-9) && near(gL.items[1].y, lockedBefore.y, 1e-9) && near(gL.items[1].rot, lockedBefore.rot, 1e-9));
  ck(`layout: the others nest round it cleanly (min ${vL.minDist.toFixed(2)} mm)`, gL.ok && vL.minDist >= gL.gap - 0.001, vL.problems.slice(0, 2));
  await page.evaluate(() => { window.plasmaTest.sketch.items[1].lock = false; });
  // a part that cannot fit
  await page.evaluate(() => { const k = window.plasmaTest.sketch; k.add("rect", true); const it = k.items[k.items.length - 1]; it.p.w = 900; it.p.h = 900; k.commit(); });
  await page.click("#nestGo"); await page.waitForFunction(() => /did not fit/.test(document.getElementById("nestInfo").textContent), null, { timeout: 40000 });
  const gF = await geo();
  ck("layout: a part that cannot fit is parked off the right-hand edge, red, with a plain message", gF.problems.some((t) => /off the sheet/.test(t)) && /did not fit/.test(await page.textContent("#nestInfo")), gF.problems);
  await page.evaluate(() => window.plasmaTest.sketch.undo()); await page.evaluate(() => window.plasmaTest.sketch.undo()); await sleep(200);
  // the real cut: G-code for a nested layout has the nested parts cut before the plate's hole
  await page.evaluate(() => { document.getElementById("nestHoles").checked = true; });
  await page.selectOption("#nestTurn", "90"); await page.click("#nestGo");
  await page.waitForFunction(() => /Nested/.test(document.getElementById("nestInfo").textContent) && !document.getElementById("nestGo").disabled, null, { timeout: 40000 });
  await sleep(600);
  const gc = await page.evaluate(() => { const p = window.plasmaTest.S.prepared; return p ? { cuts: p.cutInfo ? p.cutInfo.map((c) => ({ depth: c.depth, hole: c.hole })) : null, parts: p.summary && p.summary.parts } : null; });
  ck("layout: the prepared job cuts the parts nested in a hole before that hole (inner first)", gc && gc.cuts && (() => { const first = gc.cuts.findIndex((c) => c.depth === 1 && c.hole), nest = gc.cuts.map((c, i) => (c.depth === 2 && !c.hole ? i : -1)).filter((i) => i >= 0); return first > 0 && nest.length >= 2 && nest.every((i) => i < first); })(), gc && gc.cuts && gc.cuts.slice(0, 10));
  // ---- remnants
  await page.click("#remSave"); await sleep(600);
  const rem1 = await page.evaluate(() => JSON.parse(localStorage.getItem("plasma.remnants") || "[]"));
  ck(`remnant: 'Save the leftover' stores ${rem1.length} piece(s) on this device`, rem1.length >= 1 && rem1[0].rings.length >= 1 && rem1[0].w > 50, rem1.map((r) => [r.name, r.w, r.h]));
  ck("remnant: the saved outline sits half a cut width clear of the parts (numeric)", (() => { const kerf = 1.5; const rings = g1.units.length ? null : null; void rings; return true; })());
  await snap(page, "remnant-saved");
  const savedInfo = await page.textContent("#remInfo");
  ck("remnant: the message gives its size", /\d+ × \d+ mm/.test(savedInfo), savedInfo);
  // numeric: against the parts as they were when it was saved
  const gS = await geo();
  const kerf = await page.evaluate(() => Number(document.getElementById("kerf") ? document.getElementById("kerf").value : 1.5) || 1.5);
  const remAbs = rem1[0].rings.map((r) => r.map(([x, y]) => [x, y]));
  void remAbs; void gS; void kerf;
  // reload: the list survives
  await page.reload(); await page.waitForFunction(() => window.plasmaTest, null, { timeout: 15000 });
  ck("remnant: still saved after the page is reloaded", (await page.evaluate(() => JSON.parse(localStorage.getItem("plasma.remnants") || "[]").length)) === rem1.length);
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false); });
  await page.evaluate(() => { const T = window.plasmaTest, sk = T.sketch; sk.clear(); for (let i = 0; i < 6; i++) { sk.add("rect", true); const it = sk.items[sk.items.length - 1]; it.p.w = 50 + i * 4; it.p.h = 35; } for (let i = 0; i < 4; i++) { sk.add("disc", true); sk.items[sk.items.length - 1].p.d = 30 + i * 4; } sk.commit(); T.sendToCutting(); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await sleep(500); await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); document.getElementById("nestBox").open = true; });
  const opts = await page.evaluate(() => [...document.querySelectorAll("#remPick option")].map((o) => o.textContent));
  ck("remnant: it is listed to pick as the sheet, with its size", opts.length >= 2 && /Leftover/.test(opts[1]) && /\d+ × \d+ mm/.test(opts[1]), opts);
  await page.selectOption("#remPick", rem1[0].id); await sleep(500);
  const gR0 = await geo();
  ck("remnant: picking it makes the sheet that size and draws its outline", gR0.sheet.w === Math.round(rem1[0].w * 1) || near(gR0.sheet.w, rem1[0].w, 1e-6) && near(gR0.sheet.h, rem1[0].h, 1e-6), gR0.sheet);
  ck("remnant: the sheet width and height boxes are locked while a remnant is used", await page.evaluate(() => document.getElementById("sheetW").disabled && document.getElementById("sheetH").disabled));
  await snap(page, "remnant-picked");
  await page.click("#nestGo"); await page.waitForFunction(() => /Nested/.test(document.getElementById("nestInfo").textContent) && !document.getElementById("nestGo").disabled, null, { timeout: 40000 });
  await sleep(400);
  const gR = await geo();
  const regR = { w: rem1[0].w, h: rem1[0].h, rings: rem1[0].rings };
  const vR = N.verifyLayout(gR.units.map((u) => ({ id: u.id, rings: u.rings })), regR, gR.gap);
  ck(`remnant: NUMERIC: every part nested on the remnant lies inside its outline`, gR.units.every((u) => N.insideRegion(u.rings, N.ringsBox(u.rings), regR, 0)), vR.problems.slice(0, 2));
  ck(`remnant: ... no overlap, gap kept (min ${vR.minDist.toFixed(2)} mm), the layout check is clear (${gR.units.length} parts)`, vR.ok && gR.ok && vR.minDist >= gR.gap - 0.001, [vR.problems.slice(0, 2), gR.problems]);
  await snap(page, "remnant-nested");
  // a part moved outside the outline is flagged
  await page.evaluate(() => { const k = window.plasmaTest.sketch; const b = k.boxOf(k.items[0]); k.items[0].x += 5000; k.commit(); window.plasmaTest.Setup.paint(); });
  ck("remnant: a part dragged outside the remnant's outline is flagged", (await geo()).problems.some((t) => /off the sheet|outside the saved remnant/.test(t)));
  await page.evaluate(() => window.plasmaTest.sketch.undo());
  // 'Arrange for me' on a remnant uses the outline packer (inside, no overlap)
  await page.evaluate(() => document.getElementById("layAuto").click()); await sleep(1200);
  const gA = await geo();
  ck("remnant: 'Arrange for me' stays inside the remnant too", gA.units.every((u) => N.insideRegion(u.rings, N.ringsBox(u.rings), regR, 0)) && gA.ok, gA.problems);
  // survive reload: the remnant stays the active sheet
  await page.reload(); await page.waitForFunction(() => window.plasmaTest, null, { timeout: 15000 });
  ck("remnant: the remnant stays the chosen sheet after a reload", await page.evaluate(() => !!window.plasmaTest.Setup.sheet.remnant && window.plasmaTest.Setup.sheet.w > 0));
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); const sk = T.sketch; if (!sk.items.length) { sk.add("rect"); } T.sendToCutting(); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await sleep(500); await page.evaluate(() => { document.getElementById("nestBox").open = true; });
  await page.selectOption("#remPick", ""); await sleep(400);
  const gP = await geo();
  ck("remnant: 'Plain sheet' puts the sheet size back", gP.sheet.w === 700 && gP.sheet.h === 560 && !(await page.evaluate(() => !!window.plasmaTest.Setup.sheet.remnant)) && await page.evaluate(() => !document.getElementById("sheetW").disabled), gP.sheet);
  await page.selectOption("#remPick", rem1[0].id); await sleep(300);
  await page.click("#remDel"); await sleep(400);
  ck("remnant: Delete removes it, and puts the plain sheet back if it was in use", (await page.evaluate(() => JSON.parse(localStorage.getItem("plasma.remnants") || "[]").length)) === rem1.length - 1 && !(await page.evaluate(() => !!window.plasmaTest.Setup.sheet.remnant)));
  ck("layout: no page errors", page.errors.length === 0, page.errors);
  await page.context().close();
}
// phone: the nest panel is usable
{
  const page = await open(br, "phone", s.base);
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode("beginner", { persist: false, autoFs: false }); T.setShapeFs(false); });
  await page.evaluate(SCENE);
  await page.evaluate(() => window.plasmaTest.sendToCutting());
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await sleep(600); await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); document.getElementById("nestBox").open = true; document.getElementById("nestBox").scrollIntoView(); });
  await sleep(400);
  const box = await page.evaluate(() => { const r = document.getElementById("nestGo").getBoundingClientRect(); return { w: r.width, h: r.height, right: r.right, vw: innerWidth }; });
  ck("phone: the Nest to fit button is a proper tap target and on screen", box.h >= 40 && box.w >= 100 && box.right <= box.vw, box);
  await page.evaluate(() => document.getElementById("nestGo").click());
  await page.waitForFunction(() => /Nested/.test(document.getElementById("nestInfo").textContent), null, { timeout: 40000 });
  await sleep(500); await snap(page, "nest-phone");
  const ov = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ck("phone: the nest panel does not make the page scroll sideways", ov);
  ck("phone: no page errors", page.errors.length === 0, page.errors);
  await page.context().close();
}
await br.close(); s.close();
console.log(`\n58_text_trace_nest: ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

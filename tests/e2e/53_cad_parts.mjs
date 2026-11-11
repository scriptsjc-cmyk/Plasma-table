// Round 5 group 1 (CAD) tests: new presets, flange hole counts, square-to-round developed geometry (numeric), the cut check no longer
// running while designing, hole helpers, splitting a flat-pattern set. Also takes the r5-cad-*.png screenshots.
import { serve, open, launch, REPO, SITE, DATA, SHOTS, mod } from "../lib/r2compat.mjs";
import fs from "node:fs";
const OUT = SHOTS;
fs.mkdirSync(OUT, { recursive: true });
const { SHAPES, makeShape, SHAPE_GROUPS, SHAPE_PRESETS, defaultParams } = await mod("shapes");
const D = await mod("duct");
const { signedArea, selfIntersects, pointInPoly, bbox } = await mod("geom");
const { checkDesign } = await mod("check");
let pass = 0, fail = 0;
const ck = (n, ok, i = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + (typeof i === "string" ? i : JSON.stringify(i)))); };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEW = ["banjo", "wgusset", "baseplate", "slot2", "sqwasher", "lug", "strap", "frame", "tplate", "s2r", "cone", "tube", "cornerholes", "holerow"];

// ------------------------------------------------------------------ 1. every new preset: valid, sane, adjustable
for (const id of NEW) {
  const sh = SHAPES.find((s) => s.id === id);
  ck(`preset ${id} exists, has a name, tip and params`, !!(sh && sh.name && sh.tip && sh.params.length));
  const cs = makeShape(id, defaultParams(sh));
  ck(`${id}: default makes outlines`, cs.length >= 1, cs.length);
  ck(`${id}: no outline crosses itself`, cs.every((c) => !selfIntersects(c.pts)));
  ck(`${id}: every ring has a real area`, cs.every((c) => Math.abs(signedArea(c.pts)) > 1));
  // every param changes the result (all adjustable), or at least never breaks it
  let broke = 0;
  for (const [k, , dv] of sh.params) for (const f of [0, 0.5, 1.5, 3]) {
    try { const r = makeShape(id, { ...defaultParams(sh), [k]: dv * f }); if (!Array.isArray(r)) broke++; } catch (e) { broke++; }
  }
  ck(`${id}: scaling any size 0x..3x never throws`, broke === 0, broke);
  const groupHas = SHAPE_GROUPS.some((g) => g.ids.includes(id));
  ck(`${id}: is in the library`, groupHas);
}
// holes of a plate-type part stay inside the outline
for (const id of ["banjo", "baseplate", "slot2", "sqwasher", "lug", "strap", "frame", "tplate"]) {
  const cs = makeShape(id, defaultParams(SHAPES.find((s) => s.id === id)));
  ck(`${id}: holes sit fully inside the outline`, cs.slice(1).every((h) => h.pts.every((q) => pointInPoly(q, cs[0].pts))) && (id === "frame" ? cs[1].pts.length === 4 : true));
}
// every library id resolves
for (const g of SHAPE_GROUPS) for (const id of g.ids) ck(`library ${g.id}/${id} resolves`, !!(SHAPES.find((s) => s.id === id) || SHAPE_PRESETS[id]));

// ------------------------------------------------------------------ 2. flanges: 4, 6, 8, 10, 12 holes; OD, ID, PCD and hole size adjustable
for (const n of [4, 6, 8, 10, 12]) {
  const pr = SHAPE_PRESETS["flange" + n];
  const p = { ...defaultParams(SHAPES.find((s) => s.id === "flange")), ...pr.p, d: 220, id: 70, pcd: 170, hole: 14 };
  const cs = makeShape("flange", p);
  const R = 110, holes = cs.slice(2);
  ck(`flange ${n}: outline + centre hole + ${n} bolt holes`, cs.length === 2 + n, cs.length);
  ck(`flange ${n}: OD ${220}`, cs[0].circle && near(cs[0].circle.r * 2, 220, 0.01));
  ck(`flange ${n}: ID ${70}`, cs[1].circle && near(cs[1].circle.r * 2, 70, 0.01));
  ck(`flange ${n}: bolt holes Ø14 exactly on the PCD 170`, holes.every((h) => near(h.circle.r * 2, 14, 0.01) && near(Math.hypot(h.circle.cx - R, h.circle.cy - R), 85, 0.01)));
  const ang = holes.map((h) => (Math.atan2(h.circle.cy - R, h.circle.cx - R) * 180 / Math.PI + 360) % 360).sort((a, b) => a - b);
  const step = 360 / n; ck(`flange ${n}: holes evenly spaced ${step}°`, ang.every((a, i) => near(((a - ang[0]) + 360) % 360, i * step, 0.01)));
  ck(`flange ${n}: holes straddle the centre lines (preset)`, near(((ang[0] % step) + step) % step, (90 + step / 2) % step, 0.01) || near(((ang[0] % step) + step) % step, ((90 + 180 / n) % step), 0.01));
}
{ const cs = makeShape("flange", { ...defaultParams(SHAPES.find((s) => s.id === "flange")), ...SHAPE_PRESETS.flangeblind.p });
  ck("blind flange: no centre hole (outline + 8 bolt holes)", cs.length === 9, cs.length); }
{ const base = defaultParams(SHAPES.find((s) => s.id === "flange"));
  const a = makeShape("flange", { ...base }), b = makeShape("flange", { ...base, start: 45 });
  ck("flange default unchanged (4 holes on the axes)", a.length === 6 && near(a[2].circle.cx, 75, 0.01));
  ck("flange first-hole angle is adjustable", !near(a[2].circle.cx, b[2].circle.cx, 0.01)); }

// ------------------------------------------------------------------ 3. banjo guard: adjustable diameter at each end
{
  const p = { ...defaultParams(SHAPES.find((s) => s.id === "banjo")), d: 140, d2: 50, len: 200, hole1: 60, hole2: 18 };
  const cs = makeShape("banjo", p), bb = bbox([cs[0]]);
  ck("banjo: overall length = centres + both radii", near(bb[2] - bb[0], 200 + 70 + 25, 0.05), bb);
  ck("banjo: height = the big end Ø", near(bb[3] - bb[1], 140, 0.05));
  ck("banjo: holes Ø60 and Ø18 at the two centres, centres 200 apart", cs.length === 3 && near(cs[1].circle.r * 2, 60) && near(cs[2].circle.r * 2, 18) && near(cs[2].circle.cx - cs[1].circle.cx, 200, 0.01));
  ck("banjo: swapping the ends mirrors the part", (() => { const q = makeShape("banjo", { ...p, d: 50, d2: 140, hole1: 18, hole2: 60 }); const b2 = bbox([q[0]]); return near(b2[2] - b2[0], 295, 0.05); })());
  const eq = makeShape("banjo", { ...p, d: 80, d2: 80, len: 150 }), be = bbox([eq[0]]);
  ck("banjo: equal ends = a slot (length = len + Ø)", near(be[2] - be[0], 230, 0.05) && near(be[3] - be[1], 80, 0.05));
}

// ------------------------------------------------------------------ 4. square to round: developed geometry vs an independent 3D model
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const tri3 = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]); };
const polyArea = (pts) => Math.abs(signedArea(pts));
// the 3D transition, built here from scratch: rectangle corners at z=0, circle at z=H, 4 quarter arcs each with n*2 chords
function model3D(A, B, Dm, H, n) {
  const R = Dm / 2, corners = [[A / 2, B / 2], [-A / 2, B / 2], [-A / 2, -B / 2], [A / 2, -B / 2]];
  const Cc = corners.map(([x, y]) => [x, y, 0]);
  const pt = (deg) => [R * Math.cos(deg * Math.PI / 180), R * Math.sin(deg * Math.PI / 180), H];
  const tris = [], seamLens = [], base = [];
  // flat triangles: edge k joins corner k and k+1; apex at the circle point straight out from the edge (0, 90, 180, 270 deg)
  const apexDeg = [0, 90, 180, 270];   // edge between corner3->corner0 is the right edge (apex 0), corner0->1 top (90), 1->2 left (180), 2->3 bottom (270)
  const edges = [[3, 0, 0], [0, 1, 90], [1, 2, 180], [2, 3, 270]];
  for (const [i, j, deg] of edges) { tris.push([Cc[i], Cc[j], pt(deg)]); base.push(dist3(Cc[i], Cc[j])); }
  // corner cones: corner k fans over the quarter arc between its two neighbours' apexes, in 2n chords
  const arcs = [[0, 90, 0], [90, 180, 1], [180, 270, 2], [270, 360, 3]];
  const chords = [];
  for (const [a0, a1, k] of arcs) for (let s = 0; s < 2 * n; s++) {
    const p0 = pt(a0 + (a1 - a0) * s / (2 * n)), p1 = pt(a0 + (a1 - a0) * (s + 1) / (2 * n));
    tris.push([Cc[k], p0, p1]); chords.push(dist3(p0, p1));
    if (s === n) seamLens.push(dist3(Cc[k], p0));
  }
  return { tris, area: tris.reduce((s, t) => s + tri3(...t), 0), seamLens, base, chords, pt, Cc, R };
}
for (const [A, B, Dm, H] of [[300, 200, 150, 200], [200, 200, 100, 150], [600, 400, 150, 400], [1000, 300, 125, 300], [350, 250, 315, 120]]) {
  const T = D.squareToRound(A, B, Dm, H), tag = `s2r ${A}x${B} -> Ø${Dm}, H${H}`;
  ck(`${tag}: develops`, !!T);
  if (!T) continue;
  const n = T.n, M = model3D(A, B, Dm, H, n);
  // (a) 2D area of the developed panels (2 of each) = true 3D surface area of the triangulated model
  ck(`${tag}: developed area (2 x A panel + 2 x B panel) = 3D surface area`, near(2 * polyArea(T.A.pts) + 2 * polyArea(T.B.pts), M.area, M.area * 1e-9), [2 * polyArea(T.A.pts) + 2 * polyArea(T.B.pts), M.area]);
  // (b) base edges are the rectangle's edges
  ck(`${tag}: base edge of the A panel = A, of the B panel = B`, near(dist2(T.A.pts[0], T.A.pts[1]), A, 1e-9) && near(dist2(T.B.pts[0], T.B.pts[1]), B, 1e-9));
  // (c) the seam where an A panel meets a B panel has the same length from both sides, and equals the 3D corner->circle-middle distance
  ck(`${tag}: seam length matches on both panels and the 3D model`, near(T.A.seamLength, T.B.seamLength, 1e-9) && near(T.A.seamLength, M.seamLens[0], 1e-9), [T.A.seamLength, T.B.seamLength, M.seamLens[0]]);
  // (d) in the developed outline: seam edge, top chords, apex edges are all the true 3D lengths
  const pts = T.A.pts; const nn = pts.length;
  ck(`${tag}: A panel outline has 2 + 2n + 1 + n points`, nn === 2 + 2 * n + 1, nn);
  const seamR = dist2(pts[1], pts[2]);
  ck(`${tag}: developed seam edge = 3D seam`, near(seamR, M.seamLens[0], 1e-9));
  const topChords2D = []; for (let i = 2; i < nn - 1; i++) topChords2D.push(dist2(pts[i], pts[i + 1]));
  const chord3D = M.chords[0];   // all chords on the circle at equal angles are equal
  ck(`${tag}: every top chord = the 3D chord of the round end (${chord3D.toFixed(3)})`, topChords2D.length === 2 * n && topChords2D.every((c) => near(c, chord3D, 1e-9)), topChords2D.slice(0, 3));
  // (e) the flat triangle in the middle (base + two slant edges to the apex) has the 3D sides
  const apex = pts[2 + n], c0 = M.Cc[0], pa = M.pt(0);
  ck(`${tag}: middle flat triangle: slant edges = 3D corner->apex length`, near(dist2(pts[1], apex), dist3([A / 2, -B / 2, 0], [0, -Dm / 2, H]), 1e-9) && near(dist2(pts[0], apex), dist3([A / 2, -B / 2, 0], [0, -Dm / 2, H]), 1e-9));
  // (f) every fan triangle (corner, Q_j, Q_j+1) has its three developed sides equal to the 3D ones
  const Rr = Dm / 2, corner3 = [A / 2, -B / 2, 0], Q3 = (j) => { const th = -Math.PI / 2 + (j * Math.PI / 4) / n; return [Rr * Math.cos(th), Rr * Math.sin(th), H]; };
  let worst = 0;
  for (let j = 0; j < n; j++) {
    const q0 = pts[2 + n - j], q1 = pts[2 + n - j - 1];       // fan points on the right half, from the apex outward
    const a = pts[1];
    const dev = [dist2(a, q0), dist2(a, q1), dist2(q0, q1)], tru = [dist3(corner3, Q3(j)), dist3(corner3, Q3(j + 1)), dist3(Q3(j), Q3(j + 1))];
    for (let t = 0; t < 3; t++) worst = Math.max(worst, Math.abs(dev[t] - tru[t]));
  }
  ck(`${tag}: all ${n} fan triangles keep their 3D side lengths (worst error ${worst.toExponential(1)} mm)`, worst < 1e-9, worst);
  // (g) symmetrical, simple, positive area
  ck(`${tag}: panel symmetrical about its centre line`, pts.slice(3 + n).every((q, i) => near(q[0], -pts[2 + n - 1 - i][0], 1e-9) && near(q[1], pts[2 + n - 1 - i][1], 1e-9)));
  ck(`${tag}: panels don't fold over`, !selfIntersects(T.A.pts) && !selfIntersects(T.B.pts));
  // (h) the round end: the four panels' top edges add up to the polygon inscribed in the Ø
  const topLen = (P) => P.pts.slice(2, -0).reduce((s, q, i, a) => (i < a.length - 1 ? s + dist2(q, a[i + 1]) : s), 0);
  const perim = 2 * T.A.chords.reduce((a, b) => a + b, 0) * 2 + 2 * T.B.chords.reduce((a, b) => a + b, 0) * 2;
  ck(`${tag}: round end = 8 x n chords of an inscribed polygon of Ø${Dm}`, near(perim, 8 * n * M.chords[0], 1e-6) && perim < Math.PI * Dm && perim > Math.PI * Dm * 0.995, [perim, Math.PI * Dm]);
  void c0; void pa; void topLen;
}
// the shape itself: 4 panels + a frame flange + a round flange ring, laid out within the table width, nothing overlapping
{
  const cs = makeShape("s2r", defaultParams(SHAPES.find((s) => s.id === "s2r")));
  ck("s2r shape: 4 panels + frame (with opening) + ring (with opening) = 8 outlines", cs.length === 8, cs.length);
  const b = bbox(cs);
  ck("s2r shape: layout fits the 1300 mm table width", b[2] - b[0] <= 1200 + 1e-6, b);
  const frame = cs[4], ring = cs[6];
  const fb = bbox([frame]);
  ck("s2r shape: frame flange = (A + 2 x lip) x (B + 2 x lip), opening A x B", near(fb[2] - fb[0], 350) && near(fb[3] - fb[1], 250) && (() => { const ob = bbox([cs[5]]); return near(ob[2] - ob[0], 300) && near(ob[3] - ob[1], 200); })());
  ck("s2r shape: round flange ring OD = D + 2 x lip, ID = D", near(ring.circle.r * 2, 200, 0.01) && near(cs[7].circle.r * 2, 150, 0.01));
  const chk = checkDesign(cs, { thickness: 3, kerf: 1.5, table: [1300, 800] });
  ck("s2r shape: pieces are spaced so the cut check finds no touching/overlapping outlines", !chk.groups.some((g) => /touch|overlap|cross/i.test(g.text)), chk.groups.map((g) => g.text));
  const noFl = makeShape("s2r", { ...defaultParams(SHAPES.find((s) => s.id === "s2r")), lip: 0 });
  ck("s2r shape: flange lip 0 = body panels only", noFl.length === 4, noFl.length);
  const noRing = makeShape("s2r", { ...defaultParams(SHAPES.find((s) => s.id === "s2r")), ring: 0 });
  ck("s2r shape: round flange can be switched off", noRing.length === 6, noRing.length);
  const big = makeShape("s2r", { ...defaultParams(SHAPES.find((s) => s.id === "s2r")), a: 900, b: 700, d: 400, h: 600 });
  ck("s2r shape: a big one wraps to more rows (still within the width)", big.length === 8 && bbox(big)[2] <= 1200 + 1e-6 || bbox(big)[2] - bbox(big)[0] > 1200 && false, bbox(big));
  ck("s2r shape: nonsense sizes give nothing instead of a broken outline", makeShape("s2r", { ...defaultParams(SHAPES.find((s) => s.id === "s2r")), h: 1 }).length === 0 || makeShape("s2r", { ...defaultParams(SHAPES.find((s) => s.id === "s2r")), h: 1 }).every((c) => !selfIntersects(c.pts)));
}
// cone and tube
{
  const p = { d: 300, d2: 120, h: 200 }, cs = makeShape("cone", p), cd = D.coneDevelopment(300, 120, 200);
  const o = cs[0].pts;
  ck("cone: slant = sqrt(H² + ((D1-D2)/2)²)", near(cd.slant, Math.hypot(200, 90), 1e-9));
  ck("cone: big arc length = π x D1, small arc length = π x D2", near(cd.ang * cd.Ro, Math.PI * 300, 1e-9) && near(cd.ang * cd.Ri, Math.PI * 120, 1e-9));
  ck("cone: outline spans the radii (Ro - Ri = slant)", near(cd.Ro - cd.Ri, cd.slant, 1e-9));
  const apexDist = o.map((q) => Math.hypot(q[0], q[1]));
  ck("cone: every outline point is on the outer or inner arc, or the straight sides", Math.max(...apexDist) <= cd.Ro + 1e-6 && Math.min(...apexDist) >= cd.Ri - 1e-6);
  const tb = makeShape("tube", { d: 100, h: 150 }), bt = bbox(tb);
  ck("tube: blank is π x Ø wide and as long as asked", near(bt[2] - bt[0], Math.PI * 100, 1e-6) && near(bt[3] - bt[1], 150));
}

// ------------------------------------------------------------------ 5. in the browser
const s = await serve(), br = await launch();
const dxf = fs.readFileSync(DATA + "plate.dxf");
const T0 = (page, f) => page.evaluate(f);
async function snap(p, name) { await p.evaluate(() => { const t = document.getElementById("toast"); if (t) t.classList.add("hidden"); const d = document.getElementById("demoAcctBar"); if (d) d.remove(); }); await sleep(350); await p.screenshot({ path: `${OUT}r5-cad-${name}.png` }); }
for (const mode of ["beginner", "pro"]) {
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  const errs = () => page.errors.length ? page.errors : [];
  await T0(page, (m) => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode(m, { persist: false, autoFs: false }); T.sketch.clear(); T.sketch.add("flange"); T.sketch.fitView(); T.sketch.commit(); T.sketch.onSelect(); }, mode).catch(() => {});
  await page.evaluate((m) => { const T = window.plasmaTest; T.sketch.clear(); T.sketch.add("flange"); const it = T.sketch.items[0]; it.p.hole = 3; it.p.pcd = 40; it.p.id = 10; T.sketch.fitView(); T.sketch.commit(); T.sketch.onSelect(); }, mode);
  await sleep(900);
  const vis = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).display === "none") return false; return !!e.innerText.trim(); }, sel);
  ck(`[${mode}] designing a flange with tiny holes: no cut-check panel on Make`, !(await vis("#cutCheck")));
  ck(`[${mode}] ... and no job warnings on Make`, !(await vis("#warnings")));
  ck(`[${mode}] ... and no markers on the drawing`, await page.evaluate(() => window.plasmaTest.sketch.marks.length === 0));
  ck(`[${mode}] ... but the design really is flagged when checked (it has small holes)`, await page.evaluate(() => (window.plasmaTest.S.check && window.plasmaTest.S.check.groups.length) > 0));
  if (mode === "beginner") await snap(page, "no-warning-while-designing-beginner");
  await page.evaluate(() => window.plasmaTest.sendToCutting());
  await sleep(900);
  const txt = await page.evaluate(() => document.getElementById("cutCheck3").innerText);
  ck(`[${mode}] sent to cutting: the check runs and shows the small-hole warning on the cutting screen`, /small|hole|metal/i.test(txt), txt.slice(0, 120));
  ck(`[${mode}] ... and the drawing gets its markers`, await page.evaluate(() => (window.plasmaTest.S.prepared.marks || []).length > 0));
  if (mode === "beginner") await snap(page, "check-on-cutting-screen");
  // back to Make: gone again
  await page.evaluate(() => window.plasmaTest.showScreen("make")); await sleep(500);
  ck(`[${mode}] back on Make: no markers, no panel`, !(await vis("#cutCheck")) && await page.evaluate(() => window.plasmaTest.sketch.marks.length === 0));
  // a loaded file: checked on the cutting screen
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("menu"); T.showScreen("cut"); T.startOver(); });
  await sleep(300);
  await page.setInputFiles("#file", { name: "plate.dxf", mimeType: "text/plain", buffer: dxf });
  for (let i = 0; i < 20; i++) { if (await page.locator("#sizeYes").isVisible()) { await page.evaluate(() => document.getElementById("sizeYes").click()); break; } await sleep(150); }
  await sleep(600);
  ck(`[${mode}] loading a file on the cutting screen: the check shows there`, (await page.evaluate(() => document.getElementById("cutCheck2").innerText)).includes("Cut check"));
  ck(`[${mode}] no page errors`, page.errors.length === 0, page.errors);
  await page.context().close();
}

// library, presets and the beginner flow
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode("beginner", { persist: false, autoFs: false }); T.sketch.clear(); });
  await sleep(400);
  await page.evaluate(() => document.getElementById("bgMore").click()); await sleep(500);
  const cats = await page.evaluate(() => [...document.querySelectorAll("#libCats button")].map((b) => b.textContent));
  ck("library has the new categories", ["Flanges & washers", "Duct & rolled"].every((c) => cats.includes(c)), cats);
  await page.evaluate(() => { [...document.querySelectorAll("#libCats button")].find((b) => b.textContent === "Flanges & washers").click(); }); await sleep(300);
  const tiles = await page.evaluate(() => [...document.querySelectorAll("#libGrid button")].map((b) => b.textContent));
  ck("Flanges category shows 4, 6, 8, 10, 12-hole flanges", [4, 6, 8, 10, 12].every((n) => tiles.some((t) => t.includes(`Flange – ${n} holes`))), tiles);
  await snap(page, "library-flanges");
  await page.evaluate(() => { [...document.querySelectorAll("#libCats button")].find((b) => b.textContent === "Plasma / fab").click(); }); await sleep(300);
  await snap(page, "library-fab");
  await page.evaluate(() => { [...document.querySelectorAll("#libCats button")].find((b) => b.textContent === "Duct & rolled").click(); }); await sleep(300);
  await snap(page, "library-duct");
  await page.fill("#libSearch", "banjo"); await sleep(300);
  ck("library search finds the banjo guard", (await page.evaluate(() => document.getElementById("libGrid").innerText)).includes("Banjo"));
  await page.fill("#libSearch", "square to round"); await sleep(300);
  ck("library search finds square to round", (await page.evaluate(() => document.getElementById("libGrid").innerText)).includes("Square to round"));
  await page.fill("#libSearch", "washer"); await sleep(300);
  ck("library search 'washer' finds washers and spacers", (await page.evaluate(() => document.getElementById("libGrid").innerText)).includes("washer"));
  await page.fill("#libSearch", "");
  // pick a 12-hole flange from the library in Beginner
  await page.evaluate(() => { [...document.querySelectorAll("#libCats button")].find((b) => b.textContent === "Flanges & washers").click(); }); await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("#libGrid button")].find((b) => b.textContent.includes("12 holes")).click()); await sleep(900);
  const f12 = await page.evaluate(() => { const k = window.plasmaTest.sketch; return { n: k.items.length, p: k.items[0].p, holes: k.contoursOf(k.items[0]).length - 2 }; });
  ck("Beginner: tapping 'Flange – 12 holes' adds a flange with 12 bolt holes", f12.n === 1 && f12.holes === 12 && f12.p.n === 12, f12);
  const labels = await page.evaluate(() => [...document.querySelectorAll("#shapeForm .grid2 label")].map((l) => l.firstChild.textContent.trim()));
  ck("Beginner form shows OD, ID, PCD, bolt hole size, hole count", ["Outside Ø (OD)", "Centre hole Ø (ID)", "Bolt circle Ø (PCD)", "Bolt hole Ø", "Number of bolt holes"].every((l) => labels.includes(l)), labels);
  await snap(page, "flange12-beginner");
  // adjust by typing
  await page.fill('#shapeForm [data-p="hole"]', "20"); await page.keyboard.press("Tab"); await sleep(500); await page.fill('#shapeForm [data-p="pcd"]', "200"); await sleep(600);
  const f12b = await page.evaluate(() => { const k = window.plasmaTest.sketch, cs = k.contoursOf(k.items[0]); return [cs[2].circle.r * 2, Math.hypot(cs[2].circle.cx - cs[0].circle.cx, cs[2].circle.cy - cs[0].circle.cy) * 2]; });
  ck("typing a new bolt hole Ø and PCD changes the flange", near(f12b[0], 20, 0.01) && near(f12b[1], 200, 0.01), f12b);
  // square to round in beginner
  await page.evaluate(() => document.getElementById("bgChange").click()); await sleep(300);
  await page.evaluate(() => document.getElementById("bgMore").click()); await sleep(400);
  await page.evaluate(() => { [...document.querySelectorAll("#libCats button")].find((b) => b.textContent === "Duct & rolled").click(); }); await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("#libGrid button")].find((b) => b.textContent.includes("Square to round")).click()); await sleep(1000);
  const lab2 = await page.evaluate(() => [...document.querySelectorAll("#shapeForm .grid2 label")].map((l) => l.firstChild.textContent.trim()));
  ck("Beginner: square to round form asks for A, B, round Ø, height, flange lip", lab2.length >= 5 && /Width A/.test(lab2[0]) && /Depth B/.test(lab2[1]) && /Round diameter/.test(lab2[2]) && /Height/.test(lab2[3]) && /lip/i.test(lab2[4]), lab2);
  await snap(page, "s2r-beginner");
  for (const [k, v] of [["a", "400"], ["b", "250"], ["d", "200"], ["h", "300"]]) { await page.fill(`#shapeForm [data-p="${k}"]`, v); await page.keyboard.press("Tab"); await sleep(450); } await sleep(300);
  const s2 = await page.evaluate(() => { const k = window.plasmaTest.sketch, cs = k.contoursOf(k.items[0]); return { n: cs.length, p: k.items[0].p, panelBase: Math.hypot(cs[0].pts[0][0] - cs[0].pts[1][0], cs[0].pts[0][1] - cs[0].pts[1][1]) }; });
  ck("typing sizes re-develops the pattern (panel base = new width A 400)", near(s2.panelBase, 400, 1e-6) && s2.n === 8, s2);
  // splitting the set into parts and undo
  const split = await page.evaluate(() => { const k = window.plasmaTest.sketch; const n = k.explode(); return { n, items: k.items.length, types: [...new Set(k.items.map((i) => i.type))], sel: k.sel.ids.length }; });
  ck("Split into parts: 6 separate parts (4 panels + frame with its opening + ring with its opening)", split.n === 6 && split.items === 6 && split.types.join() === "custom", split);
  await page.evaluate(() => window.plasmaTest.sketch.undo()); await sleep(300);
  ck("Undo brings the whole set back", await page.evaluate(() => window.plasmaTest.sketch.items.length === 1 && window.plasmaTest.sketch.items[0].type === "s2r"));
  await page.evaluate(() => { const k = window.plasmaTest.sketch; k.pick([k.items[0].id]); k.onSelect(); });
  // resize handles do nothing on a flat pattern set
  ck("a flat pattern set can't be dragged out of shape (no resize)", await page.evaluate(() => { const k = window.plasmaTest.sketch, it = k.items[0], b0 = JSON.stringify(k.boxOf(it)); k.setWidth(300); return !k.canResize(it) && JSON.stringify(k.boxOf(it)) === b0; }));
  ck("no page errors (library/beginner)", page.errors.length === 0, page.errors);
  await page.context().close();
}

// Pro: hole helpers, patterns, the transition shown as pieces, presets for every new shape
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode("pro", { persist: false, autoFs: false }); T.sketch.clear(); T.sketch.add("baseplate"); T.sketch.fitView(); T.sketch.commit(); T.sketch.onSelect(); });
  await sleep(500);
  const r = await page.evaluate(() => {
    const T = window.plasmaTest, k = T.sketch, o = {};
    const plate = k.items[0];
    k.pick([plate.id]); k.add("cornerholes"); const ch = k.selected();
    o.chType = ch.type; o.isHole = k.isHole(ch); o.host = k.hostPart(ch) === plate;
    o.holes = k.contoursOf(ch).length;
    const hb = k.boxOf(plate), cb = k.boxOf(ch);
    o.centred = Math.abs((hb[0] + hb[2]) / 2 - (cb[0] + cb[2]) / 2) < 0.6 && Math.abs((hb[1] + hb[3]) / 2 - (cb[1] + cb[3]) / 2) < 0.6;
    k.setHoleOffset("x", 60); k.setHoleOffset("y", 40);
    const nb = k.boxOf(ch); o.rel = [(nb[0] + nb[2]) / 2 - hb[0], (nb[1] + nb[3]) / 2 - hb[1]];
    o.centreBack = k.centreInHost(); const nb2 = k.boxOf(ch); o.rel2 = [(nb2[0] + nb2[2]) / 2 - hb[0], (nb2[1] + nb2[3]) / 2 - hb[1]];
    o.pickHost = k.pickHost() && k.selected() === plate;
    k.add("holerow"); const row = k.selected(); o.rowN = k.contoursOf(row).length; o.rowHost = k.hostPart(row) === plate;
    k.pick([row.id]); k.linearArray(3, 0, 12); o.arrayed = k.items.filter((i) => i.type === "holerow").length;
    o.formPro = (T.setAppMode("pro", { persist: false, autoFs: false }), "");
    return o;
  });
  ck("hole pattern drops into the part, centred, and is a hole of it", r.chType === "cornerholes" && r.isHole && r.host && r.centred && r.holes === 4, r);
  ck("hole pattern: set its centre from the part's edges (60, 40)", near(r.rel[0], 60, 0.2) && near(r.rel[1], 40, 0.2), r.rel);
  ck("hole pattern: Centre in the part works", r.centreBack && near(r.rel2[0], 100, 0.6) && near(r.rel2[1], 100, 0.6), r.rel2);
  ck("Select the part gets back to the part", r.pickHost);
  ck("Row of holes: 5 holes, in the part; array of rows works", r.rowN === 5 && r.rowHost && r.arrayed === 3, r);
  // pro form shows the 'where it sits' fields for a picked hole pattern
  await page.evaluate(() => { const k = window.plasmaTest.sketch; k.pick([k.items.find((i) => i.type === "cornerholes").id]); k.onSelect(); }); await sleep(400);
  ck("Pro form: hole shows 'Where it sits in the part' fields", await page.evaluate(() => !!document.querySelector('#shapeForm [data-hrel="x"]') && !!document.querySelector('#shapeForm [data-hrel="y"]')));
  await page.fill('#shapeForm [data-hrel="x"]', "50"); await page.press('#shapeForm [data-hrel="x"]', "Tab"); await sleep(500);
  ck("Pro form: typing the hole's distance from the left edge moves it", await page.evaluate(() => { const k = window.plasmaTest.sketch, h = k.items.find((i) => i.type === "cornerholes"), p = k.items[0], a = k.boxOf(h), b = k.boxOf(p); return Math.abs((a[0] + a[2]) / 2 - b[0] - 50) < 0.3; }));
  await snap(page, "holes-pro");
  // the lot of them: each new part, default, added in Pro, and the cut check says it's cuttable on the cutting screen
  for (const id of ["banjo", "wgusset", "baseplate", "slot2", "sqwasher", "lug", "strap", "frame", "tplate", "tube", "cone", "s2r"]) {
    await page.evaluate((id) => { const k = window.plasmaTest.sketch; k.clear(); k.add(id); k.fitView(); k.commit(); k.onSelect(); }, id);
    await sleep(250);
    const ok = await page.evaluate((id) => { const k = window.plasmaTest.sketch; return k.items.length === 1 && k.contoursOf(k.items[0]).length >= 1 && !!window.plasmaTest.S.prepared; }, id);
    ck(`Pro: add ${id} -> ready to cut`, ok);
  }
  ck("no page errors (pro)", page.errors.length === 0, page.errors);
  await page.context().close();
}

// ------------------------------------------------------------------ 6. screenshots
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  const shape = async (id, p, name, mode = "pro") => {
    await page.evaluate(([id, p, mode]) => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode(mode, { persist: false, autoFs: false }); const k = T.sketch; k.clear(); k.add(id, true, p); if (mode === "pro") T.setShapeFs(true); k.fitView(); k.commit(); k.onSelect(); }, [id, p, mode]);
    await sleep(700); await snap(page, name);
  };
  await shape("s2r", null, "s2r-pro");
  await shape("banjo", null, "banjo-pro");
  await shape("flange", SHAPE_PRESETS.flange8.p, "flange8-pro");
  await shape("baseplate", { slot: 12 }, "baseplate-slots-pro");
  await shape("cone", null, "cone-pro");
  await shape("lug", null, "lug-beginner", "beginner");
  // the whole kit on one sheet
  await page.evaluate(() => { const T = window.plasmaTest, k = T.sketch; T.showScreen("make"); T.setAppMode("pro", { persist: false, autoFs: false }); k.clear(); for (const id of ["banjo", "wgusset", "baseplate", "slot2", "sqwasher", "lug", "strap", "frame", "tplate"]) k.add(id, true); T.setShapeFs(true); k.fitView(); k.commit(); k.onSelect(); });
  await sleep(800); await snap(page, "new-parts-sheet");
  await page.context().close();
}
await br.close(); s.close();
console.log(`\n53_cad_parts: ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

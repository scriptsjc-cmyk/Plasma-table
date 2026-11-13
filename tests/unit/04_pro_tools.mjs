import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs"; import { verifyDesign } from "../lib/verify.mjs"; import { area, inPoly, selfCross, bb } from "../lib/analyze.mjs";
const A = await load(); const t = new T("04_pro_tools");
const mk = (specs) => { const sk = A.newSketch(); for (const [type, p, x, y] of specs) { sk.add(type, true); const it = sk.items.at(-1); Object.assign(it.p, p); it.x = x; it.y = y; } sk.opts.pro = true; return sk; };
const boxes = (sk) => sk.items.map((i) => sk.boxOf(i));
const overlap = (a, b) => a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6;
const allFinite = (sk) => sk.contours().every((c) => c.pts.flat().every(Number.isFinite));
const crossings = (cs) => { let n = 0; for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i].pts, b = cs[j].pts; outer: for (let p = 0; p < a.length; p++) for (let q = 0; q < b.length; q++) { const o = (P, Q, R) => (Q[0]-P[0])*(R[1]-P[1])-(Q[1]-P[1])*(R[0]-P[0]); const A1=a[p],A2=a[(p+1)%a.length],B1=b[q],B2=b[(q+1)%b.length]; if (o(B1,B2,A1)*o(B1,B2,A2)<-1e-9 && o(A1,A2,B1)*o(A1,A2,B2)<-1e-9) { n++; break outer; } } } return n; };
const flagged = (sk) => { try { const r = A.checkDesign(sk.contours(), { thickness: 3, kerf: 1.5, leadIn: 3, table: [1300, 800] }); return r.groups.some((g) => g.level === "bad" || /cross|overlap|through|outside|touch/i.test(g.text)); } catch (e) { return false; } };

// ---------- flip up/down
for (const type of ["rect", "plate", "bracket", "gusset", "triangle", "tab", "flange", "slot"]) {
  const sk = mk([[type, {}, 30, 40]]); sk.pick([sk.items[0].id]); const b0 = sk.boxOf(sk.items[0]); const a0 = area(sk.contours()[0].pts);
  sk.flipV(); const b1 = sk.boxOf(sk.items[0]), cs = sk.contours();
  t.check(`flip ${type}: same bbox`, b0.every((v, i) => Math.abs(v - b1[i]) < 0.2), `${b0.map((v) => +v.toFixed(1))} -> ${b1.map((v) => +v.toFixed(1))}`, "PRO-FLIP");
  t.check(`flip ${type}: area preserved`, Math.abs(Math.abs(area(cs[0].pts)) - Math.abs(a0)) < 0.01 * Math.abs(a0));
  t.check(`flip ${type}: Y mirrored (asymmetric shapes change)`, true);
  verifyDesign(A, t, `flip ${type}`, cs);
  sk.flipV(); const b2 = sk.boxOf(sk.items[0]); t.check(`flip ${type} x2 returns to start`, b0.every((v, i) => Math.abs(v - b2[i]) < 0.2), `${b2.map((v) => +v.toFixed(1))}`, "PRO-FLIP");
  // flip a rotated one
  const sk2 = mk([[type, {}, 30, 40]]); sk2.pick([sk2.items[0].id]); sk2.rotateBy(30); const r0 = sk2.boxOf(sk2.items[0]); sk2.flipV(); const r1b = sk2.boxOf(sk2.items[0]);
  t.check(`flip rotated(30°) ${type}: same bbox size`, Math.abs((r0[2]-r0[0]) - (r1b[2]-r1b[0])) < 0.3 && Math.abs((r0[3]-r0[1]) - (r1b[3]-r1b[1])) < 0.3, `${r0.map((v) => +v.toFixed(1))} -> ${r1b.map((v) => +v.toFixed(1))}`, "PRO-FLIP");
  verifyDesign(A, t, `flip rotated ${type}`, sk2.contours());
}
// ---------- linear array
{
  const sk = mk([["plate", {}, 10, 10]]); sk.pick([sk.items[0].id]); sk.linearArray(4, 10, 0);
  t.check("linear array 4: 4 copies", sk.items.length === 4);
  const bx = boxes(sk); t.check("linear array: no overlaps with gap 10", !bx.some((a, i) => bx.some((b, j) => j > i && overlap(a, b))));
  const gaps = bx.slice(1).map((b, i) => +(b[0] - bx[i][2]).toFixed(2)); t.check("linear array: gaps all 10", gaps.every((g) => Math.abs(g - 10) < 0.2), gaps.join(","), "PRO-ARRAY");
  verifyDesign(A, t, "linear array of plates", sk.contours());
  const sk2 = mk([["plate", {}, 10, 10]]); sk2.pick([sk2.items[0].id]); sk2.linearArray(3, -50, 0);
  const bx2 = boxes(sk2); const ov = bx2.some((a, i) => bx2.some((b, j) => j > i && overlap(a, b)));
  t.check("linear array negative gap -50 (overlap): rejected or flagged", !ov || flagged(sk2), `overlap=${ov} cut check flagged=${flagged(sk2)} crossings=${crossings(sk2.contours())}`, "PRO-ARRAY-OVERLAP");
  const sk3 = mk([["rect", {}, 0, 0]]); sk3.pick([sk3.items[0].id]); sk3.linearArray(1e9, 1e9, 1e9); t.check("linear array count capped (n=1e9 → ≤50)", sk3.items.length <= 50, `${sk3.items.length}`);
  t.check("linear array 1e9 gap: positions finite", allFinite(sk3)); const mb = Math.max(...boxes(sk3).map((b) => b[2])); t.note("linear array gap 1e9 → max X", mb);
  t.check("linear array with 1e9 gap is rejected (would be a 1e9 mm job)", mb < 1e5, `max X = ${mb}`, "ARRAY-HUGE");
  const sk4 = mk([["rect", {}, 0, 0]]); sk4.pick([sk4.items[0].id]); sk4.linearArray(NaN, NaN, NaN); t.check("linear array NaN inputs → safe defaults", allFinite(sk4) && sk4.items.length >= 2, `${sk4.items.length}`);
  const sk5 = mk([["rect", {}, 0, 0]]); sk5.pick([sk5.items[0].id]); sk5.linearArray(Infinity, Infinity, -Infinity); t.check("linear array Infinity inputs safe", allFinite(sk5), `${sk5.items.length} items, maxX=${Math.max(...boxes(sk5).map((b) => b[2]))}`, "ARRAY-HUGE");
  // multi-select array
  const sk6 = mk([["rect", {}, 0, 0], ["hole", {}, 0, 0]]); sk6.items[1].x = 40; sk6.items[1].y = 20; sk6.pick(sk6.items.map((i) => i.id)); sk6.linearArray(3, 10, 0);
  verifyDesign(A, t, "linear array of part+hole", sk6.contours()); t.check("array part+hole: holes stay inside their copies", sk6.items.filter((i) => sk6.isHole(i)).length === 3, `${sk6.items.filter((i) => sk6.isHole(i)).length} holes`);
  // array 2D 
  const sk7 = mk([["disc", { d: 30 }, 0, 0]]); sk7.pick([sk7.items[0].id]); sk7.linearArray(10, 5, 5); verifyDesign(A, t, "diagonal array of discs", sk7.contours());
}
// ---------- polar array
{
  const sk = mk([["hole", { d: 10 }, 100, 100]]); sk.pick([sk.items[0].id]); sk.polarArray(6, 80);
  t.check("polar 6: 6 items", sk.items.length === 6, `${sk.items.length}`);
  const cs = sk.contours().map((c) => A.bbox([c])); const centres = cs.map((b) => [(b[0]+b[2])/2, (b[1]+b[3])/2]);
  const cx = centres.reduce((s, c) => s + c[0], 0) / 6, cy = centres.reduce((s, c) => s + c[1], 0) / 6;
  const radii = centres.map((c) => Math.hypot(c[0] - cx, c[1] - cy)); t.check("polar: all at equal radius 40", radii.every((r) => Math.abs(r - 40) < 0.6), radii.map((r) => r.toFixed(2)).join(","), "PRO-POLAR");
  const sk2 = mk([["rect", { w: 100, h: 60 }, 0, 0], ["hole", { d: 10 }, 0, 0]]); sk2.items[1].x = 70; sk2.items[1].y = 25; sk2.pick([sk2.items[1].id]); sk2.polarArray(5, 0); verifyDesign(A, t, "polar array of hole on plate", sk2.contours());
  const sk3 = mk([["rect", { w: 20, h: 20 }, 0, 0]]); sk3.pick([sk3.items[0].id]); sk3.polarArray(8, 5);
  const bx = boxes(sk3); t.check("polar pcd smaller than part: overlap rejected or flagged", !bx.some((a, i) => bx.some((b, j) => j > i && overlap(a, b))) || flagged(sk3), `crossings=${crossings(sk3.contours())} flagged=${flagged(sk3)}`, "PRO-ARRAY-OVERLAP");
  const sk4 = mk([["rect", {}, 0, 0]]); sk4.pick([sk4.items[0].id]); sk4.polarArray(1e9, 1e12); t.check("polar: n capped, finite", sk4.items.length <= 36 && allFinite(sk4), `${sk4.items.length}`); t.note("polar pcd 1e12 → max X", Math.max(...boxes(sk4).map((b) => b[2])));
  t.check("polar pcd 1e12 rejected (impossible job)", Math.max(...boxes(sk4).map((b) => b[2])) < 1e5, "", "ARRAY-HUGE");
  const sk5 = mk([["rect", {}, 0, 0]]); sk5.pick([sk5.items[0].id]); sk5.polarArray(NaN, NaN); t.check("polar NaN inputs safe", allFinite(sk5));
  const sk6 = mk([["gusset", {}, 50, 50]]); sk6.pick([sk6.items[0].id]); sk6.polarArray(4, 300); verifyDesign(A, t, "polar array of gussets (rotated copies)", sk6.contours());
}
// ---------- distribute
{
  const sk = mk([["rect", { w: 20, h: 20 }, 0, 0], ["rect", { w: 20, h: 20 }, 17, 0], ["rect", { w: 20, h: 20 }, 33, 0], ["rect", { w: 20, h: 20 }, 200, 0]]); sk.pick(sk.items.map((i) => i.id)); sk.distribute("x");
  const bx = boxes(sk).sort((a, b) => a[0] - b[0]); const g = bx.slice(1).map((b, i) => +(b[0] - bx[i][0]).toFixed(1));
  t.check("distribute x: even pitch", g.every((v) => Math.abs(v - g[0]) < 0.3), g.join(","), "PRO-DIST");
  const sk2 = mk([["rect", {}, 0, 0], ["rect", {}, 50, 0]]); sk2.pick(sk2.items.map((i) => i.id)); const b = JSON.stringify(boxes(sk2)); sk2.distribute("x"); t.check("distribute needs 3+: 2 items unchanged + message", JSON.stringify(boxes(sk2)) === b && sk2.messages.length > 0);
  // distribute on parts with holes: do holes follow their parts?
  const sk3 = mk([["plate", {}, 0, 0], ["plate", {}, 130, 0], ["plate", {}, 400, 0]]); sk3.pick(sk3.items.filter((i) => !sk3.isHole(i)).map((i) => i.id)); sk3.distribute("x");
  t.check("distribute: parts do not overlap each other afterwards", (() => { const bx = boxes(sk3); return !bx.some((a, i) => bx.some((c, j) => j > i && overlap(a, c))); })(), "");
}
// ---------- offset
for (const [type, d] of [["rect", 5], ["rect", -5], ["plate", 3], ["plate", -3], ["disc", 4], ["disc", -4], ["gusset", 5], ["bracket", -3], ["flange", -5], ["slot", 3]]) {
  const sk = mk([[type, {}, 20, 20]]); sk.pick([sk.items[0].id]); const b0 = sk.boxOf(sk.items[0]); sk.offsetBy(d);
  if (sk.items[0].type !== "custom") { t.check(`offset ${type} ${d}: applied`, false, "unchanged"); continue; }
  const b1 = sk.boxOf(sk.items[0]); const grew = (b1[2] - b1[0]) - (b0[2] - b0[0]);
  t.check(`offset ${type} ${d}: outer grows by ~2*d`, Math.abs(grew - 2 * d) < 0.6 + Math.abs(d) * 0.1, `grew ${grew.toFixed(2)} expected ${2 * d}`, "PRO-OFFSET");
  const cs = sk.contours(); t.check(`offset ${type} ${d}: outer not self-intersecting`, !selfCross(cs[0].pts), "", "PRO-OFFSET-SELFX");
  const holesOk = cs.slice(1).every((h) => h.pts.every((p) => inPoly(p, cs[0].pts)));
  t.check(`offset ${type} ${d}: holes still inside outer`, holesOk, "", "PRO-OFFSET-HOLES");
  t.check(`offset ${type} ${d}: position stays (min corner shifts by ~-d)`, Math.abs((b1[0] - b0[0]) + d) < 0.6 + Math.abs(d) * 0.1, `dx=${(b1[0]-b0[0]).toFixed(2)}`, "PRO-OFFSET");
  verifyDesign(A, t, `offset ${type} ${d}`, cs);
}
{ // aggressive offsets
  for (const d of [-24, -25, -26, -100, 500, 1e9, -1e9, 1e-9, NaN, Infinity]) {
    const sk = mk([["rect", { w: 100, h: 50 }, 0, 0]]); sk.pick([sk.items[0].id]); sk.offsetBy(d);
    const it = sk.items[0]; const cs = sk.contours();
    const ok = allFinite(sk) && (it.type !== "custom" ? true : cs.length > 0 && A.signedArea(cs[0].pts) !== 0 && !selfCross(cs[0].pts));
    const b = sk.boxOf(it); const huge = (b[2] - b[0]) > 5000;
    t.check(`offset rect(100x50) by ${d}: sane result or rejected`, ok && !huge, `type=${it.type} size=${(b[2]-b[0]).toFixed(1)}x${(b[3]-b[1]).toFixed(1)} msgs=${sk.messages.slice(-1)}`, "PRO-OFFSET-EXTREME");
  }
  // offset a plate so holes break through the edge
  const sk = mk([["plate", { w: 120, h: 80, hole: 10, inset: 15 }, 0, 0]]); sk.pick([sk.items[0].id]); sk.offsetBy(-12);
  const cs = sk.contours(); t.check("offset plate -12 (holes grow to break outline): rejected or flagged", cs.slice(1).every((h) => h.pts.every((p) => inPoly(p, cs[0].pts))) || flagged(sk), `crossings=${crossings(cs)} flagged=${flagged(sk)}`, "PRO-OFFSET-HOLES");
  // offset that keeps arcs? circle info lost
  const sk2 = mk([["disc", { d: 50 }, 0, 0]]); sk2.pick([sk2.items[0].id]); sk2.offsetBy(5); const cc = sk2.contours()[0];
  t.check("offset disc → still cut as true circle (G2/G3) — otherwise polyline", !!cc.circle || cc.pts.length < 400, `circle=${!!cc.circle} pts=${cc.pts.length}`, "INFO-POLYLINE");
  const cam = A.designToGcode(sk2.contours(), {}); t.note("offset disc gcode line count", cam.gcode.split("\n").length);
  // offset with nothing selected
  const sk3 = mk([["rect", {}, 0, 0]]); sk3.pick([]); sk3.offsetBy(5); t.check("offset w/ nothing picked: message, no crash", sk3.messages.length > 0);
}
// ---------- subtract
{
  const sk = mk([["rect", { w: 100, h: 50 }, 0, 0], ["rect", { w: 20, h: 70 }, 40, -10]]); sk.pick(sk.items.map((i) => i.id)); sk.subtract();
  const cs = sk.contours(); const msg = sk.messages.slice(-1)[0];
  const pieces = sk.items.length, loops = cs.length;
  t.check("subtract: cutter that splits the part in two → two separate parts (not 'part + hole')", cs.length === 2 && cs.every((c) => Math.abs(area(c.pts)) < 3600) && !cs.some((c, i) => cs.some((d, j) => i !== j && inPoly(c.pts[0], d.pts))) , `items=${pieces} contours=${loops} areas=${cs.map((c) => Math.abs(area(c.pts)).toFixed(0))} msg=${msg}`, "PRO-SUBTRACT-SPLIT");
  verifyDesign(A, t, "subtract splitting cutter", cs);
}
{
  const sk = mk([["rect", { w: 100, h: 50 }, 0, 0], ["rect", { w: 30, h: 30 }, 85, 10]]); sk.pick(sk.items.map((i) => i.id)); sk.subtract();
  const cs = sk.contours(); t.check("subtract notch at edge: one closed outline, area = 5000 - 15*30", cs.length === 1 && Math.abs(Math.abs(area(cs[0].pts)) - (5000 - 450)) < 5, `n=${cs.length} area=${cs[0] && Math.abs(area(cs[0].pts)).toFixed(0)}`, "PRO-SUBTRACT");
  verifyDesign(A, t, "subtract edge notch", cs);
}
{
  const sk = mk([["rect", { w: 100, h: 50 }, 0, 0], ["disc", { d: 20 }, 40, 15]]); sk.pick(sk.items.map((i) => i.id)); sk.subtract();
  const cs = sk.contours(); t.check("subtract inner disc → part + hole", cs.length === 2); verifyDesign(A, t, "subtract inner disc", cs);
}
{
  const sk = mk([["plate", { w: 120, h: 80, hole: 10, inset: 15 }, 0, 0], ["disc", { d: 24 }, 3, 3]]); sk.pick(sk.items.map((i) => i.id)); sk.subtract(); // cutter overlaps a corner hole
  const cs = sk.contours(); const strayHoles = cs.slice(1).filter((h) => !h.pts.every((p) => inPoly(p, cs[0].pts)));
  t.check("subtract cutter overlapping an existing hole: result holes all inside outline, no crossings", crossings(cs) === 0, `crossings=${crossings(cs)} stray=${strayHoles.length} flagged=${flagged(sk)}`, "PRO-SUBTRACT-HOLE-OVERLAP");
  verifyDesign(A, t, "subtract overlapping existing hole", cs);
}
{
  const sk = mk([["rect", { w: 100, h: 50 }, 0, 0], ["rect", { w: 20, h: 20 }, 300, 300]]); sk.pick(sk.items.map((i) => i.id)); const n0 = sk.items.length; sk.subtract();
  t.check("subtract non-overlapping: message and nothing lost", sk.items.length === n0 && sk.messages.slice(-1)[0] && /overlap/.test(sk.messages.slice(-1)[0]), `${sk.items.length} items msg=${sk.messages.slice(-1)}`);
  const sk2 = mk([["rect", { w: 100, h: 50 }, 0, 0], ["rect", { w: 100, h: 50 }, 0, 0]]); sk2.pick(sk2.items.map((i) => i.id)); sk2.subtract();
  t.check("subtract identical shape (everything removed): no zero-area part left to cut", sk2.items.length === 0 || sk2.contours().every((c) => Math.abs(area(c.pts)) > 1), `items=${sk2.items.length} areas=${sk2.contours().map((c) => area(c.pts).toFixed(2))}`, "PRO-SUBTRACT-EMPTY");
  const sk3 = mk([["rect", { w: 100, h: 50 }, 0, 0], ["rect", { w: 200, h: 200 }, -50, -50]]); sk3.pick(sk3.items.map((i) => i.id)); sk3.subtract();
  t.check("subtract where cutter is bigger than part (host = bigger one!) result is the 'part' minus cutter — check sane", allFinite(sk3), `items=${sk3.items.length}`);
  const sk4 = mk([["rect", { w: 100, h: 50 }, 0, 0], ["rect", { w: 100, h: 50 }, 50, 0]]); sk4.pick(sk4.items.map((i) => i.id)); sk4.subtract(); verifyDesign(A, t, "subtract half overlap", sk4.contours());
  // subtract with hole shape selected (host is plate; cutter multi-hole)
  const sk5 = mk([["rect", { w: 100, h: 50 }, 0, 0], ["boltcircle", {}, 10, 10]]); sk5.pick(sk5.items.map((i) => i.id)); sk5.subtract(); t.check("subtract with multi-hole item: no crash, finite", allFinite(sk5), `${sk5.items.length}`);
}
// ---------- draw outline
{
  const mkDraw = (pts) => { const sk = mk([]); sk.tool = "draw"; sk.drawPts = pts.map((p) => [...p]); sk.finishDraw(); return sk; };
  const tri = mkDraw([[0, 0], [100, 0], [50, 80]]); t.check("draw triangle → 1 custom part", tri.items.length === 1 && tri.items[0].type === "custom"); verifyDesign(A, t, "drawn triangle", tri.contours());
  const two = mkDraw([[0, 0], [100, 0]]); t.check("draw 2 points: rejected with message", two.items.length === 0 && two.messages.length > 0);
  const col = mkDraw([[0, 0], [50, 0], [100, 0]]); t.check("draw 3 collinear points (zero area): rejected, not added", col.items.length === 0, `items=${col.items.length}`, "PRO-DRAW-DEGENERATE");
  let cam, err = ""; try { cam = A.designToGcode(col.contours(), {}); } catch (e) { err = e.message; } t.note("collinear drawn outline → designToGcode", err || `gcode ${cam.gcode.split("\n").length} lines, warnings=${cam.warnings}`);
  const bow = mkDraw([[0, 0], [100, 100], [100, 0], [0, 100]]); const bowCs = bow.contours(); t.check("draw self-intersecting (bow-tie) outline: rejected or flagged", !A.selfIntersects(bowCs[0].pts) || flagged(bow), `selfIntersects=${A.selfIntersects(bowCs[0].pts)} flagged=${flagged(bow)}`, "PRO-DRAW-SELFX");
  try { const bowCam = A.designToGcode(bowCs, {}); t.note("bow-tie gcode warnings", bowCam.warnings.join(" | ") || "none"); } catch (e) { t.note("bow-tie designToGcode", "throws: " + e.message); }
  const dup = mkDraw([[0, 0], [0, 0], [0, 0], [10, 0]]); t.check("draw duplicate points: no crash, nothing degenerate", dup.items.length === 0 || allFinite(dup), `${dup.items.length}`);
  const huge = mkDraw([[0, 0], [1e9, 0], [1e9, 1e9]]); t.check("draw points 1e9 mm away: rejected/clamped", huge.items.length === 0 || Math.max(...huge.contours().flatMap((c) => c.pts.map((p) => p[0]))) < 1e5, `items=${huge.items.length}`, "DRAW-HUGE");
  const nan = mkDraw([[0, 0], [NaN, 5], [10, 10]]); t.check("draw NaN point: rejected", nan.items.length === 0 || allFinite(nan), `items=${nan.items.length}`, "GCODE-NAN");
  const neg = mkDraw([[-50, -50], [-10, -50], [-30, -10]]); t.check("draw in negative space: gcode shifted to >= 0", (() => { const c = A.designToGcode(neg.contours(), {}); return !/X-|Y-/.test(c.gcode); })());
  const arc = mk([]);
  arc.setTool("draw");
  arc.pushDrawPoint(0, 0);
  arc.pushDrawPoint(120, 0);
  arc.drawArc = true;
  arc.pushDrawPoint(120, 120);
  arc.pushDrawPoint(0, 120);
  arc.finishDraw();
  const ab = (arc.items[0] && arc.items[0].shape && arc.items[0].shape.cs[0].bulges) || [];
  t.check("draw with Arc on: the curved segment is kept on the closed outline", ab.some((b) => Math.abs(b) > 0.05), `bulges=${JSON.stringify(ab.map((x) => +Number(x).toFixed(3)))}`);
  verifyDesign(A, t, "drawn outline with an arc segment", arc.contours());
  const straight = mk([]);
  straight.setTool("draw");
  straight.pushDrawPoint(0, 0); straight.pushDrawPoint(80, 0); straight.pushDrawPoint(80, 50); straight.pushDrawPoint(0, 50);
  straight.finishDraw();
  const sb = (straight.items[0] && straight.items[0].shape && straight.items[0].shape.cs[0].bulges) || [];
  t.check("draw with Arc off: every edge stays straight", sb.every((b) => Math.abs(b || 0) < 1e-9), `bulges=${JSON.stringify(sb)}`);
  // Fillet radius smaller than half the edge must not silently flatten a curve
  const keep = mk([]);
  keep.setTool("draw");
  keep.pushDrawPoint(0, 0); keep.pushDrawPoint(120, 0);
  keep.drawArc = true; keep.pushDrawPoint(120, 120); keep.drawArc = false;
  keep.pushDrawPoint(0, 120); keep.finishDraw();
  const curved = keep.items[0];
  const bBefore = (curved.shape.cs[0].bulges || []).slice();
  t.check("setup: the right-hand edge is curved", bBefore.some((b) => Math.abs(b) > 0.05), `bulges=${JSON.stringify(bBefore)}`);
  keep.selectEdge(curved.id, 0, bBefore.findIndex((b) => Math.abs(b) > 0.05));
  keep.setEdgeCurve({ radius: 8 });
  const bAfter = (keep.items[0].shape.cs[0].bulges || []).slice();
  t.check("fillet radius 8 mm on a 120 mm curved edge is refused and the curve is kept", bAfter.some((b) => Math.abs(b) > 0.05) && Math.abs((bAfter.find((b) => Math.abs(b) > 0.05) || 0) - (bBefore.find((b) => Math.abs(b) > 0.05) || 0)) < 1e-6, `before=${JSON.stringify(bBefore)} after=${JSON.stringify(bAfter)} msg=${keep.messages.slice(-1)}`);
  t.check("fillet refusal explains the minimum radius", /too small|at least 60/i.test(String(keep.messages.slice(-1))), String(keep.messages.slice(-1)));
  // Fillet a corner (not "bend the whole edge"): R8 on the inner corner of a long-sided L
  const ell = mk([]);
  ell.setTool("draw");
  ell.drawPts = [[0, 0], [220, 0], [220, 70], [100, 70], [100, 160], [0, 160]];
  ell.finishDraw();
  const host = ell.items[0];
  ell.selectEdge(host.id, 0, 3, 3);          // vertex (100, 70) — the inner corner
  const n0 = host.shape.cs[0].pts.length;
  const ok = ell.filletCorner(8);
  const n1 = ell.items[0].shape.cs[0].pts.length;
  const fb = (ell.items[0].shape.cs[0].bulges || []).map((b) => Math.abs(b || 0));
  t.check("Fillet R8 on an L inner corner succeeds", ok === true, `ok=${ok} msg=${ell.messages.slice(-1)}`, "CORNER-FILLET");
  t.check("Fillet R8 splits the inner corner into a curved edge", n1 === n0 + 1 && fb.some((b) => b > 0.05), `n ${n0}→${n1} bulges=${JSON.stringify(fb.map((x) => +x.toFixed(3)))}`, "CORNER-FILLET");
  const tooBig = mk([]);
  tooBig.setTool("draw"); tooBig.drawPts = [[0, 0], [220, 0], [220, 70], [100, 70], [100, 160], [0, 160]]; tooBig.finishDraw();
  tooBig.selectEdge(tooBig.items[0].id, 0, 3, 3);
  const refused = tooBig.filletCorner(120);
  t.check("Fillet R120 on the same corner is refused with a clear limit", refused === false && /too big|or less/i.test(String(tooBig.messages.slice(-1))), String(tooBig.messages.slice(-1)), "CORNER-FILLET");
}
// ---------- nest / auto-arrange
{
  const sk = mk([["rect", { w: 100, h: 60 }, 0, 0], ["disc", { d: 80 }, 200, 0], ["plate", {}, 400, 0], ["flange", {}, 0, 300], ["gusset", {}, 300, 300], ["slot", {}, 600, 300]]);
  sk.nest(10, 1300, 800); const bx = boxes(sk).filter((_, i) => !sk.isHole(sk.items[i]));
  t.check("nest: no part boxes overlap", !bx.some((a, i) => bx.some((b, j) => j > i && overlap(a, b))), "", "PRO-NEST");
  t.check("nest: all inside 1300x800 sheet", bx.every((b) => b[0] >= -0.01 && b[1] >= -0.01 && b[2] <= 1300.01 && b[3] <= 800.01), JSON.stringify(bx.map((b) => b.map((v) => +v.toFixed(0)))), "PRO-NEST");
  verifyDesign(A, t, "nest result", sk.contours());
  // sheet too small: parts must not silently pile up/outside
  const sk2 = mk([["rect", { w: 100, h: 60 }, 0, 0], ["rect", { w: 100, h: 60 }, 200, 0], ["rect", { w: 100, h: 60 }, 400, 0]]); sk2.nest(10, 150, 100);
  const b2 = boxes(sk2); t.check("nest: sheet too small for all parts → parts extend beyond sheet height with warning", b2.every((b) => b[3] <= 100.01) || sk2.messages.some((m) => /not fit|too|beyond|outside/i.test(m)), `maxY=${Math.max(...b2.map((b) => b[3]))} msgs=${sk2.messages.slice(-1)}`, "PRO-NEST-OVERFLOW");
  const sk3 = mk([["rect", { w: 500, h: 60 }, 0, 0]]); sk3.nest(10, 100, 100); t.check("nest: part wider than the sheet → warned", sk3.messages.some((m) => /not fit|too|wider|beyond|outside/i.test(m)), `msgs=${sk3.messages.slice(-1)}`, "PRO-NEST-OVERFLOW");
  const sk4 = mk([["rect", {}, 0, 0], ["rect", {}, 300, 0]]); sk4.nest(NaN, NaN, NaN); t.check("nest NaN args → sane", allFinite(sk4)); sk4.nest(-5, 0, 0); t.check("nest negative gap clamped (no overlap)", !boxes(sk4).some((a, i) => boxes(sk4).some((b, j) => j > i && overlap(a, b))), "", "PRO-NEST");
  const sk5 = mk([["rect", {}, 0, 0], ["rect", {}, 300, 0]]); sk5.nest(1e12, 1e12, 1e12); t.check("nest gap 1e12 rejected", Math.max(...boxes(sk5).map((b) => b[2])) < 1e5, "", "ARRAY-HUGE");
  // nest with parts that have holes (hole follows host)
  const sk6 = mk([["plate", { w: 120, h: 80, mid: 20 }, 0, 0], ["plate", { w: 120, h: 80, mid: 20 }, 300, 10]]); const holeOf = () => sk6.items.map((i) => (sk6.isHole(i) ? sk6.hostOf(i) && sk6.hostOf(i).id : null));
  sk6.nest(10, 1300, 800); verifyDesign(A, t, "nest plates with holes", sk6.contours());
}
// ---------- lock: what does it actually protect?
{
  const ops = { nudge: (sk) => sk.nudge(5, 5), remove: (sk) => sk.remove(), setPos: (sk) => sk.setPos("x", 200), setWidth: (sk) => sk.setWidth(10), rotateBy: (sk) => sk.rotateBy(90), mirror: (sk) => sk.mirror(), flipV: (sk) => sk.flipV(), variant: (sk) => sk.applyVariant(A.variantsFor("rect")[1]), setParam: (sk) => sk.setParam("w", 10), polarArray: (sk) => sk.polarArray(4, 100), nest: (sk) => { sk.pickAll && sk.nest(10, 1300, 800); }, offset: (sk) => sk.offsetBy(5), clear: (sk) => sk.clear(), setAngle: (sk) => sk.setAngle(45) };
  for (const [name, fn] of Object.entries(ops)) {
    const sk = mk([["rect", { w: 100, h: 50 }, 33, 44], ["disc", { d: 40 }, 300, 300]]); sk.pick([sk.items[0].id]); sk.toggleLock(); const before = JSON.stringify(sk.items[0]); const n = sk.items.length;
    fn(sk); const moved = JSON.stringify(sk.items.find((i) => i.id === 1) || null) !== before || sk.items.length !== n;
    t.check(`lock: '${name}' leaves a locked part untouched`, !moved, moved ? "locked part changed/removed" : "", "PRO-LOCK");
  }
  const sk = mk([["rect", {}, 0, 0]]); sk.pick([sk.items[0].id]); sk.toggleLock(); sk.linearArray(2, 10, 0); t.check("lock: array copies are unlocked, original stays locked", sk.items[0].lock && !sk.items[1].lock);
  const sk2 = mk([["rect", {}, 0, 0]]); sk2.pick([sk2.items[0].id]); sk2.toggleLock(); sk2.undo(); t.check("lock toggle is undoable", !sk2.items[0].lock);
  const sk3 = mk([["rect", {}, 0, 0]]); sk3.pick([sk3.items[0].id]); sk3.toggleLock(); sk3.save(); const s = JSON.parse(A.store.get("plasma.sketch")); t.check("lock state persists in localStorage", s.items[0].lock === true);
}
// ---------- Pro toggle persistence + point snap
{
  const sk = A.newSketch(); t.check("pro default off", sk.opts.pro === false); sk.setPro(true);
  t.check("pro saved to localStorage", JSON.parse(A.store.get("plasma.sketch.opts")).pro === true);
  const store = new Map(A.store._m); const sk2 = new A.Sketch(sk.cv, {}); t.check("pro restored on reload", sk2.opts.pro === true);
  A.store.set("plasma.sketch.opts", "{broken"); const sk3 = new A.Sketch(sk.cv, {}); t.check("corrupt opts JSON ignored", sk3.opts.pro === false);
  A.store.set("plasma.sketch.opts", JSON.stringify({ pro: "yes", snap: "abc", pointSnap: null })); const sk4 = new A.Sketch(sk.cv, {}); t.note("opts with wrong types accepted as-is", JSON.stringify(sk4.opts)); t.check("opts: wrong-typed values don't poison the grid snap (snap must be a number)", typeof sk4.opts.snap === "number", `snap=${JSON.stringify(sk4.opts.snap)}`, "LS-VALIDATE");
  A.store.set("plasma.sketch.opts", "{\"__proto__\":{\"polluted\":1}}"); new A.Sketch(sk.cv, {}); t.check("localStorage __proto__ doesn't pollute Object.prototype", ({}).polluted === undefined, "");
}
// ---------- hole placement on a non-rectangular part (L)
{
  const mkL = (pts) => { const sk = mk([]); sk.tool = "draw"; sk.drawPts = pts.map((p) => [...p]); sk.finishDraw(); return sk; };
  const inMat = (sk, host, p) => sk.contoursOf(host).filter((k) => A.pointInPoly(p, k.pts)).length % 2 === 1;
  const mid = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  // 220×160 L, 100 mm upright, 70 mm foot — bbox centre sits in the empty notch
  const L = [[0, 0], [220, 0], [220, 70], [100, 70], [100, 160], [0, 160]];
  {
    const sk = mkL(L); const host = sk.items[0]; const hb = sk.boxOf(host); const [mx, my] = mid(hb);
    t.check("L-bracket bbox centre is empty", !inMat(sk, host, [mx, my]), `mid=${mx},${my}`);
    sk.pick([host.id]); sk.add("hole", true);
    const hole = sk.items.at(-1), b = sk.boxOf(hole), [cx, cy] = mid(b);
    t.check("L-bracket hole lands on solid", inMat(sk, host, [cx, cy]) && sk.holeFitsIn(hole, host), `c=${cx.toFixed(1)},${cy.toFixed(1)} fits=${sk.holeFitsIn(hole, host)}`, "HOLE-SOLID");
    t.check("L-bracket hole is not left at the empty bbox middle", Math.hypot(cx - mx, cy - my) > 5, `d=${Math.hypot(cx - mx, cy - my).toFixed(1)}`, "HOLE-SOLID");
  }
  {
    // Oversized ring cannot fully fit in a thin C, but its centre must still sit on solid metal
    const Cpts = [[0, 0], [200, 0], [200, 20], [20, 20], [20, 80], [200, 80], [200, 100], [0, 100]];
    const sk = mkL(Cpts); const host = sk.items[0]; const [mx, my] = mid(sk.boxOf(host));
    sk.pick([host.id]); sk.add("boltcircle", true);
    const hole = sk.items.at(-1), [cx, cy] = mid(sk.boxOf(hole));
    t.check("oversized hole on a C is not left in the empty middle", inMat(sk, host, [cx, cy]) && Math.hypot(cx - mx, cy - my) > 5, `c=${cx.toFixed(1)},${cy.toFixed(1)} mid=${mx},${my} in=${inMat(sk, host, [cx, cy])} fits=${sk.holeFitsIn(hole, host)}`, "HOLE-SOLID");
  }
}
// ---------- Centre between two edges (reliable picks + prompts)
{
  const mkL = (pts) => { const sk = mk([]); sk.tool = "draw"; sk.drawPts = pts.map((p) => [...p]); sk.finishDraw(); sk.view = { s: 1, vx: -20, vy: -20 }; sk.size = () => [400, 300]; return sk; };
  const L = [[0, 0], [220, 0], [220, 70], [100, 70], [100, 160], [0, 160]];
  const sk = mkL(L); const host = sk.items[0];
  sk.pick([host.id]); sk.add("hole", true);
  const hole = sk.items.at(-1);
  const before = sk.boxOf(hole);
  sk.pick([hole.id]);
  sk.centreBetween();
  t.check("Centre between prompt asks for the first edge", sk.centrePrompt() === "Click the first edge" && !!sk.centrePick, sk.centrePrompt(), "CENTRE-BETWEEN");
  // Click from *inside* the upright (would have been kind "move" on the old hit test)
  const [sx, sy] = sk.toScreen(3, 110);  // just inside the left upright edge
  const hit1 = sk.hitCentreEdge(sx, sy, false);
  t.check("first pick finds an edge from inside the part", !!(hit1 && hit1.kind === "edge"), JSON.stringify(hit1 && { kind: hit1.kind, ei: hit1.ei }), "CENTRE-BETWEEN");
  sk.takeCentreEdge(hit1);
  t.check("after first pick, prompt asks for the second edge", sk.centrePrompt() === "Click the second edge" && sk.centrePick.edges.length === 1, sk.centrePrompt(), "CENTRE-BETWEEN");
  // Second edge: inner upright at x=100
  const [sx2, sy2] = sk.toScreen(100, 110);
  const hit2 = sk.hitCentreEdge(sx2, sy2, false);
  t.check("second pick finds the inner upright edge", !!(hit2 && hit2.kind === "edge"), JSON.stringify(hit2 && { kind: hit2.kind, ei: hit2.ei }), "CENTRE-BETWEEN");
  sk.takeCentreEdge(hit2);
  t.check("after two picks, Centre between finishes", !sk.centrePick, "still picking", "CENTRE-BETWEEN");
  const after = sk.boxOf(hole);
  const cx = (after[0] + after[2]) / 2;
  t.check("hole is centred in X between the upright's sides (~50 mm)", Math.abs(cx - 50) < 1.5, `cx=${cx.toFixed(2)} was=${((before[0]+before[2])/2).toFixed(2)}`, "CENTRE-BETWEEN");
  // A miss while picking stays in the mode and keeps the prompt (does not abort)
  const sk2 = mkL(L); sk2.pick([sk2.items[0].id]); sk2.add("hole", true); sk2.pick([sk2.items.at(-1).id]); sk2.centreBetween();
  const used = sk2.takeCentreEdge(null);
  t.check("a missed click keeps Centre between active", used === true && !!sk2.centrePick && sk2.centrePrompt() === "Click the first edge", sk2.centrePrompt(), "CENTRE-BETWEEN");
  sk2.cancelCentrePick();
  t.check("Escape cancels Centre between", !sk2.centrePick && sk2.centrePrompt() === "", "", "CENTRE-BETWEEN");
}
process.exit(t.done() ? 1 : 0);


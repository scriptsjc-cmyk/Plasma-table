// Full independent verification of a design -> G-code -> prepared job chain.
import { analyze, area, inPoly, bb, selfCross } from "./analyze.mjs";
const cleanC = (c) => c.pts.map(([x, y]) => [x, y]);
// where a block's closed loop starts: at the pierce (no lead), or after its lead-in of one move (straight / arc) or two moves
// (r15 6.2 spiral for round holes). -1 = the path doesn't close.
const loopStart = (b) => {
  const p = b.pts, e = p[p.length - 1];
  if ([p[0], p[1]].some((q) => q && Math.hypot(q[0] - e[0], q[1] - e[1]) < 0.01)) return Math.hypot(p[0][0] - e[0], p[0][1] - e[1]) < 0.01 ? 0 : 1;   // as before
  const k = b.ends && b.ends[1];                                    // a two-move (spiral) lead-in
  if (k != null && k < p.length - 1 && Math.hypot(p[k][0] - e[0], p[k][1] - e[1]) < 0.01) return k;
  return -1;
};
const loopPts = (b) => b.pts.slice(Math.max(1, loopStart(b)));

export function verifyDesign(A, t, label, contours, { kerf = 1.5, leadIn = 3, cut = A.cutFor(), checkOrder = true } = {}) {
  const id = (s) => `${label}: ${s}`;
  // 0. input sanity: finite
  const flat = contours.flatMap((c) => c.pts.flat());
  if (!t.check(id("input contours finite"), flat.every(Number.isFinite), "NaN/Inf in contour points", "GCODE-NAN")) return null;
  let cam;
  try { cam = A.designToGcode(contours, { kerf, leadIn, name: label }); } catch (e) { t.check(id("designToGcode did not throw"), false, e.message); return null; }
  const an = analyze(cam.gcode.split("\n"));
  t.check(id("raw gcode: no safety violations"), an.violations.length === 0, JSON.stringify(an.violations.slice(0, 3)), "GCODE-SAFETY");
  t.check(id("raw gcode: M3 count == M5 count"), an.m3 === an.m5, `${an.m3} vs ${an.m5}`, "GCODE-SAFETY");
  // 1. prepared job (what is really streamed to the controller)
  let job;
  try { job = A.prepareJob(cam.gcode, cut, A.machine, false); } catch (e) { t.check(id("prepareJob accepted"), false, e.message); return cam; }
  const aj = analyze(job.lines);
  t.check(id("job: no safety violations"), aj.violations.length === 0, JSON.stringify(aj.violations.slice(0, 3)), "GCODE-SAFETY");
  t.check(id("job: torch off at end, M3==M5 (+1 safety M5 allowed)"), aj.m5 >= aj.m3 && aj.m3 === an.m3, `m3=${aj.m3} m5=${aj.m5}`, "GCODE-SAFETY");
  t.check(id("job: ends with M5"), job.lines.filter((l) => !l.startsWith(";")).slice(-2).some((l) => l.trim() === "M5"), job.lines.slice(-3).join("|"), "GCODE-SAFETY");
  t.check(id("job: every M3 preceded by a probe (G38.2) and followed by pierce delay"), (() => {
    let ok = true, etch = null;
    job.lines.forEach((l, i) => {
      if (/PORTA-ETCH PLASMA/i.test(l)) etch = "plasma";
      else if (/PORTA-ETCH SCRIBE/i.test(l)) etch = "scribe";
      else if (/PORTA-ETCH END/i.test(l)) etch = null;
      if (!/^M3\b/.test(l)) return;
      if (!job.lines.slice(Math.max(0, i - 4), i).some((x) => /G38\.2/.test(x))) ok = false;
      // Plasma etch must not use a pierce delay (that would cut through). Ordinary cuts still must.
      if (etch === "plasma") { if (/^G4 P(?!0(?:\.0*)?\b)/.test(job.lines[i + 1] || "")) ok = false; }
      else if (!etch && !/^G4 P/.test(job.lines[i + 1] || "")) ok = false;
    });
    return ok;
  })(), "", "GCODE-SAFETY");
  // 2. bounds (design coordinates after shift must be >= 0 and inside the table)
  const [x0, y0, x1, y1] = an.bounds, tr = A.machine.travel_mm;
  t.check(id("coords >= 0 (shifted to origin)"), x0 >= -1e-6 && y0 >= -1e-6, `min ${x0},${y0}`, "GCODE-BOUNDS");
  const fits = x1 <= tr.x + 1e-6 && y1 <= tr.y + 1e-6;
  t.check(id(`fits table ${tr.x}x${tr.y} OR job warns`), fits || job.warnings.some((w) => /bigger than the table/.test(w)), `max ${x1.toFixed(1)},${y1.toFixed(1)} warnings=${job.warnings.join("|")}`, "GCODE-BOUNDS");
  // 3. closed paths + kerf direction + lead-ins + order, against my own parity analysis of the input
  const closed = contours.filter((c) => c.closed !== false).map((c) => ({ c, pts: cleanC(c).map(([x, y]) => [x + cam.shift[0], y + cam.shift[1]]) })).filter((o) => o.pts.length >= 3 && Math.abs(area(o.pts)) > 0.01);
  for (const o of closed) { o.a = Math.abs(area(o.pts)); o.box = bb(o.pts); o.depth = 0; }
  for (const o of closed) for (const p of closed) if (p !== o && p.a > o.a && inPoly(o.pts[0], p.pts) && inPoly(o.pts[Math.floor(o.pts.length / 2)], p.pts)) o.depth++;
  const material = (pt) => closed.filter((o) => inPoly(pt, o.pts)).length % 2 === 1;
  const blocks = an.blocks;
  t.check(id("every block's path closed (end == start)"), blocks.every((b) => loopStart(b) >= 0),
    blocks.map((b, i) => [i, Math.min(Math.hypot(b.pts[0][0] - b.pts.at(-1)[0], b.pts[0][1] - b.pts.at(-1)[1]), Math.hypot(b.pts[1][0] - b.pts.at(-1)[0], b.pts[1][1] - b.pts.at(-1)[1]))]).filter((x) => x[1] >= 0.01).slice(0, 3).join(" "), "PATH-OPEN");
  const matched = new Map();
  for (const o of closed) {
    const cx = (o.box[0] + o.box[2]) / 2, cy = (o.box[1] + o.box[3]) / 2, w = o.box[2] - o.box[0], h = o.box[3] - o.box[1];
    const cands = blocks.map((b, i) => ({ b, i, bx: bb(loopPts(b)) })).filter(({ bx }) => Math.abs((bx[0] + bx[2]) / 2 - cx) < 0.6 && Math.abs((bx[1] + bx[3]) / 2 - cy) < 0.6 && Math.abs((bx[2] - bx[0]) - w) < kerf + 0.6 && Math.abs((bx[3] - bx[1]) - h) < kerf + 0.6);
    if (!cands.length) { o.dropped = true; continue; }
    const m = cands.sort((p, q) => Math.abs(area(loopPts(p.b)) - o.a) - Math.abs(area(loopPts(q.b)) - o.a))[0];
    matched.set(o, m); o.bi = m.i;
  }
  const dropped = closed.filter((o) => o.dropped);
  t.check(id("every closed contour is cut, or a 'left out' warning is shown"), dropped.length === 0 || cam.warnings.some((w) => /left out|smaller than/.test(w)), `${dropped.length} dropped, warnings=${cam.warnings.join("|")}`, "GCODE-DROP");
  let wrongKerf = 0, leadBad = 0, selfX = 0, cw = 0, ccwBad = 0;
  for (const [o, m] of matched) {
    const pa = area(loopPts(m.b)), isHole = o.depth % 2 === 1;
    const delta = Math.abs(pa) - o.a;
    if (kerf > 0 && Math.abs(delta) > 0.02 * o.a + 0.05) { if (isHole ? delta >= 0 : delta <= 0) wrongKerf++; }
    // direction: part edges clockwise (negative area), holes counter-clockwise (positive)
    if (isHole ? pa <= 0 : pa >= 0) ccwBad++;
    const lead = m.b.lead;
    if (leadIn > 0 && material(lead) && !cam.warnings.some((w) => /too small for a lead-in/.test(w))) leadBad++;
    if (selfCross(m.b.pts)) selfX++;
  }
  t.check(id("kerf offset direction: outer grows / holes shrink"), wrongKerf === 0, `${wrongKerf} wrong`, "KERF-DIR");
  t.check(id("cut direction: outer CW, holes CCW"), ccwBad === 0, `${ccwBad} wrong`, "CUT-DIR");
  t.check(id("lead-in pierce lands in scrap (not inside material)"), leadBad === 0, `${leadBad} inside material`, "LEADIN");
  t.check(id("no self-intersecting cut path (or 'narrower than cut width' warning)"), selfX === 0 || cam.warnings.some((w) => /narrower than the cut width/.test(w)), `${selfX}`, "SELF-X");
  if (checkOrder) {
    let bad = 0;
    for (const [o, m] of matched) for (const [p, q] of matched) if (p !== o && o.depth > p.depth && inPoly(o.pts[0], p.pts) && m.i > q.i) bad++;
    t.check(id("cut order: holes before the outline containing them"), bad === 0, `${bad} out of order`, "ORDER");
  }
  return { cam, job, an, aj };
}

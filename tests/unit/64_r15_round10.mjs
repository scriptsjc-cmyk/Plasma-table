// r15 Round 10 (later / nice to have), the pure logic, written before the code:
//   10.7 typed sizes for Rectangle / Circle ("120 × 80", "Ø40", "R20")
//   10.2 the distance between two parts while one is dragged
//   10.5 "as many as fit on the sheet"
//   10.4 numbered copies in text ("TAG 001–050")
//   10.3 copy along a path, and holes along a curved edge
//   10.6 DXF layers and blocks (cut / etch / drill)
//   10.8 inch units: typed values accept in / " / mm / cm, and lengths can be shown in inches (G-code stays mm)
import "../lib/env.mjs";
import { T } from "../lib/t.mjs";
import { mod } from "../lib/site.mjs";

const t = new T("64_r15_round10");
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---------------------------------------------------------------- 10.7 typed sizes
{
  const { parseTypedSize } = await mod("typedsize");
  const r = (s) => JSON.stringify(parseTypedSize("rect", s));
  t.check("10.7 '120 × 80', '120x80', '120*80', '120 by 80' and '120,80' are 120 by 80",
    ["120 × 80", "120x80", "120 X 80", "120*80", "120 by 80", "120, 80"].every((s) => r(s) === '{"w":120,"h":80}'), ["120 × 80", "120x80", "120*80"].map(r).join(" "));
  t.check("10.7 decimals work ('50.5 x 20.25')", r("50.5 x 20.25") === '{"w":50.5,"h":20.25}', r("50.5 x 20.25"));
  t.check("10.7 one number on a rectangle is a square", r("60") === '{"w":60,"h":60}', r("60"));
  t.check("10.7 rubbish, zero or negative sizes are refused", ["", "abc", "0 x 10", "10 x", "x 10", "-5 x 10", "10 x 10 x 10"].every((s) => parseTypedSize("rect", s) === null));
  const d = (s) => (parseTypedSize("disc", s) || {}).d;
  t.check("10.7 'Ø40', 'ø40', 'D40', 'dia 40' and '40' are a 40 mm circle", ["Ø40", "ø 40", "D40", "dia 40", "40"].every((s) => d(s) === 40), ["Ø40", "D40", "40"].map(d).join(","));
  t.check("10.7 'R20' and 'r 20' are a radius (40 mm across)", d("R20") === 40 && d("r 20") === 40, d("R20"));
  t.check("10.7 a circle refuses rubbish and zero", parseTypedSize("disc", "Øx") === null && parseTypedSize("disc", "0") === null && parseTypedSize("disc", "10 x 20") === null);
  t.check("10.7 inches can be typed too ('2in x 1in', 'Ø1\"')", r('2in x 1in') === '{"w":50.8,"h":25.4}' && near(d('Ø1"'), 25.4), r("2in x 1in") + " " + d('Ø1"'));
}

// ---------------------------------------------------------------- 10.2 distance between parts
{
  const { minGap } = await mod("partgap");
  const sq = (x, y, s) => [{ pts: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], closed: true }];
  const g = minGap(sq(0, 0, 10), sq(25, 0, 10));
  t.check("10.2 two squares 15 mm apart read 15 mm, with the two nearest points", g && near(g.d, 15) && near(g.a[0], 10) && near(g.b[0], 25), JSON.stringify(g));
  const diag = minGap(sq(0, 0, 10), sq(13, 14, 10));
  t.check("10.2 corner to corner is the straight-line distance (5 mm)", diag && near(diag.d, 5), JSON.stringify(diag));
  const ov = minGap(sq(0, 0, 10), sq(5, 5, 10));
  t.check("10.2 overlapping parts read 0 and say so", ov && ov.d === 0 && ov.overlap === true, JSON.stringify(ov));
  const inside = minGap(sq(0, 0, 100), sq(40, 40, 10));
  t.check("10.2 a part inside another (no edge crossing) is overlapping too", inside && inside.overlap === true, JSON.stringify(inside));
  t.check("10.2 nothing to measure against is null", minGap(sq(0, 0, 10), []) === null);
  const far = minGap(sq(0, 0, 10), sq(1000, 0, 10), 200);
  t.check("10.2 parts further than the limit are not measured", far === null, JSON.stringify(far));
  const open = minGap(sq(0, 0, 10), [{ pts: [[20, -5], [20, 50]], closed: false }]);
  t.check("10.2 an open line (etch) is measured to its nearest point", open && near(open.d, 10), JSON.stringify(open));
}

// ---------------------------------------------------------------- 10.5 as many as fit
{
  const { fitGrid } = await mod("arrayfit");
  const f = fitGrid({ x0: 0, y0: 0, w: 100, h: 50, gap: 10, sheetW: 1000, sheetH: 500 });
  t.check("10.5 100 × 50 parts, 10 mm gap, on a 1000 × 500 sheet: 9 across, 8 up = 72", f.cols === 9 && f.rows === 8 && f.n === 72, JSON.stringify(f));
  const g = fitGrid({ x0: 200, y0: 100, w: 100, h: 50, gap: 10, sheetW: 1000, sheetH: 500 });
  t.check("10.5 starting part-way across the sheet only fills what is left (7 × 6: 800 mm left fits 7 at 110)", g.cols === 7 && g.rows === 6, JSON.stringify(g));
  const one = fitGrid({ x0: 0, y0: 0, w: 900, h: 450, gap: 10, sheetW: 1000, sheetH: 500 });
  t.check("10.5 a part that only fits once is 1 (nothing to copy)", one.n === 1, JSON.stringify(one));
  const none = fitGrid({ x0: 0, y0: 0, w: 1200, h: 50, gap: 10, sheetW: 1000, sheetH: 500 });
  t.check("10.5 a part bigger than the sheet is 0", none.n === 0, JSON.stringify(none));
  const cap = fitGrid({ x0: 0, y0: 0, w: 5, h: 5, gap: 1, sheetW: 3000, sheetH: 3000, max: 500 });
  t.check("10.5 tiny parts stop at the limit and say they were limited", cap.n <= 500 && cap.limited === true, JSON.stringify(cap));
  const m = fitGrid({ x0: 0, y0: 0, w: 100, h: 50, gap: 10, sheetW: 1000, sheetH: 500, margin: 20 });
  t.check("10.5 a sheet margin is kept clear (start inside it, stop before it)", m.x0 === 20 && m.y0 === 20 && 20 + m.cols * 110 - 10 <= 980 && 20 + m.rows * 60 - 10 <= 480, JSON.stringify(m));
}

// ---------------------------------------------------------------- 10.4 numbered copies
{
  const { expandNumbered } = await mod("numbered");
  const a = expandNumbered("TAG 001–050");
  t.check("10.4 'TAG 001–050' is 50 labels, TAG 001 … TAG 050", a && a.length === 50 && a[0] === "TAG 001" && a[49] === "TAG 050" && a[9] === "TAG 010", a && a.slice(0, 3).join("|"));
  const b = expandNumbered("Bay 7-9 left");
  t.check("10.4 a plain hyphen and text after the range work ('Bay 7-9 left')", JSON.stringify(b) === '["Bay 7 left","Bay 8 left","Bay 9 left"]', JSON.stringify(b));
  const c = expandNumbered("No 12–10");
  t.check("10.4 a range can count down", JSON.stringify(c) === '["No 12","No 11","No 10"]', JSON.stringify(c));
  t.check("10.4 text with no range is not numbered (null)", expandNumbered("HELLO") === null && expandNumbered("M8 x 20") === null);
  t.check("10.4 a single number is not a range", expandNumbered("TAG 5") === null);
  const big = expandNumbered("T 1-5000");
  t.check("10.4 a huge range is refused with a reason", big && big.error && /200/.test(big.error), JSON.stringify(big).slice(0, 80));
  const two = expandNumbered("A1-2 B 01–03");
  t.check("10.4 only the last range counts up (A1-2 stays as typed)", two && two.length === 3 && two[0] === "A1-2 B 01" && two[2] === "A1-2 B 03", JSON.stringify(two));
}

// ---------------------------------------------------------------- 10.3 along a path, holes along a curve
{
  const { pointsAlongPath } = await mod("alongpath");
  const line = pointsAlongPath([[0, 0], [100, 0]], false, 5);
  t.check("10.3 5 copies on an open 100 mm line: both ends included, 25 mm apart", line.length === 5 && near(line[0].x, 0) && near(line[4].x, 100) && near(line[1].x, 25), JSON.stringify(line.map((p) => p.x)));
  t.check("10.3 each point has the path direction (0° along +X)", line.every((p) => near(p.angle, 0)), JSON.stringify(line.map((p) => p.angle)));
  const sq = pointsAlongPath([[0, 0], [100, 0], [100, 100], [0, 100]], true, 8);
  t.check("10.3 a closed outline shares them out evenly with no doubled point at the start (8 on a 400 mm square = 50 mm)", sq.length === 8 && near(sq[1].x, 50) && near(sq[2].x, 100) && near(sq[2].y, 0) && near(sq[3].y, 50), JSON.stringify(sq.map((p) => [p.x, p.y])));
  t.check("10.3 turning a corner gives the new direction (90° up the right side)", near(sq[3].angle, 90), sq[3].angle);
  t.check("10.3 fewer than 1 copy or a path with no length gives nothing", pointsAlongPath([[0, 0], [0, 0]], false, 3).length === 0 && pointsAlongPath([[0, 0], [10, 0]], false, 0).length === 0);

  const PF = await mod("part-features");
  t.check("10.3 'Holes along a curve' is a hole feature", PF.FEATURE_KINDS.arc && PF.isHoleFeature({ k: "arc" }));
  const f = PF.sanitizeFeature({ id: 1, k: "arc", x: 50, y: 0, n: 5, d: 6, r: 40, a0: 0, a1: 180 });
  const cs = PF.holeCentres(f);
  t.check("10.3 5 holes on a half circle R40: both ends and the top, all 40 from the centre", cs.length === 5 && near(cs[0][0], 90) && near(cs[0][1], 0) && near(cs[2][0], 50) && near(cs[2][1], 40) && near(cs[4][0], 10) && cs.every(([x, y]) => near(Math.hypot(x - 50, y), 40)), JSON.stringify(cs));
  const full = PF.holeCentres(PF.sanitizeFeature({ id: 2, k: "arc", x: 0, y: 0, n: 4, d: 6, r: 40, a0: 0, a1: 360 }));
  t.check("10.3 a full circle shares the holes out with no doubled hole (4 at 90°)", full.length === 4 && near(full[1][0], 0) && near(full[1][1], 40), JSON.stringify(full));
  const fc = PF.featureContours(f);
  t.check("10.3 each hole is a true circle (cut as an arc)", fc.length === 5 && fc.every((c) => c.circle && near(c.circle.r, 3)), fc.length);
  // a D shape: straight bottom 0..100, half-circle top of radius 50 round (50, 0), flattened as the editor sees it
  const D = [[0, 0], [100, 0]];
  for (let i = 1; i < 36; i++) { const a = (Math.PI * i) / 36; D.push([50 + 50 * Math.cos(a), 50 * Math.sin(a)]); }
  const fit = PF.fitArcToOutline(D, 6);
  t.check("10.3 added to a D shape, the holes follow its curved edge (centre 50,0, radius 50 - inset, 0..180°)", fit && near(fit.x, 50, 0.5) && near(fit.y, 0, 0.5) && near(fit.r, 50 - fit.inset, 0.5) && fit.inset >= 6 && near(fit.a0, 0, 6) && near(fit.a1, 180, 6), JSON.stringify(fit));
  const sqOut = PF.fitArcToOutline([[0, 0], [100, 0], [100, 50], [0, 50]], 6);
  t.check("10.3 an outline with no curved edge gives null (the row keeps its plain defaults)", sqOut === null, JSON.stringify(sqOut));
}

// ---------------------------------------------------------------- 10.6 DXF layers and blocks
{
  const { parseDXF, layerOp } = await mod("dxf");
  t.check("10.6 layer names: etch / mark / score / engrave are etched; drill / punch are drill marks; anything else is cut",
    layerOp("ETCH") === "score" && layerOp("Mark-lines") === "score" && layerOp("score") === "score" && layerOp("Engrave") === "score" &&
    layerOp("DRILL") === "drill" && layerOp("punch marks") === "drill" && layerOp("0") === "cut" && layerOp("Outline") === "cut" && layerOp("") === "cut");
  const dxf = (body, blocks = "") => ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
    ...(blocks ? ["0", "SECTION", "2", "BLOCKS", ...blocks, "0", "ENDSEC"] : []),
    "0", "SECTION", "2", "ENTITIES", ...body, "0", "ENDSEC", "0", "EOF"].join("\n");
  const sqPoly = (layer, x, y, s) => ["0", "LWPOLYLINE", "8", layer, "90", "4", "70", "1", "10", x, "20", y, "10", x + s, "20", y, "10", x + s, "20", y + s, "10", x, "20", y + s];
  const circle = (layer, x, y, r) => ["0", "CIRCLE", "8", layer, "10", x, "20", y, "40", r];
  const line = (layer, x1, y1, x2, y2) => ["0", "LINE", "8", layer, "10", x1, "20", y1, "11", x2, "21", y2];
  const plain = parseDXF(dxf([...sqPoly("0", 0, 0, 100), ...circle("0", 50, 50, 10)]));
  t.check("10.6 layer 0 drawings are read exactly as before (no op, no layer tag)", plain.contours.length === 2 && plain.contours.every((c) => !("op" in c) && !("layer" in c)), JSON.stringify(plain.contours.map((c) => Object.keys(c))));
  const lay = parseDXF(dxf([...sqPoly("CUT", 0, 0, 100), ...line("ETCH", 10, 10, 90, 10), ...circle("DRILL", 50, 50, 4)]));
  const etch = lay.contours.filter((c) => c.op === "score"), drill = lay.contours.filter((c) => c.role === "drill"), cut = lay.contours.filter((c) => !c.op);
  t.check("10.6 an ETCH layer line is etched, not cut", etch.length === 1 && etch[0].closed === false && etch[0].layer === "ETCH", JSON.stringify(etch));
  t.check("10.6 a DRILL layer circle becomes a drill mark (a cross at its centre), not a cut hole", drill.length === 2 && drill.every((c) => c.op === "mark" && c.closed === false) && !lay.contours.some((c) => c.circle && c.layer === "DRILL"), JSON.stringify(drill).slice(0, 200));
  t.check("10.6 a CUT layer outline is still cut, and keeps its layer name", cut.length === 1 && cut[0].layer === "CUT", JSON.stringify(cut.map((c) => c.layer)));
  t.check("10.6 the layers are listed with what each does", Array.isArray(lay.layers) && lay.layers.some((l) => l.name === "ETCH" && l.op === "score") && lay.layers.some((l) => l.name === "DRILL" && l.op === "drill"), JSON.stringify(lay.layers));
  // a block "TAB" (a 10 mm square) inserted twice: at (100, 0) and at (200, 0) scaled 2 and turned 90°
  const blocks = ["0", "BLOCK", "8", "0", "2", "TAB", "70", "0", "10", "0", "20", "0", ...sqPoly("0", 0, 0, 10), ...circle("0", 5, 5, 2), "0", "ENDBLK"];
  const ins = (x, y, s, rot, layer = "0") => ["0", "INSERT", "8", layer, "2", "TAB", "10", x, "20", y, "41", s, "42", s, "50", rot];
  const b = parseDXF(dxf([...ins(100, 0, 1, 0), ...ins(200, 0, 2, 90)], blocks));
  const boxes = b.contours.filter((c) => !c.circle).map((c) => { const xs = c.pts.map((p) => p[0]), ys = c.pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 1000) / 1000); });
  t.check("10.6 blocks are drawn where they are inserted (not skipped)", b.contours.length === 4 && !b.warnings.some((w) => /INSERT/.test(w)), JSON.stringify(b.warnings) + " " + b.contours.length);
  t.check("10.6 an insert's scale and turn are applied (2× and 90° about the insert point)", JSON.stringify(boxes) === JSON.stringify([[100, 0, 110, 10], [180, 0, 200, 20]]), JSON.stringify(boxes));
  const circ = b.contours.filter((c) => c.circle);
  t.check("10.6 a block's circle stays a true circle, scaled", circ.length === 2 && near(circ[0].circle.r, 2) && near(circ[1].circle.r, 4) && near(circ[1].circle.cx, 190) && near(circ[1].circle.cy, 10), JSON.stringify(circ.map((c) => c.circle)));
  t.check("10.6 a block keeps its name on what it drew", b.contours.every((c) => c.block === "TAB"), JSON.stringify(b.contours.map((c) => c.block)));
  const eb = parseDXF(dxf([...ins(0, 0, 1, 0, "ETCH")], blocks));
  t.check("10.6 a block on layer 0 inserted on the ETCH layer is etched (it takes the insert's layer)", eb.contours.length && eb.contours.every((c) => c.op === "score" || c.role === "drill"), JSON.stringify(eb.contours.map((c) => c.op)));
  const loop = parseDXF(dxf([...ins(0, 0, 1, 0)], ["0", "BLOCK", "2", "TAB", "10", "0", "20", "0", "0", "INSERT", "2", "TAB", "10", "1", "20", "1", "0", "ENDBLK"]));
  t.check("10.6 a block that inserts itself is stopped with a warning (no endless loop)", loop.warnings.some((w) => /block/i.test(w)), JSON.stringify(loop.warnings));
}

// ---------------------------------------------------------------- 10.8 inch units
{
  const { evalExpr } = await mod("expr");
  t.check("10.8 typed lengths accept units: 2in, 2\", 50mm, 5cm", near(evalExpr("2in"), 50.8) && near(evalExpr('2"'), 50.8) && evalExpr("50mm") === 50 && evalExpr("5cm") === 50, [evalExpr("2in"), evalExpr('2"'), evalExpr("50mm"), evalExpr("5cm")].join(","));
  t.check("10.8 units mix inside a sum (1in + 4.6 = 30)", near(evalExpr("1in+4.6"), 30) && near(evalExpr("1 in"), 25.4), evalExpr("1in+4.6"));
  t.check("10.8 plain numbers and old expressions are unchanged", evalExpr("100/2") === 50 && evalExpr("50+12.5") === 62.5 && evalExpr("12,5") === 12.5 && Number.isNaN(evalExpr("1 2")));
  t.check("10.8 a unit on its own, or a made-up unit, is not a number", [ "in", "mm", "2ft", "2inch2", "2 in in" ].every((s) => Number.isNaN(evalExpr(s))), ["in", "2ft"].map(evalExpr).join(","));
  const U = await mod("units");
  t.check("10.8 lengths show in mm by default, in inches when picked", U.fmtLen(50.8) === "50.8 mm" && U.fmtLen(50.8, "in") === "2.00 in" && U.fmtLen(25.4 * 1.234, "in") === "1.23 in", U.fmtLen(50.8, "in"));
  t.check("10.8 the existing display-units choice (mm / inch) is read; anything else is mm", U.unitsFrom({}) === "mm" && U.unitsFrom({ units: "inch" }) === "in" && U.unitsFrom({ units: "in" }) === "in" && U.unitsFrom({ units: "furlong" }) === "mm");
}

process.exit(t.done() ? 1 : 0);

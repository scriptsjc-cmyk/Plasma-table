// Stage 5 (C29–C34, skipping C32): trim / extend / break, 3-point and tangent arcs,
// spline + point list, true-arc fit through Join / Offset / CAM, drawing DXF / SVG export.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { detectCircle } from "../../js/core/geom.js";
import { designToGcode } from "../../js/cut/cam.js";
import {
  fitArcs, fitContour, arcThrough3, tangentArcFrom, edgeEdgeHits,
  parsePointList, splineToContour, contoursToDxf, contoursToSvg, hasTrueArc,
} from "../../js/core/arcs.js";
import { DEFAULT_TOOL_IDS, toolInfo, KNOWN_TOOLS } from "../../js/make/toolbarcustom.js";

const A = await load();
const t = new T("26_cad_c29_c34");
const mk = (specs) => {
  const sk = A.newSketch();
  for (const [type, p, x, y] of specs) { sk.add(type, true); const it = sk.items.at(-1); Object.assign(it.p, p); it.x = x; it.y = y; }
  sk.opts.pro = true;
  return sk;
};
function roundedRect(w, h, r, step = 8) {
  const pts = [], corners = [[w - r, r, -Math.PI / 2, 0], [w - r, h - r, 0, Math.PI / 2], [r, h - r, Math.PI / 2, Math.PI], [r, r, Math.PI, 3 * Math.PI / 2]];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= step; i++) {
      const a = a0 + (a1 - a0) * i / step;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

// ---- C33 fitArcs: rectangles stay lines; rounded corners become 90° bulges ----
{
  const fr = fitArcs([[0, 0], [80, 0], [80, 50], [0, 50]], true);
  t.check("C33: a rectangle keeps four corners and no arcs", fr.pts.length === 4 && fr.bulges.every((b) => Math.abs(b) < 1e-6), `pts=${fr.pts.length} bulges=${fr.bulges}`, "C33-FIT");
  const q = [];
  for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI / 2; q.push([40 + 30 * Math.cos(a), 10 + 30 * Math.sin(a)]); }
  const fq = fitArcs(q, false);
  t.check("C33: a tessellated quarter-circle becomes one arc", fq.pts.length === 2 && Math.abs(Math.abs(fq.bulges[0]) - 0.41421356) < 0.02, `pts=${fq.pts.length} b=${fq.bulges[0]}`, "C33-FIT");
  const frr = fitContour({ pts: roundedRect(80, 50, 8), closed: true });
  const arcs = (frr.bulges || []).filter((b) => Math.abs(b) > 1e-6);
  t.check("C33: a rounded rectangle fits four quarter-arcs and four lines", frr.pts.length === 8 && arcs.length === 4 && arcs.every((b) => Math.abs(Math.abs(b) - 0.4142) < 0.03), `pts=${frr.pts.length} arcs=${arcs.length} ${arcs}`, "C33-FIT");
}

// ---- C33 Join and Offset store fitted bulges / keep circles ----
{
  const sk = mk([["rect", { w: 80, h: 50 }, 0, 0], ["rect", { w: 80, h: 50 }, 60, 0]]);
  sk.pick(sk.items.map((i) => i.id));
  sk.join();
  const joined = sk.items[0];
  t.check("C33: two overlapping rectangles join into one custom", joined && joined.type === "custom", `type=${joined && joined.type} n=${sk.items.length}`, "C33-JOIN");
  const jc = joined.shape.cs[0];
  const jArcs = (jc.bulges || []).filter((b) => Math.abs(b) > 1e-6);
  t.check("C33: the joined rectangle has no invented arcs", jArcs.length === 0, `bulges=${jc.bulges}`, "C33-JOIN");

  const disc = mk([["disc", { d: 80 }, 0, 0]]);
  disc.pick([disc.items[0].id]);
  disc.offsetBy(5);
  const off = disc.items[0];
  const offCs = disc.contoursOf(off)[0];
  const offR = offCs && offCs.circle && offCs.circle.r;
  t.check("C33: offset of a circle stays a circle (diameter 90)", off.type === "custom" && offR != null && Math.abs(offR * 2 - 90) < 0.2, `type=${off.type} r=${offR} d=${off.p && off.p.d}`, "C33-OFFSET");

  const customR = A.newSketch();
  customR.opts.pro = true;
  customR.importParts([{ cs: [fitContour({ pts: roundedRect(80, 50, 8), closed: true })], x: 0, y: 0 }]);
  customR.pick([customR.items[0].id]);
  customR.offsetBy(3);
  const oc = customR.items[0].shape.cs[0];
  const oArcs = (oc.bulges || []).filter((b) => Math.abs(b) > 1e-6);
  const oCirc = !!(oc.circle && oc.circle.r);
  t.check("C33: offset of a rounded rectangle keeps true arcs or a circle", oArcs.length >= 4 || oCirc, `arcs=${oArcs.length} circle=${oCirc} pts=${oc.pts.length}`, "C33-OFFSET");
}

// ---- C33 CAM emits G2/G3 on rounded paths; rectangles stay G1; kerf is unchanged ----
{
  const rr = roundedRect(80, 50, 8);
  const g = designToGcode([{ pts: rr, closed: true }], { kerf: 1.5, leadIn: 3, name: "rr" });
  const text = g.gcode || "";
  const nArc = ((text.match(/\bG2\b/g) || []).length) + ((text.match(/\bG3\b/g) || []).length);
  t.check("C33: CAM of a rounded rectangle emits G2/G3", nArc >= 4, `arcs=${nArc}\n${text.slice(0, 400)}`, "C33-CAM");
  const sharp = designToGcode([{ pts: [[0, 0], [80, 0], [80, 50], [0, 50]], closed: true }], { kerf: 0, leadIn: 3, name: "rect0" });
  const sText = sharp.gcode || "";
  const sArcs = (sText.match(/\bG2\b/g) || []).length + (sText.match(/\bG3\b/g) || []).length;
  t.check("C33: CAM of a sharp rectangle with no kerf does not invent arcs", sArcs === 0, `arcs=${sArcs}`, "C33-CAM");
  const rect = designToGcode([{ pts: [[0, 0], [80, 0], [80, 50], [0, 50]], closed: true }], { kerf: 1.5, leadIn: 3, name: "rect" });
  const rText = rect.gcode || "";
  const xs = [...rText.matchAll(/\bX(-?\d+\.?\d*)/g)].map((m) => Number(m[1]));
  const ys = [...rText.matchAll(/\bY(-?\d+\.?\d*)/g)].map((m) => Number(m[1]));
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  // Outside kerf of 1.5 mm makes the path ~81.5 plus a few mm of lead-in.
  t.check("C33: rectangle cut span is about 80+kerf (plus lead-in)", spanX > 81 && spanX < 90 && spanY > 51 && spanY < 60, `span=${spanX.toFixed(2)}x${spanY.toFixed(2)}`, "C33-CAM");
}

// ---- C29 trim / extend / break ----
{
  const sk = A.newSketch();
  sk.opts.pro = true;
  // Horizontal open line 0,10–40,10 and a vertical 20,0–20,30, crossing at 20,10.
  sk.addCustomWorld([
    { pts: [[0, 10], [40, 10]], closed: false, bulges: [0] },
    { pts: [[20, 0], [20, 30]], closed: false, bulges: [0] },
  ]);
  t.check("C29: two open lines are on the drawing", sk.items.length >= 1 && sk.worldCs(sk.items[0]).length === 2, `n=${sk.items.length} cs=${sk.items[0] && sk.worldCs(sk.items[0]).length}`, "C29-TRIM");
  const cross = edgeEdgeHits([0, 10], [40, 10], 0, [20, 0], [20, 30], 0);
  t.check("C29: the two lines intersect at the mid-point", cross.length && Math.abs(cross[0].p[0] - 20) < 1e-6 && Math.abs(cross[0].p[1] - 10) < 1e-6, JSON.stringify(cross[0]), "C29-TRIM");
  sk.trimMode = "trim";
  const okTrim = sk.applyTrimAt(10, 10);
  t.check("C29: trim of the left piece succeeds", okTrim, `msg=${sk.messages && sk.messages.slice(-1)}`, "C29-TRIM");
  const horiz = sk.items.find((it) => {
    const c = it.shape && it.shape.cs && it.shape.cs[0];
    if (!c || c.pts.length < 2) return false;
    const ys = c.pts.map((p) => p[1] + it.y);
    return ys.every((y) => Math.abs(y - 10) < 0.6);
  });
  const hpts = horiz ? horiz.shape.cs[0].pts.map((p) => [p[0] + horiz.x, p[1] + horiz.y]) : [];
  const minX = hpts.length ? Math.min(...hpts.map((p) => p[0])) : -1;
  t.check("C29: the left piece is gone; the line now starts at the intersection", horiz && Math.abs(minX - 20) < 0.6, `minX=${minX} pts=${JSON.stringify(hpts)}`, "C29-TRIM");
}
{
  const sk = A.newSketch();
  sk.opts.pro = true;
  sk.addCustomWorld([{ pts: [[0, 0], [20, 0]], closed: false, bulges: [0] }]);
  sk.addCustomWorld([{ pts: [[40, -10], [40, 10]], closed: false, bulges: [0] }]);
  sk.trimMode = "extend";
  // Click near the right end of the short line so it grows to x=40 (world).
  const okExt = sk.applyTrimAt(20, 0);
  t.check("C29: extend reaches the next line", okExt, `msg=${sk.messages && sk.messages.slice(-1)}`, "C29-EXT");
  const c = sk.items[0].shape.cs[0];
  const xs = c.pts.map((p) => p[0] + sk.items[0].x);
  t.check("C29: the open end now meets x=40", Math.max(...xs) > 39, `xs=${xs}`, "C29-EXT");
}
{
  const sk = mk([["rect", { w: 80, h: 50 }, 0, 0]]);
  sk.pick([sk.items[0].id]);
  sk.toEditableCustom(sk.items[0]);
  sk.trimMode = "break";
  const it = sk.items[0];
  const okBr = sk.applyTrimAt(it.x + 40, it.y); // mid of bottom edge
  t.check("C29: break opens a closed rectangle", okBr && it.shape.cs[0].closed === false, `ok=${okBr} closed=${it.shape && it.shape.cs[0].closed} msg=${sk.messages && sk.messages.slice(-1)}`, "C29-BREAK");
}

// ---- C30 3-point arc, tangent arc ----
{
  const a = arcThrough3([0, 0], [10, 10], [20, 0]);
  t.check("C30: 3-point arc through a semicircle has bulge 1 and r 10", a && Math.abs(a.bulge - 1) < 0.02 && Math.abs(a.circle.r - 10) < 0.05, JSON.stringify(a), "C30-ARC");
  const sk = A.newSketch();
  sk.opts.pro = true;
  sk.drawPts = [[0, 0], [10, 10], [20, 0]];
  t.check("C30: finishArc3 adds an open custom arc", sk.finishArc3() && sk.items.length === 1 && Math.abs(sk.items[0].shape.cs[0].bulges[0] - 1) < 0.05, `n=${sk.items.length} b=${sk.items[0] && sk.items[0].shape.cs[0].bulges}`, "C30-ARC");
  const tan = tangentArcFrom([0, 0], [1, 0], [20, 20]);
  t.check("C30: tangent-from-horizontal through (20,20) has radius 20", tan && Math.abs(tan.circle.r - 20) < 0.05, JSON.stringify(tan), "C30-ARC");
}

// ---- C31 spline + CSV / polar list ----
{
  const csv = parsePointList("0,0\n10,5\n20,0\n30,8", "xy");
  t.check("C31: x,y CSV parses four points", csv.ok && csv.pts.length === 4 && csv.pts[1][0] === 10, JSON.stringify(csv), "C31-SPLINE");
  const polar = parsePointList("20,0\n20,90\n20,180", "polar");
  t.check("C31: r,θ list becomes cartesian points", polar.ok && polar.pts.length === 3 && Math.abs(polar.pts[1][1] - 20) < 1e-6, JSON.stringify(polar.pts), "C31-SPLINE");
  const sp = splineToContour([[0, 0], [20, 15], [40, 0], [60, 20]], false);
  t.check("C31: a spline is fitted to an editable open contour", sp && sp.pts.length >= 2 && sp.closed === false, `pts=${sp && sp.pts.length} closed=${sp && sp.closed}`, "C31-SPLINE");
  const sk = A.newSketch();
  sk.opts.pro = true;
  t.check("C31: addPointsContour builds a part from the list", sk.addPointsContour("0,0\n25,12\n50,0", "xy", false) && sk.items.length === 1, `n=${sk.items.length} msg=${sk.messages && sk.messages.slice(-1)}`, "C31-SPLINE");
}

// ---- C34 DXF R12 + SVG keep arcs ----
{
  const c = fitContour({ pts: roundedRect(80, 50, 8), closed: true });
  t.check("C34: fitted drawing has true arcs", hasTrueArc([c]), "no arcs", "C34-EXPORT");
  const dxf = contoursToDxf([c]);
  t.check("C34: DXF is R12 (AC1009) with POLYLINE bulges", dxf.includes("AC1009") && dxf.includes("POLYLINE") && dxf.includes("\n42\n"), dxf.slice(0, 400), "C34-EXPORT");
  const svg = contoursToSvg([c]);
  t.check("C34: SVG path uses arc commands", /\sA\s/.test(svg) && svg.includes("<svg"), svg.slice(0, 400), "C34-EXPORT");
  const circ = contoursToDxf([{ pts: [[0, 0]], closed: true, circle: { cx: 40, cy: 40, r: 20 } }]);
  t.check("C34: a full circle is a DXF CIRCLE", circ.includes("CIRCLE") && circ.includes("40"), circ.slice(0, 300), "C34-EXPORT");
}

// Tools are in the catalogue; the important ones are on the default rail.
{
  for (const id of ["trim", "extend", "break", "arc3", "arctan", "spline", "curvepoints", "maketan", "makeconc"]) {
    t.check(`C29–C31: ${id} is in the tool catalogue`, KNOWN_TOOLS.has(id) && !!toolInfo(id), `missing ${id}`, "C29-UI");
  }
  t.check("C29: Trim, Extend, Break are on the default rail", ["trim", "extend", "break"].every((id) => DEFAULT_TOOL_IDS.includes(id)), DEFAULT_TOOL_IDS.join(","), "C29-UI");
  t.check("C30/C31: 3-point arc and spline are on the default rail", DEFAULT_TOOL_IDS.includes("arc3") && DEFAULT_TOOL_IDS.includes("spline"), DEFAULT_TOOL_IDS.join(","), "C30-UI");
}

if (typeof process !== "undefined") process.exit(t.done() ? 1 : 0);

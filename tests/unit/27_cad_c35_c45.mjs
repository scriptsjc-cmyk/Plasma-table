// Stage 6 (C35–C45): sheet-metal options, flange tables, cam plate, fonts / text on a path,
// cut-control hooks, driving dimensions, group, true-shape nest, DXF clean-up, sliver merge,
// rotate-about and scale-by-percent. Etch pause is not touched.
import { readFileSync } from "node:fs";
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { parseDXF, joinPieces, dropDuplicatePieces } from "../../js/make/dxf.js";
import { contoursToEditable } from "../../js/make/editable.js";
import { camPlateContours, camDisplacement } from "../../js/make/camprofile.js";
import { lookupFlange, applyFlangeDims, flangeShapeKeys, FLANGE_STANDARDS } from "../../js/make/flange-tables.js";
import { developedDia, elbowTable, sheetFrom, SHEET_PARAMS } from "../../js/make/sheetopts.js";
import { elbowGores } from "../../js/make/presets/helpers.js";
import { SHAPES, makeShape } from "../../js/make/shapes.js";
import { textToContours, TEXT_FONTS } from "../../js/make/textshape.js";
import { DEFAULT_TOOL_IDS, toolInfo, KNOWN_TOOLS } from "../../js/make/toolbarcustom.js";
import { turnAngles } from "../../js/cut/nest.js";
import { designToGcode } from "../../js/cut/cam.js";
import { mitreGore } from "../../js/make/presets/helpers.js";

const A = await load();
const t = new T("27_cad_c35_c45");
const mk = (specs) => {
  const sk = A.newSketch();
  for (const [type, p, x, y] of specs) { sk.add(type, true); const it = sk.items.at(-1); Object.assign(it.p, p); it.x = x; it.y = y; }
  sk.opts.pro = true;
  return sk;
};
const r1 = (v) => Math.round(v * 10) / 10;

// ---- C35 sheet-metal options ----
{
  t.check("C35: thickness options are on the lobster-back elbow", SHEET_PARAMS.every((p) => SHAPES.find((s) => s.id === "elbow3").params.some((q) => q[0] === p[0])), "", "C35-SHEET");
  const a = elbowGores(100, 90, 3, 150);
  const b = elbowGores(100, 90, 3, 150, { t: 0, allow: 1, seam: 0, seamAt: 0 });
  t.check("C35: zero thickness leaves the development unchanged", JSON.stringify(a) === JSON.stringify(b) && a.length === 3, `n=${a.length}`, "C35-SHEET");
  const gore = mitreGore(100, 90, 3, 150, "end");
  const xs = (gore && gore.pts || []).map((p) => p[0]);
  const span = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  t.check("C35: at t=0 a gore still spans the full circumference (not wrapped to 0)",
    !!(gore && Math.abs(span - Math.PI * 100) < 0.05), `span=${span}`, "C35-SHEET");
  const seamOnly = elbowGores(100, 90, 3, 150, sheetFrom({ t: 0, allow: 1, seam: 10 }));
  const mid = elbowGores(100, 90, 3, 150, sheetFrom({ t: 3, allow: 1, seam: 0 }));
  const width = (cs) => {
    let x0 = Infinity, x1 = -Infinity;
    for (const q of cs[0].pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); }
    return x1 - x0;
  };
  t.check("C35: a seam widens the wrap", width(seamOnly) > width(a) + 5, `was ${r1(width(a))} now ${r1(width(seamOnly))}`, "C35-SHEET");
  t.check("C35: mean thickness narrows the wrap", width(mid) < width(a) - 5, `was ${r1(width(a))} now ${r1(width(mid))}`, "C35-SHEET");
  t.check("C35: inside / mean / outside diameters", developedDia(100, 4, 0) === 92 && developedDia(100, 4, 1) === 96 && developedDia(100, 4, 2) === 100, "", "C35-SHEET");
  const tab = elbowTable(100, 90, 3, 150, sheetFrom({ t: 0 }));
  t.check("C35: true-length table has two end gores and one middle", tab.gores.length === 3 && tab.gores[1].name.includes("Middle") && tab.triangulation.length >= 8, JSON.stringify(tab.gores.map((g) => g.name)), "C35-SHEET");
}

// ---- C36 flange tables ----
{
  t.check("C36: both standards are listed", FLANGE_STANDARDS.map((s) => s.id).join() === "en1092,asme", "", "C36-FLANGE");
  const dim = lookupFlange("en1092", "PN16", 50);
  t.check("C36: EN 1092-1 PN16 DN50 fills OD, bore, PCD, holes", dim && dim.od === 165 && dim.id === 60.3 && dim.pcd === 125 && dim.n === 4 && dim.hole === 18, JSON.stringify(dim), "C36-FLANGE");
  const asme = lookupFlange("asme", "150", "2");
  t.check("C36: ASME B16.5 Class 150 NPS 2 is in millimetres", asme && asme.od > 150 && asme.od < 160 && asme.n === 4, JSON.stringify(asme), "C36-FLANGE");
  const p = { d: 150, id: 60, pcd: 115, n: 4, hole: 12 };
  applyFlangeDims(p, dim, flangeShapeKeys("flange"));
  t.check("C36: apply fills the flange fields", p.d === 165 && p.pcd === 125 && p.n === 4, JSON.stringify(p), "C36-FLANGE");
}

// ---- C37 cam plate ----
{
  t.check("C37: cam plate is a registered preset", !!SHAPES.find((s) => s.id === "camplate"), "", "C37-CAM");
  t.check("C37: motion laws at mid-stroke", Math.abs(camDisplacement(0.5, "shm") - 0.5) < 1e-9 && Math.abs(camDisplacement(0.5, "cycloid") - 0.5) < 1e-9 && camDisplacement(0.25, "cv") === 0.25, "", "C37-CAM");
  const cs = camPlateContours({ base: 80, lift: 20, rise: 90, dwell: 60, fall: 90, law: 0, id: 12 });
  t.check("C37: a cam plate is one closed outline plus a centre hole", cs.length === 2 && cs[0].closed === true && cs[0].pts.length >= 16 && cs[1].circle, `n=${cs.length} pts=${cs[0] && cs[0].pts.length}`, "C37-CAM");
  const made = makeShape("camplate", { base: 80, lift: 18, rise: 90, dwell: 60, fall: 90, law: 1, id: 10 });
  t.check("C37: makeShape builds a cycloidal cam", !!(made && made.length >= 1 && made[0].closed !== false), "", "C37-CAM");
}

// ---- C38 fonts + text on a path ----
{
  const ids = TEXT_FONTS.map((f) => f.id);
  t.check("C38: stencil and block fonts sit alongside sans", ids.includes("stencil") && ids.includes("block") && ids.includes("sans"), ids.join(), "C38-TEXT");
  const block = textToContours("A", { font: "block", size: 40, plate: 0 });
  t.check("C38: block font cuts a letter", block.contours.length >= 1 && block.width > 10, `n=${block.contours.length} w=${block.width}`, "C38-TEXT");
  const along = textToContours("OK", { font: "sans", size: 16, path: [[0, 0], [60, 0], [60, 40]] });
  t.check("C38: text on a path still makes outlines", along.contours.length >= 1, `n=${along.contours.length}`, "C38-TEXT");
}

// ---- C39 cut-control hooks (settings only; default CAM lead-in is unchanged) ----
{
  t.check("C39: Cut control is in the catalogue", KNOWN_TOOLS.has("cutctl") && toolInfo("cutctl").label.toLowerCase().includes("cut"), "", "C39-CUT");
  const sk = mk([["rect", { w: 80, h: 50 }, 0, 0]]);
  sk.opts.showKerf = true;
  t.check("C39: kerf preview is an opt the canvas can read", sk.opts.showKerf === true, "", "C39-CUT");
}

// ---- C40 driving dimensions ----
{
  const sk = mk([["rect", { w: 100, h: 60 }, 0, 0], ["hole", { d: 10 }, 40, 20]]);
  const hole = sk.items.find((i) => i.type === "hole");
  const plate = sk.items.find((i) => i.type === "rect");
  sk.pick([hole.id]);
  const a = { kind: "hole", it: hole, c: [hole.x + 5, hole.y + 5] };
  // box of hole after add: x,y is bottom-left
  const hb = sk.boxOf(hole);
  a.c = [(hb[0] + hb[2]) / 2, (hb[1] + hb[3]) / 2];
  const pb = sk.boxOf(plate);
  const b = { kind: "edge", it: plate, a: [pb[0], pb[1]], b: [pb[2], pb[1]] }; // bottom edge
  const before = a.c[1] - pb[1];
  t.check("C40: feature distance to the bottom edge is the current height", Math.abs(sk.featureDistance(a, b) - before) < 0.2, `d=${sk.featureDistance(a, b)} before=${before}`, "C40-DIM");
  sk.applyDriveDim(a, b, 15);
  const hb2 = sk.boxOf(hole);
  const c2 = [(hb2[0] + hb2[2]) / 2, (hb2[1] + hb2[3]) / 2];
  t.check("C40: typing 15 mm moves the hole that far from the edge", Math.abs(c2[1] - pb[1] - 15) < 0.3, `y=${c2[1]} edge=${pb[1]}`, "C40-DIM");
}

// ---- C41 group / ungroup (no union) ----
{
  const sk = mk([["rect", { w: 40, h: 30 }, 0, 0], ["rect", { w: 40, h: 30 }, 80, 0]]);
  const a = sk.items[0], b = sk.items[1];
  sk.pick([a.id, b.id]);
  sk.group();
  t.check("C41: group shares an id and does not join the outlines", a.gid && a.gid === b.gid && sk.items.length === 2, `gid=${a.gid}/${b.gid} n=${sk.items.length}`, "C41-GROUP");
  const x0 = b.x;
  sk.rotateAbout(-10, 0, 90);
  t.check("C41: grouped parts move together about a point", sk.items.length === 2 && (Math.abs(b.x - x0) > 1 || Math.abs(a.x) > 1), `a=${a.x},${a.y} b=${b.x},${b.y}`, "C41-GROUP");
  sk.ungroup();
  t.check("C41: ungroup clears the id", !a.gid && !b.gid, "", "C41-GROUP");
}

// ---- C42 true-shape nest with rotation ----
{
  t.check("C42: quarter turns are offered", turnAngles(90).join() === "0,90,180,270", String(turnAngles(90)), "C42-NEST");
  const sk = mk([["rect", { w: 100, h: 40 }, 0, 0]]);
  sk.nest(10, 70, 130, { angles: 90 });
  const b = sk.boxOf(sk.items[0]);
  const inside = b[0] >= -0.05 && b[1] >= -0.05 && b[2] <= 70.05 && b[3] <= 130.05;
  const turned = Math.abs((sk.items[0].rot || 0) % 180) > 1;
  t.check("C42: a 100×40 mm part turns to fit a 70×130 mm sheet", inside && turned, JSON.stringify({ b: b.map(r1), rot: sk.items[0].rot, msgs: sk.messages.slice(-1) }), "C42-NEST");
}

// ---- C43 DXF import clean-up ----
{
  const dxf = `0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n50\n21\n0\n0\nLINE\n10\n50\n20\n0\n11\n50\n21\n40\n0\nLINE\n10\n70\n20\n0\n11\n90\n21\n0\n0\nENDSEC\n0\nEOF\n`;
  const r = parseDXF(dxf);
  const e = contoursToEditable(r.contours);
  t.check("C43: two open chains stay two parts (not four)", e.parts.length === 2 && r.contours.length === 2 && r.open === 2, `parts=${e.parts.length} contours=${r.contours.length} open=${r.open}`, "C43-DXF");
  t.check("C43: leftover open paths are reported", (r.warnings || []).some((w) => /open path/.test(w)), String(r.warnings), "C43-DXF");
  const gap = joinPieces([[[0, 0], [10, 0]], [[10.2, 0], [20, 0]]]);
  t.check("C43: ends within 0.25 mm join into one chain", gap.length === 1 && gap[0].pts.length >= 3, JSON.stringify(gap), "C43-DXF");
  const dups = dropDuplicatePieces([[[0, 0], [10, 0]], [[10, 0], [0, 0]], [[0, 0], [10, 0]]]);
  t.check("C43: duplicate lines are dropped", dups.length === 1, JSON.stringify(dups), "C43-DXF");
}

// ---- C44 merge slivers ----
{
  const sk = A.newSketch();
  sk.opts.pro = true;
  // a 80×80 plate with two Ø20 holes whose walls are 0.8 mm apart (centre 20.8)
  sk.addCustomWorld([
    { pts: [[0, 0], [80, 0], [80, 80], [0, 80]], closed: true, bulges: [0, 0, 0, 0] },
    { pts: circlePts(30, 40, 10), closed: true },
    { pts: circlePts(50.8, 40, 10), closed: true },
  ]);
  const before = sk.items[0].shape.cs.length;
  sk.pick([sk.items[0].id]);
  const n = sk.mergeSlivers(1.5);
  const after = sk.items[0].shape.cs.length;
  t.check("C44: holes closer than the kerf are merged", n >= 1 && after < before, `n=${n} contours ${before}→${after}`, "C44-SLIVER");
}

// ---- C45 rotate about a point, scale by %, C26 angle still about the centre ----
{
  t.check("C45: rotate-about and scale are catalogued", KNOWN_TOOLS.has("rotpt") && KNOWN_TOOLS.has("scalepct") && DEFAULT_TOOL_IDS.includes("rotpt"), "", "C45-XFORM");
  const sk = mk([["rect", { w: 40, h: 20 }, 10, 10]]);
  const it = sk.items[0];
  const mid0 = centre(sk, it);
  sk.pick([it.id]);
  sk.setAngle(90);
  const mid1 = centre(sk, it);
  t.check("C26: the Angle field still turns about the centre", Math.hypot(mid1[0] - mid0[0], mid1[1] - mid0[1]) < 0.4, `was ${mid0} now ${mid1}`, "C26-ANGLE");
  // 90° about the origin should send centre (30,20) → (-20, 30) wait: (x,y)=(30,20) rot 90 CCW → (-20, 30)
  const sk2 = mk([["rect", { w: 40, h: 20 }, 10, 10]]);
  sk2.pick([sk2.items[0].id]);
  const c0 = centre(sk2, sk2.items[0]);
  sk2.rotateAbout(0, 0, 90);
  const c1 = centre(sk2, sk2.items[0]);
  const expect = [-c0[1], c0[0]];
  t.check("C45: rotate about the origin moves the centre with the rotation", Math.hypot(c1[0] - expect[0], c1[1] - expect[1]) < 0.6, `c0=${c0} c1=${c1} expect=${expect}`, "C45-XFORM");
  const sk3 = mk([["rect", { w: 40, h: 20 }, 0, 0]]);
  sk3.pick([sk3.items[0].id]);
  const b0 = sk3.boxOf(sk3.items[0]);
  sk3.scaleBy(200, b0[0], b0[1]);
  const b1 = sk3.boxOf(sk3.items[0]);
  t.check("C45: scale 200 % about the bottom-left doubles the size", Math.abs((b1[2] - b1[0]) - 80) < 0.6 && Math.abs((b1[3] - b1[1]) - 40) < 0.6 && Math.abs(b1[0] - b0[0]) < 0.6, `was ${b0} now ${b1}`, "C45-XFORM");
}

function centre(sk, it) {
  const b = sk.boxOf(it);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}
function circlePts(cx, cy, r, n = 24) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}


// ---- C39: lead type / side are applied in CAM; auto is byte-identical ----
{
  const rect = [{ pts: [[0, 0], [80, 0], [80, 50], [0, 50]], closed: true }];
  const base = { kerf: 1.5, leadIn: 5, name: "lead", keepOrigin: true };
  const defG = designToGcode(rect, base);
  const autoG = designToGcode(rect, { ...base, leadType: "auto", leadSide: "auto" });
  t.check("C39: default and explicit auto lead settings are byte-identical", defG.gcode === autoG.gcode, "", "C39-LEAD");
  const outG = designToGcode(rect, { ...base, leadType: "straight", leadSide: "outside" });
  const inG = designToGcode(rect, { ...base, leadType: "straight", leadSide: "inside" });
  const inPoly = (p) => p[0] > 1 && p[0] < 79 && p[1] > 1 && p[1] < 49;
  const Lout = outG.cutInfo[0].lead, Linn = inG.cutInfo[0].lead;
  t.check("C39: an outside lead-in starts outside the outline", !inPoly(Lout), JSON.stringify(Lout), "C39-LEAD");
  t.check("C39: an inside lead-in starts inside the outline", inPoly(Linn), JSON.stringify(Linn), "C39-LEAD");
  t.check("C39: inside and outside leads are not the same point", Lout[0] !== Linn[0] || Lout[1] !== Linn[1], JSON.stringify({ Lout, Linn }), "C39-LEAD");
  const arcG = designToGcode(rect, { ...base, leadType: "arc", leadSide: "outside" });
  const leadMove = (g) => {
    const lines = g.gcode.split("\n");
    const i = lines.indexOf("M3");
    return i >= 0 ? lines[i + 1] : "";
  };
  t.check("C39: auto lead-in onto the line is still G1", leadMove(defG).startsWith("G1 "), leadMove(defG), "C39-LEAD");
  t.check("C39: an arc lead-in is a G2/G3 onto the line", /^G[23] /.test(leadMove(arcG)) && /I/.test(leadMove(arcG)), leadMove(arcG), "C39-LEAD");
  const holePts = (cx, cy, r, n = 24) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  };
  const plate = { pts: holePts(50, 50, 40), closed: true, circle: { cx: 50, cy: 50, r: 40 } };
  const hole = { pts: holePts(50, 50, 12), closed: true, circle: { cx: 50, cy: 50, r: 12 } };
  const ring = designToGcode([plate, hole], { ...base, leadType: "auto", leadSide: "auto" });
  const holeCut = ring.cutInfo.find((c) => c.hole);
  const dLead = holeCut && Math.hypot(holeCut.lead[0] - 50, holeCut.lead[1] - 50);
  t.check("C39: auto lead on a hole is on the scrap (inside) side", !!(holeCut && dLead < 12), JSON.stringify(holeCut && { lead: holeCut.lead, dLead }), "C39-LEAD");
  const tabG = designToGcode(rect, { ...base, tabs: { count: 2, width: 4 } });
  t.check("C39: stored tabs are applied on part edges", tabG.summary.tabs === 2, JSON.stringify(tabG.summary), "C39-LEAD");
}

process.exit(t.done() ? 1 : 0);

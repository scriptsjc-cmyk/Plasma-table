// Sheet-metal fabrication flat patterns (cones, saddles, elbows, hoppers, flashings…).
import {
  circleContour, roundedRect, holeIn, rectContour, packPieces, coneSector, elbowGores, mitreGore,
  clamp, pos, shape, poly, shiftToOrigin, signedArea, selfIntersects, dedupe, boltHoles,
} from "./helpers.js";
import { squareToRound, offsetRoundToRound, rectangularTransition, pipeSaddle, pipeOnFlat, coneDevelopment } from "../duct.js";
import { SHEET_PARAMS, sheetFrom, elbowTable } from "../sheetopts.js";

function shiftContour(pts) {
  const p = shiftToOrigin(pts);
  if (p.length < 4 || Math.abs(signedArea(p)) < 0.05 || selfIntersects(p)) return null;
  return { pts: p, closed: true };
}

function flangeRing(od, id) {
  if (!(od > id + 4 && id >= 8)) return null;
  const r = od / 2;
  return [circleContour(r, r, r), circleContour(r, r, id / 2)];
}

function flangeFrame(w, h, lip) {
  if (!(lip > 0.5 && w > 8 && h > 8)) return null;
  return [roundedRect(0, 0, w + 2 * lip, h + 2 * lip, 0), { pts: [[lip, lip], [lip, lip + h], [lip + w, lip + h], [lip + w, lip]], closed: true }];
}

function loftOrCone(d1, d2, h, ox = 0, oy = 0) {
  const loft = offsetRoundToRound(d1, d2, h, ox, oy, 24);
  if (loft && !selfIntersects(loft.pts)) return [shiftContour(loft.pts)].filter(Boolean);
  const c = coneSector(d1, d2, h);
  return c ? [c] : [];
}

export const FAB_PRESETS = [
  shape("conesteep", "Steep cone / reducer", "◠", "sheetmetal", "steep cone reducer funnel",
    "Flat pattern for a steep round-to-round cone (taller than it is wide).",
    [["d", "Big end Ø", 220], ["d2", "Small end Ø", 80], ["h", "Straight height", 260]],
    (p) => { const c = coneSector(p.d, p.d2, p.h); return c ? [c] : []; },
    { noResize: true }),
  shape("coneshallow", "Shallow cone / reducer", "◠", "sheetmetal", "shallow cone reducer",
    "Flat pattern for a shallow (flat) cone.",
    [["d", "Big end Ø", 280], ["d2", "Small end Ø", 160], ["h", "Straight height", 60]],
    (p) => { const c = coneSector(p.d, p.d2, p.h); return c ? [c] : []; },
    { noResize: true }),
  shape("conecentric", "Concentric reducer (pattern + rings)", "◠", "sheetmetal", "concentric reducer flanges",
    "Concentric reducer pattern packed with optional flange rings for each end.",
    [["d", "Big end Ø", 220], ["d2", "Small end Ø", 110], ["h", "Straight height", 160], ["lip", "Flange lip width (0 = none)", 20]],
    (p) => {
      const c = coneSector(p.d, p.d2, p.h);
      if (!c) return [];
      const pieces = [[c]];
      if (p.lip > 1) {
        const a = flangeRing(p.d + 2 * p.lip, p.d); if (a) pieces.push(a);
        const b = flangeRing(p.d2 + 2 * p.lip, p.d2); if (b) pieces.push(b);
      }
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("coneecc", "Offset / eccentric reducer", "◠", "sheetmetal", "eccentric offset reducer round to round",
    "Flat pattern for an offset (eccentric) round-to-round reducer.",
    [["d", "Big end Ø", 200], ["d2", "Small end Ø", 100], ["h", "Straight height", 150], ["ox", "Offset of the small end (X)", 30]],
    (p) => loftOrCone(p.d, p.d2, p.h, p.ox, 0),
    { noResize: true }),
  shape("r2roffset", "Round-to-round offset transition", "◠", "sheetmetal", "round to round offset transition",
    "Offset round-to-round transition (the two ends are shifted in both X and Y).",
    [["d", "Bottom Ø", 180], ["d2", "Top Ø", 120], ["h", "Height", 140], ["ox", "X offset", 25], ["oy", "Y offset", 15]],
    (p) => loftOrCone(p.d, p.d2, p.h, p.ox, p.oy),
    { noResize: true }),
  shape("recttrans", "Rectangular transition", "⏢", "sheetmetal", "rectangular to rectangular transition",
    "Flat pattern: four side panels for a rectangular-to-rectangular transition.",
    [["a", "Bottom width", 200], ["b", "Bottom depth", 120], ["a2", "Top width", 100], ["b2", "Top depth", 80], ["h", "Height", 120]],
    (p) => {
      const panels = rectangularTransition(p.a, p.b, p.a2, p.b2, p.h);
      if (!panels) return [];
      return packPieces(panels.map((d) => [shiftContour(d.pts)].filter(Boolean))).contours;
    },
    { sheet: true, noResize: true }),
  shape("recttransoff", "Offset rectangular transition", "⏢", "sheetmetal", "offset rectangular transition",
    "Rectangular transition with the top opening offset to one side.",
    [["a", "Bottom width", 200], ["b", "Bottom depth", 120], ["a2", "Top width", 80], ["b2", "Top depth", 60], ["h", "Height", 120], ["ox", "X offset", 30]],
    (p) => {
      const panels = rectangularTransition(p.a, p.b, p.a2, p.b2, p.h, p.ox, 0);
      if (!panels) return [];
      return packPieces(panels.map((d) => [shiftContour(d.pts)].filter(Boolean))).contours;
    },
    { sheet: true, noResize: true }),
  shape("sqrpyramid", "Square pyramid hopper", "△", "sheetmetal", "square pyramid hopper",
    "Four triangular sides for a square pyramid (or a hopper that comes to a point). Leave a small flat if you set a top opening.",
    [["a", "Base width", 200], ["a2", "Top opening (0 = a point)", 40], ["h", "Height", 150]],
    (p) => {
      const top = Math.max(0, p.a2);
      if (top < 4) {
        // four isosceles triangles
        const slant = Math.hypot(p.h, p.a / 2);
        const tri = (base) => [poly([[0, 0], [base, 0], [base / 2, slant]])];
        return packPieces([tri(p.a), tri(p.a), tri(p.a), tri(p.a)]).contours;
      }
      const panels = rectangularTransition(p.a, p.a, top, top, p.h);
      if (!panels) return [];
      return packPieces(panels.map((d) => [shiftContour(d.pts)].filter(Boolean))).contours;
    },
    { sheet: true, noResize: true }),
  shape("s2roffset", "Offset square-to-round", "⏢", "sheetmetal", "offset square to round transition",
    "Eccentric square-to-round: the round end is offset from the rectangle centre. The four side panels are each developed from the true 3D lengths, so opposite sides are no longer a matching pair.",
    [["a", "Width A (rectangular end)", 260], ["b", "Depth B (rectangular end)", 160], ["d", "Round diameter", 120], ["h", "Height between the ends", 160], ["ox", "X offset of the round end", 40], ["oy", "Y offset of the round end", 0], ["lip", "Flange lip width (0 = none)", 20]],
    (p) => {
      if (!(p.a >= 10 && p.b >= 10 && p.d >= 10 && p.h >= 5)) return [];
      const t = squareToRound(p.a, p.b, p.d, p.h, p.ox || 0, p.oy || 0);
      if (!t) return [];
      const panel = (d) => [{ pts: d.pts.map((q) => [q[0], q[1]]), closed: true }];
      const sides = t.offset ? [t.A, t.A2, t.B, t.B2] : [t.A, t.A, t.B, t.B];
      const pieces = sides.filter(Boolean).map(panel);
      if (p.lip > 0.5) {
        const f = flangeFrame(p.a, p.b, p.lip); if (f) pieces.push(f);
        const r = flangeRing(p.d + 2 * p.lip, p.d); if (r) pieces.push(r);
      }
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("r2s", "Round-to-rectangular transition", "⏢", "sheetmetal", "round to rectangular transition",
    "Same development as square-to-round (the rectangular end is the base). Packed with optional flanges.",
    [["a", "Width A (rectangular end)", 240], ["b", "Depth B (rectangular end)", 160], ["d", "Round diameter", 130], ["h", "Height between the ends", 150], ["lip", "Flange lip width (0 = none)", 20]],
    (p) => {
      const t = squareToRound(p.a, p.b, p.d, p.h);
      if (!t) return [];
      const panel = (d) => [{ pts: d.pts.map((q) => [q[0], q[1]]), closed: true }];
      const pieces = [panel(t.A), panel(t.A), panel(t.B), panel(t.B)];
      if (p.lip > 0.5) {
        const f = flangeFrame(p.a, p.b, p.lip); if (f) pieces.push(f);
        const r = flangeRing(p.d + 2 * p.lip, p.d); if (r) pieces.push(r);
      }
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("fishmouth", "Pipe saddle / fishmouth", "∿", "sheetmetal", "pipe saddle fishmouth cope template",
    "Flat template for a 90° pipe-on-pipe saddle (fishmouth). Wrap it around the branch pipe to mark the cut.",
    [["d", "Branch pipe Ø", 80], ["d2", "Header pipe Ø", 120], ["skirt", "Skirt length", 30]],
    (p) => {
      const s = pipeSaddle(p.d, Math.max(p.d2, p.d), p.skirt);
      return s ? [shiftContour(s.pts)].filter(Boolean) : [];
    },
    { noResize: true }),
  shape("fishflat", "Pipe-on-flat saddle", "∿", "sheetmetal", "pipe on flat plate cope",
    "Template for a pipe cut to sit on a flat plate (a bevelled / coped end).",
    [["d", "Pipe Ø", 90], ["rise", "Bevel rise", 25], ["skirt", "Skirt length", 30]],
    (p) => {
      const s = pipeOnFlat(p.d, p.rise, p.skirt);
      return s ? [shiftContour(s.pts)].filter(Boolean) : [];
    },
    { noResize: true }),
  shape("saddlehole", "Saddle hole in a wrap", "◌", "sheetmetal", "saddle hole header wrap",
    "A rectangular wrap for the header pipe with the saddle hole cut out (the hole the branch sits in).",
    [["d", "Header pipe Ø", 120], ["len", "Wrap length along the pipe", 160], ["branch", "Branch pipe Ø", 70]],
    (p) => {
      const w = Math.PI * p.d, h = p.len, r = p.branch / 2;
      if (2 * r + 8 > Math.min(w, h)) return [rectContour(w, h)];
      return [rectContour(w, h), circleContour(w / 2, h / 2, r)];
    },
    { noResize: true }),
  shape("elbow2", "2-piece 90° elbow", "⌢", "sheetmetal", "two piece elbow mitre",
    "Two mitred gores for a 90° elbow (one square end and one mitre cut on each piece). Type the centreline radius and the number of pieces.",
    [["d", "Pipe Ø", 100], ["bend", "Bend angle (degrees)", 90], ["clr", "Centreline radius (CLR)", 150], ["n", "Number of pieces", 2], ...SHEET_PARAMS],
    (p) => elbowGores(p.d, p.bend, p.n || 2, p.clr > 0 ? p.clr : 1.5 * p.d, sheetFrom(p)),
    { sheet: true, noResize: true, table: (p) => elbowTable(p.d, p.bend, p.n, p.clr, sheetFrom(p)) }),
  shape("elbow3", "Lobster-back elbow", "⌢", "sheetmetal", "three piece elbow lobster 2 4 5 45",
    "True mitre-plane lobster-back elbow: end gores (square pipe end, one mitre) and middle gores. Type the number of pieces, the bend angle and the centreline radius.",
    [["d", "Pipe Ø", 100], ["bend", "Bend angle (degrees)", 90], ["clr", "Centreline radius (CLR)", 150], ["n", "Number of pieces", 3], ...SHEET_PARAMS],
    (p) => elbowGores(p.d, p.bend, p.n || 3, p.clr > 0 ? p.clr : 1.5 * p.d, sheetFrom(p)),
    { sheet: true, noResize: true, table: (p) => elbowTable(p.d, p.bend, p.n, p.clr, sheetFrom(p)) }),
  shape("elbow4", "4-piece 90° elbow (lobster-back)", "⌢", "sheetmetal", "four piece elbow lobster-back",
    "True mitre-plane lobster-back (two end gores and two middle gores). Type the centreline radius and the number of pieces.",
    [["d", "Pipe Ø", 100], ["bend", "Bend angle (degrees)", 90], ["clr", "Centreline radius (CLR)", 150], ["n", "Number of pieces", 4], ...SHEET_PARAMS],
    (p) => elbowGores(p.d, p.bend, p.n || 4, p.clr > 0 ? p.clr : 1.5 * p.d, sheetFrom(p)),
    { sheet: true, noResize: true, table: (p) => elbowTable(p.d, p.bend, p.n, p.clr, sheetFrom(p)) }),
  shape("elbow5", "5-piece 90° elbow (lobster-back)", "⌢", "sheetmetal", "five piece elbow lobster-back",
    "True mitre-plane lobster-back for a smoother bend. Type the centreline radius and the number of pieces.",
    [["d", "Pipe Ø", 90], ["bend", "Bend angle (degrees)", 90], ["clr", "Centreline radius (CLR)", 135], ["n", "Number of pieces", 5], ...SHEET_PARAMS],
    (p) => elbowGores(p.d, p.bend, p.n || 5, p.clr > 0 ? p.clr : 1.5 * p.d, sheetFrom(p)),
    { sheet: true, noResize: true, table: (p) => elbowTable(p.d, p.bend, p.n, p.clr, sheetFrom(p)) }),
  shape("elbow45", "3-piece 45° elbow", "⌢", "sheetmetal", "45 degree elbow lobster",
    "True mitre-plane 45° elbow (two end gores and one middle gore). Type the centreline radius and the number of pieces.",
    [["d", "Pipe Ø", 100], ["bend", "Bend angle (degrees)", 45], ["clr", "Centreline radius (CLR)", 150], ["n", "Number of pieces", 3], ...SHEET_PARAMS],
    (p) => elbowGores(p.d, p.bend, p.n || 3, p.clr > 0 ? p.clr : 1.5 * p.d, sheetFrom(p)),
    { sheet: true, noResize: true, table: (p) => elbowTable(p.d, p.bend, p.n, p.clr, sheetFrom(p)) }),
  shape("redelbow", "Reducing elbow gores", "⌢", "sheetmetal", "reducing elbow",
    "Reducing elbow: a cone-sector plus two mitred end gores (square pipe end, one mitre cut).",
    [["d", "Big end Ø", 120], ["d2", "Small end Ø", 80], ["h", "Length along the cone", 80], ["bend", "Bend angle (degrees)", 90], ["clr", "Centreline radius (CLR)", 180], ...SHEET_PARAMS],
    (p) => {
      const c = coneSector(p.d, p.d2, p.h);
      const clr = p.clr > 0 ? p.clr : 1.5 * p.d;
      const g1 = mitreGore(p.d, p.bend, 3, clr, "end");
      const g2 = mitreGore(p.d2, p.bend, 3, clr, "end");
      const pieces = [];
      if (c) pieces.push([c]);
      if (g1) pieces.push([g1]);
      if (g2) pieces.push([g2]);
      return pieces.length ? packPieces(pieces).contours : [];
    },
    { sheet: true, noResize: true, table: (p) => elbowTable(p.d, p.bend, p.n, p.clr, sheetFrom(p)) }),
  shape("rectelbow", "Rectangular duct elbow", "⌜", "sheetmetal", "rectangular elbow duct",
    "Rectangular duct elbow: two cheek (side) plates and two throat/back wrappers.",
    [["w", "Duct width (cheeks spacing)", 150], ["h", "Duct height", 80], ["r", "Throat radius", 40], ["bend", "Bend angle (degrees)", 90]],
    (p) => {
      const ang = clamp(p.bend, 20, 180) * Math.PI / 180;
      const ri = Math.max(10, p.r), ro = ri + p.h;
      const a0 = 0, a1 = ang;
      const cheek = [];
      for (let i = 0; i <= 16; i++) {
        const a = a0 + (i * (a1 - a0)) / 16;
        cheek.push([ro * Math.cos(a), ro * Math.sin(a)]);
      }
      for (let i = 16; i >= 0; i--) {
        const a = a0 + (i * (a1 - a0)) / 16;
        cheek.push([ri * Math.cos(a), ri * Math.sin(a)]);
      }
      const ch = shiftContour(cheek);
      const throat = Math.PI ? ri * ang : 0, back = ro * ang;
      const pieces = [];
      if (ch) pieces.push([ch], [ch]);
      pieces.push([rectContour(p.w, Math.max(20, throat))], [rectContour(p.w, Math.max(20, back))]);
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("hopperrect", "Rectangular hopper", "▽", "sheetmetal", "rectangular hopper bin",
    "Four trapezoid sides for a rectangular hopper (large rectangle to a smaller rectangle).",
    [["a", "Top width", 240], ["b", "Top depth", 180], ["a2", "Bottom width", 80], ["b2", "Bottom depth", 60], ["h", "Height", 160]],
    (p) => {
      const panels = rectangularTransition(p.a, p.b, p.a2, p.b2, p.h);
      if (!panels) return [];
      return packPieces(panels.map((d) => [shiftContour(d.pts)].filter(Boolean))).contours;
    },
    { sheet: true, noResize: true }),
  shape("cyclonehop", "Cyclone hopper / cone", "◠", "sheetmetal", "cyclone hopper cone",
    "Cyclone-style cone (a tall reducer) plus a top ring.",
    [["d", "Top Ø", 240], ["d2", "Outlet Ø", 60], ["h", "Straight height", 280], ["lip", "Top ring width (0 = none)", 20]],
    (p) => {
      const c = coneSector(p.d, p.d2, p.h);
      if (!c) return [];
      const pieces = [[c]];
      if (p.lip > 1) { const r = flangeRing(p.d + 2 * p.lip, p.d); if (r) pieces.push(r); }
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("silocone", "Silo cone", "◠", "sheetmetal", "silo cone bottom",
    "Silo bottom cone: a large-to-small reducer with a generous height.",
    [["d", "Silo Ø", 300], ["d2", "Outlet Ø", 80], ["h", "Straight height", 200]],
    (p) => { const c = coneSector(p.d, p.d2, p.h); return c ? [c] : []; },
    { noResize: true }),
  shape("chimround", "Chimney flashing (round)", "◇", "sheetmetal", "chimney flashing round pipe roof",
    "Round-pipe chimney flashing: a diamond (or rectangular) base with a hole, plus a collar cone.",
    [["base", "Base size", 260], ["d", "Pipe Ø", 80], ["collar", "Collar height", 40], ["pitch", "Roof pitch rise (mm per 100 mm run)", 30]],
    (p) => {
      const rise = Math.max(0, p.pitch);
      // diamond-ish rectangle stretched by pitch
      const w = p.base, h = p.base + rise;
      const base = [roundedRect(0, 0, w, h, 8)];
      const hole = holeIn(w / 2, h / 2, p.d, 0, 0, w, h, 8);
      if (hole) base.push(hole);
      const col = coneSector(p.d + 8, p.d, Math.max(20, p.collar));
      const pieces = [base];
      if (col) pieces.push([col]);
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("chimsquare", "Chimney flashing (square)", "◇", "sheetmetal", "chimney flashing square stack",
    "Square-stack chimney flashing: a diamond base with a square opening, plus four collar sides.",
    [["base", "Base size", 280], ["s", "Stack size", 100], ["collar", "Collar height", 40]],
    (p) => {
      const w = p.base, opening = clamp(p.s, 20, w - 20);
      const ox = (w - opening) / 2;
      const base = [roundedRect(0, 0, w, w, 8), roundedRect(ox, ox, opening, opening, 0)];
      const side = [rectContour(opening, Math.max(16, p.collar))];
      return packPieces([base, side, side, side, side]).contours;
    },
    { sheet: true, noResize: true }),
  shape("cricketflash", "Chimney cricket flashing", "△", "sheetmetal", "cricket saddle flashing chimney",
    "Cricket / saddle flashing: two triangular plates that shed water behind a chimney.",
    [["w", "Overall width", 260], ["h", "Height (up the roof)", 160], ["rise", "Ridge rise", 40]],
    (p) => {
      const rise = clamp(p.rise, 8, p.h - 8);
      const tri = [poly([[0, 0], [p.w / 2, 0], [p.w / 2, p.h], [0, rise]])];
      const tri2 = [poly([[0, 0], [p.w / 2, 0], [p.w / 2, p.h], [0, rise]])];
      return packPieces([tri, tri2]).contours;
    },
    { sheet: true, noResize: true }),
  shape("roofjack", "Roof jack / pipe boot", "▲", "sheetmetal", "roof jack pipe boot flashing",
    "Roof jack (pipe boot): a pitched base with a hole and a short cone collar.",
    [["w", "Base width", 220], ["h", "Base length up the roof", 240], ["d", "Pipe Ø", 70], ["collar", "Collar height", 35], ["pitch", "Rise (mm per 100 mm run)", 35]],
    (p) => {
      const rise = p.h * (p.pitch / 100) * 0.2;
      const base = [poly([[0, 0], [p.w, 0], [p.w, p.h], [0, p.h + rise]])];
      const hole = holeIn(p.w / 2, p.h / 2, p.d, 0, 0, p.w, p.h + rise, 6);
      if (hole) base.push(hole);
      const col = coneSector(p.d + 6, p.d, Math.max(18, p.collar));
      const pieces = [base];
      if (col) pieces.push([col]);
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("panflash", "Pan flashing", "▭", "sheetmetal", "pan flashing window door",
    "Pan flashing: a flat pan with three short upstands (front open).",
    [["w", "Width", 260], ["d", "Depth", 80], ["up", "Upstand height", 20]],
    (p) => packPieces([
      [rectContour(p.w, p.d)],
      [rectContour(p.w, p.up)],
      [rectContour(p.d, p.up)],
      [rectContour(p.d, p.up)],
    ]).contours,
    { sheet: true, noResize: true }),
  shape("valleyflash", "Valley flashing", "∧", "sheetmetal", "valley flashing roof",
    "Valley flashing: a long V (two legs) developed as one bent strip, shown as a rectangle of the correct width, plus a centre crease mark isn't cut.",
    [["len", "Length", 400], ["leg", "Each leg width", 80]],
    (p) => [rectContour(p.len, p.leg * 2)],
    { noResize: true }),
  shape("skylightcurb", "Skylight curb flashing", "▭", "sheetmetal", "skylight curb flashing",
    "Skylight curb flashing: four side pans packed on the sheet.",
    [["w", "Curb width", 300], ["d", "Curb depth", 200], ["up", "Upstand", 30], ["apron", "Apron width", 50]],
    (p) => {
      const pan = (len) => [rectContour(len + 2 * p.apron, p.up + p.apron)];
      return packPieces([pan(p.w), pan(p.w), pan(p.d), pan(p.d)]).contours;
    },
    { sheet: true, noResize: true }),
  shape("dustpan", "Dustpan (flat pattern)", "⌂", "sheetmetal", "dustpan scoop flat",
    "Dustpan: a bottom, two tapered sides and a back, packed on the sheet.",
    [["w", "Back width", 200], ["front", "Front width", 260], ["d", "Depth", 140], ["h", "Side height", 30]],
    (p) => {
      const bot = [poly([[0, 0], [p.front, 0], [(p.front + p.w) / 2 + p.w / 2, p.d], [(p.front - p.w) / 2, p.d]])];
      const sideW = Math.hypot(p.d, (p.front - p.w) / 2);
      return packPieces([bot, [rectContour(sideW, p.h)], [rectContour(sideW, p.h)], [rectContour(p.w, p.h)]]).contours;
    },
    { sheet: true, noResize: true }),
  shape("scoop", "Scoop (flat pattern)", "🥄", "sheetmetal", "scoop shovel flat",
    "Scoop / shovel: a rounded-front bottom and two sides plus a back.",
    [["w", "Width", 160], ["d", "Depth", 180], ["h", "Side height", 35], ["r", "Front radius", 40]],
    (p) => {
      const r = clamp(p.r, 8, p.w / 2);
      const bot = [roundedRect(0, 0, p.w, p.d, 0)];
      // rounded front: replace bottom with a D
      const pts = [[0, r], [0, p.d], [p.w, p.d], [p.w, r]];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const a = 0 - (i * Math.PI) / n;
        pts.push([p.w / 2 + (p.w / 2) * Math.cos(a), r + r * Math.sin(a)]);
      }
      return packPieces([[poly(pts)], [rectContour(p.d, p.h)], [rectContour(p.d, p.h)], [rectContour(p.w, p.h)]]).contours;
    },
    { sheet: true, noResize: true }),
  shape("takeoff", "Round duct takeoff", "Y", "sheetmetal", "round duct takeoff saddle",
    "Round duct take-off: a saddle template for the branch, plus a short tube blank and a flange ring.",
    [["d", "Branch Ø", 80], ["d2", "Main duct Ø", 140], ["len", "Branch length", 60], ["lip", "Flange lip (0 = none)", 16]],
    (p) => {
      const s = pipeSaddle(p.d, Math.max(p.d2, p.d), 20);
      const pieces = [];
      if (s) { const c = shiftContour(s.pts); if (c) pieces.push([c]); }
      pieces.push([rectContour(Math.PI * p.d, p.len)]);
      if (p.lip > 1) { const r = flangeRing(p.d + 2 * p.lip, p.d); if (r) pieces.push(r); }
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("britches", "Britches / pants piece", "Y", "sheetmetal", "britches pants wye piece",
    "Britches (pants) piece: two saddle templates and two cone / tube blanks that meet a common header wrap.",
    [["d", "Each branch Ø", 80], ["d2", "Header Ø", 140], ["len", "Branch length", 70]],
    (p) => {
      const s = pipeSaddle(p.d, Math.max(p.d2, p.d), 18);
      const pieces = [];
      if (s) {
        const c = shiftContour(s.pts);
        if (c) pieces.push([c], [c]);
      }
      pieces.push([rectContour(Math.PI * p.d, p.len)], [rectContour(Math.PI * p.d, p.len)]);
      pieces.push([rectContour(Math.PI * p.d2, p.len)]);
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("teetemp", "Tee intersection template", "⊤", "sheetmetal", "tee intersection pipe template",
    "Tee intersection: a saddle for the branch and a header wrap with the branch hole.",
    [["d", "Branch Ø", 80], ["d2", "Header Ø", 100], ["len", "Header wrap length", 160], ["skirt", "Branch skirt", 25]],
    (p) => {
      const s = pipeSaddle(p.d, Math.max(p.d2, p.d), p.skirt);
      const pieces = [];
      if (s) { const c = shiftContour(s.pts); if (c) pieces.push([c]); }
      const w = Math.PI * p.d2, h = p.len, r = p.d / 2;
      const wrap = [rectContour(w, h)];
      if (2 * r + 8 < Math.min(w, h)) wrap.push(circleContour(w / 2, h / 2, r));
      pieces.push(wrap);
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("ductcap", "Duct end cap with flange", "◎", "sheetmetal", "duct cap end cap flange",
    "Round duct end cap: a disc with an optional flange ring.",
    [["d", "Duct Ø", 150], ["lip", "Flange lip width (0 = disc only)", 20], ["hole", "Centre hole Ø (0 = closed cap)", 0]],
    (p) => {
      const pieces = [];
      const r = p.d / 2;
      const cap = [circleContour(r, r, r)];
      if (p.hole > 4 && p.hole < p.d - 8) cap.push(circleContour(r, r, p.hole / 2));
      pieces.push(cap);
      if (p.lip > 1) { const fl = flangeRing(p.d + 2 * p.lip, p.d); if (fl) pieces.push(fl); }
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("rectcap", "Rectangular end cap", "▭", "sheetmetal", "rectangular duct cap",
    "Rectangular duct end cap with an optional lip frame.",
    [["w", "Width", 200], ["h", "Height", 120], ["lip", "Lip width (0 = plain lid)", 18]],
    (p) => {
      const pieces = [[rectContour(p.w, p.h)]];
      if (p.lip > 1) { const f = flangeFrame(p.w, p.h, p.lip); if (f) pieces.push(f); }
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("ybranch", "Y-branch saddles", "Y", "sheetmetal", "y branch saddles",
    "Y-branch: two fishmouth templates at 45° (a shallower saddle) plus two branch wraps.",
    [["d", "Branch Ø", 80], ["d2", "Header Ø", 120], ["len", "Branch length", 70], ["rise", "Saddle bevel rise", 20]],
    (p) => {
      const s = pipeOnFlat(p.d, p.rise, 20);
      const pieces = [];
      if (s) { const c = shiftContour(s.pts); if (c) pieces.push([c], [c]); }
      pieces.push([rectContour(Math.PI * p.d, p.len)], [rectContour(Math.PI * p.d, p.len)]);
      pieces.push([rectContour(Math.PI * p.d2, p.len)]);
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("coneadapter", "Cone adapter with both flanges", "◠", "sheetmetal", "cone adapter flanges both ends",
    "Cone / reducer packed with a flange ring at each end.",
    [["d", "Big end Ø", 200], ["d2", "Small end Ø", 100], ["h", "Straight height", 120], ["lip", "Flange lip width", 22]],
    (p) => {
      const c = coneSector(p.d, p.d2, p.h);
      if (!c) return [];
      const pieces = [[c]];
      const a = flangeRing(p.d + 2 * p.lip, p.d); if (a) pieces.push(a);
      const b = flangeRing(p.d2 + 2 * p.lip, p.d2); if (b) pieces.push(b);
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
];

const FAB_HIDDEN = new Set([
  "conesteep", "coneshallow", "conecentric", "silocone", "cyclonehop", "coneadapter",
  "r2roffset",
  "s2roffset", "r2s",
  "recttransoff", "hopperrect", "sqrpyramid",
  "elbow2", "elbow4", "elbow5", "elbow45",
]);
const FAB_ALIAS = {
  conesteep: "cone", coneshallow: "cone", conecentric: "cone", silocone: "cone",
  cyclonehop: "cone", coneadapter: "cone",
  r2roffset: "coneecc",
  s2roffset: "s2r", r2s: "s2r",
  recttransoff: "recttrans", hopperrect: "recttrans", sqrpyramid: "recttrans",
  elbow2: "elbow3", elbow4: "elbow3", elbow5: "elbow3", elbow45: "elbow3",
};
const FAB_NOTES = {
  elbow2: "Lobster-back elbows are cut as separate gores — they cannot be one connected folding blank.",
  elbow3: "Lobster-back elbows are cut as separate gores — they cannot be one connected folding blank.",
  elbow4: "Lobster-back elbows are cut as separate gores — they cannot be one connected folding blank.",
  elbow5: "Lobster-back elbows are cut as separate gores — they cannot be one connected folding blank.",
  elbow45: "Lobster-back elbows are cut as separate gores — they cannot be one connected folding blank.",
  redelbow: "A reducing elbow is cut as a cone sector plus two mitred end gores — they cannot be one connected folding blank.",
  rectelbow: "A rectangular duct elbow is cut as two cheek plates plus throat and back wrappers — they cannot be one connected folding blank.",
  britches: "A britches piece is developed as separate pipe templates, not one folding blank.",
  ybranch: "A Y-branch is developed as separate saddle templates, not one folding blank.",
  teetemp: "A tee is developed as a header wrap plus a branch saddle, not one folding blank.",
};
for (const s of FAB_PRESETS) {
  if (FAB_HIDDEN.has(s.id)) { s.hidden = true; s.aliasOf = FAB_ALIAS[s.id] || s.id; }
  if (FAB_NOTES[s.id]) s.note = FAB_NOTES[s.id];
}


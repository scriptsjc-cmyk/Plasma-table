// Shared geometry helpers for parametric preset parts.
import { arcPoints, circleContour, signedArea, selfIntersects } from "../../core/geom.js";
import { developedDia, sheetFrom, seamShift } from "../sheetopts.js";
import { roundedRect, slot, roundCorners, dedupe } from "../shape-helpers.js";
import { coneDevelopment, squareToRound, developConnected, joinPanels, s2rPanels, rectangularTransition, fitsBed } from "../duct.js";

export { arcPoints, circleContour, signedArea, selfIntersects, roundedRect, slot, roundCorners, dedupe, coneDevelopment, squareToRound, developConnected, joinPanels, s2rPanels };

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
export const pos = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

export function holeIn(cx, cy, d, x0, y0, x1, y1, edge = 1) {
  const r = d / 2;
  return d > 0 && cx - r >= x0 + edge && cx + r <= x1 - edge && cy - r >= y0 + edge && cy + r <= y1 - edge
    ? circleContour(cx, cy, r) : null;
}

export const moveC = (c, dx, dy) => ({
  ...c,
  pts: c.pts.map(([x, y]) => [x + dx, y + dy]),
  circle: c.circle ? { ...c.circle, cx: c.circle.cx + dx, cy: c.circle.cy + dy } : undefined,
});

export function boxOfPts(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

export function boxOfPiece(piece) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of piece) for (const q of c.pts) {
    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
  }
  return [x0, y0, x1, y1];
}

export const ROW_MAX = 1200;
export const PIECE_GAP = 12;

export function packPieces(pieces, rowMax = ROW_MAX, gap = PIECE_GAP) {
  const out = [], placed = [];
  let x = 0, y = 0, rowH = 0;
  for (const piece of pieces) {
    const b = boxOfPiece(piece), w = b[2] - b[0], h = b[3] - b[1];
    if (x > 0 && x + w > rowMax) { x = 0; y += rowH + gap; rowH = 0; }
    const dx = x - b[0], dy = y - b[1];
    const moved = piece.map((c) => moveC(c, dx, dy));
    placed.push(moved);
    out.push(...moved);
    x += w + gap; rowH = Math.max(rowH, h);
  }
  return { contours: out, placed };
}

export function shiftToOrigin(pts) {
  const [x0, y0] = boxOfPts(pts);
  return pts.map(([x, y]) => [x - x0, y - y0]);
}

export function contour(pts, closed = true) {
  const p = dedupe(shiftToOrigin(pts));
  return { pts: p, closed };
}

export function rectContour(w, h, x = 0, y = 0) {
  return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true };
}

// Open score line used as a fold / bend mark (etched, never cut through).
export function bendLine(x0, y0, x1, y1) {
  return { pts: [[x0, y0], [x1, y1]], closed: false, role: "bend", op: "score" };
}

// Developed strip: a rectangle plus a score line at each face junction.
export function strip(len, widths) {
  const list = Array.isArray(widths) ? widths : [];
  const H = list.reduce((a, b) => a + b, 0);
  const c = [rectContour(len, H)];
  let y = 0;
  for (let i = 0; i < list.length - 1; i++) {
    y += list[i];
    c.push(bendLine(0, y, len, y));
  }
  return c;
}


export function poly(pts) {
  return contour(pts);
}

export function boltHoles(cx, cy, pcd, n, d, start = Math.PI / 2) {
  const holes = [];
  if (!(d > 0 && pcd > d + 1 && n >= 2)) return holes;
  const r = pcd / 2;
  for (let i = 0; i < n; i++) {
    const a = start + (i * 2 * Math.PI) / n;
    holes.push(circleContour(cx + r * Math.cos(a), cy + r * Math.sin(a), d / 2));
  }
  return holes;
}

// Flat annular-sector pattern for a cone / reducer, shifted into the first quadrant.
export function coneSector(d1, d2, h) {
  const cd = coneDevelopment(d1, d2, h);
  if (!cd || !(cd.Ro > cd.Ri + 1) || cd.Ro > 2500) return null;
  const a0 = Math.PI / 2 + cd.ang / 2, a1 = Math.PI / 2 - cd.ang / 2;
  const outer = [[cd.Ro * Math.cos(a0), cd.Ro * Math.sin(a0)], ...arcPoints(0, 0, cd.Ro, a0, a1, false)];
  const inner = [[cd.Ri * Math.cos(a1), cd.Ri * Math.sin(a1)], ...arcPoints(0, 0, cd.Ri, a1, a0, true)];
  const pts = dedupe([...outer, ...inner]);
  if (pts.length < 6 || Math.abs(signedArea(pts)) < 1 || selfIntersects(pts)) return null;
  return { pts: shiftToOrigin(pts), closed: true };
}

export function shape(id, name, icon, group, aka, tip, params, make, extra = {}) {
  return { id, name, icon, group, aka, tip, params, make, ...extra };
}

// True mitre-plane development of a gored (lobster-back) elbow.
// α = θ / 2(n−1). Wave height of each mitre edge is d·tan(α).
// End gores have one square (pipe) end; middle gores have two in-phase mitre edges
// (long at the extrados, short at the throat). CLR is the centreline radius.
export function mitreHalfAngle(bendRad, pieces) {
  const n = Math.max(2, Math.round(Number(pieces) || 2));
  return (Number(bendRad) || 0) / (2 * (n - 1));
}
export function goreWaveHeight(d, bendDeg, pieces) {
  const a = mitreHalfAngle((Number(bendDeg) || 0) * Math.PI / 180, pieces);
  return Math.abs(d) * Math.tan(a);
}
export function mitreGore(d, bendDeg, pieces, clr, kind = "end", samples = 64, opts = {}) {
  const sheet = sheetFrom(opts);
  const namedDia = Number(d) || 0;
  const dia = developedDia(namedDia, sheet.t, sheet.allow);
  const R = dia / 2;
  const n = Math.max(2, Math.round(Number(pieces) || 2));
  const a = mitreHalfAngle((Number(bendDeg) || 0) * Math.PI / 180, n);
  if (!(R > 0.5) || !(a > 1e-6) || a >= Math.PI / 2 - 1e-3) return null;
  const tanA = Math.tan(a);
  const amp = R * tanA;
  let rad = Number(clr);
  if (!Number.isFinite(rad) || rad <= 0) rad = 1.5 * namedDia;
  if (rad < R + 1) rad = R + 1;
  const L = rad * tanA;                     // centreline length of an end gore (half of a middle gore)
  const steps = Math.max(24, Math.min(96, Math.round(samples) || 64));
  const circ = Math.PI * dia;
  const shift = seamShift(circ, sheet.seamAt);
  const top = [], bot = [];
  for (let i = 0; i <= steps; i++) {
    // Do not wrap x with % circ: the last sample is x=circ, and circ%circ is 0.
    // Subtracting the seam shift keeps the strip a continuous length-circ run,
    // so t=0 / seamAt=0 still produces x = 0..circ (the original development).
    const x = (circ * i) / steps - shift;
    const c = Math.cos((2 * Math.PI * i) / steps);    // +1 at the extrados (x=0 and x=circ)
    if (kind === "mid") {
      bot.push([x, amp * (1 - c)]);
      top.push([x, 2 * L + amp * (1 + c)]);
    } else {
      bot.push([x, 0]);
      top.push([x, L + amp * c]);
    }
  }
  // seam allowance is a straight strip on the far edge of the unwrap
  if (sheet.seam > 0) {
    const xEnd = Math.max(...top.map((p) => p[0]));
    const yAt = (arr) => arr.reduce((a, p) => (p[0] >= a[0] ? p : a))[1];
    bot.push([xEnd + sheet.seam, yAt(bot)]);
    top.push([xEnd + sheet.seam, yAt(top)]);
  }
  top.sort((p, q) => p[0] - q[0]);
  bot.sort((p, q) => p[0] - q[0]);
  if (top.some((p, i) => p[1] <= (bot[i] ? bot[i][1] : 0) + 0.2)) return null;
  const pts = [...top, ...bot.reverse()];
  if (selfIntersects(pts) || Math.abs(signedArea(pts)) < 1) return null;
  return { pts: shiftToOrigin(pts), closed: true };
}
export function elbowGores(d, bendDeg, pieces, clr, opts = {}) {
  const n = Math.max(2, Math.min(12, Math.round(Number(pieces) || 2)));
  const end = mitreGore(d, bendDeg, n, clr, "end", 64, opts);
  if (!end) return [];
  const piecesOut = [[end]];
  if (n >= 3) {
    const mid = mitreGore(d, bendDeg, n, clr, "mid", 64, opts);
    if (!mid) return [];
    for (let i = 0; i < n - 2; i++) piecesOut.push([mid]);
  }
  piecesOut.push([end]);
  return packPieces(piecesOut).contours;
}


// --- one-piece folding blanks and the "Separate pieces" option ---

export const SPLIT_PARAM = ["split", "Blank", 0, { type: "select", options: [
  { v: 0, l: "One folding blank" },
  { v: 1, l: "Separate pieces" },
] }];
export const wantsSplit = (p) => Math.round(Number(p && p.split) || 0) >= 1;


// One folding blank (or two halves if it will not fit the 1300×800 bed) from
// developed side panels, plus any extra cut pieces (flange frames / rings).
function packedFitsBed(cs, margin = 8) {
  const pts = (cs || []).flatMap((c) => c.pts || []);
  if (!pts.length) return false;
  const [x0, y0, x1, y1] = boxOfPts(pts);
  return fitsBed(x1 - x0, y1 - y0, margin);
}

export function transitionBlank(panels, p, extraPieces = [], finishPart = null) {
  const densify = (pts, maxSeg = 80) => {
    if (!pts || pts.length < 3) return pts;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.floor(L / maxSeg);
      for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / (n + 1), a[1] + (b[1] - a[1]) * k / (n + 1)]);
    }
    return out;
  };
  const asPiece = (part) => {
    const done = finishPart ? finishPart(part) : part;
    const [x0, y0] = boxOfPts(done.pts);
    const c = [{ pts: densify(done.pts).map(([x, y]) => [x - x0, y - y0]), closed: true }];
    for (const seg of done.bends || []) {
      const a = seg[0], b = seg[1];
      if (a && b) c.push(bendLine(a[0] - x0, a[1] - y0, b[0] - x0, b[1] - y0));
    }
    return c;
  };
  const internal = (pan) => joinPanels([pan]) || { pts: pan.pts, bends: pan.bends || (pan.topFold ? [pan.topFold] : []) };
  if (wantsSplit(p)) {
    const pieces = panels.filter(Boolean).map((pan) => asPiece(internal(pan)));
    return { contours: packPieces(pieces.concat(extraPieces)).contours, halves: false, reason: "" };
  }
  const dev = developConnected(panels.filter(Boolean));
  if (!dev) {
    const pieces = panels.filter(Boolean).map((pan) => asPiece(internal(pan)));
    return { contours: packPieces(pieces.concat(extraPieces)).contours, halves: false, reason: "" };
  }
  const contours = packPieces(dev.parts.map(asPiece).concat(extraPieces)).contours;
  let reason = dev.reason || "";
  if (dev.halves && reason.includes("fits the 1300") && !packedFitsBed(contours)) {
    reason = "This size is developed as two halves. Each half fits the 1300 × 800 mm bed; cut them as two sheets.";
  }
  return { contours, halves: !!dev.halves, reason };
}

export function flangeRing(od, id) {
  if (!(od > id + 4 && id >= 8)) return null;
  const r = od / 2;
  return [circleContour(r, r, r), circleContour(r, r, id / 2)];
}

export function flangeFrame(w, h, lip) {
  if (!(lip > 0.5 && w > 8 && h > 8)) return null;
  return [roundedRect(0, 0, w + 2 * lip, h + 2 * lip, 0), { pts: [[lip, lip], [lip, lip + h], [lip + w, lip + h], [lip + w, lip]], closed: true }];
}

export function withTopLip(pts, lip) {
  if (!(lip > 0.5) || !pts || pts.length < 4) return pts;
  const tR = pts[2], tL = pts[pts.length - 1];
  const midB = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  const midT = [(tL[0] + tR[0]) / 2, (tL[1] + tR[1]) / 2];
  const ux = tR[0] - tL[0], uy = tR[1] - tL[1], L = Math.hypot(ux, uy) || 1;
  let nx = -uy / L, ny = ux / L;
  if (nx * (midB[0] - midT[0]) + ny * (midB[1] - midT[1]) > 0) { nx = -nx; ny = -ny; }
  const lipR = [tR[0] + nx * lip, tR[1] + ny * lip], lipL = [tL[0] + nx * lip, tL[1] + ny * lip];
  return { pts: [pts[0], pts[1], tR, lipR, lipL, tL], topFold: [tR, tL] };
}

export function s2rBlank(p) {
  if (!(p.a >= 10 && p.b >= 10 && p.d >= 10 && p.h >= 5)) return { contours: [], halves: false, reason: "" };
  const sides = s2rPanels(p.a, p.b, p.d, p.h, p.ox || 0, p.oy || 0);
  if (!sides) return { contours: [], halves: false, reason: "" };
  const extra = [];
  const lip = pos(p.lip);
  if (lip > 0.5) {
    const f = flangeFrame(p.a, p.b, lip); if (f) extra.push(f);
    const wantRing = p.ring == null ? true : Math.round(Number(p.ring)) >= 1;
    if (wantRing) { const r = flangeRing(p.d + 2 * lip, p.d); if (r) extra.push(r); }
  }
  return transitionBlank(sides, p, extra);
}

export function rectTransBlank(p) {
  const panels = rectangularTransition(p.a, p.b, p.a2, p.b2, p.h, p.ox || 0, p.oy || 0);
  if (!panels) return { contours: [], halves: false, reason: "" };
  return transitionBlank(panels, p);
}

export function panel(w, h, holes = []) {
  const c = [rectContour(w, h)];
  for (const [x, y, d] of holes) {
    const hole = holeIn(x, y, d, 0, 0, w, h, 1);
    if (hole) c.push(hole);
  }
  return c;
}

// Plus-shaped tray / box blank: bottom L×W, four walls, optional corner tabs on
// the long walls, optional top hems, optional lid flap on the far length wall.
// hole lists are [x, y, d] in the bottom or lid's own coordinates.
export function boxBlank(L, W, H, opts = {}) {
  const tab = Math.max(0, Number(opts.tab) || 0);
  const hem = Math.max(0, Number(opts.hem) || 0);
  const lid = !!opts.lid;
  const frontH = opts.frontH != null ? Math.max(0, opts.frontH) : H;
  const botHoles = opts.botHoles || [];
  const lidHoles = opts.lidHoles || [];
  const win = opts.window; // { w, h, r } cut in the front (+Y? front is the near length wall at y < arm)
  if (wantsSplit(opts)) {
    const pieces = [
      panel(L, W, botHoles),
      panel(L, frontH + hem),
      panel(L, H + hem),
      panel(W, H + hem),
      panel(W, H + hem),
    ];
    if (lid) pieces.push(panel(L, W, lidHoles));
    if (win && win.w > 8 && win.h > 8) {
      const iw = Math.min(win.w, L - 16), ih = Math.min(win.h, frontH - 10);
      if (iw > 8 && ih > 8) pieces[1].push(roundedRect((L - iw) / 2, (frontH - ih) / 2, iw, ih, win.r || 3));
    }
    return packPieces(pieces).contours;
  }
  const t = Math.max(0, Math.min(tab, Math.min(H, L / 2)));
  const armF = frontH + hem, armB = H + hem, armS = H + hem;
  const x0 = armS, y0 = armF;
  const x1 = x0 + L, y1 = y0 + W;
  const pts = [];
  // walk clockwise from the near-left corner of the front wall (including tab / hem)
  const yFront = 0;
  const yBackOuter = y1 + armB + (lid ? W : 0);
  // front edge (possibly with tabs)
  pts.push([x0 - t, yFront], [x1 + t, yFront]);
  if (t > 0) pts.push([x1 + t, y0], [x1, y0]);
  else pts.push([x1, y0]);
  // right side wall
  pts.push([x1 + armS, y0], [x1 + armS, y1], [x1, y1]);
  if (t > 0) pts.push([x1 + t, y1]);
  // back wall, then optional lid
  if (lid) {
    pts.push([x1 + t, y1 + armB], [x1, y1 + armB], [x1, yBackOuter], [x0, yBackOuter], [x0, y1 + armB], [x0 - t, y1 + armB]);
  } else {
    pts.push([x1 + t, y1 + armB], [x0 - t, y1 + armB]);
  }
  if (t > 0) pts.push([x0 - t, y1], [x0, y1]);
  else pts.push([x0, y1]);
  // left side wall
  pts.push([x0 - armS, y1], [x0 - armS, y0], [x0, y0]);
  if (t > 0) pts.push([x0 - t, y0]);
  const c = [poly(pts)];
  // wall / bottom bends
  c.push(bendLine(x0, y0, x1, y0));
  c.push(bendLine(x0, y1, x1, y1));
  c.push(bendLine(x0, y0, x0, y1));
  c.push(bendLine(x1, y0, x1, y1));
  if (hem > 0) {
    c.push(bendLine(x0, hem, x1, hem));                 // front hem
    c.push(bendLine(x0, y1 + H, x1, y1 + H));           // back hem
    c.push(bendLine(x0 - H, y0, x0 - H, y1));           // left hem
    c.push(bendLine(x1 + H, y0, x1 + H, y1));           // right hem
  }
  if (lid) c.push(bendLine(x0, y1 + armB, x1, y1 + armB));
  if (t > 0) {
    c.push(bendLine(x0, yFront, x0, y0));
    c.push(bendLine(x1, yFront, x1, y0));
    c.push(bendLine(x0, y1, x0, y1 + (hem > 0 ? H : armB)));
    c.push(bendLine(x1, y1, x1, y1 + (hem > 0 ? H : armB)));
  }
  for (const [x, y, d] of botHoles) {
    const h = holeIn(x0 + x, y0 + y, d, 0, 0, x1 + armS, yBackOuter || y1 + armB, 1);
    if (h) c.push(h);
  }
  if (lid) {
    for (const [x, y, d] of lidHoles) {
      const h = holeIn(x0 + x, y1 + armB + y, d, 0, 0, x1 + armS, yBackOuter, 1);
      if (h) c.push(h);
    }
  }
  if (win && win.w > 8 && win.h > 8) {
    const iw = Math.min(win.w, L - 16), ih = Math.min(win.h, frontH - 8);
    if (iw > 8 && ih > 8) c.push(roundedRect(x0 + (L - iw) / 2, (frontH - ih) / 2, iw, ih, win.r || 3));
  }
  return c;
}

// U / C channel: one developed strip, with optional end flaps attached to the web.
// widths is the list of face sizes across the profile; webIndex picks the web.
export function channelBlank(len, widths, webIndex, endH, split) {
  const body = strip(len, widths);
  if (!(endH > 0)) return body;
  if (wantsSplit({ split })) {
    const web = widths[webIndex] || 0;
    return packPieces([body, panel(web, endH), panel(web, endH)]).contours;
  }
  const web = widths[webIndex] || 0;
  const before = widths.slice(0, webIndex).reduce((a, b) => a + b, 0);
  const after = before + web;
  const Htot = widths.reduce((a, b) => a + b, 0);
  const outline = [
    [0, 0], [len, 0], [len, before], [len + endH, before], [len + endH, after],
    [len, after], [len, Htot], [0, Htot], [0, after], [-endH, after], [-endH, before], [0, before],
  ];
  const c = [poly(outline)];
  let y = 0;
  for (let i = 0; i < widths.length - 1; i++) {
    y += widths[i];
    c.push(bendLine(0, y, len, y));
  }
  c.push(bendLine(0, before, 0, after));
  c.push(bendLine(len, before, len, after));
  return c;
}

// Cuboid sleeve (four walls in a row) with the two ends as flaps on one length wall, or packed separate.
export function cuboidBlank(L, W, H, split) {
  const sleeve = [rectContour(2 * (L + W), H),
    bendLine(L, 0, L, H),
    bendLine(L + W, 0, L + W, H),
    bendLine(2 * L + W, 0, 2 * L + W, H)];
  if (wantsSplit({ split })) return packPieces([sleeve, panel(L, W), panel(L, W)]).contours;
  // Ends attach above and below the first length wall (x=0..L).
  const outline = [
    [0, -W], [L, -W], [L, 0], [2 * (L + W), 0], [2 * (L + W), H],
    [L, H], [L, H + W], [0, H + W], [0, H],
  ];
  return [poly(outline),
    bendLine(L, 0, L, H),
    bendLine(L + W, 0, L + W, H),
    bendLine(2 * L + W, 0, 2 * L + W, H),
    bendLine(0, 0, L, 0),
    bendLine(0, H, L, H)];
}

// Crate / carton: bottom, four walls and four outer flaps, one piece (or packed).
export function crateBlank(L, W, H, split) {
  if (wantsSplit({ split })) {
    return packPieces([
      panel(2 * (L + W), H),
      panel(L, W),
      panel(L, W / 2), panel(L, W / 2),
      panel(W, L / 2), panel(W, L / 2),
    ]).contours;
  }
  const fl = W / 2, fs = L / 2;
  const x0 = H, y0 = H;
  const x1 = x0 + L, y1 = y0 + W;
  const outline = [
    [x0, y0 - H - fl], [x1, y0 - H - fl], [x1, y0],
    [x1 + H, y0], [x1 + H + fs, y0], [x1 + H + fs, y1], [x1 + H, y1], [x1, y1],
    [x1, y1 + H + fl], [x0, y1 + H + fl], [x0, y1],
    [x0 - H, y1], [x0 - H - fs, y1], [x0 - H - fs, y0], [x0 - H, y0], [x0, y0],
  ];
  return [poly(outline),
    bendLine(x0, y0, x1, y0), bendLine(x0, y1, x1, y1),
    bendLine(x0, y0, x0, y1), bendLine(x1, y0, x1, y1),
    bendLine(x0, y0 - H, x1, y0 - H),
    bendLine(x0, y1 + H, x1, y1 + H),
    bendLine(x0 - H, y0, x0 - H, y1),
    bendLine(x1 + H, y0, x1 + H, y1)];
}

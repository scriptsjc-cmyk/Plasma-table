// More ready-made fabrication parts (round 5): complete parts with every size adjustable.
// Each entry has the same shape as the ones in shapes.js: params [key, label, default], make(p) -> contours (mm).
import { arcPoints, circleContour, signedArea } from "./geom.js";
import { roundedRect, slot, roundCorners, dedupe } from "./shape-helpers.js";
import { squareToRound, coneDevelopment } from "./duct.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pos = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

// a hole only if it fits inside the box (x0,y0)-(x1,y1) with a little metal left round it
function holeIn(cx, cy, d, x0, y0, x1, y1, edge = 1) {
  const r = d / 2;
  return d > 0 && cx - r >= x0 + edge && cx + r <= x1 - edge && cy - r >= y0 + edge && cy + r <= y1 - edge ? circleContour(cx, cy, r) : null;
}

// ---- pieces laid out in rows (for parts made of several flat pieces, like the square-to-round pattern)
const moveC = (c, dx, dy) => ({ ...c, pts: c.pts.map(([x, y]) => [x + dx, y + dy]), circle: c.circle ? { ...c.circle, cx: c.circle.cx + dx, cy: c.circle.cy + dy } : undefined });
function boxOfPiece(piece) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of piece[0].pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  return [x0, y0, x1, y1];
}
export const ROW_MAX = 1200;     // pieces wrap to a new row before the layout is wider than this (the table is 1300 mm)
export const PIECE_GAP = 12;     // clear metal between pieces (bigger than the lead-in + cut width the cut check wants)
// piece = [outline, ...holes]. Returns the flat contour list (outline first, its holes after it) with each piece moved into place.
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

export const FAB_SHAPES = [
  // ------------------------------------------------------------------ complete parts
  {
    id: "banjo", name: "Banjo guard", icon: "⚲", group: "plasma", aka: "banjo guard pulley guard tapered link teardrop two diameters",
    tip: "Banjo / guard plate: a round end at each side joined by straight sides. Set the diameter of each end, the distance between them and a hole in each end.",
    fit: (p, W, H) => {
      const big = Math.max(p.d, p.d2) || 1, k = H / big;
      const d = p.d * k, d2 = p.d2 * k;
      return { ...p, d, d2, hole1: p.hole1 * k, hole2: p.hole2 * k, len: Math.max(Math.abs(d - d2) / 2 + 1, W - (d + d2) / 2) };
    },
    params: [["d", "Big end Ø", 120], ["d2", "Small end Ø", 60], ["len", "Distance between the centres", 160], ["hole1", "Big end hole Ø (0 = none)", 50], ["hole2", "Small end hole Ø (0 = none)", 20]],
    make: (p) => {
      const R1 = p.d / 2, R2 = p.d2 / 2;
      const L = Math.max(p.len, Math.abs(R1 - R2) + 1);
      const phi = Math.acos(clamp((R1 - R2) / L, -1, 1));
      const c1 = [R1, Math.max(R1, R2)], c2 = [R1 + L, c1[1]];
      const n = (a) => [Math.cos(a), Math.sin(a)];
      const first = [c2[0] + R2 * n(-phi)[0], c2[1] + R2 * n(-phi)[1]];
      const pts = [first,
        ...arcPoints(c2[0], c2[1], R2, -phi, phi, true),
        [c1[0] + R1 * n(phi)[0], c1[1] + R1 * n(phi)[1]],
        ...arcPoints(c1[0], c1[1], R1, phi, 2 * Math.PI - phi, true)];
      const out = [{ pts: dedupe(pts).filter((q, i, a) => i === 0 || Math.hypot(q[0] - first[0], q[1] - first[1]) > 1e-6), closed: true }];
      const h1 = p.hole1 > 0 && p.hole1 <= p.d - 4 ? circleContour(c1[0], c1[1], p.hole1 / 2) : null;
      const h2 = p.hole2 > 0 && p.hole2 <= p.d2 - 4 ? circleContour(c2[0], c2[1], p.hole2 / 2) : null;
      if (h1) out.push(h1);
      if (h2) out.push(h2);
      return out;
    },
  },
  {
    id: "wgusset", name: "Weld gusset (clipped)", icon: "◣", group: "plasma", aka: "gusset weld relief corner clip stiffener",
    tip: "Right-angle gusset with the inside corner clipped (so it clears the weld) and the tips cut off.",
    fit: (p, W, H) => ({ ...p, a: W, b: H }),
    params: [["a", "Bottom leg", 120], ["b", "Upright leg", 120], ["clip", "Inside corner clip", 12], ["cut", "Tip cut-off", 10]],
    make: (p) => {
      const L = Math.hypot(p.a, p.b), k = clamp(p.cut, 0, Math.min(p.a, p.b) * 0.35), c = clamp(p.clip, 0, Math.min(p.a, p.b) * 0.4);
      const pts = [[c, 0], [p.a - k, 0], [p.a - (k * p.a) / L, (k * p.b) / L], [(k * p.a) / L, p.b - (k * p.b) / L], [0, p.b - k], [0, c]];
      return [{ pts: dedupe(pts), closed: true }];
    },
  },
  {
    id: "baseplate", name: "Base plate (anchor holes)", icon: "⊞", group: "plasma", aka: "base plate column footplate anchor holes bolt down slots",
    tip: "Column / equipment base plate: a bolt-down hole near each corner. Make the holes slots for adjustment.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 200], ["h", "Depth", 200], ["r", "Corner radius", 0], ["hole", "Anchor hole Ø", 18], ["slot", "Extra slot length (0 = round holes)", 0], ["insx", "Hole centre from the sides", 35], ["insy", "Hole centre from the front/back", 35], ["mid", "Centre hole Ø (0 = none)", 0]],
    make: (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const hl = p.hole + Math.max(0, p.slot), hw = p.hole;
      const ix = Math.max(p.insx, hl / 2 + 2), iy = Math.max(p.insy, hw / 2 + 2);
      if (p.hole > 0 && ix * 2 < p.w - hl / 2 && iy * 2 < p.h - hw / 2) {
        for (const [x, y] of [[ix, iy], [p.w - ix, iy], [p.w - ix, p.h - iy], [ix, p.h - iy]]) c.push(p.slot > 0 ? slot(x, y, hl, hw) : circleContour(x, y, hw / 2));
      }
      if (p.mid > 0) { const m = holeIn(p.w / 2, p.h / 2, p.mid, 0, 0, p.w, p.h, 2); if (m) c.push(m); }
      return c;
    },
  },
  {
    id: "slot2", name: "Double-slot plate", icon: "▤", group: "plasma", aka: "adjustment plate two slots slotted plate adjuster",
    tip: "Adjustment plate with two parallel slots.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 160], ["h", "Height", 80], ["r", "Corner radius", 8], ["slotLen", "Slot length", 100], ["slotWid", "Slot width", 12], ["gap", "Distance between the slot centres", 40]],
    make: (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const sw = Math.min(p.slotWid, p.h - 6), sl = Math.min(p.slotLen, p.w - 8);
      const gap = Math.min(p.gap, p.h - sw - 6);
      if (sw > 0 && sl >= sw && gap >= sw + 2) for (const dy of [-gap / 2, gap / 2]) c.push(slot(p.w / 2, p.h / 2 + dy, sl, sw));
      return c;
    },
  },
  {
    id: "sqwasher", name: "Plate washer / shim", icon: "▣", group: "plasma", aka: "washer spacer shim packer plate washer square washer",
    tip: "Flat washer, spacer or shim in a square or rectangle, with a round hole.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 60], ["h", "Height", 60], ["hole", "Hole Ø", 20], ["r", "Corner radius", 0]],
    make: (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const hh = holeIn(p.w / 2, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      if (hh) c.push(hh);
      return c;
    },
  },
  {
    id: "lug", name: "Lifting lug / eye plate", icon: "⌓", group: "plasma", aka: "lug eye plate lifting ear pad eye hanger",
    tip: "Plate with a round top and an eye hole – a lifting lug, pad eye or hanger.",
    fit: (p, W, H) => ({ ...p, w: W, h: H, hole: p.hole * (W / (p.w || W)) }),
    params: [["w", "Width", 60], ["h", "Height", 100], ["hole", "Eye hole Ø", 25], ["foot", "Foot corner radius", 0]],
    make: (p) => {
      const R = p.w / 2, top = Math.max(R, p.h - R), f = clamp(p.foot, 0, Math.min(R - 0.5, top - 0.5));
      const pts = f > 0.01
        ? dedupe([[f, 0], [p.w - f, 0], ...arcPoints(p.w - f, f, f, -Math.PI / 2, 0, true), [p.w, top], ...arcPoints(R, top, R, 0, Math.PI, true), [0, f], ...arcPoints(f, f, f, Math.PI, 1.5 * Math.PI, true)])
        : dedupe([[0, 0], [p.w, 0], [p.w, top], ...arcPoints(R, top, R, 0, Math.PI, true)]);
      const out = [{ pts: sortCcw(pts.filter((q, k) => k === 0 || Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) > 1e-6)), closed: true }];
      if (p.hole > 0 && p.hole <= p.w - 4) out.push(circleContour(R, top, p.hole / 2));
      return out;
    },
  },
  {
    id: "strap", name: "Strap with holes", icon: "⋯", group: "plasma", aka: "strap mending plate flat bar holes row bracket",
    tip: "Flat strap with a row of evenly spaced holes.",
    fit: (p, W, H) => ({ ...p, len: W, wid: H }),
    params: [["len", "Length", 200], ["wid", "Width", 30], ["r", "Corner radius", 6], ["n", "Number of holes", 4], ["hole", "Hole Ø", 8], ["inset", "First hole from the end", 15]],
    make: (p) => {
      const c = [roundedRect(0, 0, p.len, p.wid, p.r)];
      const n = Math.max(0, Math.min(64, Math.round(p.n)));
      if (n > 0 && p.hole > 0 && p.hole <= p.wid - 3) {
        const ins = Math.max(p.inset, p.hole / 2 + 1.5), span = p.len - 2 * ins;
        if (n === 1) c.push(circleContour(p.len / 2, p.wid / 2, p.hole / 2));
        else if (span > 0 && span / (n - 1) >= p.hole + 1.5) for (let i = 0; i < n; i++) c.push(circleContour(ins + (span * i) / (n - 1), p.wid / 2, p.hole / 2));
      }
      return c;
    },
  },
  {
    id: "frame", name: "Frame / rectangular flange", icon: "▭", group: "plasma", aka: "frame rectangular flange duct flange picture frame border",
    tip: "A flat frame: a rectangle with a rectangular opening and optional bolt holes in the corners.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Outside width", 200], ["h", "Outside height", 150], ["bw", "Border width", 30], ["r", "Outside corner radius", 0], ["hole", "Corner hole Ø (0 = none)", 9]],
    make: (p) => {
      const b = clamp(p.bw, 1, Math.min(p.w, p.h) / 2 - 1);
      const c = [roundedRect(0, 0, p.w, p.h, p.r), { pts: [[b, b], [b, p.h - b], [p.w - b, p.h - b], [p.w - b, b]], closed: true }];
      if (p.hole > 0 && p.hole <= b - 3) for (const [x, y] of [[b / 2, b / 2], [p.w - b / 2, b / 2], [p.w - b / 2, p.h - b / 2], [b / 2, p.h - b / 2]]) c.push(circleContour(x, y, p.hole / 2));
      return c;
    },
  },
  {
    id: "tplate", name: "T-plate (flat)", icon: "⊤", group: "plasma", aka: "t bracket t plate tee mending plate",
    tip: "Flat T-shaped plate with a hole at each end.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Top bar length", 150], ["h", "Overall height", 120], ["bar", "Top bar width", 30], ["stem", "Stem width", 30], ["r", "Corner radius", 4], ["hole", "Hole Ø (0 = none)", 8]],
    make: (p) => {
      const bar = clamp(p.bar, 2, p.h - 2), stem = clamp(p.stem, 2, p.w - 2), mid = p.w / 2, y = p.h - bar;
      const pts = [[mid - stem / 2, 0], [mid + stem / 2, 0], [mid + stem / 2, y], [p.w, y], [p.w, p.h], [0, p.h], [0, y], [mid - stem / 2, y]];
      const c = [{ pts: p.r > 0 ? roundCorners(pts, Math.min(p.r, stem / 2 - 0.2, bar / 2 - 0.2)) : pts, closed: true }];
      if (p.hole > 0 && p.hole <= Math.min(bar, stem) - 3) for (const [x, yy] of [[bar / 2, p.h - bar / 2], [p.w - bar / 2, p.h - bar / 2], [mid, stem / 2]]) c.push(circleContour(x, yy, p.hole / 2));
      return c;
    },
  },

  // ------------------------------------------------------------------ hole patterns (drop onto a part; they land in its middle)
  {
    id: "cornerholes", name: "Corner holes (4)", icon: "∷", hole: true, multi: true, aka: "four holes corners rectangle pattern",
    tip: "Four holes at the corners of a rectangle – drop it on a part, then set how far apart they are.",
    fit: (p, W, H) => ({ ...p, w: Math.max(0, W - p.hole), h: Math.max(0, H - p.hole) }),
    params: [["w", "Across (centre to centre)", 100], ["h", "Up (centre to centre)", 60], ["hole", "Hole Ø", 9]],
    make: (p) => {
      const r = p.hole / 2;
      return [[r, r], [r + p.w, r], [r + p.w, r + p.h], [r, r + p.h]].map(([x, y]) => circleContour(x, y, r));
    },
  },
  {
    id: "holerow", name: "Row of holes", icon: "⋯", hole: true, multi: true, aka: "row of holes line array evenly spaced",
    tip: "A straight row of evenly spaced holes – drop it on a part. Use Turn it for a column.",
    fit: (p, W) => ({ ...p, sp: p.n > 1 ? Math.max(p.hole + 1, (W - p.hole) / (p.n - 1)) : p.sp }),
    params: [["n", "Number of holes", 5], ["sp", "Spacing (centre to centre)", 25], ["hole", "Hole Ø", 8]],
    make: (p) => {
      const n = Math.max(1, Math.min(64, Math.round(p.n))), r = p.hole / 2, out = [];
      for (let i = 0; i < n; i++) out.push(circleContour(r + i * p.sp, r, r));
      return out;
    },
  },

  // ------------------------------------------------------------------ duct and rolled work (flat patterns)
  {
    id: "s2r", name: "Square to round transition", icon: "⏢", group: "duct", sheet: true, noResize: true,
    aka: "square to round rectangular to round transition reducer duct adaptor flat pattern development triangulation flange",
    tip: "Flat cutting pattern for a rectangular (or square) to round duct transition: 4 side panels (2 for the width edges, 2 for the depth edges) developed by triangulation, plus a flange frame for the rectangular end and a flange ring for the round end. Sizes are to the sheet's centre-line.",
    params: [["a", "Width A (rectangular end)", 300], ["b", "Depth B (rectangular end)", 200], ["d", "Round diameter", 150], ["h", "Height between the ends", 200], ["lip", "Flange lip width (0 = no flange pieces)", 25], ["ring", "Round end flange ring (1 = yes, 0 = no)", 1]],
    make: (p) => {
      if (!(p.a >= 10 && p.b >= 10 && p.d >= 10 && p.h >= 5)) return [];
      const t = squareToRound(p.a, p.b, p.d, p.h);
      if (!t) return [];
      const panel = (d) => [{ pts: d.pts.map((q) => [q[0], q[1]]), closed: true }];
      const pieces = [panel(t.A), panel(t.A), panel(t.B), panel(t.B)];
      const lip = pos(p.lip);
      if (lip > 0.5) {
        pieces.push([roundedRect(0, 0, p.a + 2 * lip, p.b + 2 * lip, 0), { pts: [[lip, lip], [lip, lip + p.b], [lip + p.a, lip + p.b], [lip + p.a, lip]], closed: true }]);
        if (Math.round(p.ring) >= 1) { const R = p.d / 2 + lip; pieces.push([circleContour(R, R, R), circleContour(R, R, p.d / 2)]); }
      }
      return packPieces(pieces).contours;
    },
  },
  {
    id: "cone", name: "Round reducer / cone (flat pattern)", icon: "◠", group: "duct", noResize: true,
    aka: "cone reducer funnel hopper frustum round to round transition flat pattern development",
    tip: "Flat pattern for a round-to-round cone (a reducer or funnel). Sizes are to the sheet's centre-line. Roll it and weld the straight edge.",
    params: [["d", "Big end Ø", 300], ["d2", "Small end Ø", 120], ["h", "Straight height", 200]],
    make: (p) => {
      if (!(p.d > 0 && p.d2 > 0 && p.h > 0)) return [];
      const cd = coneDevelopment(p.d, p.d2, p.h);
      if (!cd || cd.Ro > 2600) return [];
      const a0 = Math.PI / 2 + cd.ang / 2, a1 = Math.PI / 2 - cd.ang / 2;       // centred on straight up, apex at the origin
      const outer = [[cd.Ro * Math.cos(a0), cd.Ro * Math.sin(a0)], ...arcPoints(0, 0, cd.Ro, a0, a1, false)];
      const inner = [[cd.Ri * Math.cos(a1), cd.Ri * Math.sin(a1)], ...arcPoints(0, 0, cd.Ri, a1, a0, true)];
      return [{ pts: dedupe([...outer, ...inner]), closed: true }];
    },
  },
  {
    id: "tube", name: "Rolled tube blank", icon: "▭", group: "duct", aka: "tube cylinder pipe rolled blank flat pattern wrap",
    tip: "Flat blank for a rolled tube or cylinder: a rectangle as long as the circumference. Diameter is to the sheet's centre-line.",
    fit: (p, W, H) => ({ ...p, d: W / Math.PI, h: H }),
    params: [["d", "Tube Ø", 100], ["h", "Length of the tube", 150]],
    make: (p) => [{ pts: [[0, 0], [Math.PI * p.d, 0], [Math.PI * p.d, p.h], [0, p.h]], closed: true }],
  },
];

// order the points of a closed outline counter-clockwise starting from the first point (used where a corner was rounded)
function sortCcw(pts) { return signedArea(pts) < 0 ? [...pts].reverse() : pts; }

// Text tool engine: turns typed text into closed cutting outlines (mm). Pure maths, no DOM.
// The letters are single-line (Hershey) strokes, thickened to a chosen stroke width by a distance field and traced with marching
// squares. That keeps every device identical (no system fonts), keeps the result a clean union of outlines, and makes the
// "stencil" option possible: the middle of an A, B, D, O, P, Q, R (and 4, 6, 8, 9, 0...) is joined to the plate by a small bridge,
// so the centres do not fall out when the letters are cut as holes in a plate.
import { FONT_DATA } from "./fontdata.js";
import { march, simplifyRing, ringArea } from "./trace.js";

export const TEXT_FONTS = [
  { id: "sans", name: "Sans (plain, easy to cut)" },
  { id: "serif", name: "Serif (classic)" },
  { id: "script", name: "Script (joined letters)" },
];
const BASE = 22, CAP = 21;
const cache = new Map();

function parsePath(d) {
  const out = [];
  for (const part of d.split("M")) {
    const nums = [...part.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [+m[1], BASE - +m[2]]);
    if (nums.length) out.push(nums);
  }
  return out;
}
function glyph(font, ch) {
  const key = font + ch;
  if (cache.has(key)) return cache.get(key);
  const f = FONT_DATA[font] || FONT_DATA.sans;
  const code = ch.charCodeAt(0);
  let g;
  if (code === 32 || code === 160) g = { strokes: [], adv: 14 };
  else {
    const e = f.chars[code - 33] || f.chars["?".charCodeAt(0) - 33];
    g = { strokes: parsePath(e[0]), adv: e[1] * 2 };
  }
  cache.set(key, g);
  return g;
}

// a sensible stroke width for a letter height: wide enough to be cut cleanly, narrow enough to stay a letter
export const defaultWeight = (size) => Math.max(2.5, Math.round(size * 0.13 * 10) / 10);

// laid-out strokes in mm: [{pts:[[x,y],...]}] with the first baseline at y = 0, lines stepping downward
export function layoutText(text, o = {}) {
  const font = o.font || "sans", size = Math.max(1, Number(o.size) || 40), spacing = Number(o.spacing) || 0;
  const lh = size * 1.6 * (Number(o.lineSpacing) || 1), s = size / CAP;
  const align = o.align || "left";
  const lines = String(text == null ? "" : text).replace(/\t/g, "  ").split(/\r?\n/);
  const laid = lines.map((ln) => {
    let x = 0; const items = [];
    for (const ch of [...ln]) { const g = glyph(font, ch); items.push({ g, x }); x += g.adv * s + spacing; }
    return { items, w: Math.max(0, x - spacing) };
  });
  const maxW = Math.max(1, ...laid.map((l) => l.w));
  const strokes = [];
  laid.forEach((l, k) => {
    const off = align === "center" ? (maxW - l.w) / 2 : align === "right" ? maxW - l.w : 0;
    for (const it of l.items) for (const st of it.g.strokes) {
      strokes.push({ line: k, pts: st.map(([gx, gy]) => [off + it.x + gx * s, gy * s - k * lh]) });
    }
  });
  return { strokes, maxW, lh, size };
}

// bend the laid-out strokes round a circle. sweep = degrees the widest line spans: + arches up (centre below), - hangs like a smile
export function curveStrokes(lay, sweepDeg) {
  const sw = Math.max(-340, Math.min(340, Number(sweepDeg) || 0));
  if (!sw) return lay.strokes;
  const nLines = Math.max(...lay.strokes.map((s) => s.line), 0) + 1;
  const minR = lay.size * 1.2 + nLines * lay.lh;
  let R = lay.maxW / (sw * Math.PI / 180);
  if (Math.abs(R) < minR) R = Math.sign(R) * minR;
  const xc = lay.maxW / 2, maxSeg = lay.size / 10;
  return lay.strokes.map((st) => {
    const pts = [];
    for (let i = 0; i < st.pts.length; i++) {
      const a = st.pts[i];
      if (i) {
        const p = st.pts[i - 1], n = Math.ceil(Math.hypot(a[0] - p[0], a[1] - p[1]) / maxSeg);
        for (let k = 1; k < n; k++) pts.push([p[0] + (a[0] - p[0]) * k / n, p[1] + (a[1] - p[1]) * k / n]);
      }
      pts.push(a);
    }
    const bend = ([x, y]) => {
      const b = -st.line * lay.lh, yy = y - b;
      const th = (x - xc) / (R + b), r = R + b + yy;
      return [xc + r * Math.sin(th), r * Math.cos(th) - R];
    };
    return { line: st.line, pts: pts.map(bend) };
  });
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 1e-18 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// thick strokes -> signed distance grid (negative inside a stroke)
function strokeField(strokes, weight, cellWanted) {
  const r = weight / 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (!isFinite(x0)) return null;
  const area = (x1 - x0 + 2 * r + 4) * (y1 - y0 + 2 * r + 4);
  const c = Math.max(cellWanted, Math.sqrt(area / 2.6e6));
  const ox = x0 - r - 2 * c, oy = y0 - r - 2 * c;
  const nx = Math.ceil((x1 - x0 + 2 * r + 4 * c) / c) + 2, ny = Math.ceil((y1 - y0 + 2 * r + 4 * c) / c) + 2;
  const F = new Float32Array(nx * ny).fill(2 * c);
  const reach = r + 2 * c;
  for (const s of strokes) {
    const P = s.pts;
    for (let k = 0; k < Math.max(1, P.length - 1); k++) {
      const a = P[k], b = P[Math.min(k + 1, P.length - 1)];
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - ox) / c)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + reach - ox) / c));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - oy) / c)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + reach - oy) / c));
      for (let j = j0; j <= j1; j++) {
        const py = oy + j * c;
        for (let i = i0; i <= i1; i++) {
          const d = segDist(ox + i * c, py, a[0], a[1], b[0], b[1]) - r;
          const q = j * nx + i;
          if (d < F[q]) F[q] = d;
        }
      }
    }
  }
  return { F, nx, ny, c, ox, oy };
}

function sample(f, x, y) {
  const fx = (x - f.ox) / f.c, fy = (y - f.oy) / f.c;
  const i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= f.nx - 1 || j >= f.ny - 1) return 1;
  const tx = fx - i, ty = fy - j, F = f.F, q = j * f.nx + i;
  return (F[q] * (1 - tx) + F[q + 1] * tx) * (1 - ty) + (F[q + f.nx] * (1 - tx) + F[q + f.nx + 1] * tx) * ty;
}

function trace(f, tolMm) {
  const out = [];
  for (const r of march(f.F, f.nx, f.ny)) {
    const pts = r.map(([i, j]) => [f.ox + i * f.c, f.oy + j * f.c]);
    if (Math.abs(ringArea(pts)) < f.c * f.c * 3) continue;
    out.push(simplifyRing(pts, tolMm));
  }
  return out;
}

// cut a gap of width bw along a straight line out of the letter material (leaves plate material joining the two sides)
function cutBridge(f, a, b, bw) {
  const h = bw / 2, reach = h + 2 * f.c;
  const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - f.ox) / f.c)), i1 = Math.min(f.nx - 1, Math.ceil((Math.max(a[0], b[0]) + reach - f.ox) / f.c));
  const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - f.oy) / f.c)), j1 = Math.min(f.ny - 1, Math.ceil((Math.max(a[1], b[1]) + reach - f.oy) / f.c));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const v = h - segDist(f.ox + i * f.c, f.oy + j * f.c, a[0], a[1], b[0], b[1]);
    const q = j * f.nx + i;
    if (v > f.F[q]) f.F[q] = v;
  }
}

// bridge every enclosed counter to the outside: pass 0 straight up and down from the counter, pass 1 sideways, pass 2 diagonals
function bridgeCounters(f, rings, bw, pass) {
  const dirs = [[[0, 1], [0, -1]], [[1, 0], [-1, 0]], [[0.7071, 0.7071], [-0.7071, -0.7071]]][Math.min(pass, 2)];
  let made = 0;
  for (const ring of rings) {
    if (ringArea(ring) >= 0) continue;                       // outer outlines run counter-clockwise, counters clockwise
    for (const d of dirs) {
      let best = ring[0], bv = -Infinity;
      for (const p of ring) { const v = p[0] * d[0] + p[1] * d[1]; if (v > bv) { bv = v; best = p; } }
      const step = f.c * 0.5, maxLen = Math.max(f.nx, f.ny) * f.c;
      let len = step;
      while (len < maxLen && sample(f, best[0] + d[0] * len, best[1] + d[1] * len) < 0) len += step;
      // the first empty spot beyond the stroke: carry on a little, so the cut runs clean through
      const a = [best[0] - d[0] * bw * 0.5, best[1] - d[1] * bw * 0.5], b = [best[0] + d[0] * (len + bw * 0.5), best[1] + d[1] * (len + bw * 0.5)];
      cutBridge(f, a, b, bw); made++;
    }
  }
  return made;
}

// text -> closed outlines in mm.
// o: font, size (letter height), spacing (extra mm between letters), lineSpacing (x), align, weight (stroke width mm), curve (deg),
//    stencil (bridge counters), bridge (mm), plate (put it in a plate: margin mm, 0/false = no plate)
export function textToContours(text, o = {}) {
  const size = Math.max(1, Number(o.size) || 40);
  const weight = Math.max(0.6, Number(o.weight) || defaultWeight(size));
  const lay = layoutText(text, o);
  const strokes = curveStrokes(lay, o.curve);
  if (!strokes.length) return { contours: [], width: 0, height: 0, islands: 0, weight };
  const c0 = Math.max(0.05, weight / 6);
  const f = strokeField(strokes, weight, c0);
  const tol = Math.max(0.03, f.c * 0.3);
  let rings = trace(f, tol), bridges = 0, passes = 0;
  if (o.stencil) {
    const bw = Math.max(0.8, Number(o.bridge) || Math.max(2.5, weight * 0.45));
    for (let pass = 0; pass < 3; pass++) {
      if (!rings.some((r) => ringArea(r) < 0)) break;
      bridges += bridgeCounters(f, rings, bw, pass); passes++;
      rings = trace(f, tol);
    }
  }
  const islands = rings.filter((r) => ringArea(r) < 0).length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const margin = o.plate ? Math.max(1, Number(o.plate) || 0) : 0;
  const dx = margin - x0, dy = margin - y0;
  const contours = rings.map((r) => ({ pts: r.map(([x, y]) => [x + dx, y + dy]), closed: true }));
  const width = x1 - x0, height = y1 - y0;
  if (margin) {
    const W = width + 2 * margin, H = height + 2 * margin;
    contours.unshift({ pts: [[0, 0], [W, 0], [W, H], [0, H]], closed: true });
  }
  return { contours, width: margin ? width + 2 * margin : width, height: margin ? height + 2 * margin : height, islands, bridges, weight, cell: f.c };
}

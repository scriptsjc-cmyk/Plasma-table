// Shape maker: common plasma parts from a few sizes. Each shape returns contours (mm).
import { arcPoints, circleContour } from "./geom.js";

function roundedRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  if (r <= 0.01) return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true };
  const p = [[x + r, y], [x + w - r, y], ...arcPoints(x + w - r, y + r, r, -Math.PI / 2, 0, true),
    [x + w, y + h - r], ...arcPoints(x + w - r, y + h - r, r, 0, Math.PI / 2, true),
    [x + r, y + h], ...arcPoints(x + r, y + h - r, r, Math.PI / 2, Math.PI, true),
    [x, y + r], ...arcPoints(x + r, y + r, r, Math.PI, 1.5 * Math.PI, true)];
  p.pop(); // last arc point equals the first point
  return { pts: p, closed: true };
}
function slot(cx, cy, len, wid) {
  const r = wid / 2, s = Math.max(0, len - wid) / 2;
  if (s <= 0) return circleContour(cx, cy, r);
  const p = [[cx - s, cy - r], [cx + s, cy - r], ...arcPoints(cx + s, cy, r, -Math.PI / 2, Math.PI / 2, true),
    [cx - s, cy + r], ...arcPoints(cx - s, cy, r, Math.PI / 2, 1.5 * Math.PI, true)];
  p.pop();
  return { pts: p, closed: true };
}

export const SHAPES = [
  {
    id: "rect", name: "Rectangle / plate", icon: "▭",
    params: [["w", "Width", 100], ["h", "Height", 60], ["r", "Corner radius", 0]],
    make: (p) => [roundedRect(0, 0, p.w, p.h, p.r)],
  },
  {
    id: "plate", name: "Plate with holes", icon: "⊡",
    params: [["w", "Width", 120], ["h", "Height", 80], ["r", "Corner radius", 6], ["hole", "Hole Ø", 10], ["inset", "Hole centre from edge", 15], ["mid", "Centre hole Ø (0 = none)", 0]],
    make: (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      if (p.hole > 0) for (const [x, y] of [[p.inset, p.inset], [p.w - p.inset, p.inset], [p.w - p.inset, p.h - p.inset], [p.inset, p.h - p.inset]]) c.push(circleContour(x, y, p.hole / 2));
      if (p.mid > 0) c.push(circleContour(p.w / 2, p.h / 2, p.mid / 2));
      return c;
    },
  },
  {
    id: "disc", name: "Disc", icon: "●",
    params: [["d", "Diameter", 100]],
    make: (p) => [circleContour(p.d / 2, p.d / 2, p.d / 2)],
  },
  {
    id: "ring", name: "Ring / washer", icon: "◎",
    params: [["d", "Outside Ø", 100], ["id", "Inside Ø", 50]],
    make: (p) => [circleContour(p.d / 2, p.d / 2, p.d / 2), circleContour(p.d / 2, p.d / 2, p.id / 2)],
  },
  {
    id: "flange", name: "Flange", icon: "✺",
    params: [["d", "Outside Ø", 150], ["id", "Centre hole Ø", 60], ["pcd", "Bolt circle Ø (PCD)", 115], ["n", "Number of bolt holes", 4], ["hole", "Bolt hole Ø", 12]],
    make: (p) => {
      const R = p.d / 2, c = [circleContour(R, R, R)];
      if (p.id > 0) c.push(circleContour(R, R, p.id / 2));
      const n = Math.max(0, Math.round(p.n));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI + Math.PI / 2;
        c.push(circleContour(R + (p.pcd / 2) * Math.cos(a), R + (p.pcd / 2) * Math.sin(a), p.hole / 2));
      }
      return c;
    },
  },
  {
    id: "slot", name: "Slot / link", icon: "⊂⊃",
    params: [["len", "Length", 120], ["wid", "Width", 40], ["hole", "End holes Ø (0 = none)", 16]],
    make: (p) => {
      const c = [slot(p.len / 2, p.wid / 2, p.len, p.wid)];
      if (p.hole > 0 && p.len > p.wid) {
        c.push(circleContour(p.wid / 2, p.wid / 2, p.hole / 2), circleContour(p.len - p.wid / 2, p.wid / 2, p.hole / 2));
      }
      return c;
    },
  },
  {
    id: "gusset", name: "Gusset (triangle)", icon: "◣",
    params: [["a", "Bottom leg", 100], ["b", "Upright leg", 100], ["cut", "Corner cut-off", 10], ["hole", "Hole Ø (0 = none)", 0]],
    make: (p) => {
      const L = Math.hypot(p.a, p.b), k = Math.max(0, Math.min(p.cut, p.a * 0.4, p.b * 0.4));
      // right-angle triangle, the two sharp tips cut off by k mm
      const pts = k > 0
        ? [[0, 0], [p.a - k, 0], [p.a - (k * p.a) / L, (k * p.b) / L], [(k * p.a) / L, p.b - (k * p.b) / L], [0, p.b - k]]
        : [[0, 0], [p.a, 0], [0, p.b]];
      const c = [{ pts: dedupe(pts), closed: true }];
      if (p.hole > 0) c.push(circleContour(p.a / 3.2, p.b / 3.2, p.hole / 2));
      return c;
    },
  },
  {
    id: "bracket", name: "Bracket with slot", icon: "▯",
    params: [["w", "Width", 50], ["h", "Height", 120], ["r", "Corner radius", 8], ["slotLen", "Slot length", 40], ["slotWid", "Slot width", 10], ["hole", "Bottom hole Ø", 10]],
    make: (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      if (p.slotLen > 0 && p.slotWid > 0) {
        // vertical slot near the top: build horizontally then swap x/y
        const s = slot(0, 0, p.slotLen, p.slotWid);
        const cx = p.w / 2, cy = p.h - p.slotLen / 2 - Math.max(8, p.w * 0.25);
        c.push({ pts: s.pts.map(([x, y]) => [cx - y, cy + x]), closed: true });
      }
      if (p.hole > 0) c.push(circleContour(p.w / 2, Math.max(p.hole, p.w * 0.35), p.hole / 2));
      return c;
    },
  },
];

function dedupe(pts) {
  const out = [];
  for (const q of pts) if (!out.length || Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > 1e-6) out.push(q);
  return out;
}

// several copies in a grid
export function copies(contours, cols, rows, gap) {
  cols = Math.max(1, Math.round(cols)); rows = Math.max(1, Math.round(rows));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of contours) for (const [x, y] of c.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0, h = y1 - y0, out = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const dx = i * (w + gap), dy = j * (h + gap);
    for (const c of contours) out.push({ ...c, pts: c.pts.map(([x, y]) => [x + dx, y + dy]), circle: c.circle ? { ...c.circle, cx: c.circle.cx + dx, cy: c.circle.cy + dy } : undefined });
  }
  return out;
}

export function makeShape(id, values) {
  const s = SHAPES.find((x) => x.id === id);
  if (!s) throw new Error("Unknown shape.");
  const p = {};
  for (const [k, , d] of s.params) { const v = Number(values[k]); p[k] = Number.isFinite(v) ? v : d; }
  return s.make(p);
}

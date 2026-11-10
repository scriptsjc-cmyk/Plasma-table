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

function chamferRect(x, y, w, h, c) {
  c = Math.max(0, Math.min(c, w / 2 - 0.01, h / 2 - 0.01));
  if (c <= 0.01) return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true };
  return { pts: [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]], closed: true };
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
    tip: "Plain plate. Add a corner radius to round the corners.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 100], ["h", "Height", 60], ["r", "Corner radius", 0]],
    make: (p) => [roundedRect(0, 0, p.w, p.h, p.r)],
  },
  {
    id: "plate", name: "Plate with holes", icon: "⊡",
    tip: "Plate with a hole near each corner, and an optional middle hole.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
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
    tip: "Solid round disc.",
    uniform: true, fit: (p, W) => ({ ...p, d: W }),
    params: [["d", "Diameter", 100]],
    make: (p) => [circleContour(p.d / 2, p.d / 2, p.d / 2)],
  },
  {
    id: "ring", name: "Ring / washer", icon: "◎",
    tip: "Washer: a disc with a hole in the middle.",
    uniform: true, fit: (p, W) => ({ ...p, d: W, id: (p.id * W) / p.d }),
    params: [["d", "Outside Ø", 100], ["id", "Inside Ø", 50]],
    make: (p) => [circleContour(p.d / 2, p.d / 2, p.d / 2), circleContour(p.d / 2, p.d / 2, p.id / 2)],
  },
  {
    id: "flange", name: "Flange", icon: "✺",
    tip: "Round flange with a centre hole and bolt holes.",
    uniform: true, fit: (p, W) => { const k = W / p.d; return { ...p, d: W, id: p.id * k, pcd: p.pcd * k }; },
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
    tip: "Link with round ends and a hole at each end.",
    fit: (p, W, H) => ({ ...p, len: W, wid: H }),
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
    tip: "Right-angle gusset with the sharp tips cut off.",
    fit: (p, W, H) => ({ ...p, a: W, b: H }),
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
    tip: "Upright bracket with a slot at the top and a hole at the bottom.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
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
  {
    id: "polygon", name: "Polygon (hex etc.)", icon: "⬡", uniform: true,
    tip: "Flat-sided shape: 6 sides makes a hexagon. Size is across the corners.",
    fit: (p, W) => ({ ...p, d: W }),
    params: [["n", "Number of sides", 6], ["d", "Size across corners", 100], ["r", "Corner radius", 0]],
    make: (p) => {
      const n = Math.max(3, Math.min(64, Math.round(p.n))), R = p.d / 2;
      const pts = [];
      for (let i = 0; i < n; i++) { const a = Math.PI / 2 + (i * 2 * Math.PI) / n; pts.push([R + R * Math.cos(a), R + R * Math.sin(a)]); }
      return [{ pts: p.r > 0 ? roundCorners(pts, p.r) : pts, closed: true }];
    },
  },
  {
    id: "triangle", name: "Triangle", icon: "△",
    tip: "Triangle with its point in the middle of the top.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Base", 100], ["h", "Height", 80], ["r", "Corner radius", 0]],
    make: (p) => {
      const pts = [[0, 0], [p.w, 0], [p.w / 2, p.h]];
      return [{ pts: p.r > 0 ? roundCorners(pts, p.r) : pts, closed: true }];
    },
  },
  {
    id: "chamfer", name: "Chamfered plate", icon: "▭",
    tip: "Plate with the corners cut off at an angle.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 100], ["h", "Height", 60], ["c", "Chamfer", 8]],
    make: (p) => [chamferRect(0, 0, p.w, p.h, p.c)],
  },
  {
    id: "slotted", name: "Slotted plate", icon: "▭",
    tip: "Plate with a slot through the middle, for adjustment bolts.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 120], ["h", "Height", 60], ["r", "Corner radius", 4], ["slotLen", "Slot length", 50], ["slotWid", "Slot width", 10]],
    make: (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      if (p.slotLen > 0 && p.slotWid > 0) c.push(slot(p.w / 2, p.h / 2, Math.min(p.slotLen, p.w - 8), Math.min(p.slotWid, p.h - 8)));
      return c;
    },
  },
  {
    id: "tab", name: "Plate with tab", icon: "⊓",
    tip: "Plate with a locating tab sticking out of one side – handy for a slot in another part.",
    fit: (p, W, H) => ({ ...p, w: Math.max(10, W - (p.tabH || 15)), h: H }),
    params: [["w", "Plate width", 80], ["h", "Plate height", 50], ["r", "Corner radius", 4], ["tabW", "Tab width", 20], ["tabH", "Tab length", 15], ["hole", "Hole Ø (0 = none)", 8]],
    make: (p) => {
      const tw = Math.min(p.tabW, p.w - 2), th = Math.max(0, p.tabH), mid = p.w / 2;
      const x0 = mid - tw / 2, x1 = mid + tw / 2;
      // tab on the bottom (−Y), plate above it
      const pts = [[0, th], [x0, th], [x0, 0], [x1, 0], [x1, th], [p.w, th], [p.w, th + p.h], [0, th + p.h]];
      const c = [{ pts: p.r > 0 ? roundCorners(pts, Math.min(p.r, tw / 2 - 0.1, th / 2 - 0.1, p.w / 4, p.h / 4)) : pts, closed: true }];
      if (p.hole > 0) c.push(circleContour(p.w / 2, th + p.h / 2, p.hole / 2));
      return c;
    },
  },
  {
    id: "hole", name: "Hole", icon: "○", hole: true,
    tip: "A round hole – select a part first and it drops in the middle.",
    uniform: true, fit: (p, W) => ({ ...p, d: W }),
    params: [["d", "Diameter", 20]],
    make: (p) => [circleContour(p.d / 2, p.d / 2, p.d / 2)],
  },
  {
    id: "slothole", name: "Slot hole", icon: "⊖", hole: true,
    tip: "A long hole with round ends – drop it on a part.",
    fit: (p, W, H) => ({ ...p, len: W, wid: H }),
    params: [["len", "Length", 40], ["wid", "Width", 12]],
    make: (p) => [slot(p.len / 2, p.wid / 2, p.len, p.wid)],
  },
  {
    id: "boltcircle", name: "Ring of holes", icon: "⁘", hole: true, multi: true, uniform: true,
    tip: "Holes evenly round a circle (bolt pattern) – drop it on a part.",
    fit: (p, W) => ({ ...p, pcd: Math.max(1, W - p.hole) }),
    params: [["n", "Number of holes", 6], ["pcd", "Circle Ø (PCD)", 80], ["hole", "Hole Ø", 10], ["start", "First hole angle °", 90]],
    make: (p) => {
      const n = Math.max(1, Math.min(72, Math.round(p.n))), R = p.pcd / 2, c = R + p.hole / 2, out = [];
      for (let i = 0; i < n; i++) { const a = ((p.start || 0) * Math.PI) / 180 + (i * 2 * Math.PI) / n; out.push(circleContour(c + R * Math.cos(a), c + R * Math.sin(a), p.hole / 2)); }
      return out;
    },
  },
  {
    id: "holegrid", name: "Grid of holes", icon: "⁙", hole: true, multi: true,
    tip: "Rows and columns of holes – drop it on a part.",
    fit: (p, W, H) => ({ ...p, sx: p.cols > 1 ? Math.max(p.hole, (W - p.hole) / (p.cols - 1)) : p.sx, sy: p.rows > 1 ? Math.max(p.hole, (H - p.hole) / (p.rows - 1)) : p.sy }),
    params: [["cols", "Across", 3], ["rows", "Up", 2], ["sx", "Spacing across", 30], ["sy", "Spacing up", 30], ["hole", "Hole Ø", 8]],
    make: (p) => {
      const out = [], cols = Math.max(1, Math.min(50, Math.round(p.cols))), rows = Math.max(1, Math.min(50, Math.round(p.rows))), r = p.hole / 2;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push(circleContour(r + i * p.sx, r + j * p.sy, r));
      return out;
    },
  },
];

// round every corner of a convex polygon with radius r
function roundCorners(pts, r) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))));
    let d = r / Math.tan(ang / 2);
    d = Math.min(d, l1 / 2 - 0.01, l2 / 2 - 0.01);
    const rr = d * Math.tan(ang / 2);
    const a = [p1[0] + (v1[0] / l1) * d, p1[1] + (v1[1] / l1) * d], b = [p1[0] + (v2[0] / l2) * d, p1[1] + (v2[1] / l2) * d];
    const bis = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2], bl = Math.hypot(...bis);
    const cd = Math.hypot(d, rr);
    const c = [p1[0] + (bis[0] / bl) * cd, p1[1] + (bis[1] / bl) * cd];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    out.push(a, ...arcPoints(c[0], c[1], rr, a0, a1, true));
  }
  return dedupe(out);
}

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

// Shape maker: common plasma parts from a few sizes. Each shape returns contours (mm).
import { arcPoints, circleContour, signedArea } from "./geom.js";
import { roundedRect, chamferRect, slot, roundCorners, dedupe } from "./shape-helpers.js";
import { FAB_SHAPES } from "./shapes-fab.js";

const MIN = 2;
const SIZE_KEYS = new Set(["w", "h", "d", "a", "b", "len", "wid", "s"]);

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
    uniform: true, fit: (p, W) => {
      const d = W, hole = Math.max(0, p.hole || 0);
      const maxPcd = Math.max(0, d - hole - 2);
      let pcd = Number(p.pcd) || 0;
      if (!(pcd > 0) || pcd > maxPcd) pcd = 115 * (d / 150);
      pcd = Math.min(Math.max(0, pcd), maxPcd);
      let id = Number(p.id) || 0;
      const maxId = Math.max(0, Math.min(pcd - hole - 2, d - 4));
      if (!(id > 0) || id > maxId) id = Math.min(60 * (d / 150), maxId);
      id = Math.min(Math.max(0, id), maxId);
      return { ...p, d, id, pcd, hole, n: Math.max(0, Math.min(36, Math.round(p.n || 0))) };
    },
    params: [["d", "Outside Ø (OD)", 150], ["id", "Centre hole Ø (ID)", 60], ["pcd", "Bolt circle Ø (PCD)", 115], ["n", "Number of bolt holes", 4], ["hole", "Bolt hole Ø", 12], ["start", "First hole angle °", 90]],
    make: (p) => {
      const d = p.d, hole = Math.max(0, p.hole || 0);
      const maxPcd = Math.max(0, d - hole - 2);
      const pcd = Math.min(Math.max(0, p.pcd || 0), maxPcd);
      const maxId = Math.max(0, Math.min(pcd > 0 ? pcd - hole - 2 : d - 4, d - 4));
      const id = Math.min(Math.max(0, p.id || 0), maxId);
      const R = d / 2, c = [circleContour(R, R, R)];
      if (id > 0) c.push(circleContour(R, R, id / 2));
      const n = Math.max(0, Math.min(36, Math.round(p.n || 0)));
      if (pcd > 0 && hole > 0) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 2 * Math.PI + (Number.isFinite(p.start) ? p.start : 90) * Math.PI / 180;
          c.push(circleContour(R + (pcd / 2) * Math.cos(a), R + (pcd / 2) * Math.sin(a), hole / 2));
        }
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
    fit: (p, W, H) => {
      const hole = Math.max(0, p.hole || 0);
      const r = Math.max(0, Math.min(p.r || 0, W / 2 - 0.2, H / 2 - 0.2));
      const margin = Math.max(r, 4) + 1;
      const slotWid = Math.min(Math.max(0, p.slotWid || 0), Math.max(0, W - 2 * margin));
      const holeRoom = hole > 0 ? hole + margin + 2 : 0;
      const slotLen = Math.min(Math.max(0, p.slotLen || 0), Math.max(0, H - 2 * margin - holeRoom));
      return { ...p, w: W, h: H, r, slotLen, slotWid, hole };
    },
    params: [["w", "Width", 50], ["h", "Height", 120], ["r", "Corner radius", 8], ["slotLen", "Slot length", 40], ["slotWid", "Slot width", 10], ["hole", "Bottom hole Ø", 10]],
    make: (p) => {
      const r = Math.max(0, Math.min(p.r || 0, p.w / 2 - 0.2, p.h / 2 - 0.2));
      const margin = Math.max(r, 4) + 1;
      const c = [roundedRect(0, 0, p.w, p.h, r)];
      const hole = Math.max(0, p.hole || 0);
      const holeY = hole > 0 ? Math.min(margin + hole / 2, p.h - margin) : 0;
      const slotWid = Math.min(Math.max(0, p.slotWid || 0), Math.max(0, p.w - 2 * margin));
      const slotLen = Math.min(Math.max(0, p.slotLen || 0), Math.max(0, p.h - (hole > 0 ? holeY + hole / 2 + 2 : 0) - 2 * margin));
      if (slotLen > 0 && slotWid > 0) {
        const s = slot(0, 0, slotLen, slotWid);
        const cx = p.w / 2, cy = p.h - margin - slotLen / 2;
        c.push({ pts: s.pts.map(([x, y]) => [cx - y, cy + x]), closed: true });
      }
      if (hole > 0 && holeY - hole / 2 >= 0.5 && holeY + hole / 2 <= p.h - 0.5)
        c.push(circleContour(p.w / 2, holeY, hole / 2));
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
    fit: (p, W, H) => {
      let tabH = Math.max(2, Number(p.tabH) || 15);
      let tabW = Math.max(2, Number(p.tabW) || 20);
      tabH = Math.min(tabH, Math.max(2, H * 0.4), Math.max(2, H - MIN));
      tabW = Math.min(tabW, Math.max(2, W - 4));
      return { ...p, w: W, h: Math.max(MIN, H - tabH), tabH, tabW };
    },
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
    id: "square", name: "Square", icon: "■",
    group: "basic",
    tip: "Square plate. You can round the corners.",
    uniform: true, fit: (p, W) => ({ ...p, s: W }),
    params: [["s", "Side", 100], ["r", "Corner radius", 0]],
    make: (p) => [roundedRect(0, 0, p.s, p.s, p.r)],
  },
  {
    id: "roundrect", name: "Rounded rectangle", icon: "▢",
    group: "basic",
    tip: "Rectangle with rounded corners, ready to cut.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 120], ["h", "Height", 70], ["r", "Corner radius", 12]],
    make: (p) => [roundedRect(0, 0, p.w, p.h, p.r)],
  },
  {
    id: "ellipse", name: "Ellipse", icon: "⬭",
    group: "basic",
    tip: "Oval disc – set the two diameters.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 120], ["h", "Height", 70]],
    make: (p) => {
      const rx = p.w / 2, ry = p.h / 2, n = Math.max(48, Math.round(Math.max(rx, ry) * 0.8));
      const pts = [];
      for (let i = 0; i < n; i++) { const a = (i * 2 * Math.PI) / n; pts.push([rx + rx * Math.cos(a), ry + ry * Math.sin(a)]); }
      return [{ pts, closed: true }];
    },
  },
  {
    id: "eqtriangle", name: "Equilateral triangle", icon: "▲",
    group: "basic",
    tip: "All three sides the same length.",
    uniform: true, fit: (p, W) => ({ ...p, s: W }),
    params: [["s", "Side", 100], ["r", "Corner radius", 0]],
    make: (p) => {
      const h = p.s * Math.sqrt(3) / 2;
      const pts = [[0, 0], [p.s, 0], [p.s / 2, h]];
      return [{ pts: p.r > 0 ? roundCorners(pts, p.r) : pts, closed: true }];
    },
  },
  {
    id: "rtriangle", name: "Right-angle triangle", icon: "◢",
    group: "basic",
    tip: "Right-angle triangle – handy as a simple gusset.",
    fit: (p, W, H) => ({ ...p, a: W, b: H }),
    params: [["a", "Base", 100], ["b", "Upright", 80], ["r", "Corner radius", 0]],
    make: (p) => {
      const pts = [[0, 0], [p.a, 0], [0, p.b]];
      return [{ pts: p.r > 0 ? roundCorners(pts, p.r) : pts, closed: true }];
    },
  },
  {
    id: "hexagon", name: "Hexagon", icon: "⬡",
    group: "basic",
    tip: "Regular hexagon. Size is across the corners (point to point).",
    uniform: true, fit: (p, W) => ({ ...p, d: W }),
    params: [["d", "Size across corners", 100], ["r", "Corner radius", 0]],
    make: (p) => SHAPES.find((s) => s.id === "polygon").make({ n: 6, d: p.d, r: p.r || 0 }),
  },
  {
    id: "octagon", name: "Octagon", icon: "⯃",
    group: "basic",
    tip: "Regular octagon. Size is across the corners.",
    uniform: true, fit: (p, W) => ({ ...p, d: W }),
    params: [["d", "Size across corners", 100], ["r", "Corner radius", 0]],
    make: (p) => SHAPES.find((s) => s.id === "polygon").make({ n: 8, d: p.d, r: p.r || 0 }),
  },
  {
    id: "star", name: "Star", icon: "★",
    group: "basic",
    tip: "Star with pointed tips. Good for signs and decorations.",
    uniform: true, fit: (p, W) => ({ ...p, d: W }),
    params: [["n", "Points", 5], ["d", "Outside size", 100], ["inner", "Inside size (ratio 0–1)", 0.4]],
    make: (p) => {
      const n = Math.max(3, Math.min(16, Math.round(p.n))), Ro = p.d / 2, Ri = Ro * Math.max(0.12, Math.min(0.9, p.inner || 0.4));
      const pts = [];
      for (let i = 0; i < n * 2; i++) {
        const R = i % 2 === 0 ? Ro : Ri, a = Math.PI / 2 + (i * Math.PI) / n;
        pts.push([Ro + R * Math.cos(a), Ro + R * Math.sin(a)]);
      }
      return [{ pts, closed: true }];
    },
  },
  {
    id: "sector", name: "Sector / arc segment", icon: "◷",
    group: "basic",
    tip: "A pie slice, or a curved segment if you set an inside diameter.",
    fit: (p, W, H) => ({ ...p, d: W }),
    params: [["d", "Outside Ø", 120], ["id", "Inside Ø (0 = pie slice)", 0], ["ang", "Angle °", 90]],
    make: (p) => {
      const Ro = p.d / 2, Ri = Math.max(0, Math.min(p.id / 2, Ro - 0.5));
      const a = Math.max(5, Math.min(350, p.ang)) * Math.PI / 180;
      const a0 = Math.PI / 2 - a / 2, a1 = Math.PI / 2 + a / 2, cx = Ro, cy = Ro;
      const outer = arcPoints(cx, cy, Ro, a0, a1, true);
      if (Ri <= 0.2) return [{ pts: [[cx, cy], ...outer], closed: true }];
      const inner = arcPoints(cx, cy, Ri, a1, a0, false);
      return [{ pts: [...outer, ...inner], closed: true }];
    },
  },
  {
    id: "lbracket", name: "L-bracket (flat)", icon: "⌐",
    group: "plasma",
    tip: "Flat mounting bracket in an L, with a hole in each leg.",
    fit: (p, W, H) => ({ ...p, a: W, b: H }),
    params: [["a", "Long leg", 120], ["b", "Short leg", 80], ["t", "Leg width", 25], ["r", "Corner radius", 4], ["hole", "Hole Ø (0 = none)", 8], ["inset", "Hole from end", 16]],
    make: (p) => {
      const t = Math.max(2, Math.min(p.t, p.a - 1, p.b - 1));
      const pts = [[0, 0], [p.a, 0], [p.a, t], [t, t], [t, p.b], [0, p.b]];
      const c = [{ pts: p.r > 0 ? roundCorners(pts, Math.min(p.r, t / 2 - 0.2)) : pts, closed: true }];
      if (p.hole > 0) {
        const ins = Math.max(p.hole / 2 + 1, Math.min(p.inset, p.a - p.hole / 2 - 1, t - 0.5));
        c.push(circleContour(p.a - ins, t / 2, p.hole / 2));
        const insB = Math.max(p.hole / 2 + 1, Math.min(p.inset, p.b - p.hole / 2 - 1, t - 0.5));
        c.push(circleContour(t / 2, p.b - insB, p.hole / 2));
      }
      return c;
    },
  },
  {
    id: "keyhole", name: "Keyhole", icon: "🔑",
    group: "plasma",
    tip: "Keyhole slot for hanging a plate on a screw head.",
    fit: (p, W, H) => ({ ...p, d: Math.min(W, H), slot: Math.max(H, W) }),
    params: [["d", "Round end Ø", 16], ["slotWid", "Slot width", 8], ["slotLen", "Slot length", 20]],
    make: (p) => {
      const R = p.d / 2, w = Math.max(1, Math.min(p.slotWid, p.d - 0.4));
      // the slot must reach below the point where its walls meet the round end, or the outline folds back on itself
      const L = Math.max(w, p.slotLen, Math.sqrt(Math.max(0, R * R - (w / 2) * (w / 2))));
      const half = w / 2, cx = R, cy = R;
      const ang = Math.acos(Math.max(-1, Math.min(1, half / R)));
      // circle on top, slot hanging down; outline around both
      const aL = Math.PI * 1.5 - ang, aR = Math.PI * 1.5 + ang; // wait: down is 3pi/2? No, y is up, bottom of circle is angle -PI/2 or 3PI/2
      // slot goes in -Y? Our coords: y up, shape sits on y=0. Put circle at top, slot down toward y=0.
      // Circle centre at (R, L - half)? Total height = L/2 wait.
      // Circle centre (R, R), slot extends downward? that would go negative. Put slot downward in +Y? We'll put circle at the top: centre (R, slotLen + something).
      // Height = slotLen + R (from slot bottom cap to top of circle). Slot bottom cap at y=0, centre of bottom cap at (R, half), slot up to the circle.
      const cxc = R, cyc = L - half + R; // circle centre
      // actually if slot length is the length of the straight+bottom, total from bottom of slot to centre of circle ≈ L - half? Let's define slotLen as centre of circle to centre of slot-end.
      const endY = 0, mid = R; // x
      const ccx = R, ccy = L; // circle centre at y=L, slot end centre at y=0? distance L. Bottom cap radius = half, so bottom at -half? Shift up by half.
      const shift = half;
      const Cx = R, Cy = L + shift, Ey = shift;
      const alpha = Math.acos(Math.max(-1, Math.min(1, half / R)));
      // at the circle, the slot walls meet at angles: straight down is -PI/2 (or 3PI/2), walls at -PI/2 ± alpha? Walls are vertical at x = R±half, intersection with circle.
      const aStart = -Math.PI / 2 + alpha, aEnd = -Math.PI / 2 - alpha + 2 * Math.PI; // go the long way around the top
      // from right wall-circle join, around the top to the left join (CCW or the major arc).
      // Right join angle = 0-ish: join is at angle atan2(Ey+...):
      // point: (Cx+half, ?) wait vertical walls at x=Cx±half, circle (x-Cx)^2+(y-Cy)^2=R^2
      // y = Cy - sqrt(R^2 - half^2)  (lower intersections — we want the lower ones to connect to the slot)
      const drop = Math.sqrt(Math.max(0, R * R - half * half));
      const jy = Cy - drop;
      const aRight = Math.atan2(jy - Cy, (Cx + half) - Cx); // should be ~ -alpha from -PI/2? atan2(-drop, +half)
      const aLeft = Math.atan2(jy - Cy, (Cx - half) - Cx);  // atan2(-drop, -half)
      // Major arc from right join going down? We want the LONG arc going up around the top: from aRight to aLeft passing PI/2 (north).
      // aRight is in Q4 (~ -0.5), aLeft in Q3 (~ PI+). CCW from aRight to aLeft would go through 0, PI/2, PI — that's the top. Good if aRight is the right join (positive x).
      const outer = arcPoints(Cx, Cy, R, aRight, aLeft, true);
      const bot = arcPoints(Cx, Ey, half, Math.PI, 0, false); // from left to right around the bottom (clockwise, y=0 side)
      // left wall down from left join to left of bottom cap: (Cx-half, jy) to (Cx-half, Ey)
      const pts = [[Cx - half, jy], [Cx - half, Ey], ...arcPoints(Cx, Ey, half, Math.PI, 2 * Math.PI, true), [Cx + half, jy], ...outer];
      // tidy
      return [{ pts: dedupe(pts), closed: true }];
    },
  },
  {
    id: "dshape", name: "D-shape", icon: "Ⓓ",
    group: "plasma",
    tip: "Round plate with one flat – a D-washer or D-hole plate.",
    fit: (p, W, H) => ({ ...p, d: Math.max(W, H) }),
    params: [["d", "Diameter", 80], ["flat", "Flat inset from edge", 16]],
    make: (p) => {
      const R = p.d / 2, f = Math.max(0.5, Math.min(p.flat, R * 1.5));
      const xFlat = R - (R - Math.min(f, R * 0.95)); // distance from left (x=0 is left of circle)
      // circle centred at (R,R). Flat is a vertical chord at x = f from the left edge? "inset from edge" = how much is cut off the left of the circle.
      const cut = Math.max(0.5, Math.min(f, R * 1.6));
      const x = cut; // if we cut from the left, chord at x=cut, centre at x=R
      const dx = R - cut;
      if (Math.abs(dx) >= R - 0.2) return [circleContour(R, R, R)];
      const hy = Math.sqrt(Math.max(0, R * R - dx * dx));
      const a0 = Math.atan2(-hy, -dx), a1 = Math.atan2(hy, -dx); // left side angles; we want the LONG arc on the right
      // from bottom of chord around the right to the top: from a0 (lower left) CCW the long way? Lower chord point is left-bottom, angle ≈ ±(PI - alpha).
      // a0 = atan2(-hy, centre-relative x of chord: cut-R = -dx if dx=R-cut>0, chord is left of centre, rel x = -dx.
      // atan2(-hy, -dx) is in Q3, atan2(hy,-dx) Q2. CCW from Q3 to Q2 is the short left arc. We want the major (right) arc: from top (Q2) going CCW all the way through right to Q3... from a1 down the other way, or from a0 CCW passing 0, PI/2? 
      // From a0 (Q3, ~ -2.5) CCW to a1 (Q2, ~2.5) passes -2.5 → 0 → 1.5 → 2.5? That's the RIGHT side (east). Wait Q3 CCW goes to Q4 then Q1 then Q2 — that's the right and top? Q3 is lower-left, CCW to Q4 (lower-right) to Q1 (upper-right) to Q2 (upper-left). Yes, the major arc if the flat is on the left. Good.
      const arc = arcPoints(R, R, R, a0, a1, true);
      return [{ pts: [[cut, R - hy], ...arc], closed: true }];
    },
  },
  {
    id: "plus", name: "Cross / plus", icon: "✚",
    group: "plasma",
    tip: "Plus-shaped plate, with an optional hole in the middle.",
    uniform: true, fit: (p, W) => ({ ...p, s: W }),
    params: [["s", "Overall size", 100], ["arm", "Arm width", 30], ["r", "Corner radius", 4], ["hole", "Centre hole Ø (0 = none)", 0]],
    make: (p) => {
      const s = p.s, a = Math.max(2, Math.min(p.arm, s - 2)), u = (s - a) / 2;
      const pts = [
        [u, 0], [u + a, 0], [u + a, u], [s, u], [s, u + a], [u + a, u + a], [u + a, s],
        [u, s], [u, u + a], [0, u + a], [0, u], [u, u],
      ];
      const c = [{ pts: p.r > 0 ? roundCorners(pts, Math.min(p.r, a / 2 - 0.2, u - 0.2)) : pts, closed: true }];
      if (p.hole > 0) c.push(circleContour(s / 2, s / 2, p.hole / 2));
      return c;
    },
  },
  {
    id: "arrow", name: "Arrow", icon: "➤",
    group: "plasma",
    tip: "Arrow plate – for signs, pointers and jigs.",
    fit: (p, W, H) => ({ ...p, len: W, wid: H }),
    params: [["len", "Length", 140], ["wid", "Head width", 70], ["head", "Head length", 50], ["shaft", "Shaft width", 28]],
    make: (p) => {
      const L = p.len, W = p.wid, H = Math.max(4, Math.min(p.head, L - 2)), S = Math.max(2, Math.min(p.shaft, W - 0.5));
      const y0 = (W - S) / 2;
      const pts = [[0, y0], [L - H, y0], [L - H, 0], [L, W / 2], [L - H, W], [L - H, y0 + S], [0, y0 + S]];
      return [{ pts, closed: true }];
    },
  },
  {
    id: "link", name: "Chain link / oval ring", icon: "⦾",
    group: "plasma",
    tip: "Oval ring (a slot with a slot cut out) – a chain link or lashing eye.",
    fit: (p, W, H) => ({ ...p, len: W, wid: H }),
    params: [["len", "Length", 80], ["wid", "Width", 40], ["thick", "Ring thickness", 8]],
    make: (p) => {
      const t = Math.max(1, Math.min(p.thick, p.wid / 2 - 1, p.len / 2 - 1));
      return [slot(p.len / 2, p.wid / 2, p.len, p.wid), slot(p.len / 2, p.wid / 2, p.len - 2 * t, p.wid - 2 * t)];
    },
  },
  {
    id: "sign", name: "Sign blank", icon: "▢",
    group: "plasma",
    tip: "Rounded plate with a hanging hole – a sign or name plate.",
    fit: (p, W, H) => ({ ...p, w: W, h: H }),
    params: [["w", "Width", 150], ["h", "Height", 80], ["r", "Corner radius", 12], ["hole", "Hanging hole Ø (0 = none)", 8], ["inset", "Hole from top", 14]],
    make: (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      if (p.hole > 0) c.push(circleContour(p.w / 2, p.h - Math.max(p.hole / 2 + 2, p.inset), p.hole / 2));
      return c;
    },
  },
  {
    id: "hook", name: "Hook", icon: "J",
    group: "plasma",
    tip: "J-hook with a hanging hole in the shaft.",
    fit: (p, W, H) => ({ ...p, h: H, opening: Math.max(10, W - 2 * (p.t || 12)) }),
    params: [["h", "Height", 90], ["opening", "Throat / opening", 28], ["t", "Thickness", 12], ["hole", "Hanging hole Ø (0 = none)", 8]],
    make: (p) => {
      const t = Math.max(4, p.t), gap = Math.max(t + 2, p.opening), Ri = gap / 2, Ro = Ri + t;
      const Cx = Ro, Cy = Ro, h = Math.max(Cy + Ro + 8, p.h);
      const aTip = Math.PI / 18; // slight upturn past east
      const pts = [
        [0, h],
        [0, Cy],
        ...arcPoints(Cx, Cy, Ro, Math.PI, aTip, true),             // CCW: west → south → east
        [Cx + Ri * Math.cos(aTip), Cy + Ri * Math.sin(aTip)],     // tip cap
        ...arcPoints(Cx, Cy, Ri, aTip, Math.PI, false),            // CW back along the inside
        [t, h],
      ];
      const c = [{ pts: dedupe(pts), closed: true }];
      if (p.hole > 0 && h - Cy > p.hole + 8) c.push(circleContour(t / 2, h - Math.max(p.hole / 2 + 4, t), Math.min(p.hole / 2, t / 2 - 0.6)));
      return c;
    },
  },
  {
    id: "shelf", name: "Shelf bracket", icon: "⌊",
    group: "plasma",
    tip: "Shelf bracket: an L with a solid triangular web and mounting holes.",
    fit: (p, W, H) => ({ ...p, a: W, b: H }),
    params: [["a", "Shelf length", 120], ["b", "Wall length", 120], ["t", "Leg width", 20], ["r", "Corner radius", 4], ["hole", "Hole Ø (0 = none)", 6], ["inset", "Hole from end", 16]],
    make: (p) => {
      const t = Math.max(2, Math.min(p.t, p.a * 0.45, p.b * 0.45));
      // solid web: from the inside of the L, a diagonal at the inner corner — the outline is a pentagon
      const pts = [[0, 0], [p.a, 0], [p.a, t], [t, p.b], [0, p.b]];
      const c = [{ pts: p.r > 0 ? roundCorners(pts, Math.min(p.r, t - 0.2)) : pts, closed: true }];
      if (p.hole > 0) {
        const ins = Math.max(p.hole / 2 + 1, p.inset);
        c.push(circleContour(Math.min(p.a - ins, p.a - t / 2), t / 2, p.hole / 2));
        c.push(circleContour(t / 2, Math.min(p.b - ins, p.b - t / 2), p.hole / 2));
        // the extra middle holes are skipped when they would overlap the end hole (double-cut)
        const gap = 2 * p.hole;
        if (p.a > 80 && Math.abs((t + (p.a - t) * 0.45) - Math.min(p.a - ins, p.a - t / 2)) > gap) c.push(circleContour(t + (p.a - t) * 0.45, t / 2, p.hole / 2));
        if (p.b > 80 && Math.abs((t + (p.b - t) * 0.45) - Math.min(p.b - ins, p.b - t / 2)) > gap) c.push(circleContour(t / 2, t + (p.b - t) * 0.45, p.hole / 2));
      }
      return c;
    },
  },
  {
    id: "heart", name: "Heart", icon: "♥",
    group: "plasma",
    tip: "A heart – for decorations and signs.",
    uniform: true, fit: (p, W) => ({ ...p, d: W }),
    params: [["d", "Width", 80]],
    make: (p) => {
      const d = Math.max(MIN, p.d), r = d / 4, cx1 = r, cx2 = 3 * r, cy = r, tipY = d * 0.95;
      const dent = 0.45; // leave a wide cleft so a kerf-offset doesn't pinch
      const pts = [
        ...arcPoints(cx1, cy, r, Math.PI, -dent, true),
        ...arcPoints(cx2, cy, r, Math.PI + dent, 0, true),
        [d, cy],
        [d / 2, tipY],
        [0, cy],
      ];
      return [{ pts: dedupe(pts), closed: true }];
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
].concat(FAB_SHAPES);

// several copies in a grid
export function copies(contours, cols, rows, gap) {
  cols = Math.max(1, Math.min(50, Math.round(cols) || 1)); rows = Math.max(1, Math.min(50, Math.round(rows) || 1));
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
  for (const [k, , d] of s.params) {
    if (values[k] === undefined || values[k] === null || values[k] === "") { p[k] = d; continue; }
    const v = Number(values[k]);
    p[k] = Number.isFinite(v) ? v : (SIZE_KEYS.has(k) ? NaN : d);
  }
  if ("n" in p) p.n = Math.max(0, Math.min(64, Math.round(p.n)));
  if ("cols" in p) p.cols = Math.max(1, Math.min(50, Math.round(p.cols)));
  if ("rows" in p) p.rows = Math.max(1, Math.min(50, Math.round(p.rows)));
  const MAX = 2600;
  for (const k of SIZE_KEYS) if (k in p && !(p[k] >= MIN && p[k] <= MAX)) return [];
  for (const k of Object.keys(p)) {
    if (["n", "cols", "rows"].includes(k)) continue;
    if (!Number.isFinite(p[k])) return [];
    if (p[k] > MAX) return [];
  }
  let cs;
  try { cs = s.make(p); } catch (e) { return []; }
  return (cs || []).filter((c) => c && c.pts && c.pts.length >= 3 && c.pts.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])) && Math.abs(signedArea(c.pts)) > 0.01);
}


export const SHAPE_GROUPS = [
  { id: "basic", name: "Basic", ids: ["square", "rect", "roundrect", "chamfer", "disc", "ellipse", "eqtriangle", "rtriangle", "triangle", "polygon", "hexagon", "octagon", "star", "slot", "sector", "ring"] },
  { id: "plasma", name: "Plasma / fab", ids: ["plate", "slotted", "slot2", "baseplate", "tab", "lbracket", "bracket", "tplate", "strap", "gusset", "wgusset", "shelf", "lug", "banjo", "keyhole", "dshape", "plus", "arrow", "link", "sign", "hook", "heart"] },
  { id: "flanges", name: "Flanges & washers", ids: ["flange4", "flange6", "flange8", "flange10", "flange12", "flangeblind", "flange", "ring", "sqwasher", "frame"] },
  { id: "duct", name: "Duct & rolled", ids: ["s2r", "cone", "tube"] },
  { id: "holes", name: "Holes", ids: ["hole", "slothole", "boltcircle", "cornerholes", "holerow", "holegrid"] },
];

// Library tiles that are a shape with some sizes already set (so "Flange – 6 holes" is one tap). id -> { base shape, sizes }.
// Bolt holes start half a step round from the top so they straddle the centre lines, as on a standard flange.
const flangeP = (n) => ({ n, start: 90 + 180 / n });
export const SHAPE_PRESETS = {
  flange4: { base: "flange", name: "Flange – 4 holes", tip: "Round flange with 4 bolt holes. Set the outside Ø, centre hole Ø, bolt circle Ø (PCD) and bolt hole Ø.", p: flangeP(4) },
  flange6: { base: "flange", name: "Flange – 6 holes", tip: "Round flange with 6 bolt holes. Set the outside Ø, centre hole Ø, bolt circle Ø (PCD) and bolt hole Ø.", p: flangeP(6) },
  flange8: { base: "flange", name: "Flange – 8 holes", tip: "Round flange with 8 bolt holes. Set the outside Ø, centre hole Ø, bolt circle Ø (PCD) and bolt hole Ø.", p: { ...flangeP(8), d: 200, id: 80, pcd: 160 } },
  flange10: { base: "flange", name: "Flange – 10 holes", tip: "Round flange with 10 bolt holes. Set the outside Ø, centre hole Ø, bolt circle Ø (PCD) and bolt hole Ø.", p: { ...flangeP(10), d: 250, id: 100, pcd: 200 } },
  flange12: { base: "flange", name: "Flange – 12 holes", tip: "Round flange with 12 bolt holes. Set the outside Ø, centre hole Ø, bolt circle Ø (PCD) and bolt hole Ø.", p: { ...flangeP(12), d: 300, id: 120, pcd: 250 } },
  flangeblind: { base: "flange", name: "Blind flange (no centre hole)", tip: "Round flange with bolt holes and no centre hole.", p: { id: 0, n: 8, start: 90 + 22.5, d: 200, pcd: 160 } },
};
export const presetOrShape = (id) => (SHAPE_PRESETS[id] ? { ...SHAPES.find((s) => s.id === SHAPE_PRESETS[id].base), ...SHAPE_PRESETS[id], id, presetOf: SHAPE_PRESETS[id].base } : SHAPES.find((s) => s.id === id));


export function defaultParams(sh) {
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  return p;
}

export function shapeThumb(sh, w = 64, h = 48) {
  const p = { ...defaultParams(sh), ...(sh.presetOf ? sh.p : {}) };
  let cs;
  try { cs = sh.make(p); } catch (e) { return ""; }
  if (!cs || !cs.length) return "";
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of (c.pts || [])) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bw = Math.max(1e-6, x1 - x0), bh = Math.max(1e-6, y1 - y0);
  const pad = 4, s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = (w - bw * s) / 2 - x0 * s, oy = (h + bh * s) / 2 + y0 * s;
  const d = cs.map((c) => {
    const pts = c.pts || [];
    if (!pts.length) return "";
    return pts.map((pt, i) => `${i ? "L" : "M"}${(ox + pt[0] * s).toFixed(2)},${(oy - pt[1] * s).toFixed(2)}`).join(" ") + " Z";
  }).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="currentColor" fill-rule="evenodd"></path></svg>`;
}

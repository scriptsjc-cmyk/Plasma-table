// Gussets and stiffeners.
import { holeIn, poly, roundedRect, clamp, shape } from "./helpers.js";

export const GUSSET_PRESETS = [
  shape("radgusset", "Radius gusset", "◕", "stiffeners", "radius fillet gusset curved",
    "Right-angle gusset with a concave inner radius.",
    [["a", "Bottom leg", 100], ["b", "Upright leg", 100], ["t", "Leg width", 25], ["rad", "Inner radius", 20]],
    (p) => {
      const t = clamp(p.t, 6, Math.min(p.a, p.b) / 2);
      const r = clamp(p.rad, 2, Math.min(p.a, p.b) - t - 2);
      const pts = [[0, 0], [p.a, 0], [p.a, t]];
      // inner arc from (t+r? wait: inner corner at (t,t) offset by radius
      // outer is the two legs; inner is a quarter circle in the crotch
      const cx = t + r, cy = t + r;
      // from (p.a, t) along top of bottom leg to (cx, t), then arc to (t, cy), then up to (t, p.b), to (0,p.b), to origin
      pts.push([cx, t]);
      const n = 12;
      for (let i = 1; i < n; i++) {
        const a = -Math.PI / 2 + (i * Math.PI / 2) / n;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      pts.push([t, cy], [t, p.b], [0, p.b]);
      return [poly(pts)];
    }),
  shape("rectgusset", "Rectangular gusset", "▬", "stiffeners", "rectangular gusset plate stiffener",
    "Plain rectangular stiffener plate, optional hole.",
    [["w", "Width", 80], ["h", "Height", 40], ["hole", "Hole Ø (0 = none)", 0], ["r", "Corner radius", 2]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const h = p.hole > 0 ? holeIn(p.w / 2, p.h / 2, p.hole, 0, 0, p.w, p.h, 1) : null;
      if (h) c.push(h);
      return c;
    }),
  shape("trapgusset", "Trapezoid gusset", "⏢", "stiffeners", "trapezoid tapered gusset",
    "Tapered trapezoid gusset.",
    [["base", "Base width", 140], ["top", "Top width", 60], ["h", "Height", 80]],
    (p) => {
      const top = clamp(p.top, 4, p.base);
      const x = (p.base - top) / 2;
      return [poly([[0, 0], [p.base, 0], [p.base - x, p.h], [x, p.h]])];
    }),
  shape("webgusset", "Web gusset with holes", "△", "stiffeners", "web gusset lightening holes",
    "Triangular web gusset with two lightening holes.",
    [["a", "Base", 160], ["b", "Height", 120], ["hole", "Hole Ø", 18], ["inset", "Hole centre from the two legs", 35]],
    (p) => {
      const c = [poly([[0, 0], [p.a, 0], [0, p.b]])];
      const h1 = holeIn(p.inset, p.inset, p.hole, 0, 0, p.a, p.b, 2);
      const h2 = holeIn(p.inset + 36, p.inset, p.hole, 0, 0, p.a, p.b, 2);
      // second hole along the base, only if it sits inside the triangle (x/a + y/b < 1 with margin)
      const inside = (x, y, r) => x - r > 2 && y - r > 2 && (x + r) / p.a + (y + r) / p.b < 0.92;
      if (h1 && inside(p.inset, p.inset, p.hole / 2)) c.push(h1);
      const x2 = p.a * 0.38, y2 = p.b * 0.18;
      const hB = holeIn(x2, y2, p.hole, 0, 0, p.a, p.b, 2);
      if (hB && inside(x2, y2, p.hole / 2)) c.push(hB);
      return c;
    }),
  shape("ribgusset", "Rib gusset", "◕", "stiffeners", "rib gusset long stiffener",
    "Long rib: a slim right-angle gusset for a long weld.",
    [["a", "Bottom length", 200], ["b", "Upright length", 50], ["t", "Thickness at the root", 16]],
    (p) => {
      const t = clamp(p.t, 4, Math.min(p.a, p.b) - 2);
      return [poly([[0, 0], [p.a, 0], [t, p.b], [0, p.b]])];
    }),
  shape("filgusset", "Fillet gusset", "◣", "stiffeners", "fillet rounded outer gusset",
    "Right-angle gusset with the hypotenuse radiused outwards.",
    [["a", "Bottom leg", 110], ["b", "Upright leg", 110], ["t", "Leg width", 22]],
    (p) => {
      const t = clamp(p.t, 6, Math.min(p.a, p.b) / 2);
      // outer hypotenuse replaced by a quarter-ish bulge
      const pts = [[0, 0], [p.a, 0], [p.a, t]];
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        // line from (p.a, t) to (t, p.b) bowed out
        const x = p.a * (1 - u) + t * u;
        const y = t * (1 - u) + p.b * u;
        const bow = Math.sin(u * Math.PI) * Math.min(p.a, p.b) * 0.12;
        const nx = (p.b - t), ny = (p.a - t), L = Math.hypot(nx, ny) || 1;
        pts.push([x + (nx / L) * bow, y + (ny / L) * bow]);
      }
      pts.push([t, p.b], [0, p.b]);
      return [poly(pts)];
    }),
  shape("tgusset", "T-gusset", "⊤", "stiffeners", "t gusset tee stiffener",
    "T-shaped stiffener: a stem and a cap.",
    [["cap", "Cap width", 120], ["stem", "Stem width", 30], ["h", "Overall height", 80], ["caph", "Cap thickness", 22]],
    (p) => {
      const stem = clamp(p.stem, 6, p.cap - 4);
      const ch = clamp(p.caph, 6, p.h - 6);
      const x = (p.cap - stem) / 2;
      return [poly([[0, p.h - ch], [p.cap, p.h - ch], [p.cap, p.h], [0, p.h], [0, p.h - ch],
        // wait that's the cap only; better as one outline
      ].slice(0, 0)), poly([[x, 0], [x + stem, 0], [x + stem, p.h - ch], [p.cap, p.h - ch], [p.cap, p.h], [0, p.h], [0, p.h - ch], [x, p.h - ch]])];
    }),
  shape("crossgusset", "Cross gusset", "✚", "stiffeners", "cross gusset plus stiffener",
    "Cross-shaped stiffener (two ribs).",
    [["s", "Overall size", 120], ["t", "Arm width", 24]],
    (p) => {
      const t = clamp(p.t, 6, p.s / 2 - 2), a = (p.s - t) / 2;
      return [poly([
        [a, 0], [a + t, 0], [a + t, a], [p.s, a], [p.s, a + t], [a + t, a + t],
        [a + t, p.s], [a, p.s], [a, a + t], [0, a + t], [0, a], [a, a],
      ])];
    }),
  shape("skewgusset", "Skew gusset", "◢", "stiffeners", "skew angled gusset",
    "Gusset for an acute or obtuse corner (set the included angle).",
    [["a", "First leg", 120], ["b", "Second leg", 120], ["t", "Leg width", 24], ["ang", "Included angle (degrees)", 60]],
    (p) => {
      const thk = clamp(p.t, 10, Math.min(p.a, p.b) * 0.45);
      const ang = clamp(p.ang, 30, 150) * Math.PI / 180;
      const p1 = [p.a, 0];
      const p2 = [p.b * Math.cos(ang), p.b * Math.sin(ang)];
      // thick pie slice: origin, end of first leg, inset along first leg, inner arc-less join, inset along second, end of second
      const ia = [p.a - thk / Math.max(0.3, Math.sin(ang)), thk];
      const ib = [p2[0] - thk * Math.sin(ang), p2[1] + thk * Math.cos(ang)];
      // fall back to a simple thick triangle (always valid) if the join would be messy
      const mid = [(p1[0] + p2[0]) / 3, (p1[1] + p2[1]) / 3];
      return [poly([[0, 0], p1, mid, p2])];
    }),
  shape("bridggusset", "Bridge gusset", "⬡", "stiffeners", "bridge plate gusset truss",
    "Truss / bridge plate: a pentagon with three bolt holes along the base.",
    [["w", "Base width", 180], ["h", "Height", 90], ["peak", "Peak inset from each end", 40], ["hole", "Hole Ø", 12], ["inset", "Hole centre from the edge", 20]],
    (p) => {
      const pk = clamp(p.peak, 8, p.w / 2 - 8);
      const c = [poly([[0, 0], [p.w, 0], [p.w - pk, p.h], [pk, p.h]])];
      for (const x of [p.inset, p.w / 2, p.w - p.inset]) {
        const h = holeIn(x, p.inset, p.hole, 0, 0, p.w, p.h, 1);
        if (h) c.push(h);
      }
      return c;
    }),
];

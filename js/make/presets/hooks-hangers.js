// Hooks, hangers and cleats.
import { roundedRect, holeIn, poly, clamp, shape, slot } from "./helpers.js";

export const HOOK_PRESETS = [
  shape("jhook", "J-hook", "J", "hangers", "j hook hanging",
    "J-hook: a straight shank with a J bend and a mounting hole.",
    [["shank", "Shank length", 80], ["w", "Hook width", 36], ["t", "Bar width", 12], ["opening", "Mouth opening", 18], ["hole", "Hole Ø", 8]],
    (p) => {
      const t = clamp(p.t, 10, 24), open = clamp(p.opening, 12, 80);
      const reach = Math.max(p.w, t + open + 8);
      const H = Math.max(p.shank + t + open, t + open + 40);
      const y0 = t, y1 = t + open;
      const c = [poly([
        [0, 0], [t, 0], [t, y0],
        [t + reach - t, y0], [t + reach - t, 0], [t + reach, 0],
        [t + reach, H], [t + reach - t, H], [t + reach - t, y1],
        [t, y1], [t, H], [0, H],
      ])];
      const h = holeIn(t / 2, H - 14, p.hole, 0, 0, t, H, 2);
      if (h) c.push(h);
      return c;
    }),
shape("coathook", "Coat hook", "🪝", "hangers", "coat hook double",
    "Coat hook blank: a back plate with a downward hook arm.",
    [["bw", "Back-plate width", 30], ["bh", "Back-plate height", 70], ["reach", "Hook reach", 40], ["t", "Arm thickness", 10], ["hole", "Hole Ø", 6], ["inset", "Hole from the top", 12]],
    (p) => {
      const t = clamp(p.t, 10, 16), open = Math.max(18, t + 8);
      const y0 = (p.bh - open) / 2, y1 = y0 + open;
      const c = [poly([
        [0, 0], [p.bw, 0], [p.bw, y0],
        [p.bw + p.reach - t, y0], [p.bw + p.reach - t, 0], [p.bw + p.reach, 0],
        [p.bw + p.reach, p.bh], [p.bw + p.reach - t, p.bh], [p.bw + p.reach - t, y1],
        [p.bw, y1], [p.bw, p.bh], [0, p.bh],
      ])];
      const h1 = holeIn(p.bw / 2, p.bh - p.inset, p.hole, 0, 0, p.bw, p.bh, 2);
      const h2 = holeIn(p.bw / 2, p.inset, p.hole, 0, 0, p.bw, p.bh, 2);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
shape("hosehook", "Hose hook", "∩", "hangers", "hose hook garden",
    "Hose hook: a wide U on a mounting plate.",
    [["bw", "Back width", 40], ["bh", "Back height", 50], ["reach", "U reach", 50], ["open", "Inside opening", 30], ["t", "Bar width", 10], ["hole", "Hole Ø", 6]],
    (p) => {
      const t = clamp(p.t, 8, 24), open = clamp(p.open, 12, p.bh - 16);
      const y0 = (p.bh - open) / 2, y1 = y0 + open;
      const c = [poly([
        [0, 0], [p.bw, 0], [p.bw, y0],
        [p.bw + p.reach - t, y0], [p.bw + p.reach - t, 0], [p.bw + p.reach, 0],
        [p.bw + p.reach, p.bh], [p.bw + p.reach - t, p.bh], [p.bw + p.reach - t, y1],
        [p.bw, y1], [p.bw, p.bh], [0, p.bh],
      ])];
      const h = holeIn(p.bw / 2, p.bh / 2, p.hole, 0, 0, p.bw, p.bh, 2);
      if (h) c.push(h);
      return c;
    }),
shape("toolhanger", "Tool hanger", "┳", "hangers", "tool hanger peg",
    "Tool hanger: a back plate with two hanging pegs (tabs).",
    [["w", "Back width", 80], ["h", "Back height", 40], ["pegw", "Peg width", 12], ["pegl", "Peg length", 24], ["hole", "Hole Ø", 6], ["inset", "Hole from the side", 12]],
    (p) => {
      const pw = clamp(p.pegw, 6, p.w / 3), pl = Math.max(8, p.pegl);
      const x1 = p.w * 0.28 - pw / 2, x2 = p.w * 0.72 - pw / 2;
      const c = [poly([
        [0, 0], [x1, 0], [x1, -pl], [x1 + pw, -pl], [x1 + pw, 0],
        [x2, 0], [x2, -pl], [x2 + pw, -pl], [x2 + pw, 0],
        [p.w, 0], [p.w, p.h], [0, p.h],
      ])];
      const h1 = holeIn(p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("pegblank", "Pegboard hook blank", "┘", "hangers", "pegboard hook blank",
    "Pegboard hook blank: a small hook with two peg-board pins (tabs).",
    [["pin", "Pin spacing", 25], ["pinl", "Pin length", 12], ["pinw", "Pin width", 5], ["reach", "Hook reach", 30], ["t", "Bar width", 8]],
    (p) => {
      const t = clamp(p.t, 4, 16), pw = clamp(p.pinw, 3, 10), pl = Math.max(6, p.pinl);
      const w = p.pin + pw;
      return [poly([
        [0, pl + t], [0, pl + t + p.reach], [t, pl + t + p.reach], [t, pl + t],
        [w, pl + t], [w, 0], [w - pw, 0], [w - pw, pl], [pw, pl], [pw, 0], [0, 0],
      ])];
    }),
  shape("bikehook", "Bike hook", "⋃", "hangers", "bike hook wall",
    "Bike-wheel hook: a deep U on a tall back plate.",
    [["bw", "Back width", 36], ["bh", "Back height", 80], ["open", "Inside opening", 25], ["reach", "U depth", 40], ["t", "Bar width", 10], ["hole", "Hole Ø", 6]],
    (p) => {
      const t = clamp(p.t, 4, 16), open = clamp(p.open, 12, 60);
      const c = [poly([
        [0, 0], [p.bw, 0], [p.bw, (p.bh - open) / 2],
        [p.bw + p.reach - t, (p.bh - open) / 2],
        [p.bw + p.reach - t, 0], [p.bw + p.reach, 0],
        [p.bw + p.reach, p.bh], [p.bw + p.reach - t, p.bh],
        [p.bw + p.reach - t, (p.bh + open) / 2],
        [p.bw, (p.bh + open) / 2], [p.bw, p.bh], [0, p.bh],
      ])];
      const h1 = holeIn(p.bw / 2, p.bh - 12, p.hole, 0, 0, p.bw, p.bh, 1);
      const h2 = holeIn(p.bw / 2, 12, p.hole, 0, 0, p.bw, p.bh, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("pothanger", "Pot hanger", "∩", "hangers", "pot hanger kitchen rail hook",
    "Pot / rail hanger: an S-shaped hook hanging from a rail slot.",
    [["w", "Width", 16], ["h", "Overall height", 70], ["rail", "Rail hook depth", 14], ["t", "Bar width", 6]],
    (p) => {
      const t = clamp(p.t, 3, p.w - 2), r = p.w / 2;
      // simple S: top hook left, bottom hook right, as a snake of thickness t
      return [poly([
        [0, p.h - p.rail], [0, p.h], [p.w, p.h], [p.w, p.h - t], [t, p.h - t],
        [t, t + 8], [p.w, t + 8], [p.w, 0], [p.w - t, 0], [p.w - t, 8],
        [0, 8], [0, p.h - p.rail],
      ].slice(0, 11).concat([[0, p.h - p.rail]]))];
    }),
  shape("cleathook", "Cleat", "⋈", "hangers", "cleat rope deck",
    "Deck / rope cleat with two mounting holes.",
    [["w", "Overall length", 120], ["h", "Horn height", 28], ["body", "Body height", 16], ["horn", "Each horn length", 28], ["hole", "Hole Ø", 6], ["inset", "Hole from the end of the body", 16]],
    (p) => {
      const body = clamp(p.body, 8, p.h), horn = clamp(p.horn, 10, p.w / 2 - 8);
      const c = [poly([
        [horn, 0], [p.w - horn, 0], [p.w - horn, body], [p.w, body],
        [p.w, p.h], [p.w - horn * 0.35, p.h], [p.w - horn, body],
        [horn, body], [horn * 0.35, p.h], [0, p.h], [0, body], [horn, body],
      ])];
      // the last points retrace — build a clean outline:
      const pts = [
        [horn, 0], [p.w - horn, 0], [p.w - horn, body], [p.w, body],
        [p.w, p.h], [p.w - 8, p.h], [p.w - horn, body + 1],
        [horn, body + 1], [8, p.h], [0, p.h], [0, body], [horn, body],
      ];
      // still messy. A standard cleat silhouette:
      const clean = [
        [0, body * 0.3], [horn * 0.4, 0], [horn, body * 0.25],
        [p.w - horn, body * 0.25], [p.w - horn * 0.4, 0], [p.w, body * 0.3],
        [p.w, p.h], [p.w - horn * 0.5, p.h], [p.w - horn, body],
        [horn, body], [horn * 0.5, p.h], [0, p.h],
      ];
      const out = [poly(clean)];
      const h1 = holeIn(p.inset + horn * 0.2, body / 2, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - (p.inset + horn * 0.2), body / 2, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) out.push(h1); if (h2) out.push(h2);
      return out;
    }),
  shape("wallhanger", "Wall hanger with slot", "▬", "hangers", "wall hanger keyhole slot",
    "Wall hanger plate with a vertical keyhole slot and a lower hook tab.",
    [["w", "Width", 40], ["h", "Height", 70], ["d", "Keyhole Ø", 8], ["slotl", "Slot length", 12], ["tab", "Hook tab length", 16], ["tabw", "Hook tab width", 16]],
    (p) => {
      const tw = clamp(p.tabw, 8, p.w), tab = Math.max(8, p.tab);
      const x = (p.w - tw) / 2;
      const c = [poly([
        [0, 0], [p.w, 0], [p.w, p.h], [x + tw, p.h], [x + tw, p.h + tab], [x, p.h + tab], [x, p.h], [0, p.h],
      ])];
      const r = clamp(p.d, 4, p.w - 6) / 2, sl = clamp(p.slotl, 6, p.h / 2);
      const cx = p.w / 2, y2 = p.h - 12, y1 = y2 - sl;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const th = Math.PI + (i * Math.PI) / 12;
        pts.push([cx + r * Math.cos(th), y1 + r * Math.sin(th)]);
      }
      for (let i = 0; i <= 12; i++) {
        const th = (i * Math.PI) / 12;
        pts.push([cx + (r + 2) * Math.cos(th), y2 + (r + 2) * Math.sin(th)]);
      }
      c.push({ pts, closed: true });
      return c;
    }),
  shape("railhook", "Rail hook", "⊃", "hangers", "rail hook closet",
    "Closet-rail hook: a hook that hangs over a round rail.",
    [["rail", "Rail Ø", 20], ["drop", "Drop below the rail", 40], ["t", "Bar width", 8], ["reach", "Front hook reach", 22]],
    (p) => {
      const t = clamp(p.t, 3, 16), R = p.rail / 2 + 1, Ro = R + t;
      const cx = Ro, cy = Ro;
      const outer = [], inner = [];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI - (i * Math.PI) / 14;
        outer.push([cx + Ro * Math.cos(a), cy + Ro * Math.sin(a)]);
      }
      for (let i = 0; i <= 14; i++) {
        const a = 0 + (i * Math.PI) / 14;
        inner.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      }
      const pts = [
        ...outer,
        [cx + Ro, cy - p.drop], [cx + Ro - t, cy - p.drop], [cx + Ro - t, cy],
        ...inner,
        [cx - R, cy], [cx - R, cy - 4], [cx - Ro, cy - 4],
      ];
      return [poly(pts)];
    }),
  shape("sbracket", "S-hook", "S", "hangers", "s hook open",
    "Open S-hook (two opposing hooks, no closing weld).",
    [["w", "Width", 28], ["h", "Overall height", 70], ["t", "Bar width", 6]],
    (p) => {
      const t = clamp(p.t, 3, p.w / 2 - 1);
      return [poly([
        [0, p.h * 0.55], [0, p.h], [p.w, p.h], [p.w, p.h - t], [t, p.h - t],
        [t, p.h * 0.5], [p.w, p.h * 0.5], [p.w, 0], [p.w - t, 0],
        [p.w - t, p.h * 0.5 - t], [0, p.h * 0.5 - t],
      ])];
    }),
  shape("pegrail", "Peg rail", "┳", "hangers", "peg rail coat rack",
    "Coat peg rail: a bar with three downward pegs and two mounting holes.",
    [["w", "Rail length", 240], ["h", "Rail height", 30], ["pegs", "Number of pegs", 3], ["pegw", "Peg width", 12], ["pegl", "Peg length", 20], ["hole", "Hole Ø", 6], ["inset", "Hole from the end", 16]],
    (p) => {
      const n = Math.max(2, Math.min(8, Math.round(p.pegs) || 3));
      const pw = clamp(p.pegw, 6, p.w / (n + 1)), pl = Math.max(8, p.pegl);
      const pts = [[0, 0]];
      for (let i = 0; i < n; i++) {
        const cx = ((i + 1) / (n + 1)) * p.w, x0 = cx - pw / 2, x1 = cx + pw / 2;
        pts.push([x0, 0], [x0, -pl], [x1, -pl], [x1, 0]);
      }
      pts.push([p.w, 0], [p.w, p.h], [0, p.h]);
      const c = [poly(pts)];
      const h1 = holeIn(p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
];

// Plates, mounting plates and brackets.
import { circleContour, roundedRect, slot, holeIn, boltHoles, rectContour, poly, clamp, pos, shape, arcPoints } from "./helpers.js";

function plateWithHoles(w, h, r, holes) {
  const c = [roundedRect(0, 0, w, h, r || 0)];
  for (const [x, y, d] of holes) {
    const hole = holeIn(x, y, d, 0, 0, w, h, 1);
    if (hole) c.push(hole);
  }
  return c;
}

export const PLATE_PRESETS = [
  shape("oblplate", "Oblong plate", "⬭", "plates", "oblong stadium plate capsule",
    "Plate with fully rounded ends (a stadium / capsule).",
    [["w", "Length", 160], ["h", "Width", 50]],
    (p) => [roundedRect(0, 0, p.w, p.h, p.h / 2)]),
  shape("diamondplate", "Diamond plate", "◇", "plates", "diamond rhombus lozenge plate",
    "A diamond (rhombus) plate.",
    [["w", "Width", 140], ["h", "Height", 80]],
    (p) => [poly([[p.w / 2, 0], [p.w, p.h / 2], [p.w / 2, p.h], [0, p.h / 2]])]),
  shape("radplate", "Radiused rectangle", "▭", "plates", "radiused rounded plate",
    "Rectangle with a large, even corner radius.",
    [["w", "Width", 160], ["h", "Height", 80], ["r", "Corner radius", 20]],
    (p) => [roundedRect(0, 0, p.w, p.h, Math.min(p.r, p.w / 2, p.h / 2))]),
  shape("notchplate", "Notched plate", "▭", "plates", "notched corner relief plate",
    "Plate with a rectangular notch cut out of one end.",
    [["w", "Width", 180], ["h", "Height", 80], ["nw", "Notch width", 40], ["nh", "Notch height", 30]],
    (p) => {
      const nw = clamp(p.nw, 2, p.w - 8), nh = clamp(p.nh, 2, p.h - 8);
      const y0 = (p.h - nh) / 2;
      return [poly([[0, 0], [p.w - nw, 0], [p.w - nw, y0], [p.w, y0], [p.w, y0 + nh], [p.w - nw, y0 + nh], [p.w - nw, p.h], [0, p.h]])];
    }),
  shape("cslotplate", "Plate with centre slot", "▬", "plates", "centre slot plate adjustment",
    "Plate with a single centred adjustment slot.",
    [["w", "Width", 180], ["h", "Height", 60], ["slotl", "Slot length", 80], ["slotw", "Slot width", 10], ["r", "Corner radius", 6]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const sl = clamp(p.slotl, p.slotw, p.w - 8), sw = clamp(p.slotw, 2, p.h - 8);
      c.push(slot(p.w / 2, p.h / 2, sl, sw));
      return c;
    }),
  shape("twoslotplate", "Plate with two slots", "▬", "plates", "two slot plate",
    "Plate with two parallel adjustment slots.",
    [["w", "Width", 200], ["h", "Height", 80], ["slotl", "Slot length", 70], ["slotw", "Slot width", 10], ["gap", "Gap between slots", 28], ["r", "Corner radius", 6]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const sl = clamp(p.slotl, p.slotw, p.w - 8), sw = clamp(p.slotw, 2, (p.h - 8) / 2);
      const g = clamp(p.gap, sw + 4, p.h - sw - 4);
      c.push(slot(p.w / 2, p.h / 2 - g / 2, sl, sw), slot(p.w / 2, p.h / 2 + g / 2, sl, sw));
      return c;
    }),
  shape("knifeplate", "Knife-edge plate", "▰", "plates", "tapered knife wedge plate",
    "Plate that tapers to a blunt knife edge on one end.",
    [["w", "Length", 180], ["h", "Wide end height", 80], ["tip", "Tip height", 16]],
    (p) => {
      const t = clamp(p.tip, 4, p.h - 4), y = (p.h - t) / 2;
      return [poly([[0, 0], [p.w * 0.55, 0], [p.w, y], [p.w, y + t], [p.w * 0.55, p.h], [0, p.h]])];
    }),
  shape("angle2h", "Angle bracket (2 holes)", "∟", "plates", "angle bracket two holes l bracket",
    "L-shaped angle bracket with one hole in each leg.",
    [["a", "Horizontal leg", 100], ["b", "Vertical leg", 100], ["t", "Thickness", 25], ["hole", "Hole Ø", 10], ["inset", "Hole centre from the end", 20]],
    (p) => {
      const t = clamp(p.t, 4, Math.min(p.a, p.b) - 4);
      const c = [poly([[0, 0], [p.a, 0], [p.a, t], [t, t], [t, p.b], [0, p.b]])];
      const h1 = holeIn(p.a - p.inset, t / 2, p.hole, 0, 0, p.a, t, 1);
      const h2 = holeIn(t / 2, p.b - p.inset, p.hole, 0, 0, t, p.b, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("angle3h", "Angle bracket (3 holes)", "∟", "plates", "angle bracket three holes",
    "L-shaped bracket: two holes in the long leg, one in the short.",
    [["a", "Horizontal leg", 140], ["b", "Vertical leg", 80], ["t", "Thickness", 28], ["hole", "Hole Ø", 10], ["inset", "Hole centre from the end", 18]],
    (p) => {
      const t = clamp(p.t, 6, Math.min(p.a, p.b) - 6);
      const c = [poly([[0, 0], [p.a, 0], [p.a, t], [t, t], [t, p.b], [0, p.b]])];
      const hs = [holeIn(p.inset, t / 2, p.hole, 0, 0, p.a, t, 1),
        holeIn(p.a - p.inset, t / 2, p.hole, 0, 0, p.a, t, 1),
        holeIn(t / 2, p.b - p.inset, p.hole, 0, 0, t, p.b, 1)];
      for (const h of hs) if (h) c.push(h);
      return c;
    }),
  shape("zbracket", "Z-bracket", "Ƶ", "plates", "z bracket offset cranked",
    "Cranked Z-bracket: two parallel flanges joined by a web.",
    [["a", "Each flange length", 60], ["web", "Web length", 50], ["t", "Flange width", 24], ["hole", "Hole Ø", 10], ["inset", "Hole centre from the end", 16]],
    (p) => {
      const t = clamp(p.t, 8, 80);
      const pts = [[0, 0], [p.a, 0], [p.a + p.web, p.web], [p.a + p.web + p.a, p.web],
        [p.a + p.web + p.a, p.web + t], [p.a + p.web, p.web + t], [p.a, t], [0, t]];
      const c = [poly(pts)];
      const h1 = holeIn(p.inset, t / 2, p.hole, 0, 0, p.a, t, 1);
      const h2 = holeIn(p.a + p.web + p.a - p.inset, p.web + t / 2, p.hole, p.a + p.web, p.web, p.a + p.web + p.a, p.web + t, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("uchannelbr", "U-channel bracket", "⋃", "plates", "u channel bracket clevis",
    "U-shaped channel bracket with a hole in each ear.",
    [["w", "Inside width", 50], ["leg", "Leg length", 40], ["t", "Thickness", 8], ["len", "Length along the channel", 40], ["hole", "Hole Ø", 8], ["inset", "Hole centre from the tip", 14]],
    (p) => {
      const t = clamp(p.t, 3, 30), W = p.w + 2 * t, H = p.leg + t;
      const c = [poly([[0, 0], [t, 0], [t, p.leg], [t + p.w, p.leg], [t + p.w, 0], [W, 0], [W, H], [0, H]])];
      const h1 = holeIn(t / 2, p.inset, p.hole, 0, 0, t, p.leg, 1);
      const h2 = holeIn(W - t / 2, p.inset, p.hole, t + p.w, 0, W, p.leg, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("cornerbr", "Corner bracket (square)", "⌜", "plates", "corner square bracket",
    "Square corner bracket with a lightening hole in the middle.",
    [["s", "Outside size", 80], ["t", "Leg width", 22], ["hole", "Middle hole Ø (0 = none)", 16]],
    (p) => {
      const t = clamp(p.t, 6, p.s / 2 - 2);
      const c = [poly([[0, 0], [p.s, 0], [p.s, t], [t, t], [t, p.s], [0, p.s]])];
      const mid = holeIn(t / 2 + (p.s - t) * 0.15, t / 2 + (p.s - t) * 0.15, p.hole, 0, 0, t, t, 0.5);
      // hole in the corner block
      const h = p.hole > 0 ? holeIn(t * 0.5, t * 0.5, Math.min(p.hole, t - 4), 0, 0, t, t, 1) : null;
      if (h) c.push(h);
      return c;
    }),
  shape("mount22", "Mounting plate 2×2", "⊞", "plates", "mounting plate four holes 2x2",
    "Rectangular mounting plate with a 2×2 hole pattern.",
    [["w", "Width", 120], ["h", "Height", 120], ["hole", "Hole Ø", 8], ["inset", "Hole centre from the edge", 18], ["r", "Corner radius", 8]],
    (p) => plateWithHoles(p.w, p.h, p.r, [
      [p.inset, p.inset, p.hole], [p.w - p.inset, p.inset, p.hole],
      [p.w - p.inset, p.h - p.inset, p.hole], [p.inset, p.h - p.inset, p.hole],
    ])),
  shape("mount33", "Mounting plate 3×3", "⊞", "plates", "mounting plate nine holes 3x3",
    "Rectangular mounting plate with a 3×3 hole pattern.",
    [["w", "Width", 160], ["h", "Height", 160], ["hole", "Hole Ø", 8], ["inset", "Hole centre from the edge", 18], ["r", "Corner radius", 8]],
    (p) => {
      const xs = [p.inset, p.w / 2, p.w - p.inset], ys = [p.inset, p.h / 2, p.h - p.inset];
      const holes = [];
      for (const x of xs) for (const y of ys) holes.push([x, y, p.hole]);
      return plateWithHoles(p.w, p.h, p.r, holes);
    }),
  shape("motormount", "Motor mount plate", "◉", "plates", "motor mount nema plate",
    "Round-centre motor mount: a square plate with a centre bore and four bolt holes on a pitch circle.",
    [["s", "Plate size", 140], ["bore", "Centre bore Ø", 40], ["pcd", "Bolt pitch circle Ø", 100], ["hole", "Bolt hole Ø", 6], ["r", "Corner radius", 8]],
    (p) => {
      const c = [roundedRect(0, 0, p.s, p.s, p.r)];
      const bore = holeIn(p.s / 2, p.s / 2, p.bore, 0, 0, p.s, p.s, 2);
      if (bore) c.push(bore);
      c.push(...boltHoles(p.s / 2, p.s / 2, Math.min(p.pcd, p.s - p.hole - 4), 4, p.hole, Math.PI / 4));
      return c;
    }),
  shape("bearingplate", "Bearing plate", "◎", "plates", "bearing housing plate pillow",
    "Plate with a large centred bearing bore and two mounting holes.",
    [["w", "Width", 160], ["h", "Height", 90], ["bore", "Bearing bore Ø", 40], ["hole", "Mounting hole Ø", 10], ["inset", "Mounting hole from the end", 20], ["r", "Corner radius", 8]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const bore = holeIn(p.w / 2, p.h / 2, p.bore, 0, 0, p.w, p.h, 3);
      if (bore) c.push(bore);
      const h1 = holeIn(p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("hingeleaf", "Hinge leaf", "─┤", "plates", "hinge leaf knuckle flap",
    "One leaf of a butt hinge: a plate with a rounded knuckle end and mounting holes.",
    [["w", "Leaf width", 80], ["h", "Leaf height", 50], ["knuckle", "Knuckle Ø", 14], ["hole", "Hole Ø", 6], ["inset", "Hole centre from the edge", 14]],
    (p) => {
      const k = clamp(p.knuckle, 6, p.h - 2);
      const c = [roundedRect(0, 0, p.w, p.h, 0)];
      // replace with knuckle on the left
      const r = k / 2, cy = p.h / 2;
      const pts = [[r, 0], [p.w, 0], [p.w, p.h], [r, p.h], ...arcPoints(r, cy, r, Math.PI / 2, -Math.PI / 2, true)];
      const out = [{ pts, closed: true }];
      const h1 = holeIn(r + p.inset, p.inset, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(r + p.inset, p.h - p.inset, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) out.push(h1); if (h2) out.push(h2);
      return out;
    }),
  shape("shimplatesq", "Shim plate", "▭", "plates", "shim packing plate spacer",
    "Thin rectangular shim / packing plate, optional centre hole.",
    [["w", "Width", 80], ["h", "Height", 40], ["hole", "Centre hole Ø (0 = none)", 0], ["r", "Corner radius", 2]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const h = p.hole > 0 ? holeIn(p.w / 2, p.h / 2, p.hole, 0, 0, p.w, p.h, 1) : null;
      if (h) c.push(h);
      return c;
    }),
  shape("sq4washer", "Square washer (4 holes)", "▣", "plates", "square washer four holes",
    "Square washer plate with four holes around a larger centre hole.",
    [["s", "Outside size", 100], ["id", "Centre hole Ø", 30], ["hole", "Corner hole Ø", 8], ["inset", "Corner hole from the edge", 15], ["r", "Corner radius", 6]],
    (p) => plateWithHoles(p.s, p.s, p.r, [
      [p.s / 2, p.s / 2, p.id],
      [p.inset, p.inset, p.hole], [p.s - p.inset, p.inset, p.hole],
      [p.s - p.inset, p.s - p.inset, p.hole], [p.inset, p.s - p.inset, p.hole],
    ])),
  shape("slotstrap2", "Slotted strap (2 slots)", "▬", "plates", "slotted strap two slots bar",
    "Straight strap with a slot at each end.",
    [["w", "Length", 200], ["h", "Width", 30], ["slotl", "Each slot length", 28], ["slotw", "Slot width", 8], ["inset", "Slot centre from the end", 24], ["r", "End radius", 15]],
    (p) => {
      const r = Math.min(p.r, p.h / 2, p.w / 2);
      const c = [roundedRect(0, 0, p.w, p.h, r)];
      const sl = clamp(p.slotl, p.slotw, p.w / 2 - 8), sw = clamp(p.slotw, 2, p.h - 4);
      c.push(slot(p.inset, p.h / 2, sl, sw), slot(p.w - p.inset, p.h / 2, sl, sw));
      return c;
    }),
];

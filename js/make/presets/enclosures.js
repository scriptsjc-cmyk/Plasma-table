// Enclosure and box flat patterns (unfolded panels packed on the sheet).
import { roundedRect, holeIn, rectContour, packPieces, clamp, shape, poly } from "./helpers.js";

function panel(w, h, holes = []) {
  const c = [rectContour(w, h)];
  for (const [x, y, d] of holes) {
    const hole = holeIn(x, y, d, 0, 0, w, h, 1);
    if (hole) c.push(hole);
  }
  return c;
}

// Open-top box: 1 bottom + 4 sides, with a small tab allowance already included in sizes (butt joints).
function openBox(l, w, h) {
  return packPieces([
    panel(l, w),
    panel(l, h), panel(l, h),
    panel(w, h), panel(w, h),
  ]).contours;
}

export const BOX_PRESETS = [
  shape("openbox", "Open box (flat pattern)", "▢", "enclosures", "open box tray unfold",
    "Flat pattern for an open-top box: a bottom and four sides, packed on the sheet. Butt joints (weld or tab after cutting).",
    [["len", "Inside length", 150], ["wid", "Inside width", 100], ["ht", "Height", 50]],
    (p) => openBox(p.len, p.wid, p.ht),
    { sheet: true, noResize: true }),
  shape("liddedbox", "Lidded box (flat pattern)", "▣", "enclosures", "lidded box unfold lid",
    "Open-box pattern plus a lid the same size as the bottom.",
    [["len", "Inside length", 150], ["wid", "Inside width", 100], ["ht", "Height", 50]],
    (p) => packPieces([panel(p.len, p.wid), panel(p.len, p.wid), panel(p.len, p.ht), panel(p.len, p.ht), panel(p.wid, p.ht), panel(p.wid, p.ht)]).contours,
    { sheet: true, noResize: true }),
  shape("trayflat", "Tray (flat pattern)", "▭", "enclosures", "tray shallow unfold",
    "Shallow tray: a bottom and four low sides.",
    [["len", "Inside length", 200], ["wid", "Inside width", 120], ["ht", "Side height", 25]],
    (p) => openBox(p.len, p.wid, p.ht),
    { sheet: true, noResize: true }),
  shape("uchannel", "U-channel (flat pattern)", "⋃", "enclosures", "u channel unfold",
    "Flat pattern for a U-channel: a web and two legs as one developed strip, plus optional end plates packed beside it.",
    [["web", "Web width", 60], ["leg", "Leg height", 40], ["len", "Length", 200], ["ends", "End plates (1 = yes, 0 = no)", 1]],
    (p) => {
      const strip = p.leg + p.web + p.leg;
      const pieces = [panel(p.len, strip)];
      if (Math.round(p.ends) >= 1) pieces.push(panel(p.web, p.leg), panel(p.web, p.leg));
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true }),
  shape("cchannel", "C-channel (flat pattern)", "⊏", "enclosures", "c channel unfold flanges",
    "C-channel developed as one strip (leg + web + leg) with two return flanges, plus two end plates.",
    [["web", "Web width", 80], ["leg", "Leg height", 40], ["flange", "Return flange", 16], ["len", "Length", 200]],
    (p) => {
      const strip = p.flange + p.leg + p.web + p.leg + p.flange;
      return packPieces([panel(p.len, strip), panel(p.web, p.leg), panel(p.web, p.leg)]).contours;
    },
    { sheet: true, noResize: true }),
  shape("angleiron", "Angle (flat pattern)", "∟", "enclosures", "angle iron unfold",
    "Flat pattern for a formed angle: one developed strip of both legs.",
    [["a", "First leg", 40], ["b", "Second leg", 40], ["len", "Length", 200]],
    (p) => [rectContour(p.len, p.a + p.b)],
    { sheet: true, noResize: true }),
  shape("cuboidwrap", "Cuboid wrap (4 sides)", "▭", "enclosures", "cuboid wrap four sides sleeve",
    "A wrap for the four walls of a cuboid (the sleeve), packed with the two ends.",
    [["len", "Length", 150], ["wid", "Width", 80], ["ht", "Height", 80]],
    (p) => packPieces([panel(2 * (p.len + p.wid), p.ht), panel(p.len, p.wid), panel(p.len, p.wid)]).contours,
    { sheet: true, noResize: true }),
  shape("fiveside", "Five-sided box", "▢", "enclosures", "five sided box open front",
    "Five-sided box (open front): a back, two sides, a top and a bottom.",
    [["wid", "Width", 140], ["dep", "Depth", 80], ["ht", "Height", 90]],
    (p) => packPieces([panel(p.wid, p.ht), panel(p.dep, p.ht), panel(p.dep, p.ht), panel(p.wid, p.dep), panel(p.wid, p.dep)]).contours,
    { sheet: true, noResize: true }),
  shape("totebox", "Tote (flat pattern)", "▭", "enclosures", "tote crate unfold tapered",
    "Tote / crate: a bottom and four slightly shorter sides (butt joints).",
    [["len", "Bottom length", 220], ["wid", "Bottom width", 140], ["ht", "Height", 70]],
    (p) => openBox(p.len, p.wid, p.ht),
    { sheet: true, noResize: true }),
  shape("enclfront", "Electronics enclosure", "▭", "enclosures", "electronics enclosure front lid base",
    "Electronics enclosure set: a base, a lid, a front (with a window) and three plain sides.",
    [["w", "Width", 160], ["d", "Depth", 100], ["h", "Height", 50], ["iw", "Front window width (0 = none)", 80], ["ih", "Front window height", 24]],
    (p) => {
      const front = panel(p.w, p.h);
      if (p.iw > 8 && p.ih > 8) {
        const hole = holeIn(p.w / 2, p.h / 2, 0, 0, 0, p.w, p.h, 1);
        const iw = clamp(p.iw, 10, p.w - 16), ih = clamp(p.ih, 8, p.h - 10);
        front.push(roundedRect((p.w - iw) / 2, (p.h - ih) / 2, iw, ih, 3));
      }
      return packPieces([panel(p.w, p.d), panel(p.w, p.d), front, panel(p.w, p.h), panel(p.d, p.h), panel(p.d, p.h)]).contours;
    },
    { sheet: true, noResize: true }),
  shape("jbox", "Junction box", "▣", "enclosures", "junction box unfold",
    "Junction box: a bottom, four sides and a lid with four corner holes.",
    [["s", "Inside size", 120], ["ht", "Height", 50], ["hole", "Lid hole Ø", 5], ["inset", "Lid hole from the edge", 12]],
    (p) => {
      const lid = panel(p.s, p.s, [
        [p.inset, p.inset, p.hole], [p.s - p.inset, p.inset, p.hole],
        [p.s - p.inset, p.s - p.inset, p.hole], [p.inset, p.s - p.inset, p.hole],
      ]);
      return packPieces([panel(p.s, p.s), lid, panel(p.s, p.ht), panel(p.s, p.ht), panel(p.s, p.ht), panel(p.s, p.ht)]).contours;
    },
    { sheet: true, noResize: true }),
  shape("drawerbox", "Drawer (flat pattern)", "▭", "enclosures", "drawer unfold",
    "Drawer: a bottom, two sides, a back and a taller front.",
    [["w", "Width", 180], ["d", "Depth", 120], ["h", "Side height", 40], ["front", "Front height", 60]],
    (p) => packPieces([panel(p.w, p.d), panel(p.d, p.h), panel(p.d, p.h), panel(p.w, p.h), panel(p.w, Math.max(p.front, p.h))]).contours,
    { sheet: true, noResize: true }),
  shape("shoebox", "Shoe-box (flat pattern)", "▭", "enclosures", "shoebox telescoping lid",
    "Shoe-box style: a base (bottom + four sides) and a slightly larger lid.",
    [["len", "Base length", 200], ["wid", "Base width", 120], ["ht", "Base height", 50], ["lidht", "Lid height", 25], ["clear", "Lid clearance (each side)", 2]],
    (p) => {
      const c = Math.max(0.5, p.clear);
      const Lw = p.len + 2 * c, Ww = p.wid + 2 * c;
      return packPieces([
        panel(p.len, p.wid), panel(p.len, p.ht), panel(p.len, p.ht), panel(p.wid, p.ht), panel(p.wid, p.ht),
        panel(Lw, Ww), panel(Lw, p.lidht), panel(Lw, p.lidht), panel(Ww, p.lidht), panel(Ww, p.lidht),
      ]).contours;
    },
    { sheet: true, noResize: true }),
  shape("crateflaps", "Crate with flaps", "▣", "enclosures", "crate flaps carton unfold",
    "Crate / carton with four top flaps: a wrap for the four walls plus a bottom and four flaps.",
    [["len", "Length", 160], ["wid", "Width", 100], ["ht", "Height", 80]],
    (p) => packPieces([
      panel(2 * (p.len + p.wid), p.ht),
      panel(p.len, p.wid),
      panel(p.len, p.wid / 2), panel(p.len, p.wid / 2),
      panel(p.wid, p.len / 2), panel(p.wid, p.len / 2),
    ]).contours,
    { sheet: true, noResize: true }),
  shape("pcpanel", "PC case side panel", "▭", "enclosures", "pc case side panel vent",
    "PC / cabinet side panel with four mounting holes and an optional vent opening.",
    [["w", "Width", 260], ["h", "Height", 180], ["hole", "Hole Ø", 5], ["inset", "Hole from the edge", 12], ["vw", "Vent width (0 = none)", 80], ["vh", "Vent height", 40]],
    (p) => {
      const c = panel(p.w, p.h, [
        [p.inset, p.inset, p.hole], [p.w - p.inset, p.inset, p.hole],
        [p.w - p.inset, p.h - p.inset, p.hole], [p.inset, p.h - p.inset, p.hole],
      ]);
      if (p.vw > 8 && p.vh > 8) {
        const vw = clamp(p.vw, 10, p.w - 24), vh = clamp(p.vh, 8, p.h - 24);
        c.push(roundedRect((p.w - vw) / 2, (p.h - vh) / 2, vw, vh, 6));
      }
      return c;
    }),
  shape("lidonly", "Box lid (flat pattern)", "▭", "enclosures", "box lid sides unfold",
    "A lid with four shallow sides, packed on the sheet.",
    [["len", "Inside length", 160], ["wid", "Inside width", 100], ["ht", "Side height", 18]],
    (p) => openBox(p.len, p.wid, p.ht),
    { sheet: true, noResize: true }),
];

// Enclosure and box flat patterns. Folding boxes default to one connected blank
// (fold / etch lines and tabs on the same piece). "Separate pieces" packs the
// individual panels if the user wants them cut apart.
import { roundedRect, holeIn, clamp, shape, boxBlank, channelBlank, cuboidBlank, crateBlank, panel, packPieces, rectContour, bendLine, SPLIT_PARAM } from "./helpers.js";

const MULTI_SHOE = "The base and lid are different sizes (a telescoping fit), so they stay two separate folding blanks.";

export const BOX_PRESETS = [
  shape("openbox", "Open box", "▢", "folded", "open box tray unfold planter oil pan lid",
    "One-piece open box or tray: a plus-shaped unfold of the bottom and four sides, with optional corner tabs and a top hem. Tick Separate pieces to cut the panels apart.",
    [["len", "Inside length", 150], ["wid", "Inside width", 100], ["ht", "Height", 50],
      ["tab", "Tab width (0 = none)", 0], ["hem", "Top hem (0 = none)", 0], SPLIT_PARAM],
    (p) => boxBlank(p.len, p.wid, p.ht, { tab: p.tab, hem: p.hem, split: p.split }),
    { sheet: true, noResize: true }),

  shape("liddedbox", "Lidded box", "▣", "folded", "lidded box unfold lid junction battery",
    "One-piece lidded box: the lid is a flap on one wall, with optional corner tabs. Tick Separate pieces to cut the lid (and the walls) apart.",
    [["len", "Inside length", 150], ["wid", "Inside width", 100], ["ht", "Height", 50],
      ["tab", "Tab width (0 = none)", 0], SPLIT_PARAM],
    (p) => boxBlank(p.len, p.wid, p.ht, { tab: p.tab, lid: true, split: p.split }),
    { sheet: true, noResize: true }),

  shape("trayflat", "Tray (flat pattern)", "▭", "enclosures", "tray shallow unfold",
    "Shallow tray: a bottom and four low sides.",
    [["len", "Inside length", 200], ["wid", "Inside width", 120], ["ht", "Side height", 25],
      ["tab", "Tab width (0 = none)", 0], SPLIT_PARAM],
    (p) => boxBlank(p.len, p.wid, p.ht, { tab: p.tab, split: p.split }),
    { sheet: true, noResize: true, hidden: true, aliasOf: "openbox" }),

  shape("uchannel", "U-channel", "⋃", "folded", "u channel unfold folded bracket",
    "U-channel as one developed strip. End plates (when on) are flaps on the web, or packed beside the strip if you choose Separate pieces.",
    [["web", "Web width", 60], ["leg", "Leg height", 40], ["len", "Length", 200],
      ["ends", "End plates (1 = yes, 0 = no)", 1], ["hole", "Hole Ø (0 = none)", 0], ["inset", "Hole from the end", 14], SPLIT_PARAM],
    (p) => {
      const ends = Math.round(p.ends) >= 1 ? p.leg : 0;
      const c = channelBlank(p.len, [p.leg, p.web, p.leg], 1, ends, p.split);
      if (p.hole > 0) {
        // holes sit in each leg, matching the folded U-bracket
        const H = p.leg + p.web + p.leg, ins = Math.max(p.hole / 2 + 2, p.inset);
        const x = p.len / 2;
        const h1 = holeIn(x, ins, p.hole, 0, 0, p.len, H, 1);
        const h2 = holeIn(x, H - ins, p.hole, 0, 0, p.len, H, 1);
        if (h1) c.push(h1); if (h2) c.push(h2);
      }
      return c;
    },
    { sheet: true, noResize: true }),

  shape("cchannel", "C-channel", "⊏", "folded", "c channel unfold flanges",
    "C-channel as one developed strip with return flanges. End plates (when wanted) are flaps on the web, or packed separately.",
    [["web", "Web width", 80], ["leg", "Leg height", 40], ["flange", "Return flange", 16], ["len", "Length", 200],
      ["ends", "End plates (1 = yes, 0 = no)", 1], SPLIT_PARAM],
    (p) => channelBlank(p.len, [p.flange, p.leg, p.web, p.leg, p.flange], 2, Math.round(p.ends) >= 1 ? p.leg : 0, p.split),
    { sheet: true, noResize: true }),

  shape("angleiron", "Angle (flat pattern)", "∟", "enclosures", "angle iron unfold",
    "Flat pattern for a formed angle: one developed strip of both legs.",
    [["a", "First leg", 40], ["b", "Second leg", 40], ["len", "Length", 200]],
    (p) => [rectContour(p.len, p.a + p.b), bendLine(0, p.a, p.len, p.a)],
    { sheet: true, noResize: true, hidden: true, aliasOf: "foldlbr" }),

  shape("cuboidwrap", "Cuboid wrap", "▭", "folded", "cuboid wrap four sides sleeve",
    "Four walls of a cuboid as one strip, with the two ends as flaps on one wall. Tick Separate pieces to pack the ends beside the sleeve.",
    [["len", "Length", 150], ["wid", "Width", 80], ["ht", "Height", 80], SPLIT_PARAM],
    (p) => cuboidBlank(p.len, p.wid, p.ht, p.split),
    { sheet: true, noResize: true }),

  shape("fiveside", "Five-sided box", "▢", "folded", "five sided box open front",
    "Five-sided box (open front) as one cross-shaped unfold: a back, two sides, a top and a bottom. Tick Separate pieces to cut the panels apart.",
    [["wid", "Width", 140], ["dep", "Depth", 80], ["ht", "Height", 90], SPLIT_PARAM],
    (p) => boxBlank(p.wid, p.ht, p.dep, { split: p.split }),
    { sheet: true, noResize: true }),

  shape("totebox", "Tote (flat pattern)", "▭", "enclosures", "tote crate unfold tapered",
    "Tote / crate: a bottom and four sides.",
    [["len", "Bottom length", 220], ["wid", "Bottom width", 140], ["ht", "Height", 70], SPLIT_PARAM],
    (p) => boxBlank(p.len, p.wid, p.ht, { split: p.split }),
    { sheet: true, noResize: true, hidden: true, aliasOf: "openbox" }),

  shape("enclfront", "Electronics enclosure", "▭", "folded", "electronics enclosure front lid base",
    "Electronics enclosure as one folding blank: a base, four sides (the front can have a window) and a lid flap. Tick Separate pieces to pack the panels.",
    [["w", "Width", 160], ["d", "Depth", 100], ["h", "Height", 50], ["iw", "Front window width (0 = none)", 80], ["ih", "Front window height", 24], SPLIT_PARAM],
    (p) => boxBlank(p.w, p.d, p.h, { lid: true, split: p.split, window: p.iw > 8 && p.ih > 8 ? { w: p.iw, h: p.ih, r: 3 } : null }),
    { sheet: true, noResize: true }),

  shape("jbox", "Junction box", "▣", "enclosures", "junction box unfold",
    "Junction box: a bottom, four sides and a lid with four corner holes.",
    [["s", "Inside size", 120], ["ht", "Height", 50], ["hole", "Lid hole Ø", 5], ["inset", "Lid hole from the edge", 12], SPLIT_PARAM],
    (p) => boxBlank(p.s, p.s, p.ht, { lid: true, split: p.split, lidHoles: [
      [p.inset, p.inset, p.hole], [p.s - p.inset, p.inset, p.hole],
      [p.s - p.inset, p.s - p.inset, p.hole], [p.inset, p.s - p.inset, p.hole],
    ] }),
    { sheet: true, noResize: true, hidden: true, aliasOf: "liddedbox" }),

  shape("drawerbox", "Drawer", "▭", "folded", "drawer unfold",
    "Drawer as one unfolding: a bottom, two sides, a back and a taller front. Tick Separate pieces to cut the panels apart.",
    [["w", "Width", 180], ["d", "Depth", 120], ["h", "Side height", 40], ["front", "Front height", 60], SPLIT_PARAM],
    (p) => boxBlank(p.w, p.d, p.h, { frontH: Math.max(p.front, p.h), split: p.split }),
    { sheet: true, noResize: true }),

  shape("shoebox", "Shoe-box", "▭", "folded", "shoebox telescoping lid",
    "Shoe-box style: a base (bottom + four sides) and a slightly larger lid, each as its own folding blank.",
    [["len", "Base length", 200], ["wid", "Base width", 120], ["ht", "Base height", 50], ["lidht", "Lid height", 25], ["clear", "Lid clearance (each side)", 2]],
    (p) => {
      const c = Math.max(0.5, p.clear);
      return packPieces([
        boxBlank(p.len, p.wid, p.ht, {}),
        boxBlank(p.len + 2 * c, p.wid + 2 * c, p.lidht, {}),
      ]).contours;
    },
    { sheet: true, noResize: true, note: MULTI_SHOE }),

  shape("crateflaps", "Crate with flaps", "▣", "folded", "crate flaps carton unfold",
    "Crate / carton as one unfolding: a bottom, four walls and four top flaps. Tick Separate pieces to pack the panels.",
    [["len", "Length", 160], ["wid", "Width", 100], ["ht", "Height", 80], SPLIT_PARAM],
    (p) => crateBlank(p.len, p.wid, p.ht, p.split),
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
    "A lid with four shallow sides.",
    [["len", "Inside length", 160], ["wid", "Inside width", 100], ["ht", "Side height", 18], SPLIT_PARAM],
    (p) => boxBlank(p.len, p.wid, p.ht, { split: p.split }),
    { sheet: true, noResize: true, hidden: true, aliasOf: "openbox" }),
];

// New folded / formed workshop presets. Each has a developed flat pattern (what you cut)
// and a fold() model for the 3D view. Bend sizes follow the existing enclosure presets:
// developed length is the sum of the face sizes (no extra k-factor deducted).
import { roundedRect, holeIn, rectContour, packPieces, clamp, shape, poly, contour } from "./helpers.js";
import {
  foldAngle, foldU, foldC, foldHat, foldZ, foldOpenBox, foldLiddedBox,
  foldTrayCross, foldS2r, foldHopper, foldFrustum, face, attach, assemble,
} from "../fold3d.js";

const panel = (w, h, holes = []) => {
  const c = [rectContour(w, h)];
  for (const [x, y, d] of holes) { const hole = holeIn(x, y, d, 0, 0, w, h, 1); if (hole) c.push(hole); }
  return c;
};
const strip = (len, widths) => [rectContour(len, widths.reduce((a, b) => a + b, 0))];

function holesOn(len, wid, d, inset, count = 1) {
  const hs = [];
  if (!(d > 0)) return hs;
  const ins = Math.max(d / 2 + 2, inset);
  if (count === 1) hs.push([len / 2, Math.min(Math.max(ins, wid / 2), wid - ins), d]);
  else {
    const span = Math.max(ins, len - ins);
    for (let i = 0; i < count; i++) {
      const x = ins + (i * (len - 2 * ins)) / Math.max(1, count - 1);
      hs.push([x, Math.min(Math.max(ins, wid / 2), wid - ins), d]);
    }
  }
  return hs;
}
function foldHoles(len, wid, d, inset, count, leg) {
  return holesOn(len, wid, d, inset, count).map(([cx, cy, dd]) => ({ cx, cy, r: dd / 2, leg }));
}

function crossTray(l, w, h, tab = 0) {
  // Plus-shaped one-piece tray: sides attached to the four edges of the bottom.
  //     [ l × h ]
  // [h × w][ l × w ][h × w]
  //     [ l × h ]
  const pts = [
    [h, 0], [h + l, 0], [h + l, h], [h + l + h, h], [h + l + h, h + w],
    [h + l, h + w], [h + l, h + w + h], [h, h + w + h], [h, h + w],
    [0, h + w], [0, h], [h, h],
  ];
  const c = [poly(pts)];
  // if tabs, add rectangles on the left/right of the long sides — kept as a packed extra for simplicity when tab>0
  if (tab > 0) {
    return packPieces([c, panel(h, tab), panel(h, tab), panel(h, tab), panel(h, tab)]).contours;
  }
  return c;
}

export const FOLD_PRESETS = [
  shape("foldlbr", "Folded L-bracket", "⌊", "folded", "folded l bracket angle formed",
    "Formed L-bracket: one developed strip for both legs, with mounting holes in each leg. Bend at 90° along the mid line.",
    [["a", "Wall leg", 80], ["b", "Shelf leg", 60], ["len", "Width", 40], ["hole", "Hole Ø (0 = none)", 8], ["inset", "Hole from the end", 16]],
    (p) => {
      const c = [rectContour(p.len, p.a + p.b)];
      for (const [x, y, d] of holesOn(p.len, p.a, p.hole, p.inset, p.len > 50 ? 2 : 1)) {
        const h = holeIn(x, y, d, 0, 0, p.len, p.a + p.b, 1); if (h) c.push(h);
      }
      for (const [x, y, d] of holesOn(p.len, p.b, p.hole, p.inset, p.len > 50 ? 2 : 1)) {
        const h = holeIn(x, p.a + y, d, 0, 0, p.len, p.a + p.b, 1); if (h) c.push(h);
      }
      return c;
    },
    { noResize: true, fold: (p) => foldAngle(p.len, p.a, p.b, foldHoles(p.len, p.a, p.hole, p.inset, p.len > 50 ? 2 : 1, 0).concat(foldHoles(p.len, p.b, p.hole, p.inset, p.len > 50 ? 2 : 1, 1))) }),

  shape("foldzbr", "Folded Z-bracket", "Z", "folded", "folded z bracket offset",
    "Formed Z-bracket: three panels in one strip (two legs and a web), bent in opposite directions.",
    [["a", "First leg", 40], ["web", "Web (offset)", 50], ["b", "Second leg", 40], ["len", "Width", 40], ["hole", "Hole Ø (0 = none)", 7], ["inset", "Hole from the end", 14]],
    (p) => {
      const H = p.a + p.web + p.b, c = [rectContour(p.len, H)];
      for (const [x, y, d] of holesOn(p.len, p.a, p.hole, p.inset, 1)) { const h = holeIn(x, y, d, 0, 0, p.len, H, 1); if (h) c.push(h); }
      for (const [x, y, d] of holesOn(p.len, p.b, p.hole, p.inset, 1)) { const h = holeIn(x, p.a + p.web + y, d, 0, 0, p.len, H, 1); if (h) c.push(h); }
      return c;
    },
    { noResize: true, fold: (p) => foldZ(p.len, p.a, p.web, p.b) }),

  shape("foldubr", "Folded U-bracket", "⋃", "folded", "folded u bracket channel mount",
    "Formed U-bracket: a web and two legs in one strip, with a hole in each leg.",
    [["web", "Web width", 50], ["leg", "Leg height", 40], ["len", "Width", 40], ["hole", "Hole Ø (0 = none)", 8], ["inset", "Hole from the end", 14]],
    (p) => {
      const H = p.leg + p.web + p.leg, c = [rectContour(p.len, H)];
      for (const [x, y, d] of holesOn(p.len, p.leg, p.hole, p.inset, 1)) { const h = holeIn(x, y, d, 0, 0, p.len, H, 1); if (h) c.push(h); }
      for (const [x, y, d] of holesOn(p.len, p.leg, p.hole, p.inset, 1)) { const h = holeIn(x, p.leg + p.web + y, d, 0, 0, p.len, H, 1); if (h) c.push(h); }
      return c;
    },
    { noResize: true, fold: (p) => foldU(p.len, p.web, p.leg, foldHoles(p.len, p.web, p.hole, p.inset, 1, 0)) }),

  shape("anglegus", "Angle with gusset", "∟", "folded", "angle gusset formed stiffener",
    "Formed angle (one developed strip) packed with a triangular gusset to weld into the corner.",
    [["a", "First leg", 50], ["b", "Second leg", 50], ["len", "Length", 80], ["g", "Gusset size", 40]],
    (p) => packPieces([panel(p.len, p.a + p.b), [poly([[0, 0], [p.g, 0], [0, p.g]])]]).contours,
    { sheet: true, noResize: true, fold: (p) => {
      const m = foldAngle(p.len, p.a, p.b);
      const g = face(p.g, p.g);
      const extra = assemble(g);
      extra.faces.forEach((f) => f.pts.forEach((q) => { q[0] += p.len + 8; }));
      return { faces: m.faces.concat(extra.faces), panels: m.panels.concat([{ w: p.g, h: p.g }]) };
    } }),

  shape("hatsect", "Hat section", "⊓", "folded", "hat channel section furring",
    "Hat section: a web, two legs and two return flanges in one developed strip.",
    [["web", "Web width", 60], ["leg", "Leg height", 30], ["flange", "Return flange", 16], ["len", "Length", 300]],
    (p) => strip(p.len, [p.flange, p.leg, p.web, p.leg, p.flange]),
    { noResize: true, fold: (p) => foldHat(p.len, p.web, p.leg, p.flange) }),

  shape("opentabbox", "Open box with tabs", "▢", "folded", "open box tabs folded tray",
    "One-piece open box: a plus-shaped unfold (bottom and four sides) plus four corner tabs packed beside it.",
    [["len", "Inside length", 140], ["wid", "Inside width", 90], ["ht", "Height", 40], ["tab", "Tab width", 12]],
    (p) => packPieces([crossTray(p.len, p.wid, p.ht), panel(p.ht, p.tab), panel(p.ht, p.tab), panel(p.ht, p.tab), panel(p.ht, p.tab)]).contours,
    { sheet: true, noResize: true, fold: (p) => foldTrayCross(p.len, p.wid, p.ht, p.tab) }),

  shape("closedtabbox", "Closed box with tabs", "▣", "folded", "closed box tabs lid folded",
    "Closed box: the open-box plus-shaped unfold, a lid, and corner tabs.",
    [["len", "Inside length", 120], ["wid", "Inside width", 80], ["ht", "Height", 50], ["tab", "Tab width", 12]],
    (p) => packPieces([
      crossTray(p.len, p.wid, p.ht),
      panel(p.len, p.wid),
      panel(p.ht, p.tab), panel(p.ht, p.tab), panel(p.ht, p.tab), panel(p.ht, p.tab),
    ]).contours,
    { sheet: true, noResize: true, fold: (p) => foldLiddedBox(p.len, p.wid, p.ht) }),

  shape("traytabs", "Tray with tabs", "▭", "folded", "tray tabs hem folded",
    "Shallow one-piece tray (plus-shaped unfold) with corner tabs.",
    [["len", "Inside length", 180], ["wid", "Inside width", 110], ["ht", "Side height", 22], ["tab", "Tab width", 10]],
    (p) => packPieces([crossTray(p.len, p.wid, p.ht), panel(p.ht, p.tab), panel(p.ht, p.tab), panel(p.ht, p.tab), panel(p.ht, p.tab)]).contours,
    { sheet: true, noResize: true, fold: (p) => foldTrayCross(p.len, p.wid, p.ht, p.tab) }),

  shape("foldshelf", "Folded shelf bracket", "⌊", "folded", "folded shelf bracket return flange",
    "Shelf bracket formed from an L with a small return flange on the shelf leg, and holes in the wall leg.",
    [["wall", "Wall leg", 100], ["shelf", "Shelf leg", 80], ["flange", "Front return", 16], ["len", "Width", 30], ["hole", "Hole Ø (0 = none)", 6], ["inset", "Hole from the end", 16]],
    (p) => {
      const H = p.wall + p.shelf + p.flange, c = [rectContour(p.len, H)];
      for (const [x, y, d] of holesOn(p.len, p.wall, p.hole, p.inset, p.wall > 70 ? 2 : 1)) {
        const h = holeIn(x, y, d, 0, 0, p.len, H, 1); if (h) c.push(h);
      }
      return c;
    },
    { noResize: true, fold: (p) => {
      const A = face(p.len, p.wall, foldHoles(p.len, p.wall, p.hole, p.inset, p.wall > 70 ? 2 : 1, 0));
      const S = face(p.len, p.shelf);
      attach(S, 2, 90, face(p.len, p.flange));
      attach(A, 2, 90, S);
      return assemble(A);
    } }),

  shape("wallmount", "Wall mount shelf", "⊏", "folded", "wall mount shelf folded",
    "Wall-mounted shelf: a back plate (with holes) and a shelf, formed as one L, optional front lip.",
    [["back", "Back height", 60], ["shelf", "Shelf depth", 80], ["lip", "Front lip (0 = none)", 16], ["len", "Width", 150], ["hole", "Hole Ø (0 = none)", 6], ["inset", "Hole from the edge", 16]],
    (p) => {
      const H = p.back + p.shelf + Math.max(0, p.lip), c = [rectContour(p.len, H)];
      for (const [x, y, d] of holesOn(p.len, p.back, p.hole, p.inset, p.len > 80 ? 2 : 1)) {
        const h = holeIn(x, y, d, 0, 0, p.len, H, 1); if (h) c.push(h);
      }
      return c;
    },
    { noResize: true, fold: (p) => {
      const B = face(p.len, p.back, foldHoles(p.len, p.back, p.hole, p.inset, p.len > 80 ? 2 : 1, 0));
      const S = face(p.len, p.shelf);
      if (p.lip > 0) attach(S, 2, 90, face(p.len, p.lip));
      attach(B, 2, 90, S);
      return assemble(B);
    } }),

  shape("hingebr", "Folded hinge bracket", "⊓", "folded", "hinge bracket folded leaf",
    "Hinge-style bracket: two leaves in one strip, bent 90°, with two holes in each leaf.",
    [["a", "First leaf", 50], ["b", "Second leaf", 50], ["len", "Width", 40], ["hole", "Hole Ø", 6], ["inset", "Hole from the end", 12]],
    (p) => {
      const H = p.a + p.b, c = [rectContour(p.len, H)];
      for (const [x, y, d] of holesOn(p.len, p.a, p.hole, p.inset, 2)) { const h = holeIn(x, y, d, 0, 0, p.len, H, 1); if (h) c.push(h); }
      for (const [x, y, d] of holesOn(p.len, p.b, p.hole, p.inset, 2)) { const h = holeIn(x, p.a + y, d, 0, 0, p.len, H, 1); if (h) c.push(h); }
      return c;
    },
    { noResize: true, fold: (p) => foldAngle(p.len, p.a, p.b, foldHoles(p.len, p.a, p.hole, p.inset, 2, 0).concat(foldHoles(p.len, p.b, p.hole, p.inset, 2, 1))) }),

  shape("pipeustrap", "Pipe clamp (U-saddle)", "⋃", "folded", "pipe clamp u saddle strap folded",
    "U-saddle pipe clamp: a formed U to wrap a pipe, with a mounting hole in each leg.",
    [["d", "Pipe Ø", 50], ["leg", "Leg length", 40], ["wid", "Strap width", 24], ["hole", "Hole Ø", 8], ["inset", "Hole from the end", 12]],
    (p) => {
      const web = Math.PI * p.d / 2;          // half-wrap developed
      const H = p.leg + web + p.leg, c = [rectContour(p.wid, H)];
      for (const [x, y, d] of holesOn(p.wid, p.leg, p.hole, p.inset, 1)) { const h = holeIn(x, y, d, 0, 0, p.wid, H, 1); if (h) c.push(h); }
      for (const [x, y, d] of holesOn(p.wid, p.leg, p.hole, p.inset, 1)) { const h = holeIn(x, p.leg + web + y, d, 0, 0, p.wid, H, 1); if (h) c.push(h); }
      return c;
    },
    { noResize: true, fold: (p) => {
      // approximate the belly as a U of web = d (across) rather than a true half-cylinder
      const web = Math.max(p.d, 8);
      return foldU(p.wid, web, p.leg, foldHoles(p.wid, web, p.hole, p.inset, 1, 0));
    } }),

  shape("usaddle", "U-saddle strap", "⋃", "folded", "u saddle pipe strap folded flanges",
    "Wider U-saddle with outward mounting flanges on both legs.",
    [["d", "Pipe Ø (web)", 60], ["leg", "Leg height", 30], ["flange", "Mounting flange", 24], ["wid", "Strap width", 30], ["hole", "Hole Ø", 8]],
    (p) => strip(p.wid, [p.flange, p.leg, p.d, p.leg, p.flange]),
    { noResize: true, fold: (p) => foldC(p.wid, p.d, p.leg, p.flange) }),

  shape("fanduct", "Fan duct transition", "⏢", "folded", "fan duct square to round folded",
    "Short square-to-round transition for a fan or filter, packed with a square flange.",
    [["a", "Square / fan side", 140], ["d", "Round Ø", 100], ["h", "Height", 60], ["lip", "Flange lip", 18]],
    (p) => {
      // reuse the same triangulation as s2r when available; fallback to four trapezoids
      const bot = p.a, top = p.d * Math.PI / 4;
      const slant = Math.hypot(p.h, (bot - p.d) / 2);
      const trap = (bw, tw, s) => [poly([[0, 0], [bw, 0], [(bw + tw) / 2, s], [(bw - tw) / 2, s]])];
      const pieces = [trap(bot, Math.min(top, bot), slant), trap(bot, Math.min(top, bot), slant), trap(bot, Math.min(top, bot), slant), trap(bot, Math.min(top, bot), slant)];
      if (p.lip > 0.5) pieces.push(panel(p.a + 2 * p.lip, p.a + 2 * p.lip));
      return packPieces(pieces).contours;
    },
    { sheet: true, noResize: true, fold: (p) => foldS2r(p.a, p.a, p.d, p.h) }),

  shape("hopflange", "Hopper with flanges", "▽", "folded", "hopper folded flanges",
    "Rectangular hopper with a folded flange around the top opening.",
    [["a", "Base width", 200], ["b", "Base depth", 150], ["a2", "Top width", 80], ["b2", "Top depth", 60], ["h", "Height", 140], ["lip", "Top flange", 18]],
    (p) => {
      const sides = [];
      const slantA = Math.hypot(p.h, (p.a - p.a2) / 2), slantB = Math.hypot(p.h, (p.b - p.b2) / 2);
      const trap = (bw, tw, s, lip) => [poly([[0, 0], [bw, 0], [(bw + tw) / 2, s], [(bw + tw) / 2, s + lip], [(bw - tw) / 2, s + lip], [(bw - tw) / 2, s]])];
      sides.push(trap(p.a, p.a2, slantA, p.lip), trap(p.a, p.a2, slantA, p.lip), trap(p.b, p.b2, slantB, p.lip), trap(p.b, p.b2, slantB, p.lip));
      return packPieces(sides).contours;
    },
    { sheet: true, noResize: true, fold: (p) => foldHopper(p.a, p.b, p.a2, p.b2, p.h) }),

  shape("gusflange", "Gusset with flanges", "◣", "folded", "gusset folded flanges stiffener",
    "Right-angle gusset with a folded flange along each leg, developed as one piece.",
    [["a", "Bottom leg", 80], ["b", "Upright leg", 80], ["flange", "Flange width", 16]],
    (p) => {
      const f = p.flange;
      const pts = [[0, 0], [p.a + f, 0], [p.a + f, f], [f, f], [f, p.b + f], [0, p.b + f]];
      // triangle web is the area above the flanges? Actually: flanges are rectangles on the two legs of the triangle.
      // Developed: triangle (a × b) with rectangles a×f and b×f attached to the legs.
      const web = [[f, f], [p.a + f, f], [f, p.b + f]];
      const outline = [[0, 0], [p.a + f, 0], [p.a + f, f], [f, p.b + f], [0, p.b + f]];
      return [poly(outline)];
    },
    { noResize: true, fold: (p) => {
      const web = face(p.a, p.b);
      attach(web, 0, 90, face(p.a, p.flange));
      attach(web, 3, 90, face(p.b, p.flange));
      return assemble(web);
    } }),

  shape("signbr", "Sign / flag bracket", "⚑", "folded", "sign flag bracket folded wall",
    "Flag-style sign bracket: a wall plate with holes and an out-standing arm, formed as an L.",
    [["wall", "Wall plate height", 80], ["arm", "Arm length", 70], ["wid", "Width", 30], ["hole", "Hole Ø", 6], ["inset", "Hole from the end", 14]],
    (p) => {
      const H = p.wall + p.arm, c = [rectContour(p.wid, H)];
      for (const [x, y, d] of holesOn(p.wid, p.wall, p.hole, p.inset, 2)) { const h = holeIn(x, y, d, 0, 0, p.wid, H, 1); if (h) c.push(h); }
      return c;
    },
    { noResize: true, fold: (p) => foldAngle(p.wid, p.wall, p.arm, foldHoles(p.wid, p.wall, p.hole, p.inset, 2, 0)) }),

  shape("firepit", "Firepit side panel", "⬡", "folded", "firepit ring panel folded",
    "One facet of a polygonal firepit: a side with a bottom inward flange and a top outward lip, plus optional air holes.",
    [["w", "Panel width", 160], ["h", "Height", 120], ["base", "Bottom flange", 20], ["lip", "Top lip", 14], ["hole", "Air-hole Ø (0 = none)", 12], ["n", "Number of air holes", 3]],
    (p) => {
      const H = p.base + p.h + p.lip, c = [rectContour(p.w, H)];
      const n = Math.max(0, Math.round(p.n));
      if (p.hole > 0 && n > 0) {
        for (let i = 0; i < n; i++) {
          const x = (p.w * (i + 1)) / (n + 1), y = p.base + p.h * 0.35;
          const h = holeIn(x, y, p.hole, 0, 0, p.w, H, 1); if (h) c.push(h);
        }
      }
      return c;
    },
    { noResize: true, fold: (p) => {
      const S = face(p.w, p.h);
      attach(S, 0, 90, face(p.w, p.base));
      attach(S, 2, -90, face(p.w, p.lip));
      return assemble(S);
    } }),

  shape("bbqside", "BBQ / firebowl panel", "▬", "folded", "bbq firebowl panel folded",
    "BBQ or firebowl side: a slightly taller panel with a bottom flange (to bolt to a ring) and a rolled top lip.",
    [["w", "Panel width", 180], ["h", "Height", 90], ["base", "Bottom flange", 18], ["lip", "Top lip", 12], ["hole", "Bolt hole Ø (0 = none)", 8]],
    (p) => {
      const H = p.base + p.h + p.lip, c = [rectContour(p.w, H)];
      if (p.hole > 0) {
        const h1 = holeIn(p.w * 0.25, p.base / 2, p.hole, 0, 0, p.w, H, 1);
        const h2 = holeIn(p.w * 0.75, p.base / 2, p.hole, 0, 0, p.w, H, 1);
        if (h1) c.push(h1); if (h2) c.push(h2);
      }
      return c;
    },
    { noResize: true, fold: (p) => {
      const S = face(p.w, p.h);
      attach(S, 0, 90, face(p.w, p.base));
      attach(S, 2, -90, face(p.w, p.lip));
      return assemble(S);
    } }),

  shape("cabletray", "Cable tray", "⋃", "folded", "cable tray perforated u flanges",
    "Cable tray: a U with return flanges, one developed strip. Optional holes down the web.",
    [["web", "Web width", 80], ["leg", "Side height", 40], ["flange", "Return flange", 12], ["len", "Length", 400], ["hole", "Web hole Ø (0 = none)", 8]],
    (p) => {
      const H = p.flange + p.leg + p.web + p.leg + p.flange, c = [rectContour(p.len, H)];
      if (p.hole > 0) {
        const y = p.flange + p.leg + p.web / 2, n = Math.max(1, Math.floor(p.len / 50));
        for (let i = 0; i < n; i++) {
          const x = (p.len * (i + 1)) / (n + 1);
          const h = holeIn(x, y, p.hole, 0, 0, p.len, H, 1); if (h) c.push(h);
        }
      }
      return c;
    },
    { noResize: true, fold: (p) => foldC(p.len, p.web, p.leg, p.flange) }),

  shape("dripedge", "Drip edge", "⌐", "folded", "drip edge flashing folded roof",
    "Roof drip edge: a fascia leg and a roof leg with a small drip kick, one strip.",
    [["fascia", "Fascia leg", 50], ["roof", "Roof leg", 60], ["kick", "Drip kick", 10], ["len", "Length", 400]],
    (p) => strip(p.len, [p.kick, p.fascia, p.roof]),
    { noResize: true, fold: (p) => {
      const F = face(p.len, p.fascia);
      attach(F, 0, 90, face(p.len, p.kick));
      attach(F, 2, 90, face(p.len, p.roof));
      return assemble(F);
    } }),

  shape("jchannel", "J-channel", "J", "folded", "j channel window folded",
    "J-channel: a back, a return, a face and a short hook, one developed strip.",
    [["back", "Back height", 30], ["face", "Face height", 20], ["return", "Return (pocket)", 16], ["hook", "Hook", 8], ["len", "Length", 400]],
    (p) => strip(p.len, [p.back, p.return, p.face, p.hook]),
    { noResize: true, fold: (p) => {
      const B = face(p.len, p.back);
      const R = face(p.len, p.return);
      const F = face(p.len, p.face);
      attach(F, 2, 90, face(p.len, p.hook));
      attach(R, 2, 90, F);
      attach(B, 2, 90, R);
      return assemble(B);
    } }),

  shape("cornerguard", "Corner guard", "∟", "folded", "corner guard angle folded wings",
    "Corner guard: two equal legs in one strip, with optional holes along each leg.",
    [["a", "Leg width", 50], ["len", "Length", 300], ["hole", "Hole Ø (0 = none)", 5], ["inset", "Hole from the edge", 14]],
    (p) => {
      const c = [rectContour(p.len, p.a + p.a)];
      if (p.hole > 0) {
        const n = Math.max(1, Math.floor(p.len / 80));
        for (let i = 0; i < n; i++) {
          const x = (p.len * (i + 1)) / (n + 1);
          const h1 = holeIn(x, p.inset, p.hole, 0, 0, p.len, 2 * p.a, 1);
          const h2 = holeIn(x, p.a + p.inset, p.hole, 0, 0, p.len, 2 * p.a, 1);
          if (h1) c.push(h1); if (h2) c.push(h2);
        }
      }
      return c;
    },
    { noResize: true, fold: (p) => foldAngle(p.len, p.a, p.a) }),

  shape("machineguard", "Machine guard (3-sided)", "⊓", "folded", "machine guard three sided folded",
    "Three-sided machine guard: a front and two sides in one U-shaped unfold, with optional viewing window.",
    [["w", "Front width", 200], ["d", "Side depth", 80], ["h", "Height", 120], ["iw", "Window width (0 = none)", 80], ["ih", "Window height", 50]],
    (p) => {
      const W = p.d + p.w + p.d, c = [rectContour(W, p.h)];
      if (p.iw > 8 && p.ih > 8) {
        const iw = clamp(p.iw, 10, p.w - 16), ih = clamp(p.ih, 8, p.h - 16);
        c.push(roundedRect(p.d + (p.w - iw) / 2, (p.h - ih) / 2, iw, ih, 4));
      }
      return c;
    },
    { noResize: true, fold: (p) => foldU(p.h, p.w, p.d) }),

  shape("bookend", "Bookend", "L", "folded", "bookend folded",
    "Bookend: a base and an upright in one L, with a small front return so it stands firmly.",
    [["base", "Base depth", 80], ["up", "Upright height", 140], ["lip", "Front return", 16], ["wid", "Width", 80]],
    (p) => strip(p.wid, [p.lip, p.base, p.up]),
    { noResize: true, fold: (p) => {
      const B = face(p.wid, p.base);
      attach(B, 0, 90, face(p.wid, p.lip));
      attach(B, 2, 90, face(p.wid, p.up));
      return assemble(B);
    } }),

  shape("ridgecap", "Roof ridge cap", "Λ", "folded", "ridge cap flashing folded roof",
    "Ridge cap: two roof legs and a small centre welt, one developed strip.",
    [["leg", "Each roof leg", 80], ["welt", "Centre welt (0 = none)", 10], ["len", "Length", 400]],
    (p) => strip(p.len, [p.leg, Math.max(0, p.welt), p.leg]),
    { noResize: true, fold: (p) => {
      if (p.welt > 0) return foldZ(p.len, p.leg, p.welt, p.leg);
      return foldAngle(p.len, p.leg, p.leg);
    } }),

  shape("postcap", "Post cap", "▣", "folded", "post cap folded box lid",
    "Post cap: a top and four shallow sides, packed like the existing box-lid pattern, sized for a square post.",
    [["s", "Post size (inside)", 90], ["ht", "Side height", 25], ["over", "Overhang each side", 6]],
    (p) => {
      const top = p.s + 2 * p.over;
      return packPieces([panel(top, top), panel(top, p.ht), panel(top, p.ht), panel(top, p.ht), panel(top, p.ht)]).contours;
    },
    { sheet: true, noResize: true, fold: (p) => foldOpenBox(p.s + 2 * p.over, p.s + 2 * p.over, p.ht) }),

  shape("planterbox", "Planter box", "▢", "folded", "planter box folded hem",
    "Planter / trough: an open box with a small outward hem on each side.",
    [["len", "Inside length", 300], ["wid", "Inside width", 120], ["ht", "Height", 80], ["hem", "Top hem", 12]],
    (p) => packPieces([
      panel(p.len, p.wid),
      panel(p.len, p.ht + p.hem), panel(p.len, p.ht + p.hem),
      panel(p.wid, p.ht + p.hem), panel(p.wid, p.ht + p.hem),
    ]).contours,
    { sheet: true, noResize: true, fold: (p) => {
      const bot = face(p.len, p.wid);
      const L = face(p.len, p.ht); attach(L, 2, -90, face(p.len, p.hem));
      const L2 = face(p.len, p.ht); attach(L2, 2, -90, face(p.len, p.hem));
      const S = face(p.wid, p.ht); attach(S, 2, -90, face(p.wid, p.hem));
      const S2 = face(p.wid, p.ht); attach(S2, 2, -90, face(p.wid, p.hem));
      attach(bot, 0, 90, L); attach(bot, 2, 90, L2); attach(bot, 3, 90, S); attach(bot, 1, 90, S2);
      return assemble(bot);
    } }),

  shape("oilpan", "Oil / drip pan", "▭", "folded", "oil drip pan swarf tray folded",
    "Shallow drip or swarf pan: a one-piece plus-shaped unfold with low sides.",
    [["len", "Inside length", 250], ["wid", "Inside width", 160], ["ht", "Side height", 20]],
    (p) => crossTray(p.len, p.wid, p.ht),
    { noResize: true, fold: (p) => foldTrayCross(p.len, p.wid, p.ht) }),

  shape("rainhood", "Rain hood", "⌂", "folded", "rain hood weather cap folded",
    "Rain hood / weather cap: a sloped top, a back and two sides, packed on the sheet.",
    [["w", "Width", 160], ["d", "Depth", 100], ["front", "Front height", 40], ["back", "Back height", 90]],
    (p) => {
      const slant = Math.hypot(p.d, p.back - p.front);
      const side = [poly([[0, 0], [p.d, 0], [p.d, p.back], [0, p.front]])];
      return packPieces([panel(p.w, slant), panel(p.w, p.back), side, side]).contours;
    },
    { sheet: true, noResize: true, fold: (p) => {
      const faces = [];
      const b = p.back, f = p.front, d = p.d, w = p.w;
      faces.push({ pts: [[0, 0, 0], [w, 0, 0], [w, b, 0], [0, b, 0]], n: [0, 0, -1], holes: [], w, h: b });
      faces.push({ pts: [[0, b, 0], [w, b, 0], [w, f, d], [0, f, d]], n: [0, 0.7, 0.4], holes: [], w, h: Math.hypot(d, b - f) });
      faces.push({ pts: [[0, 0, 0], [0, b, 0], [0, f, d], [0, 0, d]], n: [-1, 0, 0], holes: [], w: d, h: b });
      faces.push({ pts: [[w, 0, 0], [w, 0, d], [w, f, d], [w, b, 0]], n: [1, 0, 0], holes: [], w: d, h: b });
      return { faces, panels: faces.map((q) => ({ w: q.w, h: q.h })) };
    } }),

  shape("venthood", "Vent hood", "⌂", "folded", "vent hood extractor folded",
    "Extractor / vent hood: a rectangular canopy with four sides and an optional top outlet hole.",
    [["w", "Width", 220], ["d", "Depth", 160], ["h", "Side height", 50], ["hole", "Outlet Ø (0 = none)", 80]],
    (p) => {
      const top = panel(p.w, p.d, p.hole > 8 ? [[p.w / 2, p.d / 2, p.hole]] : []);
      return packPieces([top, panel(p.w, p.h), panel(p.w, p.h), panel(p.d, p.h), panel(p.d, p.h)]).contours;
    },
    { sheet: true, noResize: true, fold: (p) => {
      const bot = face(p.w, p.d, p.hole > 8 ? [{ cx: p.w / 2, cy: p.d / 2, r: p.hole / 2 }] : []);
      attach(bot, 0, 90, face(p.w, p.h));
      attach(bot, 2, 90, face(p.w, p.h));
      attach(bot, 3, 90, face(p.d, p.h));
      attach(bot, 1, 90, face(p.d, p.h));
      return assemble(bot);
    } }),

  shape("battbox", "Battery box", "▣", "folded", "battery box tabs folded enclosure",
    "Small battery / project box: a plus-shaped open box, a lid with holes, and corner tabs.",
    [["len", "Inside length", 100], ["wid", "Inside width", 70], ["ht", "Height", 40], ["tab", "Tab width", 10], ["hole", "Lid hole Ø (0 = none)", 5], ["inset", "Lid hole from the edge", 10]],
    (p) => {
      const lid = panel(p.len, p.wid, p.hole > 0 ? [
        [p.inset, p.inset, p.hole], [p.len - p.inset, p.inset, p.hole],
        [p.len - p.inset, p.wid - p.inset, p.hole], [p.inset, p.wid - p.inset, p.hole],
      ] : []);
      return packPieces([crossTray(p.len, p.wid, p.ht), lid, panel(p.ht, p.tab), panel(p.ht, p.tab), panel(p.ht, p.tab), panel(p.ht, p.tab)]).contours;
    },
    { sheet: true, noResize: true, fold: (p) => foldLiddedBox(p.len, p.wid, p.ht) }),

  shape("lightbr", "Light-fixture bracket", "⌐", "folded", "light fixture bracket folded",
    "Light-fixture bracket: a wall plate with holes and a short shelf, formed as an L.",
    [["wall", "Wall plate", 70], ["shelf", "Shelf depth", 40], ["wid", "Width", 50], ["hole", "Hole Ø", 6], ["inset", "Hole from the end", 14]],
    (p) => {
      const H = p.wall + p.shelf, c = [rectContour(p.wid, H)];
      for (const [x, y, d] of holesOn(p.wid, p.wall, p.hole, p.inset, 2)) { const h = holeIn(x, y, d, 0, 0, p.wid, H, 1); if (h) c.push(h); }
      return c;
    },
    { noResize: true, fold: (p) => foldAngle(p.wid, p.wall, p.shelf, foldHoles(p.wid, p.wall, p.hole, p.inset, 2, 0)) }),

  shape("kickplate", "Folded kick / step plate", "▬", "folded", "kick plate step folded nosing",
    "Kick or step plate: a tread and a riser in one L, with an optional front nosing.",
    [["tread", "Tread depth", 80], ["riser", "Riser height", 30], ["nose", "Front nosing (0 = none)", 10], ["len", "Length", 400]],
    (p) => strip(p.len, [Math.max(0, p.nose), p.tread, p.riser]),
    { noResize: true, fold: (p) => {
      const T = face(p.len, p.tread);
      if (p.nose > 0) attach(T, 0, 90, face(p.len, p.nose));
      attach(T, 2, 90, face(p.len, p.riser));
      return assemble(T);
    } }),

  shape("furring", "Furring channel", "⊓", "folded", "furring channel hat folded",
    "Furring (hat) channel, slightly narrower than the workshop hat section, for lining a wall or ceiling.",
    [["web", "Web width", 40], ["leg", "Leg height", 20], ["flange", "Return flange", 12], ["len", "Length", 400]],
    (p) => strip(p.len, [p.flange, p.leg, p.web, p.leg, p.flange]),
    { noResize: true, fold: (p) => foldHat(p.len, p.web, p.leg, p.flange) }),

  shape("windowsill", "Window sill / drip cap", "⌐", "folded", "window sill drip cap folded",
    "Window sill / drip cap: a sloping sill, a back upstand and a front drip kick, one strip.",
    [["sill", "Sill depth", 70], ["up", "Back upstand", 25], ["kick", "Front drip", 12], ["len", "Length", 400]],
    (p) => strip(p.len, [p.kick, p.sill, p.up]),
    { noResize: true, fold: (p) => {
      const S = face(p.len, p.sill);
      attach(S, 0, 90, face(p.len, p.kick));
      attach(S, 2, 90, face(p.len, p.up));
      return assemble(S);
    } }),
];

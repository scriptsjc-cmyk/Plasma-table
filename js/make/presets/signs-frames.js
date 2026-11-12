// Signs, frames and nameplates.
import { roundedRect, holeIn, poly, circleContour, clamp, shape } from "./helpers.js";

export const SIGN_PRESETS = [
  shape("numplate", "Number plate", "▭", "signage", "number plate registration tag",
    "Rounded number / registration plate with two mounting slots (holes).",
    [["w", "Width", 220], ["h", "Height", 70], ["r", "Corner radius", 10], ["hole", "Hole Ø", 6], ["inset", "Hole centre from the end", 18]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const h1 = holeIn(p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("nameplate", "Nameplate with holes", "▭", "signage", "name plate label",
    "Nameplate with a hole in each corner.",
    [["w", "Width", 180], ["h", "Height", 50], ["r", "Corner radius", 6], ["hole", "Hole Ø", 5], ["inset", "Hole centre from the edge", 10]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      for (const [x, y] of [[p.inset, p.inset], [p.w - p.inset, p.inset], [p.w - p.inset, p.h - p.inset], [p.inset, p.h - p.inset]]) {
        const h = holeIn(x, y, p.hole, 0, 0, p.w, p.h, 1);
        if (h) c.push(h);
      }
      return c;
    }),
  shape("wideframe", "Picture frame (wide)", "▭", "signage", "picture frame wide rebate",
    "A wide picture / panel frame (the opening is a hole).",
    [["w", "Outside width", 260], ["h", "Outside height", 180], ["lip", "Frame width", 30], ["r", "Outside corner radius", 6]],
    (p) => {
      const lip = clamp(p.lip, 6, Math.min(p.w, p.h) / 2 - 4);
      return [roundedRect(0, 0, p.w, p.h, p.r), roundedRect(lip, lip, p.w - 2 * lip, p.h - 2 * lip, Math.max(0, p.r - 2))];
    }),
  shape("circleframe", "Circle frame", "○", "signage", "circular frame ring frame",
    "Circular frame (a ring wide enough to be a sign bezel).",
    [["od", "Outside Ø", 200], ["id", "Opening Ø", 140]],
    (p) => {
      const od = p.od, id = clamp(p.id, 10, od - 8);
      const r = od / 2;
      return [circleContour(r, r, r), circleContour(r, r, id / 2)];
    }),
  shape("badge", "Badge / medallion", "⬤", "signage", "badge medallion disc sign",
    "Circular badge with two small hanging holes at the top.",
    [["d", "Diameter", 80], ["hole", "Hole Ø", 4], ["inset", "Hole centre from the edge", 8]],
    (p) => {
      const r = p.d / 2;
      const c = [circleContour(r, r, r)];
      const y = p.d - p.inset;
      const span = Math.min(18, r * 0.4);
      const h1 = holeIn(r - span, y, p.hole, 0, 0, p.d, p.d, 1);
      const h2 = holeIn(r + span, y, p.hole, 0, 0, p.d, p.d, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("arrowsign", "Arrow sign", "➤", "signage", "arrow direction sign",
    "Direction arrow (a wide shaft and a triangular head) with two mounting holes.",
    [["w", "Overall length", 200], ["h", "Shaft height", 40], ["head", "Head length", 60], ["hole", "Hole Ø", 6], ["inset", "Hole from the back end", 18]],
    (p) => {
      const head = clamp(p.head, 16, p.w - 20);
      const shaft = p.w - head, tip = p.h * 1.7;
      const y0 = (tip - p.h) / 2;
      const c = [poly([
        [0, y0], [shaft, y0], [shaft, 0], [p.w, tip / 2], [shaft, tip], [shaft, y0 + p.h], [0, y0 + p.h],
      ])];
      const h1 = holeIn(p.inset, tip / 2, p.hole, 0, 0, p.w, tip, 1);
      const h2 = holeIn(shaft - p.inset, tip / 2, p.hole, 0, 0, p.w, tip, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("hangsign", "Hanging sign", "▭", "signage", "hanging sign two holes top",
    "Sign board with two hanging holes along the top edge.",
    [["w", "Width", 200], ["h", "Height", 120], ["r", "Corner radius", 8], ["hole", "Hole Ø", 6], ["inset", "Hole from the top / sides", 16]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.r)];
      const y = p.h - p.inset;
      const h1 = holeIn(p.inset, y, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - p.inset, y, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("stencilframe", "Stencil frame", "▣", "signage", "stencil frame holder",
    "A frame for holding a stencil sheet, with a hole in each corner.",
    [["w", "Outside width", 240], ["h", "Outside height", 160], ["lip", "Frame width", 22], ["hole", "Hole Ø", 6], ["inset", "Hole from the edge", 11]],
    (p) => {
      const lip = clamp(p.lip, 8, Math.min(p.w, p.h) / 2 - 4);
      const c = [roundedRect(0, 0, p.w, p.h, 4), roundedRect(lip, lip, p.w - 2 * lip, p.h - 2 * lip, 2)];
      for (const [x, y] of [[p.inset, p.inset], [p.w - p.inset, p.inset], [p.w - p.inset, p.h - p.inset], [p.inset, p.h - p.inset]]) {
        const h = holeIn(x, y, p.hole, 0, 0, p.w, p.h, 1);
        if (h) c.push(h);
      }
      return c;
    }),
  shape("doorplate", "Door plate", "▭", "signage", "door push plate name",
    "Door / push plate with rounded ends and two holes.",
    [["w", "Length", 260], ["h", "Width", 50], ["hole", "Hole Ø", 5], ["inset", "Hole from the end", 18]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.h / 2)];
      const h1 = holeIn(p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("shieldsign", "Shield sign", "🛡️", "signage", "shield crest sign",
    "Shield-shaped sign with two hanging holes.",
    [["w", "Width", 120], ["h", "Height", 150], ["hole", "Hole Ø", 5], ["inset", "Hole from the top / sides", 16]],
    (p) => {
      const pts = [[0, p.h * 0.72], [0, p.h], [p.w, p.h], [p.w, p.h * 0.72], [p.w / 2, 0]];
      const c = [poly(pts)];
      const y = p.h - p.inset;
      const h1 = holeIn(p.inset, y, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - p.inset, y, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
];

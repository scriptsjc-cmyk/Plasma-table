// Extra flanges and rings (on top of the existing flange4–12 family).
import { circleContour, roundedRect, holeIn, boltHoles, clamp, shape } from "./helpers.js";

export const FLANGE_PRESETS = [
  shape("sqflange", "Square flange", "▣", "pipeflanges", "square flange four bolts",
    "Square flange with a centre bore and four bolt holes.",
    [["s", "Outside size", 140], ["id", "Bore Ø", 50], ["hole", "Bolt hole Ø", 12], ["inset", "Bolt centre from the edge", 18], ["r", "Corner radius", 8]],
    (p) => {
      const c = [roundedRect(0, 0, p.s, p.s, p.r)];
      const bore = holeIn(p.s / 2, p.s / 2, p.id, 0, 0, p.s, p.s, 2);
      if (bore) c.push(bore);
      for (const [x, y] of [[p.inset, p.inset], [p.s - p.inset, p.inset], [p.s - p.inset, p.s - p.inset], [p.inset, p.s - p.inset]]) {
        const h = holeIn(x, y, p.hole, 0, 0, p.s, p.s, 1);
        if (h) c.push(h);
      }
      return c;
    }),
  shape("rectflange", "Rectangular flange", "▭", "pipeflanges", "rectangular duct flange",
    "Rectangular duct flange with a rectangular opening and a hole near each corner.",
    [["w", "Outside width", 220], ["h", "Outside height", 160], ["iw", "Opening width", 160], ["ih", "Opening height", 100], ["hole", "Bolt hole Ø", 8], ["inset", "Hole centre from the edge", 16], ["r", "Corner radius", 6]],
    (p) => {
      const iw = clamp(p.iw, 10, p.w - 16), ih = clamp(p.ih, 10, p.h - 16);
      const ox = (p.w - iw) / 2, oy = (p.h - ih) / 2;
      const c = [roundedRect(0, 0, p.w, p.h, p.r), roundedRect(ox, oy, iw, ih, 0)];
      for (const [x, y] of [[p.inset, p.inset], [p.w - p.inset, p.inset], [p.w - p.inset, p.h - p.inset], [p.inset, p.h - p.inset]]) {
        const h = holeIn(x, y, p.hole, 0, 0, p.w, p.h, 1);
        if (h) c.push(h);
      }
      return c;
    }),
  shape("ovalflange", "Oval flange", "⬭", "pipeflanges", "oval race-track flange",
    "Oval (stadium) flange with a matching oval bore and two bolt holes.",
    [["w", "Outside length", 180], ["h", "Outside width", 90], ["idw", "Bore length", 80], ["idh", "Bore width", 40], ["hole", "Bolt hole Ø", 10], ["inset", "Hole centre from the end", 22]],
    (p) => {
      const c = [roundedRect(0, 0, p.w, p.h, p.h / 2)];
      const iw = clamp(p.idw, 10, p.w - 20), ih = clamp(p.idh, 8, p.h - 16);
      c.push(roundedRect((p.w - iw) / 2, (p.h - ih) / 2, iw, ih, ih / 2));
      const h1 = holeIn(p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      const h2 = holeIn(p.w - p.inset, p.h / 2, p.hole, 0, 0, p.w, p.h, 1);
      if (h1) c.push(h1); if (h2) c.push(h2);
      return c;
    }),
  shape("slipflange", "Slip-on flange", "◎", "pipeflanges", "slip on pipe flange",
    "Slip-on style ring flange: bore, bolt circle and outside diameter.",
    [["od", "Outside Ø", 180], ["id", "Bore Ø", 60], ["pcd", "Bolt pitch circle Ø", 140], ["hole", "Bolt hole Ø", 12], ["nbolts", "Number of bolts", 8]],
    (p) => {
      const n = Math.max(3, Math.min(24, Math.round(p.nbolts) || 8));
      const od = p.od, id = Math.min(p.id, od - 16), pcd = clamp(p.pcd, id + p.hole + 4, od - p.hole - 4);
      const r = od / 2;
      const c = [circleContour(r, r, r), circleContour(r, r, id / 2)];
      c.push(...boltHoles(r, r, pcd, n, p.hole, Math.PI / 2 + Math.PI / n));
      return c;
    }),
  shape("wnring", "Weld-neck style ring", "◎", "pipeflanges", "weld neck flange ring",
    "Weld-neck style ring (the plate profile): a narrower bore than a slip-on, with a bolt circle.",
    [["od", "Outside Ø", 190], ["id", "Bore Ø", 40], ["pcd", "Bolt pitch circle Ø", 145], ["hole", "Bolt hole Ø", 14], ["nbolts", "Number of bolts", 8]],
    (p) => {
      const n = Math.max(3, Math.min(24, Math.round(p.nbolts) || 8));
      const r = p.od / 2, id = Math.min(p.id, p.od - 20), pcd = clamp(p.pcd, id + p.hole + 6, p.od - p.hole - 6);
      const c = [circleContour(r, r, r), circleContour(r, r, id / 2)];
      c.push(...boltHoles(r, r, pcd, n, p.hole, Math.PI / 2 + Math.PI / n));
      return c;
    }),
  shape("redflange", "Reducing flange", "◎", "pipeflanges", "reducing flange concentric",
    "Reducing flange: a large bolt circle around a smaller bore.",
    [["od", "Outside Ø", 200], ["id", "Bore Ø (smaller pipe)", 40], ["pcd", "Bolt pitch circle Ø", 160], ["hole", "Bolt hole Ø", 14], ["nbolts", "Number of bolts", 8]],
    (p) => {
      const n = Math.max(3, Math.min(24, Math.round(p.nbolts) || 8));
      const r = p.od / 2, id = Math.min(p.id, p.od - 24), pcd = clamp(p.pcd, id + p.hole + 8, p.od - p.hole - 6);
      const c = [circleContour(r, r, r), circleContour(r, r, id / 2)];
      c.push(...boltHoles(r, r, pcd, n, p.hole, Math.PI / 2 + Math.PI / n));
      return c;
    }),
  shape("compflange", "Companion flange", "◎", "pipeflanges", "companion backing flange",
    "Companion / backing flange: a bolt ring with a generous bore.",
    [["od", "Outside Ø", 170], ["id", "Bore Ø", 80], ["pcd", "Bolt pitch circle Ø", 130], ["hole", "Bolt hole Ø", 11], ["nbolts", "Number of bolts", 6]],
    (p) => {
      const n = Math.max(3, Math.min(24, Math.round(p.nbolts) || 6));
      const r = p.od / 2, id = Math.min(p.id, p.od - 20), pcd = clamp(p.pcd, id + p.hole + 4, p.od - p.hole - 4);
      const c = [circleContour(r, r, r), circleContour(r, r, id / 2)];
      c.push(...boltHoles(r, r, pcd, n, p.hole, Math.PI / 2 + Math.PI / n));
      return c;
    }),
  shape("ductflange", "Duct flange (corner holes)", "▢", "pipeflanges", "duct flange corners",
    "Lightweight duct flange: a frame with a hole in each corner.",
    [["w", "Outside width", 250], ["h", "Outside height", 180], ["lip", "Frame width", 28], ["hole", "Hole Ø", 7], ["inset", "Hole centre from the edge", 14]],
    (p) => {
      const lip = clamp(p.lip, 10, Math.min(p.w, p.h) / 2 - 4);
      const c = [roundedRect(0, 0, p.w, p.h, 0), roundedRect(lip, lip, p.w - 2 * lip, p.h - 2 * lip, 0)];
      for (const [x, y] of [[p.inset, p.inset], [p.w - p.inset, p.inset], [p.w - p.inset, p.h - p.inset], [p.inset, p.h - p.inset]]) {
        const h = holeIn(x, y, p.hole, 0, 0, p.w, p.h, 1);
        if (h) c.push(h);
      }
      return c;
    }),
  shape("floorflange", "Pipe floor flange", "◎", "pipeflanges", "floor flange iron pipe",
    "Floor / iron-pipe flange: a disc with a bore and four bolt holes.",
    [["od", "Outside Ø", 110], ["id", "Bore Ø", 28], ["pcd", "Bolt pitch circle Ø", 80], ["hole", "Bolt hole Ø", 8]],
    (p) => {
      const r = p.od / 2, id = Math.min(p.id, p.od - 16), pcd = clamp(p.pcd, id + p.hole + 4, p.od - p.hole - 4);
      const c = [circleContour(r, r, r), circleContour(r, r, id / 2)];
      c.push(...boltHoles(r, r, pcd, 4, p.hole, Math.PI / 4));
      return c;
    }),
  shape("tankflange", "Tank flange", "◎", "pipeflanges", "tank pad flange manway",
    "Tank pad flange: a wide ring with a dense bolt circle.",
    [["od", "Outside Ø", 240], ["id", "Opening Ø", 120], ["pcd", "Bolt pitch circle Ø", 190], ["hole", "Bolt hole Ø", 12], ["nbolts", "Number of bolts", 12]],
    (p) => {
      const n = Math.max(4, Math.min(32, Math.round(p.nbolts) || 12));
      const r = p.od / 2, id = Math.min(p.id, p.od - 24), pcd = clamp(p.pcd, id + p.hole + 6, p.od - p.hole - 6);
      const c = [circleContour(r, r, r), circleContour(r, r, id / 2)];
      c.push(...boltHoles(r, r, pcd, n, p.hole, Math.PI / 2 + Math.PI / n));
      return c;
    }),
  shape("sightflange", "Sight-glass flange", "◎", "pipeflanges", "sight glass flange window",
    "Sight-glass flange: a ring with a large window and six bolts.",
    [["od", "Outside Ø", 160], ["id", "Window Ø", 70], ["pcd", "Bolt pitch circle Ø", 120], ["hole", "Bolt hole Ø", 9]],
    (p) => {
      const r = p.od / 2, id = Math.min(p.id, p.od - 20), pcd = clamp(p.pcd, id + p.hole + 4, p.od - p.hole - 4);
      const c = [circleContour(r, r, r), circleContour(r, r, id / 2)];
      c.push(...boltHoles(r, r, pcd, 6, p.hole, Math.PI / 2 + Math.PI / 6));
      return c;
    }),
  shape("blankflangeod", "Blank flange (plain)", "●", "pipeflanges", "blank blind flange no holes",
    "Plain blank / cover disc (no bolt holes) — add holes after if you need them.",
    [["od", "Outside Ø", 140]],
    (p) => [circleContour(p.od / 2, p.od / 2, p.od / 2)]),
];

// Standard flange bolt patterns for the flange picker (C36).
// Dimensions are the published plate / ring values: outside Ø, bore (nominal / pipe),
// pitch circle, hole count and hole Ø, in millimetres.
// BS EN 1092-1 Type 01 (plate) PN series, and ASME B16.5 welding-neck / slip-on Class 150 / 300.

function row(od, id, pcd, n, hole) {
  return { od, id, pcd, n, hole };
}

// EN 1092-1 Type 01 PN6 / PN10 / PN16 / PN25 (common DN sizes).
const EN1092 = {
  PN6: {
    10: row(75, 17.2, 50, 4, 11),
    15: row(80, 21.3, 55, 4, 11),
    20: row(90, 26.9, 65, 4, 11),
    25: row(100, 33.7, 75, 4, 11),
    32: row(120, 42.4, 90, 4, 14),
    40: row(130, 48.3, 100, 4, 14),
    50: row(140, 60.3, 110, 4, 14),
    65: row(160, 76.1, 130, 4, 14),
    80: row(190, 88.9, 150, 4, 18),
    100: row(210, 114.3, 170, 4, 18),
    125: row(240, 139.7, 200, 8, 18),
    150: row(265, 168.3, 225, 8, 18),
    200: row(320, 219.1, 280, 8, 18),
    250: row(375, 273, 335, 12, 18),
    300: row(440, 323.9, 395, 12, 22),
  },
  PN10: {
    10: row(90, 17.2, 60, 4, 14),
    15: row(95, 21.3, 65, 4, 14),
    20: row(105, 26.9, 75, 4, 14),
    25: row(115, 33.7, 85, 4, 14),
    32: row(140, 42.4, 100, 4, 18),
    40: row(150, 48.3, 110, 4, 18),
    50: row(165, 60.3, 125, 4, 18),
    65: row(185, 76.1, 145, 4, 18),
    80: row(200, 88.9, 160, 8, 18),
    100: row(220, 114.3, 180, 8, 18),
    125: row(250, 139.7, 210, 8, 18),
    150: row(285, 168.3, 240, 8, 22),
    200: row(340, 219.1, 295, 8, 22),
    250: row(395, 273, 350, 12, 22),
    300: row(445, 323.9, 400, 12, 22),
  },
  PN16: {
    10: row(90, 17.2, 60, 4, 14),
    15: row(95, 21.3, 65, 4, 14),
    20: row(105, 26.9, 75, 4, 14),
    25: row(115, 33.7, 85, 4, 14),
    32: row(140, 42.4, 100, 4, 18),
    40: row(150, 48.3, 110, 4, 18),
    50: row(165, 60.3, 125, 4, 18),
    65: row(185, 76.1, 145, 8, 18),
    80: row(200, 88.9, 160, 8, 18),
    100: row(220, 114.3, 180, 8, 18),
    125: row(250, 139.7, 210, 8, 18),
    150: row(285, 168.3, 240, 8, 22),
    200: row(340, 219.1, 295, 12, 22),
    250: row(405, 273, 355, 12, 26),
    300: row(460, 323.9, 410, 12, 26),
  },
  PN25: {
    10: row(90, 17.2, 60, 4, 14),
    15: row(95, 21.3, 65, 4, 14),
    20: row(105, 26.9, 75, 4, 14),
    25: row(115, 33.7, 85, 4, 14),
    32: row(140, 42.4, 100, 4, 18),
    40: row(150, 48.3, 110, 4, 18),
    50: row(165, 60.3, 125, 4, 18),
    65: row(185, 76.1, 145, 8, 18),
    80: row(200, 88.9, 160, 8, 18),
    100: row(235, 114.3, 190, 8, 22),
    125: row(270, 139.7, 220, 8, 26),
    150: row(300, 168.3, 250, 8, 26),
    200: row(360, 219.1, 310, 12, 26),
    250: row(425, 273, 370, 12, 30),
    300: row(485, 323.9, 430, 16, 30),
  },
};

// ASME B16.5 Class 150 / 300, NPS → mm (converted from the inch table).
const r1 = (v) => Math.round(v * 10) / 10;
const inch = (od, id, pcd, n, hole) => row(r1(od * 25.4), r1(id * 25.4), r1(pcd * 25.4), n, r1(hole * 25.4));
const ASME = {
  150: {
    "1/2": inch(3.50, 0.84, 2.38, 4, 0.62),
    "3/4": inch(3.88, 1.05, 2.75, 4, 0.62),
    "1": inch(4.25, 1.32, 3.12, 4, 0.62),
    "1-1/4": inch(4.62, 1.66, 3.50, 4, 0.62),
    "1-1/2": inch(5.00, 1.90, 3.88, 4, 0.62),
    "2": inch(6.00, 2.38, 4.75, 4, 0.75),
    "2-1/2": inch(7.00, 2.88, 5.50, 4, 0.75),
    "3": inch(7.50, 3.50, 6.00, 4, 0.75),
    "4": inch(9.00, 4.50, 7.50, 8, 0.75),
    "5": inch(10.00, 5.56, 8.50, 8, 0.88),
    "6": inch(11.00, 6.62, 9.50, 8, 0.88),
    "8": inch(13.50, 8.62, 11.75, 8, 0.88),
    "10": inch(16.00, 10.75, 14.25, 12, 1.00),
    "12": inch(19.00, 12.75, 17.00, 12, 1.00),
  },
  300: {
    "1/2": inch(3.75, 0.84, 2.62, 4, 0.62),
    "3/4": inch(4.62, 1.05, 3.25, 4, 0.75),
    "1": inch(4.88, 1.32, 3.50, 4, 0.75),
    "1-1/4": inch(5.25, 1.66, 3.88, 4, 0.75),
    "1-1/2": inch(6.12, 1.90, 4.50, 4, 0.88),
    "2": inch(6.50, 2.38, 5.00, 8, 0.75),
    "2-1/2": inch(7.50, 2.88, 5.88, 8, 0.88),
    "3": inch(8.25, 3.50, 6.62, 8, 0.88),
    "4": inch(10.00, 4.50, 7.88, 8, 0.88),
    "5": inch(11.00, 5.56, 9.25, 8, 0.88),
    "6": inch(12.50, 6.62, 10.62, 12, 0.88),
    "8": inch(15.00, 8.62, 13.00, 12, 1.00),
    "10": inch(17.50, 10.75, 15.25, 16, 1.12),
    "12": inch(20.50, 12.75, 17.75, 16, 1.25),
  },
};

export const FLANGE_STANDARDS = [
  { id: "en1092", name: "BS EN 1092-1", seriesLabel: "PN", sizeLabel: "DN",
    series: Object.keys(EN1092), sizesOf: (s) => Object.keys(EN1092[s] || {}).map(Number),
    lookup: (s, sz) => EN1092[s] && EN1092[s][Number(sz)] },
  { id: "asme", name: "ASME B16.5", seriesLabel: "Class", sizeLabel: "NPS",
    series: Object.keys(ASME), sizesOf: (s) => Object.keys(ASME[s] || {}),
    lookup: (s, sz) => ASME[s] && ASME[s][String(sz)] },
];

export function flangeStandard(id) {
  return FLANGE_STANDARDS.find((s) => s.id === id) || null;
}

export function lookupFlange(stdId, series, size) {
  const std = flangeStandard(stdId);
  const dim = std && std.lookup(String(series), size);
  if (!dim) return null;
  return { std: stdId, series: String(series), size: String(size), ...dim };
}

// Fill a flange (or slip-on) item's size fields from a table row.
export function applyFlangeDims(p, dim, keys = {}) {
  if (!dim || !p) return p;
  const dKey = keys.d || ("d" in p || keys.preferD ? "d" : "od");
  const idKey = keys.id || "id";
  const pcdKey = keys.pcd || "pcd";
  const nKey = keys.n || ("nbolts" in p ? "nbolts" : "n");
  const holeKey = keys.hole || "hole";
  p[dKey] = dim.od;
  p[idKey] = dim.id;
  p[pcdKey] = dim.pcd;
  p[nKey] = dim.n;
  p[holeKey] = dim.hole;
  return p;
}

export function flangeShapeKeys(type) {
  if (type === "flange" || /^flange\d/.test(type) || type === "flangeblind") return { d: "d", id: "id", pcd: "pcd", n: "n", hole: "hole", preferD: true };
  if (type === "slipflange" || type === "wnring" || type === "redflange" || type === "compflange") {
    return { d: "od", id: "id", pcd: "pcd", n: "nbolts", hole: "hole" };
  }
  return null;
}

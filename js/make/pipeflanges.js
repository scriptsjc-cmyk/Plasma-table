// Bolt-on pipe-end flanges for pipework presets: flat rings / frames with bolt
// holes (cut parts) and matching 3D discs. Defaults are off so existing cut
// patterns stay the same until the user turns a flange on.
import { circleContour, roundedRect, boltHoles, packPieces, boxOfPts, moveC } from "./presets/helpers.js";
import { nearestPn16 } from "./flange-tables.js";

const ON = { type: "select", options: [{ v: 0, l: "Off" }, { v: 1, l: "On" }] };

export const PIPE_FLANGE_SHARED = [
  ["flod", "Flange OD (0 = auto)", 0],
  ["flpcd", "Bolt circle (0 = auto)", 0],
  ["fln", "Bolt holes (0 = auto)", 0],
  ["flhole", "Bolt hole Ø (0 = auto)", 0],
  ["flthk", "Flange thickness", 8],
];

export const flangeOn = (p, key) => Math.round(Number(p && p[key]) || 0) >= 1;

// Sensible PN16-ish defaults around a bore (duct / pipe centre-line Ø).
export function flangeDims(bore, p = {}) {
  const d = Math.max(8, Number(bore) || 0);
  const auto = nearestPattern(d);
  let od = Number(p.flod) > d + 4 ? Number(p.flod) : auto.od;
  let pcd = Number(p.flpcd) > 0 ? Number(p.flpcd) : auto.pcd;
  const n = Math.max(2, Math.round(Number(p.fln) > 0 ? p.fln : auto.n));
  let hole = Number(p.flhole) > 0 ? Number(p.flhole) : auto.hole;
  const thk = Number(p.flthk) > 0.05 ? Number(p.flthk) : auto.thk;
  hole = Math.min(hole, Math.max(4, (od - d) / 4));
  const minPcd = d + hole + 6, maxPcd = od - hole - 6;
  if (!(maxPcd > minPcd)) {
    od = d + 2 * (hole + 18);
    pcd = (d + od) / 2;
  } else {
    pcd = Math.min(maxPcd, Math.max(minPcd, pcd));
  }
  return { od, pcd, n, hole, thk, bore: d, lip: (od - d) / 2 };
}

function nearestPattern(bore) {
  const table = nearestPn16(bore);
  if (table) return table;
  const n = bore < 80 ? 4 : bore < 200 ? 8 : 12;
  const hole = bore < 80 ? 14 : bore < 150 ? 18 : 22;
  const lip = Math.max(24, Math.min(70, Math.round(bore * 0.18 + 16)));
  return { od: bore + 2 * lip, pcd: bore + lip, n, hole, thk: bore <= 100 ? 8 : bore <= 200 ? 10 : 12 };
}

export function roundFlangePiece(bore, p, bolts = true) {
  const d = flangeDims(bore, p);
  const R = d.od / 2;
  const c = [circleContour(R, R, R), circleContour(R, R, d.bore / 2)];
  if (bolts) c.push(...boltHoles(R, R, d.pcd, d.n, d.hole));
  return c;
}

export function rectFlangePiece(w, h, p, bolts = true) {
  const dim = flangeDims(Math.min(w, h), p);
  const lip = dim.lip;
  const W = w + 2 * lip, H = h + 2 * lip;
  const c = [roundedRect(0, 0, W, H, 0), { pts: [[lip, lip], [lip, lip + h], [lip + w, lip + h], [lip + w, lip]], closed: true }];
  if (bolts) {
    for (const [x, y] of rectBoltCentres(w, h, lip, dim.n)) {
      if (dim.hole > 0 && x - dim.hole / 2 > 1 && y - dim.hole / 2 > 1 && x + dim.hole / 2 < W - 1 && y + dim.hole / 2 < H - 1) {
        c.push(circleContour(x, y, dim.hole / 2));
      }
    }
  }
  return c;
}

function rectBoltCentres(w, h, lip, n) {
  const x0 = lip / 2, y0 = lip / 2, x1 = lip + w + lip / 2, y1 = lip + h + lip / 2;
  const pw = x1 - x0, ph = y1 - y0, peri = 2 * (pw + ph);
  const count = Math.max(4, Math.round(n) || 4);
  const pts = [];
  for (let i = 0; i < count; i++) {
    let s = (i / count) * peri;
    let x, y;
    if (s <= pw) { x = x0 + s; y = y0; }
    else if ((s -= pw) <= ph) { x = x1; y = y0 + s; }
    else if ((s -= ph) <= pw) { x = x1 - s; y = y1; }
    else { s -= pw; x = x0; y = y1 - s; }
    pts.push([x, y]);
  }
  return pts;
}

// Ends that can take a bolt-on flange. Labels are used as param names in the form.
export function pipeEnds(id, p) {
  const P = p || {};
  const round2 = (d1, d2, l1, l2) => [
    { key: "fl1", kind: "round", d: d1, label: l1 || "Flange on first end" },
    { key: "fl2", kind: "round", d: d2, label: l2 || "Flange on second end" },
  ];
  const rect2 = (a, b, a2, b2, l1, l2) => [
    { key: "fl1", kind: "rect", w: a, h: b, label: l1 || "Flange on first end" },
    { key: "fl2", kind: "rect", w: a2, h: b2, label: l2 || "Flange on second end" },
  ];
  switch (id) {
    case "tube": return round2(P.d, P.d, "Flange on first end", "Flange on second end");
    case "cone":
    case "conesteep":
    case "coneshallow":
    case "conecentric":
    case "coneecc":
    case "r2roffset":
    case "silocone":
    case "cyclonehop":
    case "coneadapter":
      return round2(P.d, P.d2 || P.d, "Flange on the big end", "Flange on the small end");
    case "s2r":
    case "s2roffset":
    case "r2s":
    case "fanduct":
      return [
        { key: "fl1", kind: "rect", w: P.a, h: P.b || P.a, label: "Flange on the rectangular end" },
        { key: "fl2", kind: "round", d: P.d, label: "Flange on the round end" },
      ];
    case "recttrans":
    case "recttransoff":
    case "hopperrect":
    case "hopflange":
    case "sqrpyramid":
      return rect2(P.a, P.b || P.a, P.a2 || Math.max(4, P.a2), P.b2 || P.a2 || Math.max(4, P.a2), "Flange on the bottom end", "Flange on the top end");
    case "elbow2":
    case "elbow3":
    case "elbow4":
    case "elbow5":
    case "elbow45":
      return round2(P.d, P.d, "Flange on first end", "Flange on second end");
    case "redelbow":
      return round2(P.d, P.d2 || P.d, "Flange on the big end", "Flange on the small end");
    case "rectelbow":
      return rect2(P.w, P.h, P.w, P.h, "Flange on first end", "Flange on second end");
    case "takeoff":
      return [{ key: "fl1", kind: "round", d: P.d, label: "Flange on the branch end" }];
    case "ductcap":
      return [{ key: "fl1", kind: "round", d: P.d, label: "End flange" }];
    case "rectcap":
      return [{ key: "fl1", kind: "rect", w: P.w, h: P.h, label: "End flange" }];
    case "britches":
      return [
        { key: "fl1", kind: "round", d: P.d, label: "Flange on first leg" },
        { key: "fl2", kind: "round", d: P.d2 || P.d, label: "Flange on the other legs" },
      ];
    case "ybranch":
    case "teetemp":
      return [
        { key: "fl1", kind: "round", d: P.d, label: "Flange on the branch" },
        { key: "fl2", kind: "round", d: P.d2 || P.d, label: "Flange on the main" },
      ];
    default:
      return null;
  }
}

export function flangeParamsFor(id) {
  const ends = pipeEnds(id, {});
  if (!ends) return [];
  return ends.map((e) => [e.key, e.label, 0, ON]).concat(PIPE_FLANGE_SHARED);
}

export function flangePieces(id, p) {
  const ends = pipeEnds(id, p);
  if (!ends) return [];
  const out = [];
  for (const e of ends) {
    if (!flangeOn(p, e.key)) continue;
    if (e.kind === "round" && e.d > 8) out.push(roundFlangePiece(e.d, p, true));
    else if (e.kind === "rect" && e.w > 8 && e.h > 8) out.push(rectFlangePiece(e.w, e.h, p, true));
  }
  return out;
}

export function appendFlangePieces(contours, id, p) {
  const extra = flangePieces(id, p);
  if (!extra.length) return contours || [];
  const cs = contours || [];
  if (!cs.length) return packPieces(extra).contours;
  const b = boxOfPts(cs.flatMap((c) => c.pts || []));
  const packed = packPieces(extra).contours;
  const dx = (Number.isFinite(b[2]) ? b[2] : 0) + 12;
  return cs.concat(packed.map((c) => moveC(c, dx, 0)));
}

export function attachPipeFlanges(sh) {
  if (!sh || !sh.id || sh._pipeFlanges) return sh;
  const params = flangeParamsFor(sh.id);
  if (!params.length) return sh;
  sh._pipeFlanges = true;
  const have = new Set((sh.params || []).map((q) => q[0]));
  sh.params = [...(sh.params || []), ...params.filter((q) => !have.has(q[0]))];
  const orig = sh.make;
  if (typeof orig === "function") {
    sh.make = (p) => appendFlangePieces(orig(p), sh.id, p);
  }
  return sh;
}

export const PIPE_FLANGE_IDS = new Set([
  "tube", "cone", "conesteep", "coneshallow", "conecentric", "coneecc", "r2roffset",
  "silocone", "cyclonehop", "coneadapter",
  "s2r", "s2roffset", "r2s", "fanduct",
  "recttrans", "recttransoff", "hopperrect", "hopflange", "sqrpyramid",
  "elbow2", "elbow3", "elbow4", "elbow5", "elbow45", "redelbow", "rectelbow",
  "takeoff", "ductcap", "rectcap", "britches", "ybranch", "teetemp",
]);

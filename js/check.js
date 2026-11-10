// Cut check: can this design actually be cut well on this machine, at this thickness?
// Looks for holes that are too small, strips of metal too thin between cuts, parts too close together,
// parts too small for the slats, and parts too big for the table. Each problem has a spot so it can be
// marked on the drawing.
import { signedArea, pointInPoly, bbox, cleanPts } from "./geom.js";

// what the machine + plasma can do at this thickness (shown to the operator, and used by the check)
export function machineLimits({ thickness = 3, kerf = 1.5, leadIn = 3, table = [1300, 800], accuracy = 0.5, slatPitch = 100 } = {}) {
  const t = Number(thickness) || 3, k = Number(kerf) || 1.5;
  const up = (v, s = 0.5) => Math.ceil(v / s) * s;
  return {
    thickness: t, kerf: k, leadIn, table, accuracy, slatPitch,
    minHole: up(Math.max(1.5 * t, 3 * k, 4)),          // smaller and the pierce blob / bevel eats it
    minStrip: up(Math.max(t, 2 * k, 3)),               // thinner and it warps or burns away
    minPartGap: up(leadIn + k + 1),                    // room for the lead-in and both cuts
    insideCorner: Math.round((k / 2) * 10) / 10,       // inside corners come out with this radius
    smallPart: Math.max(15, 3 * t),
  };
}

function closedOutlines(contours) {
  const out = [];
  for (const c of contours) {
    const pts = cleanPts(c.pts, c.closed !== false);
    if (c.closed === false || pts.length < 3) continue;
    const area = Math.abs(signedArea(pts));
    if (area < 0.01) continue;
    out.push({ pts, area, circle: c.circle, box: bbox([{ pts }]) });
  }
  for (const c of out) {
    c.depth = 0;
    for (const o of out) if (o !== c && o.area > c.area && pointInPoly(c.pts[0], o.pts) && pointInPoly(c.pts[Math.floor(c.pts.length / 2)], o.pts)) c.depth++;
    c.hole = c.depth % 2 === 1;
  }
  return out;
}

// points along the outline no more than `step` mm apart
function densify(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * dx, qy = a[1] + t * dy;
  return [Math.hypot(p[0] - qx, p[1] - qy), [qx, qy]];
}
// closest approach between two outlines: [distance, midpoint]
function gapBetween(A, B, step) {
  let best = [Infinity, null];
  const pa = densify(A.pts, step);
  for (const p of pa) for (let j = 0; j < B.pts.length; j++) {
    const [d, q] = segDist(p, B.pts[j], B.pts[(j + 1) % B.pts.length]);
    if (d < best[0]) best = [d, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]];
  }
  return best;
}
function segCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
// first point where two outlines cross, or null
function crossing(A, B) {
  for (let i = 0; i < A.pts.length; i++) {
    const a = A.pts[i], b = A.pts[(i + 1) % A.pts.length];
    if (Math.max(a[0], b[0]) < B.box[0] || Math.min(a[0], b[0]) > B.box[2] || Math.max(a[1], b[1]) < B.box[1] || Math.min(a[1], b[1]) > B.box[3]) continue;
    for (let j = 0; j < B.pts.length; j++) if (segCross(a, b, B.pts[j], B.pts[(j + 1) % B.pts.length])) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  return null;
}
const boxGap = (a, b) => Math.max(0, a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
const r1 = (v) => Math.round(v * 10) / 10;

export function checkDesign(contours, opts = {}) {
  const L = machineLimits(opts);
  const list = closedOutlines(contours);
  const issues = [];
  const add = (level, text, at) => issues.push({ level, text, at });

  // the whole job vs the table
  if (list.length) {
    const b = bbox(list.map((c) => ({ pts: c.pts })));
    const w = b[2] - b[0], h = b[3] - b[1];
    if (w > L.table[0] || h > L.table[1])
      add("error", `The job is ${Math.round(w)} × ${Math.round(h)} mm – bigger than the cutting area (${L.table[0]} × ${L.table[1]} mm).`, [b[2], b[3]]);
  }

  // outlines that cross each other (a hole over a part's edge, overlapping parts)
  const crossed = new Set();
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j];
    if (boxGap(A.box, B.box) > 0) continue;
    const at = crossing(A, B);
    if (!at) continue;
    crossed.add(A); crossed.add(B);
    const small = A.area < B.area ? A : B;
    add("error", small.circle || small.area < B.area * 0.25 || small.area < A.area * 0.25
      ? "A hole or shape runs over the edge of a part – move it fully inside (to cut a hole) or fully outside."
      : "Two shapes overlap – they'd be cut through each other. Move them apart, or join them into one part.", at);
  }

  const flagged = new Set();
  for (const c of list) {
    if (crossed.has(c)) continue;
    const w = c.box[2] - c.box[0], h = c.box[3] - c.box[1];
    const mid = [(c.box[0] + c.box[2]) / 2, (c.box[1] + c.box[3]) / 2];
    if (c.hole) {
      const size = c.circle ? 2 * c.circle.r : Math.min(w, h);
      const what = c.circle ? `${r1(size)} mm hole` : `${r1(size)} mm wide cut-out`;
      if (size < L.minHole) flagged.add(c);
      if (size <= L.kerf * 1.5) add("error", `The ${what} is about the width of the cut itself – it can't be cut. Make it at least ${L.minHole} mm, or drill it.`, mid);
      else if (size < L.minHole) add("warn", `The ${what} is small for ${L.thickness} mm sheet – it'll come out rough and tapered. ${L.minHole} mm or more cuts cleanly; smaller is better drilled.`, mid);
    } else {
      if (Math.max(w, h) < L.smallPart) add("warn", `A ${r1(w)} × ${r1(h)} mm part is very small – it may be spoiled by the pierce and can drop into the slats.`, mid);
      else if (w < L.slatPitch * 0.9 && h < L.slatPitch * 0.9 && list.length > 1)
        add("info", `A ${r1(w)} × ${r1(h)} mm part is smaller than the slat spacing (${L.slatPitch} mm) – it can tip as it's cut free. Put a slat or scrap under it.`, mid);
    }
  }

  // thin strips of metal between cuts, and parts too close together
  const step = Math.max(0.5, Math.min(2, L.minStrip / 3));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j];
    if (crossed.has(A) && crossed.has(B)) continue;
    const limit = Math.max(L.minStrip, L.minPartGap) * 1.5;
    if (boxGap(A.box, B.box) > limit) continue;
    const [g, at] = A.pts.length <= B.pts.length ? gapBetween(A, B, step) : gapBetween(B, A, step);
    if (!at) continue;
    const bothParts = !A.hole && !B.hole && A.depth === B.depth;
    if (g < 0.05) { add("error", "Two outlines touch or cross – they'd be cut through each other.", at); continue; }
    if (bothParts) {
      if (g < L.minPartGap) add("warn", `Two parts are only ${r1(g)} mm apart – leave at least ${L.minPartGap} mm so the lead-ins and cuts don't run into each other.`, at);
    } else if (g < L.kerf) add("error", `Only ${r1(g)} mm of metal left between two cuts – it will burn away. Leave at least ${L.minStrip} mm.`, at);
    else if (g < L.minStrip) add("warn", `A ${r1(g)} mm strip between cuts is thin for ${L.thickness} mm sheet – it may warp or melt. ${L.minStrip} mm or more is safer.`, at);
  }

  // narrow slots and thin fingers inside one outline (two sides of the same outline close together)
  for (const c of list) {
    const pts = densify(c.pts, step), n = pts.length;
    let per = 0; const cum = [0];
    for (let i = 1; i < n; i++) { per += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(per); }
    per += Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
    let worst = [Infinity, null];
    const limit = c.hole ? L.minHole : L.minStrip;
    if (c.circle || flagged.has(c)) continue;
    for (let i = 0; i < n; i += 2) for (let j = i + 2; j < n; j += 1) {
      const along = Math.min(cum[j] - cum[i], per - (cum[j] - cum[i]));
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < limit && along > d * 2.2 + limit && d < worst[0]) worst = [d, [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2]];
    }
    if (worst[1]) {
      if (c.hole) add(worst[0] <= L.kerf * 1.5 ? "error" : "warn", `A slot only ${r1(worst[0])} mm wide – ${worst[0] <= L.kerf * 1.5 ? "narrower than the cut, it can't be cut" : `tight for ${L.thickness} mm; ${L.minHole} mm or more cuts cleanly`}.`, worst[1]);
      else add(worst[0] < L.kerf ? "error" : "warn", `A finger of metal only ${r1(worst[0])} mm wide – ${worst[0] < L.kerf ? "it will burn away" : `it may warp or melt; ${L.minStrip} mm or more is safer`}.`, worst[1]);
    }
  }

  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  // same message several times (e.g. four small holes) = one numbered item, a marker at each spot
  const groups = [];
  for (const m of issues) {
    let g = groups.find((x) => x.text === m.text && x.level === m.level);
    if (!g) { g = { level: m.level, text: m.text, spots: [] }; groups.push(g); }
    g.spots.push(m.at);
  }
  groups.forEach((g, i) => { g.n = i + 1; });
  const marks = groups.flatMap((g) => g.spots.map((at) => ({ level: g.level, at, n: g.n })));
  return { issues: marks, groups, limits: L };
}

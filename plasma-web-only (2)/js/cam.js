// CAM: turn a 2D design (closed outlines) into plasma G-code.
//  * finds which outlines are holes (inside another) and which are part edges
//  * kerf allowance: part edges are cut half a kerf OUTSIDE the line, holes half a kerf INSIDE,
//    so finished parts come out the size you drew
//  * lead-in: every pierce starts a few mm away, on the scrap side, then runs onto the line
//  * cut order: innermost first (holes before the outside edge), nearest-next to save travel
//  * direction: part edges clockwise, holes anticlockwise (the clean side of a plasma cut is on the right)
// The G-code (M3 at each pierce, M5 after each cut) goes through the normal job builder,
// which adds the touch-off, pierce delay, heights and speed.

import { signedArea, pointInPoly, offsetPolygon, selfIntersects, bbox, cleanPts } from "./geom.js";
import { fmt } from "./job.js";

export function designToGcode(contours, { kerf = 1.5, leadIn = 3, name = "design" } = {}) {
  const warnings = [];
  const half = Math.max(0, kerf) / 2;

  // tidy + keep closed outlines; open ones are cut as drawn
  const closed = [], open = [];
  for (const c of contours) {
    const pts = cleanPts(c.pts, c.closed);
    if (c.closed && pts.length >= 3 && Math.abs(signedArea(pts)) > 0.01) closed.push({ ...c, pts });
    else if (!c.closed && pts.length >= 2) open.push({ ...c, pts });
  }
  if (!closed.length && !open.length) throw new Error("No shapes found to cut. Check the drawing has closed outlines.");
  if (open.length) warnings.push(`${open.length} line(s) aren't closed shapes – they'll be cut exactly on the line (no kerf allowance). Close them in your CAD if they're part edges.`);

  // depth = how many other outlines this one sits inside. Even = part edge, odd = hole.
  for (const c of closed) {
    c.area = Math.abs(signedArea(c.pts));
    c.depth = 0;
    for (const o of closed) {
      if (o === c || o.area <= c.area) continue;
      if (pointInPoly(c.pts[0], o.pts) && pointInPoly(c.pts[Math.floor(c.pts.length / 2)], o.pts)) c.depth++;
    }
    c.hole = c.depth % 2 === 1;
  }

  // build each cut path (kerf offset + direction + start point + lead-in)
  const cuts = [];
  let tooSmall = 0, pinched = 0;
  for (const c of closed) {
    let pts = signedArea(c.pts) < 0 ? [...c.pts].reverse() : c.pts.map((p) => [...p]); // make CCW
    const d = c.hole ? -half : half;
    let circle = null;
    if (c.circle) {
      const r = c.circle.r + d;
      if (r <= 0.05) { tooSmall++; continue; }
      circle = { cx: c.circle.cx, cy: c.circle.cy, r };
    } else {
      pts = offsetPolygon(pts, d);
      if (pts.length < 3 || (c.hole && signedArea(pts) <= 0.01)) { tooSmall++; continue; }
      if (selfIntersects(pts)) pinched++;
    }
    cuts.push({ ...makeCut(c, pts, circle, leadIn, warnings), src: c });
  }
  if (tooSmall) warnings.push(`${tooSmall} hole(s) are smaller than the cut width and were left out.`);
  if (pinched) warnings.push(`${pinched} shape(s) have details narrower than the cut width – those bits won't cut cleanly.`);
  // a lead-in that lands on another part would pierce that part
  const partEdges = closed.filter((c) => !c.hole);
  const clash = cuts.some((cut) => partEdges.some((pe) => pe !== cut.src && pointInPoly(cut.lead, pe.pts) &&
    !closed.some((h) => h.hole && h.depth === pe.depth + 1 && pointInPoly(cut.lead, h.pts))));
  if (clash) warnings.push("Some parts are closer together than the lead-in – a pierce may mark a neighbouring part. Space them further apart or shorten the lead-in.");
  for (const o of open) cuts.push({ depth: 99, start: o.pts[0], lead: o.pts[0], path: o.pts.slice(1).map((p) => ["G1", p]), outline: o.pts, open: true });

  // order: deepest first, then nearest-next
  const order = [];
  let pos = [0, 0];
  const byDepth = [...new Set(cuts.map((c) => c.depth))].sort((a, b) => b - a);
  for (const depth of byDepth) {
    const left = cuts.filter((c) => c.depth === depth);
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((c, i) => { const dd = Math.hypot(c.lead[0] - pos[0], c.lead[1] - pos[1]); if (dd < bd) { bd = dd; bi = i; } });
      const c = left.splice(bi, 1)[0];
      order.push(c);
      pos = c.start;
    }
  }

  // move everything (including lead-ins) so the lowest-left point is at 0,0:
  // the torch spot you pick with "Start here" is the bottom-left corner of the job
  const all = [];
  for (const c of order) { all.push({ pts: [c.lead, c.start] }); all.push({ pts: c.pathPts || c.outline }); }
  const [bx, by] = bbox(all);
  const dx = -bx, dy = -by;
  const T = ([x, y]) => [x + dx, y + dy];

  const lines = [`(${name.replace(/[()]/g, "")} - made by plasma-operator, kerf ${fmt(kerf)} mm, lead-in ${fmt(leadIn)} mm)`, "G21 G90"];
  for (const c of order) {
    const L = T(c.lead), S = T(c.start);
    lines.push(`G0 X${fmt(L[0])} Y${fmt(L[1])}`, "M3");
    if (Math.hypot(L[0] - S[0], L[1] - S[1]) > 1e-6) lines.push(`G1 X${fmt(S[0])} Y${fmt(S[1])}`);
    for (const [g, p, ij] of c.path) {
      const q = T(p);
      lines.push(ij ? `${g} X${fmt(q[0])} Y${fmt(q[1])} I${fmt(ij[0])} J${fmt(ij[1])}` : `G1 X${fmt(q[0])} Y${fmt(q[1])}`);
    }
    lines.push("M5");
  }
  lines.push("M30");

  const outline = closed.map((c) => c.pts.map(T)).concat(open.map((o) => o.pts.map(T)));
  const parts = closed.filter((c) => !c.hole).length;
  const holes = closed.filter((c) => c.hole).length;
  // finished-part size (circles measured exactly, not from their segments)
  const db = bbox(closed.map((c) => (c.circle
    ? { pts: [[c.circle.cx - c.circle.r, c.circle.cy - c.circle.r], [c.circle.cx + c.circle.r, c.circle.cy + c.circle.r]] }
    : { pts: c.pts })));
  return {
    gcode: lines.join("\n") + "\n",
    warnings,
    outline: outline.map((p) => p.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])),
    summary: { parts, holes, width: Math.round((db[2] - db[0]) * 10) / 10, height: Math.round((db[3] - db[1]) * 10) / 10, cuts: order.length },
  };
}

function makeCut(c, pts, circle, leadIn, warnings) {
  if (circle) {
    const { cx, cy, r } = circle;
    // start on the right-hand side of the circle
    const start = [cx + r, cy];
    let lead;
    if (c.hole) {
      const L = Math.min(leadIn, r * 0.8);
      lead = r < leadIn * 1.25 ? [cx, cy] : [cx + r - L, cy];   // small holes: pierce in the middle
    } else lead = [cx + r + leadIn, cy];
    // part edge clockwise (G2), hole anticlockwise (G3); I,J from the start point to the centre
    return { depth: c.depth, start, lead, path: [[c.hole ? "G3" : "G2", start, [cx - start[0], cy - start[1]]]],
      pathPts: circlePts(cx, cy, r) };
  }
  // polygon: start in the middle of the longest straight edge
  let bi = 0, bl = -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bl) { bl = l; bi = i; }
  }
  const a = pts[bi], b = pts[(bi + 1) % pts.length];
  const start = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ex = (b[0] - a[0]) / bl, ey = (b[1] - a[1]) / bl;
  const outward = [ey, -ex];                 // CCW polygon: outward normal is to the right
  const dir = c.hole ? [-outward[0], -outward[1]] : outward;   // towards the scrap
  let lead = start;
  for (let L = leadIn; L > 0.3; L /= 2) {
    const cand = [start[0] + dir[0] * L, start[1] + dir[1] * L];
    const inside = pointInPoly(cand, pts);
    if (c.hole ? inside : !inside) { lead = cand; break; }
  }
  if (lead === start && leadIn > 0) warnings.push("A shape was too small for a lead-in – it will pierce on the line.");
  // walk the outline from the start point: CCW order for holes, reversed (clockwise) for part edges
  const ring = [];
  for (let k = 1; k <= pts.length; k++) ring.push(pts[(bi + k) % pts.length]);  // b ... a
  let seq;
  if (c.hole) seq = [...ring];                         // start -> b -> ... -> a -> start (CCW)
  else seq = [a, ...[...ring].reverse().slice(1)];     // start -> a -> ... -> b -> start (CW)
  seq.push(start);
  return { depth: c.depth, start, lead, path: seq.map((p) => ["G1", p]), pathPts: [start, ...seq] };
}

function circlePts(cx, cy, r) {
  const out = [];
  for (let k = 0; k < 48; k++) out.push([cx + r * Math.cos((k / 48) * 2 * Math.PI), cy + r * Math.sin((k / 48) * 2 * Math.PI)]);
  return out;
}

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

  const inMaterial = (p) => {
    let n = 0;
    for (const o of closed) if (pointInPoly(p, o.pts)) n++;
    return n % 2 === 1;
  };

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
    cuts.push({ ...makeCut(c, pts, circle, leadIn, warnings, inMaterial), src: c });
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
    shift: [dx, dy],
    summary: { parts, holes, width: Math.round((db[2] - db[0]) * 10) / 10, height: Math.round((db[3] - db[1]) * 10) / 10, cuts: order.length },
  };
}

function makeCut(c, pts, circle, leadIn, warnings, inMaterial) {
  const scrap = (p) => (inMaterial ? !inMaterial(p) : (c.hole ? pointInPoly(p, pts) : !pointInPoly(p, pts)));
  if (circle) {
    const { cx, cy, r } = circle;
    let best = null;
    const angles = [];
    for (let k = 0; k < 24; k++) angles.push((k / 24) * 2 * Math.PI);
    for (const ang of angles) {
      const start = [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      const inward = [-Math.cos(ang), -Math.sin(ang)], outward = [Math.cos(ang), Math.sin(ang)];
      const dir = c.hole ? inward : outward;
      if (c.hole && r < leadIn * 1.25 && scrap([cx, cy])) {
        best = { start, lead: [cx, cy] };
        break;
      }
      for (let L = leadIn; L > 0.3; L /= 2) {
        const cand = [start[0] + dir[0] * L, start[1] + dir[1] * L];
        const inside = Math.hypot(cand[0] - cx, cand[1] - cy) < r;
        if ((c.hole ? inside : !inside) && scrap(cand)) { best = { start, lead: cand }; break; }
      }
      if (best) break;
    }
    if (!best) {
      const start = [cx + r, cy];
      best = { start, lead: c.hole ? (r < leadIn * 1.25 ? [cx, cy] : [cx + r - Math.min(leadIn, r * 0.8), cy]) : [cx + r + leadIn, cy] };
    }
    const { start, lead } = best;
    return { depth: c.depth, start, lead, path: [[c.hole ? "G3" : "G2", start, [cx - start[0], cy - start[1]]]],
      pathPts: circlePts(cx, cy, r) };
  }
  // polygon: try every edge, longest first, and pick a lead that lands in scrap
  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > 0.4) edges.push({ i, a, b, l });
  }
  edges.sort((x, y) => y.l - x.l);
  let chosen = null;
  for (const e of edges) {
    const { a, b, l, i: bi } = e;
    const fracs = [0.5, 0.35, 0.65, 0.2, 0.8];
    for (const f of fracs) {
      const start = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const ex = (b[0] - a[0]) / l, ey = (b[1] - a[1]) / l;
      const outward = [ey, -ex];
      const dir = c.hole ? [-outward[0], -outward[1]] : outward;
      for (let L = leadIn; L > 0.3; L /= 2) {
        const cand = [start[0] + dir[0] * L, start[1] + dir[1] * L];
        const inside = pointInPoly(cand, pts);
        if ((c.hole ? inside : !inside) && scrap(cand)) { chosen = { start, lead: cand, bi, a, b }; break; }
      }
      if (chosen) break;
    }
    if (chosen) break;
  }
  if (!chosen) {
    const e = edges[0] || { a: pts[0], b: pts[1] || pts[0], l: 1, i: 0 };
    const start = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    chosen = { start, lead: start, bi: e.i || 0, a: e.a, b: e.b };
    if (leadIn > 0) warnings.push("A shape was too small for a lead-in – it will pierce on the line.");
  }
  const { start, lead, bi, a } = chosen;
  const ring = [];
  for (let k = 1; k <= pts.length; k++) ring.push(pts[(bi + k) % pts.length]);
  let seq;
  if (c.hole) seq = [...ring];
  else seq = [a, ...[...ring].reverse().slice(1)];
  seq.push(start);
  return { depth: c.depth, start, lead, path: seq.map((p) => ["G1", p]), pathPts: [start, ...seq] };
}

function circlePts(cx, cy, r) {
  const out = [];
  for (let k = 0; k < 48; k++) out.push([cx + r * Math.cos((k / 48) * 2 * Math.PI), cy + r * Math.sin((k / 48) * 2 * Math.PI)]);
  return out;
}

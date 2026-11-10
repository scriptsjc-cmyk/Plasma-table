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

// Optional Pro extras (all off by default, so a Beginner job comes out exactly as before):
//   order      array of cut keys: cut in this order (any cut not listed follows in the automatic order)
//   skip       array of cut keys that are NOT cut
//   starts     { key: [x, y] } move a closed outline's pierce/start point to the nearest spot on its line (design coordinates)
//   tabs       { count, width }  hold-down tabs on part edges (not holes): the arc stops for `width` mm, the sheet keeps the part
//   tabOver    { key: { count, width, pts:[[x,y]...] } } per-outline tab settings / hand-placed tab centres
//   leadOut    mm of run-out into scrap after the cut closes     overcut  mm of extra cut past the start along the line
// A cut's key is its position in the `contours` list you pass in, so it stays the same while the order changes.
export function designToGcode(contoursIn, { kerf = 1.5, leadIn = 3, name = "design", order: wantOrder = null, skip = [], starts = {}, tabs = null, tabOver = {}, leadOut = 0, overcut = 0, keepOrigin = false } = {}) {
  const warnings = [];
  const half = Math.max(0, kerf) / 2;
  const contours = contoursIn.map((c, i) => ({ ...c, _k: i }));
  const skipSet = new Set(skip || []);
  leadOut = Math.max(0, Number(leadOut) || 0); overcut = Math.max(0, Number(overcut) || 0);

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
    cuts.push({ ...makeCut(c, pts, circle, leadIn, warnings, inMaterial, starts[c._k]), src: c, key: c._k, hole: c.hole });
  }
  if (tooSmall) warnings.push(`${tooSmall} hole(s) are smaller than the cut width and were left out.`);
  if (pinched) warnings.push(`${pinched} shape(s) have details narrower than the cut width – those bits won't cut cleanly.`);
  // a lead-in that lands on another part would pierce that part
  const partEdges = closed.filter((c) => !c.hole);
  const clash = cuts.some((cut) => partEdges.some((pe) => pe !== cut.src && pointInPoly(cut.lead, pe.pts) &&
    !closed.some((h) => h.hole && h.depth === pe.depth + 1 && pointInPoly(cut.lead, h.pts))));
  if (clash) warnings.push("Some parts are closer together than the lead-in – a pierce may mark a neighbouring part. Space them further apart or shorten the lead-in.");
  for (const o of open) cuts.push({ depth: 99, start: o.pts[0], lead: o.pts[0], path: o.pts.slice(1).map((p) => ["G1", p]), outline: o.pts, open: true, key: o._k });

  // order: deepest first, then nearest-next
  const order = [];
  let pos = [0, 0];
  const byDepth = [...new Set(cuts.map((c) => c.depth))].sort((a, b) => b - a);
  for (const depth of byDepth) {
    const left = cuts.filter((c) => c.depth === depth && !skipSet.has(c.key));
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((c, i) => { const dd = Math.hypot(c.lead[0] - pos[0], c.lead[1] - pos[1]); if (dd < bd) { bd = dd; bi = i; } });
      const c = left.splice(bi, 1)[0];
      order.push(c);
      pos = c.start;
    }
  }
  const autoOrder = order.map((c) => c.key);
  if (Array.isArray(wantOrder) && wantOrder.length) {
    const rank = new Map(wantOrder.map((k, i) => [k, i]));
    const listed = order.filter((c) => rank.has(c.key)).sort((a, b) => rank.get(a.key) - rank.get(b.key));
    const rest = order.filter((c) => !rank.has(c.key));
    order.length = 0; order.push(...listed, ...rest);
    // a part cut free before its own holes drops out of the sheet and the holes then cut on a loose part
    const drops = order.filter((c, i) => c.src && !c.hole && order.slice(i + 1).some((h) => h.hole && h.src && pointInPoly(h.src.pts[0], c.src.pts)));
    if (drops.length) warnings.push(`${drops.length} part edge(s) are cut before the holes inside them – the part can drop or tip before its holes are cut.`);
  }
  if (skipSet.size) warnings.push(`${skipSet.size} cut(s) are skipped (Pro cut list).`);

  // move everything (including lead-ins) so the lowest-left point is at 0,0:
  // the torch spot you pick with "Start here" is the bottom-left corner of the job
  // (skipped cuts still count, so skipping one never moves the job's zero point)
  const all = [];
  for (const c of cuts) { all.push({ pts: [c.lead, c.start] }); all.push({ pts: c.pathPts || c.outline }); }
  // tabs, overcut, lead-out: split / extend each cut into "runs" (one torch-on to torch-off each). Plain cuts are one run.
  const info = [];
  let tabCount = 0, tabWarn = false;
  for (const c of order) {
    const r = buildRuns(c, { tabs, tabOver: tabOver[c.key], leadOut, overcut, leadIn, warnings });
    c.runs = r.runs; c.tabPts = r.tabPts; c.leadOutPt = r.leadOutPt;
    tabCount += r.tabPts.length; if (r.tabPts.length) tabWarn = true;
    for (const run of c.runs) { all.push({ pts: [run.lead, run.start] }); }
    if (r.leadOutPt) all.push({ pts: [r.leadOutPt] });
    info.push({ key: c.key, hole: !!c.hole, open: !!c.open, depth: c.depth, start: c.start, lead: c.lead, tabs: c.tabPts, leadOut: c.leadOutPt, ring: c.pathPts || c.outline || [], runs: c.runs.length });
  }
  if (tabWarn) warnings.push("Hold-down tabs: after each tab the arc re-fires on the cut line, so each tab adds a pierce. Trim the tabs off the finished part.");
  const [bx, by] = bbox(all);
  // keepOrigin: the drawing's own 0,0 is the work zero (the sheet layout: the sheet's bottom-left corner), so coordinates are not moved
  const dx = keepOrigin ? 0 : -bx, dy = keepOrigin ? 0 : -by;
  const T = ([x, y]) => [x + dx, y + dy];

  const lines = [`(${name.replace(/[()]/g, "")} - made by plasma-operator, kerf ${fmt(kerf)} mm, lead-in ${fmt(leadIn)} mm)`, "G21 G90"];
  for (const c of order) {
    for (const run of c.runs) {
      const L = T(run.lead), S = T(run.start);
      lines.push(`G0 X${fmt(L[0])} Y${fmt(L[1])}`, "M3");
      if (Math.hypot(L[0] - S[0], L[1] - S[1]) > 1e-6) lines.push(`G1 X${fmt(S[0])} Y${fmt(S[1])}`);
      for (const [g, p, ij] of run.path) {
        const q = T(p);
        lines.push(ij ? `${g} X${fmt(q[0])} Y${fmt(q[1])} I${fmt(ij[0])} J${fmt(ij[1])}` : `G1 X${fmt(q[0])} Y${fmt(q[1])}`);
      }
      lines.push("M5");
    }
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
    summary: { parts, holes, width: Math.round((db[2] - db[0]) * 10) / 10, height: Math.round((db[3] - db[1]) * 10) / 10, cuts: order.length, tabs: tabCount },
    allCuts: cuts.map((c) => {   // every cut (also skipped ones) with a label, for the Pro cut list
      const b = bbox([{ pts: c.src && c.src.pts ? c.src.pts : (c.outline || [c.start]) }]);
      return { key: c.key, hole: !!c.hole, open: !!c.open, size: [Math.round((b[2] - b[0]) * 10) / 10, Math.round((b[3] - b[1]) * 10) / 10], skipped: skipSet.has(c.key) };
    }),
    cutInfo: info,            // per cut, in cutting order (design coordinates; add `shift` to get job coordinates)
    autoOrder,                // the automatic order (cut keys), for "back to automatic"
  };
}

function makeCut(c, pts, circle, leadIn, warnings, inMaterial, startAt) {
  const scrap = (p) => (inMaterial ? !inMaterial(p) : (c.hole ? pointInPoly(p, pts) : !pointInPoly(p, pts)));
  if (circle) {
    const { cx, cy, r } = circle;
    let best = null;
    const angles = [];
    if (startAt) angles.push(Math.atan2(startAt[1] - cy, startAt[0] - cx));
    else for (let k = 0; k < 24; k++) angles.push((k / 24) * 2 * Math.PI);
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
    if (!best && startAt) {
      const ang = angles[0], start = [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      best = { start, lead: start };
      warnings.push("A hand-placed start point has no room for a lead-in – it will pierce on the line.");
    }
    if (!best) {
      const start = [cx + r, cy];
      best = { start, lead: c.hole ? (r < leadIn * 1.25 ? [cx, cy] : [cx + r - Math.min(leadIn, r * 0.8), cy]) : [cx + r + leadIn, cy] };
    }
    const { start, lead } = best;
    return { depth: c.depth, start, lead, path: [[c.hole ? "G3" : "G2", start, [cx - start[0], cy - start[1]]]],
      pathPts: circlePts(cx, cy, r), scrap };
  }
  // polygon: try every edge, longest first, and pick a lead that lands in scrap
  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > 0.4) edges.push({ i, a, b, l });
  }
  edges.sort((x, y) => y.l - x.l);
  let chosen = null, pinFrac = null;
  if (startAt) {          // a hand-placed start: the nearest spot on this outline's own line
    let bestE = null, bestD = Infinity;
    for (const e of edges) {
      const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1];
      const f = Math.min(0.98, Math.max(0.02, ((startAt[0] - e.a[0]) * dx + (startAt[1] - e.a[1]) * dy) / (e.l * e.l)));
      const dd = Math.hypot(e.a[0] + dx * f - startAt[0], e.a[1] + dy * f - startAt[1]);
      if (dd < bestD) { bestD = dd; bestE = e; pinFrac = f; }
    }
    if (bestE) edges.splice(0, edges.length, bestE);
  }
  for (const e of edges) {
    const { a, b, l, i: bi } = e;
    const fracs = pinFrac !== null ? [pinFrac] : [0.5, 0.35, 0.65, 0.2, 0.8];
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
    const fr = pinFrac !== null ? pinFrac : 0.5;
    const start = [e.a[0] + (e.b[0] - e.a[0]) * fr, e.a[1] + (e.b[1] - e.a[1]) * fr];
    chosen = { start, lead: start, bi: e.i || 0, a: e.a, b: e.b };
    if (leadIn > 0) warnings.push(pinFrac !== null ? "A hand-placed start point has no room for a lead-in – it will pierce on the line." : "A shape was too small for a lead-in – it will pierce on the line.");
  }
  const { start, lead, bi, a } = chosen;
  const ring = [];
  for (let k = 1; k <= pts.length; k++) ring.push(pts[(bi + k) % pts.length]);
  let seq;
  if (c.hole) seq = [...ring];
  else seq = [a, ...[...ring].reverse().slice(1)];
  seq.push(start);
  return { depth: c.depth, start, lead, path: seq.map((p) => ["G1", p]), pathPts: [start, ...seq], scrap };
}

function circlePts(cx, cy, r) {
  const out = [];
  for (let k = 0; k < 48; k++) out.push([cx + r * Math.cos((k / 48) * 2 * Math.PI), cy + r * Math.sin((k / 48) * 2 * Math.PI)]);
  return out;
}


// ---------------------------------------------------------------- tabs, overcut, lead-out
// A cut's path is a list of lines and arcs starting at `start`. Measure along it (s = mm travelled), so a tab can be
// "from 40 mm to 43 mm", then turn pieces of it back into G1 / G2 / G3 moves.
function segsOf(start, path) {
  const segs = []; let cur = start, s0 = 0;
  for (const [g, p, ij] of path) {
    if (g === "G1" || !ij) {
      const len = Math.hypot(p[0] - cur[0], p[1] - cur[1]);
      if (len > 1e-9) { segs.push({ t: "L", a: cur, b: p, len, s0 }); s0 += len; }
    } else {
      const cx = cur[0] + ij[0], cy = cur[1] + ij[1], r = Math.hypot(ij[0], ij[1]);
      const cw = g === "G2", a0 = Math.atan2(cur[1] - cy, cur[0] - cx), a1 = Math.atan2(p[1] - cy, p[0] - cx);
      let sw = cw ? a0 - a1 : a1 - a0;
      while (sw <= 1e-6) sw += 2 * Math.PI;
      const len = r * sw;
      segs.push({ t: "A", cx, cy, r, cw, a0, sw, a: cur, b: p, len, s0 });
      s0 += len;
    }
    cur = p;
  }
  return { segs, total: s0 };
}
function pointAt(segs, s) {
  for (const g of segs) {
    if (s <= g.s0 + g.len + 1e-9) {
      const f = g.len ? Math.min(1, Math.max(0, (s - g.s0) / g.len)) : 0;
      if (g.t === "L") return [g.a[0] + (g.b[0] - g.a[0]) * f, g.a[1] + (g.b[1] - g.a[1]) * f];
      const a = g.a0 + (g.cw ? -1 : 1) * g.sw * f;
      return [g.cx + g.r * Math.cos(a), g.cy + g.r * Math.sin(a)];
    }
  }
  const l = segs[segs.length - 1]; return l ? l.b : [0, 0];
}
function tangentAt(segs, s) {
  for (const g of segs) {
    if (s <= g.s0 + g.len + 1e-9) {
      if (g.t === "L") return [(g.b[0] - g.a[0]) / g.len, (g.b[1] - g.a[1]) / g.len];
      const f = g.len ? Math.min(1, Math.max(0, (s - g.s0) / g.len)) : 0;
      const a = g.a0 + (g.cw ? -1 : 1) * g.sw * f;
      return g.cw ? [Math.sin(a), -Math.cos(a)] : [-Math.sin(a), Math.cos(a)];
    }
  }
  return [1, 0];
}
// move entries for the stretch s0..s1 of the path (the first one starts at pointAt(s0))
function sliceSegs(segs, s0, s1) {
  const out = [];
  for (const g of segs) {
    const lo = Math.max(s0, g.s0), hi = Math.min(s1, g.s0 + g.len);
    if (hi - lo < 1e-6) continue;
    if (g.t === "L") out.push(["G1", pointAt([g], hi)]);
    else {
      const from = pointAt([g], lo), to = pointAt([g], hi);
      out.push([g.cw ? "G2" : "G3", to, [g.cx - from[0], g.cy - from[1]]]);
    }
  }
  return out;
}
// where along the path (mm) is the spot nearest to point P?
function nearestS(segs, P) {
  let best = 0, bd = Infinity;
  for (const g of segs) {
    const n = Math.max(2, Math.ceil(g.len / 0.5));
    for (let k = 0; k <= n; k++) {
      const s = g.s0 + (g.len * k) / n, q = pointAt([g], s), d = Math.hypot(q[0] - P[0], q[1] - P[1]);
      if (d < bd) { bd = d; best = s; }
    }
  }
  return best;
}
export function nearestOnRing(ring, P) {          // for dragging a handle along an outline: the closest point on its line
  let best = null, bd = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i], b = ring[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const f = Math.min(1, Math.max(0, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / l2));
    const q = [a[0] + dx * f, a[1] + dy * f], d = Math.hypot(q[0] - P[0], q[1] - P[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

function buildRuns(c, { tabs, tabOver, leadOut, overcut, leadIn, warnings }) {
  const plain = { runs: [{ lead: c.lead, start: c.start, path: c.path }], tabPts: [], leadOutPt: null };
  const closedPart = !c.open && !c.hole;
  const ov = tabOver || {};
  const wantTabs = closedPart ? ((ov.pts && ov.pts.length) ? ov.pts.length : Number(ov.count ?? (tabs && tabs.count) ?? 0)) : 0;
  const width = Math.max(0.5, Number(ov.width ?? (tabs && tabs.width) ?? 3) || 3);
  const needTabs = wantTabs > 0, needOver = !c.open && overcut > 0, needOut = !c.open && leadOut > 0;
  if (!needTabs && !needOver && !needOut) return plain;
  const { segs, total } = segsOf(c.start, c.path);
  if (!segs.length || total < 1) return plain;

  // tab intervals (s0..s1), kept away from the pierce end and the close end
  let tabIv = [], tabPts = [];
  if (needTabs) {
    const margin = Math.max(width, 2) + 1;
    if (total < wantTabs * (width * 3) + 2 * margin) { warnings.push("A part edge is too short for the tabs asked for – no tabs on it."); }
    else {
      const centres = (ov.pts && ov.pts.length) ? ov.pts.map((P) => nearestS(segs, P)) : Array.from({ length: wantTabs }, (_, k) => (total * (k + 0.5)) / wantTabs);
      for (const s of centres.sort((a, b) => a - b)) {
        const a = Math.min(total - margin, Math.max(margin, s - width / 2)), b = Math.min(total - margin / 2, a + width);
        if (tabIv.length && a < tabIv[tabIv.length - 1][1] + 1) continue;      // overlapping tabs: keep the first
        tabIv.push([a, b]);
      }
      tabPts = tabIv.map(([a, b]) => pointAt(segs, (a + b) / 2));
    }
  }
  // overcut: past the start, along the line again, but never into the first tab
  let oc = needOver ? Math.min(overcut, tabIv.length ? Math.max(0, tabIv[0][0] - 1) : total * 0.5) : 0;
  const runs = [];
  const cuts = [];                                    // [from, to] stretches of the path that get cut
  let at = 0;
  for (const [a, b] of tabIv) { cuts.push([at, a]); at = b; }
  cuts.push([at, total]);
  cuts.forEach(([a, b], i) => {
    const path = sliceSegs(segs, a, b);
    if (i === cuts.length - 1 && oc > 1e-6) path.push(...sliceSegs(segs, 0, oc));
    const st = pointAt(segs, a);
    runs.push(i === 0 ? { lead: c.lead, start: c.start, path } : { lead: st, start: st, path });
  });
  // lead-out: from where the last run ends, run off into scrap
  let leadOutPt = null;
  if (needOut && c.scrap) {
    const sEnd = oc > 1e-6 ? oc : 0, from = pointAt(segs, sEnd), tn = tangentAt(segs, sEnd);
    const rot = (v, deg) => { const a = (deg * Math.PI) / 180; return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; };
    outer: for (let L = leadOut; L >= 0.5; L /= 2) {
      for (const deg of [-45, 45, -90, 90, 0]) {
        const d = rot(tn, deg), cand = [from[0] + d[0] * L, from[1] + d[1] * L];
        if (c.scrap(cand)) { leadOutPt = cand; break outer; }
      }
    }
    if (leadOutPt) runs[runs.length - 1].path.push(["G1", leadOutPt]);
    else warnings.push("A lead-out has no room on the scrap side – that cut ends on the line.");
  }
  return { runs, tabPts, leadOutPt };
}

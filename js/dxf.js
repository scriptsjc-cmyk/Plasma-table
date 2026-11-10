// Read 2D shapes from a DXF file (ASCII DXF, as saved by Fusion 360, FreeCAD, Onshape,
// SolidWorks, LibreCAD, Inkscape...). Supports LINE, ARC, CIRCLE, LWPOLYLINE (with
// bulges), POLYLINE/VERTEX, SPLINE, ELLIPSE. Loose lines and arcs are joined into closed
// outlines where their ends meet. Units come from the file's $INSUNITS (inches -> mm).

import { TOL, arcPoints, bulgePoints, circleContour, cleanPts } from "./geom.js";

const JOIN_TOL = 0.05; // mm: ends closer than this count as touching

export function parseDXF(text) {
  const raw = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([parseInt(raw[i].trim(), 10), raw[i + 1].trim()]);
  const warnings = [];
  let scale = 1, unitsName = "mm (assumed)";
  // header: units
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === "$INSUNITS") {
      const u = parseInt(pairs[i + 1][1], 10);
      const map = { 1: [25.4, "inches"], 2: [304.8, "feet"], 4: [1, "mm"], 5: [10, "cm"], 6: [1000, "metres"] };
      if (map[u]) [scale, unitsName] = map[u];
      break;
    }
  }
  // entities section
  let start = pairs.findIndex((p, i) => p[0] === 2 && p[1] === "ENTITIES" && pairs[i - 1] && pairs[i - 1][1] === "SECTION");
  if (start < 0) throw new Error("This doesn't look like a DXF file (no ENTITIES section). Save it as DXF from your CAD.");
  const ents = [];
  let cur = null;
  for (let i = start + 1; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (code === 0) {
      if (cur) ents.push(cur);
      if (val === "ENDSEC") { cur = null; break; }
      cur = { type: val, g: [] };
    } else if (cur) cur.g.push([code, val]);
  }
  if (cur) ents.push(cur);

  const contours = [];   // already closed
  const pieces = [];     // open pieces to join
  const skipped = {};
  let splines = 0, ellipses = 0;
  const S = (v) => parseFloat(v) * scale;
  const get = (e, c, d = 0) => { const f = e.g.find((x) => x[0] === c); return f ? parseFloat(f[1]) : d; };
  const all = (e, c) => e.g.filter((x) => x[0] === c).map((x) => parseFloat(x[1]));

  for (let k = 0; k < ents.length; k++) {
    const e = ents[k];
    switch (e.type) {
      case "LINE":
        pieces.push([[S(get(e, 10)), S(get(e, 20))], [S(get(e, 11)), S(get(e, 21))]]);
        break;
      case "CIRCLE":
        contours.push(circleContour(S(get(e, 10)), S(get(e, 20)), S(get(e, 40))));
        break;
      case "ARC": {
        const cx = S(get(e, 10)), cy = S(get(e, 20)), r = S(get(e, 40));
        const a0 = (get(e, 50) * Math.PI) / 180, a1 = (get(e, 51) * Math.PI) / 180;
        const st = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
        pieces.push([st, ...arcPoints(cx, cy, r, a0, a1, true)]);
        break;
      }
      case "LWPOLYLINE": {
        const closedFlag = (get(e, 70) & 1) === 1;
        const verts = [];
        for (const [c, v] of e.g) {
          if (c === 10) verts.push({ x: S(v), y: 0, b: 0 });
          else if (c === 20 && verts.length) verts[verts.length - 1].y = S(v);
          else if (c === 42 && verts.length) verts[verts.length - 1].b = parseFloat(v);
        }
        addPoly(verts, closedFlag);
        break;
      }
      case "POLYLINE": {
        const closedFlag = (get(e, 70) & 1) === 1;
        const verts = [];
        while (ents[k + 1] && ents[k + 1].type === "VERTEX") {
          const v = ents[++k];
          verts.push({ x: S(get(v, 10)), y: S(get(v, 20)), b: get(v, 42) });
        }
        if (ents[k + 1] && ents[k + 1].type === "SEQEND") k++;
        addPoly(verts, closedFlag);
        break;
      }
      case "SPLINE": {
        splines++;
        const pts = splinePoints(e, S);
        if (pts.length >= 2) {
          const closedFlag = (get(e, 70) & 1) === 1;
          const p0 = pts[0], pn = pts[pts.length - 1];
          if (closedFlag || Math.hypot(p0[0] - pn[0], p0[1] - pn[1]) < JOIN_TOL) contours.push({ pts: cleanPts(pts, true), closed: true });
          else pieces.push(pts);
        }
        break;
      }
      case "ELLIPSE": {
        ellipses++;
        const cx = S(get(e, 10)), cy = S(get(e, 20)), mx = S(get(e, 11)), my = S(get(e, 21));
        const ratio = get(e, 40, 1), t0 = get(e, 41, 0), t1 = get(e, 42, 2 * Math.PI);
        const a = Math.hypot(mx, my), ang = Math.atan2(my, mx), b = a * ratio;
        let sweep = t1 - t0; while (sweep <= 0) sweep += 2 * Math.PI;
        const n = Math.max(24, Math.ceil(sweep / 0.05));
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = t0 + (sweep * i) / n, x = a * Math.cos(t), y = b * Math.sin(t);
          pts.push([cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)]);
        }
        if (Math.abs(sweep - 2 * Math.PI) < 1e-6) contours.push({ pts: cleanPts(pts, true), closed: true });
        else pieces.push(pts);
        break;
      }
      case "POINT": case "TEXT": case "MTEXT": case "DIMENSION": case "HATCH": case "INSERT": case "SOLID":
      default:
        if (!["SEQEND", "VERTEX", "ATTRIB", "VIEWPORT"].includes(e.type)) skipped[e.type] = (skipped[e.type] || 0) + 1;
    }
  }

  function addPoly(verts, closedFlag) {
    if (verts.length < 2) return;
    const pts = [[verts[0].x, verts[0].y]];
    const n = verts.length;
    for (let i = 0; i < (closedFlag ? n : n - 1); i++) {
      const p = verts[i], q = verts[(i + 1) % n];
      pts.push(...bulgePoints([p.x, p.y], [q.x, q.y], p.b));
    }
    const first = pts[0], last = pts[pts.length - 1];
    if (closedFlag || Math.hypot(first[0] - last[0], first[1] - last[1]) < JOIN_TOL) contours.push({ pts: cleanPts(pts, true), closed: true });
    else pieces.push(pts);
  }

  contours.push(...joinPieces(pieces));
  for (const [t, n] of Object.entries(skipped)) {
    const why = { TEXT: "convert text to outlines/sketch curves in your CAD", MTEXT: "convert text to outlines in your CAD",
      INSERT: "explode blocks in your CAD", DIMENSION: "dimensions are ignored", HATCH: "hatching is ignored" }[t] || "not supported";
    warnings.push(`Ignored ${n} ${t} item(s) – ${why}.`);
  }
  if (splines || ellipses) warnings.push(`${splines + ellipses} spline/ellipse curve(s) can't be edited as true curves, so they were turned into short straight lines (they still cut smoothly). Edit them point by point, or redraw them as arcs.`);
  return { contours, warnings, units: unitsName, curves: { splines, ellipses } };
}

// join open pieces end-to-end into chains; closed chains become outlines
export function joinPieces(pieces) {
  const out = [];
  const left = pieces.map((p) => p.map((q) => [...q]));
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < JOIN_TOL;
  while (left.length) {
    let chain = left.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const p = left[i], end = chain[chain.length - 1], beg = chain[0];
        if (close(end, p[0])) chain = chain.concat(p.slice(1));
        else if (close(end, p[p.length - 1])) chain = chain.concat([...p].reverse().slice(1));
        else if (close(beg, p[p.length - 1])) chain = p.slice(0, -1).concat(chain);
        else if (close(beg, p[0])) chain = [...p].reverse().slice(0, -1).concat(chain);
        else continue;
        left.splice(i, 1); grew = true; break;
      }
    }
    const isClosed = chain.length > 2 && close(chain[0], chain[chain.length - 1]);
    out.push({ pts: cleanPts(chain, isClosed), closed: isClosed });
  }
  return out;
}

// B-spline (with optional weights) -> points, using de Boor. Falls back to fit points.
function splinePoints(e, S) {
  const deg = Math.round(e.g.find((x) => x[0] === 71)?.[1] ?? 3);
  const knots = e.g.filter((x) => x[0] === 40).map((x) => parseFloat(x[1]));
  const w = e.g.filter((x) => x[0] === 41).map((x) => parseFloat(x[1]));
  const cps = [];
  for (const [c, v] of e.g) { if (c === 10) cps.push([S(v), 0]); else if (c === 20 && cps.length) cps[cps.length - 1][1] = S(v); }
  if (cps.length > deg && knots.length === cps.length + deg + 1) {
    const W = w.length === cps.length ? w : cps.map(() => 1);
    const t0 = knots[deg], t1 = knots[cps.length];
    const n = Math.max(32, cps.length * 12);
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(deBoor(deg, knots, cps, W, t0 + ((t1 - t0) * i) / n, i === n));
    return pts;
  }
  const fit = [];
  for (const [c, v] of e.g) { if (c === 11) fit.push([S(v), 0]); else if (c === 21 && fit.length) fit[fit.length - 1][1] = S(v); }
  return fit.length >= 2 ? fit : cps;
}
function deBoor(p, U, P, W, t, last) {
  let k = p;
  for (let i = p; i < P.length; i++) if (t >= U[i] && t < U[i + 1]) { k = i; break; }
  if (last) k = P.length - 1;
  const d = [];
  for (let j = 0; j <= p; j++) { const q = P[j + k - p], w = W[j + k - p]; d.push([q[0] * w, q[1] * w, w]); }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = j + k - p;
      const den = U[i + p - r + 1] - U[i];
      const a = den === 0 ? 0 : (t - U[i]) / den;
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1], (1 - a) * d[j - 1][2] + a * d[j][2]];
    }
  }
  return [d[p][0] / d[p][2], d[p][1] / d[p][2]];
}

export { TOL };

// Read 2D shapes from a DXF file (ASCII DXF, as saved by Fusion 360, FreeCAD, Onshape,
// SolidWorks, LibreCAD, Inkscape...). Supports LINE, ARC, CIRCLE, LWPOLYLINE (with
// bulges), POLYLINE/VERTEX, SPLINE, ELLIPSE. Loose lines and arcs are joined into closed
// outlines where their ends meet. Units come from the file's $INSUNITS (inches -> mm).
// r15 10.6: blocks (INSERT) are drawn where they are placed; layer names say cut / etch / drill (layerOp).

import { TOL, arcPoints, bulgePoints, circleContour, cleanPts } from "../core/geom.js";
import { drillMark } from "./holerule.js";

export const JOIN_TOL = 0.25; // mm: ends closer than this are joined (C43 close-paths)

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
  // sections: ENTITIES (what is drawn) and BLOCKS (named drawings an INSERT places, r15 10.6)
  const sectionAt = (name) => pairs.findIndex((p, i) => p[0] === 2 && p[1] === name && pairs[i - 1] && pairs[i - 1][1] === "SECTION");
  const readEnts = (from) => {
    const out = []; let cur = null;
    for (let i = from + 1; i < pairs.length; i++) {
      const [code, val] = pairs[i];
      if (code === 0) {
        if (cur) out.push(cur);
        if (val === "ENDSEC") { cur = null; break; }
        cur = { type: val, g: [] };
      } else if (cur) cur.g.push([code, val]);
    }
    if (cur) out.push(cur);
    return out;
  };
  let start = sectionAt("ENTITIES");
  if (start < 0) throw new Error("This doesn't look like a DXF file (no ENTITIES section). Save it as DXF from your CAD.");
  const ents = readEnts(start);
  const blocks = new Map();
  const bAt = sectionAt("BLOCKS");
  if (bAt >= 0) {
    let blk = null;
    for (const e of readEnts(bAt)) {
      if (e.type === "BLOCK") { blk = { name: (e.g.find((x) => x[0] === 2) || [0, ""])[1], base: [0, 0], ents: [] }; const gx = e.g.find((x) => x[0] === 10), gy = e.g.find((x) => x[0] === 20); blk.base = [gx ? parseFloat(gx[1]) || 0 : 0, gy ? parseFloat(gy[1]) || 0 : 0]; }
      else if (e.type === "ENDBLK") { if (blk && blk.name) blocks.set(blk.name, blk); blk = null; }
      else if (blk) blk.ents.push(e);
    }
  }

  const contours = [];   // already closed
  const groups = new Map();   // open pieces to join, kept apart per layer / block (key "" = layer 0, not in a block)
  const skipped = {};
  const layerSeen = new Map();
  let splines = 0, ellipses = 0;
  const S = (v) => parseFloat(v) * scale;
  const get = (e, c, d = 0) => { const f = e.g.find((x) => x[0] === c); return f ? parseFloat(f[1]) : d; };
  const gstr = (e, c, d = "") => { const f = e.g.find((x) => x[0] === c); return f ? String(f[1]) : d; };
  const ID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, id: true };
  const tp = (m, [x, y]) => (m.id ? [x, y] : [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const tag = (c, info) => {
    if (info.layer && info.layer !== "0") c.layer = info.layer;
    if (info.block) c.block = info.block;
    return c;
  };
  const putClosed = (c, m, info) => {
    if (!m.id) {
      const out = { pts: c.pts.map((p) => tp(m, p)), closed: true };
      const sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d), skew = Math.abs(m.a * m.c + m.b * m.d);
      if (c.circle && Math.abs(sx - sy) < 1e-9 * Math.max(1, sx) && skew < 1e-9) { const [cx, cy] = tp(m, [c.circle.cx, c.circle.cy]); out.circle = { cx, cy, r: c.circle.r * sx }; }
      c = out;
    }
    contours.push(tag(c, info));
  };
  const putOpen = (pts, m, info) => {
    const key = (info.layer && info.layer !== "0" ? info.layer : "") + "\u0000" + (info.block || "");
    if (!groups.has(key)) groups.set(key, { info, pieces: [] });
    groups.get(key).pieces.push(m.id ? pts : pts.map((p) => tp(m, p)));
  };

  function emit(list, m, inherit, block, stack) {
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      let layer = gstr(e, 8, "0");
      if (layer === "0" && inherit) layer = inherit;
      const info = { layer, block };
      if (!["SEQEND", "VERTEX", "ATTRIB", "VIEWPORT", "INSERT"].includes(e.type) || e.type === "INSERT") layerSeen.set(layer, (layerSeen.get(layer) || 0) + 1);
      switch (e.type) {
        case "LINE":
          putOpen([[S(get(e, 10)), S(get(e, 20))], [S(get(e, 11)), S(get(e, 21))]], m, info);
          break;
        case "CIRCLE":
          putClosed(circleContour(S(get(e, 10)), S(get(e, 20)), S(get(e, 40))), m, info);
          break;
        case "ARC": {
          const cx = S(get(e, 10)), cy = S(get(e, 20)), r = S(get(e, 40));
          const a0 = (get(e, 50) * Math.PI) / 180, a1 = (get(e, 51) * Math.PI) / 180;
          const st = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
          putOpen([st, ...arcPoints(cx, cy, r, a0, a1, true)], m, info);
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
          addPoly(verts, closedFlag, m, info);
          break;
        }
        case "POLYLINE": {
          const closedFlag = (get(e, 70) & 1) === 1;
          const verts = [];
          while (list[k + 1] && list[k + 1].type === "VERTEX") {
            const v = list[++k];
            verts.push({ x: S(get(v, 10)), y: S(get(v, 20)), b: get(v, 42) });
          }
          if (list[k + 1] && list[k + 1].type === "SEQEND") k++;
          addPoly(verts, closedFlag, m, info);
          break;
        }
        case "SPLINE": {
          splines++;
          const pts = splinePoints(e, S);
          if (pts.length >= 2) {
            const closedFlag = (get(e, 70) & 1) === 1;
            const p0 = pts[0], pn = pts[pts.length - 1];
            if (closedFlag || Math.hypot(p0[0] - pn[0], p0[1] - pn[1]) < JOIN_TOL) putClosed({ pts: cleanPts(pts, true), closed: true }, m, info);
            else putOpen(pts, m, info);
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
          if (Math.abs(sweep - 2 * Math.PI) < 1e-6) putClosed({ pts: cleanPts(pts, true), closed: true }, m, info);
          else putOpen(pts, m, info);
          break;
        }
        case "INSERT": {                                   // r15 10.6: draw the block where it is placed (scale, turn, rows / columns)
          const name = gstr(e, 2);
          const blk = blocks.get(name);
          if (!blk) { skipped.INSERT = (skipped.INSERT || 0) + 1; break; }
          if (stack.includes(name) || stack.length > 8) { warnings.push(`Block “${name}” places itself (or nests too deep), so it was drawn once only.`); break; }
          const sx = get(e, 41, 1) || 1, sy = get(e, 42, 1) || 1, rot = (get(e, 50, 0) * Math.PI) / 180;
          const cols = Math.max(1, Math.min(100, Math.round(get(e, 70, 1)))), rows = Math.max(1, Math.min(100, Math.round(get(e, 71, 1))));
          const csp = S(get(e, 44, 0)), rsp = S(get(e, 45, 0));
          const co = Math.cos(rot), si = Math.sin(rot), bx = blk.base[0] * scale, by = blk.base[1] * scale;
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const ix = S(get(e, 10)) + co * c * csp - si * r * rsp, iy = S(get(e, 20)) + si * c * csp + co * r * rsp;
            const A = co * sx, B = si * sx, C = -si * sy, D = co * sy;           // turn · scale
            const L = { a: A, b: B, c: C, d: D, e: ix - (A * bx + C * by), f: iy - (B * bx + D * by) };
            const M = m.id ? L : { a: m.a * L.a + m.c * L.b, b: m.b * L.a + m.d * L.b, c: m.a * L.c + m.c * L.d, d: m.b * L.c + m.d * L.d, e: m.a * L.e + m.c * L.f + m.e, f: m.b * L.e + m.d * L.f + m.f };
            emit(blk.ents, M, layer !== "0" ? layer : inherit, block || name, [...stack, name]);
          }
          break;
        }
        case "POINT": case "TEXT": case "MTEXT": case "DIMENSION": case "HATCH": case "SOLID":
        default:
          if (!["SEQEND", "VERTEX", "ATTRIB", "VIEWPORT", "ATTDEF"].includes(e.type)) skipped[e.type] = (skipped[e.type] || 0) + 1;
      }
    }
  }

  function addPoly(verts, closedFlag, m, info) {
    if (verts.length < 2) return;
    const pts = [[verts[0].x, verts[0].y]];
    const n = verts.length;
    for (let i = 0; i < (closedFlag ? n : n - 1); i++) {
      const p = verts[i], q = verts[(i + 1) % n];
      pts.push(...bulgePoints([p.x, p.y], [q.x, q.y], p.b));
    }
    const first = pts[0], last = pts[pts.length - 1];
    if (closedFlag || Math.hypot(first[0] - last[0], first[1] - last[1]) < JOIN_TOL) putClosed({ pts: cleanPts(pts, true), closed: true }, m, info);
    else putOpen(pts, m, info);
  }

  emit(ents, ID, null, null, []);
  let openCount = 0;
  for (const { info, pieces } of groups.values()) {
    const cleaned = cleanupOpenPieces(pieces);
    for (const c of cleaned.contours) contours.push(tag(c, info));
    openCount += cleaned.open;
  }
  if (openCount) {
    warnings.push(openCount === 1
      ? "1 open path was left open (its ends are more than " + JOIN_TOL + " mm apart). It will import as an open line, not a cut outline."
      : openCount + " open paths were left open (ends more than " + JOIN_TOL + " mm apart). They will import as open lines, not cut outlines.");
  }
  // r15 10.6: what each layer does. etch / mark / score / engrave -> etched; drill / punch -> a drill mark at each circle's centre
  const out = [];
  for (const c of contours) {
    const op = layerOp(c.layer || "0");
    if (op === "score") out.push({ ...c, op: "score" });
    else if (op === "drill") {
      if (c.circle) out.push(...drillMark(c.circle.cx, c.circle.cy, c.circle.r * 2).map((x) => tag(x, { layer: c.layer, block: c.block })));
      else out.push({ ...c, op: "mark" });
    } else out.push(c);
  }
  for (const [t, n] of Object.entries(skipped)) {
    const why = { TEXT: "convert text to outlines/sketch curves in your CAD", MTEXT: "convert text to outlines in your CAD",
      INSERT: "the block it places is missing from the file", DIMENSION: "dimensions are ignored", HATCH: "hatching is ignored" }[t] || "not supported";
    warnings.push(`Ignored ${n} ${t} item(s) – ${why}.`);
  }
  if (splines || ellipses) warnings.push(`${splines + ellipses} spline/ellipse curve(s) can't be edited as true curves, so they were turned into short straight lines (they still cut smoothly). Edit them point by point, or redraw them as arcs.`);
  const layers = [...layerSeen.entries()].map(([name, count]) => ({ name, op: layerOp(name), count }));
  return { contours: out, warnings, units: unitsName, curves: { splines, ellipses }, open: openCount, layers };
}

// r15 10.6: what a DXF layer name means for the cut. Anything not named for etching or drilling is cut.
export function layerOp(name) {
  const n = String(name || "");
  if (/drill|punch/i.test(n)) return "drill";
  if (/etch|mark|scor|engrav|scribe/i.test(n)) return "score";
  return "cut";
}

// C43: drop duplicate loose pieces, join ends within JOIN_TOL, close almost-closed
// chains, and report any contours that are still open.
export function samePiece(a, b, tol = JOIN_TOL) {
  if (!a || !b || a.length < 2 || b.length < 2 || a.length !== b.length) return false;
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
  const fwd = a.every((p, i) => near(p, b[i]));
  const rev = a.every((p, i) => near(p, b[b.length - 1 - i]));
  return fwd || rev;
}
export function dropDuplicatePieces(pieces, tol = JOIN_TOL) {
  const out = [];
  for (const p of pieces) {
    if (!p || p.length < 2) continue;
    if (out.some((q) => samePiece(p, q, tol))) continue;
    out.push(p.map((q) => [...q]));
  }
  return out;
}
export function joinPieces(pieces, tol = JOIN_TOL) {
  const out = [];
  const left = dropDuplicatePieces(pieces, tol);
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
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
    if (isClosed) chain[chain.length - 1] = [...chain[0]];
    out.push({ pts: cleanPts(chain, isClosed), closed: isClosed });
  }
  return out;
}
export function cleanupOpenPieces(pieces, tol = JOIN_TOL) {
  const contours = joinPieces(pieces, tol);
  const open = contours.filter((c) => c.closed === false);
  const warnings = [];
  if (open.length) {
    warnings.push(open.length === 1
      ? "1 open path was left open (its ends are more than " + tol + " mm apart). It will import as an open line, not a cut outline."
      : open.length + " open paths were left open (ends more than " + tol + " mm apart). They will import as open lines, not cut outlines.");
  }
  return { contours, open: open.length, warnings };
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

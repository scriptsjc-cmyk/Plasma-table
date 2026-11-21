// Trim, extend, break, 3-point / tangent arcs, make-tangent / make-concentric, and spline-through-points.
import { bbox } from "../core/geom.js";
import { distToEdge, r1, clone } from "./sketch-util.js";
import {
  arcThrough3, tangentArcFrom, edgeTangentAt, edgeEdgeHits, rayHits, arcRayHits,
  splitEdgeAt, paramOnEdge, pointOnArc, circleOfBulge, bulgeFromCircle, splineToContour, parsePointList,
} from "../core/arcs.js";

const HIT_MM = 4;

function copyCs(cs) {
  return (cs || []).map((c) => ({
    ...c,
    pts: c.pts.map((p) => [p[0], p[1]]),
    bulges: (c.bulges || []).slice(),
    closed: c.closed !== false,
    circle: c.circle ? { ...c.circle } : undefined,
  }));
}

// r15 3.12: remember which outline points a curve went through (clicked or typed), so only those get handles, not every fitted arc joint
function markCurveHandles(it, c, through) {
  const sc = it && it.shape && it.shape.cs[0];
  if (!sc || !Array.isArray(through)) return;
  const idx = through.map(([x, y]) => { let bi = 0, bd = Infinity; c.pts.forEach((q, i) => { const d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; bi = i; } }); return bi; });
  sc.handles = [...new Set(idx)].sort((a, b) => a - b); sc.handlesN = sc.pts.length;
}

export class TrimMethods {
  worldCs(it) {
    if (!it) return [];
    if (it.type === "custom" && it.shape && it.shape.cs) return this.rawWorld(it);
    return (this.contoursOf(it) || []).map((c) => ({ ...c, pts: c.pts.map((p) => [p[0], p[1]]), closed: c.closed !== false, bulges: (c.bulges || []).slice() }));
  }
  writeWorldCs(it, cs) {
    const loops = (cs || []).filter((c) => c && c.pts && c.pts.length >= 2);
    if (!loops.length) return false;
    const b = bbox(loops);
    it.type = "custom"; it.p = { scale: 100 }; it.rot = 0; it.fx = false; it.fy = false; it.holes = {};
    it.shape = { cs: loops.map((c) => ({
      ...c,
      pts: c.pts.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]),
      bulges: (c.bulges || []).slice(),
      closed: c.closed !== false,
      circle: c.circle ? { cx: r1(c.circle.cx - b[0]), cy: r1(c.circle.cy - b[1]), r: c.circle.r } : undefined,
    })) };
    it.x = r1(b[0]); it.y = r1(b[1]); it._key = null;
    return true;
  }
  addCustomWorld(cs, name) {
    const loops = (cs || []).filter((c) => c && c.pts && c.pts.length >= 2);
    if (!loops.length) return null;
    const b = bbox(loops);
    const it = {
      id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, fx: false, fy: false, holes: {},
      name: name || "Outline",
      shape: { cs: loops.map((c) => ({
        pts: c.pts.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]),
        bulges: (c.bulges || []).slice(),
        closed: c.closed !== false,
        circle: c.circle ? { cx: r1(c.circle.cx - b[0]), cy: r1(c.circle.cy - b[1]), r: c.circle.r } : undefined,
        op: c.op,
      })) },
    };
    this.items.push(it);
    return it;
  }
  allWorldEdges(skipItem, skipCi, skipEi) {
    const out = [];
    for (const it of this.items) {
      if (this.layerHidden && this.layerHidden(it)) continue;
      const cs = this.worldCs(it);
      for (let ci = 0; ci < cs.length; ci++) {
        const c = cs[ci], n = c.pts.length, closed = c.closed !== false;
        const edges = closed ? n : Math.max(0, n - 1);
        for (let ei = 0; ei < edges; ei++) {
          if (skipItem && it === skipItem && ci === skipCi && ei === skipEi) continue;
          const p = c.pts[ei], q = c.pts[(ei + 1) % n];
          const bulge = Number(c.bulges && c.bulges[ei]) || 0;
          out.push({ it, ci, ei, p, q, bulge, closed, n, c });
        }
      }
    }
    return out;
  }
  hitWorldEdge(wx, wy, maxD = HIT_MM) {
    let best = null, bestD = maxD;
    for (const e of this.allWorldEdges()) {
      const d = distToEdge(wx, wy, e.p, e.q, e.bulge);
      if (d < bestD) { bestD = d; best = { ...e, d }; }
    }
    return best;
  }
  snapOrRaw(wx, wy) {
    let px = wx, py = wy;
    const sn = typeof snapWorld === "function" ? null : null;
    return [px, py];
  }
  startTrimMode(mode) {
    const m = mode === "extend" ? "extend" : mode === "break" ? "break" : "trim";
    this.trimMode = m;
    this.tool = "trim";
    this.tanPick = null; this.curvePick = null;
    this.cv && (this.cv.style.cursor = "crosshair");
    this.draw();
    this.onMessage(m === "extend"
      ? "Click an open end to lengthen it to the next edge it meets."
      : m === "break"
        ? "Click an edge to split it at that point."
        : "Click the piece of an edge you want to remove, up to the nearest intersection.");
    return true;
  }
  startArc3() {
    this.tool = "arc3"; this.drawPts = []; this.tanPick = null; this.trimMode = null;
    this.cv && (this.cv.style.cursor = "crosshair");
    this.onMessage("Click three points: the two ends, then a point the arc should pass through. Or end, mid, end — the first and last are the ends.");
    this.draw();
    if (this.onSelect) this.onSelect();
  }
  startTanArc() {
    this.tool = "arctan"; this.drawPts = []; this.tanPick = null; this.trimMode = null;
    this.cv && (this.cv.style.cursor = "crosshair");
    this.onMessage("Click an existing edge at the start, then click the other end. The arc leaves that edge tangent.");
    this.draw();
    if (this.onSelect) this.onSelect();
  }
  startSpline() {
    this.tool = "spline"; this.drawPts = []; this.trimMode = null; this.tanPick = null;
    this.cv && (this.cv.style.cursor = "crosshair");
    this.onMessage("Click points for a smooth curve. Enter or double-click finishes. The curve is fitted to editable arcs.");
    this.draw();
    if (this.onSelect) this.onSelect();
  }
  startMakeRel(kind) {
    this.tool = kind === "concentric" ? "makeconc" : "maketan";
    this.tanPick = null; this.trimMode = null; this.drawPts = [];
    this.cv && (this.cv.style.cursor = "crosshair");
    this.onMessage(kind === "concentric"
      ? "Click a circle or arc, then another — the second moves to share the first’s centre."
      : "Click an edge, then another — the second is moved to sit tangent to the first.");
    this.draw();
    if (this.onSelect) this.onSelect();
  }

  ensureEditable(it, opts = {}) {
    if (!it || !this.canMutate(it)) return false;
    if (this.isEditableCustom && this.isEditableCustom(it)) return true;
    return this.toEditableCustom(it, { noRemember: !!opts.noRemember });
  }

  applyTrimAt(wx, wy) {
    const hit = this.hitWorldEdge(wx, wy, Math.max(HIT_MM, this.view && this.view.ppm ? 10 / this.view.ppm : HIT_MM));
    if (!hit) { this.onMessage("Click an edge."); return false; }
    if (!this.canMutate(hit.it)) return false;
    this.remember();
    if (!this.ensureEditable(hit.it, { noRemember: true })) { this.undo && this.undo(); return false; }
    // re-hit after conversion (coordinates may shift slightly)
    const h = this.hitWorldEdge(wx, wy, Math.max(HIT_MM * 2, this.view && this.view.ppm ? 14 / this.view.ppm : HIT_MM * 2));
    if (!h || h.it !== hit.it) { this.onMessage("Could not find that edge after converting the part."); return false; }
    const mode = this.trimMode || "trim";
    const ok = mode === "extend" ? this._extendHit(h, wx, wy)
      : mode === "break" ? this._breakHit(h, wx, wy)
      : this._trimHit(h, wx, wy);
    if (ok) { this.commit(); this.onSelect(); this.draw(); }
    else { this.undo && this.undo(); }
    return ok;
  }

  _edgePoint(h, wx, wy) {
    const t = Math.max(0, Math.min(1, paramOnEdge(h.p, h.q, h.bulge, [wx, wy])));
    return { t, p: Math.abs(h.bulge) > 1e-12 ? pointOnArc(h.p, h.q, h.bulge, t) : [h.p[0] + (h.q[0] - h.p[0]) * t, h.p[1] + (h.q[1] - h.p[1]) * t] };
  }

  _intersectionsOnEdge(h, minT = 1e-5, maxT = 1 - 1e-5) {
    const hits = [];
    for (const e of this.allWorldEdges(h.it, h.ci, h.ei)) {
      for (const x of edgeEdgeHits(h.p, h.q, h.bulge, e.p, e.q, e.bulge)) {
        if (x.tA > minT && x.tA < maxT && x.tB > -1e-4 && x.tB < 1 + 1e-4) hits.push({ t: x.tA, p: x.p, e });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    // unique
    const out = [];
    for (const x of hits) {
      if (out.length && Math.abs(out[out.length - 1].t - x.t) < 1e-5) continue;
      out.push(x);
    }
    return out;
  }

  _trimHit(h, wx, wy) {
    const { t, p } = this._edgePoint(h, wx, wy);
    const xs = this._intersectionsOnEdge(h);
    // piece bounds: nearest intersection (or vertex) on each side of t
    let lo = 0, hi = 1, loP = h.p, hiP = h.q;
    for (const x of xs) {
      if (x.t < t && x.t >= lo) { lo = x.t; loP = x.p; }
      if (x.t > t && x.t <= hi) { hi = x.t; hiP = x.p; }
    }
    if (hi - lo < 1e-6) { this.onMessage("Nothing to trim there."); return false; }
    const cs = copyCs(this.worldCs(h.it));
    const c = cs[h.ci];
    if (!c) return false;
    const n = c.pts.length;
    const bs = (c.bulges || []).slice();
    while (bs.length < n) bs.push(0);
    const closed = c.closed !== false;

    if (lo <= 1e-8 && hi >= 1 - 1e-8) {
      // delete the whole edge
      if (closed) {
        // open the loop at this edge: rotate so the edge is the close, then drop close
        const pts = [], nbs = [];
        for (let k = 1; k < n; k++) {
          const i = (h.ei + k) % n;
          pts.push(c.pts[i]); nbs.push(bs[i]);
        }
        c.pts = pts; c.bulges = nbs; c.closed = false; c.circle = undefined;
      } else {
        // split the open chain in two, dropping this edge
        const leftPts = c.pts.slice(0, h.ei + 1);
        const leftB = bs.slice(0, h.ei);
        const rightPts = c.pts.slice(h.ei + 1);
        const rightB = bs.slice(h.ei + 1);
        const repl = [];
        if (leftPts.length >= 2) repl.push({ pts: leftPts, bulges: leftB, closed: false });
        if (rightPts.length >= 2) repl.push({ pts: rightPts, bulges: rightB, closed: false });
        cs.splice(h.ci, 1, ...repl);
      }
    } else {
      const loSplit = splitEdgeAt(h.p, h.q, h.bulge, loP);
      const hiSplit = splitEdgeAt(h.p, h.q, h.bulge, hiP);
      if (closed) {
        // become open: walk from hiP around to loP, dropping the trimmed piece
        const pts = [hiP], nbs = [hi <= 1 - 1e-8 ? hiSplit.b2 : 0];
        for (let k = 1; k < n; k++) {
          const i = (h.ei + k) % n;
          pts.push(c.pts[i]); nbs.push(bs[i]);
        }
        // last existing vertex is h.p; then loP
        if (lo > 1e-8) { pts.push(loP); nbs[nbs.length - 1] = loSplit.b1; nbs.push(0); }
        else nbs[nbs.length - 1] = 0;
        // if hi is not 1, first bulge is remainder of original edge after hiP, already set
        // Wait: after pushing hiP, next vertex is c.pts[(ei+1)%n] which is h.q. The bulge hiP→h.q is hiSplit.b2. Good.
        // Then we iterate k=1..n-1: k=1 → (ei+1)%n = h.q which we already have as next. BUG.
        // Better rebuild:
        const pts2 = [hiP], b2 = [];
        if (hi < 1 - 1e-8) {
          pts2.push(h.q); b2.push(hiSplit.b2);
          for (let i = (h.ei + 2) % n; i !== h.ei; i = (i + 1) % n) {
            b2.push(bs[(i - 1 + n) % n]);
            pts2.push(c.pts[i]);
            if (i === (h.ei + n) % n) break;
          }
        } else {
          for (let i = (h.ei + 1) % n; i !== h.ei; i = (i + 1) % n) {
            if (pts2.length) b2.push(bs[(i - 1 + n) % n]);
            pts2.push(c.pts[i]);
          }
        }
        // pts2 ends at h.p (ei). Then loP if needed.
        if (lo > 1e-8) { b2.push(loSplit.b1); pts2.push(loP); }
        c.pts = pts2; c.bulges = b2; c.closed = false; c.circle = undefined;
      } else {
        // open path: remove (lo,hi) on this edge, maybe splitting into two chains
        const leftPts = c.pts.slice(0, h.ei + 1);
        const leftB = bs.slice(0, h.ei);
        if (lo > 1e-8) { leftPts.push(loP); leftB.push(loSplit.b1); }
        const rightPts = [];
        const rightB = [];
        if (hi < 1 - 1e-8) { rightPts.push(hiP); }
        rightPts.push(...c.pts.slice(h.ei + 1));
        if (hi < 1 - 1e-8) {
          rightB.push(hiSplit.b2);
          rightB.push(...bs.slice(h.ei + 1));
        } else {
          rightB.push(...bs.slice(h.ei + 1));
        }
        const repl = [];
        if (leftPts.length >= 2) repl.push({ pts: leftPts, bulges: leftB, closed: false });
        if (rightPts.length >= 2) repl.push({ pts: rightPts, bulges: rightB, closed: false });
        cs.splice(h.ci, 1, ...repl);
      }
    }
    const kept = cs.filter((c) => c.pts && c.pts.length >= 2);
    if (!kept.length) {
      this.items = this.items.filter((i) => i !== h.it);
      this.pick([]);
      this.onMessage("Edge trimmed — the part had nothing left.");
      return true;
    }
    this.writeWorldCs(h.it, kept);
    this.pick([h.it.id]);
    this.onMessage("Edge trimmed.");
    return true;
  }

  _breakHit(h, wx, wy) {
    const { t, p } = this._edgePoint(h, wx, wy);
    // Prefer a nearby intersection if the click is close to one
    const xs = this._intersectionsOnEdge(h, 1e-5, 1 - 1e-5);
    let pt = p, tt = t;
    let best = 1e9;
    for (const x of xs) {
      const d = Math.hypot(x.p[0] - wx, x.p[1] - wy);
      if (d < best && d <= HIT_MM) { best = d; pt = x.p; tt = x.t; }
    }
    if (tt <= 1e-5 || tt >= 1 - 1e-5) { this.onMessage("Click in the middle of an edge to split it."); return false; }
    const cs = copyCs(this.worldCs(h.it));
    const c = cs[h.ci];
    const n = c.pts.length;
    const bs = (c.bulges || []).slice();
    while (bs.length < n) bs.push(0);
    const sp = splitEdgeAt(h.p, h.q, h.bulge, pt);
    // insert vertex
    const pts = c.pts.slice();
    const nbs = bs.slice();
    pts.splice(h.ei + 1, 0, sp.mid);
    nbs[h.ei] = sp.b1;
    nbs.splice(h.ei + 1, 0, sp.b2);
    const closed = c.closed !== false;
    if (closed) {
      // open at the new vertex
      const i = h.ei + 1;
      const nn = pts.length;
      const op = [], ob = [];
      for (let k = 0; k < nn; k++) {
        const j = (i + k) % nn;
        op.push(pts[j]);
        if (k < nn - 1) ob.push(nbs[j]);
      }
      c.pts = op; c.bulges = ob; c.closed = false; c.circle = undefined;
      this.writeWorldCs(h.it, cs);
      this.pick([h.it.id]);
      this.onMessage("Path opened at the break.");
      return true;
    }
    // split open path into two
    const leftPts = pts.slice(0, h.ei + 2); // up to and including mid
    const leftB = nbs.slice(0, h.ei + 1);
    const rightPts = pts.slice(h.ei + 1);
    const rightB = nbs.slice(h.ei + 1);
    const repl = [];
    if (leftPts.length >= 2) repl.push({ pts: leftPts, bulges: leftB, closed: false });
    if (rightPts.length >= 2) repl.push({ pts: rightPts, bulges: rightB, closed: false });
    cs.splice(h.ci, 1, ...repl);
    this.writeWorldCs(h.it, cs);
    this.pick([h.it.id]);
    this.onMessage("Path split.");
    return true;
  }

  _extendHit(h, wx, wy) {
    const c0 = this.worldCs(h.it)[h.ci];
    if (!c0 || c0.closed !== false && c0.closed !== false) {
      // only open ends
    }
    const closed = h.closed;
    if (closed) { this.onMessage("Extend works on an open end. Break the path first, or use an open line."); return false; }
    // Which end is closer to the click?
    const d0 = Math.hypot(wx - h.p[0], wy - h.p[1]);
    const d1 = Math.hypot(wx - h.q[0], wy - h.q[1]);
    const atStart = d0 <= d1;
    // Only the first or last edge of an open contour
    const lastEi = h.n - 2;
    if (atStart && h.ei !== 0) { this.onMessage("Click near the open end you want to lengthen."); return false; }
    if (!atStart && h.ei !== lastEi) { this.onMessage("Click near the open end you want to lengthen."); return false; }

    let best = null;
    if (Math.abs(h.bulge) < 1e-12) {
      const origin = atStart ? h.p : h.q;
      const dir = atStart ? [h.p[0] - h.q[0], h.p[1] - h.q[1]] : [h.q[0] - h.p[0], h.q[1] - h.p[1]];
      const L = Math.hypot(dir[0], dir[1]) || 1;
      const u = [dir[0] / L, dir[1] / L];
      for (const e of this.allWorldEdges(h.it, h.ci, h.ei)) {
        for (const x of rayHits(origin, u, e.p, e.q, e.bulge, 1e-4)) {
          if (x.tE < -1e-6 || x.tE > 1 + 1e-6) continue;
          if (!best || x.t < best.t) best = { p: x.p, t: x.t };
        }
      }
    } else {
      for (const e of this.allWorldEdges(h.it, h.ci, h.ei)) {
        const xs = arcRayHits(h.p, h.q, h.bulge, atStart, e.p, e.q, e.bulge, 1e-4);
        if (xs[0] && (!best || xs[0].t < best.t)) best = { p: xs[0].p, t: xs[0].t };
      }
    }
    if (!best) { this.onMessage("Nothing ahead to meet. Place another edge in the way, then extend again."); return false; }
    const cs = copyCs(this.worldCs(h.it));
    const c = cs[h.ci];
    const bs = (c.bulges || []).slice();
    while (bs.length < c.pts.length) bs.push(0);
    if (atStart) {
      if (Math.abs(h.bulge) < 1e-12) c.pts[0] = best.p;
      else {
        const circ = circleOfBulge(h.p, h.q, h.bulge);
        c.pts[0] = best.p;
        bs[0] = bulgeFromCircle(best.p, h.q, circ.cx, circ.cy, h.bulge);
      }
    } else {
      if (Math.abs(h.bulge) < 1e-12) c.pts[c.pts.length - 1] = best.p;
      else {
        const circ = circleOfBulge(h.p, h.q, h.bulge);
        c.pts[c.pts.length - 1] = best.p;
        bs[h.ei] = bulgeFromCircle(h.p, best.p, circ.cx, circ.cy, h.bulge);
      }
    }
    c.bulges = bs; c.circle = undefined;
    this.writeWorldCs(h.it, cs);
    this.pick([h.it.id]);
    this.onMessage("Edge extended.");
    return true;
  }

  finishArc3() {
    const pts = this.drawPts || [];
    if (pts.length < 3) { this.onMessage("Click three points for the arc."); return false; }
    // First and last are the ends, the middle click (or second of three) is on the arc.
    const a = pts[0], c = pts[pts.length - 1], b = pts[1];
    const arc = arcThrough3(a, b, c);
    if (!arc) { this.onMessage("Those points lie on a straight line, so there is no arc."); return false; }
    this.remember();
    const it = this.addCustomWorld([{ pts: [arc.p, arc.q], bulges: [arc.bulge], closed: false }], "Arc");
    this.pick([it.id]); this.tool = null; this.drawPts = [];
    this.commit(); this.onSelect(); this.draw();
    this.onMessage("Arc added. Drag a corner or click the curve to change it.");
    return true;
  }

  clickTanArc(wx, wy, sx, sy) {
    if (!this.tanPick) {
      const h = this.hitWorldEdge(wx, wy, Math.max(HIT_MM, this.view && this.view.ppm ? 10 / this.view.ppm : HIT_MM));
      if (!h) { this.onMessage("Click an existing edge to leave it tangent."); return false; }
      const { t, p } = this._edgePoint(h, wx, wy);
      const atStart = t < 0.5;
      const T = edgeTangentAt(h.p, h.q, h.bulge, true);
      // If we start in the middle, tangent is still along the edge (same for a line). For an arc, use the tangent at p.
      const tan = Math.abs(h.bulge) < 1e-12 ? T : edgeTangentAt(h.p, p, 0, true);
      // Better: tangent of the original edge at parameter t
      const tan2 = (function () {
        if (Math.abs(h.bulge) < 1e-12) return T;
        return edgeTangentAt(h.p, h.q, h.bulge, t < 0.5);
      })();
      this.tanPick = { p, T: tan2, h };
      this.onMessage("Now click the other end of the arc.");
      this.draw();
      return true;
    }
    const arc = tangentArcFrom(this.tanPick.p, this.tanPick.T, [wx, wy]);
    if (!arc) { this.onMessage("Could not make a tangent arc to that point. Try a different end."); return false; }
    this.remember();
    const it = this.addCustomWorld([{ pts: [arc.p, arc.q], bulges: [arc.bulge], closed: false }], "Arc");
    this.pick([it.id]); this.tool = null; this.drawPts = []; this.tanPick = null;
    this.commit(); this.onSelect(); this.draw();
    this.onMessage("Tangent arc added.");
    return true;
  }

  finishSpline(close) {
    const pts = (this.drawPts || []).map((p) => [p[0], p[1]]);
    if (pts.length < 2) { this.onMessage("Click at least two points, then press Enter."); return false; }
    let closed = !!close;
    if (pts.length >= 3) {
      const a = pts[0], b = pts[pts.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 8) { pts.pop(); closed = true; }
    }
    const c = splineToContour(pts, closed);
    if (!c || !c.pts || c.pts.length < 2) { this.onMessage("That curve is too small."); return false; }
    this.remember();
    const it = this.addCustomWorld([c], "Spline");
    markCurveHandles(it, c, pts);
    this.pick([it.id]); this.tool = null; this.drawPts = [];
    this.commit(); this.onSelect(); this.draw();
    this.onMessage(closed ? "Closed curve added, fitted to editable arcs." : "Curve added, fitted to editable arcs.");
    return true;
  }

  addPointsContour(text, mode, closed) {
    const parsed = parsePointList(text, mode);
    if (!parsed.ok) { this.onMessage(parsed.reason); return false; }
    const c = splineToContour(parsed.pts, !!closed);
    if (!c || c.pts.length < 2) { this.onMessage("That list did not make a curve."); return false; }
    this.remember();
    const it = this.addCustomWorld([c], "Spline");
    markCurveHandles(it, c, parsed.pts);
    this.pick([it.id]); this.tool = null;
    this.commit(); this.onSelect(); this.draw();
    this.onMessage("Curve added from the point list.");
    return true;
  }

  _centreOfEdge(h) {
    if (Math.abs(h.bulge) > 1e-12) {
      const c = circleOfBulge(h.p, h.q, h.bulge);
      return c ? { cx: c.cx, cy: c.cy, r: c.r, kind: "arc", h } : null;
    }
    // A true circle item
    const cs = this.worldCs(h.it);
    const loop = cs[h.ci];
    if (loop && loop.circle) return { cx: loop.circle.cx, cy: loop.circle.cy, r: loop.circle.r, kind: "circle", h };
    return { kind: "line", h };
  }

  clickMakeRel(wx, wy) {
    const h = this.hitWorldEdge(wx, wy, Math.max(HIT_MM, this.view && this.view.ppm ? 10 / this.view.ppm : HIT_MM));
    if (!h) { this.onMessage("Click an edge."); return false; }
    if (!this.tanPick) {
      this.tanPick = this._centreOfEdge(h);
      if (!this.tanPick) { this.onMessage("Click an edge."); return false; }
      this.onMessage(this.tool === "makeconc" ? "Now click the circle or arc to move." : "Now click the edge to move.");
      this.draw();
      return true;
    }
    const first = this.tanPick;
    const second = this._centreOfEdge(h);
    if (!second) return false;
    if (second.h.it === first.h.it && second.h.ci === first.h.ci && second.h.ei === first.h.ei) {
      this.onMessage("Click a different edge.");
      return false;
    }
    if (!this.canMutate(second.h.it)) return false;
    this.remember();
    if (!this.ensureEditable(second.h.it, { noRemember: true })) { this.undo && this.undo(); return false; }
    // After convert, use current world of the second item and apply a translation
    let dx = 0, dy = 0;
    if (this.tool === "makeconc") {
      if (!(first.kind !== "line") || !(second.kind !== "line")) {
        this.onMessage("Make concentric needs two circles or arcs.");
        this.undo && this.undo();
        return false;
      }
      dx = first.cx - second.cx; dy = first.cy - second.cy;
    } else {
      // tangent
      const ok = this._moveTangent(first, second);
      if (!ok) { this.undo && this.undo(); return false; }
      this.tanPick = null; this.tool = null;
      this.commit(); this.onSelect(); this.draw();
      this.onMessage("Moved to sit tangent.");
      return true;
    }
    second.h.it.x = r1(second.h.it.x + dx);
    second.h.it.y = r1(second.h.it.y + dy);
    second.h.it._key = null;
    this.pick([second.h.it.id]);
    this.tanPick = null; this.tool = null;
    this.commit(); this.onSelect(); this.draw();
    this.onMessage("Moved to share the same centre.");
    return true;
  }

  _moveTangent(first, second) {
    // Move the second item so it becomes tangent to the first.
    const line = (o) => o.kind === "line";
    const circ = (o) => o.kind !== "line";
    let dx = 0, dy = 0;
    if (circ(first) && circ(second)) {
      const vx = second.cx - first.cx, vy = second.cy - first.cy;
      const d = Math.hypot(vx, vy) || 1;
      const ext = first.r + second.r;
      const inn = Math.abs(first.r - second.r);
      const want = Math.abs(d - inn) < Math.abs(d - ext) && inn > 1e-6 ? inn : ext;
      const ux = vx / d, uy = vy / d;
      const tx = first.cx + ux * want, ty = first.cy + uy * want;
      dx = tx - second.cx; dy = ty - second.cy;
    } else if (circ(first) && line(second)) {
      // move the line (the whole item) along its normal so distance(centre, line) = r
      const p = second.h.p, q = second.h.q;
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L;
      const dist = (first.cx - p[0]) * nx + (first.cy - p[1]) * ny;
      const delta = first.r - Math.abs(dist);
      const sgn = dist >= 0 ? 1 : -1;
      dx = nx * (first.r * sgn - dist);
      dy = ny * (first.r * sgn - dist);
    } else if (line(first) && circ(second)) {
      const p = first.h.p, q = first.h.q;
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L;
      const dist = (second.cx - p[0]) * nx + (second.cy - p[1]) * ny;
      const sgn = dist >= 0 ? 1 : -1;
      dx = nx * (second.r * sgn - dist);
      dy = ny * (second.r * sgn - dist);
    } else {
      this.onMessage("Make tangent needs a line and a circle, or two circles.");
      return false;
    }
    second.h.it.x = r1(second.h.it.x + dx);
    second.h.it.y = r1(second.h.it.y + dy);
    second.h.it._key = null;
    this.pick([second.h.it.id]);
    return true;
  }

  onCurveToolDown(wx, wy, sx, sy) {
    if (this.tool === "trim") return this.applyTrimAt(wx, wy);
    if (this.tool === "arc3") {
      this.drawPts = this.drawPts || [];
      this.drawPts.push([wx, wy]);
      if (this.drawPts.length >= 3) return this.finishArc3();
      this.onMessage(this.drawPts.length === 1 ? "Click the other end, then a point on the arc." : "Click a point the arc should pass through.");
      this.draw();
      return true;
    }
    if (this.tool === "arctan") return this.clickTanArc(wx, wy, sx, sy);
    if (this.tool === "spline") {
      this.drawPts = this.drawPts || [];
      const first = this.drawPts[0];
      if (first && this.drawPts.length >= 2 && Math.hypot(wx - first[0], wy - first[1]) <= 8) {
        return this.finishSpline(true);
      }
      this.drawPts.push([wx, wy]);
      this.draw();
      return true;
    }
    if (this.tool === "maketan" || this.tool === "makeconc") return this.clickMakeRel(wx, wy);
    return false;
  }
}

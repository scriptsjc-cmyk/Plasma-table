// Sketch: editing the corners and edges of a custom outline (length, angle, curve, add / delete / move a corner) and drawing its handles.
import { bbox, bulgeFromPoint, bulgeFromRadius, bulgeFromSagitta, bulgeMidpoint, bulgeRadius, expandContour, polysCross, selfIntersects, signedArea, splitBulge } from "../core/geom.js";
import { clampBulge, distToEdge, r1, wholeSet } from "./sketch-util.js";

export class EdgeMethods {
  isEditableCustom(it) { return !!(it && it.type === "custom" && this.canMutate(it) && it.shape && it.shape.cs && it.shape.cs.length); }
  normalizeEdgeSel() {
    const e = this.edgeSel;
    if (!e) return;
    const it = this.item(e.id);
    if (!this.isEditableCustom(it) || !this.isPicked(it)) { this.edgeSel = null; return; }
    const c = it.shape.cs[e.ci];
    if (!c || !c.pts || e.ei >= c.pts.length || (e.vi != null && e.vi >= c.pts.length)) this.edgeSel = null;
  }
  bakeCustom(it) {
    if (!this.isEditableCustom(it)) return;
    const cs = this.rawWorld(it);
    if (!cs.length) return;
    const b = bbox(cs);
    it.shape.cs = cs.map((c) => {
      const pts = c.pts.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]);
      const bulges = (c.bulges || []).slice();
      while (bulges.length < pts.length) bulges.push(0);
      return { pts, closed: c.closed !== false, bulges: bulges.slice(0, pts.length) };
    });
    it.p = { ...(it.p || {}), scale: 100 };
    it.rot = 0; it.fx = false; it.fy = false;
    it.x = r1(b[0]); it.y = r1(b[1]);
    it._key = null;
  }
  customWorld(it) { this.bakeCustom(it); return this.rawWorld(it); }
  edgeInfo() {
    this.normalizeEdgeSel();
    const e = this.edgeSel; if (!e) return null;
    const it = this.item(e.id); if (!it) return null;
    const world = this.customWorld(it);
    const c = world[e.ci]; if (!c) return null;
    const pts = c.pts, n = pts.length, closed = c.closed !== false;
    const i = e.ei, j = (i + 1) % n;
    const p = pts[i], q = pts[j];
    const bulge = Number((c.bulges || [])[i]) || 0;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const absAng = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
    let prevAng = null;
    if (n >= 3) {
      const prev = pts[(i - 1 + n) % n];
      prevAng = Math.atan2(p[1] - prev[1], p[0] - prev[0]) * 180 / Math.PI;
    }
    const rel = prevAng == null ? null : ((absAng - prevAng + 540) % 360) - 180;
    const radius = Math.abs(bulge) < 1e-9 ? null : bulgeRadius(p, q, bulge);
    return { it, ci: e.ci, ei: i, vi: e.vi, p, q, bulge, length: len, angle: absAng, prevAngle: prevAng, relAngle: rel, radius, closed, n, mid: bulgeMidpoint(p, q, bulge) };
  }
  // Keep the stored shape's lower-left corner at (0,0) WITHOUT moving anything on the table: unmoved corners
  // keep their world position (so "keep this end fixed" really is fixed, and dragging a corner left/down past the
  // old corner doesn't slide the whole part).
  _renorm(it) {
    const cs = it.shape.cs; if (!cs || !cs.length) return;
    const src = wholeSet(it.type) ? cs : [cs[0]];
    let x0 = Infinity, y0 = Infinity;
    for (const c of src) for (const q of c.pts) { if (q[0] < x0) x0 = q[0]; if (q[1] < y0) y0 = q[1]; }
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || (Math.abs(x0) < 1e-9 && Math.abs(y0) < 1e-9)) return;
    for (const c of cs) c.pts = c.pts.map((q) => [r1(q[0] - x0), r1(q[1] - y0)]);
    it.x = r1(it.x + x0); it.y = r1(it.y + y0); it._key = null;
  }
  // Is the edited outline still a valid closed shape? Returns a message, or null when fine.
  outlineProblem(it) {
    if (!it || !it.shape || !it.shape.cs) return null;
    const polys = [];
    for (const c of it.shape.cs) {
      const pts = c.pts, n = pts.length;
      for (const q of pts) {
        if (!Number.isFinite(q[0]) || !Number.isFinite(q[1]) || Math.abs(q[0] + it.x) > this.maxMm || Math.abs(q[1] + it.y) > this.maxMm) return "That would go further than the table.";
      }
      for (let i = 0; i < n; i++) {
        const q = pts[(i + 1) % n];
        if (Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) < 0.05) return "Two corners would land on the same spot.";
      }
      const e = expandContour({ pts, closed: true, bulges: c.bulges });
      if (e.pts.length < 3 || Math.abs(signedArea(e.pts)) < 0.01) return "That would flatten the outline.";
      if (selfIntersects(e.pts, 6000)) return "That would make the outline cross itself.";
      polys.push(e.pts);
    }
    for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
      if (polysCross(polys[i], polys[j], 6000)) return "That would make two outlines cross each other.";
    }
    return null;
  }
  _revertEdit(snap, fut, es) {
    this.past.pop(); this.future = fut;
    this.items = JSON.parse(snap);
    this.sel.ids = this.sel.ids.filter((id) => this.item(id));
    this.edgeSel = es ? { ...es } : null;
    this.normalizeEdgeSel();
    this.commit(); this.onSelect(); this.onEdgeChange && this.onEdgeChange();
  }
  // Run an edit on a drawn outline. If it would make the outline cross itself, flatten it or push it off the table
  // (and it wasn't already broken), the whole edit is undone and the reason is shown.
  _guarded(it, fn) {
    const snap = this.snapshot(), fut = this.future, es = this.edgeSel ? { ...this.edgeSel } : null;
    this.remember();
    this.bakeCustom(it);
    const wasBad = this.outlineProblem(it);
    const r = fn();
    if (r === false) { this.past.pop(); this.future = fut; return false; }
    this._renorm(it);
    const bad = wasBad ? null : this.outlineProblem(it);
    if (bad) { this._revertEdit(snap, fut, es); this.onMessage(bad + " Nothing was changed."); return false; }
    this.commit(); this.onSelect(); this.onEdgeChange && this.onEdgeChange();
    return true;
  }
  _withEdge(fn, msg) {
    const info = this.edgeInfo();
    if (!info) { if (msg) this.onMessage("Click an edge of a drawn outline first."); return false; }
    return this._guarded(info.it, () => fn(info.it, info));
  }
  // Move corner v of a closed outline to `to`. The edge leaving that corner (dir +1 = next, -1 = previous)
  // keeps its direction: its far corner slides along ITS neighbour's line to stay parallel. Without this,
  // lengthening one side of a squared-off part leaves the next side slanted.
  _moveKeeping(pts, v, to, dir) {
    const n = pts.length, from = pts[v].slice();
    const k = (v + dir + n) % n, l = (k + dir + n) % n;
    pts[v] = [r1(to[0]), r1(to[1])];
    if (n < 3 || k === v || l === v) return;
    const d2 = [pts[k][0] - from[0], pts[k][1] - from[1]];
    const d3 = [pts[l][0] - pts[k][0], pts[l][1] - pts[k][1]];
    const l2 = Math.hypot(d2[0], d2[1]), l3 = Math.hypot(d3[0], d3[1]);
    if (l2 < 1e-9 || l3 < 1e-9) return;
    const den = d2[0] * d3[1] - d2[1] * d3[0];
    if (Math.abs(den) < 0.05 * l2 * l3) return;                 // nearly parallel: nothing sensible to slide along
    const rx = pts[k][0] - to[0], ry = pts[k][1] - to[1];
    const s = (rx * d3[1] - ry * d3[0]) / den;                    // new k = to + s * d2
    const t = (rx * d2[1] - ry * d2[0]) / den;                    // ... = old k + t * d3
    if (!(s > 0.02) || !(t > -0.9) || !(t < 0.9)) return;        // would flip or overshoot: keep the plain move
    pts[k] = [r1(to[0] + s * d2[0]), r1(to[1] + s * d2[1])];
  }
  selectEdge(id, ci, ei, vi = null) {
    const it = this.item(id);
    if (!this.isEditableCustom(it)) return false;
    this.pick([it.id]);
    this.edgeSel = { id: it.id, ci, ei, vi };
    this.normalizeEdgeSel();
    this.draw();
    this.onSelect();
    this.onEdgeChange && this.onEdgeChange();
    return !!this.edgeSel;
  }
  setEdgeLength(len, fixed) {
    len = Number(len);
    if (!(len > 0.05)) { this.onMessage("Enter a length greater than 0."); return false; }
    if (len > this.maxMm) { this.onMessage("That edge would be longer than the table."); return false; }
    return this._withEdge((it, info) => {
      const c = it.shape.cs[info.ci], pts = c.pts, n = pts.length;
      const i = info.ei, j = (i + 1) % n;
      const a = pts[i], b = pts[j];
      const dx = b[0] - a[0], dy = b[1] - a[1], cur = Math.hypot(dx, dy) || 1e-9;
      const ux = dx / cur, uy = dy / cur;
      if (fixed !== "end") this._moveKeeping(pts, j, [a[0] + ux * len, a[1] + uy * len], 1);
      else this._moveKeeping(pts, i, [b[0] - ux * len, b[1] - uy * len], -1);
    });
  }
  squareUpEdge(mode) {
    return this._withEdge((it, info) => {
      const c = it.shape.cs[info.ci], pts = c.pts, n = pts.length;
      const i = info.ei, j = (i + 1) % n;
      const a = pts[i], b = pts[j];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      let ang = Math.atan2(dy, dx);
      if (mode === "prev" && n >= 3) {
        const prev = pts[(i - 1 + n) % n];
        const pa = Math.atan2(a[1] - prev[1], a[0] - prev[0]);
        // nearest perpendicular to previous
        const cand = [pa + Math.PI / 2, pa - Math.PI / 2];
        cand.sort((u, v) => Math.abs(Math.atan2(Math.sin(ang - u), Math.cos(ang - u))) - Math.abs(Math.atan2(Math.sin(ang - v), Math.cos(ang - v))));
        ang = cand[0];
      } else {
        const step = Math.PI / 2;
        ang = Math.round(ang / step) * step;
      }
      this._moveKeeping(pts, j, [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len], 1);
    });
  }
  setEdgeAngle(deg, relative) {
    deg = Number(deg);
    if (!Number.isFinite(deg)) { this.onMessage("Enter an angle in degrees."); return false; }
    return this._withEdge((it, info) => {
      const c = it.shape.cs[info.ci], pts = c.pts, n = pts.length;
      const i = info.ei, j = (i + 1) % n;
      const a = pts[i], b = pts[j];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let ang = deg * Math.PI / 180;
      if (relative && n >= 3) {
        const prev = pts[(i - 1 + n) % n];
        ang = Math.atan2(a[1] - prev[1], a[0] - prev[0]) + ang;
      }
      pts[j] = [r1(a[0] + Math.cos(ang) * len), r1(a[1] + Math.sin(ang) * len)];
    });
  }
  setEdgeCurve({ bulge, radius, sagitta } = {}) {
    return this._withEdge((it, info) => {
      const c = it.shape.cs[info.ci];
      const p = c.pts[info.ei], q = c.pts[(info.ei + 1) % c.pts.length];
      c.bulges = c.bulges || c.pts.map(() => 0);
      let b = 0;
      if (bulge != null && Number.isFinite(+bulge)) b = +bulge;
      else if (radius != null && Number(radius) > 0) {
        const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const r = Number(radius);
        if (r < chord / 2 - 1e-6) {
          this.onMessage("That radius is too small for this edge. It needs to be at least " + r1(chord / 2) + " mm (half the length).");
          return false;
        }
        b = bulgeFromRadius(p, q, r, true);
      }
      else if (sagitta != null && Number.isFinite(+sagitta)) b = bulgeFromSagitta(p, q, Number(sagitta));
      else b = 0.2;
      c.bulges[info.ei] = clampBulge(b);
    });
  }
  // True corner fillet: trim the two edges at the picked corner and insert an arc
  // of the given radius. (setEdgeCurve still bends a whole edge into an arc, which
  // cannot use a radius smaller than half that edge — so Fillet a corner of a long
  // L would wrongly refuse an 8 mm radius.)
  filletCorner(radius) {
    const r = Number(radius);
    if (!(r > 0)) { this.onMessage("Enter a radius."); return false; }
    const info = this.edgeInfo();
    if (!info) { this.onMessage("Click the corner you want to fillet, then Fillet."); return false; }
    return this._guarded(info.it, () => {
      const c = info.it.shape.cs[info.ci], pts = c.pts, n = pts.length;
      if (n < 3) return false;
      let vi = info.vi;
      if (vi == null) {
        this.onMessage("Click the corner you want to fillet, then Fillet.");
        return false;
      }
      const A = pts[(vi - 1 + n) % n], P = pts[vi], Q = pts[(vi + 1) % n];
      const bs = c.bulges || [];
      if (Math.abs(Number(bs[(vi - 1 + n) % n]) || 0) > 1e-6 || Math.abs(Number(bs[vi]) || 0) > 1e-6) {
        this.onMessage("Fillet needs two straight edges at the corner. Flatten a curve first, or pick another corner.");
        return false;
      }
      const v1 = [A[0] - P[0], A[1] - P[1]], v2 = [Q[0] - P[0], Q[1] - P[1]];
      const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
      if (l1 < 0.05 || l2 < 0.05) return false;
      const i1 = [v1[0] / l1, v1[1] / l1], i2 = [v2[0] / l2, v2[1] / l2];
      const ang = Math.acos(Math.max(-1, Math.min(1, i1[0] * i2[0] + i1[1] * i2[1])));
      if (!(ang > 1e-3) || ang > Math.PI - 1e-3) { this.onMessage("That corner is too flat or too sharp to fillet."); return false; }
      const d = r / Math.tan(ang / 2);
      if (!(d > 0.05) || d > l1 - 0.05 || d > l2 - 0.05) {
        const maxR = r1(Math.min(l1, l2) * Math.tan(ang / 2) - 0.05);
        this.onMessage("That radius is too big for this corner. Use " + Math.max(0.1, maxR).toFixed(1) + " mm or less.");
        return false;
      }
      const T1 = [P[0] + i1[0] * d, P[1] + i1[1] * d], T2 = [P[0] + i2[0] * d, P[1] + i2[1] * d];
      const left = (T2[0] - T1[0]) * (P[1] - T1[1]) - (T2[1] - T1[1]) * (P[0] - T1[0]) > 0;
      const b = bulgeFromRadius(T1, T2, r, left);
      if (!(Math.abs(b) > 1e-6)) { this.onMessage("That radius does not make a corner fillet."); return false; }
      c.pts[vi] = [r1(T1[0]), r1(T1[1])];
      c.pts.splice(vi + 1, 0, [r1(T2[0]), r1(T2[1])]);
      c.bulges = (c.bulges || []).slice();
      while (c.bulges.length < n) c.bulges.push(0);
      c.bulges.splice(vi + 1, 0, Number(c.bulges[vi]) || 0);
      c.bulges[vi] = clampBulge(b);
      this.edgeSel = { id: info.it.id, ci: info.ci, ei: vi, vi: null };
    });
  }
  straightenEdge() {
    return this._withEdge((it, info) => {
      const c = it.shape.cs[info.ci];
      c.bulges = c.bulges || c.pts.map(() => 0);
      c.bulges[info.ei] = 0;
    });
  }
  addVertexOnEdge(ci, ei, atWorld) {
    const it = this.selected();
    if (!this.isEditableCustom(it)) return false;
    return this._guarded(it, () => {
      const c = it.shape.cs[ci];
      if (!c) return false;
      const n = c.pts.length, i = ei, j = (i + 1) % n;
      const p = c.pts[i], q = c.pts[j];
      const bulge = Number((c.bulges || [])[i]) || 0;
      const near = atWorld ? [atWorld[0] - it.x, atWorld[1] - it.y] : null;
      // on an arc the new corner sits ON the arc and the two halves keep exactly the same curve
      const sp = splitBulge(p, q, bulge, near);
      const mid = [r1(sp.mid[0]), r1(sp.mid[1])];
      c.pts.splice(j, 0, mid);
      const bs = (c.bulges || []).slice();
      while (bs.length < n) bs.push(0);
      bs.splice(j, 0, sp.b2);
      bs[i] = sp.b1;
      c.bulges = bs;
      this.edgeSel = { id: it.id, ci, ei: i, vi: j };
    });
  }
  deleteVertex() {
    const e = this.edgeSel; if (!e || e.vi == null) { this.onMessage("Click a corner first."); return false; }
    const it = this.item(e.id); if (!this.isEditableCustom(it)) return false;
    const c0 = it.shape.cs[e.ci];
    if (!c0 || c0.pts.length <= 3) { this.onMessage("A closed outline needs at least three corners."); return false; }
    return this._guarded(it, () => {
      const c = it.shape.cs[e.ci];
      if (!c || c.pts.length <= 3) return false;
      const vi = e.vi;
      c.pts.splice(vi, 1);
      if (c.bulges) {
        c.bulges.splice(vi, 1);                                   // the deleted corner's outgoing edge goes with it
        if (c.bulges.length) c.bulges[(vi - 1 + c.bulges.length) % c.bulges.length] = 0;   // the edge that now joins its neighbours is straight
      }
      const ni = Math.min(vi, c.pts.length - 1);
      this.edgeSel = { id: it.id, ci: e.ci, ei: (ni - 1 + c.pts.length) % c.pts.length, vi: ni };
    });
  }
  moveVertex(ci, vi, x, y) {
    const it = this.selected();
    if (!this.isEditableCustom(it)) return;
    this.bakeCustom(it);
    const c = it.shape.cs[ci]; if (!c || !c.pts[vi]) return;
    const step = this.opts.snap || 0.1;
    const lx = Math.round((x - it.x) / step) * step;
    const ly = Math.round((y - it.y) / step) * step;
    c.pts[vi] = [r1(lx), r1(ly)];
    this._renorm(it);
    it._key = null;
  }
  moveBulge(ci, ei, x, y) {
    const it = this.selected();
    if (!this.isEditableCustom(it)) return;
    this.bakeCustom(it);
    const c = it.shape.cs[ci]; if (!c) return;
    const n = c.pts.length, p = c.pts[ei], q = c.pts[(ei + 1) % n];
    c.bulges = c.bulges || c.pts.map(() => 0);
    c.bulges[ei] = clampBulge(bulgeFromPoint(p, q, [x - it.x, y - it.y]));
    it._key = null;
  }
  hitCustomHandles(sx, sy, touch, onlySelected) {
    if (this.layout) return null;                 // the sheet layout only places parts: no corner / edge / curve handles
    const R = touch ? 22 : 12;
    const [wx, wy] = this.toWorld(sx, sy);
    const tol = R / (this.view && this.view.s ? this.view.s : 1);
    const list = onlySelected ? [this.selected()].filter(Boolean) : this.order().reverse();
    for (const it of list) {
      if (!this.isEditableCustom(it)) continue;
      const world = this.rawWorld(it);
      // vertices
      for (let ci = 0; ci < world.length; ci++) {
        const pts = world[ci].pts, n = pts.length;
        for (let i = 0; i < n; i++) {
          const [X, Y] = this.toScreen(pts[i][0], pts[i][1]);
          if (Math.hypot(sx - X, sy - Y) <= R) return { kind: "vertex", it, ci, vi: i, ei: i };
        }
      }
      // bulge handles
      for (let ci = 0; ci < world.length; ci++) {
        const pts = world[ci].pts, n = pts.length, closed = world[ci].closed !== false;
        const edges = closed ? n : n - 1;
        const bs = world[ci].bulges || [];
        for (let i = 0; i < edges; i++) {
          const b = Number(bs[i]) || 0;
          if (Math.abs(b) < 1e-9) continue;
          const mid = bulgeMidpoint(pts[i], pts[(i + 1) % n], b);
          const [X, Y] = this.toScreen(mid[0], mid[1]);
          if (Math.hypot(sx - X, sy - Y) <= R) return { kind: "bulge", it, ci, ei: i };
        }
      }
      // edges
      let best = null, bestD = tol;
      for (let ci = 0; ci < world.length; ci++) {
        const pts = world[ci].pts, n = pts.length, closed = world[ci].closed !== false;
        const edges = closed ? n : n - 1;
        const bs = world[ci].bulges || [];
        for (let i = 0; i < edges; i++) {
          const d = distToEdge(wx, wy, pts[i], pts[(i + 1) % n], bs[i]);
          if (d < bestD) { bestD = d; best = { kind: "edge", it, ci, ei: i }; }
        }
      }
      if (best) return best;
    }
    return null;
  }
  drawEdgeHandles(ctx, C, S) {
    const one = this.selected();
    if (this.layout) return;
    if (!this.isEditableCustom(one)) return;
    const world = this.rawWorld(one);
    const e = this.edgeSel && this.edgeSel.id === one.id ? this.edgeSel : null;
    for (let ci = 0; ci < world.length; ci++) {
      const pts = world[ci].pts, n = pts.length, closed = world[ci].closed !== false;
      const edges = closed ? n : n - 1;
      const bs = world[ci].bulges || [];
      if (e && e.ci === ci) {
        const i = e.ei, p = pts[i], q = pts[(i + 1) % n];
        if (p && q) {
          const b = Number(bs[i]) || 0;
          ctx.save();
          ctx.strokeStyle = C.sel; ctx.lineWidth = 3; ctx.setLineDash([]);
          ctx.beginPath();
          const [sx, sy] = S(p[0], p[1]);
          ctx.moveTo(sx, sy);
          if (Math.abs(b) > 1e-9) {
            const exp = expandContour({ pts: [p, q], closed: false, bulges: [b] });
            for (const pt of exp.pts.slice(1)) { const [x, y] = S(pt[0], pt[1]); ctx.lineTo(x, y); }
          } else {
            const [ex, ey] = S(q[0], q[1]); ctx.lineTo(ex, ey);
          }
          ctx.stroke();
          // live length label
          const mid = bulgeMidpoint(p, q, b);
          const [mx, my] = S(mid[0], mid[1]);
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          const extra = Math.abs(b) > 1e-9 ? ` · R ${r1(bulgeRadius(p, q, b))}` : "";
          const rec = this.tag(ctx, `${r1(len)} mm${extra}`, mx, my - 18, C.sel);
          this.dimHits.push({ ...rec, kind: "edge-len", it: one, label: "Edge length (mm)" });
          ctx.restore();
        }
      }
      // vertices
      for (let i = 0; i < n; i++) {
        const [X, Y] = S(pts[i][0], pts[i][1]);
        const on = e && e.ci === ci && e.vi === i;
        ctx.beginPath(); ctx.arc(X, Y, on ? 6 : 4.5, 0, 7);
        ctx.fillStyle = on ? C.sel : C.canvas;
        ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
        ctx.fill(); ctx.stroke();
      }
      // bulge mid handles
      for (let i = 0; i < edges; i++) {
        const b = Number(bs[i]) || 0;
        if (Math.abs(b) < 1e-9 && !(e && e.ci === ci && e.ei === i)) continue;
        if (Math.abs(b) < 1e-9) continue;
        const mid = bulgeMidpoint(pts[i], pts[(i + 1) % n], b);
        const [X, Y] = S(mid[0], mid[1]);
        ctx.beginPath(); ctx.rect(X - 4, Y - 4, 8, 8);
        ctx.fillStyle = C.canvas; ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
        ctx.fill(); ctx.stroke();
      }
    }
  }
}

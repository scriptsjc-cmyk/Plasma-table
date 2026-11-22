// Sketch: shape operations (offset, subtract, cut an outline, nest on the sheet) and finishing a drawn outline or etch line.
// Split from sketch-edit.js in r16; mixed into the Sketch in sketch.js like the other method groups.
import { cleanContour, mapC, r1, rot, TWO_POINT_HINT } from "./sketch-util.js";
import { assessOffset, bbox, bulgeMidpoint, differenceOutlines, offsetLoop, pointInPoly, polysCross, selfIntersects, signedArea } from "../core/geom.js";
import { fitContour } from "../core/arcs.js";
import { nestUnitsSync, turnAngles, ringsBox } from "../cut/nest.js";
import { clickVerb } from "../ui/laptop.js";
import { carryFeatures, cutterToFeature } from "./part-features.js";

export class ShapeOpsMethods {
  offsetBy(d, opts = {}) {
    const it = this.selected(); if (!it) { this.onMessage("Pick one part to offset."); return; }
    if (!this.canMutate(it)) return;
    d = Number(d); if (!Number.isFinite(d) || !d) return;
    if (Math.abs(d) > this.maxMm) { this.onMessage("That offset is bigger than the table."); return; }
    const keep = !!opts.keepOriginal, both = !!opts.bothSides;
    const dist = both ? Math.abs(d) : d;
    // Circles stay true circles via offsetLoop's circle branch (the result is a custom
    // outline with .circle, so G-code is still G2/G3). Do not keep type "disc"/"ring":
    // 04_pro_tools expects Offset to convert the part to an editable custom outline.
    const cs = this.contoursOf(it); if (!cs.length) return;
    const offOne = (c, amount) => offsetLoop(c.pts, amount, c);
    let outerRes, holeCs;
    if (both) {
      const outR = offOne(cs[0], dist), inR = offOne(cs[0], -dist);
      if (!outR.ok) { this.onMessage(outR.reason); return; }
      if (!inR.ok) { this.onMessage(inR.reason || "The inside of that band is too tight for this shape."); return; }
      outerRes = outR;
      holeCs = [{ pts: inR.pts, closed: true, circle: inR.circle }];
    } else {
      outerRes = offOne(cs[0], dist);
      if (!outerRes.ok) { this.onMessage(outerRes.reason); return; }
      holeCs = cs.slice(1).map((h) => {
        const r = offOne(h, -dist);
        return r.ok ? { pts: r.pts, closed: true, circle: r.circle } : null;
      }).filter(Boolean);
    }
    const reason = assessOffset(cs[0].pts, outerRes.pts, both ? dist : dist);
    if (reason) { this.onMessage(reason); return; }
    this.remember();
    const b = bbox([{ pts: outerRes.pts }, ...holeCs]);
    const local = (c) => {
      const m = mapC(c, ([x, y]) => [x - b[0], y - b[1]]);
      if (c.circle) m.circle = { cx: c.circle.cx - b[0], cy: c.circle.cy - b[1], r: c.circle.r };
      const f = fitContour(m);
      f.pts = f.pts.map(([x, y]) => [r1(x), r1(y)]);
      if (f.circle) f.circle = { cx: r1(f.circle.cx), cy: r1(f.circle.cy), r: r1(f.circle.r) };
      return f;
    };
    const outerC = local({ pts: outerRes.pts, closed: true, circle: outerRes.circle });
    const shape = { cs: [outerC, ...holeCs.map(local)] };
    if (keep) {
      const neu = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, fx: false, fy: false, holes: {}, shape };
      this.items.push(neu);
      this.pick([it.id, neu.id]);
    } else {
      it.type = "custom"; it.p = { scale: 100 }; it.rot = 0; it.fx = false; it.fy = false; it.holes = {};
      it.shape = shape;
      it.x = r1(b[0]); it.y = r1(b[1]);
      this.pick([it.id]);
    }
    this.commit(); this.onSelect();
  }
  subtract() {
    const list = this.picked();
    if (list.length < 2) { this.onMessage("Pick the part first, then Shift-click each shape to cut out of it."); return; }
    // First-picked shape is the host (Fusion-style target body); later picks are cutters.
    const host = list[0], cutters = list.slice(1);
    const outer = this.contoursOf(host)[0]; if (!outer) return;
    const circleOf = (c, it) => c.circle || (it.type === "disc" && it.p && it.p.d > 0 ? { cx: (this.boxOf(it)[0] + this.boxOf(it)[2]) / 2, cy: (this.boxOf(it)[1] + this.boxOf(it)[3]) / 2, r: it.p.d / 2 } : null);
    const inside = (pts, poly) => pts.every((p) => pointInPoly(p, poly)) && !polysCross(pts, poly);
    // r15 2.13: a cutter wholly inside the part becomes a Shape cut-out (or Hole) row and the part stays editable.
    // Only a cutter across the edge changes the outline; that makes an "Outline" part, its rows carried (never baked in).
    const rowable = !(host.type === "custom" && !host.shape) && !this.isHole(host);
    // each outermost closed loop of a cutter is one row (a bolt circle gives 4 Hole rows; a ring's inner loop falls out with the scrap)
    const loops = (ct) => { const cs = this.contoursOf(ct); return cs.length && cs.every((c) => c.closed !== false && !c.op) ? this.loopsOf(ct).outers : []; };
    const within = (ct) => { const ls = loops(ct); return ls.length > 0 && ls.every((c) => inside(c.pts, outer.pts)); };
    const inner = cutters.filter(within), edge = cutters.filter((c) => !within(c));
    const addRows = (to) => {
      to.feats = to.feats || []; let id = to.feats.reduce((m, f) => Math.max(m, f.id), 0);
      for (const ct of inner) for (const c of loops(ct)) { const f = cutterToFeature(this, to, c, circleOf(c, ct), ++id); if (f) to.feats.push(f); }
      to._key = undefined;
    };
    if (rowable && !edge.length) {
      this.remember();
      addRows(host);
      const drop = new Set(cutters);
      this.items = this.items.filter((i) => !drop.has(i));
      this.pick([host.id]); this.commit(); this.onSelect();
      this.onMessage(`Cut out. ${host.name || "The part"} stays editable: the cut-out is a row in its Features tab.`);
      return;
    }
    this.remember();
    const feats = host.feats; delete host.feats; host._key = undefined;   // the host's rows are carried over, not baked in
    let it;
    try { it = this.cutOutline(host, rowable ? edge : cutters, circleOf); }
    finally { if (feats) host.feats = feats; host._key = undefined; }
    if (!it) { this.onMessage("Those shapes don't overlap – move the cutter onto the part."); this.restore(this.past.pop()); return; }
    const drop = new Set(list);
    this.items = this.items.filter((i) => !drop.has(i));
    this.items.push(it);
    const carried = rowable && feats ? carryFeatures(this, [host], it) : [];
    if (carried.length) it.feats = carried;
    if (rowable && inner.length) addRows(it);
    this.pick([it.id]); this.commit(); this.onSelect();
    this.onMessage("Cut out. The new outline is one part; its holes and cut-outs are rows in the Features tab.");
  }
  // the outline left after cutting these shapes from the host (shapes inside a non-editable host are cut as holes)
  cutOutline(host, cutters, circleOf) {
    const outer = this.contoursOf(host)[0];
    let cur = { outer: outer.pts, holes: this.contoursOf(host).slice(1).map((h) => ({ pts: h.pts, circle: h.circle })) };
    const insidePoly = (pts, poly) => pts.every((p) => {
      // even-odd point in polygon
      let n = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (((a[1] > p[1]) !== (b[1] > p[1])) && (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0])) n++;
      }
      return n % 2 === 1;
    });
    for (const ct of cutters) {
      for (const c of this.contoursOf(ct)) {
        const circ = circleOf(c, ct);
        if (circ && insidePoly(c.pts, cur.outer)) {
          cur.holes = [...cur.holes, { pts: c.pts, circle: circ }];
          continue;
        }
        const r = differenceOutlines(cur.outer, c.pts);
        if (!r) return null;
        cur = { outer: r.outer, holes: [...(r.holes || []).map((h) => ({ pts: h, circle: null })), ...cur.holes] };
      }
    }
    const b = bbox([{ pts: cur.outer }]);
    const local = (ring) => {
      const pts = ring.pts || ring;
      const m = cleanContour({ pts: pts.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]), closed: true });
      if (ring.circle) m.circle = { cx: r1(ring.circle.cx - b[0]), cy: r1(ring.circle.cy - b[1]), r: r1(ring.circle.r) };
      return m;
    };
    return { id: this.nextId++, type: "custom", name: "Outline", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      shape: { cs: [local({ pts: cur.outer }), ...cur.holes.filter((h) => h && (h.pts || h).length >= 3).map(local)] } };
  }
  nest(gap, sheetW, sheetH, opts = {}) {
    if (!this.items.length) return;
    if (this.items.some((i) => i.lock)) { this.onMessage("Unlock locked parts before nesting."); return; }
    gap = Math.max(0, Number(gap) || 10);
    sheetW = Number(sheetW) || 0; sheetH = Number(sheetH) || 0;
    if (gap > this.maxMm || sheetW > this.maxMm * 4 || sheetH > this.maxMm * 4) { this.onMessage("Those nest sizes are bigger than the table."); return; }
    const parts = this.items.filter((it) => !this.isHole(it));
    const holes = this.items.filter((it) => this.isHole(it));
    if (!parts.length) return;
    this.remember();
    const origin = new Map();
    const units = [];
    for (const it of parts) {
      const hostHoles = holes.filter((h) => (this.hostPart(h) || this.hostOf(h)) === it);
      origin.set(it.id, { x: it.x, y: it.y, rot: it.rot || 0, holes: hostHoles.map((h) => ({ h, x: h.x, y: h.y, rot: h.rot || 0 })) });
      const rings = [];
      for (const c of this.contoursOf(it)) if (c.closed !== false && c.pts && c.pts.length >= 3) rings.push(c.pts);
      for (const h of hostHoles) {
        for (const c of this.contoursOf(h)) if (c.closed !== false && c.pts && c.pts.length >= 3) rings.push(c.pts);
      }
      if (!rings.length) continue;
      units.push({ id: it.id, rings, it, hostHoles });
    }
    const regionW = sheetW > 0 ? sheetW : Math.max(200, this.maxMm || 2600);
    const regionH = sheetH > 0 ? sheetH : Math.max(200, this.maxMm || 2600);
    const step = Number.isFinite(Number(opts.angles)) ? Number(opts.angles)
      : (opts.step != null ? Number(opts.step) : 90);
    const angles = turnAngles(step > 0 ? step : 0);
    const res = nestUnitsSync(units, { w: regionW, h: regionH }, { gap, angles, timeMs: opts.timeMs || 8000, refine: true, pockets: true });
    const byId = new Map((res.placements || []).map((p) => [p.id, p]));
    const placed = [];
    const leftover = [];
    for (const u of units) {
      const pl = byId.get(u.id);
      if (!pl || !pl.placed) { leftover.push(u); continue; }
      const it = u.it;
      const before = this.boxOf(it);
      const hostC = [(before[0] + before[2]) / 2, (before[1] + before[3]) / 2];
      const holeRel = u.hostHoles.map((ho) => {
        const hb = this.boxOf(ho);
        return { ho, rel: [(hb[0] + hb[2]) / 2 - hostC[0], (hb[1] + hb[3]) / 2 - hostC[1]] };
      });
      it.rot = (((it.rot || 0) + (pl.angle || 0)) % 360 + 360) % 360;
      const want = ringsBox(pl.rings);
      const got = this.boxOf(it);
      it.x = r1(it.x + (want[0] - got[0]));
      it.y = r1(it.y + (want[1] - got[1]));
      const after = this.boxOf(it);
      const newHostC = [(after[0] + after[2]) / 2, (after[1] + after[3]) / 2];
      for (const rec of holeRel) {
        const rel = rot(rec.rel, pl.angle || 0);
        rec.ho.rot = (((rec.ho.rot || 0) + (pl.angle || 0)) % 360 + 360) % 360;
        const nh = this.boxOf(rec.ho);
        const gotC = [(nh[0] + nh[2]) / 2, (nh[1] + nh[3]) / 2];
        const wantC = [newHostC[0] + rel[0], newHostC[1] + rel[1]];
        rec.ho.x = r1(rec.ho.x + (wantC[0] - gotC[0]));
        rec.ho.y = r1(rec.ho.y + (wantC[1] - gotC[1]));
      }
      placed.push(this.boxOf(it));
    }
    let usedW = 0, usedH = 0;
    for (const b of placed) { usedW = Math.max(usedW, b[2]); usedH = Math.max(usedH, b[3]); }
    let parkX = (sheetW > 0 ? sheetW : usedW) + Math.max(gap, 20), parkY = 0;
    for (const u of leftover) {
      const o = origin.get(u.it.id);
      if (o) {
        u.it.x = o.x; u.it.y = o.y; u.it.rot = o.rot;
        for (const rec of o.holes) { rec.h.x = rec.x; rec.h.y = rec.y; rec.h.rot = rec.rot; }
      }
      const pb = this.boxOf(u.it), h = pb[3] - pb[1];
      const dx = parkX - pb[0], dy = parkY - pb[1];
      u.it.x = r1(u.it.x + dx); u.it.y = r1(u.it.y + dy);
      for (const ho of u.hostHoles) { ho.x = r1(ho.x + dx); ho.y = r1(ho.y + dy); }
      parkY += h + gap;
    }
    this.commit(); this.onSelect();
    const n = units.length, k = placed.length;
    const turnNote = step > 0 ? " True-shape packing, parts may turn." : "";
    if (!sheetW) this.onMessage(`Packed in a ${r1(usedW)} × ${r1(usedH)} mm block, ${gap} mm gaps.${turnNote}`);
    else if (k === n) this.onMessage(`Arranged ${n} part${n === 1 ? "" : "s"} on a ${sheetW} × ${sheetH || "–"} mm sheet, ${gap} mm gaps.${turnNote}`);
    else if (k === 0) this.onMessage(`These parts will not fit on a ${sheetW} × ${sheetH || "–"} mm sheet. Nothing was arranged.`);
    else this.onMessage(`${k} of ${n} parts fitted on a ${sheetW} × ${sheetH || "–"} mm sheet. The rest would not fit.`);
  }

  // 90° bulge (DXF tan(sweep/4)); sign is chosen so the arc sits outside the points already placed.
  defaultDrawBulge(pts) {
    const MAG = Math.tan(Math.PI / 8);
    if (!pts || pts.length < 2) return MAG;
    const prev = pts.slice(0, -1);
    if (prev.length < 2) return MAG;
    let cx = 0, cy = 0;
    for (const q of prev) { cx += q[0]; cy += q[1]; }
    cx /= prev.length; cy /= prev.length;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const midP = bulgeMidpoint(a, b, MAG), midN = bulgeMidpoint(a, b, -MAG);
    const dP = (midP[0] - cx) ** 2 + (midP[1] - cy) ** 2;
    const dN = (midN[0] - cx) ** 2 + (midN[1] - cy) ** 2;
    return dP >= dN ? MAG : -MAG;
  }
  pushDrawPoint(px, py) {
    this.drawPts = this.drawPts || [];
    this.drawBulges = this.drawBulges || [];
    while (this.drawBulges.length < this.drawPts.length) this.drawBulges.push(0);
    this.drawPts.push([px, py]);
    this.drawBulges.push(0);
    if (this.drawPts.length >= 2 && this.drawArc) this.drawBulges[this.drawPts.length - 2] = this.defaultDrawBulge(this.drawPts);
  }
  popDrawPoint() {
    if (!this.drawPts || !this.drawPts.length) return;
    this.drawPts.pop();
    if (this.drawBulges && this.drawBulges.length) this.drawBulges.pop();
    else if (this.drawBulges) this.drawBulges.length = this.drawPts.length;
  }

  finishDraw() {
    if (this.drawPts.length < 3) { this.onMessage(this.drawPts.length === 2 ? TWO_POINT_HINT : clickVerb() + " at least three points, then Close."); return; }
    const pts = this.drawPts.map((p) => [r1(p[0]), r1(p[1])]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const srcB = (this.drawBulges || []).slice();
    const uniq = [], ub = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const bulge = Number(srcB[i]) || 0;
      if (!uniq.length || Math.hypot(p[0] - uniq[uniq.length - 1][0], p[1] - uniq[uniq.length - 1][1]) > 0.05) { uniq.push(p); ub.push(bulge); }
    }
    if (uniq.length >= 2 && Math.hypot(uniq[0][0] - uniq[uniq.length - 1][0], uniq[0][1] - uniq[uniq.length - 1][1]) < 0.05) { uniq.pop(); ub.pop(); }
    if (uniq.length < 3) { this.onMessage("That outline is too small or isn't a closed shape."); this.drawPts = []; this.drawBulges = []; this.drawArc = false; this.tool = null; this.draw(); return; }
    if (uniq.some((p) => Math.abs(p[0]) > this.maxMm || Math.abs(p[1]) > this.maxMm)) { this.onMessage("That outline goes further than the table."); return; }
    // Closing edge: if Arc is still on, curve the last-to-first segment (unless that edge already has a bulge).
    if (this.drawArc && uniq.length && Math.abs(ub[ub.length - 1] || 0) < 1e-9) ub[ub.length - 1] = this.defaultDrawBulge([...uniq, uniq[0]]);
    while (ub.length < uniq.length) ub.push(0);
    const crossed = selfIntersects(uniq);
    const area = Math.abs(signedArea(uniq));
    if (!crossed && !(area > 0.05)) { this.onMessage("That outline has no area – add more points, or draw a closed shape."); this.drawPts = []; this.drawBulges = []; this.drawArc = false; this.tool = null; this.draw(); return; }
    if (crossed) this.onMessage("That outline crosses itself – the cut check will flag it. Redraw it so the path doesn't cross.");
    const b = bbox([{ pts: uniq }]);
    this.remember();
    const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      name: "Outline",
      shape: { cs: [{ pts: uniq.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]), closed: true, bulges: ub.slice(0, uniq.length) }] } };
    this.items.push(it);
    this.pick([it.id]); this.tool = null; this.drawPts = []; this.drawBulges = []; this.drawArc = false;
    this.commit(); this.onSelect();
    if (this.isHole(it)) this.onMessage("That outline sits inside another part, so it will be cut as a hole.");
    else this.onMessage("Outline closed. Drag a corner to move it, or click an edge to type its length.");
    if (this.onDrawFinished) this.onDrawFinished();
  }
  finishOpenDraw() {
    if (!this.drawPts || this.drawPts.length < 2) { this.onMessage("Add at least two points, then Etch."); return; }
    const pts = this.drawPts.map((p) => [r1(p[0]), r1(p[1])]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const srcB = (this.drawBulges || []).slice();
    const uniq = [], ub = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const bulge = Number(srcB[i]) || 0;
      if (!uniq.length || Math.hypot(p[0] - uniq[uniq.length - 1][0], p[1] - uniq[uniq.length - 1][1]) > 0.05) { uniq.push(p); ub.push(bulge); }
    }
    if (uniq.length < 2) { this.onMessage("That etch line is too short."); this.drawPts = []; this.drawBulges = []; this.drawArc = false; this.drawEtch = false; this.tool = null; this.draw(); return; }
    if (uniq.some((p) => Math.abs(p[0]) > this.maxMm || Math.abs(p[1]) > this.maxMm)) { this.onMessage("That line goes further than the table."); return; }
    while (ub.length < uniq.length) ub.push(0);
    const b = bbox([{ pts: uniq }]);
    this.remember();
    const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      name: "Etch", op: "score",
      shape: { cs: [{ pts: uniq.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]), closed: false, op: "score", bulges: ub.slice(0, uniq.length) }] } };
    this.items.push(it);
    this.pick([it.id]); this.tool = null; this.drawPts = []; this.drawBulges = []; this.drawArc = false; this.drawEtch = false;
    this.commit(); this.onSelect();
    this.onMessage("Etch line added. It will be marked first, then the cuts. It will not cut through the sheet.");
    if (this.onDrawFinished) this.onDrawFinished();
  }
}

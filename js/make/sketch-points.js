// r15 Round 10 on the sketch: Edit points on any outline (10.1), the gap to the nearest part while dragging (10.2),
// copy along a path (10.3) and "as many as fit on the sheet" (10.5). All changes are undoable.
import { bbox } from "../core/geom.js";
import { clone, r1 } from "./sketch-util.js";
import { minGap } from "./partgap.js";
import { fitGrid } from "./arrayfit.js";
import { pointsAlongPath } from "./alongpath.js";
import { expandContour } from "../core/geom.js";
import { fitContour, ARC_FIT_TOL } from "../core/arcs.js";

export const GAP_RANGE_MM = 300;     // parts further than this from the dragged one are not measured

export class PointMethods {
  // 10.1: every point of the picked part gets a handle (smooth arc joins too); a library part becomes an editable outline
  startPointEdit() {
    const it = this.selected();
    if (!it) { this.onMessage("Pick one part first, then Edit points."); return false; }
    if (!this.canMutate(it)) return false;
    if (this.layout) { this.onMessage("Open the part to edit its points."); return false; }
    if (!this.isEditableCustom(it)) {
      const feats = it.feats;                        // feature rows are measured from the outline, which keeps its box: keep them as rows
      if (feats) delete it.feats;
      it._key = null;
      this.remember();
      const ok = this._toPointsOutline(it);
      if (feats) it.feats = feats;
      it._key = null;
      if (!ok) { this.undo(); return false; }
      this.commit();
    }
    this.pointEdit = it.id;
    this.pick([it.id]);
    this.draw(); this.onSelect();
    this.onMessage("Edit points: drag a point to move it · double-click an edge to add a point · click a point and press Delete to remove it · pick an edge to make it an arc or straight · Esc when done.");
    return true;
  }
  // the outline as few points as it really has: arcs are fitted BEFORE rounding to 0.1 mm (rounding first breaks the fit and
  // leaves dozens of points on a rounded corner) and a circle is four true quarter arcs
  _toPointsOutline(it) {
    const cs = this.contoursOf(it);
    if (!cs.length) { this.onMessage("That part has no outline to edit."); return false; }
    const b = bbox(cs), k = Math.tan(Math.PI / 8), R = (v) => r1(v);
    const out = cs.map((c) => {
      const extra = {};
      if (c.op === "score" || c.op === "mark") extra.op = c.op;
      if (c.role) extra.role = c.role;
      if (c.circle && c.circle.r > 0) {
        const cx = c.circle.cx - b[0], cy = c.circle.cy - b[1], r = c.circle.r;
        return { pts: [[R(cx + r), R(cy)], [R(cx), R(cy + r)], [R(cx - r), R(cy)], [R(cx), R(cy - r)]], closed: true, bulges: [k, k, k, k], ...extra };
      }
      const closed = c.closed !== false;
      const local = c.pts.map(([x, y]) => [x - b[0], y - b[1]]);
      const f = (c.bulges && c.bulges.some((v) => Math.abs(v) > 1e-9)) ? { pts: local, bulges: c.bulges.slice(0, local.length) } : fitContour({ pts: local, closed }, ARC_FIT_TOL);
      const bulges = (f.bulges || []).map((v) => Math.round(v * 1e6) / 1e6);
      while (bulges.length < f.pts.length) bulges.push(0);
      return { pts: f.pts.map(([x, y]) => [R(x), R(y)]), closed, bulges: bulges.slice(0, f.pts.length), ...extra };
    });
    it.type = "custom"; it.p = { scale: 100 }; it.rot = 0; it.fx = false; it.fy = false; it.holes = {};
    delete it.drill;
    it.shape = { cs: out };
    it.x = r1(b[0]); it.y = r1(b[1]); it._key = null;
    return true;
  }
  endPointEdit() {
    if (!this.pointEdit) return false;
    this.pointEdit = null;
    this.draw();
    return true;
  }
  // 10.1: the picked edge, straight <-> arc in one click
  toggleEdgeArc() {
    const info = this.edgeInfo();
    if (!info) { this.onMessage("Pick an edge first."); return false; }
    if (Math.abs(info.bulge) > 1e-9) return this.straightenEdge();
    return this.setEdgeCurve({ sagitta: Math.max(0.5, info.length * 0.15) });
  }

  // 10.2: nearest distance from the parts being dragged to any other part close by
  dragGap(moving) {
    const ids = new Set(moving.map((m) => (m.it ? m.it.id : m.id)));
    const mine = this.items.filter((i) => ids.has(i.id));
    for (const it of [...mine]) for (const h of this.ownedHoles ? this.ownedHoles(it) : []) if (!ids.has(h.id)) { ids.add(h.id); mine.push(h); }
    const a = mine.flatMap((i) => this.contoursOf(i));
    if (!a.length) return null;
    const mb = bbox(a);
    let best = null;
    for (const o of this.items) {
      if (ids.has(o.id) || (this.isHole && this.isHole(o))) continue;
      const ob = this.boxOf(o);
      if (!ob || Math.max(ob[0] - mb[2], mb[0] - ob[2], ob[1] - mb[3], mb[1] - ob[3]) > GAP_RANGE_MM) continue;
      const g = minGap(a, this.contoursOf(o), GAP_RANGE_MM);
      if (g && (!best || g.d < best.d)) best = { ...g, id: o.id };
    }
    return best;
  }

  // 10.5: copies of the picked part(s) a gap apart, as many as fit on the sheet (w × h, from 0,0)
  fillSheet(gap, sheetW, sheetH) {
    const list = this.picked(); if (!list.length) { this.onMessage("Pick a part first."); return 0; }
    if (list.some((i) => i.lock)) { this.onMessage("Unlock the part first."); return 0; }
    const box = this.pickedBox(), w = box[2] - box[0], h = box[3] - box[1];
    const f = fitGrid({ x0: box[0], y0: box[1], w, h, gap, sheetW, sheetH });
    if (f.n < 1) { this.onMessage("That part is bigger than the sheet."); return 0; }
    if (f.n === 1) { this.onMessage("Only one fits on the sheet."); return 1; }
    this.remember();
    const onlyHole = list.length === 1 && this.isHole(list[0]);
    const shift = [f.x0 - box[0], f.y0 - box[1]];
    const ids = [];
    const group = [];                                    // every item that moves: the picked parts and their own holes
    for (const src of list) { group.push(src); if (!onlyHole) for (const hh of this.ownedHoles(src)) if (!list.includes(hh) && !group.includes(hh)) group.push(hh); }
    const orig = group.map((g) => [g.x, g.y]);
    for (let j = 0; j < f.rows; j++) for (let i = 0; i < f.cols; i++) {
      const dx = shift[0] + i * (w + Number(gap)), dy = shift[1] + j * (h + Number(gap)), first = i === 0 && j === 0;
      group.forEach((g, k) => {
        const c = first ? g : { ...clone(g), id: this.nextId++, lock: false };
        c.x = r1(orig[k][0] + dx); c.y = r1(orig[k][1] + dy); c._key = null;
        if (!first) this.items.push(c);
        ids.push(c.id);
      });
    }
    this.pick(ids); this.ensureVisible(); this.commit(); this.onSelect();
    this.onMessage(`${f.n} on the sheet${f.limited ? " (stopped at the limit)" : ""}.`);
    return f.n;
  }

  // 10.3: n copies of the picked part(s) along the last-picked part's outline (or line); optionally turned to follow it
  copyAlongPath(n, { rotate = false } = {}) {
    const list = this.picked();
    if (list.length < 2) { this.onMessage("Pick the part to copy, then Shift-click the path (a line or outline) last."); return 0; }
    const path = this.item(this.sel.ids[this.sel.ids.length - 1]);
    const src = list.filter((i) => i !== path && !(this.ownedHoles(path) || []).includes(i));
    if (!src.length || src.some((i) => i.lock)) { this.onMessage(src.length ? "Unlock the part first." : "Pick a part to copy as well as the path."); return 0; }
    const raw = path.type === "custom" && path.shape ? this.rawWorld(path) : this.contoursOf(path), c = raw && raw.find((x) => x.pts && x.pts.length >= 2);
    if (!c) { this.onMessage("That path has no line to follow."); return 0; }
    const closed = c.closed !== false;
    const flat = expandContour({ pts: c.pts, closed, bulges: c.bulges || [] }).pts;
    const at = pointsAlongPath(flat, closed, Math.max(1, Math.min(200, Math.round(n || 0))));
    if (!at.length) { this.onMessage("That path is too short."); return 0; }
    this.remember();
    const b = bbox(src.flatMap((i) => this.contoursOf(i))), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const ids = [];
    for (const p of at) {
      for (const s of src) {
        const k = { ...clone(s), id: this.nextId++, lock: false };
        const sb = this.boxOf(s), sc = [(sb[0] + sb[2]) / 2 - cx, (sb[1] + sb[3]) / 2 - cy];
        let off = sc;
        if (rotate) {
          const a = (p.angle * Math.PI) / 180;
          off = [sc[0] * Math.cos(a) - sc[1] * Math.sin(a), sc[0] * Math.sin(a) + sc[1] * Math.cos(a)];
          k.rot = ((((s.rot || 0) + p.angle) % 360) + 360) % 360;
        }
        this.items.push(k); k._key = null;
        this._placeCentre(k, p.x + off[0], p.y + off[1]);
        ids.push(k.id);
        this._copyOwnedHoles && this._copyOwnedHoles(s, k, ids);
      }
    }
    this.pick(ids); this.ensureVisible(); this.commit(); this.onSelect();
    this.onMessage(`${at.length} cop${at.length === 1 ? "y" : "ies"} along the path. The originals are still where they were.`);
    return at.length;
  }
}

// Shape editor: build parts on a canvas with the mouse or a finger.
//  * click a shape to pick it, drag to move, drag a corner to resize, drag a hole to move it
//  * Shift/Ctrl-click or drag a box round shapes to pick several: move, copy, join, line up together
//  * Join merges touching shapes into one part (holes included), which can then be copied as a whole
//  * snap guides line shapes up with each other while you drag (hold Alt to move freely)
//  * scroll / pinch to zoom, drag with the right or middle button (or a finger, or Space) to pan
// The layout is kept in the browser so it's still there after a reload. Everything is undoable.
import { SHAPES, makeShape } from "./shapes.js";
import { pointInPoly, bbox, signedArea, unionOutlines, differenceOutlines, offsetPolygon } from "./geom.js";
import { variantsFor, variantKey } from "./variants.js";

const KEY = "plasma.sketch", KEY_OPTS = "plasma.sketch.opts";
const MIN = 2;                               // smallest size (mm)
const CUSTOM = {
  id: "custom", name: "Joined part", icon: "⬟", uniform: true,
  tip: "Shapes joined into one part. Its holes go with it. Resize it with the Size % box or a corner.",
  params: [["scale", "Size %", 100]],
};
const def = (type) => (type === "custom" ? CUSTOM : SHAPES.find((s) => s.id === type));
export const shapeDef = def;
const short = (it) => def(it.type).name.split(/ [/(]/)[0].replace(/ with .*/, "").toLowerCase();
const r1 = (v) => Math.round(v * 10) / 10;
const clone = (o) => JSON.parse(JSON.stringify(o));
function mapC(c, f) {
  const o = { ...c, pts: c.pts.map(f) };
  if (c.circle) { const [cx, cy] = f([c.circle.cx, c.circle.cy]); o.circle = { ...c.circle, cx, cy }; }
  return o;
}
const rot = ([x, y], deg) => {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};
const boxOverlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const unionBox = (bs) => bs.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);

export class Sketch {
  constructor(canvas, { onChange = () => {}, onSelect = () => {}, onMessage = () => {}, onDimTap = () => {} } = {}) {
    this.cv = canvas; this.onChange = onChange; this.onSelect = onSelect; this.onMessage = onMessage; this.onDimTap = onDimTap;
    this.items = []; this.nextId = 1; this.sel = { ids: [], hole: null };
    this.view = null; this.active = false;
    this.past = []; this.future = []; this.clip = null;
    this.drag = null; this.pointers = new Map(); this.label = null; this.guides = []; this.marks = [];
    this.dimHits = []; this.tool = null; this.drawPts = []; this.measure = null;
    this.opts = { snap: 1, guides: true, pro: false, pointSnap: true };
    try { Object.assign(this.opts, JSON.parse(localStorage.getItem(KEY_OPTS) || "{}")); } catch (e) { /* ignore */ }
    this.load();
    if (!this.items.length) { this.add("rect", true); this.sel = { ids: [], hole: null }; }
    this.past = [];
    this.bind();
  }

  // ---------------------------------------------------------------- model
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && Array.isArray(d.items)) {
        this.items = d.items.filter((it) => def(it.type));
        for (const it of this.items) { it.rot = it.rot || 0; it.holes = it.holes || {}; it.lock = !!it.lock; it.fy = !!it.fy; }
        this.nextId = Math.max(1, ...this.items.map((i) => i.id + 1));
      }
    } catch (e) { /* ignore */ }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ items: this.items })); } catch (e) { /* ignore */ } }
  saveOpts() { try { localStorage.setItem(KEY_OPTS, JSON.stringify(this.opts)); } catch (e) { /* ignore */ } }
  snapshot() { return JSON.stringify(this.items); }
  remember() { this.past.push(this.snapshot()); if (this.past.length > 150) this.past.shift(); this.future = []; }
  restore(json) {
    this.items = JSON.parse(json);
    this.sel.ids = this.sel.ids.filter((id) => this.item(id));
    if (this.sel.ids.length !== 1) this.sel.hole = null;
    this.commit(); this.onSelect();
  }
  undo() { if (this.past.length) { this.future.push(this.snapshot()); this.restore(this.past.pop()); } }
  redo() { if (this.future.length) { this.past.push(this.snapshot()); this.restore(this.future.pop()); } }
  commit() { this.save(); this.draw(); this.onChange(true); }

  item(id) { return this.items.find((i) => i.id === id); }
  picked() { return this.sel.ids.map((id) => this.item(id)).filter(Boolean); }
  selected() { return this.sel.ids.length === 1 ? this.item(this.sel.ids[0]) : null; }
  isPicked(it) { return this.sel.ids.includes(it.id); }
  pick(ids, hole = null) { this.sel = { ids: [...ids], hole: ids.length === 1 ? hole : null }; }

  baseContours(it) {
    if (it.type === "custom") {
      const k = (it.p.scale || 100) / 100;
      return it.shape.cs.map((c) => ({ ...mapC(c, ([x, y]) => [x * k, y * k]), circle: c.circle ? { cx: c.circle.cx * k, cy: c.circle.cy * k, r: c.circle.r * k } : undefined }));
    }
    return makeShape(it.type, it.p);
  }
  holeStart(it) { return def(it.type).multi ? Infinity : 1; }
  contoursOf(it) {
    const key = JSON.stringify([it.type, it.p, it.holes, it.rot, it.fx, it.fy, it.x, it.y, it.type === "custom" ? it.shape.cs.length : 0]);
    if (it._key === key) return it._cs;
    let cs;
    try { cs = this.baseContours(it); } catch (e) { cs = []; }
    cs = cs.filter((c) => c.pts.length >= 3);
    if (cs.length) {
      const hs = this.holeStart(it);
      cs = cs.map((c, i) => (i >= hs && it.holes && it.holes[i] ? mapC(c, ([x, y]) => [x + it.holes[i][0], y + it.holes[i][1]]) : c));
      if (it.fx) cs = cs.map((c) => { const m = mapC(c, ([x, y]) => [-x, y]); m.pts.reverse(); return m; });
      if (it.fy) cs = cs.map((c) => { const m = mapC(c, ([x, y]) => [x, -y]); m.pts.reverse(); return m; });
      if (it.rot) cs = cs.map((c) => mapC(c, (p) => rot(p, it.rot)));
      const b = def(it.type).multi ? bbox(cs) : bbox([cs[0]]);
      cs = cs.map((c) => mapC(c, ([x, y]) => [x - b[0] + it.x, y - b[1] + it.y]));
    }
    Object.defineProperty(it, "_cs", { value: cs, writable: true, enumerable: false, configurable: true });
    Object.defineProperty(it, "_key", { value: key, writable: true, enumerable: false, configurable: true });
    return cs;
  }
  boxOf(it) {
    const c = this.contoursOf(it);
    if (!c.length) return [it.x, it.y, it.x, it.y];
    return def(it.type).multi ? bbox(c) : bbox([c[0]]);
  }
  pickedBox() { return unionBox(this.picked().map((i) => this.boxOf(i))); }
  allBox() { const cs = this.items.flatMap((i) => this.contoursOf(i)); return cs.length ? bbox(cs) : [0, 0, 200, 120]; }
  allBoxExcept(skip) {
    const cs = this.items.filter((i) => !skip.includes(i)).flatMap((i) => this.contoursOf(i));
    return cs.length ? bbox(cs) : null;
  }
  // parts inside another part's outline are cut as holes
  isHole(it) {
    if (def(it.type).multi) return true;
    const c = this.contoursOf(it)[0];
    if (!c) return false;
    let n = 0;
    for (const o of this.items) {
      if (o === it) continue;
      for (const oc of this.contoursOf(o)) if (pointInPoly(c.pts[0], oc.pts)) n++;
    }
    return n % 2 === 1;
  }
  order() { return [...this.items].sort((a, b) => (this.isHole(a) ? 1 : 0) - (this.isHole(b) ? 1 : 0)); }
  hostOfBox(it, among) {
    const b = this.boxOf(it), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    return among.find((o) => this.contoursOf(o)[0] && pointInPoly(c, this.contoursOf(o)[0].pts)) || null;
  }
  hostOf(it) {
    const c = this.contoursOf(it)[0]; if (!c) return null;
    return this.items.find((o) => o !== it && !this.isHole(o) && this.contoursOf(o)[0] && pointInPoly(c.pts[0], this.contoursOf(o)[0].pts));
  }

  // ---------------------------------------------------------------- actions (all undoable)
  newItem(type) {
    const d = def(type), p = {};
    for (const [k, , v] of d.params) p[k] = v;
    return { id: this.nextId++, type, p, x: 0, y: 0, rot: 0, holes: {} };
  }
  add(type, quiet) {
    if (!def(type)) return;
    this.remember();
    const it = this.newItem(type);
    let host = this.selected();
    if (host && this.isHole(host)) host = this.hostOf(host) || (def(host.type).multi ? this.hostOfBox(host, this.items.filter((o) => !this.isHole(o))) : null);
    this.items.push(it);
    const b0 = this.boxOf(it), w = b0[2] - b0[0], h = b0[3] - b0[1];
    if (def(type).hole && host && !this.isHole(host)) {               // holes drop into the middle of the picked part
      const b = this.boxOf(host);
      it.x = Math.round((b[0] + b[2] - w) / 2); it.y = Math.round((b[1] + b[3] - h) / 2);
    } else {
      const b = this.allBoxExcept([it]);
      if (b) { it.x = Math.round(b[2] + 15); it.y = Math.round(b[1]); }
    }
    this.pick([it.id]);
    if (!quiet) { this.ensureVisible(); this.commit(); this.onSelect(); } else this.save();
  }
  remove() {
    const list = this.picked(); if (!list.length) return;
    this.remember();
    this.items = this.items.filter((i) => !list.includes(i));
    this.pick([]); this.commit(); this.onSelect();
  }
  // copies of everything picked, keeping their layout, placed beside them
  duplicate() { this.copy(); this.paste(true); }
  copy() {
    const list = this.picked(); if (!list.length) return false;
    this.clip = { items: clone(list), box: this.pickedBox() };
    return true;
  }
  paste(beside) {
    if (!this.clip) return;
    this.remember();
    const b = this.clip.box, w = b[2] - b[0];
    const all = this.allBox();
    // beside the originals if there's room on the table side, else to the right of everything
    const dx = beside ? Math.round(w + 15) : Math.round(all[2] + 15 - b[0]);
    const dy = 0;
    const ids = [];
    for (const src of this.clip.items) {
      const c = { ...clone(src), id: this.nextId++ };
      c.x += dx; c.y += dy;
      this.items.push(c); ids.push(c.id);
    }
    this.clip.box = [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
    this.pick(ids);
    this.ensureVisible(); this.commit(); this.onSelect();
  }
  pickAll() { this.pick(this.items.map((i) => i.id)); this.draw(); this.onSelect(); }
  // turn the picked shapes about their middle
  rotateBy(deg) {
    const list = this.picked(); if (!list.length) return;
    this.remember();
    const g = this.pickedBox(), gc = [(g[0] + g[2]) / 2, (g[1] + g[3]) / 2];
    for (const it of list) {
      const b = this.boxOf(it), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const nc = list.length > 1 ? (([x, y]) => [gc[0] + x, gc[1] + y])(rot([c[0] - gc[0], c[1] - gc[1]], deg)) : c;
      it.rot = (((it.rot || 0) + deg) % 360 + 360) % 360;
      const nb = this.boxOf(it), nw = nb[2] - nb[0], nh = nb[3] - nb[1];
      it.x = r1(nc[0] - nw / 2); it.y = r1(nc[1] - nh / 2);
    }
    this.commit(); this.onSelect();
  }
  setAngle(deg) {
    const it = this.selected(); if (!it || !Number.isFinite(deg)) return;
    this.remember();
    const b = this.boxOf(it), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    it.rot = ((deg % 360) + 360) % 360;
    const nb = this.boxOf(it);
    it.x = r1(c[0] - (nb[2] - nb[0]) / 2); it.y = r1(c[1] - (nb[3] - nb[1]) / 2);
    this.commit();
  }
  // mirror left-right about the middle of the picked shapes
  mirror() {
    const list = this.picked(); if (!list.length) return;
    this.remember();
    const g = this.pickedBox();
    for (const it of list) {
      const b = this.boxOf(it);
      it.fx = !it.fx; it.rot = ((360 - (it.rot || 0)) % 360);
      const nb = this.boxOf(it), w = nb[2] - nb[0];
      it.x = r1(g[0] + g[2] - b[2]); it.y = b[1];
      if (Math.abs(w - (b[2] - b[0])) > 0.01) it.x = r1(g[0] + g[2] - b[0] - w);
    }
    this.commit(); this.onSelect();
  }
  resetHoles() {
    const it = this.selected(); if (!it || !Object.keys(it.holes || {}).length) return;
    this.remember(); it.holes = {}; this.commit(); this.onSelect();
  }
  clear() {
    if (!this.items.length) return;
    this.remember(); this.items = []; this.pick([]); this.commit(); this.onSelect();
  }
  // line the picked shapes up with the biggest one of them
  align(how) {
    const list = this.picked(); if (list.length < 2) return;
    this.remember();
    const area = (b) => (b[2] - b[0]) * (b[3] - b[1]);
    const ref = list.reduce((a, b) => (area(this.boxOf(b)) > area(this.boxOf(a)) ? b : a));
    const R = this.boxOf(ref);
    for (const it of list) {
      if (it === ref) continue;
      const b = this.boxOf(it), w = b[2] - b[0], h = b[3] - b[1];
      const tx = { left: R[0], right: R[2] - w, centre: (R[0] + R[2] - w) / 2 }[how];
      const ty = { bottom: R[1], top: R[3] - h, middle: (R[1] + R[3] - h) / 2 }[how];
      if (tx !== undefined) it.x = r1(it.x + tx - b[0]);
      if (ty !== undefined) it.y = r1(it.y + ty - b[1]);
      if (how === "both") { it.x = r1(it.x + (R[0] + R[2] - w) / 2 - b[0]); it.y = r1(it.y + (R[1] + R[3] - h) / 2 - b[1]); }
    }
    this.commit(); this.onSelect();
  }
  // merge the picked shapes into one part; holes on them come too
  join() {
    const list = this.picked();
    if (list.length < 2) { this.onMessage("Pick two or more shapes to join (Shift-click, or drag a box round them)."); return; }
    const parts = list.filter((it) => !this.isHole(it) && !def(it.type).hole);
    const holeItems = list.filter((it) => !parts.includes(it));
    if (!parts.length) { this.onMessage("Those are all holes – pick the part they sit on too."); return; }
    const outers = parts.map((it) => this.contoursOf(it)[0].pts);
    const u = parts.length > 1 ? unionOutlines(outers) : { outer: outers[0], holes: [] };
    if (!u) { this.onMessage("Those shapes don't touch – move them so they overlap or touch, then join."); return; }
    // holes: gaps closed in by the join, holes on the parts (unless another part covers them),
    // and hole shapes sitting on the parts (picked or not)
    const onParts = this.items.filter((o) => !list.includes(o) && this.isHole(o) && parts.includes(this.hostOf(o) || (def(o.type).multi ? this.hostOfBox(o, parts) : null)));
    const swallowed = [...holeItems, ...onParts];
    const holes = u.holes.map((pts) => ({ pts, closed: true }));
    for (const p of parts) for (const h of this.contoursOf(p).slice(1)) {
      if (parts.some((q) => q !== p && pointInPoly(h.pts[0], this.contoursOf(q)[0].pts))) continue;
      holes.push(h);
    }
    const sits = (hi) => this.contoursOf(hi).every((c) => pointInPoly(c.pts[0], u.outer));
    const swallowedIn = swallowed.filter(sits);
    for (const hi of swallowedIn) holes.push(...this.contoursOf(hi));
    const kept = holes.filter((h) => pointInPoly(h.pts[0], u.outer));
    const b = bbox([{ pts: u.outer }]);
    const local = (c) => mapC(c, ([x, y]) => [r1(x - b[0] + 1e-9), r1(y - b[1] + 1e-9)]);
    this.remember();
    const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      shape: { cs: [local({ pts: u.outer, closed: true }), ...kept.map(local)] } };
    this.items = this.items.filter((i) => (!list.includes(i) || (holeItems.includes(i) && !swallowedIn.includes(i))) && !swallowedIn.includes(i));
    this.items.push(it);
    this.pick([it.id]);
    this.commit(); this.onSelect();
    this.onMessage(`Joined into one part${kept.length ? ` with ${kept.length} hole${kept.length > 1 ? "s" : ""}` : ""}. Copy it, resize it or turn it as one.`);
  }
  setSnap(v) { this.opts.snap = v; this.saveOpts(); }
  setGuides(on) { this.opts.guides = on; this.saveOpts(); }
  setPro(on) { this.opts.pro = !!on; this.saveOpts(); this.draw(); }
  setPointSnap(on) { this.opts.pointSnap = !!on; this.saveOpts(); }
  setTool(name) {
    this.tool = this.tool === name ? null : (name || null);
    this.drawPts = []; this.measure = null;
    this.cv.style.cursor = this.tool ? "crosshair" : "";
    this.draw();
  }

  // switch the selected part to a related version, keeping its size and place
  applyVariant(spec) {
    const it = this.selected(); if (!it || it.type === "custom") return;
    const d = def(spec.id); if (!d) return;
    const b = this.boxOf(it), W = Math.max(MIN, b[2] - b[0]), H = Math.max(MIN, b[3] - b[1]);
    this.remember();
    const p = {};
    for (const [k, , v] of d.params) p[k] = v;
    for (const k of Object.keys(it.p || {})) if (k in p) p[k] = it.p[k];
    Object.assign(p, spec.p || {});
    it.type = spec.id;
    it.p = d.fit ? d.fit(p, d.uniform ? Math.max(W, H) : W, H) : p;
    for (const k of Object.keys(it.p)) if (Number.isFinite(it.p[k])) it.p[k] = r1(it.p[k]);
    it.holes = {};
    const nb = this.boxOf(it);
    it.x = r1(it.x + b[0] - nb[0]); it.y = r1(it.y + b[1] - nb[1]);
    this.commit(); this.onSelect();
  }
  variants() { const it = this.selected(); return it && it.type !== "custom" ? variantsFor(it.type) : []; }
  currentVariantKey() {
    const it = this.selected(); if (!it) return "";
    for (const v of variantsFor(it.type)) {
      const ok = v.id === it.type && Object.entries(v.p || {}).every(([k, val]) => val == null || Math.abs((it.p[k] ?? 0) - val) < 0.05 || (k === "r" && (it.p.r || 0) > 0.5 && val > 0) || (k === "mid" && (it.p.mid || 0) > 0 && val > 0) || (k === "hole" && (it.p.hole || 0) > 0 && val > 0));
      if (v.id === it.type && (!v.p || !Object.keys(v.p).length)) return variantKey(v);
    }
    const exact = variantsFor(it.type).find((v) => v.id === it.type && Object.entries(v.p || {}).every(([k, val]) => Math.abs((Number(it.p[k]) || 0) - val) < 0.2));
    return exact ? variantKey(exact) : (it.type);
  }

  setWidth(v) { const it = this.selected(); if (!it || !(v > 0)) return; const b = this.boxOf(it); this.remember(); this.resizeTo(it, v, b[3] - b[1]); this.commit(); this.onSelect(); }
  setHeight(v) { const it = this.selected(); if (!it || !(v > 0)) return; const b = this.boxOf(it); this.remember(); this.resizeTo(it, b[2] - b[0], v); this.commit(); this.onSelect(); }
  setDiameter(v) { const it = this.selected(); if (!it || !(v > 0)) return; this.remember(); this.resizeTo(it, v, v); this.commit(); this.onSelect(); }
  setPos(axis, v) {
    const it = this.selected(); if (!it || !Number.isFinite(v)) return;
    this.remember();
    const b = this.boxOf(it);
    if (axis === "x") it.x = r1(it.x + v - b[0]);
    else it.y = r1(it.y + v - b[1]);
    this.commit(); this.onSelect();
  }
  setHoleOffset(axis, v) {
    const it = this.selected(); if (!it || !Number.isFinite(v)) return;
    let host = it, hc = null, cs = this.contoursOf(it);
    if (this.sel.hole != null && cs[this.sel.hole]) { hc = cs[this.sel.hole]; host = it; }
    else if (this.isHole(it)) { hc = cs[0]; host = this.hostOf(it); }
    if (!hc || !host) return;
    this.remember();
    const hb = this.boxOf(host), cb = bbox([hc]);
    const cx = (cb[0] + cb[2]) / 2, cy = (cb[1] + cb[3]) / 2;
    const nx = axis === "x" ? hb[0] + v : cx, ny = axis === "y" ? hb[1] + v : cy;
    if (this.isHole(it) && this.sel.hole == null) {
      it.x = r1(it.x + nx - cx); it.y = r1(it.y + ny - cy);
    } else if (this.sel.hole != null) {
      this.moveHole(it, this.sel.hole, nx - cx, ny - cy);
    }
    this.commit(); this.onSelect();
  }

  toggleLock() {
    const list = this.picked(); if (!list.length) return;
    this.remember();
    const on = !list.every((i) => i.lock);
    for (const it of list) it.lock = on;
    this.commit(); this.onSelect();
  }
  flipV() {
    const list = this.picked(); if (!list.length) return;
    this.remember();
    const g = this.pickedBox();
    for (const it of list) {
      const b = this.boxOf(it);
      it.fy = !it.fy; it.rot = ((360 - (it.rot || 0)) % 360);
      const nb = this.boxOf(it), h = nb[3] - nb[1];
      it.x = b[0]; it.y = r1(g[1] + g[3] - b[3]);
      if (Math.abs(h - (b[3] - b[1])) > 0.01) it.y = r1(g[1] + g[3] - b[1] - h);
    }
    this.commit(); this.onSelect();
  }
  distribute(axis) {
    const list = this.picked(); if (list.length < 3) { this.onMessage("Pick three or more shapes to space them evenly."); return; }
    this.remember();
    const i = axis === "x" ? 0 : 1;
    const sorted = [...list].sort((a, b) => this.boxOf(a)[i] - this.boxOf(b)[i]);
    const first = this.boxOf(sorted[0])[i], lastB = this.boxOf(sorted[sorted.length - 1]);
    const last = lastB[i];
    const span = last - first;
    for (let k = 1; k < sorted.length - 1; k++) {
      const t = first + (span * k) / (sorted.length - 1);
      const b = this.boxOf(sorted[k]);
      if (axis === "x") sorted[k].x = r1(sorted[k].x + t - b[0]);
      else sorted[k].y = r1(sorted[k].y + t - b[1]);
    }
    this.commit(); this.onSelect();
  }
  linearArray(n, gapX, gapY) {
    const list = this.picked(); if (!list.length) return;
    n = Math.max(2, Math.min(50, Math.round(n || 2)));
    gapX = Number(gapX); gapY = Number(gapY);
    if (!Number.isFinite(gapX)) gapX = 10; if (!Number.isFinite(gapY)) gapY = 0;
    const box = this.pickedBox();
    const dx = (box[2] - box[0]) + gapX, dy = (box[3] - box[1]) + gapY;
    this.remember();
    const ids = [...this.sel.ids];
    for (let k = 1; k < n; k++) {
      for (const src of list) {
        const c = { ...clone(src), id: this.nextId++, lock: false };
        c.x = r1(src.x + k * dx); c.y = r1(src.y + k * dy);
        this.items.push(c); ids.push(c.id);
      }
    }
    this.pick(ids); this.ensureVisible(); this.commit(); this.onSelect();
  }
  polarArray(n, pcd) {
    const list = this.picked(); if (!list.length) return;
    n = Math.max(2, Math.min(36, Math.round(n || 4)));
    const box = this.pickedBox();
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    let R = Number(pcd) > 0 ? Number(pcd) / 2 : Math.max(box[2] - box[0], box[3] - box[1]) / 2 + 10;
    this.remember();
    const ids = [...this.sel.ids];
    const atCentre = list.length === 1 && Math.hypot((box[0] + box[2]) / 2 - cx, (box[1] + box[3]) / 2 - cy) < 0.05;
    if (atCentre) {
      const src = list[0], b = this.boxOf(src), scx = (b[0] + b[2]) / 2, scy = (b[1] + b[3]) / 2;
      src.x = r1(src.x + (cx + R) - scx); src.y = r1(src.y + cy - scy);
    }
    for (let k = 1; k < n; k++) {
      const a = (k / n) * 2 * Math.PI;
      for (const src of list) {
        const c = { ...clone(src), id: this.nextId++, lock: false };
        const b = this.boxOf(src), scx = (b[0] + b[2]) / 2, scy = (b[1] + b[3]) / 2;
        let dx = scx - cx, dy = scy - cy;
        if (Math.hypot(dx, dy) < 0.05) { dx = R; dy = 0; }
        const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
        c.x = r1(src.x + (cx + rx) - scx); c.y = r1(src.y + (cy + ry) - scy);
        c.rot = (((src.rot || 0) + (a * 180) / Math.PI) % 360 + 360) % 360;
        this.items.push(c); ids.push(c.id);
      }
    }
    this.pick(ids); this.ensureVisible(); this.commit(); this.onSelect();
  }
  offsetBy(d) {
    const it = this.selected(); if (!it) { this.onMessage("Pick one part to offset."); return; }
    d = Number(d); if (!Number.isFinite(d) || !d) return;
    const cs = this.contoursOf(it); if (!cs.length) return;
    this.remember();
    const outer = cs[0].pts, sa = signedArea(outer);
    const pts = sa < 0 ? [...outer].reverse() : outer;
    let off;
    try { off = offsetPolygon(pts, d); } catch (e) { this.onMessage("Couldn't offset that shape."); this.past.pop(); return; }
    if (!off || off.length < 3) { this.onMessage("Offset is too tight for this shape."); this.past.pop(); return; }
    const holes = cs.slice(1).map((h) => {
      const p = signedArea(h.pts) < 0 ? h.pts : [...h.pts].reverse();
      try { return { pts: offsetPolygon(p, -d), closed: true }; } catch (e) { return h; }
    }).filter((h) => h.pts && h.pts.length >= 3);
    const b = bbox([{ pts: off }]);
    const local = (c) => mapC(c, ([x, y]) => [r1(x - b[0]), r1(y - b[1])]);
    it.type = "custom"; it.p = { scale: 100 }; it.rot = 0; it.fx = false; it.fy = false; it.holes = {};
    it.shape = { cs: [local({ pts: off, closed: true }), ...holes.map(local)] };
    it.x = r1(b[0]); it.y = r1(b[1]);
    this.commit(); this.onSelect();
  }
  subtract() {
    const list = this.picked();
    if (list.length < 2) { this.onMessage("Pick the part, then the shape to cut out of it (Shift-click)."); return; }
    const area = (it) => { const b = this.boxOf(it); return (b[2] - b[0]) * (b[3] - b[1]); };
    const parts = [...list].sort((a, b) => area(b) - area(a));
    const host = parts[0], cutters = parts.slice(1);
    const outer = this.contoursOf(host)[0]; if (!outer) return;
    this.remember();
    let cur = { outer: outer.pts, holes: this.contoursOf(host).slice(1).map((h) => h.pts) };
    for (const ct of cutters) {
      for (const c of this.contoursOf(ct)) {
        const r = differenceOutlines(cur.outer, c.pts);
        if (!r) { this.onMessage("Those shapes don't overlap – move the cutter onto the part."); this.restore(this.past.pop()); return; }
        cur = { outer: r.outer, holes: [...(r.holes || []), ...cur.holes] };
      }
    }
    const b = bbox([{ pts: cur.outer }]);
    const local = (pts) => ({ pts: pts.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]), closed: true });
    const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      shape: { cs: [local(cur.outer), ...cur.holes.filter((h) => h && h.length >= 3).map(local)] } };
    const drop = new Set(list);
    this.items = this.items.filter((i) => !drop.has(i));
    this.items.push(it);
    this.pick([it.id]); this.commit(); this.onSelect();
    this.onMessage("Cut out. The result is one part you can copy or resize.");
  }
  nest(gap, sheetW, sheetH) {
    if (!this.items.length) return;
    gap = Math.max(0, Number(gap) || 10);
    sheetW = Number(sheetW) || 0; sheetH = Number(sheetH) || 0;
    const parts = this.items.filter((it) => !this.isHole(it));
    const holes = this.items.filter((it) => this.isHole(it));
    if (!parts.length) return;
    this.remember();
    const boxes = parts.map((it) => {
      const b = this.boxOf(it);
      return { it, w: b[2] - b[0], h: b[3] - b[1], hostHoles: holes.filter((h) => this.hostOf(h) === it || this.hostOfBox(h, [it])) };
    }).sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
    let x = 0, y = 0, rowH = 0, usedW = 0, usedH = 0;
    const maxW = sheetW > 0 ? sheetW : Infinity;
    for (const p of boxes) {
      let w = p.w, h = p.h, rot90 = false;
      if (sheetW > 0 && w > maxW && h <= maxW) { rot90 = true; [w, h] = [h, w]; }
      if (x > 0 && x + w > maxW) { x = 0; y += rowH + gap; rowH = 0; }
      if (rot90) p.it.rot = (((p.it.rot || 0) + 90) % 360);
      const nb = this.boxOf(p.it);
      const dx = x - nb[0], dy = y - nb[1];
      p.it.x = r1(p.it.x + dx); p.it.y = r1(p.it.y + dy);
      for (const h of p.hostHoles) { h.x = r1(h.x + dx); h.y = r1(h.y + dy); }
      x += w + gap; rowH = Math.max(rowH, h); usedW = Math.max(usedW, x - gap); usedH = Math.max(usedH, y + h);
    }
    this.commit(); this.onSelect();
    const msg = sheetW ? `Arranged on a ${sheetW} × ${sheetH || "–"} mm sheet.` : `Packed in a ${r1(usedW)} × ${r1(usedH)} mm block, ${gap} mm gaps.`;
    this.onMessage(msg);
  }
  finishDraw() {
    if (this.drawPts.length < 3) { this.onMessage("Tap at least three points, then Close."); return; }
    const pts = this.drawPts.map((p) => [r1(p[0]), r1(p[1])]);
    const b = bbox([{ pts }]);
    this.remember();
    const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      shape: { cs: [{ pts: pts.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]), closed: true }] } };
    this.items.push(it);
    this.pick([it.id]); this.tool = null; this.drawPts = [];
    this.commit(); this.onSelect();
  }
  hitDim(sx, sy, touch) {
    const pad = touch ? 14 : 6;
    let best = null, bestA = Infinity;
    for (const d of this.dimHits || []) {
      if (sx >= d.x - pad && sx <= d.x + d.w + pad && sy >= d.y - pad && sy <= d.y + d.h + pad) {
        const a = d.w * d.h;
        if (a < bestA) { best = d; bestA = a; }
      }
    }
    return best;
  }
  setParam(k, v) {
    const it = this.selected(); if (!it || !Number.isFinite(v)) return;
    it.p[k] = v; this.save(); this.draw();
  }
  nudge(dx, dy) {
    const list = this.picked(); if (!list.length) return;
    this.remember();
    if (this.sel.hole != null && list.length === 1) this.moveHole(list[0], this.sel.hole, dx, dy);
    else for (const it of list) { it.x = r1(it.x + dx); it.y = r1(it.y + dy); }
    this.commit(); this.onSelect();
  }
  moveHole(it, i, dx, dy) {          // dx, dy on screen -> the shape's own frame
    let [lx, ly] = rot([dx, dy], -(it.rot || 0));
    if (it.fx) lx = -lx;
    const h = (it.holes = it.holes || {});
    const o = h[i] || [0, 0];
    h[i] = [r1(o[0] + lx), r1(o[1] + ly)];
  }
  resizeTo(it, W, H) {
    const d = def(it.type);
    W = Math.max(MIN, W); H = Math.max(MIN, H);
    if (d.uniform) W = H = Math.max(W, H);
    const odd = (it.rot || 0) % 180 !== 0;
    if (it.type === "custom") {
      const b = this.boxOf(it), cw = (odd ? b[3] - b[1] : b[2] - b[0]) || 1;
      it.p.scale = r1(Math.max(1, (it.p.scale * (odd ? H : W)) / cw));
      return;
    }
    it.p = d.fit(it.p, odd ? H : W, odd ? W : H);
    for (const k of Object.keys(it.p)) it.p[k] = r1(it.p[k]);
  }
  canResize(it) { return it && !it.lock && (it.rot || 0) % 90 === 0 && !!(def(it.type).fit || it.type === "custom"); }

  contours() { return this.items.flatMap((i) => this.contoursOf(i)); }
  name() {
    if (this.items.length === 1) return def(this.items[0].type).name;
    return `Layout (${this.items.length} shapes)`;
  }
  // where the problems the cut check found are (drawn as numbered markers)
  setMarks(marks) { this.marks = marks || []; this.draw(); }

  // ---------------------------------------------------------------- view
  size() {
    const w = this.cv.clientWidth || 600;
    return [w, Math.round(Math.max(300, Math.min(640, w * 0.7, (window.innerHeight || 800) * 0.72)))];
  }
  fitView() {
    const [w, h] = this.size(), b = this.allBox();
    const bw = Math.max(40, b[2] - b[0]), bh = Math.max(40, b[3] - b[1]);
    const padX = 48, padTop = 52, padBot = 44;
    const s = Math.min((w - padX * 2) / bw, (h - padTop - padBot) / bh);
    // a little extra room at the top for the tappable size label
    this.view = { s, vx: (b[0] + b[2]) / 2 - w / 2 / s, vy: (b[1] + b[3]) / 2 - h / 2 / s + (padTop - padBot) / 2 / s };
    this.draw();
  }
  ensureVisible() {
    if (!this.view) return;
    const [w, h] = this.size(), b = this.pickedBox();
    if (!Number.isFinite(b[0])) return;
    const [x0, y0] = this.toScreen(b[0], b[3]), [x1, y1] = this.toScreen(b[2], b[1]);
    if (x0 < 10 || y0 < 10 || x1 > w - 10 || y1 > h - 10) this.fitView();
  }
  toScreen(x, y) { const [, h] = this.size(), v = this.view; return [(x - v.vx) * v.s, h - (y - v.vy) * v.s]; }
  toWorld(sx, sy) { const [, h] = this.size(), v = this.view; return [sx / v.s + v.vx, (h - sy) / v.s + v.vy]; }
  zoomAt(sx, sy, k) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.view.s = Math.max(0.05, Math.min(60, this.view.s * k));
    const [nx, ny] = this.toWorld(sx, sy);
    this.view.vx += wx - nx; this.view.vy += wy - ny;
    this.draw();
  }

  // ---------------------------------------------------------------- drawing
  setActive(on) {
    this.active = on;
    this.cv.classList.toggle("editing", on);
    const g = this.cv.closest(".cutgrid"); if (g) g.classList.toggle("editing", on);
    if (on) { if (!this.view) this.fitView(); else this.draw(); }
    else this.cv.style.cursor = "";
  }
  draw() {
    if (!this.active || !this.cv.offsetParent) return;
    const cv = this.cv, [w, h] = this.size(), dpr = window.devicePixelRatio || 1;
    if (!this.view) { this.view = { s: 1, vx: 0, vy: 0 }; this.fitView(); return; }
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.dimHits = [];
    const S = (x, y) => this.toScreen(x, y), s = this.view.s;

    // grid
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const g = steps.find((v) => v * s >= 12) || 1000, G = steps.find((v) => v >= g * 5) || g * 5;
    const [wx0, wy0] = this.toWorld(0, h), [wx1, wy1] = this.toWorld(w, 0);
    for (const [step, col] of [[g, "#18212b"], [G, "#243040"]]) {
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) { const X = Math.round(S(x, 0)[0]) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, h); }
      for (let y = Math.floor(wy0 / step) * step; y <= wy1; y += step) { const Y = Math.round(S(0, y)[1]) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(w, Y); }
      ctx.stroke();
    }
    ctx.fillStyle = "#4a5868"; ctx.font = "11px Barlow, system-ui";
    ctx.textAlign = "right"; ctx.fillText(`grid ${G} mm · snap ${this.opts.snap ? this.opts.snap + " mm" : "off"}`, w - 8, h - 8); ctx.textAlign = "start";

    const trace = (c) => { c.pts.forEach((p, i) => { const [X, Y] = S(p[0], p[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); };
    for (const it of this.order()) {
      const cs = this.contoursOf(it); if (!cs.length) continue;
      const hole = this.isHole(it), on = this.isPicked(it);
      ctx.beginPath(); cs.forEach(trace);
      ctx.fillStyle = hole ? "#121920" : on ? "#26385a" : "#2c3a49";
      ctx.fill(def(it.type).multi ? "nonzero" : "evenodd");
      ctx.setLineDash(hole ? [5, 4] : []);
      ctx.strokeStyle = it.lock ? "#e3a73c" : on ? "#7aa2f0" : hole ? "#94a2b0" : "#c9d1d9";
      ctx.lineWidth = on ? 2 : 1.5;
      ctx.stroke(); ctx.setLineDash([]);
      if (it.lock && on) {
        const bb = this.boxOf(it), [lx, ly] = S(bb[0], bb[3]);
        ctx.fillStyle = "#e3a73c"; ctx.font = "14px Barlow, system-ui"; ctx.fillText("🔒", lx + 4, ly + 16);
      }
      if (on && this.sel.hole != null && cs[this.sel.hole]) {
        ctx.beginPath(); trace(cs[this.sel.hole]); ctx.strokeStyle = "#e8c46a"; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }

    // guides while dragging
    if (this.guides.length) {
      ctx.strokeStyle = "#e3a73c"; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.beginPath();
      for (const gd of this.guides) {
        if (gd.x !== undefined) { const X = S(gd.x, 0)[0]; ctx.moveTo(X, 0); ctx.lineTo(X, h); }
        else { const Y = S(0, gd.y)[1]; ctx.moveTo(0, Y); ctx.lineTo(w, Y); }
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // selection: box, size, handles, hole dimensions
    const list = this.picked();
    if (list.length) {
      const b = this.pickedBox();
      const [x0, y0] = S(b[0], b[3]), [x1, y1] = S(b[2], b[1]);
      ctx.strokeStyle = "#4f7fe0"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1); ctx.setLineDash([]);
      const one = this.selected();
      if (one && this.canResize(one)) {
        for (const [hx, hy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
          ctx.fillStyle = "#fff"; ctx.strokeStyle = "#4f7fe0"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.rect(hx - 6, hy - 6, 12, 12); ctx.fill(); ctx.stroke();
        }
      }
      const round = one && def(one.type).uniform && !one.rot && Math.abs((b[2] - b[0]) - (b[3] - b[1])) < 0.05 && one.type !== "custom";
      if (list.length > 1) {
        this.tag(ctx, `${list.length} shapes · ${r1(b[2] - b[0])} × ${r1(b[3] - b[1])} mm`, (x0 + x1) / 2, Math.max(18, y0 - 20), "#4f7fe0");
      } else if (round) {
        const r = this.tag(ctx, `Ø ${r1(b[2] - b[0])} mm`, (x0 + x1) / 2, Math.max(18, y0 - 20), "#4f7fe0");
        this.dimHits.push({ ...r, kind: "d", it: one, label: "Diameter (mm)" });
      } else if (one) {
        const wr = this.tag(ctx, `${r1(b[2] - b[0])} mm`, (x0 + x1) / 2, Math.max(18, y0 - 20), "#4f7fe0");
        this.dimHits.push({ ...wr, kind: "w", it: one, label: "Width (mm)" });
        const hr = this.tag(ctx, `${r1(b[3] - b[1])} mm`, x1 + 36, (y0 + y1) / 2, "#4f7fe0");
        this.dimHits.push({ ...hr, kind: "h", it: one, label: "Height (mm)" });
      }
      if (one && this.opts.pro) {
        const xr = this.tag(ctx, `X ${r1(b[0])}`, x0, y1 + 20, "#2a3a2a");
        this.dimHits.push({ ...xr, kind: "x", it: one, label: "Left edge X (mm)" });
        const yr = this.tag(ctx, `Y ${r1(b[1])}`, x0 + 80, y1 + 20, "#2a3a2a");
        this.dimHits.push({ ...yr, kind: "y", it: one, label: "Bottom edge Y (mm)" });
      }
      // where's the hole? dimension lines from the part's corner
      if (one) {
        const cs = this.contoursOf(one);
        let hc = null, host = one;
        if (this.sel.hole != null && cs[this.sel.hole]) hc = cs[this.sel.hole];
        else if (this.isHole(one) && !def(one.type).multi) { hc = cs[0]; host = this.hostOf(one); }
        else if (def(one.type).multi) { host = this.hostOf(one); hc = host ? { pts: [[b[0], b[1]], [b[2], b[3]]] } : null; }
        if (hc && host) {
          const hb = this.boxOf(host), cb = bbox([hc]);
          const cx = (cb[0] + cb[2]) / 2, cy = (cb[1] + cb[3]) / 2;
          ctx.strokeStyle = "#e8c46a"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          const [px, py] = S(cx, cy), [lx] = S(hb[0], cy), [, by] = S(cx, hb[1]);
          ctx.beginPath(); ctx.moveTo(lx, py); ctx.lineTo(px, py); ctx.moveTo(px, by); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
          const hx = this.tag(ctx, `${r1(cx - hb[0])}`, (lx + px) / 2, py - 16, "#9a5a1e");
          this.dimHits.push({ ...hx, kind: "hx", it: one, label: "Hole from left (mm)" });
          const hy = this.tag(ctx, `${r1(cy - hb[1])}`, px + 28, (by + py) / 2, "#9a5a1e");
          this.dimHits.push({ ...hy, kind: "hy", it: one, label: "Hole from bottom (mm)" });
        }
      }
    }

    // cut check markers
    this.marks.forEach((m, i) => {
      const [X, Y] = S(m.at[0], m.at[1]);
      i = (m.n || i + 1) - 1;
      const col = m.level === "error" ? "#e0342b" : m.level === "warn" ? "#e3a73c" : "#4f7fe0";
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = "#121920"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = m.level === "warn" ? "#1d1406" : "#fff"; ctx.font = "bold 12px Barlow, system-ui"; ctx.textAlign = "center";
      ctx.fillText(String(i + 1), X, Y + 4); ctx.textAlign = "start";
    });

    // box select
    if (this.drag && this.drag.kind === "box") {
      const d = this.drag;
      ctx.fillStyle = "rgba(79,127,224,.12)"; ctx.strokeStyle = "#4f7fe0"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.fillRect(d.sx, d.sy, d.cx - d.sx, d.cy - d.sy); ctx.strokeRect(d.sx, d.sy, d.cx - d.sx, d.cy - d.sy); ctx.setLineDash([]);
    }
    if (this.label) this.tag(ctx, this.label.text, this.label.x, this.label.y - 28, "#0f151c");

    if (this.tool === "draw" && this.drawPts.length) {
      ctx.strokeStyle = "#e3a73c"; ctx.fillStyle = "#e3a73c"; ctx.lineWidth = 2;
      ctx.beginPath();
      this.drawPts.forEach((p, i) => { const [X, Y] = S(p[0], p[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
      for (const p of this.drawPts) { const [X, Y] = S(p[0], p[1]); ctx.beginPath(); ctx.arc(X, Y, 5, 0, 7); ctx.fill(); }
    }
    if (this.tool === "measure" && this.measure && this.measure.a) {
      const a = this.measure.a, b = this.measure.b || this.measure.hover;
      if (b) {
        const [ax, ay] = S(a[0], a[1]), [bx, by] = S(b[0], b[1]);
        ctx.strokeStyle = "#e8c46a"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
        this.tag(ctx, `${r1(Math.hypot(b[0] - a[0], b[1] - a[1]))} mm`, (ax + bx) / 2, (ay + by) / 2 - 16, "#9a5a1e");
      }
    }

    if (this.items.length) {
      const b = this.allBox();
      ctx.fillStyle = "#94a2b0"; ctx.font = "12px Barlow, system-ui";
      const tool = this.tool === "draw" ? " · DRAW: tap points, then Close" : this.tool === "measure" ? " · MEASURE: tap two points" : "";
      ctx.fillText(`${this.items.length} shape${this.items.length > 1 ? "s" : ""} · overall ${r1(b[2] - b[0])} × ${r1(b[3] - b[1])} mm${tool}`, 8, h - 8);
    } else {
      ctx.fillStyle = "#94a2b0"; ctx.font = "15px Barlow, system-ui"; ctx.textAlign = "center";
      ctx.fillText(this.tool === "draw" ? "Tap to place the first point of the outline" : "Tap a shape below to add it", w / 2, h / 2); ctx.textAlign = "start";
    }
  }
  tag(ctx, text, x, y, bg) {
    ctx.font = "600 14px Barlow, system-ui";
    const tw = Math.max(44, ctx.measureText(text).width + 16), th = 28, [w, h] = this.size();
    x = Math.max(tw / 2 + 2, Math.min(w - tw / 2 - 2, x));
    y = Math.max(th / 2 + 2, Math.min(h - th / 2 - 2, y));
    ctx.fillStyle = bg; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - tw / 2, y - th / 2, tw, th, 8); else ctx.rect(x - tw / 2, y - th / 2, tw, th);
    ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(text, x, y + 5); ctx.textAlign = "start";
    return { x: x - tw / 2, y: y - th / 2, w: tw, h: th };
  }

  // ---------------------------------------------------------------- hit testing
  hit(sx, sy, touch) {
    const one = this.selected(), R = touch ? 20 : 11;
    if (one && this.canResize(one)) {
      const b = this.boxOf(one);
      const corners = [[b[0], b[3], b[2], b[1]], [b[2], b[3], b[0], b[1]], [b[2], b[1], b[0], b[3]], [b[0], b[1], b[2], b[3]]];
      for (const [x, y, ax, ay] of corners) {
        const [X, Y] = this.toScreen(x, y);
        if (Math.abs(sx - X) <= R && Math.abs(sy - Y) <= R) return { kind: "resize", it: one, anchor: [ax, ay], corner: [x, y] };
      }
    }
    const [wx, wy] = this.toWorld(sx, sy);
    const list = this.order().reverse();
    for (const it of list) {
      const cs = this.contoursOf(it); if (!cs.length) continue;
      if (def(it.type).multi) { if (cs.some((c) => pointInPoly([wx, wy], c.pts))) return { kind: "move", it }; continue; }
      if (!pointInPoly([wx, wy], cs[0].pts)) continue;
      for (let i = 1; i < cs.length; i++) if (pointInPoly([wx, wy], cs[i].pts)) return { kind: "hole", it, hole: i };
      return { kind: "move", it };
    }
    const tol = R / this.view.s;         // near a thin part's edge
    for (const it of list) {
      const b = this.boxOf(it);
      if (wx > b[0] - tol && wx < b[2] + tol && wy > b[1] - tol && wy < b[3] + tol && (b[2] - b[0] < 3 * tol || b[3] - b[1] < 3 * tol)) return { kind: "move", it };
    }
    return null;
  }

  // snap the moving shapes' edges / middles to other shapes' edges / middles
  snapMove(dx, dy, moving, free) {
    this.guides = [];
    const step = this.opts.snap;
    if (step && !free) { dx = Math.round(dx / step) * step; dy = Math.round(dy / step) * step; }
    if ((!this.opts.guides && !(this.opts.pro && this.opts.pointSnap)) || free) return [dx, dy];
    const mb = unionBox(moving.map((m) => m.b0));
    const others = this.items.filter((i) => !moving.some((m) => m.it === i));
    if (!others.length) return [dx, dy];
    const oboxes = others.map((i) => this.boxOf(i));
    const tol = 7 / this.view.s;
    const xs = oboxes.flatMap((b) => [b[0], (b[0] + b[2]) / 2, b[2]]), ys = oboxes.flatMap((b) => [b[1], (b[1] + b[3]) / 2, b[3]]);
    const mx = [mb[0], (mb[0] + mb[2]) / 2, mb[2]], my = [mb[1], (mb[1] + mb[3]) / 2, mb[3]];
    if (this.opts.pro && this.opts.pointSnap) {
      for (const o of others) {
        const cs = this.contoursOf(o);
        for (const c of cs) {
          if (c.circle) { xs.push(c.circle.cx); ys.push(c.circle.cy); }
          for (let i = 0; i < c.pts.length; i++) {
            const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length];
            xs.push(a[0], (a[0] + b[0]) / 2); ys.push(a[1], (a[1] + b[1]) / 2);
          }
        }
      }
    }
    let best = null;
    for (const a of mx) for (const t of xs) { const d = t - (a + dx); if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, x: t }; }
    if (best) { dx += best.d; this.guides.push({ x: best.x }); }
    best = null;
    for (const a of my) for (const t of ys) { const d = t - (a + dy); if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, y: t }; }
    if (best) { dy += best.d; this.guides.push({ y: best.y }); }
    return [r1(dx), r1(dy)];
  }

  // ---------------------------------------------------------------- input
  bind() {
    const cv = this.cv;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener("contextmenu", (e) => { if (this.active) e.preventDefault(); });
    cv.addEventListener("pointerdown", (e) => {
      if (!this.active) return;
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      const [sx, sy] = pos(e);
      this.pointers.set(e.pointerId, [sx, sy]);
      if (this.pointers.size === 2) {                         // pinch zoom
        const [a, b] = [...this.pointers.values()];
        this.drag = { kind: "pinch", d: Math.hypot(a[0] - b[0], a[1] - b[1]), view: { ...this.view } };
        return;
      }
      if (this.pointers.size > 2) return;
      const touch = e.pointerType === "touch";
      const panBtn = e.button === 1 || e.button === 2 || this.spaceDown;
      const [wx, wy] = this.toWorld(sx, sy);
      if (this.tool === "draw" && !panBtn) {
        const step = this.opts.snap || 0.1;
        this.drawPts.push([Math.round(wx / step) * step, Math.round(wy / step) * step]);
        this.draw(); return;
      }
      if (this.tool === "measure" && !panBtn) {
        if (!this.measure || this.measure.b) this.measure = { a: [wx, wy] };
        else this.measure.b = [wx, wy];
        this.draw(); return;
      }
      const dim = panBtn ? null : this.hitDim(sx, sy, touch);
      if (dim) { this.drag = { kind: "dim", dim, sx, sy, moved: false }; return; }
      const h = panBtn ? null : this.hit(sx, sy, touch);
      if (!h) {
        if (touch || panBtn) this.drag = { kind: "pan", sx, sy, vx: this.view.vx, vy: this.view.vy, moved: false };
        else this.drag = { kind: "box", sx, sy, cx: sx, cy: sy, add: e.shiftKey || e.ctrlKey || e.metaKey, moved: false };
        return;
      }
      const before = this.snapshot(), it = h.it;
      const toggle = e.shiftKey || e.ctrlKey || e.metaKey;
      if (h.kind === "resize") { /* keep selection */ }
      else if (toggle) {
        const ids = this.isPicked(it) ? this.sel.ids.filter((id) => id !== it.id) : [...this.sel.ids, it.id];
        this.pick(ids); this.onSelect(); this.draw();
        if (!this.isPicked(it)) return;
      } else if (h.kind === "hole") this.pick([it.id], h.hole);
      else if (!this.isPicked(it)) this.pick([it.id]);
      else if (this.sel.ids.length === 1) this.sel.hole = null;
      if (h.kind !== "hole" && (h.kind === "resize" ? it.lock : this.picked().every((m) => m.lock))) {
        this.onSelect(); this.draw(); return;
      }
      const moving = (h.kind === "hole" || h.kind === "resize" ? [it] : this.picked()).map((m) => ({ it: m, x: m.x, y: m.y, b0: this.boxOf(m) }));
      this.drag = { ...h, before, wx, wy, moving, holes: clone(it.holes || {}), moved: false };
      this.onSelect();
      this.draw();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!this.active) return;
      const [sx, sy] = pos(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [sx, sy]);
      const d = this.drag;
      if (!d) {                                                 // hover cursor
        const h = this.spaceDown ? null : this.hit(sx, sy, false);
        cv.style.cursor = this.spaceDown ? "grab" : !h ? "crosshair" : h.kind === "resize" ? ((h.corner[0] < h.anchor[0]) === (h.corner[1] > h.anchor[1]) ? "nwse-resize" : "nesw-resize") : "move";
        return;
      }
      if (d.kind === "pinch") {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        this.view = { ...d.view };
        this.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(a[0] - b[0], a[1] - b[1]) / d.d);
        return;
      }
      if (d.kind === "dim") {
        if (Math.hypot(sx - d.sx, sy - d.sy) > 6) d.moved = true;
        return;
      }
      if (this.tool === "measure" && this.measure && !this.measure.b) {
        this.measure.hover = this.toWorld(sx, sy); this.draw(); 
      }
      if (d.kind === "pan") {
        if (Math.abs(sx - d.sx) + Math.abs(sy - d.sy) > 3) d.moved = true;
        this.view.vx = d.vx - (sx - d.sx) / this.view.s; this.view.vy = d.vy + (sy - d.sy) / this.view.s;
        cv.style.cursor = "grabbing";
        this.draw(); return;
      }
      if (d.kind === "box") {
        d.cx = sx; d.cy = sy;
        if (Math.abs(sx - d.sx) + Math.abs(sy - d.sy) > 4) d.moved = true;
        this.draw(); return;
      }
      const [wx, wy] = this.toWorld(sx, sy);
      const [sdx, sdy] = this.toScreen(d.wx, d.wy);
      if (!d.moved && Math.hypot(sx - sdx, sy - sdy) < 3) return;
      d.moved = true;
      const it = d.it, free = e.altKey;
      if (d.kind === "move") {
        const [dx, dy] = this.snapMove(wx - d.wx, wy - d.wy, d.moving, free);
        for (const m of d.moving) { m.it.x = r1(m.x + dx); m.it.y = r1(m.y + dy); }
        this.label = { text: `moved ${r1(dx)}, ${r1(dy)} mm`, x: sx, y: sy };
      } else if (d.kind === "hole") {
        const step = free ? 0.1 : this.opts.snap || 0.1;
        it.holes = clone(d.holes);
        this.moveHole(it, d.hole, Math.round((wx - d.wx) / step) * step, Math.round((wy - d.wy) / step) * step);
        this.label = null;
      } else if (d.kind === "resize") {
        const [ax, ay] = d.anchor, step = free ? 0.1 : this.opts.snap || 0.1;
        this.resizeTo(it, Math.round(Math.abs(wx - ax) / step) * step, Math.round(Math.abs(wy - ay) / step) * step);
        const b = this.boxOf(it), W = b[2] - b[0], H = b[3] - b[1];
        it.x = r1(it.x + (wx < ax ? ax - W : ax) - b[0]); it.y = r1(it.y + (wy < ay ? ay - H : ay) - b[1]);
        this.label = { text: `${r1(W)} × ${r1(H)} mm`, x: sx, y: sy };
      }
      this.draw();
      this.onChange(false);
    });
    const end = (e) => {
      if (!this.active) return;
      this.pointers.delete(e.pointerId);
      const d = this.drag;
      if (!d) return;
      if (d.kind === "pinch") { if (this.pointers.size === 0) this.drag = null; return; }
      this.drag = null; this.label = null; this.guides = [];
      if (d.kind === "dim") {
        if (!d.moved) this.onDimTap(d.dim);
        this.draw(); return;
      }
      if (d.kind === "pan") {
        if (!d.moved && this.sel.ids.length) { this.pick([]); this.onSelect(); }
        this.draw(); return;
      }
      if (d.kind === "box") {
        if (!d.moved) { if (this.sel.ids.length) { this.pick([]); this.onSelect(); } this.draw(); return; }
        const [ax, ay] = this.toWorld(Math.min(d.sx, d.cx), Math.max(d.sy, d.cy)), [bx, by] = this.toWorld(Math.max(d.sx, d.cx), Math.min(d.sy, d.cy));
        const box = [ax, ay, bx, by];
        const ids = this.items.filter((i) => boxOverlap(this.boxOf(i), box)).map((i) => i.id);
        this.pick(d.add ? [...new Set([...this.sel.ids, ...ids])] : ids);
        this.onSelect(); this.draw(); return;
      }
      if (d.moved) {
        this.past.push(d.before); this.future = [];
        this.commit();
        this.onSelect();
      } else this.draw();
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("wheel", (e) => {
      if (!this.active) return;
      e.preventDefault();
      const [sx, sy] = pos(e);
      this.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    cv.addEventListener("dblclick", (e) => {
      if (!this.active) return;
      const [sx, sy] = pos(e);
      if (!this.hit(sx, sy, false)) this.fitView();
    });
    window.addEventListener("keyup", (e) => { if (e.key === " ") { this.spaceDown = false; if (this.active) this.cv.style.cursor = ""; } });
    // keys win over the machine jog keys while the editor is on screen and nothing's being typed
    window.addEventListener("keydown", (e) => {
      if (!this.active || !this.cv.offsetParent) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === " ") { this.spaceDown = true; stop(); return; }
      if (ctrl && k === "z") { stop(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (ctrl && k === "y") { stop(); this.redo(); return; }
      if (ctrl && k === "a") { stop(); this.pickAll(); return; }
      if (ctrl && k === "c") { if (this.copy()) { stop(); this.onMessage("Copied – press Ctrl+V to paste."); } return; }
      if (ctrl && k === "v") { stop(); this.paste(false); return; }
      if (ctrl && k === "d") { stop(); this.duplicate(); return; }
      if (ctrl && k === "j") { stop(); this.join(); return; }
      const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key);
      if (!this.sel.ids.length) { if (isArrow) stop(); return; }
      if (e.key === "PageUp" || e.key === "PageDown") { stop(); return; }
      const st = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
      if (mv) { stop(); this.nudge(...mv); return; }
      if (e.key === "Delete" || e.key === "Backspace") { stop(); this.remove(); return; }
      if (k === "r") { stop(); this.rotateBy(e.shiftKey ? -90 : 90); return; }
      if (k === "m") { stop(); this.mirror(); return; }
      if (e.key === "Escape") { e.stopImmediatePropagation(); this.pick([]); this.onSelect(); this.draw(); }
    }, true);
  }
}

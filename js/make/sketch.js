// Shape editor: build parts on a canvas with the mouse or a finger.
//  * click a shape to pick it, drag to move, drag a corner to resize, drag a hole to move it
//  * Shift/Ctrl-click or drag a box round shapes to pick several: move, copy, join, line up together
//  * Join merges touching shapes into one part (holes included), which can then be copied as a whole
//  * snap guides line shapes up with each other while you drag (hold Alt to move freely)
//  * scroll / pinch to zoom, drag with the right or middle button (or a finger, or Space) to pan
// The layout is kept in the browser so it's still there after a reload. Everything is undoable.
import { KEY, KEY_OPTS, MAX_BULGE, MIN, clone, def, mixin, r1 } from "./sketch-util.js";
import { GeomMethods } from "./sketch-geom.js";
import { EditMethods } from "./sketch-edit.js";
import { ViewMethods } from "./sketch-view.js";
import { EdgeMethods } from "./sketch-edge.js";
import { InputMethods } from "./sketch-input.js";
import { installLayoutLock } from "./sketch-lock.js";
export { LAYOUT_LOCK_MSG } from "./sketch-lock.js";

export { shapeDef } from "./sketch-util.js";

export class Sketch {
  constructor(canvas, { onChange = () => {}, onSelect = () => {}, onMessage = () => {}, onDimTap = () => {}, onEdgeChange = () => {} } = {}) {
    this.cv = canvas; this.onChange = onChange; this.onSelect = onSelect; this.onMessage = onMessage; this.onDimTap = onDimTap; this.onEdgeChange = onEdgeChange;
    this.items = []; this.nextId = 1; this.sel = { ids: [], hole: null }; this.edgeSel = null;
    this.view = null; this.active = false;
    this.past = []; this.future = []; this.clip = null;
    this.drag = null; this.pointers = new Map(); this.label = null; this.guides = []; this.marks = [];
    this.dimHits = []; this.tool = null; this.drawPts = []; this.measure = null;
    this.opts = { snap: 1, guides: true, pro: false, pointSnap: true };
    this.maxMm = 2600; // 2× typical table travel; app may tighten from machine.json
    try {
      const saved = JSON.parse(localStorage.getItem(KEY_OPTS) || "{}") || {};
      if (typeof saved.snap === "number" && Number.isFinite(saved.snap) && saved.snap >= 0) this.opts.snap = saved.snap;
      if (typeof saved.guides === "boolean") this.opts.guides = saved.guides;
      if (typeof saved.pro === "boolean") this.opts.pro = saved.pro;
      if (typeof saved.pointSnap === "boolean") this.opts.pointSnap = saved.pointSnap;
    } catch (e) { /* ignore */ }
    this.load();
    this.sel = this.sel || { ids: [], hole: null };
    this.past = [];
    this.bind();
  }
  // ---------------------------------------------------------------- model
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && Array.isArray(d.items)) {
        this.items = d.items.map((it) => this.sanitizeItem(it)).filter(Boolean);
        this.nextId = Math.max(1, ...this.items.map((i) => i.id + 1), 1);
      }
    } catch (e) { this.items = []; }
  }
  sanitizeItem(it) {
    if (!it || !def(it.type)) return null;
    const d = def(it.type);
    const p = {};
    for (const [k, , defv] of d.params) {
      let v = Number(it.p && it.p[k]);
      if (!Number.isFinite(v)) v = defv;
      p[k] = v;
    }
    const max = this.maxMm || 2600;
    for (const k of Object.keys(p)) {
      if (["n", "cols", "rows", "scale"].includes(k)) continue;
      if (!Number.isFinite(p[k])) p[k] = 0;
    }
    // keep the item even if the size is out of range (it simply won't cut); drop only unplaceable ones
    if ("n" in p) p.n = Math.max(0, Math.min(64, Math.round(p.n)));
    if ("cols" in p) p.cols = Math.max(1, Math.min(50, Math.round(p.cols)));
    if ("rows" in p) p.rows = Math.max(1, Math.min(50, Math.round(p.rows)));
    const x = Number(it.x), y = Number(it.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > max * 2 || Math.abs(y) > max * 2) return null;
    const rot = Number(it.rot) || 0;
    const out = { id: Number(it.id) || 0, type: it.type, p, x, y, rot: Number.isFinite(rot) ? rot : 0, holes: {}, lock: !!it.lock, fy: !!it.fy, fx: !!it.fx };
    if (it.op === "score" || it.op === "mark") out.op = it.op;
    if (it.type === "custom") {
      const cs = it.shape && Array.isArray(it.shape.cs) ? it.shape.cs : null;
      if (!cs || !cs.length) return null;
      const ok = cs.every((c) => c && Array.isArray(c.pts) && c.pts.length >= 3 && c.pts.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]) && Math.abs(q[0]) <= max * 2 && Math.abs(q[1]) <= max * 2));
      if (!ok) return null;
      out.shape = { cs: cs.map((c) => {
        const pts = c.pts.map((q) => [Number(q[0]), Number(q[1])]);
        const bulges = Array.isArray(c.bulges) ? c.bulges.map((b) => (Number.isFinite(+b) ? Math.max(-MAX_BULGE, Math.min(MAX_BULGE, +b)) : 0)) : [];
        while (bulges.length < pts.length) bulges.push(0);
        return { pts, closed: c.closed !== false, bulges: bulges.slice(0, pts.length) };
      }) };
    }
    if (it.holes && typeof it.holes === "object") {
      for (const [k, v] of Object.entries(it.holes)) {
        if (Array.isArray(v) && v.length >= 2 && Number.isFinite(+v[0]) && Number.isFinite(+v[1])) out.holes[k] = [+v[0], +v[1]];
      }
    }
    return out;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ items: this.items })); } catch (e) { /* ignore */ } }
  saveOpts() { try { localStorage.setItem(KEY_OPTS, JSON.stringify(this.opts)); } catch (e) { /* ignore */ } }
  snapshot() { return JSON.stringify(this.items); }
  remember() { this.past.push(this.snapshot()); if (this.past.length > 150) { this.past.shift(); if (this.layoutBase) this.layoutBase--; } this.future = []; }
  restore(json) {
    this.items = JSON.parse(json);
    this.sel.ids = this.sel.ids.filter((id) => this.item(id));
    if (this.sel.ids.length !== 1) this.sel.hole = null;
    this.normalizeEdgeSel();
    this.commit(); this.onSelect(); this.onEdgeChange && this.onEdgeChange();
  }
  // In the sheet layout undo only takes back what was done there (moves, turns, nests), never a shape edit made earlier in Make a part.
  undo() {
    if (!this.past.length) return;
    if (this.layout) { if (this.past.length <= (this.layoutBase || 0)) { this.onMessage("Nothing to undo here. Shape edits are undone in Make a part."); return; } this._layUndone = (this._layUndone || 0) + 1; }
    this.future.push(this.snapshot()); this.restore(this.past.pop());
  }
  redo() {
    if (!this.future.length) return;
    if (this.layout) { if (!(this._layUndone > 0)) return; this._layUndone--; }
    this.past.push(this.snapshot()); this.restore(this.future.pop());
  }
  commit() { this.save(); this.draw(); this.onChange(true); }
  item(id) { return this.items.find((i) => i.id === id); }
  picked() { return this.sel.ids.map((id) => this.item(id)).filter(Boolean); }
  canMutate(it) { return !!(it && !it.lock); }
  selected() { return this.sel.ids.length === 1 ? this.item(this.sel.ids[0]) : null; }
  isPicked(it) { return this.sel.ids.includes(it.id); }
  pick(ids, hole = null) {
    if (this.layout && this._holes && this._holes.size) ids = [...new Set(ids.map((id) => { const o = this.item(id), h = o && this.holeOwner(o); return h ? h.id : id; }))];     // in the layout a part's own holes are never picked on their own
    this.sel = { ids: [...ids], hole: ids.length === 1 ? hole : null }; this.normalizeEdgeSel();
  }
  // ---------------------------------------------------------------- actions (all undoable)
  newItem(type, overrides) {
    const d = def(type), p = {};
    for (const [k, , v] of d.params) p[k] = v;
    if (overrides) for (const [k, v] of Object.entries(overrides)) if (k in p && Number.isFinite(Number(v))) p[k] = Number(v);
    return { id: this.nextId++, type, p, x: 0, y: 0, rot: 0, holes: {} };
  }
  add(type, quiet, overrides) {
    if (!def(type)) return;
    this.remember();
    const it = this.newItem(type, overrides);
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
  // an imported drawing turned into editable geometry (see editable.js): one custom part per outline, at its real place
  importParts(parts, replace = false) {
    if (!parts || !parts.length) return 0;
    this.remember();
    if (replace) { this.items = []; this.nextId = 1; this.edgeSel = null; }
    const made = parts.map(({ cs, x, y }) => {
      const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(x), y: r1(y), rot: 0, holes: {}, shape: { cs: cs.map((c) => ({ pts: c.pts.map((q) => [q[0], q[1]]), closed: c.closed !== false, bulges: (c.bulges || []).slice() })) } };
      this.items.push(it); return it;
    });
    this.pick([]); this.commit(); this.onSelect(); this.fitView();
    return made.length;
  }
  remove() {
    const list = this.picked().filter((i) => this.canMutate(i)); if (!list.length) return;
    this.remember();
    const gone = new Set([...list, ...list.flatMap((i) => this.ownedHoles(i))]);
    this.items = this.items.filter((i) => !gone.has(i));
    this.pick(this.sel.ids.filter((id) => this.item(id))); this.commit(); this.onSelect();
  }
  // copies of everything picked, keeping their layout, placed beside them
  duplicate() { this.copy(); this.paste(true); }
  copy() {
    const list = this.picked(); if (!list.length) return false;
    const box = this.pickedBox();
    this.clip = { items: clone([...list, ...list.flatMap((i) => this.ownedHoles(i)).filter((o) => !list.includes(o))]), box };
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
      if (this.layout && this._holes && this._holes.has(src.id)) this._holes.add(c.id);          // a copied part's hole stays that part's hole
    }
    this.clip.box = [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
    this.pick(ids);
    this.ensureVisible(); this.commit(); this.onSelect();
  }
  pickAll() { this.pick(this.items.map((i) => i.id)); this.draw(); this.onSelect(); }
  clear() {
    if (!this.items.length) return;
    if (this.items.some((i) => i.lock)) { this.onMessage("Unlock locked parts before clearing the drawing."); return; }
    this.remember(); this.items = []; this.pick([]); this.commit(); this.onSelect();
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
  setWidth(v) { const it = this.selected(); if (!this.canMutate(it) || !Number.isFinite(v) || v < MIN || v > this.maxMm) { if (this.canMutate(it) && Number.isFinite(v)) this.onMessage("Size must be between 2 mm and the table limit."); return; } const b = this.boxOf(it); this.remember(); this.resizeTo(it, v, b[3] - b[1]); this.commit(); this.onSelect(); }
  setHeight(v) { const it = this.selected(); if (!this.canMutate(it) || !Number.isFinite(v) || v < MIN || v > this.maxMm) { if (this.canMutate(it) && Number.isFinite(v)) this.onMessage("Size must be between 2 mm and the table limit."); return; } const b = this.boxOf(it); this.remember(); this.resizeTo(it, b[2] - b[0], v); this.commit(); this.onSelect(); }
  setDiameter(v) { const it = this.selected(); if (!this.canMutate(it) || !Number.isFinite(v) || v < MIN || v > this.maxMm) { if (this.canMutate(it) && Number.isFinite(v)) this.onMessage("Size must be between 2 mm and the table limit."); return; } this.remember(); this.resizeTo(it, v, v); this.commit(); this.onSelect(); }
  canResize(it) { return it && !this.layout && !it.lock && (it.rot || 0) % 90 === 0 && !(def(it.type) && def(it.type).noResize) && !!(def(it.type).fit || it.type === "custom"); }
  contours() { return this.items.filter((i) => !this.layerHidden(i)).flatMap((i) => this.contoursOf(i)); }
  // layers = the operation label of a shape (cut / score / mark). A hidden layer is neither drawn nor cut.
  layerHidden(it) { return !!(this.hiddenLayers && this.hiddenLayers.has(it.op || "cut")); }
  // how many separate parts are on the bed (holes don't count): the app sets partCounter so every screen uses the one count
  partTotal() { try { const n = this.partCounter ? this.partCounter(this) : NaN; return Number.isFinite(n) ? n : this.items.length; } catch (e) { return this.items.length; } }
  name() {
    if (this.items.length === 1) return def(this.items[0].type).name;
    const n = this.partTotal();
    return `Layout (${n} part${n === 1 ? "" : "s"})`;
  }
  // where the problems the cut check found are (drawn as numbered markers)
  setMarks(marks) { this.marks = marks || []; this.draw(); }
  // ---------------------------------------------------------------- view
  size() {
    const w = this.cv.clientWidth || 600;
    if (typeof document !== "undefined" && document.body && (document.body.classList.contains("short-land") || document.body.classList.contains("app-shell") || document.body.classList.contains("shape-fs"))) {
      // the canvas fills whatever the flex layout leaves it, so its own height IS the answer
      const h = this.cv.clientHeight || 0;
      return [w, Math.round(Math.max(120, h || ((window.innerHeight || 400) * 0.6)))];
    }
    return [w, Math.round(Math.max(260, Math.min(640, w * 0.7, (window.innerHeight || 800) * 0.62)))];
  }
  // ---------------------------------------------------------------- drawing
  setActive(on) {
    this.active = on;
    this.cv.classList.toggle("editing", on);
    const g = this.cv.closest(".cutgrid"); if (g) g.classList.toggle("editing", on);
    if (on) { if (!this.view) this.fitView(); else this.draw(); }
    else this.cv.style.cursor = "";
  }
}

mixin(Sketch, GeomMethods, EditMethods, ViewMethods, EdgeMethods, InputMethods);
installLayoutLock(Sketch);

// Shape editor: lay out parts on a canvas with the mouse or a finger.
//  * click a shape to select it, drag to move, drag a corner to resize
//  * drag a hole to move it; add a "Hole" with a part selected and it lands in the middle
//  * scroll / pinch to zoom, drag empty space to pan, double-click empty space to fit
//  * arrows nudge 1 mm (Shift = 10 mm), Delete removes, Ctrl+Z / Ctrl+Y undo / redo
// The layout is kept in the browser so it's still there after a reload.
import { SHAPES, makeShape } from "./shapes.js";
import { pointInPoly, bbox } from "./geom.js";

const KEY = "plasma.sketch";
const MIN = 2;                               // smallest size (mm)
const def = (type) => SHAPES.find((s) => s.id === type);
const short = (it) => def(it.type).name.split(/ [/(]/)[0].replace(/ with .*/, "").toLowerCase();
const snap = (v) => Math.round(v);           // 1 mm grid
const r1 = (v) => Math.round(v * 10) / 10;
const rotPt = ([x, y], r) => (r === 90 ? [-y, x] : r === 180 ? [-x, -y] : r === 270 ? [y, -x] : [x, y]);
function mapC(c, f) {
  const o = { ...c, pts: c.pts.map(f) };
  if (c.circle) { const [cx, cy] = f([c.circle.cx, c.circle.cy]); o.circle = { ...c.circle, cx, cy }; }
  return o;
}
function segCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 && d2 && d3 && d4;
}
function polysCross(P, Q) {
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    for (let j = 0; j < Q.length; j++) if (segCross(a, b, Q[j], Q[(j + 1) % Q.length])) return true;
  }
  return false;
}
const overlapBox = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

export class Sketch {
  constructor(canvas, { onChange = () => {}, onSelect = () => {} } = {}) {
    this.cv = canvas; this.onChange = onChange; this.onSelect = onSelect;
    this.items = []; this.nextId = 1; this.sel = null;          // sel = { id, hole: index | null }
    this.view = null; this.active = false;
    this.past = []; this.future = [];
    this.drag = null; this.pointers = new Map(); this.label = null;
    this.load();
    if (!this.items.length) this.add("rect", true);
    this.past = [];
    this.bind();
  }

  // ---------------------------------------------------------------- model
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && Array.isArray(d.items)) {
        this.items = d.items.filter((it) => def(it.type));
        this.nextId = Math.max(1, ...this.items.map((i) => i.id + 1));
      }
    } catch (e) { /* ignore */ }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ items: this.items })); } catch (e) { /* ignore */ } }
  snapshot() { return JSON.stringify(this.items); }
  remember() { this.past.push(this.snapshot()); if (this.past.length > 100) this.past.shift(); this.future = []; }
  restore(json) {
    this.items = JSON.parse(json);
    if (this.sel && !this.item(this.sel.id)) this.sel = null;
    this.commit(false); this.onSelect();
  }
  undo() { if (this.past.length) { this.future.push(this.snapshot()); this.restore(this.past.pop()); } }
  redo() { if (this.future.length) { this.past.push(this.snapshot()); this.restore(this.future.pop()); } }
  commit(rememberIt = true) { this.save(); this.draw(); this.onChange(true); if (rememberIt) { /* already remembered before the change */ } }

  item(id) { return this.items.find((i) => i.id === id); }
  selected() { return this.sel ? this.item(this.sel.id) : null; }

  contoursOf(it) {
    const key = JSON.stringify([it.type, it.p, it.holes, it.rot, it.x, it.y]);
    if (it._key === key) return it._cs;
    let cs;
    try { cs = makeShape(it.type, it.p); } catch (e) { cs = []; }
    cs = cs.filter((c) => c.pts.length >= 3);
    if (!cs.length) { it._key = key; it._cs = []; return []; }
    cs = cs.map((c, i) => (i > 0 && it.holes && it.holes[i] ? mapC(c, ([x, y]) => [x + it.holes[i][0], y + it.holes[i][1]]) : c));
    if (it.rot) cs = cs.map((c) => mapC(c, (p) => rotPt(p, it.rot)));
    const b = bbox([cs[0]]);
    cs = cs.map((c) => mapC(c, ([x, y]) => [x - b[0] + it.x, y - b[1] + it.y]));
    Object.defineProperty(it, "_cs", { value: cs, writable: true, enumerable: false, configurable: true });
    Object.defineProperty(it, "_key", { value: key, writable: true, enumerable: false, configurable: true });
    return cs;
  }
  boxOf(it) { const c = this.contoursOf(it); return c.length ? bbox([c[0]]) : [it.x, it.y, it.x, it.y]; }
  allBox() {
    const cs = this.items.flatMap((i) => this.contoursOf(i));
    return cs.length ? bbox(cs) : [0, 0, 200, 120];
  }
  // parts inside another part's outline are cut as holes
  isHole(it) {
    const c = this.contoursOf(it)[0];
    if (!c) return false;
    let n = 0;
    for (const o of this.items) {
      if (o === it) continue;
      for (const oc of this.contoursOf(o)) if (pointInPoly(c.pts[0], oc.pts)) n++;
    }
    return n % 2 === 1;
  }
  order() {   // draw / hit order: parts first, holes on top
    return [...this.items].sort((a, b) => (this.isHole(a) ? 1 : 0) - (this.isHole(b) ? 1 : 0));
  }

  // ---------------------------------------------------------------- actions (all undoable)
  add(type, quiet) {
    const d = def(type); if (!d) return;
    this.remember();
    const p = {}; for (const [k, , v] of d.params) p[k] = v;
    const it = { id: this.nextId++, type, p, x: 0, y: 0, rot: 0, holes: {} };
    const host = this.selected();
    this.items.push(it);
    const [, , w, h] = this.boxOf({ ...it, x: 0, y: 0 });
    if (type === "hole" && host && host.type !== "hole") {            // drop it in the middle of the selected part
      const b = this.boxOf(host);
      it.x = snap((b[0] + b[2] - w) / 2); it.y = snap((b[1] + b[3] - h) / 2);
    } else if (this.items.length > 1) {                                 // to the right of everything else
      const b = this.allBoxExcept(it);
      it.x = snap(b[2] + 15); it.y = snap(b[1]);
    }
    this.sel = { id: it.id, hole: null };
    if (!quiet) { this.ensureVisible(it); this.commit(); this.onSelect(); }
    else this.save();
  }
  allBoxExcept(skip) {
    const cs = this.items.filter((i) => i !== skip).flatMap((i) => this.contoursOf(i));
    return cs.length ? bbox(cs) : [0, 0, 0, 0];
  }
  remove() {
    const it = this.selected(); if (!it) return;
    this.remember();
    this.items = this.items.filter((i) => i !== it);
    this.sel = null; this.commit(); this.onSelect();
  }
  duplicate() {
    const it = this.selected(); if (!it) return;
    this.remember();
    const b = this.boxOf(it);
    const c = { ...JSON.parse(JSON.stringify(it)), id: this.nextId++ };
    c.x = snap(b[2] + 10); c.y = it.y;
    this.items.push(c);
    this.sel = { id: c.id, hole: null };
    this.ensureVisible(c); this.commit(); this.onSelect();
  }
  rotate() {
    const it = this.selected(); if (!it) return;
    this.remember();
    const b = this.boxOf(it), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    it.rot = ((it.rot || 0) + 90) % 360;
    const w = b[3] - b[1], h = b[2] - b[0];          // sides swap
    it.x = snap(cx - w / 2); it.y = snap(cy - h / 2);
    this.commit(); this.onSelect();
  }
  resetHoles() {
    const it = this.selected(); if (!it || !Object.keys(it.holes || {}).length) return;
    this.remember(); it.holes = {}; this.commit(); this.onSelect();
  }
  clear() {
    if (!this.items.length) return;
    this.remember(); this.items = []; this.sel = null; this.commit(); this.onSelect();
  }
  setParam(k, v, live) {
    const it = this.selected(); if (!it || !Number.isFinite(v)) return;
    if (!live) this.remember();
    it.p[k] = v; this.save(); this.draw(); this.onChange(!live);
  }
  setPos(x, y) {
    const it = this.selected(); if (!it) return;
    this.remember(); it.x = x; it.y = y; this.commit();
  }
  nudge(dx, dy) {
    const it = this.selected(); if (!it) return;
    this.remember();
    if (this.sel.hole != null) this.moveHole(it, this.sel.hole, dx, dy);
    else { it.x += dx; it.y += dy; }
    this.commit(); this.onSelect();
  }
  moveHole(it, i, dx, dy) {          // dx, dy on screen (world) -> shape's own frame
    const [lx, ly] = rotPt([dx, dy], (360 - (it.rot || 0)) % 360);
    const h = (it.holes = it.holes || {});
    const o = h[i] || [0, 0];
    h[i] = [r1(o[0] + lx), r1(o[1] + ly)];
  }
  resizeTo(it, W, H) {
    const d = def(it.type);
    W = Math.max(MIN, W); H = Math.max(MIN, H);
    if (d.uniform) W = H = Math.max(W, H);
    const odd = (it.rot || 0) % 180 !== 0;
    it.p = d.fit(it.p, odd ? H : W, odd ? W : H);
    for (const k of Object.keys(it.p)) it.p[k] = r1(it.p[k]);
  }

  // problems the cut would have
  problems() {
    const out = [];
    const list = this.items.map((it) => ({ it, cs: this.contoursOf(it) })).filter((x) => x.cs.length);
    for (const { it, cs } of list) {
      const outer = cs[0].pts;
      if (cs.slice(1).some((h) => h.pts.some((p) => !pointInPoly(p, outer))))
        out.push(`A hole on the ${short(it)} is over its edge – drag it back inside.`);
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j];
      if (!overlapBox(bbox([A.cs[0]]), bbox([B.cs[0]]))) continue;
      if (A.cs.some((a) => B.cs.some((b) => polysCross(a.pts, b.pts)))) {
        out.push(`The ${short(A.it)} and the ${short(B.it)} overlap – they'd be cut through each other. Move them apart (or fully inside to make a cut-out).`);
      }
    }
    return [...new Set(out)];
  }
  contours() { return this.items.flatMap((i) => this.contoursOf(i)); }
  name() {
    if (this.items.length === 1) return def(this.items[0].type).name;
    return `Layout (${this.items.length} shapes)`;
  }

  // ---------------------------------------------------------------- view
  size() {
    const w = this.cv.clientWidth || 600;
    return [w, Math.round(Math.max(300, Math.min(640, w * 0.7, (window.innerHeight || 800) * 0.72)))];
  }
  fitView() {
    const [w, h] = this.size(), b = this.allBox();
    const bw = Math.max(40, b[2] - b[0]), bh = Math.max(40, b[3] - b[1]);
    const s = Math.min((w - 70) / bw, (h - 80) / bh);
    this.view = { s, vx: (b[0] + b[2]) / 2 - w / 2 / s, vy: (b[1] + b[3]) / 2 - h / 2 / s };
    this.draw();
  }
  ensureVisible(it) {
    if (!this.view) return;
    const [w, h] = this.size(), b = this.boxOf(it);
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
    ctx.fillStyle = "#4a5868"; ctx.font = "11px system-ui";
    ctx.fillText(`grid ${G} mm`, w - 70, h - 8);

    const trace = (c) => { c.pts.forEach((p, i) => { const [X, Y] = S(p[0], p[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); };
    const sel = this.selected();
    for (const it of this.order()) {
      const cs = this.contoursOf(it); if (!cs.length) continue;
      const hole = this.isHole(it), isSel = it === sel;
      ctx.beginPath(); cs.forEach(trace);
      ctx.fillStyle = hole ? "#121920" : isSel ? "#26385a" : "#2c3a49";
      ctx.fill("evenodd");
      ctx.setLineDash(hole ? [5, 4] : []);
      ctx.strokeStyle = isSel ? "#7aa2f0" : hole ? "#94a2b0" : "#c9d1d9";
      ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.stroke(); ctx.setLineDash([]);
      if (isSel && this.sel.hole != null && cs[this.sel.hole]) {
        ctx.beginPath(); trace(cs[this.sel.hole]); ctx.strokeStyle = "#e8c46a"; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }

    // selection: size, handles, hole dimensions
    if (sel) {
      const cs = this.contoursOf(sel), b = this.boxOf(sel);
      const [x0, y0] = S(b[0], b[3]), [x1, y1] = S(b[2], b[1]);
      ctx.strokeStyle = "#4f7fe0"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1); ctx.setLineDash([]);
      for (const [hx, hy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#4f7fe0"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(hx - 6, hy - 6, 12, 12); ctx.fill(); ctx.stroke();
      }
      const txt = def(sel.type).uniform && !sel.rot && Math.abs((b[2] - b[0]) - (b[3] - b[1])) < 0.05 ? `Ø ${r1(b[2] - b[0])} mm` : `${r1(b[2] - b[0])} × ${r1(b[3] - b[1])} mm`;
      this.tag(ctx, txt, (x0 + x1) / 2, Math.max(14, y0 - 16), "#4f7fe0");
      // where's the hole? dimension lines from the part's corner
      let hc = null, host = sel;
      if (this.sel.hole != null && cs[this.sel.hole]) hc = cs[this.sel.hole];
      else if (this.isHole(sel)) { hc = cs[0]; host = this.hostOf(sel); }
      if (hc && host) {
        const hb = this.boxOf(host), cb = bbox([hc]);
        const cx = (cb[0] + cb[2]) / 2, cy = (cb[1] + cb[3]) / 2;
        ctx.strokeStyle = "#e8c46a"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        const [px, py] = S(cx, cy), [lx] = S(hb[0], cy), [, by] = S(cx, hb[1]);
        ctx.beginPath(); ctx.moveTo(lx, py); ctx.lineTo(px, py); ctx.moveTo(px, by); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
        this.tag(ctx, `${r1(cx - hb[0])}`, (lx + px) / 2, py - 12, "#9a5a1e");
        this.tag(ctx, `${r1(cy - hb[1])}`, px + 22, (by + py) / 2, "#9a5a1e");
      }
    }
    if (this.label) this.tag(ctx, this.label.text, this.label.x, this.label.y - 28, "#0f151c");

    // footer
    if (this.items.length) {
      const b = this.allBox();
      ctx.fillStyle = "#94a2b0"; ctx.font = "12px system-ui";
      ctx.fillText(`${this.items.length} shape${this.items.length > 1 ? "s" : ""} · overall ${r1(b[2] - b[0])} × ${r1(b[3] - b[1])} mm`, 8, h - 8);
    } else {
      ctx.fillStyle = "#94a2b0"; ctx.font = "15px system-ui"; ctx.textAlign = "center";
      ctx.fillText("Tap a shape below to add it", w / 2, h / 2); ctx.textAlign = "start";
    }
  }
  tag(ctx, text, x, y, bg) {
    ctx.font = "600 13px Barlow, system-ui";
    const tw = ctx.measureText(text).width + 12, [w] = this.size();
    x = Math.max(tw / 2 + 2, Math.min(w - tw / 2 - 2, x));
    ctx.fillStyle = bg; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - tw / 2, y - 10, tw, 20, 6); else ctx.rect(x - tw / 2, y - 10, tw, 20);
    ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(text, x, y + 4); ctx.textAlign = "start";
  }
  hostOf(it) {
    const c = this.contoursOf(it)[0];
    return this.items.find((o) => o !== it && this.contoursOf(o)[0] && pointInPoly(c.pts[0], this.contoursOf(o)[0].pts));
  }

  // ---------------------------------------------------------------- hit testing
  hit(sx, sy, touch) {
    const sel = this.selected(), R = touch ? 20 : 11;
    if (sel) {
      const b = this.boxOf(sel);
      const corners = [[b[0], b[3], b[2], b[1]], [b[2], b[3], b[0], b[1]], [b[2], b[1], b[0], b[3]], [b[0], b[1], b[2], b[3]]];
      for (const [x, y, ax, ay] of corners) {
        const [X, Y] = this.toScreen(x, y);
        if (Math.abs(sx - X) <= R && Math.abs(sy - Y) <= R) return { kind: "resize", it: sel, anchor: [ax, ay], corner: [x, y] };
      }
    }
    const [wx, wy] = this.toWorld(sx, sy);
    const list = this.order().reverse();
    for (const it of list) {
      const cs = this.contoursOf(it); if (!cs.length) continue;
      if (!pointInPoly([wx, wy], cs[0].pts)) continue;
      for (let i = 1; i < cs.length; i++) if (pointInPoly([wx, wy], cs[i].pts)) return { kind: "hole", it, hole: i };
      return { kind: "move", it };
    }
    // near an edge (thin parts / hole items on touch)
    const tol = R / this.view.s;
    for (const it of list) {
      const b = this.boxOf(it);
      if (wx > b[0] - tol && wx < b[2] + tol && wy > b[1] - tol && wy < b[3] + tol && (b[2] - b[0] < 3 * tol || b[3] - b[1] < 3 * tol)) return { kind: "move", it };
    }
    return null;
  }

  // ---------------------------------------------------------------- input
  bind() {
    const cv = this.cv;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
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
      const h = this.hit(sx, sy, e.pointerType === "touch");
      const [wx, wy] = this.toWorld(sx, sy);
      if (!h) {
        this.drag = { kind: "pan", sx, sy, vx: this.view.vx, vy: this.view.vy, moved: false };
        return;
      }
      const before = this.snapshot();
      const it = h.it;
      const selChanged = !this.sel || this.sel.id !== it.id || this.sel.hole !== (h.kind === "hole" ? h.hole : null);
      if (h.kind !== "resize") this.sel = { id: it.id, hole: h.kind === "hole" ? h.hole : null };
      this.drag = { ...h, before, wx, wy, x: it.x, y: it.y, holes: JSON.parse(JSON.stringify(it.holes || {})), moved: false };
      if (selChanged) this.onSelect();
      this.draw();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!this.active) return;
      const [sx, sy] = pos(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [sx, sy]);
      const d = this.drag;
      if (!d) {                                                 // hover cursor
        const h = this.hit(sx, sy, false);
        cv.style.cursor = !h ? "grab" : h.kind === "resize" ? ((h.corner[0] < h.anchor[0]) === (h.corner[1] > h.anchor[1]) ? "nwse-resize" : "nesw-resize") : "move";
        return;
      }
      if (d.kind === "pinch") {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.view = { ...d.view };
        this.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dist / d.d);
        return;
      }
      if (d.kind === "pan") {
        if (Math.abs(sx - d.sx) + Math.abs(sy - d.sy) > 3) d.moved = true;
        this.view.vx = d.vx - (sx - d.sx) / this.view.s; this.view.vy = d.vy + (sy - d.sy) / this.view.s;
        cv.style.cursor = "grabbing";
        this.draw(); return;
      }
      const [wx, wy] = this.toWorld(sx, sy), it = d.it;
      const dx = snap(wx - d.wx), dy = snap(wy - d.wy);
      if (!d.moved && Math.hypot(sx - this.toScreen(d.wx, d.wy)[0], sy - this.toScreen(d.wx, d.wy)[1]) < 3) return;
      d.moved = true;
      if (d.kind === "move") {
        it.x = d.x + dx; it.y = d.y + dy;
        this.label = { text: `moved ${dx}, ${dy} mm`, x: sx, y: sy };
      } else if (d.kind === "hole") {
        it.holes = JSON.parse(JSON.stringify(d.holes));
        this.moveHole(it, d.hole, dx, dy);
        this.label = null;
      } else if (d.kind === "resize") {
        const [ax, ay] = d.anchor;
        this.resizeTo(it, snap(Math.abs(wx - ax)), snap(Math.abs(wy - ay)));
        const b0 = this.boxOf({ ...it, x: 0, y: 0, _key: null });
        const W = b0[2] - b0[0], H = b0[3] - b0[1];
        it.x = r1(wx < ax ? ax - W : ax); it.y = r1(wy < ay ? ay - H : ay);
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
      this.drag = null; this.label = null;
      if (d.kind === "pan") {
        if (!d.moved && this.sel) { this.sel = null; this.onSelect(); }
        this.draw(); return;
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
    // keys win over the machine jog keys while the editor is on screen and nothing's being typed
    window.addEventListener("keydown", (e) => {
      if (!this.active || !this.cv.offsetParent) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.stopImmediatePropagation(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (ctrl && (e.key === "y" || e.key === "Y")) { e.preventDefault(); e.stopImmediatePropagation(); this.redo(); return; }
      if (ctrl && (e.key === "d" || e.key === "D")) { e.preventDefault(); e.stopImmediatePropagation(); this.duplicate(); return; }
      const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key);
      if (!this.selected()) { if (isArrow) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
      if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); e.stopImmediatePropagation(); return; }
      const st = e.shiftKey ? 10 : 1;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
      if (mv) { e.preventDefault(); e.stopImmediatePropagation(); this.nudge(...mv); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopImmediatePropagation(); this.remove(); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); e.stopImmediatePropagation(); this.rotate(); return; }
      if (e.key === "Escape") { e.stopImmediatePropagation(); this.sel = null; this.onSelect(); this.draw(); }
    }, true);
  }
}

// Sketch: mouse, touch and keyboard (picking, dragging, snapping guides, resize handles, pan and zoom).
import { boxOverlap, clone, r1, unionBox, wholeSet } from "./sketch-util.js";
import { pointInPoly } from "../core/geom.js";

export class InputMethods {
  hitDim(sx, sy, touch) {
    if (this.layout) return null;                 // no size / hole-position tags to tap in the sheet layout
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
  // ---------------------------------------------------------------- hit testing
  hit(sx, sy, touch) {
    const one = this.selected(), R = touch ? 20 : 11;
    const custom = this.hitCustomHandles(sx, sy, touch, true);
    if (custom) return custom;
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
      if (wholeSet(it.type)) { if (cs.some((c) => pointInPoly([wx, wy], c.pts))) return { kind: "move", it: this.holeOwner(it) || it }; continue; }
      if (!pointInPoly([wx, wy], cs[0].pts)) continue;
      if (!this.layout) for (let i = 1; i < cs.length; i++) if (pointInPoly([wx, wy], cs[i].pts)) return { kind: "hole", it, hole: i };
      return { kind: "move", it: this.holeOwner(it) || it };
    }
    const tol = R / this.view.s;         // near a thin part's edge
    for (const it of list) {
      const b = this.boxOf(it);
      if (wx > b[0] - tol && wx < b[2] + tol && wy > b[1] - tol && wy < b[3] + tol && (b[2] - b[0] < 3 * tol || b[3] - b[1] < 3 * tol)) return { kind: "move", it };
    }
    const loose = this.hitCustomHandles(sx, sy, touch, false);
    if (loose) return loose;
    return null;
  }
  // snap the moving shapes' edges / middles to other shapes' edges / middles
  snapMove(dx, dy, moving, free) {
    this.guides = [];
    const step = this.opts.snap;
    if (step && !free) {
      if (this.layout && moving.length) {          // sheet grid: the part's lower-left corner lands on a grid point
        const m0 = unionBox(moving.map((m) => m.b0));
        dx = Math.round((m0[0] + dx) / step) * step - m0[0]; dy = Math.round((m0[1] + dy) / step) * step - m0[1];
      } else { dx = Math.round(dx / step) * step; dy = Math.round(dy / step) * step; }
    }
    if ((!this.opts.guides && !this.layout && !(this.opts.pro && this.opts.pointSnap)) || free) return [dx, dy];
    const mb = unionBox(moving.map((m) => m.b0));
    const others = this.items.filter((i) => !moving.some((m) => m.it === i));
    if (!others.length && !this.layout) return [dx, dy];
    const oboxes = others.map((i) => this.boxOf(i));
    const tol = 7 / this.view.s;
    const xs = oboxes.flatMap((b) => [b[0], (b[0] + b[2]) / 2, b[2]]), ys = oboxes.flatMap((b) => [b[1], (b[1] + b[3]) / 2, b[3]]);
    const mx = [mb[0], (mb[0] + mb[2]) / 2, mb[2]], my = [mb[1], (mb[1] + mb[3]) / 2, mb[3]];
    // sheet edges and middle lines, and "just the minimum gap away" from another part's edge
    const gapX = [], gapY = [];
    if (this.layout) {
      const sh = this.layout.sheet, g = this.layout.gap || 0;
      xs.push(0, sh.w / 2, sh.w); ys.push(0, sh.h / 2, sh.h);
      for (const b of oboxes) { gapX.push([mb[0], b[2] + g], [mb[2], b[0] - g]); gapY.push([mb[1], b[3] + g], [mb[3], b[1] - g]); }
    }
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
    for (const [a, t] of gapX) { const d = t - (a + dx); if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, x: t }; }
    for (const a of mx) for (const t of xs) { const d = t - (a + dx); if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d) - 1e-9)) best = { d, x: t }; }
    if (best) { dx += best.d; this.guides.push({ x: best.x }); }
    best = null;
    for (const [a, t] of gapY) { const d = t - (a + dy); if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, y: t }; }
    for (const a of my) for (const t of ys) { const d = t - (a + dy); if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d) - 1e-9)) best = { d, y: t }; }
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
        const px = Math.round(wx / step) * step, py = Math.round(wy / step) * step;
        if (!Number.isFinite(px) || !Number.isFinite(py)) return;
        if (Math.abs(px) > this.maxMm || Math.abs(py) > this.maxMm) { this.onMessage("That point is off the table."); return; }
        this.drawPts.push([px, py]);
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
      if (h.kind === "vertex" || h.kind === "edge" || h.kind === "bulge") {
        this.pick([it.id]);
        this.edgeSel = { id: it.id, ci: h.ci, ei: (h.ei != null ? h.ei : h.vi), vi: h.kind === "vertex" ? h.vi : null };
        this.drag = { kind: h.kind, it, ci: h.ci, ei: h.ei, vi: h.vi, before, wx, wy, moved: false };
        this.onSelect(); this.onEdgeChange && this.onEdgeChange(); this.draw();
        return;
      }
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
      const base = h.kind === "hole" || h.kind === "resize" ? [it] : this.picked();
      const moving = [...base, ...base.flatMap((m) => this.ownedHoles(m)).filter((o) => !base.includes(o))].map((m) => ({ it: m, x: m.x, y: m.y, b0: this.boxOf(m) }));
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
        cv.style.cursor = this.spaceDown ? "grab" : !h ? "crosshair" : h.kind === "resize" ? ((h.corner[0] < h.anchor[0]) === (h.corner[1] > h.anchor[1]) ? "nwse-resize" : "nesw-resize") : (h.kind === "vertex" || h.kind === "bulge") ? "grab" : h.kind === "edge" ? "pointer" : "move";
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
      } else if (d.kind === "vertex") {
        this.moveVertex(d.ci, d.vi, wx, wy);
        this.label = { text: `${r1(wx)}, ${r1(wy)} mm`, x: sx, y: sy };
      } else if (d.kind === "bulge") {
        this.moveBulge(d.ci, d.ei, wx, wy);
        const info = this.edgeInfo();
        this.label = { text: info && info.radius && Number.isFinite(info.radius) ? `R ${r1(info.radius)} mm` : "curve", x: sx, y: sy };
      } else if (d.kind === "edge") {
        // click-select only; dragging an edge does not move the part
        d.moved = false;
        return;
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
      if (d.moved && (d.kind === "vertex" || d.kind === "bulge") && d.it) {
        // a corner or curve dragged so the outline crosses itself / leaves the table: put it back
        const was = (() => { try { const old = JSON.parse(d.before).find((x) => x.id === d.it.id); return old ? this.outlineProblem(old) : null; } catch (err) { return null; } })();
        const bad = was ? null : this.outlineProblem(d.it);
        if (bad) {
          const es = this.edgeSel ? { ...this.edgeSel } : null;
          this.items = JSON.parse(d.before);
          this.sel.ids = this.sel.ids.filter((id) => this.item(id));
          this.edgeSel = es; this.normalizeEdgeSel();
          this.commit(); this.onSelect(); this.onEdgeChange && this.onEdgeChange();
          this.onMessage(bad + " The corner went back.");
          return;
        }
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
      const h = this.hit(sx, sy, e.pointerType === "touch");
      if (this.layout) { if (!h) this.fitView(); return; }       // the sheet layout: double-click never edits a part
      if (h && (h.kind === "edge" || h.kind === "vertex")) {
        const [wx, wy] = this.toWorld(sx, sy);
        this.selectEdge(h.it.id, h.ci, h.ei != null ? h.ei : h.vi);
        this.addVertexOnEdge(h.ci, h.ei != null ? h.ei : h.vi, [wx, wy]);
        return;
      }
      if (!h) this.fitView();
    });
    window.addEventListener("keyup", (e) => { if (e.key === " ") { this.spaceDown = false; if (this.active) this.cv.style.cursor = ""; } });
    // keys win over the machine jog keys while the editor is on screen and nothing's being typed
    window.addEventListener("keydown", (e) => {
      if (!this.active || !this.cv.offsetParent) return;
      const overlay = (id) => { const el = document.getElementById(id); return el && !el.classList.contains("hidden"); };
      if (overlay("numPad") || overlay("cadDialog") || overlay("shapeLib") || overlay("verPop") || document.querySelector(".acctdlg:not(.hidden)")) return;
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
      if (ctrl && k === "j") { stop(); this.join(); return; }          // (join is refused in the sheet layout)
      const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key);
      if (!this.sel.ids.length) { if (isArrow) stop(); return; }
      if (e.key === "PageUp" || e.key === "PageDown") { stop(); return; }
      if (this.layout && isArrow) { stop(); return; }          // on the cutting screen the arrows are for jogging, never for nudging a part (the nudge buttons are there)
      const st = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
      if (mv) { stop(); this.nudge(...mv); return; }
      if (e.key === "Delete" || e.key === "Backspace") { stop(); if (!this.layout && this.edgeSel && this.edgeSel.vi != null) this.deleteVertex(); else this.remove(); return; }
      if (k === "r") { stop(); this.rotateBy(e.shiftKey ? -90 : 90); return; }
      if (k === "m") { stop(); this.mirror(); return; }
      if (e.key === "Escape") { e.stopImmediatePropagation(); this.pick([]); this.onSelect(); this.draw(); }
    }, true);
  }
}

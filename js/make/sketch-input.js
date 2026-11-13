// Sketch: mouse, touch and keyboard (picking, dragging, snapping guides, resize handles, pan and zoom).
import { getPrefs } from "../core/prefs.js";
import { boxOverlap, clone, r1, unionBox, wholeSet } from "./sketch-util.js";
import { screenBoxToWorld, shiftView } from "../cut/bedview.js";
import { pointInPoly } from "../core/geom.js";
import { snapWorld, constraintOf, applyConstraints } from "./snaps.js";
import { afterDrawPoint, startRectAt, startDiscAt, paintDrawHud, commitRectDisc, closeDrawHud, cancelDrawHud } from "./drawhud.js";
import { openCtxMenu } from "./ctxmenu.js";


function laptopPointer() {
  try { return !!(window.matchMedia && window.matchMedia("(min-width: 900px) and (pointer: fine)").matches); }
  catch (e) { return false; }
}

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
      if (this.layerHidden && this.layerHidden(it)) continue;
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
    // Layout overview (especially with Show machine on) can shrink a part to a few
    // pixels and the gantry sits over the sheet corner. Keep a minimum grab target
    // so a drag still starts on the part, not as a box-select or pan.
    if (this.layout) {
      const min = 22;
      for (const it of list) {
        if (this.layerHidden && this.layerHidden(it)) continue;
        const b = this.boxOf(it); if (!b) continue;
        const [sx0, sy0] = this.toScreen(b[0], b[3]), [sx1, sy1] = this.toScreen(b[2], b[1]);
        const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2;
        const hw = Math.max(min, Math.abs(sx1 - sx0) / 2), hh = Math.max(min, Math.abs(sy1 - sy0) / 2);
        if (sx >= cx - hw && sx <= cx + hw && sy >= cy - hh && sy <= cy + hh)
          return { kind: "move", it: this.holeOwner(it) || it };
      }
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
    // Centre-between: the moving shape's middle snaps to halfway between two other edges, with a guide.
    const midX = (mb[0] + mb[2]) / 2, midY = (mb[1] + mb[3]) / 2;
    const uniq = (arr) => [...new Set(arr.map((v) => r1(v)))].sort((a, b) => a - b);
    const xsU = uniq(xs), ysU = uniq(ys);
    let bet = null;
    for (let i = 0; i < xsU.length; i++) for (let j = i + 1; j < xsU.length; j++) {
      const mid = (xsU[i] + xsU[j]) / 2, d = mid - (midX + dx);
      if (Math.abs(d) < tol && xsU[j] - xsU[i] > 4 && (!bet || Math.abs(d) < Math.abs(bet.d))) bet = { d, axis: "x", a: xsU[i], b: xsU[j], mid };
    }
    if (bet) { dx += bet.d; this.guides.push({ x: bet.mid, between: { a: bet.a, b: bet.b, axis: "x" } }); }
    bet = null;
    for (let i = 0; i < ysU.length; i++) for (let j = i + 1; j < ysU.length; j++) {
      const mid = (ysU[i] + ysU[j]) / 2, d = mid - (midY + dy);
      if (Math.abs(d) < tol && ysU[j] - ysU[i] > 4 && (!bet || Math.abs(d) < Math.abs(bet.d))) bet = { d, axis: "y", a: ysU[i], b: ysU[j], mid };
    }
    if (bet) { dy += bet.d; this.guides.push({ y: bet.mid, between: { a: bet.a, b: bet.b, axis: "y" } }); }
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
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / already released */ }
      const [sx, sy] = pos(e);
      this.pointers.set(e.pointerId, [sx, sy]);
      if (this.pointers.size === 2) {                         // two-finger: pan + pinch zoom (never edits a part)
        if (this.drag && this.drag.kind !== "pinch" && this.drag.kind !== "pan" && this.drag.before) {
          try { this.items = JSON.parse(this.drag.before); } catch (err) { /* keep current */ }
          this.label = null; this.guides = [];
          this.onChange(false);
        }
        const [a, b] = [...this.pointers.values()];
        this.drag = { kind: "pinch", d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, view: { ...this.view } };
        return;
      }
      if (this.pointers.size > 2) return;
      const touch = e.pointerType === "touch";
      const panBtn = e.button === 1;
      if (e.button === 2 && !this.spaceDown) {
        this.drag = { kind: "ctx", sx, sy, wx, wy, moved: false };
        return;
      }
      const [wx, wy] = this.toWorld(sx, sy);
      if (this.centrePick && !panBtn) {
        const eh = this.hitCentreEdge ? this.hitCentreEdge(sx, sy, touch) : this.hit(sx, sy, touch);
        if (this.takeCentreEdge && this.takeCentreEdge(eh)) { this.draw(); return; }
      }
      if ((this.tool === "draw" || this.tool === "rect" || this.tool === "disc") && !panBtn) {
        let px = wx, py = wy;
        const sn = snapWorld(this, wx, wy);
        if (sn) { px = sn.x; py = sn.y; this.snapMark = sn; }
        else if (this.opts.snap) {
          const step = this.opts.snap || 0.1;
          px = Math.round(wx / step) * step; py = Math.round(wy / step) * step;
        }
        if (!Number.isFinite(px) || !Number.isFinite(py)) return;
        if (Math.abs(px) > this.maxMm || Math.abs(py) > this.maxMm) { this.onMessage("That point is off the table."); return; }
        if (this.tool === "rect") {
          if (this.drawDraft && this.drawDraft.kind === "rect") { commitRectDisc(); return; }
          startRectAt(px, py); this.draw(); return;
        }
        if (this.tool === "disc") {
          if (this.drawDraft && this.drawDraft.kind === "disc") { commitRectDisc(); return; }
          startDiscAt(px, py); this.draw(); return;
        }
        const last = this.drawPts[this.drawPts.length - 1];
        if (last) {
          const tags = constraintOf(this, last, [px, py]);
          if (tags) { const c = applyConstraints(last, [px, py], tags); px = c[0]; py = c[1]; this.constraintHint = tags; }
        }
        const first = this.drawPts[0];
        if (first && this.drawPts.length >= 2 && Math.hypot(px - first[0], py - first[1]) <= 8) {
          this.finishDraw && this.finishDraw();
          closeDrawHud();
          this.draw(); return;
        }
        if (this.pushDrawPoint) this.pushDrawPoint(px, py);
        else this.drawPts.push([px, py]);
        afterDrawPoint();
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
        const dragPans = !!(getPrefs().emptyDragPan);
        const add = e.shiftKey || e.ctrlKey || e.metaKey;
        if (panBtn || dragPans) this.drag = { kind: "pan", sx, sy, vx: this.view.vx, vy: this.view.vy, moved: false };
        else this.drag = { kind: "box", sx, sy, cx: sx, cy: sy, add, moved: false };
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
        cv.style.cursor = !h ? (getPrefs().emptyDragPan ? "grab" : "crosshair") : h.kind === "resize" ? ((h.corner[0] < h.anchor[0]) === (h.corner[1] > h.anchor[1]) ? "nwse-resize" : "nesw-resize") : (h.kind === "vertex" || h.kind === "bulge") ? "grab" : h.kind === "edge" ? "pointer" : "move";
        if (this.centrePick && this.hitCentreEdge) {
          const next = this.hitCentreEdge(sx, sy, false);
          const prev = this.centreHover;
          const same = !!(prev && next && prev.it === next.it && prev.ci === next.ci && prev.ei === next.ei) || (!prev && !next);
          this.centreHover = next || null;
          if (!same) this.draw();
        }
        const [mwx, mwy] = this.toWorld(sx, sy);
        const sn = snapWorld(this, mwx, mwy);
        this.snapMark = sn;
        if (this.tool === "draw" && this.drawPts.length) {
          let to = sn ? [sn.x, sn.y] : [mwx, mwy];
          const last = this.drawPts[this.drawPts.length - 1];
          if (e.shiftKey) {
            const ang = Math.atan2(to[1] - last[1], to[0] - last[0]);
            const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(to[0] - last[0], to[1] - last[1]);
            to = [last[0] + len * Math.cos(snapped), last[1] + len * Math.sin(snapped)];
            this.constraintHint = ["0/45/90"];
          } else {
            const tags = constraintOf(this, last, to);
            if (tags) { to = applyConstraints(last, to, tags); this.constraintHint = tags; } else this.constraintHint = null;
          }
          const len = Math.hypot(to[0] - last[0], to[1] - last[1]);
          const ang = Math.atan2(to[1] - last[1], to[0] - last[0]) * 180 / Math.PI;
          this.drawDraft = { kind: "line", x: to[0], y: to[1], len, ang };
          const first = this.drawPts[0];
          this.closeToStart = !!(first && this.drawPts.length >= 2 && Math.hypot(to[0] - first[0], to[1] - first[1]) <= 8);
        } else if (this.tool === "rect" && this.drawDraft && this.drawDraft.kind === "rect") {
          const d = this.drawDraft;
          const x = sn ? sn.x : mwx, y = sn ? sn.y : mwy;
          d.w = x - d.x; d.h = y - d.y;
        } else if (this.tool === "disc" && this.drawDraft && this.drawDraft.kind === "disc") {
          const d = this.drawDraft;
          const x = sn ? sn.x : mwx, y = sn ? sn.y : mwy;
          d.d = 2 * Math.hypot(x - d.cx, y - d.cy);
        }
        this.draw();
        return;
      }
      if (d.kind === "pinch") {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        this.view = { ...d.view };
        this.zoomAt(d.mx, d.my, (d.d > 0 ? dist / d.d : 1));
        shiftView(this.view, mx - d.mx, my - d.my);
        this.clampView && this.clampView();
        this.draw();
        return;
      }
      if (d.kind === "dim" || d.kind === "ctx") {
        if (Math.hypot(sx - d.sx, sy - d.sy) > 6) d.moved = true;
        return;
      }
      if (this.tool === "measure" && this.measure && !this.measure.b) {
        this.measure.hover = this.toWorld(sx, sy); this.draw(); 
      }
      if (d.kind === "pan") {
        if (Math.abs(sx - d.sx) + Math.abs(sy - d.sy) > 3) d.moved = true;
        this.view.vx = d.vx; this.view.vy = d.vy;
        shiftView(this.view, sx - d.sx, sy - d.sy);
        this.clampView && this.clampView();
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
      if (d.kind === "ctx") {
        if (!d.moved) {
          const h = this.hit(d.sx, d.sy, false);
          if (h && h.it) { this.pick([h.it.id]); this.onSelect(); }
          openCtxMenu(d.sx, d.sy, h);
        }
        this.draw(); return;
      }
      if (d.kind === "pan") {
        if (!d.moved && this.sel.ids.length) { this.pick([]); this.onSelect(); }
        this.draw(); return;
      }
      if (d.kind === "box") {
        if (!d.moved) { if (this.sel.ids.length) { this.pick([]); this.onSelect(); } this.draw(); return; }
        const box = screenBoxToWorld(this.toWorld.bind(this), d.sx, d.sy, d.cx, d.cy);
        const leftToRight = d.cx >= d.sx;
        const hit = (i) => {
          const b = this.boxOf(i);
          if (!b) return false;
          if (!leftToRight) return boxOverlap(b, box);
          const pad = 0.2;
          return b[0] >= box[0] - pad && b[1] >= box[1] - pad && b[2] <= box[2] + pad && b[3] <= box[3] + pad;
        };
        const ids = this.items.filter(hit).map((i) => i.id);
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
      if (e.ctrlKey || e.metaKey) {
        this.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
        return;
      }
      if (!this.view) return;
      const k = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 400 : 1);
      const dx = e.deltaX * k, dy = e.deltaY * k;
      const cadZoom = laptopPointer() && !e.shiftKey;
      if (getPrefs().wheelZoom || cadZoom) {
        this.zoomAt(sx, sy, Math.exp(-dy * 0.0015));
        return;
      }
      shiftView(this.view, -dx, -dy);
      this.clampView && this.clampView();
      this.draw();
    }, { passive: false });
    for (const ev of ["gesturestart", "gesturechange", "gestureend"]) {
      cv.addEventListener(ev, (e) => { if (this.active) e.preventDefault(); });
    }
    cv.addEventListener("dblclick", (e) => {
      if (!this.active) return;
      if (this.tool === "draw" && this.drawPts && this.drawPts.length >= 3) {
        e.preventDefault();
        this.finishDraw && this.finishDraw();
        closeDrawHud();
        return;
      }
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
      // the type-in size box owns the keys from the moment it opens (its input only takes focus on the next frame, so focus alone isn't enough)
      if (overlay("dimEdit") || overlay("numPad") || overlay("cadDialog") || overlay("shapeLib") || overlay("verPop") || overlay("presetBrowser") || document.querySelector(".acctdlg:not(.hidden)")) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement && document.activeElement.tagName)) return;
      if (document.getElementById("drawHud") && !document.getElementById("drawHud").classList.contains("hidden") && document.getElementById("drawHud").contains(document.activeElement)) return;
      if (document.activeElement.getAttribute("role") === "separator") return;      // the focused picture divider owns its arrow keys
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === " ") { this.spaceDown = false; return; } // Space is STOP, never pan
      if (ctrl && k === "z") { stop(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (ctrl && k === "y") { stop(); this.redo(); return; }
      if (ctrl && k === "a") { stop(); this.pickAll(); return; }
      if (ctrl && k === "c") { if (this.copy()) { stop(); this.onMessage("Copied – press Ctrl+V to paste."); } return; }
      if (ctrl && k === "v") { stop(); this.paste(false); return; }
      if (ctrl && k === "d") { stop(); this.duplicate(); return; }
      if (ctrl && k === "j") { stop(); this.join(); return; }          // (join is refused in the sheet layout)
      const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key);
      // drawing shortcuts: never steal Space (pan on Make, STOP on Cut). Ignore when typing (checked above).
      if (this.tool === "draw" && this.drawPts && this.drawPts.length) {
        if (e.key === "Backspace") { stop(); (this.popDrawPoint ? this.popDrawPoint() : this.drawPts.pop()); afterDrawPoint(); this.draw(); return; }
        if (e.key === "Enter" && this.drawPts.length >= 3) { stop(); this.finishDraw && this.finishDraw(); closeDrawHud(); return; }
        if (k === "a") { stop(); this.drawArc = !this.drawArc; this.onMessage(this.drawArc ? "Next segment will be a curve. Press A again for a straight line." : "Next segment will be a straight line."); return; }
      }
      if (!ctrl && !this.layout) {
        if (k === "l") { stop(); this.setTool("draw"); afterDrawPoint(); if (this.onSelect) this.onSelect(); return; }
        if (k === "r") { stop(); this.setTool("rect"); if (this.onSelect) this.onSelect(); return; }
        if (k === "c") { stop(); this.setTool("disc"); if (this.onSelect) this.onSelect(); return; }
        if (k === "d") { stop(); this.setTool("measure"); if (this.onSelect) this.onSelect(); return; }
        if (k === "m") { stop(); this.setTool(null); if (this.onSelect) this.onSelect(); return; }
      }
      if (e.key === "Escape") {
        // Cancel an in-progress line / rect / disc first; otherwise leave Escape
        // for the full-screen editor (dialogs.js) and other dialogs.
        if (this.centrePick) {
          e.stopImmediatePropagation(); e.preventDefault();
          this.cancelCentrePick && this.cancelCentrePick();
          return;
        }
        if (this.drawPts && this.drawPts.length || this.drawDraft) {
          e.stopImmediatePropagation(); e.preventDefault();
          cancelDrawHud(); return;
        }
        // Leave Escape for the full-screen editor and the cutting-screen sheet.
        if (this.layout || document.body.classList.contains("shape-fs")) return;
        e.stopImmediatePropagation(); e.preventDefault();
        if (this.tool) { this.setTool(null); if (this.onSelect) this.onSelect(); return; }
        this.pick([]); this.onSelect(); this.draw(); return;
      }
      if (!this.sel.ids.length) {
        if (e.key === "Delete" || e.key === "Backspace") return;
        if (isArrow && this.view) {
          stop();
          const px = e.shiftKey ? 80 : 40;
          if (e.key === "ArrowLeft") shiftView(this.view, px, 0);
          if (e.key === "ArrowRight") shiftView(this.view, -px, 0);
          if (e.key === "ArrowUp") shiftView(this.view, 0, px);
          if (e.key === "ArrowDown") shiftView(this.view, 0, -px);
          if (e.key === "PageUp") this.zoomAt(this.size()[0] / 2, this.size()[1] / 2, 1.15);
          if (e.key === "PageDown") this.zoomAt(this.size()[0] / 2, this.size()[1] / 2, 1 / 1.15);
          this.clampView && this.clampView();
          this.draw();
        }
        return;
      }
      if (e.key === "PageUp" || e.key === "PageDown") { stop(); return; }
      if (this.layout && isArrow) { stop(); return; }          // on the cutting screen the arrows are for jogging, never for nudging a part (the nudge buttons are there)
      const st = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
      if (mv) { stop(); this.nudge(...mv); return; }
      if (e.key === "Delete" || e.key === "Backspace") { stop(); if (!this.layout && this.edgeSel && this.edgeSel.vi != null) this.deleteVertex(); else this.remove(); return; }
    }, true);
  }
}

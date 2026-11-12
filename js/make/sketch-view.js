// Sketch: the view (fit, zoom, pan) and drawing the canvas.
import { bbox } from "../core/geom.js";
import { def, r1, themeColor } from "./sketch-util.js";
import { getPrefs } from "../core/prefs.js";

export class ViewMethods {
  fitView() {
    const [w, h] = this.size(), b = this.layout ? this.layout.viewBox(this) : this.allBox();
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
  draw() {
    if (!this.active || !this.cv.offsetParent) return;
    const cv = this.cv, [w, h] = this.size(), dpr = window.devicePixelRatio || 1;
    if (!this.view) { this.view = { s: 1, vx: 0, vy: 0 }; this.fitView(); return; }
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    if (document.body && (document.body.classList.contains("short-land") || document.body.classList.contains("app-shell") || document.body.classList.contains("shape-fs"))) cv.style.height = "";
    else cv.style.height = (h + (cv.offsetHeight - cv.clientHeight)) + "px";   // border-box: add the 1px borders so the content box is exactly h (else the picture is squashed ~2px)
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.dimHits = [];
    const S = (x, y) => this.toScreen(x, y), s = this.view.s;
    const C = {
      canvas: themeColor("--cad-canvas", "#FFFFFF"),
      grid: themeColor("--cad-grid", "#ECEEF1"),
      gridMajor: themeColor("--cad-grid-major", "#D5DAE0"),
      partFill: themeColor("--cad-part-fill", "#F2F4F7"),
      partSel: themeColor("--cad-part-sel", "#D6E8F8"),
      hole: themeColor("--cad-hole", "#FFFFFF"),
      partLine: themeColor("--cad-part-line", "#334155"),
      sel: themeColor("--cad-sel", "#0078D4"),
      lock: themeColor("--cad-lock", "#C05600"),
      dim: themeColor("--cad-dim", "#0078D4"),
      guide: themeColor("--cad-guide", "#0078D4"),
      label: themeColor("--cad-label", "#4B5563"),
      tagText: themeColor("--cad-tag-text", "#FFFFFF"),
      danger: themeColor("--cad-danger", "#C42B1C"),
    };
    ctx.fillStyle = C.canvas; ctx.fillRect(0, 0, w, h);

    // grid (Make it yours can hide it or lock the step; 0 means auto-size)
    const prefs = getPrefs();
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const auto = steps.find((v) => v * s >= 12) || 1000;
    const g = prefs.gridSize > 0 ? prefs.gridSize : auto, G = steps.find((v) => v >= g * 5) || g * 5;
    if (prefs.grid) {
      const [wx0, wy0] = this.toWorld(0, h), [wx1, wy1] = this.toWorld(w, 0);
      for (const [step, col] of [[g, C.grid], [G, C.gridMajor]]) {
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) { const X = Math.round(S(x, 0)[0]) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, h); }
        for (let y = Math.floor(wy0 / step) * step; y <= wy1; y += step) { const Y = Math.round(S(0, y)[1]) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(w, Y); }
        ctx.stroke();
      }
    }
    ctx.fillStyle = C.label; ctx.font = "11px Barlow, system-ui";
    ctx.textAlign = "right"; ctx.fillText(`${prefs.grid ? "grid " + G + " mm" : "grid off"} · snap ${this.opts.snap ? this.opts.snap + " mm" : "off"}`, w - 8, h - 8); ctx.textAlign = "start";

    // sheet layout (step 3): the sheet, the machine's work area, and which parts are too close / overlapping / off the sheet
    const LY = this.layout || null, LI = LY ? (this.layoutInfo = LY.analyze(this)) : null;
    if (LY) LY.drawBg(this, ctx, S, C, w, h);
    const trace = (c) => { c.pts.forEach((p, i) => { const [X, Y] = S(p[0], p[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); };
    for (const it of this.order()) {
      const cs = this.contoursOf(it); if (!cs.length || this.layerHidden(it)) continue;
      const hole = this.isHole(it), on = this.isPicked(it);
      ctx.beginPath(); cs.forEach(trace);
      const bad = !!(LI && LI.bad.has(it.id));
      ctx.fillStyle = bad ? "#f9c9c4" : hole ? C.hole : on ? C.partSel : C.partFill;
      ctx.fill(def(it.type).multi ? "nonzero" : "evenodd");
      ctx.setLineDash(hole ? [5, 4] : []);
      ctx.strokeStyle = bad ? C.danger : it.lock ? C.lock : on ? C.sel : hole ? C.label : C.partLine;
      ctx.lineWidth = on ? 2 : 1.5;
      ctx.stroke(); ctx.setLineDash([]);
      if (it.lock && on) {
        const bb = this.boxOf(it), [lx, ly] = S(bb[0], bb[3]);
        ctx.fillStyle = C.lock; ctx.font = "14px Barlow, system-ui"; ctx.fillText("🔒", lx + 4, ly + 16);
      }
      if (on && this.sel.hole != null && cs[this.sel.hole]) {
        ctx.beginPath(); trace(cs[this.sel.hole]); ctx.strokeStyle = C.lock; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }

    if (LY) LY.drawTop(this, ctx, S, C, w, h);
    // guides while dragging
    if (this.guides.length) {
      ctx.strokeStyle = C.guide; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.beginPath();
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
      ctx.strokeStyle = C.sel; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1); ctx.setLineDash([]);
      const one = this.selected();
      if (one && this.canResize(one)) {
        for (const [hx, hy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
          ctx.fillStyle = C.canvas; ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.rect(hx - 6, hy - 6, 12, 12); ctx.fill(); ctx.stroke();
        }
      }
      const round = one && def(one.type).uniform && !one.rot && Math.abs((b[2] - b[0]) - (b[3] - b[1])) < 0.05 && one.type !== "custom";
      if (this.layout) { /* sheet layout: the gap numbers are drawn instead of the size tags */ } else if (list.length > 1) {
        this.tag(ctx, `${list.length} shapes · ${r1(b[2] - b[0])} × ${r1(b[3] - b[1])} mm`, (x0 + x1) / 2, Math.max(18, y0 - 20), C.sel);
      } else if (round) {
        const r = this.tag(ctx, `Ø ${r1(b[2] - b[0])} mm`, (x0 + x1) / 2, Math.max(18, y0 - 20), C.sel);
        this.dimHits.push({ ...r, kind: "d", it: one, label: "Diameter (mm)" });
      } else if (one) {
        const wr = this.tag(ctx, `${r1(b[2] - b[0])} mm`, (x0 + x1) / 2, Math.max(18, y0 - 20), C.sel);
        this.dimHits.push({ ...wr, kind: "w", it: one, label: "Width (mm)" });
        const hr = this.tag(ctx, `${r1(b[3] - b[1])} mm`, x1 + 36, (y0 + y1) / 2, C.sel);
        this.dimHits.push({ ...hr, kind: "h", it: one, label: "Height (mm)" });
      }
      if (one && this.opts.pro && !this.layout) {
        const xr = this.tag(ctx, `X ${r1(b[0])}`, x0, y1 + 20, C.partLine);
        this.dimHits.push({ ...xr, kind: "x", it: one, label: "Left edge X (mm)" });
        const yr = this.tag(ctx, `Y ${r1(b[1])}`, x0 + 80, y1 + 20, C.partLine);
        this.dimHits.push({ ...yr, kind: "y", it: one, label: "Bottom edge Y (mm)" });
      }
      // where's the hole? dimension lines from the part's corner (Make a part only: the sheet layout never edits a part)
      if (one && !this.layout) {
        const cs = this.contoursOf(one);
        let hc = null, host = one;
        if (this.sel.hole != null && cs[this.sel.hole]) hc = cs[this.sel.hole];
        else if (this.isHole(one) && !def(one.type).multi) { hc = cs[0]; host = this.hostOf(one); }
        else if (def(one.type).multi) { host = this.hostOf(one); hc = host ? { pts: [[b[0], b[1]], [b[2], b[3]]] } : null; }
        if (hc && host) {
          const hb = this.boxOf(host), cb = bbox([hc]);
          const cx = (cb[0] + cb[2]) / 2, cy = (cb[1] + cb[3]) / 2;
          ctx.strokeStyle = C.lock; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          const [px, py] = S(cx, cy), [lx] = S(hb[0], cy), [, by] = S(cx, hb[1]);
          ctx.beginPath(); ctx.moveTo(lx, py); ctx.lineTo(px, py); ctx.moveTo(px, by); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
          const hx = this.tag(ctx, `${r1(cx - hb[0])}`, (lx + px) / 2, py - 16, C.lock);
          this.dimHits.push({ ...hx, kind: "hx", it: one, label: "Hole from left (mm)" });
          const hy = this.tag(ctx, `${r1(cy - hb[1])}`, px + 28, (by + py) / 2, C.lock);
          this.dimHits.push({ ...hy, kind: "hy", it: one, label: "Hole from bottom (mm)" });
        }
      }
    }

    this.drawEdgeHandles(ctx, C, S);

    // cut check markers (not on the sheet layout: they would sit on top of the parts)
    (this.layout ? [] : this.marks).forEach((m, i) => {
      const [X, Y] = S(m.at[0], m.at[1]);
      i = (m.n || i + 1) - 1;
      const col = m.level === "error" ? C.danger : m.level === "warn" ? C.lock : C.sel;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = C.canvas; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.tagText; ctx.font = "bold 12px Barlow, system-ui"; ctx.textAlign = "center";
      ctx.fillText(String(i + 1), X, Y + 4); ctx.textAlign = "start";
    });

    // box select
    if (this.drag && this.drag.kind === "box") {
      const d = this.drag;
      ctx.fillStyle = "rgba(0,120,212,.12)"; ctx.strokeStyle = C.sel; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.fillRect(d.sx, d.sy, d.cx - d.sx, d.cy - d.sy); ctx.strokeRect(d.sx, d.sy, d.cx - d.sx, d.cy - d.sy); ctx.setLineDash([]);
    }
    if (this.label) this.tag(ctx, this.label.text, this.label.x, this.label.y - 28, C.partLine);

    if (this.tool === "draw" && this.drawPts.length) {
      ctx.strokeStyle = C.sel; ctx.fillStyle = C.sel; ctx.lineWidth = 2;
      ctx.beginPath();
      this.drawPts.forEach((p, i) => { const [X, Y] = S(p[0], p[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
      for (const p of this.drawPts) { const [X, Y] = S(p[0], p[1]); ctx.beginPath(); ctx.arc(X, Y, 5, 0, 7); ctx.fill(); }
    }
    if (this.tool === "measure" && this.measure && this.measure.a) {
      const a = this.measure.a, b = this.measure.b || this.measure.hover;
      if (b) {
        const [ax, ay] = S(a[0], a[1]), [bx, by] = S(b[0], b[1]);
        ctx.strokeStyle = C.sel; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
        this.tag(ctx, `${r1(Math.hypot(b[0] - a[0], b[1] - a[1]))} mm`, (ax + bx) / 2, (ay + by) / 2 - 16, C.lock);
      }
    }

    if (this.items.length) {
      const b = this.allBox();
      ctx.fillStyle = C.label; ctx.font = "12px Barlow, system-ui";
      const tool = this.tool === "draw" ? " · DRAW: tap points, then Close" : this.tool === "measure" ? " · MEASURE: tap two points" : "";
      const np = this.partTotal();
      ctx.fillText(`${np} part${np === 1 ? "" : "s"} · overall ${r1(b[2] - b[0])} × ${r1(b[3] - b[1])} mm${tool}`, 8, h - 8);
    } else {
      ctx.fillStyle = C.label; ctx.font = "15px Barlow, system-ui"; ctx.textAlign = "center";
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
    ctx.fillStyle = themeColor("--cad-tag-text", "#FFFFFF"); ctx.textAlign = "center"; ctx.fillText(text, x, y + 5); ctx.textAlign = "start";
    return { x: x - tw / 2, y: y - th / 2, w: tw, h: th };
  }
}

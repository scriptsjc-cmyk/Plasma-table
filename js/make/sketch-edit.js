// Sketch: the commands that change the picked shapes (turn, mirror, align, join, arrays, offset, subtract, nest, resize, ...).
import { MIN, cleanContour, clone, def, distToEdge, mapC, r1, rot, unionBox, wholeSet } from "./sketch-util.js";
import { assessOffset, bbox, bulgeMidpoint, classifyContainment, differenceOutlines, offsetLoop, pointInPoly, selfIntersects, signedArea, unionMany, unionOutlines } from "../core/geom.js";
import { fitContour } from "../core/arcs.js";
import { nestUnitsSync, turnAngles, ringsBox } from "../cut/nest.js";
import { variantKey, variantsFor } from "./variants.js";
import { clickVerb } from "../ui/laptop.js";
import { keepMatching, moveFeatureBy } from "./part-features.js";

export class EditMethods {
  // Turn 90 keeps each shape's bottom-left and, when width/height exist, swaps them
  // instead of spinning around the centre (which used to push Y below zero).
  rotateBy(deg) {
    const list = this.picked().filter((i) => this.canMutate(i)); if (!list.length) return;
    this.remember();
    const ang = ((Number(deg) % 360) + 360) % 360;
    const quarter = ang === 90 || ang === 270;
    for (const it of list) {
      const b = this.boxOf(it);
      const bl = [b[0], b[1]];
      const aligned = (((it.rot || 0) % 180) + 180) % 180 === 0;
      const canSwap = quarter && aligned && it.p && Number.isFinite(Number(it.p.w)) && Number.isFinite(Number(it.p.h));
      if (canSwap) {
        const t = it.p.w; it.p.w = it.p.h; it.p.h = t;
        it.x = r1(bl[0]); it.y = r1(bl[1]);
      } else {
        it.rot = (((it.rot || 0) + deg) % 360 + 360) % 360;
        it.x = r1(bl[0]); it.y = r1(bl[1]);
        // boxOf uses x,y as the bottom-left of the unrotated params; after rot the
        // visual BL may shift. Nudge so the visual bottom-left stays put.
        const nb2 = this.boxOf(it);
        it.x = r1(it.x + (bl[0] - nb2[0]));
        it.y = r1(it.y + (bl[1] - nb2[1]));
      }
    }
    this.commit(); this.onSelect();
  }
  setAngle(deg) {
    const it = this.selected(); if (!this.canMutate(it) || !Number.isFinite(deg)) return;
    this.remember();
    const b = this.boxOf(it), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    it.rot = ((deg % 360) + 360) % 360;
    const nb = this.boxOf(it);
    it.x = r1(c[0] - (nb[2] - nb[0]) / 2); it.y = r1(c[1] - (nb[3] - nb[1]) / 2);
    this.commit(); this.onSelect();
  }
  // mirror left-right about the middle of the picked shapes
  mirror() {
    const list = this.picked().filter((i) => this.canMutate(i)); if (!list.length) return;
    this.remember();
    const g = unionBox(list.map((i) => this.boxOf(i)));
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
    const explicit = (it) => this.isExplicitHole(it) || !!(def(it.type) && def(it.type).hole);
    const solids = list.filter((it) => !explicit(it) && !this.hostOf(it));
    const holeItems = list.filter((it) => !solids.includes(it));
    // A shape that overlaps both a part and a hole (a keyway) is treated as a hole to merge, not as material.
    const keyways = [];
    const parts = [];
    for (const it of solids) {
      const loops = this.loopsOf(it);
      const pts = loops.outers[0] && loops.outers[0].pts;
      let key = false;
      if (pts) {
        for (const p of [...solids, ...this.items.filter((o) => !list.includes(o) && !explicit(o) && !this.hostOf(o))]) {
          if (p === it) continue;
          const rel = classifyContainment(pts, this.loopsOf(p).outers);
          if (rel !== "overlap") continue;
          const holes = [...this.loopsOf(p).holes, ...this.items.filter((h) => h !== it && (explicit(h) || this.hostOf(h) === p)).flatMap((h) => this.contoursOf(h))];
          if (holes.some((h) => classifyContainment(pts, [h]) !== "outside")) { key = true; break; }
        }
      }
      if (key) keyways.push(it);
      else parts.push(it);
    }
    if (!parts.length) { this.onMessage("Those are all holes – pick the part they sit on too."); return; }
    const outers = [];
    const ownHoles = [];
    for (const p of parts) {
      const L = this.loopsOf(p);
      outers.push(...L.outers);
      ownHoles.push(...L.holes);
    }
    const u = unionMany(outers);
    if (!u.outers.length) { this.onMessage("Those shapes don't touch – move them so they overlap or touch, then join."); return; }
    if (parts.length > 1 && u.outers.length === outers.length) {
      // nothing actually fused (each outer stayed disjoint) — only refuse if they were supposed to become one body
      const anyFused = u.outers.length < outers.length;
      if (!anyFused && outers.length > 1 && parts.every((p) => this.loopsOf(p).outers.length <= 1)) {
        this.onMessage("Those shapes don't touch – move them so they overlap or touch, then join.");
        return;
      }
    }
    const onParts = this.items.filter((o) => !list.includes(o) && (explicit(o) || this.isHole(o)) && parts.includes(this.hostOf(o) || (def(o.type).multi ? this.hostOfBox(o, parts) : null)));
    const holePts = [];
    for (const src of [...ownHoles, ...u.holes.map((pts) => ({ pts, closed: true }))]) holePts.push(src);
    const swallowed = [...holeItems, ...keyways, ...onParts];
    const sitsIn = (c, hostOuters) => hostOuters.some((o) => classifyContainment(c.pts, [o]) === "inside");
    const swallowedIn = swallowed.filter((hi) => this.contoursOf(hi).every((c) => sitsIn(c, u.outers)));
    const stray = swallowed.filter((hi) => !swallowedIn.includes(hi) && (explicit(hi) || this.isHole(hi)));
    for (const hi of swallowedIn) holePts.push(...this.contoursOf(hi));
    // Overlapping holes merge into one opening (they must not cancel into a cuttable part).
    const mergedHoles = unionMany(holePts.map((h) => h.pts || h));
    let holeWarn = false;
    if (holePts.length >= 2 && mergedHoles.outers.length < holePts.length) holeWarn = true;
    const kept = [];
    for (const h of [...mergedHoles.outers, ...mergedHoles.holes]) {
      const c = { pts: h.pts || h, closed: true };
      if (sitsIn(c, u.outers)) kept.push(c);
    }
    const allLoops = [...u.outers.map((pts) => ({ pts, closed: true })), ...kept];
    const b = bbox(allLoops);
    const local = (c) => { const f = fitContour(cleanContour(mapC(c, ([x, y]) => [x - b[0] + 1e-9, y - b[1] + 1e-9]))); f.pts = f.pts.map(([x, y]) => [r1(x), r1(y)]); if (f.circle) f.circle = { cx: r1(f.circle.cx), cy: r1(f.circle.cy), r: r1(f.circle.r) }; return f; };
    this.remember();
    const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      shape: { cs: allLoops.map(local) } };
    const drop = new Set([...list.filter((i) => !stray.includes(i) || swallowedIn.includes(i)), ...swallowedIn]);
    this.items = this.items.filter((i) => !drop.has(i));
    this.items.push(it);
    this.pick([it.id]);
    this.commit(); this.onSelect();
    const notes = [];
    notes.push(`Joined into one part${kept.length ? ` with ${kept.length} hole${kept.length > 1 ? "s" : ""}` : ""}.`);
    if (holeWarn) notes.push("Overlapping holes were merged into one opening.");
    if (stray.length) notes.push(stray.length === 1 ? "One hole sits off the part, so it was left out." : stray.length + " holes sit off the part, so they were left out.");
    this.onMessage(notes.join(" "));
  }
  // switch the selected part to a related version, keeping its size and place
  applyVariant(spec) {
    const it = this.selected(); if (!this.canMutate(it) || it.type === "custom") return;
    const d = def(spec.id); if (!d) return;
    const b = this.boxOf(it), W = Math.max(MIN, b[2] - b[0]), H = Math.max(MIN, b[3] - b[1]);
    this.remember();
    const p = {};
    for (const [k, , v] of d.params) p[k] = v;
    keepMatching(p, it.p, spec.p);                                   // r15 P1-1: a version change keeps the values you typed
    Object.assign(p, spec.p || {});
    it.type = spec.id;
    it.p = d.fit ? d.fit(p, d.uniform ? Math.max(W, H) : W, H) : p;
    for (const k of Object.keys(it.p)) if (Number.isFinite(it.p[k])) it.p[k] = r1(it.p[k]);
    it.holes = {};
    this.resizeTo(it, W, H);
    // cut-offs and rounding can shrink the box; add the shortfall so overall size stays put
    for (let i = 0; i < 8; i++) {
      it._key = undefined;
      const nb = this.boxOf(it), cw = nb[2] - nb[0], ch = nb[3] - nb[1];
      if (!(cw > 0.5 && ch > 0.5)) break;
      if (Math.abs(cw - W) < 0.05 && Math.abs(ch - H) < 0.05) break;
      this.resizeTo(it, Math.max(MIN, W + (W - cw)), Math.max(MIN, H + (H - ch)));
    }
    const nb = this.boxOf(it);
    it.x = r1(it.x + b[0] - nb[0]); it.y = r1(it.y + b[1] - nb[1]);
    if (d.uniform && Math.abs(W - H) > 0.5) this.onMessage(`${d.name || "That shape"} is the same size both ways, so it took the larger size (${r1(Math.max(W, H))} mm).`);
    this.commit(); this.onSelect();
  }
  variants() { const it = this.selected(); return it && it.type !== "custom" ? variantsFor(it.type) : []; }
  currentVariantKey() {
    const it = this.selected(); if (!it) return "";
    let best = null, bestN = -1;
    for (const v of variantsFor(it.type)) {
      if (v.id !== it.type) continue;
      const ents = Object.entries(v.p || {});
      const ok = ents.every(([k, val]) => val == null || Math.abs((Number(it.p[k]) || 0) - val) < 0.2 || (k === "r" && (it.p.r || 0) > 0.5 && val > 0) || (k === "mid" && (it.p.mid || 0) > 0 && val > 0) || (k === "hole" && (it.p.hole || 0) > 0 && val > 0));
      if (!ok) continue;
      if (ents.length > bestN) { best = v; bestN = ents.length; }
    }
    return best ? variantKey(best) : it.type;
  }
  setPos(axis, v) {
    const it = this.selected(); if (!this.canMutate(it) || !Number.isFinite(v) || Math.abs(v) > this.maxMm * 2) return;
    this.remember();
    const b = this.boxOf(it);
    const host = this.hostPart && this.hostPart(it);
    const origin = host ? this.boxOf(host) : [0, 0];
    // Typed values are applied exactly — never snapped (C21). Snap stays for dragging and clicking.
    if (axis === "x") it.x = it.x + (origin[0] + v) - b[0];
    else it.y = it.y + (origin[1] + v) - b[1];
    this.commit(); this.onSelect();
  }
  setHoleOffset(axis, v) {
    const it = this.selected(); if (!it || !Number.isFinite(v)) return;
    let host = it, hc = null, cs = this.contoursOf(it);
    if (this.sel.hole != null && cs[this.sel.hole]) { hc = cs[this.sel.hole]; host = it; }
    else if (this.isHole(it)) { hc = wholeSet(it.type) ? { pts: [[this.boxOf(it)[0], this.boxOf(it)[1]], [this.boxOf(it)[2], this.boxOf(it)[3]]] } : cs[0]; host = this.hostOf(it) || (wholeSet(it.type) ? this.hostOfBox(it, this.items.filter((o) => !this.isHole(o))) : null); }
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
  toggleLock(it) {
    const list = it ? [it] : this.picked(); if (!list.length) return;
    this.remember();
    const on = !list.every((i) => i.lock);
    for (const x of list) x.lock = on;
    this.commit(); this.onSelect();
  }
  toggleHide(it) {
    const list = it ? [it] : this.picked(); if (!list.length) return;
    this.remember();
    const on = !list.every((i) => i.hide);
    for (const x of list) x.hide = on;
    this.commit(); this.onSelect();
  }
  setName(it, name) {
    const host = it || this.selected();
    if (!host) return;
    this.remember();
    const n = String(name || "").trim().slice(0, 80);
    if (n) host.name = n; else delete host.name;
    this.commit(); this.onSelect();
  }
  // round 5 item 9: one tap frees every locked part (Beginner has no Lock button, so no lock may stay hidden there)
  unlockAll() {
    if (!this.items.some((i) => i.lock)) return;
    this.remember();
    for (const it of this.items) it.lock = false;
    this.commit(); this.onSelect();
  }
  flipV() {
    const list = this.picked().filter((i) => this.canMutate(i)); if (!list.length) return;
    this.remember();
    const g = unionBox(list.map((i) => this.boxOf(i)));
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
  centrePrompt() {
    const job = this.centrePick;
    if (!job) return "";
    return job.edges && job.edges.length ? "Click the second edge" : "Click the first edge";
  }
  cancelCentrePick(silent) {
    if (!this.centrePick) return false;
    this.centrePick = null;
    this.centreHover = null;
    if (!silent) this.onMessage("Centre between cancelled.");
    this.draw();
    return true;
  }
  // Nearest contour edge of any other part (not the shape being centred). Used while
  // Centre between is asking for two edge picks: the hole is selected, so the usual
  // hit test would only look at that hole and treat a click on the host as "move".
  hitCentreEdge(sx, sy, touch) {
    const job = this.centrePick;
    if (!job) return null;
    const R = touch ? 28 : 18;
    const [wx, wy] = this.toWorld(sx, sy);
    const tol = R / (this.view && this.view.s ? this.view.s : 1);
    let best = null, bestD = tol;
    for (const it of this.items) {
      if (it.id === job.id) continue;
      if (this.layerHidden && this.layerHidden(it)) continue;
      const cs = this.contoursOf(it);
      for (let ci = 0; ci < cs.length; ci++) {
        const pts = cs[ci].pts, n = pts && pts.length;
        if (!n || n < 2) continue;
        const closed = cs[ci].closed !== false;
        const edges = closed ? n : n - 1;
        const bs = cs[ci].bulges || [];
        for (let i = 0; i < edges; i++) {
          const d = distToEdge(wx, wy, pts[i], pts[(i + 1) % n], bs[i]);
          if (d < bestD) { bestD = d; best = { kind: "edge", it, ci, ei: i }; }
        }
      }
    }
    return best;
  }
  centreBetween() {
    const list = this.picked();
    if (list.length !== 1) { this.onMessage("Pick one shape, then Centre between, then two edges."); return; }
    this.centrePick = { id: list[0].id, edges: [] };
    this.centreHover = null;
    this.onMessage(this.centrePrompt());
    this.draw();
  }
  takeCentreEdge(hit) {
    const job = this.centrePick;
    if (!job) return false;
    if (!hit || hit.kind !== "edge" || !hit.it) { this.onMessage(this.centrePrompt() + " — click an edge of a part."); return true; }
    const c = this.contoursOf(hit.it)[hit.ci];
    const pts = c && c.pts;
    if (!pts || pts.length < 2) { this.onMessage(this.centrePrompt() + " — click an edge of a part."); return true; }
    const i = hit.ei != null ? hit.ei : hit.vi;
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (!a || !b) { this.onMessage(this.centrePrompt() + " — click an edge of a part."); return true; }
    job.edges.push({ a: [...a], b: [...b], it: hit.it.id, ci: hit.ci, ei: i });
    if (job.edges.length < 2) { this.onMessage(this.centrePrompt()); this.draw(); return true; }
    const it = this.item(job.id);
    this.centrePick = null;
    if (!it) return true;
    const mid = (e) => [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    const tall = (e) => Math.abs(e.b[1] - e.a[1]) >= Math.abs(e.b[0] - e.a[0]);
    const m1 = mid(job.edges[0]), m2 = mid(job.edges[1]);
    const box = this.boxOf(it);
    this.remember();
    if (tall(job.edges[0]) && tall(job.edges[1])) {
      const x = (m1[0] + m2[0]) / 2;
      it.x = r1(it.x + x - (box[0] + box[2]) / 2);
    } else if (!tall(job.edges[0]) && !tall(job.edges[1])) {
      const y = (m1[1] + m2[1]) / 2;
      it.y = r1(it.y + y - (box[1] + box[3]) / 2);
    } else {
      it.x = r1(it.x + (m1[0] + m2[0]) / 2 - (box[0] + box[2]) / 2);
      it.y = r1(it.y + (m1[1] + m2[1]) / 2 - (box[1] + box[3]) / 2);
    }
    this.commit(); this.onSelect();
    this.onMessage("Centred between the two edges.");
    return true;
  }
  linearArray(n, gapX, gapY) {
    const list = this.picked(); if (!list.length) return;
    const want = Math.round(n || 2);
    n = Math.max(2, Math.min(50, want));
    if (want > 50) this.onMessage("A linear array is limited to 50 copies (including this one). Using 50.");
    gapX = Number(gapX); gapY = Number(gapY);
    if (!Number.isFinite(gapX)) gapX = 10; if (!Number.isFinite(gapY)) gapY = 0;
    if (Math.abs(gapX) > this.maxMm || Math.abs(gapY) > this.maxMm) { this.onMessage("That array gap is bigger than the table."); return; }
    const box = this.pickedBox();
    // Gap 0 means no step on that axis (a row or a column). A non-zero gap is the clearance between bounding boxes.
    const dx = gapX === 0 ? 0 : (box[2] - box[0]) + gapX;
    const dy = gapY === 0 ? 0 : (box[3] - box[1]) + gapY;
    if (Math.abs((n - 1) * dx) > this.maxMm || Math.abs((n - 1) * dy) > this.maxMm) { this.onMessage("That array wouldn't fit on the table."); return; }
    this.remember();
    const ids = [...this.sel.ids];
    const onlyHole = list.length === 1 && this.isHole(list[0]);
    for (let k = 1; k < n; k++) {
      for (const src of list) {
        const c = { ...clone(src), id: this.nextId++, lock: false };
        c.x = r1(src.x + k * dx); c.y = r1(src.y + k * dy);
        this.items.push(c); ids.push(c.id);
        if (!onlyHole) {
          for (const h of this.ownedHoles(src)) {
            if (list.includes(h)) continue;
            const hc = { ...clone(h), id: this.nextId++, lock: false };
            hc.x = r1(h.x + k * dx); hc.y = r1(h.y + k * dy);
            this.items.push(hc); ids.push(hc.id);
          }
        }
      }
    }
    this.pick(ids); this.ensureVisible(); this.commit(); this.onSelect();
  }
  // Centre used by a circular array: a clicked point, the host plate, or the picked shape itself (C13).
  arrayPivotOf(list, pivot) {
    if (pivot && Number.isFinite(Number(pivot.x)) && Number.isFinite(Number(pivot.y))) return [Number(pivot.x), Number(pivot.y)];
    const mode = (pivot && pivot.mode) || (typeof pivot === "string" ? pivot : "shape");
    if (mode === "click") return null;
    if (mode === "host") {
      for (const it of list) {
        const h = this.hostOf(it) || this.hostPart && this.hostPart(it);
        if (h) { const b = this.boxOf(h); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
      }
      const others = this.items.filter((i) => !list.includes(i) && !this.isHole(i));
      if (others.length) {
        others.sort((a, b) => {
          const ba = this.boxOf(a), bb = this.boxOf(b);
          return (bb[2] - bb[0]) * (bb[3] - bb[1]) - (ba[2] - ba[0]) * (ba[3] - ba[1]);
        });
        const b = this.boxOf(others[0]);
        return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      }
      return null;
    }
    const box = this.pickedBox() || this.boxOf(list[0]);
    return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  }
  startPolarPick(n, pcd) {
    this.polarPick = { n, pcd };
    this.onMessage("Click the centre of the circle (a plate centre, a hole, or any point). Esc cancels.");
    this.draw();
  }
  cancelPolarPick() {
    if (!this.polarPick) return;
    this.polarPick = null;
    this.onMessage("Circular array cancelled.");
    this.draw();
  }
  // Move a part so its bounding-box centre sits at (tx, ty), after any rotation has been applied.
  _placeCentre(it, tx, ty) {
    it._key = null;
    const b = this.boxOf(it);
    if (!b) return;
    it.x = r1(it.x + tx - (b[0] + b[2]) / 2);
    it.y = r1(it.y + ty - (b[1] + b[3]) / 2);
    it._key = null;
  }
  // Copy a part's unpicked holes to sit in the same place on a new copy (C20).
  _copyOwnedHoles(src, dest, ids) {
    const sb = this.boxOf(src), db = this.boxOf(dest);
    if (!sb || !db) return;
    const sc = [(sb[0] + sb[2]) / 2, (sb[1] + sb[3]) / 2];
    const dc = [(db[0] + db[2]) / 2, (db[1] + db[3]) / 2];
    const dang = (((dest.rot || 0) - (src.rot || 0)) * Math.PI) / 180;
    const ca = Math.cos(dang), sa = Math.sin(dang);
    for (const h of this.ownedHoles(src)) {
      if (this.sel.ids.includes(h.id)) continue;
      const hb = this.boxOf(h), hc = [(hb[0] + hb[2]) / 2, (hb[1] + hb[3]) / 2];
      const dx = hc[0] - sc[0], dy = hc[1] - sc[1];
      const tx = dc[0] + dx * ca - dy * sa, ty = dc[1] + dx * sa + dy * ca;
      const c = { ...clone(h), id: this.nextId++, lock: false, rot: (((h.rot || 0) + (dest.rot || 0) - (src.rot || 0)) % 360 + 360) % 360 };
      this.items.push(c);
      this._placeCentre(c, tx, ty);
      if (ids) ids.push(c.id);
    }
  }
  polarArray(n, pcd, pivot) {
    const list = this.picked(); if (!list.length) return;
    if (list.some((i) => i.lock)) { this.onMessage("Unlock the part before making a polar array."); return; }
    n = Math.max(2, Math.min(36, Math.round(n || 4)));
    const box = this.pickedBox();
    const pcdN = Number(pcd);
    if (Number.isFinite(pcdN) && (pcdN > this.maxMm || pcdN < 0)) { this.onMessage("That bolt-circle is bigger than the table."); return; }
    let R = Number.isFinite(pcdN) && pcdN > 0 ? pcdN / 2 : Math.max(box[2] - box[0], box[3] - box[1]) / 2 + 10;
    if (!(R <= this.maxMm)) { this.onMessage("That bolt-circle is bigger than the table."); return; }
    const mode = (pivot && pivot.mode) || (typeof pivot === "string" ? pivot : null);
    if (mode === "click" && !(pivot && Number.isFinite(Number(pivot.x)))) { this.startPolarPick(n, pcd); return; }
    const cxy = this.arrayPivotOf(list, pivot);
    if (!cxy) {
      this.onMessage("There is no plate to use as the centre. Click a point on the drawing, or pick the plate first.");
      this.startPolarPick(n, pcd);
      return;
    }
    const [cx, cy] = cxy;
    this.polarPick = null;
    {
      const src = list[0], b = this.boxOf(src);
      const scx = (b[0] + b[2]) / 2, scy = (b[1] + b[3]) / 2;
      let rWarn = Math.hypot(scx - cx, scy - cy);
      if (!(rWarn > 0.05) || (Number.isFinite(pcdN) && pcdN > 0)) rWarn = R;
      const span = Math.max(b[2] - b[0], b[3] - b[1]);
      const chord = 2 * rWarn * Math.sin(Math.PI / n);
      if (chord < span - 0.5) this.onMessage("Those copies will overlap. Use a larger circle or fewer copies if that is not what you want.");
    }
    this.remember();
    const ids = [...this.sel.ids];
    const pcdGiven = Number.isFinite(pcdN) && pcdN > 0;
    for (const src of list) {
      const b = this.boxOf(src), scx = (b[0] + b[2]) / 2, scy = (b[1] + b[3]) / 2;
      let dx = scx - cx, dy = scy - cy;
      let r0 = Math.hypot(dx, dy);
      const a0 = r0 > 0.05 ? Math.atan2(dy, dx) : 0;
      if (pcdGiven || r0 < 0.05) r0 = R;
      if (pcdGiven || Math.hypot(dx, dy) < 0.05) this._placeCentre(src, cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0));
      const rot0 = src.rot || 0;
      for (let k = 1; k < n; k++) {
        const ang = a0 + (k / n) * 2 * Math.PI;
        const c = { ...clone(src), id: this.nextId++, lock: false, rot: rot0 };
        c.rot = ((rot0 + (k / n) * 360) % 360 + 360) % 360;
        this.items.push(c); ids.push(c.id);
        this._placeCentre(c, cx + r0 * Math.cos(ang), cy + r0 * Math.sin(ang));
        if (!(list.length === 1 && this.isHole(src))) this._copyOwnedHoles(src, c, ids);
      }
    }
    this.pick(ids); this.ensureVisible(); this.commit(); this.onSelect();
  }
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
    this.remember();
    let cur = { outer: outer.pts, holes: this.contoursOf(host).slice(1).map((h) => ({ pts: h.pts, circle: h.circle })) };
    const circleOf = (c, it) => c.circle || (it.type === "disc" && it.p && it.p.d > 0 ? { cx: (this.boxOf(it)[0] + this.boxOf(it)[2]) / 2, cy: (this.boxOf(it)[1] + this.boxOf(it)[3]) / 2, r: it.p.d / 2 } : null);
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
        if (!r) { this.onMessage("Those shapes don't overlap – move the cutter onto the part."); this.restore(this.past.pop()); return; }
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
    const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      shape: { cs: [local({ pts: cur.outer }), ...cur.holes.filter((h) => h && (h.pts || h).length >= 3).map(local)] } };
    const drop = new Set(list);
    this.items = this.items.filter((i) => !drop.has(i));
    this.items.push(it);
    this.pick([it.id]); this.commit(); this.onSelect();
    this.onMessage("Cut out. The result is one part you can copy or resize.");
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
    if (this.drawPts.length < 3) { this.onMessage(clickVerb() + " at least three points, then Close."); return; }
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
  setParam(k, v) {
    const it = this.selected(); if (!this.canMutate(it) || !Number.isFinite(v)) return;
    const sizeKeys = ["w", "h", "d", "a", "b", "len", "wid", "s"];
    if ((k === "d" || k === "hole") && v > 0 && v < MIN) {
      this.onMessage("A hole smaller than " + MIN + " mm will not cut. Use at least " + MIN + " mm, or bigger than the kerf.");
      return false;
    }
    if (sizeKeys.includes(k) && (v < MIN || v > this.maxMm)) return;
    if (["n", "cols", "rows"].includes(k)) v = Math.max(0, Math.min(64, v));
    if (Math.abs(v) > this.maxMm * 4) return;
    it.p[k] = v; this.save(); this.draw();
    return true;
  }
  nudge(dx, dy) {
    const list = this.picked().filter((i) => this.canMutate(i)); if (!list.length) return;
    this.remember();
    if (this.sel.hole != null && list.length === 1) this.moveHole(list[0], this.sel.hole, dx, dy);
    else for (const it of list) { it.x = r1(it.x + dx); it.y = r1(it.y + dy); }
    this.commit(); this.onSelect();
  }
  moveHole(it, i, dx, dy) {          // dx, dy on screen -> the shape's own frame
    let [lx, ly] = rot([dx, dy], -(it.rot || 0));
    if (it.fx) lx = -lx;
    const c = this.contoursOf(it)[i];
    if (c && c.feat && moveFeatureBy(it, c.feat, lx, ly, this.partWidth(it))) return;   // r15 Round 2: a feature moves as one, from its centre
    const h = (it.holes = it.holes || {});
    const o = h[i] || [0, 0];
    h[i] = [r1(o[0] + lx), r1(o[1] + ly)];
  }
  resizeTo(it, W, H) {
    const d = def(it.type);
    if (d.noResize) return;                                        // flat-pattern sets: change the sizes, not the box
    W = Math.min(this.maxMm, Math.max(MIN, W)); H = Math.min(this.maxMm, Math.max(MIN, H));
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
  // Exact width / height for a joined or imported part. keep = same shape (one scale for both);
  // otherwise it is stretched, and each arc keeps its sweep (so a circle becomes a rounded oval-ish curve).
  resizeCustomTo(it, W, H, keep = true, which = "w") {
    if (!this.isEditableCustom(it) || it.lock) return false;
    const b = this.boxOf(it), cw = b[2] - b[0], ch = b[3] - b[1];
    if (!(cw > 0 && ch > 0) || !(W > 0) || !(H > 0)) return false;
    const mx = this.maxMm || 2600;
    let sx = W / cw, sy = H / ch;
    if (keep) sx = sy = which === "h" ? H / ch : W / cw;
    if (cw * sx > mx || ch * sy > mx || cw * sx < MIN || ch * sy < MIN) return false;
    this.remember();
    this.bakeCustom(it);
    const q = (v) => Math.round(v * 100) / 100;
    const base = it.shape.cs;
    const apply = (ax, ay) => { it.shape.cs = base.map((c) => ({ ...c, pts: c.pts.map(([x, y]) => [q(x * ax), q(y * ay)]) })); it._key = null; };
    apply(sx, sy);
    // a curved edge bulges past its end points, so the first guess can be a little off: nudge the scale until the real outline is the size asked for
    for (let k = 0; k < 6; k++) {
      const bb = this.boxOf(it), aw = bb[2] - bb[0], ah = bb[3] - bb[1];
      const okW = Math.abs(aw - W) < 0.02, okH = Math.abs(ah - H) < 0.02;
      if (keep ? (which === "h" ? okH : okW) : (okW && okH)) break;
      if (keep) { const f = which === "h" ? H / ah : W / aw; sx *= f; sy *= f; }
      else { sx *= W / aw; sy *= H / ah; }
      apply(sx, sy);
    }
    this.commit(); this.onSelect();
    return true;
  }
}

// Sketch: the commands that change the picked shapes (turn, mirror, align, join, arrays, offset, subtract, nest, resize, ...).
import { MIN, clone, def, mapC, r1, rot, unionBox, wholeSet } from "./sketch-util.js";
import { bbox, differenceOutlines, offsetPolygon, pointInPoly, selfIntersects, signedArea, unionOutlines } from "../core/geom.js";
import { variantKey, variantsFor } from "./variants.js";
import { clickVerb } from "../ui/laptop.js";

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
    this.commit();
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
  // switch the selected part to a related version, keeping its size and place
  applyVariant(spec) {
    const it = this.selected(); if (!this.canMutate(it) || it.type === "custom") return;
    const d = def(spec.id); if (!d) return;
    const b = this.boxOf(it), W = Math.max(MIN, b[2] - b[0]), H = Math.max(MIN, b[3] - b[1]);
    this.remember();
    const p = {};
    for (const [k, , v] of d.params) p[k] = v;
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
    if (axis === "x") it.x = r1(it.x + v - b[0]);
    else it.y = r1(it.y + v - b[1]);
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
  toggleLock() {
    const list = this.picked(); if (!list.length) return;
    this.remember();
    const on = !list.every((i) => i.lock);
    for (const it of list) it.lock = on;
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
  centreBetween() {
    const list = this.picked();
    if (list.length !== 1) { this.onMessage("Pick one shape, then Centre between, then two edges."); return; }
    this.centrePick = { id: list[0].id, edges: [] };
    this.onMessage("Pick the first edge, then the second.");
  }
  takeCentreEdge(hit) {
    const job = this.centrePick;
    if (!job) return false;
    if (!hit || hit.kind !== "edge" || !hit.it) { this.onMessage("Pick an edge."); return true; }
    const c = this.contoursOf(hit.it)[hit.ci];
    const pts = c && c.pts;
    if (!pts || pts.length < 2) return true;
    const i = hit.ei != null ? hit.ei : hit.vi;
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (!a || !b) return true;
    job.edges.push({ a: [...a], b: [...b] });
    if (job.edges.length < 2) { this.onMessage("Pick the second edge."); return true; }
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
    n = Math.max(2, Math.min(50, Math.round(n || 2)));
    gapX = Number(gapX); gapY = Number(gapY);
    if (!Number.isFinite(gapX)) gapX = 10; if (!Number.isFinite(gapY)) gapY = 0;
    if (Math.abs(gapX) > this.maxMm || Math.abs(gapY) > this.maxMm) { this.onMessage("That array gap is bigger than the table."); return; }
    const box = this.pickedBox();
    const dx = (box[2] - box[0]) + gapX, dy = (box[3] - box[1]) + gapY;
    if (Math.abs((n - 1) * dx) > this.maxMm || Math.abs((n - 1) * dy) > this.maxMm) { this.onMessage("That array wouldn't fit on the table."); return; }
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
    if (list.some((i) => i.lock)) { this.onMessage("Unlock the part before making a polar array."); return; }
    n = Math.max(2, Math.min(36, Math.round(n || 4)));
    const box = this.pickedBox();
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    const pcdN = Number(pcd);
    if (Number.isFinite(pcdN) && (pcdN > this.maxMm || pcdN < 0)) { this.onMessage("That bolt-circle is bigger than the table."); return; }
    let R = Number.isFinite(pcdN) && pcdN > 0 ? pcdN / 2 : Math.max(box[2] - box[0], box[3] - box[1]) / 2 + 10;
    if (!(R <= this.maxMm)) { this.onMessage("That bolt-circle is bigger than the table."); return; }
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
    if (!this.canMutate(it)) return;
    d = Number(d); if (!Number.isFinite(d) || !d) return;
    if (Math.abs(d) > this.maxMm) { this.onMessage("That offset is bigger than the table."); return; }
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
    if (this.items.some((i) => i.lock)) { this.onMessage("Unlock locked parts before nesting."); return; }
    gap = Math.max(0, Number(gap) || 10);
    sheetW = Number(sheetW) || 0; sheetH = Number(sheetH) || 0;
    if (gap > this.maxMm || sheetW > this.maxMm * 4 || sheetH > this.maxMm * 4) { this.onMessage("Those nest sizes are bigger than the table."); return; }
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
    if (this.drawPts.length < 3) { this.onMessage(clickVerb() + " at least three points, then Close."); return; }
    const pts = this.drawPts.map((p) => [r1(p[0]), r1(p[1])]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const uniq = [];
    for (const p of pts) if (!uniq.length || Math.hypot(p[0] - uniq[uniq.length - 1][0], p[1] - uniq[uniq.length - 1][1]) > 0.05) uniq.push(p);
    if (uniq.length >= 2 && Math.hypot(uniq[0][0] - uniq[uniq.length - 1][0], uniq[0][1] - uniq[uniq.length - 1][1]) < 0.05) uniq.pop();
    if (uniq.length < 3) { this.onMessage("That outline is too small or isn't a closed shape."); this.drawPts = []; this.tool = null; this.draw(); return; }
    if (uniq.some((p) => Math.abs(p[0]) > this.maxMm || Math.abs(p[1]) > this.maxMm)) { this.onMessage("That outline goes further than the table."); return; }
    const crossed = selfIntersects(uniq);
    const area = Math.abs(signedArea(uniq));
    if (!crossed && !(area > 0.05)) { this.onMessage("That outline has no area – add more points, or draw a closed shape."); this.drawPts = []; this.tool = null; this.draw(); return; }
    if (crossed) this.onMessage("That outline crosses itself – the cut check will flag it. Redraw it so the path doesn't cross.");
    const b = bbox([{ pts: uniq }]);
    this.remember();
    const it = { id: this.nextId++, type: "custom", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      shape: { cs: [{ pts: uniq.map(([x, y]) => [r1(x - b[0]), r1(y - b[1])]), closed: true, bulges: uniq.map(() => 0) }] } };
    this.items.push(it);
    this.pick([it.id]); this.tool = null; this.drawPts = [];
    this.commit(); this.onSelect();
    this.onMessage("Outline closed. Drag a corner to move it, or click an edge to type its length.");
  }
  setParam(k, v) {
    const it = this.selected(); if (!this.canMutate(it) || !Number.isFinite(v)) return;
    const sizeKeys = ["w", "h", "d", "a", "b", "len", "wid", "s"];
    if (sizeKeys.includes(k) && (v < MIN || v > this.maxMm)) return;
    if (["n", "cols", "rows"].includes(k)) v = Math.max(0, Math.min(64, v));
    if (Math.abs(v) > this.maxMm * 4) return;
    it.p[k] = v; this.save(); this.draw();
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
      const okW = Math.abs(aw - W) < 0.005, okH = Math.abs(ah - H) < 0.005;
      if (keep ? (which === "h" ? okH : okW) : (okW && okH)) break;
      if (keep) { const f = which === "h" ? H / ah : W / aw; sx *= f; sy *= f; }
      else { sx *= W / aw; sy *= H / ah; }
      apply(sx, sy);
    }
    this.commit(); this.onSelect();
    return true;
  }
}

// Sketch: the commands that change the picked shapes (turn, mirror, align, join, variants, position, lock, size). The arrays
// and spacing are in sketch-arrange.js, offset / subtract / nest / drawn outlines in sketch-shapeops.js (split in r16).
import { MIN, cleanContour, def, mapC, r1, rot, unionBox, wholeSet } from "./sketch-util.js";
import { bbox, classifyContainment, unionMany } from "../core/geom.js";
import { fitContour } from "../core/arcs.js";
import { variantKey, variantsFor } from "./variants.js";
import { carryFeatures, keepMatching, moveFeatureBy } from "./part-features.js";

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
    // r15 2.13: features are not baked into the joined outline; they are carried over as rows (below)
    const featParts = parts.filter((p) => p.feats && p.feats.length), stash = featParts.map((p) => p.feats);
    for (const p of featParts) { delete p.feats; p._key = undefined; }
    try { this.joinParts(list, parts, holeItems, keyways, explicit, featParts, stash); }
    finally { featParts.forEach((p, i) => { if (!p.feats) p.feats = stash[i]; p._key = undefined; }); }
  }
  joinParts(list, parts, holeItems, keyways, explicit, featParts, stash) {
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
    featParts.forEach((p, k) => { p.feats = stash[k]; p._key = undefined; });   // back before the undo snapshot
    this.remember();
    const it = { id: this.nextId++, type: "custom", name: "Outline", p: { scale: 100 }, x: r1(b[0]), y: r1(b[1]), rot: 0, holes: {},
      shape: { cs: allLoops.map(local) } };
    const carried = carryFeatures(this, featParts, it);
    if (carried.length) it.feats = carried;
    const drop = new Set([...list.filter((i) => !stray.includes(i) || swallowedIn.includes(i)), ...swallowedIn]);
    this.items = this.items.filter((i) => !drop.has(i));
    this.items.push(it);
    this.pick([it.id]);
    this.commit(); this.onSelect();
    const notes = [];
    notes.push(`Joined into one Outline${kept.length ? ` with ${kept.length} hole${kept.length > 1 ? "s" : ""}` : ""}${carried.length ? `; its ${carried.length} feature${carried.length > 1 ? "s" : ""} stay as rows` : ""}.`);
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

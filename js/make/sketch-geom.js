// Sketch: where a shape really is (base and world outlines, bounding boxes) and which holes belong to which part.
import { bbox, expandContour, pointInPoly } from "../core/geom.js";
import { contoursToEditable } from "./editable.js";
import { def, mapC, r1, rot, unionBox, wholeSet } from "./sketch-util.js";
import { makeShape } from "./shapes.js";

export class GeomMethods {
  baseContours(it) {
    if (it.type === "custom") {
      const k = (it.p.scale || 100) / 100;
      return it.shape.cs.map((c) => {
        const scaled = mapC(c, ([x, y]) => [x * k, y * k]);
        if (c.circle) scaled.circle = { cx: c.circle.cx * k, cy: c.circle.cy * k, r: c.circle.r * k };
        return expandContour(scaled);
      });
    }
    return makeShape(it.type, it.p);
  }
  rawBase(it) {
    const k = (it.p.scale || 100) / 100;
    return it.shape.cs.map((c) => {
      const o = mapC(c, ([x, y]) => [x * k, y * k]);
      if (c.circle) o.circle = { cx: c.circle.cx * k, cy: c.circle.cy * k, r: c.circle.r * k };
      if (c.bulges) o.bulges = c.bulges.slice();
      return o;
    });
  }
  rawWorld(it) {
    let cs = this.rawBase(it);
    const flip = (c, fx) => {
      const srcB = (c.bulges || []).slice();
      const m = mapC(c, ([x, y]) => fx ? [-x, y] : [x, -y]);
      m.pts.reverse();
      m.bulges = this.reverseBulges(c.pts.length, c.closed !== false, srcB);
      return m;
    };
    if (it.fx) cs = cs.map((c) => flip(c, true));
    if (it.fy) cs = cs.map((c) => flip(c, false));
    if (it.rot) cs = cs.map((c) => mapC(c, (pt) => rot(pt, it.rot)));
    if (!cs.length) return cs;
    const b = wholeSet(it.type) ? bbox(cs) : bbox([cs[0]]);
    return cs.map((c) => mapC(c, ([x, y]) => [x - b[0] + it.x, y - b[1] + it.y]));
  }
  reverseBulges(n, closed, bulges) {
    // After reversing vertices, each edge flips direction so the bulge sign flips,
    // and the leftover bulge (between last and first on a closed loop) moves with it.
    const src = (bulges || []).slice();
    while (src.length < n) src.push(0);
    const out = [];
    if (closed) {
      // reversed pts: old n-1, n-2, ..., 0. new edge i is old edge (n-2-i) with flipped sign? 
      // old edges: i -> i+1 with b[i]; after reverse, vertex order n-1..0, new edge from old i+1 to old i is -b[i].
      for (let i = 0; i < n; i++) out.push(-(src[(n - 1 - i)] || 0));
      // Wait: new vertex i is old (n-1-i). New edge i goes to new i+1 = old (n-2-i) = old vertex just before old (n-1-i) in original? 
      // new[i] = old[n-1-i], new[i+1] = old[n-2-i]. Original edge from old[n-2-i] to old[n-1-i] is b[n-2-i]. Flipped = -b[n-2-i].
      // So out[i] = -src[n-2-i]. For i=n-1, new last to first: new[n-1]=old[0], new[0]=old[n-1], original edge n-1: old[n-1]->old[0] = b[n-1], flipped -b[n-1]. n-2-(n-1)= -1 + n = n-1. Yes -src[n-1].
      out.length = 0;
      for (let i = 0; i < n; i++) out.push(-(src[(n - 2 - i + n) % n] || 0));
    } else {
      for (let i = 0; i < n - 1; i++) out.push(-(src[n - 2 - i] || 0));
      out.push(0);
    }
    return out;
  }
  holeStart(it) { return wholeSet(it.type) ? Infinity : 1; }
  contoursOf(it) {
    const key = JSON.stringify([it.type, it.p, it.holes, it.rot, it.fx, it.fy, it.x, it.y, it.type === "custom" ? it.shape.cs : 0]);
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
      const b = wholeSet(it.type) ? bbox(cs) : bbox([cs[0]]);
      cs = cs.map((c) => mapC(c, ([x, y]) => [x - b[0] + it.x, y - b[1] + it.y]));
    }
    Object.defineProperty(it, "_cs", { value: cs, writable: true, enumerable: false, configurable: true });
    Object.defineProperty(it, "_key", { value: key, writable: true, enumerable: false, configurable: true });
    return cs;
  }
  boxOf(it) {
    const c = this.contoursOf(it);
    if (!c.length) return [it.x, it.y, it.x, it.y];
    return wholeSet(it.type) ? bbox(c) : bbox([c[0]]);
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
  // the part a picked hole (or hole pattern) sits in
  hostPart(it) {
    if (!it || !this.isHole(it)) return null;
    return this.hostOf(it) || (wholeSet(it.type) ? this.hostOfBox(it, this.items.filter((o) => !this.isHole(o))) : null);
  }
  // a hole (or every hole of a pattern) sits wholly in the part's material: not over its edge, not in one of its own openings such as a ring's bore
  holeFitsIn(it, host) {
    const hc = this.contoursOf(host), cs = this.contoursOf(it); if (!cs.length || !hc.length) return false;
    const inMaterial = (p) => hc.filter((k) => pointInPoly(p, k.pts)).length % 2 === 1;
    return cs.every((c) => c.pts.every(inMaterial));
  }
  // move a new hole to the middle of a part, or to the solid place nearest the middle; false when it fits nowhere (it is left in the middle)
  placeHoleIn(it, host) {
    const hb = this.boxOf(host), moveTo = (cx, cy) => { const b = this.boxOf(it); it.x = r1(it.x + cx - (b[0] + b[2]) / 2); it.y = r1(it.y + cy - (b[1] + b[3]) / 2); };
    const mx = (hb[0] + hb[2]) / 2, my = (hb[1] + hb[3]) / 2;
    moveTo(mx, my); if (this.holeFitsIn(it, host)) return true;
    const b = this.boxOf(it), w = b[2] - b[0], h = b[3] - b[1], step = Math.max(1, Math.min(w, h) / 2, (hb[2] - hb[0]) / 40, (hb[3] - hb[1]) / 40), spots = [];
    for (let x = hb[0] + w / 2; x <= hb[2] - w / 2 + 1e-6; x += step) for (let y = hb[1] + h / 2; y <= hb[3] - h / 2 + 1e-6; y += step) spots.push([x, y]);
    spots.sort((a, c) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(c[0] - mx, c[1] - my));
    for (const [x, y] of spots) { moveTo(x, y); if (this.holeFitsIn(it, host)) return true; }
    moveTo(mx, my); return false;
  }
  // pick the part that holds the picked hole (so you can get back to it after adding holes)
  pickHost() {
    const host = this.hostPart(this.selected());
    if (host) { this.pick([host.id]); this.draw(); this.onSelect(); }
    return !!host;
  }
  // put the picked hole (or hole pattern) dead in the middle of its part
  centreInHost() {
    const it = this.selected(), host = this.hostPart(it);
    if (!this.canMutate(it) || !host) return false;
    this.remember();
    const hb = this.boxOf(host), b = this.boxOf(it);
    it.x = r1(it.x + (hb[0] + hb[2]) / 2 - (b[0] + b[2]) / 2);
    it.y = r1(it.y + (hb[1] + hb[3]) / 2 - (b[1] + b[3]) / 2);
    this.commit(); this.onSelect();
    return true;
  }
  // a flat-pattern set (like the square-to-round pieces) turned into separate parts, so each can be put on the bed on its own
  explode() {
    const it = this.selected();
    if (!it || it.lock || !def(it.type) || !def(it.type).sheet) return 0;
    const e = contoursToEditable(this.contoursOf(it));
    if (!e || !e.parts.length) return 0;
    this.remember();
    this.items = this.items.filter((o) => o !== it);
    const first = this.nextId;
    this.importParts(e.parts, false);
    this.past.pop();                                   // importParts took its own undo step; one Undo brings the set back
    this.pick(this.items.filter((o) => o.id >= first).map((o) => o.id));
    this.commit(); this.onSelect();
    return e.parts.length;
  }
  // ---- the sheet layout: a hole drawn inside a part belongs to that part (it moves, turns, copies and goes with it; it is never moved on its own)
  ownedHoles(host) {
    if (!this.layout || !this._holes || !this._holes.size || !host) return [];
    return this.items.filter((o) => o !== host && this._holes.has(o.id) && this.isHole(o) && this.hostPart(o) === host);
  }
  holeOwner(it) {
    if (!this.layout || !this._holes || !it || !this._holes.has(it.id) || !this.isHole(it)) return null;
    return this.hostPart(it) || null;
  }
  carryOwned(fn, quarter = null) {                       // run fn (it moves / turns the picked parts), then bring each picked part's own holes along rigidly
    if (!this.layout || !this._holes || !this._holes.size) return fn();
    const ref = (h) => { const c = this.contoursOf(h)[0]; return c && c.pts.length > 1 ? [c.pts[0], c.pts[1]] : null; };
    const mid = (h) => { const b = this.boxOf(h); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
    const pre = this.picked().filter((i) => !this._holes.has(i.id)).map((h) => ({ h, own: this.ownedHoles(h), p: ref(h), m: mid(h) })).filter((x) => x.own.length && x.p);
    const r = fn();
    for (const { h, own, p, m } of pre) {
      const q = ref(h); if (!q) continue;
      // a quarter turn swaps width / height (the outline's points are renumbered), so there the turn is known: R(deg) about the old middle, then to the new middle
      const qt = quarter != null && Math.abs(quarter % 90) < 1e-9;
      const a = qt ? quarter * Math.PI / 180 : Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) - Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]), ca = Math.cos(a), sa = Math.sin(a);
      const m2 = mid(h);
      const T = qt ? (x, y) => [m2[0] + ca * (x - m[0]) - sa * (y - m[1]), m2[1] + sa * (x - m[0]) + ca * (y - m[1])]
        : (x, y) => [q[0][0] + ca * (x - p[0][0]) - sa * (y - p[0][1]), q[0][1] + sa * (x - p[0][0]) + ca * (y - p[0][1])];
      for (const o of own) {
        const b = this.boxOf(o), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], t = T(c[0], c[1]);
        if (Math.abs(a) > 1e-9) {
          o.rot = ((((o.rot || 0) + a * 180 / Math.PI) % 360) + 360) % 360;
          const nb = this.boxOf(o); o.x = r1(o.x + t[0] - (nb[0] + nb[2]) / 2); o.y = r1(o.y + t[1] - (nb[1] + nb[3]) / 2);
        } else { o.x = r1(o.x + t[0] - c[0]); o.y = r1(o.y + t[1] - c[1]); }
      }
    }
    if (pre.length) this.commit();
    return r;
  }
}

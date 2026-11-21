// Sketch: where a shape really is (base and world outlines, bounding boxes) and which holes belong to which part.
import { bbox, classifyContainment, classifyLoops, expandContour, pointInPoly } from "../core/geom.js";
import { contoursToEditable } from "./editable.js";
import { def, mapC, r1, rot, unionBox, wholeSet } from "./sketch-util.js";
import { makeShape } from "./shapes.js";
import { flattenFeatures } from "./part-features.js";

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
    const b = bbox(cs);
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
  holeStart(it) {
    if (wholeSet(it.type)) return Infinity;
    if (it.type === "custom" && it.shape && it.shape.cs) {
      const n = classifyLoops(it.shape.cs).outers.length;
      return Math.max(1, n);
    }
    return 1;
  }
  contoursOf(it) {
    const key = JSON.stringify([it.type, it.p, it.holes, it.rot, it.fx, it.fy, it.x, it.y, it.type === "custom" ? it.shape.cs : 0, it.feats || 0]);
    if (it._key === key) return it._cs;
    let cs;
    try { cs = this.baseContours(it); } catch (e) { cs = []; }
    cs = cs.filter((c) => c && c.pts && (c.pts.length >= 3 || (c.pts.length >= 2 && (c.closed === false || c.op === "score" || c.op === "mark" || c.role === "bend"))));
    if (cs.length) {
      const hs = this.holeStart(it);
      cs = cs.map((c, i) => (i >= hs && it.holes && it.holes[i] ? mapC(c, ([x, y]) => [x + it.holes[i][0], y + it.holes[i][1]]) : c));
      if (it.feats && it.feats.length && !wholeSet(it.type)) { const o = bbox([cs[0]]); cs = cs.concat(flattenFeatures(it.feats, o[0], o[1])); }   // r15 Round 2: features flatten to plain contours
      if (it.fx) cs = cs.map((c) => { const m = mapC(c, ([x, y]) => [-x, y]); m.pts.reverse(); return m; });
      if (it.fy) cs = cs.map((c) => { const m = mapC(c, ([x, y]) => [x, -y]); m.pts.reverse(); return m; });
      if (it.rot) cs = cs.map((c) => mapC(c, (p) => rot(p, it.rot)));
      const b = bbox(cs);
      cs = cs.map((c) => mapC(c, ([x, y]) => [x - b[0] + it.x, y - b[1] + it.y]));
    }
    Object.defineProperty(it, "_cs", { value: cs, writable: true, enumerable: false, configurable: true });
    Object.defineProperty(it, "_key", { value: key, writable: true, enumerable: false, configurable: true });
    return cs;
  }
  partToWorld(it, pts) {                                 // part-frame points (bottom-left of the outline = 0,0) -> world, same transform as contoursOf
    let base; try { base = this.baseContours(it)[0]; } catch (e) { base = null; }
    const world = this.contoursOf(it)[0];
    if (!base || !world) return [];
    const o = bbox([base]);
    const R = ([x, y]) => { if (it.fx) x = -x; if (it.fy) y = -y; return it.rot ? rot([x, y], it.rot) : [x, y]; };
    const rb = bbox([{ pts: base.pts.map(R) }]), wb = bbox([world]);
    return pts.map(([x, y]) => { const [a, b] = R([x + o[0], y + o[1]]); return [a + wb[0] - rb[0], b + wb[1] - rb[1]]; });
  }
  partWidth(it) {                                       // outline width in the part's own frame (features are measured in it)
    try { const c = this.baseContours(it)[0]; if (c) { const b = bbox([c]); return b[2] - b[0]; } } catch (e) { /* no outline */ }
    return 0;
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
  // An item is a hole if it is an explicit hole type, or its whole outline sits
  // in another part's material. A first vertex that merely falls inside (or on)
  // another outline is not enough — overlapping lobes and corner-sharing L's stay parts.
  isExplicitHole(it) {
    const d = def(it.type);
    return !!(d && (d.hole || d.multi));
  }
  isHole(it) {
    if (this.isExplicitHole(it)) return true;
    return !!this.hostOf(it);
  }
  loopsOf(it) {
    const cs = this.contoursOf(it);
    if (wholeSet(it.type) || (def(it.type) && def(it.type).sheet)) return { outers: cs, holes: [] };
    return classifyLoops(cs);
  }
  order() { return [...this.items].sort((a, b) => (this.isHole(a) ? 1 : 0) - (this.isHole(b) ? 1 : 0)); }
  hostOfBox(it, among) {
    const b = this.boxOf(it), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    return among.find((o) => this.contoursOf(o)[0] && pointInPoly(c, this.contoursOf(o)[0].pts)) || null;
  }
  hostOf(it) {
    const loops = this.loopsOf(it);
    const pts = loops.outers[0] && loops.outers[0].pts;
    if (!pts) return null;
    let best = null, bestA = Infinity;
    for (const o of this.items) {
      if (o === it || this.isExplicitHole(o)) continue;
      const rel = classifyContainment(pts, this.contoursOf(o));
      if (rel !== "inside") continue;
      const b = this.boxOf(o);
      const a = Math.max(0, (b[2] - b[0]) * (b[3] - b[1]));
      if (a < bestA) { best = o; bestA = a; }
    }
    return best;
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
  // Closest point of the part's solid material to (x, y). Used so a hole on an L or
  // other non-rectangle is not dropped in the empty bounding-box middle.
  nearestSolidPoint(host, x, y) {
    const hc = this.contoursOf(host);
    if (!hc.length) return null;
    const inMaterial = (p) => hc.filter((k) => pointInPoly(p, k.pts)).length % 2 === 1;
    if (inMaterial([x, y])) return [x, y];
    const hb = this.boxOf(host);
    const step = Math.max(1, Math.min(2, (hb[2] - hb[0]) / 80, (hb[3] - hb[1]) / 80));
    let best = null, bestD = Infinity;
    for (let px = hb[0] + step / 2; px <= hb[2] + 1e-9; px += step) {
      for (let py = hb[1] + step / 2; py <= hb[3] + 1e-9; py += step) {
        if (!inMaterial([px, py])) continue;
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) { bestD = d; best = [px, py]; }
      }
    }
    return best;
  }
  // Move a new hole to the solid place nearest the part's middle. Prefer a pose where
  // the whole hole sits in the material; if it cannot fit, still put its centre on
  // solid metal (not in the empty inside corner of an L). False when it does not fully fit.
  placeHoleIn(it, host) {
    const hb = this.boxOf(host), moveTo = (cx, cy) => { const b = this.boxOf(it); it.x = r1(it.x + cx - (b[0] + b[2]) / 2); it.y = r1(it.y + cy - (b[1] + b[3]) / 2); };
    const mx = (hb[0] + hb[2]) / 2, my = (hb[1] + hb[3]) / 2;
    const solid = this.nearestSolidPoint(host, mx, my);
    moveTo(mx, my); if (this.holeFitsIn(it, host)) return true;
    if (solid) { moveTo(solid[0], solid[1]); if (this.holeFitsIn(it, host)) return true; }
    const b = this.boxOf(it), w = b[2] - b[0], h = b[3] - b[1];
    const step = Math.max(1, Math.min(4, w / 4, h / 4, (hb[2] - hb[0]) / 50, (hb[3] - hb[1]) / 50));
    const spots = [];
    for (let x = hb[0] + w / 2; x <= hb[2] - w / 2 + 1e-6; x += step) for (let y = hb[1] + h / 2; y <= hb[3] - h / 2 + 1e-6; y += step) spots.push([x, y]);
    spots.sort((a, c) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(c[0] - mx, c[1] - my));
    for (const [x, y] of spots) { moveTo(x, y); if (this.holeFitsIn(it, host)) return true; }
    if (solid) moveTo(solid[0], solid[1]); else moveTo(mx, my);
    return false;
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
    if (!host) return [];
    if (this.layout && this._holes && this._holes.size) {
      return this.items.filter((o) => o !== host && this._holes.has(o.id) && this.isHole(o) && this.hostPart(o) === host);
    }
    // Make a part: a separate hole item that sits in this host travels with it.
    return this.items.filter((o) => o !== host && this.isHole(o) && (this.hostPart(o) || this.hostOf(o)) === host);
  }
  // Shrink a bolt-circle or corner-hole pattern so it fits inside the host plate with an edge gap (C15, F4).
  fitPatternToHost(it, host) {
    if (!it || !host) return true;
    if (it.type !== "boltcircle" && it.type !== "cornerholes") return true;
    const hb = this.boxOf(host);
    if (!hb) return true;
    const w = hb[2] - hb[0], h = hb[3] - hb[1];
    const hole = Math.max(0, Number(it.p.hole) || 0);
    const gap = Math.max(5, hole * 0.5);
    if (it.type === "boltcircle") {
      const maxPcd = Math.max(0, Math.min(w, h) - hole - 2 * gap);
      const cur = Number(it.p.pcd) || 0;
      if (cur > maxPcd + 0.05) {
        if (maxPcd < hole + 1) {
          this.onMessage("That ring of holes does not fit on this plate. Make the plate bigger or the holes smaller.");
          return false;
        }
        it.p.pcd = Math.round(maxPcd * 10) / 10;
        this.onMessage("Ring Ø set to " + it.p.pcd + " mm so it fits on the plate with a " + Math.round(gap) + " mm edge gap.");
      }
      return true;
    }
    // Corner holes (4): default the centre-to-centre size from the part, inset from the edges.
    const maxW = Math.max(0, w - hole - 2 * gap);
    const maxH = Math.max(0, h - hole - 2 * gap);
    if (maxW < 0.5 || maxH < 0.5) {
      this.onMessage("Those corner holes do not fit on this part. Make the part bigger or the holes smaller.");
      return false;
    }
    it.p.w = Math.round(maxW * 10) / 10;
    it.p.h = Math.round(maxH * 10) / 10;
    this.onMessage("Corner holes set to " + it.p.w + " × " + it.p.h + " mm centre-to-centre, in from the edges.");
    return true;
  }
  holePlacementWhy(it, host) {
    if (!it || !host) return "That hole could not be placed on the part.";
    const hb = this.boxOf(host), b = this.boxOf(it);
    if (!hb || !b) return "That hole could not be placed on the part.";
    const hole = Math.max(Number(it.p.hole) || 0, Number(it.p.d) || 0, b[2] - b[0], b[3] - b[1]);
    const pw = hb[2] - hb[0], ph = hb[3] - hb[1];
    if (hole > Math.min(pw, ph) + 0.05) {
      return "That hole is bigger than the solid part of the shape. Make the hole smaller or the part bigger.";
    }
    return "Those holes sit outside the part. Move them in from the edges, or make the part bigger.";
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

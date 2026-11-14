// C40–C45 (and C42 nest hook helpers): group, driving dimensions, sliver merge,
// rotate about a point, scale by percent. Nest itself lives in sketch-edit.js so
// the existing method is replaced in one place.
import { MIN, clone, def, r1, rot, unionBox } from "./sketch-util.js";
import { bbox, signedArea, unionOutlines } from "../core/geom.js";
import { nestUnitsSync, turnAngles, applyPlacement, ringsBox } from "../cut/nest.js";

const closeSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1]), t };
};

export class Stage6Methods {
  nextGroupId() {
    let m = 0;
    for (const it of this.items) if (Number(it.gid) > m) m = Number(it.gid);
    return m + 1;
  }
  groupMates(it) {
    if (!it || !it.gid) return it ? [it] : [];
    return this.items.filter((o) => o.gid === it.gid);
  }
  expandGroup(list) {
    const out = [], seen = new Set();
    const add = (it) => {
      if (!it || seen.has(it.id)) return;
      seen.add(it.id); out.push(it);
    };
    for (const it of list || []) {
      for (const m of this.groupMates(it)) add(m);
      for (const h of this.ownedHoles(it) || []) add(h);
    }
    return out;
  }
  groupIdsOf(it) { return this.groupMates(it).map((o) => o.id); }

  group() {
    const list = this.picked().filter((i) => this.canMutate(i) || i.lock);
    if (list.length < 2) { this.onMessage("Pick two or more parts to group. Group keeps them separate (it does not join the metal)."); return; }
    this.remember();
    const gid = this.nextGroupId();
    for (const it of list) it.gid = gid;
    this.commit(); this.onSelect();
    this.onMessage(`Grouped ${list.length} parts. They move together; Join if you want one outline.`);
  }
  ungroup() {
    const list = this.expandGroup(this.picked());
    if (!list.some((i) => i.gid)) { this.onMessage("Those parts are not in a group."); return; }
    this.remember();
    for (const it of list) delete it.gid;
    this.commit(); this.onSelect();
    this.onMessage("Ungrouped.");
  }

  // Rotate the picked set about a world point (C45). Turn 90° still uses rotateBy (bottom-left).
  rotateAbout(cx, cy, deg) {
    const list = this.expandGroup(this.picked().filter((i) => this.canMutate(i)));
    if (!list.length || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(deg)) return;
    this.remember();
    const pivot = [cx, cy];
    for (const it of list) {
      const b = this.boxOf(it);
      const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const rel = rot([c[0] - pivot[0], c[1] - pivot[1]], deg);
      const want = [pivot[0] + rel[0], pivot[1] + rel[1]];
      it.rot = (((it.rot || 0) + deg) % 360 + 360) % 360;
      const nb = this.boxOf(it);
      const got = [(nb[0] + nb[2]) / 2, (nb[1] + nb[3]) / 2];
      it.x = r1(it.x + (want[0] - got[0]));
      it.y = r1(it.y + (want[1] - got[1]));
    }
    this.commit(); this.onSelect();
  }

  // Scale the picked set about a world point, as a percent (100 = unchanged).
  scaleBy(pct, cx, cy) {
    const f = (Number(pct) || 0) / 100;
    const list = this.expandGroup(this.picked().filter((i) => this.canMutate(i)));
    if (!list.length) return;
    if (!(f > 0) || f > 50) { this.onMessage("Scale needs a percent between 1 and 5000."); return; }
    const px = Number.isFinite(cx) ? cx : null, py = Number.isFinite(cy) ? cy : null;
    this.remember();
    for (const it of list) {
      const b = this.boxOf(it);
      const piv = [px == null ? (b[0] + b[2]) / 2 : px, py == null ? (b[1] + b[3]) / 2 : py];
      if (it.type !== "custom") this.toEditableCustom(it);
      const cs = this.rawWorld(it).map((c) => {
        const pts = c.pts.map(([x, y]) => [piv[0] + (x - piv[0]) * f, piv[1] + (y - piv[1]) * f]);
        const o = { ...c, pts, closed: c.closed !== false, bulges: (c.bulges || []).slice() };
        if (c.circle) o.circle = { cx: piv[0] + (c.circle.cx - piv[0]) * f, cy: piv[1] + (c.circle.cy - piv[1]) * f, r: c.circle.r * f };
        return o;
      });
      this.writeWorldCs(it, cs);
      if (it.p && Number.isFinite(Number(it.p.scale))) it.p.scale = 100;
    }
    this.commit(); this.onSelect();
    this.onMessage(`Scaled to ${r1(pct)} %.`);
  }

  startRotatePick(deg) {
    this.rotatePick = { deg: Number(deg) || 90 };
    this.setTool && this.setTool("rotpt");
    this.onMessage("Click the point to rotate about.");
  }
  startScalePick(pct, mode) {
    this.scalePick = { pct: Number(pct) || 50, mode: mode || "centre" };
    if (mode === "click") {
      this.setTool && this.setTool("scale");
      this.onMessage("Click the point to scale about.");
      return;
    }
    const list = this.expandGroup(this.picked());
    if (!list.length) { this.onMessage("Pick a part to scale."); return; }
    const b = unionBox(list.map((i) => this.boxOf(i)));
    const piv = mode === "corner" ? [b[0], b[1]] : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    this.scaleBy(this.scalePick.pct, piv[0], piv[1]);
    this.scalePick = null;
  }

  // C40: click two features (hole centre or an edge) and type the distance.
  startDriveDim() {
    this.drivePick = { a: null };
    this.setTool && this.setTool("drive");
    this.onMessage("Click a hole (or an edge), then the other feature, and type the distance.");
  }
  featureAt(wx, wy) {
    const hits = [];
    for (const it of this.items) {
      if (it.hide) continue;
      const d = def(it.type);
      const b = this.boxOf(it);
      const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const isHole = !!(d && d.hole) || this.isHole(it);
      const isRound = !!(d && (d.id === "disc" || d.id === "hole" || it.p && it.p.d && !it.p.w));
      if (isHole || isRound) {
        const dist = Math.hypot(wx - c[0], wy - c[1]);
        const rad = (b[2] - b[0]) / 2;
        if (dist <= rad + 8) hits.push({ kind: "hole", it, c, d: dist, rad });
      }
      const cs = (it.type === "custom" ? this.rawWorld(it) : this.contoursOf(it));
      for (let ci = 0; ci < cs.length; ci++) {
        const pts = cs[ci].pts, n = pts.length, closed = cs[ci].closed !== false;
        const last = closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
          const hit = closeSeg([wx, wy], pts[i], pts[(i + 1) % n]);
          if (hit.d < 8) hits.push({ kind: "edge", it, ci, ei: i, a: pts[i], b: pts[(i + 1) % n], q: hit.q, d: hit.d });
        }
      }
    }
    hits.sort((a, b) => a.d - b.d);
    return hits[0] || null;
  }
  featureDistance(a, b) {
    if (!a || !b) return null;
    if (a.kind === "hole" && b.kind === "hole") return Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]);
    const hole = a.kind === "hole" ? a : b.kind === "hole" ? b : null;
    const edge = a.kind === "edge" ? a : b.kind === "edge" ? b : null;
    if (hole && edge) return closeSeg(hole.c, edge.a, edge.b).d;
    if (a.kind === "edge" && b.kind === "edge") {
      return Math.min(closeSeg(a.q || a.a, b.a, b.b).d, closeSeg(b.q || b.a, a.a, a.b).d);
    }
    return null;
  }
  applyDriveDim(a, b, dist) {
    if (!a || !b || !Number.isFinite(dist) || dist < 0) return false;
    const movable = (f) => f && this.canMutate(f.it) && (f.kind === "hole" || f.kind === "centre");
    // Prefer to move a hole; if both are holes, move the second click.
    const move = (movable(b) ? b : movable(a) ? a : null);
    const other = move === b ? a : b;
    if (!move) { this.onMessage("Driving dimensions can move a hole. Click a hole and an edge (or two holes)."); return false; }
    const now = this.featureDistance(move, other);
    if (!(now > 1e-6)) { this.onMessage("Those two features already sit on top of each other."); return false; }
    const from = move.c;
    let toward;
    if (other.kind === "hole") toward = other.c;
    else {
      const h = closeSeg(from, other.a, other.b);
      toward = h.q;
    }
    const ux = (from[0] - toward[0]) / now, uy = (from[1] - toward[1]) / now;
    const want = [toward[0] + ux * dist, toward[1] + uy * dist];
    this.remember();
    move.it.x = r1(move.it.x + (want[0] - from[0]));
    move.it.y = r1(move.it.y + (want[1] - from[1]));
    move.it.drive = { dist, other: other.it.id, kind: other.kind === "hole" ? "hole-hole" : "hole-edge" };
    this.commit(); this.onSelect();
    this.onMessage(`Set to ${r1(dist)} mm.`);
    return true;
  }

  // C44: drop sliver holes and merge holes whose gap is closer than the kerf.
  // Explicit command — it does not run on every Join, so intentional thin webs stay until you ask.
  mergeSlivers(kerf) {
    const k = Math.max(0.2, Number(kerf) || 1.5);
    const list = this.expandGroup(this.picked().length ? this.picked() : this.items).filter((i) => this.canMutate(i) && !this.isHole(i));
    if (!list.length) { this.onMessage("Pick a part first, then merge slivers."); return 0; }
    this.remember();
    let n = 0;
    for (const it of list) {
      if (it.type !== "custom") this.toEditableCustom(it);
      const world = this.rawWorld(it);
      const closed = world.filter((c) => c.closed !== false && c.pts && c.pts.length >= 3);
      if (closed.length < 2) continue;
      const areas = closed.map((c) => Math.abs(signedArea(c.pts)));
      const outerI = areas.indexOf(Math.max(...areas));
      const holes = closed.map((c, i) => i).filter((i) => i !== outerI);
      const keep = [];
      for (const i of holes) {
        const c = closed[i];
        const b = bbox([c]);
        const minSide = Math.min(b[2] - b[0], b[3] - b[1]);
        if (areas[i] < k * k * 2 || minSide < k) { n++; continue; }
        keep.push(c);
      }
      // merge holes closer than kerf (fills the burned-away web)
      let merged = keep.map((c) => c.pts);
      let grew = true;
      while (grew) {
        grew = false;
        outer: for (let i = 0; i < merged.length; i++) for (let j = i + 1; j < merged.length; j++) {
          const d = outlineDist(merged[i], merged[j]);
          if (d < k) {
            const u = unionHoles(merged[i], merged[j], k);
            if (u) { merged[i] = u; merged.splice(j, 1); n++; grew = true; break outer; }
          }
        }
      }
      const next = [closed[outerI], ...merged.map((pts) => ({ pts, closed: true, bulges: pts.map(() => 0) }))];
      // keep any open etch / bend lines
      for (const c of world) if (c.closed === false) next.push(c);
      this.writeWorldCs(it, next);
    }
    this.commit(); this.onSelect();
    this.onMessage(n ? `Merged ${n} sliver${n === 1 ? "" : "s"} closer than ${r1(k)} mm.` : `No slivers closer than ${r1(k)} mm.`);
    return n;
  }
}

function outlineDist(A, B) {
  let d = Infinity;
  for (let i = 0; i < A.length; i++) {
    const a0 = A[i], a1 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b0 = B[j], b1 = B[(j + 1) % B.length];
      d = Math.min(d, closeSeg(a0, b0, b1).d, closeSeg(a1, b0, b1).d, closeSeg(b0, a0, a1).d, closeSeg(b1, a0, a1).d);
    }
  }
  return d;
}
function unionHoles(A, B, kerf) {
  try {
    const u = unionOutlines([A, B]);
    if (u && u.outer && u.outer.length >= 3) return u.outer;
  } catch (e) { /* fall through and bridge */ }
  // if they don't overlap, add a thin capsule between closest points and union
  let best = null, bd = Infinity;
  for (const p of A) for (const q of B) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bd) { bd = d; best = [p, q]; }
  }
  if (!best) return A;
  const [p, q] = best;
  const vx = q[0] - p[0], vy = q[1] - p[1], L = Math.hypot(vx, vy) || 1;
  const nx = -vy / L * (kerf / 2), ny = vx / L * (kerf / 2);
  const cap = [
    [p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny],
    [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny],
  ];
  try {
    const u = unionOutlines([A, cap, B]);
    if (u && u.outer) return u.outer;
  } catch (e) { /* leave as-is */ }
  return A;
}

// re-export nest helpers so sketch-edit can import from one place if useful
export { nestUnitsSync, turnAngles, applyPlacement, ringsBox };

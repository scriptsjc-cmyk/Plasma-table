// Sketch: spacing and copies of the picked shapes (distribute, centre between two edges, linear and polar arrays).
// Split from sketch-edit.js in r16; mixed into the Sketch in sketch.js like the other method groups.
import { clone, distToEdge, r1, rot } from "./sketch-util.js";

export class ArrangeMethods {
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
    // r15 3.11: "0 = auto" spaces the copies so they clear each other by 10 mm whichever way they turn (the part's diagonal
    // fits between neighbours); it used to be half the part + 10 mm, which stacked the copies on top of each other.
    const diag = Math.hypot(box[2] - box[0], box[3] - box[1]);
    let R = Number.isFinite(pcdN) && pcdN > 0 ? pcdN / 2 : Math.max(diag / 2 + 10, (diag + 10) / (2 * Math.sin(Math.PI / n)));
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
}

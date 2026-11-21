// r15 8.6: the Sketch's Features methods (Round 2): Corners rows (2.12 Fillet / Chamfer / Relief on a shape with its own
// sizes) and the corner pick. Mixed into Sketch like the other sketch-*.js method sets; the row model is in part-features.js.
import { bbox } from "../core/geom.js";
import { wholeSet } from "./sketch-util.js";
import { applyCorners, cornerIndices, cornerRows } from "./part-features.js";

export class FeatureMethods {
  // ---- r15 2.12: Fillet / Chamfer / Relief on a shape with its own sizes adds a Corners row; it never becomes a fixed outline
  cornerRowable(it) { return !!it && it.type !== "custom" && !this.isHole(it) && !wholeSet(it.type) && !this.layout; }
  cornerList(it) {                                      // sharp corners of the shape's own outline, with where they are on the table
    let base; try { base = this.baseContours(it)[0]; } catch (e) { base = null; }
    if (!base) return [];
    const o = bbox([base]), list = cornerIndices(base.pts);
    const world = this.partToWorld(it, list.map((c) => [base.pts[c.i][0] - o[0], base.pts[c.i][1] - o[1]]));
    return list.map((c, k) => ({ ord: k, i: c.i, inside: c.inside, world: world[k] }));
  }
  cornerRow(it, { kind = "round", r, ang = 45, at = "all" } = {}) {
    r = Number(r);
    if (!(r > 0)) { this.onMessage(kind === "relief" ? "Enter a diameter." : kind === "chamfer" ? "Enter a distance." : "Enter a radius."); return 0; }
    if (!this.canMutate(it)) return 0;
    const base = this.baseContours(it)[0]; if (!base) return 0;
    this.remember();
    it.feats = it.feats || [];
    const ord = Array.isArray(at) ? at : null;
    if (kind === "round" && at === "all" && it.p && "r" in it.p) {          // a rectangle (or any shape with a corner radius): set it
      it.p.r = r; const plain = it.feats.find((f) => f.k === "corner" && f.at == null); if (plain) plain.r = r;
      it._key = undefined; this.commit(); this.onSelect();
      return Math.max(1, cornerIndices(base.pts).length);
    }
    const same = ord && it.feats.find((f) => f.k === "corner" && Array.isArray(f.at) && f.kind === kind && f.r === r && (kind !== "chamfer" || f.ang === ang));
    let row;
    if (same) { row = same; row.at = [...new Set([...row.at, ...ord])].sort((a, b) => a - b); }
    else {
      row = { id: it.feats.reduce((m, f) => Math.max(m, f.id), 0) + 1, k: "corner", r, kind, at: ord ? [...ord] : at };
      if (kind === "chamfer") row.ang = ang;
      // a whole-outline row replaces an earlier one of the same reach
      if (!ord) it.feats = it.feats.filter((f) => !(f.k === "corner" && f.at === at));
      it.feats.push(row);
    }
    const done = applyCorners(base, [row]).done;
    if (!done) {
      this.restore(this.past.pop());
      this.onMessage(kind === "relief" && at !== "all" ? "A relief cut is only for inside corners." : "That size is too big for these corners, or there are no sharp corners there.");
      return 0;
    }
    it._key = undefined; this.commit(); this.onSelect();
    const asked = applyCorners(base, cornerRows([row])).asked;
    if (asked > done) this.onMessage(done + " corner" + (done === 1 ? "" : "s") + " done. " + (asked - done) + " could not use that size.");
    return done;
  }
  cornerPickAt(wx, wy, tol, pick = this.filletPick) {    // Fillet pick mode on a shape with its own sizes: the clicked corner joins a Corners row
    const it = this.selected() || (this.picked().length === 1 ? this.picked()[0] : null);
    if (!pick || !this.cornerRowable(it)) return false;
    let best = null, bd = tol;
    for (const c of this.cornerList(it)) { const d = Math.hypot(c.world[0] - wx, c.world[1] - wy); if (d <= bd) { bd = d; best = c; } }
    if (!best) return false;
    if (pick.mode === "relief" && !best.inside) { this.onMessage("A relief cut is only for inside corners, so a square corner can sit into them. Use Round corner for an outside corner."); return false; }
    return this.cornerRow(it, { kind: pick.mode || "round", r: pick.radius, ang: pick.angle || 45, at: [best.ord] }) > 0;
  }
}

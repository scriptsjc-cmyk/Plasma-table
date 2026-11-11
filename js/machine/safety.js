// Keeping the torch inside the machine (same rules as plasma/safety.py).
// Boundaries are stored relative to the HOME CORNER, so they work whichever
// way grblHAL counts machine position:   rel = machine position - home corner.

export class SafetyError extends Error {}

const AXES = "XYZ";

export class Safety {
  // store: anything with getItem/setItem/removeItem (localStorage in the browser)
  constructor(store, key = "plasma.limits", marginMm = 1.0) {
    this.store = store;
    this.key = key;
    this.margin = marginMm;
    this.limits = null;
    this.ref = null;
    this.refMode = null;
    this.draft = {};
    this.load();
  }

  load() {
    try {
      const raw = this.store && this.store.getItem(this.key);
      if (raw) this.limits = JSON.parse(raw).limits || null;
    } catch (e) { this.limits = null; }
  }
  save() {
    this.store && this.store.setItem(this.key, JSON.stringify({ limits: this.limits, saved: new Date().toISOString() }));
  }

  setReference(mpos, mode) { this.ref = [...mpos]; this.refMode = mode; }
  clearReference() { this.ref = null; this.refMode = null; }
  get referenced() { return this.ref !== null; }
  rel(mpos) { return mpos.map((m, i) => m - this.ref[i]); }

  needRef() {
    if (!this.referenced) throw new SafetyError("The machine doesn't know where it is yet. Press Home (or 'Torch is at the home corner') first.");
  }
  wizardFarCorner(mpos) {
    this.needRef();
    const r = this.rel(mpos);
    if (Math.abs(r[0]) < 20 || Math.abs(r[1]) < 20)
      throw new SafetyError("The far corner must be well away from the home corner in both X and Y. Jog further out.");
    this.draft.x = r[0]; this.draft.y = r[1];
  }
  wizardZBottom(mpos) {
    this.needRef();
    const r = this.rel(mpos);
    if (Math.abs(r[2]) < 5) throw new SafetyError("Jog the torch DOWN onto a slat until the PROBE light comes on first.");
    this.draft.z = r[2];
  }
  wizardSave() {
    const missing = ["x", "y", "z"].filter((a) => !(a in this.draft));
    if (missing.length) throw new SafetyError(`Boundary setup not finished: still need ${missing.map((a) => a.toUpperCase()).join(", ")}.`);
    this.limits = {};
    for (const a of ["x", "y", "z"]) this.limits[a] = [0, Math.round(this.draft[a] * 100) / 100].sort((p, q) => p - q);
    this.draft = {};
    this.save();
    return this.limits;
  }
  clearLimits() {
    this.limits = null; this.draft = {};
    this.store && this.store.removeItem(this.key);
  }
  grblTravelSettings() {
    if (!this.limits) return [];
    return ["x", "y", "z"].map((a, i) => {
      const [lo, hi] = this.limits[a];
      return `$13${i}=${Math.max(1, hi - lo - this.margin).toFixed(1)}`;
    });
  }

  active() { return !!this.limits && this.referenced; }

  clampJog(mpos, axis, dist) {
    if (!this.active()) return dist;
    const i = AXES.indexOf(axis);
    const [lo, hi] = this.limits["xyz"[i]];
    const cur = this.rel(mpos)[i];
    const target = Math.min(Math.max(cur + dist, lo), hi);
    const safe = target - cur;
    if (Math.abs(safe) < 0.01) throw new SafetyError(`At the ${axis}${dist > 0 ? "+" : "-"} boundary - can't go further that way.`);
    return safe;
  }

  checkPointsMachine(points, what = "Move") {
    if (!this.active()) return null;
    const lx = this.limits.x, ly = this.limits.y;
    const xs = points.map((p) => p[0] - this.ref[0]);
    const ys = points.map((p) => p[1] - this.ref[1]);
    const gaps = [
      [Math.min(...xs) - lx[0], "X-"], [lx[1] - Math.max(...xs), "X+"],
      [Math.min(...ys) - ly[0], "Y-"], [ly[1] - Math.max(...ys), "Y+"],
    ];
    const problems = gaps.filter(([g]) => g < -0.05).map(([g, side]) => `${Math.round(-g)} mm past the ${side} edge`);
    return problems.length ? `${what} would go ${problems.join(" and ")}. Move the start point (Set start here) or the job.` : null;
  }
  jobCheck(bounds, wco) {
    return this.checkPointsMachine([[bounds[0] + wco[0], bounds[1] + wco[1]], [bounds[2] + wco[0], bounds[3] + wco[1]]], "This job");
  }
  downSign() {
    const [lo, hi] = this.limits.z;
    return Math.abs(lo) > Math.abs(hi) ? -1 : 1;
  }
  safeTopMachineZ() {
    if (!this.active()) return null;
    return this.ref[2] + this.downSign() * this.margin;
  }
  bottomMachineZ() {
    if (!this.active()) return null;
    const [lo, hi] = this.limits.z;
    return this.ref[2] + (Math.abs(lo) > Math.abs(hi) ? lo : hi);
  }
  state() {
    return { limits: this.limits, referenced: this.referenced, ref_mode: this.refMode, ref: this.ref, active: this.active(), draft: { ...this.draft } };
  }
}

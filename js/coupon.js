// Cut-test coupon + pierce counter (round 5, item 37). Pure logic (storage injected), no DOM.
import { roundedRect } from "./shape-helpers.js";
import { circleContour } from "./geom.js";

// ---------------------------------------------------------------- the coupon
// A small plate with the three things you judge a cut by: a straight edge, rounded corners and a round hole (cut first, then the outline).
// Size is fixed (60 x 40 mm, corner radius 5) so results compare between tests; only the hole follows the material: at least as wide as the plate is thick.
export const COUPON = { w: 60, h: 40, r: 5 };
export function couponHole(thicknessMm) { const t = Number(thicknessMm); return Math.round(Math.min(14, Math.max(6, 1.5 * (Number.isFinite(t) ? t : 0))) * 10) / 10; }
export function couponContours(thicknessMm) {
  const hole = couponHole(thicknessMm);
  return [roundedRect(0, 0, COUPON.w, COUPON.h, COUPON.r), circleContour(COUPON.w / 2, COUPON.h / 2, hole / 2)];
}

// ---------------------------------------------------------------- the result written back to the cut chart
export const RESULTS = [
  { id: "good", label: "Good cut", note: "good" },
  { id: "dross", label: "Dross on the bottom", note: "dross" },
  { id: "bevel", label: "Bevelled edge", note: "bevel" },
  { id: "short", label: "Didn't cut through", note: "not cut through" },
];
// What goes into the local cut-chart entry (settings.js upsertLocalPreset). `row` is the chart row in use (with the person's overrides already
// applied for height/delay/kerf), `usedSpeed` the speed the coupon was cut at. speed / amps = the optional tweak the person typed (blank = unchanged).
export function couponPresetRow({ material, thickness, row, chart = {}, usedSpeed, result, speed, amps, now = new Date() }) {
  const res = RESULTS.find((r) => r.id === result);
  if (!res) throw new Error("Pick how the test cut looked.");
  const num = (v) => (v === "" || v == null ? null : Number(v));
  const sp = num(speed), am = num(amps);
  if (sp !== null && !(sp >= 10 && sp <= 20000)) throw new Error("Speed must be 10 to 20000 mm/min.");
  if (am !== null && !(am >= 5 && am <= 500)) throw new Error("Amps must be 5 to 500.");
  const newSpeed = sp !== null ? sp : Number(usedSpeed);
  const newAmps = am !== null ? am : Number(row.amps);
  const d = now.toISOString().slice(0, 10);
  const bits = [];
  if (Number(usedSpeed) !== newSpeed) bits.push(`speed ${Math.round(usedSpeed)} -> ${Math.round(newSpeed)}`);
  if (Number(row.amps) !== newAmps) bits.push(`${row.amps} -> ${newAmps} A`);
  return {
    material, thickness_mm: Number(thickness),
    pierce_delay_s: row.pierce_delay_s, pierce_height_mm: row.pierce_height_mm ?? chart.pierce_height_mm, kerf_mm: row.kerf_mm ?? chart.kerf_mm,
    cut_speed_mm_min: newSpeed, amps: newAmps,
    notes: `Cut test ${d}: ${res.note} at ${Math.round(usedSpeed)} mm/min, ${row.amps} A` + (bits.length ? ` (changed ${bits.join(", ")})` : ""),
  };
}

// ---------------------------------------------------------------- pierce counter
export const PIERCE_KEY = "plasma.pierces.v1";
export class PierceCounter {
  constructor(store) { this.store = store; this.job = 0; this.lifetime = 0; this.since = 0; this.torch = false; this.jobRef = null; this.load(); }
  load() {
    try { const j = JSON.parse((this.store || localStorage).getItem(PIERCE_KEY) || "{}"); this.lifetime = Number.isFinite(j.lifetime) && j.lifetime >= 0 ? Math.trunc(j.lifetime) : 0; this.since = Number(j.since) || 0; } catch (e) { this.lifetime = 0; }
  }
  save() { try { (this.store || localStorage).setItem(PIERCE_KEY, JSON.stringify({ lifetime: this.lifetime, since: this.since || Date.now() })); } catch (e) { /* private mode */ } }
  // call with every status report. `jobRef` = any value that changes when a new job starts. Counts torch-on edges while a job is running.
  // A practice (demo) controller never counts towards the lifetime number: no real consumable was used.
  feed(st, { running = false, demo = false, jobRef = null } = {}) {
    if (running && jobRef !== this.jobRef) { this.jobRef = jobRef; this.job = 0; }
    const torch = !!(st && st.torch);
    let counted = false;
    if (torch && !this.torch && running) { this.job++; if (!demo) { if (!this.since) this.since = Date.now(); this.lifetime++; this.save(); } counted = true; }
    this.torch = torch;
    return counted;
  }
  resetLifetime() { this.lifetime = 0; this.since = Date.now(); this.save(); }
}

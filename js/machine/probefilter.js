// Debounce and safety helpers for the floating-head / probe input.
// App-side filtering is ONLY for the display (the Floating head lamp) and for
// pre-checks before a job, a touch-off test, or sending G38.2. It must NEVER
// sit in the path of a probe already running on the board: FluidNC stops G38.2
// on the raw pin, and a delay there would drive the torch into the sheet.
// FluidNC 4.1.1 has no probe debounce (or debounce_ms) in config.yaml; do not
// add one — that would delay the stop. A genuine trigger is never hidden at a
// safety decision: if the raw bit is on, or the debounced lamp is on, the
// start / touch-off / pre-G38.2 check blocks.

export const PROBE_STABLE_REPORTS = 3;   // ~200–300 ms at the 100 ms status poll
export const PROBE_CLEAR_WAIT_MS = 400;
export const PROBE_FALSE_TRIP_MM = 1;

export function isProbeMove(line) {
  return /\bG38\.2\b/i.test(String(line || ""));
}

// "[PRB:x,y,z:1]" -> tripped Z, or null if missing / failed (:0).
export function parseProbeTripZ(text) {
  const m = /^\[PRB:([-\d.]+),([-\d.]+),([-\d.]+)(?:,[-\d.]+)*:(\d)\]/.exec(String(text || "").trim());
  return m && m[4] === "1" && Number.isFinite(Number(m[3])) ? Number(m[3]) : null;
}

export function createProbeFilter({ stableReports = PROBE_STABLE_REPORTS, falseTripMm = PROBE_FALSE_TRIP_MM } = {}) {
  const s = { raw: false, shown: false, pending: null, count: 0, startZ: NaN, falseTripMm };
  const need = Math.max(1, stableReports | 0);
  function noteRaw(on) {
    on = !!on;
    s.raw = on;
    if (on === s.shown) { s.pending = null; s.count = 0; return state(); }
    if (s.pending !== on) { s.pending = on; s.count = 1; return state(); }
    s.count++;
    if (s.count >= need) { s.shown = on; s.pending = null; s.count = 0; }
    return state();
  }
  function reset() {
    s.raw = false; s.shown = false; s.pending = null; s.count = 0; s.startZ = NaN;
  }
  function displayOn() { return s.shown; }
  // Conservative: a single raw "on" sample blocks, even if the lamp is still off.
  function blocksAction(currentRaw) { return !!(currentRaw || s.raw || s.shown); }
  function markProbeStart(z) { s.startZ = Number(z); }
  function clearProbeStart() { s.startZ = NaN; }
  function tripLooksFalse(tripZ, maxMm = s.falseTripMm) {
    const a = s.startZ, b = Number(tripZ);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(b - a) < maxMm;
  }
  function state() { return { raw: s.raw, shown: s.shown, pending: s.pending, count: s.count, startZ: s.startZ }; }
  return { noteRaw, reset, displayOn, blocksAction, markProbeStart, clearProbeStart, tripLooksFalse, state };
}

export const probeFilter = createProbeFilter();

export function noteProbeRaw(on) { return probeFilter.noteRaw(on); }
export function resetProbeFilter() { probeFilter.reset(); }
export function probeDisplayOn() { return probeFilter.displayOn(); }
export function probeBlocks(currentRaw) { return probeFilter.blocksAction(currentRaw); }
export function markProbeStart(z) { probeFilter.markProbeStart(z); }
export function clearProbeStart() { probeFilter.clearProbeStart(); }
export function probeTripLooksFalse(z) { return probeFilter.tripLooksFalse(z); }

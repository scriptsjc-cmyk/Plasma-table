// Live torch / arc panel (round 5, item 35). Pure logic: no DOM, so tests can drive it with fake status reports.
//
// RULE: show only what the controller really reports. Anything that is not reported is "not connected":
//  - Arc OK and arc voltage come ONLY from the "|THC:<volts>,<flags>" field of grblHAL's plasma plugin (grbl.js parseThc).
//    Plain grblHAL, FluidNC and the Pi bridge send no such field, so for them these stay "not connected". Nothing is guessed from the torch relay.
//  - Torch height: the Z position the controller reports (WPos/MPos). "Height above the sheet" is only worked out from the last
//    touch-off this app saw ([PRB:...:1]) plus the switch offset in the machine config; before any touch-off it says so.
//  - The demo / practice controller (sim.js) pretends to be a grblHAL with the plasma plugin so the panel can be tried; its numbers are made up, and say so.
export const NOT_CONNECTED = "not connected";
export const ARC_DROP_MS = 400;        // arc OK gone this long while the torch is still on = lost arc
export const ARC_WAIT_MS = 8000;       // torch on for this long and the controller never reported arc OK = no arc (the controller also says "arc failed")

export function parseProbeLine(text) {   // "[PRB:12.000,34.000,-38.500:1]" -> { z, ok }
  const m = /^\[PRB:([-\d.]+),([-\d.]+),([-\d.]+)(?:,[-\d.]+)*:(\d)\]/.exec(String(text || "").trim());
  return m ? { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]), ok: m[4] === "1" } : null;
}

export class ArcWatch {
  constructor() { this.reset(); }
  reset() {
    this.thcSeen = false; this.last = null;       // last status
    this.torch = false; this.torchSince = 0; this.arcSeen = false; this.dropSince = 0;
    this.lost = null;                              // { at, reason, cut } once an arc has been lost; stays until clear()
    this.probe = null;                             // last successful touch-off { z }
  }
  clear() { this.lost = null; this.arcSeen = false; this.dropSince = 0; }
  noteProbe(text) { const p = parseProbeLine(text); if (p && p.ok) this.probe = p; return p; }
  // controller text such as "[MSG:Warning: arc failed]" (grblHAL plasma plugin). Returns true when it means the arc was lost.
  noteMessage(text, now = Date.now(), cut = null) {
    if (/\barc\s+fail/i.test(String(text || "")) && !this.lost) { this.lost = { at: now, reason: "The controller reported: arc failed.", cut }; return true; }
    return false;
  }
  // one status report; `running` = a job is cutting right now; cut = the cut number to blame if the arc goes
  update(st, now = Date.now(), running = false, cut = null) {
    this.last = st;
    if (st && st.thc) this.thcSeen = true;
    const torch = !!(st && st.torch);
    if (torch && !this.torch) { this.torchSince = now; this.arcSeen = false; this.dropSince = 0; }
    if (!torch && this.torch) { this.arcSeen = false; this.dropSince = 0; }
    this.torch = torch;
    if (!torch || !st.thc || !running) return;     // can only judge with a THC report, torch commanded on and a job running
    if (st.thc.arcOk) { this.arcSeen = true; this.dropSince = 0; return; }
    if (this.lost) return;
    if (this.arcSeen) {
      if (!this.dropSince) this.dropSince = now;
      if (now - this.dropSince >= ARC_DROP_MS) this.lost = { at: now, reason: "The arc went out while the torch was on.", cut };
    } else if (now - this.torchSince >= ARC_WAIT_MS) {
      this.lost = { at: now, reason: "The torch was on but the controller never reported arc OK.", cut };
    }
  }
}

// What the panel shows. `ctx`: { connected, demo, shiftZ? } ; returns plain strings + a class per cell.
export function liveView(w, st, ctx = {}) {
  const off = { text: NOT_CONNECTED, cls: "nc" };
  const out = { arc: off, volts: off, height: off, note: "" };
  if (!ctx.connected || !st) return out;
  const demo = ctx.demo ? " (demo)" : "";
  if (w.thcSeen && st.thc) {
    const t = st.thc;
    if (!st.torch) out.arc = { text: "torch off", cls: "idle" };
    else if (t.arcOk) out.arc = { text: "ARC OK", cls: "ok" };
    else if (w.lost) out.arc = { text: "ARC LOST", cls: "bad" };
    else if (w.arcSeen) out.arc = { text: "arc dropping…", cls: "warn" };
    else out.arc = { text: "waiting for arc…", cls: "warn" };
    out.volts = { text: `${t.volts.toFixed(1)} V${demo}`, cls: "" };
  }
  const wz = st.WPos && st.WPos.length >= 3 && Number.isFinite(st.WPos[2]) ? st.WPos[2] : null;
  const mz = st.MPos && st.MPos.length >= 3 && Number.isFinite(st.MPos[2]) ? st.MPos[2] : null;
  if (wz !== null && mz !== null) {
    if (w.probe && Number.isFinite(ctx.switchOffset)) {
      const h = mz - (w.probe.z + ctx.switchOffset);
      out.height = { text: `${h.toFixed(1)} mm above sheet${demo}`, cls: "" };
      out.note = `Height is worked out from the last touch-off. Z is ${wz.toFixed(1)} mm from the work zero.`;
    } else {
      out.height = { text: `Z ${wz.toFixed(1)} mm${demo}`, cls: "" };
      out.note = "Z is the controller's position from work zero. No touch-off yet, so the height above the sheet is not known.";
    }
  }
  if (out.arc === off && out.volts === off) out.note = (out.note ? out.note + " " : "") + "This controller doesn't report arc OK or arc voltage (only grblHAL with the plasma plugin does).";
  return out;
}

// the cut number to blame for a lost arc (same rule as r2ui noteJobEnded): cuts already done before a "continue from" run + torch fires so far
export function cutNumber(runFrom, ons, total) {
  const n = Math.max(1, (Number(runFrom) || 1) - 1 + Math.max(1, Number(ons) || 0));
  return total > 0 ? Math.min(total, n) : n;
}

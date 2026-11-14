// Live cut progress: a time-based estimate re-synced every time the torch fires or stops.
import { M, S } from "../core/state.js";

// ---- live progress while cutting: time-based estimate, re-synced every time the torch fires or stops
export function trackProgress(st) {
  const plan = M && M.plan, j = S.job;
  if (!plan || !j) return;
  const now = Date.now();
  if (!S.run || S.run.plan !== plan) S.run = { plan, t: 0, last: now, start: now, torch: false, ons: 0, offs: 0 };
  const R = S.run, dt = Math.min(1, (now - R.last) / 1000);
  R.last = now;
  if (!j.running) return;
  const state = st.state || "";
  const paused = /^(Hold|Alarm|Door)/.test(state);
  if (paused) {
    if (!R.pauseSince) R.pauseSince = now;
  } else if (R.pauseSince) {
    R.pauseAcc = (R.pauseAcc || 0) + (now - R.pauseSince);
    R.pauseSince = 0;
  }
  if (!paused) R.t += dt * (st.torch ? (st.feedOv || 100) / 100 : 1);
  const torch = !!st.torch;
  if (torch && !R.torch) { R.ons++; const i = plan.torchOn[R.ons - 1]; if (i != null) R.t = plan.cum[i]; }
  if (!torch && R.torch) { R.offs++; const i = plan.torchOff[R.offs - 1]; if (i != null) R.t = plan.cum[i]; }
  R.torch = torch;
  const acked = j.acked > 0 ? plan.cum[Math.min(j.acked, plan.cum.length) - 1] : 0;
  R.t = Math.min(R.t, acked, plan.total * 0.995);
  R.shown = Math.max(R.shown || 0, R.t);          // never count backwards on screen
}
export function liveProgress() {
  const j0 = S.job || {};
  if (j0.boardRun) {
    const pierces = S.prepared ? S.prepared.stats.pierces : 0;
    const pct = Number(j0.pct) || (j0.total ? (100 * (j0.acked || 0)) / j0.total : 0);
    const cut = pierces ? Math.max(0, Math.min(pierces, Math.round((pct / 100) * pierces))) : 0;
    const R = S.run;
    return { pct, left: 0, elapsed: elapsedOf(R, j0.elapsed || 0), cut };
  }
  const R = S.run, plan = R && R.plan;
  if (!plan || !plan.total) {
    const j = S.job || {};
    return { pct: j.total ? (100 * j.acked) / j.total : 0, left: 0, elapsed: elapsedOf(R, j.elapsed || 0), cut: 0 };
  }
  const ov = (S.status.feedOv || 100) / 100;
  const t = R.shown || 0;
  return { pct: Math.min(100, (100 * t) / plan.total), left: (plan.total - t) / (ov || 1),
    elapsed: elapsedOf(R, (Date.now() - R.start) / 1000), cut: R.ons };
}
function elapsedOf(R, fallback) {
  if (!R || !R.start) return fallback || 0;
  const now = Date.now();
  const hold = (R.pauseAcc || 0) + (R.pauseSince ? now - R.pauseSince : 0);
  return Math.max(0, (now - R.start - hold) / 1000);
}

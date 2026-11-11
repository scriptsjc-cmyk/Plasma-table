// Restart from cut N after a stop, and the checks that the position is still known.
import { $ } from "../core/dom.js";
import { H } from "../ui/host.js";
import { POSITION_LOST_ALARMS } from "../machine/machine.js";

// ================================================================ restart from cut N
function pierceCount() { const p = H.S.prepared; return p && p.cutIndex ? p.cutIndex.length : 0; }
export function noteJobEnded(j) {      // called on every job event; works out which cut we were in when it stopped
  const S = H.S;
  if (j.running) { S.resume = null; return; }
  if (!j.result || j.result === "done") { if (j.result === "done") S.resume = null; return; }
  if (S.resume && S.resume.jobId === S.jobSeq) return;
  const R = S.run, from = H.M().runFrom || 1;
  const local = R ? (R.torch ? R.ons : R.offs + 1) : 1;
  const total = pierceCount();
  if (total < 1) { S.resume = null; return; }
  const n = Math.max(1, Math.min(total, from - 1 + Math.max(1, local)));
  S.resume = { n, total, jobId: S.jobSeq, reason: j.result };
}
export function paintRestart() {
  const S = H.S, box = $("restartBox"); if (!box) return;
  const r = S.resume, total = pierceCount();
  const show = !!r && total > 1 && !!S.prepared && !!S.prepared.cutIndex;
  box.classList.toggle("hidden", !show);
  if (!show) return;
  const sel = $("restartCut");
  if (sel.options.length !== total || sel.dataset.n !== String(total)) {
    sel.innerHTML = Array.from({ length: total }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(""); sel.dataset.n = String(total);
    sel.value = String(r.n);
  }
  $("restartHead").textContent = `Stopped during cut ${r.n} of ${total}.`;
  $("btnRestart").textContent = `Continue from cut ${sel.value}`;
}
export function paintStartCut() {
  const S = H.S, row = $("startCutRow"); if (!row) return;
  const total = pierceCount();
  const show = total > 1;
  row.classList.toggle("hidden", !show);
  if (!show) return;
  const sel = $("startCut");
  if (sel.dataset.n !== String(total)) { sel.innerHTML = Array.from({ length: total }, (_, i) => `<option value="${i + 1}">${i + 1} of ${total}</option>`).join(""); sel.dataset.n = String(total); }
  sel.value = String(Math.min(total, S.startCut || 1));
  const why = $("resumeWhy");
  if (why) {
    const need = (S.startCut || 1) > 1 || S.resume ? resumeNeeds() : [];
    why.classList.toggle("hidden", !need.length);
    why.textContent = need.length ? `The machine was stopped, so it may have lost its place. Before you continue: ${need.join(", then ")}. Start stays locked until then.` : "";
  }
}
export function bindRestart() {
  $("restartCut").onchange = () => { $("btnRestart").textContent = `Continue from cut ${$("restartCut").value}`; };
  $("btnRestart").onclick = () => continueFromCut(Number($("restartCut").value) || 1);
  $("startCut").onchange = () => { H.S.startCut = Number($("startCut").value) || 1; H.drawPreview(); };
}
// "Continue from cut N" (also used by the lost-arc box): picks the cut and goes to Get set up. Starts nothing.
export function continueFromCut(n) {
  const S = H.S;
  n = Math.max(1, Math.trunc(Number(n) || 1));
  S.startCut = n;
  // Round 3 safety: Continue NEVER marks work zero as set. A STOP (soft reset), an alarm (ALARM 3 too) or a lost reference means the
  // controller may no longer know where it is, so work zero has to be confirmed again (and the machine homed if edges are on).
  // Work zero is only kept when the machine is still homed with edges on and no position-lost alarm has come in since.
  if (!positionStillKnown()) S.zeroSet = false;
  H.goStep(3);
  H.toast(S.zeroSet ? `Ready to continue from cut ${n}. Check the boxes, then press Start.` : `Before continuing from cut ${n}: ${resumeNeeds().join(", then ")}.`, !S.zeroSet);
}
function positionStillKnown() {
  const S = H.S;
  return !!(S.safety && S.safety.limits && S.safety.referenced) && !(S.lastAlarmCode != null && POSITION_LOST_ALARMS.has(S.lastAlarmCode)) && !!S.zeroSet;
}
// what still has to happen before a resumed cut may start, in plain words (empty = nothing)
function resumeNeeds() {
  const S = H.S, need = [];
  if (S.safety && S.safety.limits && !S.safety.referenced) need.push("press Home so the table finds its edges again");
  if (!S.zeroSet) need.push("move the torch over the start of the work and press Start here to confirm work zero");
  return need;
}
export function startCut() { return Math.max(1, Math.trunc(H.S.startCut || 1)); }
export function afterStart() { H.S.startCut = 1; H.S.resume = null; paintStartCut(); }

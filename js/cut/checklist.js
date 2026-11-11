// Pre-start checklist and the list of reasons Start is blocked (blockers()).
import { estopOn } from "../ui/flow.js";
import * as Setup from "./setup.js";
import { S, sketch } from "../core/state.js";
import { fit, wcoNow } from "./preview.js";
import { ampsNow, row } from "./material.js";
import { $, $$, esc } from "../core/dom.js";
import { refresh } from "../core/hooks.js";

// ------------------------------------------------------------------ step 3 (second half): checks
export function renderChecklist() {
  const dry = S.prepared && S.prepared.dry_run;
  const w = wcoNow();
  const zeroLine = S.zeroSet
    ? `Start point set at ${Number(w[0]).toFixed(1)}, ${Number(w[1]).toFixed(1)} mm`
    : "Start point set (press Start here in “Connect, home and set the start point” above)";
  const items = dry ? [zeroLine, "Practice run: torch will stay OFF", "Hands clear, e-stop within reach"]
    : [zeroLine, ...(row().check ? [row().check] : []), `Plasma ON and set to ${ampsNow()} A`, `Air on, ${row().air_bar ?? S.chart.air_bar} bar at the plasma gauge`, "Earth clamp on the sheet", "Hands clear, e-stop within reach"];
  $("checklist").innerHTML = items.map((t, i) => {
    const auto = i === 0 && S.zeroSet;
    return `<li><label><input type="checkbox" data-chk="${i}" ${auto ? "checked disabled" : ""}> ${esc(t)}</label></li>`;
  }).join("");
  const cm = $("checkMat");
  if (cm) cm.textContent = S.material && S.thickness != null ? `${S.material} · ${S.thickness} mm` : "";
  paintZeroWarn();
  refresh();
}
// B5 16: the "start point not set" warning follows S.zeroSet on every refresh, not only when the checklist is redrawn
export function paintZeroWarn() {
  const zw = $("zeroWarn");
  if (zw) zw.classList.toggle("hidden", !!S.zeroSet);
}
// B5 16: Start here pressed - redraw the checklist's first line (keeping the ticks already made) so "Tick every box" and the warning clear at once
export function zeroJustSet() {
  const ticks = $$("#checklist input").map((x) => x.checked);
  renderChecklist();
  $$("#checklist input").forEach((x, i) => { if (ticks[i] && !x.disabled) x.checked = true; });
  refresh();
}
// Round 5 (safety): Score and Mark are only labels. The torch here is on/off (M3 S1000 / M5) and the plasma power is set by hand at the
// unit, so the G-code can't cut a line lighter. Rather than cut those lines through at full power, Start and Download G-code are blocked.
function scoreMarkCount() {
  if (!sketch || S.src !== "shape") return 0;
  return sketch.items.filter((it) => (it.op === "score" || it.op === "mark") && !sketch.layerHidden(it)).length;
}
const SCORE_MARK_WHY = "can't be scored or marked: this table's torch only switches on and off (the plasma power is set at the unit), so the line would be cut right through at full power.";
export function scoreMarkProblem() {
  const n = scoreMarkCount();
  return n ? `${n} shape${n === 1 ? " is" : "s are"} set to Score or Mark, which ${SCORE_MARK_WHY} Change ${n === 1 ? "it" : "them"} back to Cut, or hide the Score/Mark layer, in the shape settings.` : "";
}
export function blockers() {
  const b = [];
  if (!S.connected) b.push("Not connected to the table.");
  if (!S.prepared) b.push("No part chosen yet (step 1).");
  if (estopOn()) b.push("E-STOP is ON – press and hold the red button to reset it first.");
  const sm = scoreMarkProblem(); if (sm) b.push(sm);
  if (S.connected && !S.zeroSet) b.push("Start point has not been set. Press Start here in “Connect, home and set the start point” above.");
  const st = S.status.state;
  if (S.connected && st === "Alarm") b.push("Machine is in alarm – press Unlock at the top.");
  else if (S.connected && st !== "Idle") b.push(`Machine is busy (${st}). Wait for it to stop.`);
  const inp = S.status.inputs || {};
  if (inp.estop) b.push("E-stop is pressed – release it and press Unlock.");
  if (inp.probe) b.push("Floating head is pushed up – check the torch isn't touching anything or stuck.");
  if (S.safety.limits && !S.safety.referenced) b.push("Machine needs homing – press Home.");
  if (fit().bad) b.push("The part doesn't fit the machine – move the parts or the sheet's start corner.");
  for (const t of Setup.blockText()) b.push(t);
  const boxes = $$("#checklist input");
  if (boxes.some((x) => !x.checked)) b.push("Tick every box above.");
  return b;
}
// ------------------------------------------------------------------ refresh everything that depends on state
// r3: nothing may cover STOP while this is true (job running or paused, machine doing anything, torch possibly on)
export function overlayLive() {
  const st0 = (S.status && S.status.state) || "";
  const busyState = S.connected && !!st0 && !/^(Idle|Check|Sleep)$/i.test(st0);
  return !!(S.job && (S.job.running || S.job.paused)) || busyState || !!(S.status && S.status.torch);
}
// r4: the cutting screen can't be left while this is true: a job running or paused, the machine moving, the torch on,
// or the connection lost mid-cut (the lost-connection banner must be acknowledged first). An alarm alone does not lock it.
export function navBusy() {
  const st = (S.status && S.status.state) || "";
  const moving = S.connected && /^(Run|Jog|Home|Cycle|Hold|Door)/i.test(st);
  const lost = $("lostBar") && !$("lostBar").classList.contains("hidden");
  return !!(S.job && (S.job.running || S.job.paused)) || moving || !!(S.connected && S.status && S.status.torch) || !!lost;
}

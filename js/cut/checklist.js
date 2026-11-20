// Pre-start checks: sheet-corner status on the card, a short safety reminder when Start is pressed, and blockers().
import { estopOn } from "../ui/flow.js";
import * as Setup from "./setup.js";
import { S, sketch } from "../core/state.js";
import { fit } from "./preview.js";
import { row } from "./material.js";
import { $ } from "../core/dom.js";
import { refresh } from "../core/hooks.js";
import { isEtchOp, throughCutInEtch, etchHeightProblem, resolveEtch } from "./etch.js";
import { currentSettings } from "../machine/settings.js";
import { motorDirLockWhy } from "../machine/motordir.js";
import { sheetCornerName } from "./bedview.js";
import { probeDisplayOn } from "../machine/probefilter.js";

// ------------------------------------------------------------------ step 3 (second half): checks
// Round 5 (safety): the first line, "Start point set", is not a box you tick. It follows the machine's zeroConfirmed flag
// (S.zeroSet): ticked by Start here, unticked by STOP / reset / home / alarm, and never editable by hand.
function zeroIsConfirmed() {
  return !!(S.zeroSet && (!S.connected || (S.safety && S.safety.referenced)));
}
function zeroLineText() {
  if (S.zeroSet && S.connected && S.safety && S.safety.referenced === false) {
    return "Set home again before cutting — the table may have lost its place.";
  }
  if (!S.zeroSet) return "Sheet corner not set yet — press Start here";
  return "Sheet corner set ✓";
}
// Short lines for the Start reminder. A practice run notes that the torch stays off.
export function checkItems() { return startReminders(); }
export function startReminders() {
  const dry = S.prepared && S.prepared.dry_run;
  const lines = dry
    ? ["Sheet flat on the slats", "Area clear", "E-stop in reach", "Practice run: torch stays off"]
    : ["Sheet clamped, earth on", "Torch at the start", `Air on${row() && row().air_bar != null ? `, ${row().air_bar} bar` : ""}`, "Eyes protected", "E-stop in reach", "First pierce will touch off"];
  if (S.fluidnc) lines.push("If the laptop disconnects, the cut keeps going.");
  return lines;
}
export function renderChecklist() {
  const cm = $("checkMat");
  if (cm) cm.textContent = S.material && S.thickness != null ? `${S.material} · ${S.thickness} mm` : "";
  const hint = $("checkHint");
  if (hint) {
    const dry = S.prepared && S.prepared.dry_run;
    hint.textContent = (dry
      ? "Press Start for a short reminder. Practice run: the torch stays off. The first pierce will touch off."
      : "Press Start for a short safety reminder before the cut begins. The first pierce will touch off.")
      + (S.fluidnc ? " If the laptop disconnects, the cut keeps going." : "");
  }
  paintZeroWarn();
  refresh();
}
// Every refresh: the start-point line and the "start point not set" warning follow S.zeroSet (so a STOP clears it at once)
export function paintZeroWarn() {
  const zw = $("zeroWarn");
  if (zw) zw.classList.toggle("hidden", zeroIsConfirmed());
  const el = $("checkZero");
  if (el && el.textContent !== zeroLineText()) el.textContent = zeroLineText();
}
// Score / Mark is a real etch pass (C32). Start and Download stay blocked only when that pass would
// cut through the sheet (no PORTA-ETCH block, or a pierce delay / torch inside the etch).
function scoreMarkCount() {
  if (!sketch || S.src !== "shape") return 0;
  let n = 0;
  const hidden = sketch.hiddenLayers;
  for (const it of sketch.items) {
    if (sketch.layerHidden(it)) continue;
    if (isEtchOp(it.op)) { n++; continue; }
    try {
      for (const c of sketch.contoursOf(it)) {
        if (isEtchOp(c.op) && !(hidden && hidden.has(c.op))) n++;
      }
    } catch (e) { /* ignore */ }
  }
  return n;
}
export function scoreMarkProblem() {
  const n = scoreMarkCount();
  if (!n) return "";
  const r = row() || {};
  const cutH = Number(r.cut_height_mm ?? (S.chart && S.chart.cut_height_mm));
  const resolved = resolveEtch(r, S.chart, currentSettings());
  const heightWhy = etchHeightProblem(resolved, cutH);
  if (heightWhy) return heightWhy;
  const lines = (S.prepared && S.prepared.lines) || [];
  return throughCutInEtch(lines, { hasEtchItems: true }) || "";
}
export function blockers() {
  const b = [];
  if (!S.connected) b.push("Not connected to the table.");
  if (!S.prepared) b.push("No part chosen yet (step 1).");
  if (estopOn()) b.push("E-STOP is ON – press and hold the red button to reset it first.");
  const sm = scoreMarkProblem(); if (sm) b.push(sm);
  if (S.connected && !S.zeroSet) b.push("Sheet corner has not been set: put the torch on the sheet's " + sheetCornerName({ long: true }) + " and press Start here. The part already cuts where you placed it.");
  const st = S.status.state;
  if (S.connected && st === "Alarm") b.push("Machine is in alarm – press Unlock at the top.");
  else if (S.connected && st !== "Idle") b.push(`Machine is busy (${st}). Wait for it to stop.`);
  const inp = S.status.inputs || {};
  if (inp.estop) b.push("E-stop is pressed – release it and press Unlock.");
  // Debounced so a one-report noise pulse doesn't flash this warning. startJob
  // still uses the conservative raw-or-shown check, so a genuine trigger cannot start a cut.
  if (probeDisplayOn()) b.push("Floating head is pushed up – check the torch isn't touching anything or stuck.");
  if (S.safety.limits && !S.safety.referenced) b.push("Set home again (Machine setup) to use your saved edges.");
  const dirLock = motorDirLockWhy(); if (dirLock) b.push(dirLock);
  if (fit().bad) b.push("The part doesn't fit the machine – move the parts or the sheet's start corner.");
  for (const t of Setup.blockText()) b.push(t);
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

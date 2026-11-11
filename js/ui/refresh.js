// The big repaint: refresh() brings every button, banner and lamp in line with the current state.
import { estopPaint, paintLock, screen } from "./flow.js";
import { POSITION_LOST_ALARMS } from "../machine/machine.js";
import * as Acc from "../account/account.js";
import { paintDelay } from "../cut/pierce.js";
import { paintRestart } from "../cut/restart.js";
import { updatePlayRow } from "../cut/playback.js";
import * as Setup from "../cut/setup.js";
import { M, S, sketch } from "../core/state.js";
import { $, $$, clock, esc, fmtTime } from "../core/dom.js";
import { blockers, overlayLive, paintZeroWarn } from "../cut/checklist.js";
import { drawPreview, fit, wcoNow } from "../cut/preview.js";
import { paintWhy } from "./gate.js";
import { paintGuide } from "../make/shapeform.js";
import { lockText, machineAllowed } from "../machine/access.js";
import { canGo } from "./nav.js";
import { liveProgress } from "../cut/progress.js";

export function paintChrome() {
  const b = document.querySelector(".topbar");
  if (b) document.documentElement.style.setProperty("--topbar-h", Math.ceil(b.getBoundingClientRect().height) + "px");
  const torch = !!(S.status && S.status.torch);
  const pill = $("torchPill");
  if (pill) {
    pill.hidden = !S.connected;       // no TORCH OFF until a machine is connected
    pill.textContent = torch ? "TORCH ON" : "TORCH OFF";
    pill.classList.toggle("on", torch);
    pill.classList.toggle("off", !torch);
  }
  const mode = $("modeChip");
  if (mode) {
    let label = "";
    if (S.connected && S.demo) label = "";
    else if (S.connected && S.fluidnc) label = "FluidNC";
    else if (S.connected) label = "Connected";
    mode.textContent = label;
    mode.classList.toggle("hidden", !label);
  }
  const pr = $("practiceChip");
  if (pr) {
    const on = !!(S.prepared && S.prepared.dry_run) || ($("dryRun") && $("dryRun").checked);
    pr.classList.toggle("hidden", !on);
  }
  const zs = $("zeroState");
  if (zs) {
    if (S.zeroSet) {
      const w = wcoNow();
      zs.textContent = "Start point set at " + Number(w[0]).toFixed(1) + ", " + Number(w[1]).toFixed(1) + " mm.";
      zs.classList.remove("warntext");
    } else {
      zs.textContent = S.connected ? "Not set yet. Put the torch on the sheet's bottom-left corner, then press Start here." : "Connect to the table to set it. On the layout the sheet's bottom-left corner is the start point.";
      zs.classList.add("warntext");
    }
  }
  const running = !!(S.job && S.job.running);
  for (const id of ["btnExport3", "btnExport4"]) if ($(id)) $(id).disabled = !S.prepared;
  document.body.classList.toggle("running-job", running);
  // Round 3 safety: while a job runs / is paused / the machine is doing anything / the torch could be on, the portrait
  // "turn sideways" overlay must stay away so STOP and pause are always on screen. It only shows when everything is idle.
  document.body.classList.toggle("job-live", overlayLive());
  // Round 5 safety: with a machine connected, STOP is lifted above every overlay (css/screen-cut.css), not only during a job
  document.body.classList.toggle("machine-connected", !!S.connected);
  document.body.classList.toggle("is-admin", !!Acc.isAdmin());
  paintLock(); estopPaint();
  const lost = S.lastAlarmCode != null && POSITION_LOST_ALARMS.has(S.lastAlarmCode);
  const again = $("btnAgain"), rezero = $("btnRezero");
  if (again && rezero) {
    again.classList.toggle("hidden", !!lost);
    rezero.classList.toggle("hidden", !lost);
  }
}
export function refresh() {
  paintChrome();
  setTimeout(paintWhy, 0);
  try { const lt = "🔒 " + lockText(); if ($("connectLockText").textContent !== lt) $("connectLockText").textContent = lt; } catch (e) { /* ignore */ }
  // stats + fit (preview pane)
  const f = fit();
  $("fit").className = "fit " + f.cls;
  $("fit").textContent = f.text;
  $("fit").style.cursor = f.cls === "unknown" ? "pointer" : "";
  $("fit").title = f.cls === "unknown" ? "Open Machine setup" : "";
  if (S.prepared) {
    const st = S.prepared.stats;
    $("jobStats").innerHTML = `<span><b>${esc(S.fileName)}</b></span><span>Size <b>${S.prepared.summary ? `${S.prepared.summary.width} × ${S.prepared.summary.height}` : `${st.width_mm} × ${st.height_mm}`} mm</b></span>
      ${S.prepared.summary ? `<span>Parts <b>${(S.src !== "file" && sketch && sketch.items.length && Setup.partCount(sketch)) || S.prepared.summary.parts}</b> · holes <b>${S.prepared.summary.holes}</b></span>` : `<span>Cuts <b>${st.pierces}</b></span>`}<span>About <b>${fmtTime(st.estimated_seconds)}</b></span>${S.prepared.dry_run ? "<span><b>PRACTICE RUN</b></span>" : ""}`;
  } else $("jobStats").innerHTML = "";
  $("next1").disabled = !S.prepared;
  updatePlayRow(); paintRestart(); paintDelay(); paintGuide();
  if ($("btnEditDrawing")) $("btnEditDrawing").classList.toggle("hidden", !(S.design && !S.design.straight && S.src === "file" && S.design.contours && S.design.contours.length));
  paintBedStatus();
  $$("#stepper li").forEach((li) => (li.style.opacity = canGo(Number(li.dataset.step)) ? 1 : 0.4));

  // start button + reasons
  const b = blockers();
  paintZeroWarn();
  $("btnStart").disabled = b.length > 0 || !machineAllowed();
  paintStartWhy(b);
  $("blockers").innerHTML = b.length && S.cur === 3 ? `Can't start yet:<ul>${b.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";


  // banners
  $("homeBar").classList.toggle("hidden", !(S.connected && S.safety.limits && !S.safety.referenced && S.status.state !== "Home"));
  const estop = !!(S.status.inputs && S.status.inputs.estop);
  $("estopBar").classList.toggle("hidden", !(S.connected && estop));
  $("alarmBar").classList.toggle("hidden", !(S.connected && S.status.state === "Alarm" && !estop));

  // running / done panel
  if (S.job) {
    const j = S.job, P = liveProgress();
    const finished = !j.running && S.status.state === "Idle";
    const pct = j.result === "done" ? 100 : P.pct;
    $("pct").textContent = Math.floor(pct) + "%";
    $("progBar").style.width = pct.toFixed(1) + "%";
    $("timeLeft").textContent = j.running ? clock(P.left) : "0:00";
    const pierces = S.prepared ? S.prepared.stats.pierces : 0;
    $("runInfo").textContent = `${clock(P.elapsed)} so far` + (pierces ? ` · cut ${Math.min(pierces, (M.runFrom || 1) - 1 + Math.max(1, P.cut))} of ${pierces}` : "");
    $("runTitle").textContent = S.status.state === "Hold" ? "Paused" : j.running ? "Cutting…" : "Finishing last moves…";
    const hold = S.status.state === "Hold";
    const pauseLabel = hold ? "Resume" : "Pause";
    if ($("btnPause").dataset.face !== pauseLabel) {
      $("btnPause").dataset.face = pauseLabel;
      $("btnPause").innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-${hold ? "play" : "pause"}"></use></svg> ${pauseLabel}`;
    }
    const ov = S.status.feedOv || 100;
    if (j.running) S.lastFeedOv = ov;
    $("liveSpeed").textContent = `${Math.round((S.speed * ov) / 100)} mm/min` + (ov !== 100 ? ` (${ov}% of ${S.speed})` : "");
    const showDone = (!j.running && j.result !== "done") || finished;
    $("running").classList.toggle("hidden", showDone);
    $("done").classList.toggle("hidden", !showDone);
    if (showDone) {
      const ok = j.result === "done";
      $("doneTitle").textContent = ok ? "Finished ✓" : "Stopped";
      $("doneInfo").textContent = ok ? `Took ${fmtTime(j.elapsed)}. Lift the part out when it's cool.`
        : (S.lastAlarm || "The job was stopped before the end.");
      const changed = S.lastFeedOv !== 100 && S.prepared && !S.prepared.dry_run;
      const v = Math.round((S.speed * S.lastFeedOv) / 100 / 10) * 10;
      $("btnSaveSpeed").textContent = `Save ${v} mm/min as my speed for ${S.material.toLowerCase()} ${S.thickness} mm`;
      if (changed) $("btnSaveSpeed").classList.remove("hidden");
    }
  }
  const t = $("torchBig");
  t.textContent = S.status.torch ? "TORCH ON" : "TORCH OFF";
  t.classList.toggle("on", !!S.status.torch);

  // movement controls are off while a job runs
  const busy = !!(S.job && S.job.running), idle = S.status.state === "Idle";
  $$(".j, .steps button, .do-home, .do-raise, #btnGoStart, #setupView button").forEach((el) => {
    if (el.id !== "btnDisconnect") el.disabled = busy;
  });
  $("btnTrace").disabled = busy || !(S.prepared && idle);
  $("btnZero").disabled = busy || !idle;
  drawPreview();
}
// B5 18: the reasons Start is greyed, as visible text next to the button (the full list is still under "Check, then cut")
function paintStartWhy(blocked) {
  const el = $("startWhy"); if (!el) return;
  // round 5: when the machine is locked, that reason shows here (under Start), not as a second lock note
  const b = machineAllowed() ? blocked : [Acc.hasLinkedMachine() ? "Demo accounts can't control a real machine. Use Practice (no machine)." : "Link a machine to run jobs (Link a machine, above).", ...blocked];
  const off = $("btnStart").disabled && b.length > 0;
  el.classList.toggle("hidden", !off);
  if (!off) { el.textContent = ""; return; }
  const first = String(b[0]).replace(/\s+/g, " ");
  el.textContent = "Can't start yet: " + first + (b.length > 1 ? ` (+${b.length - 1} more below)` : "");
}
function paintBedStatus() {
  const box = $("bedStatus"); if (!box) return;
  const n = (sketch && S.src === "shape") ? Setup.partCount(sketch) : 0;
  const what = S.prepared ? (S.src === "file" ? (S.design && S.design.coupon ? "a cut-test coupon" : S.design && S.design.straight ? "a straight cut" : "1 file loaded") : (n ? `${n} part${n === 1 ? "" : "s"} on the bed` : "a file loaded")) : "";
  box.classList.toggle("hidden", !what || screen() !== "cut");
  if (what) $("bedStatusText").textContent = "On the bed now: " + what + ".";
}

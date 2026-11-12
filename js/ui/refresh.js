// The big repaint: refresh() brings every button, banner and lamp in line with the current state.
import { estopPaint, paintLock, screen } from "./flow.js";
import { ALARM_DEFAULT, POSITION_LOST_ALARMS } from "../machine/machine.js";
import * as Acc from "../account/account.js";
import { paintDelay } from "../cut/pierce.js";
import { paintRestart } from "../cut/restart.js";
import { updatePlayRow } from "../cut/playback.js";
import * as Setup from "../cut/setup.js";
import { M, S, sketch } from "../core/state.js";
import { $, $$, clock, esc, fmtTime, placeToast } from "../core/dom.js";
import { formatLen } from "../core/prefs.js";
import { blockers, overlayLive, paintZeroWarn } from "../cut/checklist.js";
import { drawPreview, fit, wcoNow } from "../cut/preview.js";
import { paintWhy } from "./gate.js";
import { paintGuide } from "../make/shapeform.js";
import { lockText, machineAllowed } from "../machine/access.js";
import { canGo } from "./nav.js";
import { liveProgress } from "../cut/progress.js";
import { ampsNow } from "../cut/material.js";
import { matchPreset } from "../machine/settings.js";

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
// The laptop cutting screen's "Job and machine" card (#jobCard, shown by css/screen-cut.css on a wide screen with a mouse)
function setText(id, text) { const el = $(id); if (el && el.textContent !== text) el.textContent = text; }
function paintJobCard() {
  if (!$("jobCard")) return;
  const P = S.prepared, st = P && P.stats, sum = P && P.summary;
  setText("jcFile", P ? S.fileName || "Untitled" : "No part yet");
  setText("jcSize", !P ? "–" : sum ? `${formatLen(sum.width, 1)} × ${formatLen(sum.height, 1)}` : `${formatLen(st.width_mm, 1)} × ${formatLen(st.height_mm, 1)}`);
  setText("jcCuts", !P ? "–" : `${st.pierces} ${st.pierces === 1 ? "cut" : "cuts"} · about ${fmtTime(st.estimated_seconds)}${P.dry_run ? " · practice run" : ""}`);
  let mat = "–";
  if (S.material && S.thickness != null) {
    let amps = "";
    try { amps = ` · ${ampsNow()} A ${matchPreset(S.material, S.thickness) ? "(your preset)" : "(cut chart)"}`; } catch (e) { /* no chart row yet */ }
    mat = `${S.material} · ${S.thickness} mm${amps}`;
  }
  setText("jcMat", mat);
  const t = S.cfg && S.cfg.travel_mm, conn = $("connPill").title || "Not connected", badge = $("stateBadge");
  setText("jcMach", `${conn}${S.connected && badge && badge.textContent ? ` · ${badge.textContent}` : ""}${t ? ` · table ${Math.round(t.x)} × ${Math.round(t.y)} mm` : ""}`);
}
export function refresh() {
  paintChrome();
  setTimeout(paintWhy, 0);
  try {
    const practicing = !!S.demo && !Acc.hasLinkedMachine();
    const lt = practicing ? "Practice works without a machine. Link one to cut for real." : "🔒 " + lockText();
    if ($("connectLockText").textContent !== lt) $("connectLockText").textContent = lt;
    $("connectLock").classList.toggle("practice-ok", practicing);
  } catch (e) { /* ignore */ }
  // stats + fit (preview pane)
  const f = fit();
  $("fit").className = "fit " + f.cls;
  $("fit").textContent = f.text;
  $("fit").style.cursor = f.cls === "unknown" ? "pointer" : "";
  $("fit").title = f.cls === "unknown" ? "Open Machine setup" : "";
  if (S.prepared) {
    const st = S.prepared.stats;
    $("jobStats").innerHTML = `<span><b>${esc(S.fileName)}</b></span><span>Size <b>${S.prepared.summary ? `${formatLen(S.prepared.summary.width, 1)} × ${formatLen(S.prepared.summary.height, 1)}` : `${formatLen(st.width_mm, 1)} × ${formatLen(st.height_mm, 1)}`}</b></span>
      ${S.prepared.summary ? `<span>Parts <b>${(S.src !== "file" && sketch && sketch.items.length && Setup.partCount(sketch)) || S.prepared.summary.parts}</b> · holes <b>${S.prepared.summary.holes}</b></span>` : `<span>Cuts <b>${st.pierces}</b></span>`}<span>About <b>${fmtTime(st.estimated_seconds)}</b></span>${S.prepared.dry_run ? "<span><b>PRACTICE RUN</b></span>" : ""}`;
  } else $("jobStats").innerHTML = "";
  $("next1").disabled = !S.prepared;
  updatePlayRow(); paintRestart(); paintDelay(); paintGuide(); paintJobCard();
  if ($("btnEditDrawing")) $("btnEditDrawing").classList.toggle("hidden", !(S.design && !S.design.straight && S.src === "file" && S.design.contours && S.design.contours.length));
  paintBedStatus();
  $$("#stepper li").forEach((li) => (li.style.opacity = canGo(Number(li.dataset.step)) ? 1 : 0.4));

  // start button + reasons
  const b = blockers();
  if (!machineAllowed() && !S.demo) {
    const linkWhy = Acc.hasLinkedMachine() ? "Demo accounts can't control a real machine. Use Practice (no machine)." : "Link a machine to run jobs.";
    if (!b.includes(linkWhy)) b.unshift(linkWhy);
  }
  paintZeroWarn();
  $("btnStart").disabled = b.length > 0 || !machineAllowed();
  paintStartWhy(b);
  $("blockers").innerHTML = b.length && S.cur === 3 ? `Can't start yet:<ul>${b.map((x) => `<li><button type="button" class="blocker-jump" data-jump="${esc(jumpFor(x))}">${esc(x)}</button></li>`).join("")}</ul>` : "";
  paintSetupCards();


  // banners
  $("homeBar").classList.toggle("hidden", !(S.connected && S.safety.limits && !S.safety.referenced && S.status.state !== "Home"));
  const estop = !!(S.status.inputs && S.status.inputs.estop);
  $("estopBar").classList.toggle("hidden", !(S.connected && estop));
  const inAlarm = S.connected && S.status.state === "Alarm" && !estop;
  $("alarmBar").classList.toggle("hidden", !inAlarm);
  // FluidNC can start up in Alarm without an ALARM:n line, so the banner still has to say what to do
  if (inAlarm && !S.lastAlarm) $("alarmText").textContent = ALARM_DEFAULT;
  try { placeToast(); } catch (e) { /* ignore */ }

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
  const b = blocked;
  const off = $("btnStart").disabled && b.length > 0;
  el.classList.toggle("hidden", !off);
  if (!off) { el.textContent = ""; return; }
  const first = String(b[0]).replace(/\s+/g, " ");
  el.textContent = "Can't start yet: " + first + (b.length > 1 ? ` (+${b.length - 1} more in the list)` : "");
}
function paintBedStatus() {
  const box = $("bedStatus"); if (!box) return;
  const n = (sketch && S.src === "shape") ? Setup.partCount(sketch) : 0;
  const what = S.prepared ? (S.src === "file" ? (S.design && S.design.coupon ? "a cut-test coupon" : S.design && S.design.straight ? "a straight cut" : "1 file loaded") : (n ? `${n} part${n === 1 ? "" : "s"} on the bed` : "a file loaded")) : "";
  box.classList.toggle("hidden", !what || screen() !== "cut");
  if (what) $("bedStatusText").textContent = "On the bed now: " + what + ".";
}

function jumpFor(text) {
  const t = String(text || "");
  if (/link a machine|Practice \(no machine\)/i.test(t)) return "connectLock";
  if (/Not connected/i.test(t)) return "btnConnect";
  if (/Start point|Start here/i.test(t)) return "btnZero";
  if (/alarm|Unlock/i.test(t)) return "btnUnlock";
  if (/homing|press Home/i.test(t)) return "zeroCard";
  if (/doesn't fit|sheet/i.test(t)) return "layoutCard";
  if (/Tick every box/i.test(t)) return "checklist";
  if (/No part|step 1/i.test(t)) return "step1Title";
  if (/E-STOP/i.test(t)) return "btnStop";
  return "checkCard";
}
function paintSetupCards() {
  const boxes = $$("#checklist input:not([disabled])");
  const checkOk = boxes.length > 0 && boxes.every((x) => x.checked);
  const apply = (id, done) => {
    const el = $(id); if (!el || el.tagName !== "DETAILS") return;
    if (!done) { el.open = true; el.dataset.wasDone = ""; return; }
    if (el.dataset.wasDone !== "1") { el.open = false; el.dataset.wasDone = "1"; }
  };
  // layout and start-point cards stay open: those actions are used again after the first time
  apply("checkCard", checkOk);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".blocker-jump");
  if (!b) return;
  const el = document.getElementById(b.dataset.jump);
  if (!el) return;
  const card = el.closest("details"); if (card) card.open = true;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  try { el.focus(); } catch (err) { /* ignore */ }
});

// The big repaint: refresh() brings every button, banner and lamp in line with the current state.
import { estopOn, estopPaint, paintLock, screen } from "./flow.js";
import { ALARM_DEFAULT, POSITION_LOST_ALARMS } from "../machine/machine.js";
import { limitsSizeText } from "../machine/safety.js";
import * as Acc from "../account/account.js";
import { paintDelay } from "../cut/pierce.js";
import { paintRestart } from "../cut/restart.js";
import { updatePlayRow } from "../cut/playback.js";
import { paintCutBar } from "../cut/cutbar.js";
import { placeSetupColumns } from "../cut/setuplayout.js";
import { paintCutStatus } from "../cut/cutstatus.js";
import { paintCutPanels } from "../cut/cutpanels.js";
import * as Setup from "../cut/setup.js";
import { M, S, sketch } from "../core/state.js";
import { $, $$, clock, esc, fmtTime, placeToast } from "../core/dom.js";
import { formatLen } from "../core/prefs.js";
import { setInfoText } from "./hovertip.js";
import { blockers, paintBeforeCut, overlayLive, paintZeroWarn } from "../cut/checklist.js";
import { etchPausePrompts } from "../cut/etch.js";
import { drawPreview, fit, wcoNow } from "../cut/preview.js";
import { syncHeaderButtons } from "./header.js";
import { paintConnectLock, paintWhy } from "./gate.js";
import { paintGuide } from "../make/shapeform.js";
import { machineAllowed } from "../machine/access.js";
import { canGo } from "./nav.js";
import { liveProgress } from "../cut/progress.js";
import { ampsNow } from "../cut/material.js";
import { matchPreset } from "../machine/settings.js";
import { paintMotorDir } from "../machine/motordir.js";
import { paintTorchTest, torchTestLit } from "../machine/torchtest.js";
import { drawSetupBed } from "../machine/setupbed.js";
import { sheetCornerName } from "../cut/bedview.js";

// The header's state chip. While the E-stop is latched it says "Stopped" (red) whatever the controller reports, so a green
// "Ready" never sits next to E-STOP ON (r7 U7).
const STATE_WORDS = { Idle: "Ready", Run: "Moving", Jog: "Moving", Home: "Homing", Hold: "Paused", Alarm: "Alarm", Disconnected: "" };
function paintStateBadge() {
  const badge = $("stateBadge"); if (!badge) return;
  const st = (S.status && S.status.state) || "", stopped = S.connected && estopOn();
  const word = stopped ? "Stopped" : (STATE_WORDS[st] ?? st);
  if (badge.textContent !== word) badge.textContent = word;
  badge.className = "badge " + (stopped ? "Alarm" : st);
  badge.classList.toggle("hidden", !S.connected || !word);
}
export function paintChrome() {
  try { syncHeaderButtons(); } catch (e) { /* ignore */ }
  const b = document.querySelector(".topbar");
  if (b) document.documentElement.style.setProperty("--topbar-h", Math.ceil(b.getBoundingClientRect().height) + "px");
  const torch = !!(S.status && S.status.torch) || torchTestLit();
  const pill = $("torchPill");
  if (pill) {
    pill.hidden = !S.connected;       // no TORCH OFF until a machine is connected
    pill.textContent = torch ? "TORCH ON" : "TORCH OFF";
    pill.classList.toggle("on", torch);
    pill.classList.toggle("off", !torch);
  }
  // r7 U12: one practice chip. On the practice table the connection pill already says "Practice table" (it never fires a torch),
  // so "Practice run · torch off" only shows for a practice run on a real machine.
  const pr = $("practiceChip");
  if (pr) {
    const on = !!(S.prepared && S.prepared.dry_run) || ($("dryRun") && $("dryRun").checked);
    pr.classList.toggle("hidden", !on || !!(S.connected && S.demo));
  }
  const zs = $("zeroState");
  if (zs) {
    if (S.zeroSet && S.connected && S.safety && S.safety.referenced === false) {
      zs.textContent = "Set home again before cutting — the table may have lost its place.";
      zs.classList.add("warntext");
    } else if (S.zeroSet) {
      zs.textContent = "Sheet corner set ✓  The part cuts where you place it.";
      zs.classList.remove("warntext");
    } else if (S.connected) {
      zs.textContent = "Sheet corner not set yet.";
      zs.classList.add("warntext");
    } else {
      zs.textContent = "The part cuts where you place it.";
      zs.classList.remove("warntext");
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
  paintLock(); estopPaint(); paintStateBadge();
  // r7 U6: while the E-stop is latched, Unlock is off with the reason beside it (css/screen-cut.css .unlockwhy)
  document.body.classList.toggle("estop-latched", estopOn());
  for (const id of ["btnUnlock", "btnUnlock2"]) if ($(id)) $(id).disabled = estopOn();
  const lost = S.lastAlarmCode != null && POSITION_LOST_ALARMS.has(S.lastAlarmCode);
  const again = $("btnAgain"), rezero = $("btnRezero");
  if (again && rezero) {
    again.classList.toggle("hidden", !!lost);
    rezero.classList.toggle("hidden", !lost);
  }
}
// The laptop cutting screen's "Job and machine" card (#jobCard, shown by css/screen-cut.css on a wide screen with a mouse)
function setText(id, text) { const el = $(id); if (el && el.textContent !== text) el.textContent = text; }
const jobSize = (P) => (P.summary ? `${formatLen(P.summary.width, 1)} × ${formatLen(P.summary.height, 1)}` : `${formatLen(P.stats.width_mm, 1)} × ${formatLen(P.stats.height_mm, 1)}`);
function paintJobCard() {
  if (!$("jobCard")) return;
  const P = S.prepared, st = P && P.stats;
  setText("jcFile", P ? S.fileName || "Untitled" : "No part yet");
  setText("jcSize", P ? jobSize(P) : "–");
  setText("jcCuts", !P ? "–" : `${st.pierces} ${st.pierces === 1 ? "cut" : "cuts"} · about ${fmtTime(st.estimated_seconds)}${P.dry_run ? " · practice run" : ""}`);
  let mat = "–";
  if (S.material && S.thickness != null) {
    let amps = "";
    try { amps = ` · ${ampsNow()} A ${matchPreset(S.material, S.thickness) ? "(your preset)" : "(cut chart)"}`; } catch (e) { /* no chart row yet */ }
    mat = `${S.material} · ${S.thickness} mm${amps}`;
  }
  setText("jcMat", mat);
  const t = S.cfg && S.cfg.travel_mm, conn = $("connPill").title || "Not connected", badge = $("stateBadge");
  const L = S.safety && S.safety.limits, edges = limitsSizeText(L), on = !!(L && S.safety.referenced);
  const bed = t ? `${Math.round(t.x)} × ${Math.round(t.y)}` : "";
  let size = "";
  if (on) size = ` · reachable ${edges}` + (bed && bed + " mm" !== edges ? ` (bed ${bed} mm)` : "");
  else if (L) size = ` · edges ${edges} (set home to use them)`;
  else if (bed) size = ` · ${bed} mm`;
  setText("jcMach", `${conn}${S.connected && badge && badge.textContent ? ` · ${badge.textContent}` : ""}${size}`);
}
export function refresh() {
  paintChrome();
  setTimeout(paintWhy, 0);
  paintConnectLock();
  // stats + fit (preview pane)
  const f = fit();
  $("fit").className = "fit " + f.cls;
  if (f.fixLabel) {
    $("fit").innerHTML = `${esc(f.text)} <button type="button" class="small" id="fitFixBtn">${esc(f.fixLabel)}</button>`;
    const fb = $("fitFixBtn");
    if (fb) fb.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (typeof f.fix === "function") f.fix(); };
  } else {
    $("fit").textContent = f.text;
  }
  $("fit").style.cursor = f.cls === "unknown" ? "pointer" : "";
  $("fit").title = f.cls === "unknown" ? "Open Machine setup" : "";
  const fitChip = $("fitChip");
  const demoHint = !!(f && f.text && /^Demo:/.test(f.text));
  const onSetup = document.body.dataset.screen === "cut" && (String(S.cur) === "3" || String(S.cur) === "1");
  if (fitChip) {
    if (onSetup && demoHint) {
      fitChip.textContent = f.text;
      fitChip.classList.remove("hidden");
      $("fit").textContent = "";
      $("fit").innerHTML = "";
      $("fit").classList.add("hidden");
    } else if (demoHint) {
      // r15 4.13: "Demo: tap here and the edges are set up for you" is a Setup hint; it isn't shown while cutting or after a stop
      $("fit").textContent = "";
      $("fit").classList.add("hidden");
      fitChip.textContent = "";
      fitChip.classList.add("hidden");
    } else {
      $("fit").classList.remove("hidden");
      fitChip.textContent = "";
      fitChip.classList.add("hidden");
    }
  }
  const kn = $("kerfNote");
  if (kn) kn.classList.toggle("hidden", !S.prepared || screen() !== "cut" || Number(S.cur) < 2);
  if (S.prepared) {
    const st = S.prepared.stats;
    $("jobStats").innerHTML = `<span><b>${esc(S.fileName)}</b></span><span>Size <b>${jobSize(S.prepared)}</b></span>
      ${S.prepared.summary ? `<span>Parts <b>${(S.src !== "file" && sketch && sketch.items.length && Setup.partCount(sketch)) || S.prepared.summary.parts}</b> · holes <b>${S.prepared.summary.holes}</b></span>` : `<span>Cuts <b>${st.pierces}</b></span>`}<span>About <b>${fmtTime(st.estimated_seconds)}</b></span>${S.prepared.dry_run ? "<span><b>PRACTICE RUN</b></span>" : ""}`;
  } else $("jobStats").innerHTML = "";
  $("next1").disabled = !S.prepared;
  updatePlayRow(); paintRestart(); paintDelay(); paintGuide(); paintJobCard(); paintCutBar(); paintCutStatus(); paintCutPanels(); placeSetupColumns();
  if ($("btnEditDrawing")) $("btnEditDrawing").classList.toggle("hidden", !(S.design && !S.design.straight && S.src === "file" && S.design.contours && S.design.contours.length));
  paintBedStatus();
  const legend = $("pathLegend");
  if (legend) {
    const show = document.body.dataset.screen === "cut" && String(S.cur) === "1";
    legend.classList.toggle("hidden", !show);
  }
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
  // each reason is text with a small "Show me" button that jumps to the control (r7 U28: no sentence-sized button outsizes STOP)
  paintBeforeCut();
  $("blockers").innerHTML = b.length && S.cur === 3 ? `Can't start yet:<ul>${b.map((x) => `<li><span>${esc(x)}</span> <button type="button" class="blocker-jump small" data-jump="${esc(jumpFor(x))}">Show me</button></li>`).join("")}</ul>` : "";
  paintSetupCards();


  // banners
  const needHome = !!(S.connected && S.safety.limits && !S.safety.referenced && S.status.state !== "Home");
  $("homeBar").classList.toggle("hidden", !needHome);
  const homeTxt = $("homeBarText");
  if (needHome && homeTxt) {
    const sz = limitsSizeText(S.safety.limits);
    homeTxt.innerHTML = `<b>Set home again to use your saved edges (${sz}).</b><br>The table lost its place when the connection dropped. Your edges are still saved in this browser. On Machine setup, jog to your marked home corner and press “Set this as home (0,0)”. Then press Start here at the sheet corner.`;
  }
  const estop = !!(S.status.inputs && S.status.inputs.estop);
  $("estopBar").classList.toggle("hidden", !(S.connected && estop));
  const inAlarm = S.connected && S.status.state === "Alarm" && !estop;
  $("alarmBar").classList.toggle("hidden", !inAlarm);
  // FluidNC can start up in Alarm without an ALARM:n line, so the banner still has to say what to do
  if (inAlarm && !S.lastAlarm) $("alarmText").textContent = ALARM_DEFAULT;
  try { placeToast(); } catch (e) { /* ignore */ }

  // running / done panel
  if (S.job) {
    const j = S.job, live = liveProgress();
    // r7 U11: the link dropped while the job ran. The app can't know what the machine is doing, so the panel stops counting
    // (frozen at the moment the link went), says so, and Pause is off (it can't reach the machine). The red banner says what to do.
    const linkLost = j.running && !S.connected;
    const board = !!j.boardRun;
    const uploading = board && j.phase === "upload";
    if (linkLost && !S.lostProgress) S.lostProgress = live;
    if (!linkLost) S.lostProgress = null;
    const P = S.lostProgress || live;
    $("running").classList.toggle("linklost", linkLost && !board);
    const finished = !j.running && S.status.state === "Idle";
    const pct = uploading ? (j.pct || 0) : j.result === "done" ? 100 : P.pct;
    $("pct").textContent = Math.floor(pct) + "%";
    $("progBar").style.width = Number(pct).toFixed(1) + "%";
    $("timeLeft").textContent = (linkLost && !board) ? "–" : uploading ? "–" : j.running ? clock(P.left) : "0:00";
    const pierces = S.prepared ? S.prepared.stats.pierces : 0;
    $("runInfo").textContent = uploading ? `Sending the cut to the table… ${Math.floor(pct)}%`
      : (linkLost && board) ? "The table is still cutting. Reconnect to watch it or to stop it."
      : linkLost ? `Link lost after ${clock(P.elapsed)}. Use the machine's own E-stop or power switch.`
      : `${clock(P.elapsed)} so far` + (pierces ? ` · cut ${Math.min(pierces, (M.runFrom || 1) - 1 + Math.max(1, P.cut))} of ${pierces}` : "");
    const hold = S.status.state === "Hold";
    const lostArc = !!(S.arcWatch && S.arcWatch.lost) || ($("lostArc") && !$("lostArc").classList.contains("hidden"));
    const prompts = (S.prepared && S.prepared.lines) ? etchPausePrompts(S.prepared.lines) : [];
    const amp = !!(j.running && hold && !linkLost && !S.userHold && !lostArc && !S.status.torch && prompts.length && (S.ampPauseConsumed || 0) < prompts.length);
    S.ampPause = amp ? prompts[S.ampPauseConsumed || 0] : null;
    if ($("ampPauseMsg")) {
      $("ampPauseMsg").classList.toggle("hidden", !S.ampPause);
      if (S.ampPause) $("ampPauseMsg").textContent = S.ampPause.msg;
    }
    $("running").classList.toggle("amp-pause", !!S.ampPause);
    $("runTitle").textContent = uploading ? "Sending the cut to the table…"
      : (linkLost && board) ? "Running on the table (not watched)"
      : linkLost ? "Link lost: job state unknown"
      : S.ampPause ? "Paused"
      : hold ? "Paused"
      : j.running ? "Cutting…" : "Finishing last moves…";
    $("btnPause").disabled = linkLost || uploading;
    const pauseLabel = hold ? "Resume" : "Pause";
    if ($("btnPause").dataset.face !== pauseLabel) {
      $("btnPause").dataset.face = pauseLabel;
      $("btnPause").innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-${hold ? "play" : "pause"}"></use></svg> ${pauseLabel}`;
    }
    const ov = S.status.feedOv || 100;
    if (j.running) S.lastFeedOv = ov;
    if ($("runHelp")) $("runHelp").textContent = board && j.running
      ? (linkLost ? "The cut is running on the table. Use the table's own E-stop if you need to stop it now."
        : "Pause and E-STOP still work while you're connected. The cut runs on the table, so it keeps going if the laptop disconnects. Stay with the table and know where its E-stop is.")
      : "Pause stops the machine and the torch. E-STOP or the space bar cancels the job. Keep this tab open and the computer awake.";
    $("liveSpeed").textContent = `${Math.round((S.speed * ov) / 100)} mm/min` + (ov !== 100 ? ` (${ov}% of ${S.speed})` : "");
    const showDone = (!j.running && j.result !== "done") || finished;
    $("running").classList.toggle("hidden", showDone);
    $("done").classList.toggle("hidden", !showDone);
    if (showDone) {
      const ok = j.result === "done";
      if ($("btnStreamFallback")) $("btnStreamFallback").classList.toggle("hidden", !(!ok && S.needStreamFallback));
      $("doneTitle").textContent = ok ? "Finished ✓" : "Stopped";
      const infoText = $("doneInfoText") || $("doneInfo");
      const infoTip = $("doneInfoTip");
      const raw = ok ? `Took ${fmtTime(j.elapsed)}. Lift the part out when it's cool.`
        : (j.message || S.lastAlarm || "The job was stopped before the end.");
      const probeStop = !ok && /10k|GPIO32|pull-up|not trusted|already triggered|touch-off/i.test(raw || "");
      if (infoText) infoText.textContent = probeStop ? "The torch height reading wasn't trusted, so the cut stopped." : raw;
      if (infoTip) {
        infoTip.classList.toggle("hidden", !probeStop);
        if (probeStop) infoTip.dataset.tip = raw;
      }
      if ($("doneReset")) $("doneReset").classList.toggle("hidden", ok || !estopOn());   // r15 1.3: said here, not in a toast over the buttons
      const changed = S.lastFeedOv !== 100 && S.prepared && !S.prepared.dry_run;
      const v = Math.round((S.speed * S.lastFeedOv) / 100 / 10) * 10;
      $("btnSaveSpeed").textContent = `Save ${v} mm/min as my speed for ${S.material.toLowerCase()} ${S.thickness} mm`;
      if (changed) $("btnSaveSpeed").classList.remove("hidden");
    }
  }
  const t = $("torchBig");
  const torchOn = !!(S.status && S.status.torch) || torchTestLit();
  t.textContent = torchOn ? "TORCH ON" : "Torch off";   // r15 4.11: the calm state in sentence case; a lit torch stays loud
  t.classList.toggle("on", torchOn);

  // movement controls are off while a job runs
  const busy = !!(S.job && S.job.running), idle = S.status.state === "Idle";
  $$(".j, .steps button, .do-home, .do-raise, #btnGoStart, #setupView button").forEach((el) => {
    // Never disable Test torch here: flipping disabled mid-hold fires
    // pointercancel and would send M5 while the button is still held.
    if (el.id !== "btnDisconnect" && el.id !== "btnTorchTest") el.disabled = busy;
  });
  $("btnTrace").disabled = busy || !(S.prepared && idle);
  $("btnZero").disabled = busy || !idle;
  paintMotorDir();
  paintTorchTest();
  paintBedStartHelp();
  drawPreview();
  drawSetupBed();
}
// B5 18: the reasons Start is greyed, as visible text next to the button (the full list is still under "Check, then cut")
function paintBedStartHelp() {
  const el = $("bedStartHelp"); if (!el) return;
  const corner = sheetCornerName({ long: true });
  const full = "The part cuts where you place it on the bed. You do not set a start point on the part. Start here only tells the table where the sheet's "
    + corner + " is (that corner is 0, 0 on the layout; every cut is measured from there). The torch does not move. Go to start point then goes to where the cut begins.";
  setInfoText(el, "The part cuts where you place it on the bed.", full, "More about Start here");
}
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
  const hide = !what || screen() !== "cut";
  box.classList.toggle("hidden", hide);
  const clr = $("btnClearBed");
  if (clr) clr.classList.toggle("hidden", hide);
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
  if (/safety check box/i.test(t)) return "checklist";
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
  apply("checkCard", checkOk);
  // on a laptop or a phone held upright the layout and start-point cards stay open (those actions are used again). A phone on its
  // side has little height, so they fold once done too, leaving the next thing to do in view (r7 U8); a tap opens them again.
  if (document.body.classList.contains("short-land")) {
    apply("layoutCard", Setup.layoutActive() && !Setup.blockText().length);
    apply("zeroCard", !!S.zeroSet);
  }
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

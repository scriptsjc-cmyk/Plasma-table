// Reacts to everything the machine reports: status, safety flags, events, job log entry.
import { appendConsole } from "./admin-machine.js";
import { looksLikeFluidNC } from "./fluidnc.js";
import { POSITION_LOST_ALARMS } from "./machine.js";
import { limitsSizeText } from "./safety.js";
import * as Acc from "../account/account.js";
import { noteJobEnded } from "../cut/restart.js";
import { M, S, sketch } from "../core/state.js";
import { trackProgress } from "../cut/progress.js";
import { $, $$, placeToast } from "../core/dom.js";
import { renderPos } from "./jog.js";
import { refresh } from "../ui/refresh.js";
import { keepAwake, setConnected } from "./connection.js";
import { LOST_BOARD } from "./boardrun.js";
import { goStep } from "../ui/nav.js";
import { log } from "./console.js";
import { probeDisplayOn } from "./probefilter.js";
import { torchTestLit } from "./torchtest.js";

function onStatus(st) {
  S.status = st;
  trackProgress(st);
  renderPos();                      // (the state chip's word is painted by refresh(): it has to agree with the E-stop latch)
  renderLamps(st);
  refresh();
}
export function renderLamps(st) {
  const inp = st.inputs || {};
  $$("[data-in]").forEach((el) => {
    const k = el.dataset.in;
    // Probe lamp is debounced so electrical noise doesn't flicker it. Other
    // inputs (especially E-stop) stay immediate.
    const on = k === "torch" ? !!(st.torch || torchTestLit()) : k === "probe" ? probeDisplayOn() : !!inp[k];
    el.classList.toggle("on", on);
    if (el.closest(".mini") && k === "estop") el.textContent = on ? "E-STOP!" : "E-stop OK";
  });
}
export function onSafety(sf) {
  S.safety = sf || {};
  $("refState").textContent = sf.referenced ? (sf.ref_mode === "homed" ? "Homed ✓" : "Home corner set ✓") : "Unknown";
  $("refState").className = sf.referenced ? "good" : "todo";      // round 5 look M4: "not set yet" is a to-do, not an alarm
  if (sf.limits) {
    $("limState").textContent = limitsSizeText(sf.limits) + (sf.referenced ? " ✓" : " (set home to use them)");
    $("limState").className = sf.referenced ? "good" : "todo";
  } else { $("limState").textContent = "Not set"; $("limState").className = "todo"; }
  $("safetyHint").textContent = !sf.limits
    ? "Do this once: it stops the torch ever being driven off the rails or into the slats."
    : sf.referenced
      ? "The machine checks every move against these edges. Jogs stop at the edge; parts that don't fit won't start."
      : `Your edges (${limitsSizeText(sf.limits)}) are still saved in this browser. The table lost its place when the connection dropped, so set home again before you cut — jog to your marked home corner and press “Set this as home (0,0)”. Then press Start here at the sheet corner.`;
  const d = sf.draft || {};
  $("wz1").classList.toggle("done", !!sf.referenced);
  $("wz2").classList.toggle("done", !!(sf.limits || d.x !== undefined));
  $("wz3").classList.toggle("done", !!(sf.limits || d.z !== undefined));
  $("wzFar").textContent = d.x !== undefined ? `(${Math.abs(d.x).toFixed(0)} × ${Math.abs(d.y).toFixed(0)} mm)` : "";
  $("wzZ").textContent = d.z !== undefined ? `(${Math.abs(d.z).toFixed(0)} mm down)` : "";
  refresh();
}
export async function maybeLogJob(j) {
  if (!j || !Acc.isSignedIn()) return;
  const serial = (Acc.linkedSerials() || [])[0] || null;
  const stats = S.prepared && S.prepared.stats;
  const parts = (sketch && sketch.items && sketch.items.length) || 1;
  if (j.running) {
    // Job progress events arrive many times a second. Log the start ONCE per job (a request still in flight, or a
    // failed one, must not be retried on every event: that flooded job_events with duplicate 'started' rows).
    if (!S.jobLogP && !S.jobLogId) {
      S.jobLoggedEnd = false;
      S.jobLogP = Acc.logJobEvent({ status: "started", serial, partCount: parts, cutLengthMm: stats && stats.cut_length_mm })
        .then((r) => { S.jobLogId = r && r.id; })
        .catch(() => { /* privacy: never block a cut */ });
    }
  } else if (j.result && !S.jobLoggedEnd) {
    S.jobLoggedEnd = true;
    try { if (S.jobLogP) await S.jobLogP; } catch (e) { /* ignore */ }
    try {
      await Acc.logJobEvent({
        status: j.result === "done" ? "finished" : "aborted",
        serial,
        durationS: j.elapsed,
        cutLengthMm: stats && stats.cut_length_mm,
        partCount: parts,
        eventId: S.jobLogId,
      });
    } catch (e) { /* ignore */ }
    S.jobLogId = null; S.jobLogP = null;
  }
}
// the lost-link banner: the "while running" wording is the default in index.html and is never softened
const LOST_HOT = { title: "Connection lost while the machine was running.", text: "The torch may still be ON and the table may still be moving. Use the machine's own E-stop or power switch now." };
function showLost({ title, text }) {
  if ($("lostTitle")) $("lostTitle").textContent = title;
  if ($("lostText")) $("lostText").textContent = text;
  $("lostBar").classList.remove("hidden"); try { placeToast(); } catch (e) {}
}
export function onEvent(kind, d) {
  if (kind === "status") {
    const wasLive = S.connected;
    const wasHot = d.state === "Disconnected" && S.connected && !S.userDisconnected && (M.jobRunning() || !!(S.status && S.status.torch) || ["Run", "Jog", "Hold", "Home"].includes(S.status && S.status.state));
    onStatus(d);
    if (d.state === "Disconnected") {
      setConnected(false);
      // a dropped link (USB / Bluetooth unplugged) cannot be told to switch the torch off: say so loudly
      // (no toast: it would only repeat the banner and cover the run numbers, r7 U29)
      if (wasHot && $("lostBar")) {
        const board = M.grbl && M.grbl.job && M.grbl.job.boardRun && (M.grbl.job.phase === "run" || M.grbl.job.unwatched);
        const bt = !!(M.grbl && M.grbl.t && M.grbl.t.kind === "bluetooth");
        if (board) {
          showLost(bt ? {
            title: LOST_BOARD.title,
            text: LOST_BOARD.text + " If Connect keeps failing after the table has already stopped, power-cycle the ESP32 — a wedged Bluetooth radio will not come back on its own. Do not power-cycle while a cut is still running on the board.",
          } : LOST_BOARD);
        } else {
          showLost(bt ? {
            title: LOST_HOT.title,
            text: LOST_HOT.text + " If Connect does not come back, power-cycle the ESP32 (unplug its power, wait a few seconds, and plug it back in). Restarting only this page will not clear a wedged Bluetooth radio.",
          } : LOST_HOT);
        }
      }
      // USB / Bluetooth link gone while idle (unplugged, power off, no answers): still say so loudly, with the reason
      else if (d.reason && wasLive && !S.userDisconnected && $("lostBar")) {
        const bt = !!(M.grbl && M.grbl.t && M.grbl.t.kind === "bluetooth");
        showLost({
          title: "Connection to the controller lost.",
          text: bt
            ? `${d.reason} Nothing will move until you reconnect. Wait a moment, then press Connect. If the board still does not answer, power-cycle the ESP32 (unplug its power, wait a few seconds, and plug it back in). Restarting only this page will not clear a wedged Bluetooth radio.`
            : `${d.reason} Nothing will move until you reconnect. Check the cable, then press Connect again.`,
        });
      }
    }
  } else if (kind === "log") {
    log(d.text, d.level);
    if (S._settingsCapture) S._settingsCapture.push(d.text || "");
    if ($("advConsoleLog")) appendConsole(d.text || "");
    if (looksLikeFluidNC(d.text)) S.fluidnc = true;
  }
  else if (kind === "job") {
    const wasRunning = !!(S.job && S.job.running);
    S.job = d;
    // only when a board run first shows up (start or re-attach), not on every progress update
    if (d.running && d.boardRun && !wasRunning) { keepAwake(true); try { goStep(4); } catch (e) { /* not on cut */ } }
    if (!d.running) {
      keepAwake(false);
      if (d.boardRun && d.result === "error" && d.phase === "upload") S.needStreamFallback = true;
    }
    noteJobEnded(d); maybeLogJob(d); refresh();
  }
  else if (kind === "alarm") { S.lastAlarm = d.message; S.lastAlarmCode = d.code; $("alarmTitle").textContent = "Alarm"; $("alarmText").textContent = d.message; if (POSITION_LOST_ALARMS.has(d.code)) S.zeroSet = false; refresh(); }
  else if (kind === "safety") onSafety(d);
}

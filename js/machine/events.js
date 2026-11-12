// Reacts to everything the machine reports: status, safety flags, events, job log entry.
import { appendConsole } from "./admin-machine.js";
import { looksLikeFluidNC } from "./fluidnc.js";
import { POSITION_LOST_ALARMS } from "./machine.js";
import * as Acc from "../account/account.js";
import { noteJobEnded } from "../cut/restart.js";
import { M, S, sketch } from "../core/state.js";
import { trackProgress } from "../cut/progress.js";
import { $, $$, placeToast } from "../core/dom.js";
import { renderPos } from "./jog.js";
import { refresh } from "../ui/refresh.js";
import { keepAwake, setConnected } from "./connection.js";
import { log } from "./console.js";

function onStatus(st) {
  S.status = st;
  trackProgress(st);
  renderPos();                      // (the state chip's word is painted by refresh(): it has to agree with the E-stop latch)
  renderLamps(st);
  refresh();
}
function renderLamps(st) {
  const inp = st.inputs || {};
  $$("[data-in]").forEach((el) => {
    const k = el.dataset.in;
    const on = k === "torch" ? !!st.torch : !!inp[k];
    el.classList.toggle("on", on);
    if (el.closest(".mini") && k === "estop") el.textContent = on ? "E-STOP!" : "E-stop OK";
  });
}
export function onSafety(sf) {
  S.safety = sf || {};
  $("refState").textContent = sf.referenced ? (sf.ref_mode === "homed" ? "Homed ✓" : "Home corner set ✓") : "Unknown";
  $("refState").className = sf.referenced ? "good" : "todo";      // round 5 look M4: "not set yet" is a to-do, not an alarm
  if (sf.limits) {
    const span = (a) => Math.round(Math.abs(sf.limits[a][1] - sf.limits[a][0]));
    $("limState").textContent = `${span("x")} × ${span("y")} mm` + (sf.referenced ? " ✓" : " (home first)");
    $("limState").className = sf.referenced ? "good" : "todo";
  } else { $("limState").textContent = "Not set"; $("limState").className = "todo"; }
  $("safetyHint").textContent = sf.limits
    ? "The machine checks every move against these edges. Jogs stop at the edge; parts that don't fit won't start."
    : "Do this once: it stops the torch ever being driven off the rails or into the slats.";
  const d = sf.draft || {};
  $("wz1").classList.toggle("done", !!sf.referenced);
  $("wz2").classList.toggle("done", d.x !== undefined);
  $("wz3").classList.toggle("done", d.z !== undefined);
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
      // a dropped link (Wi-Fi, USB pulled) cannot be told to switch the torch off: say so loudly
      // (no toast: it would only repeat the banner and cover the run numbers, r7 U29)
      if (wasHot && $("lostBar")) showLost(LOST_HOT);
      // USB link gone while idle (unplugged, power off, no answers): still say so loudly, with the reason
      else if (d.reason && wasLive && !S.userDisconnected && $("lostBar")) showLost({ title: "Connection to the controller lost.", text: `${d.reason} Nothing will move until you reconnect. Check the cable, then press Connect again.` });
    }
  } else if (kind === "log") {
    log(d.text, d.level);
    if (S._settingsCapture) S._settingsCapture.push(d.text || "");
    if ($("advConsoleLog")) appendConsole(d.text || "");
    if (looksLikeFluidNC(d.text)) S.fluidnc = true;
  }
  else if (kind === "job") { S.job = d; if (!d.running) keepAwake(false); noteJobEnded(d); maybeLogJob(d); refresh(); }
  else if (kind === "alarm") { S.lastAlarm = d.message; S.lastAlarmCode = d.code; $("alarmTitle").textContent = "Alarm"; $("alarmText").textContent = d.message; if (POSITION_LOST_ALARMS.has(d.code)) S.zeroSet = false; refresh(); }
  else if (kind === "safety") onSafety(d);
}

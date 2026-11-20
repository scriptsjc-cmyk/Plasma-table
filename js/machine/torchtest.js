// Machine setup: hold-to-fire Test torch. pointerdown sends M3; pointerup /
// cancel / lost capture / blur / hide / unload / disconnect / E-STOP / STOP /
// lost status / max hold send M5.
// Pointer capture keeps a hold stable: a small mouse/touchpad move (pointerleave)
// must not toggle the relay. Space never fires it.
import { isLaptopUi } from "../ui/laptop.js";
import { estopOn } from "../ui/flow.js";
import { M, S } from "../core/state.js";
import { $ } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { cmd } from "./access.js";
import { currentSettings, sanitizeCutterKind } from "./settings.js";

// Treat a dead link as a release, but never sooner than the transport's own
// no-reply watchdog (3 s on USB/Bluetooth). A tighter 1.5 s cutoff was firing
// M5 during ordinary Bluetooth lag, so the relay would not stay on.
const KEEPALIVE_FLOOR_MS = 3000;
export const TORCH_TEST_MAX_HOLD_MS = 2000;
export const TORCH_TEST_COOLDOWN_MS = 3000;
const TICKS = [
  "Earth clamp on",
  "Area clear, hands away",
  "Torch pointing at scrap or slats",
  "Air on",
];

const state = { lit: false, armed: false, keep: 0, litAt: 0, coolUntil: 0, cutoff: false };

function jobBusy() { return !!(S.job && S.job.running) || !!(M && M.jobRunning && M.jobRunning()); }
function isAlarm() { return /alarm/i.test((S.status && S.status.state) || ""); }
function boardEstop() {
  if (estopOn()) return true;
  try { if (M && M.estopLatched && M.estopLatched()) return true; } catch (e) { /* ignore */ }
  if (S.status && S.status.inputs && S.status.inputs.estop) return true;
  if (S.demo && S.demo.estop) return true;
  return false;
}

// Josh's current Reboot 60A is touch-start. The Settings cutter-type field (F1)
// can override this; until then, assume touch-start so the air-only warning shows.
export function cutterKind() {
  try {
    const s = (typeof currentSettings === "function" && currentSettings()) || (S && S.settings) || {};
    return sanitizeCutterKind((s.cutter && s.cutter.kind) || s.cutterType);
  } catch (e) { /* ignore */ }
  return "touch-start";
}

function isBluetooth() {
  try { return !!(M && M.grbl && M.grbl.t && M.grbl.t.kind === "bluetooth"); } catch (e) { return false; }
}

export function torchTestWhy() {
  if (!S.connected || !(M && M.grbl)) return "Connect to the table first.";
  if (boardEstop()) return "E-STOP is on. Release it and unlock first.";
  if (jobBusy()) return "Not while a job is running.";
  if (isAlarm()) return "Clear the alarm first.";
  const st = (S.status && S.status.state) || "";
  if (st && !/^(Idle|Check)$/i.test(st)) return "Wait until the machine is idle.";
  if (state.cutoff) return "Let go, then press again.";
  if (Date.now() < state.coolUntil) return "Wait a moment before testing again.";
  return "";
}
export function torchTestEnabled() { return !torchTestWhy(); }

async function confirmFirstUse() {
  return askConfirm({
    title: "Fire the torch?",
    body: "Hold Test torch to fire, and let go to stop. It turns off after 2 seconds and needs a fresh press (then a short wait).\n\nTorch over scrap, earth clamp on, hands clear. STOP stays available.",
    ok: "I understand",
    cancel: "Cancel",
    danger: true,
    ticks: TICKS,
  });
}

function sendOff() {
  if (!(M && M.grbl)) return;
  try { M.command({ cmd: "torch_off" }); } catch (e) {
    try {
      if (typeof M.grbl.writeNow === "function") M.grbl.writeNow("M5");
      else M.grbl.send("M5");
    } catch (e2) { /* already gone */ }
  }
}

function stopKeepalive() {
  if (state.keep) { clearInterval(state.keep); state.keep = 0; }
}

function keepaliveMs() {
  const wd = M && M.grbl && M.grbl.t && Number(M.grbl.t.watchdogMs);
  return Math.max(KEEPALIVE_FLOOR_MS, Number.isFinite(wd) ? wd : 0);
}

function startKeepalive() {
  stopKeepalive();
  state.keep = setInterval(() => {
    if (!state.lit) { stopKeepalive(); return; }
    if (shouldRelease()) torchTestOff({ reason: releaseReason() });
  }, 200);
}

function hitMaxHold() {
  return !!(state.lit && state.litAt && Date.now() - state.litAt >= TORCH_TEST_MAX_HOLD_MS);
}

function silenceTimedOut() {
  // lastRx === 0 is silence: time from when this test started, not from epoch.
  const last = (M && M.grbl && M.grbl.lastRx) || 0;
  const since = last || state.litAt || 0;
  return !!(since && Date.now() - since > keepaliveMs());
}

function releaseReason() {
  if (hitMaxHold()) return "max-hold";
  return "";
}

// Link gone, no status reports for the watchdog window (including never-received),
// max hold, or E-STOP — same as letting go.
function shouldRelease() {
  if (!S.connected || !(M && M.grbl) || M.grbl.running === false) return true;
  if (boardEstop()) return true;
  if (hitMaxHold()) return true;
  if (silenceTimedOut()) return true;
  return false;
}

export function torchTestOff(opts) {
  const reason = opts && opts.reason;
  const fromPointer = !!(opts && opts.fromPointer);
  stopKeepalive();
  const was = state.lit;
  const maxed = reason === "max-hold" || (was && state.litAt && Date.now() - state.litAt >= TORCH_TEST_MAX_HOLD_MS && reason !== "pointer");
  state.lit = false;
  if (maxed) {
    state.coolUntil = Date.now() + TORCH_TEST_COOLDOWN_MS;
    state.cutoff = true;
  }
  if (fromPointer) state.cutoff = false;
  paint();
  if (was) sendOff();
}

async function startFire(e) {
  if (e && e.button != null && e.button !== 0) return;
  if (e) e.preventDefault();
  if (state.lit) return;
  const why = torchTestWhy();
  if (why) return;
  if (!state.armed) {
    const ok = await confirmFirstUse();
    if (ok) state.armed = true;
    return; // this press only confirms; hold again to fire
  }
  if (torchTestWhy()) return;
  const r = cmd("torch_on", { confirm: true });
  if (!r) return;
  state.lit = true;
  state.litAt = Date.now();
  state.cutoff = false;
  paint();
  startKeepalive();
  // Keep receiving pointerup/cancel even if the pointer leaves the button.
  if (e && e.pointerId != null) {
    try { (e.currentTarget || $("btnTorchTest")).setPointerCapture(e.pointerId); } catch (err) { /* not a pointer event */ }
  }
}

export function paintTorchTest() {
  if (state.lit && shouldRelease()) { torchTestOff({ reason: releaseReason() }); return; }
  paint();
}

function setNote(id, on, text) {
  const el = $(id);
  if (!el) return;
  if (text) el.textContent = text;
  el.classList.toggle("hidden", !on);
}

function paint() {
  const el = $("btnTorchTest");
  if (el) {
    if (state.lit) {
      if (el.disabled) el.disabled = false;
      el.classList.add("torch-live");
      if (el.textContent !== "TORCH ON") el.textContent = "TORCH ON";
      if (el.getAttribute("aria-pressed") !== "true") el.setAttribute("aria-pressed", "true");
    } else {
      const why = torchTestWhy();
      if (el.disabled !== !!why) el.disabled = !!why;
      el.classList.remove("torch-live");
      if (el.textContent !== "Test torch") el.textContent = "Test torch";
      if (el.getAttribute("aria-pressed") !== "false") el.setAttribute("aria-pressed", "false");
    }
  }
  const touch = cutterKind() === "touch-start";
  setNote("torchTestCutterNote", touch, "Touch-start: no arc in air — this checks the relay and air only.");
  setNote("torchTestBtNote", isBluetooth(), "If the Bluetooth link drops while the torch is on, use the hardware E-stop. Reconnecting the app may not be enough.");
}

function isSpaceOrEnter(e) {
  return e.key === " " || e.code === "Space" || e.key === "Enter";
}

function onPointerRelease() {
  torchTestOff({ fromPointer: true, reason: "pointer" });
}

export function bindTorchTest() {
  const el = $("btnTorchTest");
  if (!el || el.dataset.torchBound) return;
  el.dataset.torchBound = "1";
  el.addEventListener("pointerdown", (e) => { startFire(e); });
  el.addEventListener("pointerup", () => onPointerRelease());
  // Not pointerleave: a 1 px mouse/touchpad move, or the label changing to
  // TORCH ON, would otherwise send M5 while the button is still held.
  el.addEventListener("pointercancel", () => onPointerRelease());
  el.addEventListener("lostpointercapture", () => onPointerRelease());
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("keydown", (e) => {
    if (isSpaceOrEnter(e)) e.preventDefault(); // never fire from the keyboard
  });
  el.addEventListener("keyup", (e) => { if (isSpaceOrEnter(e)) e.preventDefault(); });
  el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
  window.addEventListener("pointerup", () => onPointerRelease());
  window.addEventListener("blur", () => torchTestOff());
  document.addEventListener("visibilitychange", () => { if (document.hidden) torchTestOff(); });
  window.addEventListener("pagehide", () => torchTestOff());
  window.addEventListener("beforeunload", () => torchTestOff());
  paint();
}

export function torchTestLit() { return !!state.lit; }

export function torchTestState() {
  return {
    lit: state.lit,
    armed: state.armed,
    enabled: torchTestEnabled(),
    why: torchTestWhy(),
    laptop: isLaptopUi(),
    litAt: state.litAt,
    coolUntil: state.coolUntil,
    cutoff: state.cutoff,
    cooling: Date.now() < state.coolUntil,
    maxHoldMs: TORCH_TEST_MAX_HOLD_MS,
    cooldownMs: TORCH_TEST_COOLDOWN_MS,
    cutterKind: cutterKind(),
    bluetooth: isBluetooth(),
  };
}

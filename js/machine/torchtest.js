// Machine setup: hold-to-fire Test torch. pointerdown sends M3; pointerup /
// cancel / lost capture / blur / hide / disconnect / E-STOP / lost status send M5.
// Pointer capture keeps a hold stable: a small mouse/touchpad move (pointerleave)
// must not toggle the relay. Space never fires it.
import { isLaptopUi } from "../ui/laptop.js";
import { estopOn } from "../ui/flow.js";
import { M, S } from "../core/state.js";
import { $ } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { cmd } from "./access.js";

// Treat a dead link as a release, but never sooner than the transport's own
// no-reply watchdog (3 s on USB/Bluetooth). A tighter 1.5 s cutoff was firing
// M5 during ordinary Bluetooth lag, so the relay would not stay on.
const KEEPALIVE_FLOOR_MS = 3000;
const TICKS = [
  "Earth clamp on",
  "Area clear, hands away",
  "Torch pointing at scrap or slats",
  "Air on",
];

const state = { lit: false, armed: false, keep: 0 };

function jobBusy() { return !!(S.job && S.job.running) || !!(M && M.jobRunning && M.jobRunning()); }
function isAlarm() { return /alarm/i.test((S.status && S.status.state) || ""); }
function boardEstop() {
  if (estopOn()) return true;
  try { if (M && M.estopLatched && M.estopLatched()) return true; } catch (e) { /* ignore */ }
  if (S.status && S.status.inputs && S.status.inputs.estop) return true;
  if (S.demo && S.demo.estop) return true;
  return false;
}

export function torchTestWhy() {
  if (!S.connected || !(M && M.grbl)) return "Connect to the table first.";
  if (boardEstop()) return "E-STOP is on. Release it and unlock first.";
  if (jobBusy()) return "Not while a job is running.";
  if (isAlarm()) return "Clear the alarm first.";
  const st = (S.status && S.status.state) || "";
  if (st && !/^(Idle|Check)$/i.test(st)) return "Wait until the machine is idle.";
  return "";
}
export function torchTestEnabled() { return !torchTestWhy(); }

async function confirmFirstUse() {
  return askConfirm({
    title: "Fire the torch?",
    body: "Hold Test torch to fire, and let go to stop. It stays on for as long as you hold the button.\n\nTorch over scrap, earth clamp on, hands clear. STOP stays available.",
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
    if (shouldRelease()) torchTestOff();
  }, 200);
}

// Link gone, no status reports for the watchdog window, or E-STOP — same as letting go.
function shouldRelease() {
  if (!S.connected || !(M && M.grbl) || M.grbl.running === false) return true;
  if (boardEstop()) return true;
  const last = M.grbl.lastRx || 0;
  if (last && Date.now() - last > keepaliveMs()) return true;
  return false;
}

export function torchTestOff() {
  stopKeepalive();
  const was = state.lit;
  state.lit = false;
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
  paint();
  startKeepalive();
  // Keep receiving pointerup/cancel even if the pointer leaves the button.
  if (e && e.pointerId != null) {
    try { (e.currentTarget || $("btnTorchTest")).setPointerCapture(e.pointerId); } catch (err) { /* not a pointer event */ }
  }
}

export function paintTorchTest() {
  if (state.lit && shouldRelease()) { torchTestOff(); return; }
  paint();
}

function paint() {
  const el = $("btnTorchTest");
  if (!el) return;
  if (state.lit) {
    if (el.disabled) el.disabled = false;
    el.classList.add("torch-live");
    if (el.textContent !== "TORCH ON") el.textContent = "TORCH ON";
    if (el.getAttribute("aria-pressed") !== "true") el.setAttribute("aria-pressed", "true");
    return;
  }
  const why = torchTestWhy();
  if (el.disabled !== !!why) el.disabled = !!why;
  el.classList.remove("torch-live");
  if (el.textContent !== "Test torch") el.textContent = "Test torch";
  if (el.getAttribute("aria-pressed") !== "false") el.setAttribute("aria-pressed", "false");
}

function isSpaceOrEnter(e) {
  return e.key === " " || e.code === "Space" || e.key === "Enter";
}

export function bindTorchTest() {
  const el = $("btnTorchTest");
  if (!el || el.dataset.torchBound) return;
  el.dataset.torchBound = "1";
  el.addEventListener("pointerdown", (e) => { startFire(e); });
  el.addEventListener("pointerup", () => torchTestOff());
  // Not pointerleave: a 1 px mouse/touchpad move, or the label changing to
  // TORCH ON, would otherwise send M5 while the button is still held.
  el.addEventListener("pointercancel", () => torchTestOff());
  el.addEventListener("lostpointercapture", () => torchTestOff());
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("keydown", (e) => {
    if (isSpaceOrEnter(e)) e.preventDefault(); // never fire from the keyboard
  });
  el.addEventListener("keyup", (e) => { if (isSpaceOrEnter(e)) e.preventDefault(); });
  el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
  window.addEventListener("pointerup", () => torchTestOff());
  window.addEventListener("blur", () => torchTestOff());
  document.addEventListener("visibilitychange", () => { if (document.hidden) torchTestOff(); });
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
  };
}

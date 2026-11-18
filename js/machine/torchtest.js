// Machine setup: hold-to-fire Test torch. pointerdown sends M3; pointerup / leave /
// cancel / lost capture / blur / hide / disconnect / E-STOP send M5 at once.
// Stays on for as long as the button is held. Space never fires it.
import { isLaptopUi } from "../ui/laptop.js";
import { estopOn } from "../ui/flow.js";
import { M, S } from "../core/state.js";
import { $ } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { cmd } from "./access.js";

// A few missed 100 ms status polls means the link is dead — treat as release.
const KEEPALIVE_MS = 1500;
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
    try { M.grbl.send("M5"); } catch (e2) { /* already gone */ }
  }
}

function stopKeepalive() {
  if (state.keep) { clearInterval(state.keep); state.keep = 0; }
}

function startKeepalive() {
  stopKeepalive();
  state.keep = setInterval(() => {
    if (!state.lit) { stopKeepalive(); return; }
    if (shouldRelease()) torchTestOff();
  }, 200);
}

// Link gone, no status reports, or E-STOP — same as letting go.
function shouldRelease() {
  if (!S.connected || !(M && M.grbl) || M.grbl.running === false) return true;
  if (boardEstop()) return true;
  const last = M.grbl.lastRx || 0;
  if (last && Date.now() - last > KEEPALIVE_MS) return true;
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
}

export function paintTorchTest() {
  if (state.lit && shouldRelease()) { torchTestOff(); return; }
  paint();
}

function paint() {
  const el = $("btnTorchTest");
  if (!el) return;
  if (state.lit) {
    el.disabled = false;
    el.classList.add("torch-live");
    el.textContent = "TORCH ON";
    el.setAttribute("aria-pressed", "true");
    return;
  }
  const why = torchTestWhy();
  el.disabled = !!why;
  el.classList.remove("torch-live");
  el.textContent = "Test torch";
  el.setAttribute("aria-pressed", "false");
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
  el.addEventListener("pointerleave", () => torchTestOff());
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

export function torchTestState() {
  return {
    lit: state.lit,
    armed: state.armed,
    enabled: torchTestEnabled(),
    why: torchTestWhy(),
    laptop: isLaptopUi(),
  };
}

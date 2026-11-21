// Machine setup: Stock / Reversed X / Y / Z, relative to the shipped config.
// Changes the board's motor direction (FluidNC direction_pin :low, or GRBL $3)
// so probing and on-board jobs follow it too. After a change: lock jog and cut
// until the board restarts, then a guided test. Dual motors on one axis are flipped as a pair.
import { isLaptopUi } from "../ui/laptop.js";
import { estopOn } from "../ui/flow.js";
import { M, S } from "../core/state.js";
import { $, toast } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { cmd } from "./access.js";

const AXES = ["x", "y", "z"];
const PIN_PATH = (a, n) => `$/axes/${a}/motor${n}/standard_stepper/direction_pin`;
// Shipped hardware/config.yaml: X and Y already have :low, Z does not.
export const STOCK_PIN_LOW = { x: true, y: true, z: false };
const PENDING_KEY = "plasma.motorDir.pendingRestart";
const TEST_KEY = "plasma.motorDir.guidedTest";
const TEST_DIST_MM = 3;
const TEST_STEPS = [
  { axis: "X", dir: 1, question: "Did the head move right?" },
  { axis: "Y", dir: 1, question: "Did the head move towards you?" },
  { axis: "Z", dir: 1, question: "Did the head move up?" },
];

function pinParts(s) {
  const raw = String(s || "").trim();
  const bits = raw.split(":").filter((p) => p !== "");
  return { base: bits[0] || raw, attrs: bits.slice(1), raw };
}
export function pinHasLow(s) {
  return pinParts(s).attrs.some((a) => a.toLowerCase() === "low");
}
export function flipPinLow(s) {
  const { base, attrs } = pinParts(s);
  if (!base) return s;
  const rest = attrs.filter((a) => a.toLowerCase() !== "low");
  if (rest.length === attrs.length) rest.push("low");
  // FluidNC pin values are case-sensitive in practice: keys are case-insensitive, but
  // the value must be sent lowercase (gpio.26:low, not GPIO.26:LOW).
  return [base, ...rest].map((p) => p.toLowerCase()).join(":");
}
export function pinCanonical(s) {
  const raw = String(s || "").trim().replace(/^['"]|['"]$/g, "");
  return raw ? raw.toLowerCase() : raw;
}

function readFlag(key) {
  try { return localStorage.getItem(key) === "1"; } catch (e) { return false; }
}
function writeFlag(key, on) {
  try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch (e) { /* ignore */ }
}
function readTestStep() {
  try {
    // localStorage.getItem is null when the key is missing; Number(null) is 0,
    // which would look like "start the guided test" and lock cut for everyone.
    const raw = localStorage.getItem(TEST_KEY);
    if (raw == null || raw === "") return -1;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < TEST_STEPS.length ? n : -1;
  } catch (e) { return -1; }
}
function writeTestStep(n) {
  try {
    if (n >= 0) localStorage.setItem(TEST_KEY, String(n));
    else localStorage.removeItem(TEST_KEY);
  } catch (e) { /* ignore */ }
}

function gLink() { return M && M.grbl; }
const state = { pins: { x: {}, y: {}, z: {} }, mask: 0, ready: false, loading: false, painting: false, sawFluidPath: false, pendingRestart: readFlag(PENDING_KEY), testStep: readTestStep() };
function markFluid() {
  state.sawFluidPath = true;
  try { if (S) S.fluidnc = true; } catch (e) { /* ignore */ }
  const g = gLink();
  if (g) g.fluidnc = true;
}
export function isFluid() { return !!(state.sawFluidPath || S.fluidnc || (gLink() && gLink().fluidnc)); }
function jobBusy() { return !!(S.job && S.job.running) || !!(M && M.jobRunning && M.jobRunning()); }
function isAlarm() { return /alarm/i.test((S.status && S.status.state) || ""); }
function isIdle() { return /^(Idle|Check)$/i.test((S.status && S.status.state) || ""); }
function boardEstop() {
  if (estopOn() || (M && M.estopLatched && M.estopLatched())) return true;
  if (S.status && S.status.inputs && S.status.inputs.estop) return true;
  if (S.demo && S.demo.estop) return true;
  return false;
}

export function motorDirWhy() {
  if (!S.connected) return "Connect to the table first.";
  if (boardEstop()) return "E-STOP is on. Release it and unlock first.";
  if (jobBusy()) return "Not while a job is running.";
  if (isAlarm()) return "Clear the alarm first.";
  if (!isIdle()) return "Wait until the machine is idle.";
  return "";
}
export function motorDirEnabled() { return !motorDirWhy(); }

// FluidNC 4.1.1 RuntimeSetting prints a plain line:
//   $/axes/z/motor0/standard_stepper/direction_pin=gpio.26:low
// (no brackets). log_stream uses MsgLevelNone, so there is no [MSG:INFO:] wrap
// on this version; older or other channels may still bracket it.
export function parsePinReply(lines, path) {
  const key = String(path || "").replace(/^\$\//, "").trim().toLowerCase();
  for (const raw of lines || []) {
    let inner = String(raw).trim();
    inner = inner.replace(/^\[(?:MSG:(?:INFO|DBG|VRB|WARN|WRN|ERR|ERROR):\s*)?/i, "").replace(/\]$/, "").trim();
    const br = inner.match(/^(?:\$\/)?([^=\s]+?)\s*=\s*(\S+)\s*$/);
    if (br) {
      const got = br[1].replace(/^\$\//, "").trim().toLowerCase();
      if (!key || got === key) return pinCanonical(br[2]);
    }
    if (/^gpio\./i.test(inner) || /^NO_PIN$/i.test(inner) || /^i2so\./i.test(inner)) return pinCanonical(inner);
  }
  return "";
}
// $CD / $Config/Dump is a YAML dump: 2-space indent, no required header, and pin
// values that contain a colon are wrapped in single quotes (gpio.26:low). A real
// dump also lists every default, including Relay.direction_pin: NO_PIN — so the
// parser must stay inside the axes: tree and not take a later direction_pin.
export function parseDumpPins(text) {
  const out = { x: {}, y: {}, z: {} };
  let inAxes = false, axis = "", motor = "";
  let axesIndent = -1, axisIndent = -1, motorIndent = -1;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = String(raw).replace(/\t/g, "    ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";") || trimmed.startsWith("[")) continue;
    const m = line.match(/^(\s*)([^:#\n]+):\s*(.*?)\s*$/);
    if (!m) continue;
    const indent = m[1].length;
    const key = m[2].trim().toLowerCase();
    const val = pinCanonical(m[3].trim());
    if (key === "axes") {
      inAxes = true; axesIndent = indent; axis = ""; motor = "";
      continue;
    }
    if (inAxes && indent <= axesIndent) { inAxes = false; axis = ""; motor = ""; }
    if (!inAxes) continue;
    if ((key === "x" || key === "y" || key === "z") && indent > axesIndent) {
      axis = key; motor = ""; axisIndent = indent;
    } else if (/^motor[01]$/.test(key) && axis && indent > axisIndent) {
      motor = key.slice(-1); motorIndent = indent;
    } else if (key === "direction_pin" && axis && motor !== "" && indent > motorIndent) {
      out[axis][motor] = val;
    }
  }
  return out;
}

async function ask(line, timeout = 6000) {
  const g = gLink();
  if (!g || !g.ask) return { ok: false, lines: [], error: "Not connected." };
  // Never while a job runs: the ask would wait in the queue behind the job and go out the moment it ends.
  if (jobBusy()) return { ok: false, lines: [], error: "Not while a job is running." };
  return g.ask(line, { timeout });
}

async function readFluidPin(axis, motor) {
  const path = PIN_PATH(axis, motor);
  const r = await ask(path);
  if (!r.ok) return { ok: false, error: r.error || "no answer", missing: true };
  const pin = parsePinReply(r.lines, path);
  if (!pin) return { ok: false, error: (r.lines || []).join(" ") || "no pin value", missing: true };
  if (/^NO_PIN$/i.test(pin)) return { ok: false, missing: true, pin };
  return { ok: true, pin };
}

async function readFluidAll() {
  const pins = { x: {}, y: {}, z: {} };
  let any = false, lastErr = "";
  for (const a of AXES) {
    for (const n of [0, 1]) {
      const r = await readFluidPin(a, n);
      if (r.ok) { pins[a][n] = pinCanonical(r.pin); any = true; markFluid(); }
      else if (n === 0) lastErr = r.error || lastErr;
    }
  }
  if (any) return { ok: true, pins };
  // $CD dumps the whole YAML. That burst is enough to wedge FluidNC's Bluetooth
  // radio, and the pin-path queries above already covered a live FluidNC board.
  if (gLink() && gLink().t && gLink().t.kind === "bluetooth") {
    return { ok: false, pins, error: lastErr || "Couldn't read the direction pins." };
  }
  const dump = await ask("$CD", 8000);
  const parsed = parseDumpPins((dump.lines || []).join("\n"));
  for (const a of AXES) {
    for (const n of ["0", "1"]) if (parsed[a][n] && !/^NO_PIN$/i.test(parsed[a][n])) { pins[a][n] = parsed[a][n]; any = true; }
  }
  if (any) return { ok: true, pins };
  return { ok: false, pins, error: lastErr || dump.error || "Couldn't read the direction pins." };
}

async function readGrblMask() {
  const r = await ask("$$");
  if (!r.ok) return { ok: false, mask: 0, error: r.error || "no answer" };
  for (const line of r.lines || []) {
    const m = String(line).match(/^\$3\s*=\s*(\d+)/);
    if (m) return { ok: true, mask: Number(m[1]) & 7 };
  }
  const g = gLink(), t = g && g.t;
  if (t && t.settings && t.settings[3] != null) return { ok: true, mask: Number(t.settings[3]) & 7 };
  return { ok: false, mask: 0, error: "Couldn't read $3." };
}


// True when this axis does not match the shipped stock polarity.
function reversed(axis) {
  if (isFluid()) {
    const pin = state.pins[axis] && state.pins[axis][0];
    if (!pin) return false;
    return pinHasLow(pin) !== !!STOCK_PIN_LOW[axis];
  }
  const bit = { x: 1, y: 2, z: 4 }[axis];
  return !!(state.mask & bit); // GRBL stock is $3=0
}

function pairAxes() {
  return AXES.filter((a) => state.pins[a] && state.pins[a][1]);
}

export function motorDirLockWhy() {
  if (state.pendingRestart) return "Restart the board to apply the motor direction change. Jog and cut are locked until then.";
  if (state.testStep >= 0) return "Finish the motor direction test before cutting.";
  return "";
}
export function guidedJogAllowed() { return state.testStep >= 0 && !state.pendingRestart; }

function setPendingRestart(on) {
  state.pendingRestart = !!on;
  writeFlag(PENDING_KEY, state.pendingRestart);
  if (on) { state.testStep = -1; writeTestStep(-1); }
}

function clearHomedState() {
  try {
    if (M && typeof M.loseReference === "function" && M.safety && M.safety.referenced) {
      M.loseReference("Motor direction changed");
    } else if (M && M.safety && typeof M.safety.clearReference === "function") {
      M.safety.clearReference();
    }
    if (M) M.zeroConfirmed = false;
    if (S) S.zeroSet = false;
  } catch (e) { /* ignore */ }
}

// Called on reconnect or a controller banner: the board has come back after a direction change.
export function noteMotorDirRestarted() {
  if (!state.pendingRestart) return false;
  setPendingRestart(false);
  state.testStep = 0;
  writeTestStep(0);
  setNote("The board is back. Check each axis with the short test below.", true);
  toast("The board is back. Check each axis with the short test.");
  paint();
  return true;
}

function paintTest() {
  const box = $("motorDirTest");
  if (!box) return;
  const on = state.testStep >= 0 && !state.pendingRestart && S.connected;
  box.classList.toggle("hidden", !on);
  if (!on) return;
  const step = TEST_STEPS[state.testStep];
  const q = $("motorDirTestStep");
  if (q && step) {
    q.textContent = "Jog " + step.axis + "+ a short way, slowly. " + step.question;
  }
  const jog = $("btnDirTestJog");
  if (jog && step) jog.textContent = "Jog " + step.axis + " a short way (slow)";
}

function runGuidedJog() {
  if (!guidedJogAllowed()) return;
  const step = TEST_STEPS[state.testStep];
  if (!step) return;
  const why = motorDirWhy();
  if (why) { toast(why, true); return; }
  const r = cmd("jog", { axis: step.axis, dist: TEST_DIST_MM * step.dir, allowDirTest: true, slow: true });
  if (!r) return;
  if (r.note) toast(r.note);
}

function answerTest(yes) {
  if (state.testStep < 0) return;
  const step = TEST_STEPS[state.testStep];
  if (!yes) {
    toast("Switch " + step.axis + " to the other setting (Stock or Reversed), save, and restart the board again.", true);
    setNote("That axis is still the wrong way. Change " + step.axis + " below, restart the board, then test again.", true);
    return;
  }
  const next = state.testStep + 1;
  if (next >= TEST_STEPS.length) {
    state.testStep = -1;
    writeTestStep(-1);
    setNote("Motor direction looks right on X, Y and Z.", true);
    toast("Motor direction looks right.");
    paint();
    return;
  }
  state.testStep = next;
  writeTestStep(next);
  paint();
}


function paint() {
  const card = $("motorDirCard");
  if (!card) return;
  const laptop = isLaptopUi();
  card.classList.toggle("hidden", !laptop);
  if (!laptop) return;
  const why = motorDirWhy();
  const can = !why && state.ready && !state.loading;
  const note = $("motorDirNote");
  state.painting = true;
  for (const a of AXES) {
    const el = $("rev" + a.toUpperCase());
    const lab = el && el.closest("label");
    if (!el) continue;
    el.checked = reversed(a);
    el.disabled = !can;
    const stock = $("rev" + a.toUpperCase() + "Lab");
    if (stock) stock.textContent = reversed(a) ? "(Reversed)" : "(Stock)";
    if (lab) {
      if (!can) {
        lab.setAttribute("aria-disabled", "true");
        lab.dataset.why = why || (state.loading ? "Reading the board…" : "Couldn't read the motor direction from the board.");
      } else {
        lab.removeAttribute("aria-disabled");
        lab.removeAttribute("data-why");
      }
    }
  }
  const pair = $("motorDirPairNote");
  if (pair) {
    const axes = pairAxes();
    if (axes.length) {
      pair.textContent = axes.map((a) => a.toUpperCase()).join(" and ") +
        (axes.length === 1 ? " has two motors; they are reversed only as a pair." : " have two motors each; each axis is reversed only as a pair.");
      pair.classList.remove("hidden");
    } else {
      pair.textContent = "";
      pair.classList.add("hidden");
    }
  }
  if (note && !note.dataset.hold) {
    note.classList.toggle("hidden", !(!S.connected || (S.connected && !state.ready && !state.loading && why === "")));
    if (!S.connected) { note.textContent = ""; note.classList.add("hidden"); }
    else if (!state.ready && !state.loading && !why) { note.textContent = "Couldn't read the motor direction from the board."; note.classList.remove("hidden"); }
  }
  paintTest();
  state.painting = false;
}

export function paintMotorDir() { paint(); }

function setNote(text, hold = false) {
  const note = $("motorDirNote");
  if (!note) return;
  if (text) { note.textContent = text; note.classList.remove("hidden"); note.dataset.hold = hold ? "1" : ""; }
  else { note.textContent = ""; note.classList.add("hidden"); note.dataset.hold = ""; }
}

export async function loadMotorDir() {
  if (!isLaptopUi() || !S.connected || !gLink()) {
    state.ready = false; state.pins = { x: {}, y: {}, z: {} }; state.mask = 0;
    paint();
    return;
  }
  state.loading = true; paint();
  try {
    let fluid = isFluid();
    if (!fluid) {
      // Banner detection can miss a Bluetooth FluidNC 4.x build. If the board
      // answers a $/axes/... query with a pin, treat it as FluidNC from now on.
      const probe = await readFluidPin("x", 0);
      if (probe.ok) { markFluid(); fluid = true; }
    }
    if (fluid) {
      const r = await readFluidAll();
      if (r.ok) { markFluid(); state.pins = r.pins; state.ready = true; setNote(""); }
      else { state.ready = false; setNote(r.error || "Couldn't read the direction pins."); }
    } else {
      const r = await readGrblMask();
      if (r.ok) { state.mask = r.mask; state.ready = true; setNote(""); }
      else { state.ready = false; setNote(r.error || "Couldn't read $3."); }
    }
  } catch (e) {
    state.ready = false;
    setNote(e.message || "Couldn't read the motor direction.");
  }
  state.loading = false;
  paint();
}

async function writeFluid(axis) {
  const cur = state.pins[axis] && state.pins[axis][0];
  if (!cur) throw new Error("No direction pin to change on " + axis.toUpperCase() + ".");
  const next = flipPinLow(cur);
  const motors = Object.keys(state.pins[axis]).map(Number).sort();
  for (const n of motors) {
    const from = state.pins[axis][n];
    if (!from) continue;
    const val = pinCanonical(n === 0 ? next : flipPinLow(from));
    const r = await ask(PIN_PATH(axis, n) + "=" + val);
    const text = ((r.lines || []).join("\n") + " " + (r.error || "")).trim();
    if (/Runtime setting of Pin objects is not supported/i.test(text)) {
      throw new Error("This FluidNC build cannot change pin settings while it is running. Edit direction_pin in config.yaml (add or remove :low) and restart the board.");
    }
    if (!r.ok) throw new Error(r.error || "The board refused the new direction pin.");
    state.pins[axis][n] = val;
  }
  const save = await ask("$CD=config.yaml", 8000);
  if (!save.ok) throw new Error(save.error || "The direction was set, but saving config.yaml failed.");
}

async function writeGrbl(axis) {
  const bit = { x: 1, y: 2, z: 4 }[axis];
  const next = (state.mask ^ bit) & 7;
  const r = await ask("$3=" + next);
  if (!r.ok) throw new Error(r.error || "The board refused $3=" + next + ".");
  state.mask = next;
}

async function onToggle(axis, want) {
  if (state.painting) return;
  const el = $("rev" + axis.toUpperCase());
  if (!motorDirEnabled() || !state.ready) {
    if (el) el.checked = reversed(axis);
    const lab = el && el.closest("label");
    const why = (lab && lab.dataset.why) || motorDirWhy() || "Not available right now.";
    toast(why, true);
    return;
  }
  const already = reversed(axis);
  if (want === already) return;
  if (el) el.checked = already; // wait for confirm + write
  const g = gLink();
  if (!g) { toast("Connect to the table first.", true); return; }
  if (jobBusy()) { toast("Not while a job is running.", true); return; }
  if (boardEstop()) { toast("E-STOP is on. Nothing was sent.", true); return; }
  const fluid = isFluid();
  const title = "Set " + axis.toUpperCase() + (want ? " to Reversed?" : " back to Stock?");
  const body = fluid
    ? "This changes the motor direction on the controller and saves it to config.yaml. Restart the board afterwards for it to take effect. Jog and cut stay locked until then, then we'll test each axis. Any homed position is cleared."
    : "This changes the motor direction invert mask ($3) on the controller. Restart the board afterwards. Jog and cut stay locked until then, then we'll test each axis. Any homed position is cleared.";
  if (!(await askConfirm({ title, body, ok: "Save", cancel: "Cancel" }))) return;
  try {
    if (fluid) await writeFluid(axis);
    else await writeGrbl(axis);
    clearHomedState();
    setPendingRestart(true);
    const msg = "Saved. Restart the board to apply. Jog and cut are locked until then.";
    setNote(msg, true);
    toast(msg);
  } catch (e) {
    toast(e.message || "The board returned an error.", true);
    setNote(e.message || "The board returned an error.", true);
  }
  paint();
}

export function bindMotorDir() {
  for (const a of AXES) {
    const el = $("rev" + a.toUpperCase());
    if (!el) continue;
    el.addEventListener("change", () => onToggle(a, !!el.checked));
  }
  const jog = $("btnDirTestJog"), yes = $("btnDirTestYes"), no = $("btnDirTestNo");
  if (jog) jog.addEventListener("click", () => runGuidedJog());
  if (yes) yes.addEventListener("click", () => answerTest(true));
  if (no) no.addEventListener("click", () => answerTest(false));
}

export function motorDirState() {
  return {
    ready: state.ready, fluidnc: isFluid(), mask: state.mask,
    pins: JSON.parse(JSON.stringify(state.pins)),
    enabled: motorDirEnabled(), why: motorDirWhy(),
    reversed: { x: reversed("x"), y: reversed("y"), z: reversed("z") },
    pendingRestart: !!state.pendingRestart,
    testStep: state.testStep,
    lockWhy: motorDirLockWhy(),
    pairAxes: pairAxes(),
  };
}

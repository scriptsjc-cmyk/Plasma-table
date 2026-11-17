// Machine setup: Reverse X / Y / Z. Changes the board's motor direction
// (FluidNC direction_pin :low, or GRBL $3) so probing and on-board jobs follow it too.
import { isLaptopUi } from "../ui/laptop.js";
import { estopOn } from "../ui/flow.js";
import { M, S } from "../core/state.js";
import { $, toast } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";

const AXES = ["x", "y", "z"];
const PIN_PATH = (a, n) => `$/axes/${a}/motor${n}/standard_stepper/direction_pin`;

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
  return [base, ...rest].join(":");
}

function gLink() { return M && M.grbl; }
function isFluid() { return !!(S.fluidnc || (gLink() && gLink().fluidnc)); }
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

function parsePinReply(lines, path) {
  const key = String(path || "").replace(/^\$\//, "").trim();
  for (const raw of lines || []) {
    const t = String(raw).trim();
    const br = t.match(/^\[(?:MSG:INFO:\s*)?(?:\$\/)?([^=\]]+?)\s*=\s*([^\]]+)\]$/i);
    if (br && (!key || br[1].replace(/^\$\//, "").trim().toLowerCase() === key.toLowerCase())) return br[2].trim();
    if (/^gpio\./i.test(t) || /^NO_PIN$/i.test(t) || /^i2so\./i.test(t)) return t;
  }
  return "";
}
function parseDumpPins(text) {
  const out = { x: {}, y: {}, z: {} };
  let axis = "", motor = "";
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = raw.match(/^(\s*)([^:#\n]+):\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[2].trim(), val = m[3].trim();
    if (key === "x" || key === "y" || key === "z") { axis = key; motor = ""; }
    else if (/^motor[01]$/i.test(key) && axis) motor = key.slice(-1);
    else if (key === "direction_pin" && axis && motor !== "") out[axis][motor] = val.replace(/^['"]|['"]$/g, "");
  }
  return out;
}

async function ask(line, timeout = 6000) {
  const g = gLink();
  if (!g || !g.ask) return { ok: false, lines: [], error: "Not connected." };
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
      if (r.ok) { pins[a][n] = r.pin; any = true; }
      else if (n === 0) lastErr = r.error || lastErr;
    }
  }
  if (any) return { ok: true, pins };
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

const state = { pins: { x: {}, y: {}, z: {} }, mask: 0, ready: false, loading: false, painting: false };

function reversed(axis) {
  if (isFluid()) {
    const pin = state.pins[axis] && state.pins[axis][0];
    return !!(pin && pinHasLow(pin));
  }
  const bit = { x: 1, y: 2, z: 4 }[axis];
  return !!(state.mask & bit);
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
  if (note && !note.dataset.hold) {
    note.classList.toggle("hidden", !(!S.connected || (S.connected && !state.ready && !state.loading && why === "")));
    if (!S.connected) { note.textContent = ""; note.classList.add("hidden"); }
    else if (!state.ready && !state.loading && !why) { note.textContent = "Couldn't read the motor direction from the board."; note.classList.remove("hidden"); }
  }
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
    if (isFluid()) {
      const r = await readFluidAll();
      if (r.ok) { state.pins = r.pins; state.ready = true; setNote(""); }
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
    const val = n === 0 ? next : flipPinLow(from);
    const r = await ask(PIN_PATH(axis, n) + "=" + val);
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
  const title = (want ? "Reverse " : "Turn off Reverse ") + axis.toUpperCase() + "?";
  const body = fluid
    ? "This changes the motor direction on the controller and saves it to config.yaml. Restart the board afterwards for it to take effect."
    : "This changes the motor direction invert mask ($3) on the controller.";
  if (!(await askConfirm({ title, body, ok: "Save", cancel: "Cancel" }))) return;
  try {
    if (fluid) await writeFluid(axis);
    else await writeGrbl(axis);
    const msg = fluid ? "Saved. Restart the board to apply." : "Saved. Try the + arrow again.";
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
}

export function motorDirState() {
  return { ready: state.ready, fluidnc: isFluid(), mask: state.mask, pins: JSON.parse(JSON.stringify(state.pins)), enabled: motorDirEnabled(), why: motorDirWhy(), reversed: { x: reversed("x"), y: reversed("y"), z: reversed("z") } };
}

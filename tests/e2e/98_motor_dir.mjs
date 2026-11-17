// Machine setup Motor direction (Reverse X/Y/Z) and hold-to-fire Test torch
// on the practice table (GRBL $3) and a simulated FluidNC board.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("98_motor_dir");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openSetup(page) {
  await ev(page, () => {
    const T = window.plasmaTest;
    T.showScreen("cut");
    const b = document.getElementById("menuSetup");
    if (b) b.click();
  });
  await page.waitForFunction(() => {
    const T = window.plasmaTest;
    const card = document.getElementById("motorDirCard");
    return T.S.tab === "setup" && card && !card.classList.contains("hidden") && getComputedStyle(card).display !== "none";
  }, null, { timeout: 10000 });
  await sleep(150);
}

const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });

// ------------------------------------------------------------------ not connected
await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); T.setAppMode("advanced", { autoFs: false, persist: false }); });
await openSetup(page);
const off = await ev(page, () => {
  const card = document.getElementById("motorDirCard");
  const x = document.getElementById("revX");
  const lab = x && x.closest("label");
  const cs = card && getComputedStyle(card);
  const torch = document.getElementById("btnTorchTest");
  return {
    shown: !!(card && cs && cs.display !== "none" && !card.classList.contains("hidden")),
    disabled: !!(x && x.disabled),
    why: (lab && lab.getAttribute("data-why")) || "",
    connected: window.plasmaTest.S.connected,
    laptop: matchMedia("(min-width: 900px) and (pointer: fine)").matches,
    torchLabel: (torch && torch.textContent || "").trim(),
    torchOff: !!(torch && torch.disabled),
    torchWhy: (torch && torch.getAttribute("data-why")) || "",
  };
});
t.check("Machine setup shows Motor direction on a laptop", off.shown && off.laptop, JSON.stringify(off));
t.check("toggles are disabled when not connected, with a why-off hint", off.disabled && /connect/i.test(off.why) && !off.connected, JSON.stringify(off));
t.check("Test torch is on the page, disabled when not connected", off.torchLabel === "Test torch" && off.torchOff && /connect/i.test(off.torchWhy), JSON.stringify(off));

// ------------------------------------------------------------------ GRBL / practice table ($3)
await ev(page, () => document.getElementById("btnDemo").click());
await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
await ev(page, () => window.plasmaTest.loadMotorDir());
await page.waitForFunction(() => {
  const st = window.plasmaTest.motorDirState && window.plasmaTest.motorDirState();
  return st && st.ready && st.enabled;
}, null, { timeout: 8000 });

const grbl0 = await ev(page, () => {
  const st = window.plasmaTest.motorDirState();
  return {
    fluidnc: st.fluidnc, mask: st.mask, enabled: st.enabled,
    x: document.getElementById("revX").checked,
    y: document.getElementById("revY").checked,
    z: document.getElementById("revZ").checked,
    xOff: document.getElementById("revX").disabled,
  };
});
t.check("practice table (GRBL) enables the toggles, all off at $3=0", !grbl0.fluidnc && grbl0.enabled && !grbl0.xOff && grbl0.mask === 0 && !grbl0.x && !grbl0.y && !grbl0.z, JSON.stringify(grbl0));

page.dialogs.length = 0;
page._safeConfirmAuto = "accept";
const logAfter = async (start) => ev(page, (n) => window.plasmaTest.S.demo.log.slice(n), start);
let n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revX"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(700);
let log = await logAfter(n);
t.check("Reverse X sends $3=1 and asks to confirm", log.some((l) => l === "$3=1") && page.dialogs.some((d) => /Reverse X/i.test(d)), JSON.stringify({ log, dialogs: page.dialogs }));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revY"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(700);
log = await logAfter(n);
t.check("Reverse Y sends $3=3", log.some((l) => l === "$3=3"), JSON.stringify(log));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revZ"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(700);
log = await logAfter(n);
t.check("Reverse Z sends $3=7", log.some((l) => l === "$3=7"), JSON.stringify(log));

const allOn = await ev(page, () => window.plasmaTest.motorDirState());
t.check("all three Reverse switches stay on after $3=7", allOn.mask === 7 && allOn.reversed.x && allOn.reversed.y && allOn.reversed.z, JSON.stringify(allOn));

// cancel leaves the mask alone
page._safeConfirmAuto = "dismiss";
n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revX"); el.checked = false; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(400);
log = await logAfter(n);
const afterCancel = await ev(page, () => ({ mask: window.plasmaTest.motorDirState().mask, x: document.getElementById("revX").checked }));
t.check("cancelling the confirm does not send $3", !log.some((l) => /^\$3=/.test(l)) && afterCancel.mask === 7 && afterCancel.x, JSON.stringify({ log, afterCancel }));
page._safeConfirmAuto = "accept";

// ------------------------------------------------------------------ parsers against real FluidNC 4.1.1 shapes
const parsed = await ev(page, () => {
  const T = window.plasmaTest;
  const path = "$/axes/z/motor0/standard_stepper/direction_pin";
  const plain = T.parsePinReply(["$/axes/z/motor0/standard_stepper/direction_pin=gpio.26:low", "ok"], path);
  const bracket = T.parsePinReply(["[axes/z/motor0/standard_stepper/direction_pin=gpio.26:low]"], path);
  const msg = T.parsePinReply(["[MSG:INFO: $/axes/z/motor0/standard_stepper/direction_pin=gpio.26:low]"], path);
  const dump = T.parseDumpPins(`name: Plasma Table
board: ESP32
axes:
  x:
    steps_per_mm: 80
    motor0:
      standard_stepper:
        direction_pin: 'gpio.19:low'
  y:
    motor0:
      standard_stepper:
        direction_pin: 'gpio.23:low'
    motor1:
      standard_stepper:
        direction_pin: gpio.17
  z:
    motor0:
      standard_stepper:
        direction_pin: 'gpio.26:low'
Relay:
  output_pin: gpio.27
  direction_pin: NO_PIN
  speed_map: 0=0% 1=100%
`);
  return { plain, bracket, msg, dump, flip: T.flipPinLow("gpio.26"), hasLow: T.pinHasLow("gpio.26:low") };
});
t.check("parsePinReply accepts plain, bracketed and [MSG:INFO:] FluidNC replies",
  parsed.plain === "gpio.26:low" && parsed.bracket === "gpio.26:low" && parsed.msg === "gpio.26:low",
  JSON.stringify(parsed));
t.check("parseDumpPins reads quoted axis pins and ignores Relay.direction_pin",
  parsed.dump.x[0] === "gpio.19:low" && parsed.dump.y[0] === "gpio.23:low" && parsed.dump.y[1] === "gpio.17" && parsed.dump.z[0] === "gpio.26:low" && parsed.flip === "gpio.26:low" && parsed.hasLow,
  JSON.stringify(parsed.dump));

// ------------------------------------------------------------------ FluidNC path
await ev(page, async () => {
  const T = window.plasmaTest;
  T.S.demo.useFluidNC({ y: { 0: "gpio.23", 1: "gpio.17" } });
  // Banner missed: isFluid() is false until a $/axes answer arrives.
  T.S.fluidnc = false;
  if (T.getM().grbl) T.getM().grbl.fluidnc = false;
  await T.loadMotorDir();
});
await page.waitForFunction(() => {
  const st = window.plasmaTest.motorDirState();
  return st && st.ready && st.fluidnc && st.pins.x && st.pins.x[0];
}, null, { timeout: 8000 });

const fl0 = await ev(page, () => window.plasmaTest.motorDirState());
t.check("FluidNC is detected from a $/axes reply and reads the stock pins, Reverse off", fl0.fluidnc && fl0.pins.x[0] === "gpio.19" && !fl0.reversed.x && !fl0.reversed.y && !fl0.reversed.z, JSON.stringify(fl0));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revX"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(900);
log = await logAfter(n);
t.check("FluidNC Reverse X writes the direction pin with :low, then saves config.yaml",
  log.some((l) => l === "$/axes/x/motor0/standard_stepper/direction_pin=gpio.19:low") && log.some((l) => l.startsWith("$CD=")),
  JSON.stringify(log));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revY"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(900);
log = await logAfter(n);
t.check("FluidNC Reverse Y also flips motor1 when it is present",
  log.some((l) => l === "$/axes/y/motor0/standard_stepper/direction_pin=gpio.23:low") &&
  log.some((l) => l === "$/axes/y/motor1/standard_stepper/direction_pin=gpio.17:low") &&
  log.some((l) => l.startsWith("$CD=")),
  JSON.stringify(log));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revZ"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(900);
log = await logAfter(n);
t.check("FluidNC Reverse Z writes gpio.26:low and saves",
  log.some((l) => l === "$/axes/z/motor0/standard_stepper/direction_pin=gpio.26:low") && log.some((l) => l.startsWith("$CD=")),
  JSON.stringify(log));

const note = await ev(page, () => (document.getElementById("motorDirNote") || {}).textContent || "");
t.check("FluidNC save tells the user to restart the board", /restart the board/i.test(note), note);

// ------------------------------------------------------------------ Test torch (hold-to-fire)
async function pressTorch() {
  await ev(page, () => {
    const b = document.getElementById("btnTorchTest");
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1, pointerType: "mouse" }));
  });
}
async function releaseTorch() {
  await ev(page, () => {
    const b = document.getElementById("btnTorchTest");
    b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 0, pointerType: "mouse" }));
  });
}

const torchReady = await ev(page, () => {
  const T = window.plasmaTest.torchTestState();
  const b = document.getElementById("btnTorchTest");
  return { enabled: T.enabled, why: T.why, dis: b.disabled, label: (b.textContent || "").trim() };
});
t.check("Test torch is enabled while connected and idle", torchReady.enabled && !torchReady.dis && torchReady.label === "Test torch", JSON.stringify(torchReady));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
page.dialogs.length = 0;
await pressTorch();
await sleep(250);
const first = await ev(page, () => {
  const T = window.plasmaTest;
  return { lit: T.torchTestState().lit, armed: T.torchTestState().armed, log: T.S.demo.log.slice(0) };
});
t.check("first hold shows the fire-the-torch confirm and does not send M3",
  first.armed && !first.lit && !first.log.slice(n).some((l) => /^M3\b/i.test(l)) && page.dialogs.some((d) => /Fire the torch/i.test(d)),
  JSON.stringify({ first, dialogs: page.dialogs.slice(-2) }));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await pressTorch();
await sleep(200);
const held = await ev(page, (start) => {
  const T = window.plasmaTest;
  const b = document.getElementById("btnTorchTest");
  return {
    lit: T.torchTestState().lit,
    label: (b.textContent || "").trim(),
    live: b.classList.contains("torch-live"),
    log: T.S.demo.log.slice(start),
    torch: !!(T.S.demo.torch),
  };
}, n);
t.check("holding Test torch sends M3 and shows TORCH ON",
  held.lit && held.label === "TORCH ON" && held.live && held.torch && held.log.some((l) => l === "M3 S1"),
  JSON.stringify(held));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await releaseTorch();
await sleep(200);
const released = await ev(page, (start) => {
  const T = window.plasmaTest;
  const b = document.getElementById("btnTorchTest");
  return {
    lit: T.torchTestState().lit,
    label: (b.textContent || "").trim(),
    live: b.classList.contains("torch-live"),
    log: T.S.demo.log.slice(start),
    torch: !!(T.S.demo.torch),
  };
}, n);
t.check("releasing Test torch sends M5 and clears TORCH ON",
  !released.lit && released.label === "Test torch" && !released.live && !released.torch && released.log.some((l) => /M5/.test(l)),
  JSON.stringify(released));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await pressTorch();
await sleep(2200);
const auto = await ev(page, (start) => {
  const T = window.plasmaTest;
  const b = document.getElementById("btnTorchTest");
  const log = T.S.demo.log.slice(start);
  return {
    lit: T.torchTestState().lit,
    label: (b.textContent || "").trim(),
    log,
    hadM3: log.some((l) => l === "M3 S1"),
    hadM5: log.some((l) => /M5/.test(l)),
    torch: !!(T.S.demo.torch),
  };
}, n);
await releaseTorch();
t.check("Test torch auto-off sends M5 after 2 seconds",
  !auto.lit && auto.label === "Test torch" && auto.hadM3 && auto.hadM5 && !auto.torch,
  JSON.stringify(auto));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => {
  const b = document.getElementById("btnTorchTest");
  b.focus();
  b.click();
  b.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
  b.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }));
});
await sleep(200);
const keyed = await ev(page, (start) => {
  const T = window.plasmaTest;
  return { lit: T.torchTestState().lit, log: T.S.demo.log.slice(start) };
}, n);
t.check("click and Space do not fire the torch",
  !keyed.lit && !keyed.log.some((l) => /^M3\b/i.test(l)),
  JSON.stringify(keyed));

await ev(page, () => { window.plasmaTest.S.demo.setEstop(true); window.plasmaTest.refresh(); });
await sleep(200);
const estop = await ev(page, () => {
  const st = window.plasmaTest.motorDirState();
  return { why: st.why, enabled: st.enabled, dis: document.getElementById("revX").disabled };
});
t.check("toggles disable under E-STOP", !estop.enabled && /E-STOP/i.test(estop.why) && estop.dis, JSON.stringify(estop));
const torchEstop = await ev(page, () => {
  const st = window.plasmaTest.torchTestState();
  const b = document.getElementById("btnTorchTest");
  return { why: st.why, enabled: st.enabled, dis: b.disabled };
});
t.check("Test torch disables under E-STOP", !torchEstop.enabled && /E-STOP/i.test(torchEstop.why) && torchEstop.dis, JSON.stringify(torchEstop));

await ev(page, () => { window.plasmaTest.S.demo.setEstop(false); window.plasmaTest.getM().command({ cmd: "unlock" }); });
await sleep(400);
await ev(page, () => document.getElementById("btnDisconnect").click());
await page.waitForFunction(() => !window.plasmaTest.S.connected, null, { timeout: 8000 });
const gone = await ev(page, () => ({ connected: window.plasmaTest.S.connected, dis: document.getElementById("revX").disabled, why: (document.getElementById("revX").closest("label") || {}).dataset.why || "" }));
t.check("toggles disable again after disconnect", !gone.connected && gone.dis && /connect/i.test(gone.why), JSON.stringify(gone));
const torchGone = await ev(page, () => {
  const st = window.plasmaTest.torchTestState();
  const b = document.getElementById("btnTorchTest");
  return { enabled: st.enabled, why: st.why, dis: b.disabled };
});
t.check("Test torch disables again after disconnect", !torchGone.enabled && torchGone.dis && /connect/i.test(torchGone.why), JSON.stringify(torchGone));

await page.ctx.close();
await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

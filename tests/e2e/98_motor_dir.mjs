// Machine setup Motor direction: Reverse X/Y/Z on the practice table (GRBL $3)
// and on a simulated FluidNC board (direction_pin + $CD=config.yaml).
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
  return {
    shown: !!(card && cs && cs.display !== "none" && !card.classList.contains("hidden")),
    disabled: !!(x && x.disabled),
    why: (lab && lab.getAttribute("data-why")) || "",
    connected: window.plasmaTest.S.connected,
    laptop: matchMedia("(min-width: 900px) and (pointer: fine)").matches,
  };
});
t.check("Machine setup shows Motor direction on a laptop", off.shown && off.laptop, JSON.stringify(off));
t.check("toggles are disabled when not connected, with a why-off hint", off.disabled && /connect/i.test(off.why) && !off.connected, JSON.stringify(off));

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

// ------------------------------------------------------------------ FluidNC path
await ev(page, async () => {
  const T = window.plasmaTest;
  T.S.demo.useFluidNC({ y: { 0: "gpio.23", 1: "gpio.17" } });
  T.S.fluidnc = true;
  if (T.getM().grbl) T.getM().grbl.fluidnc = true;
  await T.loadMotorDir();
});
await page.waitForFunction(() => {
  const st = window.plasmaTest.motorDirState();
  return st && st.ready && st.fluidnc && st.pins.x && st.pins.x[0];
}, null, { timeout: 8000 });

const fl0 = await ev(page, () => window.plasmaTest.motorDirState());
t.check("FluidNC demo reads the stock pins with Reverse off", fl0.fluidnc && fl0.pins.x[0] === "gpio.19" && !fl0.reversed.x && !fl0.reversed.y && !fl0.reversed.z, JSON.stringify(fl0));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revX"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(900);
log = await logAfter(n);
t.check("FluidNC Reverse X writes the direction pin with :low, then saves config.yaml",
  log.some((l) => /\$\/AXES\/X\/MOTOR0\/STANDARD_STEPPER\/DIRECTION_PIN=GPIO\.19:LOW/.test(l)) && log.some((l) => l.startsWith("$CD=")),
  JSON.stringify(log));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revY"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(900);
log = await logAfter(n);
t.check("FluidNC Reverse Y also flips motor1 when it is present",
  log.some((l) => /\$\/AXES\/Y\/MOTOR0\/STANDARD_STEPPER\/DIRECTION_PIN=GPIO\.23:LOW/.test(l)) &&
  log.some((l) => /\$\/AXES\/Y\/MOTOR1\/STANDARD_STEPPER\/DIRECTION_PIN=GPIO\.17:LOW/.test(l)) &&
  log.some((l) => l.startsWith("$CD=")),
  JSON.stringify(log));

n = await ev(page, () => window.plasmaTest.S.demo.log.length);
await ev(page, () => { const el = document.getElementById("revZ"); el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(900);
log = await logAfter(n);
t.check("FluidNC Reverse Z writes gpio.26:low and saves",
  log.some((l) => /\$\/AXES\/Z\/MOTOR0\/STANDARD_STEPPER\/DIRECTION_PIN=GPIO\.26:LOW/.test(l)) && log.some((l) => l.startsWith("$CD=")),
  JSON.stringify(log));

const note = await ev(page, () => (document.getElementById("motorDirNote") || {}).textContent || "");
t.check("FluidNC save tells the user to restart the board", /restart the board/i.test(note), note);

await ev(page, () => { window.plasmaTest.S.demo.setEstop(true); window.plasmaTest.refresh(); });
await sleep(200);
const estop = await ev(page, () => {
  const st = window.plasmaTest.motorDirState();
  return { why: st.why, enabled: st.enabled, dis: document.getElementById("revX").disabled };
});
t.check("toggles disable under E-STOP", !estop.enabled && /E-STOP/i.test(estop.why) && estop.dis, JSON.stringify(estop));

await ev(page, () => { window.plasmaTest.S.demo.setEstop(false); window.plasmaTest.getM().command({ cmd: "unlock" }); });
await sleep(400);
await ev(page, () => document.getElementById("btnDisconnect").click());
await page.waitForFunction(() => !window.plasmaTest.S.connected, null, { timeout: 8000 });
const gone = await ev(page, () => ({ connected: window.plasmaTest.S.connected, dis: document.getElementById("revX").disabled, why: (document.getElementById("revX").closest("label") || {}).dataset.why || "" }));
t.check("toggles disable again after disconnect", !gone.connected && gone.dis && /connect/i.test(gone.why), JSON.stringify(gone));

await page.ctx.close();
await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

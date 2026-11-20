// Test torch hold-to-fire: a steady hold is one M3 S1 and a steady ON, even when
// status reports are late or omit |A:S (as on a jittery Bluetooth link). Practice
// sim only. Never opens a real serial port.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, enterDemo } from "../lib/browser.mjs";

const t = new T("104_torch_hold");
const srv = await startServer(), br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, fn, arg) => page.evaluate(fn, arg);

function m3m5(log) {
  const lines = (log || []).map((l) => String(l).trim());
  return {
    m3: lines.filter((l) => l === "M3 S1").length,
    m5: lines.filter((l) => /^M5\b/i.test(l)).length,
    lines,
  };
}

async function openSetup(page) {
  await ev(page, () => {
    window.plasmaTest.showScreen("cut");
    const b = document.getElementById("menuSetup");
    if (b) b.click();
  });
  await page.waitForFunction(() => {
    const T = window.plasmaTest;
    const cv = document.getElementById("setupView");
    return T.screen() === "cut" && T.S.tab === "setup" && cv && !cv.classList.contains("hidden") && cv.offsetParent;
  }, null, { timeout: 8000 });
}

async function pressTorch(page) {
  await ev(page, () => {
    const b = document.getElementById("btnTorchTest");
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1, pointerType: "mouse" }));
  });
}
async function releaseTorch(page) {
  await ev(page, () => {
    const b = document.getElementById("btnTorchTest");
    b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 0, pointerType: "mouse" }));
  });
}
async function leaveTorch(page) {
  await ev(page, () => {
    const b = document.getElementById("btnTorchTest");
    b.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1, pointerType: "mouse", clientX: 0, clientY: 0 }));
    b.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1, pointerType: "mouse" }));
    b.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1, pointerType: "mouse" }));
  });
}

async function ui(page) {
  return ev(page, () => {
    const T = window.plasmaTest;
    const b = document.getElementById("btnTorchTest");
    const lamp = document.querySelector("#setupView .lamp[data-in=torch]");
    const pill = document.getElementById("torchPill");
    return {
      lit: T.torchTestState().lit,
      label: (b && b.textContent || "").trim(),
      live: !!(b && b.classList.contains("torch-live")),
      lampOn: !!(lamp && lamp.classList.contains("on")),
      pill: pill ? { text: (pill.textContent || "").trim(), on: pill.classList.contains("on") } : null,
      torch: !!(T.S.demo && T.S.demo.torch),
      statusTorch: !!(T.S.status && T.S.status.torch),
    };
  });
}

const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });
await enterDemo(page, { plate: true });
await openSetup(page);
await page.waitForFunction(() => {
  const T = window.plasmaTest;
  const b = document.getElementById("btnTorchTest");
  const st = (T.S.status && T.S.status.state) || "";
  return T.S.connected && /^(Idle|Check)$/i.test(st) && b && !b.disabled && T.torchTestState().enabled;
}, null, { timeout: 10000 });

// First press only confirms.
page.dialogs.length = 0;
await pressTorch(page);
await page.waitForFunction(() => window.plasmaTest.torchTestState().armed, null, { timeout: 8000 });
await releaseTorch(page);
const armed = await ev(page, () => window.plasmaTest.torchTestState());
t.check("first hold arms Test torch and does not fire", armed.armed && !armed.lit, JSON.stringify(armed));

// A laggy Bluetooth-like status stream: delayed reports, many of them without |A:S.
await ev(page, () => {
  const d = window.plasmaTest.S.demo;
  if (!d || d._jittered) return;
  d._jittered = true;
  const origStatus = d._status.bind(d);
  let n = 0;
  d._status = () => {
    n += 1;
    let s = origStatus();
    if (n % 2 === 0) s = s.replace(/\|A:S/g, "").replace(/\|THC:[^>|]*/g, "");
    return s;
  };
  const origSend = d._send.bind(d);
  d._send = (s) => { setTimeout(() => origSend(s), 60 + (n % 4) * 80); };
});

let start = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
await pressTorch(page);
await sleep(250);

const samples = [];
for (let i = 0; i < 4; i++) {
  if (i === 1 || i === 3) await leaveTorch(page);
  samples.push(await ui(page));
  await sleep(300);
}
const during = await ev(page, (from) => (window.plasmaTest.S.demo.log || []).slice(from), start);
const held = m3m5(during);
const allOn = samples.every((s) => s.lit && s.label === "TORCH ON" && s.live && s.lampOn && s.pill && /TORCH ON/.test(s.pill.text) && s.pill.on && s.torch);
t.check("a steady hold sends M3 S1 once and no M5", held.m3 === 1 && held.m5 === 0, JSON.stringify(held));
t.check("the button, relay lamp and pill stay ON through laggy status and pointerleave",
  allOn && samples.length === 4, JSON.stringify(samples));

start = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
await releaseTorch(page);
await sleep(400);
const after = m3m5(await ev(page, (from) => (window.plasmaTest.S.demo.log || []).slice(from), start));
const off = await ui(page);
t.check("release sends M5 once and the relay goes off",
  after.m3 === 0 && after.m5 === 1 && !off.lit && off.label === "Test torch" && !off.live && !off.torch && !off.lampOn,
  JSON.stringify({ after, off }));

// Hard max hold: even a steady finger-down turns off at 2 s.
start = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
await pressTorch(page);
await sleep(2300);
const capped = await ev(page, (from) => {
  const T = window.plasmaTest;
  const st = T.torchTestState();
  const log = (T.S.demo.log || []).slice(from);
  return { lit: st.lit, cooling: st.cooling, cutoff: st.cutoff, ...(() => {
    const lines = log.map((l) => String(l).trim());
    return { m3: lines.filter((l) => l === "M3 S1").length, m5: lines.filter((l) => /^M5\b/i.test(l)).length };
  })() };
}, start);
t.check("a hold longer than 2 s sends M5 and starts the cooldown",
  !capped.lit && capped.m3 === 1 && capped.m5 === 1 && capped.cooling && capped.cutoff, JSON.stringify(capped));
await releaseTorch(page);
await sleep(3100);

// Safety: a long gap in status reports still turns the torch off.
start = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
await pressTorch(page);
await sleep(200);
t.check("held again before the status-timeout check", (await ui(page)).lit);
await ev(page, () => {
  const d = window.plasmaTest.S.demo;
  // Drop further reports. Pending laggy _send timers may still arrive once.
  if (d) d._send = () => {};
  const g = window.plasmaTest.getM().grbl;
  if (g && g.pausePoll) g.pausePoll();
});
await sleep(400);
await ev(page, () => {
  const g = window.plasmaTest.getM().grbl;
  if (g) g.lastRx = Date.now() - 5000;
});
await sleep(800);
const timed = await ev(page, (from) => {
  const T = window.plasmaTest;
  const log = (T.S.demo.log || []).slice(from);
  return { lit: T.torchTestState().lit, torch: !!(T.S.demo && T.S.demo.torch), ...(() => {
    const lines = log.map((l) => String(l).trim());
    return { m5: lines.filter((l) => /^M5\b/i.test(l)).length, log: lines };
  })() };
}, start);
t.check("a lost status stream still sends M5 and clears TORCH ON",
  !timed.lit && timed.m5 === 1 && !timed.torch, JSON.stringify(timed));
await ev(page, () => { const g = window.plasmaTest.getM().grbl; if (g && g.resumePoll) g.resumePoll(); });
await releaseTorch(page);
await sleep(200);

// E-STOP during a hold also releases.
start = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
await pressTorch(page);
await sleep(200);
await ev(page, () => { window.plasmaTest.S.demo.setEstop(true); window.plasmaTest.refresh(); });
await sleep(400);
const estop = await ev(page, (from) => {
  const T = window.plasmaTest;
  const log = (T.S.demo.log || []).slice(from);
  const lines = log.map((l) => String(l).trim());
  return { lit: T.torchTestState().lit, m5: lines.filter((l) => /^M5\b/i.test(l)).length, torch: !!(T.S.demo && T.S.demo.torch) };
}, start);
t.check("E-STOP during a hold sends M5", !estop.lit && estop.m5 >= 1 && !estop.torch, JSON.stringify(estop));

await page.context().close();
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

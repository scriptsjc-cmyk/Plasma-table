// Laptop UI: compact torch confirm (one tick), Machine setup in the account bar,
// and the Start safety reminder (Esc/Cancel does not start; confirm still hits the gates).
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape, ensurePracticeHomed } from "../lib/browser.mjs";

const t = new T("107_r10_cut_ui");
const srv = await startServer();
const br = await launch();
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });
page._safeConfirmAuto = "show";

await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make");
  T.setShapeFs(false);
  T.setAppMode("advanced", { persist: false, autoFs: false });
});

// Account bar Setup button is visible on a laptop and opens Machine setup from Make
const bar = await ev(page, () => {
  const b = document.getElementById("btnBarSetup");
  const r = b && b.getBoundingClientRect();
  const cs = b && getComputedStyle(b);
  return {
    shown: !!(b && cs.display !== "none" && r && r.width > 0 && r.height > 0),
    label: (b && (b.getAttribute("aria-label") || b.title || b.textContent) || "").trim(),
    text: (b && b.textContent || "").trim(),
  };
});
t.check("account bar has a small Machine setup button", bar.shown && /Machine setup/i.test(bar.label) && /Setup/i.test(bar.text), JSON.stringify(bar));
await ev(page, () => document.getElementById("btnBarSetup").click());
await sleep(250);
const onSetup = await ev(page, () => {
  const v = document.getElementById("setupView");
  const cs = v && getComputedStyle(v);
  return {
    screen: window.plasmaTest.screen(),
    tab: window.plasmaTest.S.tab,
    setupShown: !!(v && !v.classList.contains("hidden") && cs && cs.display !== "none"),
  };
});
t.check("the bar button opens Machine setup from another screen", onSetup.screen === "cut" && onSetup.tab === "setup" && onSetup.setupShown, JSON.stringify(onSetup));

// Practice table, torch confirm is one compact tick
await ev(page, () => document.getElementById("btnDemo") && document.getElementById("btnDemo").click());
await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
await ev(page, () => { const b = document.getElementById("btnBarSetup"); if (b) b.click(); });
await sleep(200);
await page.waitForFunction(() => {
  const b = document.getElementById("btnTorchTest");
  return b && !b.disabled;
}, null, { timeout: 8000 }).catch(() => {});

await ev(page, () => {
  const b = document.getElementById("btnTorchTest");
  b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1, pointerType: "mouse" }));
});
await sleep(300);
const torchDlg = await ev(page, () => {
  const dlg = document.getElementById("safeDlg");
  const card = dlg && dlg.querySelector(".safedlg-card");
  const ticks = [...document.querySelectorAll("#safeDlgTicks input")];
  const labels = [...document.querySelectorAll("#safeDlgTicks .safedlg-tick")].map((el) => el.textContent.trim());
  const r = card && card.getBoundingClientRect();
  return {
    open: !!(dlg && !dlg.classList.contains("hidden")),
    compact: !!(card && card.classList.contains("is-compact")),
    n: ticks.length,
    labels,
    title: (document.getElementById("safeDlgTitle") || {}).textContent || "",
    w: r && Math.round(r.width),
    h: r && Math.round(r.height),
    okOff: !!(document.getElementById("safeDlgOk") && document.getElementById("safeDlgOk").disabled),
  };
});
t.check("torch confirm is one tick in a compact box, and OK stays off until it is ticked",
  torchDlg.open && torchDlg.compact && torchDlg.n === 1 && torchDlg.okOff && /Fire the torch/i.test(torchDlg.title) && torchDlg.w <= 400,
  JSON.stringify(torchDlg));
await ev(page, () => document.getElementById("safeDlgCancel").click());
await sleep(150);
t.check("cancel leaves the torch unarmed", await ev(page, () => !window.plasmaTest.torchTestState().armed && !window.plasmaTest.torchTestState().lit));

// Cut: start reminder, Esc/Cancel does not start, confirm does
await demoToShape(page, { stay: "cut" });
await ensurePracticeHomed(page);
await ev(page, () => { window.plasmaTest.goStep(3); document.getElementById("btnZero").click(); });
await sleep(300);
await ev(page, () => { const a = document.getElementById("layAuto"); if (a) a.click(); });
await sleep(200);

const ready = await ev(page, () => {
  const b = document.getElementById("btnStart");
  return {
    enabled: !!(b && !b.disabled),
    boxes: document.querySelectorAll("#checkCard input:not([disabled])").length,
    hint: (document.getElementById("checkHint") || {}).textContent || "",
    zero: (document.getElementById("checkZero") || {}).textContent || "",
  };
});
t.check("Start is enabled after home and Start here, with no on-page tick list",
  ready.enabled && ready.boxes === 0 && /touch off/i.test(ready.hint) && /Sheet corner set/i.test(ready.zero),
  JSON.stringify(ready));

await ev(page, () => document.getElementById("btnStart").click());
await sleep(250);
const pop = await ev(page, () => {
  const dlg = document.getElementById("safeDlg");
  const lines = [...document.querySelectorAll("#safeDlgLines li")].map((li) => li.textContent.trim());
  return {
    open: !!(dlg && !dlg.classList.contains("hidden")),
    compact: !!document.querySelector(".safedlg-card.is-compact"),
    title: (document.getElementById("safeDlgTitle") || {}).textContent || "",
    ok: (document.getElementById("safeDlgOk") || {}).textContent || "",
    lines,
    long: lines.some((s) => s.length > 80),
  };
});
t.check("Start opens a short safety reminder with one confirm button",
  pop.open && pop.compact && /Before you cut/i.test(pop.title) && /Everything's correct/i.test(pop.ok)
    && pop.lines.length >= 4 && pop.lines.some((s) => /touch off/i.test(s)) && !pop.long,
  JSON.stringify(pop));

await page.keyboard.press("Escape");
await sleep(200);
const afterEsc = await ev(page, () => ({
  open: !document.getElementById("safeDlg").classList.contains("hidden"),
  step: window.plasmaTest.S.cur,
  running: !!(window.plasmaTest.S.job && window.plasmaTest.S.job.running),
}));
t.check("Esc closes the reminder and does not start the cut", !afterEsc.open && afterEsc.step === 3 && !afterEsc.running, JSON.stringify(afterEsc));

await ev(page, () => document.getElementById("btnStart").click());
await sleep(200);
await ev(page, () => document.getElementById("safeDlgCancel").click());
await sleep(200);
const afterCancel = await ev(page, () => ({
  open: !document.getElementById("safeDlg").classList.contains("hidden"),
  step: window.plasmaTest.S.cur,
  running: !!(window.plasmaTest.S.job && window.plasmaTest.S.job.running),
}));
t.check("Cancel closes the reminder and does not start the cut", !afterCancel.open && afterCancel.step === 3 && !afterCancel.running, JSON.stringify(afterCancel));

page._safeConfirmAuto = "accept";
await ev(page, () => document.getElementById("btnStart").click());
await sleep(500);
const started = await ev(page, () => ({
  step: window.plasmaTest.S.cur,
  running: !!(window.plasmaTest.S.job && window.plasmaTest.S.job.running),
}));
t.check("confirming the reminder starts the practice cut", started.step === 4 && started.running, JSON.stringify(started));

await page.ctx.close();
await br.close();
await srv.close();
t.done();

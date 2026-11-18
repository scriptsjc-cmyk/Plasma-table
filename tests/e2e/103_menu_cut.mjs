// Menu > Cut must open the Cut tab (Get to cutting), not a leftover Machine setup tab.
// Practice / sim table only. Never opens a real serial port.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, enterDemo } from "../lib/browser.mjs";

const t = new T("103_menu_cut");
const srv = await startServer(), br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, fn, arg) => page.evaluate(fn, arg);

function actionLog(log) {
  return (log || []).filter((l) => /^(?:\$H\b|\$X\b|\$13|\$20=|\$J=|G0|G1|G10|G53|G90|G91|M3|M5|G38)/i.test(String(l).trim()));
}

async function view(page) {
  return ev(page, () => {
    const T = window.plasmaTest;
    const cut = document.getElementById("cutView");
    const setup = document.getElementById("setupView");
    const bar = document.getElementById("homeBar");
    const barBtn = document.getElementById("btnHomeBarSetup");
    const vis = (el) => !!(el && !el.classList.contains("hidden") && el.offsetParent && getComputedStyle(el).display !== "none");
    return {
      screen: T.screen(),
      tab: T.S.tab,
      bodyTab: document.body.dataset.tab || "",
      cutOn: vis(cut),
      setupOn: vis(setup),
      homeBar: vis(bar),
      homeBarText: (document.getElementById("homeBarText") || {}).textContent || "",
      homeBarBtn: barBtn && (barBtn.textContent || "").trim(),
      referenced: !!(T.S.safety && T.S.safety.referenced),
      hasLimits: !!(T.S.safety && T.S.safety.limits),
      connected: !!T.S.connected,
      log: (T.S.demo && T.S.demo.log) || [],
    };
  }).then((v) => ({ ...v, log: actionLog(v.log) }));
}

async function openMenu(page) {
  await ev(page, () => document.getElementById("btnHome").click());
  await page.waitForFunction(() => window.plasmaTest.screen() === "menu", null, { timeout: 8000 });
}

async function clickMenuCut(page) {
  await ev(page, () => document.getElementById("menuCut").click());
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut", null, { timeout: 8000 });
  // showTab("cut") is applied after a cached import(); wait until the tab has settled
  await page.waitForFunction(() => window.plasmaTest.S.tab === "cut", null, { timeout: 8000 });
}

async function openMachineSetup(page) {
  await ev(page, () => document.getElementById("menuSetup").click());
  await page.waitForFunction(() => {
    const T = window.plasmaTest;
    const cv = document.getElementById("setupView");
    return T.screen() === "cut" && T.S.tab === "setup" && cv && !cv.classList.contains("hidden") && cv.offsetParent;
  }, null, { timeout: 8000 });
}

const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });
await enterDemo(page, { plate: true });
await page.waitForFunction(() => window.plasmaTest.S.connected && window.plasmaTest.screen() === "cut", null, { timeout: 10000 });

// Save edges in the app (same 492 × 586 mm size as a real table) and set home on the practice machine.
await ev(page, () => {
  const T = window.plasmaTest, M = T.getM();
  const mp = (T.S.status && T.S.status.MPos) || [0, 0, 0];
  M.safety.limits = { x: [0, 492], y: [0, 586], z: [-15, 0] };
  M.safety.save();
  M.safety.setReference(mp, "manual");
  M.emit("safety", M.safety.state());
  T.S.zeroSet = true;
  M.zeroConfirmed = true;
  T.refresh();
});
await page.waitForFunction(() => !!(window.plasmaTest.S.safety && window.plasmaTest.S.safety.referenced && window.plasmaTest.S.safety.limits), null, { timeout: 8000 });

await openMenu(page);
await openMachineSetup(page);
t.check("Menu > Machine setup still opens Machine setup", (await view(page)).setupOn && (await view(page)).tab === "setup");

await openMenu(page);
const beforeHome = await view(page);
await clickMenuCut(page);
const withHome = await view(page);
t.check("with home set: Menu > Cut opens the Cut tab, not Machine setup",
  withHome.screen === "cut" && withHome.tab === "cut" && withHome.bodyTab === "cut" && withHome.cutOn && !withHome.setupOn,
  JSON.stringify(withHome));
t.check("with home set: no home-again banner (home is already set)", !withHome.homeBar, JSON.stringify(withHome));
t.check("with home set: opening Cut sent nothing to the table",
  JSON.stringify(withHome.log) === JSON.stringify(beforeHome.log),
  JSON.stringify({ before: beforeHome.log, after: withHome.log }));

// Reconnect the practice table: edges stay, home and work zero are cleared.
await ev(page, () => document.getElementById("btnDisconnect").click());
await page.waitForFunction(() => !window.plasmaTest.S.connected, null, { timeout: 8000 });
await ev(page, () => document.getElementById("btnDemo").click());
await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 8000 });
await sleep(200);
const afterReconnect = await ev(page, () => {
  const S = window.plasmaTest.S;
  return { connected: !!S.connected, referenced: !!(S.safety && S.safety.referenced), hasLimits: !!(S.safety && S.safety.limits), zeroSet: !!S.zeroSet };
});
t.check("reconnect on the practice table keeps edges and clears home",
  afterReconnect.connected && afterReconnect.hasLimits && !afterReconnect.referenced,
  JSON.stringify(afterReconnect));

// Visit Machine setup after reconnect (the reported path), then Menu > Cut.
await openMenu(page);
await openMachineSetup(page);
t.check("after reconnect, Machine setup still opens", (await view(page)).tab === "setup");
await openMenu(page);
const beforeAgain = await view(page);
await clickMenuCut(page);
const noHome = await view(page);
t.check("without home: Menu > Cut still opens the Cut tab, not Machine setup",
  noHome.screen === "cut" && noHome.tab === "cut" && noHome.bodyTab === "cut" && noHome.cutOn && !noHome.setupOn,
  JSON.stringify(noHome));
t.check("without home: Cut shows a notice and a button to Machine setup",
  noHome.homeBar && /set home/i.test(noHome.homeBarText) && /Set home/i.test(noHome.homeBarBtn || ""),
  JSON.stringify({ text: noHome.homeBarText, btn: noHome.homeBarBtn }));
t.check("without home: opening Cut sent nothing to the table",
  JSON.stringify(noHome.log) === JSON.stringify(beforeAgain.log),
  JSON.stringify({ before: beforeAgain.log, after: noHome.log }));

await ev(page, () => document.getElementById("btnHomeBarSetup").click());
await page.waitForFunction(() => window.plasmaTest.S.tab === "setup", null, { timeout: 8000 });
const fromBtn = await view(page);
t.check("the notice's button opens Machine setup when asked",
  fromBtn.tab === "setup" && fromBtn.setupOn && !fromBtn.cutOn,
  JSON.stringify(fromBtn));

await page.context().close();
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

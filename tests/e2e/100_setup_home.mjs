// Machine setup bed picture and "Set this as home (0,0)" for a table with no limit switches.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("100_setup_home");
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
    const cv = document.getElementById("setupBed");
    return T.S.tab === "setup" && cv && cv.offsetParent && getComputedStyle(cv).display !== "none";
  }, null, { timeout: 10000 });
  await ev(page, () => { if (window.plasmaTest.drawSetupBed) window.plasmaTest.drawSetupBed(); });
  await sleep(150);
}

const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });
await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make");
  T.setShapeFs(false);
  T.setAppMode("advanced", { autoFs: false, persist: false });
});
await openSetup(page);

const first = await ev(page, () => {
  const cv = document.getElementById("setupBed");
  const note = (document.getElementById("setupHomeNote") || {}).textContent || "";
  const btn = document.getElementById("btnRef");
  const wizard = (document.getElementById("wz1") || {}).textContent || "";
  return {
    laptop: matchMedia("(min-width: 900px) and (pointer: fine)").matches,
    tab: window.plasmaTest.S.tab,
    rot: window.plasmaTest.bedViewRotated(),
    flip: cv && cv.dataset.flip,
    homeSet: cv && cv.dataset.homeSet,
    machine: cv && cv.dataset.machine,
    step: window.plasmaTest.S.cur,
    w: cv && cv.clientWidth,
    h: cv && cv.clientHeight,
    btn: btn && (btn.textContent || "").trim(),
    note,
    wizard,
    hasDollarH: /\$H/.test(note),
  };
});
t.check("laptop Machine setup shows a bed canvas", first.laptop && first.tab === "setup" && first.w > 80 && first.h > 80, JSON.stringify(first));
t.check("the setup bed is Y-flipped on a laptop", first.rot && first.flip === "y", JSON.stringify(first));
t.check("Machine setup draws the table and gantry even when cutting is still on step 1", first.machine === "on", JSON.stringify(first));
t.check("home is not set yet, and the note explains no switches / no $H",
  first.homeSet === "0" && /no limit switches/i.test(first.note) && first.hasDollarH && /Set this as home/i.test(first.btn) && /no limit switches/i.test(first.wizard),
  JSON.stringify({ btn: first.btn, note: first.note.slice(0, 400), wizard: first.wizard.slice(0, 240) }));

const tips = await ev(page, () => {
  const vis = (b) => {
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return cs.display !== "none" && r.width > 8 && r.height > 8;
  };
  const icons = [...document.querySelectorAll("#setupView button.info-i")];
  const usable = icons.find((b) => /usable edges/i.test(b.getAttribute("data-tip") || ""));
  const wz1 = icons.find((b) => /no limit switches/i.test(b.getAttribute("data-tip") || ""));
  const safety = (document.getElementById("safetyHint") || {}).textContent || "";
  const lock = document.getElementById("motorDirNote");
  return {
    n: icons.length,
    vis: icons.filter(vis).length,
    usable: !!(usable && vis(usable)),
    wz1: !!(wz1 && vis(wz1)),
    tip: usable && usable.getAttribute("data-tip"),
    safetyVisible: !/has-info/.test((document.getElementById("safetyHint") || {}).className || ""),
    lockIsStatus: !!(lock && !lock.classList.contains("has-info")),
  };
});
t.check("laptop Machine setup puts long help behind information icons",
  first.laptop && tips.vis >= 5 && tips.usable && tips.wz1 && /torch can actually reach/i.test(tips.tip || "") && tips.safetyVisible && tips.lockIsStatus,
  JSON.stringify(tips));

await ev(page, () => document.getElementById("btnDemo").click());
await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 8000 });
await sleep(400);
await ev(page, () => { if (window.plasmaTest.drawSetupBed) window.plasmaTest.drawSetupBed(); });

const live = await ev(page, () => {
  const mp = window.plasmaTest.S.status.MPos || [];
  const note = (document.getElementById("setupHomeNote") || {}).textContent || "";
  return { note, mp: mp.slice(0, 3), connected: window.plasmaTest.S.connected };
});
t.check("the note lists the current machine position once connected",
  live.connected && /Current machine position/i.test(live.note) && /X /.test(live.note),
  JSON.stringify(live));

const n = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
page.dialogs.length = 0;
await ev(page, () => document.getElementById("btnRef").click());
await sleep(400);
const set = await ev(page, (start) => {
  const T = window.plasmaTest;
  const log = (T.S.demo.log || []).slice(start);
  const cv = document.getElementById("setupBed");
  const st = document.getElementById("refState");
  const note = (document.getElementById("setupHomeNote") || {}).textContent || "";
  const mp = (T.S.status && T.S.status.MPos) || [0, 0, 0];
  const ref = (T.S.safety && T.S.safety.ref) || null;
  return {
    ref,
    mode: T.S.safety && T.S.safety.ref_mode,
    referenced: !!(T.S.safety && T.S.safety.referenced),
    label: (st && st.textContent) || "",
    homeSet: cv && cv.dataset.homeSet,
    note,
    sentH: log.some((l) => /^\$H\b/.test(String(l))),
    log,
    mp: mp.slice(0, 3),
  };
}, n);
t.check("Set this as home records the current position and does not send $H",
  set.referenced && set.mode === "manual" && set.homeSet === "1" && !set.sentH && /Home corner set/i.test(set.label),
  JSON.stringify(set));
t.check("the note says the picture's Home 0,0 is where the torch was when it was set",
  /where the torch was when you set it/i.test(set.note) && /Home 0,0/i.test(set.note),
  set.note.slice(0, 500));

await ev(page, () => { window.plasmaTest.drawSetupBed(); });
const flipHome = await ev(page, () => {
  const cv = document.getElementById("setupBed");
  return { flip: cv.dataset.flip, rot: window.plasmaTest.bedViewRotated(), homeSet: cv.dataset.homeSet };
});
t.check("after setting home, the laptop bed stays Y-flipped (0,0 at the top-left of the picture)",
  flipHome.rot && flipHome.flip === "y" && flipHome.homeSet === "1", JSON.stringify(flipHome));

await ev(page, () => document.getElementById("btnDisconnect").click());
await page.waitForFunction(() => !window.plasmaTest.S.connected, null, { timeout: 8000 });
await page.ctx.close();
await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

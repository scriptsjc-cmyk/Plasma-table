// Phone cutting screen (844x390 on its side, 390x844 upright): STOP visible and the largest button by area, Pause / progress / X-Y
// in view while cutting, the More sheet (dialog, focus kept inside, Escape, moved controls go back), safety banners never covered,
// no page scroll; and the laptop (1366x768) has none of it.
import { T } from "../lib/t.mjs"; import { startServer, launch, newPage, demoToShape, shot, PROFILES } from "../lib/browser.mjs";
import { devices } from "playwright";

const t = new T("69_phone_cut"); const srv = await startServer(); const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phone = (w, h) => ({ ...devices["iPhone 14"], viewport: { width: w, height: h }, screen: { width: w, height: h } });
PROFILES.phone844x390 ||= phone(844, 390);
PROFILES.phone390x844 ||= phone(390, 844);
const ev = (page, f, a) => page.evaluate(f, a);

// page-side helpers
const inView = (sel) => { const e = document.querySelector(sel); if (!e || !e.getClientRects().length) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; };
const onTop = (sel) => { const e = document.querySelector(sel); if (!e || !e.getClientRects().length) return false; const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)); return !!hit && (hit === e || e.contains(hit)); };
const PAGE = `window.__inView = ${inView}; window.__onTop = ${onTop};
  window.__biggest = () => {   // every rendered button on the cutting screen and its banners, scrolled into view or not
    const s = document.getElementById("btnStop").getBoundingClientRect(), sa = s.width * s.height, out = [];
    for (const b of document.querySelectorAll("#cutView button, .banner button")) {
      if (b.id === "btnStop" || b.classList.contains("blocker-jump") || !b.getClientRects().length || getComputedStyle(b).visibility === "hidden") continue;   // .blocker-jump: a sentence styled as a link
      const r = b.getBoundingClientRect(); if (r.width * r.height >= sa) out.push((b.id || b.className) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
    return { stop: Math.round(s.width) + "x" + Math.round(s.height), area: Math.round(sa), bigger: out };
  };
  window.__noPageScroll = () => { const d = document.scrollingElement; return d.scrollHeight <= innerHeight + 1 && d.scrollWidth <= innerWidth + 1 && scrollY === 0; };`;
const helpers = (page) => page.evaluate(PAGE);

for (const [name, prof] of [["844x390", "phone844x390"], ["390x844", "phone390x844"]]) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false }); await helpers(page);
  await demoToShape(page, { stay: "cut" });
  await page.waitForFunction(() => window.plasmaTest.getM().state() === "Idle", null, { timeout: 10000 }).catch(() => {});
  const n = (s) => `${name}: ${s}`;

  // ---- Part step
  await ev(page, () => window.plasmaTest.goStep(1)); await sleep(300);
  let big = await ev(page, () => window.__biggest());
  t.check(n("Part: STOP is in view and the largest button"), await ev(page, () => window.__inView("#btnStop")) && !big.bigger.length, JSON.stringify(big));
  t.check(n("Part: no More button (nothing is tucked away on this step)"), !(await ev(page, () => window.__inView(".step:not(.hidden) .cutmore-btn"))));

  // ---- Bed & start
  await ev(page, () => window.plasmaTest.goStep(3)); await sleep(300);
  await ev(page, () => { for (const d of document.querySelectorAll('.step[data-step="3"] details')) d.open = true; }); await sleep(200);
  big = await ev(page, () => window.__biggest());
  t.check(n("Bed & start (every card open): STOP is the largest button by area"), !big.bigger.length, JSON.stringify(big));
  t.check(n("Bed & start: no page-level scroll"), await ev(page, () => window.__noPageScroll()));
  t.check(n("Bed & start: Back, Start and More are in view in the bar"), await ev(page, () => ["#btnStart", "#btnMore3", '.step[data-step="3"] .nav .back'].every((s) => window.__inView(s))));
  t.check(n("Bed & start: Download G-code is not on the bar (it is in More)"), await ev(page, () => !document.getElementById("btnExport3").getClientRects().length));
  await page.click("#btnMore3"); await sleep(250);
  const sh = await ev(page, () => {
    const d = document.getElementById("cutSheet"), r = d.getBoundingClientRect(), p = document.querySelector(".previewPane").getBoundingClientRect(), nav = document.querySelector('.step[data-step="3"] > .nav').getBoundingClientRect(), stop = document.getElementById("btnStop").getBoundingClientRect();
    return { open: !d.hidden && d.getClientRects().length > 0, role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"), label: (document.getElementById(d.getAttribute("aria-labelledby")) || {}).textContent,
      expanded: document.getElementById("btnMore3").getAttribute("aria-expanded"), focusIn: d.contains(document.activeElement),
      export: document.getElementById("btnExport3").closest("#cutSheet") === d && window.__inView("#btnExport3"), overPicture: r.top >= p.top - 1 && r.bottom <= p.bottom + 1 && r.left >= p.left - 1 && r.right <= p.right + 1,
      clearOfBar: r.bottom <= nav.top + 1 || r.right <= nav.left + 1, clearOfStop: r.top >= stop.bottom || r.right <= stop.left, close: document.getElementById("cutSheetClose").getBoundingClientRect().height };
  });
  t.check(n("More opens a labelled modal dialog with focus inside"), sh.open && sh.role === "dialog" && sh.modal === "true" && sh.label === "More" && sh.expanded === "true" && sh.focusIn, JSON.stringify(sh));
  t.check(n("More holds Download G-code (the same button, moved)"), sh.export, JSON.stringify(sh));
  t.check(n("the sheet covers only the bed picture: not the Start bar, not STOP"), sh.overPicture && sh.clearOfBar && sh.clearOfStop, JSON.stringify(sh));
  t.check(n("the sheet's close button is a 44px target"), sh.close >= 44, sh.close);
  t.check(n("Start and STOP are still tappable with More open"), await ev(page, () => window.__onTop("#btnStart") && window.__onTop("#btnStop")));
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  t.check(n("Tab stays inside the sheet"), await ev(page, () => document.getElementById("cutSheet").contains(document.activeElement)));
  await page.keyboard.press("Escape"); await sleep(200);
  const back = await ev(page, () => ({ hidden: document.getElementById("cutSheet").hidden, home: !!document.getElementById("btnExport3").closest('.step[data-step="3"] > .nav'), next: document.getElementById("btnExport3").nextElementSibling && document.getElementById("btnExport3").nextElementSibling.id, focus: document.activeElement && document.activeElement.id, expanded: document.getElementById("btnMore3").getAttribute("aria-expanded"), showMach: !!document.getElementById("showMachWrap").closest(".previewPane > .showmach, .previewPane") && !document.getElementById("showMachWrap").closest("#cutSheet") }));
  t.check(n("Escape closes it, puts the controls back where they were and returns focus to More"), back.hidden && back.home && back.next === "btnMore3" && back.focus === "btnMore3" && back.expanded === "false" && back.showMach, JSON.stringify(back));
  await page.click("#btnMore3"); await sleep(150); await page.click("#cutSheetClose"); await sleep(150);
  t.check(n("the close button closes it too"), await ev(page, () => document.getElementById("cutSheet").hidden));
  await shot(page, `69-${name}-bed`);

  // ---- Cut (running)
  await ev(page, () => document.getElementById("btnZero").click()); await sleep(300);
  await ev(page, () => document.querySelectorAll("#checklist input").forEach((c) => { if (!c.checked) c.click(); }));
  await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 }).catch(() => {});
  await page.click("#btnStart");
  const started = await page.waitForFunction(() => window.plasmaTest.S.cur === 4 && window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 10000 }).then(() => true).catch(() => false);
  t.check(n("a practice job starts"), started);
  await sleep(1200);
  const run = await ev(page, () => ({
    stop: window.__inView("#btnStop") && window.__onTop("#btnStop"), pause: window.__inView("#btnPause") && window.__onTop("#btnPause"), more: window.__inView("#btnMore4"),
    pct: window.__inView("#pct") && /%/.test(document.getElementById("pct").textContent), left: window.__inView("#timeLeft"), bar: window.__inView("#running .progress"), torch: window.__inView("#torchBig"),
    pos: window.__inView("#running .runpos") && /X\s*-?\d+\.\d\s*Y\s*-?\d+\.\d/.test(document.querySelector("#running .runpos").textContent), scroll: window.__noPageScroll(), big: window.__biggest(),
  }));
  t.check(n("cutting: STOP in view and not covered"), run.stop, JSON.stringify(run));
  t.check(n("cutting: Pause in view and not covered, More next to it"), run.pause && run.more, JSON.stringify(run));
  t.check(n("cutting: % done, time left, the progress bar and TORCH are in view"), run.pct && run.left && run.bar && run.torch, JSON.stringify(run));
  t.check(n("cutting: the live X / Y position is in view"), run.pos, JSON.stringify(run));
  t.check(n("cutting: STOP is the largest button by area"), !run.big.bigger.length, JSON.stringify(run.big));
  t.check(n("cutting: no page-level scroll"), run.scroll);
  await shot(page, `69-${name}-running`);
  await page.click("#btnMore4"); await sleep(250);
  const rm = await ev(page, () => {
    const d = document.getElementById("cutSheet"); const ins = (id) => !!document.getElementById(id) && document.getElementById(id).closest("#cutSheet") === d;
    return { moved: ["livePanel", "lpNote", "liveSpeedBox", "runHelp", "lsUp", "lsDown", "delUp", "delSave"].every(ins), pause: window.__onTop("#btnPause"), stop: window.__onTop("#btnStop"), torch: window.__onTop("#torchBig"), pct: window.__onTop("#pct"), big: window.__biggest(), scroll: window.__noPageScroll() };
  });
  t.check(n("cutting, More: speed, pierce delay and the arc readings are in the sheet"), rm.moved, JSON.stringify(rm));
  t.check(n("cutting, More open: Pause, STOP, TORCH and % done are not covered"), rm.pause && rm.stop && rm.torch && rm.pct, JSON.stringify(rm));
  t.check(n("cutting, More open: STOP still the largest button, no page scroll"), !rm.big.bigger.length && rm.scroll, JSON.stringify(rm));
  await shot(page, `69-${name}-running-more`);
  // the space bar is STOP, with the sheet open too; the job ends, the sheet closes and everything goes home
  await page.keyboard.press("Space"); await sleep(1200);
  const st = await ev(page, () => ({ estop: window.plasmaTest.estopOn(), running: !!(window.plasmaTest.S.job && window.plasmaTest.S.job.running), sheet: document.getElementById("cutSheet").hidden,
    home: ["livePanel", "liveSpeedBox", "runHelp"].every((id) => document.getElementById(id).parentElement.id === "running"),
    banners: ["estopBar", "alarmBar", "lostBar", "homeBar"].filter((id) => !document.getElementById(id).classList.contains("hidden")).every((id) => window.__inView("#" + id) && window.__onTop("#" + id)), big: window.__biggest(), scroll: window.__noPageScroll() }));
  t.check(n("Space stops the job with More open"), st.estop && !st.running, JSON.stringify(st));
  t.check(n("after STOP the sheet is closed and its controls are back in the run pane"), st.sheet && st.home, JSON.stringify(st));
  t.check(n("after STOP every safety banner showing is in view and not covered"), st.banners, JSON.stringify(st));
  t.check(n("after STOP: STOP still the largest button, no page scroll"), !st.big.bigger.length && st.scroll, JSON.stringify(st));
  // the table's own E-stop switch (practice table): its banner shows in full and nothing covers it
  await ev(page, () => window.plasmaTest.S.demo.setEstop(true)); await sleep(1200);
  const hw = await ev(page, () => ({ shown: !document.getElementById("estopBar").classList.contains("hidden"), top: window.__inView("#estopBar") && window.__onTop("#estopBar") && window.__onTop("#btnUnlock2"), stop: window.__onTop("#btnStop"), scroll: window.__noPageScroll() }));
  t.check(n("E-STOP PRESSED banner and its Unlock in view and not covered, STOP too"), hw.shown && hw.top && hw.stop && hw.scroll, JSON.stringify(hw));
  await shot(page, `69-${name}-estop`);
  await ev(page, () => window.plasmaTest.S.demo.setEstop(false)); await sleep(300);
  t.check(n("no page errors"), page.errors.filter((e) => !/status of 404/.test(e)).length === 0, page.errors.join(" | ").slice(0, 300));
  await page.ctx.close();
}

// ---- upright, before connecting: the optional "turn sideways" cover still works the same
{
  const page = await newPage(br, "phone390x844", { base: srv.base, query: "?test=1&turn=1", consoleErrors: false });
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); });
  await page.waitForFunction(() => window.plasmaTest.S.cur === 3, null, { timeout: 10000 }).catch(() => {}); await sleep(300);
  t.check("390x844: the turn-sideways cover still shows on Bed & start", await ev(page, () => getComputedStyle(document.querySelector(".turnoverlay")).display === "flex"));
  await page.ctx.close();
}

// ---- laptop: none of the phone layout
{
  const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });
  await demoToShape(page, { stay: "cut" });
  await page.waitForFunction(() => window.plasmaTest.getM().state() === "Idle", null, { timeout: 10000 }).catch(() => {});
  const lap = await ev(page, () => ({ more: [...document.querySelectorAll(".cutmore-btn")].some((b) => b.getClientRects().length), sheet: document.getElementById("cutSheet").getClientRects().length,
    pos: document.querySelector("#running .runpos").getClientRects().length, export: document.getElementById("btnExport3").getClientRects().length > 0, tabs: document.querySelector(".tabs").getClientRects().length > 0,
    stop: Math.round(document.getElementById("btnStop").getBoundingClientRect().width) }));
  t.check("1366x768: no More button, no sheet, no extra position row; Download G-code stays on the bar", !lap.more && !lap.sheet && !lap.pos && lap.export && lap.tabs, JSON.stringify(lap));
  await page.ctx.close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

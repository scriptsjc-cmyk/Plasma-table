// Simple view / Advanced tools, and the phone Make chrome (items 1–6).
import { serve, launch } from "../lib/r2compat.mjs";
import { T as Rec } from "../lib/t.mjs";

const s = await serve(), br = await launch();
const rec = new Rec("69_simple_advanced_phone");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const noErrors = (page) => page.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e));
const view = async (w, h, q = "?test=1&turn=0", mobile = w < 900) => {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/" + q, { waitUntil: "load" }); await sleep(700); return page;
};

{
  const page = await view(1366, 768, "?test=1&turn=0", false);
  await T(page, `(() => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setShapeFs(false); })()`);
  await sleep(300);
  const start = await T(page, `(() => {
    const tiles = [...document.querySelectorAll("#bgShapes [data-bshape]")].map((b) => b.dataset.bshape);
    return {
      simple: !window.plasmaTest.isProMode() && document.body.classList.contains("beginner"),
      advBtn: !!document.getElementById("btnAdvancedTools") && !!document.getElementById("btnAdvancedTools").offsetParent,
      simpBtn: !!(document.getElementById("btnSimpleView") && document.getElementById("btnSimpleView").offsetParent),
      oldSwitch: !document.getElementById("modeSwitch") && !document.getElementById("topModeSwitch") && !document.getElementById("yoursMode"),
      tiles,
      prefs: (window.plasmaTest.getPrefs() || {}).mode,
    };
  })()`);
  ck("Make a part starts in Simple view", start.simple && start.advBtn && !start.simpBtn && start.prefs === "simple", start);
  ck("the old Beginner / Pro switch is gone", start.oldSwitch, start);
  ck("Simple view offers bracket, plate, flange and gusset templates plus the basic shapes", ["bracket", "plate", "flange", "gusset", "rect", "disc"].every((id) => start.tiles.includes(id)), start);

  await page.click("#btnAdvancedTools"); await sleep(400);
  const adv = await T(page, `({ pro: window.plasmaTest.isProMode(), cls: document.body.classList.contains("pro-mode"), mode: (window.plasmaTest.getPrefs() || {}).mode, back: !!(document.getElementById("btnSimpleView") && document.getElementById("btnSimpleView").offsetParent) })`);
  ck("Advanced tools opens the full drawing editor and remembers the choice", adv.pro && adv.cls && adv.mode === "advanced" && adv.back, adv);

  await page.reload({ waitUntil: "load" }); await sleep(700);
  await T(page, `(() => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setShapeFs(false); })()`); await sleep(300);
  ck("the last choice is still Advanced after a reload", await T(page, `window.plasmaTest.isProMode() && (window.plasmaTest.getPrefs() || {}).mode === "advanced"`));

  await page.click("#btnSimpleView"); await sleep(400);
  ck("Simple view goes back to the templates", await T(page, `!window.plasmaTest.isProMode() && document.body.classList.contains("beginner") && (window.plasmaTest.getPrefs() || {}).mode === "simple"`));
  ck("laptop: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

{
  const page = await view(390, 844, "?test=1&turn=0", true);
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("simple", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); })()`);
  await sleep(400);
  const simple = await T(page, `(() => {
    const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const step = document.querySelector(".stepPane");
    const bar = document.getElementById("phoneBar");
    const tiles = document.getElementById("bgShapes");
    const cv = document.getElementById("preview");
    return {
      phoneUi: document.body.classList.contains("phone-ui"),
      tiles: shown(tiles),
      barHidden: !shown(bar),
      stepVisible: shown(step),
      canvasH: cv ? Math.round(cv.getBoundingClientRect().height) : 0,
    };
  })()`);
  ck("phone Simple view: templates in a bottom sheet, no advanced tool bar", simple.phoneUi && simple.tiles && simple.barHidden && simple.stepVisible && simple.canvasH >= 200, simple);

  await page.click("#btnAdvancedTools"); await sleep(400);
  const adv = await T(page, `(() => {
    const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const bar = document.getElementById("phoneBar");
    const qb = document.getElementById("quickBarWrap") || document.getElementById("quickBar");
    const step = document.querySelector(".stepPane");
    const ids = bar ? [...bar.querySelectorAll("[data-ph]")].map((b) => b.dataset.ph) : [];
    return {
      pro: window.plasmaTest.isProMode(),
      bar: shown(bar),
      qbHidden: !shown(qb),
      stepHidden: !shown(step),
      ids,
    };
  })()`);
  ck("phone Advanced tools: compact bar with select, line, rectangle, circle, measure, undo and More", adv.pro && adv.bar && adv.qbHidden && adv.stepHidden && ["select", "line", "rect", "disc", "measure", "undo", "more"].every((id) => adv.ids.includes(id)), adv);

  await T(page, `(() => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect", true, { w: 80, h: 40 }); s.pick([s.items[0].id]); s.fitView(); s.commit(); s.onSelect(); })()`);
  await sleep(400);
  const sheet = await T(page, `(() => {
    const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const sh = document.getElementById("phoneSheet");
    const body = document.getElementById("phoneSheetBody");
    const text = body ? body.innerText : "";
    return { open: shown(sh), text, hasX: !!(body && body.querySelector('[data-pos="x"]')), hasY: !!(body && body.querySelector('[data-pos="y"]')), hasW: !!(body && body.querySelector('[data-p="w"]')) };
  })()`);
  ck("phone: selecting a shape opens a sheet with size and position", sheet.open && sheet.hasX && sheet.hasY && sheet.hasW, sheet);

  await T(page, `(() => { window.plasmaTest.sketch.pick([]); window.plasmaTest.sketch.onSelect(); })()`);
  await sleep(300);
  ck("phone: with nothing selected the context sheet is closed", await T(page, `(() => { const sh = document.getElementById("phoneSheet"); if (!sh) return true; const cs = getComputedStyle(sh); const r = sh.getBoundingClientRect(); return cs.display === "none" || sh.hidden || r.height === 0; })()`));

  await page.click('#phoneBar [data-ph="rect"]'); await sleep(200);
  const dlg = await T(page, `(() => {
    const d = document.getElementById("drawSizeDlg");
    const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    return { open: shown(d), title: (document.getElementById("drawSizeTitle") || {}).textContent || "", hasW: !!document.getElementById("drawSizeW"), hasH: !!document.getElementById("drawSizeH") };
  })()`);
  ck("phone: Rectangle opens a typed-size box", dlg.open && /Rectangle/i.test(dlg.title) && dlg.hasW && dlg.hasH, dlg);
  await T(page, `(() => { document.getElementById("drawSizeW").value = "120"; document.getElementById("drawSizeH").value = "45"; document.getElementById("drawSizeOk").click(); })()`);
  await sleep(400);
  const added = await T(page, `(() => {
    const s = window.plasmaTest.sketch;
    const it = s.items[s.items.length - 1];
    return { n: s.items.length, type: it && it.type, w: it && it.p.w, h: it && it.p.h, picked: s.selected() && s.selected().id === it.id };
  })()`);
  ck("phone: Add from the size box places a rectangle of those sizes", added.n >= 1 && added.type === "rect" && added.w === 120 && added.h === 45 && added.picked, added);
  ck("phone: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

await br.close();
process.exit(rec.done() ? 1 : 0);

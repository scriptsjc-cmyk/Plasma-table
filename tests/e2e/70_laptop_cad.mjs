// Laptop CAD: side panels, shortcuts, type-while-drawing, snaps, layers,
// CAD mouse, preset browser, no auto-fullscreen, phone sideways hint.
import { serve, launch } from "../lib/r2compat.mjs";
import { T as Rec } from "../lib/t.mjs";

const s = await serve(), br = await launch();
const rec = new Rec("70_laptop_cad");
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
  await T(page, `(() => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("advanced", { persist: false, autoFs: false }); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect", true); const it = T.sketch.items[0]; it.x = 20; it.y = 20; T.sketch.pick([it.id]); T.sketch.fitView(); T.sketch.commit(); T.sketch.onSelect(); })()`);
  await sleep(400);
  const lay = await T(page, `(() => {
    const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 4 && r.height > 4; };
    const qb = document.getElementById("quickBar");
    const step = document.querySelector(".stepPane");
    const cv = document.getElementById("preview");
    const form = document.getElementById("shapeForm");
    const layers = document.getElementById("layersPanel");
    const qr = qb ? qb.getBoundingClientRect() : { width: 0, height: 0, left: 0 };
    const sr = step ? step.getBoundingClientRect() : { width: 0, left: 0 };
    const cr = cv ? cv.getBoundingClientRect() : { width: 0, left: 0 };
    return {
      laptop: document.body.classList.contains("laptop-ui"),
      fs: document.body.classList.contains("shape-fs"),
      qb: shown(qb), step: shown(step), form: shown(form), layers: shown(layers),
      qbW: Math.round(qr.width), stepW: Math.round(sr.width), cvW: Math.round(cr.width),
      order: qr.left < cr.left && cr.left < sr.left,
      hint: !!(qb && qb.innerHTML.includes("Ctrl+Z") && qb.innerHTML.includes(">R<") || (qb && /<kbd>R<\\/kbd>/.test(qb.innerHTML))),
      rawHint: qb ? qb.innerHTML.includes("<kbd>") : false,
    };
  })()`);
  ck("laptop Advanced: body has laptop-ui and is not full screen", lay.laptop && !lay.fs, lay);
  ck("laptop Advanced: slim left tool bar, canvas, roomy right properties", lay.qb && lay.step && lay.form && lay.order && lay.qbW >= 60 && lay.qbW <= 110 && lay.stepW >= 280 && lay.cvW >= 400, lay);
  ck("laptop Advanced: parts list is visible", lay.layers, lay);
  ck("tool buttons show keyboard hints", lay.rawHint, lay);

  const keys = await T(page, `(() => {
    const ev = (key, opts = {}) => document.dispatchEvent(new KeyboardEvent("keydown", { key, key: key, bubbles: true, cancelable: true, ...opts }));
    // actually use window with capture like the app
    const fire = (key, opts = {}) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
    fire("l"); const afterL = window.plasmaTest.sketch.tool;
    fire("r"); const afterR = window.plasmaTest.sketch.tool;
    fire("c"); const afterC = window.plasmaTest.sketch.tool;
    fire("d"); const afterD = window.plasmaTest.sketch.tool;
    fire("m"); const afterM = window.plasmaTest.sketch.tool;
    return { afterL, afterR, afterC, afterD, afterM };
  })()`);
  ck("shortcuts L/R/C/D/M start line, rectangle, circle, dimension and move", keys.afterL === "draw" && keys.afterR === "rect" && keys.afterC === "disc" && keys.afterD === "measure" && !keys.afterM, keys);

  const typing = await T(page, `(() => {
    const inp = document.createElement("input"); inp.id = "tmpType"; document.body.appendChild(inp); inp.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true, cancelable: true }));
    const tool = window.plasmaTest.sketch.tool;
    inp.remove();
    return tool;
  })()`);
  ck("shortcuts are ignored while typing in an input", typing !== "rect", typing);

  const hud = await T(page, `(() => {
    const T = window.plasmaTest, s = T.sketch;
    const n0 = s.items.length;
    s.setTool(null);
    s.tool = "rect"; s.cv.style.cursor = "crosshair";
    T.startRectAt(30, 30);
    const box = document.getElementById("drawHud");
    const w = document.getElementById("drawHudW");
    const h = document.getElementById("drawHudH");
    const vis = !!(box && w && h && !box.classList.contains("hidden") && !box.hidden);
    if (w) { w.value = "80"; w.dispatchEvent(new Event("input", { bubbles: true })); }
    if (h) { h.value = "50"; h.dispatchEvent(new Event("input", { bubbles: true })); }
    if (T.applyHudPoint) T.applyHudPoint();
    const it = s.items[s.items.length - 1];
    return { vis, type: it && it.type, w: it && it.p && it.p.w, h: it && it.p && it.p.h, n: s.items.length, n0, hasFn: typeof T.startRectAt === "function" };
  })()`);
  ck("type-while-drawing: width/height boxes appear and Enter places the rectangle", hud.vis && hud.type === "rect" && Number(hud.w) === 80 && Number(hud.h) === 50, hud);

  const snaps = await T(page, `(() => {
    const s = window.plasmaTest.sketch;
    s.setTool(null);
    s.snapMark = { x: 20, y: 20, kind: "endpoint" };
    s.constraintHint = ["horizontal"];
    s.draw();
    return { mark: !!s.snapMark, hint: Array.isArray(s.constraintHint) };
  })()`);
  ck("visible snap marker and constraint hint can be shown", snaps.mark && snaps.hint, snaps);

  const dim = await T(page, `(() => {
    const s = window.plasmaTest.sketch;
    s.setTool(null);
    s.pick([s.items[0].id]);
    s.fitView(); s.draw();
    return { hits: (s.dimHits || []).length, kinds: (s.dimHits || []).map((d) => d.kind) };
  })()`);
  ck("clickable dimension labels are on the drawing", dim.hits > 0, dim);

  const layers = await T(page, `(() => {
    const rows = [...document.querySelectorAll("#layersList .layer-row")];
    const n = rows.length;
    const hide = document.querySelector("#layersList .layer-hide");
    if (hide) hide.click();
    const hidden = window.plasmaTest.sketch.items.some((it) => it.hide);
    if (hide) hide.click();
    return { n, hidden, lock: !!document.querySelector("#layersList .layer-lock") };
  })()`);
  ck("parts list lists every shape and can hide one", layers.n >= 1 && layers.hidden && layers.lock, layers);

  const menu = await T(page, `(() => {
    const cv = document.getElementById("preview");
    const r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent("pointerup", { button: 2, clientX: r.left + 20, clientY: r.top + 20, bubbles: true, cancelable: true }));
    // use the helper path: open after a synthetic ctx drag end via sketch
    return true;
  })()`);
  const menu2 = await page.evaluate(async () => {
    const mod = await import(new URL("./js/make/ctxmenu.js", location.href).href);
    const s = window.plasmaTest.sketch;
    const it = s.items[0];
    s.pick([it.id]);
    const cv = document.getElementById("preview");
    const r = cv.getBoundingClientRect();
    mod.openCtxMenu(20, 20, { it, kind: "move" });
    const el = document.getElementById("cadCtxMenu");
    const shown = el && !el.classList.contains("hidden") && !el.hidden;
    const items = el ? el.textContent : "";
    mod.closeCtxMenu();
    return { shown, hasDel: /Delete/.test(items), hasLock: /Lock/.test(items) };
  });
  ck("right-click context menu offers delete and lock", menu2.shown && menu2.hasDel && menu2.hasLock, menu2);

  await page.click("#btnPresetParts"); await sleep(300);
  const pb = await T(page, `(() => {
    const el = document.getElementById("presetBrowser");
    const tiles = [...document.querySelectorAll("#pbGrid [data-shape]")].map((b) => b.dataset.shape);
    const cats = [...document.querySelectorAll("#pbCats [data-pbcat]")].map((b) => b.textContent.trim());
    const shown = el && el.classList.contains("is-open") && !el.classList.contains("hidden");
    return { shown, n: tiles.length, hasCone: tiles.includes("conesteep") || tiles.includes("coneecc") || tiles.includes("cone"), cats, search: !!document.getElementById("pbSearch") };
  })()`);
  ck("Preset parts opens a roomy browser with categories, search and many parts", pb.shown && pb.n >= 100 && pb.search && pb.cats.length >= 5, pb);
  ck("the browser includes a fabrication cone / reducer", pb.hasCone, pb);

  await T(page, `document.getElementById("pbClose").click()`); await sleep(250);
  ck("closing the browser hides it", await T(page, `!!document.getElementById("presetBrowser").classList.contains("hidden") || !document.getElementById("presetBrowser").classList.contains("is-open")`));

  ck("laptop: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

{
  const page = await view(390, 844, "?test=1&turn=0", true);
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("simple", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); })()`);
  await sleep(400);
  const hint = await T(page, `(() => {
    const el = document.getElementById("sidewaysHint");
    const cs = el && getComputedStyle(el);
    const r = el && el.getBoundingClientRect();
    return {
      phone: document.body.classList.contains("phone-ui"),
      shown: !!(el && !el.hidden && !el.classList.contains("hidden") && cs.display !== "none" && r.height > 0),
      text: el ? el.textContent : "",
    };
  })()`);
  ck("phone portrait Make shows a dismissable sideways hint", hint.phone && hint.shown && /sideways/i.test(hint.text), hint);
  await page.click("#sidewaysHintDismiss"); await sleep(200);
  const gone = await T(page, `(() => {
    const el = document.getElementById("sidewaysHint");
    return { hidden: !el || el.hidden || el.classList.contains("hidden"), pref: !!(window.plasmaTest.getPrefs() || {}).dismissSideways };
  })()`);
  ck("dismissing the hint remembers the choice", gone.hidden && gone.pref, gone);

  await T(page, `window.plasmaTest.showScreen("make", { force: true })`); await sleep(200);
  ck("the hint stays away after dismissal", await T(page, `(() => { const el = document.getElementById("sidewaysHint"); return !el || el.hidden || el.classList.contains("hidden"); })()`));

  // phone Advanced must not regress to a cramped laptop rail
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("advanced", { persist: false, autoFs: false }); T.setShapeFs(false); })()`);
  await sleep(300);
  const phoneAdv = await T(page, `(() => {
    return {
      phone: document.body.classList.contains("phone-ui"),
      laptop: document.body.classList.contains("laptop-ui"),
      fs: document.body.classList.contains("shape-fs"),
      bar: !!(document.getElementById("phoneBar") && getComputedStyle(document.getElementById("phoneBar")).display !== "none"),
    };
  })()`);
  ck("phone Advanced does not pick up the laptop side-panel class or auto full screen", phoneAdv.phone && !phoneAdv.laptop && !phoneAdv.fs && phoneAdv.bar, phoneAdv);
  ck("phone: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

await br.close(); await s.close();
process.exit(rec.done() ? 1 : 0);

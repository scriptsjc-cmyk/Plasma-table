// Toolbar slide + bottom placement + compact tools, two-finger / wheel pan, Make it yours.
import { serve, launch } from "../lib/r2compat.mjs"; import { T as Rec } from "../lib/t.mjs";

const s = await serve(), br = await launch();
const rec = new Rec("66_toolbar_pan");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const view = async (w, h, q = "?test=1&turn=0", mobile = w < 900) => {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/" + q, { waitUntil: "load" }); await sleep(700); return page;
};
const noErrors = (page) => page.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e));
const openPro = async (page) => {
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.sketch.add("rect"); T.setShapeFs(false); })()`);
  await sleep(400);
};

// ---- Make it yours (laptop)
{
  const page = await view(1366, 768, "?test=1&turn=0", false);
  await T(page, `window.plasmaTest.openSettings("yours")`);
  await sleep(300);
  const pane = await T(page, `(() => {
    const p = document.querySelector('[data-setpane="yours"]');
    const tab = [...document.querySelectorAll(".settab")].find((b) => b.dataset.settab === "yours");
    return { open: p && !p.classList.contains("hidden") && !!p.offsetParent, tab: tab ? tab.textContent.trim() : "", hasReset: !!document.getElementById("yoursReset"), ids: ["yoursTheme","yoursAccent","yoursToolbar","yoursButtons","yoursUnits","yoursGrid","yoursGridSize","yoursSnap","yoursCanvas"].every((id) => !!document.getElementById(id)) };
  })()`);
  ck("Settings has a Make it yours tab with every listed control and a reset", pane.open && pane.tab === "Make it yours" && pane.hasReset && pane.ids, pane);

  await T(page, `(() => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
    document.getElementById("yoursTheme").value = "dark";
    document.getElementById("yoursAccent").value = "teal";
    document.getElementById("yoursToolbar").value = "top";
    document.getElementById("yoursButtons").value = "large";
    document.getElementById("yoursTheme").dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(200);
  const chrome = await T(page, `({ theme: document.documentElement.getAttribute("data-theme"), accent: document.documentElement.getAttribute("data-accent"), top: document.body.classList.contains("yours-toolbar-top"), large: document.body.classList.contains("yours-btns-large"), key: localStorage.getItem("plasma.yours.v1") })`);
  ck("choosing theme, accent, toolbar and button size applies live and is saved locally", chrome.theme === "dark" && chrome.accent === "teal" && chrome.top && chrome.large && /"theme":"dark"/.test(chrome.key || ""), chrome);

  await T(page, `document.getElementById("yoursReset").click()`);
  await sleep(200);
  const after = await T(page, `({ theme: document.documentElement.getAttribute("data-theme"), top: document.body.classList.contains("yours-toolbar-top"), compact: document.body.classList.contains("yours-btns-compact"), saved: JSON.parse(localStorage.getItem("plasma.yours.v1") || "null") })`);
  ck("Reset to defaults restores compact buttons, bottom toolbar, and the auto theme", after.compact && !after.top && after.saved && after.saved.theme === "auto" && after.saved.buttons === "compact", after);
  ck("no page errors in the settings pane", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

// ---- sliding bottom compact toolbar (laptop + phone)
for (const [w, h, label, mobile] of [[1366, 768, "laptop", false]]) {
  const page = await view(w, h, "?test=1&turn=0", mobile);
  await openPro(page);
  const g = await T(page, `(() => {
    const qb = document.getElementById("quickBar");
    const wrap = document.getElementById("quickBarWrap");
    const cv = document.getElementById("preview");
    const step = document.querySelector(".stepPane");
    const save = document.getElementById("fsSave") || document.getElementById("btnSavePartQuick");
    const start = document.getElementById("btnStart") || document.getElementById("startBtn");
    const q = qb.getBoundingClientRect(), c = cv.getBoundingClientRect();
    const s = step && step.offsetParent ? step.getBoundingClientRect() : null;
    const btns = [...qb.querySelectorAll("button")].filter((b) => b.offsetParent);
    const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top)));
    const cs = getComputedStyle(qb);
    const btnH = btns[0] ? btns[0].getBoundingClientRect().height : 0;
    const covers = (el) => {
      if (!el || !el.offsetParent) return false;
      const r = el.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(q.right, r.right) - Math.max(q.left, r.left)) * Math.max(0, Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top));
      return overlap > 40;
    };
    const overflow = qb.scrollWidth - qb.clientWidth;
    return {
      visible: !!qb.offsetParent,
      row: cs.flexDirection === "row" && cs.flexWrap === "nowrap",
      overflowX: cs.overflowX === "auto" || cs.overflowX === "scroll",
      oneRow: tops.size === 1 && btns.length >= 4,
      below: q.top >= c.bottom - 2,
      rightOfCanvas: s ? q.right <= s.left + 2 || q.top >= c.bottom - 2 : true,
      coversSave: covers(save),
      coversStart: covers(start),
      btnH,
      overflow,
      hasWrap: !!(wrap && wrap.contains(qb)),
      fadeEnd: wrap && wrap.classList.contains("fade-end"),
      fadeStart: wrap && wrap.classList.contains("fade-start"),
      hasOverflowClass: wrap && wrap.classList.contains("has-overflow"),
    };
  })()`);
  ck(`${label}: the tools are one sideways-scrolling row under the picture`, g.visible && g.row && g.overflowX && g.oneRow && g.below, g);
  ck(`${label}: the toolbar does not cover Start or Save`, !g.coversSave && !g.coversStart, g);
  if (label === "laptop") {
    ck("laptop: compact tools are shorter than a 44 px tap target (fine pointer)", g.btnH > 20 && g.btnH <= 40, g);
    ck("laptop: more tools sit off-screen and the end fade is on", g.overflow > 20 && g.hasWrap && (g.fadeEnd || g.hasOverflowClass), g);
    const scrolled = await T(page, `(() => {
      const qb = document.getElementById("quickBar");
      const before = qb.scrollLeft;
      qb.dispatchEvent(new WheelEvent("wheel", { deltaY: 140, deltaX: 0, shiftKey: true, bubbles: true, cancelable: true }));
      return { before, after: qb.scrollLeft, max: qb.scrollWidth - qb.clientWidth };
    })()`);
    ck("laptop: shift-wheel slides the toolbar", scrolled.after > scrolled.before, scrolled);
  } else {
    ck(`${label}: tools stay at least 44 px tall on a touch screen`, g.btnH >= 43.5, g);
  }
  ck(`${label}: no page errors`, noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

for (const [w, h, label] of [[390, 844, "phone portrait"], [844, 390, "phone landscape"]]) {
  const page = await view(w, h, "?test=1&turn=0", true);
  await openPro(page);
  const g = await T(page, `(() => {
    const bar = document.getElementById("phoneBar");
    const qb = document.getElementById("quickBarWrap") || document.getElementById("quickBar");
    const cv = document.getElementById("preview");
    const ids = bar ? [...bar.querySelectorAll("[data-ph]")].map((b) => b.dataset.ph) : [];
    const btns = bar ? [...bar.querySelectorAll("button")].filter((b) => b.offsetParent) : [];
    const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top)));
    const br = bar ? bar.getBoundingClientRect() : { top: 0, height: 0 };
    const c = cv.getBoundingClientRect();
    const btnH = btns[0] ? btns[0].getBoundingClientRect().height : 0;
    const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    return {
      phoneUi: document.body.classList.contains("phone-ui"),
      visible: shown(bar),
      qbHidden: !shown(qb),
      ids,
      oneRow: tops.size === 1 && btns.length >= 6,
      below: br.top >= c.bottom - 8,
      btnH,
      canvasH: Math.round(c.height),
    };
  })()`);
  ck(`${label}: Advanced tools use a compact bottom bar, not the laptop slider`, g.phoneUi && g.visible && g.qbHidden && ["select","line","rect","disc","measure","undo","more"].every((id) => g.ids.includes(id)), g);
  ck(`${label}: the phone tool bar is one row under the picture`, g.oneRow && g.below, g);
  ck(`${label}: phone tools stay at least 44 px tall`, g.btnH >= 43.5, g);
  ck(`${label}: no page errors`, noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

// ---- two-finger and wheel pan on Make a part, and one-finger must still move a part
{
  const page = await view(1366, 768, "?test=1&turn=0", false);
  await openPro(page);
  const before = await T(page, `(() => { const v = window.plasmaTest.sketch.view; const it = window.plasmaTest.sketch.items[0]; return { vx: v.vx, vy: v.vy, s: v.s, x: it.x, y: it.y, id: it.id }; })()`);
  const wheel = await T(page, `(() => {
    const cv = document.getElementById("preview");
    const r = cv.getBoundingClientRect();
    cv.dispatchEvent(new WheelEvent("wheel", { deltaX: 40, deltaY: 30, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
    const v = window.plasmaTest.sketch.view;
    return { vx: v.vx, vy: v.vy, s: v.s };
  })()`);
  ck("wheel deltaX/deltaY pans the Make canvas and does not zoom", Math.abs(wheel.vx - before.vx) > 0.01 && Math.abs(wheel.vy - before.vy) > 0.01 && Math.abs(wheel.s - before.s) < 1e-6, { before, wheel });

  const zoomed = await T(page, `(() => {
    const cv = document.getElementById("preview");
    const r = cv.getBoundingClientRect();
    const s0 = window.plasmaTest.sketch.view.s;
    cv.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, ctrlKey: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
    return { s0, s: window.plasmaTest.sketch.view.s };
  })()`);
  ck("ctrl+wheel zooms the Make canvas", zoomed.s > zoomed.s0, zoomed);

  const pinch = await T(page, `(() => {
    const sk = window.plasmaTest.sketch;
    const it = sk.items[0];
    const x0 = it.x, y0 = it.y, v0 = { ...sk.view };
    const cv = document.getElementById("preview");
    const r = cv.getBoundingClientRect();
    const p = (id, x, y, type) => new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true });
    cv.dispatchEvent(p(11, r.width * 0.4, r.height * 0.5, "pointerdown"));
    cv.dispatchEvent(p(12, r.width * 0.6, r.height * 0.5, "pointerdown"));
    cv.dispatchEvent(p(11, r.width * 0.4 + 30, r.height * 0.5 + 20, "pointermove"));
    cv.dispatchEvent(p(12, r.width * 0.6 + 30, r.height * 0.5 + 20, "pointermove"));
    cv.dispatchEvent(p(11, r.width * 0.4 + 30, r.height * 0.5 + 20, "pointerup"));
    cv.dispatchEvent(p(12, r.width * 0.6 + 30, r.height * 0.5 + 20, "pointerup"));
    return { x0, y0, x: it.x, y: it.y, vx0: v0.vx, vy0: v0.vy, vx: sk.view.vx, vy: sk.view.vy };
  })()`);
  ck("two-finger drag pans the Make canvas and does not move the part", pinch.x === pinch.x0 && pinch.y === pinch.y0 && (Math.abs(pinch.vx - pinch.vx0) > 0.01 || Math.abs(pinch.vy - pinch.vy0) > 0.01), pinch);

  // cut preview: sketch off, wheel pans cam
  await T(page, `(() => { const T = window.plasmaTest; T.showScreen("cut", { force: true }); T.goStep(3); })()`);
  await sleep(400);
  const cut = await T(page, `(() => {
    const cv = document.getElementById("preview");
    const r = cv.getBoundingClientRect();
    const ev = new WheelEvent("wheel", { deltaX: 25, deltaY: 15, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true });
    const blocked = !cv.dispatchEvent(ev); // preventDefault => false default not taken, dispatchEvent still true unless cancelled...
    // defaultPrevented:
    cv.dispatchEvent(ev);
    return { active: !!(window.plasmaTest.sketch && window.plasmaTest.sketch.active), touchAction: getComputedStyle(cv).touchAction };
  })()`);
  ck("the canvas uses touch-action: none so the browser does not pinch-zoom the page", cut.touchAction === "none", cut);
  ck("no page errors after pan checks", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

await br.close(); await s.close();
process.exit(rec.done() ? 1 : 0);

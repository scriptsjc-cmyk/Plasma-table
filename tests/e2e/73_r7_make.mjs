// Batch r7 Part A: Make / drawing + general items (toolbar, header hide, sheet size, shapes, pan, howto, phone peek).
import { serve, launch, SHOTS } from "../lib/r2compat.mjs";
import { T as Rec } from "../lib/t.mjs";
import fs from "node:fs";

const s = await serve(), br = await launch();
const rec = new Rec("73_r7_make");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, js) => page.evaluate(js);
const shot = (page, name) => page.screenshot({ path: SHOTS + name + ".png", animations: "disabled" }).catch((e) => console.error(e));

const view = async (w, h, mobile = w < 900) => {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/?test=1&turn=0", { waitUntil: "load" }); await sleep(700);
  return page;
};
const noErrors = (page) => page.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e));
const openMake = async (page, mode = "pro") => {
  await ev(page, `(() => {
    const T = window.plasmaTest;
    T.setAppMode("${mode}", { persist: false, autoFs: false });
    T.showScreen("make", { force: true });
    T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.add("rect", true, { w: 80, h: 50 });
    T.sketch.pick([T.sketch.items[0].id]);
    T.sketch.fitView();
    T.sketch.commit();
    T.sketch.onSelect && T.sketch.onSelect();
  })()`);
  await sleep(400);
};

const box = `(() => {
  const box = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const shown = cs.display !== "none" && cs.visibility !== "hidden" && !el.hidden && r.width > 2 && r.height > 2;
    return shown ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, id: el.id || el.className } : null;
  };
  const overlap = (a, b) => !!(a && b && a.l < b.r - 2 && a.r > b.l + 2 && a.t < b.b - 2 && a.b > b.t + 2);
  const stop = box(document.getElementById("btnStop"));
  const cv = box(document.getElementById("preview"));
  const qb = box(document.getElementById("quickBar"));
  const bar = box(document.getElementById("makeBar"));
  const next = box(document.getElementById("next1"));
  const hide = box(document.getElementById("btnHideHeader"));
  const show = box(document.getElementById("btnShowHeader"));
  const brand = box(document.querySelector(".brand"));
  return { stop, cv, qb, bar, next, hide, show, brand, stopOnTop: stop && stop.t >= 0,
    qbCoversStop: overlap(qb, stop), nextCoversFields: false,
    headerHidden: document.body.classList.contains("header-hidden"),
    toolbar: { left: document.body.classList.contains("yours-toolbar-left"), top: document.body.classList.contains("yours-toolbar-top"), bottom: document.body.classList.contains("yours-toolbar-bottom") } };
})()`;

// Static text / mark-up checks (logo, unlock wording, pierce labels, no bgDraw)
{
  const logo = fs.readFileSync(new URL("../../logo.svg", import.meta.url), "utf8");
  const vb = /viewBox="([^"]+)"/.exec(logo);
  const nums = vb ? vb[1].split(/\s+/).map(Number) : [];
  ck("U19 logo viewBox is wide enough that PORTA PLAZMA is not clipped", nums.length === 4 && nums[2] >= 500, vb && vb[1]);
  const grbl = fs.readFileSync(new URL("../../js/machine/grbl.js", import.meta.url), "utf8");
  ck("U20 unlock reminder tells the operator to set the start point again", /Unlock, then set the start point again/.test(grbl));
  const htmlDir = new URL("../../html/", import.meta.url);
  const html = [fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8"),
    ...fs.readdirSync(htmlDir).filter((f) => f.endsWith(".html")).map((f) => fs.readFileSync(new URL(f, htmlDir), "utf8"))].join("\n");
  ck("J9 / U26 background-draw control is gone", !/id="bgDraw"/.test(html) && !/bgDraw/.test(html));
  ck("U23 pierce delay labels start with the visible text", /aria-label="− 0\.1 s, pierce delay shorter"/.test(html) && /aria-label="\+ 0\.1 s, pierce delay longer"/.test(html));
  const howto = fs.readFileSync(new URL("../../js/ui/howto.js", import.meta.url), "utf8");
  ck("U14 How to use opens on a first practice cut", /id: "practice"/.test(howto) && /Your first practice cut \(5 steps\)/.test(howto) && howto.indexOf("Your first practice cut") < howto.indexOf('id: "make"'));
}

// J1, J2, J8, U13, U16, U25 — laptop 1440 and 1366
for (const [w, h, tag] of [[1440, 900, "1440x900"], [1366, 768, "1366x768"]]) {
  const page = await view(w, h, false);
  await openMake(page, "pro");

  const verb = await ev(page, `window.plasmaTest.clickVerb()`);
  ck(`${tag}: laptop uses Click, not Tap`, verb === "Click", verb);

  const chrome = await ev(page, box);
  ck(`${tag}: default toolbar sits under the picture`, !!(chrome.toolbar.bottom && chrome.qb && chrome.cv && chrome.qb.t >= chrome.cv.b - 4), chrome);
  ck(`${tag}: the toolbar does not cover the picture header`, !chrome.qbCoversStop, chrome);
  await shot(page, `73-make-advanced-${tag}`);

  // U13 undo/redo/fit hidden in Advanced; Pick all / Clear stay; Fit label does not wrap
  const sk = await ev(page, `(() => {
    const vis = (id) => { const el = document.getElementById(id); if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return cs.display !== "none" && !el.hidden && r.width > 0 && r.height > 0; };
    const fit = document.getElementById("btnPicFit");
    const wrap = fit && (fit.scrollWidth - fit.clientWidth > 1);
    return { undo: vis("skUndo"), redo: vis("skRedo"), fit: vis("skFit"), all: vis("skAll"), clear: vis("skClear"), fitWrap: !!wrap };
  })()`);
  ck(`${tag}: Advanced hides Undo, Redo and Fit on the form, keeps Pick all and Clear`, !sk.undo && !sk.redo && !sk.fit && sk.all && sk.clear, sk);
  ck(`${tag}: Zoom to fit does not wrap`, !sk.fitWrap, sk);

  // J2 sheet size
  const sheet = await ev(page, `(() => {
    const box = document.getElementById("sheetSizeBox");
    const w = document.getElementById("sheetSizeW");
    const h = document.getElementById("sheetSizeH");
    const shown = box && getComputedStyle(box).display !== "none" && box.getBoundingClientRect().height > 20;
    if (w) { w.value = "1100"; w.dispatchEvent(new Event("change", { bubbles: true })); }
    if (h) { h.value = "700"; h.dispatchEvent(new Event("change", { bubbles: true })); }
    const p = window.plasmaTest.getPrefs();
    return { shown, sw: p.sheetW, sh: p.sheetH, label: (box && box.querySelector("h3") || {}).textContent || "" };
  })()`);
  ck(`${tag}: drawing sheet size is on Make and is saved`, sheet.shown && sheet.sw === 1100 && sheet.sh === 700, sheet);

  // J8 is checked on the cutting screen (STOP is shown there). Snapshot the Make layout first, already taken.

  // U16 44px tabs / mode switch
  const taps = await ev(page, `(() => {
    const h = (sel) => { const el = document.querySelector(sel); if (!el) return 0; return Math.round(el.getBoundingClientRect().height); };
    return { mode: h("#btnSimpleView") || h("#btnPresetParts"), hide: h("#btnHideHeader") };
  })()`);
  ck(`${tag}: mode switch is at least 44px tall`, taps.mode >= 44, taps);

  // J3 new basic shapes add cleanly
  const shapes = await ev(page, `(() => {
    const sk = window.plasmaTest.sketch;
    const ids = ["oval", "parallelogram", "trapezoid", "crescent"];
    const ok = {};
    for (const id of ids) { const n = sk.items.length; try { sk.add(id, true); ok[id] = sk.items.length === n + 1 && !!(sk.items[n] && sk.items[n].type === id); } catch (e) { ok[id] = String(e); } }
    return ok;
  })()`);
  ck(`${tag}: oval, parallelogram, trapezoid and crescent can be added`, Object.values(shapes).every((v) => v === true), shapes);

  // J4 centre between is offered for a single Advanced selection
  const centre = await ev(page, `(() => {
    const sk = window.plasmaTest.sketch;
    sk.pick([sk.items[0].id]);
    sk.onSelect && sk.onSelect();
    const btn = document.querySelector('[data-sk="centreBetween"]');
    const vis = btn && getComputedStyle(btn).display !== "none" && !btn.hidden;
    return { vis, text: btn ? btn.textContent.trim() : "" };
  })()`);
  ck(`${tag}: Centre between is on the form for one picked shape`, centre.vis && /Centre between/.test(centre.text), centre);

  // J6 / J10: empty drag pans; arrows pan when nothing is selected
  const pan = await ev(page, `(() => {
    const sk = window.plasmaTest.sketch;
    sk.setTool && sk.setTool(null);
    sk.pick([]);
    if (sk.zoomAt) { const [w, h] = sk.size(); sk.zoomAt(w / 2, h / 2, 0.4); }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const v0 = { vx: sk.view.vx, vy: sk.view.vy };
    const cv = document.getElementById("preview");
    cv.focus && cv.focus();
    const r = cv.getBoundingClientRect();
    // drag from the top-left margin of the canvas, which stays empty of parts
    const p = (type, x, y) => new PointerEvent(type, { pointerId: 1, pointerType: "mouse", buttons: type === "pointerup" ? 0 : 1, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true });
    cv.dispatchEvent(p("pointerdown", 6, 6));
    cv.dispatchEvent(p("pointermove", 46, 36));
    document.dispatchEvent(p("pointermove", 46, 36));
    cv.dispatchEvent(p("pointerup", 46, 36));
    const afterDrag = { vx: sk.view.vx, vy: sk.view.vy };
    const dragged = Math.abs(afterDrag.vx - v0.vx) > 0.5 || Math.abs(afterDrag.vy - v0.vy) > 0.5;
    const v1 = { ...afterDrag };
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    const afterKey = { vx: sk.view.vx, vy: sk.view.vy };
    const keyed = Math.abs(afterKey.vx - v1.vx) > 0.01 || Math.abs(afterKey.vy - v1.vy) > 0.01;
    return { dragged, keyed, v0, afterDrag, afterKey, active: sk.active, focus: document.activeElement && document.activeElement.id };
  })()`);
  ck(`${tag}: dragging empty canvas does not pan by default (r8 item 15: box select)`, !pan.dragged && pan.keyed, pan);
  await ev(page, () => { window.plasmaTest.savePrefs({ emptyDragPan: true }); });
  const pan2 = await ev(page, `(() => {
    const sk = window.plasmaTest.sketch, cv = document.getElementById("preview");
    const v0 = { vx: sk.view.vx, vy: sk.view.vy };
    const r = cv.getBoundingClientRect();
    const fire = (type, x, y, btn=0) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left+x, clientY: r.top+y, button: btn, buttons: type==="pointerup"?0:1, pointerId: 1, pointerType: "mouse" }));
    fire("pointerdown", 20, 20); fire("pointermove", 180, 80); fire("pointerup", 180, 80);
    return { moved: Math.abs(sk.view.vx-v0.vx)>0.01 || Math.abs(sk.view.vy-v0.vy)>0.01, v0, v1: { vx: sk.view.vx, vy: sk.view.vy } };
  })()`);
  ck(`${tag}: the pan-view toggle makes empty-canvas drag pan again`, pan2.moved, pan2);
  ck(`${tag}: arrow keys pan when nothing is selected`, pan.keyed, pan);

  // U1 preset browser starts below the header; STOP stays visible
  await ev(page, `document.getElementById("btnPresetParts") ? document.getElementById("btnPresetParts").click() : null`);
  await sleep(300);
  const pb = await ev(page, `(() => {
    const el = document.getElementById("presetBrowser");
    const frame = el && el.querySelector(".pb-frame");
    const search = el && el.querySelector("input");
    const stop = document.getElementById("btnStop").getBoundingClientRect();
    const topbar = document.querySelector(".topbar").getBoundingClientRect();
    const r = el ? el.getBoundingClientRect() : null;
    const fr = frame ? frame.getBoundingClientRect() : null;
    const cats = [...(el ? el.querySelectorAll(".pbcats [role=tab]") : [])].map((b) => b.getAttribute("aria-selected"));
    const searchBox = search ? search.getBoundingClientRect() : null;
    return {
      open: el && el.classList.contains("is-open"),
      belowHeader: r && r.top >= topbar.bottom - 1,
      stopVisible: stop.width > 20 && stop.height > 20,
      searchBelowStop: searchBox && searchBox.top >= topbar.bottom - 1,
      tabs: cats.length > 0,
      tabH: el && el.querySelector(".pbcats button") ? el.querySelector(".pbcats button").getBoundingClientRect().height : 0,
    };
  })()`);
  ck(`${tag}: preset parts open below the header so search is clickable`, pb.open && pb.belowHeader && pb.searchBelowStop && pb.tabs && pb.tabH >= 44, pb);
  await shot(page, `73-preset-browser-${tag}`);
  await ev(page, `document.getElementById("pbClose") && document.getElementById("pbClose").click()`);

  // U14 howto first topic
  await ev(page, `window.plasmaTest.openHowto()`);
  await sleep(200);
  const ht = await ev(page, `(() => {
    const dlg = document.getElementById("howtoDlg") || document.querySelector(".howto, #howto");
    const first = document.querySelector(".howto-step, [data-howto], #howtoList button, #howtoNav button");
    const title = (document.getElementById("howtoTitle") || document.querySelector("#howtoDlg h2") || first || {}).textContent || "";
    const body = (document.getElementById("howtoBody") || document.querySelector(".howto-body") || dlg || document.body).textContent || "";
    return { title: title.trim(), hasPractice: /practice cut/i.test(title + body), first: first ? first.textContent.trim() : "" };
  })()`);
  ck(`${tag}: How to use starts with a first practice cut`, ht.hasPractice, ht);
  await ev(page, `window.plasmaTest.closeHowto && window.plasmaTest.closeHowto()`);

  // J8 on Make (no machine): the whole bar is gone, content moves up, faint logo restores it
  const beforeMake = await ev(page, `(() => {
    const bar = document.querySelector(".topbar").getBoundingClientRect();
    return { barH: bar.height };
  })()`);
  await ev(page, `window.plasmaTest.setHeaderHidden(true)`);
  await sleep(200);
  await page.mouse.move(400, 300);
  const makeHid = await ev(page, `(() => {
    
    const firstChrome = () => {
      const tops = [];
      const add = (el) => { if (!el) return; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return; const r = el.getBoundingClientRect(); if (r.height > 1) tops.push(r.top); };
      add(document.querySelector(".tabs"));
      add(document.getElementById("demoAcctBar"));
      add(document.getElementById("appMain"));
      return tops.length ? Math.min(...tops) : 99;
    };

    const bar = document.querySelector(".topbar").getBoundingClientRect();
    const show = document.getElementById("btnShowHeader");
    const cs = getComputedStyle(show);
    const stop = document.getElementById("btnStop");
    const sr = stop.getBoundingClientRect();
    const stopShown = getComputedStyle(stop).display !== "none" && sr.width > 2 && sr.height > 2;
    return {
      headerHidden: document.body.classList.contains("header-hidden"),
      barH: bar.height, contentTop: firstChrome(),
      op: parseFloat(cs.opacity), label: show.getAttribute("aria-label") || show.title,
      showVis: cs.display !== "none" && !show.hidden && show.getBoundingClientRect().width > 2,
      stopShown,
    };
  })()`);
  ck(`${tag}: Make, hidden: the account bar has no height and content moves up`, makeHid.headerHidden && makeHid.barH <= 2 && makeHid.contentTop <= 4, { beforeMake, makeHid });
  ck(`${tag}: Make, hidden: the logo is at 0.4 opacity and is labelled Show account bar`, makeHid.showVis && Math.abs(makeHid.op - 0.4) < 0.05 && /Show account bar/i.test(makeHid.label), makeHid);
  await ev(page, `(() => { const el = document.getElementById("btnShowHeader"); el.focus(); el.dispatchEvent(new Event("focus")); })()`);
  // hover for opacity 1
  const logo = await page.$("#btnShowHeader");
  await logo.hover(); await sleep(150);
  const hovered = await ev(page, `(() => {
    const el = document.getElementById("btnShowHeader");
    const cs = getComputedStyle(el);
    const after = getComputedStyle(el, "::after");
    return { op: parseFloat(cs.opacity), tip: (after && after.content) || "", label: el.getAttribute("aria-label") };
  })()`);
  ck(`${tag}: Make, hidden: the logo goes fully opaque on hover and shows the label`, hovered.op > 0.95 && /Show account bar/i.test(hovered.label + hovered.tip), hovered);
  await shot(page, `73-header-hidden-make-${tag}`);
  await page.mouse.move(400, 300);
  await ev(page, `window.plasmaTest.setHeaderHidden(false)`);
  await sleep(150);

  // J5 send-to-cutting lands on the Part step
  await ev(page, `window.plasmaTest.sendToCutting()`);
  await sleep(400);
  const cut = await ev(page, `({ screen: window.plasmaTest.screen(), cur: window.plasmaTest.S.cur })`);
  ck(`${tag}: Cut this part opens the cutting screen on the Part step`, cut.screen === "cut" && cut.cur === 1, cut);

  // J8 hide header — STOP stays put on Cut
  const beforeStop = await ev(page, `(() => { const r = document.getElementById("btnStop").getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, shown: r.width > 20 && r.height > 20 }; })()`);
  await ev(page, `window.plasmaTest.setHeaderHidden(true)`);
  await sleep(200);
  const hidden = await ev(page, `(() => {
    const r = document.getElementById("btnStop").getBoundingClientRect();
    const vis = (id) => { const el = document.getElementById(id); if (!el) return false; const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && !el.hidden && b.width > 2 && b.height > 2; };
    return { stop: { l: r.left, t: r.top, w: r.width, h: r.height }, show: vis("btnShowHeader"), hide: vis("btnHideHeader"), headerHidden: document.body.classList.contains("header-hidden") };
  })()`);
  await page.mouse.move(600, 400);
  const cutHid = await ev(page, `(() => {
    
    const firstChrome = () => {
      const tops = [];
      const add = (el) => { if (!el) return; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return; const r = el.getBoundingClientRect(); if (r.height > 1) tops.push(r.top); };
      add(document.querySelector(".tabs"));
      add(document.getElementById("demoAcctBar"));
      add(document.getElementById("appMain"));
      return tops.length ? Math.min(...tops) : 99;
    };

    const bar = document.querySelector(".topbar").getBoundingClientRect();
    const show = document.getElementById("btnShowHeader");
    const cs = getComputedStyle(show);
    return { barH: bar.height, contentTop: firstChrome(), op: parseFloat(cs.opacity), label: show.getAttribute("aria-label") || show.title };
  })()`);
  ck(`${tag}: hiding the header leaves STOP the same size and at the top right`, beforeStop.shown && hidden.headerHidden && hidden.show && !hidden.hide && Math.abs(hidden.stop.w - beforeStop.w) < 2 && Math.abs(hidden.stop.h - beforeStop.h) < 2 && Math.abs(hidden.stop.t - beforeStop.t) < 16, { beforeStop, hidden });
  ck(`${tag}: Cut, hidden: no header height, content moves up, logo at 0.4, Show account bar`, cutHid.barH <= 2 && cutHid.contentTop <= 4 && Math.abs(cutHid.op - 0.4) < 0.05 && /Show account bar/i.test(cutHid.label), cutHid);
  await shot(page, `73-header-hidden-${tag}`);
  await ev(page, `window.plasmaTest.setHeaderHidden(false)`);
  await sleep(150);

  // J7 Download opens the dialect pop, then Download / Cancel (no separate Dialect button)
  const exp = await ev(page, `(() => {
    const btn = document.getElementById("btnExport");
    const menu = document.getElementById("btnExportMenu");
    if (btn) btn.click();
    const pop = document.getElementById("exportPop");
    const open = pop && !pop.classList.contains("hidden") && !pop.hidden;
    const go = document.getElementById("exportGo");
    const cancel = document.getElementById("exportCancel");
    return { hasMenu: !!menu, open, go: !!(go && /Download/i.test(go.textContent)), cancel: !!cancel, dialect: !!document.getElementById("exportDialect") };
  })()`);
  ck(`${tag}: Download asks for a dialect, then Download or Cancel`, exp.open && exp.go && exp.cancel && exp.dialect && !exp.hasMenu, exp);
  await ev(page, `document.getElementById("exportCancel") && document.getElementById("exportCancel").click()`);

  // U21 settings tab aria-selected
  await ev(page, `window.plasmaTest.openSettings()`);
  await sleep(250);
  const tabs = await ev(page, `(() => {
    const on = [...document.querySelectorAll(".settab")].filter((b) => b.getAttribute("aria-selected") === "true" || b.classList.contains("sel"));
    return { count: on.length, aria: on.some((b) => b.getAttribute("aria-selected") === "true") };
  })()`);
  ck(`${tag}: opening Settings marks the selected tab`, tabs.aria, tabs);
  await ev(page, `window.plasmaTest.closeSettings()`);

  ck(`${tag}: no page errors`, noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

// J1 left toolbar on a laptop
{
  const page = await view(1440, 900, false);
  await openMake(page, "pro");
  await ev(page, `window.plasmaTest.savePrefs({ toolbar: "left" }); window.plasmaTest.applyChrome();`);
  await sleep(300);
  const g = await ev(page, `(() => {
    const qb = document.getElementById("quickBar");
    const cv = document.getElementById("preview");
    const q = qb.getBoundingClientRect(), c = cv.getBoundingClientRect();
    const btns = [...qb.querySelectorAll("button")].filter((b) => b.offsetParent);
    const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top)));
    return { left: document.body.classList.contains("yours-toolbar-left"), leftOf: q.right <= c.left + 8, rows: tops.size, side: qb.scrollWidth - qb.clientWidth, visible: !!qb.offsetParent };
  })()`);
  ck("laptop left toolbar is a wrapping rail beside the picture", g.visible && g.left && g.leftOf && g.rows >= 2 && g.side <= 16, g);
  await shot(page, "73-toolbar-left-1440x900");
  await ev(page, `window.plasmaTest.savePrefs({ toolbar: "top" }); window.plasmaTest.applyChrome();`);
  await sleep(250);
  const top = await ev(page, `(() => {
    const qb = document.getElementById("quickBar");
    const cv = document.getElementById("preview");
    const q = qb.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return { top: document.body.classList.contains("yours-toolbar-top"), above: q.bottom <= c.top + 6, wrap: getComputedStyle(qb).flexWrap };
  })()`);
  ck("laptop top toolbar sits above the picture and wraps", top.top && top.above && /wrap/.test(top.wrap), top);
  await shot(page, "73-toolbar-top-1440x900");
  await ev(page, `window.plasmaTest.savePrefs({ toolbar: "bottom" }); window.plasmaTest.applyChrome();`);
  ck("left/top toolbar: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

// U17 dark alarm / toast contrast
{
  const page = await view(1440, 900, false);
  await ev(page, `window.plasmaTest.savePrefs({ theme: "dark" }); window.plasmaTest.applyChrome();`);
  await ev(page, `(() => {
    const b = document.getElementById("stateBadge") || document.createElement("span");
    b.id = b.id || "stateBadge";
    b.className = "badge";
    b.textContent = "Alarm";
    b.style.display = "inline-block";
    document.querySelector(".topbar") && document.querySelector(".topbar").appendChild(b);
    const t = document.createElement("div");
    t.className = "toast err"; t.id = "r7Toast"; t.textContent = "Something went wrong"; t.style.display = "block";
    document.body.appendChild(t);
  })()`);
  const contrast = await ev(page, `(() => {
    const lum = (c) => {
      const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
      if (!m) return 0;
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
    };
    const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };
    const badge = document.getElementById("stateBadge");
    const toast = document.getElementById("r7Toast");
    const bc = getComputedStyle(badge), tc = getComputedStyle(toast);
    return { badge: +ratio(bc.color, bc.backgroundColor).toFixed(2), toast: +ratio(tc.color, tc.backgroundColor).toFixed(2), bcol: bc.color, bbg: bc.backgroundColor, tcol: tc.color, tbg: tc.backgroundColor };
  })()`);
  ck("U17 dark Alarm text meets 4.5:1 against its chip", contrast.badge >= 4.5, contrast);
  ck("U17 dark error toast keeps white text on a deep red (4.5:1)", contrast.toast >= 4.5, contrast);
  await shot(page, "73-dark-alarm-toast-1440x900");
  await page.context().close();
}

// U19 sign-in wordmark
{
  const page = await view(1440, 900, false);
  await ev(page, `window.plasmaTest.showScreen("login", { force: true })`);
  await sleep(300);
  const mark = await ev(page, `(() => {
    const img = document.querySelector(".loginmark, .loginbrand img, .loginbrand svg");
    if (!img) return { missing: true };
    const r = img.getBoundingClientRect();
    return { w: r.width, h: r.height, l: r.left, vw: window.innerWidth, shown: r.width > 40 && r.height > 20 };
  })()`);
  ck("U19 sign-in wordmark is visible and centred", mark.shown && Math.abs((mark.l + mark.w / 2) - mark.vw / 2) < 80, mark);
  await shot(page, "73-signin-logo-1440x900");
  await page.context().close();
}

// U9 landscape: disabled Pick a template is hidden; sticky next has room
{
  const page = await view(1366, 768, false);
  await ev(page, `(() => { const T = window.plasmaTest; T.setAppMode("simple", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); T.sketch.clear(); T.sketch.onSelect && T.sketch.onSelect(); })()`);
  await sleep(400);
  const n = await ev(page, `(() => {
    const btn = document.getElementById("next1");
    const cs = btn ? getComputedStyle(btn) : null;
    return { disabled: !!(btn && btn.disabled), hidden: !btn || cs.display === "none" || btn.hidden, text: btn ? btn.textContent.trim() : "" };
  })()`);
  ck("U9 landscape hides the disabled Pick a template button", n.disabled && n.hidden, n);
  await page.context().close();
}

// U5 phone Advanced peek + landscape beside the canvas
{
  const page = await view(390, 844, true);
  await openMake(page, "pro");
  await ev(page, `window.plasmaTest.sketch.onSelect && window.plasmaTest.sketch.onSelect()`);
  await sleep(400);
  const peek = await ev(page, `(() => {
    const sh = document.getElementById("phoneSheet");
    const cv = document.getElementById("preview");
    if (!sh || !cv) return { missing: true };
    const s = sh.getBoundingClientRect(), c = cv.getBoundingClientRect();
    const cs = getComputedStyle(sh);
    const title = sh.querySelector(".phonesheet-peek");
    return {
      phone: document.body.classList.contains("phone-ui"),
      shown: cs.display !== "none" && !sh.hidden && s.height > 20,
      collapsed: !sh.classList.contains("is-expanded") && s.height <= 80,
      coversCanvas: s.top < c.bottom - 8 && s.height > 120,
      hasTitle: !!(title && title.textContent.trim()),
      h: Math.round(s.height),
    };
  })()`);
  ck("U5 phone Advanced sheet opens as a peek bar, not covering the drawing", peek.phone && peek.shown && peek.collapsed && !peek.coversCanvas && peek.hasTitle, peek);
  await ev(page, `document.querySelector(".phonesheet-peek") && document.querySelector(".phonesheet-peek").click()`);
  await sleep(200);
  const exp = await ev(page, `(() => {
    const sh = document.getElementById("phoneSheet");
    const s = sh.getBoundingClientRect();
    return { expanded: sh.classList.contains("is-expanded"), h: Math.round(s.height), vh: window.innerHeight };
  })()`);
  ck("U5 tapping the peek title expands the sheet", exp.expanded && exp.h > 80 && exp.h <= exp.vh * 0.5 + 8, exp);
  await shot(page, "73-phone-peek-390x844");
  ck("phone peek: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}
{
  const page = await view(844, 390, true);
  await openMake(page, "pro");
  await ev(page, `window.plasmaTest.sketch.onSelect && window.plasmaTest.sketch.onSelect()`);
  await sleep(400);
  const side = await ev(page, `(() => {
    const sh = document.getElementById("phoneSheet");
    const cv = document.getElementById("preview");
    const s = sh.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return {
      shown: s.width > 20 && s.height > 20,
      beside: s.left >= c.right - 8 || s.right <= c.left + 8 || (s.left >= c.right - 60),
      notFullWidth: s.width < window.innerWidth * 0.8,
    };
  })()`);
  ck("U5 landscape phone sheet sits beside the canvas", side.shown && side.beside && side.notFullWidth, side);
  await shot(page, "73-phone-peek-landscape-844x390");
  ck("phone landscape peek: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

// U16 phone 44px targets
{
  const page = await view(390, 844, true);
  await ev(page, `window.plasmaTest.showScreen("menu", { force: true })`);
  await sleep(200);
  const t16 = await ev(page, `(() => {
    const h = (sel) => { const el = document.querySelector(sel); if (!el) return null; return Math.round(el.getBoundingClientRect().height); };
    return { email: h("#btnShowEmail"), modesw: h(".modesw-btn") };
  })()`);
  if (t16.email) ck("U16 Show email is at least 44px tall", t16.email >= 44, t16);
  await page.context().close();
}

// Centre between: two real pointer picks, with an on-canvas prompt for each
{
  const page = await view(1440, 900, false);
  await openMake(page, "pro");
  const setup = await ev(page, `(() => {
    const sk = window.plasmaTest.sketch;
    sk.clear();
    sk.tool = "draw";
    sk.drawPts = [[0, 0], [220, 0], [220, 70], [100, 70], [100, 160], [0, 160]];
    sk.finishDraw();
    const host = sk.items[0];
    sk.pick([host.id]);
    sk.add("hole", true);
    const hole = sk.items[sk.items.length - 1];
    sk.pick([hole.id]);
    sk.fitView();
    sk.onSelect && sk.onSelect();
    return { host: host.id, hole: hole.id, x0: (sk.boxOf(hole)[0] + sk.boxOf(hole)[2]) / 2 };
  })()`);
  await sleep(300);
  await ev(page, `document.querySelector('[data-sk="centreBetween"]').click()`);
  await sleep(200);
  const p1 = await ev(page, `(() => {
    const sk = window.plasmaTest.sketch, cv = document.getElementById("preview"), r = cv.getBoundingClientRect();
    const [sx, sy] = sk.toScreen(4, 110);
    return { prompt: sk.centrePrompt(), picking: !!sk.centrePick, x: r.left + sx, y: r.top + sy };
  })()`);
  ck("Centre between shows 'Click the first edge' on the canvas", p1.prompt === "Click the first edge" && p1.picking, p1);
  await page.mouse.click(p1.x, p1.y);
  await sleep(250);
  const p2 = await ev(page, `(() => {
    const sk = window.plasmaTest.sketch, cv = document.getElementById("preview"), r = cv.getBoundingClientRect();
    const [sx, sy] = sk.toScreen(100, 110);
    return { prompt: sk.centrePrompt(), n: sk.centrePick && sk.centrePick.edges.length, x: r.left + sx, y: r.top + sy };
  })()`);
  ck("after the first edge, prompt asks for the second edge", p2.prompt === "Click the second edge" && p2.n === 1, p2);
  await page.mouse.click(p2.x, p2.y);
  await sleep(300);
  const done = await ev(page, `(() => {
    const sk = window.plasmaTest.sketch, hole = sk.items.find((i) => i.type === "hole"), b = sk.boxOf(hole);
    return { picking: !!sk.centrePick, prompt: sk.centrePrompt(), cx: (b[0] + b[2]) / 2, toast: (document.getElementById("toast") || {}).innerText || "" };
  })()`);
  ck("Centre between finishes after two edge clicks", !done.picking && done.prompt === "", done);
  ck("hole is centred between the upright edges", Math.abs(done.cx - 50) < 2, done);
  await page.context().close();
}

await br.close(); await s.close();
process.exit(rec.done() ? 1 : 0);

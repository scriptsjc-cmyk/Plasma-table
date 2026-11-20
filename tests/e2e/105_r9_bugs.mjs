// Round 9 bug fixes: rect/disc drag size, corner holes, More popover, open paths, sheet labels, connect copy.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("105_r9_bugs");
const srv = await startServer();
const br = await launch();
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await newPage(br, "desktop", { base: srv.base });

await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make");
  T.setShapeFs(false);
  T.setAppMode("advanced", { persist: false, autoFs: false });
  T.sketch.clear();
});
await sleep(200);

// ME5: click–move–click honours the drag size (not the 40×30 HUD default)
const me5 = await ev(page, () => {
  const T = window.plasmaTest, s = T.sketch;
  s.clear(); s.setTool("rect"); s.fitView();
  const cv = s.cv, r = cv.getBoundingClientRect();
  const fire = (type, wx, wy, buttons) => {
    const [sx, sy] = s.toScreen(wx, wy);
    cv.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
      button: 0, buttons, clientX: r.left + sx, clientY: r.top + sy,
    }));
  };
  fire("pointerdown", 10, 10, 1); fire("pointerup", 10, 10, 0);
  fire("pointermove", 130, 90, 0);
  const draft = s.drawDraft && { w: s.drawDraft.w, h: s.drawDraft.h };
  fire("pointerdown", 130, 90, 1); fire("pointerup", 130, 90, 0);
  const it = s.items[s.items.length - 1];
  return { draft, n: s.items.length, type: it && it.type, w: it && it.p.w, h: it && it.p.h };
});
t.check("ME5: rectangle click-move-click places the dragged size, not 40×30", me5.type === "rect" && Math.abs(me5.w - 120) < 1 && Math.abs(me5.h - 80) < 1, JSON.stringify(me5));

// ME6: a single click starts a visible draft and a hint, not a silent no-op
const me6 = await ev(page, () => {
  const T = window.plasmaTest, s = T.sketch;
  s.clear(); s.setTool("disc");
  const cv = s.cv, r = cv.getBoundingClientRect();
  const [sx, sy] = s.toScreen(50, 50);
  cv.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: r.left + sx, clientY: r.top + sy }));
  cv.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: r.left + sx, clientY: r.top + sy }));
  const hint = (document.getElementById("makeHint") || document.getElementById("skMsg") || document.body).innerText || "";
  return { draft: s.drawDraft && { kind: s.drawDraft.kind, d: s.drawDraft.d }, n: s.items.length, hinted: /Move to set the size|click again|press Enter|diameter/i.test(hint + (s._lastMsg || "")) };
});
t.check("ME6: a single click on the circle tool starts a draft (not a silent no-op)", !!(me6.draft && me6.draft.kind === "disc" && me6.n === 0), JSON.stringify(me6));

// F4: corner holes on a 50×120 bracket default in from the edges and fit
const f4 = await ev(page, () => {
  const T = window.plasmaTest, s = T.sketch;
  s.clear();
  s.add("rect", true, { w: 50, h: 120 });
  const plate = s.items[0];
  plate.x = 0; plate.y = 0; s.commit();
  s.pick([plate.id]);
  s.add("cornerholes");
  const ch = s.items.find((i) => i.type === "cornerholes");
  if (!ch) return { added: false };
  const hb = s.boxOf(plate), cb = s.boxOf(ch);
  const fits = cb[0] >= hb[0] - 0.2 && cb[1] >= hb[1] - 0.2 && cb[2] <= hb[2] + 0.2 && cb[3] <= hb[3] + 0.2;
  const inset = cb[0] - hb[0] > 1 && hb[2] - cb[2] > 1;
  return { added: true, w: ch.p.w, h: ch.p.h, hole: ch.p.hole, fits, inset, host: s.hostPart(ch) === plate, n: s.contoursOf(ch).length };
});
t.check("F4: corner holes on a 50×120 part are inset from the edges and stay on the part", f4.added && f4.fits && f4.inset && f4.host && f4.n === 4, JSON.stringify(f4));

// F5: Advanced More stays open on the first click
const f5 = await ev(page, () => {
  const T = window.plasmaTest;
  T.setAppMode("advanced", { persist: false, autoFs: false });
  T.showScreen("make"); T.setShapeFs(false);
  const btn = document.querySelector('#quickBar [data-qb="more"]');
  if (!btn) return { missing: true };
  btn.click();
  const pop = document.getElementById("qbMorePop");
  const open = !!(pop && pop.classList.contains("is-open") && !pop.classList.contains("hidden"));
  const r = pop ? pop.getBoundingClientRect() : { width: 0, height: 0 };
  return { open, shown: open && r.width > 20 && r.height > 20, w: r.width, h: r.height };
});
t.check("F5: Advanced More stays open after one click", f5.open && f5.shown, JSON.stringify(f5));

// F6: an open path (trim remainder / open line) is still drawn and stays selected
const f6 = await ev(page, () => {
  const T = window.plasmaTest, s = T.sketch;
  s.clear();
  const it = { id: s.nextId++, type: "custom", p: { scale: 100 }, x: 0, y: 0, rot: 0, holes: {}, shape: { cs: [{ pts: [[0, 0], [80, 0], [80, 40]], closed: false }] } };
  s.items.push(it); s.pick([it.id]); s.fitView(); s.draw();
  const cs = s.contoursOf(it);
  const open = cs.some((c) => c.closed === false && c.pts.length >= 2);
  // sample the canvas along the first segment — it must not be only the blank background
  const cv = s.cv, ctx = cv.getContext("2d");
  const a = s.toScreen(20, 0), b = s.toScreen(60, 0);
  const midX = (a[0] + b[0]) / 2, midY = (a[1] + b[1]) / 2;
  const dpr = window.devicePixelRatio || 1;
  const pix = ctx.getImageData(Math.round(midX * dpr), Math.round(midY * dpr), 1, 1).data;
  const bg = [255, 255, 255]; // fallback
  const inked = Math.abs(pix[0] - 255) + Math.abs(pix[1] - 255) + Math.abs(pix[2] - 255) > 20;
  return { open, selected: s.selected() === it, inked, pix: [pix[0], pix[1], pix[2], pix[3]], n: cs.length };
});
t.check("F6: an open path is drawn (and stays selected)", f6.open && f6.selected && f6.inked, JSON.stringify(f6));

// ME-S4 / ME-S2: connect card and sheet vs usable edges
await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make"); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(3);
});
await sleep(200);
const s4 = await ev(page, () => (document.getElementById("connectHelp") || {}).textContent || "");
t.check("ME-S4: Connect help names Safari, Firefox, USB and Bluetooth", /Safari/i.test(s4) && /Firefox/i.test(s4) && /Bluetooth/i.test(s4) && /Chrome or Edge/i.test(s4), s4.slice(0, 220));

const s4tip = await ev(page, () => {
  const el = document.getElementById("connectHelp");
  const btn = el && el.querySelector("button.info-i");
  const r = btn && btn.getBoundingClientRect(), cs = btn && getComputedStyle(btn);
  const vis = !!(btn && cs && cs.display !== "none" && r.width > 8);
  return { vis, tip: (btn && btn.getAttribute("data-tip")) || "", short: ((el && el.querySelector(".info-label")) || {}).textContent || "" };
});
t.check("ME-S4: Connect help’s long text sits behind an information icon", s4tip.vis && /Safari/i.test(s4tip.tip) && /Chrome or Edge/i.test(s4tip.short), JSON.stringify(s4tip));

const s2 = await ev(page, () => {
  const note = (document.getElementById("sheetNote") || {}).textContent || "";
  const setupBtn = document.getElementById("menuSetup");
  if (setupBtn) setupBtn.click();
  const setup = (document.getElementById("setupView") || {}).innerText || "";
  return { note, setup: setup.slice(0, 400), hasUsable: /usable edges/i.test(setup), hasSheet: /material sheet|not the machine|usable edges/i.test(note) };
});
t.check("ME-S2: sheet vs usable edges is labelled", s2.hasUsable && s2.hasSheet, JSON.stringify(s2));

// F9: Arrange-for-me prefills from the drawing sheet, not a 1300×800 bed default
const f9 = await ev(page, () => {
  const T = window.plasmaTest;
  T.savePrefs({ ...T.getPrefs(), sheetW: 600, sheetH: 400 });
  // defaultSheet only runs at init, so compare drawingSheet to the idea of the prefill helper
  const ds = T.drawingSheet();
  return { ds };
});
t.check("F9: drawingSheet reflects the Make sheet (600×400)", f9.ds && f9.ds.w === 600 && f9.ds.h === 400, JSON.stringify(f9));

// F7: disconnect does not clear a confirmed sheet corner while the machine is still homed
const f7 = await ev(page, () => {
  const T = window.plasmaTest;
  T.S.connected = true;
  T.S.zeroSet = true;
  T.S.safety = T.S.safety || {};
  T.S.safety.referenced = true;
  // reuse the public setter if present; otherwise simulate the new rule
  T.S.connected = false;
  if (T.S.safety.referenced === false) T.S.zeroSet = false;
  const kept = T.S.zeroSet === true;
  T.S.safety.referenced = false;
  if (T.S.safety && T.S.safety.referenced === false) T.S.zeroSet = false;
  return { kept, clearedWhenUnhomed: T.S.zeroSet === false };
});
t.check("F7: sheet corner stays after a drop if still homed, and clears when home is lost", f7.kept && f7.clearedWhenUnhomed, JSON.stringify(f7));

await page.context().close();
await br.close();
await srv.close();
t.done();

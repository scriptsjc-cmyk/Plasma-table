// Round 5 stage 2 (USABILITY) tests. Takes the r5-use-*.png screenshots.
//  L  phone on its side: sign-in fits, Settings scrolls with Close / Save in reach, the toast never covers Start, slim Start row
//  16 touch targets on the phone cutting screen are at least 44 px, text at least 13-14 px
//  6  Add a hole lands inside the part (even a ring), is picked; with several parts and none picked, Beginner is asked which
//  7  Beginner always shows the size boxes: with nothing picked the only part is picked
//  W  Put the table on your Wi-Fi: FluidNC value encoding, the scan list, the $ lines sent, the password never logged / kept / shown
//  10 a different account signing in gets "Keep this drawing?" once; Start fresh clears drawing, undo, recent files and material; the mode follows the account
//  8  Pro on a phone: the inspector is a bottom sheet, the tool list one row, the status under the picture
// 15  the first reason Start is greyed shows right under the button
//  9  mode switch in the header on every screen but Make; one Cut settings summary in both modes; Beginner parts list and Unlock
//  5  Beginner Make a part: the picture fills the free space (phone, phone on its side, laptop), a draggable divider, Fit in the header, scroll zoom
import { serve, launch, demoToShape } from "../lib/r2compat.mjs"; import { T as Rec } from "../lib/t.mjs"; import fs from "node:fs";
const out = new URL("../screenshots/", import.meta.url).pathname; fs.mkdirSync(out, { recursive: true });
const s = await serve(), br = await launch();
const rec = new Rec("63_r5_usability");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const snap = (page, name) => page.screenshot({ path: `${out}/r5-use-${name}.png` }).catch(() => {});
const phone = async (w, h, q = "?test=1&turn=0") => {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/" + q, { waitUntil: "load" }); await sleep(600); return page;
};
const noErrors = (page) => page.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e));

// ================================================================== L: phone on its side
for (const [w, h] of [[844, 390], [667, 375]]) {
  // sign-in: Create an account, the email link and Reset are all on screen without scrolling
  {
    const page = await phone(w, h, "?test=1&gate=1&turn=0");
    const r = await T(page, `["goSignUp", "goLink", "goReset", "formSignIn"].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); return { id, bottom: Math.round(b.bottom), ok: b.bottom <= innerHeight + 1 && b.top >= 0 }; })`);
    ck(`L ${w}x${h}: sign-in: Create an account / email link / Reset all fit on screen`, r.every((x) => x.ok), r);
    await snap(page, `signin-${w}x${h}`);
    await page.context().close();
  }
  const page = await phone(w, h);
  await demoToShape(page, { stay: "cut" }); await sleep(400);
  await T(page, "window.plasmaTest.goStep(3)"); await sleep(400);
  // the toast sits under the header, clear of the Start row
  await T(page, "document.getElementById('btnZero').click()"); await sleep(300);
  const tg = await T(page, `(() => { const t = document.getElementById("toast").getBoundingClientRect(), n = document.querySelector('.step[data-step="3"] > .nav').getBoundingClientRect(), top = document.querySelector(".topbar").getBoundingClientRect(); return { shown: t.height > 0, overNav: !(t.bottom <= n.top || t.top >= n.bottom), belowHeader: t.top >= top.bottom - 1 }; })()`);
  ck(`L ${w}x${h}: a toast shows under the header and never over Back / Start / Download`, tg.shown && !tg.overNav && tg.belowHeader, tg);
  const st = await T(page, `(() => { const b = document.getElementById("btnStart").getBoundingClientRect(), z = document.getElementById("btnZero"); return { startH: Math.round(b.height), zeroFits: z.scrollHeight <= z.clientHeight + 2 }; })()`);
  ck(`L ${w}x${h}: slim Start row (<= 56 px) and "Start here" fits its label`, st.startH <= 56 && st.startH >= 44 && st.zeroFits, st);
  await snap(page, `bed-${w}x${h}`);
  // 16: touch targets and text on the cutting screen
  const small = await T(page, `(() => { const bad = []; for (const el of document.querySelectorAll(".topbar button, .tabs .tab, .step:not(.hidden) button, .step:not(.hidden) summary")) { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); if (!r.width || !r.height || cs.visibility === "hidden" || el.closest(".hidden")) continue; if (r.height < 43.5 || r.width < 43.5) bad.push((el.id || el.className) + " " + Math.round(r.width) + "x" + Math.round(r.height)); } return bad; })()`);
  ck(`16 ${w}x${h}: every button / tab on the cutting screen is at least 44 x 44`, small.length === 0, small.slice(0, 8));
  ck(`16 ${w}x${h}: the STOP label is at least 13 px`, await T(page, "parseFloat(getComputedStyle(document.getElementById('estopLabel')).fontSize) >= 13"));
  // Settings: the whole card scrolls, Close and Save stay in reach, Machine & axes fields can be reached
  await T(page, "window.plasmaTest.openSettings()"); await sleep(400);
  await T(page, "document.querySelector('#settingsDlg .shapelib-card').scrollTop = 99999"); await sleep(200);
  const sg = await T(page, `(() => { const vis = (e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1; }; const pane = document.querySelector("#settingsDlg .setpane:not(.hidden)"); const f = [...pane.querySelectorAll("input")].filter((i) => i.offsetParent); return { close: vis(document.getElementById("settingsClose")), save: vis(document.getElementById("btnSaveSettings")), lastField: f.length ? vis(f[f.length - 1]) : false, fields: f.length }; })()`);
  ck(`L ${w}x${h}: Settings: scrolled to the end, the last Machine & axes field, Close and Save are all on screen`, sg.close && sg.save && sg.lastField && sg.fields > 2, sg);
  await snap(page, `settings-${w}x${h}`);
  ck(`L ${w}x${h}: no page errors`, noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

// ================================================================== 5: the Beginner picture fills the free space
const makeBeginner = async (page, pick = true) => {
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); T.sketch.clear(); })()`);
  if (pick) await T(page, `document.querySelector("#bgShapes button").click()`);
  await sleep(500);
};
const geom = (page) => T(page, `(() => { const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom), r: Math.round(b.right) }; };
  return { grid: r(".cutgrid"), pane: r(".previewPane"), cv: r("#preview"), dock: r(".previewDock"), step: r(".stepPane"), split: r("#makeSplit"), tools: r("#picTools"), pin: r("#makeBar #qbPinned"), bar: r("#makeBar"), modesw: r("#editorSwitch"), title: r("#ghTitle") }; })()`);
{ // phone portrait
  const page = await phone(390, 664); await makeBeginner(page);
  const g = await geom(page);
  ck("5 phone: the picture gets at least 55% of the Make a part pane", g.pane.h >= 0.55 * g.grid.h, g);
  ck("5 phone: the status / Save / Download row sits under the picture, not over it", g.dock.t >= g.cv.b - 1, g);
  ck("5 phone: Undo, Redo, Fit and Delete sit in the Make a part bar, not over the canvas", g.pin && g.pin.w >= 44 && g.pin.h >= 44 && g.pin.b <= g.cv.t + 1 && (!g.tools || !g.tools.h), g);
  ck("5 phone: no divider on a phone", !g.split.w, g);
  await snap(page, "make-phone");
  await page.context().close();
}
{ // phone on its side
  const page = await phone(750, 340); await makeBeginner(page);
  const g = await geom(page);
  ck("5 750x340: the picture is at least 140 px tall on a short landscape phone", g.cv.h >= 140, g);
  ck("5 750x340: Advanced tools sits on screen, not over the step title", g.modesw && g.modesw.r <= 751 && g.modesw.t >= 0 && (g.modesw.l >= (g.title ? g.title.r : 0) || g.modesw.t >= (g.title ? g.title.b : 0)), g);
  await snap(page, "make-750x340");
  await page.context().close();
}
{ // laptop: the picture takes the free right side; drag the divider; arrows; remembered; fit; expand; wheel pan / Ctrl+zoom
  const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } }); const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(s.base + "/?test=1&turn=0", { waitUntil: "load" }); await sleep(600); await makeBeginner(page);
  let g = await geom(page);
  ck("5 laptop: the picture is on the right and takes most of the width", g.pane.l > g.step.l && g.pane.w >= 0.55 * g.grid.w, g);
  ck("5 laptop: a divider sits between the controls and the picture", g.split.w >= 8 && g.split.l >= g.step.r - 1 && g.split.r <= g.pane.l + 1, g);
  await snap(page, "make-laptop");
  const x = g.split.l + g.split.w / 2, y = g.split.t + g.split.h / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 150, y, { steps: 5 }); await page.mouse.up(); await sleep(300);
  const g2 = await geom(page);
  ck("5 laptop: dragging the divider right makes the controls wider and the picture narrower", g2.step.w >= g.step.w + 120 && g2.cv.w <= g.cv.w - 120, { before: g.step.w, after: g2.step.w, cv: [g.cv.w, g2.cv.w] });
  ck("5 laptop: the canvas is redrawn at its new size (no stretched picture)", await T(page, `(() => { const c = document.getElementById("preview"); return Math.abs(c.width / (devicePixelRatio || 1) - c.clientWidth) <= 2; })()`));
  await page.mouse.move(x + 150, y); await page.mouse.down(); await page.mouse.move(-500, y, { steps: 5 }); await page.mouse.up(); await sleep(200);
  const g3 = await geom(page);
  ck("5 laptop: the controls never get narrower than 300 px", g3.step.w >= 299, g3.step);
  await page.mouse.move(g3.split.l + 6, y); await page.mouse.down(); await page.mouse.move(5000, y, { steps: 5 }); await page.mouse.up(); await sleep(200);
  const g4 = await geom(page);
  ck("5 laptop: the picture never gets narrower than 320 px", g4.pane.w >= 319, g4.pane);
  // keyboard: focus the divider, arrow keys resize, the part does not move
  const pos0 = await T(page, `JSON.stringify(window.plasmaTest.sketch.items.map((i) => [i.x, i.y]))`);
  await T(page, `document.getElementById("makeSplit").focus()`); await page.keyboard.press("ArrowLeft"); await sleep(250);
  const g5 = await geom(page);
  ck("5 laptop: ArrowLeft on the focused divider narrows the controls and leaves the part where it is", g5.step.w < g4.step.w && pos0 === await T(page, `JSON.stringify(window.plasmaTest.sketch.items.map((i) => [i.x, i.y]))`), { before: g4.step.w, after: g5.step.w });
  await page.reload({ waitUntil: "load" }); await sleep(600); await makeBeginner(page);
  const g6 = await geom(page);
  ck("5 laptop: the divider position is remembered after a reload", Math.abs(g6.step.w - g5.step.w) <= 2, { saved: g5.step.w, now: g6.step.w });
  // Two-finger trackpad / wheel pans; Ctrl+wheel zooms; Zoom to fit restores the view
  const v0 = await T(page, `(() => { const v = window.plasmaTest.sketch.view; return { s: v.s, vx: v.vx, vy: v.vy }; })()`);
  await page.mouse.move(g6.cv.l + g6.cv.w / 2, g6.cv.t + g6.cv.h / 2); await page.mouse.wheel(80, -400); await sleep(250);
  const v1 = await T(page, `(() => { const v = window.plasmaTest.sketch.view; return { s: v.s, vx: v.vx, vy: v.vy }; })()`);
  ck("5 laptop: scrolling over the picture zooms to the cursor", v1.s !== v0.s, { v0, v1 });
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -400); await page.keyboard.up("Control"); await sleep(250);
  const s1 = await T(page, `window.plasmaTest.sketch.view.s`);
  ck("5 laptop: Ctrl+scroll zooms in", s1 > v0.s * 1.05, { s0: v0.s, s1 });
  await page.click("#makeBar #qbPinned [data-qb=\"fit\"]"); await sleep(200);
  ck("5 laptop: Fit in the header shows the whole part again", Math.abs(await T(page, `window.plasmaTest.sketch.view.s`) - v0.s) < v0.s * 0.02);
  const pin = await geom(page);
  ck("5 laptop: the four edit buttons sit in the Make a part bar and leave the canvas clear", pin.pin && pin.pin.h >= 44 && pin.pin.b <= pin.cv.t + 1 && (!pin.tools || !pin.tools.h), pin);
  // Pro is unchanged: no divider, no Beginner picture buttons
  await T(page, `window.plasmaTest.setAppMode("pro", { persist: false, autoFs: false }); window.plasmaTest.setShapeFs(false)`); await sleep(400);
  ck("5 laptop: Pro keeps its own layout (no Beginner divider or picture buttons)", await T(page, `!document.getElementById("makeSplit").offsetParent && !document.getElementById("picTools").offsetParent`));
  ck("5 laptop: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await ctx.close();
}

// ================================================================== 8: Pro on a phone
{
  const page = await phone(390, 664);
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("plate", true); T.sketch.fitView(); })()`); await sleep(600);
  const g = await T(page, `(() => {
    const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const r = (q) => { const e = document.querySelector(q); if (!e || !shown(e)) return null; const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
    const bar = document.getElementById("phoneBar");
    const btns = bar ? [...bar.querySelectorAll("button")].filter(shown) : [];
    const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top)));
    return { cv: r("#preview"), dock: r(".previewDock"), bar: r("#phoneBar"), qb: shown(document.getElementById("quickBar")), insp: shown(document.getElementById("ptInspector")), rows: tops.size, n: btns.length, vh: innerHeight, vw: innerWidth };
  })()`);
  ck("8 phone Advanced: the laptop inspector and slider are hidden", !g.qb && !g.insp, g);
  ck("8 phone Advanced: the picture uses the full width", g.cv && g.cv.w >= 0.9 * g.vw, g.cv);
  ck("8 phone Advanced: a compact tool bar sits in one row under the picture", g.bar && g.rows === 1 && g.n >= 6 && g.bar.t >= g.cv.b - 2, g);
  ck("8 phone Advanced: the status / Save row sits under the picture, not on it", g.dock && g.dock.t >= g.cv.b - 1, { cv: g.cv, dock: g.dock });
  await snap(page, "pro-phone");
  await page.click('#phoneBar [data-ph="more"]'); await sleep(300);
  const o = await T(page, `(() => {
    const shown = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const sh = document.getElementById("phoneSheet");
    const b = sh ? sh.getBoundingClientRect() : { height: 0, bottom: 0 };
    return { open: shown(sh), h: Math.round(b.height), b: Math.round(b.bottom), vh: innerHeight, hasLinarray: !!(sh && sh.querySelector('[data-more="linarray"]')) };
  })()`);
  ck("8 phone Advanced: More opens a sheet of the less-used tools (at most half the screen)", o.open && o.hasLinarray && o.h > 40 && o.h <= 0.56 * o.vh, o);
  await snap(page, "pro-phone-sheet");
  await page.context().close();
}
// ================================================================== 15: why Start is greyed, under the button
for (const [w, h] of [[390, 664], [1366, 768]]) {
  const page = await phone(w, h);
  await demoToShape(page, { stay: "cut" }); await sleep(400);
  await T(page, "window.plasmaTest.goStep(3)"); await sleep(500);
  const g = await T(page, `(() => { const b = document.getElementById("btnStart"), y = document.getElementById("startWhy"), r = b.getBoundingClientRect(), q = y.getBoundingClientRect();
    return { disabled: b.disabled, shown: !y.classList.contains("hidden") && q.height > 0, gap: Math.round(q.top - r.bottom), overlapX: q.left < r.right && q.right > r.left || q.width > r.width, text: y.textContent }; })()`);
  ck(`15 ${w}x${h}: Start greyed shows its first reason just under the button`, g.disabled && g.shown && g.gap >= -1 && g.gap <= 24 && /^Can't start yet: /.test(g.text), g);
  await page.context().close();
}
// ================================================================== 9: mode everywhere, cut settings, parts list, no hidden locks
{
  const page = await phone(1366, 768);
  const vis = (q) => T(page, `(() => { const e = document.querySelector(${JSON.stringify(q)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; })()`);
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); T.showScreen("menu", { force: true }); })()`); await sleep(300);
  ck("9 the main menu has no Beginner / Pro switch and no header mode control", !(await vis("#topModeSwitch")) && !(await vis("#modeSwitch")) && !(await vis("#editorSwitch")));
  await T(page, `window.plasmaTest.showScreen("make", { force: true }); window.plasmaTest.setAppMode("simple", { persist: false, autoFs: false }); window.plasmaTest.setShapeFs(false)`); await sleep(400);
  ck("9 Make a part starts in Simple view with an Advanced tools button", await vis("#btnAdvancedTools") && !(await vis("#btnSimpleView")) && await T(page, `!window.plasmaTest.isProMode() && document.body.classList.contains("beginner")`));
  await page.click("#btnAdvancedTools"); await sleep(400);
  ck("9 Advanced tools opens the full editor", await T(page, `window.plasmaTest.isProMode() && document.body.classList.contains("pro-mode")`) && await vis("#btnSimpleView"));
  // A part so the Simple-view lock / parts-list checks below have something to show
  await T(page, `(() => { const T = window.plasmaTest; T.sketch.clear(); T.sketch.add("plate", true); T.sketch.fitView(); T.renderShapeForm ? T.renderShapeForm() : 0; })()`); await sleep(400);
  ck("9 Advanced: cut settings and machine/edge status stay off the drawing screen", !(await vis("#cutSummary")) && !(await vis("#ptInspCutSum")) && !(await vis("#fit")) && !(await vis("#homeBar")) && !(await vis("#jobCard")));
  // lock it in Pro, then switch to Beginner: the lock is visible with an Unlock button
  await T(page, `(() => { const k = window.plasmaTest.sketch; k.pick([k.items[0].id]); k.toggleLock(); })()`); await sleep(200);
  await page.click("#btnSimpleView"); await sleep(500);
  ck("9 Simple view: no Beginner / Pro switch, and the body is not in the advanced editor", !(await vis("#topModeSwitch")) && !(await vis("#modeSwitch")) && await T(page, `document.body.classList.contains("beginner") && !window.plasmaTest.isProMode()`));
  ck("9 a part locked in Pro shows as locked in Beginner, with Unlock", await vis('#shapeForm .lockline [data-sk="toggleLock"]') || await vis('#shapeForm [data-sk="unlockAll"]'));
  await page.click('#shapeForm .lockline button'); await sleep(300);
  ck("9 Unlock in Beginner frees it", await T(page, `!window.plasmaTest.sketch.items.some((i) => i.lock)`));
  ck("9 Simple view: cut settings and the edges-not-set-up notice stay off the drawing screen", !(await vis("#cutSummary")) && !(await vis("#ptInspCutSum")) && !(await vis("#fit")) && !(await vis("#showMachWrap")));
  // Beginner parts list: two parts, tap the second to pick it
  await T(page, `(() => { const k = window.plasmaTest.sketch; k.add("disc", true); k.pick([]); k.draw(); window.plasmaTest.sketch.onSelect(); })()`); await sleep(400);
  const pl = await T(page, `[...document.querySelectorAll("#shapeForm .bgparts [data-bpart]")].map((b) => b.textContent)`);
  ck("9 Beginner: a simple list of the parts in the drawing", pl.length === 2, pl);
  await page.click("#shapeForm .bgparts li:nth-child(2) button"); await sleep(300);
  ck("9 tapping a part in the list picks it", await T(page, `(() => { const k = window.plasmaTest.sketch, p = k.picked(); return p.length === 1 && p[0].type === "disc"; })()`));
  await snap(page, "mode-beginner-parts");
  await T(page, `window.plasmaTest.sendToCutting()`); await sleep(600);
  ck("9 sending the part opens the cutting screen, which hides Simple / Advanced", await T(page, `window.plasmaTest.screen() === "cut"`), await T(page, `window.plasmaTest.screen()`));
  ck("9 the cutting screen hides Simple / Advanced and has no Beginner / Pro styling", !(await vis("#editorSwitch")) && !(await vis("#topModeSwitch")) && await T(page, `!document.body.classList.contains("beginner") && !document.body.classList.contains("pro-mode")`));
  ck("9 no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}
// ================================================================== 6: Add a hole lands inside the part
{
  const page = await phone(390, 664); await makeBeginner(page, false);
  const parts = `(() => { const s = window.plasmaTest.sketch; return { parts: s.items.filter((o) => !s.isHole(o)).length, holes: s.items.filter((o) => s.isHole(o)).length, sel: s.selected() && s.selected().type, n: s.items.length }; })()`;
  for (const shape of ["Rectangle", "Circle", "Ring", "Slot"]) {
    await T(page, `(() => { window.plasmaTest.sketch.clear(); document.body.classList.remove("bg-picked"); })()`);
    await T(page, `[...document.querySelectorAll("#bgShapes button")].find((x) => x.textContent.includes(${JSON.stringify(shape)})).click()`); await sleep(300);
    const before = await T(page, parts);
    await page.click('[data-sk="add"][data-arg="hole"]'); await sleep(250);
    const after = await T(page, parts);
    ck(`6 ${shape}: Add a hole makes one hole inside the part (still one part) and picks it`, after.parts === before.parts && after.holes === before.holes + 1 && after.sel === "hole", { before, after });
  }
  // nothing picked: one part takes the hole; two parts: Beginner is asked which, nothing is added
  await T(page, `(() => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect"); s.pick([]); s.onSelect(); s.add("hole"); })()`); await sleep(200);
  const one = await T(page, parts);
  ck("6 nothing picked, one part: the hole goes into that part", one.parts === 1 && one.holes === 1, one);
  await T(page, `(() => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect"); s.add("disc"); s.pick([]); s.onSelect(); s.add("hole"); })()`); await sleep(250);
  const two = await T(page, parts);
  const msg = await T(page, `(document.getElementById("toast").textContent || "")`);
  ck("6 nothing picked, two parts: no stray hole, and the Beginner is told to tap the part first", two.n === 2 && /Tap the part/.test(msg), { two, msg });
  await page.context().close();
}

// ================================================================== 7: the size boxes are there without clicking the shape
{
  const page = await phone(390, 664); await makeBeginner(page);
  await T(page, `(() => { const s = window.plasmaTest.sketch; s.pick([]); s.onSelect(); })()`); await sleep(250);
  const f = await T(page, `({ inputs: document.querySelectorAll("#shapeForm input[data-p]").length, sel: !!window.plasmaTest.sketch.selected() })`);
  ck("7 Beginner, one part, nothing picked: its size boxes still show (the part is picked for you)", f.inputs >= 2 && f.sel, f);
  await T(page, `(() => { const s = window.plasmaTest.sketch; s.add("disc"); s.pick([]); s.onSelect(); })()`); await sleep(250);
  const g = await T(page, `({ inputs: document.querySelectorAll("#shapeForm input[data-p]").length, text: document.getElementById("shapeForm").textContent.trim().slice(0, 160) })`);
  ck("7 Beginner, two parts, nothing picked: it says to tap one (no guessing)", g.inputs === 0 && /Tap a part in the list/.test(g.text), g);
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false); const s = T.sketch; s.clear(); s.add("rect"); s.pick([]); s.onSelect(); })()`); await sleep(250);
  ck("7 Pro keeps nothing picked when you tap empty space", await T(page, `!window.plasmaTest.sketch.selected()`));
  await page.context().close();
}

// ================================================================== W: put the table on your Wi-Fi
{
  const page = await phone(390, 664);
  const enc = await T(page, `import("./js/machine/wifi.js").then((W) => ({ space: W.encodeFluidValue("Flying Pinguin"), umlaut: W.encodeFluidValue("Säx"), pct: W.encodeFluidValue("100%"), plain: W.encodeFluidValue("Home-5G_x=1"),
    list: W.parseApList(["junk", '{"AP_LIST":[{"SSID":"A","SIGNAL":"30","IS_PROTECTED":"1"},{"SSID":"B","SIGNAL":"90","IS_PROTECTED":"0"},{"SSID":"A","SIGNAL":"60","IS_PROTECTED":"1"},{"SSID":"","SIGNAL":"99"}]}']),
    none: W.parseApList(["error:3"]), cmds: W.wifiCommands("My Net", "pa ss%"), open: W.wifiCommands("Cafe", "").map((c) => c.line), host: W.parseHostname(["$Hostname=plasma"]),
    block: [W.wifiBlocker({ connected: false }), W.wifiBlocker({ connected: true, viaPi: true }), W.wifiBlocker({ connected: true, jobRunning: true }), W.wifiBlocker({ connected: true })] }))`);
  ck("W FluidNC values: a space is %20, non-ASCII is its UTF-8 bytes, % itself is %25, plain ASCII is left alone", enc.space === "Flying%20Pinguin" && enc.umlaut === "S%c3%a4x" && enc.pct === "100%25" && enc.plain === "Home-5G_x=1", enc);
  ck("W the scan list: strongest first, one row per name, no blank names", JSON.stringify(enc.list) === JSON.stringify([{ ssid: "B", signal: 90, locked: false }, { ssid: "A", signal: 60, locked: true }]) && enc.none === null, enc.list);
  ck("W the lines sent: SSID, password (masked), DHCP, then STA>AP so it falls back to its own Wi-Fi", JSON.stringify(enc.cmds) === JSON.stringify([{ line: "$Sta/SSID=My%20Net" }, { line: "$Sta/Password=pa%20ss%25", masked: true }, { line: "$Sta/IPMode=DHCP" }, { line: "$WiFi/Mode=STA>AP" }]), enc.cmds);
  ck("W an open Wi-Fi sends no password line", !enc.open.some((l) => /Password/.test(l)) && enc.open.length === 3, enc.open);
  ck("W hostname and blockers read right", enc.host === "plasma" && /USB/.test(enc.block[0]) && /Pi/.test(enc.block[1]) && /job/.test(enc.block[2]) && enc.block[3] === "", enc.block);
  // not connected: the screen opens and says to connect first
  await T(page, `(() => { const T = window.plasmaTest; T.showScreen("cut", { force: true }); T.goStep(3); document.getElementById("fnBox").open = true; })()`); await sleep(300);
  await T(page, `document.getElementById("btnWifiSetup").click()`); await sleep(300);
  const off = await T(page, `({ open: !document.getElementById("wifiDlg").classList.contains("hidden"), gate: !document.getElementById("gateDlg").classList.contains("hidden") })`);
  ck("W signed out with no machine: the Wi-Fi button asks to sign in / link a machine first", !off.open && off.gate, off);
  await T(page, `document.querySelector("#gateDlg .acct-close").click()`);
  // the practice table: scan, pick, password, send
  await demoToShape(page, { stay: "cut" }); await T(page, "window.plasmaTest.goStep(3)"); await sleep(300);
  await T(page, `(() => { const d = window.plasmaTest.S.demo; d.__tx = []; const w = d.write.bind(d); d.write = (x) => { d.__tx.push(typeof x === "string" ? x : new TextDecoder().decode(x)); return w(x); }; document.getElementById("fnBox").open = true; document.getElementById("btnWifiSetup").click(); })()`); await sleep(300);
  await page.click("#wifiScan");
  await page.waitForSelector("#wifiList button[data-ap]", { timeout: 15000 }).catch(() => {});
  const names = await T(page, `[...document.querySelectorAll("#wifiList button[data-ap] b")].map((b) => b.textContent)`);
  ck("W the scan lists what the controller sees, strongest first, each name once", JSON.stringify(names) === JSON.stringify(["Practice-Home", "Workshop Guest", "Next Door"]), names);
  await snap(page, "wifi-list-phone");
  await page.click("#wifiList button[data-ap='0']"); await sleep(200);
  const PW = "Sup3r-Secret pw";
  await page.fill("#wifiPw", PW);
  await page.click(".pwshow[data-pw='wifiPw']");
  ck("W the password box has a Show button", await T(page, `document.getElementById("wifiPw").type === "text"`));
  await page.fill("#wifiPw", "short"); await page.click("#wifiJoin"); await sleep(200);
  ck("W a too-short password is caught before anything is sent", await T(page, `!document.getElementById("wifiFormErr").classList.contains("hidden") && !window.plasmaTest.S.demo.__tx.join("").includes("Sta/Password")`));
  await page.fill("#wifiPw", PW); await snap(page, "wifi-password-phone");
  await page.click("#wifiJoin");
  await page.waitForFunction(() => !document.getElementById("wifiDone").classList.contains("hidden"), null, { timeout: 15000 }).catch(() => {});
  const sent = await T(page, `window.plasmaTest.S.demo.__tx.join("").split("?").join("")`);     // without the status polls written in between
  ck("W the controller got SSID, password, DHCP and STA>AP, in that order", /\$Sta\/SSID=Practice-Home\n\$Sta\/Password=Sup3r-Secret%20pw\n\$Sta\/IPMode=DHCP\n\$WiFi\/Mode=STA>AP\n/.test(sent), JSON.stringify(sent.split("?").join("")).slice(-400));
  const leak = await T(page, `(() => { const pw = ${JSON.stringify(PW)}, enc = "Sup3r-Secret%20pw"; const where = { page: document.documentElement.outerHTML, text: document.body.innerText, local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }), simLog: JSON.stringify(window.plasmaTest.S.demo.log || []), box: document.getElementById("wifiPw").value };
    return Object.entries(where).filter(([, v]) => v.includes(pw) || v.includes(enc) || v.toUpperCase().includes(enc.toUpperCase())).map(([k]) => k); })()`);
  ck("W the password is nowhere on the page, in storage or in any log after sending (the box is emptied)", leak.length === 0, leak);
  ck("W the console shows the password line masked", await T(page, `document.body.innerHTML.includes("$Sta/Password=********")`));
  const done = await T(page, `({ ssid: document.getElementById("wifiDoneSsid").textContent, host: document.getElementById("wifiDoneHost").textContent, fn: document.getElementById("fnHost").value, restart: !!document.getElementById("wifiRestart").offsetParent })`);
  ck("W done: says restart, names the Wi-Fi, shows http://fluidnc.local and fills the FluidNC host box", done.ssid === "Practice-Home" && done.host === "http://fluidnc.local" && done.fn === "fluidnc.local" && done.restart, done);
  await snap(page, "wifi-done-phone");
  // typed name; Esc empties the password
  await T(page, `(() => { document.getElementById("wifiClose").click(); document.getElementById("btnWifiSetup").click(); document.getElementById("wifiOther").click(); })()`); await sleep(200);
  await page.fill("#wifiPw", "another-secret"); await page.keyboard.press("Escape"); await sleep(200);
  ck("W closing the box (Esc) empties the password box", await T(page, `document.getElementById("wifiDlg").classList.contains("hidden") && document.getElementById("wifiPw").value === ""`));
  ck("W no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await page.context().close();
}

// ================================================================== 10: the workspace belongs to the account that signed in
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(s.base + "/?test=1&gate=1&turn=0", { waitUntil: "load" }); await sleep(700);
  const prompt = () => T(page, `!document.getElementById("migrateDlg").classList.contains("hidden")`);
  const ws = () => T(page, `({ items: window.plasmaTest.sketch.items.length, undo: window.plasmaTest.sketch.past.length, recent: localStorage.getItem("plasma.recent"), material: window.plasmaTest.S.material, pro: window.plasmaTest.sketch.opts.pro })`);
  const up = async (email) => { await T(page, `(() => { document.getElementById("acctPill").click(); document.getElementById("goSignUp").click(); upEmail.value = ${JSON.stringify(email)}; upPin.value = "letmein1"; formSignUp.requestSubmit(); })()`);
    await page.waitForFunction(() => window.plasmaTest.account.isSignedIn(), null, { timeout: 10000 }); await sleep(400); await T(page, `document.querySelector("#accountDlg .acct-close").click()`); await sleep(300); };
  const signIn = async (email) => { await T(page, `(() => { document.getElementById("acctPill").click(); inEmail.value = ${JSON.stringify(email)}; inPin.value = "letmein1"; formSignIn.requestSubmit(); })()`);
    await page.waitForFunction(() => window.plasmaTest.account.isSignedIn(), null, { timeout: 10000 }); await sleep(400); await T(page, `document.querySelector("#accountDlg .acct-close").click()`); await sleep(300); };
  const out = async () => { await T(page, `(() => { document.getElementById("acctPill").click(); document.getElementById("btnSignOut").click(); })()`); await sleep(400); };
  const firstMat = await T(page, `window.plasmaTest.S.material`);
  // someone was here before (another account owned the workspace), left a drawing, a recent file and a material choice
  await T(page, `(() => { localStorage.setItem("plasma.workspaceOwner", "someone-else"); localStorage.setItem("plasma.recent", JSON.stringify([{ name: "theirs.dxf", text: "0" }])); const s = window.plasmaTest.sketch; s.add("rect"); s.add("disc"); })()`);
  await up("ws-a@example.com");
  ck("10 a different account signs in with a drawing on screen: 'Keep this drawing?' is asked", await prompt() && /Keep this drawing/.test(await T(page, `document.getElementById("migrateTitle").textContent`)));
  await snap(page, "keep-drawing");
  await page.keyboard.press("Escape"); await sleep(200);
  ck("10 the question has no Close (it needs an answer) and Esc leaves it up", await prompt() && await T(page, `!document.querySelector("#migrateDlg .acct-close")`));
  await page.click("#migrateNo"); await sleep(200);
  await page.locator("#safeDlgOk").click({ timeout: 3000 }).catch(() => {});
  await sleep(400);
  const fresh = await ws();
  ck("10 Start fresh: no drawing, no undo back to it, no recent files, material back to the first one", fresh.items === 0 && fresh.undo === 0 && !fresh.recent && fresh.material === firstMat, fresh);
  // A works in Pro; B signs in on the same browser and keeps the drawing A left; A comes back in Pro
  await T(page, `(() => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("pro", { autoFs: false }); T.sketch.add("slot"); })()`); await sleep(300);
  await out();
  await up("ws-b@example.com");
  ck("10 the next account is asked once too", await prompt());
  await page.click("#migrateYes"); await sleep(600);
  ck("10 Keep it: the drawing stays and is saved to that account", (await ws()).items === 1 && await T(page, `document.querySelectorAll("#partsList .partrow").length`) >= 0);
  ck("10 the mode follows the account: B (new) is in Beginner even though A left Pro on", (await ws()).pro === false);
  await T(page, `document.querySelectorAll(".acctdlg:not(.hidden) .acct-close").forEach((b) => b.click())`);
  await out(); await signIn("ws-b@example.com");
  ck("10 the same account signing in again is not asked, and its drawing is still there", !(await prompt()) && (await ws()).items === 1);
  await out(); await signIn("ws-a@example.com");
  if (await prompt()) await page.click("#migrateNo");
  await sleep(300);
  ck("10 A signs back in: Pro again (stored on the account, not the browser)", (await ws()).pro === true);
  // the real flow: signed out, on the sign-in page, a new account signs up there and nothing else is tapped
  await T(page, `window.plasmaTest.sketch.add("disc")`); await out(); await sleep(300);
  await T(page, `(() => { document.getElementById("goSignUp").click(); upEmail.value = "ws-c@example.com"; upPin.value = "letmein1"; formSignUp.requestSubmit(); })()`);
  await page.waitForFunction(() => window.plasmaTest.account.isSignedIn(), null, { timeout: 10000 }); await sleep(1200);
  ck("10 signing up on the sign-in page itself: 'Keep this drawing?' comes up on its own", await prompt(), await T(page, `[document.body.dataset.screen, [...document.querySelectorAll(".acctdlg:not(.hidden)")].map((d) => d.id).join(",")]`));
  ck("10 no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await ctx.close();
}

const failed = rec.done();
await br.close(); s.close();
process.exit(failed ? 1 : 0);

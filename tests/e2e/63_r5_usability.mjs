// Round 5 stage 2 (USABILITY) tests. Takes the r5-use-*.png screenshots.
//  L  phone on its side: sign-in fits, Settings scrolls with Close / Save in reach, the toast never covers Start, slim Start row
//  16 touch targets on the phone cutting screen are at least 44 px, text at least 13-14 px
//  6  Add a hole lands inside the part (even a ring), is picked; with several parts and none picked, Beginner is asked which
//  5  Beginner Make a part: the picture fills the free space (phone, phone on its side, laptop), a draggable divider, Zoom to fit, Expand picture, scroll zoom
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
  return { grid: r(".cutgrid"), pane: r(".previewPane"), cv: r("#preview"), dock: r(".previewDock"), step: r(".stepPane"), split: r("#makeSplit"), tools: r("#picTools"), modesw: r("#modeSwitch"), title: r("#ghTitle") }; })()`);
{ // phone portrait
  const page = await phone(390, 664); await makeBeginner(page);
  const g = await geom(page);
  ck("5 phone: the picture gets at least 55% of the Make a part pane", g.pane.h >= 0.55 * g.grid.h, g);
  ck("5 phone: the status / Save / Download row sits under the picture, not over it", g.dock.t >= g.cv.b - 1, g);
  ck("5 phone: Zoom to fit and Expand picture sit over the picture, 44 px each", g.tools.t >= g.cv.t && g.tools.h >= 44 && g.tools.b <= g.cv.b, g);
  ck("5 phone: no divider on a phone", !g.split.w, g);
  await snap(page, "make-phone");
  await page.context().close();
}
{ // phone on its side
  const page = await phone(750, 340); await makeBeginner(page);
  const g = await geom(page);
  ck("5 750x340: the picture is the wider column and at least 140 px tall", g.cv.w > g.step.w && g.cv.h >= 140, g);
  ck("5 750x340: the Beginner / Pro switch is on screen, beside the step title, not over it", g.modesw.r <= 751 && g.modesw.t >= 0 && (g.modesw.l >= g.title.r || g.modesw.t >= g.title.b), g);
  await snap(page, "make-750x340");
  await page.context().close();
}
{ // laptop: the picture takes the free right side; drag the divider; arrows; remembered; fit; expand; scroll zoom
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
  // Zoom to fit after zooming in; scroll zooms
  const s0 = await T(page, `window.plasmaTest.sketch.view.s`);
  await page.mouse.move(g6.cv.l + g6.cv.w / 2, g6.cv.t + g6.cv.h / 2); await page.mouse.wheel(0, -400); await sleep(250);
  const s1 = await T(page, `window.plasmaTest.sketch.view.s`);
  ck("5 laptop: scrolling over the picture zooms in", s1 > s0 * 1.05, { s0, s1 });
  await page.click("#btnPicFit"); await sleep(200);
  ck("5 laptop: Zoom to fit shows the whole part again", Math.abs(await T(page, `window.plasmaTest.sketch.view.s`) - s0) < s0 * 0.02);
  await page.click("#btnPicFs"); await sleep(400);
  const fs1 = await T(page, `({ fs: document.body.classList.contains("shape-fs"), cv: Math.round(document.getElementById("preview").getBoundingClientRect().width), done: !!document.getElementById("fsDone").offsetParent, expandShown: !!document.getElementById("btnPicFs").offsetParent })`);
  ck("5 laptop: Expand picture opens the big picture (with its Done button), and hides itself", fs1.fs && fs1.cv > g6.cv.w && fs1.done && !fs1.expandShown, fs1);
  await snap(page, "make-laptop-expanded");
  await page.click("#fsDone"); await sleep(400);
  ck("5 laptop: Done brings the controls back", await T(page, `!document.body.classList.contains("shape-fs") && !!document.getElementById("bgChange").offsetParent`));
  // Pro is unchanged: no divider, no Beginner picture buttons
  await T(page, `window.plasmaTest.setAppMode("pro", { persist: false, autoFs: false }); window.plasmaTest.setShapeFs(false)`); await sleep(400);
  ck("5 laptop: Pro keeps its own layout (no Beginner divider or picture buttons)", await T(page, `!document.getElementById("makeSplit").offsetParent && !document.getElementById("picTools").offsetParent`));
  ck("5 laptop: no page errors", noErrors(page).length === 0, noErrors(page).join("|"));
  await ctx.close();
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

const failed = rec.done();
await br.close(); s.close();
process.exit(failed ? 1 : 0);

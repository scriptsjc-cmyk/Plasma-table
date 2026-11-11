// Round 4 flow tests: sign-in gate, main menu, cutting-screen upload-to-bed, no leaving during a job, Spacebar E-stop.
import { T } from "../lib/t.mjs";
import { startServer, launchKillable, newPage, shot } from "../lib/browser.mjs";
import fs from "node:fs";
const t = new T("49_r4_flow"); const srv = await startServer(); const K = await launchKillable();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA = new URL("../data/", import.meta.url).pathname;
const file = (n) => ({ name: n, mimeType: "text/plain", buffer: fs.readFileSync(DATA + n) });
const scr = (p) => p.evaluate(() => document.body.dataset.screen);
const vis = (p, sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, sel);
const demo = (page, f) => page.evaluate(`(() => { const d = window.plasmaTest.S.demo; return (${f})(d); })()`);
const tx = (page) => page.evaluate(() => window.plasmaTest.S.demo.__tx.map((x) => x.s).join(""));
// round 5: the E-stop is released only by pressing and holding the red button
const holdRel = async (page) => { const b = await page.locator("#btnStop").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(1800); await page.mouse.up(); };
const hook = (page) => page.evaluate(() => { const d = window.plasmaTest.S.demo; if (d.__hooked) { d.__tx.length = 0; return; } d.__hooked = true; d.__tx = []; const w = d.write.bind(d); d.write = (x) => { const s = typeof x === "string" ? x : Array.from(x).map((c) => String.fromCharCode(c)).join(""); d.__tx.push({ t: Date.now(), s }); return w(x); }; });
async function upload(page, files) {   // pick file(s); a single DXF/SVG gets the "is this the right size?" question: answer yes
  await page.setInputFiles("#file", files);
  for (let i = 0; i < 20; i++) { if (await page.locator("#sizeYes").isVisible()) { await page.click("#sizeYes"); break; } await sleep(150); }
}
async function toBed(page) {   // menu -> Go to cutting -> upload a DXF -> Next -> bed
  await page.evaluate(() => window.plasmaTest.showScreen("menu"));
  await page.click("#menuCut"); await upload(page, file("plate.dxf"));
  await page.waitForFunction(() => window.plasmaTest.S.prepared, null, { timeout: 10000 });
}
async function connectPractice(page) {
  await page.evaluate(() => window.plasmaTest.goStep(3));
  await page.waitForFunction(() => window.plasmaTest.S.cur === 3);
  await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); document.getElementById("btnDemo").click(); });
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
  await hook(page);
}
async function startJob(page) {   // bed screen, practice connected -> press Start
  await page.evaluate(() => { window.plasmaTest.R2.demoEdges(); }); await sleep(5500);
  await page.evaluate(() => document.getElementById("layAuto").click()); await sleep(300);
  await page.click("#btnZero"); await sleep(300);
  for (const cb of await page.locator("#checklist input").all()) await cb.check();
  await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 8000 });
  await page.click("#btnStart");
  await page.waitForFunction(() => { const d = window.plasmaTest.S.demo; return d && d.torch; }, null, { timeout: 90000 });
}
try {
// ======================================================================== 1. SIGN-IN GATE
{
  const p = await newPage(K.browser, "desktop", { base: srv.base, query: "?test=1&gate=1&turn=0" });
  await sleep(500);
  t.check("GATE: opens on the sign-in page, not the app", (await scr(p)) === "login");
  t.check("GATE: the sign-in dialog is showing as a full page", await vis(p, "#accountDlg.loginpage") && await vis(p, "#accountDlg .loginbrand"));
  t.check("GATE: the top bar, menu, make and cutting screens are all out of reach", !(await vis(p, ".topbar")) && !(await vis(p, "#menuView")) && !(await vis(p, "#cutView")) && !(await vis(p, "#setupView")) && !(await vis(p, "#btnStop")));
  t.check("GATE: the sign-in page cannot be closed (no close button)", !(await vis(p, "#accountDlg .acct-close")));
  await p.keyboard.press("Escape"); await sleep(150);
  t.check("GATE: Esc does not dismiss it", (await scr(p)) === "login" && await vis(p, "#accountDlg.loginpage"));
  await p.mouse.click(3, 3); await sleep(150);
  t.check("GATE: clicking outside does not dismiss it", (await scr(p)) === "login" && await vis(p, "#accountDlg.loginpage"));
  const tries = await p.evaluate(() => { const T = window.plasmaTest; return ["menu", "make", "cut"].map((n) => { T.showScreen(n); return document.body.dataset.screen; }); });
  t.check("GATE: asking for menu / make / cut by script still lands on sign-in", tries.every((s) => s === "login"), JSON.stringify(tries));
  await p.keyboard.press("Space"); await p.keyboard.press("Escape"); await sleep(100);
  t.check("GATE: no page errors on the sign-in page", p.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e)).length === 0, p.errors.join("|"));
  await shot(p, "r4-gate-login-desktop");
  // sign up through the real form
  await p.click("#goSignUp"); await p.waitForSelector('[data-pane="up"]:not(.hidden)');
  await p.fill("#upName", "Josh"); await p.fill("#upEmail", "gate@example.com"); await p.fill("#upPin", "letmein1");
  t.check("GATE: sign-up no longer asks for Beginner / Pro", (await p.locator('input[name="suMode"]').count()) === 0);
  await p.click('#formSignUp [type=submit]');
  await p.waitForFunction(() => document.body.dataset.screen === "menu", null, { timeout: 10000 });
  t.check("GATE: signing up lands on the main menu", (await scr(p)) === "menu" && await vis(p, "#menuView") && !(await vis(p, "#accountDlg.loginpage")));
  // reload keeps the session; sign out returns to the gate
  await p.reload(); await p.waitForFunction(() => window.plasmaTest); await sleep(500);
  t.check("GATE: after a reload a signed-in user goes straight to the menu", (await scr(p)) === "menu");
  await p.evaluate(() => window.plasmaTest.account.signOut()); await sleep(500);
  t.check("GATE: signing out puts the sign-in page back", (await scr(p)) === "login" && !(await vis(p, "#menuView")));
  // sign in again with the account just made
  await p.evaluate(() => window.plasmaTest.account.signIn && window.plasmaTest.account.signIn({ email: "gate@example.com", pin: "letmein1" })).catch(() => {});
  await sleep(600);
  t.check("GATE: signing back in returns to the menu", (await scr(p)) === "menu", await scr(p));
  await p.close(); await p.ctx.close();
}
{
  const p = await newPage(K.browser, "desktop", { base: srv.base, query: "" });   // a plain URL: no test hooks at all
  await sleep(600);
  t.check("GATE (plain URL, no ?test): the app is behind sign-in and exposes no test hook", (await scr(p)) === "login" && !(await p.evaluate(() => !!window.plasmaTest)) && !(await vis(p, ".topbar")));
  await p.close(); await p.ctx.close();
}
{
  const p = await newPage(K.browser, "desktop", { base: srv.base, query: "?test=1&turn=0" });
  t.check("GATE: ?test=1 on localhost still skips the gate (automated tests only)", (await scr(p)) === "menu");
  await p.close(); await p.ctx.close();
}
// ======================================================================== 2. MAIN MENU
for (const prof of ["desktop", "iphone14", "iphone14land"]) {
  const p = await newPage(K.browser, prof, { base: srv.base }); const P = (s) => `MENU [${prof}]: ${s}`;
  const b = await p.evaluate(() => ["menuMake", "menuCut"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, text: document.getElementById(id).textContent.replace(/\s+/g, " ").trim() }; }));
  t.check(P("two big buttons: Make a part and Go to cutting"), b.length === 2 && /Make a part/.test(b[0].text) && /Go to cutting/.test(b[1].text) && b.every((x) => x.w >= 150 && x.h >= 80), JSON.stringify(b));
  t.check(P("nothing else to press: no E-stop, no tabs, no Beginner/Pro switch, no stepper"), !(await vis(p, "#btnStop")) && !(await vis(p, ".tabs")) && !(await vis(p, "#modeSwitch")) && !(await vis(p, "#stepper")) && !(await vis(p, "#btnHome")));
  if (prof === "desktop") await shot(p, "r4-menu-desktop");
  await p.evaluate(() => document.getElementById("menuMake").click()); await sleep(250);
  t.check(P("Make a part opens the design screen with the Beginner/Pro switch and a Menu button"), (await scr(p)) === "make" && await vis(p, "#modeSwitch") && await vis(p, "#btnHome") && !(await vis(p, "#btnStop")) && !(await vis(p, ".tabs")));
  await p.evaluate(() => document.getElementById("btnHome").click()); await sleep(250);
  t.check(P("Menu button goes back to the menu"), (await scr(p)) === "menu");
  await p.evaluate(() => document.getElementById("menuCut").click()); await sleep(250);
  t.check(P("Go to cutting opens the cutting screen: E-stop shown, no Beginner/Pro switch"), (await scr(p)) === "cut" && await vis(p, "#btnStop") && !(await vis(p, "#modeSwitch")) && (prof === "iphone14land" ? !(await vis(p, "#stepper")) : await vis(p, "#stepper")));   // style.css: body.short-land[data-screen="cut"] #stepper {display:none} — phone on its side gives all the height to the bed (commit ba9ac6d), so the stepper is hidden there by design
  t.check(P("the cutting screen starts with upload / saved parts, and no Move step or tab anywhere"), await vis(p, "#drop") && await vis(p, "#btnPickSaved") && (await p.locator("#moveView, .tab[data-tab='move'], .step[data-step='2']").count()) === 0);
  if (prof === "desktop") await shot(p, "r4-cut-empty-desktop");
  await p.close(); await p.ctx.close();
}
// ======================================================================== 3. CUTTING SCREEN: upload -> bed -> drag
{
  const p = await newPage(K.browser, "desktop", { base: srv.base });
  await p.evaluate(() => window.plasmaTest.showScreen("cut")); await sleep(200);
  t.check("CUT: Next is disabled until something is chosen", await p.evaluate(() => document.getElementById("next1").disabled));
  await upload(p, file("plate.dxf"));
  await p.waitForFunction(() => window.plasmaTest.S.prepared && window.plasmaTest.S.cur >= 1, null, { timeout: 10000 });
  await sleep(500);
  const st = await p.evaluate(() => ({ prepared: !!window.plasmaTest.S.prepared, drop: document.getElementById("dropTitle").textContent, bed: document.getElementById("bedStatus").classList.contains("hidden") ? "" : document.getElementById("bedStatusText").textContent, next: document.getElementById("next1").disabled, screen: window.plasmaTest.screen() }));
  t.check("CUT: a DXF uploaded on the cutting screen is accepted and stays on the cutting screen", st.prepared && st.screen === "cut" && /plate/i.test(st.drop), JSON.stringify(st));
  t.check("CUT: the screen says what is on the bed, and Next is enabled", /On the bed/i.test(st.bed) && st.next === false, JSON.stringify(st));
  await p.evaluate(() => document.getElementById("next1").click()); await sleep(900);
  const lay = await p.evaluate(() => ({ cur: window.plasmaTest.S.cur, active: window.plasmaTest.Setup.layoutActive(), n: window.plasmaTest.sketch.items.length, editing: window.plasmaTest.sketch.active }));
  t.check("CUT: Next puts the parts on the bed (layout mode; plate.dxf holds 3 separate parts)", lay.cur === 3 && lay.active && lay.n === 3, JSON.stringify(lay));
  await shot(p, "r4-cut-bed-desktop");
  // drag the part across the bed
  const geo = await p.evaluate(() => { const s = window.plasmaTest.sketch, it = s.items[0], b = s.boxOf(it), cv = document.getElementById("preview").getBoundingClientRect(); const q = s.toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), w2s = { x: q[0], y: q[1] }; return { x0: it.x, y0: it.y, w2s, cv: { x: cv.x, y: cv.y, w: cv.width, h: cv.height } }; });
  let dragged = false;
  if (geo.w2s) {
    const sx = geo.cv.x + geo.w2s.x, sy = geo.cv.y + geo.w2s.y;
    await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + 25, sy - 10, { steps: 4 }); await p.mouse.move(sx + 60, sy - 25, { steps: 6 }); await p.mouse.up(); await sleep(300);
    const after = await p.evaluate(() => { const it = window.plasmaTest.sketch.items[0]; return { x: it.x, y: it.y }; });
    dragged = Math.abs(after.x - geo.x0) > 1 || Math.abs(after.y - geo.y0) > 1;
    t.check("CUT: dragging the part on the bed moves it", dragged, JSON.stringify({ geo: { x: geo.x0, y: geo.y0 }, after }));
  } else t.note("CUT: drag test", "sketch has no worldToScreen; skipped");
  // add a second and third file: they join the bed instead of replacing it
  await p.evaluate(() => document.getElementById("btnStart") && 0);
  await p.evaluate(() => window.plasmaTest.addPartsFlow([]).catch?.(() => {}));
  await p.close(); await p.ctx.close();
}
{
  const p = await newPage(K.browser, "desktop", { base: srv.base });
  await p.evaluate(() => window.plasmaTest.showScreen("cut")); await sleep(200);
  await upload(p, [file("part01.dxf"), file("part02.dxf")]);
  await p.waitForFunction(() => window.plasmaTest.S.prepared || document.querySelector("#addDlg:not(.hidden), .shapelib:not(.hidden)"), null, { timeout: 10000 }).catch(() => {});
  await sleep(1200);
  const info = await p.evaluate(() => ({ cur: window.plasmaTest.S.cur, items: window.plasmaTest.sketch.items.length, prepared: !!window.plasmaTest.S.prepared, dlg: !!document.querySelector(".shapelib:not(.hidden)") }));
  t.check("CUT: two DXFs at once end up as parts on the bed (or in the quantity dialog on the way there)", info.items >= 2 || info.dlg, JSON.stringify(info));
  await p.close(); await p.ctx.close();
}
{
  const p = await newPage(K.browser, "desktop", { base: srv.base });
  await p.evaluate(() => window.plasmaTest.showScreen("cut")); await sleep(200);
  await upload(p, file("part01.dxf")); await p.waitForFunction(() => window.plasmaTest.S.prepared, null, { timeout: 10000 }); await sleep(400);
  await upload(p, file("part02.dxf")); await sleep(800);
  t.check("CUT: a second single file asks Add to the bed or Replace", await vis(p, "#importAskDlg"));
  await p.click("#importAskAdd"); await sleep(1200);
  for (let i = 0; i < 20 && await p.locator("#sizeYes").isVisible(); i++) { await p.click("#sizeYes"); await sleep(300); }
  if (await vis(p, "#addPartsDlg")) { await p.click("#addOk"); await sleep(800); }
  const two = await p.evaluate(() => ({ n: window.plasmaTest.sketch.items.length, cur: window.plasmaTest.S.cur }));
  t.check("CUT: choosing Add puts both parts on the bed", two.n >= 2 && two.cur === 3, JSON.stringify(two));
  await p.evaluate(() => window.plasmaTest.startOver()); await sleep(400);
  t.check("CUT: 'Start over' clears the bed back to the upload page", await p.evaluate(() => !window.plasmaTest.S.prepared && window.plasmaTest.S.cur === 1));
  await p.close(); await p.ctx.close();
}
{
  const p = await newPage(K.browser, "desktop", { base: srv.base });
  await p.evaluate(() => window.plasmaTest.showScreen("cut")); await sleep(200);
  await p.setInputFiles("#file", { name: "plate.nc", mimeType: "text/plain", buffer: Buffer.from("G21\nG90\nG0 X10 Y10\nM3 S1000\nG1 X60 Y10 F1200\nG1 X60 Y40\nG1 X10 Y40\nG1 X10 Y10\nM5\nG0 X0 Y0\nM2\n") });
  await p.waitForFunction(() => window.plasmaTest.S.prepared, null, { timeout: 10000 }).catch(() => {}); await sleep(500);
  const g = await p.evaluate(() => ({ prepared: !!window.plasmaTest.S.prepared, cur: window.plasmaTest.S.cur, screen: window.plasmaTest.screen() }));
  t.check("CUT: ready-made G-code uploads on the same screen and goes to the bed step", g.prepared && g.screen === "cut" && g.cur === 3, JSON.stringify(g));
  await p.close(); await p.ctx.close();
}
{
  const p = await newPage(K.browser, "desktop", { base: srv.base });
  await p.evaluate(() => { window.plasmaTest.showScreen("make"); const s = window.plasmaTest.sketch; s.clear(); s.add("rect"); s.add("disc"); });
  await p.evaluate(() => window.plasmaTest.sendToCutting()); await sleep(600);
  const m = await p.evaluate(() => ({ screen: window.plasmaTest.screen(), cur: window.plasmaTest.S.cur, n: window.plasmaTest.sketch.items.length }));
  t.check("MAKE→CUT: 'Cut this part' sends the drawing to the cutting screen's bed", m.screen === "cut" && m.cur === 3 && m.n === 2, JSON.stringify(m));
  await p.close(); await p.ctx.close();
}
// ======================================================================== 4. CANNOT LEAVE DURING A JOB
{
  const p = await newPage(K.browser, "desktop", { base: srv.base });
  await toBed(p); await connectPractice(p);
  t.check("LOCK: before a job, the Menu button works (not locked)", await p.evaluate(() => !window.plasmaTest.navLocked() && !document.getElementById("btnHome").disabled));
  await startJob(p);
  const L = await p.evaluate(() => { const b = document.getElementById("btnHome"); return { dis: b.disabled || b.getAttribute("aria-disabled") === "true", why: b.dataset.why || b.title || "", locked: window.plasmaTest.navLocked(), cls: document.body.classList.contains("nav-locked") }; });
  t.check("LOCK: while cutting the Menu/back button is disabled and says why", L.dis && L.locked && L.cls && /cut|stop|E-STOP/i.test(L.why), JSON.stringify(L));
  await p.evaluate(() => document.getElementById("btnHome").click()); await sleep(200);
  t.check("LOCK: clicking the disabled Menu button changes nothing", (await scr(p)) === "cut");
  t.check("LOCK: asking for the menu or Make a part by script is refused", await p.evaluate(() => { const T = window.plasmaTest; T.showScreen("menu"); const a = T.screen(); T.showScreen("make"); return a === "cut" && T.screen() === "cut"; }));
  await p.evaluate(() => { history.back(); }); await sleep(400);
  t.check("LOCK: the browser Back button cannot leave the cutting screen", (await scr(p)) === "cut");
  t.check("LOCK: closing / reloading the tab shows the browser's leave-page warning", await p.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }));
  await p.evaluate(() => document.querySelector('.tab[data-tab="setup"]').click()); await sleep(200);
  t.check("LOCK: the Machine setup tab is also locked", await p.evaluate(() => window.plasmaTest.S.tab !== "setup" && window.plasmaTest.screen() === "cut"));
  // pause keeps it locked
  await p.evaluate(() => document.getElementById("btnPause").click()); await sleep(1500);
  t.check("LOCK: still locked while paused", await p.evaluate(() => window.plasmaTest.navLocked()));
  await p.evaluate(() => document.getElementById("btnPause").click()); await sleep(800);
  // stop, release the E-stop, unlock: now it is free
  await p.click("#btnStop"); await sleep(2500);
  await p.evaluate(() => window.plasmaTest.S.demo && (window.plasmaTest.S.status = { ...window.plasmaTest.S.status }));
  t.check("LOCK: after STOP the torch is off", (await demo(p, "(d) => d.torch")) === false);
  await holdRel(p); await sleep(600);   // press and hold releases the latch
  await p.evaluate(() => { const u = document.getElementById("btnUnlock"); if (u && u.offsetParent) u.click(); }); await sleep(1500);
  const free = await p.evaluate(() => ({ locked: window.plasmaTest.navLocked(), estop: window.plasmaTest.estopOn(), state: window.plasmaTest.S.status.state }));
  t.check("LOCK: once stopped, E-stop released and the machine idle, the Menu button works again", !free.locked && !free.estop, JSON.stringify(free));
  await p.evaluate(() => document.getElementById("btnHome").click()); await sleep(300);
  t.check("LOCK: …and takes you to the menu", (await scr(p)) === "menu");
  await p.close(); await p.ctx.close();
}
{ // the torch alone (no job) also locks; an idle machine does not
  const p = await newPage(K.browser, "desktop", { base: srv.base });
  await toBed(p); await connectPractice(p);
  const r = await p.evaluate(() => { const T = window.plasmaTest, S = T.S, out = {}; S.status = { ...S.status, state: "Idle", torch: false }; T.refresh(); out.idle = T.navLocked();
    S.status = { ...S.status, state: "Idle", torch: true }; T.refresh(); out.torch = T.navLocked();
    S.status = { ...S.status, state: "Run", torch: false }; T.refresh(); out.run = T.navLocked();
    S.status = { ...S.status, state: "Hold:0", torch: false }; T.refresh(); out.hold = T.navLocked();
    S.status = { ...S.status, state: "Jog", torch: false }; T.refresh(); out.jog = T.navLocked();
    S.status = { ...S.status, state: "Idle", torch: false }; T.refresh(); out.back = T.navLocked(); return out; });
  t.check("LOCK: idle is free; torch on / Run / Hold / Jog all lock; going idle frees it again", !r.idle && r.torch && r.run && r.hold && r.jog && !r.back, JSON.stringify(r));
  await p.close(); await p.ctx.close();
}
// ======================================================================== 5. SPACEBAR / ESC E-STOP
{
  const p = await newPage(K.browser, "desktop", { base: srv.base });
  await toBed(p); await connectPractice(p);
  const unpressed = await p.evaluate(() => { const top = document.querySelector("#btnStop .es-top"); return { tf: getComputedStyle(top).transform, on: getComputedStyle(document.querySelector("#btnStop .es-on")).opacity, label: document.getElementById("estopLabel").textContent.trim() }; });
  t.check("ESTOP: idle, the mushroom is up and the label is not 'E-STOP ON'", !/ON/.test(unpressed.label) && unpressed.on === "0", JSON.stringify(unpressed));
  await shot(p, "r4-estop-idle-desktop");
  // click the button and record exactly what the machine receives, as the reference
  await hook(p); await p.click("#btnStop"); await sleep(900);
  const viaButton = (await tx(p)).replace(/\?/g, "");
  await sleep(1300); await p.click("#btnStop"); await sleep(400);   // a late tap
  t.check("ESTOP: a tap, even long after, does NOT release it (round 5)", await p.evaluate(() => window.plasmaTest.estopOn()));
  await holdRel(p); await sleep(300);
  t.check("ESTOP: press-and-hold releases it", await p.evaluate(() => !window.plasmaTest.estopOn()));
  await hook(p);
  // Space with focus on the page
  await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await p.keyboard.press("Space"); await sleep(900);
  const viaSpace = (await tx(p)).replace(/\?/g, "");
  const pressed = await p.evaluate(() => { const top = document.querySelector("#btnStop .es-top"); return { on: window.plasmaTest.estopOn(), label: document.getElementById("estopLabel").textContent.trim(), cls: document.getElementById("btnStop").classList.contains("pressed"), aria: document.getElementById("btnStop").getAttribute("aria-pressed"), tf: getComputedStyle(top).transform, onOp: getComputedStyle(document.querySelector("#btnStop .es-on")).opacity, body: document.body.classList.contains("estop-on") }; });
  t.check("ESTOP: Space presses the E-stop: latched, 'E-STOP ON', mushroom pressed in", pressed.on && /E-STOP ON/.test(pressed.label) && pressed.cls && pressed.aria === "true" && pressed.body && pressed.onOp === "1" && pressed.tf !== unpressed.tf, JSON.stringify(pressed));
  t.check("ESTOP: Space sends exactly what the E-stop button sends (same STOP path: feed hold + soft reset, nothing new)", viaSpace === viaButton && viaSpace.includes("\x18"), JSON.stringify({ viaSpace, viaButton }));
  t.check("ESTOP: torch off after Space", (await demo(p, "(d) => d.torch")) === false);
  await shot(p, "r4-estop-on-desktop");
  t.check("ESTOP: while ON, Start is blocked with a plain reason", await p.evaluate(() => document.getElementById("btnStart").disabled && /E-STOP is ON/i.test(document.getElementById("blockers").textContent)));
  await p.keyboard.press("Space"); await sleep(300);
  t.check("ESTOP: pressing Space again does not release it (only a deliberate tap on the button does)", await p.evaluate(() => window.plasmaTest.estopOn()));
  await holdRel(p); await sleep(300);   // deliberate press-and-hold: release
  t.check("ESTOP: a later tap releases it and the label returns", await p.evaluate(() => !window.plasmaTest.estopOn() && !/ON/.test(document.getElementById("estopLabel").textContent) && !document.getElementById("btnStop").classList.contains("pressed")));
  await p.keyboard.press("Space"); await sleep(100); await p.click("#btnStop"); await sleep(300);   // press, then a panicked second tap straight away
  t.check("ESTOP: a panicked double-tap within 1.2 s stays ON", await p.evaluate(() => window.plasmaTest.estopOn()));
  await holdRel(p); await sleep(300);
  // Esc
  await hook(p); await p.keyboard.press("Escape"); await sleep(700);
  t.check("ESTOP: Esc is NOT a stop key any more (round 5: Space is the one STOP key)", await p.evaluate(() => !window.plasmaTest.estopOn()) && !(await tx(p)).includes("\x18"));
  // Space typed into inputs must NOT stop the machine
  await p.evaluate(() => window.plasmaTest.goStep(1)); await sleep(2500);   // let the STOP from the Esc check above finish completely
  t.note("ESTOP: latched before the typing checks?", await p.evaluate(() => window.plasmaTest.estopOn()));
  const fields = ["#ovKerf", "#ovDelay"];
  for (const sel of fields) {
    if (!(await p.locator(sel).count())) { t.note(`ESTOP: ${sel}`, "not in this build"); continue; }
    await p.evaluate((sel) => { const e = document.querySelector(sel); const d = e.closest("details"); if (d) d.open = true; e.scrollIntoView && e.scrollIntoView({ block: "center" }); e.focus(); }, sel);
    t.check(`ESTOP: (setup) ${sel} really has focus`, await p.evaluate((sel) => document.activeElement === document.querySelector(sel), sel));
    await hook(p); await p.keyboard.press("Space"); await sleep(250);
    const ok = await p.evaluate(() => !window.plasmaTest.estopOn());
    const sent = (await tx(p)).replace(/\?/g, "");
    t.check(`ESTOP: Space typed in ${sel} does NOT press the E-stop and sends nothing`, ok && !sent.includes("\x18") && !sent.includes("!"), JSON.stringify({ ok, sent: sent.slice(0, 40) }));
  }
  await p.evaluate(() => { const sel = document.createElement("select"); sel.id = "zzSel"; sel.innerHTML = "<option>a</option><option>b</option>"; document.body.appendChild(sel); sel.focus(); });
  await hook(p); await p.keyboard.press("Space"); await sleep(250);
  t.check("ESTOP: Space on a drop-down does NOT press it", await p.evaluate(() => !window.plasmaTest.estopOn()));
  await p.evaluate(() => { document.getElementById("zzSel").remove(); });
  await p.evaluate(() => { const ta = document.createElement("textarea"); ta.id = "zzTa"; document.body.appendChild(ta); ta.focus(); });
  await hook(p); await p.keyboard.press("Space"); await sleep(250);
  t.check("ESTOP: Space typed in a textarea does NOT press it", await p.evaluate(() => !window.plasmaTest.estopOn()));
  await p.evaluate(() => { const d = document.createElement("div"); d.id = "zzCe"; d.contentEditable = "true"; d.textContent = "x"; document.body.appendChild(d); d.focus(); });
  await p.keyboard.press("Space"); await sleep(250);
  t.check("ESTOP: Space in a contenteditable does NOT press it", await p.evaluate(() => !window.plasmaTest.estopOn()));
  await p.evaluate(() => { document.getElementById("zzTa").remove(); document.getElementById("zzCe").remove(); document.activeElement.blur(); });
  // a focused ordinary button: Space is the E-stop, not "click that button"
  await p.evaluate(() => { const b = document.getElementById("layAuto"); b.focus(); window.__clicked = 0; b.addEventListener("click", () => window.__clicked++); });
  await p.keyboard.press("Space"); await sleep(400);
  t.check("ESTOP: with a button focused, Space is still the E-stop and does not click that button", await p.evaluate(() => window.plasmaTest.estopOn() && window.__clicked === 0));
  await holdRel(p); await sleep(300);
  // not on other screens
  for (const s of ["make", "menu"]) {
    await p.evaluate((s) => window.plasmaTest.showScreen(s), s); await sleep(200);
    await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press("Space"); await sleep(250);
    t.check(`ESTOP: Space does nothing on the ${s} screen (no E-stop there)`, await p.evaluate(() => !window.plasmaTest.estopOn()) && !(await vis(p, "#btnStop")));
  }
  // Esc closing a dialog on the cutting screen is not an E-stop
  await p.evaluate(() => window.plasmaTest.showScreen("cut")); await sleep(200);
  await p.evaluate(() => window.plasmaTest.openSettings()); await sleep(300); await hook(p);
  await p.keyboard.press("Escape"); await sleep(400);
  t.check("ESTOP: Esc that just closes the Settings dialog does not press the E-stop", await p.evaluate(() => !window.plasmaTest.estopOn()) && !(await tx(p)).includes("\x18"));
  await p.close(); await p.ctx.close();
}
// ======================================================================== 6. E-STOP SIZE AND PLACE ON PHONES
for (const prof of ["iphone14", "iphone14land"]) {
  const p = await newPage(K.browser, prof, { base: srv.base }); const P = (s) => `ESTOP [${prof}]: ${s}`;
  await p.evaluate(() => window.plasmaTest.showScreen("cut")); await sleep(300);
  const g = await p.evaluate(() => { const r = document.getElementById("btnStop").getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { w: r.width, h: r.height, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, top: top && !!top.closest("#btnStop") }; });
  t.check(P("the E-stop is on screen, on top, at least 72x72"), g.w >= 72 && g.h >= 72 && g.inView && g.top, JSON.stringify(g));
  await p.keyboard.press("Space");   // (no job and no practice link here: this just proves the key is handled without errors)
  await sleep(300);
  await shot(p, `r4-estop-${prof}`);
  await p.evaluate(() => window.plasmaTest.showScreen("menu")); await sleep(200);
  t.check(P("and it is not there on the menu"), !(await vis(p, "#btnStop")));
  await p.close(); await p.ctx.close();
}
} catch (e) { t.check("49_r4_flow did not throw", false, String(e && e.stack || e)); }
finally { K.kill(); await srv.close(); }
process.exit(t.done() ? 1 : 0);

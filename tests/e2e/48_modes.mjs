// Simple view and Advanced tools on Make a part only. The cutting screen is the same for everyone.
// Retired: the Beginner / Pro switch, Check & Run, the Move tab / DRO, the account-menu mode radios.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape, shot } from "../lib/browser.mjs";
import fs from "node:fs"; import path from "node:path";
const t = new T("48_modes"); const srv = await startServer(); const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = "/workspace/plasma-table/work/shots/"; fs.mkdirSync(OUT, { recursive: true });
const snap = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + ".png") }).catch(() => {}); await shot(page, name); };
const profiles = ["desktop", "iphone14", "iphone14land"]; const tag = { desktop: "laptop", iphone14: "phone-portrait", iphone14land: "phone-landscape" };
// which of the cutting-side controls are visible (display + layout), for one step
const SIG_IDS = ["drop", "btnPickSaved", "btnStraight", "materials", "thicknesses", "matPreset", "dryRun", "advCut", "ovKerf", "ovDelay", "camTabs", "camOut", "camOver", "next1", "layAuto", "btnEditParts", "layClear", "layNudge", "btnConnect", "btnDemo", "btnZero", "btnTrace", "btnStart", "delayRow", "startCutRow", "btnPause", "btnExportRun", "btnHome", "btnStop"];
const sig = (page) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => { const e = document.getElementById(id); if (!e) return [id, "absent"]; const cs = getComputedStyle(e); let hidden = cs.display === "none" || cs.visibility === "hidden"; for (let n = e.parentElement; n && !hidden; n = n.parentElement) if (getComputedStyle(n).display === "none") hidden = true; return [id, hidden ? "hidden" : "shown"]; })), SIG_IDS);
try {
for (const prof of profiles) {
  const page = await newPage(br, prof, { base: srv.base }); const P = (s) => `[${prof}] ${s}`;
  t.check(P("opens on the main menu (test bypass), not inside a tool"), await page.evaluate(() => document.body.dataset.screen === "menu"));
  t.check(P("the Beginner / Pro switch is gone everywhere"), (await page.locator("#modeSwitch, #topModeSwitch, #yoursMode, .acct-modesw, input[name='acctMode'], #skPro, #quickBar [data-qb=\"pro\"]").count()) === 0);
  t.check(P("Make a part has Advanced tools and Simple view buttons"), (await page.locator("#makeBar #btnAdvancedTools").count()) === 1 && (await page.locator("#makeBar #btnSimpleView").count()) === 1);
  t.check(P("those buttons are not visible on the main menu"), await page.evaluate(() => { const el = document.getElementById("editorSwitch"); return !el || el.offsetParent === null; }));
  await demoToShape(page, { stay: "make" });
  await page.evaluate(() => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); const s = T.sketch; s.clear(); s.add("rect", true); const it = s.items[0]; it.p.w = 100; it.p.h = 50; it.x = 20; it.y = 20; s.pick([it.id]); s.fitView(); s.commit(); s.onSelect(); if (s.onChange) s.onChange(true); });
  await sleep(150);
  t.check(P("Make a part, Simple view: templates and help, not the advanced editor"), await page.evaluate(() => !document.body.classList.contains("pro-mode") && document.body.classList.contains("beginner") && !!document.getElementById("btnAdvancedTools").offsetParent && !document.getElementById("btnSimpleView").offsetParent && !!document.getElementById("bgShapes")));
  await snap(page, `r4-make-beginner-${tag[prof]}`);
  await page.evaluate(() => document.getElementById("btnAdvancedTools").click()); await sleep(250);
  t.check(P("Advanced tools turns on the full editor"), await page.evaluate(() => document.body.classList.contains("pro-mode") && window.plasmaTest.isProMode() && !!document.getElementById("btnSimpleView").offsetParent));
  t.check(P("Advanced tools hides the simple help and does not go full screen on its own"), await page.evaluate(() => { const h = document.querySelector(".skhelp, .beginner-help"); return (!h || getComputedStyle(h).display === "none") && !document.body.classList.contains("shape-fs"); }));
  await snap(page, `r4-make-pro-${tag[prof]}`);
  // round 5 item 12: going to the menu from the full-screen editor closes the editor chrome (no Done / Save bar over the menu)
  await page.evaluate(() => { window.plasmaTest.setShapeFs(true); document.getElementById("btnHome").click(); }); await sleep(300);
  t.check(P("item 12: Menu from the full-screen editor closes it (no editor bar over the menu)"), await page.evaluate(() => document.body.dataset.screen === "menu" && !document.body.classList.contains("shape-fs") && [...document.querySelectorAll("#fsBar, .fsbar, #toolBar")].every((e) => !e.offsetParent)));
  await page.evaluate(() => window.plasmaTest.showScreen("make")); await sleep(200);
  // ---- the cutting screen: identical whatever the mode
  const sigs = {};
  for (const mode of ["beginner", "pro"]) {
    await page.evaluate((mode) => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode(mode, { persist: false, autoFs: false }); T.setShapeFs(false); T.sendToCutting(); T.goStep(3); }, mode);
    await sleep(250);
    const cls = await page.evaluate(() => ({ b: document.body.classList.contains("beginner"), p: document.body.classList.contains("pro-mode"), screen: document.body.dataset.screen, sw: !!(document.getElementById("editorSwitch") && document.getElementById("editorSwitch").offsetParent) }));
    t.check(P(`cutting screen after ${mode}: no beginner/pro class and no Simple / Advanced buttons`), cls.screen === "cut" && !cls.b && !cls.p && !cls.sw, JSON.stringify(cls));
    const s3 = await sig(page); await page.evaluate(() => window.plasmaTest.goStep(1)); await sleep(150); const s1 = await sig(page);
    sigs[mode] = JSON.stringify([s1, s3]);
    await page.evaluate(() => { window.plasmaTest.goStep(3); });
  }
  t.check(P("the cutting screen shows exactly the same controls after Simple and Advanced (steps 1 and 3)"), sigs.beginner === sigs.pro, sigs.beginner === sigs.pro ? "" : sigs.beginner + "\n" + sigs.pro);
  t.check(P("former Pro-only cut controls are available to everyone (tabs, lead-out, pierce delay, restart box, nudge)"), await page.evaluate(() => ["camTabs", "camOut", "ovDelay", "delayRow", "restartBox", "layNudge"].every((id) => !!document.getElementById(id))));
  t.check(P("there is no Move tab, no Check & Run, no separate stop button in the run screen"), (await page.locator("#moveView, .tab[data-tab='move'], #btnCheckRun, #btnCheckRun2, #btnStopRun").count()) === 0);
  await snap(page, `r4-cut-bed-${tag[prof]}`);
  // mode choice survives a reload (it lives on Make)
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("menu"); T.showScreen("make"); T.setAppMode("pro", { persist: true, autoFs: false }); });
  await page.reload(); await page.waitForFunction(() => window.plasmaTest); await page.evaluate(() => window.plasmaTest.showScreen("make")); await sleep(200);
  t.check(P("Advanced tools choice is remembered after a reload"), await page.evaluate(() => window.plasmaTest.isProMode()));
  await page.evaluate(() => window.plasmaTest.setAppMode("beginner", { persist: true, autoFs: false }));
  await page.close().catch(() => {}); await page.ctx.close().catch(() => {});
}
} catch (e) { t.check("48_modes did not throw", false, String(e && e.stack || e)); }
await br.close(); await srv.close(); process.exit(t.done() ? 1 : 0);

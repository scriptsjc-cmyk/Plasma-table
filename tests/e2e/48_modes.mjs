// Round 4 (replaces the UX2 version): Beginner / Pro is a switch on "Make a part" ONLY. The cutting screen is the same for everyone.
// Retired from the old file because they test things r4 deliberately removed: Check & Run, the Move tab / DRO, the account-menu mode switch.
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
  t.check(P("the Beginner / Pro switch exists only inside the Make-a-part bar"), (await page.locator("#modeSwitch").count()) === 1 && (await page.locator("#makeBar #modeSwitch").count()) === 1 && (await page.locator("#modeSwitch [data-mode]").count()) === 2);
  t.check(P("the old Pro checkbox / palette star and the account-menu mode radios are gone"), (await page.locator("#skPro").count()) === 0 && (await page.locator('#quickBar [data-qb="pro"]').count()) === 0 && (await page.locator(".acct-modesw, input[name='acctMode']").count()) === 0);
  t.check(P("the switch is NOT visible on the main menu"), await page.evaluate(() => document.getElementById("modeSwitch").offsetParent === null));
  await demoToShape(page, { stay: "make" });
  await page.evaluate(() => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); const s = T.sketch; s.clear(); s.add("rect", true); const it = s.items[0]; it.p.w = 100; it.p.h = 50; it.x = 20; it.y = 20; s.pick([it.id]); s.fitView(); s.commit(); s.onSelect(); if (s.onChange) s.onChange(true); });
  await sleep(150);
  t.check(P("Make a part, Beginner: switch visible, guided help visible, not pro-mode"), await page.evaluate(() => !document.body.classList.contains("pro-mode") && document.body.classList.contains("beginner") && document.getElementById("modeSwitch").offsetParent !== null && !!document.querySelector(".skhelp") && document.querySelector("#modeSwitch [data-mode='beginner']").classList.contains("sel")));
  await snap(page, `r4-make-beginner-${tag[prof]}`);
  await page.evaluate(() => document.querySelector('#modeSwitch [data-mode="pro"]').click()); await sleep(250);
  t.check(P("Pro turns on body.pro-mode and the Pro segment"), await page.evaluate(() => document.body.classList.contains("pro-mode") && window.plasmaTest.isProMode() && document.querySelector("#modeSwitch [data-mode='pro']").classList.contains("sel")));
  t.check(P("Pro hides the beginner help and opens the full-screen editor"), await page.evaluate(() => { const h = document.querySelector(".skhelp, .beginner-help"); return (!h || getComputedStyle(h).display === "none") && document.body.classList.contains("shape-fs"); }));
  t.check(P("Pro palette shows shortcut hints"), (await page.locator("#quickBar kbd").count()) >= 3);
  await snap(page, `r4-make-pro-${tag[prof]}`);
  // round 5 item 12: going to the menu from the full-screen editor closes the editor chrome (no Done / Save bar over the menu)
  await page.evaluate(() => document.getElementById("btnHome").click()); await sleep(300);
  t.check(P("item 12: Menu from the full-screen editor closes it (no editor bar over the menu)"), await page.evaluate(() => document.body.dataset.screen === "menu" && !document.body.classList.contains("shape-fs") && [...document.querySelectorAll("#fsBar, .fsbar, #toolBar")].every((e) => !e.offsetParent)));
  await page.evaluate(() => window.plasmaTest.showScreen("make")); await sleep(200);
  // ---- the cutting screen: identical whatever the mode
  const sigs = {};
  for (const mode of ["beginner", "pro"]) {
    await page.evaluate((mode) => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode(mode, { persist: false, autoFs: false }); T.setShapeFs(false); T.sendToCutting(); }, mode);
    await sleep(250);
    const cls = await page.evaluate(() => ({ b: document.body.classList.contains("beginner"), p: document.body.classList.contains("pro-mode"), screen: document.body.dataset.screen, sw: document.getElementById("modeSwitch").offsetParent !== null }));
    t.check(P(`cutting screen after ${mode}: no beginner/pro class and no mode switch`), cls.screen === "cut" && !cls.b && !cls.p && !cls.sw, JSON.stringify(cls));
    const s3 = await sig(page); await page.evaluate(() => window.plasmaTest.goStep(1)); await sleep(150); const s1 = await sig(page);
    sigs[mode] = JSON.stringify([s1, s3]);
    await page.evaluate(() => { window.plasmaTest.goStep(3); });
  }
  t.check(P("the cutting screen shows exactly the same controls for Beginner and Pro (steps 1 and 3)"), sigs.beginner === sigs.pro, sigs.beginner === sigs.pro ? "" : sigs.beginner + "\n" + sigs.pro);
  t.check(P("former Pro-only cut controls are available to everyone (tabs, lead-out, pierce delay, restart box, nudge)"), await page.evaluate(() => ["camTabs", "camOut", "ovDelay", "delayRow", "restartBox", "layNudge"].every((id) => !!document.getElementById(id))));
  t.check(P("there is no Move tab, no Check & Run, no separate stop button in the run screen"), (await page.locator("#moveView, .tab[data-tab='move'], #btnCheckRun, #btnCheckRun2, #btnStopRun").count()) === 0);
  await snap(page, `r4-cut-bed-${tag[prof]}`);
  // mode choice survives a reload (it lives on Make)
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("menu"); T.showScreen("make"); T.setAppMode("pro", { persist: true, autoFs: false }); });
  await page.reload(); await page.waitForFunction(() => window.plasmaTest); await page.evaluate(() => window.plasmaTest.showScreen("make")); await sleep(200);
  t.check(P("Pro choice is remembered after a reload"), await page.evaluate(() => window.plasmaTest.isProMode()));
  await page.evaluate(() => window.plasmaTest.setAppMode("beginner", { persist: true, autoFs: false }));
  await page.close().catch(() => {}); await page.ctx.close().catch(() => {});
}
} catch (e) { t.check("48_modes did not throw", false, String(e && e.stack || e)); }
await br.close(); await srv.close(); process.exit(t.done() ? 1 : 0);

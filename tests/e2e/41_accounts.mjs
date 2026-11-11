import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, demoToShape, shot, SHOTS } from "../lib/browser.mjs";
import fs from "node:fs";
const t = new T("41_accounts");
const srv = await startServer();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORK_SHOTS = "/workspace/plasma-table/work/shots/";
fs.mkdirSync(WORK_SHOTS, { recursive: true });
const K = await launchKillable();

async function snap(page, name) {
  await shot(page, name);
  const src = SHOTS + name + ".png";
  try { if (fs.existsSync(src)) fs.copyFileSync(src, WORK_SHOTS + name + ".png"); } catch (e) { /* ignore */ }
}

async function dismissMigrate(page) {
  const dlg = page.locator("#migrateDlg:not(.hidden)");
  if (await dlg.count()) {
    await page.click("#migrateNo");
    await page.waitForSelector("#migrateDlg.hidden, #migrateDlg.hidden", { timeout: 3000 }).catch(() => {});
    await sleep(200);
  }
}

async function signup(page, { email, mode, name }) {
  if (!(await page.locator("#acctPill").isVisible())) await page.click("#btnTopMenu");   // r4: on a phone the account pill sits behind the menu button
  await page.click("#acctPill");
  await page.waitForSelector("#accountDlg:not(.hidden)");
  await page.click("#goSignUp");
  await page.waitForSelector('[data-pane="up"]:not(.hidden)');
  if (name) await page.fill("#upName", name);
  await page.fill("#upEmail", email);
  await page.fill("#upPin", "letmein1");
  // r4: no Beginner/Pro choice at sign-up any more (it lives on Make a part)
  await snap(page, "signup-" + mode);
  await page.click('#formSignUp [type=submit]');
  await page.waitForFunction(() => window.plasmaTest && window.plasmaTest.account.isSignedIn(), null, { timeout: 10000 });
  await sleep(400);
}

try {
  // ---------- desktop: locked connect, design only, export, demo still works
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    t.check("demo banner is visible when config is empty", await p.locator("#demoAcctBar:not(.hidden)").count() === 1);
    // r4: Connect lives on the cutting screen's bed step (reached after a part is on the bed)
    await p.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); });
    await p.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3);
    t.check("Connect starts locked", await p.locator("#btnConnect.locked").count() === 1);
    t.check("lock prompt shown on the connect card", /link (your |a )?machine to run jobs/i.test(await p.locator("#connectLock").textContent()));
    await p.evaluate(() => document.getElementById("btnConnect").click());
    await p.waitForSelector("#gateDlg:not(.hidden)", { timeout: 5000 });
    t.check("tapping Connect without a linked machine opens the lock prompt", /link (your |a )?machine to run jobs/i.test(await p.locator("#gateWhy").textContent()));
    await snap(p, "locked-connect");
    await p.click("#gateDlg .acct-close");
    t.check("Make a part (free) works without connecting", await p.evaluate(() => { const T = window.plasmaTest; T.showScreen("menu"); T.showScreen("make"); return T.screen() === "make" && !T.S.connected; }));
    await p.evaluate(() => { const T = window.plasmaTest; T.showScreen("cut"); T.goStep(3); T.refreshGate(); });
    await p.waitForSelector("#startLock:not(.hidden)", { timeout: 5000 }).catch(async () => { await p.evaluate(() => { window.plasmaTest.goStep(3); window.plasmaTest.refreshGate(); }); });
    await p.waitForSelector("#startLock:not(.hidden)", { timeout: 5000 });
    t.check("Start cutting shows the lock prompt when no machine is linked", /link (your |a )?machine/i.test(await p.locator("#startLock").textContent()));
    await snap(p, "locked-run");
    await p.evaluate(() => document.getElementById("startLock").click());
    await p.waitForSelector("#gateDlg:not(.hidden)", { timeout: 5000 });
    t.check("tapping the locked Run prompt opens the link-machine message", /link (your |a )?machine/i.test(await p.locator("#gateWhy").textContent()));
    await p.click("#gateDlg .acct-close");
    await p.close(); await p.ctx.close();
  }
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    await demoToShape(p);
    t.check("Try the demo still works without a linked machine", await p.evaluate(() => !!(window.plasmaTest.S.demo && window.plasmaTest.S.connected)));
    t.check("in software demo, Start is not locked", await p.evaluate(() => window.plasmaTest.machineAllowed() === true));
    const net = await p.evaluate(() => window.__net);
    const ext = net.fetch.filter((u) => /^(https?:)?\/\//i.test(u) && !u.startsWith(srv.base));
    t.check("demo accounts: no third-party fetch / socket after load + demo", ext.length === 0 && net.ws.length === 0 && net.beacon.length === 0, JSON.stringify({ ext, ws: net.ws, beacon: net.beacon, fetch: net.fetch }));
    await p.close(); await p.ctx.close();
  }

  // ---------- sign up Beginner, mode switch, save / load part, claim, admin
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    await signup(p, { email: "josh@example.com", mode: "beginner", name: "Josh" });
    await p.evaluate(() => window.plasmaTest.showScreen("make"));
    t.check("after sign-up, Make a part opens in Beginner (body has beginner class)", await p.evaluate(() => document.body.classList.contains("beginner")));
    t.check("Pro tools are hidden in Beginner mode", await p.evaluate(() => document.body.classList.contains("beginner") && window.plasmaTest.sketch.opts.pro === false));
    await p.waitForSelector('[data-pane="home"]:not(.hidden)');
    await snap(p, "account-menu");
    t.check("the account menu has no Beginner/Pro radios any more", await p.locator('input[name="acctMode"], input[name="suMode"]').count() === 0);
    await p.click("#accountDlg .acct-close"); await dismissMigrate(p);
    // r4: Beginner/Pro is switched on Make a part only
    await p.evaluate(() => document.querySelector('#modeSwitch [data-mode="pro"]').click());
    await sleep(400);
    t.check("switching to Pro on Make a part turns Pro mode on", await p.evaluate(() => window.plasmaTest.sketch.opts.pro === true && document.body.classList.contains("pro-mode")));
    // close and save / load a part
    await dismissMigrate(p);
    await p.evaluate(() => { if (window.plasmaTest.setShapeFs) window.plasmaTest.setShapeFs(false); });
    await p.evaluate(() => {
      if (window.plasmaTest.setShapeFs) window.plasmaTest.setShapeFs(false);
      const s = window.plasmaTest.sketch;
      if (s && !s.items.length) { s.add("rect", true); s.pick([s.items[0].id]); s.commit(); }
    });
    await sleep(300);
    await p.click("#acctPill");
    await p.waitForSelector('[data-pane="home"]:not(.hidden)');
    await p.fill("#partName", "Test plate");
    await p.click("#btnSavePart");
    await p.waitForFunction(() => document.querySelectorAll("#partsList .partrow").length >= 1, null, { timeout: 8000 });
    t.check("saved part appears in the account list", await p.locator("#partsList .partrow").count() >= 1);
    // claim
    await p.click("#btnOpenClaim");
    await p.waitForSelector("#claimDlg:not(.hidden)");
    await snap(p, "link-machine");
    await p.fill("#claimCode", "DEMO-0000");
    await p.click('#formClaim [type=submit]');
    await p.waitForFunction(() => window.plasmaTest.account.hasLinkedMachine(), null, { timeout: 8000 });
    t.check("claiming DEMO-0000 unlocks the machine gate", await p.evaluate(() => window.plasmaTest.account.hasLinkedMachine() === true));
    // gate no longer on Connect
    await p.click("#acctPill"); // may still be on home
    await p.click("#accountDlg .acct-close").catch(() => {}); await dismissMigrate(p);
    // admin
    const granted = await p.evaluate(async () => { await window.plasmaTest.account.grantDemoAdmin(); return window.plasmaTest.account.isAdmin(); });
    t.check("demo admin grant works", granted === true);
    await p.click("#acctPill");
    await p.waitForSelector("#acctAdminBtn:not(.hidden)");
    await p.click("#acctAdminBtn");
    await p.waitForSelector("#adminDlg:not(.hidden)");
    await p.click('.admtab[data-admtab="machines"]');
    await p.waitForSelector('[data-admpane="machines"]:not(.hidden)');
    await snap(p, "admin-page");
    t.check("admin page lists the practice serial", /DEMO-TABLE-1/.test(await p.locator("#adminTable").textContent()));
    await p.click("#btnGenCode");
    const code = await p.inputValue("#admCode");
    t.check("Generate fills a claim code", /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code), code);
    await p.fill("#admSerial", "TABLE-0002");
    await p.fill("#admNotes", "Bay 2");
    await p.click('#formAddMachine [type=submit]');
    await p.waitForFunction(() => /TABLE-0002/.test(document.getElementById("adminTable").textContent || ""), null, { timeout: 8000 });
    t.check("admin can add a new serial", /TABLE-0002/.test(await p.locator("#adminTable").textContent()));
    // export is allowed
    await p.click("#adminDlg .acct-close");
    const exported = await p.evaluate(() => { try { window.plasmaTest.exportGcode(); return true; } catch (e) { return String(e); } });
    t.check("G-code download stays available (gating constant is on)", exported === true, String(exported));
    t.check("no page errors during account flow", p.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e)).length === 0, p.errors.slice(0, 3).join(" | "));
    await p.close(); await p.ctx.close();
  }

  // ---------- phone portrait + landscape
  for (const prof of ["iphone14", "iphone14land"]) {
    const p = await newPage(K.browser, prof, { base: srv.base });
    t.check(`${prof}: demo banner visible`, await p.locator("#demoAcctBar:not(.hidden)").count() === 1);
    await signup(p, { email: `phone-${prof}@example.com`, mode: "pro", name: "Pat" });
    t.check(`${prof}: signed in`, await p.evaluate(() => window.plasmaTest.account.isSignedIn()));
    await p.click("#accountDlg .acct-close");
    await dismissMigrate(p);
    await p.evaluate(() => { if (window.plasmaTest.setShapeFs) window.plasmaTest.setShapeFs(false); });
    await p.evaluate(() => window.plasmaTest.showScreen("make"));
    await sleep(300);
    await snap(p, prof === "iphone14" ? "phone-portrait" : "phone-landscape");
    await p.evaluate(() => {
      if (window.plasmaTest.setShapeFs) window.plasmaTest.setShapeFs(false);
      const s = window.plasmaTest.sketch;
      if (s && !s.items.length) { s.add("rect", true); s.pick([s.items[0].id]); s.commit(); }
      if (window.plasmaTest.S) {
        window.plasmaTest.S.prepared = window.plasmaTest.S.prepared || { dry_run: false, stats: { pierces: 0, estimated_seconds: 1, width_mm: 100, height_mm: 60, bounds: [0,0,100,60] }, preview: { rapids: [], cuts: [] }, warnings: [] };
      }
      window.plasmaTest.showScreen("cut"); window.plasmaTest.goStep(3); window.plasmaTest.refreshGate();
    });
    await p.waitForSelector("#startLock:not(.hidden)", { timeout: 8000 });
    t.check(`${prof}: Run stays locked until claim`, /link (your |a )?machine/i.test(await p.locator("#startLock").textContent()));
    await p.evaluate(() => document.getElementById("startLock").click());
    await p.waitForSelector("#gateDlg:not(.hidden)", { timeout: 5000 });
    await p.click("#gateClaim");
    await p.waitForSelector("#claimDlg:not(.hidden)");
    await p.fill("#claimCode", "DEMO-0000");
    await p.click('#formClaim [type=submit]');
    await p.waitForFunction(() => window.plasmaTest.account.hasLinkedMachine(), null, { timeout: 8000 });
    t.check(`${prof}: claim unlocks gating`, await p.evaluate(() => window.plasmaTest.account.hasLinkedMachine()));
    t.check(`${prof}: no page errors`, p.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e)).length === 0, p.errors.slice(0, 3).join(" | "));
    await p.close(); await p.ctx.close();
  }
  // ---------- "Parts on this device": Not now dismisses it and it stays away for the session
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base, query: "?test=1&gate=1&turn=0" });
    const prompt = () => p.locator("#migrateDlg:not(.hidden)").count();
    await p.evaluate(() => window.plasmaTest.sketch.add("rect"));
    await p.click("#goSignUp");
    await p.fill("#upEmail", "notnow@example.com");
    await p.fill("#upPin", "letmein1");
    await p.click('#formSignUp [type=submit]');
    await p.waitForFunction(() => window.plasmaTest.account.isSignedIn(), null, { timeout: 10000 });
    await p.evaluate(() => window.plasmaTest.showScreen("make"));
    if (!(await p.locator("#acctPill").isVisible())) await p.click("#btnTopMenu");
    await p.click("#acctPill"); await p.click("#accountDlg .acct-close");
    await p.waitForSelector("#migrateDlg:not(.hidden)", { timeout: 3000 });
    t.check("after sign-in the 'Parts on this device' prompt is offered", await prompt() === 1);
    // a second sign-in landing while the prompt is open used to make Not now re-open it
    await p.evaluate(() => { inEmail.value = "notnow@example.com"; inPin.value = "letmein1"; formSignIn.requestSubmit(); });
    await sleep(800);
    await p.click("#migrateNo");
    await sleep(300);
    t.check("Not now dismisses the prompt", await prompt() === 0);
    await p.click("#acctPill"); await p.click("#accountDlg .acct-close");
    await sleep(300);
    t.check("and it is not offered again this session", await prompt() === 0);
    await p.close(); await p.ctx.close();
  }
} finally {
  K.kill(); await srv.close();
}
process.exit(t.done() ? 1 : 0);

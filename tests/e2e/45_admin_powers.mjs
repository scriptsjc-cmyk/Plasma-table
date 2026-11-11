import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, demoToShape, shot, SHOTS } from "../lib/browser.mjs";
import fs from "node:fs";
const t = new T("45_admin_powers");
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

async function closeDlgs(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".acctdlg").forEach((el) => el.classList.add("hidden"));
  });
  await sleep(100);
}

async function signup(page, { email, name, mode = "beginner" }) {
  await page.evaluate(async ({ email, name, mode }) => {
    if (window.plasmaTest.account.isSignedIn()) await window.plasmaTest.account.signOut();
    await window.plasmaTest.account.signUp({ email, pin: "letmein1", display_name: name || "", mode });
  }, { email, name, mode });
  await page.waitForFunction(() => window.plasmaTest && window.plasmaTest.account.isSignedIn(), null, { timeout: 10000 });
  await closeDlgs(page);
}

try {
  // ---- desktop admin panels in demo ----
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    await p.evaluate(() => window.plasmaTest.showScreen("make"));
    await p.waitForSelector("#cutView:not(.hidden)");
    await signup(p, { email: "operator@example.com", name: "Operator" });
    await signup(p, { email: "admin-demo@example.com", name: "Josh", mode: "pro" });
    const granted = await p.evaluate(async () => { await window.plasmaTest.account.grantDemoAdmin(); return window.plasmaTest.account.isAdmin(); });
    t.check("grantDemoAdmin works on localhost + ?test=1", granted === true);
    await closeDlgs(p);
    await p.evaluate(() => window.plasmaTest.openAccount());
    await p.waitForSelector("#accountDlg:not(.hidden)");
    t.check("Admin button is visible once admin", await p.locator("#acctAdminBtn:not(.hidden)").count() === 1);
    await p.evaluate(() => window.plasmaTest.openAdmin("users"));
    await p.waitForSelector("#adminDlg:not(.hidden)");
    t.check("Users tab lists both demo accounts", await p.evaluate(() => /admin-demo@example.com/.test(document.getElementById("adminUsers").textContent) && /operator@example.com/.test(document.getElementById("adminUsers").textContent)));
    await snap(p, "admin-users-desktop");

    await p.click('.admtab[data-admtab="stats"]');
    await p.waitForSelector('[data-admpane="stats"]:not(.hidden)');
    await p.evaluate(async () => {
      await window.plasmaTest.account.logJobEvent({ status: "started", serial: "DEMO-0001", partCount: 1, cutLengthMm: 156 });
      const evs = await window.plasmaTest.account.adminListJobEvents(5);
      const id = evs[0] && evs[0].id;
      await window.plasmaTest.account.logJobEvent({ status: "finished", eventId: id, durationS: 42, cutLengthMm: 156, partCount: 1, serial: "DEMO-0001" });
    });
    await p.click('.admtab[data-admtab="users"]');
    await p.click('.admtab[data-admtab="stats"]');
    await sleep(300);
    t.check("Usage tab shows user and job figures", await p.evaluate(() => /Users/.test(document.getElementById("adminStats").textContent) && /Jobs finished/.test(document.getElementById("adminStats").textContent)));
    await snap(p, "admin-stats-desktop");

    await p.click('.admtab[data-admtab="announce"]');
    await p.waitForSelector('[data-admpane="announce"]:not(.hidden)');
    await p.fill("#annTitle", "Table update tonight");
    await p.fill("#annBody", "We'll pause jobs at 6pm for a firmware flash.");
    await p.selectOption("#annSev", "update");
    await snap(p, "admin-announce-composer-desktop");
    await p.click('#formAnnounce [type=submit]');
    await sleep(400);
    t.check("announcement appears in the published list", await p.evaluate(() => /Table update tonight/.test(document.getElementById("adminAnnList").textContent)));
    await p.click("#adminDlg .acct-close");
    await p.evaluate(() => window.plasmaTest.setShapeFs(false));   // r4: a Pro account opens the full-screen editor, which hides banners by design
    await p.waitForSelector("#announceBar:not(.hidden)", { timeout: 5000 });
    t.check("users see a dismissible announcement banner with escaped text", await p.evaluate(() => {
      const t = document.getElementById("announceTitle").textContent;
      const b = document.getElementById("announceBody").textContent;
      return t === "Table update tonight" && b.includes("firmware flash") && !document.getElementById("announceBody").innerHTML.includes("<script");
    }));
    await snap(p, "admin-announce-banner-desktop");

    await p.click("#announceOpen");
    await p.waitForSelector("#announceDlg:not(.hidden)");
    t.check("inbox lists the announcement", await p.evaluate(() => /Table update tonight/.test(document.getElementById("announceInbox").textContent)));
    await p.click("#announceDlg .acct-close");

    await p.evaluate(() => window.plasmaTest.openAdmin("advanced"));
    await p.waitForSelector('[data-admpane="advanced"]:not(.hidden)');
    t.check("Advanced machine panel warns that settings change behaviour", await p.evaluate(() => /change how the machine moves/i.test(document.getElementById("advMachine").textContent)));
    t.check("settings list includes $100 steps/mm", await p.evaluate(() => /\$100/.test(document.getElementById("advSettings").textContent) && /steps\/mm/i.test(document.getElementById("advSettings").textContent)));
    await snap(p, "admin-advanced-desktop");
    await p.locator("#calWizard").scrollIntoViewIfNeeded();
    t.check("calibration wizard is present", await p.locator("#calWizard").count() === 1);
    await snap(p, "admin-cal-wizard-desktop");

    // console filter is exposed
    const blocked = await p.evaluate(() => window.plasmaTest.filterConsoleCommand("$RST=*"));
    t.check("console filter blocks $RST", blocked && blocked.ok === false);

    await p.click('.admtab[data-admtab="machines"]');
    await sleep(200);
    t.check("Machines tab still has serials and claim log", await p.locator("#adminTable").count() === 1 && await p.locator("#formAddMachine").count() === 1);
    await snap(p, "admin-machines-desktop");
    await p.close(); await p.ctx.close();
  }

  // ---- phone ----
  {
    const p = await newPage(K.browser, "iphone14", { base: srv.base });
    await p.evaluate(() => window.plasmaTest.showScreen("make"));
    await p.waitForSelector("#cutView:not(.hidden)");
    await signup(p, { email: "phone-admin@example.com", name: "Phone Josh", mode: "pro" });
    await p.evaluate(async () => { await window.plasmaTest.account.grantDemoAdmin(); });
    await p.evaluate(() => window.plasmaTest.openAdmin("users"));
    await p.waitForSelector("#adminDlg:not(.hidden)");
    await snap(p, "admin-users-phone");
    await p.click('.admtab[data-admtab="stats"]');
    await sleep(250);
    await snap(p, "admin-stats-phone");
    await p.click('.admtab[data-admtab="announce"]');
    await p.fill("#annTitle", "Phone notice");
    await p.fill("#annBody", "Please home the table after moving it.");
    await snap(p, "admin-announce-composer-phone");
    await p.click('#formAnnounce [type=submit]');
    await p.click("#adminDlg .acct-close");
    await p.evaluate(() => window.plasmaTest.setShapeFs(false));   // r4: a Pro account opens the full-screen editor, which hides banners by design
    await p.waitForSelector("#announceBar:not(.hidden)", { timeout: 5000 });
    await snap(p, "admin-announce-banner-phone");
    await p.evaluate(() => window.plasmaTest.openAdmin("advanced"));
    await p.waitForSelector("#advMachine");
    await snap(p, "admin-advanced-phone");
    await p.locator("#calWizard").scrollIntoViewIfNeeded();
    await snap(p, "admin-cal-wizard-phone");
    await p.close(); await p.ctx.close();
  }
} catch (e) {
  t.check("suite threw", false, String(e && e.stack || e));
} finally {
  K.kill(); await srv.close();
}
process.exit(t.done() ? 1 : 0);

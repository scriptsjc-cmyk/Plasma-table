// r12: every laptop screen fits with no page scroll, no scroll boxes, and nothing
// clipped or overlapping. How to use and Settings may scroll. Practice table only.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, ensurePracticeHomed } from "../lib/browser.mjs";
import fs from "node:fs";
import path from "node:path";

const t = new T("96_fits_screen");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);

const OUT = path.join(new URL("../results/shots/", import.meta.url).pathname);
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  ["1280x600", "d1280x600"],
  ["1366x640", "d1366x640"],
  ["1536x730", "d1536x730"],
  ["1440x800", "d1440x800"],
  ["1920x970", "d1920x970"],
];

// Brief section 5 — run in the page; returns problems (empty = pass).
const fitProblems = () => {
  const out = [];
  const exempt = el => el.closest("#howtoDlg, #settingsDlg");
  const shown = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  if (document.scrollingElement.scrollHeight > innerHeight + 1) out.push("page scrolls");
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || exempt(el)) continue;
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2) out.push("scrolls: " + (el.id || el.className));
    if (/^(BUTTON|INPUT|SELECT|A)$/.test(el.tagName)) {
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1) out.push("off-screen: " + (el.id || el.textContent.trim().slice(0, 30)));
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflow !== "visible") { const pr = p.getBoundingClientRect();
          if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) { out.push("clipped: " + (el.id || el.textContent.trim().slice(0, 30))); break; } }
      }
    }
  }
  const ctl = [...document.querySelectorAll("button, input, select")].filter(e => shown(e) && !exempt(e) && !e.closest("dialog:not([open])"));
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    if (ctl[i].contains(ctl[j]) || ctl[j].contains(ctl[i])) continue;
    const a = ctl[i].getBoundingClientRect(), b = ctl[j].getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 4 && oy > 4) out.push("overlap: " + (ctl[i].id || ctl[i].textContent.trim().slice(0, 20)) + " / " + (ctl[j].id || ctl[j].textContent.trim().slice(0, 20)));
  }
  return [...new Set(out)];
};

async function shot(page, size, state) {
  const pth = path.join(OUT, `${size}-${state}.png`);
  await page.screenshot({ path: pth, fullPage: false }).catch(() => {});
  return pth;
}

async function check(page, size, state) {
  await sleep(250);
  await shot(page, size, state);
  const problems = await ev(page, fitProblems);
  t.check(`${size} ${state}: fits`, problems.length === 0, JSON.stringify(problems).slice(0, 800));
  return problems;
}

async function closeDialogs(page) {
  await ev(page, () => {
    const T = window.plasmaTest;
    try { T.closeSettings && T.closeSettings(); } catch (e) {}
    try { T.closeHowto && T.closeHowto(); } catch (e) {}
    for (const id of ["accountDlg", "claimDlg", "migrateDlg", "saveDlg", "conflictDlg", "adminDlg", "announceDlg", "sizeDlg", "straightDlg", "settingsDlg", "howtoDlg", "importDlg", "shapeLib", "presetBrowser", "partsDlg", "makeCheckDlg"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.add("hidden");
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      if (el.hasAttribute("open")) el.removeAttribute("open");
    }
  });
  await sleep(50);
}

async function openDlg(page, how) {
  await ev(page, how);
  await sleep(200);
}

for (const [size, prof] of SIZES) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });

  await ev(page, () => window.plasmaTest.showScreen("menu", { force: true }));
  await check(page, size, "home-menu");

  await ev(page, () => window.plasmaTest.showScreen("login", { force: true }));
  await check(page, size, "sign-in");
  await ev(page, () => window.plasmaTest.showScreen("menu", { force: true }));

  await ev(page, () => {
    const T = window.plasmaTest;
    T.setAppMode && T.setAppMode("beginner", { persist: false, autoFs: false });
    T.showScreen("make", { force: true });
    T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.commit && T.sketch.commit();
  });
  await check(page, size, "make-empty");

  await ev(page, () => {
    const T = window.plasmaTest;
    T.sketch.add("rect", true, { w: 80, h: 50 });
    T.sketch.commit && T.sketch.commit();
    T.sketch.fitView && T.sketch.fitView();
  });
  await check(page, size, "make-part-picked");

  await ev(page, () => {
    const T = window.plasmaTest;
    T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false });
    T.setShapeFs(false);
  });
  await check(page, size, "make-advanced");

  const dialogs = [
    ["preset-parts", () => { window.plasmaTest.openPresetBrowser(); }],
    ["more-shapes", () => { const b = document.getElementById("bgMore") || document.getElementById("shapeLib"); if (document.getElementById("bgMore")) document.getElementById("bgMore").click(); else if (window.plasmaTest.useShape) {} }],
    ["save-part", () => { try { window.plasmaTest.saveCurrent && window.plasmaTest.saveCurrent(); } catch (e) { const d = document.getElementById("saveDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; } } }],
    ["account", () => { try { window.plasmaTest.openAccount(); } catch (e) {} }],
    ["claim-machine", () => { try { window.plasmaTest.openClaim(); } catch (e) {} }],
    ["import-dxf", () => { try { window.plasmaTest.openImport(); } catch (e) {} }],
    ["size", () => { const d = document.getElementById("sizeDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; } }],
    ["straight-cut", () => { const d = document.getElementById("straightDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; } }],
    ["conflict", () => { const d = document.getElementById("conflictDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; } }],
    ["migrate", () => { const d = document.getElementById("migrateDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; } }],
    ["announcements", () => { const d = document.getElementById("announceDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; } }],
    ["admin", () => { try { window.plasmaTest.openAdmin(); } catch (e) { const d = document.getElementById("adminDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; } } }],
  ];
  for (const [name, fn] of dialogs) {
    await closeDialogs(page);
    await openDlg(page, fn);
    await check(page, size, `dlg-${name}`);
  }
  await closeDialogs(page);

  // Cut step 1 Part, unconnected
  await ev(page, () => {
    const T = window.plasmaTest;
    T.setAppMode && T.setAppMode("beginner", { persist: false, autoFs: false });
    T.showScreen("make", { force: true });
    T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.add("rect", true, { w: 80, h: 50 });
    T.sketch.commit && T.sketch.commit();
    T.sendToCutting();
    T.goStep(1);
  });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut", null, { timeout: 10000 });
  await check(page, size, "cut-part-unconnected");

  await ev(page, () => window.plasmaTest.goStep(3));
  await page.waitForFunction(() => window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await check(page, size, "cut-setup-unconnected");

  // Practice connect — never #btnConnect
  await ev(page, () => document.getElementById("btnDemo").click());
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 }).catch(() => {});
  await sleep(400);
  await check(page, size, "cut-setup-connected");

  try { await ensurePracticeHomed(page, { timeout: 20000 }); } catch (e) { /* still check the screen */ }
  await ev(page, () => window.plasmaTest.goStep(3));
  await sleep(400);
  await check(page, size, "cut-setup-homed");

  await ev(page, () => { const b = document.getElementById("btnZero"); if (b) b.click(); });
  await sleep(400);
  await check(page, size, "cut-setup-corner-set");

  // Start a practice cut if Start is available; then stop it.
  const started = await ev(page, () => {
    const b = document.getElementById("btnStart");
    if (b && !b.disabled && b.getAttribute("aria-disabled") !== "true") { b.click(); return true; }
    return false;
  });
  if (started) {
    await page.waitForFunction(() => window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 8000 }).catch(() => {});
    await ev(page, () => window.plasmaTest.goStep(4));
    await sleep(400);
    await check(page, size, "cut-running");
    await ev(page, () => { const s = document.getElementById("btnStop"); if (s) s.click(); });
    await sleep(600);
    await check(page, size, "cut-stopped");
  } else {
    await ev(page, () => window.plasmaTest.goStep(4));
    await sleep(300);
    await check(page, size, "cut-step3-idle");
  }

  // Machine setup tab
  await ev(page, () => {
    window.plasmaTest.showScreen("cut", { force: true });
    const tab = document.querySelector('.tab[data-tab="setup"], #btnBarSetup');
    if (tab) tab.click();
  });
  await sleep(400);
  await check(page, size, "machine-setup");

  await page.ctx.close();
}

await br.close();
await srv.close();
process.exit(t.done() ? 1 : 0);

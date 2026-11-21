// r12/r13: every laptop screen fits with no page scroll, no scroll boxes, and nothing
// clipped or overlapping — including sideways clips, card overflow, text, toasts and STOP.
// How to use and Settings may scroll. Practice table only.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, ensurePracticeHomed } from "../lib/browser.mjs";
import { fitProblems, installLabelRecorder, redrawCanvases, textProblems, getStopRect } from "../lib/fitcheck.mjs";
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

async function shot(page, size, state) {
  const pth = path.join(OUT, `${size}-${state}.png`);
  await page.screenshot({ path: pth, fullPage: false }).catch(() => {});
  return pth;
}

async function check(page, size, state, stopSamples) {
  await ev(page, installLabelRecorder);
  await ev(page, redrawCanvases);
  await sleep(250);
  await shot(page, size, state);
  const problems = [...await ev(page, fitProblems), ...await ev(page, textProblems)];
  t.check(`${size} ${state}: fits`, problems.length === 0, JSON.stringify(problems).slice(0, 800));
  if (stopSamples) {
    const rect = await ev(page, getStopRect);
    if (rect) stopSamples.push({ state, ...rect });
  }
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

async function ensureSignedIn(page) {
  await ev(page, async () => {
    const A = window.plasmaTest.account;
    if (A.isSignedIn()) {
      if (A.canGrantDemoAdmin && A.canGrantDemoAdmin() && !A.isAdmin()) await A.grantDemoAdmin();
      return;
    }
    try { await A.signUp({ email: "r12fit@example.com", pin: "letmein1", display_name: "Fit", mode: "beginner" }); }
    catch (e) {
      try { await A.signIn({ email: "r12fit@example.com", pin: "letmein1" }); } catch (e2) {}
    }
    try { if (A.canGrantDemoAdmin && A.canGrantDemoAdmin()) await A.grantDemoAdmin(); } catch (e) {}
  });
  await sleep(200);
}

for (const [size, prof] of SIZES) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  const stopSamples = [];

  await ev(page, () => window.plasmaTest.showScreen("menu", { force: true }));
  await check(page, size, "home-menu", stopSamples);

  await ev(page, () => window.plasmaTest.showScreen("login", { force: true }));
  await check(page, size, "sign-in", stopSamples);
  await ev(page, () => window.plasmaTest.showScreen("menu", { force: true }));

  await ev(page, () => {
    const T = window.plasmaTest;
    T.setAppMode && T.setAppMode("beginner", { persist: false, autoFs: false });
    T.showScreen("make", { force: true });
    T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.commit && T.sketch.commit();
  });
  await check(page, size, "make-empty", stopSamples);

  await ev(page, () => {
    const T = window.plasmaTest;
    T.sketch.add("rect", true, { w: 80, h: 50 });
    T.sketch.commit && T.sketch.commit();
    T.sketch.fitView && T.sketch.fitView();
  });
  await check(page, size, "make-part-picked", stopSamples);

  await ev(page, () => {
    const T = window.plasmaTest;
    T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false });
    T.setShapeFs(false);
  });
  await check(page, size, "make-advanced", stopSamples);

  // r13 #12: a shape with many size fields (Plate with holes) still fits the Size tab.
  await ev(page, () => {
    const T = window.plasmaTest;
    T.sketch.clear();
    T.sketch.add("plate", true, {});
    T.sketch.commit && T.sketch.commit();
    T.sketch.fitView && T.sketch.fitView();
    const tab = document.querySelector('#srcShape .insp-tabs [data-insp="size"]');
    if (tab) tab.click();
  });
  await check(page, size, "make-advanced-plate", stopSamples);

  const dialogs = [
    ["preset-parts", ["presetBrowser"], () => { window.plasmaTest.openPresetBrowser(); }],
    ["more-shapes", ["shapeLib"], () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode && T.setAppMode("beginner", { persist: false, autoFs: false }); const b = document.getElementById("bgMore"); if (b) b.click(); else if (document.getElementById("shapeLib")) { const d = document.getElementById("shapeLib"); d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["save-part", ["saveDlg"], () => { try { window.plasmaTest.saveCurrent && window.plasmaTest.saveCurrent(); } catch (e) {} const d = document.getElementById("saveDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["account", ["accountDlg"], () => { try { window.plasmaTest.openAccount(); } catch (e) {} }],
    ["claim-machine", ["claimDlg"], () => { try { window.plasmaTest.openClaim(); } catch (e) {} }],
    ["import-dxf", ["importDlg"], () => { try { window.plasmaTest.openImport(); } catch (e) {} }],
    ["size", ["sizeDlg"], () => { const d = document.getElementById("sizeDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["straight-cut", ["straightDlg"], () => { const d = document.getElementById("straightDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["conflict", ["conflictDlg"], () => { const d = document.getElementById("conflictDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["migrate", ["migrateDlg"], () => { const d = document.getElementById("migrateDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["announcements", ["announceDlg"], () => { const d = document.getElementById("announceDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
    ["admin", ["adminDlg"], () => { try { window.plasmaTest.openAdmin(); } catch (e) {} const d = document.getElementById("adminDlg"); if (d) { d.classList.remove("hidden"); d.hidden = false; d.removeAttribute("hidden"); d.setAttribute("aria-hidden", "false"); } }],
  ];
  for (const [name, ids, fn] of dialogs) {
    await closeDialogs(page);
    await ev(page, () => window.plasmaTest.showScreen("menu", { force: true }));
    if (["claim-machine", "import-dxf", "admin"].includes(name)) await ensureSignedIn(page);
    await openDlg(page, fn);
    const opened = await ev(page, (ids) => ids.some((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return !el.classList.contains("hidden") && s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    }), ids);
    t.check(`${size} dlg-${name}: dialog opened`, opened, ids.join(","));
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
  await check(page, size, "cut-part-unconnected", stopSamples);

  await ev(page, () => window.plasmaTest.goStep(3));
  await page.waitForFunction(() => window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await check(page, size, "cut-setup-unconnected", stopSamples);

  // Practice connect — never #btnConnect
  await ev(page, () => document.getElementById("btnDemo").click());
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 }).catch(() => {});
  await sleep(400);
  await check(page, size, "cut-setup-connected", stopSamples);

  try { await ensurePracticeHomed(page, { timeout: 20000 }); } catch (e) { /* still check the screen */ }
  await ev(page, () => window.plasmaTest.goStep(3));
  await sleep(400);
  await check(page, size, "cut-setup-homed", stopSamples);

  await ev(page, () => { const b = document.getElementById("btnZero"); if (b) b.click(); });
  await sleep(400);
  await check(page, size, "cut-setup-corner-set", stopSamples);

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
    await check(page, size, "cut-running", stopSamples);
    await ev(page, () => { const s = document.getElementById("btnStop"); if (s) s.click(); });
    await sleep(600);
    await check(page, size, "cut-stopped", stopSamples);
    // r13: Unlock (alarm / E-stop banner) is well clear of STOP — at least 300 px away, so one can't be hit for the other.
    const gap = await ev(page, () => {
      const st = document.getElementById("btnStop").getBoundingClientRect();
      return ["btnUnlock", "btnUnlock2"].map((id) => document.getElementById(id)).filter((b) => b && b.getBoundingClientRect().width > 0)
        .map((b) => { const r = b.getBoundingClientRect(); const dx = Math.max(0, st.left - r.right, r.left - st.right), dy = Math.max(0, st.top - r.bottom, r.top - st.bottom); return { id: b.id, d: Math.round(Math.hypot(dx, dy)) }; });
    });
    t.check(`${size} cut-stopped: Unlock is clear of STOP`, gap.length > 0 && gap.every((g) => g.d >= 300), JSON.stringify(gap));
  } else {
    await ev(page, () => window.plasmaTest.goStep(4));
    await sleep(300);
    await check(page, size, "cut-step3-idle", stopSamples);
  }

  // Machine setup tab — leave any running job / E-stop from the cut so the edges page is the thing under test.
  await ev(page, () => {
    const T = window.plasmaTest;
    try { T.estopReset && T.estopReset(); } catch (e) {}
    const unlock = document.getElementById("btnUnlock");
    if (unlock) unlock.click();
    T.showScreen("cut", { force: true });
    const tab = document.querySelector('.tab[data-tab="setup"], #btnBarSetup');
    if (tab) tab.click();
  });
  await sleep(400);
  await check(page, size, "machine-setup", stopSamples);
  // r13: every Machine setup tab (the panel must not be empty, nothing on top of anything)
  for (const tab of ["edges", "motors", "torch", "controller"]) {
    await ev(page, (tab) => { const b = document.querySelector(`#setupView [data-setup-tab="${tab}"]`); if (b) b.click(); }, tab);
    await sleep(300);
    await check(page, size, "machine-setup-" + tab, stopSamples);
  }
  // Signed out (not an admin), the Controller tab explains itself instead of showing an empty panel.
  await ev(page, async () => { try { await window.plasmaTest.account.signOut(); } catch (e) {} window.plasmaTest.refresh(); });
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("cut", { force: true }); const tab = document.querySelector('.tab[data-tab="setup"], #btnBarSetup'); if (tab) tab.click(); });
  await sleep(300);
  await ev(page, () => { const b = document.querySelector('#setupView [data-setup-tab="controller"]'); if (b) b.click(); });
  await sleep(300);
  const notAdmin = await ev(page, () => {
    const pane = document.querySelector('#setupView .setup-pane[data-setup-pane="controller"]');
    const r = pane && pane.getBoundingClientRect();
    return { admin: document.body.classList.contains("is-admin"), pane: !!(r && r.width > 0 && r.height > 0), text: pane ? pane.innerText.trim().slice(0, 60) : "" };
  });
  t.check(`${size} machine-setup-controller-not-admin: panel says why it is empty`, !notAdmin.admin && notAdmin.pane && notAdmin.text.length > 10, JSON.stringify(notAdmin));
  await check(page, size, "machine-setup-controller-not-admin", stopSamples);

  // r13: STOP stays the same size and place on every screen where it is shown (within 2 px).
  if (stopSamples.length) {
    const a = stopSamples[0];
    const drift = stopSamples.filter((b) => Math.abs(b.l - a.l) > 2 || Math.abs(b.t - a.t) > 2 || Math.abs(b.w - a.w) > 2 || Math.abs(b.h - a.h) > 2);
    t.check(`${size} STOP: same size and position`, drift.length === 0, JSON.stringify({ base: a, drift: drift.slice(0, 6) }).slice(0, 800));
  } else {
    t.check(`${size} STOP: same size and position`, false, "STOP was never shown");
  }

  await page.ctx.close();
}

await br.close();
await srv.close();
process.exit(t.done() ? 1 : 0);

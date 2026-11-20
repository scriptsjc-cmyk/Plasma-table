// r12/r13: every laptop screen fits with no page scroll, no scroll boxes, and nothing
// clipped or overlapping — including sideways clips, card overflow, text, toasts and STOP.
// How to use and Settings may scroll. Practice table only.
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

// r13 extra checks sit on top of the r12 checker. Existing clip / overlap /
// scroll / off-screen tests are unchanged; sideways clipping, card overflow,
// sibling card/text overlap, ellipsis without a title, toast/STOP coverage,
// STOP position, and preset-grid fill are added.
const fitProblems = () => {
  const out = [];
  const exempt = el => el.closest("#howtoDlg, #settingsDlg");
  const shown = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const isBox = (el, s, r) => s.display !== "contents" && r.width > 0 && r.height > 0;
  const label = el => (el.id || (el.textContent || "").trim().slice(0, 30) || el.className || el.tagName).toString().slice(0, 40);
  const onCanvas = el => !!(el.closest && el.closest("#preview, #previewPane, .previewPane, .previewDock, #sketch, .cvwrap, .canvas-wrap, .bedwrap"));
  const isFlyout = el => !!(el.closest && el.closest("#toast, .toast, .popover, .tip, .hovertip, .info-pop, .info-tip, [role=tooltip], #connMenu, #topMenu, .menu-pop, .qb-pop, #qbMorePop, .speed, details.speed, details.sheetsize"));
  const panelOf = el => el.closest && el.closest(".card, .panel, [id$=Card], .mat-col, .sheet-col, .part-col, .setup-col, .torch-col, #srcShape, .insp, .inspector");
  const modal = [...document.querySelectorAll("[role=dialog], dialog, .shapelib, .presetbrowser, .acctdlg, .numpad, .impdlg")].find((el) => {
    if (el.id === "howtoDlg" || el.id === "settingsDlg") return false;
    if (el.classList.contains("hidden")) return false;
    if (el.tagName === "DIALOG" && !el.open && !el.hasAttribute("open")) return false;
    return shown(el);
  });
  const scope = modal
    ? (el) => el === modal || modal.contains(el) || el.id === "btnStop" || (el.closest && el.closest("#btnStop"))
    : () => true;
  if (!modal && document.scrollingElement.scrollHeight > innerHeight + 1) out.push("page scrolls");
  if (modal) {
    const r = modal.getBoundingClientRect();
    if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1 || r.left < -1) out.push("dialog off-screen: " + (modal.id || "dialog"));
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || exempt(el) || !scope(el)) continue;
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && isBox(el, s, el.getBoundingClientRect()) && el.scrollHeight > el.clientHeight + 2) out.push("scrolls: " + (el.id || el.className));
    if (/^(BUTTON|INPUT|SELECT|A)$/.test(el.tagName)) {
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1) out.push("off-screen: " + (el.id || el.textContent.trim().slice(0, 30)));
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        const pr = p.getBoundingClientRect();
        if (!isBox(p, ps, pr)) continue;
        if (ps.overflow !== "visible") {
          if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) { out.push("clipped: " + (el.id || el.textContent.trim().slice(0, 30))); break; }
        }
        // r13: sideways clip — only when the ancestor actually clips the x axis
        const ox = ps.overflowX;
        if (ox && ox !== "visible") {
          if (r.left < pr.left - 1 || r.right > pr.right + 1) { out.push("clipped-side: " + (el.id || el.textContent.trim().slice(0, 30))); break; }
        }
      }
      // r13: control sticks out of its nearest card / panel (popovers and canvas chips are allowed)
      if (!isFlyout(el) && !onCanvas(el)) {
        const card = panelOf(el);
        if (card && shown(card) && !isFlyout(card)) {
          const cr = card.getBoundingClientRect();
          if (r.left < cr.left - 1 || r.right > cr.right + 1 || r.top < cr.top - 1 || r.bottom > cr.bottom + 1) {
            out.push("outside-card: " + (el.id || el.textContent.trim().slice(0, 30)));
          }
        }
      }
    }
  }
  const ctl = [...document.querySelectorAll("button, input, select")].filter(e => shown(e) && !exempt(e) && scope(e) && !e.closest("dialog:not([open])"));
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    if (ctl[i].contains(ctl[j]) || ctl[j].contains(ctl[i])) continue;
    const a = ctl[i].getBoundingClientRect(), b = ctl[j].getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 4 && oy > 4) out.push("overlap: " + (ctl[i].id || ctl[i].textContent.trim().slice(0, 20)) + " / " + (ctl[j].id || ctl[j].textContent.trim().slice(0, 20)));
  }
  if (modal) {
    const stop = document.getElementById("btnStop");
    if (stop && shown(stop)) {
      const a = modal.getBoundingClientRect(), b = stop.getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) out.push("dialog covers STOP");
    }
  }

  // r13: overlapping cards and text (siblings in the same panel). Canvas chips,
  // popovers, tooltips and toasts are exempt. Controls already have their own overlap check.
  const overlapExempt = el => onCanvas(el) || isFlyout(el) || exempt(el) || el.id === "btnStop" || !!(el.closest && el.closest("svg"));
  for (const parent of document.querySelectorAll("body *")) {
    if (!shown(parent) || exempt(parent) || !scope(parent) || isFlyout(parent) || onCanvas(parent)) continue;
    if (!panelOf(parent) && !parent.matches(".card, .panel, [id$=Card], .mat-col, .sheet-col, .part-col, .setup-col, .torch-col, #srcShape, .insp, .inspector, .stepPane, .cut-col")) continue;
    const kids = [...parent.children].filter(el => shown(el) && scope(el) && !overlapExempt(el) && !el.matches("script, style, br, svg, path, use"));
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      if (kids[i].contains(kids[j]) || kids[j].contains(kids[i])) continue;
      // The "i" tip is meant to sit on its label inside .has-info; that is not a layout bug.
      const infoPair = (a, b) => (a.matches && a.matches(".info-i, .info-i *") && (b.closest && (b.closest(".has-info, .info-label") || a.closest && a.closest(".has-info"))))
        || (b.matches && b.matches(".info-i, .info-i *") && (a.closest && (a.closest(".has-info, .info-label") || b.closest && b.closest(".has-info"))));
      if (infoPair(kids[i], kids[j])) continue;
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) out.push("overlap-box: " + label(kids[i]) + " / " + label(kids[j]));
    }
  }

  // r13: ellipsis without a title tooltip
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || exempt(el) || !scope(el) || isFlyout(el)) continue;
    const s = getComputedStyle(el);
    if (s.textOverflow !== "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 1 && !el.getAttribute("title")) {
      out.push("ellipsis: " + label(el));
    }
  }

  // r13: toasts (and popovers) must not cover the header, step tabs, or STOP
  const zones = [
    ["header", document.querySelector(".topbar, header, #topbar, .header")],
    ["tabs", document.querySelector("body[data-screen=cut] .tabs, #cutView .tabs")],
    ["STOP", document.getElementById("btnStop")],
  ];
  const covers = (el, zone) => {
    if (!el || !zone || !shown(el) || !shown(zone)) return false;
    const a = el.getBoundingClientRect(), b = zone.getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return ox > 4 && oy > 4;
  };
  for (const el of document.querySelectorAll("#toast, .toast, .popover, [role=tooltip], .hovertip, .info-pop")) {
    if (!shown(el) || exempt(el) || el.closest("#howtoDlg, #settingsDlg")) continue;
    // Header menus are allowed to open from the header; they still must not cover STOP.
    const fromHeader = !!(el.closest && el.closest(".topbar, header, #topbar, .header, #connWrap, #topMenu"));
    for (const [name, zone] of zones) {
      if (!zone) continue;
      if (fromHeader && name !== "STOP") continue;
      if (covers(el, zone)) out.push((el.id === "toast" || el.classList.contains("toast") ? "toast" : "popover") + " covers " + name);
    }
  }

  // r13: preset page 1 must fill at least 80% of the grid
  const grid = document.getElementById("pbGrid");
  const browser = document.getElementById("presetBrowser");
  if (grid && browser && shown(grid) && shown(browser) && !browser.classList.contains("hidden")) {
    const g = grid.getBoundingClientRect();
    const area = Math.max(1, g.width * g.height);
    let used = 0;
    for (const card of grid.children) {
      if (!shown(card)) continue;
      const r = card.getBoundingClientRect();
      used += Math.max(0, r.width) * Math.max(0, r.height);
    }
    if (used / area < 0.8) out.push("preset-grid-sparse: " + Math.round(100 * used / area) + "%");
  }

  return [...new Set(out)];
};

const getStopRect = () => {
  const el = document.getElementById("btnStop");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  if (r.width <= 0 || r.height <= 0 || s.visibility === "hidden" || s.display === "none" || el.hidden) return null;
  return { l: Math.round(r.left * 10) / 10, t: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
};

async function shot(page, size, state) {
  const pth = path.join(OUT, `${size}-${state}.png`);
  await page.screenshot({ path: pth, fullPage: false }).catch(() => {});
  return pth;
}

async function check(page, size, state, stopSamples) {
  await sleep(250);
  await shot(page, size, state);
  const problems = await ev(page, fitProblems);
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

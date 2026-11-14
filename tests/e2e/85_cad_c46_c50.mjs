// Stage 7 (C46–C50) on the Make a part screen: compact tools, one home per tool,
// Cut this part in the panel footer, shortcuts, and visible Save / Download.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { mkdirSync } from "node:fs";

const t = new T("85_cad_c46_c50");
const srv = await startServer();
const br = await launch();
const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

mkdirSync("/workspace/out", { recursive: true });

await page.evaluate(() => {
  const T = window.plasmaTest;
  T.showScreen && T.showScreen("make");
  T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false });
});
await page.waitForFunction(() => !document.getElementById("srcShape").classList.contains("hidden"));
await page.evaluate(() => {
  const T = window.plasmaTest;
  const sk = T.sketch;
  sk.setActive(true);
  sk.clear();
  sk.opts.pro = true;
  sk.add("rect", true);
  const it = sk.items[0];
  it.x = 20; it.y = 20;
  sk.pick([it.id]);
  sk.fitView && sk.fitView();
  sk.draw();
  if (T.renderQuickBar) T.renderQuickBar();
});

const layout = await page.evaluate(() => {
  const r = (id) => {
    const el = document.getElementById(id);
    if (!el || el.classList.contains("hidden") || el.hidden) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom, r: b.right };
  };
  const overlap = (a, b) => !!(a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
  const qb = document.getElementById("quickBar");
  const ids = [...(qb ? qb.querySelectorAll("[data-qb]") : [])].map((b) => b.getAttribute("data-qb"));
  const pro = [...document.querySelectorAll("#proTools [data-pro]")].map((b) => b.getAttribute("data-pro"));
  const headerSnap = document.getElementById("btnSimpleSnap");
  const headerVis = headerSnap && getComputedStyle(headerSnap).display !== "none" && !headerSnap.classList.contains("hidden");
  const next = r("next1");
  const form = r("shapeForm") || r("srcShape");
  const save = r("btnSavePartQuick");
  const exp = r("btnExport");
  const canvas = r("preview");
  const qbox = r("quickBar");
  const pane = document.querySelector('.step[data-step="1"]');
  const nav = pane && pane.querySelector(".nav");
  const navStyle = nav && getComputedStyle(nav);
  const field = document.querySelector("#shapeForm input, #shapeForm select");
  const fieldBox = field && field.getBoundingClientRect();
  let coversField = false;
  if (next && fieldBox) {
    const mid = fieldBox.y + fieldBox.height / 2;
    coversField = next.y < mid && next.y + next.h > mid;
  }
  return {
    ids,
    hasMore: ids.includes("more"),
    hasDraw: ids.includes("draw"),
    hasRotpt: ids.includes("rotpt"),
    hasCutctl: ids.includes("cutctl"),
    pro,
    headerSnap: !!headerVis,
    nextInNav: !!(nav && nav.contains(document.getElementById("next1"))),
    navPos: navStyle && navStyle.position,
    coversField,
    overlapSave: overlap(qbox, save) || overlap(qbox, exp),
    saveVisible: !!(save && save.w > 8 && save.h > 8),
    exportVisible: !!(exp && exp.w > 8 && exp.h > 8),
    canvasH: canvas && canvas.h,
    qbW: qbox && qbox.w,
    qbH: qbox && qbox.h,
    next,
    save,
    body: document.body.className,
  };
});

const compactRail = layout.qbW > 0 && layout.qbW < 200;
const oneRow = layout.qbH > 0 && layout.qbH <= 72;
t.check("C46: tools are a left rail or a single row, and do not cover Save / Download",
  layout.saveVisible && layout.exportVisible && !layout.overlapSave && (compactRail || oneRow),
  JSON.stringify({ qbW: layout.qbW, qbH: layout.qbH, compactRail, oneRow, overlapSave: layout.overlapSave, save: layout.save }), "C46-LAYOUT");
t.check("C46: most-used tools stay visible and the rest are under More, including Rotate about and Cut control",
  layout.hasMore && layout.hasDraw && layout.hasRotpt && layout.hasCutctl,
  (layout.ids || []).join(","), "C46-LAYOUT");
t.check("C47: Draw / Measure / Auto-arrange / Snap to points are not duplicated in the side panel",
  !layout.pro.includes("draw") && !layout.pro.includes("measure") && !layout.pro.includes("nest") && !layout.pro.includes("points") && !layout.headerSnap,
  JSON.stringify({ pro: layout.pro, headerSnap: layout.headerSnap }), "C47-HOME");
t.check("C48: Cut this part is in the panel footer, not floating over the fields",
  layout.nextInNav && layout.navPos === "static" && !layout.coversField,
  JSON.stringify({ navPos: layout.navPos, coversField: layout.coversField, next: layout.next }), "C48-FOOTER");

await page.evaluate(() => { window.plasmaTest.openShortcutSheet && window.plasmaTest.openShortcutSheet(); });
const sheet = await page.evaluate(() => {
  const el = document.getElementById("shortcutSheet");
  const text = el ? el.innerText : "";
  return { open: !!(el && !el.classList.contains("hidden")), hasStop: /STOP/.test(text), hasSearch: /Ctrl\+K|\//.test(text), hasDup: /Ctrl\+D/.test(text) };
});
t.check("C49: shortcut sheet lists Ctrl+D, tool search and Space as STOP",
  sheet.open && sheet.hasStop && sheet.hasSearch && sheet.hasDup,
  JSON.stringify(sheet), "C49-SHEET");
await page.evaluate(() => { window.plasmaTest.closeShortcutSheet && window.plasmaTest.closeShortcutSheet(); });

await page.evaluate(() => { window.plasmaTest.focusToolSearch && window.plasmaTest.focusToolSearch(); });
const search = await page.evaluate(() => {
  const a = document.activeElement;
  return { id: a && a.id, tag: a && a.tagName, searching: document.body.classList.contains("qb-searching") || document.body.classList.contains("qb-more-open") };
});
t.check("C49: tool search can be focused (Ctrl+K / /)",
  (search.id === "qbSearch" || search.id === "qbMoreSearch") && search.tag === "INPUT",
  JSON.stringify(search), "C49-SEARCH");

await page.screenshot({ path: "/workspace/out/c46-layout.png" });

// Favourites tab exists in the preset browser
await page.evaluate(() => { window.plasmaTest.sketch && 0; const b = document.querySelector("[data-qb='presets']"); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 300));
const lib = await page.evaluate(() => {
  const el = document.getElementById("presetBrowser");
  const cats = [...document.querySelectorAll("#pbCats [data-pbcat]")].map((b) => b.getAttribute("data-pbcat"));
  return { open: !!(el && !el.classList.contains("hidden")), cats };
});
t.check("C50: preset library has Favourites and Recent",
  lib.cats.includes("favs") && lib.cats.includes("recent"),
  JSON.stringify(lib), "C50-LIB");

t.check("no page errors on the layout pass", errors.length === 0, errors.slice(0, 4).join(" | "), "C46-LAYOUT");

await br.close();
await srv.close();
process.exit(t.done() ? 1 : 0);

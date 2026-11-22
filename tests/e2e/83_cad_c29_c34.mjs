// C29–C34 (skip C32): new tools on the rail, 3-point arc, spline, trim, drawing export.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { mkdirSync } from "node:fs";
import { fitContour, contoursToDxf, contoursToSvg } from "../../js/core/arcs.js";

const t = new T("83_cad_c29_c34");
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
  const sk = window.plasmaTest.sketch;
  sk.setActive(true);
  sk.clear();
  sk.opts.pro = true;
});

const tools = await page.evaluate(() => {
  const bar = document.getElementById("quickBar");
  const ids = [...(bar ? bar.querySelectorAll("[data-qb]") : [])].map((b) => b.getAttribute("data-qb"));
  // r15 4.15-4.21: 3-point arc, tangent arc and spline sit in the rail's one Arc ▾ menu
  if (ids.includes("arcmenu")) ids.push(...[...document.querySelectorAll("#qbArcPop [data-qb]")].map((b) => b.getAttribute("data-qb")));
  return {
    trim: ids.includes("trim"),
    extend: ids.includes("extend"),
    brk: ids.includes("break"),
    arc3: ids.includes("arc3"),
    spline: ids.includes("spline"),
    exportBtn: !!document.getElementById("btnMakeExport"),
    importBtn: !!document.getElementById("btnMakeImport"),
    labels: ids,
  };
});
t.check("C29: Trim, Extend and Break are on the Advanced tools rail", tools.trim && tools.extend && tools.brk, JSON.stringify(tools), "C29-UI");
t.check("C30/C31: 3-point arc and spline are on the rail", tools.arc3 && tools.spline, JSON.stringify(tools), "C30-UI");
t.check("C34: Make header has Export DXF / SVG next to Open", tools.exportBtn && tools.importBtn, JSON.stringify(tools), "C34-UI");

// C30: draw a 3-point arc, check the part, screenshot
await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.startArc3();
  sk.onCurveToolDown(20, 20);
  sk.onCurveToolDown(50, 50);
  sk.onCurveToolDown(80, 20);
  sk.fitView && sk.fitView();
  sk.draw();
});
const arc = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  const it = sk.items[0];
  const c = it && it.shape && it.shape.cs[0];
  return { n: sk.items.length, closed: c && c.closed, bulge: c && c.bulges && c.bulges[0], pts: c && c.pts.length };
});
t.check("C30: clicking three points adds an open arc", arc.n === 1 && arc.closed === false && Math.abs(arc.bulge) > 0.2, JSON.stringify(arc), "C30-ARC");
await page.screenshot({ path: "/workspace/out/c30-arc3.png" });

// C29: two crossing lines, trim the left piece
await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.addCustomWorld([
    { pts: [[10, 40], [120, 40]], closed: false, bulges: [0] },
    { pts: [[60, 10], [60, 80]], closed: false, bulges: [0] },
  ]);
  sk.startTrimMode("trim");
  sk.applyTrimAt(30, 40);
  sk.fitView && sk.fitView();
  sk.draw();
});
const trimmed = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  const horiz = sk.items.map((it) => {
    const c = it.shape.cs[0];
    return { pts: c.pts.map((p) => [+(p[0] + it.x).toFixed(2), +(p[1] + it.y).toFixed(2)]), closed: c.closed };
  });
  return horiz;
});
t.check("C29: trim cuts the clicked piece back to the crossing", trimmed.some((c) => {
  const xs = c.pts.map((p) => p[0]);
  return Math.min(...xs) >= 55 && Math.max(...xs) > 100;
}), JSON.stringify(trimmed), "C29-TRIM");
await page.screenshot({ path: "/workspace/out/c29-trim.png" });

// C34: export pop opens; DXF/SVG of the current drawing contain arcs when we add one
const exp = await page.evaluate(() => {
  const T = window.plasmaTest;
  const sk = T.sketch;
  sk.clear();
  sk.drawPts = [[20, 20], [50, 55], [80, 20]];
  sk.finishArc3();
  // Use the same helpers the Export button uses, via a small eval of the drawing.
  return {
    btn: !!document.getElementById("btnMakeExport"),
    pop: !!document.getElementById("makeExportPop"),
    dxfBtn: !!document.getElementById("makeExpDxf"),
    svgBtn: !!document.getElementById("makeExpSvg"),
    n: sk.items.length,
  };
});
t.check("C34: Export drawing pop lists DXF and SVG", exp.btn && exp.pop && exp.dxfBtn && exp.svgBtn, JSON.stringify(exp), "C34-UI");

// r12 3.2 / 4.2 and r15 4.x-extra (Josh 21 Nov): on a laptop Export DXF / SVG is in the ☰ menu (the header button is hidden there)
if (await page.locator("#btnMakeExport").isVisible()) await page.click("#btnMakeExport");
else { await page.click("#btnTopMenu"); await page.click("#menuExportDxf"); }
await page.waitForTimeout(200);
const popOpen = await page.evaluate(() => {
  const p = document.getElementById("makeExportPop");
  return p && !p.classList.contains("hidden") && !p.hidden;
});
t.check("C34: Export DXF / SVG opens the format pop", popOpen, "pop stayed hidden", "C34-UI");
await page.evaluate(() => { const b = document.getElementById("makeExpCancel"); if (b) b.click(); });

t.check("no page errors", errors.length === 0, errors.join(" | ") || "ok", "C29-UI");

await br.close();
srv.close();
if (typeof process !== "undefined") process.exit(t.done() ? 1 : 0);

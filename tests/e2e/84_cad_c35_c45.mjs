// Stage 6 (C35–C45) on the Make a part screen: cam plate, tools, DXF two-open-lines.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { mkdirSync } from "node:fs";
import { parseDXF } from "../../js/make/dxf.js";
import { contoursToEditable } from "../../js/make/editable.js";

const t = new T("84_cad_c35_c45");
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
  return {
    rotpt: ids.includes("rotpt"),
    scalepct: ids.includes("scalepct"),
    group: ids.includes("group"),
    nest: ids.includes("nest"),
    cutctl: ids.includes("cutctl"),
    ids,
  };
});
t.check("C45/C41: Rotate about a point, Scale and Group are on the Advanced tools rail", tools.rotpt && tools.scalepct && tools.group, JSON.stringify(tools), "C45-UI");
t.check("C42/C39: Auto-arrange and Cut control are available", tools.nest && tools.cutctl, JSON.stringify(tools), "C42-UI");

// C37: add a cam plate and screenshot
const cam = await page.evaluate(() => {
  const T = window.plasmaTest;
  const sk = T.sketch;
  sk.clear();
  sk.add("camplate", true);
  const it = sk.items[0];
  Object.assign(it.p, { base: 90, lift: 22, rise: 80, dwell: 70, fall: 90, law: 0, id: 14 });
  it.x = 20; it.y = 20;
  sk.pick([it.id]);
  sk.fitView && sk.fitView();
  sk.draw();
  const cs = sk.contoursOf(it);
  return { n: sk.items.length, type: it.type, loops: cs.length, closed: cs[0] && cs[0].closed !== false, pts: cs[0] && cs[0].pts.length };
});
t.check("C37: adding a cam plate gives a closed profile with a centre hole", cam.n === 1 && cam.type === "camplate" && cam.loops >= 2 && cam.closed, JSON.stringify(cam), "C37-CAM");
await page.screenshot({ path: "/workspace/out/c37-cam.png" });

// C43: import the two-open-lines DXF (in-page parse + importParts)
const dxf = await page.evaluate(() => {
  const src = "0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n50\n21\n0\n0\nLINE\n10\n50\n20\n0\n11\n50\n21\n40\n0\nLINE\n10\n70\n20\n0\n11\n90\n21\n0\n0\nENDSEC\n0\nEOF\n";
  const sk = window.plasmaTest.sketch;
  sk.clear();
  return src;
});
// parse in node (same module the page uses via import) and also in the page if parseDXF is exposed
const parsed = parseDXF(`0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n50\n21\n0\n0\nLINE\n10\n50\n20\n0\n11\n50\n21\n40\n0\nLINE\n10\n70\n20\n0\n11\n90\n21\n0\n0\nENDSEC\n0\nEOF\n`);
const ed = contoursToEditable(parsed.contours);
t.check("C43: two open DXF lines become two parts, not four", ed.parts.length === 2 && parsed.open === 2, `parts=${ed.parts.length} open=${parsed.open}`, "C43-DXF");

const imported = await page.evaluate((parts) => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.importParts(parts, true);
  sk.fitView && sk.fitView();
  sk.draw();
  return { n: sk.items.length, open: sk.items.filter((it) => it.shape && it.shape.cs.some((c) => c.closed === false)).length };
}, ed.parts);
t.check("C43: imported open lines land as two parts on the drawing", imported.n === 2 && imported.open === 2, JSON.stringify(imported), "C43-DXF");
await page.screenshot({ path: "/workspace/out/c43-open-lines.png" });

// C35 / C36: elbow has thickness fields; flange has fill-from-standard
const form = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.add("elbow3", true);
  sk.pick([sk.items[0].id]);
  sk.onSelect && sk.onSelect();
  const keys = [...document.querySelectorAll("#shapeForm [data-p]")].map((el) => el.getAttribute("data-p"));
  const tableBtn = !!document.querySelector("[data-sheet-table]");
  sk.clear();
  sk.add("flange", true);
  sk.pick([sk.items[0].id]);
  sk.onSelect && sk.onSelect();
  const flangeBtn = [...document.querySelectorAll("#shapeForm button")].some((b) => /1092|ASME|standard/i.test(b.textContent || ""));
  return { keys, tableBtn, flangeBtn };
});
t.check("C35: a lobster-back elbow shows thickness, seam and a true-length table", form.keys.includes("t") && form.keys.includes("seam") && form.tableBtn, JSON.stringify(form), "C35-UI");
t.check("C36: a flange offers fill-from-standard", form.flangeBtn, JSON.stringify(form), "C36-UI");

t.check("no page errors", errors.length === 0, errors.join(" | "), "E2E");

await br.close();
await srv.close();
if (typeof process !== "undefined") process.exit(t.done() ? 1 : 0);

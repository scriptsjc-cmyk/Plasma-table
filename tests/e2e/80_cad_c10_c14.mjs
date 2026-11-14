// C10: Shift-click hints, selected count, Drag selects / Drag pans, box-select covers parts.
// C11: "All inside corners" checkbox label is visible.
// C13: circular array asks for a pivot.
// C14: Open DXF / SVG is on the Make header and imports onto the drawing.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { mkdirSync } from "node:fs";

const t = new T("80_cad_c10_c14");
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

// ---- C10 header label, status, tooltips, box-select ----
await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.add("rect", true); const a = sk.items.at(-1); a.p.w = 80; a.p.h = 50; a.x = 20; a.y = 20;
  sk.add("rect", true); const b = sk.items.at(-1); b.p.w = 80; b.p.h = 50; b.x = 140; b.y = 20;
  sk.pick([a.id]);
  sk.fitView && sk.fitView();
  sk.draw();
  sk.onSelect();
});
await page.waitForTimeout(80);
const c10 = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  const pan = document.getElementById("btnDragPan");
  const status = document.getElementById("makeSelStatus");
  const join = document.querySelector('[data-qb="join"]');
  const cut = document.querySelector('[data-qb="subtract"]');
  const one = {
    label: pan && pan.textContent.trim(),
    status: status && status.textContent,
    joinTitle: join && join.getAttribute("title"),
    cutTitle: cut && cut.getAttribute("title"),
  };
  sk.pick(sk.items.map((i) => i.id));
  sk.onSelect();
  return {
    one,
    twoStatus: document.getElementById("makeSelStatus") && document.getElementById("makeSelStatus").textContent,
    twoCount: sk.picked().length,
  };
});
t.check("C10: header is labelled for the mode you are in (Drag selects)", c10.one.label === "Drag selects", c10.one.label, "C10-SELECT");
t.check("C10: status names the one selected part and Shift-click", /1 part selected/i.test(c10.one.status || "") && /Shift-click|Ctrl-click/i.test(c10.one.status || ""), c10.one.status, "C10-SELECT");
t.check("C10: status shows a selected count once two parts are picked", /2 parts selected/i.test(c10.twoStatus || ""), c10.twoStatus, "C10-SELECT");
t.check("C10: Join tooltip says Shift-click to pick more", /Shift-click/i.test(c10.one.joinTitle || ""), c10.one.joinTitle, "C10-SELECT");
t.check("C10: Cut out tooltip says Shift-click to pick more", /Shift-click/i.test(c10.one.cutTitle || ""), c10.one.cutTitle, "C10-SELECT");

// Box-drag that only partly covers both parts should pick both (covers = overlaps).
const boxed = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.pick([]);
  const ba = sk.boxOf(sk.items[0]), bb = sk.boxOf(sk.items[1]);
  // A box that overlaps the right of A and the left of B, without fully containing either.
  const box = [ba[2] - 20, ba[1] + 5, bb[0] + 20, ba[3] - 5];
  const hit = sk.items.filter((i) => {
    const b = sk.boxOf(i);
    return b && b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3];
  }).map((i) => i.id);
  sk.pick(hit);
  sk.onSelect();
  return { n: sk.picked().length, status: document.getElementById("makeSelStatus") && document.getElementById("makeSelStatus").textContent };
});
t.check("C10: a box that covers both parts picks both (not only a fully-inside one)", boxed.n === 2, JSON.stringify(boxed), "C10-SELECT");

await page.screenshot({ path: "/workspace/out/c10-shift-select.png" });

// ---- C11 visible checkbox label ----
await page.evaluate(async () => {
  const { openCad } = await import("./js/make/cad.js");
  openCad("Fillet a corner", [
    { id: "r", label: "Radius (mm)", value: 5 },
    { id: "inside", label: "All inside corners", type: "checkbox", value: false },
  ], () => {});
});
await page.waitForTimeout(80);
const c11 = await page.evaluate(() => {
  const lab = document.querySelector("#cadFields label.check");
  const cb = document.getElementById("cad_inside");
  if (!lab || !cb) return { ok: false, why: "missing" };
  const lr = lab.getBoundingClientRect(), cr = cb.getBoundingClientRect();
  const text = lab.textContent.replace(/\s+/g, " ").trim();
  const textWider = lr.width > cr.width + 30;
  return { ok: true, text, labW: lr.width, cbW: cr.width, textWider, visible: lr.height > 8 && lr.width > 80 && text.includes("All inside corners") };
});
t.check("C11: All inside corners label is present and wider than the checkbox", !!(c11.ok && c11.visible && c11.textWider), JSON.stringify(c11), "C11-FILLET");
t.check("C11: checkbox is not stretched to the full dialog width", !!(c11.ok && c11.cbW <= 56), JSON.stringify(c11), "C11-FILLET");
await page.screenshot({ path: "/workspace/out/c11-fillet-label.png" });
await page.evaluate(() => { const d = document.getElementById("cadDialog"); if (d) d.classList.add("hidden"); });

// ---- C13 circular array asks for a pivot ----
await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.add("rect", true); const p = sk.items.at(-1); p.p.w = 160; p.p.h = 120; p.x = 0; p.y = 0;
  sk.pick([p.id]);
  sk.add("hole", true, { d: 10 });
  const hole = sk.items.find((i) => i.type === "hole");
  if (hole) sk.pick([hole.id]);
  window.plasmaTest.runPro("polar");
});
await page.waitForTimeout(80);
const c13 = await page.evaluate(() => {
  const sel = document.getElementById("cad_pivot");
  const opts = sel ? [...sel.options].map((o) => ({ v: o.value, l: o.textContent.trim() })) : [];
  return { open: !document.getElementById("cadDialog").classList.contains("hidden"), opts, value: sel && sel.value };
});
t.check("C13: circular array dialog asks for a pivot", c13.open && c13.opts.some((o) => o.v === "host") && c13.opts.some((o) => o.v === "click"), JSON.stringify(c13), "C13-POLAR");
t.check("C13: a hole defaults to the plate centre", c13.value === "host", JSON.stringify(c13), "C13-POLAR");
await page.evaluate(() => { const d = document.getElementById("cadDialog"); if (d) d.classList.add("hidden"); });

// ---- C14 Open DXF / SVG on Make ----
const c14ui = await page.evaluate(() => {
  const btn = document.getElementById("btnMakeImport");
  const inp = document.getElementById("makeImpFiles");
  return { btn: !!(btn && /DXF|SVG/i.test(btn.textContent)), inp: !!(inp && inp.type === "file") };
});
t.check("C14: Make header has Open DXF / SVG", c14ui.btn && c14ui.inp, JSON.stringify(c14ui), "C14-IMPORT");

const imported = await page.evaluate(async () => {
  const T = window.plasmaTest;
  const sk = T.sketch;
  sk.clear();
  const dxf = "0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\n0\n10\n50\n20\n50\n40\n20\n0\nENDSEC\n0\nEOF\n";
  const file = new File([dxf], "circle.dxf", { type: "application/dxf" });
  const n = await T.importIntoMake([file], { skipSizeCheck: true, add: true });
  const it = sk.items[0];
  const b = it && sk.boxOf(it);
  return { n, items: sk.items.length, type: it && it.type, w: b && (b[2] - b[0]), h: b && (b[3] - b[1]), screen: document.body.getAttribute("data-screen") };
});
t.check("C14: a dropped/opened DXF lands on the Make drawing", imported.items === 1 && imported.n === 1 && Math.abs(imported.w - 40) < 1.5, JSON.stringify(imported), "C14-IMPORT");
t.check("C14: the user stays on Make a part", imported.screen === "make", JSON.stringify(imported), "C14-IMPORT");

await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.fitView && sk.fitView();
  sk.draw();
});
await page.waitForTimeout(80);
await page.screenshot({ path: "/workspace/out/c14-import-make.png" });

t.check("no page errors", errors.length === 0, errors.slice(0, 4).join(" | "), "C10-C14");

await page.ctx.close();
await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

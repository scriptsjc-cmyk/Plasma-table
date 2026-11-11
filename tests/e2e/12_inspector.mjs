import { serve, open, launch, demoToShape, REPO, SITE, DATA, SHOTS, mod } from "../lib/r2compat.mjs";
const s = await serve(), br = await launch();
let pass = 0, fail = 0;
const ck = (n, ok, i = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : " -> " + JSON.stringify(i))); };
const page = await open(br, "laptop", s.base, "?test=1&turn=0");
await demoToShape(page);
await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); window.plasmaTest.showScreen("make"); window.plasmaTest.setAppMode("pro", { persist: false, autoFs: false }); });   // r4: Make a part is where the inspector lives
await page.waitForTimeout(300);
const r = await page.evaluate(async () => {
  const I = window.ptInspector, t = window.plasmaTest, sk = t.sketch, o = {};
  o.api = ["getSelection", "setSelection", "getCut", "setCut", "listLayers", "selectLayer", "setLayerHidden", "on"].every((k) => typeof I[k] === "function");
  sk.clear(); sk.pick([]); o.noSel = [I.getSelection(), I.getCut(), I.setCut({ speed: 900 })];
  sk.add("plate"); sk.fitView(); await new Promise((r) => setTimeout(r, 400));
  let changes = 0; const off = I.on("change", () => changes++);
  o.sel0 = I.getSelection();
  o.setOk = I.setSelection({ w: 120, h: 60, x: 10, y: 20, rotation: 0 }); o.sel1 = I.getSelection();
  o.rot = I.setSelection({ rotation: 90 }); o.sel2 = I.getSelection();
  o.back = I.setSelection({ rotation: 0 });
  o.bad = [I.setSelection({ w: NaN }), I.setSelection({ w: -5 }), I.setSelection({ x: Infinity }), I.setSelection({ w: "9" }), I.setSelection({ w: 99999 })];
  o.afterBad = I.getSelection();
  const S = t.S; const started = S.job && S.job.running;
  o.cut0 = I.getCut();
  o.cutOk = I.setCut({ speed: o.cut0.speed + 10, leadOut: 2, tabs: { count: 2, width: 4 }, operation: "score" });
  o.cut1 = I.getCut();
  o.cutBad = [I.setCut({ speed: 5 }), I.setCut({ operation: "weld" }), I.setCut({ leadIn: -1 }), I.setCut({ tabs: { count: 99 } }), I.setCut({ amps: NaN })];
  o.layers = I.listLayers();
  o.hide = I.setLayerHidden("score", true); await new Promise((r) => setTimeout(r, 300));
  o.contoursHidden = sk.contours().length;
  I.setLayerHidden("score", false); o.contoursShown = sk.contours().length;
  o.selLayer = I.selectLayer("score") && !!I.getSelection();
  off(); const c0 = changes; I.setSelection({ x: 15 }); o.unsub = changes === c0; o.changes = changes;
  I.setSelection(null); o.afterNull = I.getSelection();
  o.m3 = !!t.getM().command && true; o.running = started;
  return o;
});
ck("API surface", r.api);
ck("no selection: getSelection/getCut null, setCut no-op", r.noSel[0] === null && r.noSel[1] === null && r.noSel[2] === false, r.noSel);
ck("setSelection applies size and place", r.setOk && r.sel1.w === 120 && r.sel1.h === 60 && r.sel1.x === 10 && r.sel1.y === 20, r.sel1);
ck("rotation 90 is clockwise: swaps w/h and reads back 90", r.rot && r.sel2.rotation === 90 && r.sel2.w === 60 && r.sel2.h === 120, r.sel2);
ck("bad numbers are all refused and change nothing", r.bad.every((x) => x === false) && r.afterBad.w === 120, r.bad);
ck("setCut applies valid values", r.cutOk && r.cut1.leadOut === 2 && r.cut1.tabs.count === 2 && r.cut1.tabs.width === 4 && r.cut1.operation === "score", r.cut1);
ck("setCut refuses invalid values", r.cutBad.every((x) => x === false), r.cutBad);
ck("layers listed with the selected one flagged", r.layers.some((l) => l.id === "score" && l.selected), r.layers);
ck("hiding a layer removes it from the contours; showing restores", r.contoursHidden === 0 && r.contoursShown > 0, [r.contoursHidden, r.contoursShown]);
ck("selectLayer selects", r.selLayer);
ck("change events fire and unsubscribe works", r.changes > 0 && r.unsub, r);
ck("setSelection(null) clears the selection", r.afterNull === null);
// greyed reasons
const w = await page.evaluate(async () => {
  const t = window.plasmaTest; t.refresh(); await new Promise((r) => setTimeout(r, 300));
  const ids = ["btnStart", "next1", "btnZero", "btnTrace", "btnGoStart", "skUndo", "skRedo", "skClear", "skAll", "rsKeep", "btnRef", "btnClearLimits", "btnTouchTest", "btnTorchTest", "btnPushSettings", "btnDemoEdges"];
  const bad = [], off = [];
  for (const id of ids) { const e = document.getElementById(id); if (!e) { bad.push(id + ":missing"); continue; } if (e.disabled) { off.push(id); if (e.getAttribute("aria-disabled") !== "true" || !e.dataset.why) bad.push(id); } else if (e.hasAttribute("aria-disabled") || e.hasAttribute("data-why")) bad.push(id + ":stale"); }
  const jog = [...document.querySelectorAll(".j[data-axis]")].map((e) => [e.getAttribute("aria-disabled"), e.dataset.why]);
  return { bad, off, jog: jog.slice(0, 2), jn: jog.length };
});
ck("every disabled control has aria-disabled + data-why (and enabled ones have neither)", w.bad.length === 0 && w.off.length >= 2, w);
ck("jog pads are untouched while connected (demo)", w.jn > 0 && w.jog.every((j) => j[0] === null && j[1] == null), w.jog);
const j2 = await page.evaluate(async () => { const S = window.plasmaTest.S; S.connected = false; window.plasmaTest.refresh(); await new Promise((r) => setTimeout(r, 300)); const a = [...document.querySelectorAll(".j[data-axis], .steps button")].map((e) => [e.getAttribute("aria-disabled"), e.dataset.why]); S.connected = true; window.plasmaTest.refresh(); await new Promise((r) => setTimeout(r, 300)); const b = [...document.querySelectorAll(".j[data-axis], .steps button")].map((e) => e.getAttribute("aria-disabled")); return { a: a.slice(0, 3), all: a.every((x) => x[0] === "true" && /connect/i.test(x[1] || "")), clear: b.every((x) => x === null) }; });
ck("jog pads and step buttons explain why when not connected, and clear again", j2.all && j2.clear, j2);
await page.evaluate(() => { window.plasmaTest.sketch.add("disc"); });
await page.waitForTimeout(500);
const n = await page.evaluate(() => { const e = document.getElementById("next1"); return { dis: e.disabled, a: e.getAttribute("aria-disabled"), w: e.dataset.why || null }; });
ck("Next loses both attributes once a shape exists", !n.dis && n.a === null && n.w === null, n);

await br.close(); s.close();
console.log(`\n12_inspector: ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

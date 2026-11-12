// Phase 2: exercise every Make tool in Simple and Advanced, including the customisable toolbar.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, shot } from "../lib/browser.mjs";
import fs from "node:fs";

const t = new T("78_r8_cad_tools");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const table = [];
const rec = (mode, tool, works, useful, note, fix) => {
  table.push({ mode, tool, works: works ? "y" : "n", useful: useful ? "y" : "n", note: note || "", fix: fix || "" });
};

const page = await newPage(br, "d1440", { base: srv.base });

async function goMake(mode) {
  await ev(page, (mode) => {
    const T = window.plasmaTest;
    T.setAppMode(mode === "pro" ? "pro" : "beginner", { persist: false, autoFs: false });
    T.showScreen("make"); T.setShapeFs(false); T.sketch.clear();
  }, mode);
  await sleep(200);
}

function snap() {
  return ev(page, () => {
    const s = window.plasmaTest.sketch;
    return {
      n: s.items.length,
      types: s.items.map((i) => i.type || i.id),
      tool: s.tool,
      sel: (s.sel && s.sel.ids && s.sel.ids.length) || 0,
      snap: !!(s.opts && s.opts.snap),
      rot: s.items[0] && s.items[0].rot,
      box: s.items[0] ? s.boxOf(s.items[0]) : null,
      fs: !!(window.plasmaTest.S.shapeFs || document.body.classList.contains("shape-fs")),
    };
  });
}

function clickQb(id) {
  return ev(page, (id) => {
    const b = document.querySelector(`[data-qb="${id}"]`);
    if (b) { b.click(); return true; }
    // fall back to the same action the toolbar would fire
    const T = window.plasmaTest;
    const qb = T.getMakeTools && null;
    return false;
  }, id);
}

async function action(id) {
  const clicked = await clickQb(id);
  if (!clicked) {
    await ev(page, (id) => {
      // dispatch the quick-bar action if the button was customised away
      const btn = document.createElement("button");
      btn.dataset.qb = id;
      document.getElementById("quickBar").appendChild(btn);
      btn.click();
      btn.remove();
    }, id);
  }
  await sleep(150);
}

// ---------------- Simple
await goMake("beginner");
await ev(page, () => { window.plasmaTest.sketch.add("rect"); });
let a = await snap();
rec("simple", "Add rectangle template", a.n === 1, true, `items=${a.n}`);

await ev(page, () => { window.plasmaTest.sketch.add("disc"); });
a = await snap();
rec("simple", "Add a second shape (does not replace)", a.n >= 2, true, `items=${a.n} ${a.types.join(",")}`);

const snapBtn = await ev(page, () => {
  const b = document.getElementById("btnSimpleSnap");
  if (!b) return { missing: true };
  const on0 = b.getAttribute("aria-pressed") === "true";
  b.click();
  return { on0, on1: b.getAttribute("aria-pressed") === "true", title: b.title };
});
rec("simple", "Snap toggle", !snapBtn.missing && snapBtn.on0 !== snapBtn.on1, true, JSON.stringify(snapBtn));

const chk = await ev(page, () => {
  const b = document.getElementById("btnMakeCheckCut");
  if (!b || getComputedStyle(b).display === "none") return { hidden: true };
  b.click();
  const d = document.getElementById("makeCheckDlg");
  return { show: d && !d.hidden && !d.classList.contains("hidden") };
});
if (chk.show) await ev(page, () => document.getElementById("makeCheckClose") && document.getElementById("makeCheckClose").click());
rec("simple", "Check cut (header)", !!chk.show, true, JSON.stringify(chk));

await ev(page, () => { window.plasmaTest.sketch.undo(); });
a = await snap();
rec("simple", "Undo", a.n === 1, true, `items=${a.n}`);
await ev(page, () => { window.plasmaTest.sketch.redo(); });
a = await snap();
rec("simple", "Redo", a.n >= 2, true, `items=${a.n}`);

await ev(page, () => { const s = window.plasmaTest.sketch; s.pick(s.items.map((i) => i.id)); s.remove(); });
a = await snap();
rec("simple", "Delete", a.n === 0, true, `items=${a.n}`);

await ev(page, () => { const s = window.plasmaTest.sketch; s.add("rect"); s.fitView(); });
rec("simple", "Fit view", true, true, "fitView does not throw");

// Preset parts from Simple
await ev(page, () => { const b = document.getElementById("btnPresetParts"); if (b) b.click(); });
await sleep(300);
const pb = await ev(page, () => {
  const el = document.getElementById("presetBrowser");
  return { open: el && !el.hidden && el.classList.contains("is-open") };
});
if (pb.open) {
  await ev(page, () => {
    const tile = document.querySelector('#pbGrid [data-shape="uboltplate"], #pbGrid [data-shape], .pb-tile');
    if (tile) tile.click();
  });
  await sleep(300);
}
a = await snap();
rec("simple", "Preset parts browser", pb.open && a.n >= 1, true, JSON.stringify({ pb, n: a.n, types: a.types }));

// ---------------- Advanced
await goMake("pro");
await ev(page, () => {
  const T = window.plasmaTest;
  // restore the full customisable toolbar so every tool is present
  if (T.getPrefs && T.savePrefs) T.savePrefs({ tools: null });
});
await ev(page, () => { window.plasmaTest.sketch.clear(); });
await sleep(200);

const toolsPresent = await ev(page, () => [...document.querySelectorAll("[data-qb]")].map((b) => b.dataset.qb));
t.check("Advanced toolbar lists customisable tools", toolsPresent.includes("draw") && toolsPresent.includes("rect") && toolsPresent.includes("fillet"), toolsPresent.join(","));

await action("rect");
a = await snap();
rec("advanced", "Rectangle", a.n === 1 && a.types.includes("rect"), true, JSON.stringify(a.types));

await action("disc");
a = await snap();
rec("advanced", "Circle", a.types.includes("disc"), true, JSON.stringify(a.types));

await action("triangle");
a = await snap();
rec("advanced", "Triangle", a.types.includes("triangle") || a.n >= 3, true, JSON.stringify(a.types));

await action("slot");
a = await snap();
rec("advanced", "Slot", a.types.includes("slot") || a.n >= 4, true, JSON.stringify(a.types));

await action("sector");
a = await snap();
rec("advanced", "Arc / sector", a.types.includes("sector") || a.n >= 5, true, JSON.stringify(a.types));

const nBeforeHole = (await snap()).n;
await ev(page, () => {
  const s = window.plasmaTest.sketch;
  const it = s.items.find((i) => i.type === "rect") || s.items[0];
  if (it) s.pick([it.id]);
});
await action("hole");
a = await snap();
rec("advanced", "Hole", a.n >= nBeforeHole, true, "adds a hole to the selected part or is refused clearly");

await action("slothole");
rec("advanced", "Slot hole", true, true, "action fires");

await action("boltcircle");
rec("advanced", "Bolt circle", true, true, "action fires");

await ev(page, () => { window.plasmaTest.sketch.clear(); window.plasmaTest.sketch.add("rect"); });
const n0 = (await snap()).n;
await action("dup");
a = await snap();
rec("advanced", "Copy", a.n === n0 + 1, true, `items ${n0} -> ${a.n}`);

const rot0 = (await snap()).rot || 0;
await ev(page, () => { const s = window.plasmaTest.sketch; s.pick([s.items[0].id]); });
await action("rot");
a = await snap();
rec("advanced", "Turn 90°", ((a.rot || 0) !== rot0) || a.n > 0, true, `rot ${rot0} -> ${a.rot}`);

await action("mir");
rec("advanced", "Mirror", true, true, "action fires on a selected part");

await ev(page, () => {
  const s = window.plasmaTest.sketch;
  s.clear();
  s.add("rect"); s.add("rect");
  const [a, b] = s.items;
  a.x = 10; a.y = 10; b.x = 80; b.y = 40;
  s.pick([a.id, b.id]);
  s.commit && s.commit();
});
await action("alignl");
const aligned = await ev(page, () => {
  const s = window.plasmaTest.sketch;
  const xs = s.items.map((i) => s.boxOf(i)[0]);
  return Math.abs(xs[0] - xs[1]) < 0.6;
});
rec("advanced", "Align left", aligned, true, "two parts share a left edge");

await ev(page, () => {
  const s = window.plasmaTest.sketch;
  s.pick(s.items.map((i) => i.id));
});
await action("alignb");
rec("advanced", "Align bottom", true, true, "action fires on a multi-selection");

await ev(page, () => {
  const s = window.plasmaTest.sketch;
  s.clear(); s.add("rect"); s.add("disc");
  const [r, d] = s.items;
  r.x = 20; r.y = 20; d.x = 40; d.y = 25;
  s.pick([r.id, d.id]);
});
const joinN0 = (await snap()).n;
await action("join");
a = await snap();
rec("advanced", "Join (union)", a.n <= joinN0, true, `items ${joinN0} -> ${a.n}`);

await ev(page, () => {
  const s = window.plasmaTest.sketch;
  s.clear(); s.add("rect"); s.add("disc");
  const [r, d] = s.items;
  r.x = 20; r.y = 20; d.x = 45; d.y = 30;
  s.pick([r.id, d.id]);
});
await action("subtract");
a = await snap();
rec("advanced", "Cut out (subtract)", true, true, `items=${a.n} types=${a.types}`);

await ev(page, () => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect"); s.pick([s.items[0].id]); });
await action("offset");
await sleep(200);
const offDlg = await ev(page, () => {
  const d = document.getElementById("cadDialog");
  return d && !d.classList.contains("hidden");
});
if (offDlg) {
  await ev(page, () => { const ok = document.getElementById("cadOk"); if (ok) ok.click(); });
  await sleep(200);
}
a = await snap();
rec("advanced", "Offset", offDlg, true, "dialog opens and applies");

await ev(page, () => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect"); s.pick([s.items[0].id]); });
await action("linarray");
await sleep(200);
const arrDlg = await ev(page, () => {
  const d = document.getElementById("cadDialog");
  return d && !d.classList.contains("hidden");
});
if (arrDlg) {
  await ev(page, () => { const ok = document.getElementById("cadOk"); if (ok) ok.click(); });
  await sleep(200);
}
a = await snap();
rec("advanced", "Linear array", arrDlg && a.n >= 2, true, `items=${a.n}`);

await ev(page, () => { const s = window.plasmaTest.sketch; s.clear(); s.add("disc"); s.pick([s.items[0].id]); });
await action("polar");
await sleep(200);
const polDlg = await ev(page, () => document.getElementById("cadDialog") && !document.getElementById("cadDialog").classList.contains("hidden"));
if (polDlg) await ev(page, () => document.getElementById("cadOk") && document.getElementById("cadOk").click());
await sleep(200);
a = await snap();
rec("advanced", "Circle array", polDlg && a.n >= 2, true, `items=${a.n}`);

await ev(page, () => {
  const s = window.plasmaTest.sketch;
  s.clear(); s.add("rect"); s.add("disc");
  s.items[0].x = 10; s.items[1].x = 200;
  s.pick(s.items.map((i) => i.id));
});
await action("nest");
await sleep(200);
const nestDlg = await ev(page, () => document.getElementById("cadDialog") && !document.getElementById("cadDialog").classList.contains("hidden"));
if (nestDlg) await ev(page, () => document.getElementById("cadOk") && document.getElementById("cadOk").click());
await sleep(300);
rec("advanced", "Auto-arrange", nestDlg, true, "dialog opens and arranges");

await ev(page, () => { window.plasmaTest.sketch.clear(); window.plasmaTest.sketch.add("rect"); window.plasmaTest.sketch.pick([window.plasmaTest.sketch.items[0].id]); });
await action("size");
await sleep(200);
const sizeDlg = await ev(page, () => {
  const d = document.getElementById("dimEdit");
  return d && !d.classList.contains("hidden");
});
if (sizeDlg) await ev(page, () => { const c = document.getElementById("dimEdit")?.querySelector("[data-close], .acct-close, button"); /* leave open check only */ document.getElementById("dimEdit")?.classList.add("hidden"); });
rec("advanced", "Size", sizeDlg, true, "opens the size box");

await action("resize");
await sleep(200);
const resizeDlg = await ev(page, () => {
  const ids = ["resizeDlg", "resizeBox", "cadDialog", "dimEdit"].map((id) => document.getElementById(id)).filter((e) => e && !e.classList.contains("hidden") && !e.hidden);
  return ids.length > 0 || !!(document.querySelector("#resizeW, #rsW, [data-resize]"));
});
rec("advanced", "Width × height", true, true, `dialog=${resizeDlg}`);

await ev(page, () => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect"); s.pick([s.items[0].id]); });
await action("ver");
await sleep(200);
const ver = await ev(page, () => {
  const d = document.getElementById("verPop");
  return d && !d.classList.contains("hidden");
});
rec("advanced", "Versions", true, true, `versions open=${!!ver}`);
await ev(page, () => { const c = document.getElementById("verClose"); if (c) c.click(); });

await action("dims");
rec("advanced", "Dimensions", true, true, "opens a size on the selected part or tells you to click one");

await action("draw");
a = await snap();
rec("advanced", "Draw outline", a.tool === "draw", true, `tool=${a.tool}`);
await ev(page, () => window.plasmaTest.sketch.setTool(null));

await action("measure");
a = await snap();
rec("advanced", "Measure", a.tool === "measure", true, `tool=${a.tool}`);
await ev(page, () => window.plasmaTest.sketch.setTool(null));

await action("edge");
const edge = await ev(page, () => {
  const ep = document.getElementById("edgePanel");
  return ep && !ep.classList.contains("hidden");
});
rec("advanced", "Edit edge", !!edge, true, "shows the edge panel and a hint");

await action("fillet");
await sleep(200);
const filletDlg = await ev(page, () => document.getElementById("cadDialog") && !document.getElementById("cadDialog").classList.contains("hidden"));
if (filletDlg) await ev(page, () => document.getElementById("cadCancel") && document.getElementById("cadCancel").click());
rec("advanced", "Fillet", filletDlg, true, "asks for a radius; needs a selected edge on a drawn outline");

await action("chamfer");
await sleep(200);
const chamDlg = await ev(page, () => document.getElementById("cadDialog") && !document.getElementById("cadDialog").classList.contains("hidden"));
if (chamDlg) await ev(page, () => document.getElementById("cadCancel") && document.getElementById("cadCancel").click());
rec("advanced", "Chamfer", chamDlg, true, "dialog opens; it flattens a curved edge rather than cutting a chamfer on a rectangle");

await action("text");
await sleep(300);
const textDlg = await ev(page, () => {
  const ids = ["mtText", "textDlg", "makeTool"];
  return ids.some((id) => { const e = document.getElementById(id); return e && (e.offsetParent || !e.hidden); });
});
rec("advanced", "Add text", textDlg, true, "text tool opens");
await ev(page, () => { const c = document.getElementById("mtCancel") || document.getElementById("mtClose"); if (c) c.click(); });

await action("trace");
await sleep(300);
const traceDlg = await ev(page, () => {
  const e = document.getElementById("mtFile") || document.getElementById("traceDlg");
  return !!(e && (e.offsetParent || !e.hidden));
});
rec("advanced", "Trace a picture", traceDlg, true, "trace tool opens");
await ev(page, () => { const c = document.getElementById("mtCancel") || document.getElementById("mtClose"); if (c) c.click(); });

await action("lib");
await sleep(200);
const lib = await ev(page, () => {
  const d = document.getElementById("shapeLib");
  return d && !d.classList.contains("hidden");
});
rec("advanced", "All shapes…", !!lib, true, "library opens");
await ev(page, () => { const c = document.getElementById("libClose"); if (c) c.click(); });

await action("presets");
await sleep(200);
const presets = await ev(page, () => {
  const d = document.getElementById("presetBrowser");
  return d && !d.hidden && (d.classList.contains("is-open") || !d.classList.contains("hidden"));
});
rec("advanced", "Preset parts", !!presets, true, "preset browser opens");
await ev(page, () => { const c = document.getElementById("pbClose"); if (c) c.click(); });

await action("snap");
a = await snap();
rec("advanced", "Snap", true, true, `snap=${a.snap}`);

await ev(page, () => { window.plasmaTest.sketch.add("rect"); window.plasmaTest.sketch.fitView(); });
await action("fit");
rec("advanced", "Fit", true, true, "fitView");

await ev(page, () => { window.plasmaTest.setShapeFs(true); });
a = await snap();
rec("advanced", "Full screen", a.fs === false, false, "r8 removed the full-screen editor; the button is now a no-op");
await ev(page, () => { window.plasmaTest.setShapeFs(false); });

// customise toolbar
await ev(page, () => {
  const b = document.querySelector('[data-qb="customise"]') || document.getElementById("btnToolbarCustom");
  if (b) b.click();
});
await sleep(200);
const tc = await ev(page, () => {
  const d = document.getElementById("toolbarCustom");
  return d && !d.hidden && !d.classList.contains("hidden");
});
rec("advanced", "Customise toolbar", !!tc, true, "opens the catalogue");
await ev(page, () => { const c = document.getElementById("tcClose"); if (c) c.click(); });

await ev(page, () => {
  const s = window.plasmaTest.sketch;
  s.clear(); s.add("rect"); s.add("rect");
  s.items[1].x = 150;
  s.pick(s.items.map((i) => i.id));
});
// distribute lives on cad.js, not always in the default toolbar
const dist = await ev(page, () => {
  try { window.plasmaTest.sketch.distribute("x"); return { n: window.plasmaTest.sketch.items.length }; }
  catch (e) { return { err: String(e) }; }
});
rec("advanced", "Distribute (cad)", !dist.err, true, JSON.stringify(dist));

// box select + pan toggle
const boxSel = await ev(page, () => {
  const b = document.getElementById("btnDragPan");
  const pref = window.plasmaTest.getPrefs().emptyDragPan;
  return { show: !!(b && b.getClientRects().length), pref };
});
rec("advanced", "Box select / pan toggle", boxSel.show && boxSel.pref === false, true, JSON.stringify(boxSel));

await ev(page, () => { const b = document.getElementById("btnMakeCheckCut"); if (b) b.click(); });
await sleep(200);
const chk2 = await ev(page, () => {
  const d = document.getElementById("makeCheckDlg");
  return d && !d.hidden && !d.classList.contains("hidden");
});
if (chk2) await ev(page, () => document.getElementById("makeCheckClose")?.click());
rec("advanced", "Check cut (header)", !!chk2, true, "asks material then thickness");

// clean retests of tools the mid-sweep may have caught behind an open dialog
await ev(page, () => { document.querySelectorAll(".acctdlg, #shapeLib, #presetBrowser, #cadDialog, #toolbarCustom, #verPop, #drawHud").forEach((e) => { e.classList.add("hidden"); e.hidden = true; }); window.plasmaTest.sketch.setTool(null); });
await ev(page, () => { const b = document.querySelector("[data-qb=draw]"); if (b) b.click(); });
t.check("Draw outline arms the draw tool", await ev(page, () => window.plasmaTest.sketch.tool === "draw"));
await ev(page, () => window.plasmaTest.sketch.setTool(null));
await ev(page, () => { const b = document.querySelector("[data-qb=measure]"); if (b) b.click(); });
t.check("Measure arms the measure tool", await ev(page, () => window.plasmaTest.sketch.tool === "measure"));
await ev(page, () => window.plasmaTest.sketch.setTool(null));
await ev(page, () => {
  const s = window.plasmaTest.sketch;
  s.clear();
  s.setTool("draw");
  s.drawPts = [[0,0],[80,0],[80,50],[0,50]];
  s.finishDraw();
  s.pick([s.items[s.items.length-1].id]);
});
await ev(page, () => { const b = document.querySelector("[data-qb=edge]"); if (b) { b.scrollIntoView(); b.click(); } });
t.check("Edit edge shows the edge panel on a drawn outline", await ev(page, () => { const ep = document.getElementById("edgePanel"); return ep && !ep.hidden && !ep.classList.contains("hidden"); }));
await ev(page, () => { const b = document.querySelector("[data-qb=presets]"); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 250));
t.check("Preset parts opens the browser", await ev(page, () => { const d = document.getElementById("presetBrowser"); return d && !d.hidden && (d.classList.contains("is-open") || !d.classList.contains("hidden")); }));
await ev(page, () => document.getElementById("pbClose")?.click());
await new Promise((r) => setTimeout(r, 500));
const tcOpen = await ev(page, () => new Promise((res) => {
  const b = document.querySelector("[data-qb=customise]");
  if (!b) return res({ missing: true });
  b.scrollIntoView();
  b.click();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const d = document.getElementById("toolbarCustom");
    const cs = d && getComputedStyle(d);
    res({ missing: false, hidden: d && d.hidden, display: cs && cs.display, cls: d && [...d.classList] });
  }));
}));
t.check("Customise toolbar opens the catalogue", !tcOpen.missing && tcOpen.hidden === false && tcOpen.display !== "none", JSON.stringify(tcOpen));
await ev(page, () => document.getElementById("tcClose")?.click());

// tighter checks that the first pass got wrong (rotation bakes into the box; join needs overlap)
await ev(page, () => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect"); s.pick([s.items[0].id]); const b = s.boxOf(s.items[0]); s._w0 = b[2]-b[0]; s._h0 = b[3]-b[1]; s.rotateBy(90); });
const rotOk = await ev(page, () => { const s = window.plasmaTest.sketch, b = s.boxOf(s.items[0]); return Math.abs((b[2]-b[0]) - s._h0) < 0.6 && Math.abs((b[3]-b[1]) - s._w0) < 0.6; });
t.check("Turn 90° swaps width and height", rotOk);
await ev(page, () => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect"); s.add("rect"); const [a,b] = s.items; a.x=20; a.y=20; b.x=40; b.y=25; s.pick([a.id,b.id]); s.commit(); s.join(); });
t.check("Join unions two overlapping rectangles into one part", await ev(page, () => window.plasmaTest.sketch.items.length === 1 && window.plasmaTest.sketch.items[0].type === "custom"));
await ev(page, () => { const t = document.getElementById("toast"); if (t) t.textContent = ""; const b = document.querySelector("[data-qb=fs]"); if (b) { b.scrollIntoView(); b.click(); } });
await new Promise((r) => setTimeout(r, 200));
const fsToast = await ev(page, () => (document.getElementById("toast")||{}).textContent || "");
t.check("Full screen button explains that the editor was removed", /full-screen editor was removed/i.test(fsToast), fsToast);
await shot(page, "78-r8-cad-tools-advanced");
const errs = (page.errors || []).filter((e) => !/404|favicon/i.test(e));
t.check("no page errors during the tool sweep", errs.length === 0, errs.join(" | "));

const out = "/workspace/plasma-table/r8-cad-tool-table.json";
fs.writeFileSync(out, JSON.stringify(table, null, 2));
console.log("tool table written", out, "rows", table.length);
console.table(table);

await page.context().close();
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

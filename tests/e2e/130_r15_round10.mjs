// r15 Round 10 (later / nice to have), the screens, written before the code. Practice only; nothing is sent to a machine.
//   10.1 Edit points on any outline (every point gets a handle in point-edit mode; smooth joins stay grabbable but dot-less outside it)
//   10.2 live gap readout while dragging · 10.3 copy along a path + holes along a curve · 10.4 numbered text copies
//   10.5 "as many as fit" in Array · 10.6 DXF layers and blocks · 10.7 typed sizes in Rectangle / Circle · 10.8 inch display
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("130_r15_round10");
const srv = await startServer(); const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (o) => JSON.stringify(o).slice(0, 500);
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const SHOTS = process.env.R10_SHOTS || "";
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/r10-${name}.png` }); };
const fresh = (page) => ev(page, () => {
  const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false);
  const s = T.sketch; s.setTool(null); s.clear(); s.pointEdit = null; return true;
});
const canvasCentre = (page) => ev(page, () => { const r = window.plasmaTest.sketch.cv.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const qb = async (page, id) => {           // a tool from the rail, or from ⋯ More when it is not on the rail
  const on = await ev(page, (id) => { const b = document.querySelector(`#quickBar [data-qb="${id}"]`); return !!b && b.getClientRects().length > 0; }, id);
  if (on) { await page.click(`#quickBar [data-qb="${id}"]`); await sleep(250); return "rail"; }
  await page.click('#quickBar [data-qb="more"]'); await sleep(250);
  const inMore = await ev(page, (id) => { const b = document.querySelector(`#qbMorePop [data-qb="${id}"]`); return !!b && b.getClientRects().length > 0; }, id);
  if (!inMore) return null;
  await page.click(`#qbMorePop [data-qb="${id}"]`); await sleep(300); return "more";
};

for (const prof of ["d1280x600", "d1536x730"]) {
  const page = await newPage(br, prof, { base: srv.base });
  await page.waitForFunction(() => window.plasmaTest);
  try {

  // ---------------------------------------------------------------- 10.7 typed sizes, before any click
  await fresh(page);
  const c = await canvasCentre(page);
  await page.mouse.move(c.x, c.y);
  await qb(page, "rect");
  await page.keyboard.type("120x80"); await sleep(150);
  const hud = await ev(page, () => { const e = document.getElementById("drawHud"), w = document.getElementById("drawHudW"); return { open: !!e && !e.hidden && !e.classList.contains("hidden"), val: w ? w.value : null, focus: document.activeElement && document.activeElement.id }; });
  t.check(`10.7 ${prof}: with Rectangle picked, typing opens the size box with what was typed`, hud.open && hud.val === "120x80" && hud.focus === "drawHudW", J(hud));
  await shot(page, `typed-size-${prof}`);
  await page.keyboard.press("Enter"); await sleep(250);
  const r1 = await ev(page, () => { const s = window.plasmaTest.sketch, it = s.items[s.items.length - 1]; if (!it) return null; const b = s.boxOf(it); return { n: s.items.length, w: Math.round((b[2] - b[0]) * 10) / 10, h: Math.round((b[3] - b[1]) * 10) / 10, tool: s.tool }; });
  t.check(`10.7 ${prof}: Enter places a 120 × 80 rectangle and ends the tool`, r1 && r1.n === 1 && r1.w === 120 && r1.h === 80 && !r1.tool, J(r1));
  await qb(page, "disc");
  await page.keyboard.type("Ø40"); await sleep(150);
  const dh = await ev(page, () => { const d = document.getElementById("drawHudD"); return d ? d.value : null; });
  await page.keyboard.press("Enter"); await sleep(250);
  const d1 = await ev(page, () => { const s = window.plasmaTest.sketch, it = s.items[s.items.length - 1]; if (!it) return {}; const b = s.boxOf(it); return { n: s.items.length, type: it.type, w: Math.round((b[2] - b[0]) * 10) / 10 }; });
  t.check(`10.7 ${prof}: with Circle picked, typing 'Ø40' and Enter places a 40 mm circle`, dh === "Ø40" && d1.n === 2 && d1.type === "disc" && d1.w === 40, J({ dh, d1 }));
  await qb(page, "disc");
  await page.keyboard.type("R25"); await page.keyboard.press("Enter"); await sleep(250);
  const d2 = await ev(page, () => { const s = window.plasmaTest.sketch, it = s.items[s.items.length - 1]; if (!it) return {}; const b = s.boxOf(it); return { n: s.items.length, w: Math.round((b[2] - b[0]) * 10) / 10 }; });
  t.check(`10.7 ${prof}: 'R25' is a radius (a 50 mm circle)`, d2.n === 3 && d2.w === 50, J(d2));
  await qb(page, "rect");
  await page.keyboard.type("abc"); await sleep(100);
  const nohud = await ev(page, () => { const e = document.getElementById("drawHud"); return !!e && !e.hidden && !e.classList.contains("hidden"); });
  t.check(`10.7 ${prof}: letters do not open the size box (tool shortcuts still work)`, !nohud, J(nohud));
  await page.keyboard.press("Escape"); await sleep(150);

  // ---------------------------------------------------------------- 10.1 Edit points on any outline
  await fresh(page);
  await ev(page, () => { const s = window.plasmaTest.sketch; s.add("plate", true); const it = s.items[0]; it.p.r = 15; it.p.hole = 0; it._key = null; s.commit(); s.pick([it.id]); s.onSelect(); s.fitView && s.fitView(); });
  const where = await qb(page, "points");
  await sleep(200);
  const pe = await ev(page, () => { const s = window.plasmaTest.sketch, it = s.items[0]; s.draw(); const n = s.rawWorld(it).reduce((a, c) => a + c.pts.length, 0); return { where: null, type: it.type, mode: s.pointEdit === it.id, dots: (s._dots || []).length, n, msg: document.getElementById("toast").textContent }; });
  t.check(`10.1 ${prof}: ☰ More › Edit points turns a library part into an editable outline (${where})`, !!where && pe.type === "custom" && pe.mode, J(pe));
  t.check(`10.1 ${prof}: in point-edit mode every point has a handle, smooth arc joins included`, pe.n >= 8 && pe.dots === pe.n, J(pe));
  t.check(`10.1 ${prof}: it says how to add, move and delete points`, /double.?click/i.test(pe.msg) && /delete/i.test(pe.msg), J(pe.msg));
  await shot(page, `edit-points-${prof}`);
  const sel = await ev(page, () => { const s = window.plasmaTest.sketch, it = s.items[0], c = it.shape.cs[0]; const i = c.bulges.findIndex((b) => Math.abs(b) < 1e-9); s.selectEdge(it.id, 0, i); return i; });
  await sleep(150);
  const arcBtn = await ev(page, () => { const b = document.getElementById("edgeArc"); return b && b.getClientRects().length ? b.textContent.trim() : null; });
  t.check(`10.1 ${prof}: a picked straight edge offers "Make arc"`, /make arc/i.test(arcBtn || ""), J(arcBtn));
  await page.click("#edgeArc"); await sleep(150);
  const b1 = await ev(page, (i) => { const s = window.plasmaTest.sketch; return { b: s.items[0].shape.cs[0].bulges[i], label: document.getElementById("edgeArc").textContent.trim() }; }, sel);
  t.check(`10.1 ${prof}: Make arc curves that edge, and the button then says "Make straight"`, Math.abs(b1.b) > 0.05 && /straight/i.test(b1.label), J(b1));
  await page.click("#edgeArc"); await sleep(150);
  const b2 = await ev(page, (i) => window.plasmaTest.sketch.items[0].shape.cs[0].bulges[i], sel);
  t.check(`10.1 ${prof}: Make straight puts it back`, Math.abs(b2) < 1e-9, J(b2));
  await page.keyboard.press("Escape"); await sleep(150);
  const out = await ev(page, () => { const s = window.plasmaTest.sketch, it = s.items[0]; s.pick([it.id]); s.edgeSel = null; s.draw(); const n = s.rawWorld(it).reduce((a, c) => a + c.pts.length, 0); return { mode: s.pointEdit, dots: (s._dots || []).length, n }; });
  t.check(`10.1 ${prof}: Esc leaves point-edit mode; smooth joins go back to no dot (as before)`, !out.mode && out.dots < out.n, J(out));
  // the smooth join is still grabbable without a dot (Josh: keep the click behaviour)
  const smooth = await ev(page, () => {
    const s = window.plasmaTest.sketch, it = s.items[0], w = s.rawWorld(it)[0];
    const real = new Set((s._dots || []).map((d) => d.vi));
    const vi = w.pts.findIndex((p, i) => !real.has(i)); if (vi < 0) return null;
    const [X, Y] = s.toScreen(w.pts[vi][0], w.pts[vi][1]); const r = s.cv.getBoundingClientRect();
    return { vi, x: r.left + X, y: r.top + Y, h: s.hitCustomHandles(X, Y, false, true) };
  });
  t.check(`10.1 ${prof}: a smooth join with no dot can still be grabbed`, smooth && smooth.h && smooth.h.kind === "vertex" && smooth.h.vi === smooth.vi, J(smooth));
  const undo = await ev(page, () => { const s = window.plasmaTest.sketch; for (let k = 0; k < 5 && s.items[0].type === "custom"; k++) s.undo(); return s.items[0].type; });
  t.check(`10.1 ${prof}: Undo takes the part back to the library shape`, undo === "plate", J(undo));

  // ---------------------------------------------------------------- 10.2 gap readout while dragging
  await fresh(page);
  await ev(page, () => { const s = window.plasmaTest.sketch; s.add("rect", true, { w: 100, h: 50 }); s.add("rect", true, { w: 100, h: 50 }); s.items[0].x = 0; s.items[0].y = 0; s.items[1].x = 200; s.items[1].y = 0; s.items.forEach((i) => (i._key = null)); s.commit(); s.pick([]); s.fitView(); s.draw(); });
  const p0 = await ev(page, () => { const s = window.plasmaTest.sketch, r = s.cv.getBoundingClientRect(); const [X, Y] = s.toScreen(250, 25); const [X2] = s.toScreen(230, 25); return { x: r.left + X, y: r.top + Y, dx: X2 - X }; });
  await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(p0.x + p0.dx / 2, p0.y, { steps: 3 }); await page.mouse.move(p0.x + p0.dx, p0.y, { steps: 3 }); await sleep(100);
  const gap = await ev(page, () => { const s = window.plasmaTest.sketch; return { g: s.gapInfo ? Math.round(s.gapInfo.d * 10) / 10 : null, label: s.label && s.label.text }; });
  await shot(page, `gap-readout-${prof}`);
  await page.mouse.up(); await sleep(100);
  const after = await ev(page, () => ({ g: window.plasmaTest.sketch.gapInfo, x: window.plasmaTest.sketch.items[1].x }));
  t.check(`10.2 ${prof}: dragging a part shows the gap to its neighbour (about 80 mm here)`, gap.g != null && Math.abs(gap.g - (after.x - 100)) < 0.6 && /gap/i.test(gap.label || ""), J({ gap, after }));
  t.check(`10.2 ${prof}: the readout goes when the drag ends`, !after.g, J(after));

  // ---------------------------------------------------------------- 10.5 as many as fit
  await fresh(page);
  const fit = await ev(page, async () => {
    const T = window.plasmaTest, s = T.sketch; s.add("rect", true, { w: 100, h: 50 }); const it = s.items[0]; it.x = 0; it.y = 0; it._key = null; s.commit(); s.pick([it.id]); s.onSelect();
    T.runPro("linarray"); await new Promise((r) => setTimeout(r, 200));
    const box = document.getElementById("cad_fit"); if (!box) return { box: false };
    box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); document.getElementById("cad_gx").value = "10"; document.getElementById("cad_gx").dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    const ok = document.getElementById("cadOk").textContent;
    const sheet = T.drawingSheet(T.S.cfg && T.S.cfg.travel_mm);
    return { box: true, ok, sheet };
  });
  await shot(page, `array-fit-${prof}`);
  await page.click("#cadOk"); await sleep(250);
  const fitN = await ev(page, () => window.plasmaTest.sketch.items.length);
  const want = fit.sheet ? Math.floor((fit.sheet.w + 10) / 110) * Math.floor((fit.sheet.h + 10) / 60) : -1;
  t.check(`10.5 ${prof}: Array has "As many as fit on the sheet", and the button says how many`, fit.box && new RegExp("\\b" + want + "\\b").test(fit.ok), J({ fit, want }));
  t.check(`10.5 ${prof}: it fills the drawing sheet (${want} parts)`, fitN === want, J({ fitN, want }));

  if (prof !== "d1536x730") { t.check(`no page error (${prof})`, !page.errors.length, J(page.errors.slice(0, 3))); continue; }

  // ---------------------------------------------------------------- 10.4 numbered text copies
  await fresh(page);
  await ev(page, () => window.plasmaTest.openMakeTool("text")); await sleep(300);
  await page.fill("#mtText", "TAG 001-005"); await sleep(400);
  const info = await ev(page, () => document.getElementById("mtInfo").textContent);
  t.check("10.4 typing a range in Add text says it will make numbered copies", /5 numbered copies/i.test(info) && /TAG 001/.test(info) && /TAG 005/.test(info), J(info));
  await shot(page, "numbered-text");
  await page.click("#mtAdd"); await sleep(500);
  const names = await ev(page, () => [...new Set(window.plasmaTest.sketch.items.map((i) => i.name))]);
  t.check("10.4 Add makes the five copies, each named after its number", ["TAG 001", "TAG 002", "TAG 003", "TAG 004", "TAG 005"].every((n) => names.includes(n)), J(names));

  // ---------------------------------------------------------------- 10.3 copy along a path
  await fresh(page);
  const pc = await ev(page, () => {
    const s = window.plasmaTest.sketch; s.add("disc", true, { d: 10 }); const a = s.items[0]; a.x = -50; a.y = -50; a._key = null;
    s.importParts([{ x: 0, y: 0, cs: [{ pts: [[0, 0], [200, 0]], closed: false, bulges: [0, 0], op: "score" }], op: "score", name: "Path" }], false);
    const p = s.items[s.items.length - 1]; s.commit(); s.pick([a.id, p.id]); s.onSelect(); return { a: a.id, p: p.id, n: s.items.length };
  });
  const pw = await qb(page, "pathcopy"); await sleep(200);
  const pcd = await ev(page, () => ({ title: document.getElementById("cadTitle").textContent, open: !document.getElementById("cadDialog").classList.contains("hidden") }));
  t.check(`10.3 ☰ More › Copy along a path opens its window (${pw})`, !!pw && pcd.open && /along a path/i.test(pcd.title), J(pcd));
  await ev(page, () => { const n = document.getElementById("cad_n"); n.value = "5"; n.dispatchEvent(new Event("input", { bubbles: true })); });
  await shot(page, "copy-along-path");
  await page.click("#cadOk"); await sleep(250);
  const placed = await ev(page, (ids) => { const s = window.plasmaTest.sketch; return s.items.filter((i) => i.type === "disc" && i.id !== ids.a).map((i) => { const b = s.boxOf(i); return [Math.round((b[0] + b[2]) / 2), Math.round((b[1] + b[3]) / 2)]; }); }, pc);
  t.check("10.3 five copies sit evenly along the path, ends included (0, 50, 100, 150, 200)", J(placed.sort((u, v) => u[0] - v[0])) === J([[0, 0], [50, 0], [100, 0], [150, 0], [200, 0]]), J(placed));
  // holes along a curved edge
  await fresh(page);
  await ev(page, () => { const s = window.plasmaTest.sketch; s.importParts([{ x: 0, y: 0, cs: [{ pts: [[0, 0], [100, 0]], closed: true, bulges: [0, 1] }] }], false); const it = s.items[0]; s.commit(); s.pick([it.id]); s.onSelect(); window.plasmaTest.setInspectorTab && window.plasmaTest.setInspectorTab("holes"); });
  await sleep(250);
  const added = await ev(page, async () => {
    const m = document.getElementById("featAdd"); if (!m) return { err: "no featAdd" };
    m.click(); await new Promise((r) => setTimeout(r, 150));
    const b = document.querySelector('#featAddMenu [data-fadd="arc"]'); if (!b) return { err: "no arc item" };
    b.click(); await new Promise((r) => setTimeout(r, 250));
    const s = window.plasmaTest.sketch, it = s.items[0], f = (it.feats || []).find((x) => x.k === "arc");
    return f ? { x: f.x, y: f.y, r: f.r, a0: f.a0, a1: f.a1, n: f.n, holes: s.contoursOf(it).filter((c) => c.circle).length } : { err: "no feature" };
  });
  await shot(page, "holes-along-curve");
  t.check("10.3 'Holes along a curve' on a half-round part follows its curved edge (centre 50,0, inside the R50 edge)", !added.err && Math.abs(added.x - 50) < 1 && Math.abs(added.y) < 1 && added.r > 30 && added.r < 50 && added.holes === added.n, J(added));

  // ---------------------------------------------------------------- 10.6 DXF layers and blocks
  await fresh(page);
  const dx = await ev(page, async () => {
    const L = (a) => a.join("\n");
    const sq = (layer, x, y, s) => ["0", "LWPOLYLINE", "8", layer, "90", "4", "70", "1", "10", x, "20", y, "10", x + s, "20", y, "10", x + s, "20", y + s, "10", x, "20", y + s];
    const txt = L(["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "BLOCKS", "0", "BLOCK", "2", "LUG", "10", "0", "20", "0", ...sq("0", 0, 0, 10), "0", "ENDBLK", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES", ...sq("CUT", 0, 0, 100), "0", "LINE", "8", "ETCH", "10", "10", "20", "50", "11", "90", "21", "50", "0", "CIRCLE", "8", "DRILL", "10", "50", "20", "20", "40", "3",
      "0", "INSERT", "8", "0", "2", "LUG", "10", "150", "20", "0", "0", "ENDSEC", "0", "EOF"]);
    const f = new File([txt], "layers.dxf"); const T = window.plasmaTest;
    await T.importIntoMake([f], { replace: true, skipSizeCheck: true });
    const s = T.sketch;
    return s.items.map((i) => ({ type: i.type, op: i.op || null, name: i.name || null, ops: (i.shape && i.shape.cs || []).map((c) => c.op || "cut") }));
  });
  t.check("10.6 the ETCH layer line comes in as an etch part", dx.some((i) => i.op === "score" && /ETCH/.test(i.name || "")), J(dx));
  t.check("10.6 the DRILL layer circle comes in as a drill mark, not a cut hole", dx.some((i) => i.ops.length && i.ops.every((o) => o === "mark")) && !dx.some((i) => i.ops.includes("cut") && i.ops.length === 2), J(dx));
  t.check("10.6 the block is drawn (2 cut parts: the plate and the LUG)", dx.filter((i) => i.ops.every((o) => o === "cut")).length === 2, J(dx));

  // ---------------------------------------------------------------- 10.8 inches
  await fresh(page);
  const inch = await ev(page, async () => {
    const T = window.plasmaTest, s = T.sketch; T.savePrefs({ units: "in" });
    s.add("rect", true, { w: 101.6, h: 50.8 }); const it = s.items[0]; s.pick([it.id]); s.onSelect(); s.draw();
    const w = s.dimHits.find((h) => h.kind === "w"), h = s.dimHits.find((h) => h.kind === "h");
    const sel = document.getElementById("setUnits");
    const out = { w: w && w.text, h: h && h.text, sel: !!sel };
    T.savePrefs({ units: "mm" }); s.draw();
    out.back = (s.dimHits.find((h) => h.kind === "w") || {}).text;
    return out;
  });
  t.check("10.8 with inches picked, the drawing's size tags read in inches", inch.w === '4.00"' && inch.h === '2.00"', J(inch));
  t.check("10.8 back to mm reads mm again", inch.back === "101.6 mm", J(inch));
  t.check("10.8 Settings has the units choice", inch.sel, J(inch));

  t.check(`no page error (${prof})`, !page.errors.length, J(page.errors.slice(0, 3)));
  } catch (e) { t.check(`${prof}: the run finished without a crash`, false, String(e && e.message || e).slice(0, 300)); }
  finally { await page.ctx.close(); }
}
await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

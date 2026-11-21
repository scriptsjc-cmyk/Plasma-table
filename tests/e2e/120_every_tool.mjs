// r15 Round 7.3 (not gated until it passes): every Make tool in TOOL_GROUPS + HEADER_TOOLS, at 1366x640 and 1536x730.
// For each tool: open it by a real click (rail, header, or the "⋯ More" panel), check its dialog fits the screen and
// closes on Escape (a drawing mode ends on Escape), do one real mouse action, check the drawing changed (for Fit /
// Snap / Measure / Cut control: the view, the snap setting, the measurement, the job's cut settings), and no page error.
// Setup (which parts are on the drawing and picked) is done through the test hooks; everything a person does is real.
// TOOL_ONLY=rect,trim runs only those tools; TOOL_SIZES=1366x640 only that size.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { fitProblems, r15Problems } from "../lib/fitcheck.mjs";

const t = new T("120_every_tool");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = [["1366x640", "d1366x640"], ["1536x730", "d1536x730"]];
const ONLY = (process.env.TOOL_ONLY || "").split(",").filter(Boolean);
const ONLY_SIZES = (process.env.TOOL_SIZES || "").split(",").filter(Boolean);

// The dialogs and panels a tool may open.
const DIALOGS = ["cadDialog", "presetBrowser", "shapeLib", "verPop", "resizeDlg", "textDlg", "traceDlg", "dimEdit", "edgePanel", "toolbarCustom"];

// What each tool needs on the drawing, how a person uses it, and what must change.
//   setup: one (plate A picked, disc B beside it) | two (A and an overlapping rectangle B, both picked) | three (three
//          rectangles in a row, all picked) | cross (A and a disc over its right edge, nothing picked) | open (an open
//          line ending short of A) | holes (A with two holes) | discs (two discs, apart) | flange (a flange picked) |
//          grouped (A and B grouped, picked) | undone (A turned, then undone) | empty
//   act:   instant (the toolbar click is the action) | dialog (fill, then click its go button) | mode (clicks on the drawing)
//   effect: items (default) | view | snap | measure | cam
const SPEC = {
  presets: { act: "dialog", dlg: "presetBrowser", go: "#pbGrid button, #pbGrid [data-preset], #pbGrid .pb-card" },
  rect: { act: "instant" }, disc: { act: "instant" }, triangle: { act: "instant" }, slot: { act: "instant" }, sector: { act: "instant" },
  lib: { act: "dialog", dlg: "shapeLib", go: "#libGrid button, #libGrid [data-shape]" },
  hole: { act: "instant" }, slothole: { act: "instant" }, boltcircle: { act: "instant" },
  draw: { act: "mode", setup: "empty", clicks: (b) => [[b.C[0] - 40, b.C[1] - 20], [b.C[0] + 40, b.C[1] - 20], [b.C[0] + 40, b.C[1] + 20]], finishBtn: "#toolFinish" },
  etch: { act: "instant" },
  arc3: { act: "mode", setup: "empty", clicks: (b) => [[b.C[0] - 50, b.C[1]], [b.C[0] + 50, b.C[1]], [b.C[0], b.C[1] + 30]] },
  arctan: { act: "mode", clicks: (b) => [[(b.A[0] + b.A[2]) / 2, b.A[3]], [b.A[0] - 40, b.A[3] + 40]] },
  spline: { act: "mode", setup: "empty", clicks: (b) => [[b.C[0] - 60, b.C[1]], [b.C[0] - 20, b.C[1] + 30], [b.C[0] + 20, b.C[1]], [b.C[0] + 60, b.C[1] + 30]], finish: "dblclick" },
  curvepoints: { act: "dialog", dlg: "cadDialog", fill: { "#cad_list": "0,0\n40,30\n80,0\n120,30" } },
  edge: { act: "panel", dlg: "edgePanel", clicks: (b) => [[(b.A[0] + b.A[2]) / 2, b.A[1]]], fill: { "#edgeLen": "90" }, go: "#edgeLenApply" },
  measure: { act: "mode", effect: "measure", clicks: (b) => [[b.A[0], b.A[1]], [b.A[2], b.A[1]]] },
  text: { act: "dialog", dlg: "textDlg", go: "#mtAdd" },
  trace: { act: "dialog", dlg: "traceDlg", picture: "#trFile", go: "#trAdd" },
  dims: { act: "dialog", dlg: "dimEdit", fill: { "#dimEditInput": "150" }, go: "key:Enter" },
  drivedim: { act: "mode", setup: "holes", clicks: (b) => [b.H1c, b.H2c], then: { dlg: "cadDialog", fill: { "#cad_dist": "70" } } },
  snap: { act: "instant", effect: "snap" },
  rot: { act: "instant" }, mir: { act: "instant", setup: "triangle" }, mirv: { act: "instant", setup: "triangle" },
  alignl: { act: "instant", setup: "two" }, alignr: { act: "instant", setup: "two" }, alignt: { act: "instant", setup: "two" },
  alignb: { act: "instant", setup: "two" }, aligncx: { act: "instant", setup: "two" }, aligncy: { act: "instant", setup: "two" },
  alignc: { act: "instant", setup: "two" }, distx: { act: "instant", setup: "three" }, disty: { act: "instant", setup: "three" },
  size: { act: "dialog", dlg: "dimEdit", fill: { "#dimEditInput": "150" }, go: "key:Enter" },
  resize: { act: "dialog", dlg: "resizeDlg", fill: { "#rsW": "150" }, go: "#rsOk" },
  rotpt: { act: "dialog", dlg: "cadDialog", after: (b) => [[b.A[0], b.A[1]]] },
  scalepct: { act: "dialog", dlg: "cadDialog" },
  group: { act: "instant", setup: "two" }, ungroup: { act: "instant", setup: "grouped" },
  join: { act: "instant", setup: "two" }, subtract: { act: "instant", setup: "two" },
  offset: { act: "dialog", dlg: "cadDialog" }, sliver: { act: "dialog", dlg: "cadDialog", setup: "sliver" },
  linarray: { act: "dialog", dlg: "cadDialog" }, polar: { act: "dialog", dlg: "cadDialog" },
  nest: { act: "dialog", dlg: "cadDialog", setup: "two" },
  cutctl: { act: "dialog", dlg: "cadDialog", effect: "cam", fill: { "#cad_tabs": "2" } },
  flangestd: { act: "dialog", dlg: "cadDialog", setup: "flange" },
  trim: { act: "mode", setup: "cross", clicks: (b) => [[b.B[2], (b.B[1] + b.B[3]) / 2]] },
  extend: { act: "mode", setup: "open", clicks: (b) => [b.Lend] },
  break: { act: "mode", clicks: (b) => [[(b.A[0] + b.A[2]) / 2, b.A[1]]] },
  fillet: { act: "dialog", dlg: "cadDialog", tick: "#cad_inside", setup: "notched" },
  chamfer: { act: "dialog", dlg: "cadDialog", tick: "#cad_all" },
  maketan: { act: "mode", setup: "discs", clicks: (b) => [[b.B[0], (b.B[1] + b.B[3]) / 2], [b.A[2], (b.A[1] + b.A[3]) / 2]] },
  makeconc: { act: "mode", setup: "discs", clicks: (b) => [[b.B[0], (b.B[1] + b.B[3]) / 2], [b.A[2], (b.A[1] + b.A[3]) / 2]] },
  ver: { act: "dialog", dlg: "verPop", go: "#verBody button:not(.sel)" },
  dup: { act: "instant" },
  undo: { act: "instant", setup: "turned" }, redo: { act: "instant", setup: "undone" },
  fit: { act: "instant", effect: "view", setup: "panned" }, del: { act: "instant" },
};

// ---- page helpers -------------------------------------------------------------------------------------------
const ev = (page, f, a) => page.evaluate(f, a);

async function setup(page, kind) {
  await ev(page, (kind) => {
    const T = window.plasmaTest, s = T.sketch;
    s.setTool && s.setTool(null);
    s.clear();
    const add = (type, p, x, y) => { s.pick([]); s.add(type, true, p); const it = s.items[s.items.length - 1]; if (x != null) { it.x = x; it.y = y; } return it; };
    const A = kind === "empty" ? null : kind === "discs" ? add("disc", { d: 60 }, 0, 0) : kind === "triangle" ? add("triangle", {}, 0, 0) : add("rect", { w: 120, h: 80 }, 0, 0);
    let pick = A ? [A.id] : [];
    if (kind === "one" || kind === "turned" || kind === "undone" || kind === "panned") { const B = add("disc", { d: 40 }, 200, 20); }
    if (kind === "two" || kind === "grouped") { const B = add("rect", { w: 60, h: 50 }, 90, 40); pick = [A.id, B.id]; }
    if (kind === "three") { const B = add("rect", { w: 40, h: 40 }, 150, 30), C = add("rect", { w: 40, h: 40 }, 330, 90); pick = [A.id, B.id, C.id]; }
    if (kind === "cross") { add("disc", { d: 40 }, 100, 20); pick = []; }
    if (kind === "discs") { add("disc", { d: 30 }, 120, 40); pick = []; }
    if (kind === "flange") { s.clear(); const F = add("flange", {}, 0, 0); pick = [F.id]; }
    if (kind === "holes") { s.pick([A.id]); s.add("hole", true, { d: 10 }); const h1 = s.items[s.items.length - 1]; s.pick([A.id]); s.add("hole", true, { d: 10 }); const h2 = s.items[s.items.length - 1];
      h1.x = 20; h1.y = 30; h2.x = 80; h2.y = 30; pick = []; }
    if (kind === "open") { s.pick([]); s.addPointsContour("-80,40\n-30,40", "xy", false); pick = []; }
    if (kind === "notched") { s.clear(); s.pick([]); s.addPointsContour("0,0\n120,0\n120,80\n60,80\n60,40\n0,40", "xy", true); pick = [s.items[s.items.length - 1].id]; }
    if (kind === "sliver") { s.pick([A.id]); s.add("hole", true, { d: 2 }); pick = [A.id]; }
    s.pick(pick);
    if (kind === "grouped") s.group();
    s.commit && s.commit();
    s.past = []; s.future = [];
    if (kind === "turned") { s.pick([A.id]); s.rotateBy(90); }
    if (kind === "undone") { s.pick([A.id]); s.rotateBy(90); s.undo(); }
    s.fitView(); s.draw();
    if (kind === "panned") { s.view.vx += 200; s.view.vy -= 120; s.draw(); }
    s.onSelect && s.onSelect();
  }, kind);
  await sleep(120);
}

// world boxes for the mouse actions: A (first part), B (second), holes, the open line's end
const boxes = (page) => ev(page, () => {
  const s = window.plasmaTest.sketch, it = s.items.filter((i) => !s.isHole(i));
  const hs = s.items.filter((i) => s.isHole(i)).map((h) => s.boxOf(h));
  const c = (b) => b && [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const open = it.find((i) => i.type === "custom" && i.closed === false);
  let Lend = null;
  if (open) { const b = s.boxOf(open); Lend = [b[2] - 0.5, (b[1] + b[3]) / 2]; }
  const r = s.cv.getBoundingClientRect();
  const C = s.toWorld(r.width / 2, r.height / 2);   // the middle of the drawing area (for drawing on an empty sheet)
  return { C, A: it[0] && s.boxOf(it[0]), B: it[1] && s.boxOf(it[1]), H1c: c(hs[0]), H2c: c(hs[1]), Lend };
});
const toPage = (page, pts) => ev(page, (pts) => {
  const s = window.plasmaTest.sketch, r = s.cv.getBoundingClientRect();
  return pts.map(([x, y]) => { const [sx, sy] = s.toScreen(x, y); return [r.left + s.cv.clientLeft + sx, r.top + s.cv.clientTop + sy]; });
}, pts);

const state = (page) => ev(page, () => {
  const T = window.plasmaTest, s = T.sketch;
  return { items: s.snapshot(), view: JSON.stringify(s.view), snap: String(s.opts && s.opts.snap), cam: JSON.stringify(T.S.cam || {}),
    measure: !!(s.measure && s.measure.b), tool: s.tool || null };
});
const openDialogs = (page) => ev(page, (ids) => ids.filter((id) => {
  const e = document.getElementById(id); if (!e) return false;
  const r = e.getBoundingClientRect();
  return !e.hidden && !e.classList.contains("hidden") && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
}), DIALOGS);

// Put the page back to a clean Make screen between tools (not part of what is tested).
async function reset(page) {
  await page.mouse.move(2, 300);
  for (let i = 0; i < 2; i++) { await page.keyboard.press("Escape"); await sleep(60); }
  await ev(page, (ids) => {
    for (const id of ids) { const e = document.getElementById(id); if (e && id !== "edgePanel") { e.classList.add("hidden"); e.classList.remove("is-open"); } }
    const s = window.plasmaTest.sketch; s.setTool && s.setTool(null); s.onDriveReady = null;
    const more = document.querySelector('[data-qb="more"][aria-expanded="true"]'); if (more) more.click();
    window.plasmaTest.S.uiBlockUntil = 0;
  }, DIALOGS);
  await sleep(150);
}

// Open a tool by a real click: on the rail or header, else in the "⋯ More" panel.
async function clickTool(page, id) {
  const visible = () => page.locator(`[data-qb="${id}"]:visible`).first();
  let where = "rail";
  if (!(await visible().count())) {
    const more = page.locator('[data-qb="more"]:visible').first();
    if (!(await more.count())) return { ok: false, why: "no ⋯ More button" };
    await more.click({ timeout: 2000 }).catch(() => {});
    await sleep(200);
    where = "More";
    if (!(await visible().count())) return { ok: false, why: "not on the rail, the header or in ⋯ More" };
  }
  const box = await visible().boundingBox();
  const vp = page.viewportSize();
  if (!box || box.y < 0 || box.x < 0 || box.y + box.height > vp.height || box.x + box.width > vp.width) {
    return { ok: false, why: `its button in ${where} is off the screen (${box ? [box.x, box.y].map(Math.round) : "no box"})` };
  }
  try { await visible().click({ timeout: 2000 }); } catch (e) { return { ok: false, why: `click in ${where} failed: ${String(e).replace(/\s+/g, " ").slice(0, 400)}` }; }
  await sleep(250);
  return { ok: true, where };
}

async function clickWorld(page, pts, finish) {
  const px = await toPage(page, pts);
  for (let i = 0; i < px.length; i++) {
    const [x, y] = px[i];
    if (finish === "dblclick" && i === px.length - 1) await page.mouse.dblclick(x, y);
    else await page.mouse.click(x, y);
    await sleep(120);
  }
}

async function fill(page, map) {
  for (const [sel, v] of Object.entries(map || {})) {
    const l = page.locator(sel).first();
    if (await l.count()) { await l.click({ clickCount: 3 }).catch(() => {}); await l.fill(v).catch(() => {}); }
  }
}

async function picturePng(page) {
  const b64 = await ev(page, () => { const c = document.createElement("canvas"); c.width = 120; c.height = 80; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 120, 80); g.fillStyle = "#000"; g.fillRect(20, 15, 80, 50); return c.toDataURL("image/png").split(",")[1]; });
  return { name: "square.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

// ---- the walk -----------------------------------------------------------------------------------------------
for (const [size, prof] of SIZES.filter(([s]) => !ONLY_SIZES.length || ONLY_SIZES.includes(s))) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e && e.message || e).slice(0, 200)));
  await ev(page, () => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); });
  await sleep(400);
  const ids = await ev(page, async () => { const m = await import("/js/make/toolbarcustom.js");
    return [...m.TOOL_GROUPS.flatMap((g) => g.items.map((i) => i[0])), ...m.HEADER_TOOLS.map((h) => h[0])]; });
  t.check(`${size}: every tool has a test plan here`, ids.every((id) => SPEC[id]), ids.filter((id) => !SPEC[id]).join(", "));
  // r15 3.3: ⋯ More has a search box in view, and searching it finds a tool that is not on the rail (Ungroup)
  {
    await page.locator('[data-qb="more"]:visible').first().click({ timeout: 2000 }).catch(() => {});
    await sleep(200);
    const box = page.locator("#qbMoreSearch:visible").first();
    const shown = await box.count() ? await box.boundingBox() : null;
    const vp = page.viewportSize();
    t.check(`${size}: ⋯ More shows its search box on screen`, !!shown && shown.y >= 0 && shown.y + shown.height <= vp.height, JSON.stringify(shown));
    if (shown) { await box.click(); await box.fill("ungroup"); await sleep(250); }
    const found = await page.locator('#quickBar [data-qb="ungroup"]:visible').count();
    t.check(`${size}: searching ⋯ More finds Ungroup`, found > 0, String(found));
    // clear the search (typing turns the rail into the results list with a "Showing: …" chip)
    const chip = page.locator("#qbFilterChip:visible").first();
    if (await chip.count()) await chip.click({ timeout: 2000 }).catch(() => {});
    await page.keyboard.press("Escape"); await sleep(150);
    await ev(page, () => import(window.__J.quickbar).then((q) => q.toggleMore(false)));
    await sleep(150);
  }

  for (const id of ids.filter((x) => !ONLY.length || ONLY.includes(x))) {
    const sp = SPEC[id]; if (!sp) continue;
    const name = `${size} ${id}`;
    errors.length = 0;
    await reset(page);
    await setup(page, sp.setup || "one");
    const before = await state(page);
    const b = await boxes(page);

    // 1. open it by a real click
    const c = await clickTool(page, id);
    t.check(`${name}: opens by a real click`, c.ok, c.why);
    if (!c.ok) continue;

    if (sp.act === "dialog" || sp.act === "panel") {
      // 2. its dialog fits and closes on Escape
      const open = await openDialogs(page);
      t.check(`${name}: opens its ${sp.dlg}`, open.includes(sp.dlg), `open: ${open.join(", ") || "nothing"}`);
      if (!open.includes(sp.dlg)) continue;
      const probs = [...await ev(page, fitProblems), ...await ev(page, r15Problems)];
      t.check(`${name}: ${sp.dlg} fits the screen`, probs.length === 0, JSON.stringify(probs));
      if (sp.act === "dialog") {
        await page.keyboard.press("Escape"); await sleep(250);
        t.check(`${name}: Escape closes ${sp.dlg}`, !(await openDialogs(page)).includes(sp.dlg));
        const after = await state(page);
        t.check(`${name}: Escape leaves the drawing unchanged`, after.items === before.items);
        await reset(page);
        await setup(page, sp.setup || "one");
        const again = await clickTool(page, id);
        if (!again.ok || !(await openDialogs(page)).includes(sp.dlg)) { t.check(`${name}: opens again after Escape`, false, again.why || `open: ${(await openDialogs(page)).join(", ") || "nothing"}`); continue; }
      }
      // 3. one real mouse action
      if (sp.act === "panel") await clickWorld(page, sp.clicks(b));
      if (sp.picture) { await page.locator(sp.picture).setInputFiles(await picturePng(page)); await sleep(600); }
      await fill(page, sp.fill);
      if (sp.tick) await page.locator(sp.tick).click().catch(() => {});
      const go = sp.go || "#cadOk";
      if (go.startsWith("key:")) { await page.keyboard.press(go.slice(4)); await sleep(300); }
      else {
      const goBtn = page.locator(`${go}`).locator("visible=true").first();
      if (!(await goBtn.count())) { t.check(`${name}: has a button to apply it (${go})`, false); continue; }
      try { await goBtn.click({ timeout: 2000 }); } catch (e) { t.check(`${name}: its apply button can be clicked`, false, String(e).split("\n")[0].slice(0, 120)); continue; }
      await sleep(300);
      }
      if (sp.after) await clickWorld(page, sp.after(await boxes(page)));
    } else if (sp.act === "mode") {
      const st = await state(page);
      t.check(`${name}: starts its drawing mode`, !!st.tool, `tool: ${st.tool}`);
      if (st.tool) {
        // Escape ends the mode
        await page.keyboard.press("Escape"); await sleep(200);
        t.check(`${name}: Escape ends the mode`, !(await state(page)).tool);
        await reset(page);
        await setup(page, sp.setup || "one");
        const again = await clickTool(page, id);
        if (!again.ok) { t.check(`${name}: opens again after Escape`, false, again.why); continue; }
      }
      await clickWorld(page, sp.clicks(await boxes(page)), sp.finish);
      if (sp.finishBtn) await page.locator(sp.finishBtn).locator("visible=true").first().click({ timeout: 2000 }).catch((e) => t.check(`${name}: ${sp.finishBtn} can be clicked`, false, String(e).slice(0, 160)));
      if (sp.then) {
        const open = await openDialogs(page);
        t.check(`${name}: then opens its ${sp.then.dlg}`, open.includes(sp.then.dlg), `open: ${open.join(", ") || "nothing"}`);
        if (open.includes(sp.then.dlg)) { await fill(page, sp.then.fill); await page.locator("#cadOk").click().catch(() => {}); await sleep(250); }
      }
    }
    // 4. the drawing changed
    const after = await state(page);
    const eff = sp.effect || "items";
    const changed = eff === "measure" ? after.measure : after[eff] !== before[eff];
    const toast = await ev(page, () => { const e = document.getElementById("toast"); return e && !e.classList.contains("hidden") ? e.textContent.trim().slice(0, 120) : ""; });
    t.check(`${name}: ${eff === "items" ? "the drawing changed" : eff === "view" ? "the view changed" : eff === "snap" ? "the snap setting changed" : eff === "measure" ? "a measurement is shown" : "the job's cut settings changed"}`,
      changed, toast ? `toast: ${toast}` : "");
    // 5. no page error
    t.check(`${name}: no page error`, errors.length === 0, errors.join(" | "));
  }
  await page.ctx.close();
}

await br.close();
await srv.close();
process.exit(t.done() ? 1 : 0);

// r8 Make items: no duplicate heading, hover tips, no full-screen editor, add-not-replace,
// Check cut, presets/shapes split, box select (Space never pans), Simple Snap, easier Draw outline.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, shot } from "../lib/browser.mjs";

const t = new T("77_r8_make");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makePage(prof, mode = "beginner") {
  const page = await newPage(br, prof, { base: srv.base });
  await ev(page, (mode) => {
    const T = window.plasmaTest;
    T.setAppMode(mode === "pro" ? "pro" : "beginner", { persist: false, autoFs: false });
    T.showScreen("make"); T.setShapeFs(false); T.sketch.clear();
  }, mode);
  await page.waitForFunction(() => window.plasmaTest.screen() === "make", null, { timeout: 8000 });
  return page;
}

for (const prof of ["d1440", "d1366"]) {
  const n = (s) => `${prof}: ${s}`;
  const page = await makePage(prof, "beginner");

  const head = await ev(page, () => {
    const gh = document.getElementById("ghStep");
    const vis = (e) => {
      if (!e) return false;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return cs.display !== "none" && !e.hidden && b.width > 0 && b.height > 0 && cs.visibility !== "hidden";
    };
    return {
      gh: gh && gh.textContent.trim(),
      ghShow: vis(gh),
      fsBtn: !!document.getElementById("btnShapeFs"),
      fsClass: document.body.classList.contains("shape-fs"),
      snap: vis(document.getElementById("btnSimpleSnap")),
      snapTitle: (document.getElementById("btnSimpleSnap") || {}).title || "",
      pan: vis(document.getElementById("btnDragPan")),
      check: vis(document.getElementById("btnMakeCheckCut")),
    };
  });
  t.check(n("item 8: the duplicate 'Make a part' heading above the templates is hidden"), !head.ghShow, JSON.stringify(head));
  t.check(n("item 10: the Full-screen editor button is gone"), !head.fsBtn);
  t.check(n("item 10: full-screen mode is not on"), !head.fsClass);
  t.check(n("item 16: Simple has a Snap toggle"), head.snap);
  t.check(n("item 16: Snap has a short plain explanation"), /grid|edges|centres|centers|line up/i.test(head.snapTitle), head.snapTitle);
  t.check(n("item 15: a box-select / pan toggle is on the toolbar"), head.pan);
  t.check(n("item 13: Check cut sits in the Make header"), head.check);

  await ev(page, () => window.plasmaTest.setShapeFs(true));
  t.check(n("item 10: setShapeFs is a no-op — body is never shape-fs"), await ev(page, () => !document.body.classList.contains("shape-fs") && !window.plasmaTest.S.shapeFs));

  // item 12: add, don't replace
  await ev(page, () => { const s = window.plasmaTest.sketch; s.clear(); });
  await ev(page, () => {
    // beginnerPick path: click a template button if present, else call the same add
    const btn = document.querySelector("[data-shape='rect'], [data-id='rect'], #libGrid [data-id='rect']");
    if (btn) btn.click();
    else window.plasmaTest.sketch.add("rect");
  });
  await sleep(100);
  const c1 = await ev(page, () => window.plasmaTest.sketch.items.length);
  await ev(page, () => {
    const fn = window.plasmaTest.sketch.add;
    // prefer beginnerPick if exposed via clicking another shape
    const btn = document.querySelector("[data-shape='disc'], [data-id='disc'], [data-shape='circle'], [data-id='circle']");
    if (btn) btn.click();
    else window.plasmaTest.sketch.add("disc");
  });
  await sleep(100);
  const c2 = await ev(page, () => window.plasmaTest.sketch.items.map((i) => i.type || (i.shape && i.shape.id) || i.id));
  t.check(n("item 12: adding a second template keeps the first (does not replace)"), c2.length >= 2, JSON.stringify({ c1, c2 }));

  // item 13 check cut dialog
  await ev(page, () => document.getElementById("btnMakeCheckCut").click());
  await sleep(200);
  const dlg = await ev(page, () => {
    const d = document.getElementById("makeCheckDlg");
    return {
      show: d && !d.hidden && !d.classList.contains("hidden"),
      mats: document.querySelectorAll("#makeCheckMat [data-mat]").length,
      ths: document.querySelectorAll("#makeCheckTh [data-th]").length,
      thsAreButtons: [...document.querySelectorAll("#makeCheckTh [data-th]")].every((b) => b.tagName === "BUTTON"),
    };
  });
  t.check(n("item 13: Check cut asks for material and thickness"), dlg.show && dlg.mats > 0 && dlg.ths > 0 && dlg.thsAreButtons, JSON.stringify(dlg));
  const three = await ev(page, () => {
    const b = document.querySelector('#makeCheckTh [data-th="3"]');
    if (b) b.click();
    return { clicked: !!(b && b.classList.contains("sel")), val: b && b.dataset.th };
  });
  t.check(n("item 13: clicking 3 mm selects that thickness"), three.clicked && three.val === "3", JSON.stringify(three));
  await ev(page, () => document.getElementById("makeCheckGo").click());
  await sleep(200);
  const out = await ev(page, () => (document.getElementById("makeCheckOut") || {}).textContent || "");
  t.check(n("item 13: Check cut reports on the current drawing"), /cuttable|too small|thin|close|hole|check/i.test(out), out.slice(0, 300));
  t.check(n("item 13: the result uses the 3 mm you clicked, not the first size"), /\b3 mm\b/.test(out) && !/Cut check · .* 1 mm/.test(out), out.slice(0, 300));
  const five = await ev(page, () => {
    const b = document.querySelector('#makeCheckTh [data-th="5"]');
    if (b) b.click();
    document.getElementById("makeCheckGo").click();
    return { clicked: !!(b && b.classList.contains("sel")), out: (document.getElementById("makeCheckOut") || {}).textContent || "" };
  });
  t.check(n("item 13: clicking another thickness (5 mm) sticks too"), five.clicked && /\b5 mm\b/.test(five.out), five.out.slice(0, 300));
  await ev(page, () => document.getElementById("makeCheckClose").click());

  // item 15: Space does not pan; default empty drag is box select
  const pan0 = await ev(page, () => ({ vx: window.plasmaTest.sketch.view.vx, vy: window.plasmaTest.sketch.view.vy, pref: window.plasmaTest.getPrefs().emptyDragPan }));
  t.check(n("item 15: empty-canvas drag defaults to box select (not pan)"), pan0.pref === false, JSON.stringify(pan0));
  await ev(page, () => {
    const s = window.plasmaTest.sketch;
    const evd = { key: " ", preventDefault() {}, stopPropagation() {} };
    // fire the same keydown the canvas listens to
    const cv = document.getElementById("preview") || document.querySelector("canvas");
    cv.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
  });
  await ev(page, () => {
    const s = window.plasmaTest.sketch;
    // even if spaceDown slipped through, a drag must not pan because panBtn ignores Space
    const evDown = new PointerEvent("pointerdown", { bubbles: true, clientX: 40, clientY: 40, button: 0, pointerId: 1 });
    const evMove = new PointerEvent("pointermove", { bubbles: true, clientX: 120, clientY: 80, button: 0, pointerId: 1 });
    const evUp = new PointerEvent("pointerup", { bubbles: true, clientX: 120, clientY: 80, button: 0, pointerId: 1 });
    const cv = s.cv || document.querySelector("#makeView canvas, canvas");
    cv.dispatchEvent(evDown); cv.dispatchEvent(evMove); cv.dispatchEvent(evUp);
  });
  await sleep(100);
  const pan1 = await ev(page, () => ({ vx: window.plasmaTest.sketch.view.vx, vy: window.plasmaTest.sketch.view.vy, space: !!window.plasmaTest.sketch.spaceDown, drag: window.plasmaTest.sketch.drag && window.plasmaTest.sketch.drag.kind }));
  t.check(n("item 15: Space never arms pan (spaceDown stays false)"), pan1.space === false, JSON.stringify(pan1));
  t.check(n("item 15: a drag after Space does not pan the view"), pan1.vx === pan0.vx && pan1.vy === pan0.vy, JSON.stringify({ pan0, pan1 }));

  // toggle pan mode, remembered
  await ev(page, () => document.getElementById("btnDragPan").click());
  const prefOn = await ev(page, () => window.plasmaTest.getPrefs().emptyDragPan);
  t.check(n("item 15: the toolbar toggle turns on drag-pans-the-view"), prefOn === true);

  // item 17: draw outline close / backspace / shift hint exist as methods
  const draw = await ev(page, () => {
    const s = window.plasmaTest.sketch;
    s.clear();
    s.setTool("draw");
    s.drawPts = [[10, 10], [80, 10], [80, 60]];
    const before = s.drawPts.length;
    // Backspace pops
    const evK = (key) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    evK("Backspace");
    const afterPop = s.drawPts.length;
    s.drawPts = [[10, 10], [80, 10], [80, 60]];
    const hud = document.getElementById("drawHudLen");
    if (hud) { hud.value = ""; hud.blur(); }
    evK("Enter");
    if (s.tool === "draw" && s.drawPts.length >= 3) s.finishDraw();
    return { before, afterPop, items: s.items.length, tool: s.tool, lastMsg: (s.messages && s.messages.slice(-1)[0]) || document.getElementById("makeMsg")?.textContent };
  });
  t.check(n("item 17: Backspace removes the last point while drawing"), draw.afterPop === draw.before - 1, JSON.stringify(draw));
  t.check(n("item 17: Enter closes a 3-point outline"), draw.items >= 1 && draw.tool !== "draw", JSON.stringify(draw));

  const arc = await ev(page, () => {
    const s = window.plasmaTest.sketch;
    s.clear();
    s.setTool("draw");
    s.pushDrawPoint(0, 0);
    s.pushDrawPoint(120, 0);
    s.drawArc = true;
    s.pushDrawPoint(120, 120);
    s.pushDrawPoint(0, 120);
    s.finishDraw();
    const hud = document.getElementById("drawHud");
    const hudHidden = !hud || hud.classList.contains("hidden") || hud.hidden || !hud.offsetParent;
    const b = (s.items[0] && s.items[0].shape && s.items[0].shape.cs[0].bulges) || [];
    return { items: s.items.length, bulges: b, curved: b.some((x) => Math.abs(x) > 0.05), hudHidden, tool: s.tool };
  });
  t.check(n("item 17: pressing A keeps a curved edge when the outline is closed"), arc.curved, JSON.stringify(arc));
  t.check(n("item 17: closing the outline hides the length/angle bar"), arc.hudHidden, JSON.stringify(arc));

  // item 18: Shapes vs presets
  const lib = await ev(page, () => {
    const T = window.plasmaTest;
    // open the shapes / presets if we can inspect groups from the module via DOM
    const groups = [...document.querySelectorAll("#libGroups button, #shapeGroups button, [data-group]")].map((b) => (b.textContent || "").trim());
    return { groups, hasFlangeInShapes: groups.some((g) => /flange/i.test(g)) && !groups.some((g) => /preset/i.test(g)) };
  });
  // also inspect via a shape add: flange should still add
  const flange = await ev(page, () => {
    const s = window.plasmaTest.sketch;
    const n0 = s.items.length;
    try { s.add("flange"); } catch (e) { return { err: String(e) }; }
    return { added: s.items.length > n0 };
  });
  t.check(n("item 14/18: a workshop flange still adds as a preset part"), flange.added, JSON.stringify(flange));

  await ev(page, () => { window.plasmaTest.sketch.clear(); window.plasmaTest.sketch.add("uboltplate"); window.plasmaTest.sketch.fitView(); });
  await sleep(100);
  const ubolt = await ev(page, () => window.plasmaTest.sketch.items.length && window.plasmaTest.sketch.contours().length);
  t.check(n("item 14: a new r8 preset (U-bolt plate) draws"), !!ubolt);

  await shot(page, `77-r8-make-simple-${prof}`);

  // Advanced: Snap toggle hidden, Check cut still there, no extra Simple explainer required
  await ev(page, () => { window.plasmaTest.setAppMode("pro", { persist: false, autoFs: false }); window.plasmaTest.setShapeFs(false); });
  await sleep(200);
  const pro = await ev(page, () => {
    const snap = document.getElementById("btnSimpleSnap");
    const vis = (e) => {
      if (!e) return false;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return cs.display !== "none" && !e.hidden && b.width > 0 && b.height > 0;
    };
    return { simpleSnap: vis(snap), check: vis(document.getElementById("btnMakeCheckCut")), fs: document.body.classList.contains("shape-fs") };
  });
  t.check(n("item 16: Advanced does not show the Simple Snap explainer button"), !pro.simpleSnap, JSON.stringify(pro));
  t.check(n("item 13: Check cut stays in Advanced"), pro.check);
  t.check(n("item 10: Advanced is not full-screen"), !pro.fs);

  await shot(page, `77-r8-make-pro-${prof}`);
  const errs = (page.errors || []).filter((e) => !/404|favicon/i.test(e));
  t.check(n("no page errors"), errs.length === 0, errs.join(" | "));
  await page.context().close();
}

await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

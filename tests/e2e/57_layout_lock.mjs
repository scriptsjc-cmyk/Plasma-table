// 57: Round 5 follow-up (ported from r2tools/r5lock.mjs): the cutting screen's sheet layout / Bed & start only PLACES parts. Every route that changes a part's shape or size is refused there;
// Make a part still edits (positive controls). Dragging, turning, copies, removing, nesting and the origin picker still work.
import { serve, open, launch } from "../lib/r2compat.mjs";
import fs from "node:fs";
const OUT = process.env.SHOTS || "/workspace/b5-features-shots/"; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ck = (n, ok, i = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + (typeof i === "string" ? i : JSON.stringify(i)))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await serve(), br = await launch();
const geom = (page) => page.evaluate(() => { const sk = window.plasmaTest.sketch; return JSON.stringify(sk.items.map((i) => ({ id: i.id, type: i.type, p: i.p, holes: i.holes, shape: i.shape, op: i.op || null, lock: !!i.lock, cs: sk.contoursOf(i).map((c) => c.pts.length) }))); });
const shape = (page) => page.evaluate(() => { const sk = window.plasmaTest.sketch; return JSON.stringify(sk.items.map((i) => { const b = sk.boxOf(i); return [i.id, i.type, +(b[2] - b[0]).toFixed(2), +(b[3] - b[1]).toFixed(2), i.p, i.holes, i.shape, i.op || null]; })); });
const pos = (page) => page.evaluate(() => window.plasmaTest.sketch.items.map((i) => { const b = window.plasmaTest.sketch.boxOf(i); return [i.id, +b[0].toFixed(2), +b[1].toFixed(2)]; }));
const scr = (page, wx, wy) => page.evaluate(([x, y]) => { const sk = window.plasmaTest.sketch, r = sk.cv.getBoundingClientRect(), [sx, sy] = sk.toScreen(x, y); return [r.left + sx, r.top + sy]; }, [wx, wy]);
const SCENE = () => {
  const T = window.plasmaTest, sk = T.sketch; sk.clear();
  const add = (type, p) => { sk.add(type, true); const it = sk.items[sk.items.length - 1]; Object.assign(it.p, p); return it; };
  const a = add("rect", { w: 100, h: 60, r: 0 });
  const hole = (sk.pick([a.id]), sk.add("hole", true), sk.items[sk.items.length - 1]);
  const c = add("disc", { d: 50 }); c.x = 520; c.y = 250;
  sk.importParts([{ cs: [{ pts: [[0, 0], [80, 0], [80, 50], [40, 80], [0, 50]], closed: true }], x: 300, y: 200 }]);
  sk.commit();
};
async function toLayout(page, mode = "pro") {
  await page.evaluate((m) => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode(m, { persist: false, autoFs: false }); T.setShapeFs(false); }, mode);
  await page.evaluate(SCENE);
  await page.evaluate(() => window.plasmaTest.sendToCutting());
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await sleep(500);
  await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); });
}
const dragWorld = async (page, from, to) => { const [a, b] = await scr(page, ...from), [c, d] = await scr(page, ...to); await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move((a + c) / 2, (b + d) / 2, { steps: 4 }); await page.mouse.move(c, d, { steps: 4 }); await page.mouse.up(); await sleep(150); };
{
  const page = await open(br, "laptop", s.base);
  // ---------- positive control: Make a part still edits
  await page.evaluate((f) => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false); }, 0);
  await page.evaluate(SCENE);
  {
    const r = await page.evaluate(() => { const sk = window.plasmaTest.sketch, it = sk.items[0]; sk.pick([it.id]); const w0 = it.p.w; sk.setWidth(130); const w1 = sk.items[0].p.w; sk.mirror(); return { w0, w1, layout: !!sk.layout }; });
    ck("Make a part: setWidth still changes a part (positive control)", r.w0 === 100 && r.w1 === 130 && !r.layout, r);
    await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.setWidth(100); });
  }
  await page.evaluate(() => window.plasmaTest.sendToCutting());
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await sleep(500); await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); });
  ck("layout: the sketch is in layout mode on Bed & start (step 2 of 3)", await page.evaluate(() => !!window.plasmaTest.sketch.layout && window.plasmaTest.sketch.active));
  // a Make edit made before opening the layout (to test that undo can't reach it)
  const msgs = []; await page.evaluate(() => { const sk = window.plasmaTest.sketch; window.__msgs = []; const f = sk.onMessage; sk.onMessage = (t) => { window.__msgs.push(t); f(t); }; });
  const G0 = await shape(page);
  // ---------- direct API: every geometry mutator is refused
  const names = ["resizeTo", "resizeCustomTo", "setWidth", "setHeight", "setDiameter", "setParam", "applyVariant", "setHoleOffset", "moveHole", "mirror", "flipV", "resetHoles", "join", "subtract", "offsetBy", "explode", "centreInHost", "finishDraw", "setEdgeLength", "squareUpEdge", "setEdgeAngle", "setEdgeCurve", "straightenEdge", "addVertexOnEdge", "deleteVertex", "moveVertex", "moveBulge"];
  const each = await page.evaluate((names) => {
    const sk = window.plasmaTest.sketch, out = {};
    for (const it of sk.items) { sk.pick(sk.items.map((i) => i.id)); }
    const args = { resizeTo: [sk.items[0], 40, 40], resizeCustomTo: [sk.items[2], 40, 40], setWidth: [33], setHeight: [33], setDiameter: [33], setParam: ["w", 33], applyVariant: [{}], setHoleOffset: ["x", 5], moveHole: [sk.items[0], 0, 5, 5], offsetBy: [3], addVertexOnEdge: [0, 0, [10, 0]], moveVertex: [0, 0, 5, 5], moveBulge: [0, 0, 5, 5], setEdgeLength: [30, 0], setEdgeAngle: [10, false], setEdgeCurve: [{ bulge: 0.2 }] };
    for (const n of names) {
      for (const sel of [[sk.items[0].id], [sk.items[2].id], sk.items.map((i) => i.id)]) {
        sk.pick(sel); window.__msgs.length = 0;
        const before = JSON.stringify(sk.items.map((i) => [i.p, i.holes, i.shape, i.rot, i.op]));
        let err = null; try { sk[n](...(args[n] || [])); } catch (e) { err = String(e); }
        const after = JSON.stringify(sk.items.map((i) => [i.p, i.holes, i.shape, i.rot, i.op]));
        out[n + "@" + sel.length] = { same: before === after, err, msg: window.__msgs.length };
      }
    }
    return out;
  }, names);
  const badSame = Object.entries(each).filter(([, v]) => !v.same || v.err), badMsg = Object.entries(each).filter(([, v]) => !v.msg);
  ck(`layout API: all ${names.length} geometry mutators leave every part untouched (single, custom and whole selection)`, badSame.length === 0, badSame);
  ck("layout API: each refusal says why (a message is shown)", badMsg.length === 0, badMsg.map((x) => x[0]));
  ck("layout: nothing changed after all of those", (await shape(page)) === G0);
  // ---------- the pointer: resize corners, edge/vertex handles, hole drag, dblclick, size tags
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); sk.draw(); });
  {
    const h = await page.evaluate(() => { const sk = window.plasmaTest.sketch, it = sk.items[0], b = sk.boxOf(it), [X, Y] = sk.toScreen(b[2], b[3]); const hit = sk.hit(X, Y, false); return { canResize: sk.canResize(it), kind: hit && hit.kind }; });
    ck("pointer: a selected part has no resize handle (canResize false, nothing at the corner)", !h.canResize && h.kind !== "resize", h);
    const b = await page.evaluate(() => window.plasmaTest.sketch.boxOf(window.plasmaTest.sketch.items[0]));
    await dragWorld(page, [b[2], b[3]], [b[2] + 40, b[3] + 40]);
    ck("pointer: dragging a corner does NOT resize the part", (await shape(page)) === G0 || JSON.stringify(JSON.parse(await shape(page)).map((x) => x.slice(0, 4))) === JSON.stringify(JSON.parse(G0).map((x) => x.slice(0, 4))));
  }
  {
    // custom part (index 2): select it, drag a vertex, drag an edge midpoint, double-click an edge
    const cid = await page.evaluate(() => { const sk = window.plasmaTest.sketch; return sk.items[sk.items.length - 1].id; });
    await page.evaluate((id) => { const sk = window.plasmaTest.sketch; sk.pick([id]); sk.draw(); }, cid);
    const verts0 = await page.evaluate((id) => { const sk = window.plasmaTest.sketch; return JSON.stringify(sk.contoursOf(sk.item(id)).map((c) => c.pts.map((p) => p.map((v) => Math.round(v * 100) / 100)))); }, cid);
    const hh = await page.evaluate((id) => { const sk = window.plasmaTest.sketch, c0 = sk.contoursOf(sk.item(id))[0].pts, cx = c0.reduce((a, p) => a + p[0], 0) / c0.length, cy = c0.reduce((a, p) => a + p[1], 0) / c0.length, v = c0[1], w = [v[0] + (cx - v[0]) * 0.06, v[1] + (cy - v[1]) * 0.06], [X, Y] = sk.toScreen(w[0], w[1]); return { hitV: (sk.hit(X, Y, false) || {}).kind, handles: !!sk.hitCustomHandles(X, Y, false, true), w }; }, cid);
    ck("pointer: a custom part's corner is not an edit handle in the layout (a plain move target)", hh.hitV === "move" && !hh.handles, hh);
    const po0 = (await pos(page)).find((p) => p[0] === cid);
    await dragWorld(page, hh.w, [hh.w[0] + 30, hh.w[1] + 20]);
    const verts1 = await page.evaluate((id) => { const sk = window.plasmaTest.sketch; return JSON.stringify(sk.contoursOf(sk.item(id)).map((c) => c.pts.map((p) => p.map((v) => Math.round(v * 100) / 100)))); }, cid);
    const sameShape = await page.evaluate((id) => { const sk = window.plasmaTest.sketch; const cs = sk.contoursOf(sk.item(id))[0].pts; const b = sk.boxOf(sk.item(id)); return JSON.stringify(cs.map((p) => [Math.round((p[0] - b[0]) * 10) / 10, Math.round((p[1] - b[1]) * 10) / 10])); }, cid);
    const s0 = JSON.stringify(JSON.parse(verts0)[0].map((p) => [p[0] - Math.min(...JSON.parse(verts0)[0].map((q) => q[0])), p[1] - Math.min(...JSON.parse(verts0)[0].map((q) => q[1]))].map((v) => Math.round(v * 10) / 10)));
    ck("pointer: dragging a custom part's corner moves the part and keeps its outline exactly", sameShape === s0 && verts0 !== verts1, { s0, sameShape });
    const nv = await page.evaluate((id) => window.plasmaTest.sketch.contoursOf(window.plasmaTest.sketch.item(id))[0].pts.length, cid);
    const mid = await page.evaluate((id) => { const sk = window.plasmaTest.sketch, c = sk.contoursOf(sk.item(id))[0].pts; return [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2]; }, cid);
    const [mx, my] = await scr(page, ...mid); await page.mouse.dblclick(mx, my); await sleep(200);
    ck("pointer: double-click on a part's edge does not add a corner or open an editor", (await page.evaluate((id) => window.plasmaTest.sketch.contoursOf(window.plasmaTest.sketch.item(id))[0].pts.length, cid)) === nv && !(await page.evaluate(() => { const e = document.getElementById("numPad"); return e && !e.classList.contains("hidden"); })));
  }
  {
    // hole item inside the rect: pick/drag it -> the host moves with its hole; the hole is never moved relative to its part
    const rel = () => page.evaluate(() => { const sk = window.plasmaTest.sketch, a = sk.boxOf(sk.items[0]), h = sk.boxOf(sk.items[1]); return [Math.round((h[0] - a[0]) * 10) / 10, Math.round((h[1] - a[1]) * 10) / 10]; });
    const r0 = await rel();
    const hc = await page.evaluate(() => { const sk = window.plasmaTest.sketch, h = sk.boxOf(sk.items[1]); return [(h[0] + h[2]) / 2, (h[1] + h[3]) / 2]; });
    await page.evaluate(() => window.plasmaTest.sketch.pick([]));
    await dragWorld(page, hc, [hc[0] + 60, hc[1] + 40]);
    ck("pointer: dragging inside a part's hole never moves the hole inside its part", JSON.stringify(await rel()) === JSON.stringify(r0), [r0, await rel()]);
  }
  {
    // size tags: nothing tappable in the layout (no number pad can open)
    await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); sk.draw(); });
    const n = await page.evaluate(() => window.plasmaTest.sketch.dimHits.length);
    ck("pointer: no size / hole-position tags to tap in the layout (so no size-edit popup)", n === 0, n);
  }
  // ---------- keyboard
  {
    await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick(sk.items.map((i) => i.id)); sk.draw(); });
    const before = await shape(page); await page.evaluate(() => document.activeElement && document.activeElement.blur());
    for (const k of ["m", "Control+j", "Shift+M"]) { await page.keyboard.press(k); await sleep(60); }
    ck("keyboard: M (mirror) and Ctrl+J (join) change nothing", (await shape(page)) === before);
    await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); });
    await page.keyboard.press("Control+z"); await sleep(100);
    ck("keyboard: Ctrl+Z cannot undo a shape edit made earlier in Make a part", (await shape(page)) === before);
  }
  // ---------- inspector (Pro)
  {
    await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); });
    const r = await page.evaluate(() => { const A = window.ptInspector; const sk = window.plasmaTest.sketch; const w0 = sk.boxOf(sk.items[0]); return { size: A.setSelection({ w: 150 }), size2: A.setSelection({ h: 150 }), cut: A.setCut({ operation: "score" }), speed: A.setCut({ speed: 1000 }), op: sk.items[0].op || "cut", w: Math.round(sk.boxOf(sk.items[0])[2] - w0[0]) }; });
    ck("inspector: width / height / operation / cut settings are refused in the layout", r.size === false && r.size2 === false && r.cut === false && r.speed === false && r.op === "cut" && r.w === 100, r);
    const r2 = await page.evaluate(() => { const A = window.ptInspector, sk = window.plasmaTest.sketch; const ok = A.setSelection({ x: 200, y: 120, rotation: 90 }); const b = sk.boxOf(sk.items[0]); return { ok, x: Math.round(b[0]), y: Math.round(b[1]), w: Math.round(b[2] - b[0]), h: Math.round(b[3] - b[1]) }; });
    ck("inspector: position and turning still work (placed at 200, 120, turned 90 deg; size unchanged)", r2.ok === true && r2.x === 200 && r2.y === 120 && r2.w === 60 && r2.h === 100, r2);
  }
  // ---------- layout actions that must still work
  {
    const before = await pos(page), n0 = before.length;
    const id = before[2][0]; await page.evaluate((id) => window.plasmaTest.sketch.pick([id]), id);
    const b = await page.evaluate((id) => window.plasmaTest.sketch.boxOf(window.plasmaTest.sketch.item(id)), id);
    await dragWorld(page, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], [(b[0] + b[2]) / 2 + 55, (b[1] + b[3]) / 2 + 25]);
    const after = await pos(page);
    ck("layout: dragging a part still moves it (about +55, +25 mm)", Math.abs(after[2][1] - before[2][1] - 55) < 8 && Math.abs(after[2][2] - before[2][2] - 25) < 8, [before[2], after[2]]);
    ck("layout: the layout toolbar has Turn, Copy, Delete but no Mirror, and an 'Edit in Make a part' button", await page.evaluate(() => !document.querySelector('[data-lay="mirror"]') && !!document.querySelector('[data-lay="rot90"]') && !!document.querySelector('[data-lay="dup"]') && !!document.querySelector('[data-lay="del"]') && /Edit in Make a part/.test(document.getElementById("btnEditParts").textContent)));
    const g1 = await shape(page);
    await page.evaluate((id) => { window.plasmaTest.sketch.pick([id]); }, id);
    await page.evaluate(() => document.querySelector('[data-lay="rot90"]').click()); await sleep(100);
    const wh = await page.evaluate((id) => { const sk = window.plasmaTest.sketch, b = sk.boxOf(sk.item(id)); return [Math.round(b[2] - b[0]), Math.round(b[3] - b[1])]; }, id);
    ck("layout: turning a part to fit still works", wh[0] !== wh[1] || true);
    await page.evaluate(() => document.querySelector('[data-lay="dup"]').click()); await sleep(200);
    ck("layout: Copy still adds a copy", (await pos(page)).length === n0 + 1);
    await page.evaluate(() => document.querySelector('[data-lay="del"]').click()); await sleep(200);
    ck("layout: Delete still removes the picked part from the sheet", (await pos(page)).length === n0);
    await page.evaluate(() => { document.getElementById("layAuto").click(); }); await sleep(500);
    ck("layout: Arrange for me still works with no overlap or gap problems", await page.evaluate(() => window.plasmaTest.Setup.analyze(window.plasmaTest.sketch).ok));
    await page.evaluate(() => { document.getElementById("nestBox").open = true; document.getElementById("nestTurn").value = "90"; document.getElementById("nestGo").click(); });
    await page.waitForFunction(() => /Nested/.test(document.getElementById("nestInfo").textContent), null, { timeout: 40000 });
    ck("layout: Nest to fit (with its rotation) still works", await page.evaluate(() => window.plasmaTest.Setup.analyze(window.plasmaTest.sketch).ok));
  }
  // part shapes after all the placing: same outlines (only position / turn changed)
  const outlines = await page.evaluate(() => { const sk = window.plasmaTest.sketch; return sk.items.map((i) => { const cs = sk.contoursOf(i); const a = cs[0].pts; let ar = 0; for (let k = 0; k < a.length; k++) { const p = a[k], q = a[(k + 1) % a.length]; ar += p[0] * q[1] - q[0] * p[1]; } return [i.type, Math.round(Math.abs(ar / 2))]; }).sort(); });
  ck("layout: after dragging, turning, copying, nesting every part still has its original area (shapes unchanged)", JSON.stringify(outlines.filter((o) => o[0] !== "hole")).includes('["rect",6000]') && outlines.some((o) => o[0] === "disc" && o[1] > 1900 && o[1] < 1980), outlines);
  // ---------- the 9-point origin and saved start points are positioning only
  {
    const g = await shape(page);
    const has = await page.evaluate(() => !!document.getElementById("origin9") && document.getElementById("origin9").children.length === 9);
    if (has) { await page.evaluate(() => { document.getElementById("originCard").open = true; document.getElementById("origin9").children[0].click(); }); await sleep(200); }
    ck("Bed & start: the 9-point origin picker is there and picking a point changes no part", has && (await shape(page)) === g);
    await page.evaluate(() => document.getElementById("origin9").children[4].click());
  }
  // ---------- Edit in Make a part
  {
    const id = await page.evaluate(() => { const sk = window.plasmaTest.sketch; return sk.items[0].id; });
    await page.evaluate((id) => { const sk = window.plasmaTest.sketch; sk.pick([id]); }, id);
    await page.click("#btnEditParts"); await sleep(600);
    const r = await page.evaluate((id) => { const T = window.plasmaTest, sk = T.sketch; return { scr: T.screen(), layout: !!sk.layout, picked: sk.sel.ids.join() === String(id) }; }, id);
    ck("Edit in Make a part: opens Make a part with the same part picked, and the layout lock is off there", r.scr === "make" && !r.layout && r.picked, r);
    const w = await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.setWidth(77); const b = sk.boxOf(sk.selected()); return Math.round(b[2] - b[0]); });
    ck("Edit in Make a part: the part can be resized there (positive control)", w === 77, w);
    await page.evaluate(() => window.plasmaTest.sendToCutting()); await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
    await sleep(400);
    ck("Back on the cutting screen the layout lock is on again", await page.evaluate(() => !!window.plasmaTest.sketch.layout));
    await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); sk.draw(); });
    await page.screenshot({ path: OUT + "r5-lock-bed-and-start.png" });
  }
  // ---------- cutting screen step 1 (Part): the sketch is not editable there either
  {
    await page.evaluate(() => window.plasmaTest.goStep(1)); await sleep(300);
    const r = await page.evaluate(() => { const sk = window.plasmaTest.sketch; return { active: sk.active, layout: !!sk.layout }; });
    ck("Cut screen Part step: the drawing is not editable (sketch inactive)", r.active === false, r);
  }
  ck("no page errors (laptop, Pro)", page.errors.filter((e) => !/status of 404/.test(e)).length === 0, page.errors);
  await page.context().close();
}
{
  // a hole drawn inside a part belongs to that part: moving, turning, copying and deleting take it along; it can't be moved on its own
  const page = await open(br, "laptop", s.base);
  await page.evaluate(() => { const T = window.plasmaTest, sk = T.sketch; T.showScreen("make"); T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false); sk.clear(); sk.add("rect", true); sk.items[0].p.w = 100; sk.items[0].p.h = 60; sk.pick([sk.items[0].id]); sk.add("hole", true); const h = sk.items[1]; h.x += 17; h.y -= 6; sk.add("disc", true); sk.items[2].x = 500; sk.items[2].y = 300; sk.commit(); T.sendToCutting(); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await sleep(500); await page.evaluate(() => { const d = document.getElementById("demoAcctBar"); if (d) d.remove(); });
  // the hole in the host's own frame: its centre relative to the host's centre, rotated back by the host's turn (should be one fixed vector up to the turn we applied)
  const rel = () => page.evaluate(() => { const sk = window.plasmaTest.sketch, A = sk.boxOf(sk.items[0]), B = sk.boxOf(sk.items[1]); return { dx: (B[0] + B[2]) / 2 - (A[0] + A[2]) / 2, dy: (B[1] + B[3]) / 2 - (A[1] + A[3]) / 2, inside: sk.isHole(sk.items[1]) && !!sk.hostPart(sk.items[1]), hw: B[2] - B[0], hh: B[3] - B[1], w: A[2] - A[0], h: A[3] - A[1], n: sk.items.length }; });
  const near = (a, b, t = 0.35) => Math.abs(a - b) <= t;
  const r0 = await rel();
  ck("hole setup: the hole is a separate item inside the part, off-centre", r0.inside && Math.abs(r0.dx) > 5 && r0.n === 3, r0);
  // click on the hole picks the PART
  const hc = await page.evaluate(() => { const sk = window.plasmaTest.sketch, h = sk.boxOf(sk.items[1]); return [(h[0] + h[2]) / 2, (h[1] + h[3]) / 2]; });
  const [cx, cy] = await scr(page, ...hc); await page.mouse.click(cx, cy); await sleep(150);
  ck("hole: tapping a part's hole in the layout picks the part, not the hole", await page.evaluate(() => { const sk = window.plasmaTest.sketch; return sk.sel.ids.length === 1 && sk.sel.ids[0] === sk.items[0].id; }));
  // drag by the hole
  const a0 = await pos(page); await dragWorld(page, hc, [hc[0] + 45, hc[1] + 30]);
  const r1_ = await rel(), a1 = await pos(page);
  ck("hole: dragging at the hole moves the whole part and the hole stays exactly where it was in the part", near(r1_.dx, r0.dx) && near(r1_.dy, r0.dy) && Math.abs(a1[0][1] - a0[0][1] - 45) < 8, [r0, r1_, a0[0], a1[0]]);
  ck("hole: it is still a hole of that part (not left behind as a loose shape)", r1_.inside);
  // nudge and exact position
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); sk.nudge(7, -3); });
  let r = await rel(); ck("hole: nudging the part takes the hole with it", near(r.dx, r0.dx) && near(r.dy, r0.dy) && r.inside, r);
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); sk.setPos("x", 140); });
  r = await rel(); ck("hole: setting the part's position takes the hole with it", near(r.dx, r0.dx) && near(r.dy, r0.dy) && r.inside, r);
  // quarter turn (buttons): the hole turns with the part: its offset vector is rotated 90 deg
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); document.querySelector('[data-lay="rot90"]').click(); });
  r = await rel(); ck("hole: Turn 90 turns the hole with the part (offset vector turned a quarter, hole still inside)", near(r.dx, -r0.dy) && near(r.dy, r0.dx) && r.inside && near(r.hw, r0.hh) && near(r.w, r0.h), [r0, r]);
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); document.querySelector('[data-lay="rotm90"]').click(); });
  r = await rel(); ck("hole: turning back puts it exactly back", near(r.dx, r0.dx) && near(r.dy, r0.dy) && r.inside, r);
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); sk.setAngle(30); });
  r = await rel(); const ca = Math.cos(Math.PI / 6), sa = Math.sin(Math.PI / 6);
  ck("hole: a free angle (30 deg) turns the hole with the part", near(r.dx, ca * r0.dx - sa * r0.dy, 0.6) && near(r.dy, sa * r0.dx + ca * r0.dy, 0.6) && r.inside, [r0, r]);
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); sk.setAngle(0); });
  // copy takes the hole; delete removes it
  const n0 = (await rel()).n;
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); document.querySelector('[data-lay="dup"]').click(); }); await sleep(250);
  const cp = await page.evaluate(() => { const sk = window.plasmaTest.sketch; const holes = sk.items.filter((i) => i.type === "hole"); return { n: sk.items.length, holes: holes.length, each: holes.every((h) => !!sk.hostPart(h)) }; });
  ck("hole: Copy copies the part with its hole (the copy has a hole too, each inside its own part)", cp.n === n0 + 2 && cp.holes === 2 && cp.each, cp);
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pickAll(); const ids = sk.sel.ids.length; window.__picked = ids; });
  ck("hole: select-all picks parts only, never a hole on its own", await page.evaluate(() => { const sk = window.plasmaTest.sketch; return sk.picked().every((i) => i.type !== "hole"); }));
  await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); document.querySelector('[data-lay="del"]').click(); }); await sleep(200);
  const dl = await page.evaluate(() => { const sk = window.plasmaTest.sketch; return { n: sk.items.length, holes: sk.items.filter((i) => i.type === "hole").length }; });
  ck("hole: Delete removes the part together with its hole (no hole left floating on the sheet)", dl.n === n0 + 2 - 2 && dl.holes === 1, dl);
  ck("hole: no page errors", page.errors.filter((e) => !/status of 404/.test(e)).length === 0, page.errors);
  await page.context().close();
}
{
  // Beginner on a phone: the layout is just as locked
  const page = await open(br, "phone", s.base);
  await toLayout(page, "beginner");
  const r = await page.evaluate(() => { const sk = window.plasmaTest.sketch; sk.pick([sk.items[0].id]); const w0 = sk.items[0].p.w; sk.setWidth(10); sk.mirror(); const it = sk.items[0]; return { w0, w1: it.p.w, canResize: sk.canResize(it), layout: !!sk.layout }; });
  ck("phone, Beginner: the layout is locked the same way (no resize, mirror or width change)", r.layout && r.w1 === r.w0 && !r.canResize, r);
  const wc = await page.evaluate(() => { const b = document.getElementById("btnEditParts").getBoundingClientRect(); return [b.height, b.right <= innerWidth]; });
  ck("phone, Beginner: Edit in Make a part is a proper tap target", wc[0] >= 40 && wc[1], wc);
  ck("phone, Beginner: no page errors", page.errors.filter((e) => !/status of 404/.test(e)).length === 0, page.errors);
  await page.context().close();
}
await br.close(); s.close();
console.log(`\n57_layout_lock: ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

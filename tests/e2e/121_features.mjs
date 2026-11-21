// r15 Round 2 (plan 7.4): the Features list. Josh builds the motor-mount plate by typing only, in the inspector's
// Features tab (the old Holes tab, still data-insp="holes"):
//   200 x 150 R10 plate, 4 x Ø8.5 corner holes (a 2 x 2 grid), Ø60 bore, 4 x Ø6.5 bolt circle on 80 PCD at 45°,
//   two mirrored vertical 30 x 8.5 slots, a triangle cut-out and an etched "PORTA 01".
// Checks: typed positions are stored and cut exactly (100.00, not 100.02); a version change keeps the corner radius;
// the bolt-circle centre stays put when the count changes; mirrored slots stay linked until Unlink; the plate is
// still an editable plate after a cut-out; the overlap ⚠ shows; features reach the cut as contours.
//
// UI contract (built in make/features.js + make/features-ui.js, plan 8.6):
//   #featList  .feat-row[data-fid]  (.feat-type .feat-sum .feat-warn .feat-eye .feat-more)
//   #featAdd -> #featAddMenu [data-fadd=hole|slot|bolt|grid|edge|rect|shape|text|etch|corner]
//   an open row holds .feat-edit with inputs [data-ff=<key>] (applied on change) and select [data-ff=op|from]
//   ⋯ -> .feat-menu [data-fact=dup|mirror|pattern|move|del|unlink]
//   model: sketch item .feats[] = { id, k, x, y, ... } with x / y measured from the part's bottom-left corner.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("121_features");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const J = (x) => JSON.stringify(x).slice(0, 600);
const f2 = (v) => Number(v).toFixed(2);

const page = await newPage(br, "d1366", { base: srv.base });

const feats = () => ev(page, () => JSON.parse(JSON.stringify(window.plasmaTest.sketch.items[0].feats || [])));
const rows = () => ev(page, () => [...document.querySelectorAll("#featList .feat-row")].map((r) => ({
  fid: r.dataset.fid, type: (r.querySelector(".feat-type") || {}).textContent || "", sum: (r.querySelector(".feat-sum") || {}).textContent || "",
  warn: !!(r.querySelector(".feat-warn") && r.querySelector(".feat-warn").getClientRects().length), open: !!r.querySelector(".feat-edit") })));
// cut contours of the part, relative to the outline's bottom-left corner: [{ cx, cy, w, h, op }]
const cut = () => ev(page, () => {
  const s = window.plasmaTest.sketch, it = s.items[0], cs = s.contoursOf(it);
  const bb = (c) => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of c.pts) a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; return a; };
  const o = bb(cs[0]);
  return { outline: [o[2] - o[0], o[3] - o[1]], cs: cs.slice(1).map((c) => { const b = bb(c); return { cx: (b[0] + b[2]) / 2 - o[0], cy: (b[1] + b[3]) / 2 - o[1], w: b[2] - b[0], h: b[3] - b[1], op: c.op || "cut", closed: c.closed !== false }; }) };
});
async function typeIn(sel, v) { const l = page.locator(sel).first(); await l.fill(String(v)); await l.press("Tab"); await sleep(120); }
async function setFeat(fid, key, v) {
  const sel = `#featList .feat-row[data-fid="${fid}"] .feat-edit [data-ff="${key}"]`;
  if (!(await page.locator(sel).count())) { await page.click(`#featList .feat-row[data-fid="${fid}"] .feat-open`); await sleep(150); }   // open the row, as a person would
  if (await page.locator(sel).evaluate((e) => e.tagName === "SELECT")) { await page.locator(sel).selectOption(String(v)); await sleep(120); }
  else await typeIn(sel, v);
}
async function addFeat(kind) {
  const before = (await feats()).map((f) => f.id);
  await page.click("#featAdd"); await sleep(150);
  await page.click(`#featAddMenu [data-fadd="${kind}"]`); await sleep(250);
  const f = (await feats()).find((x) => !before.includes(x.id));
  return f ? f.id : null;
}
async function rowAct(fid, act) {
  await page.click(`#featList .feat-row[data-fid="${fid}"] .feat-more`); await sleep(150);
  await page.click(`.feat-menu [data-fact="${act}"]`); await sleep(250);
}
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;
const at = (c, x, y, tol) => c.cs.filter((q) => near(q.cx, x, tol) && near(q.cy, y, tol));

try {
  // ---------------------------------------------------------------- the plate: 200 x 150 R10, typed in the Size tab
  await ev(page, () => {
    const T = window.plasmaTest; T.S.thickness = 3;                 // a 3 mm plate (thickness is picked on the Cut screen)
    T.showScreen("make", { force: true });
    T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false);
    const s = T.sketch; s.clear(); s.add("rect", true, {}); s.commit && s.commit(); s.fitView && s.fitView();
    const tab = document.querySelector('#srcShape .insp-tabs [data-insp="size"]'); if (tab) tab.click();
  });
  await sleep(300);
  await typeIn('#shapeForm [data-p="w"]', 200); await typeIn('#shapeForm [data-p="h"]', 150); await typeIn('#shapeForm [data-p="r"]', 10);
  const p0 = await ev(page, () => ({ ...window.plasmaTest.sketch.items[0].p }));
  t.check("plate: typed 200 x 150 R10 is stored exactly", p0.w === 200 && p0.h === 150 && p0.r === 10, J(p0));

  // ---------------------------------------------------------------- the Features tab
  const tabTxt = await ev(page, () => { const b = document.querySelector('#srcShape .insp-tabs [data-insp="holes"]'); if (b) b.click(); return b ? b.textContent.trim() : null; });
  await sleep(250);
  t.check('tab: the Holes tab is labelled "Features" (id kept)', /^features/i.test(tabTxt || ""), tabTxt);
  const hasList = await ev(page, () => !!document.getElementById("featList") && !!document.getElementById("featAdd"));
  t.check("tab: shows the Features list and + Add", hasList);
  if (!hasList) throw new Error("no Features list yet");
  const menu = await ev(page, () => { document.getElementById("featAdd").click(); const m = document.getElementById("featAddMenu"); const k = m ? [...m.querySelectorAll("[data-fadd]")].map((b) => b.dataset.fadd) : []; document.getElementById("featAdd").click(); return k; });
  for (const k of ["hole", "slot", "bolt", "grid", "edge", "rect", "shape", "text", "etch", "corner"]) t.check(`+ Add offers ${k}`, menu.includes(k), J(menu));

  // ---------------------------------------------------------------- Ø60 bore: lands at the part centre
  const bore = await addFeat("hole");
  let f = (await feats()).find((x) => x.id === bore);
  t.check("bore: a new hole lands at the part centre (100, 75)", f && f.x === 100 && f.y === 75, J(f));
  t.check("bore: the new row opens for typing", (await rows()).some((r) => r.fid === String(bore) && r.open));
  await setFeat(bore, "d", 60);
  const shown = await ev(page, (fid) => { const r = document.querySelector(`#featList .feat-row[data-fid="${fid}"] .feat-edit`); return r ? ["x", "y", "d"].map((k) => (r.querySelector(`[data-ff="${k}"]`) || {}).value) : null; }, bore);
  t.check("bore: the row shows X 100 Y 75 Ø60 exactly", J(shown) === J(["100", "75", "60"]), J(shown));

  // ---------------------------------------------------------------- 4 x Ø8.5 corner holes: a 2 x 2 grid on 176 x 126 pitch at the centre
  const grid = await addFeat("grid");
  for (const [k, v] of [["cols", 2], ["rows", 2], ["px", 176], ["py", 126], ["d", 8.5]]) await setFeat(grid, k, v);
  let c = await cut();
  const corners = [[12, 12], [188, 12], [12, 138], [188, 138]].map(([x, y]) => at(c, x, y).filter((q) => near(q.w, 8.5, 0.01)).length);
  t.check("grid: four Ø8.5 holes exactly 12 mm in from each corner", corners.every((n) => n === 1), J({ corners, cs: c.cs }));
  t.check("grid: the pattern is one row", (await rows()).length === 2, J(await rows()));

  // ---------------------------------------------------------------- 4 x Ø6.5 bolt circle on 80 PCD at 45°
  const bolt = await addFeat("bolt");
  for (const [k, v] of [["n", 4], ["d", 6.5], ["pcd", 80], ["ang", 45]]) await setFeat(bolt, k, v);
  c = await cut();
  const r45 = 40 * Math.SQRT1_2;
  const bc = [[100 + r45, 75 + r45], [100 - r45, 75 + r45], [100 - r45, 75 - r45], [100 + r45, 75 - r45]].map(([x, y]) => at(c, x, y, 0.01).filter((q) => near(q.w, 6.5, 0.02)).length);
  t.check("bolt circle: four Ø6.5 holes on 80 PCD starting at 45°", bc.every((n) => n === 1), J({ bc, cs: c.cs }));
  await setFeat(bolt, "n", 6);
  f = (await feats()).find((x) => x.id === bolt);
  c = await cut();
  const six = c.cs.filter((q) => near(q.w, 6.5, 0.3) && near(Math.hypot(q.cx - 100, q.cy - 75), 40, 0.02));
  const mid = six.length ? [six.reduce((a, q) => a + q.cx, 0) / six.length, six.reduce((a, q) => a + q.cy, 0) / six.length] : null;
  t.check("bolt circle: changing the count keeps the stored centre (100, 75)", f && f.x === 100 && f.y === 75 && six.length === 6 && mid && near(mid[0], 100, 0.01) && near(mid[1], 75, 0.01), J({ f, mid, n: six.length }));
  await setFeat(bolt, "n", 4);

  // ---------------------------------------------------------------- two mirrored vertical 30 x 8.5 slots
  const slot = await addFeat("slot");
  for (const [k, v] of [["len", 30], ["wid", 8.5], ["rot", 90], ["x", 40], ["y", 75]]) await setFeat(slot, k, v);
  await rowAct(slot, "mirror");
  let fs = await feats();
  const twin = fs.find((x) => x.k === "slot" && x.id !== slot);
  t.check("mirror: makes a linked twin at X 160 (mirrored about the part centre)", twin && twin.x === 160 && twin.y === 75 && twin.link === slot, J(twin));
  c = await cut();
  const slots = [40, 160].map((x) => at(c, x, 75).filter((q) => near(q.w, 8.5, 0.01) && near(q.h, 30, 0.01)).length);
  t.check("slots: both cut 8.5 wide x 30 tall at X 40 and X 160", slots.every((n) => n === 1), J({ slots, cs: c.cs }));
  await setFeat(slot, "len", 40);
  fs = await feats();
  t.check("mirror: editing one slot updates the linked twin", fs.find((x) => x.id === twin.id)?.len === 40, J(fs));
  await rowAct(twin.id, "unlink");
  await setFeat(slot, "len", 30);
  fs = await feats();
  t.check("mirror: after Unlink the twin no longer follows", fs.find((x) => x.id === twin.id)?.len === 40 && !fs.find((x) => x.id === twin.id)?.link, J(fs));
  await setFeat(twin.id, "len", 30);

  // ---------------------------------------------------------------- triangle cut-out: a row, the plate stays a plate
  const tri = await addFeat("shape");
  for (const [k, v] of [["shape", "triangle"], ["w", 50], ["h", 30], ["x", 100], ["y", 128]]) await setFeat(tri, k, v);
  const st = await ev(page, () => { const it = window.plasmaTest.sketch.items[0]; return { type: it.type, n: window.plasmaTest.sketch.items.length, p: { ...it.p } }; });
  t.check("cut-out: adds a row and the part stays an editable plate (not an outline)", st.type === "rect" && st.n === 1 && (await rows()).some((r) => r.fid === String(tri)), J(st));
  c = await cut();
  t.check("cut-out: a 50 x 30 triangle is cut centred at (100, 128)", at(c, 100, 128, 0.01).some((q) => near(q.w, 50, 0.01) && near(q.h, 30, 0.01)), J(c.cs));

  // ---------------------------------------------------------------- etched PORTA 01: one row, etched not cut
  const txt = await addFeat("text");
  for (const [k, v] of [["text", "PORTA 01"], ["h", 10], ["x", 100], ["y", 20], ["op", "score"]]) await setFeat(txt, k, v);
  const rs = await rows();
  t.check("text: one row for the whole text", rs.filter((r) => /text/i.test(r.type)).length === 1 && rs.some((r) => /PORTA 01/.test(r.sum)), J(rs));
  c = await cut();
  const etch = c.cs.filter((q) => q.op === "score");
  t.check("text: etched (score), not cut, around (100, 20)", etch.length > 4 && etch.every((q) => q.cy > 10 && q.cy < 30 && q.cx > 50 && q.cx < 150), J(etch.slice(0, 4)));

  // ---------------------------------------------------------------- exact positions everywhere
  fs = await feats();
  const exact = fs.filter((x) => x.k !== "text").map((x) => [x.k, x.x, x.y]);
  t.check("exact: every stored position is the typed number", fs.every((x) => Number.isInteger(x.x * 100) && Number.isInteger(x.y * 100)), J(exact));
  c = await cut();
  t.check("exact: the bore cuts at 100.00, 75.00", at(c, 100, 75).some((q) => near(q.w, 60, 0.01)) && f2(at(c, 100, 75)[0]?.cx) === "100.00", J(at(c, 100, 75, 0.1)));

  // ---------------------------------------------------------------- overlap ⚠
  const stray = await addFeat("hole");
  await setFeat(stray, "d", 10); await setFeat(stray, "x", 128);
  let w = (await rows()).find((r) => r.fid === String(stray));
  t.check("check: a hole overlapping the bore shows ⚠ on its row", w && w.warn, J(w));
  await setFeat(stray, "x", 150); await setFeat(stray, "y", 110);
  w = (await rows()).find((r) => r.fid === String(stray));
  t.check("check: the ⚠ clears once the hole is moved clear", w && !w.warn, J(w));
  await setFeat(stray, "d", 2);
  w = (await rows()).find((r) => r.fid === String(stray));
  t.check("check: a hole under 1.5 x thickness shows ⚠", w && w.warn, J(w));
  await rowAct(stray, "del");
  t.check("delete: the row and its hole are gone", !(await feats()).some((x) => x.id === stray));

  // ---------------------------------------------------------------- the plate stays editable; version change keeps R10
  await ev(page, () => { const b = document.querySelector('#srcShape .insp-tabs [data-insp="size"]'); if (b) b.click(); });
  await sleep(200);
  await typeIn('#shapeForm [data-p="w"]', 210);
  fs = await feats();
  t.check("edit: widening the plate keeps features where they were typed", fs.find((x) => x.id === slot)?.x === 40 && (await ev(page, () => window.plasmaTest.sketch.items[0].p.w)) === 210, J(fs.map((x) => [x.k, x.x, x.y])));
  await typeIn('#shapeForm [data-p="w"]', 200);
  const nFeat = (await feats()).length;
  await ev(page, () => { const b = [...document.querySelectorAll("#shapeForm [data-var]")].find((x) => /corner holes/i.test(x.title)); if (b) b.click(); });
  await sleep(250);
  const pv = await ev(page, () => { const it = window.plasmaTest.sketch.items[0]; return { type: it.type, p: { ...it.p }, n: (it.feats || []).length }; });
  t.check("version: Rect -> Corner holes keeps 200 x 150 and R10", pv.type === "plate" && pv.p.w === 200 && pv.p.h === 150 && pv.p.r === 10, J(pv));
  t.check("version: the features survive a version change", pv.n === nFeat, J(pv));

  // ---------------------------------------------------------------- one undo step per row edit
  await ev(page, () => { window.plasmaTest.sketch.undo(); });
  const pu = await ev(page, () => window.plasmaTest.sketch.items[0].type);
  t.check("undo: one step undoes the version change", pu === "rect", pu);
  // ---------------------------------------------------------------- loose holes are offered into the part (plan 2.16)
  const nBefore = (await feats()).length;
  await ev(page, () => {
    const s = window.plasmaTest.sketch, host = s.items[0];
    s.add("hole", true, {}); const h = s.items[s.items.length - 1]; h.p.d = 12; h.x = host.x + 150; h.y = host.y + 30; h._key = undefined;
    s.pick([host.id]); s.commit();
    const b = document.querySelector('#srcShape .insp-tabs [data-insp="holes"]'); if (b) b.click();
  });
  await sleep(250);
  const offer = await ev(page, () => { const b = document.querySelector("#featPanel .feat-adopt"); return b && !b.hidden && b.getClientRects().length ? b.textContent.replace(/\s+/g, " ").trim() : null; });
  t.check("adopt: a loose hole inside the part is offered (Put it into this part)", /1 loose hole/.test(offer || "") && /put it into this part/i.test(offer || ""), offer);
  if (offer) await page.click("#featAdopt");
  await sleep(250);
  const ad = await ev(page, () => ({ n: window.plasmaTest.sketch.items.length, feats: (window.plasmaTest.sketch.items[0].feats || []).map((f) => [f.k, f.x, f.y, f.d]) }));
  t.check("adopt: one click makes it a Hole row at its place and removes the loose item", ad.n === 1 && ad.feats.length === nBefore + 1 && J(ad.feats[ad.feats.length - 1]) === J(["hole", 156, 36, 12]), J(ad));
  await ev(page, () => window.plasmaTest.sketch.undo());
  const un = await ev(page, () => ({ n: window.plasmaTest.sketch.items.length, f: (window.plasmaTest.sketch.items[0].feats || []).length }));
  t.check("adopt: one undo puts the loose hole back", un.n === 2 && un.f === nBefore, J(un));

  // ---------------------------------------------------------------- Cut out keeps the plate editable (plan 2.13)
  const pre = await ev(page, () => {
    const s = window.plasmaTest.sketch; s.items = s.items.filter((i) => i === s.items[0]); const host = s.items[0];
    s.add("triangle", true, {}); const tr = s.items[s.items.length - 1]; Object.assign(tr.p, { w: 30, h: 20 }); tr.x = host.x + 60; tr.y = host.y + 90; tr._key = undefined;
    s.commit(); s.pick([host.id, tr.id]); s.onSelect();
    return { type: host.type, p: JSON.stringify(host.p), n: (host.feats || []).length };
  });
  await sleep(200);
  await page.click('[data-qb="subtract"]');
  await sleep(300);
  const co = await ev(page, () => { const s = window.plasmaTest.sketch, h = s.items[0]; return { n: s.items.length, type: h.type, p: JSON.stringify(h.p), feats: (h.feats || []).map((f) => [f.k, f.shape || ""]) }; });
  t.check("cut out (toolbar): the plate stays the same editable plate with a Shape cut-out row", co.n === 1 && co.type === pre.type && co.p === pre.p && co.feats.length === pre.n + 1 && J(co.feats[co.feats.length - 1]) === J(["shape", "drawn"]), J({ pre, co }));
  await ev(page, () => { const b = document.querySelector('#srcShape .insp-tabs [data-insp="holes"]'); if (b) b.click(); });
  await sleep(200);
  const cr = await rows();
  t.check("cut out (toolbar): the Features tab lists it as 'Shape cut-out · drawn shape'", cr.some((r) => /Shape cut-out/.test(JSON.stringify(r)) && /drawn shape/.test(JSON.stringify(r))), J(cr));

  // ---------------------------------------------------------------- Corners row on an outline with no corner radius (plan 2.12)
  await ev(page, () => {
    const s = window.plasmaTest.sketch; s.items = []; s.add("gusset", true, {}); const g = s.items[0]; g.p.cut = 30; g._key = undefined;
    s.commit(); s.pick([g.id]); s.onSelect();
    const b = document.querySelector('#srcShape .insp-tabs [data-insp="holes"]'); if (b) b.click();
  });
  await sleep(250);
  const pts0 = await ev(page, () => window.plasmaTest.sketch.contoursOf(window.plasmaTest.sketch.items[0])[0].pts.length);
  const cid = await addFeat("corner");
  const c1 = await ev(page, () => { const s = window.plasmaTest.sketch, g = s.items[0]; return { type: g.type, n: s.contoursOf(g)[0].pts.length, f: g.feats }; });
  t.check("corners: + Add > Corners on a gusset adds a Corners row (R5 at all corners) and rounds the cut outline; still a gusset", !!cid && c1.type === "gusset" && c1.n > pts0 && (await rows()).some((r) => /R5 at all corners/.test(r.sum)), J({ pts0, c1 }));
  await setFeat(cid, "kind", "chamfer");
  const c2 = await ev(page, () => { const s = window.plasmaTest.sketch, g = s.items[0]; return { n: s.contoursOf(g)[0].pts.length, f: g.feats[0] }; });
  t.check("corners: switching the row to Chamfer chamfers every corner (one extra point each)", c2.f.kind === "chamfer" && c2.n === pts0 * 2 && (await rows()).some((r) => /Chamfer 5 at all corners/.test(r.sum)), J({ pts0, c2 }));
  await ev(page, () => window.plasmaTest.sketch.undo());
  const c3 = await ev(page, () => window.plasmaTest.sketch.items[0].feats[0].kind);
  t.check("corners: one undo goes back to Round", c3 === "round", c3);

  // Fillet click mode on the canvas: clicking one sharp corner adds "R6 at 1 corner" (a real mouse click on the drawing)
  await ev(page, () => { const s = window.plasmaTest.sketch; s.items = []; s.add("gusset", true, {}); const g = s.items[0]; g.p.cut = 30; g._key = undefined; s.commit(); s.pick([g.id]); s.onSelect(); });
  await sleep(250);
  await page.click('[data-qb="fillet"]'); await sleep(200);
  await page.fill("#cad_r", "6"); await page.click("#cadOk"); await sleep(250);
  const tgt = await ev(page, () => {
    const s = window.plasmaTest.sketch, g = s.items[0], c = s.cornerList(g).find((k) => k.ord === 1), [x, y] = s.toScreen(c.world[0], c.world[1]), r = s.cv.getBoundingClientRect();
    return { x: r.left + x + 2, y: r.top + y - 1, pick: !!s.filletPick, type: g.type };
  });
  t.check("corners: Fillet starts click mode and the gusset stays a gusset", tgt.pick && tgt.type === "gusset", J(tgt));
  await page.mouse.click(tgt.x, tgt.y); await sleep(300);
  const c4 = await ev(page, () => { const g = window.plasmaTest.sketch.items[0]; return { type: g.type, f: g.feats }; });
  await ev(page, () => { const b = document.querySelector('#srcShape .insp-tabs [data-insp="holes"]'); if (b) b.click(); }); await sleep(200);
  t.check("corners: clicking a corner on the drawing adds 'R6 at 1 corner' (that corner) and keeps the gusset", c4.type === "gusset" && J((c4.f || []).map((f) => [f.k, f.kind, f.r, f.at])) === J([["corner", "round", 6, [1]]]) && (await rows()).some((r) => /R6 at 1 corner/.test(r.sum)), J(c4));
  await ev(page, () => window.plasmaTest.sketch.endFilletPick());
  t.check("no page error", !page.errors.length, J(page.errors.slice(0, 3)));
} catch (e) {
  t.check("121 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}

await page.ctx.close();
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

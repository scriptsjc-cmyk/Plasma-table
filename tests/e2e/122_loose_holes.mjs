// r15 Round 2.16 (finished as written): loose holes come into their part.
// (a) Opening a drawing or saved part with loose holes inside a part offers, once, a small non-blocking prompt
//     "Put N loose holes into this part?" (Yes / No). Yes is one undo step; No is remembered for that drawing; it never
//     shows during a job (Practice table only, real Start click).
// (b) A DXF with separate circles inside an outline opens as that part with the circles as Hole feature rows (exact centres).
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("122_loose_holes");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const J = (x) => JSON.stringify(x).slice(0, 600);

// a saved part: a 200 x 150 plate with three loose hole items sitting inside it
const drawing = (id, name) => ({ id, name, data: { items: [
  { id: 1, type: "rect", p: { w: 200, h: 150, r: 0 }, x: 0, y: 0, rot: 0, holes: {} },
  { id: 2, type: "hole", p: { d: 10 }, x: 15, y: 15, rot: 0, holes: {} },
  { id: 3, type: "hole", p: { d: 10 }, x: 175, y: 125, rot: 0, holes: {} },
  { id: 4, type: "boltcircle", p: { n: 4, pcd: 60, hole: 6, start: 45 }, x: 70, y: 45, rot: 0, holes: {} },
] } });
const offer = (page) => ev(page, () => {
  const el = document.getElementById("looseOffer");
  if (!el || el.classList.contains("hidden") || el.hidden || !el.getClientRects().length || getComputedStyle(el).display === "none") return null;
  const r = el.getBoundingClientRect();
  const shown = (b) => { const q = b.getBoundingClientRect(), s = getComputedStyle(b); return q.width > 0 && q.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const covers = [...document.querySelectorAll("button, input, select, a[href], [role=tab]")].filter((b) => !el.contains(b) && shown(b)).filter((b) => {
    const q = b.getBoundingClientRect(); return Math.min(q.right, r.right) - Math.max(q.left, r.left) > 1 && Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top) > 1;
  }).map((b) => b.id || b.textContent.trim().slice(0, 20));
  return { text: el.textContent.replace(/\s+/g, " ").trim(), yes: !!el.querySelector("#looseYes"), no: !!el.querySelector("#looseNo"),
    modal: el.getAttribute("aria-modal") === "true" || !!el.closest("[aria-modal=true]"), covers, r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
});
const model = (page) => ev(page, () => ({ n: window.plasmaTest.sketch.items.length, types: window.plasmaTest.sketch.items.map((i) => i.type), feats: (window.plasmaTest.sketch.items[0].feats || []).map((f) => [f.k, f.x, f.y]) }));
async function makeScreen(page) {
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false); T.sketch.clear(); });
  await sleep(200);
}

// ---------------------------------------------------------------- (a) the prompt when a saved part is opened
{
  const page = await newPage(br, "d1366x640", { base: srv.base });
  try {
    await makeScreen(page);
    t.check("api: plasmaTest.loadDesign opens a saved part (same path as the parts list)", await ev(page, () => typeof window.plasmaTest.loadDesign === "function"));
    await ev(page, (d) => window.plasmaTest.loadDesign(d), drawing("p-1", "Loose plate"));
    await sleep(400);
    let o = await offer(page);
    t.check("open: the prompt asks \"Put 3 loose holes into this part?\" with Yes and No", !!o && /Put 3 loose holes into this part\?/.test(o.text) && o.yes && o.no, J(o));
    t.check("open: the prompt is not modal and covers no other control", !!o && !o.modal && !o.covers.length, J(o));
    // non-blocking: the rest of the screen still works while it is up
    await page.click('#srcShape .insp-tabs [data-insp="size"]'); await sleep(150);
    t.check("open: the screen still works while the prompt is up (Size tab opens)", await ev(page, () => document.getElementById("srcShape").dataset.insp === "size") && !!(await offer(page)));
    const pastBefore = await ev(page, () => window.plasmaTest.sketch.past.length);
    await page.click("#looseYes"); await sleep(300);
    let m = await model(page);
    // the bolt circle item's box starts at (70, 45): 4 x Ø6 on 60 PCD at 45° -> centre 70 + 30·cos45 + 3 = 94.213 each way
    const bc = 70 + 30 * Math.SQRT1_2 + 3;
    t.check("Yes: the three loose items become feature rows of the plate", m.n === 1 && J(m.feats.slice(0, 2)) === J([["hole", 20, 20], ["hole", 180, 130]]) && m.feats[2] && m.feats[2][0] === "bolt" && Math.abs(m.feats[2][1] - bc) <= 0.03 && Math.abs(m.feats[2][2] - (bc - 25)) <= 0.03, J({ m, bc }));
    t.check("Yes: the prompt goes away", !(await offer(page)));
    t.check("Yes: it is one undo step", (await ev(page, () => window.plasmaTest.sketch.past.length)) === pastBefore + 1);
    await ev(page, () => window.plasmaTest.sketch.undo()); await sleep(200);
    m = await model(page);
    t.check("Yes: one undo puts the loose holes back", m.n === 4 && !m.feats.length, J(m));
    t.check("after undo: the prompt does not come back by itself", !(await offer(page)));

    // No is remembered for that drawing
    await ev(page, (d) => window.plasmaTest.loadDesign(d), drawing("p-2", "Another plate"));
    await sleep(400);
    t.check("another drawing: offered again", !!(await offer(page)));
    await page.click("#looseNo"); await sleep(200);
    t.check("No: the prompt goes away and nothing changes", !(await offer(page)) && (await model(page)).n === 4);
    await ev(page, (d) => window.plasmaTest.loadDesign(d), drawing("p-2", "Another plate"));
    await sleep(400);
    t.check("No: opening the same drawing again does not ask again", !(await offer(page)));
    await page.reload(); await sleep(800);
    await makeScreen(page);
    await ev(page, (d) => window.plasmaTest.loadDesign(d), drawing("p-2", "Another plate"));
    await sleep(400);
    t.check("No: still not asked for that drawing after a reload", !(await offer(page)));
    t.check("(a) no page error", !page.errors.length, J(page.errors.slice(0, 3)));
  } catch (e) { t.check("(a) ran to the end", false, String(e && e.stack || e).slice(0, 400)); }
  await page.ctx.close();
}

// ---------------------------------------------------------------- (a) never during a job (Practice table, real Start)
{
  const page = await newPage(br, "d1536x730", { base: srv.base });
  try {
    await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); const s = T.sketch; s.clear(); s.add("plate", true); const it = s.items[0]; Object.assign(it.p, { w: 60, h: 40, r: 4, hole: 8, inset: 10 }); s.pick([it.id]); s.commit(); T.sendToCutting(); T.goStep(3); });
    await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
    await ev(page, () => document.getElementById("btnDemo").click());
    await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
    await ev(page, () => window.plasmaTest.goStep(3));
    await page.click("#btnZero"); await sleep(300);
    for (const cb of await page.locator("#checklist input").all()) await cb.check();
    await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 });
    await ev(page, () => {
      window.__offerDuringJob = [];
      const tick = () => {
        const T = window.plasmaTest, el = document.getElementById("looseOffer");
        const seen = !!el && !el.classList.contains("hidden") && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none";
        if (T.S.job && T.S.job.running && seen) window.__offerDuringJob.push(T.screen());
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.click("#btnStart"); await sleep(400);
    if (await ev(page, () => !document.getElementById("safeDlg").classList.contains("hidden"))) await page.click("#safeDlgOk");
    await page.waitForFunction(() => window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 10000 });
    // a saved part with loose holes arrives while the job runs (e.g. opened from the parts list)
    await ev(page, (d) => window.plasmaTest.loadDesign(d), drawing("p-job", "During the job"));
    await sleep(800);
    await ev(page, () => window.plasmaTest.showScreen("make")); await sleep(500);
    const st = await ev(page, () => ({ running: !!(window.plasmaTest.S.job && window.plasmaTest.S.job.running), seen: window.__offerDuringJob.slice(0, 3) }));
    t.check("job: the loose-holes prompt never shows while a job runs", st.running && !st.seen.length, J(st));
    t.check("job: no page error", !page.errors.length, J(page.errors.slice(0, 3)));
  } catch (e) { t.check("job part ran to the end", false, String(e && e.stack || e).slice(0, 400)); }
  await page.ctx.close();
}

// ---------------------------------------------------------------- (b) DXF circles inside an outline become Hole rows
{
  const page = await newPage(br, "d1366x640", { base: srv.base });
  try {
    await makeScreen(page);
    const dxf = ["0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "0", "90", "4", "70", "1", "10", "0", "20", "0", "10", "200", "20", "0", "10", "200", "20", "150", "10", "0", "20", "150",
      "0", "CIRCLE", "8", "0", "10", "20", "20", "20", "40", "5",
      "0", "CIRCLE", "8", "0", "10", "180", "20", "130", "40", "5",
      "0", "CIRCLE", "8", "0", "10", "100", "20", "75", "40", "30",
      "0", "ENDSEC", "0", "EOF"].join("\n");
    const n = await ev(page, (text) => window.plasmaTest.importIntoMake([new File([text], "plate-circles.dxf", { type: "application/dxf" })], { replace: true, skipSizeCheck: true }), dxf);
    await sleep(500);
    const r = await ev(page, () => {
      const s = window.plasmaTest.sketch, it = s.items[0];
      const bb = (c) => c.pts.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
      const cs = s.contoursOf(it), o = bb(cs[0]);
      return { items: s.items.length, outline: it.shape && it.shape.cs.length, feats: (it.feats || []).map((f) => [f.k, f.x, f.y, f.d]),
        cut: cs.slice(1).map((c) => { const b = bb(c); return [Math.round(((b[0] + b[2]) / 2 - o[0]) * 1000) / 1000, Math.round(((b[1] + b[3]) / 2 - o[1]) * 1000) / 1000, Math.round((b[2] - b[0]) * 100) / 100]; }) };
    });
    t.check("dxf: opens as one part", n === 1 && r.items === 1, J(r));
    t.check("dxf: the three circles are Hole feature rows with the exact DXF centres and sizes", J(r.feats) === J([["hole", 20, 20, 10], ["hole", 180, 130, 10], ["hole", 100, 75, 60]]), J(r));
    t.check("dxf: the outline itself keeps no copy of those circles", r.outline === 1, J(r));
    t.check("dxf: the holes are still cut in the same places", J(r.cut) === J([[20, 20, 10], [180, 130, 10], [100, 75, 60]]), J(r.cut));
    await ev(page, () => { const s = window.plasmaTest.sketch; s.pick([s.items[0].id]); s.onSelect && s.onSelect(); document.querySelector('#srcShape .insp-tabs [data-insp="holes"]').click(); });
    await sleep(250);
    const rows = await ev(page, () => [...document.querySelectorAll("#featList .feat-row:not(.feat-builtin)")].map((x) => x.textContent.replace(/\s+/g, " ").trim()));
    t.check("dxf: the Features tab lists them as three Hole rows", rows.length === 3 && rows.every((x) => /Hole/.test(x)), J(rows));
    t.check("dxf: no prompt (they are already rows)", !(await offer(page)));
    t.check("(b) no page error", !page.errors.length, J(page.errors.slice(0, 3)));
  } catch (e) { t.check("(b) ran to the end", false, String(e && e.stack || e).slice(0, 400)); }
  await page.ctx.close();
}

await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

// r15 2.18: on a phone the Features list is the same list, shown as a bottom sheet.
// A "Features (N)" button shows on the Make drawing when one part is picked; it opens a bottom sheet holding the very same
// #featPanel (rows, + Add, row editing); closing puts the panel back. Never shown during a job; STOP stays on top.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("123_features_phone");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const J = (x) => JSON.stringify(x).slice(0, 600);
const vis = (page, sel) => ev(page, (sel) => { const e = document.querySelector(sel); if (!e || e.hidden || e.classList.contains("hidden")) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" ? { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, vw: innerWidth, vh: innerHeight, text: e.textContent.replace(/\s+/g, " ").trim().slice(0, 80) } : null; }, sel);

for (const [profile, mode] of [["iphone14", "simple"], ["iphone14", "pro"]]) {
  const P = (s) => `${profile} ${mode}: ${s}`;
  const page = await newPage(br, profile, { base: srv.base });
  try {
    await ev(page, (mode) => { const T = window.plasmaTest; T.S.thickness = 3; T.showScreen("make", { force: true }); T.setAppMode && T.setAppMode(mode, { persist: false, autoFs: false });
      const s = T.sketch; s.clear(); s.add("rect", true, {}); const g = s.items[0]; Object.assign(g.p, { w: 200, h: 150, r: 10 });
      g.feats = [{ id: 1, k: "hole", x: 100, y: 75, d: 60 }, { id: 2, k: "slot", x: 40, y: 75, len: 30, wid: 8.5, rot: 90 }]; g._key = undefined;
      s.commit(); s.pick([g.id]); s.onSelect(); s.fitView(); }, mode);
    await sleep(500);
    const btn = await vis(page, "#featSheetBtn");
    t.check(P("a 'Features (2)' button shows on the drawing for the picked part, big enough to tap, on screen"), btn && /Features\s*\(2\)/.test(btn.text) && btn.h >= 40 && btn.x >= 0 && btn.b <= btn.vh, J(btn));
    if (!btn) throw new Error("no Features button");
    await page.tap("#featSheetBtn"); await sleep(400);
    const sh = await vis(page, "#featSheet");
    const inside = await ev(page, () => !!document.querySelector("#featSheet #featPanel #featList"));
    const rows = await ev(page, () => [...document.querySelectorAll("#featSheet .feat-row:not(.feat-builtin)")].map((r) => r.querySelector(".feat-sum").textContent));
    t.check(P("tapping it opens a bottom sheet with the same Features list (2 rows)"), sh && inside && rows.length === 2 && Math.abs(sh.b - sh.vh) < 2 && sh.h <= sh.vh * 0.85, J({ sh, inside, rows }));
    // edit a row in the sheet: the bore becomes Ø50
    await page.tap('#featSheet .feat-row[data-fid="1"] .feat-open'); await sleep(250);
    const inp = page.locator('#featSheet .feat-row[data-fid="1"] [data-ff="d"]');
    const ir = await inp.boundingBox(), sh2 = await vis(page, "#featSheet");
    t.check(P("the opened row's field is on screen inside the sheet"), ir && sh2 && ir.y >= sh2.y - 1 && ir.y + ir.height <= sh2.b + 1, J({ ir, sh2 }));
    await inp.fill("50"); await inp.press("Tab"); await sleep(250);
    const d = await ev(page, () => window.plasmaTest.sketch.items[0].feats.find((f) => f.id === 1).d);
    t.check(P("typing Ø50 in the sheet changes the hole"), d === 50, d);
    // + Add works from the sheet
    await page.tap("#featSheet #featAdd"); await sleep(200);
    const menu = await vis(page, "#featAddMenu");
    t.check(P("+ Add opens its menu on screen"), menu && menu.y >= 0 && menu.b <= menu.vh + 1, J(menu));
    await page.tap('#featAddMenu [data-fadd="hole"]'); await sleep(250);
    const n = await ev(page, () => window.plasmaTest.sketch.items[0].feats.length);
    t.check(P("adding a Hole from the sheet adds a row"), n === 3, n);
    // STOP stays above the sheet
    const stopTop = await ev(page, () => { const s = document.getElementById("btnStop"); if (!s || !s.getClientRects().length) return "no stop shown"; const r = s.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && (e === s || s.contains(e))); });
    t.check(P("STOP is still on top"), stopTop === true || stopTop === "no stop shown", String(stopTop));
    // close: the panel goes back to the inspector
    await page.tap("#featSheetClose"); await sleep(300);
    const back = await ev(page, () => ({ sheet: !!document.querySelector("#featSheet:not(.hidden)"), home: !!document.querySelector("#srcShape #featPanel") }));
    t.check(P("Close hides the sheet and puts the list back in its tab"), !back.sheet && back.home, J(back));
    // never during a job
    await ev(page, () => document.body.classList.add("running-job")); await sleep(150);
    t.check(P("the Features button is hidden while a job runs"), !(await vis(page, "#featSheetBtn")));
    await ev(page, () => document.body.classList.remove("running-job"));
    // nothing picked: no button
    await ev(page, () => { const s = window.plasmaTest.sketch; s.pick([]); s.onSelect(); }); await sleep(200);
    const picked = await ev(page, () => !!window.plasmaTest.sketch.selected());   // Simple view keeps its only part picked
    t.check(P(picked ? "the only part stays picked (Simple view): the button stays" : "no part picked: no Features button"), picked === !!(await vis(page, "#featSheetBtn")), String(picked));
    t.check(P("no page error"), !page.errors.length, J(page.errors.slice(0, 3)));
  } catch (e) { t.check(P("ran to the end"), false, String(e && e.stack || e).slice(0, 400)); }
  await page.ctx.close();
}
// laptop: no button, the Features tab as before
{
  const page = await newPage(br, "d1366", { base: srv.base });
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false);
    const s = T.sketch; s.clear(); s.add("rect", true, {}); const g = s.items[0]; g.feats = [{ id: 1, k: "hole", x: 50, y: 30, d: 10 }]; g._key = undefined; s.commit(); s.pick([g.id]); s.onSelect(); });
  await sleep(300);
  t.check("laptop: no Features sheet button (the Features tab is right there)", !(await vis(page, "#featSheetBtn")));
  await page.ctx.close();
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

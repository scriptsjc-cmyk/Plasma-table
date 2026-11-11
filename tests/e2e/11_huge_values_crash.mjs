// Does a big number typed into the keypad / shape form / array dialog freeze or crash the tab? Does a saved huge layout brick the app on reload?
// Each trial gets its own Chrome so a frozen renderer can be killed without hanging the suite.
import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, demoToShape, tapCanvas } from "../lib/browser.mjs";
const t = new T("11_huge_values"); const srv = await startServer();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HARD = 30000;   // r4: was 15 s; the opening now goes menu→make→cutting→Practice→make, which costs a few seconds on a cold Chrome
async function trial(label, fn, { prof = "desktop", id = "HUGE-FREEZE", seed = true } = {}) {
  const K = await launchKillable(); const br = K.browser; let page, timedOut = false, err = null, crashed = false;
  const work = (async () => {
    page = await newPage(br, prof, { base: srv.base }); page.on("crash", () => (crashed = true)); await demoToShape(page);
    if (seed) await page.evaluate(() => { const s = window.plasmaTest.sketch; s.clear(); s.add("rect", true); s.pick([s.items[0].id]); s.fitView(); s.commit(); s.onSelect(); });
    await fn(page); await page.evaluate(() => 1);
  })().catch((e) => { err = e; });
  const t0 = Date.now(); await Promise.race([work, sleep(HARD).then(() => { timedOut = true; })]);
  const dt = Date.now() - t0;
  t.check(`${label}: tab stays responsive (<${HARD / 1000}s)`, !timedOut && !crashed && !(err && /crash|closed/i.test(err.message)), timedOut ? `FROZE: no response for >${HARD / 1000}s (tab hung)` : crashed ? "renderer crashed" : err ? err.message.split("\n")[0] : "", id);
  K.kill();
  await sleep(300);
  return { timedOut, crashed };
}
async function keypad(page, kind, text) {
  // r4: retry the label tap (a synthetic click straight after a fit-to-view sometimes misses the label); never wait forever
  let opened = false;
  for (let i = 0; i < 4 && !opened; i++) {
    await sleep(400);
    const d = await page.evaluate((k) => { const s = window.plasmaTest.sketch; s.draw(); const h = s.dimHits.find((x) => x.kind === k); return h ? { x: h.x + h.w / 2, y: h.y + h.h / 2 } : null; }, kind);
    if (!d) { await page.evaluate(() => { const s = window.plasmaTest.sketch; s.pick([s.items[0].id]); s.onSelect(); }); continue; }
    await tapCanvas(page, d.x, d.y);
    opened = await page.waitForSelector("#dimEdit:not(.hidden)", { timeout: 1500 }).then(() => true, () => false);
  }
  if (!opened) throw new Error("keypad did not open");
  for (const ch of text) await page.keyboard.press(ch);
  await page.keyboard.press("Enter"); await sleep(400);
}
for (const v of ["5000", "100000", "1000000", "99999999", "9".repeat(60)]) await trial(`keypad width ${v.length > 12 ? "9×" + v.length + " digits" : v}`, (page) => keypad(page, "w", v));
await trial("shape-form width field = 99999999", async (page) => { await page.locator('#shapeForm [data-p="w"]').fill("99999999"); await sleep(600); });
await trial("shape-form width field = 99999999 (iPhone profile)", async (page) => { await page.locator('#shapeForm [data-p="w"]').fill("99999999"); await sleep(600); }, { prof: "iphone14" });
await trial("flange 'Number of bolt holes' = 10000 typed in form", async (page) => { await page.evaluate(() => { const s = window.plasmaTest.sketch; s.clear(); s.add("flange", true); s.pick([s.items[0].id]); s.onSelect(); }); await page.locator('#shapeForm [data-p="n"]').fill("10000"); await sleep(1500); }, { id: "DOS-COUNT" });
await trial("linear array gap 999999999", async (page) => { await page.evaluate(() => { window.plasmaTest.sketch.setPro(true); window.plasmaTest.runPro("linarray"); }); await page.fill("#cad_gx", "999999999"); await page.click("#cadOk"); await sleep(600); });
await trial("polar array circle Ø 999999999", async (page) => { await page.evaluate(() => { window.plasmaTest.sketch.setPro(true); window.plasmaTest.runPro("polar"); }); await page.fill("#cad_pcd", "999999999"); await page.click("#cadOk"); await sleep(600); });
await trial("offset 999999999", async (page) => { await page.evaluate(() => { window.plasmaTest.sketch.setPro(true); window.plasmaTest.runPro("offset"); }); await page.fill("#cad_d", "999999999"); await page.click("#cadOk"); await sleep(600); });
await trial("auto-arrange gap 999999999", async (page) => { await page.evaluate(() => { window.plasmaTest.sketch.setPro(true); window.plasmaTest.runPro("nest"); }); await page.fill("#cad_gap", "999999999"); await page.click("#cadOk"); await sleep(600); });
// persistence: a poisoned/huge saved layout in localStorage must not brick the app on load
{
  const K = await launchKillable(); const br = K.browser; let ok = false;
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { if (!localStorage.getItem("plasma.sketch")) localStorage.setItem("plasma.sketch", JSON.stringify({ items: [{ id: 1, type: "rect", p: { w: 1000000, h: 50, r: 0 }, x: 0, y: 0, rot: 0, holes: {} }] })); });
  const work = (async () => { const page = await ctx.newPage(); await page.goto(srv.base + "/?test=1"); await page.waitForFunction(() => window.plasmaTest); await page.evaluate(() => window.plasmaTest.showScreen("make")); await page.evaluate(() => 1); ok = true; })().catch(() => {});
  await Promise.race([work, sleep(HARD)]);
  t.check("saved layout with a 1,000,000 mm part (e.g. typed earlier): app still opens", ok, "page hangs when the shape maker opens; the layout is persisted in localStorage so the app stays unusable on every reload until site data is cleared", "HUGE-PERSIST");
  K.kill();
}
await srv.close();
process.exit(t.done() ? 1 : 0);

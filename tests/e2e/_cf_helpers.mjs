// shared helpers for the 56 suite (and quick exploration)
import { serve, open, launch, demoToShape } from "../lib/r2compat.mjs";
export { serve, open, launch };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const T = (page, js) => page.evaluate(js);
export const prime = async (page, parts = ["rect", "disc"]) => {
  await demoToShape(page, { stay: "cut" });
  await page.evaluate((parts) => { const t = window.plasmaTest, sk = t.sketch; t.showScreen("make"); t.setShapeFs(false); sk.clear(); for (const p of parts) sk.add(p); t.sendToCutting(); }, parts);
  await sleep(300);
  await page.evaluate(() => window.plasmaTest.demoEdges()); await sleep(6000);
  await page.evaluate(() => { window.plasmaTest.goStep(3); document.getElementById("layAuto").click(); }); await sleep(500);
};
export const zeroAndTick = async (page, js = false) => {
  await page.evaluate(() => document.getElementById("btnZero").scrollIntoView({ block: "center" }));
  if (js) await page.evaluate(() => document.getElementById("btnZero").click()); else await page.click("#btnZero"); await sleep(400);
  await page.evaluate(() => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(300);
};
export const waitCut = async (page, n = 1) => { const t0 = Date.now(); let v = 0; while (Date.now() - t0 < 90000) { v = await T(page, "window.plasmaTest.S.run ? window.plasmaTest.S.run.ons : 0"); if (v >= n) return true; await sleep(250); } return false; };
export const hook = (page) => T(page, `(() => { const d = window.plasmaTest.S.demo; if (d.__hooked) { d.__tx.length = 0; return; } d.__hooked = true; d.__tx = []; const w = d.write.bind(d); d.write = (x) => { const s = typeof x === "string" ? x : Array.from(x).map((c) => String.fromCharCode(c)).join(""); d.__tx.push({ t: Date.now(), s }); return w(x); }; })()`);
export const tx = (page) => T(page, "window.plasmaTest.S.demo.__tx.map((x) => x.s).join('')");
export const holdBtn = async (page, ms) => { const b = await page.locator("#btnStop").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(ms); await page.mouse.up(); await sleep(300); };
export const SHOTS = "/workspace/b5-features-shots/";

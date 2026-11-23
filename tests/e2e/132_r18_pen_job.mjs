// r18 marker pen: a whole pen job on the practice table. The torch must never come on, the floating head touches down
// before each line and is released before each travel, and the job finishes normally. Practice table only.
import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, demoToShape } from "../lib/browser.mjs";
const t = new T("132_r18_pen_job"); const srv = await startServer();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const K = await launchKillable();
try {
  const page = await newPage(K.browser, "d1366", { base: srv.base, consoleErrors: false }); await demoToShape(page);
  await page.evaluate(() => { const s = window.plasmaTest.sketch; s.clear(); s.add("plate", true); const it = s.items[0]; Object.assign(it.p, { w: 60, h: 40, r: 4, hole: 8, inset: 10 }); s.pick([it.id]); s.fitView(); s.commit(); s.onSelect(); });
  await page.evaluate(() => { window.plasmaTest.sendToCutting(); window.plasmaTest.goStep(1); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut");
  await sleep(500);
  await page.evaluate(() => { const c = document.getElementById("penRun"); c.checked = true; c.dispatchEvent(new Event("change")); });
  await sleep(600);
  const prep = await page.evaluate(() => { const p = window.plasmaTest.S.prepared; return p ? { pierces: p.stats.pierces, pen: p.stats.pen_length_mm, downs: p.lines.filter((l) => l === "; pen down").length, m3: p.lines.some((l) => /^M0*[34]\b/.test(l)) } : null; });
  t.check("the pen job is built: no pierces, no torch, pen lines for each shape", prep && prep.pierces === 0 && !prep.m3 && prep.downs >= 2 && prep.pen > 100, JSON.stringify(prep));
  await page.evaluate(() => { window.plasmaTest.goStep(3); }); await page.waitForFunction(() => window.plasmaTest.S.cur === 3);
  await page.click("#btnZero"); await sleep(300);
  for (const cb of await page.locator("#checklist input").all()) await cb.check();
  const startable = await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 8000 }).then(() => true).catch(() => false);
  t.check("Start is allowed for a pen job", startable, await page.evaluate(() => document.getElementById("blockers").textContent + " | " + document.getElementById("startWhy").textContent));
  if (startable) {
    const before = await page.evaluate(() => ({ torch: window.plasmaTest.S.demo.torchOnCount, probes: window.plasmaTest.S.demo.probeCount }));
    await page.click("#btnStart");
    const done = await page.waitForFunction(() => { const j = window.plasmaTest.S.job; return j && !j.running; }, null, { timeout: 180000 }).then(() => true).catch(() => false);
    const after = await page.evaluate(() => ({ torch: window.plasmaTest.S.demo.torchOnCount, probes: window.plasmaTest.S.demo.probeCount, alarm: !!window.plasmaTest.S.demo.alarm, job: window.plasmaTest.S.job && { status: window.plasmaTest.S.job.status, error: window.plasmaTest.S.job.error } }));
    if (process.env.DBG) console.log(JSON.stringify(await page.evaluate(() => ({ job: window.plasmaTest.S.job, log: [...document.querySelectorAll("#console *, #log *")].slice(-30).map((x) => x.textContent).join(" | "), mpos: window.plasmaTest.S.demo.mpos, sheetZ: window.plasmaTest.S.demo.sheetZ, so: window.plasmaTest.S.demo.switchOffset })), null, 0).slice(0, 3000));
    t.check("the pen job runs to the end with no alarm", done && !after.alarm && !/error|alarm/i.test(String(after.job && after.job.status)), JSON.stringify(after));
    t.check("the torch never came on", after.torch === before.torch, JSON.stringify({ before, after }));
    t.check("the floating head touched down once per shape", after.probes - before.probes === prep.downs, JSON.stringify({ before, after, downs: prep.downs }));
  }
} catch (e) { t.check("scenario ran", false, String(e.message).split("\n")[0]); }
finally { K.kill(); }
await srv.close();
process.exit(t.done() ? 1 : 0);

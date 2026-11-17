// Debounced Floating head lamp on Machine setup (and the header lamp): flicker stays off,
// a steady trigger turns the lamp on. Never talks to a real board.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("99_probe_filter");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });
await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make");
  T.setShapeFs(false);
  T.setAppMode("advanced", { autoFs: false, persist: false });
  T.showScreen("cut");
  const b = document.getElementById("menuSetup");
  if (b) b.click();
});
await page.waitForFunction(() => {
  const el = document.querySelector('#setupScreen [data-in="probe"], [data-in="probe"]');
  return !!(window.plasmaTest && window.plasmaTest.probeFilter && el);
}, null, { timeout: 10000 });
await sleep(100);

const lamps = () => ev(page, () => {
  const all = [...document.querySelectorAll('[data-in="probe"]')].map((el) => ({
    on: el.classList.contains("on"),
    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
    where: el.closest(".mini") ? "mini" : el.closest("#setupScreen") ? "setup" : "other",
  }));
  const T = window.plasmaTest;
  return {
    lamps: all,
    anyOn: all.some((x) => x.on),
    shown: T.probeDisplayOn(),
    blocks: T.probeBlocks(false),
    blocksRaw: T.probeBlocks(true),
    state: T.probeFilter.state(),
  };
});

await ev(page, () => {
  const T = window.plasmaTest;
  T.resetProbeFilter();
  for (const v of [true, false, true, false, true, false]) T.noteProbeRaw(v);
  T.renderLamps({ inputs: { probe: false }, torch: false });
});
const flicker = await lamps();
t.check("flicker leaves every Floating head lamp off", !flicker.anyOn && !flicker.shown, JSON.stringify(flicker));
t.check("after flicker has cleared, start is not blocked", !flicker.blocks, JSON.stringify(flicker));
t.check("a live raw-on sample still blocks (don't hide a real trigger)", flicker.blocksRaw, JSON.stringify(flicker));

await ev(page, () => {
  const T = window.plasmaTest;
  T.resetProbeFilter();
  T.noteProbeRaw(true);
  T.renderLamps({ inputs: { probe: true }, torch: false });
});
const one = await lamps();
t.check("one on-sample: lamps stay off", !one.anyOn && !one.shown, JSON.stringify(one));
t.check("one on-sample: conservative block is on", one.blocks && one.blocksRaw, JSON.stringify(one));

await ev(page, () => {
  const T = window.plasmaTest;
  T.noteProbeRaw(true);
  T.noteProbeRaw(true);
  T.renderLamps({ inputs: { probe: true }, torch: false });
});
const steady = await lamps();
t.check("three steady on-samples: setup and header lamps turn on", steady.anyOn && steady.shown && steady.lamps.filter((x) => x.where === "setup" || x.where === "mini").every((x) => x.on), JSON.stringify(steady));

await ev(page, () => {
  const T = window.plasmaTest;
  T.noteProbeRaw(false);
  T.renderLamps({ inputs: { probe: false }, torch: false });
});
const hold = await lamps();
t.check("brief off after a real trigger: lamp stays on", hold.anyOn && hold.shown, JSON.stringify(hold));

await ev(page, () => {
  const T = window.plasmaTest;
  T.noteProbeRaw(false);
  T.noteProbeRaw(false);
  T.renderLamps({ inputs: { probe: false }, torch: false });
});
const off = await lamps();
t.check("three steady off-samples: lamps turn off", !off.anyOn && !off.shown, JSON.stringify(off));

await ev(page, () => { window.plasmaTest.resetProbeFilter(); window.plasmaTest.renderLamps({ inputs: {}, torch: false }); });
await page.ctx.close();
await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

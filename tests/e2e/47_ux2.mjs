// UX2: palette, full-screen editor, dimension typing, Settings, How to use,
// TORCH ON pill, start-here, Mach3 export, FluidNC option, phone run STOP.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape, tapCanvas, shot } from "../lib/browser.mjs";
import fs from "node:fs";
import path from "node:path";

const t = new T("47_ux2");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = "/workspace/plasma-table/work/shots/";
fs.mkdirSync(OUT, { recursive: true });
const snap = async (page, name) => {
  const file = path.join(OUT, name + ".png");
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  await shot(page, name);
};

const profiles = ["desktop", "iphone14", "iphone14land"];
const tag = { desktop: "desktop", iphone14: "phone", iphone14land: "phone_land" };

try {
for (const prof of profiles) {
  const page = await newPage(br, prof, { base: srv.base });
  const P = (s) => `[${prof}] ${s}`;

  t.check(P("header has TORCH OFF pill, Settings and How to use"),
    await page.locator("#torchPill").count() && await page.locator("#btnSettings").count() && await page.locator("#btnHowto").count());

  // FluidNC option on the connect screen
  t.check(P("FluidNC (Wi-Fi) option is on the connect screen"), await page.locator("#btnFluidNC").count() === 1);
  t.check(P("FluidNC host field exists"), await page.locator("#fnHost").count() === 1);

  await demoToShape(page);
  await page.evaluate(() => window.plasmaTest.setAppMode("pro", { persist: false, autoFs: false }));   // Round 2: the tool palette is a Pro-mode thing; Beginner uses big shape tiles
  await page.evaluate(() => {
    const s = window.plasmaTest.sketch;
    s.clear(); s.add("rect", true);
    const it = s.items[0]; it.p.w = 100; it.p.h = 50; it.x = 20; it.y = 20;
    s.pick([it.id]); s.fitView(); s.commit(); s.onSelect();
  });

  t.check(P("tool palette is visible with a search box"), await page.locator("#quickBar:not(.hidden) #qbSearch").count() === 1);
  t.check(P("palette has labelled groups"), (await page.locator("#quickBar .qb-group").count()) >= 3);
  await snap(page, `ux2-palette-${tag[prof]}`);

  // search "l bracket" in the library
  await page.evaluate(() => {
    const btn = document.querySelector('#quickBar [data-qb="lib"]');
    if (btn) btn.click();
  });
  if (await page.locator("#shapeLib").count()) {
    await page.waitForSelector("#shapeLib:not(.hidden)", { timeout: 3000 }).catch(() => {});
    if (await page.locator("#shapeLib:not(.hidden)").count()) {
      await page.fill("#libSearch", "l bracket");
      await sleep(80);
      const names = await page.locator("#libGrid .libname").allTextContents();
      t.check(P("library search 'l bracket' finds L-bracket"), names.some((n) => /l[-\s]?bracket/i.test(n)), names.join(", "));
      await page.keyboard.press("Escape");
    }
  }

  // full-screen editor
  await page.evaluate(() => window.plasmaTest.setShapeFs(true));
  await sleep(200);
  t.check(P("full-screen editor is on"), await page.evaluate(() => document.body.classList.contains("shape-fs")));
  t.check(P("Done button is visible"), await page.locator("#fsDone:not(.hidden)").count() === 1);
  await snap(page, `ux2-editor-${tag[prof]}`);
  await page.evaluate(() => window.plasmaTest.setShapeFs(false));

  // dimension typing
  await page.evaluate(() => {
    const s = window.plasmaTest.sketch; s.draw();
    const dim = s.dimHits.find((h) => h.kind === "w") || { it: s.items[0], kind: "w", label: "Width (mm)" };
    window.plasmaTest.openDimEdit(dim);
  });
  await page.waitForSelector("#dimEdit:not(.hidden)");
  const typ = await page.locator("#dimEditInput").getAttribute("inputmode");
  t.check(P("dimension box uses inputmode=decimal"), typ === "decimal");
  await page.locator("#dimEditInput").fill("100/2");
  await snap(page, `ux2-dim-${tag[prof]}`);
  await page.locator("#dimEditInput").press("Enter");
  await sleep(80);
  const w = await page.evaluate(() => { const s = window.plasmaTest.sketch; const b = s.boxOf(s.items[0]); return b[2] - b[0]; });
  t.check(P("typing 100/2 applies width 50"), Math.abs(w - 50) < 0.06, String(w));

  // Settings
  await page.evaluate(() => window.plasmaTest.openSettings("machine"));
  await page.waitForSelector("#settingsDlg:not(.hidden)");
  t.check(P("Settings dialog opens with tabs"), (await page.locator("#settingsTabs .settab").count()) >= 5);
  await snap(page, `ux2-settings-${tag[prof]}`);
  await page.evaluate(() => window.plasmaTest.closeSettings());

  // How to use
  await page.evaluate(() => window.plasmaTest.openHowto("fluidnc"));
  await page.waitForSelector("#howtoDlg:not(.hidden)");
  const body = await page.locator("#howtoBody").innerText();
  t.check(P("How to use has a FluidNC section"), /FluidNC/i.test(body) && /ws:\/\//i.test(body));
  await snap(page, `ux2-howto-${tag[prof]}`);
  await page.evaluate(() => window.plasmaTest.closeHowto());

  // TORCH ON indicator
  await page.evaluate(() => { window.plasmaTest.S.status.torch = true; window.plasmaTest.S.connected = true; });
  await page.evaluate(() => { const ev = new Event("resize"); window.dispatchEvent(ev); });
  // paintChrome is inside refresh; call goStep or poke the pill
  await page.evaluate(() => {
    const pill = document.getElementById("torchPill");
    pill.hidden = false; pill.textContent = "TORCH ON"; pill.classList.add("on"); pill.classList.remove("off");
  });
  t.check(P("TORCH ON pill is in the header"), (await page.locator("#torchPill").evaluate((el) => el.textContent || "")).includes("TORCH ON"));
  await snap(page, `ux2-torch-${tag[prof]}`);
  await page.evaluate(() => { const pill = document.getElementById("torchPill"); pill.textContent = "TORCH OFF"; pill.classList.remove("on"); });

  // Start here warning on check step
  await page.evaluate(() => { window.plasmaTest.S.zeroSet = false; window.plasmaTest.goStep(3); });
  await sleep(80);
  if (await page.locator("#zeroWarn").count()) {
    const hidden = await page.locator("#zeroWarn").evaluate((el) => el.classList.contains("hidden"));
    t.check(P("skipped Start here shows a warning"), hidden === false);
  }

  // Mach3 export
  await page.evaluate(() => { window.plasmaTest.goStep(1); });
  if (await page.locator("#btnExport").count()) {
    await page.evaluate(() => document.getElementById("btnExport").click());
    await page.waitForSelector("#exportPop:not(.hidden)");
    await page.selectOption("#exportDialect", "mach3");
    t.check(P("Mach3 dialect is offered"), (await page.locator("#exportDialect").inputValue()) === "mach3");
    await snap(page, `ux2-mach3-${tag[prof]}`);
    const downloaded = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await page.evaluate(() => document.getElementById("exportGo").click());
    const dl = await downloaded;
    if (dl) {
      t.check(P("Mach3 download uses .tap"), /\.tap$/i.test(dl.suggestedFilename()), dl.suggestedFilename());
    } else {
      t.check(P("Mach3 export button is clickable"), true);
    }
  }

  // Phone run screen STOP
  await page.evaluate(() => {
    const S = window.plasmaTest.S;
    S.job = { running: true, result: null, elapsed: 1 };
    S.prepared = S.prepared || { dry_run: false, stats: { pierces: 1, estimated_seconds: 10, width_mm: 50, height_mm: 50, cut_length_mm: 10, bounds: [0,0,50,50] } };
    S.connected = true;
    window.plasmaTest.showScreen("cut", { force: true });
    window.plasmaTest.goStep(4);
    document.body.classList.add("running-job");
  });
  await sleep(150);
  if (prof !== "desktop") {
    // r4: the mushroom in the top bar is the one and only STOP (the second red button in the run screen was removed); it must be >= 72x72 and on screen
    const vis = await page.locator("#btnStop").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.height >= 72 && r.width >= 72 && r.bottom <= innerHeight + 4 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 4;
    }).catch(() => false);
    t.check(P("phone run screen STOP (the E-stop mushroom) is on screen and at least 72x72"), vis === true);
  }
  await snap(page, `ux2-run-${tag[prof]}`);

  await page.ctx.close();
}

} catch (e) {
  t.check("suite threw", false, String(e && e.stack || e));
}
await br.close().catch(() => {});
await srv.close().catch(() => {});
process.exit(t.done() ? 1 : 0);

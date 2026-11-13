// FluidNC board-run: upload via XModem, run on the table, drop/reconnect, STOP, fallback stream.
// Uses a pretend Web Serial port (tests/lib/mock-serial.mjs). Never opens real hardware.
import { startServer, launch, newPage, enterDemo } from "../lib/browser.mjs";
import { installMockSerial } from "../lib/mock-serial.mjs";
import { T } from "../lib/t.mjs";

const t = new T("94_board_run");
const srv = await startServer(), br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const job = (page) => ev(page, () => window.plasmaTest.S.job);
const sent = (page) => ev(page, () => window.mockPort && window.mockPort.sent);
const vis = (page, id) => ev(page, (id) => { const e = document.getElementById(id); return !!(e && !e.classList.contains("hidden") && e.offsetParent); }, id);
const txt = (page, id) => ev(page, (id) => document.getElementById(id).textContent.replace(/\s+/g, " ").trim(), id);

async function usbConnect(page, opts) {
  return page.evaluate(async ({ src, opts }) => {
    const install = new Function(`return (${src})`)();
    install(window, opts);
    const G = await import(window.__J.usbserial), C = await import(window.__J.connection);
    const T = window.plasmaTest, M = T.getM();
    const tr = new G.WebSerialTransport(window.mockSerial);
    await tr.open(115200);
    try { await M.connect(tr); } catch (e) { return e.message; }
    T.S.demo = null; T.S.userDisconnected = false;
    C.setConnected(true, "the table");
    return "";
  }, { src: installMockSerial.toString(), opts }).then(async (err) => {
    if (!err) {
      const want = (opts && opts.runningFile) ? (opts.state || "Run") : "Idle";
      // runningFile reconnects as Run; a normal connect must be Idle before startJob
      if (!opts || !opts.runningFile) await page.waitForFunction(() => window.plasmaTest.getM().state() === "Idle", null, { timeout: 8000 });
      else await page.waitForFunction(() => { const st = window.plasmaTest.getM().state(); return st === "Run" || st === "Hold"; }, null, { timeout: 8000 });
    }
    return err;
  });
}

async function dropDemo(page) {
  await ev(page, () => { const b = document.getElementById("btnDisconnect"); if (b) b.click(); });
  await page.waitForFunction(() => !window.plasmaTest.S.connected && !window.plasmaTest.getM().grbl, null, { timeout: 8000 });
}

async function arm(page) {
  await ev(page, () => {
    const T = window.plasmaTest, M = T.getM();
    T.S.zeroSet = true; M.zeroConfirmed = true;
    if (M.safety && M.safety.setReference) M.safety.setReference([0, 0, 0], "homed");
    T.S.needStreamFallback = false; T.S.lastAlarm = null;
  });
}

async function twoParts(page) {
  await ev(page, () => {
    const T = window.plasmaTest, s = T.sketch;
    T.showScreen("make"); T.setShapeFs(false); s.clear();
    s.add("rect", true); s.items[0].p.w = 40; s.items[0].p.h = 30;
    s.add("rect", true); s.items[1].p.w = 40; s.items[1].p.h = 30; s.items[1].x = 80;
    s.commit(); T.sendToCutting(); T.goStep(3);
  });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
}

async function waitJob(page, pred, ms = 8000) {
  await page.waitForFunction(pred, null, { timeout: ms });
}

async function test(name, fn) {
  try { await fn(); }
  catch (e) {
    const extra = e && (e.message || String(e));
    t.check(name + " (uncaught)", false, extra);
  }
}

await test('upload ok', async () => {

  const page = await newPage(br, "d1440", { base: srv.base });
  await enterDemo(page);
  await dropDemo(page);
  const err = await usbConnect(page, { answer: true, banner: true, fileStep: 0 });
  t.check("usb FluidNC connects", err === "", err);
  await arm(page);
  await ev(page, () => window.plasmaTest.getM().startJob());
  await waitJob(page, () => { const j = window.plasmaTest.S.job; return j && j.running && j.boardRun && j.phase === "upload"; });
  t.check("upload ok: job starts in upload phase", true);
  await ev(page, () => { const el = document.getElementById("runInfo"); return el && el.textContent; }).then((s) => {
    t.check("upload ok: UI says the cut is being sent", /Sending the cut to the table/i.test(s || ""), s);
  });
  await waitJob(page, () => { const j = window.plasmaTest.S.job; return j && j.running && j.boardRun && j.phase === "run"; }, 10000);
  t.check("upload ok: table starts the local file", /\$LocalFS\/Run=\/job\.nc/i.test(await sent(page)) && /\$Xmodem\/Receive=\/job\.nc/i.test(await sent(page)), (await sent(page)).slice(-200));
  await ev(page, () => window.mockPort.setFileProgress(40));
  await ev(page, () => window.mockPort.push(window.mockPort.status() + "\r\n"));
  await sleep(300);
  const j40 = await job(page);
  t.check("upload ok: status |SD:pct,name drives the progress bar", j40.pct >= 39 && j40.pct <= 41, JSON.stringify(j40));
  await ev(page, () => window.mockPort.finishFile());
  await waitJob(page, () => window.plasmaTest.S.job && !window.plasmaTest.S.job.running && window.plasmaTest.S.job.result === "done", 8000);
  t.check("upload ok: Idle and no file field marks the job done", (await job(page)).result === "done");
  await page.context().close();

});

await test('upload failure', async () => {

  const page = await newPage(br, "d1440", { base: srv.base });
  await enterDemo(page); await dropDemo(page);
  const err = await usbConnect(page, { answer: true, banner: true, xmodem: "nospace" });
  t.check("upload failure: connects", err === "", err);
  await arm(page);
  await ev(page, () => window.plasmaTest.getM().startJob());
  await waitJob(page, () => { const j = window.plasmaTest.S.job; return j && !j.running && j.result === "error"; }, 10000);
  const j = await job(page);
  t.check("upload failure: job does not start running on the table", !j.running && j.phase === "upload", JSON.stringify(j));
  t.check("upload failure: a clear error is shown", /space|store|table|confirm/i.test(j.message || "") || await vis(page, "done"), j.message);
  await ev(page, () => window.plasmaTest.refresh());
  await sleep(300);
  t.check("upload failure: fallback button is offered", await vis(page, "btnStreamFallback") || await ev(page, () => { const b = document.getElementById("btnStreamFallback"); const d = document.getElementById("done"); return !!(b && !b.classList.contains("hidden") && d && !d.classList.contains("hidden")); }));
  const before = await sent(page);
  await ev(page, () => document.getElementById("btnStreamFallback").click());
  await sleep(800);
  const after = await sent(page);
  const j2 = await job(page);
  t.check("upload failure: fallback streams from the laptop", !j2.boardRun && after.length > before.length, JSON.stringify({ j2, extra: after.slice(before.length).slice(0, 200), msg: j2 && j2.message }));
  t.check("upload failure: streamed lines are G-code, not a second XModem start after the button", /G0|G1|M3|M5/.test(after.slice(before.length)), after.slice(before.length).slice(0, 200));
  await page.context().close();

});

await test('STOP during upload', async () => {

  const page = await newPage(br, "d1440", { base: srv.base });
  await enterDemo(page); await dropDemo(page);
  const err = await usbConnect(page, { answer: true, banner: true, xmodemAckDelay: 1500 });
  t.check("STOP during upload: connects", err === "", err);
  await arm(page);
  await ev(page, () => window.plasmaTest.getM().startJob());
  await waitJob(page, () => { const j = window.plasmaTest.S.job; return j && j.running && j.phase === "upload"; });
  await ev(page, () => window.plasmaTest.estopPress());
  await sleep(800);
  const j = await job(page);
  t.check("STOP during upload: upload is aborted and the job is not running", !j.running, JSON.stringify(j));
  const s = await sent(page);
  t.check("STOP during upload: the controller was reset", s.includes("\x18"), "no 0x18 in sent");
  await page.context().close();

});

await test('STOP/pause during run', async () => {

  const page = await newPage(br, "d1440", { base: srv.base });
  await enterDemo(page); await dropDemo(page);
  const err = await usbConnect(page, { answer: true, banner: true, fileStep: 0 });
  t.check("STOP/pause during run: connects", err === "", err);
  await arm(page);
  await ev(page, () => window.plasmaTest.getM().startJob());
  await waitJob(page, () => { const j = window.plasmaTest.S.job; return j && j.phase === "run"; }, 10000);
  await ev(page, () => window.mockPort.setFileProgress(20));
  await ev(page, () => window.mockPort.push(window.mockPort.status() + "\r\n"));
  await sleep(200);
  await ev(page, () => window.plasmaTest.getM().command({ cmd: "hold" }));
  await sleep(300);
  t.check("pause: status is Hold", /Hold/.test(await ev(page, () => window.plasmaTest.S.status.state + (window.mockPort.state || ""))));
  await ev(page, () => window.plasmaTest.getM().command({ cmd: "resume" }));
  await sleep(300);
  t.check("resume: status is Run", await ev(page, () => window.mockPort.state === "Run" || window.plasmaTest.S.status.state === "Run"));
  await ev(page, () => window.plasmaTest.estopPress());
  await sleep(800);
  t.check("STOP during run: the job ends", !(await job(page)).running);
  t.check("STOP during run: the board was reset", (await sent(page)).includes("\x18"));
  await page.context().close();

});

await test('disconnect mid-run', async () => {

  const page = await newPage(br, "d1440", { base: srv.base });
  await enterDemo(page); await dropDemo(page);
  const err = await usbConnect(page, { answer: true, banner: true, fileStep: 0 });
  t.check("disconnect mid-run: connects", err === "", err);
  await arm(page);
  await ev(page, () => window.plasmaTest.getM().startJob());
  await waitJob(page, () => { const j = window.plasmaTest.S.job; return j && j.phase === "run"; }, 10000);
  await ev(page, () => window.mockPort.setFileProgress(35));
  await ev(page, () => window.mockPort.push(window.mockPort.status() + "\r\n"));
  await sleep(200);
  await ev(page, () => window.mockPort.unplug());
  await sleep(600);
  const j = await job(page);
  t.check("disconnect mid-run: job stays running (not watched)", j.running && j.unwatched && j.result == null, JSON.stringify(j));
  t.check("disconnect mid-run: lost banner says the table carries on (not 'Job stopped')",
    /carries on cutting by itself/i.test(await txt(page, "lostBar")) && !/Job stopped/i.test(await txt(page, "lostBar")) && await vis(page, "lostBar"),
    await txt(page, "lostBar"));
  t.check("disconnect mid-run: run title says not watched", /not watched/i.test(await ev(page, () => (document.getElementById("runTitle") || {}).textContent || "")));

  const err2 = await usbConnect(page, { answer: true, banner: true, runningFile: { path: "/littlefs/job.nc", pct: 55 }, fileStep: 0 });
  t.check("reconnect: connects", err2 === "", err2);
  await waitJob(page, () => { const j = window.plasmaTest.S.job; return j && j.running && j.boardRun && !j.unwatched && (j.attached || j.phase === "run"); }, 8000);
  const j2 = await job(page);
  t.check("reconnect: re-attaches to the running file and shows progress", j2.running && j2.pct >= 50, JSON.stringify(j2));
  t.check("reconnect: STOP/Pause are available", await ev(page, () => { const p = document.getElementById("btnPause"); return p && !p.disabled; }));
  await ev(page, () => window.plasmaTest.estopPress());
  await sleep(800);
  t.check("reconnect: STOP ends the attached job", !(await job(page)).running);
  t.check("reconnect: STOP reset the board", (await sent(page)).includes("\x18"));
  await page.context().close();

});

await test('non-FluidNC', async () => {

  const page = await newPage(br, "d1440", { base: srv.base });
  await enterDemo(page); await dropDemo(page);
  const err = await usbConnect(page, { answer: true, banner: false });
  t.check("non-FluidNC: connects on status only", err === "", err);
  await arm(page);
  t.check("non-FluidNC: not flagged as FluidNC", await ev(page, () => !window.plasmaTest.getM().grbl.fluidnc && !window.plasmaTest.S.fluidnc));
  await ev(page, () => window.plasmaTest.getM().startJob());
  await sleep(800);
  const s = await sent(page);
  const j = await job(page);
  t.check("non-FluidNC still streams", !j.boardRun && /G0|G21|M3/.test(s) && !/\$Xmodem\/Receive/i.test(s), JSON.stringify({ board: j.boardRun, head: s.slice(0, 200) }));
  await page.context().close();

});

await test('fromCut', async () => {

  const page = await newPage(br, "d1440", { base: srv.base });
  await twoParts(page);
  await ev(page, () => document.getElementById("btnDemo").click());
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
  await dropDemo(page);
  const err = await usbConnect(page, { answer: true, banner: true, fileStep: 0 });
  t.check("fromCut: connects", err === "", err);
  await arm(page);
  const pierces = await ev(page, () => window.plasmaTest.S.prepared && window.plasmaTest.S.prepared.stats.pierces);
  t.check("fromCut: the job has at least two cuts", pierces >= 2, pierces);
  // The line is shown on the pre-start checklist (step 3) once the board is known to be FluidNC.
  await ev(page, () => { window.plasmaTest.S.fluidnc = true; window.plasmaTest.goStep(3); });
  await sleep(200);
  const chk = await ev(page, () => (document.getElementById("checklist") || {}).innerText || "");
  t.check("checklist reminds you the cut keeps going if the laptop disconnects", /runs on the table|keeps going/i.test(chk) && /E-stop/i.test(chk), chk.slice(0, 400));
  await ev(page, () => window.plasmaTest.getM().startJob({ fromCut: 2 }));
  await waitJob(page, () => { const j = window.plasmaTest.S.job; return j && j.boardRun && j.phase === "run"; }, 10000);
  const file = await ev(page, () => {
    const fs = window.mockPort.fs || {}, k = Object.keys(fs)[0];
    const u8 = k && fs[k]; return u8 ? new TextDecoder().decode(u8) : "";
  });
  t.check("fromCut: the restart lines were uploaded (not the whole original job)", file.length > 20 && /G0|G1|M3/.test(file), file.slice(0, 180));
  t.check("fromCut: run command was sent after the upload", /\$LocalFS\/Run=\/job\.nc/i.test(await sent(page)));
  await page.context().close();

});

await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

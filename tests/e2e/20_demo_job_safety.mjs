// Runs real jobs against the in-browser DEMO controller and inspects every byte the app sends: torch pairing, stop / disconnect / e-stop behaviour.
import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, demoToShape, shot } from "../lib/browser.mjs"; import { analyze } from "../lib/analyze.mjs";
const t = new T("20_demo_job_safety"); const srv = await startServer();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function session(name, fn, prof = "desktop") {
  const K = await launchKillable(); let page;
  try {
    page = await newPage(K.browser, prof, { base: srv.base }); await demoToShape(page);
    await page.evaluate(() => { const s = window.plasmaTest.sketch; s.clear(); s.add("plate", true); const it = s.items[0]; Object.assign(it.p, { w: 60, h: 40, r: 4, hole: 8, inset: 10 }); s.pick([it.id]); s.fitView(); s.commit(); s.onSelect(); });
    await page.evaluate(() => { const S = window.plasmaTest.S, d = S.demo; d.__tx = []; const w = d.write.bind(d); d.write = (x) => { const s = typeof x === "string" ? x : Array.from(x).map((c) => String.fromCharCode(c)).join(""); d.__tx.push({ t: Date.now(), s }); return w(x); }; });
    await fn(page, name);
  } catch (e) { t.check(`${name}: scenario ran`, false, String(e.message).split("\n")[0], "E2E-HARNESS"); }
  finally { K.kill(); }
}
async function toStart(page) {   // r4: Make a part -> "Send to cutting" lands on the bed screen; set the start point, tick the checklist
  await page.evaluate(() => { window.plasmaTest.sendToCutting(); window.plasmaTest.goStep(3); }); await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3);
  await page.click("#btnZero"); await sleep(300);
  for (const cb of await page.locator("#checklist input").all()) await cb.check();
  await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 });
}
const txLines = (page) => page.evaluate(() => window.plasmaTest.S.demo.__tx.map((x) => x.s));
const demo = (page, f) => page.evaluate(`(() => { const d = window.plasmaTest.S.demo; return (${f})(d); })()`);
const waitTorch = async (page, on, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await demo(page, "(d) => d.torch")) === on) return true; await sleep(100); } return false; };

// 1) full job: every byte analysed
await session("full job", async (page, n) => {
  await toStart(page); const before = (await txLines(page)).length; await page.click("#btnStart");
  await page.waitForFunction(() => { const j = window.plasmaTest.S.job; return j && !j.running; }, null, { timeout: 120000 }); await sleep(1500);
  const all = (await txLines(page)).join("").split("\n").map((l) => l.replace(/[?!~\x18]/g, "").trim()).filter(Boolean);
  const startIdx = all.findIndex((l) => /G21/.test(l) && /G90/.test(l)); const jobLines = all.slice(Math.max(0, startIdx));
  const a = analyze(jobLines);
  t.check(`${n}: M3 == M5 in streamed bytes`, a.m3 > 0 && a.m5 >= a.m3, `m3=${a.m3} m5=${a.m5} lines=${jobLines.length}`, "GCODE-SAFETY");
  t.check(`${n}: no rapid-with-torch-on / cut-with-torch-off / double M3`, a.violations.length === 0, JSON.stringify(a.violations.slice(0, 3)), "GCODE-SAFETY");
  t.check(`${n}: torch OFF in controller when job finished`, (await demo(page, "(d) => d.torch")) === false, "", "GCODE-SAFETY");
  t.check(`${n}: nothing but expected commands sent (no $ settings, no $H, no G10)`, !jobLines.some((l) => /^\$|G10|G92/.test(l)), jobLines.filter((l) => /^\$|G10|G92/.test(l)).join("|"), "DEMO-SAFETY");
  const holes = a.blocks.length; t.note(`${n}: cut blocks streamed`, holes);
  // holes cut before outline: first 4-5 blocks small, last big
  const sizes = a.blocks.map((b) => { const xs = b.pts.map((p) => p[0]), ys = b.pts.map((p) => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); });
  t.check(`${n}: outline (largest block) is cut LAST`, sizes.indexOf(Math.max(...sizes)) === sizes.length - 1, JSON.stringify(sizes.map((v) => Math.round(v))), "ORDER");
  t.check(`${n}: job completed in UI (Finished)`, await page.locator("#done:not(.hidden)").count() === 1);
  await shot(page, "desktop-demo-job-finished");
});
// 2) STOP while torch is on
for (const how of ["button", "Space key"]) await session(`STOP via ${how} mid-cut`, async (page, n) => {
  await toStart(page); await page.click("#btnStart");
  const lit = await waitTorch(page, true, 90000); t.check(`${n}: torch fired in demo`, lit, "", "E2E-HARNESS"); if (!lit) return;
  await sleep(600); const mark = (await txLines(page)).length;
  if (how === "button") await page.click("#btnStop"); else await page.keyboard.press("Space");
  await sleep(1500);
  const after = (await txLines(page)).slice(mark).join("");
  t.check(`${n}: torch OFF within 1.5 s`, (await demo(page, "(d) => d.torch")) === false, "torch still on in controller", "STOP-TORCH");
  t.check(`${n}: feed-hold + reset sent`, after.includes("!") && after.includes("\x18"), JSON.stringify(after.slice(0, 40)), "STOP-TORCH");
  const jobAfter = after.replace(/[?!~\x18]/g, "").split("\n").filter((l) => l.trim() && !/^\$/.test(l.trim())); t.check(`${n}: no further job lines streamed after STOP`, jobAfter.length === 0, jobAfter.slice(0, 3).join("|"), "STOP-STREAM");
  t.check(`${n}: UI shows job stopped`, await page.evaluate(() => { const j = window.plasmaTest.S.job; return j && !j.running && j.result === "stopped"; }), JSON.stringify(await page.evaluate(() => window.plasmaTest.S.job)), "STOP-UI");
  const z = await demo(page, "(d) => d.mpos[2]"); t.note(`${n}: Z after stop (machine mm; torch left down where it stopped?)`, z);
});
// 3) Disconnect mid-cut (disconnect fired the instant the torch is on)
await session("DISCONNECT mid-cut", async (page, n) => {
  await toStart(page); await page.click("#btnStart"); const lit = await waitTorch(page, true, 90000); if (!lit) { t.check(`${n}: torch fired`, false, "", "E2E-HARNESS"); return; }
  const mark = (await txLines(page)).length;
  const torchAtClick = await page.evaluate(async () => { const d = window.plasmaTest.S.demo; const on = d.torch; document.getElementById("btnDisconnect").click(); return on; });
  await sleep(4000);
  const after = (await txLines(page)).slice(mark).join("").replace(/\?/g, "");
  const stopSent = after.includes("\x18") || /M5/.test(after) || after.includes("!") || after.includes("\x9e");
  t.check(`${n}: app tries to turn the torch OFF (hold / M5 / reset / spindle-stop) before closing the link`, torchAtClick && stopSent, `torch was ON at click=${torchAtClick}; bytes sent after click: ${JSON.stringify(after.slice(0, 80))}; controller torch now = ${await demo(page, "(d) => d.torch")}`, "DISCONNECT-TORCH");
  t.check(`${n}: Disconnect while cutting asks for confirmation`, page.dialogs.some((d) => /job is running/i.test(d)), JSON.stringify(page.dialogs), "DISCONNECT-CONFIRM");
});
// 4) tab close / navigation mid-cut
await session("RELOAD mid-cut", async (page, n) => {
  await toStart(page); await page.click("#btnStart"); const lit = await waitTorch(page, true, 90000); if (!lit) return;
  const hasUnload = await page.evaluate(() => { let prevented = false; const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  t.check(`${n}: beforeunload warns while a job is running`, hasUnload, "", "UNLOAD-WARN");
  t.note(`${n}: pagehide/visibilitychange torch-off handler`, await page.evaluate(() => "no handler can run after the tab is gone; see DISCONNECT-TORCH"));
});
// 5) E-stop during cut
await session("E-STOP mid-cut", async (page, n) => {
  await toStart(page); await page.click("#btnStart"); const lit = await waitTorch(page, true, 90000); if (!lit) return; await sleep(400);
  await page.click("#btnDemoEstop").catch(async () => { await page.evaluate(() => window.plasmaTest.S.demo.setEstop(true)); }); await sleep(1200);
  t.check(`${n}: torch off after e-stop`, (await demo(page, "(d) => d.torch")) === false, "", "ESTOP");
  t.check(`${n}: job marked failed/alarm in UI, Start blocked`, await page.evaluate(() => { const j = window.plasmaTest.S.job; return j && !j.running; }) && await page.evaluate(() => document.getElementById("btnStart").disabled), "", "ESTOP");
  const msg = await page.evaluate(() => document.getElementById("alarmText") && document.getElementById("alarmText").textContent); t.note(`${n}: alarm text shown`, msg);
});
// 6) Pause while torch is on
await session("PAUSE mid-cut", async (page, n) => {
  await toStart(page); await page.click("#btnStart"); const lit = await waitTorch(page, true, 90000); if (!lit) return; await sleep(300);
  await page.click("#btnPause"); await sleep(2500);
  const st = await demo(page, "(d) => ({ torch: d.torch, stopped: d.spindleStopped, hold: d.hold })");
  t.check(`${n}: pause → torch signal off (spindle-stop override)`, st.hold && (st.stopped || !st.torch), JSON.stringify(st), "PAUSE-TORCH");
  await page.click("#btnPause"); await sleep(1500); const st2 = await demo(page, "(d) => ({ torch: d.torch, stopped: d.spindleStopped, hold: d.hold })"); t.note(`${n}: after resume`, JSON.stringify(st2));
  await page.click("#btnStop"); await sleep(800);
});
// 7) Esc inside the Pro dialogs / keypad also fires STOP (reset)?
await session("Esc closes a dialog (does it also STOP the machine?)", async (page, n) => {
  await page.evaluate(() => { window.plasmaTest.sketch.setPro(true); window.plasmaTest.runPro("linarray"); }); await page.waitForSelector("#cadDialog:not(.hidden)");
  const mark = (await txLines(page)).length; await page.keyboard.press("Escape"); await sleep(600);
  const after = (await txLines(page)).slice(mark).join("");
  t.check(`${n}: Esc in the array dialog closes it WITHOUT sending hold/reset to the machine`, !after.includes("\x18") && !after.includes("!"), `bytes sent: ${JSON.stringify(after.replace(/\?/g, ""))}`, "ESC-STOP");
});
// 8) round 5: work zero. STOP clears it; releasing the E-stop (press-and-hold) does NOT bring it back; Start stays off until the start point is set again
const holdRelease = async (page) => { const b = await page.locator("#btnStop").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(1800); await page.mouse.up(); await sleep(400); };
await session("work zero is cleared by STOP and not restored by releasing the E-stop", async (page, n) => {
  await toStart(page);
  t.check(`${n}: before: start point set, Start enabled`, await page.evaluate(() => window.plasmaTest.S.zeroSet === true && !document.getElementById("btnStart").disabled), "", "ZERO");
  await page.click("#btnStart"); const lit = await waitTorch(page, true, 90000); t.check(`${n}: torch fired in demo`, lit, "", "E2E-HARNESS"); if (!lit) return;
  await page.click("#btnStop"); await sleep(1500);
  t.check(`${n}: STOP clears work zero (machine flag and screen)`, await page.evaluate(() => window.plasmaTest.getM().zeroConfirmed === false && window.plasmaTest.S.zeroSet === false), "", "ZERO-STOP");
  t.check(`${n}: STOP latches the E-stop`, await page.evaluate(() => window.plasmaTest.estopOn()), "", "ESTOP-LATCH");
  t.check(`${n}: Start is disabled and says why (E-STOP is ON / set the start point)`, await page.evaluate(() => document.getElementById("btnStart").disabled && /E-STOP is ON|start point/i.test(document.getElementById("blockers").textContent + document.getElementById("startWhy").textContent)), await page.evaluate(() => document.getElementById("blockers").textContent), "ZERO-STOP");
  // a tap and Space do not release it
  await page.click("#btnStop"); await sleep(300); await page.keyboard.press("Space"); await sleep(300);
  t.check(`${n}: a tap and Space do not release the E-stop`, await page.evaluate(() => window.plasmaTest.estopOn()), "", "ESTOP-HOLD");
  await holdRelease(page);
  t.check(`${n}: press-and-hold 1.8 s releases the E-stop`, await page.evaluate(() => !window.plasmaTest.estopOn()), "", "ESTOP-HOLD");
  t.check(`${n}: releasing the E-stop does NOT restore work zero; Start still disabled`, await page.evaluate(() => window.plasmaTest.S.zeroSet === false && document.getElementById("btnStart").disabled), "", "ZERO-RELEASE");
  const mark = (await txLines(page)).length;
  const r = await page.evaluate(() => { try { window.plasmaTest.getM().startJob({}); return "started"; } catch (e) { return String(e.message || e); } });
  await sleep(300);
  t.check(`${n}: startJob() from script is refused without work zero (${String(r).slice(0, 60)})`, r !== "started" && !(await txLines(page)).slice(mark).some((l) => /^G[01]|^M3/.test(l)), r, "ZERO-ENFORCED");
  await page.evaluate(() => { try { window.plasmaTest.getM().command({ cmd: "unlock" }); } catch (e) { /* */ } }); await sleep(1500);   // the controller is in Alarm after a stop: unlock it (unlock also keeps work zero cleared)
  t.check(`${n}: unlocking does not bring work zero back`, await page.evaluate(() => window.plasmaTest.S.zeroSet === false && document.getElementById("btnStart").disabled), "", "ZERO-UNLOCK");
  await page.evaluate(() => window.plasmaTest.goStep(3)); await sleep(300);   // the job left the screen on the "running / finished" step: back to the bed step
  await page.click("#btnZero"); await sleep(400);
  for (const cb of await page.locator("#checklist input").all()) await cb.check();
  t.check(`${n}: setting the start point again (and ticking the checklist) re-enables Start`, await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 }).then(() => true).catch(() => false), "", "ZERO-RESET");
});
// 9) round 5: Home clears work zero too (the machine may have been moved by the homing cycle)
await session("work zero is cleared by Home", async (page, n) => {
  await toStart(page);
  await page.evaluate(() => window.plasmaTest.getM().command({ cmd: "home" })); await sleep(400);
  t.check(`${n}: Home clears work zero (machine flag and screen)`, await page.evaluate(() => window.plasmaTest.getM().zeroConfirmed === false && window.plasmaTest.S.zeroSet === false), "", "ZERO-HOME");
  t.check(`${n}: Start is disabled after Home until the start point is set again`, await page.evaluate(() => document.getElementById("btnStart").disabled), "", "ZERO-HOME");
});
await srv.close(); process.exit(t.done() ? 1 : 0);

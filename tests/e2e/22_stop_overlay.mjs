// Round 3 safety tests: (1a) the portrait overlay never hides STOP while anything is moving, (1b) Continue-from-cut never forces work zero.
// Round 5 safety: with a machine connected, STOP is above the cover, the numpad and the dialogs even while idle.
import { serve, open, launch, demoToShape, REPO, SITE, DATA, SHOTS, mod } from "../lib/r2compat.mjs";
// Round 4: serves the repo; the opening goes through the new flow (menu -> make -> send to cutting -> Practice).
const out = SHOTS;
const s = await serve(), br = await launch();
let pass = 0, fail = 0;
const ck = (n, ok, i = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + i)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const snap = async (page, name) => { await page.evaluate(() => { const t = document.getElementById("toast"); if (t) t.classList.add("hidden"); }); await sleep(250); await page.screenshot({ path: `${out}/r3-safety-${name}.png` }); };
const coverAt = (page, id) => T(page, `(() => { const e = document.getElementById("${id}"); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { w: r.width, h: r.height, top: t && (t.closest("#turnOverlay") ? "overlay" : (t.closest("#" + "${id}") ? "${id}" : t.id || t.tagName)), shown: r.width > 0 }; })()`);
const overlayShown = (page) => T(page, `(() => { const o = document.getElementById("turnOverlay"); return getComputedStyle(o).display !== "none"; })()`);
const setState = (page, st) => page.evaluate((st) => { const S = window.plasmaTest.S; S.status = { ...S.status, ...st }; window.plasmaTest.refresh(); }, st);
const refresh = (page) => page.evaluate(() => window.plasmaTest.refreshGate());

// ------------------------------------------------------------------ 1a. portrait overlay vs STOP
{
  const page = await open(br, "phone", s.base, "?test=1");     // overlay is ON by default in portrait
  await sleep(500);
  ck("1a idle on the menu, portrait: the turn-sideways overlay stays away (B5: it only covers the cutting bed)", !(await overlayShown(page)));
  await snap(page, "1a-overlay-idle-phone");
  await demoToShape(page, { stay: "cut" }); await sleep(800);
  await sleep(300); await refresh(page);
  ck("1a connected + idle: overlay still shown (nothing is moving)", await overlayShown(page));
  // Round 5 safety: with a machine connected, STOP stays above the cover (and every other overlay) even while idle
  const c0 = await coverAt(page, "btnStop");
  ck("r5 connected + idle, cover up: STOP is on top of it and big", c0.top === "btnStop" && c0.w >= 72 && c0.h >= 72, JSON.stringify(c0));
  ck("r5 the cover starts below the header, so the STOP corner is clear", await T(page, "document.getElementById('turnOverlay').getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom - 1"));
  for (const id of ["numPad", "cadDialog", "accountDlg", "shapeLib"]) {
    await page.evaluate((id) => document.getElementById(id).classList.remove("hidden"), id); await sleep(150);
    const c = await coverAt(page, "btnStop");
    ck(`r5 connected + idle, #${id} open: STOP is still on top`, c.top === "btnStop", JSON.stringify(c));
    await page.evaluate((id) => document.getElementById(id).classList.add("hidden"), id);
  }
  await page.evaluate(() => document.getElementById("numPad").classList.remove("hidden"));
  await page.click("#btnStop"); await sleep(600);       // a real tap through the cover + numpad
  ck("r5 a real tap on STOP over the cover and the numpad latches the E-stop", await T(page, "window.plasmaTest.estopOn()"));
  await page.evaluate(() => { document.getElementById("numPad").classList.add("hidden"); window.plasmaTest.estopReset(); document.getElementById("btnUnlock").click(); }); await sleep(1200);
  for (const st of [{ state: "Run" }, { state: "Hold:0" }, { state: "Jog" }, { state: "Home" }, { state: "Alarm" }, { state: "Idle", torch: true }]) {
    await page.evaluate((st) => { const S = window.plasmaTest.S; S.status = { ...S.status, state: "Idle", torch: false, ...st }; window.plasmaTest.refresh(); }, st);
    const o = await overlayShown(page), c = await coverAt(page, "btnStop");
    ck(`1a ${JSON.stringify(st)}: overlay hidden, STOP on top and big`, !o && c.top === "btnStop" && c.w >= 72 && c.h >= 72, JSON.stringify({ o, c }));
  }
  await page.evaluate(() => { const S = window.plasmaTest.S; S.status = { ...S.status, state: "Idle", torch: false }; window.plasmaTest.refresh(); });
  ck("1a back to idle: overlay returns", await overlayShown(page));
  // a real demo job
  await page.evaluate(() => window.plasmaTest.demoEdges()); await sleep(6000);
  await page.evaluate(() => { window.plasmaTest.goStep(3); }); await sleep(600);
  await page.evaluate(() => document.getElementById("btnZero").click()); await sleep(500);
  await page.evaluate(() => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change")); }); await sleep(300);
  ck("1a demo job can start", await T(page, "!document.getElementById('btnStart').disabled"), await T(page, "document.getElementById('blockers').textContent"));
  await page.evaluate(() => document.getElementById("btnStart").click()); await sleep(2000);
  ck("1a job running: overlay hidden", !(await overlayShown(page)) && await T(page, "document.body.classList.contains('running-job')"));
  const c2 = await coverAt(page, "btnStop");
  ck("1a job running (portrait): STOP is on top and at least 72x72", c2.top === "btnStop" && c2.w >= 72 && c2.h >= 72, JSON.stringify(c2));
  ck("1a job running (portrait): menu/back is locked while it cuts", await T(page, "document.getElementById('btnHome').disabled || document.getElementById('btnHome').getAttribute('aria-disabled') === 'true'"));
  await snap(page, "1a-job-running-portrait-phone");
  await page.click("#btnStop"); await sleep(2500);       // a real tap: it would fail if anything covered STOP
  ck("1a STOP really stops it", await T(page, "!window.plasmaTest.S.job.running"));
  ck("1a after STOP (alarm/hold): the overlay stays away until the machine is idle again", !(await overlayShown(page)) || (await T(page, "window.plasmaTest.S.status.state === 'Idle'")));
  ck("1a after STOP the mushroom shows E-STOP ON", await T(page, "document.getElementById('estopLabel').textContent.includes('E-STOP ON')"));
  await page.evaluate(() => document.getElementById("btnUnlock").click()); await sleep(1200);
  await page.context().close();
}

// ------------------------------------------------------------------ 1b. Continue from cut N never forces work zero
async function jobToStop(view) {
  const page = await open(br, view, s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" });
  await page.evaluate(() => { const t = window.plasmaTest, sk = t.sketch; t.showScreen("make"); t.setShapeFs(false); sk.clear(); sk.add("rect"); sk.add("disc"); sk.add("rect"); t.sendToCutting(); t.goStep(3); });
  await sleep(300);
  await page.evaluate(() => window.plasmaTest.demoEdges()); await sleep(6000);
  await page.evaluate(() => { window.plasmaTest.goStep(3); document.getElementById("layAuto").click(); }); await sleep(500);
  await page.evaluate(() => document.getElementById("btnZero").scrollIntoView({ block: "center" }));
  await page.click("#btnZero"); await sleep(400);
  await page.evaluate(() => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change")); }); await sleep(200);
  await page.click("#btnStart"); await sleep(1500);
  const t0 = Date.now(); let pi = 0;
  while (Date.now() - t0 < 120000) { pi = await T(page, "window.plasmaTest.S.run ? window.plasmaTest.S.run.ons : 0"); if (pi >= 2) break; await sleep(300); }
  await page.click("#btnStop"); await sleep(2500);
  await page.evaluate(() => window.plasmaTest.estopReset());   // the unlock path is exercised below; the latch is released like the operator would
  return page;
}
{
  const page = await jobToStop("laptop");
  ck("1b STOP at cut >= 2 offers Continue", await T(page, "!document.getElementById('restartBox').classList.contains('hidden') && window.plasmaTest.S.resume && window.plasmaTest.S.resume.n >= 2"));
  const zeroBefore = await T(page, "window.plasmaTest.S.zeroSet");
  await snap(page, "1b-stopped-continue-laptop");
  await page.click("#btnRestart"); await sleep(700);
  const z = await T(page, "({ zero: window.plasmaTest.S.zeroSet, cur: window.plasmaTest.S.cur, start: document.getElementById('btnStart').disabled, why: document.getElementById('resumeWhy').textContent, why_hidden: document.getElementById('resumeWhy').classList.contains('hidden'), blockers: document.getElementById('blockers').textContent, ref: window.plasmaTest.S.safety.referenced, state: window.plasmaTest.S.status.state })");
  console.log("INFO zero before continue =", zeroBefore, "; after =", JSON.stringify(z).slice(0, 400));
  ck("1b Continue after STOP does NOT set work zero (zeroSet stays false)", z.zero === false, JSON.stringify(z));
  ck("1b Start is locked after Continue", z.start === true && z.cur === 3);
  ck("1b plain-words reason is shown (home / set the start point)", !z.why_hidden && /Home/i.test(z.why) && /start point/i.test(z.why), z.why);
  await snap(page, "1b-continue-needs-home-and-zero-laptop");
  // unlock + home is not enough: work zero must be confirmed again
  await page.evaluate(() => document.getElementById("btnUnlock").click()); await sleep(900);
  await page.evaluate(() => { const h = document.querySelector(".do-home"); if (h) h.click(); }); await sleep(5000);
  await page.evaluate(() => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change")); }); await sleep(300);
  const z2 = await T(page, "({ zero: window.plasmaTest.S.zeroSet, start: document.getElementById('btnStart').disabled, ref: window.plasmaTest.S.safety.referenced, blockers: document.getElementById('blockers').textContent })");
  ck("1b after Unlock + Home the machine is homed but Start is STILL locked until work zero is confirmed", z2.ref === true && z2.zero === false && z2.start === true && /Start point|Start here/i.test(z2.blockers), JSON.stringify(z2));
  await page.evaluate(() => document.getElementById("btnZero").scrollIntoView({ block: "center" }));
  await page.click("#btnZero"); await sleep(500);
  await page.evaluate(() => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change")); }); await sleep(300);
  ck("1b once homed AND work zero re-confirmed, Start is allowed again", await T(page, "!document.getElementById('btnStart').disabled"), await T(page, "document.getElementById('blockers').textContent"));
  await snap(page, "1b-ready-after-rezero-laptop");
  ck("1b the cut number is kept", await T(page, "window.plasmaTest.S.startCut >= 2"));
  await page.context().close();
}
// synthetic cases: ALARM 3, edges never set, work zero never set, soft reset without edges
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" });
  await page.evaluate(() => { const t = window.plasmaTest, sk = t.sketch; t.showScreen("make"); t.setShapeFs(false); sk.clear(); sk.add("rect"); sk.add("disc"); sk.add("rect"); t.sendToCutting(); t.goStep(3); });
  await sleep(500);
  await page.evaluate(() => { window.plasmaTest.goStep(3); }); await sleep(500);
  const cont = async (setup) => {
    await page.evaluate((setup) => { const S = window.plasmaTest.S; S.resume = { n: 2, total: S.prepared.cutIndex.length, jobId: S.jobSeq, reason: "stopped" }; S.job = { running: false, result: "stopped" }; Object.assign(S, setup); window.plasmaTest.goStep(4); }, setup);
    await sleep(200);
    await page.evaluate(() => { document.getElementById("restartBox").classList.remove("hidden"); document.getElementById("restartCut").value = "2"; });
    await page.evaluate(() => document.getElementById("btnRestart").click()); await sleep(500);
    return T(page, "({ zero: window.plasmaTest.S.zeroSet, startOff: document.getElementById('btnStart').disabled, cut: window.plasmaTest.S.startCut })");
  };
  let r = await cont({ zeroSet: true, lastAlarmCode: 3 });
  ck("1b ALARM 3 then Continue: work zero is NOT carried over", r.zero === false && r.startOff, JSON.stringify(r));
  r = await cont({ zeroSet: false, lastAlarmCode: null });
  ck("1b work zero was never set: Continue does not set it", r.zero === false && r.startOff, JSON.stringify(r));
  r = await cont({ zeroSet: true, lastAlarmCode: null });   // edges never set up in this demo run (no limits) -> a soft reset can have lost the position
  ck("1b no edges set up (soft reset after STOP): work zero must be re-confirmed", r.zero === false && r.startOff, JSON.stringify(r));
  await page.context().close();
}

await br.close(); s.close();
console.log(`\n22_stop_overlay: ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

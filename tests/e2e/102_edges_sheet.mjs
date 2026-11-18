// Smaller machine edges (set on purpose) must still work: the sheet corner and
// a 200 mm disc sit inside those edges from home at the top-left. A sheet
// larger than the reachable area is allowed; only the cut path has to fit.
// Practice simulator only — no real hardware.
import fs from "node:fs";
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("102_edges_sheet");
const OUT = "/workspace/out";
fs.mkdirSync(OUT, { recursive: true });

const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EDGE_X = 509, EDGE_Y = 653;

async function waitIdle(page, ms = 8000) {
  await page.waitForFunction(() => (window.plasmaTest.S.status || {}).state === "Idle", null, { timeout: ms }).catch(() => {});
  await sleep(120);
}

async function hideToast(page) {
  await ev(page, () => { const el = document.getElementById("toast"); if (el) el.classList.add("hidden"); });
}

async function teleport(page, x, y, z) {
  const ok = await ev(page, ({ x, y, z }) => {
    const sim = window.plasmaTest.S.demo, mp = (window.plasmaTest.S.status || {}).MPos || [0, 0, 0];
    const zz = Number.isFinite(z) ? z : mp[2];
    return !!(sim && sim.demoTeleport([x, y, zz]));
  }, { x, y, z });
  await page.waitForFunction(({ x, y }) => {
    const mp = (window.plasmaTest.S.status || {}).MPos || [];
    return mp.length && Math.abs(mp[0] - x) < 1 && Math.abs(mp[1] - y) < 1;
  }, { x, y }, { timeout: 4000 });
  return ok;
}

const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });
await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make");
  T.setShapeFs(false);
  T.setAppMode("advanced", { autoFs: false, persist: false });
});

await ev(page, () => document.getElementById("btnDemo").click());
await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
await waitIdle(page);

// Unlock if the practice table boots in Alarm.
await ev(page, () => {
  const M = window.plasmaTest.getM();
  if (M.state() === "Alarm") M.command({ cmd: "unlock" });
});
await waitIdle(page);

const home = await ev(page, () => {
  const M = window.plasmaTest.getM();
  M.command({ cmd: "set_reference" });
  const st = window.plasmaTest.S.status || {};
  return { ref: (window.plasmaTest.S.safety && window.plasmaTest.S.safety.ref) || null, mp: (st.MPos || []).slice(0, 3) };
});
t.check("Set this as home records the torch position", !!(home.ref && home.mp.length), JSON.stringify(home));
await waitIdle(page);

const farOk = await teleport(page, EDGE_X, EDGE_Y, -10);
t.check("practice torch can be placed at the far corner to set edges", farOk, `teleport ${EDGE_X},${EDGE_Y}`);

const saved = await ev(page, () => {
  const M = window.plasmaTest.getM(), S = window.plasmaTest.S;
  M.command({ cmd: "limits_far" });
  M.command({ cmd: "limits_zbottom" });
  return M.command({ cmd: "limits_save" });
});
await page.waitForFunction(() => {
  const S = window.plasmaTest.S, ref = S.safety && S.safety.ref, mp = (S.status || {}).MPos || [];
  return !!(S.safety && S.safety.limits && ref && mp.length && Math.hypot(mp[0] - ref[0], mp[1] - ref[1]) < 1);
}, null, { timeout: 4000 }).catch(() => {});
const afterSave = await ev(page, () => {
  const S = window.plasmaTest.S, st = S.status || {}, L = S.safety && S.safety.limits, ref = S.safety && S.safety.ref;
  const mp = (st.MPos || []).slice(0, 3);
  return {
    lim: L && { x: L.x, y: L.y, z: L.z },
    ref, mp,
    atHome: !!(ref && mp.length && Math.hypot(mp[0] - ref[0], mp[1] - ref[1]) < 1),
  };
});
saved.lim = afterSave.lim; saved.ref = afterSave.ref; saved.mp = afterSave.mp; saved.atHome = afterSave.atHome;
t.check("saving 509 × 653 mm edges stores that reachable size",
  saved.ok && saved.lim && Math.abs(saved.lim.x[1] - saved.lim.x[0] - EDGE_X) < 1 && Math.abs(saved.lim.y[1] - saved.lim.y[0] - EDGE_Y) < 1,
  JSON.stringify(saved.lim));
t.check("after Save edges the torch is back at the home corner",
  saved.atHome, JSON.stringify({ mp: saved.mp, ref: saved.ref, note: saved.note }));
t.check("the save note says the torch went back to the home corner",
  /home corner/i.test(saved.note) && /Start here/i.test(saved.note), saved.note);

await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make"); T.setShapeFs(false);
  T.sketch.clear();
  T.sketch.add("disc", true, { d: 200 });
  const it = T.sketch.items[0];
  if (it) { it.x = 0; it.y = 0; if (it.p) it.p.d = 200; }
  if (T.sketch.commit) T.sketch.commit();
  else if (T.sketch.save) T.sketch.save();
  T.sendToCutting(); T.goStep(3);
  const box = document.getElementById("showMach");
  if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
  const w = document.getElementById("sheetW"), h = document.getElementById("sheetH");
  if (w) { w.value = "1300"; w.dispatchEvent(new Event("change", { bubbles: true })); }
  if (h) { h.value = "800"; h.dispatchEvent(new Event("change", { bubbles: true })); }
});
await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
await sleep(250);

page._safeConfirmAuto = "accept";
await ev(page, () => document.getElementById("btnZero").click());
await sleep(300);

const afterHomeStart = await ev(page, () => {
  const T = window.plasmaTest, S = T.S, sk = T.sketch;
  const st = S.status || {};
  const wco = st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : [0, 0, 0];
  const ref = S.safety.ref, L = S.safety.limits;
  const wa = L && ref ? {
    x: [L.x[0] - wco[0] + ref[0], L.x[1] - wco[0] + ref[0]],
    y: [L.y[0] - wco[1] + ref[1], L.y[1] - wco[1] + ref[1]],
  } : null;
  const o = sk && sk.toScreen && sk.toScreen(0, 0);
  const far = wa && sk && sk.toScreen && sk.toScreen(wa.x[1], wa.y[1]);
  const homePx = wa && sk && sk.toScreen && sk.toScreen(wa.x[0], wa.y[0]);
  const fit = (document.getElementById("fit") || {}).textContent || "";
  const jc = (document.getElementById("jcMach") || {}).textContent || "";
  const note = (document.getElementById("sheetNote") || {}).textContent || "";
  const rot = T.bedViewRotated();
  return {
    wco: wco.slice(0, 2), ref: ref && ref.slice(0, 2), wa,
    o, far, homePx, fit, jc, note, rot, zeroSet: !!S.zeroSet,
  };
});

t.check("Start here at the home corner puts work zero on the home corner",
  afterHomeStart.ref && Math.hypot(afterHomeStart.wco[0] - afterHomeStart.ref[0], afterHomeStart.wco[1] - afterHomeStart.ref[1]) < 1,
  JSON.stringify({ wco: afterHomeStart.wco, ref: afterHomeStart.ref }));
t.check("machine edges in the sheet picture start at the sheet corner (0, 0)",
  afterHomeStart.wa && Math.abs(afterHomeStart.wa.x[0]) < 1 && Math.abs(afterHomeStart.wa.y[0]) < 1
    && Math.abs(afterHomeStart.wa.x[1] - EDGE_X) < 1 && Math.abs(afterHomeStart.wa.y[1] - EDGE_Y) < 1,
  JSON.stringify(afterHomeStart.wa));
t.check("a 200 mm disc at the origin fits inside the 509 × 653 mm edges",
  afterHomeStart.zeroSet && /Fits on the machine/i.test(afterHomeStart.fit) && !/Won't fit/i.test(afterHomeStart.fit),
  afterHomeStart.fit);
t.check("the job panel shows the reachable 509 × 653 mm edges, not only the 1300 × 800 mm bed",
  /reachable 509\s*×\s*653/i.test(afterHomeStart.jc) && /bed 1300\s*×\s*800/i.test(afterHomeStart.jc),
  afterHomeStart.jc);
t.check("a 1300 × 800 mm sheet on a smaller reachable area is explained, and only the cut path has to fit",
  /larger than the reachable area/i.test(afterHomeStart.note) && /only the cut path/i.test(afterHomeStart.note),
  afterHomeStart.note);
t.check("on the laptop Setup picture the sheet corner is at the top-left of the machine edges (home)",
  afterHomeStart.rot && afterHomeStart.o && afterHomeStart.far && afterHomeStart.homePx
    && Math.hypot(afterHomeStart.o[0] - afterHomeStart.homePx[0], afterHomeStart.o[1] - afterHomeStart.homePx[1]) < 8
    && afterHomeStart.o[0] < afterHomeStart.far[0] - 20
    && afterHomeStart.o[1] < afterHomeStart.far[1] - 20,
  JSON.stringify({ o: afterHomeStart.o, homePx: afterHomeStart.homePx, far: afterHomeStart.far, rot: afterHomeStart.rot }));

await hideToast(page);
await sleep(80);
await page.screenshot({ path: `${OUT}/edges-sheet-setup.png`, fullPage: false });
t.note("Setup screenshot after the repro sequence", `${OUT}/edges-sheet-setup.png`);

// Start here at the far corner should ask first, and if accepted, explain the won't-fit.
await teleport(page, EDGE_X, EDGE_Y);

page.dialogs.length = 0;
page._safeConfirmAuto = "dismiss";
await ev(page, () => document.getElementById("btnZero").click());
await sleep(400);
const dismissed = await ev(page, () => {
  const st = window.plasmaTest.S.status || {};
  const wco = st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : [];
  const ref = window.plasmaTest.S.safety.ref || [];
  return { wco: wco.slice(0, 2), ref: ref.slice(0, 2) };
});
const confirmText = page.dialogs.map(String).join("\n");
t.check("Start here far from home asks for confirmation",
  /long way from the home corner/i.test(confirmText) || /sheet's back-left/i.test(confirmText),
  confirmText.slice(0, 400));
t.check("cancelling Start here at the far corner leaves work zero at home",
  dismissed.ref.length && Math.hypot(dismissed.wco[0] - dismissed.ref[0], dismissed.wco[1] - dismissed.ref[1]) < 1,
  JSON.stringify(dismissed));

page._safeConfirmAuto = "accept";
await ev(page, () => document.getElementById("btnZero").click());
await sleep(400);
const accepted = await ev(page, () => {
  const T = window.plasmaTest, S = T.S, st = S.status || {};
  const wco = st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : [];
  const ref = S.safety.ref || [];
  const fit = (document.getElementById("fit") || {}).textContent || "";
  const L = S.safety.limits;
  const wa = L && ref.length ? {
    x: [L.x[0] - wco[0] + ref[0], L.x[1] - wco[0] + ref[0]],
    y: [L.y[0] - wco[1] + ref[1], L.y[1] - wco[1] + ref[1]],
  } : null;
  return { wco: wco.slice(0, 2), ref: ref.slice(0, 2), fit, wa };
});
t.check("confirming Start here at the far corner puts the sheet corner at the far edge",
  accepted.wco.length && accepted.ref.length && Math.hypot(accepted.wco[0] - accepted.ref[0], accepted.wco[1] - accepted.ref[1]) > 200,
  JSON.stringify({ wco: accepted.wco, ref: accepted.ref, wa: accepted.wa }));
t.check("a 200 mm disc then won't fit, and the message says the start point is away from home",
  /Won't fit/i.test(accepted.fit) && /too far right/i.test(accepted.fit) && /too far forward/i.test(accepted.fit)
    && /away from the home corner/i.test(accepted.fit),
  accepted.fit);

// Real overtravel still fails when the start point is at home.
const homeXY = await ev(page, () => (window.plasmaTest.S.safety.ref || [0, 0]).slice(0, 2));
await teleport(page, homeXY[0], homeXY[1]);
page._safeConfirmAuto = "accept";
await ev(page, () => document.getElementById("btnZero").click());
await sleep(300);
await ev(page, () => {
  const T = window.plasmaTest, it = T.sketch.items[0];
  if (it) { it.x = 400; it.y = 0; }
  if (T.sketch.commit) T.sketch.commit();
  T.loadJob ? T.loadJob() : (window.plasmaTest.refresh && window.plasmaTest.refresh());
});
// loadJob may not be on plasmaTest — use the change path
await ev(page, () => {
  const T = window.plasmaTest;
  if (typeof T.refresh === "function") T.refresh();
  // force a job rebuild the same way a sheet change does
  const w = document.getElementById("sheetW");
  if (w) w.dispatchEvent(new Event("change", { bubbles: true }));
});
await sleep(400);
const over = await ev(page, () => (document.getElementById("fit") || {}).textContent || "");
t.check("a part that really overruns the edges still won't fit, without blaming the start point at home",
  /Won't fit/i.test(over) && /too far right/i.test(over) && !/away from the home corner/i.test(over),
  over);

await hideToast(page);
await page.ctx.close();
await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

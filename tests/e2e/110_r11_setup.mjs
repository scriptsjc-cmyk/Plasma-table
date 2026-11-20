// r11 Setup step: no page or inner scroll at 1536×750, 1366×768 and 1920×1080;
// jog pad visible once connected; one sheet-corner message; practice end-to-end.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape, ensurePracticeHomed, shot, PROFILES } from "../lib/browser.mjs";
import fs from "node:fs";
import path from "node:path";

const t = new T("110_r11_setup");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
async function waitIdle(page, timeout = 60000) {
  await ev(page, () => { window.__idleAt = 0; });
  await page.waitForFunction(() => {
    const st = window.plasmaTest.getM().state();
    if (st !== "Idle") { window.__idleAt = 0; return false; }
    window.__idleAt = window.__idleAt || Date.now();
    return Date.now() - window.__idleAt > 700;
  }, null, { timeout }).catch(() => {});
}

const OUT = "/workspace/plasma-table/briefs/r11-shots";
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  ["1536x750", "d1536"],
  ["1366x768", "d1366"],
  ["1920x1080", "desktop1920"],
];

const scrollCheck = () => {
  const step = document.querySelector('[data-step="3"]');
  const inner = [];
  const walk = (el) => {
    if (!el || el.nodeType !== 1) return;
    const st = getComputedStyle(el);
    if (/(auto|scroll)/.test(st.overflow + st.overflowY + st.overflowX) && el.scrollHeight > el.clientHeight + 2) {
      inner.push({ id: el.id || el.className, sh: el.scrollHeight, ch: el.clientHeight, overflow: st.overflowY || st.overflow });
    }
    for (const c of el.children) walk(c);
  };
  if (step) walk(step);
  return {
    inner,
    page: document.documentElement.scrollHeight <= innerHeight,
    pageH: document.documentElement.scrollHeight,
    viewH: innerHeight,
  };
};

const vis = (sel) => {
  const e = document.querySelector(sel);
  if (!e) return false;
  const r = e.getBoundingClientRect(), st = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && st.display !== "none" && st.visibility !== "hidden";
};

async function goSetup(page, { connect = false } = {}) {
  await page.evaluate(() => {
    const T = window.plasmaTest;
    T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(3);
  });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  if (connect) {
    await ev(page, () => document.getElementById("btnDemo").click());
    await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
  }
  await sleep(400);
}

for (const [name, prof] of SIZES) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });

  // not connected
  await goSetup(page, { connect: false });
  const off = await ev(page, () => {
    const corner = [];
    const re = /Sheet corner not set/i;
    for (const sel of ["#cutBarStart", "#zeroState", "#checkZero", "#zeroWarn", "#startWhy", "#beforeCut"]) {
      const e = document.querySelector(sel);
      if (!e) continue;
      const st = getComputedStyle(e);
      const shown = st.display !== "none" && st.visibility !== "hidden" && e.getClientRects().length && !e.hidden;
      if (shown && re.test(e.textContent || "")) corner.push(sel);
    }
    const w = document.getElementById("sheetW")?.closest("label");
    const h = document.getElementById("sheetH")?.closest("label");
    const wr = w && w.getBoundingClientRect(), hr = h && h.getBoundingClientRect();
    const overlap = wr && hr && wr.right > hr.left + 2 && wr.left < hr.right - 2 && wr.bottom > hr.top + 2 && wr.top < hr.bottom - 2;
    return { scroll: (function(){ const step = document.querySelector('[data-step="3"]'); const inner=[]; const walk=(el)=>{ if(!el||el.nodeType!==1)return; const st=getComputedStyle(el); if(/(auto|scroll)/.test(st.overflow+st.overflowY+st.overflowX)&&el.scrollHeight>el.clientHeight+2) inner.push({id:el.id||String(el.className).slice(0,40),sh:el.scrollHeight,ch:el.clientHeight}); for(const c of el.children) walk(c); }; if(step) walk(step); return {inner,page:document.documentElement.scrollHeight<=innerHeight,pageH:document.documentElement.scrollHeight,viewH:innerHeight}; })(),
      connect: document.getElementById("btnConnect") && document.getElementById("btnConnect").getClientRects().length > 0,
      jogHidden: !document.querySelector(".jogmount") || !document.querySelector(".jogmount").getClientRects().length,
      overlap, corner,
      widthLabel: (w && w.childNodes[0] && w.childNodes[0].textContent || "").trim() };
  });
  t.check(`${name} not connected: no page scroll`, off.scroll.page, JSON.stringify(off.scroll));
  t.check(`${name} not connected: no inner scroll boxes`, off.scroll.inner.length === 0, JSON.stringify(off.scroll.inner));
  t.check(`${name} not connected: Connect is shown instead of the jog pad`, off.connect && off.jogHidden, JSON.stringify(off));
  t.check(`${name}: Sheet width and Height labels do not overlap`, !off.overlap && /Sheet width/.test(off.widthLabel), JSON.stringify(off));
  if (name === "1536x750") {
    const pth = path.join(OUT, "setup-1536x750-not-connected.png");
    await page.screenshot({ path: pth, fullPage: false });
    t.check("wrote not-connected screenshot", fs.existsSync(pth), pth);
  }

  // practice connected (and other states: after home, after corner, warnings)
  await ev(page, () => document.getElementById("btnDemo").click());
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
  await sleep(500);
  const on = await ev(page, () => {
    const shown = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return false;
      const r = e.getBoundingClientRect(), st = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && r.top >= -1 && r.bottom <= innerHeight + 1 && st.display !== "none" && st.visibility !== "hidden";
    };
    const step = document.querySelector('[data-step="3"]');
    const inner = [];
    const walk = (el) => {
      if (!el || el.nodeType !== 1) return;
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflow + st.overflowY + st.overflowX) && el.scrollHeight > el.clientHeight + 2) {
        inner.push({ id: el.id || String(el.className).slice(0, 40), sh: el.scrollHeight, ch: el.clientHeight });
      }
      for (const c of el.children) walk(c);
    };
    if (step) walk(step);
    const visibleCorner = [];
    const re = /Sheet corner not set/i;
    for (const sel of ["#cutBarStart", "#zeroState", "#checkZero", "#zeroWarn", "#startWhy", "#beforeCut", "#preview"]) {
      const e = document.querySelector(sel);
      if (!e) continue;
      const st = getComputedStyle(e);
      const vis = st.display !== "none" && st.visibility !== "hidden" && e.getClientRects().length && !e.hidden;
      if (vis && re.test(e.textContent || "")) visibleCorner.push(sel);
    }
    return {
      jog: shown(".jogmount") || shown(".jogwrap .jog"),
      pos: shown(".jogwrap .small-pos") || shown(".jogwrap .pos"),
      home: shown(".do-home"),
      zero: shown("#btnZero"),
      inner,
      page: document.documentElement.scrollHeight <= innerHeight,
      pageH: document.documentElement.scrollHeight, viewH: innerHeight,
      visibleCorner,
      beforeCut: (document.getElementById("beforeCut") || {}).textContent || "",
    };
  });
  t.check(`${name} connected: no page scroll`, on.page, JSON.stringify({ pageH: on.pageH, viewH: on.viewH }));
  t.check(`${name} connected: no inner scroll boxes`, on.inner.length === 0, JSON.stringify(on.inner));
  t.check(`${name} connected: jog pad, readout, Home and Start here are visible`, on.jog && on.pos && on.home && on.zero, JSON.stringify(on));
  t.check(`${name}: the old "Sheet corner not set" copies are gone; the checklist has one corner row`, on.visibleCorner.length === 0 && /back-left corner and press Start here/i.test(on.beforeCut) && (on.beforeCut.match(/Start here/g) || []).length === 1, JSON.stringify(on.visibleCorner) + " " + on.beforeCut.slice(0, 200));

  if (name === "1536x750") {
    const pth = path.join(OUT, "setup-1536x750-practice-connected.png");
    await page.screenshot({ path: pth, fullPage: false });
    t.check("wrote practice-connected screenshot", fs.existsSync(pth), pth);
  }

  await ensurePracticeHomed(page).catch(() => false);
  await sleep(300);
  const afterHome = await ev(page, () => {
    const step = document.querySelector('[data-step="3"]');
    const inner = [];
    const walk = (el) => {
      if (!el || el.nodeType !== 1) return;
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflow + st.overflowY + st.overflowX) && el.scrollHeight > el.clientHeight + 2) {
        inner.push({ id: el.id || String(el.className).slice(0, 40), sh: el.scrollHeight, ch: el.clientHeight });
      }
      for (const c of el.children) walk(c);
    };
    if (step) walk(step);
    return { inner, page: document.documentElement.scrollHeight <= innerHeight };
  });
  t.check(`${name} after home: no scroll`, afterHome.page && afterHome.inner.length === 0, JSON.stringify(afterHome));

  await ev(page, () => document.getElementById("btnZero").click());
  await sleep(300);
  const afterZero = await ev(page, () => {
    const step = document.querySelector('[data-step="3"]');
    const inner = [];
    const walk = (el) => {
      if (!el || el.nodeType !== 1) return;
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflow + st.overflowY + st.overflowX) && el.scrollHeight > el.clientHeight + 2) {
        inner.push({ id: el.id || String(el.className).slice(0, 40), sh: el.scrollHeight, ch: el.clientHeight });
      }
      for (const c of el.children) walk(c);
    };
    if (step) walk(step);
    return { inner, page: document.documentElement.scrollHeight <= innerHeight, text: (document.getElementById("beforeCut") || {}).textContent || "" };
  });
  t.check(`${name} after Start here: no scroll`, afterZero.page && afterZero.inner.length === 0, JSON.stringify(afterZero));

  await page.ctx.close();
}

// practice end-to-end at 1536×750
{
  const page = await newPage(br, "d1536", { base: srv.base, consoleErrors: false });
  await demoToShape(page, { stay: "cut" });
  await ev(page, () => window.plasmaTest.goStep(3));
  await sleep(300);
  const homed = await ensurePracticeHomed(page).catch(() => false);
  t.check("e2e: practice table is homed", !!homed);
  await ev(page, () => {
    const b = document.querySelector('.jogwrap .j[data-axis="X"][data-dir="1"]') || document.querySelector(".jog .j");
    if (b) b.click();
  });
  await waitIdle(page, 15000);
  await ev(page, () => document.getElementById("btnZero").click());
  await page.waitForFunction(() => window.plasmaTest.S.zeroSet, null, { timeout: 8000 }).catch(() => {});
  await ev(page, () => document.getElementById("btnTrace").click());
  await page.waitForFunction(() => { const st = window.plasmaTest.getM().state(); return st === "Run" || st === "Jog"; }, null, { timeout: 8000 }).catch(() => {});
  await waitIdle(page, 60000);
  // A long Trace can raise a soft-limit alarm on the practice table and clear the
  // sheet corner; set it again if needed so Start cutting can proceed.
  await ev(page, () => {
    const T = window.plasmaTest, M = T.getM && T.getM();
    if (T.S.status && /alarm/i.test(T.S.status.state || "")) {
      try { M.command({ cmd: "unlock" }); } catch (e) { /* ignore */ }
    }
  });
  await sleep(400);
  if (!await ev(page, () => !!(window.plasmaTest.S.safety && window.plasmaTest.S.safety.referenced))) {
    await ensurePracticeHomed(page).catch(() => false);
  }
  if (!await ev(page, () => !!window.plasmaTest.S.zeroSet)) {
    await ev(page, () => document.getElementById("btnZero").click());
    await page.waitForFunction(() => window.plasmaTest.S.zeroSet, null, { timeout: 8000 }).catch(() => {});
  }
  const ready = await ev(page, () => ({
    off: document.getElementById("btnStart").disabled,
    state: window.plasmaTest.getM().state(),
    blockers: (document.getElementById("blockers") || {}).textContent || "",
    zero: !!window.plasmaTest.S.zeroSet,
  }));
  t.check("e2e: Start is enabled after home, Start here and Trace", !ready.off && ready.state === "Idle", JSON.stringify(ready));
  if (!ready.off) await ev(page, () => document.getElementById("btnStart").click());
  const started = await page.waitForFunction(() => window.plasmaTest.S.cur === 4 && window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 20000 }).then(() => true).catch(() => false);
  t.check("e2e: Start cutting runs the reminder and the cut starts", started, (page.dialogs || []).slice(-5).join(" | "));
  const done = await page.waitForFunction(() => {
    const j = window.plasmaTest.S.job;
    return j && !j.running && !j.paused;
  }, null, { timeout: 120000 }).then(() => true).catch(() => false);
  const end = await ev(page, () => ({ cur: window.plasmaTest.S.cur, job: window.plasmaTest.S.job && { running: window.plasmaTest.S.job.running, paused: window.plasmaTest.S.job.paused, done: window.plasmaTest.S.job.done } }));
  t.check("e2e: practice cut completes", done || (end.job && !end.job.running && !end.job.paused), JSON.stringify(end));
  await page.ctx.close();
}

await br.close();
await srv.close();
t.done();

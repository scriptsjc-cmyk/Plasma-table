// r8 cut-screen items: one connect control, yellow STOP zone, checks on Part, cut-status box,
// Machine setup in the Menu, Show machine on Bed & start, 60 A chart, slim upload, 1366 thickness/Next.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape, shot } from "../lib/browser.mjs";

const t = new T("76_r8_cut");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vis = (el) => !!(el && el.getClientRects && el.getClientRects().length && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden");

async function cutPage(prof) {
  const page = await newPage(br, prof, { base: srv.base });
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(1); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 1, null, { timeout: 10000 });
  return page;
}

for (const prof of ["d1440", "d1366"]) {
  const n = (s) => `${prof}: ${s}`;
  const page = await cutPage(prof);

  const one = await ev(page, () => {
    const st = (id) => {
      const e = document.getElementById(id);
      if (!e) return { id, exists: false, show: false };
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      const show = cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 && !e.hidden;
      return { id, exists: true, show, text: (e.textContent || "").trim(), w: Math.round(b.width), h: Math.round(b.height) };
    };
    return {
      pill: st("connPill"),
      bar: st("cutBarStart"),
      usb: st("btnConnect"),
      demo: st("btnDemo"),
      status: st("cutStatus"),
      stop: st("btnStop"),
    };
  });
  t.check(n("r9 item 4: the header connection pill is visible on Cut"), one.pill.exists && one.pill.show && /connected/i.test(one.pill.text), JSON.stringify(one.pill));
  t.check(n("item 1/4: the cut-bar slot is not a Not-connected pill when disconnected"), !one.bar.show || !/not connected/i.test(one.bar.text), JSON.stringify(one.bar));
  t.check(n("item 1: Connect is the clear place to connect (on Bed, or at least in the document)"), one.usb.exists, JSON.stringify(one.usb));
  t.check(n("item 4: a cut-status box sits next to Cut"), one.status.exists && one.status.show, JSON.stringify(one.status));
  t.check(n("STOP is visible and large"), one.stop.show && one.stop.w >= 44 && one.stop.h >= 44, JSON.stringify(one.stop));

  const zone = await ev(page, () => {
    const s = document.getElementById("btnStop");
    const cs = getComputedStyle(s);
    const box = s.getBoundingClientRect();
    return { shadow: cs.boxShadow, w: Math.round(box.width), h: Math.round(box.height), top: Math.round(box.top) };
  });
  t.check(n("item 2: STOP has its own yellow zone (box-shadow) and is not shrunk"), /rgb\(.*\)/.test(zone.shadow) && zone.shadow !== "none" && zone.w >= 44, JSON.stringify(zone));

  const part = await ev(page, () => {
    const chk2 = document.getElementById("cutCheck2");
    const chk3 = document.getElementById("cutCheck3");
    const showMach = document.getElementById("showMachWrap");
    const amps = document.getElementById("ampsCard");
    const setupTab = document.querySelector('#cutView .tab[data-tab="setup"], .tabs [data-tab="setup"]');
    const drop = document.getElementById("drop");
    const next = document.querySelector("#stepper .next, #btnNext, [data-act='next']") || document.getElementById("stepNext");
    const th = document.getElementById("thicknesses");
    const vis = (e) => {
      if (!e) return false;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return cs.display !== "none" && !e.hidden && b.width > 0 && b.height > 0;
    };
    const thBtns = th ? [...th.querySelectorAll("button")].map((b) => b.getBoundingClientRect()) : [];
    const nextBox = next ? next.getBoundingClientRect() : null;
    const covered = nextBox && thBtns.some((b) => b.width > 0 && b.bottom > nextBox.top + 2 && b.top < nextBox.bottom - 2 && b.right > nextBox.left + 2 && b.left < nextBox.right - 2);
    return {
      chk2: chk2 && (chk2.textContent || "").slice(0, 180),
      chk3: chk3 && (chk3.textContent || "").trim(),
      showMachOnPart: vis(showMach),
      amps: amps && (amps.textContent || ""),
      setupTab: !!setupTab,
      dropSlim: drop && drop.classList.contains("drop-slim"),
      dropH: drop && Math.round(drop.getBoundingClientRect().height),
      thCount: thBtns.length,
      covered,
      nextLabel: next && (next.textContent || "").trim(),
    };
  });
  t.check(n("item 3: the cut check is on step 1 (Part)"), /cut check|looks cuttable|too small/i.test(part.chk2 || ""), part.chk2);
  t.check(n("r9 item 5: Bed & start has no cut-check panel"), !part.chk3, part.chk3);
  t.check(n("item 5: Machine setup is not a Cut-row tab"), !part.setupTab);
  t.check(n("item 6: Show machine is not on step 1"), !part.showMachOnPart);
  t.check(n("item 7: the amps card shows 60 A settings and a source"), /A/.test(part.amps) && /mm\/min/.test(part.amps) && /kerf/i.test(part.amps) && /PrimeWeld|CUT60|P-80|source|starting points/i.test(part.amps), (part.amps || "").slice(0, 400));
  t.check(n("item 11: Upload a file starts as a slim bar"), part.dropSlim && part.dropH < 120, JSON.stringify({ h: part.dropH, slim: part.dropSlim }));
  t.check(n("1366/1440: sticky Next does not cover a thickness button"), !part.covered, JSON.stringify({ thCount: part.thCount, covered: part.covered, next: part.nextLabel }));

  // open the slim upload
  await ev(page, () => { const d = document.getElementById("drop"); d.click(); });
  await sleep(200);
  const open = await ev(page, () => {
    const d = document.getElementById("drop");
    const b = d.getBoundingClientRect();
    return { open: d.classList.contains("drop-open"), h: Math.round(b.height) };
  });
  t.check(n("item 11: clicking the slim bar opens a bigger drop zone"), open.open && open.h >= 140, JSON.stringify(open));
  await ev(page, () => { const d = document.getElementById("drop"); d.classList.remove("drop-open"); d.classList.add("drop-slim"); });

  // Menu holds Machine setup
  await ev(page, () => window.plasmaTest.showScreen("menu"));
  await sleep(200);
  const menu = await ev(page, () => {
    const b = document.getElementById("menuSetup");
    return b ? { text: b.textContent.trim(), show: !b.hidden && getComputedStyle(b).display !== "none" } : { missing: true };
  });
  t.check(n("item 5: Machine setup is in the main Menu"), menu.show && /machine setup/i.test(menu.text), JSON.stringify(menu));

  // Show machine on Bed & start
  await ev(page, () => { window.plasmaTest.showScreen("cut"); window.plasmaTest.goStep(3); });
  await sleep(300);
  const bed = await ev(page, () => {
    const showMach = document.getElementById("showMachWrap");
    const status = document.getElementById("cutStatus");
    const usb = document.getElementById("btnConnect");
    const vis = (e) => {
      if (!e) return false;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return cs.display !== "none" && !e.hidden && b.width > 0 && b.height > 0;
    };
    const stop = document.getElementById("btnStop").getBoundingClientRect();
    const st = status.getBoundingClientRect();
    const overlap = !(stop.right <= st.left + 1 || stop.left >= st.right - 1 || stop.bottom <= st.top + 1 || stop.top >= st.bottom - 1);
    return {
      showMach: vis(showMach),
      usb: vis(usb),
      status: vis(status) && (status.textContent || "").trim(),
      bad: status && status.classList.contains("is-bad"),
      overlap,
      stopW: Math.round(stop.width),
    };
  });
  t.check(n("item 6: Show machine is on Bed & start"), bed.showMach);
  t.check(n("item 1: Connect is visible on Bed & start"), bed.usb);
  t.check(n("item 4: status is yellow/bad when something is wrong (not connected)"), bed.bad, JSON.stringify(bed));
  t.check(n("item 4: status never covers STOP"), !bed.overlap && bed.stopW >= 44, JSON.stringify(bed));

  await ev(page, () => { document.getElementById("cutStatus").focus(); });
  await sleep(200);
  const pop = await ev(page, () => {
    const p = document.getElementById("cutStatusPop");
    const t = (p && (p.textContent || "")) || "";
    return { show: p && !p.hidden && getComputedStyle(p).display !== "none", text: t.slice(0, 400) };
  });
  t.check(n("item 4: focusing the status box lists what's wrong"), pop.show && /not connected|connect|home|edge|start/i.test(pop.text), JSON.stringify(pop));

  await shot(page, `76-r8-cut-bed-${prof}`);
  await ev(page, () => window.plasmaTest.goStep(1));
  await sleep(200);
  await shot(page, `76-r8-cut-part-${prof}`);

  const errs = (page.errors || []).filter((e) => !/404|favicon/i.test(e));
  t.check(n("no page errors"), errs.length === 0, errs.join(" | "));
  await page.context().close();
}

await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

// r9 items 2–8: Machine setup has no Cut-tab row; the Cut header is two rows with
// E-STOP spanning both; a live Connected pill stays visible; Setup has no
// cut-check panel (warnings live in the white Check-the-cut box); no black or
// native tooltip on that box; Show machine is a small top-left canvas overlay;
// Cut step 1 previews only the part.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, shot } from "../lib/browser.mjs";

const t = new T("92_r9_chrome");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openCut(prof) {
  const page = await newPage(br, prof, { base: srv.base });
  await ev(page, () => {
    const T = window.plasmaTest;
    T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("flange");
    const it = T.sketch.items[0]; it.p.hole = 3; it.p.pcd = 40; it.p.id = 10; T.sketch.commit();
    T.S.thickness = 10;
    T.sendToCutting(); T.goStep(1);
  });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 1, null, { timeout: 10000 });
  return page;
}

for (const prof of ["d1440", "d1366"]) {
  const n = (s) => `${prof}: ${s}`;
  const page = await openCut(prof);

  const header = await ev(page, () => {
    const box = (id) => {
      const e = document.getElementById(id);
      if (!e) return null;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      const show = cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 && !e.hidden;
      return { show, l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, text: (e.textContent || "").replace(/\s+/g, " ").trim() };
    };
    const tabs = document.querySelector("header.topbar nav.tabs");
    const tb = tabs && tabs.getBoundingClientRect();
    const tcs = tabs && getComputedStyle(tabs);
    const tabsShow = !!(tabs && tcs.display !== "none" && tb.width > 0 && tb.height > 0);
    const stop = box("btnStop"), main = document.querySelector(".topbar-main").getBoundingClientRect(), conn = box("connPill");
    const overlap = stop && tabsShow && !(stop.r <= tb.left + 1 || stop.l >= tb.right - 1 || stop.b <= tb.top + 1 || stop.t >= tb.bottom - 1);
    return {
      tab: document.body.dataset.tab,
      tabsInHeader: !!(tabs && tabs.closest("header.topbar")),
      tabsShow,
      tabsT: tabsShow ? Math.round(tb.top) : 0,
      tabsB: tabsShow ? Math.round(tb.bottom) : 0,
      tabsR: tabsShow ? Math.round(tb.right) : 0,
      mainT: Math.round(main.top),
      mainB: Math.round(main.bottom),
      stop,
      conn,
      overlap,
      title: document.getElementById("cutStatus").getAttribute("title"),
    };
  });
  t.check(n("item 3: the Cut / Check the cut row lives in the header"), header.tabsInHeader && header.tabsShow && header.tab === "cut", JSON.stringify(header));
  t.check(n("item 3: E-STOP is visible and at least as big as before"), header.stop && header.stop.show && header.stop.w >= 112 && header.stop.h >= 104, JSON.stringify(header.stop));
  t.check(n("item 3: E-STOP spans both header rows (top with the account bar, bottom with the step bar)"), header.stop && header.tabsShow && header.stop.t <= header.mainT + 4 && header.stop.b >= header.tabsB - 4, JSON.stringify(header));
  t.check(n("item 3: the step bar does not run under E-STOP"), !header.overlap && header.tabsR <= Math.round(header.stop.l) + 1, JSON.stringify(header));
  t.check(n("item 4: Connected / Not connected is visible on Cut"), header.conn && header.conn.show && /not connected|connected/i.test(header.conn.text), JSON.stringify(header.conn));
  t.check(n("item 6: Check the cut has no native title tooltip"), header.title == null || header.title === "", header.title);

  const part = await ev(page, () => {
    const cv = document.getElementById("preview");
    const sm = document.getElementById("showMachWrap");
    const vis = (e) => {
      if (!e) return false;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return cs.display !== "none" && cs.visibility !== "hidden" && !e.hidden && b.width > 0 && b.height > 0;
    };
    return { zmap: !!cv._zmap, mmap: !!cv._map, showMach: vis(sm), prepared: !!window.plasmaTest.S.prepared };
  });
  t.check(n("item 8: on Part the canvas is a fitted part preview, not the machine view"), part.prepared && part.zmap && !part.mmap, JSON.stringify(part));
  t.check(n("item 7: Show machine is not on Part"), !part.showMach, JSON.stringify(part));

  await ev(page, () => { document.getElementById("cutStatus").dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); document.getElementById("cutStatus").focus(); });
  await sleep(250);
  const hover = await ev(page, () => {
    const pop = document.getElementById("cutStatusPop");
    const tip = document.getElementById("hoverTip");
    const pcs = pop && getComputedStyle(pop);
    const bg = pcs ? pcs.backgroundColor : "";
    const tipOn = !!(tip && !tip.hidden && getComputedStyle(tip).display !== "none" && tip.getClientRects().length);
    const show = pop && !pop.hidden && pcs.display !== "none";
    return { show, text: (pop && pop.textContent || "").replace(/\s+/g, " ").trim(), bg, tipOn, title: document.getElementById("cutStatus").getAttribute("title") };
  });
  t.check(n("item 6: hovering Check the cut shows the white what's-left box"), hover.show && hover.bg && !/^rgb\(0,\s*0,\s*0\)$/.test(hover.bg) && !/^rgba\(0,\s*0,\s*0/.test(hover.bg), JSON.stringify(hover));
  t.check(n("item 6: the black hover tip is not shown"), !hover.tipOn, JSON.stringify(hover));
  t.check(n("item 5: the hover box lists the small-hole warning"), /small|hole|thickness|sheet/i.test(hover.text), hover.text.slice(0, 240));

  await ev(page, () => window.plasmaTest.goStep(3));
  await sleep(300);
  const bed = await ev(page, () => {
    const pane = document.querySelector(".previewPane").getBoundingClientRect();
    const sm = document.getElementById("showMachWrap");
    const b = sm && sm.getBoundingClientRect();
    const cs = sm && getComputedStyle(sm);
    const show = !!(sm && cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0);
    const cv = document.getElementById("preview");
    return {
      cutCheck3: !!document.getElementById("cutCheck3"),
      showMach: show,
      left: show ? Math.round(b.left - pane.left) : null,
      top: show ? Math.round(b.top - pane.top) : null,
      w: show ? Math.round(b.width) : null,
      h: show ? Math.round(b.height) : null,
      font: show ? cs.fontSize : null,
      mmap: !!cv._map,
      zmap: !!cv._zmap,
      step: Number(window.plasmaTest.S.cur),
      layout: !!(window.plasmaTest.Setup && window.plasmaTest.Setup.layoutActive && window.plasmaTest.Setup.layoutActive()),
    };
  });
  t.check(n("item 5: Setup has no cut-check panel"), !bed.cutCheck3, JSON.stringify(bed));
  t.check(n("item 7: Show machine is a small overlay in the canvas top-left"), bed.showMach && bed.left <= 16 && bed.top <= 16 && bed.h <= 40 && bed.w <= 200, JSON.stringify(bed));
  t.check(n("item 8: Setup is the bed step, not the part-only preview"), bed.step === 3 && (bed.mmap || bed.layout), JSON.stringify(bed));

  // Live connection: Practice on Setup flips the header pill (never press USB Connect).
  const before = await ev(page, () => (document.getElementById("connPill").textContent || "").replace(/\s+/g, " ").trim());
  await ev(page, () => { const b = document.getElementById("btnDemo"); if (b) b.click(); });
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 8000 }).catch(() => {});
  const afterBed = await ev(page, () => (document.getElementById("connPill").textContent || "").replace(/\s+/g, " ").trim());
  t.check(n("item 4: the pill updates live when the connection changes"), /Practice|Connected|FluidNC/i.test(afterBed) && !/not connected/i.test(afterBed), JSON.stringify({ before, afterBed }));

  await ev(page, () => window.plasmaTest.showScreen("menu"));
  await ev(page, () => { document.getElementById("menuSetup").click(); });
  await sleep(300);
  const setup = await ev(page, () => {
    const tabs = document.querySelector("header.topbar nav.tabs");
    const tcs = tabs && getComputedStyle(tabs);
    const tb = tabs && tabs.getBoundingClientRect();
    const tabsShow = !!(tabs && tcs.display !== "none" && tcs.visibility !== "hidden" && !tabs.hidden && tb.width > 0 && tb.height > 0);
    const conn = document.getElementById("connPill");
    const cb = conn.getBoundingClientRect(), ccs = getComputedStyle(conn);
    const connShow = ccs.display !== "none" && ccs.visibility !== "hidden" && cb.width > 0 && cb.height > 0;
    const stop = document.getElementById("btnStop").getBoundingClientRect();
    const setupView = document.getElementById("setupView");
    return {
      tab: document.body.dataset.tab,
      setupShown: setupView && !setupView.classList.contains("hidden"),
      tabsShow,
      connShow,
      connText: (conn.textContent || "").replace(/\s+/g, " ").trim(),
      stopOn: stop.width >= 44 && stop.height >= 44 && stop.right <= innerWidth + 1,
    };
  });
  t.check(n("item 2: Machine setup has no Cut / Check the cut row"), setup.setupShown && setup.tab === "setup" && !setup.tabsShow, JSON.stringify(setup));
  t.check(n("item 4: Connected / Not connected is visible on Machine setup"), setup.connShow && /Practice|Connected|FluidNC|Not connected/i.test(setup.connText), JSON.stringify(setup));
  t.check(n("E-STOP stays visible on Machine setup"), setup.stopOn, JSON.stringify(setup));


  const errs = (page.errors || []).filter((e) => !/404|favicon/i.test(e));
  t.check(n("no page errors"), errs.length === 0, errs.join(" | "));
  await page.context().close();
}

await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

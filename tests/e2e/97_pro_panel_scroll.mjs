// Pro-mode Make a part (laptop): lower size fields stay reachable, including when the folded 3D view is the taller laptop size.
// Since r12 3.3 (approved) the panel never scrolls: it is tabbed so each tab fits; this checks nothing on any tab is cut off.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("97_pro_panel_scroll");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openProFold(page, id = "cone") {
  await ev(page, (id) => {
    const T = window.plasmaTest;
    T.showScreen("make");
    T.setAppMode("advanced", { autoFs: false, persist: false });
    T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.add(id, true);
    const it = T.sketch.items[0];
    if (it && it.p) { it.p.fl1 = 1; it.p.fl2 = 1; }
    T.sketch.pick([it.id]); T.sketch.fitView();
    if (T.renderShapeForm) T.renderShapeForm();
    else if (T.refresh) T.refresh();
  }, id);
  await page.waitForFunction(() => window.plasmaTest.screen() === "make" && document.body.classList.contains("pro-mode"), null, { timeout: 8000 });
  await sleep(250);
}

function panelState(page) {
  return ev(page, () => {
    const src = document.getElementById("srcShape");
    const pane = document.querySelector(".stepPane");
    const form = document.getElementById("shapeForm");
    const cs = (el) => el && getComputedStyle(el);
    const srcCs = cs(src), paneCs = cs(pane);
    const srcOy = srcCs && srcCs.overflowY;
    const paneOy = paneCs && paneCs.overflowY;
    const srcScrolls = !!(src && src.scrollHeight > src.clientHeight + 4 && /(auto|scroll)/.test(srcOy));
    const paneScrolls = !!(pane && pane.scrollHeight > pane.clientHeight + 4 && /(auto|scroll)/.test(paneOy));
    const scroller = srcScrolls ? src : (paneScrolls ? pane : (src || pane));
    const inputs = form ? [...form.querySelectorAll("input, select, textarea")] : [];
    const last = src && (document.getElementById("sheetSizeBox") || document.getElementById("cutSummary") || src.querySelector("details.guide") || (inputs.length ? inputs[inputs.length - 1] : null));
    const scRect = scroller && scroller.getBoundingClientRect();
    const lastRect = last && last.getBoundingClientRect();
    const atBottom = !!(scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 3);
    const lastReached = !!(scRect && lastRect && lastRect.top < scRect.bottom - 8);
    const lastVisible = atBottom && lastReached;
    const cv = document.querySelector("#fold3dHost canvas.fold3d");
    const cvH = cv ? Math.round(cv.getBoundingClientRect().height) : 0;
    return {
      pro: document.body.classList.contains("pro-mode"),
      laptop: document.body.classList.contains("laptop-ui"),
      srcOy, paneOy,
      srcH: src && src.clientHeight, srcSH: src && src.scrollHeight, srcTop: src && src.scrollTop,
      paneH: pane && pane.clientHeight, paneSH: pane && pane.scrollHeight,
      srcScrolls, paneScrolls, canScroll: srcScrolls || paneScrolls,
      lastVisible, lastTag: last && (last.id || last.getAttribute("data-p") || last.tagName),
      cvH, inputs: inputs.length,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
}

for (const prof of ["d1366", "desktop1920"]) {
  const n = (s) => `${prof}: ${s}`;
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  await openProFold(page, "cone");
  let st = await panelState(page);
  t.check(n("Pro mode on a laptop Make a part screen"), st.pro && st.laptop, JSON.stringify(st));
  t.check(n("3D view is the taller laptop size"), st.cvH >= 260, JSON.stringify({ cvH: st.cvH }));
  // r12 3.3 (approved): "Panels never scroll and never clip" - the laptop inspector is tabbed (Part / Size / Holes / Arrange) so
  // each tab fits. The old checks (the panel scrolls, the wheel scrolls it) are replaced by what they protected: every field on
  // every tab, including the lowest size fields of a flanged cone, is inside the panel and above Cut this part.
  const tabs = [];
  for (const tab of ["part", "size", "holes", "arrange"]) {
    tabs.push(await ev(page, (tab) => {
      const b = document.querySelector(`#srcShape .insp-tabs [data-insp="${tab}"]`); if (b) b.click();
      const src = document.getElementById("srcShape"), sr = src.getBoundingClientRect();
      const nav = document.querySelector('.step[data-step="1"] .nav'), nr = nav && nav.getClientRects().length ? nav.getBoundingClientRect() : null;
      const bottom = Math.min(sr.bottom, innerHeight, nr ? nr.top : 1e9);
      const ctl = [...src.querySelectorAll("input, select, textarea, button")].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && !e.closest(".insp-tabs"));
      const clipped = ctl.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > bottom + 1 || r.top < sr.top - 1 || r.right > sr.right + 1; }).map((e) => e.id || e.dataset.p || e.name || e.textContent.trim().slice(0, 16) || e.tagName);
      return { tab, tabFound: !!b, n: ctl.length, clipped };
    }, tab));
    await sleep(150);
  }
  t.check(n("every inspector tab fits: no field is cut off below the panel or under Cut this part"), tabs.every((x) => x.tabFound && x.clipped.length === 0), JSON.stringify(tabs));
  const size = tabs.find((x) => x.tab === "size");
  t.check(n("the cone's size fields (with both flanges) are all on the Size tab and on screen"), !!(size && size.n >= 8 && size.clipped.length === 0), JSON.stringify(size));
  { const bx = await page.locator("#srcShape").boundingBox(); if (bx) await page.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.6); }
  await page.mouse.wheel(0, 600); await sleep(150);
  const st2 = await panelState(page);
  t.check(n("the panel never scrolls away from its fields (no hidden scroll offset)"), !st2.srcTop && !st2.canScroll, JSON.stringify({ srcTop: st2.srcTop, canScroll: st2.canScroll }));

  await page.ctx.close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

// Pro-mode Make a part (laptop): the left part-info panel must wheel-scroll
// and expose a scrollbar so lower size fields stay reachable, including when
// the folded 3D view is the taller laptop size.
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
  t.check(n("the part-info panel can scroll (overflow auto and content taller than the pane)"), st.canScroll, JSON.stringify(st));

  const before = st.srcTop || 0;
  const box = await page.locator("#srcShape").boundingBox();
  if (box) {
    // Wheel over the lower half of the panel (fields, not only the 3D canvas).
    await page.mouse.move(box.x + box.width * 0.5, box.y + Math.min(box.height - 24, Math.max(40, box.height * 0.75)));
    await page.mouse.wheel(0, 600);
    await sleep(150);
  }
  let afterWheel = await panelState(page);
  t.check(n("mouse wheel scrolls the part-info panel down"), (afterWheel.srcTop || 0) > before + 20, JSON.stringify({ before, after: afterWheel.srcTop }));

  await ev(page, () => {
    const src = document.getElementById("srcShape");
    if (src) src.scrollTop = src.scrollHeight;
  });
  await sleep(100);
  const bottom = await panelState(page);
  t.check(n("scrolling to the bottom brings the lower fields into view"), bottom.lastVisible && bottom.srcTop > 0, JSON.stringify(bottom));

  await page.ctx.close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

// Folded 3D view on Make a part: visible on laptop and phone, no overlap, updates with size,
// and the main drawing stays the flat pattern.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("96_fold3d");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `
  window.__box = (sel) => { const e = typeof sel === "string" ? document.querySelector(sel) : sel; if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  window.__overlap = (a, b) => { const A = __box(a), B = __box(b); return !!(A && B) && A.l < B.r - 1 && B.l < A.r - 1 && A.t < B.b - 1 && B.t < A.b - 1; };
`;

async function openFold(page, id = "foldlbr") {
  await ev(page, (id) => {
    const T = window.plasmaTest;
    T.showScreen("make"); T.setShapeFs(false);
    T.sketch.clear(); T.sketch.add(id, true);
    T.sketch.pick([T.sketch.items[0].id]); T.sketch.fitView();
    if (T.renderShapeForm) T.renderShapeForm();
    else if (T.refresh) T.refresh();
  }, id);
  await page.waitForFunction(() => window.plasmaTest.screen() === "make", null, { timeout: 8000 });
  await ev(page, (id) => {
    const sk = window.plasmaTest.sketch;
    if (!sk.items.length) sk.add(id, true);
    sk.pick([sk.items[0].id]);
    if (window.plasmaTest.renderShapeForm) window.plasmaTest.renderShapeForm();
    else if (window.plasmaTest.refresh) window.plasmaTest.refresh();
  }, id);
  await sleep(200);
}

function overlapCheck(page) {
  return ev(page, () => {
    const host = [...document.querySelectorAll("#fold3dDock, #fold3dHost")].find((e) => e && !e.hidden && e.querySelector("canvas.fold3d")) || document.getElementById("fold3dDock") || document.getElementById("fold3dHost");
    const cv = host && host.querySelector("canvas.fold3d");
    const box = cv && __box(cv);
    const vis = !!(box && box.w > 40 && box.h > 40 && host && getComputedStyle(host).display !== "none" && !host.hidden);
    const hits = [];
    for (const sel of ["#btnStop", "#makeBar", "#btnPresetParts", "#btnAdvancedTools", "#next1", "#phoneBar"]) {
      const e = document.querySelector(sel);
      if (e && __box(e) && cv && __overlap(cv, e)) hits.push(sel);
    }
    const cap = host && host.querySelector(".fold3d-cap");
    return {
      vis, hits, hidden: !!(host && host.hidden),
      cap: cap && cap.textContent,
      w: box && Math.round(box.w), h: box && Math.round(box.h),
      step: window.plasmaTest.S.cur, screen: window.plasmaTest.screen(),
      fold: window.plasmaTest.isFoldPart && window.plasmaTest.isFoldPart(window.plasmaTest.sketch && window.plasmaTest.sketch.items[0] && { id: window.plasmaTest.sketch.items[0].type, fold: true }),
    };
  });
}

for (const prof of ["d1366", "iphone14"]) {
  const n = (s) => `${prof}: ${s}`;
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  await ev(page, new Function(PAGE + "; return 1;"));
  await page.evaluate(PAGE);
  await openFold(page, "foldlbr");
  const a = await overlapCheck(page);
  t.check(n("folded 3D view is shown for a fold preset"), a.vis, JSON.stringify(a));
  t.check(n("3D view does not overlap the drawing, Next, or header controls"), a.hits.length === 0, JSON.stringify(a));
  t.check(n("caption explains that the drawing is the flat pattern"), !!(a.cap && /flat pattern/i.test(a.cap)), a.cap);

  // the sketch still shows the flat strip (wider than it is thick in world, not a 3D projection)
  const flat = await ev(page, () => {
    const sk = window.plasmaTest.sketch, it = sk.items[0], b = sk.boxOf(it);
    return { type: it && it.type, w: b[2] - b[0], h: b[3] - b[1] };
  });
  t.check(n("the main drawing is still the flat pattern"), flat.type === "foldlbr" && flat.w > 10 && flat.h > 10, JSON.stringify(flat));

  // live update: change a size, 3D still present
  await ev(page, () => {
    const inp = document.querySelector('#shapeForm input[data-p="a"]');
    if (!inp) return;
    inp.value = "120";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    if (window.plasmaTest.renderShapeForm) window.plasmaTest.renderShapeForm();
  });
  await sleep(250);
  const b = await overlapCheck(page);
  t.check(n("3D view stays visible after a size change"), b.vis, JSON.stringify(b));

  // preset browser shows a 3D thumb for fold parts
  const opened = await ev(page, () => {
    if (window.plasmaTest.openPresetBrowser) window.plasmaTest.openPresetBrowser();
    else { const b = document.getElementById("btnPresetParts"); if (b) b.click(); }
    return !!(document.getElementById("presetBrowser") && !document.getElementById("presetBrowser").hidden);
  });
  await sleep(200);
  const tile = await ev(page, () => {
    const btn = document.querySelector('#pbGrid [data-shape="foldlbr"], #libGrid [data-shape="foldlbr"]');
    if (!btn) return { ok: false, reason: "no tile" };
    const svg = btn.querySelector("svg");
    const paths = svg ? svg.querySelectorAll("path").length : 0;
    return { ok: !!svg, paths, cls: svg && svg.className && svg.className.baseVal, w: svg && +svg.getAttribute("width") };
  });
  t.check(n("Preset parts tile for a fold part includes a 3D thumb"), opened && tile.ok && tile.paths >= 1, JSON.stringify({ opened, tile }));
  await ev(page, () => {
    const el = document.getElementById("presetBrowser");
    if (el) { el.classList.add("hidden"); el.hidden = true; }
  });

  // a plain rectangle has no 3D fold view
  await ev(page, () => { const T = window.plasmaTest; T.sketch.clear(); T.sketch.add("rect", true); T.sketch.pick([T.sketch.items[0].id]); if (T.renderShapeForm) T.renderShapeForm(); else if (T.refresh) T.refresh(); });
  await sleep(150);
  const plain = await ev(page, () => {
    const shown = [...document.querySelectorAll("#fold3dDock, #fold3dHost")].some((e) => e && !e.hidden && e.querySelector("canvas.fold3d") && e.querySelector("canvas.fold3d").getClientRects().length);
    return { hidden: !shown, fold: window.plasmaTest.isFoldPart({ id: "rect" }) };
  });
  t.check(n("plain shapes do not show a folded 3D view"), plain.hidden && !plain.fold, JSON.stringify(plain));

  await page.ctx.close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

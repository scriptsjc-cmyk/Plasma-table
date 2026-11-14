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

function previewH(page) {
  return ev(page, () => {
    const cv = document.getElementById("preview");
    const pane = document.querySelector(".previewPane");
    return {
      canvas: cv ? Math.round(cv.getBoundingClientRect().height) : 0,
      pane: pane ? Math.round(pane.getBoundingClientRect().height) : 0,
    };
  });
}
function overlapCheck(page) {
  return ev(page, () => {
    const host = document.getElementById("fold3dHost");
    const details = host && host.querySelector("details.fold3d-box");
    const opened = !!(details && details.open);
    const cv = host && !host.hidden && host.querySelector("canvas.fold3d");
    const cvBox = (opened || !details) ? (cv && __box(cv)) : null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const fullyOnScreen = !!(cvBox && cvBox.l >= -1 && cvBox.t >= -1 && cvBox.r <= vw + 1 && cvBox.b <= vh + 1);
    const vis = !!(cvBox && cvBox.w > 40 && cvBox.h > 40 && host && getComputedStyle(host).display !== "none" && !host.hidden && fullyOnScreen);
    const hits = [];
    for (const sel of ["#btnStop", "#makeBar", "#btnPresetParts", "#btnAdvancedTools", "#next1", "#phoneBar", "#preview", ".previewPane"]) {
      const e = document.querySelector(sel);
      if (e && __box(e) && cvBox && __overlap(cv, e)) hits.push(sel);
    }
    const inForm = !!(host && host.closest("#shapeForm"));
    const cap = host && host.querySelector(".fold3d-cap");
    const thumb = host && host.querySelector(".fold3d-mini svg, .fold3d-mini canvas");
    const thumbBox = thumb && __box(thumb);
    const card = !!(host && !host.hidden && getComputedStyle(host).display !== "none" && (vis || (thumbBox && thumbBox.w > 20 && thumbBox.h > 16 && inForm)));
    const preview = document.getElementById("preview");
    return {
      vis, card, hits, hidden: !!(host && host.hidden), inForm, opened,
      fullyOnScreen,
      cap: cap && cap.textContent,
      w: cvBox && Math.round(cvBox.w), h: cvBox && Math.round(cvBox.h),
      thumb: !!(thumbBox && thumbBox.w > 20 && thumbBox.h > 16),
      previewH: preview ? Math.round(preview.getBoundingClientRect().height) : 0,
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
  // On a phone, first record the drawing height with a plain shape so we can
  // assert that picking a fold preset does not shrink the canvas.
  let plainH = null;
  if (prof === "iphone14") {
    await ev(page, () => {
      const T = window.plasmaTest;
      T.showScreen("make"); T.setShapeFs(false);
      T.sketch.clear(); T.sketch.add("rect", true);
      T.sketch.pick([T.sketch.items[0].id]); T.sketch.fitView();
      if (T.renderShapeForm) T.renderShapeForm();
    });
    await sleep(200);
    plainH = await previewH(page);
  }

  await openFold(page, "foldlbr");
  const a = await overlapCheck(page);
  if (prof === "iphone14") {
    const foldH = await previewH(page);
    t.check(n("the drawing keeps its normal height when a fold preset is chosen"),
      !!(plainH && foldH.canvas >= 160 && foldH.canvas >= plainH.canvas - 8 && foldH.pane >= plainH.pane - 8),
      JSON.stringify({ plainH, foldH }));
    t.check(n("folded 3D view is shown for a fold preset"), a.card && a.inForm && a.thumb, JSON.stringify(a));
    // Expand the compact Folded view: the form scrolls, the drawing must stay clear.
    await ev(page, () => {
      const d = document.querySelector("#fold3dHost details.fold3d-box");
      if (d && !d.open) d.open = true;
      const cv = document.querySelector("#fold3dHost canvas.fold3d");
      if (cv) cv.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    await sleep(200);
    const exp = await overlapCheck(page);
    const drawHits = (exp.hits || []).filter((s) => s === "#preview" || s === ".previewPane" || s === "#makeBar" || s === "#btnStop" || s === "#btnPresetParts" || s === "#btnAdvancedTools");
    t.check(n("3D view is in the size form, fully on screen, and does not overlap the drawing, Next, or header"),
      exp.opened && exp.inForm && exp.w > 40 && exp.h > 40 && drawHits.length === 0,
      JSON.stringify({ exp, drawHits }));
    t.check(n("caption explains that the drawing is the flat pattern"), !!(exp.cap && /flat pattern/i.test(exp.cap)), exp.cap);
  } else {
    t.check(n("folded 3D view is shown for a fold preset"), a.vis, JSON.stringify(a));
    t.check(n("3D view is in the size form, fully on screen, and does not overlap the drawing, Next, or header"), a.hits.length === 0 && a.inForm && a.fullyOnScreen, JSON.stringify(a));
    t.check(n("caption explains that the drawing is the flat pattern"), !!(a.cap && /flat pattern/i.test(a.cap)), a.cap);
  }

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
  t.check(n("3D view stays visible after a size change"), prof === "iphone14" ? (b.card && (b.vis || b.thumb)) : b.vis, JSON.stringify(b));

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
    const shown = (() => { const e = document.getElementById("fold3dHost"); return !!(e && !e.hidden && e.querySelector("canvas.fold3d") && e.querySelector("canvas.fold3d").getClientRects().length); })();
    return { hidden: !shown, fold: window.plasmaTest.isFoldPart({ id: "rect" }) };
  });
  t.check(n("plain shapes do not show a folded 3D view"), plain.hidden && !plain.fold, JSON.stringify(plain));

  await page.ctx.close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

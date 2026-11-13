// Laptop Setup and Cut: the bed is drawn rotated 180° (origin and gantry at top-right) so it matches
// standing at the table. View-only: G-code is unchanged. Drag and jog follow the screen.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape } from "../lib/browser.mjs";

const t = new T("95_bed_rotate");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Golden G-code motion XY for the default 100×60 mm rectangle, captured at 0ebd6c6 before the view rotation.
const GOLDEN_XY = [
  [56.3, 2.65], [56.3, 5.65], [6.3, 5.65], [6.051, 5.699], [5.84, 5.84], [5.699, 6.051], [5.65, 6.3],
  [5.65, 66.3], [5.699, 66.549], [5.84, 66.76], [6.051, 66.901], [6.3, 66.95], [106.3, 66.95],
  [106.549, 66.901], [106.76, 66.76], [106.901, 66.549], [106.95, 66.3], [106.95, 6.3], [106.901, 6.051],
  [106.76, 5.84], [106.549, 5.699], [106.3, 5.65], [56.3, 5.65],
];

function motionXY(text) {
  return [...String(text).matchAll(/\bG0?[01]\b[^G;\n]*\bX(-?[\d.]+)[^G;\n]*\bY(-?[\d.]+)/gi)].map((m) => [+m[1], +m[2]]);
}
const sameXY = (a, b) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.001 && Math.abs(p[1] - b[i][1]) < 0.001);

const gcodeOf = (page) => ev(page, () => {
  const p = window.plasmaTest.S.prepared;
  return (p && p.lines && p.lines.join("\n")) || (p && p.source) || "";
});

async function setupPage(prof, { connect = false, step = 3 } = {}) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  if (connect) {
    await demoToShape(page, { stay: "cut" });
  } else {
    await ev(page, () => {
      const T = window.plasmaTest;
      T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect");
      T.sendToCutting(); T.goStep(3);
    });
    await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  }
  await ev(page, (step) => {
    window.plasmaTest.goStep(step);
    const box = document.getElementById("showMach");
    if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }, step);
  await sleep(250);
  return page;
}

// ------------------------------------------------------------------ laptop Setup / Cut: rotation, G-code, drag, zoom
{
  const page = await setupPage("d1366", { step: 3 });
  const rot = await ev(page, () => ({
    on: window.plasmaTest.bedViewRotated(),
    step: window.plasmaTest.S.cur,
    screen: window.plasmaTest.screen(),
    laptop: matchMedia("(min-width: 900px) and (pointer: fine)").matches,
  }));
  t.check("laptop Setup: the bed view is rotated", rot.on && rot.step === 3 && rot.laptop, JSON.stringify(rot));

  const corners = await ev(page, () => {
    const sk = window.plasmaTest.sketch, [w, h] = sk.size();
    const o = sk.toScreen(0, 0), far = sk.toScreen(1250, 2500);
    const it = sk.items[0], b = sk.boxOf(it);
    const mid = sk.toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    return { w, h, o, far, mid, axes: document.getElementById("preview").dataset.axes };
  });
  t.check("Setup: sheet corner (0,0) is in the top-right", corners.o[0] > corners.w * 0.55 && corners.o[1] < corners.h * 0.45, JSON.stringify(corners));
  t.check("Setup: the far table corner is toward the bottom-left", corners.far[0] < corners.o[0] && corners.far[1] > corners.o[1], JSON.stringify(corners));
  t.check("Setup: +X / +Y axis hints are drawn", corners.axes === "on", JSON.stringify(corners));

  const g1 = motionXY(await gcodeOf(page));
  t.check("G-code motion XY is unchanged by the view rotation", sameXY(g1, GOLDEN_XY), JSON.stringify(g1.slice(0, 4)));
  t.check("G-code stays near the sheet origin (not flipped in machine space)", g1.every((p) => p[0] < 200 && p[1] < 200), JSON.stringify([Math.max(...g1.map((p) => p[0])), Math.max(...g1.map((p) => p[1]))]));

  // drag right on screen: the part moves toward screen-right and its machine X decreases
  const before = await ev(page, () => {
    const sk = window.plasmaTest.sketch, it = sk.items[0], b = sk.boxOf(it);
    const [sx, sy] = sk.toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    const r = document.getElementById("preview").getBoundingClientRect();
    return { x: it.x, y: it.y, sx, sy, cx: r.left + sx, cy: r.top + sy };
  });
  await page.mouse.move(before.cx, before.cy);
  await page.mouse.down();
  await page.mouse.move(before.cx + 80, before.cy, { steps: 8 });
  await page.mouse.up();
  await sleep(150);
  const after = await ev(page, () => {
    const sk = window.plasmaTest.sketch, it = sk.items[0], b = sk.boxOf(it);
    const [sx, sy] = sk.toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    return { x: it.x, y: it.y, sx, sy };
  });
  t.check("Setup: dragging right moves the part toward screen-right", after.sx > before.sx + 20, JSON.stringify({ before, after }));
  t.check("Setup: a screen-right drag decreases machine X (inverse of the view)", after.x < before.x - 5, JSON.stringify({ before, after }));

  // Zoom to parts: the picture stays rotated — (0,0) is still to the top-right of the part.
  await ev(page, () => { const z = document.getElementById("layZoom"); if (z && !z.classList.contains("hidden")) z.click(); });
  await sleep(80);
  const zParts = await ev(page, () => {
    const sk = window.plasmaTest.sketch, it = sk.items[0], b = sk.boxOf(it);
    const mid = sk.toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    const o = sk.toScreen(0, 0), x = sk.toScreen(100, 0), y = sk.toScreen(0, 100);
    const [w, h] = sk.size();
    return { o, x, y, mid, w, h, onCanvas: mid[0] > 0 && mid[0] < w && mid[1] > 0 && mid[1] < h, xLeft: x[0] < o[0], yDown: y[1] > o[1] };
  });
  t.check("Zoom to parts keeps the part in view, with +X left and +Y down", zParts.onCanvas && zParts.xLeft && zParts.yDown, JSON.stringify(zParts));
  await ev(page, () => { const f = document.getElementById("layFit"); if (f && !f.classList.contains("hidden")) f.click(); });
  await sleep(80);
  const zFit = await ev(page, () => {
    const sk = window.plasmaTest.sketch, [w, h] = sk.size();
    return { o: sk.toScreen(0, 0), far: sk.toScreen(1250, 2500), w, h };
  });
  t.check("Fit to table keeps (0,0) in the top-right", zFit.o[0] > zFit.w * 0.55 && zFit.o[1] < zFit.h * 0.45, JSON.stringify(zFit));

  // Make a part / step 1 is not rotated
  await ev(page, () => window.plasmaTest.goStep(1));
  await sleep(150);
  const part = await ev(page, () => {
    const rot = window.plasmaTest.bedViewRotated();
    const cv = document.getElementById("preview");
    const map = cv && cv._map, zmap = cv && cv._zmap;
    // part preview uses the zoom map; fall back to a raw corner check via prepared bounds if present
    return { rot, axes: cv && cv.dataset.axes, hasMap: !!(map || zmap) };
  });
  t.check("step 1 (Part) is not rotated", part.rot === false, JSON.stringify(part));

  await ev(page, () => { window.plasmaTest.showScreen("make"); window.plasmaTest.setShapeFs(false); });
  await sleep(150);
  const make = await ev(page, () => {
    const sk = window.plasmaTest.sketch, [w, h] = sk.size();
    const o = sk.toScreen(0, 0);
    return { rot: window.plasmaTest.bedViewRotated(), o, w, h };
  });
  t.check("Make a part is not rotated: (0,0) stays bottom-left", !make.rot && make.o[0] < make.w * 0.5 && make.o[1] > make.h * 0.5, JSON.stringify(make));
  await page.ctx.close();
}

// ------------------------------------------------------------------ jog mapping (Practice only)
{
  const page = await setupPage("d1366", { connect: true, step: 3 });
  await ev(page, () => { if (document.activeElement) document.activeElement.blur(); });
  const labels = await ev(page, () => [...document.querySelectorAll(".j[data-axis='X'][data-dir='1'] small")].map((s) => s.textContent));
  t.check("Setup jog pad: the screen-right button is labelled X−", labels.length && labels.every((s) => /X−/.test(s)), JSON.stringify(labels));

  const snap = () => ev(page, () => {
    const w = window.plasmaTest.S.status.WPos || [0, 0, 0];
    const sk = window.plasmaTest.sketch;
    const p = sk.toScreen(w[0], w[1]);
    return { x: w[0], y: w[1], z: w[2], sx: p[0], sy: p[1] };
  });

  let a = await snap();
  await page.keyboard.down("ArrowRight"); await sleep(120); await page.keyboard.up("ArrowRight"); await sleep(900);
  let b = await snap();
  t.check("Setup: ArrowRight moves the torch toward screen-right (machine −X)", b.sx > a.sx && b.x < a.x, JSON.stringify({ a, b }));

  a = await snap();
  await page.keyboard.down("ArrowUp"); await sleep(120); await page.keyboard.up("ArrowUp"); await sleep(900);
  b = await snap();
  t.check("Setup: ArrowUp moves the torch toward screen-up (machine −Y)", b.sy < a.sy && b.y < a.y, JSON.stringify({ a, b }));

  const btn = await ev(page, () => {
    const b = [...document.querySelectorAll(".j[data-axis='X'][data-dir='1']")].find((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none";
    });
    if (!b) return null;
    b.scrollIntoView({ block: "center", inline: "center" });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, lab: (b.querySelector("small") || b).textContent, vis: r.top >= 0 && r.bottom <= innerHeight };
  });
  a = await snap();
  if (btn) {
    await ev(page, () => {
      const b = [...document.querySelectorAll(".j[data-axis='X'][data-dir='1']")].find((el) => el.getBoundingClientRect().width > 2);
      if (!b) return;
      b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 77, button: 0, pointerType: "mouse" }));
    });
    await sleep(80);
    await ev(page, () => {
      const b = [...document.querySelectorAll(".j[data-axis='X'][data-dir='1']")].find((el) => el.getBoundingClientRect().width > 2);
      if (!b) return;
      b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 77, button: 0, pointerType: "mouse" }));
    });
    await sleep(900);
  }
  b = await snap();
  t.check("Setup: the screen-right jog button sends machine −X and moves toward screen-right", !!(btn && b.sx > a.sx && b.x < a.x), JSON.stringify({ btn, a, b }));

  a = await snap();
  await page.keyboard.down("PageUp"); await sleep(120); await page.keyboard.up("PageUp"); await sleep(900);
  b = await snap();
  t.check("Z jog is not inverted (PageUp still raises Z)", b.z > a.z, JSON.stringify({ a, b }));

  // Machine setup (opened from the menu) has no bed picture: jog stays in machine space
  await ev(page, () => { const home = document.getElementById("btnHome"); if (home) home.click(); });
  await sleep(150);
  await ev(page, () => { const b = document.getElementById("menuSetup"); if (b) b.click(); });
  await sleep(250);
  const ms = await ev(page, () => ({
    rot: window.plasmaTest.bedViewRotated(),
    tab: window.plasmaTest.S.tab,
    labels: [...document.querySelectorAll(".j[data-axis='X'][data-dir='1'] small")].map((s) => s.textContent),
  }));
  t.check("Machine setup is not rotated; the right button is X+ again", !ms.rot && ms.tab === "setup" && ms.labels.some((s) => /X\+/.test(s)), JSON.stringify(ms));
  await ev(page, () => { if (document.activeElement) document.activeElement.blur(); });
  a = await ev(page, () => { const w = window.plasmaTest.S.status.WPos || [0, 0, 0]; return { x: w[0], y: w[1] }; });
  await page.keyboard.down("ArrowRight"); await sleep(120); await page.keyboard.up("ArrowRight"); await sleep(900);
  b = await ev(page, () => { const w = window.plasmaTest.S.status.WPos || [0, 0, 0]; return { x: w[0], y: w[1] }; });
  t.check("Machine setup: ArrowRight still jogs machine +X", b.x > a.x, JSON.stringify({ a, b }));

  // Cut step: rotation, torch marker maps through the rotated view
  await ev(page, () => { const tab = document.querySelector(".tab[data-tab='cut']"); if (tab) tab.click(); });
  await ev(page, () => { window.plasmaTest.S.job = window.plasmaTest.S.job || { running: false }; window.plasmaTest.goStep(4); });
  await sleep(250);
  const cut = await ev(page, () => {
    const rot = window.plasmaTest.bedViewRotated();
    const cv = document.getElementById("preview");
    const map = cv && cv._map;
    const w = window.plasmaTest.S.status.WPos || [0, 0, 0];
    const Tbl = (map && map.T) || { x: [0, 1250], y: [0, 2500] };
    const o = map ? map.toPx(0, 0) : null;
    const far = map ? map.toPx(Tbl.x[1] || 1250, Tbl.y[1] || 2500) : null;
    const torch = map ? map.toPx(w[0], w[1]) : null;
    return { rot, axes: cv && cv.dataset.axes, w: cv.clientWidth, h: cv.clientHeight, o, far, torch, wpos: w.slice() };
  });
  t.check("Cut: the bed view is rotated", cut.rot && cut.o && cut.o[0] > cut.w * 0.55 && cut.o[1] < cut.h * 0.45, JSON.stringify(cut));
  t.check("Cut: +X / +Y axis hints are drawn", cut.axes === "on", JSON.stringify(cut));
  t.check("Cut: the torch marker is drawn in the rotated view", cut.torch && cut.o && Math.hypot(cut.torch[0] - cut.o[0], cut.torch[1] - cut.o[1]) < 400, JSON.stringify(cut));
  t.check("Cut: the far table corner is toward the bottom-left", cut.far && cut.o && cut.far[0] < cut.o[0] && cut.far[1] > cut.o[1], JSON.stringify(cut));

  const g2 = motionXY(await gcodeOf(page));
  t.check("Cut: generated G-code is still the unrotated machine path", sameXY(g2, GOLDEN_XY), JSON.stringify(g2.slice(0, 4)));
  await page.ctx.close();
}

// ------------------------------------------------------------------ phone is unchanged
{
  const page = await setupPage("iphone14", { connect: true, step: 3 });
  const ph = await ev(page, () => {
    const sk = window.plasmaTest.sketch, [w, h] = sk.size();
    const o = sk.toScreen(0, 0);
    const labels = [...document.querySelectorAll(".j[data-axis='X'][data-dir='1'] small")].map((s) => s.textContent);
    return { rot: window.plasmaTest.bedViewRotated(), o, w, h, labels, laptop: matchMedia("(min-width: 900px) and (pointer: fine)").matches };
  });
  t.check("phone Setup is not rotated: (0,0) stays bottom-left", !ph.rot && !ph.laptop && ph.o[0] < ph.w * 0.5 && ph.o[1] > ph.h * 0.5, JSON.stringify(ph));
  t.check("phone jog pad still shows X+ on the right button", ph.labels.some((s) => /X\+/.test(s)), JSON.stringify(ph));
  await ev(page, () => { if (document.activeElement) document.activeElement.blur(); });
  const x0 = await ev(page, () => Number((window.plasmaTest.S.status.WPos || [0])[0]));
  await page.keyboard.down("ArrowRight"); await sleep(120); await page.keyboard.up("ArrowRight"); await sleep(900);
  const x1 = await ev(page, () => Number((window.plasmaTest.S.status.WPos || [0])[0]));
  t.check("phone: ArrowRight still jogs machine +X", x1 > x0, `${x0} -> ${x1}`);
  const g3 = motionXY(await gcodeOf(page));
  t.check("phone: G-code is unchanged", sameXY(g3, GOLDEN_XY), JSON.stringify(g3.slice(0, 4)));
  await page.ctx.close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

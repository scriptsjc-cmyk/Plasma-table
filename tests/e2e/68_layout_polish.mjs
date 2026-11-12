// Layout / usability: preview clamp + Fit, toolbar placement, pinned tools, inches, mode stays Pro.
import { serve, open, launch, demoToShape } from "../lib/r2compat.mjs";
import { T as Rec } from "../lib/t.mjs";

const s = await serve(), br = await launch();
const rec = new Rec("68_layout_polish");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);

{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" }); await sleep(400);
  await T(page, `(() => { const cam = window.plasmaTest.previewCam(); for (let i = 0; i < 40; i++) { cam.x = -200000; cam.y = -200000; } window.plasmaTest.resetPreviewCam(); })()`);
  // fling the wheel far, then the cam must still leave some of the bed in view
  const flung = await T(page, `(() => {
    const cv = document.getElementById("preview");
    const r = cv.getBoundingClientRect();
    for (let i = 0; i < 40; i++) cv.dispatchEvent(new WheelEvent("wheel", { deltaY: 400, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
    const cam = window.plasmaTest.previewCam();
    return { x: cam.x, y: cam.y, s: cam.s, w: r.width, h: r.height };
  })()`);
  const still = Math.abs(flung.x) < flung.w && Math.abs(flung.y) < flung.h;
  ck("panning the bed cannot throw the picture completely out of view", still, flung);
  await T(page, `document.getElementById("btnPicFit").click()`);
  const fitted = await T(page, `(() => { const c = window.plasmaTest.previewCam(); return { x: c.x, y: c.y, s: c.s }; })()`);
  ck("Fit resets the bed picture to the fitted view", fitted.x === 0 && fitted.y === 0 && fitted.s === 1, fitted);
  // new part resets cam
  await T(page, `(() => { const c = window.plasmaTest.previewCam(); c.x = 80; c.y = 80; c.s = 2; })()`);
  await T(page, `(() => { const T = window.plasmaTest; T.showScreen("make"); T.sketch.clear(); T.sketch.add("disc"); T.sendToCutting(); T.goStep(3); })()`);
  await sleep(400);
  const after = await T(page, `(() => { const c = window.plasmaTest.previewCam(); return { x: c.x, y: c.y, s: c.s }; })()`);
  ck("sending a new part resets the bed picture", after.x === 0 && after.y === 0 && after.s === 1, after);
  await page.context().close();
}

{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await T(page, `(() => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.sketch.add("rect"); T.setShapeFs(true); })()`);
  await sleep(400);
  await T(page, `(() => { const el = document.getElementById("yoursToolbar"); if (el) { el.value = "bottom"; el.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
  await T(page, `window.plasmaTest.openSettings && window.plasmaTest.openSettings("yours")`);
  await T(page, `(() => { const el = document.getElementById("yoursToolbar"); el.value = "bottom"; el.dispatchEvent(new Event("change", { bubbles: true })); document.querySelector(".acct-close") && document.querySelector(".acct-close").click(); })()`);
  await sleep(200);
  const pos = await T(page, `(() => {
    const bar = (document.getElementById("quickBarWrap") || document.getElementById("quickBar")).getBoundingClientRect();
    const cv = document.getElementById("preview").getBoundingClientRect();
    const pin = document.getElementById("qbPinned");
    const ids = pin ? [...pin.querySelectorAll("[data-qb]")].map((b) => b.dataset.qb) : [];
    return { barTop: bar.top, cvBottom: cv.bottom, ids, fs: document.body.classList.contains("shape-fs") };
  })()`);
  ck("the bottom toolbar sits under the picture (full-screen editor removed)", !pos.fs && pos.barTop >= pos.cvBottom - 6, pos);
  ck("Undo, Redo, Fit and Delete are pinned outside the slider", ["undo", "redo", "fit", "del"].every((id) => pos.ids.includes(id)), pos.ids);
  await T(page, `window.plasmaTest.setShapeFs(false)`);
  await T(page, `window.plasmaTest.openSettings("yours")`);
  await T(page, `document.getElementById("yoursAccent").value = "teal"; document.getElementById("yoursAccent").dispatchEvent(new Event("change", { bubbles: true }));`);
  await sleep(200);
  ck("changing Accent in Make it yours does not drop Pro mode", await T(page, "window.plasmaTest.isProMode() === true"));
  await T(page, `document.getElementById("yoursUnits").value = "inch"; document.getElementById("yoursUnits").dispatchEvent(new Event("change", { bubbles: true }));`);
  await sleep(200);
  const inch = await T(page, `document.body.innerText`);
  ck("Inches display unit shows in on the Make screen", /\d+(\.\d+)?\s*in\b/.test(inch) || / in /.test(inch), inch.slice(0, 200));
  ck("Advanced tools / Simple view are hidden on the cutting screen", await T(page, `(() => { window.plasmaTest.showScreen("cut"); const el = document.getElementById("editorSwitch"); if (!el) return true; const cs = getComputedStyle(el); return cs.display === "none" || !el.offsetParent; })()`));
  await page.context().close();
}

const failed = rec.done();
await br.close(); s.close();
process.exit(failed ? 1 : 0);

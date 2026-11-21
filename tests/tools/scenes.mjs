// Scenes and sizes shared by visual-snap.mjs (pixels) and style-diff.mjs (computed styles).
export const PROFILES = ["d1280x600", "d1366x640", "d1536x730", "d1440x800", "iphone14", "iphone14land"];
export const CALM = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;
export const T = (page, js) => page.evaluate(js);
export const settle = (page, ms = 350) => page.waitForTimeout(ms);
// each scene starts from a fresh page; returns nothing; failures are reported, not fatal
export const SCENES = {
  "menu": async (p) => { await T(p, `window.plasmaTest.showScreen("menu")`); },
  "make-beginner": async (p) => { await T(p, `(() => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect", true); T.sketch.commit(); T.sketch.fitView(); T.sketch.draw(); })()`); },
  "make-pro": async (p) => { await T(p, `(() => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); const s = T.sketch; s.clear(); s.add("motormount", true); s.commit(); s.pick([s.items[0].id]); s.onSelect(); s.fitView(); T.renderShapeForm && T.renderShapeForm(); s.draw(); })()`); },
  "make-pro-fold3d": async (p) => { await T(p, `(() => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); const s = T.sketch; s.clear(); s.add("takeoff", true); s.commit(); s.pick([s.items[0].id]); s.onSelect(); s.fitView(); T.renderShapeForm && T.renderShapeForm(); s.draw(); })()`); await settle(p, 600); },
  "cut-1": async (p) => { await T(p, `(() => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(1); })()`); },
  "cut-2": async (p) => { await T(p, `(() => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(2); })()`); },
  "cut-3": async (p) => { await T(p, `(() => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(3); })()`); },
  "setup": async (p) => { await T(p, `window.plasmaTest.showScreen("setup", { force: true })`); },
  "parts": async (p) => { await T(p, `window.plasmaTest.showScreen("parts", { force: true })`); },
};


// open a fresh page on a scene and let it settle (animations off, fonts loaded, the drawing refitted)
export async function prepare(page, run) {
  await page.waitForFunction(() => window.plasmaTest, null, { timeout: 15000 });
  await page.addStyleTag({ content: CALM });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await run(page); await settle(page, 600);
  // the drawing is fitted again once the layout has settled (fitting during the screen change can race the resize)
  await T(page, `(() => { const T = window.plasmaTest; if (T.screen() === "make") { T.sketch.fitView(); T.sketch.draw(); } })()`); await settle(page, 400);
}

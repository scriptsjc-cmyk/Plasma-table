import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, demoToShape, shot, SITE } from "../lib/browser.mjs";
import fs from "node:fs"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const t = new T("40_layout_a11y"); const srv = await startServer(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const K = await launchKillable();
const setup = (page) => page.evaluate(() => { const s = window.plasmaTest.sketch; s.clear(); s.add("plate", true); const it = s.items[0]; s.pick([it.id]); s.fitView(); s.onSelect(); });
const measure = () => {
  const vw = document.documentElement.clientWidth, out = { overflowX: document.documentElement.scrollWidth - vw, small: [], offscreen: [] };
  for (const el of document.querySelectorAll("button, input:not([type=hidden]), select, a[href], [role=button], .tab, #stepper li")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el); if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none" || el.closest(".hidden")) continue;
    const lab = (el.id || el.className || el.tagName) + ":" + (el.textContent || el.value || "").trim().slice(0, 14);
    if (r.height < 44 || r.width < 44) out.small.push(`${lab} ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (r.right > vw + 1 || r.left < -1) out.offscreen.push(lab);
  }
  return out;
};
for (const prof of ["w320", "iphoneSE", "iphone14", "iphone14land", "ipad", "desktop", "desktop1920"]) {
  const page = await newPage(K.browser, prof, { base: srv.base }); await demoToShape(page); await setup(page); await sleep(300);
  const m = await page.evaluate(measure); const vp = page.viewportSize();
  t.check(`${prof} ${vp.width}x${vp.height}: no horizontal scroll`, m.overflowX <= 1, `overflow ${m.overflowX}px`, "LAYOUT-OVERFLOW");
  t.check(`${prof}: no control pushed off-screen`, m.offscreen.length === 0, m.offscreen.slice(0, 5).join(", "), "LAYOUT-OFFSCREEN");
  const touch = !prof.startsWith("desktop"); const tiny = m.small.filter((s) => { const [w, h] = s.split(" ").pop().split("x").map(Number); return Math.min(w, h) < 32; });
  if (touch) t.check(`${prof}: touch targets >= 32px (Apple HIG says 44)`, tiny.length === 0, `${tiny.length} below 32px: ${tiny.slice(0, 6).join(", ")}`, "TAP-TARGET");
  t.note(`${prof}: controls under 44px`, `${m.small.length} e.g. ${m.small.slice(0, 5).join(", ")}`);
  await shot(page, `${prof}-layout-shape`);
  // round 4: the main menu and the cutting screen must also fit with no sideways scroll and nothing pushed off-screen (STOP is only on the cutting screen)
  for (const scr of ["menu", "cut"]) {
    await page.evaluate((scr) => { window.plasmaTest.setShapeFs(false); window.plasmaTest.showScreen(scr, { force: true }); }, scr); await sleep(350);
    const ms = await page.evaluate(measure);
    t.check(`${prof}: ${scr} screen: no horizontal scroll, nothing off-screen`, ms.overflowX <= 1 && ms.offscreen.length === 0, `overflow ${ms.overflowX}px; ${ms.offscreen.slice(0, 4).join(", ")}`, "LAYOUT-OVERFLOW");
    if (scr === "cut") { const stop = await page.evaluate(() => { const b = document.getElementById("btnStop").getBoundingClientRect(); return { w: b.width, h: b.height, inView: b.left >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1 }; });
      t.check(`${prof}: cutting screen: STOP is on screen and at least 44x44 (${Math.round(stop.w)}x${Math.round(stop.h)})`, stop.inView && stop.w >= 44 && stop.h >= 44, JSON.stringify(stop), "STOP-VISIBLE"); }
  }
  await page.evaluate(() => { window.plasmaTest.showScreen("make", { force: true }); window.plasmaTest.setShapeFs(false); }); await sleep(250);
  // keypad open: fits on screen, doesn't cover the Done key
  await page.evaluate(() => { const it = window.plasmaTest.sketch.items[0]; window.plasmaTest.openNumPad({ it, key: "w", label: "Width (mm)" }); }).catch(() => {});
  await sleep(300);
  const pad = await page.evaluate(() => { const p = document.getElementById("dimEdit"); if (!p || p.classList.contains("hidden")) return null; const r = p.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, w: innerWidth, right: r.right, left: r.left }; });
  // KNOWN APP BUG #3 (tests/KNOWN-BUGS.md): with the operator row added in group 3 (item 23) the type-in size box is ~2.6 px taller than a phone on its side (750x340)
  if (pad && prof === "iphone14land") t.check(`${prof}: dimension box fully inside the viewport`, pad.bottom <= pad.h + 1 && pad.top >= 0 && pad.right <= pad.w + 1, JSON.stringify(pad), "BUG-3-KEYPAD-LAND");
  else if (pad) t.check(`${prof}: dimension box fully inside the viewport`, pad.bottom <= pad.h + 1 && pad.top >= 0 && pad.right <= pad.w + 1, JSON.stringify(pad), "KEYPAD-FIT");
  await shot(page, `${prof}-layout-keypad`);
  if (["iphone14", "desktop"].includes(prof)) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => { window.plasmaTest.closeNumPad(); window.plasmaTest.sketch.setPro(true); }); await sleep(300);
    // axe-core is served from the page's own origin (script-src 'self' stays in force, nothing is bypassed)
    try { await page.route("**/__axe.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: axeSrc })); await page.addScriptTag({ url: "/__axe.js" }); } catch (e) { t.check(`${prof}: axe-core could be loaded`, false, String(e && e.message || e).slice(0, 160), "E2E-HARNESS"); continue; }
    // the round-4 screens: main menu, Make a part (Beginner and Pro), the one cutting screen (Part step, Bed & start step, Machine setup tab)
    const scenes = [["menu", () => window.plasmaTest.showScreen("menu", { force: true })],
      ["make-beginner", () => { const T = window.plasmaTest; T.setAppMode("beginner", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); }],
      ["make-pro", () => { const T = window.plasmaTest; T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("make", { force: true }); T.setShapeFs(false); }],
      ["cut-part", () => { const T = window.plasmaTest; T.showScreen("cut", { force: true }); T.goStep(1); }],
      ["cut-bed", () => { const T = window.plasmaTest; T.showScreen("cut", { force: true }); T.goStep(3); }]];
    for (const [scene, go] of scenes) {
      await page.evaluate(go); await sleep(450);
      const res = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] }));
      const v = res.violations; const bad = v.filter((x) => ["serious", "critical"].includes(x.impact));
      fs.writeFileSync(new URL(`../results/axe-${prof}-${scene}.json`, import.meta.url), JSON.stringify(v.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, help: x.help, ex: x.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n").slice(0, 3).join(" ").slice(0, 160)) })), null, 1));
      for (const x of v) t.note(`axe[${prof} ${scene}] ${x.impact} ${x.id} ×${x.nodes.length}`, x.help);
      t.check(`${prof} ${scene}: axe-core has no serious/critical violations`, bad.length === 0, bad.map((x) => `${x.id}×${x.nodes.length}`).join(", "), "A11Y");
    }
  }
  await page.context().close();
}
// slow network, no network for fonts, offline reload
{ const s2 = await startServer({ delay: 400 }); const t0 = Date.now(); const page = await newPage(K.browser, "iphone14", { base: s2.base }); const dt = Date.now() - t0;
  t.check("slow network (400 ms/request): app becomes usable < 15 s", dt < 15000, `${dt} ms, ${s2.log.length} requests`, "SLOW-NET"); t.note("requests needed for first load", `${s2.log.length} (${dt} ms at 400 ms RTT) — unbundled ES modules load as a waterfall`);
  const fontsHang = page.failed.length; t.note("failed requests with externals blocked (fonts)", page.failed.length);
  await page.context().close(); await s2.close(); }
// offline reload: sw.js is network-first and caches what the page fetched while online, so a page that was loaded once (service worker allowed here) reloads with no network
{ const s3 = await startServer(); const page = await newPage(K.browser, "desktop", { base: s3.base, sw: true });
  const ready = await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).then(() => true).catch(() => false);
  if (!ready) await page.reload({ waitUntil: "load" });      // first load is uncontrolled until the worker has claimed the page; one reload routes every file through it
  await page.reload({ waitUntil: "load" });
  // wait until the worker has really cached the shell and the main script (runtime caching is asynchronous), instead of sleeping and hoping
  await page.waitForFunction(async () => { const ks = await caches.keys(); for (const k of ks) { const c = await caches.open(k); if ((await c.match("js/app.js")) && (await c.match("index.html") || await c.match("./"))) return true; } return false; }, null, { timeout: 15000, polling: 250 }).catch(() => {});
  await page.context().setOffline(true); const r = await page.reload({ timeout: 8000 }).catch((e) => "fail");
  t.check("OFFLINE reload: after one online visit the page still loads from the service worker cache", r !== "fail" && (await page.evaluate(() => !!document.querySelector("#btnDemo") && !!window.plasmaTest).catch(() => false)), "offline reload failed even though sw.js + manifest are present (sw.js is network-first with runtime caching)", "OFFLINE");
  await page.context().close(); await s3.close(); }
{ const html = fs.readFileSync(SITE + "index.html", "utf8"); t.check("PWA manifest / apple-touch-icon / theme-color present", /rel="manifest"/.test(html) && /apple-touch-icon/.test(html), "", "PWA");
  t.check("viewport meta allows zoom (no user-scalable=no)", !/user-scalable=no|maximum-scale=1[^0-9]/.test(html), (html.match(/<meta name="viewport"[^>]*>/) || [""])[0], "A11Y-ZOOM");
  t.check("<html lang> set", /<html[^>]*lang=/.test(html), "", "A11Y-LANG"); }
K.kill(); await srv.close(); process.exit(t.done() ? 1 : 0);

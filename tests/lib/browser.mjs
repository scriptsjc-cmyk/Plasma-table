// Browser harness: static server (with optional delay / headers / request log) + Chrome with desktop & iPhone-style profiles.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { chromium, devices } from "playwright";
import { SITE as SITE_, jsRel } from "./site.mjs";
export const ROOT = new URL("../", import.meta.url).pathname;                       // tests/
// The site under test is the repo root (one level up) unless SITE_DIR points at another copy of the build.
export const SITE = (process.env.SITE_DIR || new URL("../../", import.meta.url).pathname).replace(/\/?$/, "/"); export const SHOTS = ROOT + "screenshots/";
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".dxf": "text/plain", ".nc": "text/plain", ".py": "text/plain", ".sh": "text/plain", ".yaml": "text/yaml", ".yml": "text/yaml", ".md": "text/markdown" };
export function startServer({ port = 0, delay = 0, headers = {}, site = SITE } = {}) {
  const log = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x"); let p = decodeURIComponent(url.pathname); if (p.endsWith("/")) p += "index.html";
    const f = path.join(site, p); log.push(req.method + " " + p);
    if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    setTimeout(() => { res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store", ...headers }); fs.createReadStream(f).pipe(res); }, delay);
  });
  return new Promise((r) => srv.listen(port, "127.0.0.1", () => r({ srv, port: srv.address().port, base: `http://127.0.0.1:${srv.address().port}`, log, close: () => new Promise((x) => srv.close(x)) })));
}
export const PROFILES = {
  desktop: { viewport: { width: 1280, height: 900 } },
  d1366: { viewport: { width: 1366, height: 768 } },
  d1536: { viewport: { width: 1536, height: 750 } },
  d1440: { viewport: { width: 1440, height: 900 } },
  desktop1920: { viewport: { width: 1920, height: 1080 } },
  d1280x600: { viewport: { width: 1280, height: 600 } },
  d1366x640: { viewport: { width: 1366, height: 640 } },
  d1536x730: { viewport: { width: 1536, height: 730 } },
  d1440x800: { viewport: { width: 1440, height: 800 } },
  d1920x970: { viewport: { width: 1920, height: 970 } },
  iphone14: { ...devices["iPhone 14"], safariLike: true },
  iphoneSE: { ...devices["iPhone SE"], safariLike: true },
  w320: { ...devices["iPhone SE"], viewport: { width: 320, height: 568 }, screen: { width: 320, height: 568 }, safariLike: true },
  ipad: { ...devices["iPad (gen 7)"], safariLike: true },
  iphone14land: { ...devices["iPhone 14 landscape"], safariLike: true },
};
export async function launch() { return chromium.launch({ channel: "chrome", headless: true }); }
// Hooks that prove nothing real is touched in demo mode: WebSocket constructions and Web Serial calls are logged.
const JMAP = () => JSON.stringify(Object.fromEntries(jsRel().map((f) => [f.split("/").pop().replace(/\.js$/, ""), "/" + f])));   // module name -> url, so page-side import() never hard-codes a folder
export const J_INIT = () => `window.__J = ${JMAP()};`;   // for contexts a test makes by hand
const INIT = (safariLike) => `
  window.__J = ${JMAP()};
  window.__net = { ws: [], serial: [], fetch: [], beacon: [] };
  const _WS = window.WebSocket; window.WebSocket = function (u, p) { window.__net.ws.push(String(u)); return new _WS(u, p); }; Object.assign(window.WebSocket, _WS); window.WebSocket.prototype = _WS.prototype;
  ${safariLike ? "try { delete Navigator.prototype.serial; } catch (e) {} try { Object.defineProperty(navigator, 'serial', { get: () => undefined }); } catch (e) {}" : ""}
  if (navigator.serial) { for (const k of ['requestPort', 'getPorts']) { const o = navigator.serial[k].bind(navigator.serial); navigator.serial[k] = (...a) => { window.__net.serial.push(k); return o(...a); }; } }
  const _f = window.fetch; window.fetch = (...a) => { window.__net.fetch.push(String(a[0] && a[0].url || a[0])); return _f(...a); };
  const _sb = navigator.sendBeacon && navigator.sendBeacon.bind(navigator); if (_sb) navigator.sendBeacon = (...a) => { window.__net.beacon.push(String(a[0])); return _sb(...a); };
`;
export async function newPage(browser, profileName, { base, query = "?test=1&turn=0", blockExternal = true, offline = false, bypassCSP = false, sw = false, consoleErrors = true } = {}) {
  const prof = PROFILES[profileName]; const { safariLike, ...ctxOpts } = prof;
  const ctx = await browser.newContext({ ...ctxOpts, acceptDownloads: true, bypassCSP, serviceWorkers: sw ? "allow" : "block" });
  await ctx.addInitScript(INIT(!!safariLike));
  const page = await ctx.newPage();
  page.errors = []; page.consoleMsgs = []; page.requests = []; page.dialogs = []; page.failed = [];
  page._safeConfirmAuto = "accept";
  await page.exposeFunction("__reportSafeConfirm", (msg) => {
    page.dialogs.push("confirm: " + String(msg || ""));
    page._dlg = String(msg || "");
    return page._safeConfirmAuto || "accept";
  });
  page.on("pageerror", (e) => page.errors.push(String(e && e.stack || e)));
  page.on("console", (m) => { page.consoleMsgs.push(`${m.type()}: ${m.text()}`); if (consoleErrors && m.type() === "error") page.errors.push("console.error: " + m.text()); });
  page.on("request", (r) => page.requests.push(r.url()));
  page.on("requestfailed", (r) => page.failed.push(r.url() + " " + (r.failure() && r.failure().errorText)));
  page.on("dialog", async (d) => { page.dialogs.push(`${d.type()}: ${d.message()}`); await d.accept(); });
  if (blockExternal) await ctx.route((u) => !u.href.startsWith(base) && !u.href.startsWith("data:"), (r) => r.abort());
  if (offline) await ctx.setOffline(true);
  await page.goto(base + "/" + query, { waitUntil: "load" });
  await page.waitForFunction(() => window.plasmaTest || !new URLSearchParams(location.search).has("test"), null, { timeout: 15000 });
  page.profile = profileName; page.ctx = ctx;
  return page;
}
// Round 4: the old "Practice connect, then pick a source" opening. Now: draw a rectangle on Make a part, send it to cutting,
// connect Practice on the bed screen, then come back to Make a part (the connection and the part stay).
export async function demoToShape(page, { stay = "make" } = {}) {
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(3); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await page.evaluate(() => document.getElementById("btnDemo").click());   // JS click: the portrait overlay may be up
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
  if (stay === "make") await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("menu"); T.showScreen("make"); T.setShapeFs(false); });
}
// Home the practice table so F7 "sheet corner set" copy is valid (home known),
// and a normal connect is not confused with an unfinished motor-direction test.
export async function ensurePracticeHomed(page, { timeout = 20000 } = {}) {
  const already = await page.evaluate(() => !!(window.plasmaTest.S.safety && window.plasmaTest.S.safety.referenced));
  if (already) return true;
  await page.evaluate(() => {
    const T = window.plasmaTest, M = T.getM && T.getM();
    if (T.S.status && /alarm/i.test(T.S.status.state || "")) {
      try { if (M && typeof M.command === "function") M.command({ cmd: "unlock" }); } catch (e) { /* ignore */ }
    }
    if (M && typeof M.command === "function") M.command({ cmd: "home" });
    else {
      const b = document.querySelector(".do-home") || document.getElementById("btnHomeBarSetup");
      if (b) b.click();
    }
  });
  await page.waitForFunction(() => {
    const T = window.plasmaTest;
    return !!(T.S.safety && T.S.safety.referenced) && T.getM().state() === "Idle";
  }, null, { timeout });
  return true;
}
// click/tap a canvas point given in canvas CSS px
export async function tapCanvas(page, sx, sy) {
  const bb = await page.locator("#preview").boundingBox();
  const x = bb.x + sx, y = bb.y + sy;
  if (page.profile.startsWith("desktop")) await page.mouse.click(x, y); else await page.touchscreen.tap(x, y);
}
export const shot = (page, name) => page.screenshot({ path: SHOTS + name + ".png" }).catch(() => {});

// A Chrome we can SIGKILL (a frozen renderer can wedge Playwright's own close()). Playwright starts it (the same way as
// launch(), which works on every Chrome the runner gets) and we keep its process, so kill() never waits on the page.
export async function launchKillable() {
  const server = await chromium.launchServer({ channel: "chrome", headless: true });
  const proc = server.process();
  const browser = await chromium.connect(server.wsEndpoint());
  return { browser, kill: () => { try { process.kill(-proc.pid, "SIGKILL"); } catch (e) { try { proc.kill("SIGKILL"); } catch (e2) { /* already gone */ } } } };
}

// Round-4 UI: menu -> make -> cut. Draw a plate, send it to the cutting screen and connect the practice (demo) controller.
export async function enterDemo(page, { plate = true } = {}) {
  await page.evaluate((plate) => { const T = window.plasmaTest; T.showScreen("make", { force: true }); if (plate) { const s = T.sketch; s.clear(); s.add("plate", true); s.commit(); T.sendToCutting(); T.goStep(3); } else T.showScreen("cut", { force: true }); }, plate);
  await page.waitForSelector("#btnDemo", { state: "attached", timeout: 10000 });
  await page.evaluate(() => document.getElementById("btnDemo").click()); await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
}

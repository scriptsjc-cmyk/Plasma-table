// Browser harness: static server (with optional delay / headers / request log) + Chrome with desktop & iPhone-style profiles.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { chromium, devices } from "playwright";
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
  d1440: { viewport: { width: 1440, height: 900 } },
  desktop1920: { viewport: { width: 1920, height: 1080 } },
  iphone14: { ...devices["iPhone 14"], safariLike: true },
  iphoneSE: { ...devices["iPhone SE"], safariLike: true },
  w320: { ...devices["iPhone SE"], viewport: { width: 320, height: 568 }, screen: { width: 320, height: 568 }, safariLike: true },
  ipad: { ...devices["iPad (gen 7)"], safariLike: true },
  iphone14land: { ...devices["iPhone 14 landscape"], safariLike: true },
};
export async function launch() { return chromium.launch({ channel: "chrome", headless: true }); }
// Hooks that prove nothing real is touched in demo mode: WebSocket constructions and Web Serial calls are logged.
const INIT = (safariLike) => `
  window.__net = { ws: [], serial: [], fetch: [], beacon: [] };
  const _WS = window.WebSocket; window.WebSocket = function (u, p) { window.__net.ws.push(String(u)); return new _WS(u, p); }; Object.assign(window.WebSocket, _WS); window.WebSocket.prototype = _WS.prototype;
  ${safariLike ? "try { delete Navigator.prototype.serial; } catch (e) {} try { Object.defineProperty(navigator, 'serial', { get: () => undefined }); } catch (e) {}" : ""}
  if (navigator.serial) { for (const k of ['requestPort', 'getPorts']) { const o = navigator.serial[k].bind(navigator.serial); navigator.serial[k] = (...a) => { window.__net.serial.push(k); return o(...a); }; } }
  const _f = window.fetch; window.fetch = (...a) => { window.__net.fetch.push(String(a[0] && a[0].url || a[0])); return _f(...a); };
  const _sb = navigator.sendBeacon && navigator.sendBeacon.bind(navigator); if (_sb) navigator.sendBeacon = (...a) => { window.__net.beacon.push(String(a[0])); return _sb(...a); };
`;
export async function newPage(browser, profileName, { base, query = "?test=1&turn=0", blockExternal = true, offline = false, bypassCSP = false, sw = false } = {}) {
  const prof = PROFILES[profileName]; const { safariLike, ...ctxOpts } = prof;
  const ctx = await browser.newContext({ ...ctxOpts, acceptDownloads: true, bypassCSP, serviceWorkers: sw ? "allow" : "block" });
  await ctx.addInitScript(INIT(!!safariLike));
  const page = await ctx.newPage();
  page.errors = []; page.consoleMsgs = []; page.requests = []; page.dialogs = []; page.failed = [];
  page.on("pageerror", (e) => page.errors.push(String(e && e.stack || e)));
  page.on("console", (m) => { page.consoleMsgs.push(`${m.type()}: ${m.text()}`); if (m.type() === "error") page.errors.push("console.error: " + m.text()); });
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
  await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await page.evaluate(() => document.getElementById("btnDemo").click());   // JS click: the portrait overlay may be up
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
  if (stay === "make") await page.evaluate(() => { const T = window.plasmaTest; T.showScreen("menu"); T.showScreen("make"); T.setShapeFs(false); });
}
// click/tap a canvas point given in canvas CSS px
export async function tapCanvas(page, sx, sy) {
  const bb = await page.locator("#preview").boundingBox();
  const x = bb.x + sx, y = bb.y + sy;
  if (page.profile.startsWith("desktop")) await page.mouse.click(x, y); else await page.touchscreen.tap(x, y);
}
export const shot = (page, name) => page.screenshot({ path: SHOTS + name + ".png" }).catch(() => {});

// A Chrome we can SIGKILL (a frozen renderer can wedge Playwright's own close()).
import { spawn } from "node:child_process"; import os from "node:os";
export async function launchKillable() {
  const port = 20000 + Math.floor(Math.random() * 20000); const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-chrome-"));
  const child = spawn("google-chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-first-run", "--no-sandbox", "--disable-gpu", "about:blank"], { stdio: "ignore", detached: true });
  let browser; for (let i = 0; i < 50; i++) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  if (!browser) { try { process.kill(-child.pid, "SIGKILL"); } catch (e) {} throw new Error("chrome did not start"); }
  return { browser, kill: () => { try { process.kill(-child.pid, "SIGKILL"); } catch (e) {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} } };
}

// Round-4 UI: menu -> make -> cut. Draw a plate, send it to the cutting screen and connect the practice (demo) controller.
export async function enterDemo(page, { plate = true } = {}) {
  await page.evaluate((plate) => { const T = window.plasmaTest; T.showScreen("make", { force: true }); if (plate) { const s = T.sketch; s.clear(); s.add("plate", true); s.commit(); T.sendToCutting(); } else T.showScreen("cut", { force: true }); }, plate);
  await page.waitForSelector("#btnDemo", { state: "attached", timeout: 10000 });
  await page.evaluate(() => document.getElementById("btnDemo").click()); await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
}

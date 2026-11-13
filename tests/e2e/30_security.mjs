import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, demoToShape, shot, SITE } from "../lib/browser.mjs"; import { allJsText, readJs } from "../lib/site.mjs";
import { spawn } from "node:child_process"; import fs from "node:fs"; import http from "node:http";
const t = new T("30_security"); const srv = await startServer(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const K = await launchKillable();
const PAYLOAD = `"><img src=x onerror="window.__xss=(window.__xss||0)+1">`;
// ---- 1. stored XSS through localStorage (what a malicious page on the same origin / a tampered backup / a shared device could plant)
async function withLS(label, ls, fn, query = "?test=1") {
  const ctx = await K.browser.newContext(); const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e))); page.on("dialog", (d) => d.accept());
  await ctx.route((u) => !u.href.startsWith(srv.base), (r) => r.abort());
  await page.goto(srv.base + "/" + query); await page.evaluate((ls) => { localStorage.clear(); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); window.__xss = 0; }, ls);
  await page.reload(); await page.waitForFunction(() => window.plasmaTest, null, { timeout: 15000 }).catch(() => {}); await sleep(500);
  const r = await fn(page); const xss = await page.evaluate(() => window.__xss || 0); await ctx.close(); return { xss, r, errors: page.errors };
}
let r;
r = await withLS("thickness", { "plasma.material": { m: "Mild steel", t: PAYLOAD } }, async (p) => { await sleep(300); });
t.check("XSS via localStorage plasma.material.t (thickness) → spNote innerHTML", r.xss === 0, `window.__xss=${r.xss}`, "XSS-LS-THICK");
r = await withLS("sketch p", { "plasma.sketch": { items: [{ id: 1, type: "rect", p: { w: PAYLOAD, h: 20 }, x: 10, y: 10, rot: 0, holes: {} }] } }, async (p) => {
  await p.evaluate(() => window.plasmaTest.showScreen("make"));   await p.evaluate(() => { const s = window.plasmaTest.sketch; if (s.items[0]) { s.pick([s.items[0].id]); s.onSelect && s.onSelect(); } }); await sleep(400); });
t.check("XSS via localStorage plasma.sketch item params → shape-form value=\"…\" attribute", r.xss === 0, `window.__xss=${r.xss}`, "XSS-LS-SKETCH");
r = await withLS("recent", { "plasma.recent": [{ name: PAYLOAD, text: "G0 X0" }] }, async () => {});
t.check("XSS via localStorage plasma.recent name (escaped via esc())", r.xss === 0, `window.__xss=${r.xss}`, "XSS-LS-RECENT");
r = await withLS("speeds", { "plasma.speeds": { "Mild steel|3": PAYLOAD } }, async () => {});
t.check("XSS via localStorage plasma.speeds", r.xss === 0, `window.__xss=${r.xss}`, "XSS-LS-SPEEDS");
// ---- 2. malformed localStorage must not brick the app
for (const [k, v, id] of [["plasma.sketch", "{not json", "LS-BADJSON"], ["plasma.sketch", { items: [{ id: 1, type: "rect", p: null }] }, "LS-NULLP"], ["plasma.sketch", { items: [{ id: 1, type: "rect", p: { w: -5, h: 0 }, x: "a", y: null }] }, "LS-NEGP"], ["plasma.sketch", { items: [{ id: 1, type: "rect", p: { w: "1e999", h: "NaN" }, x: 0, y: 0 }] }, "LS-NANP"], ["plasma.opts", { pro: "yes", snap: "x" }, "LS-OPTS"], ["plasma.material", { m: null, t: { a: 1 } }, "LS-MAT"]]) {
  const rr = await withLS(id, { [k]: v }, async (p) => { await p.evaluate(() => window.plasmaTest.showScreen("make")); await sleep(500); return await p.evaluate(() => ({ ok: !!window.plasmaTest, items: window.plasmaTest.sketch.items.length })); });
  t.check(`${id}: corrupt ${k} → app still loads, no uncaught error`, rr.r && rr.r.ok && rr.errors.length === 0, rr.errors.slice(0, 2).join(" | ").slice(0, 200), "LS-VALIDATE");
}
// ---- 3. imports with hostile names/content
const hostile = [
  ["dxf-name", `<img src=x onerror=window.__xss=1>.dxf`, "0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\n0\n10\n50\n20\n50\n40\n10\n0\nENDSEC\n0\nEOF\n"],
  ["svg-script", "evil.svg", `<svg xmlns="http://www.w3.org/2000/svg" onload="window.__xss=1" width="100" height="100"><script>window.__xss=1</script><rect width="50" height="50" onclick="window.__xss=1"/><image href="http://127.0.0.1:1/x" /><foreignObject><img src=x onerror="window.__xss=1"></foreignObject><path d="M0 0 L50 0 L50 50 Z"/></svg>`],
  ["gcode-comment", `<svg onload=window.__xss=1>.nc`, "(<img src=x onerror=window.__xss=1>)\nG21 G90\nG0 X0 Y0\nM3 S1000\nG1 X10 Y0 F1000\nM5\nM2\n"],
  ["gcode-msg", "ok.nc", "G21\n(MSG,<img src=x onerror=window.__xss=1>)\nG0 X0 Y0\nM2\n"],
];
for (const [id, name, body] of hostile) {
  const rr = await withLS(id, {}, async (p) => { await p.setInputFiles("#file", { name, mimeType: "text/plain", buffer: Buffer.from(body) }); await sleep(1200); const net = p.url(); await shot(p, "sec-import-" + id).catch(() => {}); return await p.evaluate(() => ({ title: document.getElementById("dropTitle").textContent, warn: document.getElementById("warnings").textContent.slice(0, 80) })); });
  t.check(`import ${id}: no script execution`, rr.xss === 0, `window.__xss=${rr.xss}`, "XSS-IMPORT");
}
// ---- 4. static header / CSP / third party
const html = fs.readFileSync(SITE + "index.html", "utf8");
t.check("CSP present (meta or header)", /Content-Security-Policy/i.test(html), "no CSP: any XSS has full access to Web Serial + the Pi socket", "CSP-MISSING");
const ext = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:[^"]+)"[^>]*>/g)].map((m) => m[0]);
t.check("third-party resources carry SRI (integrity=)", ext.every((e) => /integrity=/.test(e)), ext.join(" | ").slice(0, 300), "SRI-MISSING");
const allHtml = [html, ...((fs.existsSync(SITE + "html") ? fs.readdirSync(SITE + "html") : []).filter((f) => f.endsWith(".html")).map((f) => fs.readFileSync(SITE + "html/" + f, "utf8")))];
t.check("no inline event handlers in the page or HTML partials", allHtml.every((h) => !/\son[a-z]+="/i.test(h)), "", "INLINE-HANDLERS");
t.check("referrer-policy meta", /name="referrer"/.test(html), "", "REFERRER");
const jsAll = allJsText().map(([f, txt]) => [f.replace(/^js\//, ""), txt]);
for (const [f, src] of jsAll) { const m = src.match(/\b(eval\s*\(|new Function\s*\(|(?<![.\w])Function\s*\()/g); if (m) t.check(`${f}: no eval / Function()`, false, `${f}: ${m.join(",")}`, "EVAL"); }
const secrets = jsAll.flatMap(([f, s]) => {
  const hits = (s.match(/(api[_-]?key|secret|auth_?token|Bearer\s+\w+|AKIA[0-9A-Z]{12,}|ghp_\w{20,})/gi) || []).map((m) => f + ":" + m);
  // The bare word "password" is UI copy (labels, error messages). Only flag a hard-coded value.
  const assigned = s.match(/(?:passw(?:or)?d)\s*[:=]\s*['"`][^'"`]+['"`]/gi) || [];
  return hits.concat(assigned.map((m) => f + ":" + m));
});
t.check("no secrets / keys / tokens in shipped JS", secrets.length === 0, secrets.slice(0, 8).join(","), "SECRETS");
t.check("?test=1 hook (window.plasmaTest / plasmaSketch) only exists under ?test", await (async () => { const p = await newPage(K.browser, "desktop", { base: srv.base, query: "" }); const h = await p.evaluate(() => !!(window.plasmaTest || window.plasmaSketch)); return !h; })(), "window.plasmaSketch is exposed on every page load (js/app.js:1319)", "TEST-HOOK");
// demo mode network silence
{ const p = await newPage(K.browser, "desktop", { base: srv.base }); await demoToShape(p); await sleep(800); const n = await p.evaluate(() => window.__net); t.check("demo mode: no WebSocket / Web Serial / fetch / beacon", n.ws.length === 0 && n.serial.length === 0 && n.beacon.length === 0, JSON.stringify(n), "DEMO-NETWORK");
  t.check("page makes no third-party requests besides Google Fonts", p.requests.filter((u) => !u.startsWith(srv.base) && !/fonts\.(googleapis|gstatic)\.com/.test(u)).length === 0, p.requests.filter((u) => !u.startsWith(srv.base)).join(","), "THIRD-PARTY"); }
// ---- 5. Pi bridge against a fake pty controller (loopback only)
const BPORT = 18000 + Math.floor(Math.random() * 1000), out = "/tmp/fakectl-" + BPORT + ".out"; fs.writeFileSync(out, "");
const fc = spawn("python3", [new URL("../tools/fakectl.py", import.meta.url).pathname, SITE, String(BPORT), out], { stdio: ["ignore", "ignore", "pipe"] }); let fcErr = ""; fc.stderr.on("data", (d) => (fcErr += d));
await sleep(1500);
try {
  const attacker = await (async () => { const a = http.createServer((q, s) => { s.writeHead(200, { "content-type": "text/html" }); s.end("<h1>other site</h1>"); }); await new Promise((r) => a.listen(0, "localhost", r)); return a; })();
  const aorigin = `http://localhost:${attacker.address().port}`;
  const ctx = await K.browser.newContext(); const pg = await ctx.newPage(); await pg.goto(aorigin + "/");
  const res = await pg.evaluate((port) => new Promise((resolve) => { const ws = new WebSocket("ws://127.0.0.1:" + port + "/ws"); const got = []; ws.onmessage = (e) => got.push(e.data.slice(0, 120)); ws.onopen = () => { ws.send(JSON.stringify({ t: "w", d: "M3 S1000\n" })); setTimeout(() => { ws.send(JSON.stringify({ t: "w", d: "G91 G0 X5\n" })); }, 300); setTimeout(() => { ws.close(); resolve({ open: true, got }); }, 1200); }; ws.onerror = () => resolve({ open: false, got }); }), BPORT);
  await sleep(500); const ser = fs.readFileSync(out, "latin1");
  t.check(`Pi bridge rejects a WebSocket from a foreign web origin (${aorigin})`, !res.open, `connected=${res.open}; hello=${res.got[0]}`, "BRIDGE-ORIGIN");
  t.check("Pi bridge: foreign page could NOT make the controller receive 'M3' (torch on)", !/M3/.test(ser), `controller received: ${JSON.stringify(ser)}`, "BRIDGE-ORIGIN");
  // takeover: a second socket kicks the operator's screen mid-session
  const take = await pg.evaluate((port) => new Promise((resolve) => { const a = new WebSocket("ws://127.0.0.1:" + port + "/ws"); let taken = false; a.onmessage = (e) => { if (JSON.parse(e.data).t === "taken") taken = true; }; a.onopen = () => { const b = new WebSocket("ws://127.0.0.1:" + port + "/ws"); b.onopen = () => setTimeout(() => { resolve(taken); a.close(); b.close(); }, 600); }; a.onerror = () => resolve("blocked"); }), BPORT);
  t.check("Pi bridge: a second (unauthenticated) client cannot silently take over the operator's session", take !== true, `taken=${take}`, "BRIDGE-TAKEOVER");
  const bj = await pg.evaluate((port) => fetch("http://127.0.0.1:" + port + "/bridge.json").then((r) => r.text()).catch((e) => "blocked:" + e.message), BPORT);
  t.note("cross-origin fetch of /bridge.json from foreign origin (info leak: machine name, serial state)", bj.slice(0, 120));
  // raw-lines path: unsafe codes through 'w'
  t.check("Pi bridge: auth token / shared secret required", /token|auth|secret/i.test(fs.readFileSync(SITE + "pi/bridge.py", "utf8")), "bridge.py has no auth of any kind; it listens on 0.0.0.0:80", "BRIDGE-AUTH");
  t.check("Pi bridge: site is served over http, so ws:// is plain-text on the LAN (no TLS) — documented/accepted?", /wss|tls|ssl/i.test(fs.readFileSync(SITE + "pi/bridge.py", "utf8")), "no TLS option", "BRIDGE-TLS");
  const ws = readJs("grbl").match(/ws:\/\/[^"'`]*|wss:\/\/[^"'`]*/g); t.note("ws URLs in grbl.js", JSON.stringify(ws));
  const app = allJsText().map((x) => x[1]).join("\n"); t.note("how the bridge URL is chosen", (app.match(/new WifiLink\([^)]*\)|location\.host[^;]*|ws:\/\/[^;]*/g) || []).join(" | ").slice(0, 300));
  await ctx.close(); attacker.close();
} finally { fc.kill("SIGTERM"); await sleep(300); fs.rmSync("/tmp/bridge_local.py", { force: true }); }
K.kill(); await srv.close(); process.exit(t.done() ? 1 : 0);

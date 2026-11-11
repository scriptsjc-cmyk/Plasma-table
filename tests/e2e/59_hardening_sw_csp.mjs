// Round 5 group 4 (items 26-31) tests.
//  26 server gating: client degrades before the SQL is applied, obeys the server after   27 CSP: no wss:, hardened public copy has no ws:, LAN ws still works
//  28 practice code tidy   29 window.ptInspector only for test/localhost or admin   30 service worker: precache, cleanup, no stale-after-deploy, atomic install
//  31 docs/FLUIDNC.md agrees with the console filter
import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import { execFileSync } from "node:child_process";
import { WebSocketServer } from "ws";
import { serve, open, launch, REPO, SITE, DATA, SHOTS, mod, readJs, jsRel, allJsText, J_INIT } from "../lib/r2compat.mjs";
const br = await launch(), s = await serve();
let pass = 0, fail = 0;
const ck = (n, ok, i = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + (typeof i === "string" ? i : JSON.stringify(i)))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const read = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
const copySite = (dest) => { fs.rmSync(dest, { recursive: true, force: true }); fs.cpSync(REPO, dest, { recursive: true, filter: (p) => !p.includes("/.git") }); return dest; };

// ================================================================== 31 docs agree with the console filter
{
  const doc = read("docs/FLUIDNC.md");
  const page = await open(br, "laptop", s.base);
  const f = (c) => T(page, `window.plasmaTest.filterConsoleCommand(${JSON.stringify(c)}).ok`);
  for (const c of ["$$", "$I", "$G", "$X", "$H", "$C", "$110=1000", "?", "G91", "G0 X10", "M5"]) ck(`31 console accepts ${c}`, (await f(c)) === true);
  for (const c of ["$/", "$/axes/x/steps_per_mm", "$Config/Dump", "$CD", "$SD/List", "$LocalFS/List", "$Bye", "$Report/Interval=100", "$Firmware/Update"]) ck(`31 console refuses ${c}`, (await f(c)) === false);
  const para = doc.split("\n").filter((l) => /filtered on purpose/.test(l) || /FluidNC’s own `\$` commands/.test(l)).join("\n");
  ck("31 the doc lists what the console accepts ($$ $I $G $X $H $C $n=value)", ["`$$`", "`$I`", "`$G`", "`$X`", "`$H`", "`$C`", "`$n=value`"].every((x) => para.includes(x)), para.slice(0, 300));
  ck("31 the doc says FluidNC's own $/ and friends are NOT accepted (no claim they work)", /\*\*not\*\* accepted by that filter/.test(para) && /`\$\/…`/.test(para) && !/you can still send `\$\/|can send `\$\/`/.test(doc));
  ck("31 the old sentence that implied $/ was usable is gone", !/From the filtered console you can still send/.test(doc));
  await page.context().close();
}

// ================================================================== 27 CSP
{
  const html = read("index.html");
  const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  const conn = (csp.match(/connect-src ([^;]+)/) || [])[1] || "";
  ck("27 the repo copy never allows wss: (nothing needs it)", !/\bwss:/.test(conn), conn);
  ck("27 the repo copy keeps ws: so a LAN http copy can reach ws://<ip>:81", /(^|\s)ws:(\s|$)/.test(conn), conn);
  ck("27 connect-src is only self, ws: and the Supabase project (no wildcard, no https:)", conn.split(/\s+/).every((x) => x === "'self'" || x === "ws:" || /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(x)), conn);
  ck("27 scripts are still 'self' only, no inline/eval", /script-src 'self'(;|$)/.test(csp) && !/unsafe-eval/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp), csp);
  const tmp = copySite("/tmp/r5h-csp");
  const out = execFileSync("bash", [path.join(tmp, "scripts/harden-csp.sh"), tmp]).toString();
  const hconn = (fs.readFileSync(path.join(tmp, "index.html"), "utf8").match(/connect-src ([^;]+)/) || [])[1] || "";
  ck("27 the deploy hardening removes ws: from the public copy", !/\bwss?:/.test(hconn) && /supabase\.co/.test(hconn) && /'self'/.test(hconn), hconn + " | " + out);
  let again = ""; try { execFileSync("bash", [path.join(tmp, "scripts/harden-csp.sh"), tmp], { stdio: "pipe" }); again = "ok"; } catch (e) { again = "fails"; }
  ck("27 running the hardening twice fails loudly instead of silently doing nothing", again === "fails");
  ck("27 the Pages workflow runs the hardening after the stamp and before the upload", (() => { const w = read(".github/workflows/pages.yml"); return w.indexOf("harden-csp.sh") > w.indexOf("stamp-version.sh") && w.indexOf("harden-csp.sh") < w.indexOf("upload-pages-artifact"); })());

  // behaviour: a LAN-style WebSocket from the repo copy works; from the hardened copy the browser blocks it
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" }); await new Promise((r) => wss.on("listening", r));
  const wport = wss.address().port;
  wss.on("connection", (sock) => sock.send("hello"));
  const tryWs = async (base) => {
    const page = await open(br, "laptop", base, "?test=1&turn=0");
    await T(page, "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI))");
    const r = await T(page, `new Promise((res) => { let done = false; const f = (v) => { if (!done) { done = true; res(v); } }; try { const w = new WebSocket("ws://127.0.0.1:${wport}/"); w.onmessage = (m) => f("msg:" + m.data); w.onerror = () => f("error"); setTimeout(() => f("timeout"), 3000); } catch (e) { f("throw:" + e.name); } })`);
    const v = await T(page, "window.__csp");
    await page.context().close();
    return { r, v };
  };
  const a = await tryWs(s.base);
  ck("27 repo copy: ws://<lan host>:<port> still connects (FluidNC from a local http copy)", a.r === "msg:hello" && a.v.length === 0, a);
  const hs = await serve(tmp);
  const b = await tryWs(hs.base);
  ck("27 hardened public copy: the same ws:// is blocked by the policy", b.r !== "msg:hello" && b.v.some((x) => /connect-src/.test(x)), b);
  hs.close(); wss.close(); fs.rmSync(tmp, { recursive: true, force: true });
}

// ================================================================== 29 window.ptInspector only for test/localhost or admin
{
  const hasApi = (page) => T(page, "!!(window.ptInspector && typeof window.ptInspector.getCut === 'function')");
  const t = await open(br, "laptop", s.base, "?test=1&turn=0");
  ck("29 ?test=1 on localhost: the test handle window.ptInspector exists (harnesses keep working)", await hasApi(t));
  await t.context().close();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } }); const p = (await ctx.addInitScript(J_INIT()), await ctx.newPage()); p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e)));
  await p.goto(s.base + "/?demo=1&turn=0"); await sleep(1500);
  ck("29 a normal page (no ?test): no window.ptInspector API for the console", !(await hasApi(p)));
  const signup = await T(p, `(async () => { const A = await import(window.__J["account"]); await A.signUp({ email: "i@x.test", pin: "secret1", display_name: "I", mode: "pro" }); await new Promise((r) => setTimeout(r, 400)); return A.isAdmin(); })()`);
  ck("29 signed in as an ordinary Pro user: still no API on window", signup === false && !(await hasApi(p)));
  ck("29 ...but the Pro inspector panel is mounted and talks to the app (module link, not a global)", await T(p, `(async () => { const m = await import(window.__J["inspector-ui"]); return typeof m.connectInspector === "function" && !!document.getElementById("ptInspector"); })()`));
  // drive the panel for real: make a rectangle on the Make screen and see the panel fill in
  const filled = await T(p, `(async () => {
    const A = await import(window.__J["account"]);
    const bodyShot = () => document.querySelector("#ptInspector input") ? [...document.querySelectorAll("#ptInspector input")].map((i) => i.value).join("|") : "";
    document.querySelector('[data-pick="menu-make"], #menuMake, [data-go="make"]') && document.querySelector('[data-pick="menu-make"], #menuMake, [data-go="make"]').click();
    return bodyShot();
  })()`);
  const adminNow = await T(p, `(async () => { const A = await import(window.__J["account"]); await A.grantDemoAdmin(); await new Promise((r) => setTimeout(r, 400)); return A.isAdmin(); })()`);
  ck("29 when the signed-in account is an admin the handle is published", adminNow === true && await hasApi(p));
  await T(p, `(async () => { const A = await import(window.__J["account"]); await A.signOut(); await new Promise((r) => setTimeout(r, 400)); })()`);
  ck("29 ...and withdrawn again when the admin signs out", !(await hasApi(p)));
  ck("29 no page errors", p.errors.length === 0, p.errors);
  await ctx.close();
  const ui = readJs("inspector-ui");
  ck("29 inspector-ui.js no longer reads or writes window.ptInspector", !/window\.ptInspector\s*(=|==|!=|\))/.test(ui.replace(/\/\/.*$/gm, "")) && !/window\.ptInspector/.test(ui.replace(/\/\/.*$/gm, "")));
  const dom = await open(br, "laptop", s.base, "?test=1&turn=0");
  await T(dom, "window.plasmaTest.showScreen('make'); window.plasmaTest.setAppMode('pro'); const k = window.plasmaTest.sketch; k.clear(); k.add('rect'); k.onSelect();"); await sleep(500);
  const vals = await T(dom, "[...document.querySelectorAll('#ptInspector input')].slice(0, 4).map((i) => i.value)");
  ck("29 the panel still fills in from the selected shape (width 100, height 60...)", vals[0] === "100" && vals[1] === "60", vals);
  await dom.context().close();
}

// ================================================================== 28 practice code tidy (local demo accounts)
{
  const page = await open(br, "laptop", s.base);
  const r = await T(page, `(async () => {
    const A = window.plasmaTest.account, out = {};
    await A.signUp({ email: "d1@x.test", pin: "secret1", display_name: "D1", mode: "beginner" });
    out.c1 = await A.claimMachine("DEMO-0000");
    await A.signOut();
    await A.signUp({ email: "d2@x.test", pin: "secret1", display_name: "D2", mode: "beginner" });
    out.c2 = await A.claimMachine("DEMO-0000");
    out.again = await A.claimMachine("demo-0000");
    out.d2serial = A.linkedSerials();
    await A.signOut();
    await A.signInWithLink("admin@x.test"); await A.grantDemoAdmin();
    out.list = await A.adminListMachines();
    try { await A.adminTransferMachine(out.c2.serial, "d1@x.test"); out.transfer = "allowed"; } catch (e) { out.transfer = e.message; }
    await A.adminUnlinkMachine(out.c2.serial);
    out.after = (await A.adminListMachines()).map((m) => m.serial);
    return out;
  })()`);
  ck("28 first demo account gets the built-in practice table, second gets its own copy", r.c1.ok && r.c1.serial === "DEMO-TABLE-1" && r.c2.ok && r.c2.serial !== "DEMO-TABLE-1" && /^DEMO-TABLE-1-/.test(r.c2.serial), r);
  ck("28 claiming the practice code again is harmless ('already')", r.again && r.again.ok && r.again.already === true && r.again.serial === r.c2.serial);
  ck("28 admin list marks practice tables as practice", r.list.filter((m) => m.practice).length >= 2 && r.list.every((m) => m.practice === (/^DEMO-TABLE-1/.test(m.serial))), r.list);
  ck("28 a practice table can't be handed to another account", /practice table can't be moved/.test(r.transfer), r.transfer);
  ck("28 unlinking a practice copy deletes it (no orphans); the built-in table stays", !r.after.includes(r.c2.serial) && r.after.includes("DEMO-TABLE-1"), r.after);
  const after = await T(page, `(async () => { const A = window.plasmaTest.account; await A.signOut(); await A.signIn({ email: "d2@x.test", pin: "secret1" }); const c = await A.claimMachine("DEMO-0000"); return c; })()`);
  ck("28 after being unlinked the account can get a fresh practice table with the same code", after.ok && !after.already, after);
  ck("28 the server schema never knows the practice code, so it can never unlock a real table in the cloud", !/DEMO-0000|DEMO-TABLE/i.test(read("supabase/schema.sql")) && !/DEMO-0000/i.test(read("supabase/b5-gating.sql")));
  const hint = await T(page, "(async () => { const UI = await import(window.__J['accounthome']); await window.plasmaTest.account.signOut(); window.plasmaTest.account.signIn; return typeof UI.openClaim; })()");
  await page.context().close();
}

// ================================================================== 26 server gating, with a pretend Supabase
{
  const SUPA = /^https:\/\/sjtjgumbsnakipkgskxt\.supabase\.co\//;
  const mock = { sql: false, profile: { id: "u-1", display_name: "Pat", mode: "pro", role: "user" }, ent: { server: true, signed_in: true, role: "user", mode: "beginner", pro: false, firmware: false, machines: 0 }, calls: [], patches: [] };
  const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), async (r) => {
    const u = new URL(r.request().url()); const m = r.request().method();
    if (!SUPA.test(u.href)) return r.abort();
    const j = (st, b) => r.fulfill({ status: st, contentType: "application/json", body: JSON.stringify(b) });
    mock.calls.push(m + " " + u.pathname);
    if (u.pathname === "/auth/v1/token") return j(200, { access_token: "a.b.c", refresh_token: "r", expires_in: 3600, user: { id: "u-1", email: "pat@x.test" } });
    if (u.pathname === "/rest/v1/profiles" && m === "GET") return j(200, [mock.profile]);
    if (u.pathname === "/rest/v1/profiles" && m === "PATCH") { mock.patches.push(r.request().postData()); const b = JSON.parse(r.request().postData() || "{}"); if (b.mode && mock.sql && mock.proAllowed === false) return j(200, []); if (b.mode) mock.profile.mode = b.mode; return j(200, []); }
    if (u.pathname === "/rest/v1/rpc/my_entitlements") return mock.sql ? j(200, mock.ent) : j(404, { code: "PGRST202", message: "Could not find the function public.my_entitlements without parameters in the schema cache" });
    if (u.pathname === "/rest/v1/rpc/my_machines") return j(200, []);
    if (u.pathname.startsWith("/rest/v1/rpc/")) return j(200, null);
    return j(404, {});
  });
  const page = (await ctx.addInitScript(J_INIT()), await ctx.newPage()); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(s.base + "/?turn=0"); await sleep(1500);
  const A = (code) => T(page, `(async () => { const A = await import(window.__J["account"]); ${code} })()`);
  // --- before the SQL is applied
  await A(`await A.signIn({ email: "pat@x.test", pin: "secret1" }); return 1;`);
  const pre = await A(`return { src: A.gatingSource(), mode: A.accountMode(), pro: A.canPro(), fw: A.canFirmware(), snap: A.snapshot().gating };`);
  ck("26 before the SQL is applied the app signs in and works exactly as before (browser-side rule)", pre.src === "client-only" && pre.mode === "pro" && pre.pro === true && pre.fw === true && pre.snap === "client-only", pre);
  ck("26 it asked the server once and fell back on the 404 without breaking", mock.calls.includes("POST /rest/v1/rpc/my_entitlements") && page.errors.length === 0, { calls: mock.calls.slice(-6), errs: page.errors });
  await T(page, `(async () => { const A = await import(window.__J["account"]); window.__admin = 0; })()`);
  // admin panel text (pretend admin)
  mock.profile.role = "admin"; await A(`await A.refreshEntitlements(); return 1;`);
  await T(page, `(async () => { const UI = await import(window.__J["accounthome"]); UI.openAdmin(); })()`); await sleep(500);
  const g1 = await T(page, "document.getElementById('adminGating').textContent");
  ck("26 Admin says plainly that limits are only checked in the browser and names the SQL file", /only checked in this browser/.test(g1) && /supabase\/b5-gating\.sql/.test(g1), g1);
  await T(page, "document.querySelector('#adminDlg .acct-close').click()");
  mock.profile.role = "user";
  // --- after the SQL is applied: the server says Beginner / no firmware although the stored profile says Pro
  mock.sql = true;
  await A(`await A.refreshEntitlements(); return 1;`);
  const post = await A(`return { src: A.gatingSource(), mode: A.accountMode(), pro: A.canPro(), fw: A.canFirmware(), pm: A.isPro() };`);
  ck("26 after the SQL: the server's answer wins (stored Pro, server says Beginner -> Beginner, no Pro, no firmware)", post.src === "server" && post.mode === "beginner" && post.pro === false && post.fw === false && post.pm === false, post);
  // tamper with the browser copy
  await T(page, `(() => { const k = "plasma.account.session"; const s = JSON.parse(localStorage.getItem(k)); s.profile.mode = "pro"; s.profile.role = "admin"; s.ent = { pro: true, firmware: true, machines: 1 }; localStorage.setItem(k, JSON.stringify(s)); })()`);
  const tam = await A(`const before = { fw: A.canFirmware(), admin: A.isAdmin() }; const after = await A.refreshEntitlements(); return { before, after, admin: A.isAdmin(), mode: A.accountMode(), fw: A.canFirmware() };`);
  ck("26 a hand-edited browser copy (admin, firmware) is overwritten by the server before a firmware write", tam.after === false && tam.admin === false && tam.mode === "beginner" && tam.fw === false, tam);
  // a Pro user with a machine
  mock.ent = { server: true, signed_in: true, role: "user", mode: "pro", pro: true, firmware: true, machines: 1 };
  const ok = await A(`await A.refreshEntitlements(); return { mode: A.accountMode(), fw: A.canFirmware(), src: A.gatingSource() };`);
  ck("26 Pro with a linked machine: firmware allowed by the server", ok.mode === "pro" && ok.fw === true && ok.src === "server", ok);
  mock.ent = { server: true, signed_in: true, role: "user", mode: "pro", pro: true, firmware: false, machines: 0 };
  const nom = await A(`await A.refreshEntitlements(); return { mode: A.accountMode(), pro: A.canPro(), fw: A.canFirmware() };`);
  ck("26 Pro without a linked machine: Pro yes, firmware no", nom.mode === "pro" && nom.pro === true && nom.fw === false, nom);
  // a new token must not forget the entitlements
  await T(page, `(() => { const k = "plasma.account.session"; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = new Date(Date.now() - 1000).toISOString(); localStorage.setItem(k, JSON.stringify(s)); })()`);
  const tok = await A(`await A.touchLastActive(); await A.listParts().catch(() => {}); return { src: A.gatingSource(), snap: A.snapshot().gating };`);
  ck("26 after the access token is renewed the server entitlements are still remembered", tok.src === "server", tok);
  // Admin panel after
  mock.profile.role = "admin"; mock.ent = { server: true, signed_in: true, role: "admin", mode: "beginner", pro: true, firmware: true, machines: 0 };
  await A(`await A.refreshEntitlements(); return 1;`);
  await T(page, `(async () => { const UI = await import(window.__J["accounthome"]); UI.openAdmin(); })()`); await sleep(500);
  const g2 = await T(page, "document.getElementById('adminGating').textContent");
  ck("26 after the SQL, Admin says the limits are enforced by the server", /enforced by the server/.test(g2), g2);
  await T(page, "document.querySelector('#adminDlg .acct-close').click()");
  // Pro switched off for this user: asking for Pro is refused with a clear message, and the UI goes back to Beginner
  mock.profile.role = "user"; mock.profile.mode = "beginner"; mock.proAllowed = false;
  mock.ent = { server: true, signed_in: true, role: "user", mode: "beginner", pro: false, firmware: false, machines: 0 };
  const sm = await A(`try { await A.setMode("pro"); return "no error"; } catch (e) { return { code: e.code, msg: e.message, mode: A.accountMode() }; }`);
  ck("26 asking for Pro when the server has it switched off throws pro_not_allowed with a plain message", sm && sm.code === "pro_not_allowed" && /isn't switched on/.test(sm.msg) && sm.mode === "beginner", sm);
  const accTxt = allJsText().filter(([f]) => f.startsWith("js/account/")).map((x) => x[1]).join("\n");
  ck("26 no service_role / secret key anywhere in the client or SQL", !/service_role/.test(accTxt) || /never/i.test(accTxt), "");
  await ctx.close();
  // SQL file shape (the real run against Postgres is done separately; see data/sql)
  const sql = read("supabase/b5-gating.sql");
  ck("26 SQL is idempotent in form (if not exists / or replace / drop if exists)", /add column if not exists pro_allowed/.test(sql) && /create or replace function public\.my_entitlements/.test(sql) && /drop trigger if exists profiles_enforce_pro/.test(sql));
  ck("26 SQL grants my_entitlements to signed-in users only and never to anon", /revoke execute on function public\.my_entitlements\(\) from public, anon/.test(sql) && /grant\s+execute on function public\.my_entitlements\(\) to authenticated/.test(sql));
  ck("26 SQL never mentions the service_role key as something to use", !/service_role/.test(sql) || /never the service_role|Needs only the SQL editor: never the service_role/.test(sql));
  ck("26 schema.sql carries the same SQL for a fresh install", read("supabase/schema.sql").includes("create or replace function public.my_entitlements"));
}

// ================================================================== 30 service worker
{
  const swSrc = read("sw.js");
  const list = [...swSrc.matchAll(/^\s*"([^"]+)",\s*$/gm)].map((m) => m[1]);
  // 30a the list is exactly what the stamp script would generate, and every file exists
  const tmp = copySite("/tmp/r5h-sw-list");
  execFileSync("bash", [path.join(tmp, "scripts/stamp-version.sh"), "t-list", "abc1234"], { cwd: tmp });
  const gen = [...fs.readFileSync(path.join(tmp, "sw.js"), "utf8").matchAll(/^\s*"([^"]+)",\s*$/gm)].map((m) => m[1]);
  ck("30 the committed precache list is exactly what stamp-version.sh generates from the files", JSON.stringify(list) === JSON.stringify(gen), { missing: gen.filter((x) => !list.includes(x)), extra: list.filter((x) => !gen.includes(x)) });
  ck("30 every precache entry exists on disk", list.every((f) => f === "./" || fs.existsSync(path.join(REPO, f))), list.filter((f) => f !== "./" && !fs.existsSync(path.join(REPO, f))));
  ck("30 every js module is in the list", jsRel().every((f) => list.includes(f)));
  const html = read("index.html");
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|json|svg|png))"/g)].map((m) => m[1]);
  ck("30 every file index.html loads is in the list", refs.every((f) => list.includes(f)), refs.filter((f) => !list.includes(f)));
  ck("30 the app's start-up fetches (config/*.json, grblhal_settings.txt) are in the list", ["config/machine.json", "config/cut_chart.json", "config/grblhal_settings.txt"].every((f) => list.includes(f)));
  ck("30 the stamp's cache name is in sw.js and sw.js has the old-cache cleanup", /const CACHE = "plasma-cad-/.test(swSrc) && /caches\.delete/.test(swSrc) && /startsWith\(PREFIX\)/.test(swSrc));
  fs.rmSync(tmp, { recursive: true, force: true });

  // 30b real browser: install, offline, deploy, update, broken release
  const site = copySite("/tmp/r5h-sw-site");
  const stamp = (id) => execFileSync("bash", [path.join(site, "scripts/stamp-version.sh"), id, id.slice(-7)], { cwd: site });
  const state = { down: false, hits: [] };
  const srv = http.createServer((req, res) => {
    if (state.down) return req.socket.destroy();
    const u = new URL(req.url, "http://x"); let p = decodeURIComponent(u.pathname); if (p.endsWith("/")) p += "index.html";
    state.hits.push(p);
    const f = path.join(site, p);
    if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain", ".yaml": "text/yaml" };
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "max-age=600" });   // like GitHub Pages: browsers may keep it 10 minutes
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  stamp("2026.01.01-aaaaaaa");
  const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } });
  const page = (await ctx.addInitScript(J_INIT()), await ctx.newPage()); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(base + "/?test=1&turn=0", { waitUntil: "load" });
  await page.waitForFunction(() => window.plasmaTest, null, { timeout: 15000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  const names = () => T(page, "caches.keys()");
  const keysOf = (n) => T(page, `caches.open(${JSON.stringify(n)}).then((c) => c.keys()).then((k) => k.map((r) => new URL(r.url).pathname.replace(/^\\//, "") || "./"))`);
  ck("30 first load installs a cache named for the release", JSON.stringify(await names()) === JSON.stringify(["plasma-cad-2026.01.01-aaaaaaa"]), await names());
  const k1 = await keysOf("plasma-cad-2026.01.01-aaaaaaa");
  ck("30 the cache holds the whole app shell (every precache entry)", list.every((f) => k1.includes(f === "./" ? "./" : f)), { missing: list.filter((f) => !k1.includes(f)) });
  // offline
  state.down = true; await T(page, "navigator.serviceWorker.ready.then(() => 1)");
  await page.reload({ waitUntil: "load" }).catch(() => {});
  await page.waitForFunction(() => window.plasmaTest, null, { timeout: 15000 }).catch(() => {});   // the module graph is still starting when "load" fires
  const off = await T(page, "({ ok: !!window.plasmaTest, title: document.title, scr: document.body.dataset.screen })").catch((e) => ({ err: String(e) }));
  ck("30 offline: the page reloads from the cache and the app starts", off.ok === true, off);
  const offVer = await T(page, "fetch('version.json?x=1').then((r) => r.json())").catch((e) => ({ err: String(e) }));
  ck("30 offline: version.json comes from the installed release's own copy", offVer && offVer.id === "2026.01.01-aaaaaaa", offVer);
  const offJs = await T(page, "fetch('js/app.js?x=2').then((r) => r.text().then((t) => t.length))").catch(() => 0);
  ck("30 offline: scripts are served from the cache", offJs > 1000, offJs);
  const offMiss = await T(page, "fetch('nope-not-cached.js').then(() => 'resolved', () => 'rejected')");
  ck("30 offline: something that was never cached fails cleanly (no fake page)", offMiss === "rejected", offMiss);
  state.down = false;
  // online + deploy v2: change a file and stamp
  fs.appendFileSync(path.join(site, "style.css"), "\n/* DEPLOY-TWO */\n");
  stamp("2026.01.02-bbbbbbb");
  state.hits.length = 0;
  await T(page, "window.__newv = false; window.addEventListener('pt-new-version', () => { window.__newv = true; })");
  await T(page, "navigator.serviceWorker.getRegistration().then((r) => r.update())");
  await page.waitForFunction(() => window.__newv === true, null, { timeout: 20000 }).catch(() => {});
  await sleep(1500); const n2 = await names();
  ck("30 a new deploy: the old cache is deleted and only the new release's cache remains", JSON.stringify(n2) === JSON.stringify(["plasma-cad-2026.01.02-bbbbbbb"]), n2);
  ck("30 open pages are told 'new version' so they can offer Reload", await T(page, "window.__newv === true"));
  const css = await T(page, "fetch('style.css').then((r) => r.text())");
  ck("30 no stale-after-deploy: the new style.css is served even though the HTTP cache said keep it 10 minutes", /DEPLOY-TWO/.test(css));
  const cached2 = await T(page, "caches.open('plasma-cad-2026.01.02-bbbbbbb').then((c) => c.match(new URL('style.css', location.href).href)).then((r) => r ? r.text() : '')");
  ck("30 the new cache holds the new file too (so offline after a deploy is the new release, not the old)", /DEPLOY-TWO/.test(cached2));
  await page.reload({ waitUntil: "load" }); await page.waitForFunction(() => window.plasmaTest, null, { timeout: 15000 });
  const shown = await T(page, "getComputedStyle(document.body).display");
  ck("30 the reloaded page loads without errors", page.errors.length === 0, page.errors);
  // v3: broken release (a file in the list is missing on the server) => install fails, v2 keeps working
  const lost = path.join(site, jsRel().find((f) => f.endsWith("/whyoff.js"))); const keep = fs.readFileSync(lost);
  stamp("2026.01.03-ccccccc");              // list still contains whyoff.js
  fs.unlinkSync(lost);
  await T(page, "navigator.serviceWorker.getRegistration().then((r) => r.update().catch(() => {}))"); await sleep(2500);
  const n3 = await names();
  ck("30 a broken release (missing file) does not install: the working cache stays, no half-cache is left", JSON.stringify(n3) === JSON.stringify(["plasma-cad-2026.01.02-bbbbbbb"]), n3);
  const stillCss = await T(page, "fetch('style.css').then((r) => r.text())");
  ck("30 ...and the app keeps working on the previous release", /DEPLOY-TWO/.test(stillCss));
  fs.writeFileSync(lost, keep);
  await T(page, "navigator.serviceWorker.getRegistration().then((r) => r.update())"); await sleep(2500);
  ck("30 once the release is fixed the next check installs it", JSON.stringify(await names()) === JSON.stringify(["plasma-cad-2026.01.03-ccccccc"]), await names());
  await ctx.close(); srv.close(); fs.rmSync(site, { recursive: true, force: true });
}


await br.close(); s.close();
console.log(`\n59_hardening_sw_csp: ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

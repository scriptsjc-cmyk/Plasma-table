// Accounts-build security checks in a real browser. NO real network: the Supabase project is a local route stub,
// "the live site" is a fake host served from the local copy. Never touches a real device or the live project.
import { allJsText } from "../lib/site.mjs"; import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, enterDemo, SITE, PROFILES } from "../lib/browser.mjs";
import fs from "node:fs"; import path from "node:path";
const t = new T("50_accounts_security");
const srv = await startServer(); const K = await launchKillable();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SB = "https://sjtjgumbsnakipkgskxt.supabase.co";
const FAKE = process.env.FAKE_HTTP ? "http://fake-live.example" : "https://fake-live.example";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const USERS = { "a@x.com": { id: "11111111-1111-4111-8111-111111111111", serials: ["T-1"] }, "b@x.com": { id: "22222222-2222-4222-8222-222222222222", serials: [] } };
function stubSupabase(ctx, state) {
  return ctx.route((u) => u.href.startsWith(SB), async (r) => {
    const req = r.request(); const u = new URL(req.url()); const body = req.postData() ? JSON.parse(req.postData()) : {};
    state.calls.push(req.method() + " " + u.pathname + u.search);
    const json = (o, s = 200) => r.fulfill({ status: s, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const bearer = (req.headers()["authorization"] || "").replace("Bearer ", ""); const me = Object.entries(USERS).find(([, v]) => "tok-" + v.id === bearer);
    if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "password") {
      const us = USERS[body.email]; if (!us || body.password !== "letmein1") return json({ msg: "Invalid login credentials" }, 400);
      return json({ access_token: "tok-" + us.id, refresh_token: "ref", expires_in: 3600, user: { id: us.id, email: body.email } });
    }
    if (u.pathname === "/auth/v1/user") { return me ? json({ id: me[1].id, email: me[0], aud: "authenticated" }) : json({ msg: "bad jwt" }, 401); }
    if (u.pathname === "/auth/v1/logout") return json({});
    if (u.pathname === "/rest/v1/profiles") return me ? json([{ id: me[1].id, display_name: "N", mode: "beginner", role: "user" }]) : json([]);
    if (u.pathname === "/rest/v1/rpc/my_machines") { if (state.myMachinesFail) return json({ msg: "down" }, 503); return me ? json(me[1].serials.map((s) => ({ serial: s }))) : json({ message: "permission denied" }, 401); }
    if (u.pathname === "/rest/v1/rpc/claim_machine") return json({ ok: false, error: "That code is not recognised." });   // what the fixed server returns
    if (u.pathname === "/rest/v1/parts") return json([]);
    return json({}, 404);
  });
}
async function ctxFor(mode, base) {
  const ctx = await K.browser.newContext({ ...PROFILES.desktop, acceptDownloads: true, serviceWorkers: "block" });
  await ctx.addInitScript(`window.__net={ws:[],serial:[]};const _W=window.WebSocket;window.WebSocket=function(u,p){window.__net.ws.push(String(u));return new _W(u,p)};Object.assign(window.WebSocket,_W);window.WebSocket.prototype=_W.prototype;
    window.__serialCalls=0; try{ Object.defineProperty(navigator,'serial',{value:{requestPort:()=>{window.__net.serial.push('requestPort');return Promise.reject(new DOMException('x','NotFoundError'))},getPorts:()=>Promise.resolve([]),addEventListener(){}} ,configurable:true}) }catch(e){}`);
  const state = { calls: [], myMachinesFail: false };
  if (mode === "stub") await stubSupabase(ctx, state);
  if (base === FAKE) await ctx.route((u) => u.href.startsWith(FAKE), (r) => {
    let p = decodeURIComponent(new URL(r.request().url()).pathname); if (p.endsWith("/")) p += "index.html";
    const f = path.join(SITE, p); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "nf" });
    r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  const page = await ctx.newPage(); page.errors = []; page.msgs = [];
  page.on("pageerror", (e) => page.errors.push(String(e))); page.on("console", (m) => page.msgs.push(m.text()));
  return { ctx, page, state };
}
const toastText = (p) => p.locator("#toast").innerText().catch(() => "");
const scr = (p) => p.evaluate(() => document.body.dataset.screen);
const closeDialogs = (p) => p.evaluate(() => document.querySelectorAll(".acctdlg").forEach((d) => d.classList.add("hidden")));
const linkedText = (p) => p.locator("#menuMachine").innerText().catch(() => "");
const NC = "G21 G90\nG0 X10 Y10\nM3\nG1 X40 Y10 F1500\nG1 X40 Y30\nG1 X10 Y30\nG1 X10 Y10\nM5\nM30\n";
// round 4: nothing works until someone is signed in. The sign-in page IS the account dialog as a full page; after sign-in you land on the main menu.
async function signupDemo(p, email) {
  await p.waitForSelector("#goSignUp", { state: "visible" }); await p.click("#goSignUp");
  await p.fill("#upName", "Demo"); await p.fill("#upEmail", email); await p.fill("#upPin", "letmein1"); await p.click("#formSignUp [type=submit]"); await sleep(900);
}
async function signIn(p, email, pw = "letmein1") {
  await p.waitForSelector("#inEmail", { state: "visible" }); await p.fill("#inEmail", email); await p.fill("#inPin", pw); await p.click("#formSignIn [type=submit]"); await sleep(900);
}
async function claim(p, code) {   // main menu -> account pill -> "Link a machine"
  if (await p.locator("#migrateDlg:not(.hidden)").count()) await p.click("#migrateNo");
  await closeDialogs(p);
  await p.click("#acctPill"); await p.waitForSelector("#accountDlg:not(.hidden)"); await p.click("#btnOpenClaim");
  await p.waitForSelector("#claimDlg:not(.hidden)"); await p.fill("#claimCode", code); await p.click("#formClaim [type=submit]"); await sleep(900);
}
async function toBed(p) {   // menu -> Go to cutting -> upload ready-made G-code -> the bed step (where Connect and Practice live). Works with no test hook (live host).
  await closeDialogs(p); await p.click("#menuCut"); await p.waitForSelector("#file", { state: "attached" });
  await p.setInputFiles("#file", { name: "sq.nc", mimeType: "text/plain", buffer: Buffer.from(NC) }); await p.waitForSelector("#btnDemo", { state: "visible", timeout: 10000 });
}
try {
  // ---- 1. ?demo=1 on the "live" host (cloud backend configured): a fake local link must NOT unlock real hardware
  {
    const { page: p } = await ctxFor("none", FAKE); await p.goto(FAKE + "/?demo=1", { waitUntil: "load" }); await sleep(1500);
    t.check("live host, signed out: the first screen is the sign-in page (the gate), not the app", (await scr(p)) === "login", await scr(p), "GATE");
    t.check("?demo=1 on live host uses the browser-only demo store (demo banner)", await p.locator("#demoAcctBar:not(.hidden)").count() === 1);
    await signupDemo(p, "demo@x.com");
    t.check("demo sign-up lands on the main menu", (await scr(p)) === "menu", await scr(p), "ACCOUNTS");
    await claim(p, "DEMO-0000");
    t.check("DEMO-0000 claim links the practice table in the demo store", /Linked/i.test(await toastText(p)) && /linked/i.test(await linkedText(p)), `${await toastText(p)} | ${await linkedText(p)}`);
    await toBed(p);
    // KNOWN APP BUG #1 (tests/KNOWN-BUGS.md): js/app.js:1907 classList.toggle("hidden", on || (id==="btnConnect" && S.noUsb)) passes undefined as "force" when S.noUsb is unset,
    // which FLIPS the class instead of clearing it, so the Connect button is hidden on a fresh load of a USB-capable browser. The click below is done from script so the rest of the suite still runs.
    t.check("Connect is visible on the bed step of a USB-capable browser while disconnected", await p.locator("#btnConnect").isVisible(), "", "BUG-1-CONNECT-HIDDEN");
    await p.evaluate(() => document.getElementById("btnConnect").click()); await sleep(500);
    const net = await p.evaluate(() => window.__net);
    t.check("demo-linked account: Connect does NOT open Web Serial on the live host", net.serial.length === 0, JSON.stringify(net), "DEMO-REAL");
    t.check("demo-linked account: Connect shows the 'demo accounts can't control a real machine' message", /demo accounts can't control a real machine/i.test(await toastText(p)), await toastText(p), "DEMO-REAL");
    t.check("no WebSocket was opened", net.ws.length === 0, JSON.stringify(net.ws), "DEMO-REAL");
    await p.evaluate(() => document.getElementById("btnDemo").click()); await sleep(1200);
    t.check("the on-screen practice table still works in demo mode", await p.evaluate(() => !!document.getElementById("btnStop") && getComputedStyle(document.getElementById("btnStop")).display !== "none") && (await scr(p)) === "cut", await scr(p));
    t.check("no uncaught page errors in demo flow", p.errors.length === 0, p.errors.slice(0, 2).join(" | "));
    await p.context().close();
  }
  // ---- 2. ?test=1 on the live host exposes nothing
  {
    const { page: p } = await ctxFor("none", FAKE); await p.goto(FAKE + "/?test=1", { waitUntil: "load" }); await sleep(1000);
    t.check("window.plasmaTest is NOT exposed on a non-local host", await p.evaluate(() => typeof window.plasmaTest) === "undefined", "", "TEST-HOOK");
    t.check("?test=1 on a non-local host does NOT bypass the sign-in gate", (await scr(p)) === "login", await scr(p), "GATE-BYPASS");
    await p.context().close();
    const { page: q } = await ctxFor("none", srv.base); await q.goto(srv.base + "/?test=1", { waitUntil: "load" }); await sleep(1000);
    t.check("window.plasmaTest still exists on localhost (harness keeps working)", await q.evaluate(() => typeof window.plasmaTest) === "object");
    await q.context().close();
    const { page: g } = await ctxFor("none", srv.base); await g.goto(srv.base + "/?test=1&gate=1&demo=1", { waitUntil: "load" }); await sleep(1000);
    t.check("localhost ?test=1&gate=1 keeps the gate on (so the gate itself is testable)", (await scr(g)) === "login", await scr(g), "GATE");
    await g.context().close();
  }
  // ---- 3. cloud mode (stubbed Supabase): forged flags, shared device, claim errors, CSP
  {
    const { page: p, state } = await ctxFor("stub", srv.base); await p.goto(srv.base + "/", { waitUntil: "load" }); await sleep(900);
    t.check("cloud mode is on (no demo banner) and the sign-in page is first", await p.locator("#demoAcctBar.hidden").count() === 1 && (await scr(p)) === "login", await scr(p));
    // forged localStorage flag without a session
    await p.evaluate(() => localStorage.setItem("plasma.account.meta", JSON.stringify({ linked: true, serials: ["T-1"] })));
    await p.reload({ waitUntil: "load" }); await sleep(900);
    t.check("forged 'linked' flag with no session: still the sign-in page, no machine link, no Web Serial", (await scr(p)) === "login" && !/linked\.$/i.test(await linkedText(p)) && (await p.evaluate(() => window.__net.serial.length)) === 0, await scr(p), "GATE-FORGE");
    t.check("forged flag: the menu cannot be reached by clicking around (Make/Cut buttons are not on the sign-in page)", await p.evaluate(() => ["menuMake", "menuCut"].every((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return !r.width || getComputedStyle(e).display === "none" || !!e.closest(".hidden") || getComputedStyle(e.closest("section,div") || e).display === "none"; })), "", "GATE-FORGE");
    // wrong password is refused on the sign-in page, no session is created
    await signIn(p, "a@x.com", "wrongwrong");
    t.check("wrong password: refused, still on the sign-in page, no session stored", (await scr(p)) === "login" && !(await p.evaluate(() => localStorage.getItem("plasma.account.session"))), await toastText(p), "ACCOUNTS");
    // sign in as A (linked)
    await signIn(p, "a@x.com");
    t.check("A signs in: lands on the main menu, 'Your machine is linked.' (from my_machines())", (await scr(p)) === "menu" && /Your machine is linked/.test(await linkedText(p)), `${await scr(p)} | ${await linkedText(p)}`, "ACCOUNTS");
    const meta = await p.evaluate(() => JSON.parse(localStorage.getItem("plasma.account.meta") || "{}"));
    t.check("linked flag is bound to A's user id", meta.uid === USERS["a@x.com"].id, JSON.stringify(meta));
    // shared device: A's session dies without a clean sign-out (refresh failure path leaves meta behind); B signs in while my_machines is down
    await p.evaluate(() => localStorage.removeItem("plasma.account.session"));
    state.myMachinesFail = true;
    await p.reload({ waitUntil: "load" }); await sleep(900);
    t.check("session gone: back on the sign-in page", (await scr(p)) === "login", await scr(p), "GATE");
    await signIn(p, "b@x.com");
    t.check("B on A's device does NOT inherit A's linked machine (even if my_machines() is unreachable)", (await scr(p)) === "menu" && !/Your machine is linked/.test(await linkedText(p)), await linkedText(p), "SHARED-DEVICE");
    await toBed(p).catch(() => {});   // unlinked user may still make and load parts; Connect is what is locked
    t.check("B (unlinked): Connect is locked", (await p.locator("#btnConnect.locked").count()) === 1 || (await p.locator("#btnConnect").isDisabled().catch(() => false)), "", "SHARED-DEVICE");
    state.myMachinesFail = false;
    await p.reload({ waitUntil: "load" }); await sleep(900);
    // claim error path: server says {ok:false}
    if ((await scr(p)) === "login") await signIn(p, "b@x.com");
    await claim(p, "WRONG-CODE");
    t.check("a rejected claim shows the server message and stays unlinked", /not recognised/i.test(await toastText(p)) && !/Your machine is linked/.test(await linkedText(p)), `${await toastText(p)} | ${await linkedText(p)}`, "CLAIM-ERR");
    // sign out wipes the linked flag and returns to the gate
    await closeDialogs(p);
    await p.click("#acctPill"); await p.waitForSelector("#accountDlg:not(.hidden)"); await p.click("#btnSignOut"); await sleep(700);
    const meta2 = await p.evaluate(() => localStorage.getItem("plasma.account.meta"));
    t.check("sign-out clears the cached machine link", !/serials":\["/.test(meta2 || "") && !/"linked":true/.test(meta2 || ""), meta2);
    t.check("sign-out returns to the sign-in page", (await scr(p)) === "login", await scr(p), "GATE");
    // CSP
    const csp = await p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
    t.check("CSP: connect-src names only this project's Supabase host", /connect-src[^;]*https:\/\/sjtjgumbsnakipkgskxt\.supabase\.co/.test(csp) && !/\*\.supabase\.co/.test(csp), csp, "CSP");
    t.check("CSP: no 'unsafe-inline' for scripts, object-src none", !/script-src[^;]*unsafe-inline/.test(csp) && /object-src 'none'/.test(csp), csp, "CSP");
    const inl = await p.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__inl=1"; document.head.append(s); return window.__inl === 1; });
    t.check("CSP actually blocks an injected inline script", inl === false, "", "CSP");
    const other = await p.evaluate(() => fetch("https://evil-project.supabase.co/rest/v1/x").then(() => "reached").catch((e) => "blocked"));
    t.check("CSP blocks fetch to another Supabase project", other === "blocked", other, "CSP");
    const cspMsgs = p.msgs.filter((m) => /Content Security Policy/i.test(m) && !/inline script|evil-project/i.test(m));
    t.check("page itself triggers no CSP violations", cspMsgs.length === 0, cspMsgs.slice(0, 3).join(" | "), "CSP");
    t.check("no uncaught page errors in cloud mode", p.errors.length === 0, p.errors.slice(0, 2).join(" | "));
    // secrets in served client files
    const files = [...allJsText().map((x) => x[1]), fs.readFileSync(SITE + "index.html", "utf8")].join("\n");
    const jwts = [...files.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\./g)].map((m) => JSON.parse(Buffer.from(m[1], "base64url").toString()).role);
    t.check("only the anon role JWT is embedded in the client (no service_role)", jwts.length > 0 && jwts.every((r) => r === "anon"), JSON.stringify(jwts), "SECRETS");
    t.check("no sb_secret_ / service_role key material in the client", !/sb_secret_|service_role"\s*[:=]\s*"ey/.test(files));
    await p.context().close();
  }
  // ---- 4. STOP must stay on screen with a long display name in the Account pill (it was pushed off at 320 px). STOP exists only on the cutting screen.
  for (const prof of ["w320", "iphoneSE", "iphone14", "ipad", "iphone14land"]) {
    const p = await newPage(K.browser, prof, { base: srv.base }); await enterDemo(p); await sleep(300);
    await p.evaluate(() => { const a = document.getElementById("acctPill"); a.textContent = "Bartholomew-Longname-Smith"; a.classList.add("in"); });
    const m = await p.evaluate(() => { const b = document.getElementById("btnStop").getBoundingClientRect(); return { screen: document.body.dataset.screen, right: b.right, left: b.left, w: b.width, sw: document.documentElement.scrollWidth, vw: window.innerWidth }; });
    t.check(`${prof}: cutting screen: STOP fully on screen and no sideways scroll with a long display name`, m.screen === "cut" && m.w > 0 && m.left >= 0 && m.right <= PROFILES[prof].viewport.width + 0.5 && m.sw <= PROFILES[prof].viewport.width + 0.5, JSON.stringify(m), "STOP-OFFSCREEN");
    await p.evaluate(() => window.plasmaTest.showScreen("menu"));
    t.check(`${prof}: STOP is not shown on the main menu (it only exists on the cutting screen)`, await p.evaluate(() => getComputedStyle(document.getElementById("btnStop")).display === "none"), "", "STOP-PLACEMENT");
    await p.context().close();
  }
} finally { K.kill(); await srv.close(); }
process.exit(t.done() ? 1 : 0);

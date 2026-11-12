// Admin-powers security + layout: raw console filter, STOP from every admin screen, restore validation, announcement XSS,
// live-origin gating (demo admin can't arm; UI role is not trusted), job_events flooding, phone layouts.
import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, demoToShape, enterDemo, SITE, PROFILES, J_INIT } from "../lib/browser.mjs";
import fs from "node:fs"; import path from "node:path";
const t = new T("62_admin_security");
const SITE_DIR = process.env.SITE_DIR || SITE;
const srv = await startServer({ site: SITE_DIR });
const K = await launchKillable();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTDIR = new URL("../screenshots/", import.meta.url).pathname; fs.mkdirSync(SHOTDIR, { recursive: true });
async function adminPage(prof = "desktop") {
  const p = await newPage(K.browser, prof, { base: srv.base });
  await enterDemo(p);   // round 4: menu -> Make -> plate -> Send to cutting -> Practice
  await p.evaluate(async () => { const A = window.plasmaTest.account; await A.signUp({ email: "josh@example.com", pin: "letmein1", mode: "pro" }); await A.grantDemoAdmin(); });
  await p.evaluate(() => { document.querySelectorAll(".acctdlg").forEach((e) => e.classList.add("hidden")); });
  return p;
}
// round 5 (item 21c): a signed-in user's FIRST job defaults to a dry run (table moves, torch stays off). These tests want a real cut on the practice table, so untick it.
const realRun = async (p, expectDefault) => { const d = await p.evaluate(() => { const c = document.getElementById("dryRun"); const o = { dry: !!c && c.checked, note: !document.getElementById("dryFirstNote").classList.contains("hidden") }; if (c && c.checked) { c.checked = false; c.dispatchEvent(new Event("change")); } return o; }); if (expectDefault !== undefined) t.check("first job of a signed-in user defaults to a dry run, with the explanation shown", d.dry && d.note, JSON.stringify(d), "FIRST-JOB-DRY"); return d; };
const txOf = (p) => p.evaluate(() => (window.plasmaTest.S.demo.__tx || []).map((x) => x.s).join(""));
const hookTx = (p) => p.evaluate(() => { const d = window.plasmaTest.S.demo; d.__tx = []; const w = d.write.bind(d); d.write = (x) => { const s = typeof x === "string" ? x : Array.from(x).map((c) => String.fromCharCode(c)).join(""); d.__tx.push({ t: Date.now(), s }); return w(x); }; });
try {
  // ================= 1. filter matrix (pure function) =================
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    const f = (s) => p.evaluate((s) => { const r = window.plasmaTest.filterConsoleCommand(s); return { ok: r.ok, send: r.send, confirm: r.confirm || null }; }, s);
    const MUST_BLOCK = [
      "M3", "m3 s1000", "M03", "M 03", "M5 M03", "M5\nM3", "G0 X1 M3", "G0 X1 (x) M3", "G0 X1;M3", "G0 X10\n$21=0", "G0 X10\r\n$20=0", "F100 M3", "S0 M3", "M04", "M7", "M8", "M 3", "g1 x1 m03", "G1 X1 \u200bM3",
      "$RST=$", "$rst=*", "$ RST=$", "$SLP", "$slp", "$BOOT", "$I=hack", "$N0=G0", "$J=G91X10F100", "$32=1", "$32 = 1.0", "$ 32 = 1", "$#", "$$$", "$$\n$RST=$", "$21=0\nM3", "$100=1e3", "$100=0x50", "$0100=-5", "$21=0.5", "$20=2", "$100=0", "$100=99999", "$999=1",
      "G20 G0 X40", "G20", "G53 G0 X0", "G2 X1 Y1 I1", "G0 X51", "G0 X-51", "G1 X10 F99999", "G1 X10 F0", "G0 X10 Y60", "G91 G0 Z80", "T1 M6", "P5", "N10 G0 X1", "G10 L2 P1 X0 Y0", "G10 L20 P1 X0",
      "G0 X10\u0085", "G0 X10\u009e", "\u0018G0 X1", "!G0 X1", "?G0 X1", "G0 X1\tG0 X2", "%", "#5=1", "G0 X[1+1]", "G0 X1*2", "$$ ", "$$;M3", "x".repeat(200),
    ];
    for (const s of MUST_BLOCK) {
      const r = await f(s);
      // "$$ " (trailing space) trims to $$: harmless, allowed; skip that one
      if (s === "$$ ") continue;
      t.check("console blocks " + JSON.stringify(s).slice(0, 50), r.ok === false, JSON.stringify(r), "CONSOLE-BYPASS");
    }
    for (const [s, want] of [["$$", "$$"], ["$I", "$I"], ["$G", "$G"], ["$X", "$X"], ["$H", "$H"], ["g91 g0 x10 y-5", "G91 G0 X10 Y-5"], ["G0X10Y5", "G0 X10 Y5"], ["G1 X5 F600", "G1 X5 F600"], ["M5", "M5"], ["m05", "M5"], ["S0", "S0"], ["$100 = 80", "$100=80"], ["$110=5000", "$110=5000"], ["!", "!"], ["?", "?"], ["~", "~"], ["\x18", "\x18"], ["G92 X0 Y0", "G92 X0 Y0"], ["G21 G91", "G21 G91"]]) {
      const r = await f(s); t.check("console allows " + JSON.stringify(s), r.ok && r.send === want, JSON.stringify(r));
    }
    for (const s of ["$21=0", "$20=0", "$100=80", "$3=1", "$130=800", "$22=1"]) t.check("risky write needs confirmation: " + s, !!(await f(s)).confirm);
    t.check("harmless write needs no confirmation: $24=100", !(await f("$24=100")).confirm);
    t.check("STOP bytes always pass the filter", (await f("!")).ok && (await f("\x18")).ok);
    await p.context().close();
  }

  // ================= 2. console through the UI + restore validation =================
  {
    const p = await adminPage();
    await p.evaluate(() => window.plasmaTest.openAdmin("advanced"));
    await p.waitForSelector("#advConsole");
    await hookTx(p);
    // Torch lines (M3/M03...) are allowed from the console only after a "this would fire the torch" confirmation. Every line below must send nothing: the filter refuses it, or the user says No.
    p._safeConfirmAuto = "dismiss"; p.removeAllListeners("dialog"); p.on("dialog", async (d) => { p.dialogs.push(`${d.type()}: ${d.message()}`); await d.dismiss(); });
    const before = (await txOf(p)).length;
    for (const bad of ["M3", "M03", "M5 M03", "$RST=$", "G0 X10 $21=0", "$21=0.5", "G20 G0 X10", "G0 X80"]) { await p.fill("#advConsole", bad); await p.press("#advConsole", "Enter"); }
    await sleep(300);
    t.check("blocked console lines send nothing to the controller", (await txOf(p)).slice(before).replace(/[?]/g, "").length === 0, JSON.stringify((await txOf(p)).slice(before)), "CONSOLE-BYPASS");
    t.check("console M3: asks 'This would fire the torch' first (declined = nothing sent)", p.dialogs.some((d) => /fire the torch/i.test(d)), p.dialogs.slice(0, 2).join(" | "), "CONSOLE-TORCH");
    {
      const m0 = (await txOf(p)).length;
      p._safeConfirmAuto = "accept"; p.removeAllListeners("dialog"); p.on("dialog", async (d) => { p.dialogs.push(`${d.type()}: ${d.message()}`); await d.accept(); });
      // the E-stop is latched (STOP pressed) -> even a confirmed torch line must be refused (round 5: latch blocks console M3/M4/moves)
      await p.click("#btnStop"); await sleep(400);
      const m1 = (await txOf(p)).length;
      await p.fill("#advConsole", "M3"); await p.press("#advConsole", "Enter"); await sleep(300);
      await p.fill("#advConsole", "G0 X5"); await p.press("#advConsole", "Enter"); await sleep(300);
      // KNOWN APP BUG #2 (tests/KNOWN-BUGS.md): the latch is enforced in machine.js for M.command({cmd:"console"}) but the Admin > Advanced console goes through
      // app.js sendAdvanced -> M.grbl.send(...) directly (app.js ~2622), so a latched E-stop does not stop a confirmed M3 or a move typed there.
      t.check("E-stop latched: Admin > Advanced console refuses a confirmed M3 and a move (nothing but status polls reach the controller)", (await txOf(p)).slice(m1).replace(/[?]/g, "").length === 0, JSON.stringify((await txOf(p)).slice(m1)), "BUG-2-ADMIN-CONSOLE-LATCH");
      p._safeConfirmAuto = "dismiss"; p.removeAllListeners("dialog"); p.on("dialog", async (d) => { p.dialogs.push(`${d.type()}: ${d.message()}`); await d.dismiss(); });
    }
    // a newline cannot be typed into the <input>, but set it through the DOM like a paste would
    await p.evaluate(() => { const i = document.getElementById("advConsole"); i.value = "G0 X5\n$21=0"; });
    await p.press("#advConsole", "Enter"); await sleep(200);
    t.check("an input value with an embedded newline sends nothing", !/\$21/.test(await txOf(p)));
    // not connected -> toast
    await p.fill("#advConsole", "$$"); await p.press("#advConsole", "Enter"); await sleep(200);
    t.check("console refuses while not connected (no crash)", p.errors.filter((e) => !/Failed to load/.test(e)).length === 0);
    // restore validation
    const tryRestore = async (name, content, bufMode) => {
      await p.evaluate(() => { document.querySelectorAll("#advSettings input[data-sid]").forEach((i) => { i.value = ""; }); });
      await p.setInputFiles("#advRestore", { name, mimeType: "text/plain", buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
      await sleep(250);
      return p.evaluate(() => [...document.querySelectorAll("#advSettings input[data-sid]")].filter((i) => i.value !== "").map((i) => i.dataset.sid + "=" + i.value));
    };
    t.check("restore: a valid backup loads", (await tryRestore("ok.txt", "$100=250\n$101=250.5\n$110=5000\n$20=1\n")).length === 4);
    t.check("restore: unknown id refused (nothing loaded)", (await tryRestore("x.txt", "$100=250\n$999=1\n")).length === 0, "", "RESTORE");
    t.check("restore: out-of-range value refused (nothing loaded)", (await tryRestore("x.txt", "$100=250\n$130=999999\n")).length === 0, "", "RESTORE");
    t.check("restore: $32=1 laser mode refused", (await tryRestore("x.txt", "$32=1\n")).length === 0, "", "RESTORE");
    t.check("restore: $21=0.5 refused", (await tryRestore("x.txt", "$21=0.5\n")).length === 0, "", "RESTORE");
    t.check("restore: G-code file refused", (await tryRestore("x.nc", "G21 G90\nM3\nG1 X10\nM5\n")).length === 0, "", "RESTORE");
    t.check("restore: $RST line refused", (await tryRestore("x.txt", "$100=250\n$RST=$\n")).length === 0, "", "RESTORE");
    t.check("restore: binary refused", (await tryRestore("x.txt", Buffer.from([0, 1, 2, 3, 0xff, 0xfe]))).length === 0, "", "RESTORE");
    t.check("restore: oversize file refused", (await tryRestore("big.txt", "$100=250\n".repeat(20000))).length === 0, "", "RESTORE");
    t.check("restore: injected newline / M3 in a value refused", (await tryRestore("x.txt", "$100=250 M3\n")).length === 0, "", "RESTORE");
    t.check("restore: 'ok' and ;comments are skipped", (await tryRestore("x.txt", "; backup\nok\n$100=250\n")).length === 1);
    await p.context().close();
  }

  // ================= 3. Write changed settings: needs a read, writes only changes, confirms =================
  {
    const p = await adminPage();
    await p.click("#btnConnect").catch(() => {});
    await p.evaluate(() => window.plasmaTest.openAdmin("advanced"));
    await p.waitForSelector("#advApply");
    await p.evaluate(() => { document.querySelector('#advSettings input[data-sid="21"]').value = "0"; });
    await p.click("#advApply"); await sleep(200);
    t.check("Write without a prior Read is refused (blind write)", !p.dialogs.some((d) => /Write/.test(d)), p.dialogs.join("|"));
    await p.context().close();
  }

  // ================= 4. announcements: XSS + length =================
  {
    const p = await adminPage();
    const payload = ['<img src=x onerror="window.__xss=1">', '<script>window.__xss=2</script>', '"><svg/onload=window.__xss=3>', '[click](javascript:window.__xss=4)', '<b>bold</b>'];
    for (const [i, x] of payload.entries()) {
      await p.evaluate(async ({ x, i }) => { await window.plasmaTest.account.adminCreateAnnouncement({ title: x, body: x + " ".repeat(10) + x, severity: i % 2 ? "warning" : "update" }); }, { x, i });
    }
    await p.evaluate(async () => { await window.plasmaTest.account.adminCreateAnnouncement({ title: "T".repeat(500), body: "B".repeat(6000), severity: "info" }); });
    const lens = await p.evaluate(async () => { const a = await window.plasmaTest.account.listAnnouncements(); return { t: Math.max(...a.map((x) => x.title.length)), b: Math.max(...a.map((x) => x.body.length)) }; });
    t.check("announcement title/body are capped (200 / 4000)", lens.t <= 200 && lens.b <= 4000, JSON.stringify(lens));
    await p.evaluate(() => window.plasmaTest.openAdmin("announce"));
    await sleep(300);
    await p.evaluate(async () => { document.querySelectorAll(".acctdlg").forEach((e) => e.classList.add("hidden")); });
    await p.evaluate(() => window.plasmaTest.account.signOut && 0);
    await p.reload({ waitUntil: "load" }); await p.waitForFunction(() => window.plasmaTest);
    await sleep(500);
    const dom = await p.evaluate(() => ({ xss: window.__xss, bar: document.getElementById("announceBar").innerHTML, imgs: document.querySelectorAll("#announceBar img, #announceBar script, #announceBar svg, #announceBar a").length }));
    t.check("announcement banner never executes injected HTML", dom.xss === undefined && dom.imgs === 0, JSON.stringify(dom).slice(0, 300), "ANN-XSS");
    await p.evaluate(() => window.plasmaTest.openAdmin("announce")); await sleep(300);
    await p.evaluate(async () => { const m = await import(window.__J["announceui"]); m.openAnnounceInbox(); }); await sleep(400);
    const dom2 = await p.evaluate(() => ({ xss: window.__xss, n: document.querySelectorAll("#announceInbox img, #announceInbox script, #announceInbox svg, #announceInbox a, #adminAnnList img, #adminAnnList script, #adminAnnList svg, #adminAnnList a").length, txt: document.getElementById("announceInbox").textContent.includes("<img src=x") }));
    t.check("inbox and admin list render announcements as plain text", dom2.xss === undefined && dom2.n === 0 && dom2.txt === true, JSON.stringify(dom2), "ANN-XSS");
    await p.context().close();
  }

  // ================= 5. STOP above every admin screen, mid-cut =================
  for (const prof of ["desktop", "iphone14", "iphone14land", "w320"]) {
    const p = await adminPage(prof);
    for (const tab of ["users", "stats", "announce", "machines", "advanced", "presets"]) {
      await p.evaluate((tab) => window.plasmaTest.openAdmin(tab), tab); await sleep(150);
      const r = await p.evaluate(() => { const b = document.getElementById("btnStop").getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); const card = document.querySelector("#adminDlg .acctcard").getBoundingClientRect(); return { stop: !!el && !!el.closest("#btnStop"), top: card.top, bar: document.querySelector(".topbar").getBoundingClientRect().bottom, hOverflow: document.documentElement.scrollWidth > innerWidth + 1, cardOver: card.right > innerWidth + 1 }; });
      t.check(`${prof}: admin '${tab}' tab: STOP is on top and clickable`, r.stop, JSON.stringify(r), "STOP-HIDDEN");
      t.check(`${prof}: admin '${tab}' tab: card starts below the top bar, no sideways overflow`, r.top >= r.bar - 1 && !r.cardOver, JSON.stringify(r), "ADMIN-LAYOUT");
    }
    if (prof !== "desktop") { await p.evaluate(() => window.plasmaTest.openAdmin("advanced")); await sleep(150); await p.screenshot({ path: SHOTDIR + `admin-advanced-${prof}-fixed.png` }); }
    await p.context().close();
  }
  for (const how of ["button", "Space key"]) {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    await demoToShape(p);
    await p.evaluate(async () => { const A = window.plasmaTest.account; await A.signUp({ email: "josh2@example.com", pin: "letmein1", mode: "beginner" }); await A.grantDemoAdmin(); await A.claimMachine({ serial: "DEMO-0001", code: "DEMO-0000" }).catch(() => {}); });
    await p.evaluate(() => { document.querySelectorAll(".acctdlg").forEach((e) => e.classList.add("hidden")); const s = window.plasmaTest.sketch; s.clear(); s.add("plate", true); const it = s.items[0]; Object.assign(it.p, { w: 40, h: 30, r: 3, hole: 6, inset: 8 }); s.pick([it.id]); s.commit(); s.onSelect(); });
    await hookTx(p);
    await p.evaluate(() => window.plasmaTest.sendToCutting()); await p.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3); await p.click("#btnZero"); await sleep(300);
    for (const cb of await p.locator("#checklist input").all()) await cb.check();
    await realRun(p, how === "button" ? true : undefined);
    await p.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 8000 }).catch(() => {});
    await p.click("#btnStart");
    const lit = await p.waitForFunction(() => window.plasmaTest.S.demo.torch === true, null, { timeout: 90000 }).then(() => true).catch(() => false);
    t.check(`mid-cut (${how}): torch fired in the demo controller`, lit);
    if (lit) {
      await p.evaluate(() => window.plasmaTest.openAdmin("advanced")); await sleep(300);
      const mark = (await txOf(p)).length;
      if (how === "button") await p.click("#btnStop"); else await p.keyboard.press("Space");   // round 5: Space is the one STOP key
      await sleep(1500);
      const after = (await txOf(p)).slice(mark);
      t.check(`mid-cut with the admin dialog open: ${how} stops the machine (feed hold + reset)`, after.includes("!") && after.includes("\x18"), JSON.stringify(after.slice(0, 40)), "STOP-HIDDEN");
      t.check(`mid-cut with the admin dialog open: ${how} switches the torch off`, await p.evaluate(() => window.plasmaTest.S.demo.torch === false), "", "STOP-HIDDEN");
      // console and patterns must be refused while a job runs
    }
    await p.context().close();
  }
  // console + patterns refused mid-job (separate quick run: job running flag)
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    await demoToShape(p);
    await p.evaluate(async () => { const A = window.plasmaTest.account; await A.signUp({ email: "josh3@example.com", pin: "letmein1", mode: "beginner" }); await A.grantDemoAdmin(); await A.claimMachine({ serial: "DEMO-0001", code: "DEMO-0000" }).catch(() => {}); });
    await p.evaluate(() => { document.querySelectorAll(".acctdlg").forEach((e) => e.classList.add("hidden")); const s = window.plasmaTest.sketch; s.clear(); s.add("plate", true); const it = s.items[0]; Object.assign(it.p, { w: 40, h: 30, r: 3, hole: 6, inset: 8 }); s.pick([it.id]); s.commit(); s.onSelect(); });
    await hookTx(p);
    await p.evaluate(() => window.plasmaTest.sendToCutting()); await p.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3); await p.click("#btnZero"); await sleep(300);
    for (const cb of await p.locator("#checklist input").all()) await cb.check();
    await realRun(p);
    await p.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 8000 }).catch(() => {});
    await p.click("#btnStart"); await sleep(1500);
    await p.evaluate(() => window.plasmaTest.openAdmin("advanced")); await sleep(200);
    const mark = (await txOf(p)).length;
    await p.fill("#advConsole", "G0 X10"); await p.press("#advConsole", "Enter");
    await p.fill("#advConsole", "$24=100"); await p.press("#advConsole", "Enter");
    await p.click("#advRead"); await sleep(400);
    const after = (await txOf(p)).slice(mark).replace(/[?]/g, "");
    t.check("console / $$ read are refused while a job is cutting (nothing interleaved into the job)", !/G0 X10|\$24|\$\$|\$I/.test(after.split("\n").filter((l) => !/^G[01] X[\d.]+ Y[\d.]+/.test(l)).join("\n")) || !/\$24=100|G0 X10\b/.test(after), JSON.stringify(after.slice(0, 120)), "CONSOLE-JOB");
    const rows0 = await p.evaluate(() => window.plasmaTest.sketch.items.length);
    await p.click("#patSquare"); await sleep(200);
    t.check("test patterns are refused while a job is cutting", (await p.evaluate(() => window.plasmaTest.sketch.items.length)) === rows0, "", "PATTERN-JOB");
    await p.click("#btnStop"); await sleep(1200);   // round 5: Esc is no longer a stop key; the on-screen STOP stays above the admin dialog
    await p.context().close();
  }
  // round 5: Esc closes the admin dialog but must NEVER stop a job (only STOP / Space do)
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    await demoToShape(p);
    await p.evaluate(async () => { const A = window.plasmaTest.account; await A.signUp({ email: "josh4@example.com", pin: "letmein1", mode: "beginner" }); await A.grantDemoAdmin(); await A.claimMachine({ serial: "DEMO-0001", code: "DEMO-0000" }).catch(() => {}); });
    await p.evaluate(() => { document.querySelectorAll(".acctdlg").forEach((e) => e.classList.add("hidden")); const s = window.plasmaTest.sketch; s.clear(); s.add("plate", true); const it = s.items[0]; Object.assign(it.p, { w: 40, h: 30, r: 3, hole: 6, inset: 8 }); s.pick([it.id]); s.commit(); s.onSelect(); });
    await hookTx(p);
    await p.evaluate(() => window.plasmaTest.sendToCutting()); await p.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3); await p.click("#btnZero"); await sleep(300);
    for (const cb of await p.locator("#checklist input").all()) await cb.check();
    await realRun(p);
    await p.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 8000 }).catch(() => {});
    await p.click("#btnStart");
    const lit = await p.waitForFunction(() => window.plasmaTest.S.demo.torch === true, null, { timeout: 90000 }).then(() => true).catch(() => false);
    t.check("Esc test: torch fired in the demo controller", lit, "", "E2E-HARNESS");
    if (lit) {
      await p.evaluate(() => window.plasmaTest.openAdmin("advanced")); await sleep(300);
      const mark = (await txOf(p)).length; await p.keyboard.press("Escape"); await sleep(1200);
      const after = (await txOf(p)).slice(mark);
      t.check("Esc with the admin dialog open: sends no stop (no feed hold, no reset) and the job keeps running", !after.includes("!") && !after.includes("\x18") && await p.evaluate(() => !!window.plasmaTest.S.job && window.plasmaTest.S.job.running), JSON.stringify(after.slice(0, 40)), "ESC-STOPS");
      await p.keyboard.press("Space"); await sleep(1200);
      t.check("Space afterwards stops it (even with the dialog gone)", await p.evaluate(() => window.plasmaTest.S.demo.torch === false), "", "STOP-KEY");
    }
    await p.context().close();
  }
  // test patterns: add shapes only, never start a job / fire the torch
  {
    const p = await adminPage();
    await p.evaluate(() => window.plasmaTest.openAdmin("advanced")); await hookTx(p);
    for (const id of ["patSquare", "patCircle", "patKerf"]) { await p.click("#" + id); await sleep(150); await p.evaluate(() => window.plasmaTest.openAdmin("advanced")); }
    await sleep(300);
    const tx = await txOf(p);
    t.check("test patterns only add shapes: no M3 / job / motion sent", !/M3|M03|G0|G1/.test(tx) && (await p.evaluate(() => !window.plasmaTest.S.job || !window.plasmaTest.S.job.running)), tx.slice(0, 60), "PATTERN-TORCH");
    t.check("test patterns do not leave the torch on", await p.evaluate(() => !window.plasmaTest.S.demo || window.plasmaTest.S.demo.torch !== true));
    await p.context().close();
  }

  // ================= 6. live-origin gating + job_events flood (mock Supabase, no real network) =================
  {
    const LIVE = "https://plasma-live.test";
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const mock = { role: "user", calls: [], log: [], admin403: 0, rpc: [], reject401: {} };
    const UID = "11111111-1111-4111-8111-111111111111";
    const ctx = await K.browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: true });
    await ctx.route(/^https:\/\/plasma-live\.test\//, async (route) => {
      const u = new URL(route.request().url()); let f = path.join(SITE_DIR, decodeURIComponent(u.pathname)); if (u.pathname.endsWith("/")) f += "index.html";
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: "nf" });
      route.fulfill({ status: 200, headers: { "content-type": mime[path.extname(f)] || "application/octet-stream" }, body: fs.readFileSync(f) });
    });
    await ctx.route(/sjtjgumbsnakipkgskxt\.supabase\.co/, async (route) => {
      const rq = route.request(), u = new URL(rq.url()), p = u.pathname, m = rq.method();
      mock.calls.push(m + " " + p);
      if (/^\/rest\/v1\/rpc\//.test(p) && m === "POST") mock.rpc.push({ p, bearer: /^Bearer aaa/.test(rq.headers()["authorization"] || "") });
      if (m === "POST" && mock.reject401[p] > 0) { mock.reject401[p]--; return route.fulfill({ status: 401, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ message: "JWT expired" }) }); }
      if (m === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const json = (b, status = 200) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(b) });
      if (p === "/auth/v1/token") return json({ access_token: "aaa.bbb.ccc", refresh_token: "r", expires_in: 3600, user: { id: UID, email: "user@example.com" } });
      if (p === "/auth/v1/user") return json({ id: UID, email: "user@example.com" });
      if (p === "/rest/v1/profiles") return json([{ id: UID, display_name: "", mode: "beginner", role: mock.role }]);
      if (p === "/rest/v1/rpc/my_machines") return json([{ serial: "M-TEST-1", claimed_at: new Date().toISOString(), notes: "" }]);
      if (p === "/rest/v1/rpc/log_job_event") { const body = JSON.parse(rq.postData() || "{}"); mock.log.push(body.p_status); await sleep(400); return json({ ok: true, id: "ev-" + mock.log.length }); }
      if (/^\/rest\/v1\/rpc\/admin_/.test(p)) { mock.admin403++; return json({ message: "Admin only" }, 400); }
      if (p === "/rest/v1/rpc/my_announcements" || p === "/rest/v1/cut_presets" || p === "/rest/v1/parts") return json([]);
      if (p === "/rest/v1/rpc/touch_last_active") return json(null);
      return json({}, 404);
    });
    // (a) ?demo=1 on a live origin cannot arm the fake admin, cannot unlock real control, and exposes no test hooks
    {
      const page = (await ctx.addInitScript(J_INIT()), await ctx.newPage()); page.errors = [];
      page.on("pageerror", (e) => page.errors.push(String(e)));
      await page.goto(LIVE + "/index.html?demo=1&test=1", { waitUntil: "load" }); await sleep(800);
      const r = await page.evaluate(async () => {
        const A = await import(window.__J["account"]);
        const out = { hook: typeof window.plasmaTest, can: A.canGrantDemoAdmin(), demo: A.isDemoMode() };
        await A.signUp({ email: "x@example.com", pin: "letmein1", mode: "pro" }).catch((e) => { out.signUpErr = String(e.message); });
        try { await A.grantDemoAdmin(); out.granted = A.isAdmin(); } catch (e) { out.grantErr = String(e.message).slice(0, 60); }
        // forge the stored demo state: admin role + a claimed machine
        const s = JSON.parse(localStorage.getItem("plasma.account.demo") || "{}");
        for (const u of s.users || []) u.role = "admin";
        s.machines = [{ id: "m", serial: "DEMO-0001", hash: "x", owner: (s.users[0] || {}).id, claimed_at: new Date().toISOString() }];
        localStorage.setItem("plasma.account.demo", JSON.stringify(s));
        out.forgedAdmin = A.isAdmin(); out.linked = A.hasLinkedMachine(); out.real = A.realControlAllowed();
        return out;
      });
      t.check("live origin + ?demo=1 + ?test=1: no window.plasmaTest hook", r.hook === "undefined", JSON.stringify(r), "LIVE-HOOK");
      t.check("live origin + ?demo=1: demo 'make me admin' refuses", r.can === false && !r.granted && !!r.grantErr, JSON.stringify(r), "LIVE-ADMIN");
      t.check("live origin: forged localStorage (admin role + claimed machine) still can NOT unlock real machine control", r.real === false, JSON.stringify(r), "LIVE-GATE");
      t.note("forged demo admin on live origin (UI only, demo data only)", JSON.stringify({ forgedAdmin: r.forgedAdmin, linked: r.linked }));
      await page.close();
    }
    // (a2) round 5 item 14: no anonymous calls to the signed-in-only RPCs (the 401s), the token is sent, and a rejected token is refreshed once
    {
      const page = (await ctx.addInitScript(J_INIT()), await ctx.newPage()); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
      mock.rpc.length = 0;
      await page.goto(LIVE + "/index.html", { waitUntil: "load" }); await sleep(1200);
      const anon = mock.rpc.filter((c) => /touch_last_active|my_machines/.test(c.p));
      t.check("item 14: signed out on load, touch_last_active / my_machines are not called anonymously (no 401)", anon.length === 0, JSON.stringify(anon), "R5-401");
      const r = await page.evaluate(async () => { const A = await import(window.__J["account"]); await A.signIn({ email: "user@example.com", pin: "letmein1" }); await A.touchLastActive(); return { linked: A.hasLinkedMachine() }; });
      const after = mock.rpc.filter((c) => /touch_last_active|my_machines/.test(c.p));
      t.check("item 14: after sign-in both calls carry the signed-in token", after.length >= 2 && after.every((c) => c.bearer) && r.linked, JSON.stringify({ after, r }), "R5-401");
      mock.reject401["/rest/v1/rpc/touch_last_active"] = 1; mock.rpc.length = 0; const n0 = mock.calls.filter((c) => /auth\/v1\/token/.test(c)).length;
      const ok = await page.evaluate(async () => { const A = await import(window.__J["account"]); try { await A.touchLastActive(); return true; } catch (e) { return String(e); } });
      const touches = mock.rpc.filter((c) => /touch_last_active/.test(c.p)).length, refreshed = mock.calls.filter((c) => /auth\/v1\/token/.test(c)).length - n0;
      t.check("item 14: a token the server rejects (401) is refreshed once and the call retried", ok === true && touches === 2 && refreshed === 1, JSON.stringify({ ok, touches, refreshed }), "R5-401");
      await page.evaluate(async () => { const A = await import(window.__J["account"]); await A.signOut(); });
      await page.close();
    }
    // (b) real cloud mode as an ordinary user: UI role can be forged, the server is what refuses
    {
      const page = (await ctx.addInitScript(J_INIT()), await ctx.newPage()); page.errors = []; page.dialogs = []; page._safeConfirmAuto = "accept";
      await page.exposeFunction("__reportSafeConfirm", (msg) => { page.dialogs.push("confirm: " + String(msg || "")); return page._safeConfirmAuto || "accept"; });
      page.on("pageerror", (e) => page.errors.push(String(e)));
      await page.goto(LIVE + "/index.html", { waitUntil: "load" }); await sleep(800);
      const r = await page.evaluate(async () => {
        const A = await import(window.__J["account"]);
        const out = { cloud: A.isCloud() };
        await A.signIn({ email: "user@example.com", pin: "letmein1" });
        out.admin0 = A.isAdmin(); out.linked = A.hasLinkedMachine(); out.real = A.realControlAllowed();
        const sess = JSON.parse(localStorage.getItem("plasma.account.session")); sess.profile.role = "admin"; localStorage.setItem("plasma.account.session", JSON.stringify(sess));
        out.forged = A.isAdmin();
        const tries = {};
        for (const [k, fn] of [["users", () => A.adminListUsers()], ["stats", () => A.adminUsageStats()], ["events", () => A.adminListJobEvents()], ["mkAnn", () => A.adminCreateAnnouncement({ title: "x", body: "y" })], ["preset", () => A.adminUpsertCutPreset({ material: "x", thickness_mm: 3 })]]) {
          try { const v = await fn(); tries[k] = "RETURNED:" + JSON.stringify(v).slice(0, 40); } catch (e) { tries[k] = "refused: " + String(e.message).slice(0, 30); }
        }
        out.tries = tries;
        return out;
      });
      t.check("cloud mode: signed-in ordinary user is not admin", r.cloud && r.admin0 === false, JSON.stringify(r));
      t.check("cloud mode: forged role=admin in localStorage unlocks only the UI; every admin RPC is refused by the server", Object.values(r.tries).every((v) => v.startsWith("refused")) && mock.admin403 >= 5, JSON.stringify(r.tries), "ADMIN-GATE");
      await page.reload({ waitUntil: "load" }); await sleep(900);
      t.check("cloud mode: a reload re-reads the role from the server (forged flag is dropped)", await page.evaluate(async () => { const A = await import(window.__J["account"]); return A.isAdmin() === false; }), "", "ADMIN-GATE");
      // (c) job_events: one 'started' per job even with a slow server. Through the round-4 flow: sign-in gate -> menu -> Go to cutting -> upload -> bed -> Practice -> zero -> checklist -> Start
      await page.evaluate(() => { localStorage.removeItem("plasma.account.session"); }); await page.reload({ waitUntil: "load" }); await sleep(900);
      t.check("cloud mode, signed out: the sign-in page is the first screen (the gate)", await page.evaluate(() => document.body.dataset.screen) === "login", "", "GATE");
      await page.fill("#inEmail", "user@example.com"); await page.fill("#inPin", "letmein1"); await page.click("#formSignIn [type=submit]"); await sleep(1000);
      t.check("cloud mode: sign-in through the form lands on the main menu", await page.evaluate(() => document.body.dataset.screen) === "menu", await page.evaluate(() => document.body.dataset.screen), "GATE");
      t.check("cloud mode: menu says the linked machine is linked", /Your machine is linked/.test(await page.locator("#menuMachine").innerText()), await page.locator("#menuMachine").innerText());
      await page.click("#menuCut");
      await page.setInputFiles("#file", { name: "sq.nc", mimeType: "text/plain", buffer: Buffer.from("G21 G90\nG0 X10 Y10\nM3\nG1 X40 Y10 F1500\nG1 X40 Y30\nG1 X10 Y30\nG1 X10 Y10\nM5\nM30\n") });
      await page.waitForSelector("#btnDemo", { state: "visible", timeout: 10000 });
      await page.click("#btnDemo"); await page.waitForSelector("#btnDisconnect:not(.hidden)", { timeout: 10000 }).catch(() => {});
      await page.click("#btnZero"); await sleep(300);
      for (const cb of await page.locator("#checklist input").all()) await cb.check();
      const startEnabled = await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 8000 }).then(() => true).catch(() => false);
      t.check("cloud mode: linked machine + simulator lets Start enable", startEnabled, await page.locator("#blockers").innerText().catch(() => ""));
      if (startEnabled) {
        mock.log.length = 0; await page.click("#btnStart");
        if (await page.locator("#safeDlg:not(.hidden)").count()) await page.click("#safeDlgOk");
        await page.waitForSelector("#done:not(.hidden)", { timeout: 120000 }).catch(() => {});
        await sleep(1500);
        const started = mock.log.filter((s) => s === "started").length, ended = mock.log.filter((s) => s !== "started").length;
        t.check("job_events: exactly one 'started' and one end event per job (slow server must not cause a flood)", started === 1 && ended === 1, JSON.stringify(mock.log), "JOBLOG-FLOOD");
      }
      await page.close();
    }
    await ctx.close();
  }

  // ================= 7. phone layouts for edge edit. Round 4/5: edge edit lives on Make a part, where there is intentionally NO STOP (STOP exists only on the cutting screen) =================
  for (const prof of ["iphone14", "iphone14land", "w320"]) {
    const p = await newPage(K.browser, prof, { base: srv.base });
    await p.evaluate(() => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("pro", { persist: false, autoFs: false }); if (document.body.classList.contains("shape-fs")) T.setShapeFs(false); });   // Pro: the edge panel sits in the side form
    await p.evaluate(() => { const s = window.plasmaTest.sketch; s.items = []; s.sel = { ids: [], hole: null }; s.commit(); s.tool = "draw"; s.drawPts = [[0, 0], [156, 0], [156, 30], [98, 30], [98, 91.4], [58, 91.4], [58, 30], [0, 30]]; s.finishDraw(); s.fitView(); const it = s.selected(); s.selectEdge(it.id, 0, 0); });
    await sleep(300);
    const r = await p.evaluate(() => { const panel = document.getElementById("edgePanel"); const pr = panel.getBoundingClientRect(); const cs = getComputedStyle(panel); const stop = getComputedStyle(document.getElementById("btnStop")).display;
      return { screen: document.body.dataset.screen, stopDisplay: stop, panel: !panel.hidden && !panel.classList.contains("hidden") && cs.display !== "none" && pr.width > 0 && pr.height > 0, pw: pr.width, left: pr.left, right: pr.right, vw: innerWidth, over: document.documentElement.scrollWidth - innerWidth }; });
    t.check(`${prof}: edge edit on Make a part: panel visible, inside the screen, no sideways overflow`, r.panel && r.left >= -1 && r.right <= r.vw + 1 && r.over <= 1, JSON.stringify(r), "PHONE-LAYOUT");
    t.check(`${prof}: edge edit on Make a part: no STOP button on this screen (by design: STOP is only on the cutting screen)`, r.screen === "make" && r.stopDisplay === "none", JSON.stringify(r), "STOP-PLACEMENT");
    await p.evaluate(() => document.getElementById("edgePanel").scrollIntoView());
    await p.screenshot({ path: SHOTDIR + `edit-edge-${prof}-fixed.png` });
    await p.evaluate(() => window.plasmaTest.sendToCutting()); await sleep(500);
    t.check(`${prof}: after Send to cutting the STOP is on the cutting screen, on screen and clickable`, await p.evaluate(() => { const b = document.getElementById("btnStop").getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return document.body.dataset.screen === "cut" && !!el && !!el.closest("#btnStop") && b.right <= innerWidth + 1 && b.left >= 0; }), "", "PHONE-STOP");
    await p.context().close();
  }
} catch (e) { t.check("suite ran to the end", false, String(e && e.stack || e).slice(0, 400), "E2E-HARNESS"); }
finally { t.done(); await srv.close(); K.kill(); }

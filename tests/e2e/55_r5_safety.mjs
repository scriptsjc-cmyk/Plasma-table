// Round 5 group 2 (SAFETY) tests, items 6-11. Takes the r5-safety-*.png screenshots.
//  6 E-stop release is a deliberate press-and-hold; Torch test / jog / console M3 are blocked while it is latched
//  7 the TORCH ON pill is visible on the landscape-phone cutting screen
//  8 Score / Mark lines block Start with a clear warning (the G-code can't cut them lighter)
//  9 STOP / reset / home / alarm clear work zero; startJob (and Continue from cut N) refuse without it
// 10 Space is the one STOP key; Esc never stops
// 11 STOP is only on the cutting screen (the only screen the machine can move from)
import { serve, open, launch, demoToShape } from "../lib/r2compat.mjs"; import { T as Rec } from "../lib/t.mjs"; import fs from "node:fs";
// Ported from r2tools/r5safety.mjs (92 checks). Round-5 safety: hold-to-release E-stop, latch blocks, work zero cleared by stop/reset/home/alarm, Space = STOP, Esc never stops, STOP only on the cutting screen.
const out = new URL("../screenshots/", import.meta.url).pathname; fs.mkdirSync(out, { recursive: true });
const s = await serve(), br = await launch();
const rec = new Rec("55_r5_safety");
const ck = (n, ok, i = "") => rec.check(n, ok, typeof i === "string" ? i : JSON.stringify(i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (page, js) => page.evaluate(js);
const snap = async (page, name) => { await page.evaluate(() => { const t = document.getElementById("toast"); if (t && !window.__keepToast) t.classList.add("hidden"); }); await sleep(250); await page.screenshot({ path: `${out}/r5-safety-${name}.png` }); };
const tx = (page) => T(page, "window.plasmaTest.S.demo.__tx.map((x) => x.s).join('')");
const hook = (page) => T(page, `(() => { const d = window.plasmaTest.S.demo; if (d.__hooked) { d.__tx.length = 0; return; } d.__hooked = true; d.__tx = []; const w = d.write.bind(d); d.write = (x) => { const s = typeof x === "string" ? x : Array.from(x).map((c) => String.fromCharCode(c)).join(""); d.__tx.push({ t: Date.now(), s }); return w(x); }; })()`);
const latched = (page) => T(page, "window.plasmaTest.estopOn()");
const holdBtn = async (page, ms) => { const b = await page.locator("#btnStop").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(ms); await page.mouse.up(); await sleep(300); };
const throws = (page, js) => T(page, `(() => { try { ${js}; return null; } catch (e) { return String(e.message || e); } })()`);
const prime = async (page, parts = ["rect", "disc", "rect"]) => {
  await demoToShape(page, { stay: "cut" });
  await page.evaluate((parts) => { const t = window.plasmaTest, sk = t.sketch; t.showScreen("make"); t.setShapeFs(false); sk.clear(); for (const p of parts) sk.add(p); t.sendToCutting(); }, parts);
  await sleep(300);
  await page.evaluate(() => window.plasmaTest.demoEdges()); await sleep(6000);
  await page.evaluate(() => { window.plasmaTest.goStep(3); document.getElementById("layAuto").click(); }); await sleep(500);
};
const zeroAndTick = async (page) => {
  await page.evaluate(() => document.getElementById("btnZero").scrollIntoView({ block: "center" }));
  await page.click("#btnZero"); await sleep(400);
  await page.evaluate(() => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change")); }); await sleep(300);
};
const startable = (page) => T(page, "!document.getElementById('btnStart').disabled");
const blockersText = (page) => T(page, "document.getElementById('blockers').textContent");
const waitCut = async (page, n = 1) => { const t0 = Date.now(); let v = 0; while (Date.now() - t0 < 90000) { v = await T(page, "window.plasmaTest.S.run ? window.plasmaTest.S.run.ons : 0"); if (v >= n) return true; await sleep(250); } return false; };

// ================================================================== 6 + 10 + 9 (laptop, one session)
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await prime(page);
  await zeroAndTick(page);
  ck("setup: ready to start (zero set, boxes ticked)", await startable(page), await blockersText(page));
  ck("9 zero is a machine flag now: M.zeroConfirmed mirrors S.zeroSet", await T(page, "window.plasmaTest.getM().zeroConfirmed === true && window.plasmaTest.S.zeroSet === true"));
  await hook(page);

  // ---- 10: Esc is not STOP; Space is
  await page.keyboard.press("Escape"); await sleep(500);
  ck("10 Esc on the cutting screen does NOT press the E-stop", !(await latched(page)) && !(await tx(page)).includes("\x18") && !(await tx(page)).includes("!"));
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.keyboard.press("Space"); await sleep(700);
  ck("10 Space presses the E-stop (feed hold + reset sent)", (await latched(page)) && (await tx(page)).includes("\x18"));
  ck("10 the button title / label say Space only", await T(page, "(() => { const b = document.getElementById('btnStop'); return !/Esc/.test(b.title + b.getAttribute('aria-label')); })()"));
  ck("9 the STOP cleared work zero (machine flag and UI)", await T(page, "window.plasmaTest.getM().zeroConfirmed === false && window.plasmaTest.S.zeroSet === false"));
  ck("9 Start is blocked and the reason is the start point", !(await startable(page)) && /Start point/.test(await blockersText(page)), await blockersText(page));
  await T(page, "window.__keepToast = true");
  await snap(page, "estop-latched-laptop");
  await T(page, "window.__keepToast = false");

  // ---- 6: nothing releases it except press-and-hold
  await page.keyboard.press("Escape"); await sleep(200);
  ck("6 Esc does not release it", await latched(page));
  await page.keyboard.press("Space"); await sleep(200);
  ck("6 Space again does not release it", await latched(page));
  await sleep(1400); await page.click("#btnStop"); await sleep(300);
  ck("6 a tap long after the first press (the old 1.2 s rule) does NOT release it", await latched(page));
  await page.click("#btnStop"); await page.click("#btnStop"); await page.click("#btnStop"); await sleep(200);
  ck("6 repeated taps never release it", await latched(page));
  ck("6 a tap on the latched button sends STOP again", (await tx(page)).split("\x18").length >= 3);
  await holdBtn(page, 900);
  ck("6 holding for less than 1.5 s does not release it", await latched(page));
  ck("6 the label says E-STOP ON again after a short hold", await T(page, "document.getElementById('estopLabel').textContent.trim() === 'E-STOP ON'"));
  // blocked while latched
  const J = await throws(page, "window.plasmaTest.getM().command({ cmd: 'jog', axis: 'X', dist: 5 })");
  ck("6 jog is refused while latched, with the reason", /E-STOP is ON/.test(J || ""), J);
  ck("6 jog_dir is refused", /E-STOP is ON/.test(await throws(page, "window.plasmaTest.getM().command({ cmd: 'jog_dir', dir: [1, 0, 0] })") || ""));
  const TT = await throws(page, "window.plasmaTest.getM().command({ cmd: 'torch_test', confirm: true })");
  ck("6 Torch test is refused while latched (even confirmed)", /E-STOP is ON/.test(TT || ""), TT);
  const C3 = await throws(page, "window.plasmaTest.getM().command({ cmd: 'console', line: 'M3', allowTorch: true })");
  ck("6 console M3 is refused while latched", /E-STOP is ON/.test(C3 || ""), C3);
  ck("6 console M4 and a console move are refused", /E-STOP/.test(await throws(page, "window.plasmaTest.getM().command({ cmd: 'console', line: 'M4', allowTorch: true })") || "") && /E-STOP/.test(await throws(page, "window.plasmaTest.getM().command({ cmd: 'console', line: 'G0 X5' })") || ""));
  ck("6 home, raise, goto_zero, trace_outline, touch-off are refused", (await T(page, `["home","raise","goto_zero","trace_outline","touchoff_test","resume","zero_xy"].map((c) => { try { window.plasmaTest.getM().command({ cmd: c }); return "ran"; } catch (e) { return /E-STOP is ON/.test(e.message) ? "blocked" : e.message; } }).join(",")`)) === "blocked,blocked,blocked,blocked,blocked,blocked,blocked");
  ck("6 startJob is refused", /E-STOP is ON/.test(await throws(page, "window.plasmaTest.getM().startJob()") || ""));
  await hook(page);
  // the real buttons: Torch test button + console box
  const btt = await T(page, "(() => { const b = document.getElementById('btnTorchTest'); return !!b; })()");
  if (btt) { await page.evaluate(() => document.getElementById("btnTorchTest").click()); await sleep(500); }
  await page.evaluate(() => { const i = document.getElementById("consoleIn"); if (i) { i.value = "M3"; document.getElementById("consoleForm").requestSubmit(); } }); await sleep(400);
  const sent = await tx(page);
  ck("6 the Torch test button and the console never put M3/M4/a jog on the wire while latched", !/M0*[34]|\$J=|G0|G1/.test(sent), JSON.stringify(sent.slice(0, 80)));
  // allowed while latched
  ck("6 STOP, unlock and speed-down still work while latched", await T(page, `["stop","unlock","jog_cancel","hold"].every((c) => { try { window.plasmaTest.getM().command({ cmd: c }); return true; } catch (e) { return false; } })`));
  await sleep(1200); await hook(page);

  // deliberate reset (mouse hold)
  const t0 = Date.now(); await holdBtn(page, 1800);
  ck("6 press-and-hold 1.8 s releases it", !(await latched(page)), `after ${Date.now() - t0} ms`);
  ck("6 no extra STOP is sent by the releasing click", !(await tx(page)).includes("\x18"));
  ck("6 label back to STOP, body not estop-on", await T(page, "document.getElementById('estopLabel').textContent.trim() === 'STOP' && !document.body.classList.contains('estop-on')"));
  ck("9 releasing the E-stop does NOT bring work zero back", await T(page, "window.plasmaTest.S.zeroSet === false"));
  const J2 = await throws(page, "window.plasmaTest.getM().command({ cmd: 'jog', axis: 'X', dist: 1 })");
  ck("6 after the reset jogging works again", J2 === null, J2);
  // keyboard hold: Enter on the focused latched button
  await page.keyboard.press("Space"); await sleep(400);
  await page.focus("#btnStop");
  await page.keyboard.down("Enter"); await sleep(600); await page.keyboard.up("Enter"); await sleep(200);
  ck("6 a short Enter does not release it", await latched(page));
  await page.keyboard.down("Enter"); await sleep(1800); await page.keyboard.up("Enter"); await sleep(300);
  ck("6 holding Enter for 1.8 s releases it (keyboard users)", !(await latched(page)));
  // hold refused while the torch is lit / machine moving
  await page.keyboard.press("Space"); await sleep(500);
  await T(page, "window.plasmaTest.S.demo.torch = true"); await sleep(400);
  ck("6 (setup) the controller reports TORCH ON", await T(page, "window.plasmaTest.S.status.torch === true"), await T(page, "JSON.stringify(window.plasmaTest.S.status)"));
  await holdBtn(page, 1800);
  ck("6 the reset is refused while the torch is lit", await latched(page));
  ck("6 ...and says why", /torch/i.test(await T(page, "document.getElementById('toast').textContent")), await T(page, "document.getElementById('toast').textContent"));
  await T(page, "window.plasmaTest.S.demo.torch = false"); await sleep(600);
  await holdBtn(page, 1800);
  ck("6 with the torch off the hold releases it", !(await latched(page)));

  // ---- 9: zero must be confirmed again before a job starts
  await page.evaluate(() => { const u = document.getElementById("btnUnlock"); if (u && u.offsetParent) u.click(); }); await sleep(1500);
  const NZ = await throws(page, "window.plasmaTest.getM().startJob()");
  ck("9 startJob refuses without confirmed work zero (machine level)", /zero/i.test(NZ || ""), NZ);
  const NZ2 = await throws(page, "window.plasmaTest.getM().startJob({ fromCut: 2 })");
  ck("9 Continue from cut N (startJob fromCut) refuses too", /zero/i.test(NZ2 || ""), NZ2);
  await T(page, "window.plasmaTest.refresh()");
  ck("9 the Start button is blocked until zero is set again", !(await startable(page)));
  await page.evaluate(() => { document.querySelectorAll(".do-home").forEach((h) => h.offsetParent && h.click()); }); await sleep(5500);
  await zeroAndTick(page);
  ck("9 pressing Start here confirms it again, Start is allowed", (await startable(page)) && (await T(page, "window.plasmaTest.getM().zeroConfirmed")), await blockersText(page));
  // home and unlock and alarm clear it
  await page.evaluate(() => { window.plasmaTest.getM().command({ cmd: "home" }); }); await sleep(300);
  ck("9 Home clears work zero", await T(page, "window.plasmaTest.getM().zeroConfirmed === false && window.plasmaTest.S.zeroSet === false"));
  await sleep(5500);
  await page.evaluate(() => window.plasmaTest.getM().command({ cmd: "zero_xy" })); await sleep(200);
  ck("9 zero_xy sets it", await T(page, "window.plasmaTest.getM().zeroConfirmed === true"));
  await T(page, "window.plasmaTest.getM().onGrbl('alarm', { code: 2, message: 'Bad G-code' })");
  ck("9 any alarm clears it", await T(page, "window.plasmaTest.getM().zeroConfirmed === false"));
  await page.evaluate(() => window.plasmaTest.getM().command({ cmd: "zero_xy" })); await sleep(100);
  await page.evaluate(() => window.plasmaTest.getM().command({ cmd: "set_origin", x: 10, y: 10 })); await sleep(100);
  ck("9 set_origin keeps it set", await T(page, "window.plasmaTest.getM().zeroConfirmed === true"));
  await page.evaluate(() => window.plasmaTest.getM().command({ cmd: "reset" })); await sleep(200);
  ck("9 soft reset clears it", await T(page, "window.plasmaTest.getM().zeroConfirmed === false"));
  await page.evaluate(() => window.plasmaTest.getM().command({ cmd: "zero_xy" })); await sleep(100);
  await page.evaluate(() => window.plasmaTest.getM().command({ cmd: "console", line: "!" })); await sleep(200);
  ck("9 a console ! (feed hold/stop) clears it", await T(page, "window.plasmaTest.getM().zeroConfirmed === false"));
  await page.evaluate(() => { try { window.plasmaTest.getM().command({ cmd: "unlock" }); } catch (e) { /* */ } }); await sleep(1500);
  ck("no page errors (6/9/10)", page.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e)).length === 0, page.errors.join("|"));
  await page.context().close();
}

// ================================================================== 9 + 10: a real job, STOP, Continue
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await prime(page);
  await zeroAndTick(page);
  await hook(page);
  await page.click("#btnStart"); await sleep(800);
  ck("job started (zero was confirmed)", await T(page, "window.plasmaTest.S.job && window.plasmaTest.S.job.running"));
  ck("10 the cutting-screen lock holds: can't leave during a job", await T(page, "(() => { const r = window.plasmaTest.showScreen('menu'); return r === false && window.plasmaTest.screen() === 'cut'; })()"));
  await waitCut(page, 2);
  await page.keyboard.press("Escape"); await sleep(1000);
  ck("10 Esc does not stop a running job", await T(page, "window.plasmaTest.S.job.running && !window.plasmaTest.estopOn()"));
  // Space while typing in a box: stops when a job is live
  await page.evaluate(() => { const e = document.createElement("textarea"); e.id = "zzTa"; document.body.appendChild(e); e.focus(); });
  await page.keyboard.press("Space"); await sleep(1500);
  ck("10 Space stops a live job even from inside a text box", await T(page, "!window.plasmaTest.S.job.running && window.plasmaTest.estopOn()"));
  await page.evaluate(() => document.getElementById("zzTa").remove());
  ck("9 after the STOP work zero is gone", await T(page, "window.plasmaTest.S.zeroSet === false && window.plasmaTest.getM().zeroConfirmed === false"));
  await holdBtn(page, 1800);
  ck("6 released by hold after a real job stop", !(await latched(page)));
  await page.evaluate(() => { const u = document.getElementById("btnUnlock"); if (u && u.offsetParent) u.click(); }); await sleep(1500);
  ck("9 Continue is offered", await T(page, "!document.getElementById('restartBox').classList.contains('hidden') && !!window.plasmaTest.S.resume"));
  await page.evaluate(() => document.getElementById("btnRestart").click()); await sleep(600);
  ck("9 Continue: Start stays locked and asks to confirm work zero", !(await startable(page)) && /zero|start point/i.test(await blockersText(page) + await T(page, "document.getElementById('resumeWhy').textContent")), await blockersText(page));
  const NZ3 = await throws(page, "window.plasmaTest.getM().startJob({ fromCut: window.plasmaTest.S.startCut })");
  ck("9 ...and the machine refuses it even if the button were bypassed", /zero/i.test(NZ3 || ""), NZ3);
  await page.evaluate(() => { document.querySelectorAll(".do-home").forEach((h) => h.offsetParent && h.click()); }); await sleep(5500);
  ck("9 re-homing does not bring zero back either", await T(page, "window.plasmaTest.S.zeroSet === false"));
  await zeroAndTick(page);
  ck("9 after Home + Start here, Continue can start", await startable(page), await blockersText(page));
  await snap(page, "continue-ready-laptop");
  await page.click("#btnStart"); await sleep(1200);
  ck("9 the continued job runs", await T(page, "window.plasmaTest.S.job.running"));
  await page.keyboard.press("Space"); await sleep(1500);
  await page.context().close();
}

// ================================================================== 7 torch pill on a landscape phone
{
  const page = await open(br, "phoneland", s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" }); await sleep(500);
  const pill = () => T(page, `(() => { const e = document.getElementById("torchPill"); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { w: Math.round(r.width), h: Math.round(r.height), display: cs.display, text: e.textContent, on: e.classList.contains("on"), hidden: e.hidden, atTop: top === e || e.contains(top), shortLand: document.body.classList.contains("short-land") }; })()`);
  const p0 = await pill();
  ck("7 (setup) this really is the short landscape layout", p0.shortLand, JSON.stringify(p0));
  ck("7 torch off: the quiet TORCH OFF pill stays out of the way (as designed)", p0.display === "none" && p0.on === false, JSON.stringify(p0));
  await T(page, "window.plasmaTest.S.demo.torch = true"); await sleep(600);
  const p1 = await pill();
  ck("7 torch lit: TORCH ON is visible on the landscape phone cutting screen", p1.on && /TORCH ON/.test(p1.text) && p1.display !== "none" && p1.w > 40 && p1.h > 10 && p1.atTop, JSON.stringify(p1));
  ck("7 the pill doesn't run over the connection pill or the STOP button", await T(page, `(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const t = r("torchPill"); return ["connPill", "btnStop"].every((id) => { const o = r(id); return t.right <= o.left + 1 || t.left >= o.right - 1; }); })()`));
  await snap(page, "torchpill-phoneland");
  await T(page, "window.plasmaTest.S.demo.torch = false"); await sleep(600);
  ck("7 torch off again: pill hides again", (await pill()).display === "none");
  ck("7 STOP button stays visible and tappable on the landscape phone", await T(page, "(() => { const r = document.getElementById('btnStop').getBoundingClientRect(); return r.width >= 56 && r.height >= 56; })()"));
  await page.context().close();
}
// merged with the layout work: TORCH ON sits next to the Ready badge on a phone on its side (844x390 and 683x384), nothing overlaps
for (const [w, h] of [[844, 390], [683, 384]]) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e))); page.on("dialog", (d) => d.accept());
  await ctx.route((u) => !u.href.startsWith(s.base) && !u.href.startsWith("data:"), (r) => r.abort());
  await page.goto(s.base + "/?test=1&turn=0", { waitUntil: "load" }); await page.waitForFunction(() => window.plasmaTest);
  await demoToShape(page, { stay: "cut" }); await sleep(500);
  await T(page, "window.plasmaTest.S.demo.torch = true"); await sleep(700);
  const g = await T(page, `(() => { const R = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, show: getComputedStyle(e).display !== "none" && b.width > 0 }; }; return { torch: R("torchPill"), badge: R("stateBadge"), conn: R("connPill"), stop: R("btnStop"), w: innerWidth, sl: document.body.classList.contains("short-land"), badgeText: document.getElementById("stateBadge").textContent }; })()`);
  const hit = (a, b) => !(a.r <= b.l + 1 || a.l >= b.r - 1 || a.b <= b.t + 1 || a.t >= b.b - 1);
  ck(`7 ${w}x${h}: (setup) short landscape layout`, g.sl, JSON.stringify(g));
  ck(`7 ${w}x${h}: TORCH ON and the Ready badge are both showing`, g.torch.show && g.badge.show && /Ready/i.test(g.badgeText), JSON.stringify(g));
  ck(`7 ${w}x${h}: TORCH ON sits right next to Ready (same row, side by side)`, Math.abs(g.torch.t - g.badge.t) < 12 && Math.abs(g.torch.l - g.badge.r) < 30 || Math.abs(g.badge.l - g.torch.r) < 30, JSON.stringify(g));
  ck(`7 ${w}x${h}: nothing in the header overlaps (torch / ready / connection / STOP) and all fit on screen`, !hit(g.torch, g.badge) && !hit(g.torch, g.conn) && !hit(g.torch, g.stop) && !hit(g.badge, g.stop) && g.stop.r <= g.w + 1 && g.torch.r <= g.w, JSON.stringify(g));
  await snap(page, `torch-next-to-ready-${w}x${h}`);
  ck(`7 ${w}x${h}: no page errors`, page.errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e)).length === 0, page.errors.join("|"));
  await ctx.close();
}
// the same on the other layouts: the pill shows when the torch is on
for (const view of ["laptop", "phone"]) {
  const page = await open(br, view, s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" }); await sleep(400);
  await T(page, "window.plasmaTest.S.demo.torch = true"); await sleep(600);
  ck(`7 ${view}: TORCH ON pill visible`, await T(page, "(() => { const e = document.getElementById('torchPill'); const r = e.getBoundingClientRect(); return e.classList.contains('on') && getComputedStyle(e).display !== 'none' && r.width > 40; })()"));
  await page.context().close();
}

// ================================================================== 8 Score / Mark
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await prime(page, ["rect", "disc"]);
  await zeroAndTick(page);
  ck("8 (setup) with every shape set to Cut, Start is allowed", await startable(page), await blockersText(page));
  const setOp = async (op) => { await page.evaluate(() => { const k = window.plasmaTest.sketch; k.pick([k.items[1].id]); }); const refused = await T(page, `window.ptInspector.setCut({ operation: '${op}' })`); if (refused !== false) throw new Error("the layout must refuse operation changes"); const r = await T(page, `(() => { const k = window.plasmaTest.sketch, L = k.layout; k.layout = null; try { return window.ptInspector.setCut({ operation: '${op}' }); } finally { k.layout = L; } })()`); await T(page, "window.plasmaTest.refresh()"); return r; };   // an operation is chosen in Make a part; the cutting screen's layout refuses it (tests/e2e/57_layout_lock.mjs)
  const tick = async () => { await page.evaluate(() => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change")); }); await sleep(300); };
  // make the disc a Score line through the real inspector API
  const r = await setOp("score");
  ck("8 setting Score is accepted by the inspector", r !== false, String(r));
  await sleep(300);
  const toastTxt = await T(page, "document.getElementById('toast').textContent");
  ck("8 choosing Score tells you at once it can't be cut lighter", /Score/.test(toastTxt) && /Start stays blocked/.test(toastTxt), toastTxt);
  await page.evaluate(() => window.plasmaTest.goStep(3)); await sleep(400);
  await T(page, "window.plasmaTest.refresh()");
  const bt = await blockersText(page);
  ck("8 Start is blocked with a clear warning naming Score/Mark and why", !(await startable(page)) && /Score or Mark/.test(bt) && /full power/.test(bt) && /back to Cut|hide/.test(bt), bt);
  const M1 = await throws(page, "window.plasmaTest.getM().startJob()");
  ck("8 the machine itself refuses to start it (not just the button)", /Score or Mark/.test(M1 || ""), M1);
  await page.evaluate(() => document.getElementById("blockers").scrollIntoView({ block: "center" }));
  await snap(page, "scoremark-blocked-laptop");
  // Mark too
  await setOp("mark"); await tick();
  ck("8 Mark is blocked the same way", !(await startable(page)) && /Score or Mark/.test(await blockersText(page)));
  // hiding the layer: not cut, so allowed
  await T(page, "window.ptInspector.setLayerHidden('mark', true)"); await sleep(300); await T(page, "window.plasmaTest.refresh()"); await tick();
  ck("8 a hidden Score/Mark layer isn't cut, so Start is allowed", await startable(page) && !/Score or Mark/.test(await blockersText(page)), await blockersText(page));
  await T(page, "window.ptInspector.setLayerHidden('mark', false)"); await sleep(300); await T(page, "window.plasmaTest.refresh()");
  ck("8 un-hiding it blocks again", !(await startable(page)));
  await setOp("cut"); await tick();
  ck("8 back to Cut: Start is allowed again", await startable(page), await blockersText(page));
  // export warns
  await setOp("score");
  await T(page, "window.plasmaTest.exportGcode()"); await sleep(400);
  ck("8 downloading G-code with a Score shape warns that it is cut at full power", /full power/.test(await T(page, "document.getElementById('toast').textContent")), await T(page, "document.getElementById('toast').textContent"));
  await page.context().close();
}

// ================================================================== 11 STOP placement
{
  const page = await open(br, "laptop", s.base, "?test=1&turn=0");
  await demoToShape(page, { stay: "cut" }); await sleep(400);
  const vis = (id) => T(page, `(() => { const e = document.getElementById("${id}"); const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== "none" && r.width > 0; })()`);
  ck("11 STOP is on the cutting screen", await vis("btnStop"));
  await hook(page);
  for (const sc of ["menu", "make"]) {
    await T(page, `window.plasmaTest.showScreen("${sc}"); window.plasmaTest.setShapeFs(false)`); await sleep(300);
    ck(`11 STOP is not shown on the ${sc} screen (the machine can't move from there)`, !(await vis("btnStop")));
    await page.keyboard.press("Space"); await sleep(200);
    await page.keyboard.press("ArrowLeft"); await page.keyboard.press("PageDown"); await sleep(300);
    ck(`11 ${sc}: Space does not latch an E-stop and the arrow / PageDown keys send no jog`, !(await latched(page)) && !/\$J=/.test(await tx(page)) && !(await tx(page)).includes("\x18"), JSON.stringify(await tx(page)));
  }
  await T(page, "window.plasmaTest.showScreen('make'); window.plasmaTest.openEditor && window.plasmaTest.openEditor()"); await sleep(400);
  ck("11 STOP is not shown in the full-screen editor either", !(await vis("btnStop")));
  await page.keyboard.press("Escape"); await sleep(300);
  ck("11 Esc leaves the editor and nothing is stopped", !(await T(page, "window.plasmaTest.S.shapeFs")) && !(await latched(page)));
  await page.context().close();
}

const failed = rec.done();
await br.close(); s.close();
process.exit(failed ? 1 : 0);

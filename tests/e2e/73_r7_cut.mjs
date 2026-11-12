// r7 Cut screen: the laptop top bar (J12), panels that swap and resize with STOP fixed (J14), the "Cut starts here" mark that
// follows the part (J15), arrow keys move the torch (J4), one safety tick box (J13), no overlaps or wrapped labels at 1366x768 and
// 1440x900 (U3, U18), Show me links (U28), the Stopped chip (U7), STOP closes a confirm (U6), link lost (U11), Space in a number box
// (U27), an h1 and announced banners (U22), practice runs without the homing question (U24); on a phone on its side one header row
// signed in (U4) and a short Bed & start with sheet size in More (U8); upright, the turn cover leaves Menu and STOP clear (U2, U10).
import { T } from "../lib/t.mjs"; import { startServer, launch, newPage, demoToShape, PROFILES } from "../lib/browser.mjs";
import { devices } from "playwright";

const t = new T("73_r7_cut"); const srv = await startServer(); const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phone = (w, h) => ({ ...devices["iPhone 14"], viewport: { width: w, height: h }, screen: { width: w, height: h } });
PROFILES.phone844x390 ||= phone(844, 390); PROFILES.phone390x844 ||= phone(390, 844);
const ev = (page, f, a) => page.evaluate(f, a);
let l;                                     // the last page read-out, shown with a failing check

const PAGE = `
  window.__box = (sel) => { const e = typeof sel === "string" ? document.querySelector(sel) : sel; if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  // the part of an element you can see: its box cut down by every scrolling or clipping box around it
  window.__seen = (sel) => { const e = typeof sel === "string" ? document.querySelector(sel) : sel; const b = __box(e); if (!b) return null;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { if (getComputedStyle(p).overflow === "visible") continue;
      const c = p.getBoundingClientRect(); b.l = Math.max(b.l, c.left); b.t = Math.max(b.t, c.top); b.r = Math.min(b.r, c.right); b.b = Math.min(b.b, c.bottom); }
    return b.r > b.l && b.b > b.t ? b : null; };
  window.__overlap = (a, b) => { const A = __seen(a), B = __seen(b); return !!(A && B) && A.l < B.r - 1 && B.l < A.r - 1 && A.t < B.b - 1 && B.t < A.b - 1; };
  // how many lines an element's own text takes (text nodes only, so icons don't count)
  window.__lines = (e) => { const tops = []; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim() || !n.parentElement.getClientRects().length) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 1 && !tops.some((t) => Math.abs(t - r.top) < 4)) tops.push(r.top); }
    return tops.length; };
  window.__wrapped = (sels) => sels.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.getClientRects().length && __lines(e) > 1).map((e) => (e.id || e.className || e.tagName) + ": " + e.textContent.trim().slice(0, 40));
  window.__stopBiggest = () => { const s = __box("#btnStop"), sa = s.w * s.h;
    return [...document.querySelectorAll("button")].filter((b) => b.id !== "btnStop" && b.getClientRects().length && getComputedStyle(b).visibility !== "hidden")
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width * r.height >= sa; }).map((b) => b.id || b.className); };
  window.__noPageScroll = () => { const d = document.scrollingElement; return d.scrollHeight <= innerHeight + 1 && d.scrollWidth <= innerWidth + 1; };`;
const ONE_LINE = ["#cutBar > *", ".setupcard > summary > b", "#checkMat", "#btnChangeMat", ".homerow button", "#connectLockText", "#btnTrace", "#btnZero",
  "#layoutCard .laybtns button", "#layoutCard .sheetrow label", ".checkwhat", "#cutCheck3 .ok", ".step[data-step='3'] .nav button", ".blocker-jump"];
const CARDS = ["#cutCheck3", "#layoutCard", "#checkCard", ".previewPane", "#zeroCard", ".step[data-step='3'] > .nav"];

async function bedPage(prof, query) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false, ...(query ? { query } : {}) });
  await page.evaluate(PAGE);
  await demoToShape(page, { stay: "cut" });
  await page.waitForFunction(() => window.plasmaTest.getM().state() === "Idle", null, { timeout: 10000 }).catch(() => {});
  await ev(page, () => { window.plasmaTest.goStep(3); const a = document.getElementById("layAuto"); if (a) a.click(); }); await sleep(500);
  return page;
}

// ---------------------------------------------------------------- laptop, at both sizes
for (const prof of ["d1366", "d1440"]) {
  const n = (s) => `${prof}: ${s}`;
  const page = await bedPage(prof);
  const stop0 = await ev(page, () => __box("#btnStop"));

  // J12 / U3 / U18: one top bar, nothing overlaps, nothing wraps, no page scroll
  l = await ev(page, () => ({ steps: !!document.querySelector("#cutBarSteps #stepper"), start: document.getElementById("cutBarStart").textContent,
    key: document.querySelector(".cutbar-key").textContent, layout: !!__box("#btnLayout") }));
  t.check(n("J12: the step bar, the start-point state, the Space hint and Layout sit in the tab row"), l.steps && /not set/i.test(l.start) && /Space = STOP/.test(l.key) && l.layout, JSON.stringify(l));
  const cardHits = await ev((page), (cs) => { const out = []; for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (__overlap(cs[i], cs[j])) out.push(cs[i] + " / " + cs[j]); return out; }, CARDS);
  t.check(n("U3: the Bed & start panels don't overlap"), !cardHits.length, JSON.stringify(cardHits));
  const zeroHits = await ev(page, () => ["#btnGoStart", "#btnLinkMachine", "#btnTrace", ".homerow .do-home"].filter((s) => __overlap("#btnZero", s)));
  t.check(n("U3: Start here covers nothing (Go to start point, Link a machine, Trace)"), !zeroHits.length, JSON.stringify(zeroHits));
  const zeroIn = await ev(page, () => { const z = __box("#btnZero"), c = __box("#zeroCard"); return z.t >= c.t && z.b <= c.b + 1 && z.b <= innerHeight; });
  t.check(n("U3: Start here is in view inside its card"), zeroIn);
  let wraps = await ev(page, (s) => __wrapped(s), ONE_LINE);
  t.check(n("U18: labels, buttons and check lines are one line each"), !wraps.length, JSON.stringify(wraps));
  t.check(n("U18: plain card names (no step numbers)"), await ev(page, () => [...document.querySelectorAll(".setupcard > summary > b")].every((b) => !/^\d\s·/.test(b.textContent))));
  t.check(n("STOP is the largest control; no page scroll"), !(await ev(page, () => __stopBiggest())).length && await ev(page, () => __noPageScroll()));

  // J13 / U28: one tick box, "Show me" links
  l = await ev(page, () => ({ boxes: document.querySelectorAll("#checklist input:not([disabled])").length, jumps: [...document.querySelectorAll("#blockers .blocker-jump")].map((b) => b.textContent) }));
  t.check(n("J13: one tick box to confirm the checks"), l.boxes === 1, JSON.stringify(l));
  t.check(n("U28: blockers have short 'Show me' links"), l.jumps.length > 0 && l.jumps.every((s) => s === "Show me"), JSON.stringify(l));

  // J4: arrows move the torch; not while a number box has focus
  const wx = () => ev(page, () => Number((window.plasmaTest.S.status.WPos || [0])[0]));
  await ev(page, () => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  let x0 = await wx(); await page.keyboard.down("ArrowRight"); await sleep(120); await page.keyboard.up("ArrowRight"); await sleep(900);
  let x1 = await wx();
  t.check(n("J4: the right arrow moves the torch right"), x1 > x0, `${x0} -> ${x1}`);
  await page.focus("#sheetW"); x0 = await wx(); await page.keyboard.press("ArrowUp"); await sleep(700); x1 = await wx();
  t.check(n("J4: not while a number box has focus"), x1 === x0, `${x0} -> ${x1}`);
  await ev(page, () => document.activeElement.blur());

  // J15: the cut-start mark follows the part as it moves; no new Start here needed
  await ev(page, () => { document.getElementById("zeroCard").open = true; document.getElementById("btnZero").click(); }); await sleep(400);
  const m0 = await ev(page, () => window.plasmaTest.Setup.startMarkAt());
  await ev(page, () => { const sk = window.plasmaTest.sketch; for (const it of sk.items) it.x += 40; sk.commit(); }); await sleep(500);
  const m1 = await ev(page, () => window.plasmaTest.Setup.startMarkAt());
  l = await ev(page, () => ({ zero: window.plasmaTest.S.zeroSet, bar: document.getElementById("cutBarStart").textContent, zs: document.getElementById("zeroState").textContent }));
  t.check(n("J15: 'Cut starts here' moves with the part"), m0 && m1 && Math.abs(m1[0] - m0[0] - 40) < 0.6 && Math.abs(m1[1] - m0[1]) < 0.6, JSON.stringify([m0, m1]));
  t.check(n("J15: the start point stays set after moving parts, and says so"), l.zero && /set/i.test(l.bar) && /cut follows/i.test(l.zs), JSON.stringify(l));

  // J14: Layout mode, move a panel, resize, saved, reset; STOP never moves
  await page.click("#btnLayout"); await sleep(150);
  l = await ev(page, () => ({ covers: document.querySelectorAll(".arrcover:not([hidden])").length, reset: !!__box("#btnLayoutReset"), pressed: document.getElementById("btnLayout").getAttribute("aria-pressed") }));
  t.check(n("J14: Layout shows a cover per panel and Reset layout"), l.covers === 3 && l.reset && l.pressed === "true", JSON.stringify(l));
  await page.click('.arrcover[data-panel="main"] [data-dir="-1"]'); await sleep(150);
  l = await ev(page, () => ({ zero: __box("#zeroCard").l, bed: __box(".previewPane").l }));
  t.check(n("J14: Move left puts the start-point card left of the bed"), l.zero < l.bed, JSON.stringify(l));
  await page.click("#btnLayout"); await sleep(150);
  const dv = await page.$('.coldivider:not([hidden])'); const db = await dv.boundingBox();
  await page.mouse.move(db.x + db.width / 2, db.y + 80); await page.mouse.down(); await page.mouse.move(db.x + 1200, db.y + 80, { steps: 8 }); await page.mouse.up(); await sleep(200);
  l = await ev(page, () => ({ bed: __box(".previewPane").w, min: 0.36 * innerWidth, stop: __box("#btnStop") }));
  t.check(n("J14: dragging a divider never squeezes the bed below 36% of the window"), l.bed >= l.min - 1, JSON.stringify(l));
  t.check(n("J14: STOP did not move or shrink"), JSON.stringify(l.stop) === JSON.stringify(stop0) && !(await ev(page, () => __stopBiggest())).length, JSON.stringify([stop0, l.stop]));
  wraps = await ev(page, (s) => __wrapped(s), ONE_LINE);
  t.check(n("J14: still no wrapped labels after resizing"), !wraps.length, JSON.stringify(wraps));
  const dk = await page.$('.coldivider:not([hidden])'); await dk.focus();
  const w0 = await ev(page, () => __box("#checkCard").w); await page.keyboard.press("ArrowLeft"); await sleep(100);
  const w1 = await ev(page, () => __box("#checkCard").w);
  t.check(n("J14: a focused divider resizes with the arrow keys"), w1 < w0, `${w0} -> ${w1}`);
  // saved per user: another account gets the default layout, coming back brings this one back
  const order = () => ev(page, () => ({ zero: __box("#zeroCard").l, bed: __box(".previewPane").l }));
  await ev(page, () => window.plasmaTest.account.signUp({ email: "lay73@example.com", pin: "letmein1", display_name: "Lay", mode: "beginner" })); await sleep(400);
  const other = await order();
  await ev(page, () => window.plasmaTest.account.signOut()); await sleep(400);
  const back = await order();
  t.check(n("J14: saved per user (another account has the default; back again it returns)"), other.bed < other.zero && back.zero < back.bed, JSON.stringify([other, back]));
  await page.click("#btnLayout"); await page.click("#btnLayoutReset"); await page.click("#btnLayout"); await sleep(150);
  l = await ev(page, () => ({ zero: __box("#zeroCard").l, bed: __box(".previewPane").l, side: __box("#checkCard").l }));
  t.check(n("J14: Reset layout puts the panels back"), l.side < l.bed && l.bed < l.zero, JSON.stringify(l));
  await page.ctx.close();
}

// ---------------------------------------------------------------- laptop: running, stopping, link lost, practice
{
  const page = await bedPage("d1366");
  l = await ev(page, () => ({ h1: (() => { const h = document.getElementById("cutH1"); return h && getComputedStyle(h).display !== "none" && h.textContent; })(),
    estop: document.getElementById("estopBar").getAttribute("role"), alarm: document.getElementById("alarmBar").getAttribute("role"), toast: document.getElementById("toast").getAttribute("role") }));
  t.check("U22: the cutting screen has an h1; banners are alerts, toasts a status", /Cut/.test(l.h1 || "") && l.estop === "alert" && l.alarm === "alert" && l.toast === "status", JSON.stringify(l));
  await ev(page, () => { document.getElementById("btnZero").click(); }); await sleep(300);
  await ev(page, () => { const c = document.querySelector('#checklist input[data-chk="1"]'); c.click(); }); await sleep(200);
  await page.click("#btnStart"); await sleep(400);
  l = await ev(page, () => ({ dlg: !document.getElementById("safeDlg").classList.contains("hidden"), step: window.plasmaTest.S.cur }));
  t.check("U24: a practice run starts without the homing question", !l.dlg && l.step === 4, JSON.stringify(l));
  await page.waitForFunction(() => window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 8000 }).catch(() => {});
  t.check("J14: no Layout while a job is running", await ev(page, () => document.getElementById("btnLayout").disabled));
  await ev(page, () => { const T = window.plasmaTest; T.S.connected = false; T.refresh(); }); await sleep(100);
  l = await ev(page, () => ({ cls: document.getElementById("running").className, title: document.getElementById("runTitle").textContent, pause: document.getElementById("btnPause").disabled }));
  t.check("U11: link lost shows in the run panel (title, frozen, Pause off)", /linklost/.test(l.cls) && /Link lost/.test(l.title) && l.pause, JSON.stringify(l));
  await ev(page, () => { const T = window.plasmaTest; T.S.connected = true; T.refresh(); }); await sleep(100);
  await page.focus("#ovSpeed").catch(() => ev(page, () => { const i = document.querySelector("#cutView input[type=number]:not([disabled])"); if (i) i.focus(); }));
  await page.keyboard.press("Space"); await sleep(600);
  l = await ev(page, () => ({ latched: document.body.classList.contains("estop-latched"), chip: document.getElementById("stateBadge").textContent, active: document.activeElement && document.activeElement.tagName }));
  t.check("U27: Space stops even from a number box", l.latched, JSON.stringify(l));
  t.check("U7: the state chip says Stopped while STOP is latched", /Stopped/.test(l.chip), JSON.stringify(l));
  await page.ctx.close();
}

// ---------------------------------------------------------------- phone on its side, signed in: one header row, short Bed & start
{
  const page = await newPage(br, "phone844x390", { base: srv.base, consoleErrors: false }); await page.evaluate(PAGE);
  await ev(page, () => window.plasmaTest.account.signUp({ email: "r7cut@example.com", pin: "letmein1", display_name: "Josh Tester", mode: "beginner" }));
  await demoToShape(page, { stay: "cut" }); await ev(page, () => window.plasmaTest.goStep(3)); await sleep(500);
  await ev(page, () => document.getElementById("practiceChip").classList.remove("hidden"));     // the busiest header: a practice run on a real machine
  l = await ev(page, () => { const ids = ["btnHome", "connPill", "stateBadge", "torchPill", "btnStop"].map((id) => __box("#" + id)).filter(Boolean);
    const mids = ids.map((b) => b.t + b.h / 2); return { spread: Math.round(Math.max(...mids) - Math.min(...mids)), n: ids.length, pill: !!__box("#acctPill") }; });
  t.check("U4: phone on its side, signed in: one header row – Back, connection, state, TORCH and STOP side by side (account pill in the menu)", l.n === 5 && l.spread <= 12 && !l.pill, JSON.stringify(l));
  t.check("U4: STOP is the largest control", !(await ev(page, () => __stopBiggest())).length);
  l = await ev(page, () => ({ sheet: !!__box("#layoutCard .sheetrow"), nest: !!__box("#nestBox"), origin: !!__box("#originCard") }));
  t.check("U8: sheet size, nest and saved start points are not in the Bed & start scroll", !l.sheet && !l.nest && !l.origin, JSON.stringify(l));
  await ev(page, () => document.getElementById("btnZero").click()); await sleep(300);
  t.check("U8: the start-point card folds once the start point is set", await ev(page, () => !document.getElementById("zeroCard").open));
  await page.click("#btnMore3"); await sleep(200);
  l = await ev(page, () => ({ sheet: !!document.querySelector("#cutSheetBody .sheetrow") && !!__box("#cutSheetBody .sheetrow"), wraps: __wrapped(["#cutSheetBody > button", "#cutSheetBody .sheetrow .unitin"]) }));
  t.check("U8: sheet size is in More, one line each", l.sheet && !l.wraps.length, JSON.stringify(l));
  await page.keyboard.press("Escape"); await sleep(100);
  t.check("U8: closing More puts sheet size back", await ev(page, () => !!document.querySelector("#layoutCard .sheetrow")));
  t.check("phone on its side: no page scroll", await ev(page, () => __noPageScroll()));
  await page.ctx.close();
}

// ---------------------------------------------------------------- phone upright: the turn cover
{
  const page = await newPage(br, "phone390x844", { base: srv.base, consoleErrors: false, query: "?test=1" }); await page.evaluate(PAGE);
  await demoToShape(page, { stay: "cut" }); await ev(page, () => window.plasmaTest.goStep(3)); await sleep(400);
  l = await ev(page, () => { const s = __box("#btnStop"), hit = document.elementFromPoint(s.l + s.w / 2, s.t + s.h / 2), hb = __box("#btnHome");
    const home = hb ? document.elementFromPoint(hb.l + hb.w / 2, hb.t + hb.h / 2) : null;
    return { cover: !!__box("#turnOverlay"), stop: !!hit && !!hit.closest("#btnStop"), home: !!home && !!home.closest("#btnHome"), hint: /Rotation locked/.test(document.getElementById("turnOverlay").textContent) }; });
  t.check("U10: the turn cover leaves STOP and Back clear and explains rotation lock", l.cover && l.stop && l.home && l.hint, JSON.stringify(l));
  await page.click("#btnTurnUpright"); await sleep(150);
  t.check("U2: 'Use it upright' hides the cover", !(await ev(page, () => !!__box("#turnOverlay"))));
  t.check("U2: no sideways hint on the cutting screen", !(await ev(page, () => [...document.querySelectorAll(".sidehint, #sideHint")].some((e) => e.getClientRects().length))));
  await page.ctx.close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

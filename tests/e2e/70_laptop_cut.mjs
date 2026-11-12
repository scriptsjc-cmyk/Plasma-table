// Laptop cutting screen (1366x768, 1440x900, 1920x1080 with a mouse): the bed picture big in the middle, STOP the largest control and
// always in view, Start / Pause / progress / X-Y-Z / TORCH / speed in the right-hand panel, the job and machine card under the picture,
// no page scroll, safety banners and toasts clear of each other, readable in light and dark; and phones / touch tablets keep their layout.
import { T } from "../lib/t.mjs"; import { startServer, launch, newPage, demoToShape, shot, PROFILES } from "../lib/browser.mjs";
import { devices } from "playwright";

const t = new T("70_laptop_cut"); const srv = await startServer(); const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);

const inView = (sel) => { const e = document.querySelector(sel); if (!e || !e.getClientRects().length) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; };
const onTop = (sel) => { const e = document.querySelector(sel); if (!e || !e.getClientRects().length) return false; const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)); return !!hit && (hit === e || e.contains(hit)); };
const PAGE = `window.__inView = ${inView}; window.__onTop = ${onTop};
  window.__shown = (sel) => window.__inView(sel) && window.__onTop(sel);
  window.__biggest = () => {   // every rendered button on the cutting screen, the header and the banners, scrolled into view or not
    const s = document.getElementById("btnStop").getBoundingClientRect(), sa = s.width * s.height, out = [];
    for (const b of document.querySelectorAll("#cutView button, .banner button, .topbar button")) {
      if (b.id === "btnStop" || !b.getClientRects().length || getComputedStyle(b).visibility === "hidden") continue;   // (r7 U28: the "Show me" jump buttons count too)
      const r = b.getBoundingClientRect(); if (r.width * r.height >= sa) out.push((b.id || b.className) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
    return { stop: Math.round(s.width) + "x" + Math.round(s.height), area: Math.round(sa), bigger: out };
  };
  window.__noPageScroll = () => { const d = document.scrollingElement; return d.scrollHeight <= innerHeight + 1 && d.scrollWidth <= innerWidth + 1 && scrollY === 0; };
  window.__rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  window.__contrast = (sel) => {   // text colour against the first opaque background behind it (WCAG ratio)
    const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    let worst = 99;
    for (const e of document.querySelectorAll(sel)) {
      if (!e.getClientRects().length) continue;
      const fg = rgb(getComputedStyle(e).color); let n = e, bg = null;
      while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0.95)) { bg = c; break; } n = n.parentElement; }
      bg = bg || [255, 255, 255];
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); worst = Math.min(worst, (a + 0.05) / (b + 0.05));
    }
    return Math.round(worst * 100) / 100;
  };`;
const helpers = (page) => page.evaluate(PAGE);
const SAFETY = ["estopBar", "alarmBar", "lostBar", "homeBar"];

for (const [name, prof] of [["1366x768", "d1366"], ["1440x900", "d1440"], ["1920x1080", "desktop1920"]]) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false }); await helpers(page);
  await demoToShape(page, { stay: "cut" });
  await page.waitForFunction(() => window.plasmaTest.getM().state() === "Idle", null, { timeout: 10000 }).catch(() => {});
  const n = (s) => `${name}: ${s}`;

  // ---- Bed & start
  await ev(page, () => window.plasmaTest.goStep(3)); await sleep(400);
  const bed = await ev(page, () => {
    const p = window.__rect(".previewPane"), z = window.__rect("#zeroCard"), c = window.__rect("#checkCard"), l = window.__rect("#layoutCard"), s = window.__rect("#btnStart");
    return { stop: window.__shown("#btnStop"), big: window.__biggest(), scroll: window.__noPageScroll(),
      middle: c.r <= p.l + 1 && l.r <= p.l + 1 && z.l >= p.r - 1 && s.l >= p.r - 1, wide: p.w >= innerWidth * 0.36 && p.h >= window.__rect(".cutgrid").h * 0.9,
      start: window.__shown("#btnStart"), zero: window.__shown("#btnZero"), back: window.__shown('.step[data-step="3"] .nav .back'), dl: window.__shown("#btnExport3"),
      check: window.__inView("#checkCard > summary") && window.__inView("#checklist li"), cutCheck: window.__inView("#cutCheck3") };
  });
  t.check(n("Bed & start: STOP in view, not covered, the largest control by area"), bed.stop && !bed.big.bigger.length, JSON.stringify(bed.big));
  t.check(n("Bed & start: no page-level scroll"), bed.scroll);
  t.check(n("Bed & start: the bed picture is in the middle (checklist and layout left, start point and Start right) and big"), bed.middle && bed.wide, JSON.stringify(bed));
  t.check(n("Bed & start: Start, Back and Download G-code in view in the right-hand panel"), bed.start && bed.back && bed.dl, JSON.stringify(bed));
  t.check(n("Bed & start: Start here is in view without scrolling the card"), bed.zero, JSON.stringify(bed));
  t.check(n("Bed & start: the checklist and the cut check are in view"), bed.check && bed.cutCheck, JSON.stringify(bed));
  const job = await ev(page, () => ({ shown: window.__inView("#jobCard"), stats: !!document.getElementById("jobStats").getClientRects().length,
    text: Object.fromEntries(["jcFile", "jcSize", "jcCuts", "jcMat", "jcMach"].map((id) => [id, document.getElementById(id).textContent])), file: window.plasmaTest.S.fileName,
    under: window.__rect("#jobCard").t >= window.__rect("#preview").b - 1 && document.getElementById("jobCard").closest(".previewPane") !== null }));
  t.check(n("the job and machine card is in view under the picture (in place of the one-line stats)"), job.shown && job.under && !job.stats, JSON.stringify(job));
  t.check(n("job card: file, size, cuts, material and machine are filled in"), job.text.jcFile === job.file && /\d.*×.*\d/.test(job.text.jcSize) && /\d+ cuts? · about/.test(job.text.jcCuts)
    && /mm/.test(job.text.jcMat) && /Practice/.test(job.text.jcMach) && /Ready|Idle/.test(job.text.jcMach), JSON.stringify(job.text));
  await ev(page, () => { for (const d of document.querySelectorAll('.step[data-step="3"] details')) d.open = true; }); await sleep(200);
  const open = await ev(page, () => ({ big: window.__biggest(), scroll: window.__noPageScroll(), start: window.__shown("#btnStart"), stop: window.__shown("#btnStop") }));
  t.check(n("Bed & start, every card and box open: STOP still the largest, Start in view, no page scroll"), !open.big.bigger.length && open.scroll && open.start && open.stop, JSON.stringify(open));
  await shot(page, `70-${name}-bed`);

  // ---- ready, then cutting a practice job
  await ev(page, () => document.getElementById("btnZero").click()); await sleep(300);
  await ev(page, () => document.querySelectorAll("#checklist input").forEach((c) => { if (!c.checked) c.click(); }));
  await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 }).catch(() => {});
  t.check(n("ready: Start is enabled and in view"), await ev(page, () => !document.getElementById("btnStart").disabled && window.__shown("#btnStart")));
  await page.click("#btnStart");
  const started = await page.waitForFunction(() => window.plasmaTest.S.cur === 4 && window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 10000 }).then(() => true).catch(() => false);
  t.check(n("a practice job starts"), started);
  await sleep(1200);
  const run = await ev(page, () => {
    const p = window.__rect(".previewPane"), panel = window.__rect("#running");
    const want = ["#btnStop", "#btnPause", "#pct", "#timeLeft", "#running .progress", "#running .runpos", "#torchBig", "#lsDown", "#lsUp", "#liveSpeed", "#runTitle"];
    return { missing: want.filter((s) => !window.__shown(s)), right: panel.l >= p.r - 1 && window.__rect("#btnPause").l >= p.r - 1, wide: p.w >= innerWidth * 0.4,
      pos: /X\s*-?\d+\.\d\s*Y\s*-?\d+\.\d\s*Z\s*-?\d+\.\d/.test(document.querySelector("#running .runpos").textContent), posBig: parseFloat(getComputedStyle(document.querySelector("#running .runpos b")).fontSize),
      job: window.__inView("#jobCard") && /Moving|Run/.test(document.getElementById("jcMach").textContent), big: window.__biggest(), scroll: window.__noPageScroll() };
  });
  t.check(n("cutting: STOP, Pause, % done, time left, progress, X/Y/Z, TORCH and the speed buttons all in view and not covered"), !run.missing.length, run.missing.join(", "));
  t.check(n("cutting: the run panel (and Pause) is on the right of a big picture"), run.right && run.wide, JSON.stringify(run));
  t.check(n("cutting: a big live X / Y / Z readout (24px or more)"), run.pos && run.posBig >= 24, JSON.stringify(run));
  t.check(n("cutting: the job and machine card is in view and follows the machine state"), run.job, JSON.stringify(run));
  t.check(n("cutting: STOP is the largest control by area"), !run.big.bigger.length, JSON.stringify(run.big));
  t.check(n("cutting: no page-level scroll"), run.scroll);
  await shot(page, `70-${name}-running`);
  await page.click("#btnPause"); await sleep(600);
  const pz = await ev(page, () => ({ pause: window.__shown("#btnPause"), stop: window.__shown("#btnStop"), big: window.__biggest(), scroll: window.__noPageScroll() }));
  t.check(n("paused: Pause / Resume and STOP in view, STOP still the largest, no page scroll"), pz.pause && pz.stop && !pz.big.bigger.length && pz.scroll, JSON.stringify(pz));
  await page.click("#btnPause"); await sleep(400);

  // ---- the space bar is STOP; banners and toasts
  await page.keyboard.press("Space"); await sleep(1200);
  const st = await ev(page, (SAFETY) => {
    const shown = SAFETY.filter((id) => !document.getElementById(id).classList.contains("hidden"));
    const toast = document.getElementById("toast"), tr = toast && !toast.classList.contains("hidden") && toast.getClientRects().length ? toast.getBoundingClientRect() : null;
    const clear = !tr || shown.every((id) => { const b = document.getElementById(id).getBoundingClientRect(); return tr.bottom <= b.top || tr.top >= b.bottom; });
    return { estop: window.plasmaTest.estopOn(), running: !!(window.plasmaTest.S.job && window.plasmaTest.S.job.running), shown, banners: shown.length > 0 && shown.every((id) => window.__shown("#" + id)),
      toastClear: clear, done: window.__inView("#done"), big: window.__biggest(), stop: window.__shown("#btnStop"), stopLabel: window.__rect("#estopLabel").r <= window.__rect("#btnStop").r + 1, scroll: window.__noPageScroll() };
  }, SAFETY);
  t.check(n("Space stops the job"), st.estop && !st.running, JSON.stringify(st));
  t.check(n("after STOP: every safety banner showing is in view and not covered, and no toast sits on one"), st.banners && st.toastClear, JSON.stringify(st));
  t.check(n("after STOP: the finished / stopped panel is in view; STOP (and its pressed label) in view and still the largest; no page scroll"), st.done && st.stop && st.stopLabel && !st.big.bigger.length && st.scroll, JSON.stringify(st));
  t.check(n("after STOP: the pressed STOP word is still large text (19px or more)"), await ev(page, () => parseFloat(getComputedStyle(document.getElementById("estopLabel")).fontSize) >= 19));
  await shot(page, `70-${name}-stopped`);
  await ev(page, () => window.plasmaTest.S.demo.setEstop(true)); await sleep(1200);
  const hw = await ev(page, () => ({ shown: !document.getElementById("estopBar").classList.contains("hidden"), bar: window.__shown("#estopBar") && window.__shown("#btnUnlock2"), stop: window.__shown("#btnStop"), scroll: window.__noPageScroll() }));
  t.check(n("E-STOP PRESSED banner and its Unlock in view and not covered, STOP too, no page scroll"), hw.shown && hw.bar && hw.stop && hw.scroll, JSON.stringify(hw));
  await ev(page, () => window.plasmaTest.S.demo.setEstop(false)); await sleep(300);
  t.check(n("no page errors"), page.errors.filter((e) => !/status of 404/.test(e)).length === 0, page.errors.join(" | ").slice(0, 300));
  await page.ctx.close();
}

// ---- light and dark: the new text is readable (WCAG AA 4.5:1)
for (const scheme of ["light", "dark"]) {
  PROFILES["lap1366" + scheme] ||= { viewport: { width: 1366, height: 768 }, colorScheme: scheme };
  const page = await newPage(br, "lap1366" + scheme, { base: srv.base, consoleErrors: false }); await helpers(page);
  await demoToShape(page, { stay: "cut" });
  await page.waitForFunction(() => window.plasmaTest.getM().state() === "Idle", null, { timeout: 10000 }).catch(() => {});
  await ev(page, () => window.plasmaTest.goStep(3)); await sleep(300);
  const c3 = await ev(page, () => ({ theme: document.documentElement.dataset.theme, dt: window.__contrast("#jobCard dt"), dd: window.__contrast("#jobCard dd"), stop: window.__contrast("#estopLabel"), stopPx: parseFloat(getComputedStyle(document.getElementById("estopLabel")).fontSize) }));
  // the STOP word is large bold text (24px), so its AA threshold is 3:1
  t.check(`${scheme}: the job card labels and values (4.5:1) and the large STOP word (3:1) are readable`, c3.theme === scheme && c3.dt >= 4.5 && c3.dd >= 4.5 && c3.stopPx >= 19 && c3.stop >= 3, JSON.stringify(c3));
  await ev(page, () => document.getElementById("btnZero").click()); await sleep(300);
  await ev(page, () => document.querySelectorAll("#checklist input").forEach((c) => { if (!c.checked) c.click(); }));
  await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 }).catch(() => {});
  await ev(page, () => document.getElementById("btnStart").click());
  await page.waitForFunction(() => window.plasmaTest.S.cur === 4, null, { timeout: 10000 }).catch(() => {}); await sleep(1200);
  const c4 = await ev(page, () => ({ pos: window.__contrast("#running .runpos b"), axis: window.__contrast("#running .runpos span"), pct: window.__contrast("#pct"), speed: window.__contrast("#liveSpeedBox > div") }));
  t.check(`${scheme}: cutting: X / Y / Z, % done and speed are readable (4.5:1)`, Object.values(c4).every((v) => v >= 4.5), JSON.stringify(c4));
  if (scheme === "dark") await shot(page, "70-1366x768-dark-running");
  await page.keyboard.press("Space"); await sleep(400);
  await page.ctx.close();
}

// ---- phones and touch tablets keep their own layout
const phone = (w, h) => ({ ...devices["iPhone 14"], viewport: { width: w, height: h }, screen: { width: w, height: h } });
PROFILES.phone844x390 ||= phone(844, 390); PROFILES.phone390x844 ||= phone(390, 844);
PROFILES.touch1366 ||= { viewport: { width: 1366, height: 1024 }, hasTouch: true, isMobile: true };
for (const prof of ["phone844x390", "phone390x844", "touch1366"]) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  await demoToShape(page, { stay: "cut" });
  await ev(page, () => window.plasmaTest.goStep(3)); await sleep(300);
  const l = await ev(page, () => ({ card: document.getElementById("jobCard").getClientRects().length, stats: !!document.getElementById("jobStats").getClientRects().length,
    stop: getComputedStyle(document.getElementById("btnStop")).flexDirection, contents: getComputedStyle(document.querySelector(".stepPane")).display }));
  t.check(`${prof}: none of the laptop layout (no job card, STOP stacked, the step pane is one pane)`, !l.card && l.stats && l.stop === "column" && l.contents !== "contents", JSON.stringify(l));
  await page.ctx.close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

// r15 Round 7.1 (fixes in Round 1.1-1.3): the "Before you cut" confirm can never start a job off the cutting screen.
// Any screen, step or tab change cancels it, Menu / ☰ / the step tabs are off while it is open, and a job never runs
// while STOP is not on screen. Also: the Cutting safety sentence is never clipped (1.2) and the Stopped message is
// not a toast over the next-step buttons (1.3). Practice table only; real clicks where a person would click.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("112_r15_safety");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const J = (x) => JSON.stringify(x).slice(0, 600);
const showTab = (page, name) => ev(page, (name) => import(window.__J.nav).then((n) => n.showTab(name)), name);

async function toStart(page) {
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); const s = T.sketch; s.clear(); s.add("plate", true); const it = s.items[0]; Object.assign(it.p, { w: 60, h: 40, r: 4, hole: 8, inset: 10 }); s.pick([it.id]); s.commit(); T.sendToCutting(); T.goStep(3); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await ev(page, () => document.getElementById("btnDemo").click());
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
  await ev(page, () => window.plasmaTest.goStep(3));
  await page.click("#btnZero"); await sleep(300);
  for (const cb of await page.locator("#checklist input").all()) await cb.check();
  await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 });
  // watch for the one thing that must never happen: a job running while STOP is not on screen
  await ev(page, () => {
    window.__noStop = [];
    const d = window.plasmaTest.S.demo; d.__tx = []; const w = d.write.bind(d);
    d.write = (x) => { d.__tx.push(typeof x === "string" ? x : Array.from(x).map((c) => String.fromCharCode(c)).join("")); return w(x); };
    const tick = () => {
      const T = window.plasmaTest, b = document.getElementById("btnStop"), r = b && b.getBoundingClientRect(), s = b && getComputedStyle(b);
      const seen = !!(r && r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && r.bottom > 0 && r.top < innerHeight);
      if (T.S.job && T.S.job.running && !seen) window.__noStop.push(T.screen() + "/" + T.S.cur);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const dlgOpen = (page) => ev(page, () => !document.getElementById("safeDlg").classList.contains("hidden"));
const openStartConfirm = async (page) => {
  page._safeConfirmAuto = "show";                 // show the real dialog instead of answering it in the harness
  await page.click("#btnStart");
  await page.waitForFunction(() => !document.getElementById("safeDlg").classList.contains("hidden") && /Before you cut/.test(document.getElementById("safeDlgTitle").textContent), null, { timeout: 5000 });
};
const jobState = (page) => ev(page, () => {
  const T = window.plasmaTest;
  return { running: !!(T.S.job && T.S.job.running), screen: T.screen(), step: T.S.cur, tab: T.S.tab, noStop: window.__noStop.slice(0, 3),
    gcode: T.S.demo.__tx.join("").split("\n").filter((l) => /^(G0?[123]\b|M3)/.test(l.replace(/[?!~\x18]/g, "").trim())).length };
});
const clickOk = async (page) => { if (await dlgOpen(page)) await page.click("#safeDlgOk"); await sleep(1200); };

// 1) the r14 A1 steps, with real clicks: Setup -> Start -> "‹ Menu" -> "Everything's correct – start"
{
  const page = await newPage(br, "d1536x730", { base: srv.base });
  await toStart(page);
  await openStartConfirm(page);
  const off = await ev(page, () => {
    const dis = (el) => !!el && (el.disabled || el.getAttribute("aria-disabled") === "true");
    return { menu: dis(document.getElementById("btnHome")), burger: dis(document.getElementById("btnTopMenu")),
      steps: [...document.querySelectorAll("#stepper li")].every(dis), tabs: [...document.querySelectorAll(".tab")].filter((x) => x.getBoundingClientRect().width > 0).every(dis) };
  });
  t.check("Start confirm open: Menu, ☰, the step tabs and the Machine setup tab are disabled", off.menu && off.burger && off.steps && off.tabs, J(off));
  await page.locator("#btnHome").click({ force: true, timeout: 2000 }).catch(() => {});
  await sleep(400);
  const after = await jobState(page);
  t.check("clicking ‹ Menu with the Start confirm open does not leave the cutting screen", after.screen === "cut", J(after));
  await clickOk(page);
  const s = await jobState(page);
  t.check("A1 steps: a job never runs off the cutting screen", !(s.running && (s.screen !== "cut" || s.tab !== "cut")), J(s));
  t.check("A1 steps: a job never runs while STOP is not on screen", !s.noStop.length, J(s));
  t.check("no page error", !page.errors.length, J(page.errors.slice(0, 3)));
  await page.ctx.close();
}

// 2) every other way off the screen (Back button, ☰ -> Machine setup, a step tab) cancels the confirm: it resolves "no"
const routes = [
  ["the browser Back button (screen change)", async (page) => { await ev(page, () => window.plasmaTest.showScreen("menu")); }],
  ["☰ -> Machine setup (tab change)", async (page) => { await ev(page, () => { const b = document.getElementById("btnBarSetup"); if (b && !b.disabled) b.click(); }); await showTab(page, "setup"); }],
  ["step tab 1 Part (step change)", async (page) => { await ev(page, () => window.plasmaTest.goStep(1)); }],
];
for (const [name, go] of routes) {
  const page = await newPage(br, "d1366x640", { base: srv.base });
  await toStart(page);
  await openStartConfirm(page);
  await go(page);
  await sleep(400);
  t.check(`${name}: the open Start confirm is closed`, !(await dlgOpen(page)), J(await jobState(page)));
  await clickOk(page);
  const s = await jobState(page);
  t.check(`${name}: no job starts and no cut G-code is sent`, !s.running && s.gcode === 0, J(s));
  t.check(`${name}: never a job without STOP on screen`, !s.noStop.length, J(s));
  // the normal path still works: back on Setup, Start -> confirm -> start runs the job with STOP in view
  await ev(page, () => window.plasmaTest.showScreen("cut")); await showTab(page, "cut"); await ev(page, () => window.plasmaTest.goStep(3));
  await sleep(300);
  for (const cb of await page.locator("#checklist input").all()) await cb.check().catch(() => {});
  const can = await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 }).then(() => true).catch(() => false);
  if (can) {
    await openStartConfirm(page);
    await clickOk(page);
    const s2 = await jobState(page);
    t.check(`${name}: afterwards, Start -> confirm still starts the job, with STOP on screen`, s2.running && s2.screen === "cut" && !s2.noStop.length, J(s2));
    await ev(page, () => document.getElementById("btnStop").click()); await sleep(600);
  } else t.check(`${name}: afterwards, Start is available again`, false, await ev(page, () => document.getElementById("blockers").textContent));
  t.check(`${name}: no page error`, !page.errors.length, J(page.errors.slice(0, 3)));
  await page.ctx.close();
}

// 3) 1.2 the Cutting safety sentence is never clipped, and 1.3 the Stopped message is not a toast over the next-step buttons
for (const prof of ["d1280x600", "d1366x640", "d1536x730", "d1920x970"]) {
  const page = await newPage(br, prof, { base: srv.base });
  await toStart(page);
  await page.click("#btnStart");
  await page.waitForFunction(() => window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 8000 }).catch(() => {});
  await sleep(500);
  const clip = await ev(page, () => {
    const bad = [];
    for (const id of ["runHelp", "safetyHint"]) {
      const el = document.getElementById(id); if (!el) continue;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (r.width === 0 || s.display === "none" || !el.textContent.trim()) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) bad.push(id + " overflows its box");
      if (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none" && s.webkitLineClamp) bad.push(id + " is cut with … / line clamp");
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p); if (ps.overflowX === "visible" && ps.overflowY === "visible") continue;
        const pr = p.getBoundingClientRect();
        if (r.bottom > pr.bottom + 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.left < pr.left - 1) { bad.push(id + " clipped by " + (p.id || p.className)); break; }
      }
      if (r.bottom > innerHeight + 1) bad.push(id + " below the screen");
    }
    return bad;
  });
  t.check(`${prof} cutting: the safety sentence is shown in full`, !clip.length, J(clip));
  await page.click("#btnStop");
  await sleep(500);
  const st = await ev(page, () => {
    const shown = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"; };
    const toast = document.getElementById("toast"), tr = toast.getBoundingClientRect();
    const covered = shown(toast) && !toast.classList.contains("hidden") ? [...document.querySelectorAll("button, input, select")].filter((b) => {
      if (!shown(b) || b.id === "btnStop") return false; const r = b.getBoundingClientRect();
      return Math.min(r.right, tr.right) - Math.max(r.left, tr.left) > 2 && Math.min(r.bottom, tr.bottom) - Math.max(r.top, tr.top) > 2; }).map((b) => b.id || b.textContent.trim().slice(0, 20)) : [];
    const done = document.getElementById("done");
    return { covered, panel: shown(done) ? done.innerText.replace(/\s+/g, " ").slice(0, 300) : "", toast: shown(toast) && !toast.classList.contains("hidden") ? toast.textContent : "" };
  });
  t.check(`${prof} stopped: no toast over a control`, !st.covered.length, J(st));
  t.check(`${prof} stopped: the panel itself says how to reset (hold the red button)`, /hold the red button/i.test(st.panel), J(st));
  t.check(`${prof}: no page error`, !page.errors.length, J(page.errors.slice(0, 3)));
  await page.ctx.close();
}

await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

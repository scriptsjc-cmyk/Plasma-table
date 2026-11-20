// r13 section 2: step and tab changes ease in (0.15 s) without anything jumping; STOP never moves, fades or resizes while
// they run; reduced motion and a running job swap instantly.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape, ensurePracticeHomed } from "../lib/browser.mjs";

const t = new T("111_r13_transitions");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const ck = (n, ok, info) => t.check(n, ok, info == null ? "" : (typeof info === "string" ? info : JSON.stringify(info)));

// Change step inside the page and sample STOP and the header every frame for 300 ms.
const sampleStep = (page, n) => ev(page, (n) => new Promise((res) => {
  const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(","); };
  const stop = document.getElementById("btnStop"), bar = document.querySelector(".topbar");
  const before = r(stop);
  window.plasmaTest.goStep(n);
  const st0 = r(stop), bar0 = r(bar), op0 = getComputedStyle(stop).opacity;   // measured after the swap: the animation must not move them
  const stopJumped = st0 !== before;
  const step = document.querySelector(`.step[data-step="${n}"]`);
  const cls = [...step.classList].filter((c) => c.startsWith("tx-"));
  const anim = getComputedStyle(step).animationName;
  const out = { cls, anim, stopJumped, stopMoved: [], barMoved: [], stopFaded: false, stopAnim: getComputedStyle(stop).animationName };
  const t0 = performance.now();
  const tick = () => {
    if (r(stop) !== st0) out.stopMoved.push(r(stop));
    if (r(bar) !== bar0) out.barMoved.push(r(bar));
    if (getComputedStyle(stop).opacity !== op0) out.stopFaded = true;
    if (performance.now() - t0 < 300) requestAnimationFrame(tick); else { out.left = [...step.classList].filter((c) => c.startsWith("tx-")); res(out); }
  };
  requestAnimationFrame(tick);
}), n);

for (const [label, prof] of [["1366x640", "d1366x640"], ["1920x970", "d1920x970"]]) {
  const page = await newPage(br, prof, { base: srv.base });
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(1); });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut", null, { timeout: 10000 });
  await page.waitForTimeout(400);
  const fwd = await sampleStep(page, 3);
  ck(`${label}: Part -> Setup slides forward`, fwd.cls.includes("tx-fwd") && fwd.anim === "txFwd", fwd);
  ck(`${label}: STOP and the header stay exactly still during the step change`, !fwd.stopJumped && !fwd.stopMoved.length && !fwd.barMoved.length && !fwd.stopFaded, fwd);
  ck(`${label}: the transition class is gone afterwards (0.15 s)`, !fwd.left.length, fwd);
  await page.waitForTimeout(200);
  const back = await sampleStep(page, 1);
  ck(`${label}: Setup -> Part slides back`, back.cls.includes("tx-back"), back);
  ck(`${label}: STOP still during the way back too`, !back.stopJumped && !back.stopMoved.length && !back.barMoved.length && !back.stopFaded, back);
  await page.context().close();
}

// Reduced motion: instant swap.
{
  const page = await newPage(br, "d1366x640", { base: srv.base });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(1); });
  await page.waitForTimeout(300);
  const s = await sampleStep(page, 3);
  ck("reduced motion: the step changes with no animation", !s.cls.length && s.anim === "none", s);
  await page.context().close();
}

// A running practice job (the in-app practice table, no hardware): nothing animates.
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const page = await newPage(br, "d1366x640", { base: srv.base });
  await demoToShape(page, { stay: "cut" });
  await ensurePracticeHomed(page);
  await ev(page, () => window.plasmaTest.demoEdges()); await sleep(6000);
  await ev(page, () => window.plasmaTest.goStep(3)); await sleep(600);
  await ev(page, () => document.getElementById("btnZero").click()); await sleep(500);
  await ev(page, () => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change")); }); await sleep(300);
  await ev(page, () => document.getElementById("btnStart").click()); await sleep(1500);
  const s = await ev(page, async () => {
    const m = await import(new URL("js/ui/transition.js", location.href).href);
    const el = document.querySelector(".step:not(.hidden)") || document.body.firstElementChild;
    m.enter(el, "fwd");
    return { running: document.body.classList.contains("running-job"), still: m.still(), cls: [...el.classList].filter((c) => c.startsWith("tx-")) };
  });
  ck("while a job runs: the helper adds no transition", s.running && s.still && !s.cls.length, s);
  await ev(page, () => document.getElementById("btnStop").click()); await sleep(500);
  await page.context().close();
}

// r13 section 3: STOP is the top layer. Open every dialog, numpad and sheet in turn (Make with STOP showing, and Cut): STOP is
// still what a tap on its centre hits, and the dialog's top edge sits below the header, not under it.
for (const [scr, conn] of [["make", true], ["cut", true], ["cut", false]]) {
  const page = await newPage(br, "d1366x640", { base: srv.base });
  if (conn) { await demoToShape(page, { stay: "cut" }); await ensurePracticeHomed(page); }
  else { await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(3); }); }
  if (scr === "make") await ev(page, () => window.plasmaTest.showScreen("make"));
  await page.waitForTimeout(400);
  const res = await ev(page, () => {
    const out = [];
    const stop = document.getElementById("btnStop"), bar = document.querySelector(".topbar");
    for (const d of document.querySelectorAll(".numpad, .shapelib, .safedlg, .presetbrowser, .fold3d-lb, .shortcut-sheet")) {
      const had = d.classList.contains("hidden"), hadAttr = d.hasAttribute("hidden");
      d.classList.remove("hidden"); d.removeAttribute("hidden");
      if (getComputedStyle(d).display !== "none") {
        const r = stop.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const dr = d.getBoundingClientRect(), br = bar.getBoundingClientRect();
        out.push({ id: d.id || d.className, onStop: !!(hit && stop.contains(hit)), below: dr.top >= br.bottom - 2 });
      }
      if (had) d.classList.add("hidden"); if (hadAttr) d.setAttribute("hidden", "");
    }
    return out;
  });
  const bad = res.filter((x) => !x.onStop || !x.below);
  ck(`${scr}${conn ? " connected" : " not connected"}: STOP stays on top of every dialog, numpad and sheet, and none starts under the header (${res.length} checked)`, res.length > 10 && !bad.length, bad);
  await page.context().close();
}

// r13 section 3: every visible icon-only button has a tooltip (title), on the menu, Make (Simple and Advanced), Part, Setup and Machine setup.
{
  const page = await newPage(br, "d1366x640", { base: srv.base });
  const scan = () => ev(page, () => [...document.querySelectorAll("button, [role=button], summary")]
    .filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== "hidden" && !(b.innerText || "").trim() && !b.title && !(b.classList.contains("info-i") && b.getAttribute("aria-label")))   // an "i" opens its own hover tip
    .map((b) => b.id || b.className || b.tagName));
  const bad = [];
  const add = async (tag) => (await scan()).forEach((x) => bad.push(tag + ": " + x));
  await ev(page, () => window.plasmaTest.showScreen("menu")); await page.waitForTimeout(300); await add("menu");
  await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.sketch.clear(); T.sketch.add("rect"); }); await page.waitForTimeout(300); await add("make");
  await ev(page, () => { const b = document.querySelector('.modesw-btn[data-mode="pro"], .modesw-btn[data-mode="advanced"]'); if (b) b.click(); }); await page.waitForTimeout(400); await add("make advanced");
  await demoToShape(page, { stay: "cut" }); await ensurePracticeHomed(page); await add("part");
  await ev(page, () => window.plasmaTest.goStep(3)); await page.waitForTimeout(400); await add("setup");
  await ev(page, () => document.querySelector('.tab[data-tab="setup"]') && window.plasmaTest.showScreen("cut")); await page.waitForTimeout(200);
  await ev(page, () => import(new URL("js/ui/nav.js", location.href).href).then((n) => n.showTab("setup"))); await page.waitForTimeout(400); await add("machine setup");
  ck("every visible icon-only button has a tooltip", !bad.length, bad.slice(0, 12));
  await page.context().close();
}

await br.close(); srv.close();
process.exit(t.done() ? 1 : 0);

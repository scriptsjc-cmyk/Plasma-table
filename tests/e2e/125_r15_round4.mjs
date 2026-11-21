// r15 Round 4 (screen polish) plus the checker's phone nits from its 11:47 report. Practice table only; never USB Connect.
// Checker N1: on a phone a help line must not say the same thing twice (short label + full tip both visible).
// Checker N2: the "Turn your phone sideways" pill never sits over the Features bottom sheet.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("125_r15_round4");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const J = (x) => JSON.stringify(x).slice(0, 600);

// every visible help line (.has-info): the visible words must not repeat the opening of the line
const dupHelp = (page) => ev(page, () => {
  const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden" && !(e.getBoundingClientRect().width <= 1);
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  for (const el of document.querySelectorAll(".has-info")) {
    if (!shown(el)) continue;
    const lab = el.querySelector(".info-label"), body = el.querySelector(".info-body");
    if (!shown(lab) || !shown(body)) continue;
    const a = words(lab.textContent), b = words(body.textContent);
    if (a.length >= 3 && b.length >= 3 && a.slice(0, 4).join(" ") === b.slice(0, 4).join(" ")) out.push((el.id || el.textContent).slice(0, 60));
  }
  return out;
});

try {
  // ---------------------------------------------------------------- checker N1 + N2 on an iPhone 14
  {
    const page = await newPage(br, "iphone14", { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    await ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode && T.setAppMode("simple", { persist: false, autoFs: false });
      const s = T.sketch; s.clear(); s.add("rect", true, {}); s.commit(); s.pick([s.items[0].id]); s.onSelect(); });
    await sleep(500);
    const help = await ev(page, () => document.getElementById("ghHelp") && document.getElementById("ghHelp").innerText);
    const d1 = await dupHelp(page);
    t.check("N1 phone Make › Set the size: the help line does not say it twice", d1.length === 0 && !/Type how big it should be\W+Type how big/i.test(help || ""), J({ d1, help }));
    await ev(page, () => { const T = window.plasmaTest; T.sendToCutting(); });
    await page.waitForFunction(() => window.plasmaTest.screen() === "cut"); await ev(page, () => window.plasmaTest.goStep(1)); await sleep(400);
    await ev(page, () => { const d = document.getElementById("advCut"); if (d) d.open = true; }); await sleep(300);
    const d2 = await dupHelp(page);
    t.check("N1 phone Cut › More cut options: no help line says it twice", d2.length === 0, J(d2));
    // N2: the sideways pill and the Features sheet
    await ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false });
      const s = T.sketch; s.clear(); s.add("rect", true, {}); const g = s.items[0]; g.feats = [{ id: 1, k: "hole", x: 50, y: 40, d: 20 }]; g._key = undefined;
      s.commit(); s.pick([g.id]); s.onSelect(); s.fitView(); });
    await sleep(500);
    const hintBefore = await ev(page, () => { const e = document.getElementById("sidewaysHint"); return !!e && e.getClientRects().length > 0; });
    await page.tap("#featSheetBtn"); await sleep(400);
    const over = await ev(page, () => {
      const h = document.getElementById("sidewaysHint"), s = document.getElementById("featSheet");
      const hv = !!h && h.getClientRects().length > 0, sv = !!s && !s.hidden && s.getClientRects().length > 0;
      if (!hv || !sv) return { hv, sv, overlap: false };
      const a = h.getBoundingClientRect(), b = s.getBoundingClientRect();
      return { hv, sv, overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom };
    });
    t.check("N2 phone: the sideways pill is not over the Features sheet while it is open", over.sv && !over.overlap, J({ hintBefore, over }));
    await page.tap("#featSheetClose").catch(() => {}); await sleep(300);
    const hintAfter = await ev(page, () => { const e = document.getElementById("sidewaysHint"); return !!e && e.getClientRects().length > 0; });
    t.check("N2 phone: the sideways pill comes back when the sheet closes (if it was showing)", hintAfter === hintBefore, J({ hintBefore, hintAfter }));
    t.check("no page error (phone)", !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
} catch (e) {
  t.check("125 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

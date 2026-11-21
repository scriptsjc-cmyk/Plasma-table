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
  // ---------------------------------------------------------------- 4.x-extra (Josh 21 Nov): the ☰ menu's Export DXF / SVG and
  // Download G-code open a pop-up you can see and use on a laptop (it opened inside a hidden header wrapper / cut-screen row)
  for (const prof of ["d1536x730", "d1280x600"]) {
    const page = await newPage(br, prof, { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    const popState = (id, btnId) => ev(page, ([id, btnId]) => {
      const p = document.getElementById(id), b = document.getElementById(btnId);
      const r = p && p.getBoundingClientRect(), br = b && b.getBoundingClientRect();
      const hit = br && br.width > 0 ? document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2) : null;
      const top = document.querySelector(".topbar"), tb = top ? top.getBoundingClientRect().bottom : 0;
      return { open: !!p && !p.classList.contains("hidden"), vis: !!p && p.getClientRects().length > 0 && r.width > 0, onScreen: !!r && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0,
        belowHeader: !!r && r.top >= tb - 1, btnHit: !!(hit && b && (hit === b || b.contains(hit))) };
    }, [id, btnId]);
    const viaMenu = async (item) => {
      await page.click("#btnTopMenu"); await sleep(250);
      await page.click("#" + item); await sleep(400);
    };
    await ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("pro", { persist: false, autoFs: false });
      const s = T.sketch; s.clear(); s.add("rect", true, { w: 80, h: 50 }); s.commit(); s.draw(); });
    await sleep(300);
    await viaMenu("menuExportDxf");
    const dx = await popState("makeExportPop", "makeExpDxf");
    t.check(`4.x-extra ${prof} Make: ☰ › Export DXF / SVG shows the Save the drawing pop-up, on screen under the header, DXF clickable`, dx.open && dx.vis && dx.onScreen && dx.belowHeader && dx.btnHit, J(dx));
    if (dx.vis) { await page.click("#makeExpCancel"); await sleep(300); }
    const dx2 = await popState("makeExportPop", "makeExpDxf");
    t.check(`4.x-extra ${prof} Make: its Cancel closes it`, !dx2.open, J(dx2));
    await viaMenu("menuExportGcode");
    const gc = await ev(page, () => ({ gate: (() => { const g = document.getElementById("gateDlg"); return !!g && !g.classList.contains("hidden"); })() }));
    const gp = await popState("exportPop", "exportGo");
    t.check(`4.x-extra ${prof} Make: ☰ › Download G-code shows Save G-code as (or the link-a-machine prompt), on screen and usable`, gc.gate || (gp.open && gp.vis && gp.onScreen && gp.btnHit), J({ gc, gp }));
    await ev(page, () => { const c = document.getElementById("exportCancel"); if (c && c.getClientRects().length) c.click(); const g = document.querySelector("#gateDlg .acct-close"); if (g && g.getClientRects().length) g.click(); }); await sleep(300);
    // the cutting screen's own Download G-code (what e2e 47 presses on step 1)
    await ev(page, () => window.plasmaTest.sendToCutting()); await page.waitForFunction(() => window.plasmaTest.screen() === "cut");
    await ev(page, () => window.plasmaTest.goStep(1)); await sleep(400);
    await ev(page, () => document.getElementById("btnExport").click()); await sleep(400);
    const g1 = await popState("exportPop", "exportGo");
    const gate1 = await ev(page, () => { const g = document.getElementById("gateDlg"); return !!g && !g.classList.contains("hidden"); });
    t.check(`4.x-extra ${prof} Cut step 1: Download G-code shows Save G-code as (or the link prompt), on screen and usable`, gate1 || (g1.open && g1.vis && g1.onScreen && g1.btnHit), J({ g1, gate1 }));
    t.check(`no page error (${prof})`, !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
} catch (e) {
  t.check("125 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

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
const innerHeightOf = (prof) => Number(prof.split("x")[1]);

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
  // ---------------------------------------------------------------- 4.1–4.5 Get to cutting, step 1 Part (laptop)
  const box = (page, sel) => ev(page, (sel) => { const e = document.querySelector(sel); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
  const meets = (a, b) => !!(a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1);
  for (const prof of ["d1280x600", "d1366x640", "d1536x730"]) {
    const page = await newPage(br, prof, { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    await ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); const s = T.sketch; s.clear(); s.add("rect", true, { w: 120, h: 80 }); s.commit(); T.sendToCutting(); });
    await page.waitForFunction(() => window.plasmaTest.screen() === "cut");
    await ev(page, () => window.plasmaTest.goStep(1)); await sleep(500);
    // 4.1 header never sits on the panels: not connected, and in Practice (Practice + Ready + Torch off pills)
    for (const state of ["not connected", "practice"]) {
      if (state === "practice") { await ev(page, () => window.plasmaTest.goStep(3)); await sleep(300); await page.click("#btnDemo").catch(() => {}); await sleep(900); await ev(page, () => window.plasmaTest.goStep(1)); await sleep(500); }
      const hb = await box(page, ".topbar"), cols = await ev(page, () => ["#pickPane > .part-col", "#pickPane > .mat-col", ".previewPane"].map((q) => { const e = document.querySelector(q); return e && e.getClientRects().length ? e.getBoundingClientRect().top : null; }));
      t.check(`4.1 ${prof} ${state}: the header ends above every step-1 panel`, hb && cols.every((top) => top == null || top >= hb.b - 1), J({ hb, cols }));
    }
    // 4.2 Cut speed and More cut options are on screen, above Next and not under anything
    const nx = await box(page, "#next1"), sp = await box(page, "#speedBox > summary"), ad = await box(page, "#advCut > summary");
    const hits = await ev(page, () => ["#speedBox > summary", "#advCut > summary"].map((q) => { const e = document.querySelector(q); if (!e || !e.getClientRects().length) return false; const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); }));
    t.check(`4.2 ${prof}: Cut speed and More cut options are visible, not under Next, and clickable`, sp && ad && nx && !meets(sp, nx) && !meets(ad, nx) && sp.b <= innerHeightOf(prof) && ad.b <= innerHeightOf(prof) && hits.every(Boolean), J({ sp, ad, nx, hits }));
    // 4.3 Practice run is the app's switch
    const pr = await ev(page, () => { const i = document.getElementById("dryRun"), r = i.getBoundingClientRect(), cs = getComputedStyle(i); return { role: i.getAttribute("role"), w: r.width, h: r.height, ap: cs.appearance, checked: i.checked }; });
    t.check(`4.3 ${prof}: Practice run is a switch (role=switch, wider than tall, not a 44 px box)`, pr.role === "switch" && pr.ap === "none" && pr.w >= 40 && pr.h >= 22 && pr.w >= 1.4 * pr.h, J(pr));
    const before = await ev(page, () => document.getElementById("dryRun").checked);
    await page.click("#dryRun"); await sleep(300);
    const after = await ev(page, () => ({ c: document.getElementById("dryRun").checked, job: !!(window.plasmaTest.S.prepared && window.plasmaTest.S.prepared.dry_run) }));
    t.check(`4.3 ${prof}: clicking the switch turns Practice run over (the prepared job follows)`, after.c === !before && after.job === after.c, J({ before, after }));
    await page.click("#dryRun"); await sleep(150);
    // 4.4 Cut speed is shown once on step 1
    const cs = await ev(page, () => [...document.querySelectorAll(".step[data-step='1'] *, #pickPane *")].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && [...e.childNodes].some((n) => n.nodeType === 3 && /Cut speed/i.test(n.textContent))).map((e) => e.textContent.trim().slice(0, 40)));
    t.check(`4.4 ${prof}: "Cut speed" is shown once on step 1`, new Set(cs).size === 1 && cs.length === 1, J(cs));
    // 4.5 Practice run, Cut speed and More cut options sit in the left column, under the part choices
    const lc = await box(page, "#pickPane > .part-col"), pv = await box(page, ".previewPane"), dr = await box(page, "#dryRun"), st = await box(page, "#btnStraight");
    t.check(`4.5 ${prof}: Practice run and the cut options are in the left column, below Straight cut`, lc && pv && dr && sp && ad && st && [dr, sp, ad].every((b) => b.r <= pv.l + 1 && b.t >= st.b - 1), J({ lc, pv, dr, sp, ad, st }));
    t.check(`4.5 ${prof}: nothing in the left column runs off the bottom`, [dr, sp, ad].every((b) => b && b.b <= innerHeightOf(prof)), J({ dr, sp, ad }));
    t.check(`no page error (${prof} cut step 1)`, !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
} catch (e) {
  t.check("125 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

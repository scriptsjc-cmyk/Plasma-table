// r15 Round 4 (screen polish) plus the checker's phone nits from its 11:47 report. Practice table only; never USB Connect.
// Checker N1: on a phone a help line must not say the same thing twice (short label + full tip both visible).
// Checker N2: the "Turn your phone sideways" pill never sits over the Features bottom sheet.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape } from "../lib/browser.mjs";

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
    // first job: the "Ticked for you…" note shows too; the card still fits without its own scroll bar
    const fj = await ev(page, () => { const n = document.getElementById("dryFirstNote"); n.classList.remove("hidden"); const rc = document.querySelector("#pickPane > .run-col"); const r = rc.getBoundingClientRect();
      const out = { sh: rc.scrollHeight, ch: rc.clientHeight, b: r.bottom, vh: innerHeight }; n.classList.add("hidden"); return out; });
    t.check(`4.5 ${prof}: with the first-job note showing, the card fits (no inner scroll, on screen)`, fj.sh <= fj.ch + 2 && fj.b <= fj.vh, J(fj));
    t.check(`no page error (${prof} cut step 1)`, !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
  // ---------------------------------------------------------------- 4.6–4.10 Setup (laptop), not connected and in Practice
  const toSetup = async (page) => {
    await ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); const s = T.sketch; s.clear(); s.add("rect", true, { w: 120, h: 80 }); s.commit(); T.sendToCutting(); });
    await page.waitForFunction(() => window.plasmaTest.screen() === "cut");
    await ev(page, () => window.plasmaTest.goStep(3)); await sleep(600);
  };
  // text cut off: an element with its own words whose words don't fit (ellipsis / clipped), skipping screen-reader-only and folded tips
  const cutText = (page, rootSel) => ev(page, (rootSel) => {
    const out = [];
    for (const root of document.querySelectorAll(rootSel)) for (const e of [root, ...root.querySelectorAll("*")]) {
      if (!e.getClientRects().length) continue;
      const r = e.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue;
      if (e.closest(".sr-only, .info-body, .dl-label") && getComputedStyle(e.closest(".sr-only, .info-body, .dl-label")).position === "absolute") continue;
      const c = getComputedStyle(e);
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const wide = e.scrollWidth > e.clientWidth + 1 && c.overflowX !== "visible";
      const tall = e.scrollHeight > e.clientHeight + 2 && c.overflowY !== "visible";
      if (wide || tall) out.push({ id: e.id || String(e.className).slice(0, 30), t: e.textContent.trim().slice(0, 40), sw: e.scrollWidth, cw: e.clientWidth });
    }
    return out;
  }, rootSel);
  const secondaryLook = (page, sel) => ev(page, (sel) => {
    const e = document.querySelector(sel); if (!e || !e.getClientRects().length) return null;
    const c = getComputedStyle(e), r = e.getBoundingClientRect();
    return { tag: e.tagName, border: parseFloat(c.borderTopWidth), bstyle: c.borderTopStyle, bg: c.backgroundColor, ul: c.textDecorationLine, h: r.height, w: r.width };
  }, sel);
  const looksSecondary = (b) => !!b && b.tag === "BUTTON" && b.border >= 1 && b.bstyle === "solid" && !/rgba\(0, 0, 0, 0\)|transparent/.test(b.bg) && !/underline/.test(b.ul) && b.h >= 28;
  for (const prof of ["d1280x600", "d1366x640", "d1536x730"]) {
    const page = await newPage(br, prof, { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    await toSetup(page);
    for (const state of ["not connected", "practice"]) {
      if (state === "practice") { await page.click("#btnDemo"); await sleep(1500); }
      // 4.6 nothing on the cards' bottom lines (the summary strip under the bed, the checklist, Sheet & parts) is cut off
      const cut = await cutText(page, ".step[data-step='3'] #layoutCard, .step[data-step='3'] #checkCard, #cutView .previewDock");
      t.check(`4.6 ${prof} ${state}: no Setup text is cut off (the line under the bed, Before you cut, Sheet & parts)`, cut.length === 0, J(cut));
      const dock = await ev(page, () => { const d = document.querySelector("#cutView .previewDock"), r = d.getBoundingClientRect();
        return [...d.children].filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0).map((e) => { const b = e.getBoundingClientRect(); return { id: e.id, in: b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1 }; }); });
      t.check(`4.6 ${prof} ${state}: everything in the strip under the bed sits inside it`, dock.every((d) => d.in), J(dock));
      // 4.7 Check cut and Layout are buttons that look like buttons
      const lay = await secondaryLook(page, "#btnLayout"), chk = await secondaryLook(page, "#beforeCut .beforecut-link");
      t.check(`4.7 ${prof} ${state}: Layout has the secondary button look (border, fill, no underline)`, looksSecondary(lay), J(lay));
      t.check(`4.7 ${prof} ${state}: Check cut has the secondary button look (border, fill, no underline)`, chk == null || looksSecondary(chk), J(chk));
      // 4.8 Download G-code: the icon with a visible word, not a bare arrow; still fits beside Start cutting
      const dl = await ev(page, () => { const b = document.getElementById("btnExport3"), l = b.querySelector(".dl-label"), s = document.getElementById("btnStart");
        const lr = l.getBoundingClientRect(), br = b.getBoundingClientRect(), sr = s.getBoundingClientRect(), lc = getComputedStyle(l);
        return { label: l.getClientRects().length > 0 && lr.width > 20 && lc.position !== "absolute" ? l.innerText.trim() : "", name: b.getAttribute("aria-label") || b.title, icon: !!b.querySelector(".dl-icon"),
          inBtn: lr.right <= br.right + 1 && lr.left >= br.left - 1, apart: br.right <= sr.left + 1 || sr.right <= br.left + 1, startW: sr.width, sw: b.scrollWidth, cw: b.clientWidth }; });
      t.check(`4.8 ${prof} ${state}: Download G-code shows the download icon and a word (G-code), not a bare arrow`, dl.icon && /G-code/.test(dl.label) && /Download G-code/.test(dl.name) && dl.inBtn && dl.sw <= dl.cw + 1, J(dl));
      t.check(`4.8 ${prof} ${state}: it sits beside Start cutting without touching it`, dl.apart && dl.startW >= 150, J(dl));
    }
    // 4.9 Torch card (Practice): one "i", lamps big enough and clear of it, one X / Y / Z readout row, no inner scroll
    const tc = await ev(page, () => {
      const zc = document.getElementById("zeroCard"), sum = zc.querySelector(":scope > summary");
      const vis = (e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden";
      const R = (e) => e.getBoundingClientRect();
      const infos = [...zc.querySelectorAll(".info-i")].filter(vis), lamps = [...zc.querySelectorAll(".lamp")].filter(vis);
      const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      const pos = [...zc.querySelectorAll(".jogwrap .pos > div")].filter(vis), pr = pos.map(R), card = R(zc);
      const row = pos.length ? { top: Math.min(...pr.map((r) => r.top)), bottom: Math.max(...pr.map((r) => r.bottom)), l: Math.min(...pr.map((r) => r.left)), r: Math.max(...pr.map((r) => r.right)) } : null;
      // anything else sitting beside the readouts in their row
      const beside = row ? [...zc.querySelectorAll(".jogwrap button, .jogwrap .lamps, .jogwrap .steps")].filter(vis).filter((e) => { const b = R(e); return b.top < row.bottom - 2 && b.bottom > row.top + 2; }).map((e) => e.textContent.trim().slice(0, 12)) : ["no readout"];
      const scr = [zc, ...zc.querySelectorAll("*")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2).map((e) => e.className || e.id);
      const tip = (sum.querySelector(".info-i") || {}).dataset ? sum.querySelector(".info-i").dataset.tip || "" : "";
      return { infos: infos.length, inSummary: infos.filter((i) => sum.contains(i)).length, lampHit: lamps.some((l) => infos.some((i) => hit(R(l), R(i)))),
        lamps: lamps.map((l) => ({ h: Math.round(R(l).height), fs: parseFloat(getComputedStyle(l).fontSize) })),
        pos: pos.map((d) => ({ w: Math.round(R(d).width), h: Math.round(R(d).height), fs: parseFloat(getComputedStyle(d.querySelector("b")).fontSize), tab: getComputedStyle(d.querySelector("b")).fontVariantNumeric })),
        rowW: row ? Math.round(row.r - row.l) : 0, cardW: Math.round(card.width), beside, scr, keyTip: /Page Up/i.test(tip) };
    });
    t.check(`4.9 ${prof}: the Torch card has one "i" (in its title), and it covers no lamp`, tc.infos === 1 && tc.inSummary === 1 && !tc.lampHit && tc.keyTip, J(tc));
    t.check(`4.9 ${prof}: the E-stop / Head / Torch lamps are at least 13 px text and 24 px tall`, tc.lamps.length >= 3 && tc.lamps.every((l) => l.h >= 24 && l.fs >= 13), J(tc.lamps));
    t.check(`4.9 ${prof}: X / Y / Z is one readout row across the card (same widths, tabular numbers, 15 px+), nothing beside it`,
      tc.pos.length === 3 && tc.pos.every((p) => p.h >= 28 && p.fs >= 15 && /tabular-nums/.test(p.tab) && Math.abs(p.w - tc.pos[0].w) <= 1) && tc.rowW >= 0.75 * (tc.cardW - 24) && tc.beside.length === 0, J(tc));
    t.check(`4.9 ${prof}: the Torch card has no inner scroll`, tc.scr.length === 0, J(tc.scr));
    const sh = await ev(page, () => { const z = document.getElementById("btnZero").getBoundingClientRect(); let ok = z.height >= 32; const bad = [];
      for (let e = document.getElementById("btnZero").parentElement; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e); if (c.overflowY !== "visible" || c.overflowX !== "visible") { const r = e.getBoundingClientRect(); if (z.top < r.top - 1 || z.bottom > r.bottom + 1) { ok = false; bad.push(e.id || e.className); } } }
      return { ok, bad, z: [z.top, z.bottom], vh: innerHeight }; });
    t.check(`4.9 ${prof}: Start here is whole in the Torch card (not clipped at its bottom)`, sh.ok && sh.z[1] <= sh.vh, J(sh));
    // 4.10 the touch-off tag on the bed is off the gantry's X beam
    await ev(page, () => { const c = document.getElementById("showMach"); if (c && !c.checked) c.click(); }); await sleep(500);
    const tg = await ev(page, () => { const cv = document.querySelector("#cutView canvas#preview") || document.getElementById("preview"); const m = cv && cv._mach, boxes = (cv && cv._labelBoxes) || [];
      const pill = boxes.find((b) => b.startTag); return { beam: m && m.beamPx, pill }; });
    const off = tg.beam && tg.pill && !(tg.pill.l < tg.beam.r && tg.beam.l < tg.pill.r && tg.pill.t < tg.beam.b && tg.beam.t < tg.pill.b);
    t.check(`4.10 ${prof}: the "Touch off, then cut starts here" tag is not on the X beam`, !!off, J(tg));
    t.check(`no page error (${prof} setup)`, !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
  // ---------------------------------------------------------------- 4.25 one status pill in the header (laptop), and 4.11–4.14 Cutting / Stopped
  const headerStatus = (page) => ev(page, () => {
    const ids = ["connPill", "practiceChip", "stateBadge", "torchPill"];
    const vis = (e) => !!e && !e.hidden && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 2 && getComputedStyle(e).visibility !== "hidden";
    const parts = ids.map((id) => document.getElementById(id)).filter(vis).map((e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e);
      return { id: e.id, l: r.left, r: r.right, t: r.top, b: r.bottom, text: e.innerText.replace(/\s+/g, " ").trim(), rl: parseFloat(c.borderTopLeftRadius), rr: parseFloat(c.borderTopRightRadius) }; }).sort((a, b) => a.l - b.l);
    const touching = parts.every((p, i) => i === 0 || (Math.abs(p.l - parts[i - 1].r) <= 1.5 && Math.abs(p.t - parts[i - 1].t) <= 2));
    const inner = parts.every((p, i) => (i === 0 || p.rl <= 1) && (i === parts.length - 1 || p.rr <= 1));
    return { parts: parts.map((p) => p.id + ":" + p.text), touching, inner, text: parts.map((p) => p.text).join(" "), torchUpper: parts.some((p) => /TORCH OFF/.test(p.text)) };
  });
  for (const prof of ["d1280x600", "d1366x640", "d1536x730"]) {
    const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
    await page.waitForFunction(() => window.plasmaTest);
    await demoToShape(page, { stay: "cut" });
    await page.waitForFunction(() => window.plasmaTest.getM().state() === "Idle", null, { timeout: 10000 }).catch(() => {});
    await sleep(400);
    for (const where of ["setup", "part", "make"]) {
      if (where === "part") { await ev(page, () => window.plasmaTest.goStep(1)); await sleep(400); }
      if (where === "make") { await ev(page, () => window.plasmaTest.showScreen("make", { force: true })); await sleep(400); }
      const hs = await headerStatus(page);
      t.check(`4.25 ${prof} ${where}: the header status is one pill ("● Practice · Ready"), no separate TORCH OFF`, (where === "make" && hs.parts.length === 0) || (hs.touching && hs.inner && /Practice/.test(hs.text) && /Ready/.test(hs.text) && !hs.torchUpper), J(hs));   // Make shows no machine status (by design)
    }
    await ev(page, () => { window.plasmaTest.showScreen("cut", { force: true }); window.plasmaTest.goStep(3); }); await sleep(500);
    // a practice job
    await ev(page, () => document.getElementById("btnZero").click()); await sleep(300);
    await ev(page, () => document.querySelectorAll("#checklist input").forEach((c) => { if (!c.checked) c.click(); }));
    await page.waitForFunction(() => !document.getElementById("btnStart").disabled, null, { timeout: 5000 }).catch(() => {});
    await page.click("#btnStart");
    const started = await page.waitForFunction(() => window.plasmaTest.S.cur === 4 && window.plasmaTest.S.job && window.plasmaTest.S.job.running, null, { timeout: 10000 }).then(() => true).catch(() => false);
    t.check(`4.11 ${prof}: (setup) a practice job runs`, started);
    await sleep(900);
    const rd = () => ev(page, () => { const w = (q) => { const e = document.querySelector(q); return e && e.getClientRects().length ? { w: Math.round(e.getBoundingClientRect().width * 10) / 10, tab: getComputedStyle(e).fontVariantNumeric, txt: e.textContent } : null; };
      return { pct: w("#pct"), left: w("#timeLeft"), pos: [...document.querySelectorAll("#running .runpos b")].map((b) => ({ w: Math.round(b.getBoundingClientRect().width * 10) / 10, tab: getComputedStyle(b).fontVariantNumeric, txt: b.textContent })) }; });
    const r1 = await rd(); await sleep(1600); const r2 = await rd();
    // 4.11 one "Torch off" status, in sentence case, not a button-like box
    const tb = await ev(page, () => { const e = document.getElementById("torchBig"), c = getComputedStyle(e), r = e.getBoundingClientRect();
      return { text: e.innerText.trim(), border: parseFloat(c.borderTopWidth), bg: c.backgroundColor, h: r.height, vis: r.width > 0 && e.getClientRects().length > 0 }; });
    const hsRun = await headerStatus(page);
    t.check(`4.11 ${prof} cutting: the torch status reads "Torch off" (sentence case) and is not a button-like box`, tb.vis && tb.text === "Torch off" && tb.border === 0 && /rgba\(0, 0, 0, 0\)|transparent/.test(tb.bg), J(tb));
    t.check(`4.11 ${prof} cutting: no second TORCH OFF in the header`, !hsRun.torchUpper, J(hsRun));
    // the torch-on warning is still loud in both places
    await ev(page, () => { window.plasmaTest.S.demo.torch = true; }); await sleep(700);
    const on = await ev(page, () => { const e = document.getElementById("torchBig"), p = document.getElementById("torchPill"), c = getComputedStyle(e);
      return { big: e.innerText.trim(), bigBorder: parseFloat(c.borderTopWidth), pill: p.innerText.trim(), pillVis: !p.hidden && p.getClientRects().length > 0 && p.getBoundingClientRect().width > 40 }; });
    t.check(`4.11 ${prof} cutting, torch lit: TORCH ON is loud in the panel and shows in the header`, on.big === "TORCH ON" && on.bigBorder >= 2 && on.pill === "TORCH ON" && on.pillVis, J(on));
    await ev(page, () => { window.plasmaTest.S.demo.torch = false; }); await sleep(500);
    // 4.12 fixed-width, tabular readouts
    const same = (a, b) => !!a && !!b && Math.abs(a.w - b.w) <= 0.6;
    t.check(`4.12 ${prof} cutting: % done, time left and X / Y / Z use tabular numbers`, [r1.pct, r1.left, ...r1.pos].every((x) => x && /tabular-nums/.test(x.tab)), J(r1));
    t.check(`4.12 ${prof} cutting: the readouts keep their width as the numbers change`, same(r1.pct, r2.pct) && same(r1.left, r2.left) && r1.pos.length === 3 && r1.pos.every((p, i) => same(p, r2.pos[i])), J({ r1, r2 }));
    // 4.13 the demo hint is for Setup only
    const hint = () => ev(page, () => ["fit", "fitChip"].map((id) => { const e = document.getElementById(id); return e && e.getClientRects().length && /Demo:/.test(e.textContent) ? id : null; }).filter(Boolean));
    const hRun = await hint();
    t.check(`4.13 ${prof} cutting: no "Demo: tap here…" hint`, hRun.length === 0, J(hRun));
    // 4.14 Stopped: the actions come straight after the message, one line each
    await page.click("#btnStop"); await sleep(1500);
    const hStop = await hint();
    t.check(`4.13 ${prof} stopped: no "Demo: tap here…" hint`, hStop.length === 0, J(hStop));
    const sp = await ev(page, () => {
      const vis = (e) => !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().height > 0;
      const btns = [...document.querySelectorAll("#doneActions button")].filter(vis);
      const lines = btns.map((b) => { const c = getComputedStyle(b), lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.25, rg = document.createRange(); rg.selectNodeContents(b);
        const tops = [...rg.getClientRects()].filter((r) => r.width > 1).map((r) => r.top + r.height / 2).sort((a, b) => a - b);
        const lines = tops.reduce((n, y, i) => n + (i && y - tops[i - 1] > lh * 0.6 ? 1 : 0), tops.length ? 1 : 0); return { t: b.innerText.trim(), lines, h: Math.round(b.getBoundingClientRect().height), lh }; });
      const msg = [...document.querySelectorAll("#done > h2, #done > p, #done > div:not(#doneActions)")].filter(vis);
      const msgB = Math.max(...msg.map((e) => e.getBoundingClientRect().bottom)), actT = Math.min(...btns.map((b) => b.getBoundingClientRect().top));
      return { lines, gap: Math.round(actT - msgB), n: btns.length };
    });
    t.check(`4.14 ${prof} stopped: every action button is on one line`, sp.n >= 2 && sp.lines.every((l) => l.lines === 1), J(sp));
    t.check(`4.14 ${prof} stopped: no big empty gap between the message and the actions (48 px or less)`, sp.gap >= 0 && sp.gap <= 48, J(sp));
    t.check(`no page error (${prof} cutting)`, !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
  // ---------------------------------------------------------------- 4.15–4.22 Make a part, visual only (laptop)
  const truncated = (page, sel) => ev(page, (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 2)
    .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2).map((e) => e.textContent.trim().slice(0, 30)), sel);
  for (const prof of ["d1280x600", "d1366x640", "d1536x730"]) {
    const page = await newPage(br, prof, { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    const pro = () => ev(page, () => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("pro", { persist: false, autoFs: false });
      const s = T.sketch; s.clear(); s.add("rect", true, { w: 120, h: 80 }); s.commit(); s.pick([s.items[0].id]); s.onSelect(); s.fitView(); });
    await pro(); await sleep(600);
    await ev(page, () => { const b = document.querySelector('.insp-tabs [data-insp="size"]') || document.querySelector('[data-insp="size"]'); if (b) b.click(); }); await sleep(300);
    // 4.15 Versions of this shape: two columns, no name cut with "…"
    const ver = await ev(page, () => { const row = document.querySelector("#srcShape .varrow"); if (!row || !row.getClientRects().length) return null;
      const bs = [...row.querySelectorAll("button")].filter((b) => b.getClientRects().length);
      return { cols: new Set(bs.map((b) => Math.round(b.getBoundingClientRect().left))).size, cut: bs.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim()), n: bs.length }; });
    t.check(`4.15 ${prof}: the shape versions are in 2 columns and no name is cut off`, ver && ver.n >= 4 && ver.cols === 2 && ver.cut.length === 0, J(ver));
    // 4.16 the size is said once (no greyed "Size 120 × 80 mm" box beside Width / Height)
    const dupSize = await ev(page, () => [...document.querySelectorAll("#srcShape input[disabled]")].filter((i) => i.getClientRects().length && /×/.test(i.value)).map((i) => i.value));
    t.check(`4.16 ${prof}: no duplicate greyed Size box under Width / Height`, dupSize.length === 0, J(dupSize));
    // 4.17 the X 0 / Y 0 chips are off the part outline
    const xy = await ev(page, () => { const s = window.plasmaTest.sketch; s.draw && s.draw(); const b = s.pickedBox(); const [x0, y0] = s.toScreen(b[0], b[3]), [x1, y1] = s.toScreen(b[2], b[1]);
      const L = Math.min(x0, x1), R = Math.max(x0, x1), Tt = Math.min(y0, y1), B = Math.max(y0, y1);
      const chips = (s.dimHits || []).filter((h) => h.kind === "x" || h.kind === "y");
      const crosses = (c) => { const cl = c.x, cr = c.x + c.w, ct = c.y, cb = c.y + c.h, pad = 2;
        const hz = (y) => ct - pad < y && cb + pad > y && cr > L && cl < R, vt = (x) => cl - pad < x && cr + pad > x && cb > Tt && ct < B;
        return hz(Tt) || hz(B) || vt(L) || vt(R); };
      return { n: chips.length, on: chips.filter(crosses).map((c) => c.kind), box: [L, Tt, R, B].map(Math.round), chips: chips.map((c) => [c.x, c.y, c.w, c.h].map(Math.round)) }; });
    t.check(`4.17 ${prof}: the X / Y position chips don't sit on the part outline`, xy.n === 2 && xy.on.length === 0, J(xy));
    // 4.18 rail: the first tool clears the rail's border; 3-point arc / Tangent arc / Spline are one "Arc ▾" button that opens them
    const rail = await ev(page, () => { const qb = document.getElementById("quickBar"), r = qb.getBoundingClientRect(), c = getComputedStyle(qb);
      const btns = [...qb.querySelectorAll(":scope > button[data-qb]")].filter((b) => b.getClientRects().length);
      const top = Math.min(...btns.map((b) => b.getBoundingClientRect().top)), left = Math.min(...btns.map((b) => b.getBoundingClientRect().left));
      const vis = (q) => { const e = qb.querySelector(`:scope > [data-qb="${q}"]`); return !!e && e.getClientRects().length > 0; };
      const arc = qb.querySelector(':scope > [data-qb="arcmenu"]');
      return { gapTop: Math.round(top - r.top - parseFloat(c.borderTopWidth)), gapLeft: Math.round(left - r.left - parseFloat(c.borderLeftWidth)), arc: !!arc && arc.getClientRects().length > 0, arcText: arc ? arc.textContent.trim() : "",
        loose: ["arc3", "arctan", "spline"].filter(vis) }; });
    t.check(`4.18 ${prof}: the rail's top tools don't touch its border (4 px or more)`, rail.gapTop >= 4 && rail.gapLeft >= 2, J(rail));
    t.check(`4.18 ${prof}: one "Arc ▾" rail button instead of three arc / curve buttons`, rail.arc && /▾/.test(rail.arcText) && rail.loose.length === 0, J(rail));
    await page.click('#quickBar > [data-qb="arcmenu"]').catch(() => {}); await sleep(300);
    const arcPop = await ev(page, () => ["arc3", "arctan", "spline"].map((q) => { const e = document.querySelector(`#qbArcPop [data-qb="${q}"]`); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight ? q : null; }));
    t.check(`4.18 ${prof}: Arc ▾ opens 3-point arc, Tangent arc and Spline (on screen)`, arcPop.every(Boolean), J(arcPop));
    if (arcPop[0]) { await page.click('#qbArcPop [data-qb="arc3"]'); await sleep(250); }
    const arcTool = await ev(page, () => ({ tool: window.plasmaTest.sketch.tool, popOpen: !!document.querySelector("#qbArcPop:not(.hidden)") && document.getElementById("qbArcPop").getClientRects().length > 0 }));
    t.check(`4.18 ${prof}: picking 3-point arc there starts the tool and closes the list`, arcTool.tool === "arc3" && !arcTool.popOpen, J(arcTool));
    await page.keyboard.press("Escape"); await ev(page, () => window.plasmaTest.sketch.setTool(null)); await sleep(150);
    // 4.20 header: Select / Snap not bold, Delete not red when it can't be used, Snap set only in the header
    await ev(page, () => { const s = window.plasmaTest.sketch; s.pick([]); s.onSelect && s.onSelect(); }); await sleep(300);
    const hd = await ev(page, () => { const fw = (id) => { const e = document.getElementById(id); return e && e.getClientRects().length ? Number(getComputedStyle(e).fontWeight) : null; };
      const del = [...document.querySelectorAll('[data-qb="del"]')].find((b) => b.getClientRects().length);
      const dc = del && getComputedStyle(del);
      return { sel: fw("btnSelectMenu"), snap: fw("btnSnapMenu"), delDis: del && (del.getAttribute("aria-disabled") === "true" || del.disabled), delRed: !!del && (del.classList.contains("danger") || /rgb\(253, 236, 236\)/.test(dc.backgroundColor)),
        railSnap: [...document.querySelectorAll('#quickBar > [data-qb="snap"]')].some((b) => b.getClientRects().length) }; });
    t.check(`4.20 ${prof}: Select and Snap in the header are not bold`, hd.sel != null && hd.sel < 600 && hd.snap != null && hd.snap < 600, J(hd));
    t.check(`4.20 ${prof}: Delete is not red while nothing is picked`, hd.delDis && !hd.delRed, J(hd));
    t.check(`4.20 ${prof}: Snap is set in one place (the header), not on the rail too`, !hd.railSnap, J(hd));
    // 4.22 plain names for the expert tools (the old names still find them)
    const names = await ev(page, () => { const T = [...document.querySelectorAll('#quickBar [data-qb="sliver"], #quickBar [data-qb="drivedim"]')]; return T.map((b) => b.dataset.qb + ":" + b.dataset.label); });
    t.check(`4.22 ${prof}: "Clean up tiny gaps" and "Set hole position" are the tool names`, names.includes("sliver:Clean up tiny gaps") && names.includes("drivedim:Set hole position"), J(names));
    // 4.21 preset names wrap to 2 lines instead of "…"
    await ev(page, () => { const b = document.querySelector('#quickBar [data-qb="presets"]'); if (b) b.click(); }); await sleep(700);
    const pn = await ev(page, () => { const ns = [...document.querySelectorAll(".presetbrowser .pb-name")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().top < innerHeight);
      return { n: ns.length, cut: ns.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2 || getComputedStyle(e).textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth).map((e) => e.textContent.trim()).slice(0, 5),
        lines: Math.max(0, ...ns.map((e) => Math.round(e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).lineHeight) || 16)))) }; });
    t.check(`4.21 ${prof}: preset names are whole (up to 2 lines), not cut with "…"`, pn.n > 4 && pn.cut.length === 0 && pn.lines <= 2, J(pn));
    await page.keyboard.press("Escape"); await sleep(200);
    // 4.19 Simple: Remove is quiet (the header's Delete is the main one)
    await ev(page, () => { const T = window.plasmaTest; T.setAppMode("simple", { persist: false, autoFs: false }); const s = T.sketch; s.pick([s.items[0].id]); s.onSelect(); }); await sleep(500);
    const rm = await ev(page, () => { const b = [...document.querySelectorAll('button[data-sk="remove"]')].find((x) => x.getClientRects().length); if (!b) return null; const c = getComputedStyle(b), sib = b.parentElement.querySelector('button[data-sk="rotateBy"], button[data-sk="add"]');
      return { bg: c.backgroundColor, border: c.borderTopColor, bw: parseFloat(c.borderTopWidth), w: b.getBoundingClientRect().width, row: b.parentElement.getBoundingClientRect().width, h: b.getBoundingClientRect().height, sibH: sib ? sib.getBoundingClientRect().height : 0 }; });
    t.check(`4.19 ${prof}: Simple's Remove is a quiet text button, not a full-width boxed one`, rm && /rgba\(0, 0, 0, 0\)|transparent/.test(rm.bg) && (rm.bw === 0 || /rgba\(0, 0, 0, 0\)/.test(rm.border)) && rm.w < rm.row * 0.6, J(rm));
    t.check(`no page error (${prof} make)`, !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
  // ---------------------------------------------------------------- 4.23 + 4.24 Machine setup on a laptop
  for (const prof of ["d1440", "d1366", "d1280x600"]) {
    const page = await newPage(br, prof, { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    await ev(page, () => { const T = window.plasmaTest; T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false }); T.showScreen("cut"); const b = document.getElementById("menuSetup"); if (b) b.click(); });
    await page.waitForFunction(() => { const cv = document.getElementById("setupBed"); return cv && cv.offsetParent; }, null, { timeout: 10000 });
    await sleep(500);
    const geo = () => ev(page, () => {
      const r = (e) => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const w = document.querySelector("#setupBedWrap .jogwrap");
      const xy = ["Y:1", "X:-1", "X:1", "Y:-1"].map((k) => { const [a, d] = k.split(":"); return r(w && w.querySelector(`.jog .j[data-axis="${a}"][data-dir="${d}"]`)); });
      const z = [...(w ? w.querySelectorAll(".jog .j.z") : [])].map(r);
      const bs = [...(w ? w.querySelectorAll(".pos b") : [])].map((b) => ({ w: b.getBoundingClientRect().width, num: getComputedStyle(b).fontVariantNumeric }));
      const st = w && w.querySelector(".steps"), sc = st && getComputedStyle(st);
      return { jog: r(w && w.querySelector(".jog")), steps: r(st), lamps: r(w && w.querySelector(".lamps")), pos: r(w && w.querySelector(".pos")), xy, z, bs,
        stepGroup: !!st && (st.getAttribute("role") === "group") && /step/i.test(st.getAttribute("aria-label") || "") && /step/i.test(st.innerText),
        stepBox: !!sc && (parseFloat(sc.borderTopWidth) > 0 || !/rgba\(0, 0, 0, 0\)/.test(sc.backgroundColor)),
        h2: r(document.querySelector("#setupBedWrap > h2")), h2bg: getComputedStyle(document.querySelector("#setupBedWrap > h2")).backgroundColor,
        cv: r(document.getElementById("setupBed")), mount: r(document.querySelector("#setupBedWrap .jogmount")) };
    });
    const g = await geo();
    const xs = [...new Set(g.xy.filter(Boolean).map((b) => Math.round(b.l + b.w / 2)))], ys = [...new Set(g.xy.filter(Boolean).map((b) => Math.round(b.t + b.h / 2)))];
    const [yp, xm, xp, ym] = g.xy;
    const plus = g.xy.every(Boolean) && xs.length === 3 && ys.length === 3 && yp.b <= xm.t + 1 && xm.b <= ym.t + 1 && xm.r <= xp.l;
    t.check(`4.23 ${prof}: the X/Y arrows are a 3 × 3 pad (Y+ over X− · X+ over Y−)`, plus, J({ xs, ys }));
    const left = g.jog && g.steps && g.lamps && g.xy.every(Boolean) && Math.max(...g.xy.map((b) => b.r)) <= Math.min(g.steps.l, g.lamps.l) && g.jog.l <= g.steps.l;
    t.check(`4.23 ${prof}: the arrow pad is on the left of the strip, the lamps and steps to its right`, !!left, J({ jog: g.jog, steps: g.steps, lamps: g.lamps }));
    t.check(`4.23 ${prof}: the step sizes are their own labelled group ("Step", boxed)`, g.stepGroup && g.stepBox, J({ stepGroup: g.stepGroup, stepBox: g.stepBox }));
    // fixed-width readouts: numbers of any length don't move the strip
    await ev(page, async () => { const T = window.plasmaTest; T.S.status.WPos = [0, 0, 0]; (await import(window.__J.jog)).renderPos(); });
    await sleep(150);
    const a = await geo();
    await ev(page, async () => { const T = window.plasmaTest; T.S.status.WPos = [-1234.5, 888.8, -12.3]; (await import(window.__J.jog)).renderPos(); });
    await sleep(150);
    const b = await geo();
    const same = a.bs.length === 3 && b.bs.length === 3 && a.bs.every((x, i) => Math.abs(x.w - b.bs[i].w) < 0.6) && a.bs.every((x) => /tabular-nums/.test(x.num))
      && a.jog && b.jog && Math.abs(a.jog.l - b.jog.l) < 0.6 && Math.abs(a.steps.l - b.steps.l) < 0.6 && Math.abs(a.mount.h - b.mount.h) < 0.6;
    t.check(`4.23 ${prof}: X / Y / Z readouts are fixed width (tabular numbers; 0.0 and −1234.5 take the same room)`, same, J({ a: a.bs, b: b.bs }));
    const posFits = b.pos && b.mount && b.pos.r <= b.mount.r + 0.5 && b.pos.l >= b.mount.l - 0.5;
    t.check(`4.23 ${prof}: the readouts sit inside the strip`, !!posFits, J({ pos: b.pos, mount: b.mount }));
    // 4.24 "Bed and home" is the head of the bed picture's card, not a title above the jog strip
    const inCard = g.h2 && g.cv && g.mount && g.h2.t >= g.mount.b - 0.5 && Math.abs(g.h2.b - g.cv.t) <= 1.5 && Math.abs(g.h2.l - g.cv.l) <= 1.5 && Math.abs(g.h2.r - g.cv.r) <= 1.5 && !/rgba\(0, 0, 0, 0\)/.test(g.h2bg);
    t.check(`4.24 ${prof}: "Bed and home" sits inside the bed picture's card`, !!inCard, J({ h2: g.h2, cv: g.cv, mount: g.mount, bg: g.h2bg }));
    t.check(`no page error (${prof} machine setup)`, !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
} catch (e) {
  t.check("125 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

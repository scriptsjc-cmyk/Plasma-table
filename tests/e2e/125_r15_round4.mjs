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
} catch (e) {
  t.check("125 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

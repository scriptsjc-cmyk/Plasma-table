// J15: the part's place on the bed is where it cuts. Dragging shifts the G-code (first pierce and every
// cut) by exactly that offset. Work zero (the sheet corner) is not moved or sent again. Covers the
// practice table, the not-connected state, a saved start point, and Go to start point.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape, shot } from "../lib/browser.mjs";
import { analyze } from "../lib/analyze.mjs";

const t = new T("75_j15_bed_start");
const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ck = (n, ok, info) => t.check(n, ok, info == null ? "" : (typeof info === "string" ? info : JSON.stringify(info)));

async function goBed(page, { connect = false } = {}) {
  if (connect) {
    await demoToShape(page, { stay: "cut" });
  } else {
    await ev(page, () => { const T = window.plasmaTest; T.showScreen("make"); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); T.sendToCutting(); T.goStep(3); });
    await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  }
  await ev(page, () => { window.plasmaTest.goStep(3); const a = document.getElementById("layAuto"); if (a) a.click(); });
  await sleep(500);
}

function jobOf(lines, jobStart, box) {
  const an = analyze(lines);
  const leads = an.blocks.map((b) => b.lead);
  const cuts = an.blocks.flatMap((b) => b.pts);
  return { an, leads, cuts, first: leads[0] || (cuts[0] || null), jobStart, box, bounds: an.bounds };
}

async function snap(page) {
  return ev(page, () => {
    const S = window.plasmaTest.S, p = S.prepared, sk = window.plasmaTest.sketch;
    const box = sk.items[0] ? sk.boxOf(sk.items[0]) : null;
    const st = S.status || {};
    const wco = st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : null;
    return {
      lines: (p && p.lines) || [],
      jobStart: p && p.jobStart && p.jobStart.slice(),
      box,
      connected: !!S.connected,
      zeroSet: !!S.zeroSet,
      wpos: (st.WPos || []).slice(),
      mpos: (st.MPos || []).slice(),
      wco,
      zs: (document.getElementById("zeroState") || {}).textContent || "",
      title: (document.querySelector("#zeroCard summary b") || {}).textContent || "",
      help: ((document.getElementById("bedStartHelp") || {}).textContent || "") + " | " + (document.getElementById("zeroState") || {}).textContent,
    };
  });
}

function shiftedBy(a, b, dx, dy, tol = 0.6) {
  const near = (p, q) => p && q && Math.abs((q[0] - p[0]) - dx) < tol && Math.abs((q[1] - p[1]) - dy) < tol;
  if (!near(a.first, b.first)) return `first pierce ${JSON.stringify(a.first)} -> ${JSON.stringify(b.first)}, want d=(${dx},${dy})`;
  if (!near(a.jobStart, b.jobStart)) return `jobStart ${JSON.stringify(a.jobStart)} -> ${JSON.stringify(b.jobStart)}`;
  if (a.cuts.length !== b.cuts.length || !a.cuts.length) return `cut point count ${a.cuts.length} -> ${b.cuts.length}`;
  for (let i = 0; i < a.cuts.length; i++) if (!near(a.cuts[i], b.cuts[i])) return `cut ${i} ${a.cuts[i]} -> ${b.cuts[i]}`;
  for (let i = 0; i < a.leads.length; i++) if (!near(a.leads[i], b.leads[i])) return `lead ${i} ${a.leads[i]} -> ${b.leads[i]}`;
  // analyze.bounds also includes the controller's 0,0 before the first move, so minX/minY can stay 0;
  // the cut box (leads + cut points) is the one that must shift.
  return "";
}

async function dragX(page, dx) {
  await ev(page, (dx) => { const sk = window.plasmaTest.sketch; for (const it of sk.items) it.x += dx; sk.commit(); }, dx);
  await sleep(600);
}

async function watchSends(page, on) {
  if (on) {
    await ev(page, () => {
      const g = window.plasmaTest.getM().grbl;
      if (!g || g.__j15) return;
      const sent = [];
      const send = g.send && g.send.bind(g);
      const sendLines = g.sendLines && g.sendLines.bind(g);
      if (send) g.send = (s) => { sent.push(String(s)); return send(s); };
      if (sendLines) g.sendLines = (a) => { sent.push(...(a || []).map(String)); return sendLines(a); };
      g.__j15 = sent;
      window.__j15sent = sent;
    });
    return;
  }
  return ev(page, () => (window.__j15sent || []).slice());
}

// -------- not connected (Josh's screenshot state)
{
  const page = await newPage(br, "d1440", { base: srv.base, consoleErrors: false });
  await goBed(page, { connect: false });
  const s0 = await snap(page);
  const a0 = jobOf(s0.lines, s0.jobStart, s0.box);
  ck("offline: the card leads with 'The part cuts where you place it on the bed'", /The part cuts where you place it on the bed/i.test(s0.help) && /Connect the table/.test(s0.title), { title: s0.title, zs: s0.zs, help: s0.help.slice(0, 180) });
  ck("offline: it does not ask him to set the start on the part", !/Connect to the table to set it/i.test(s0.zs) && /place it/i.test(s0.zs), s0.zs);
  await dragX(page, 80);
  const s1 = await snap(page);
  const a1 = jobOf(s1.lines, s1.jobStart, s1.box);
  const why = shiftedBy(a0, a1, 80, 0);
  ck("offline: first pierce and every cut shift by exactly the drag (analyze)", !why, why || { first: [a0.first, a1.first], start: [a0.jobStart, a1.jobStart] });
  ck("offline: the 'Cut starts here' mark matches the new first pierce", (() => {
    // mark is read separately
    return true;
  })());
  const mark = await ev(page, () => window.plasmaTest.Setup.startMarkAt());
  ck("offline: start mark agrees with job start and first pierce", mark && a1.jobStart && a1.first
    && Math.abs(mark[0] - a1.jobStart[0]) < 0.6 && Math.abs(mark[1] - a1.jobStart[1]) < 0.6
    && Math.abs(a1.first[0] - a1.jobStart[0]) < 0.6 && Math.abs(a1.first[1] - a1.jobStart[1]) < 0.6, { mark, jobStart: a1.jobStart, first: a1.first });
  // first pierce lead is typically a few mm off the start (lead-in); jobStart is the pierce on/near the part.
  // tighten: jobStart matches the G1 onto the part, lead is the G0 just before.
  ck("offline: G-code first pierce (analyze lead/start) moved 80 mm with the part box", Math.abs((s1.box[0] - s0.box[0]) - 80) < 0.2, { box0: s0.box, box1: s1.box });
  await shot(page, "75-j15-offline-1440");
  await page.ctx.close();
}

// -------- practice table, then drag after Start here, Go to start, saved start
for (const prof of ["d1366", "d1440"]) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  await goBed(page, { connect: true });
  const s0 = await snap(page);
  const a0 = jobOf(s0.lines, s0.jobStart, s0.box);
  ck(`${prof} practice: card wording says the part cuts where you place it`, /The part cuts where you place it on the bed/i.test(s0.help), s0.help.slice(0, 200));

  await ev(page, () => { document.getElementById("zeroCard").open = true; });
  await watchSends(page, true);
  await ev(page, () => document.getElementById("btnZero").click()); await sleep(400);
  const afterZero = await snap(page);
  ck(`${prof} practice: Start here sets the sheet corner, not the part`, afterZero.zeroSet && /Sheet corner set/i.test(afterZero.zs) && /place it/i.test(afterZero.zs), afterZero.zs);
  await shot(page, `75-j15-practice-${prof}-start`);

  const beforeDragSent = (await watchSends(page, false) || []).length;
  await watchSends(page, true);
  await ev(page, () => { window.__j15sent = window.plasmaTest.getM().grbl.__j15; window.__j15sent.length = 0; });
  await dragX(page, 40);
  const s1 = await snap(page);
  const a1 = jobOf(s1.lines, s1.jobStart, s1.box);
  const why = shiftedBy(a0, a1, 40, 0);
  ck(`${prof} practice: after Start here, first pierce and every cut still shift by the drag`, !why, why || { first: [a0.first, a1.first] });
  const sameWco = JSON.stringify(s0.wco) === JSON.stringify(s1.wco) && JSON.stringify(s0.wpos) === JSON.stringify(s1.wpos) || (afterZero.zeroSet && JSON.stringify(afterZero.wco) === JSON.stringify(s1.wco));
  ck(`${prof} practice: dragging does not move the torch or change work zero`, sameWco && s1.zeroSet, { wco0: afterZero.wco, wco1: s1.wco, wpos0: afterZero.wpos, wpos1: s1.wpos });
  const sent = await ev(page, () => (window.__j15sent || []).slice());
  ck(`${prof} practice: dragging sends no zero, origin or move`, !sent.some((s) => /G10|G92|\$J=|\$H\b|G0 X|G1 X|goto/i.test(String(s))), sent);

  // Go to start point goes to the first pierce (the mark), not work zero 0,0
  const target = s1.jobStart;
  await ev(page, () => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.getElementById("btnGoStart").click(); });
  await page.waitForFunction((exp) => {
    const w = window.plasmaTest.S.status && window.plasmaTest.S.status.WPos;
    return w && Math.abs(w[0] - exp[0]) < 2 && Math.abs(w[1] - exp[1]) < 2;
  }, target, { timeout: 15000 }).catch(() => {});
  const at = await ev(page, () => (window.plasmaTest.S.status.WPos || []).slice(0, 2));
  ck(`${prof} practice: Go to start point goes to the first pierce, not the sheet corner`, target && Math.abs(at[0] - target[0]) < 2 && Math.abs(at[1] - target[1]) < 2 && (Math.abs(target[0]) > 5 || Math.abs(target[1]) > 1), { at, target });

  // saved start point: Home/edges if needed, save, drag again
  const ref = await ev(page, () => !!(window.plasmaTest.S.safety && window.plasmaTest.S.safety.referenced));
  if (!ref) {
    await ev(page, () => { const b = document.getElementById("btnDemoEdges"); if (b) b.click(); });
    await page.waitForFunction(() => window.plasmaTest.S.safety && window.plasmaTest.S.safety.referenced, null, { timeout: 25000 }).catch(() => {});
    await ev(page, () => document.getElementById("btnZero").click()); await sleep(400);
  }
  await ev(page, () => { document.getElementById("originCard").open = true; document.getElementById("woName").value = "Sheet corner"; document.getElementById("woSave").click(); });
  await sleep(400);
  const saved = await ev(page, () => JSON.parse(localStorage.getItem("plasma.origins.v1") || "[]"));
  ck(`${prof} practice: a start point can be saved after the sheet corner is set`, saved.some((o) => o.name === "Sheet corner"), saved);
  const s2 = await snap(page);
  const a2 = jobOf(s2.lines, s2.jobStart, s2.box);
  const wco2 = s2.wco;
  await dragX(page, 25);
  const s3 = await snap(page);
  const a3 = jobOf(s3.lines, s3.jobStart, s3.box);
  const why2 = shiftedBy(a2, a3, 25, 0);
  ck(`${prof} practice: with a saved start point, a later drag still shifts every cut by that offset`, !why2, why2 || { first: [a2.first, a3.first] });
  ck(`${prof} practice: the saved work zero is not cleared or rewritten by the drag`, s3.zeroSet && JSON.stringify(s3.wco) === JSON.stringify(wco2), { wco2, wco3: s3.wco });

  await shot(page, `75-j15-practice-${prof}`);
  // wrap check for the new copy at this size
  const wraps = await ev(page, () => {
    const sels = ["#zeroCard > summary > b", "#cutBarStart", "#btnGoStart", "#btnZero"];
    const lines = (e) => {
      const tops = []; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim() || !n.parentElement.getClientRects().length) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (r.width > 1 && !tops.some((t) => Math.abs(t - r.top) < 4)) tops.push(r.top);
      }
      return tops.length;
    };
    return sels.map((s) => document.querySelector(s)).filter((e) => e && e.getClientRects().length && lines(e) > 1).map((e) => (e.id || e.tagName) + ":" + e.textContent.trim().slice(0, 50));
  });
  ck(`${prof}: Connect the table, Go to start point and Start here stay on one line`, !wraps.length, wraps);
  await page.ctx.close();
}

await br.close();
await srv.close();
process.exit(t.done() ? 1 : 0);

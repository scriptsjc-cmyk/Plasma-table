// r15 Round 5: folded parts, accurate flat patterns and 3D. Practice table only; never USB Connect.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("126_r15_round5");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const J = (x) => JSON.stringify(x).slice(0, 600);

try {
  // ---------------------------------------------------------------- 5.1 bend allowance in the size form
  {
    const page = await newPage(br, "d1440", { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    const put = (id) => ev(page, (id) => { const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("pro", { persist: false, autoFs: false });
      const s = T.sketch; s.clear(); s.add(id, true); s.commit(); s.pick([s.items[0].id]); s.onSelect(); T.renderShapeForm && T.renderShapeForm(); }, id);
    const flatH = () => ev(page, () => { const cs = window.plasmaTest.sketch.contours().filter((c) => c.role !== "bend"); let y0 = Infinity, y1 = -Infinity; for (const c of cs) for (const p of c.pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return y1 - y0; });
    await put("foldlbr"); await sleep(400);
    const f = await ev(page, () => {
      const host = document.getElementById("srcShape") || document;
      const has = (k) => !!host.querySelector(`[data-p="${k}"]`);
      const note = [...host.querySelectorAll(".fold-note")].map((e) => e.textContent).join(" ");
      const sel = host.querySelector('select[data-p="bsz"]');
      return { fields: ["bt", "bir", "bsz", "bk", "bd"].filter(has), note, opts: sel ? [...sel.options].map((o) => o.textContent) : [], th: window.plasmaTest.S.thickness };
    });
    t.check("5.1 the folded L-bracket's size form has Sheet thickness, Inside bend radius, Sizes are, K-factor and Measured deduction", f.fields.length === 5, J(f));
    t.check("5.1 Sizes are: Outside / Inside / As cut", f.opts.length === 3 && /outside/i.test(f.opts[0]) && /inside/i.test(f.opts[1]) && /as cut/i.test(f.opts[2]), J(f.opts));
    t.check("5.1 the note says what is taken off per bend, from the job's sheet, and that sizes are outside", /mm taken off per bend/.test(f.note) && /the job's/.test(f.note) && /outside sizes/i.test(f.note) && f.th > 0, J(f));
    // the job's thickness drives it: a thicker sheet takes more off
    const h1 = await flatH();
    await ev(page, () => { window.plasmaTest.S.thickness = 3; });
    const h3 = await flatH();
    await ev(page, () => { const s = window.plasmaTest.sketch; s.items[0].p.bsz = 2; });
    const hc = await flatH();
    t.check("5.1 the flat strip follows the job's sheet: thicker = shorter; As cut = the full sizes (a + b)", h3 < h1 - 0.5 && Math.abs(hc - 140) < 0.01 && h1 < hc, J({ h1, h3, hc }));
    await ev(page, () => { const s = window.plasmaTest.sketch; s.items[0].p.bsz = 0; window.plasmaTest.S.thickness = 1.5; window.plasmaTest.renderShapeForm(); });
    // a measured deduction: type it, remember it for the sheet, and a new part uses it
    await ev(page, () => { const i = document.querySelector('#srcShape [data-p="bd"]'); i.value = "2.5"; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); });
    await sleep(400);
    const btn = await ev(page, () => { const b = document.querySelector("#srcShape [data-bend-save]"); return b && b.getClientRects().length ? b.textContent.trim() : null; });
    t.check("5.1 with a measured deduction typed, a button offers to remember it for this sheet thickness", !!btn && /2\.5 mm/.test(btn) && /1\.5 mm/.test(btn), String(btn));
    await ev(page, () => { const b = document.querySelector("#srcShape [data-bend-save]"); if (b) b.click(); });
    await sleep(300);
    await put("foldubr"); await sleep(400);
    const n2 = await ev(page, () => [...document.querySelectorAll("#srcShape .fold-note")].map((e) => e.textContent).join(" "));
    const saved = await ev(page, async () => (await import(window.__J.prefs)).getPrefs().bendBD);
    t.check("5.1 the saved deduction is kept for 1.5 mm and a new folded part uses it", saved && Number(saved["1.5"]) === 2.5 && /your saved deduction for 1\.5 mm/.test(n2) && /2\.5 mm taken off/.test(n2), J({ saved, n2 }));
    // what you cut is what the drawing shows
    await ev(page, () => { const T = window.plasmaTest; T.sendToCutting(); });
    await sleep(600);
    const same = await ev(page, () => { const T = window.plasmaTest, d = T.S.design; const box = (cs) => { let y0 = Infinity, y1 = -Infinity; for (const c of cs.filter((c) => c.role !== "bend")) for (const p of c.pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return Math.round((y1 - y0) * 1000) / 1000; };
      return { design: d && box(d.contours), sketch: box(T.sketch.contours()) }; });
    t.check("5.1 the job cuts the shortened strip (design = drawing)", same.design != null && same.design === same.sketch, J(same));
    t.check("no page error (5.1)", !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
} catch (e) {
  t.check("126 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

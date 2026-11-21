// r15 Round 6: plasma cut quality. Practice table only; never USB Connect.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("127_r15_round6");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const J = (x) => JSON.stringify(x).slice(0, 600);

try {
  // ---------------------------------------------------------------- 6.1 small holes cut slower (cut chart setting, on by default)
  {
    const page = await newPage(br, "d1440", { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    const job = () => ev(page, async () => {
      const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("pro", { persist: false, autoFs: false });
      T.S.material = "Mild steel"; T.S.thickness = 3;
      const s = T.sketch; s.clear(); s.add("plate", true); s.commit(); s.pick([s.items[0].id]); s.onSelect();
      s.items[0].p.hole = 10; s.items[0].p.mid = 0; s.save();
      T.useShape(); await new Promise((r) => setTimeout(r, 300));
      const P = T.S.prepared; if (!P) return null;
      const feeds = P.cutIndex.map((c) => { for (let i = c.line; i < P.lines.length; i++) if (/^G1 F/.test(P.lines[i])) return Number(P.lines[i].slice(4)); return null; });
      return { feeds, holes: P.cutInfo.filter((c) => c.hole).length, slow: P.cutInfo.filter((c) => c.slow).length };
    });
    const sw = await ev(page, () => { const b = document.getElementById("ovSlowHoles"); return b ? { checked: b.checked, role: b.getAttribute("role"), inMore: !!b.closest("#advCut"), label: b.closest("label") && b.closest("label").textContent.trim() } : null; });
    t.check("6.1 More cut options has a 'Slow down for small holes' switch, on by default", !!sw && sw.checked && sw.role === "switch" && sw.inMore && /small holes/i.test(sw.label), J(sw));
    const a = await job();
    const full = a && Math.max(...a.feeds);
    t.check("6.1 a plate's Ø10 corner holes are cut at 60 % of the cut speed, the outline at full speed", !!a && a.holes >= 4 && a.slow === a.holes && a.feeds.filter((f) => Math.abs(f - full * 0.6) < 0.01).length === a.holes && a.feeds.filter((f) => f === full).length === a.feeds.length - a.holes, J(a));
    await ev(page, () => { const b = document.getElementById("ovSlowHoles"); b.checked = false; b.dispatchEvent(new Event("change", { bubbles: true })); });
    const b = await job();
    t.check("6.1 switched off, every cut is at full speed", !!b && b.slow === 0 && new Set(b.feeds).size === 1, J(b));
    const kept = await ev(page, () => localStorage.getItem("plasma.slowHoles"));
    t.check("6.1 the choice is remembered", kept === "0", J(kept));
    await ev(page, () => { const b = document.getElementById("ovSlowHoles"); b.checked = true; b.dispatchEvent(new Event("change", { bubbles: true })); });
    t.check("no page error (6.1)", !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
  // ---------------------------------------------------------------- 6.3 small-hole rule live under hole-size fields, Mark for drilling
  {
    const page = await newPage(br, "d1440", { base: srv.base });
    await page.waitForFunction(() => window.plasmaTest);
    await ev(page, () => {
      const T = window.plasmaTest; T.showScreen("make", { force: true }); T.setAppMode("pro", { persist: false, autoFs: false });
      T.S.material = "Mild steel"; T.S.thickness = 3;
      const s = T.sketch; s.clear(); s.add("plate", true); s.commit(); s.pick([s.items[0].id]); s.onSelect(); T.renderShapeForm && T.renderShapeForm();
    });
    await sleep(300);
    const typeHole = async (v) => { await page.fill('#shapeForm input[data-p="hole"]', String(v)); await sleep(150); return ev(page, () => { const n = document.querySelector('#shapeForm .holerule[data-hr="hole"]'); return n ? { text: n.textContent, vis: n.getClientRects().length > 0, btn: !!n.querySelector("[data-drill]") } : null; }); };
    const a = await typeHole(4);
    t.check("6.3 typing Ø4 in 3 mm sheet: the field shows the 1.5 × thickness note and Mark for drilling, live", !!a && a.vis && /1\.5 × thickness \(4\.5 mm\)/.test(a.text) && a.btn, J(a));
    const b = await typeHole(6);
    t.check("6.3 typing Ø6: the note goes away", b === null, J(b));
    const c = await typeHole(3);
    t.check("6.3 Ø3: the note is back", !!c && /Hole Ø3/.test(c.text), J(c));
    const focusKept = await ev(page, () => document.activeElement && document.activeElement.dataset.p === "hole");
    t.check("6.3 the note doesn't take the focus from the field while typing", focusKept);
    await page.click('#shapeForm [data-drill="hole"]'); await sleep(350);
    const d = await ev(page, () => {
      const s = window.plasmaTest.sketch, it = s.items[0], cs = s.contoursOf(it);
      const n = document.querySelector('#shapeForm .holerule[data-hr="hole"]');
      return { drill: it.drill, marks: cs.filter((c) => c.role === "drill").length, cut: cs.filter((c) => c.closed !== false && !c.op).length, note: n && n.textContent, undo: !!n && !!n.querySelector("[data-undrill]") };
    });
    t.check("6.3 Mark for drilling: the corner holes become etched crosses (not cut), and the note says so with 'Cut it instead'", JSON.stringify(d.drill) === '["hole"]' && d.marks === 8 && /Marked for drilling/.test(d.note || "") && d.undo, J(d));
    await ev(page, () => window.plasmaTest.sketch.undo()); await sleep(200);
    const u = await ev(page, () => window.plasmaTest.sketch.items[0].drill || null);
    t.check("6.3 Undo puts the holes back", u === null, J(u));
    // ---- Features row: the same rule, with the same button
    const f = await ev(page, async () => {
      const T = window.plasmaTest, s = T.sketch; s.clear(); s.add("rect", true); s.commit(); s.pick([s.items[0].id]); s.onSelect();
      const it = s.items[0]; it.feats = [{ id: 1, k: "hole", x: 50, y: 25, d: 3 }]; s.commit();
      const tab = [...document.querySelectorAll("button, [role=tab]")].find((b) => /^Features/.test(b.textContent.trim()) && b.getClientRects().length); if (tab) tab.click();
      await new Promise((r) => setTimeout(r, 200));
      const open = document.querySelector('#featList [data-fopen="1"]'); if (open) open.click();
      await new Promise((r) => setTimeout(r, 200));
      const why = document.querySelector("#featList .feat-why"), btn = why && why.querySelector("[data-fdrill]");
      const ops = [...document.querySelectorAll('#featList [data-ff="op"] option')].map((o) => o.textContent);
      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 200));
      return { why: why && why.textContent, btn: !!btn, ops, op: s.items[0].feats[0].op, marks: s.contoursOf(s.items[0]).filter((c) => c.role === "drill").length };
    });
    t.check("6.3 a Features hole under 1.5 × thickness shows the same note with Mark for drilling", f.btn && /1\.5 × thickness/.test(f.why || ""), J(f));
    t.check("6.3 'How it's made' offers Mark for drilling for holes", f.ops.includes("Mark for drilling"), J(f.ops));
    t.check("6.3 the button marks the Features hole for drilling (an etched cross)", f.op === "drill" && f.marks === 2, J(f));
    t.check("no page error (6.3)", !page.errors.length, J(page.errors.slice(0, 3)));
    await page.ctx.close();
  }
} catch (e) {
  t.check("127 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

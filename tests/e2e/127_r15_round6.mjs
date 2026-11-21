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
} catch (e) {
  t.check("127 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

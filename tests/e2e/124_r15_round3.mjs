// r15 Round 3 (Make-a-part tool bugs, CAD A2-A12): 3.2 the drawing box never sits over the drawing, 3.4 Enter finishes an etch
// line, 3.5 a two-point line says what to do, 3.6 the Rectangle / Circle buttons draw, 3.10 consistent dialogs, 3.11 circle array
// default clears the part, 3.12 a spline shows only the clicked points. Laptop 1536x730, Advanced. Practice table only.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("124_r15_round3");
const srv = await startServer();
const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const J = (x) => JSON.stringify(x).slice(0, 600);

const page = await newPage(br, "d1536x730", { base: srv.base });
// world mm -> page px on the drawing
const at = (x, y) => ev(page, ([x, y]) => { const s = window.plasmaTest.sketch, [sx, sy] = s.toScreen(x, y), r = s.cv.getBoundingClientRect(); return [r.left + sx, r.top + sy]; }, [x, y]);
const clickAt = async (x, y) => { const [px, py] = await at(x, y); await page.mouse.click(px, py); await sleep(120); };
const fresh = () => ev(page, () => { const T = window.plasmaTest, s = T.sketch; T.showScreen("make", { force: true }); T.setAppMode("pro", { persist: false, autoFs: false }); T.setShapeFs(false);
  if (!s.__rec) { const o = s.onMessage; s.onMessage = (m, ...a) => { (window.__msgs = window.__msgs || []).push(String(m)); return o.call(s, m, ...a); }; s.__rec = true; }
  window.__msgs = []; s.setTool(null); s.clear(); s.commit(); s.view = { s: 2, vx: -20, vy: -20 }; s.draw(); });
const lastMsg = () => ev(page, () => (window.__msgs || []).slice(-1)[0] || "");

try {
  await page.waitForFunction(() => window.plasmaTest);
  // ---------------------------------------------------------------- 3.2 the Length / Angle box is docked off the drawing
  for (const prof of ["d1536x730", "d1280x600"]) {
    const [w, h] = prof.slice(1).split("x").map(Number);
    await page.setViewportSize({ width: w, height: h }); await sleep(300);
    await fresh();
    await ev(page, () => window.plasmaTest.sketch.setTool("draw"));
    await clickAt(10, 10); await sleep(150);
    const g = await ev(page, () => { const hud = document.getElementById("drawHud"), cv = window.plasmaTest.sketch.cv.getBoundingClientRect(), r = hud.getBoundingClientRect();
      const box = (b) => [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)];
      const over = !(r.right <= cv.left || r.left >= cv.right || r.bottom <= cv.top || r.top >= cv.bottom);
      const onScreen = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      // where it used to sit: bottom-middle of the drawing
      return { shown: !hud.hidden && r.height > 0, over, onScreen, hud: box(r), cv: box(cv), old: [Math.round((cv.left + cv.right) / 2), Math.round(cv.bottom - 60)] };
    });
    t.check(`3.2 ${prof}: the Length / Angle box shows, fully on screen, and doesn't cover the drawing`, g.shown && !g.over && g.onScreen, J(g));
    await page.mouse.click(g.old[0], g.old[1]); await sleep(150);
    const n = await ev(page, () => window.plasmaTest.sketch.drawPts.length);
    t.check(`3.2 ${prof}: a click at the bottom-middle of the drawing adds a point (the box no longer eats it)`, n === 2, String(n));
    await page.keyboard.press("Escape"); await sleep(100);
  }
  await page.setViewportSize({ width: 1536, height: 730 }); await sleep(300);
  // ---------------------------------------------------------------- 3.4 Enter finishes an etch line
  for (const n of [2, 3]) {
    await fresh();
    await page.click('[data-qb="etch"]').catch(async () => { await ev(page, () => { const s = window.plasmaTest.sketch; s.setTool("draw"); s.drawEtch = true; }); });
    await sleep(150);
    const pts = [[10, 10], [80, 10], [80, 60]].slice(0, n);
    for (const [x, y] of pts) await clickAt(x, y);
    await page.keyboard.press("Enter"); await sleep(250);
    const r = await ev(page, () => { const s = window.plasmaTest.sketch; return { tool: s.tool, items: s.items.map((i) => ({ op: i.op, closed: i.shape && i.shape.cs[0].closed, n: i.shape && i.shape.cs[0].pts.length })) }; });
    t.check(`3.4: Enter finishes a ${n}-point etch line as one open etch mark (not a closed cut)`,
      r.tool == null && r.items.length === 1 && r.items[0].op === "score" && r.items[0].closed === false && r.items[0].n === n, J(r));
  }
  // ---------------------------------------------------------------- 3.5 a two-point line
  await fresh();
  await ev(page, () => window.plasmaTest.sketch.setTool("draw"));
  await clickAt(10, 10); await clickAt(90, 10);
  await ev(page, () => { window.__msgs = []; });
  await page.keyboard.press("Enter"); await sleep(250);
  const two = await ev(page, () => { const s = window.plasmaTest.sketch; return { tool: s.tool, pts: s.drawPts.length, items: s.items.length }; });
  const msg = await lastMsg();
  t.check("3.5: Enter on a two-point line keeps drawing (nothing lost) and says to add one more point to close it, or use Etch line",
    two.tool === "draw" && two.pts === 2 && two.items === 0 && /one more point/i.test(msg) && /etch line/i.test(msg), J({ two, msg }));
  await clickAt(50, 60); await page.keyboard.press("Enter"); await sleep(250);
  const three = await ev(page, () => { const s = window.plasmaTest.sketch; return { tool: s.tool, items: s.items.length, closed: s.items[0] && s.items[0].shape.cs[0].closed !== false }; });
  t.check("3.5: one more point and Enter closes it as a part", three.tool == null && three.items === 1 && three.closed, J(three));
  // ---------------------------------------------------------------- 3.11 the circle array's default clears the part
  for (const n of [4, 8]) {
    await fresh();
    await ev(page, () => { const s = window.plasmaTest.sketch; s.add("rect", true, { w: 80, h: 50 }); s.commit(); s.pick([s.items[0].id]); s.onSelect(); window.plasmaTest.runPro("polar"); });
    await sleep(250);
    await page.fill("#cad_n", String(n)); await page.click("#cadOk"); await sleep(300);
    const pa = await ev(page, () => { const s = window.plasmaTest.sketch, hit = [];
      // overlap = the real outlines cross or one sits inside another (copies are turned, so boxes alone would over-report)
      const world = s.items.map((i) => s.worldCs(i)[0].pts);
      const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
      for (let a = 0; a < world.length; a++) for (let b = a + 1; b < world.length; b++) if ((world[a].some((p) => inside(p, world[b])) || world[b].some((p) => inside(p, world[a])))) hit.push([a, b]);
      return { n: s.items.length, hit, msgs: (window.__msgs || []).slice(-2) };
    });
    t.check(`3.11: Circular array with the defaults (${n} round, PCD 0 = auto) puts ${n} copies that don't overlap each other`, pa.n === n && pa.hit.length === 0 && !pa.msgs.some((m) => /overlap/i.test(m)), J(pa));
  }
  t.check("no page error", !page.errors.length, J(page.errors.slice(0, 3)));
} catch (e) {
  t.check("124 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await page.ctx.close();
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

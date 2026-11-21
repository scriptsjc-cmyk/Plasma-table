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
  // ---------------------------------------------------------------- 3.12 a spline shows only the points that were clicked
  await fresh();
  await ev(page, () => window.plasmaTest.sketch.setTool("spline"));
  const clicked = [[10, 10], [40, 40], [70, 15], [100, 45], [130, 10]];
  for (const [x, y] of clicked) await clickAt(x, y);
  await page.keyboard.press("Enter"); await sleep(300);
  const sp = await ev(page, (clicked) => {
    const s = window.plasmaTest.sketch, it = s.items[0];
    // count the handles the drawing paints for the picked curve: vertex dots (arc r 4.5-8) and arc-middle squares (8 x 8)
    const P = CanvasRenderingContext2D.prototype, oa = P.arc, or = P.rect; const dots = [], sq = [];
    P.arc = function (x, y, r, ...a) { if (r >= 4.4 && r <= 8.1 && this.canvas === s.cv) dots.push([x, y]); return oa.call(this, x, y, r, ...a); };
    P.rect = function (x, y, w, h) { if (w === 8 && h === 8 && this.canvas === s.cv) sq.push([x, y]); return or.call(this, x, y, w, h); };
    try { s.draw(); } finally { P.arc = oa; P.rect = or; }
    const scr = clicked.map(([x, y]) => s.toScreen(x, y));
    const dpr = s.cv.width / s.cv.getBoundingClientRect().width || 1;
    const near = (d) => scr.some(([x, y]) => Math.hypot(d[0] / (dpr || 1) - x, d[1] / (dpr || 1) - y) < 6 || Math.hypot(d[0] - x, d[1] - y) < 6);
    return { picked: s.sel.ids.includes(it && it.id), verts: it ? s.worldCs(it)[0].pts.length : 0, dots: dots.length, sq: sq.length, offClick: dots.filter((d) => !near(d)).length };
  }, clicked);
  t.check("3.12: a 5-click spline shows at most 5 dots, all on the clicked points, and no arc-middle squares", sp.picked && sp.dots >= 2 && sp.dots <= 5 && sp.offClick === 0 && sp.sq === 0, J(sp));
  // ---------------------------------------------------------------- 3.6 the Rectangle / Circle buttons draw
  const items = () => ev(page, () => { const s = window.plasmaTest.sketch; return { tool: s.tool, list: s.items.map((i) => { const b = s.boxOf(i); return { type: i.type, b: b.map((v) => Math.round(v * 10) / 10), w: i.p.w, h: i.p.h, d: i.p.d }; }) }; });
  await fresh();
  await page.click('#quickBar [data-qb="rect"]'); await sleep(200);
  const r0 = await items();
  t.check("3.6: the Rectangle button starts drawing (nothing dropped yet), and shows as on", r0.tool === "rect" && r0.list.length === 0 && await ev(page, () => document.querySelector('#quickBar [data-qb="rect"]').classList.contains("on")), J(r0));
  await clickAt(10, 10);
  { const [px, py] = await at(70, 40); await page.mouse.move(px, py, { steps: 4 }); await sleep(150); }
  const live = await ev(page, () => ({ w: (document.getElementById("drawHudW") || {}).value, h: (document.getElementById("drawHudH") || {}).value }));
  t.check("3.6: while drawing, the box shows the live width x height (60 x 30)", Number(live.w) === 60 && Number(live.h) === 30, J(live));
  await clickAt(70, 40);
  const r1 = await items();
  t.check("3.6: click-click draws a 60 x 30 rectangle from corner to corner", r1.tool == null && r1.list.length === 1 && r1.list[0].type === "rect" && J(r1.list[0].b) === J([10, 10, 70, 40]), J(r1));
  await fresh();
  await page.click('#quickBar [data-qb="rect"]'); await sleep(150);
  { const [ax, ay] = await at(0, 0), [bx, by] = await at(50, 20); await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up(); await sleep(200); }
  const r2 = await items();
  t.check("3.6: press-drag-release draws a 50 x 20 rectangle", r2.tool == null && r2.list.length === 1 && J(r2.list[0].b) === J([0, 0, 50, 20]), J(r2));
  await fresh();
  await page.click('#quickBar [data-qb="disc"]'); await sleep(150);
  await clickAt(50, 50); await clickAt(70, 50);
  const r3 = await items();
  t.check("3.6: the Circle button: click the centre, click the edge -> a 40 mm circle round that centre", r3.tool == null && r3.list.length === 1 && r3.list[0].type === "disc" && J(r3.list[0].b) === J([30, 30, 70, 70]), J(r3));
  await fresh();
  await page.dblclick('#quickBar [data-qb="rect"]'); await sleep(250);
  const r4 = await items();
  t.check("3.6: double-clicking the Rectangle button drops a standard rectangle and leaves drawing", r4.tool == null && r4.list.length === 1 && r4.list[0].type === "rect", J(r4));
  await fresh();
  await page.dblclick('#quickBar [data-qb="disc"]'); await sleep(250);
  const r5 = await items();
  t.check("3.6: double-clicking the Circle button drops a standard circle", r5.tool == null && r5.list.length === 1 && r5.list[0].type === "disc", J(r5));
  // ---------------------------------------------------------------- 3.10 the tool dialogs are consistent
  // each: how to open it, the dialog, its main button, its Cancel button, and what the main button must say
  const DLG = [
    ["offset", () => window.plasmaTest.runPro("offset"), "cadDialog", "#cadOk", "#cadCancel", /^Offset$/],
    ["linear array", () => window.plasmaTest.runPro("linarray"), "cadDialog", "#cadOk", "#cadCancel", /^Make \d+ copies$/],
    ["circular array", () => window.plasmaTest.runPro("polar"), "cadDialog", "#cadOk", "#cadCancel", /^Make \d+ round the circle$/],
    ["cut control", () => window.plasmaTest.runPro("cutctl"), "cadDialog", "#cadOk", "#cadCancel", /^Apply to the job$/],
    ["add text", () => window.plasmaTest.openMakeTool("text"), "textDlg", "#mtAdd", "#mtCancel", /Add to my drawing/],
    ["trace", () => window.plasmaTest.openMakeTool("trace"), "traceDlg", "#trAdd", "#trCancel", /Add to my drawing/],
    ["resize", async () => (await import(new URL("js/make/files.js", location.href).href)).openResize(), "resizeDlg", "#rsOk", "#rsCancel", /Resize/],
  ];
  for (const [name, open, id, okSel, cancelSel, okRe] of DLG) {
    await fresh();
    await ev(page, () => { const s = window.plasmaTest.sketch; s.add("rect", true, { w: 80, h: 50 }); s.commit(); s.pick([s.items[0].id]); s.onSelect(); });
    await ev(page, () => { const t = document.getElementById("toast"); t.textContent = "an old message"; t.className = "toast"; });
    await ev(page, open);
    await sleep(300);
    const d = await ev(page, ([id, okSel, cancelSel]) => {
      const dlg = document.getElementById(id), ok = dlg && dlg.querySelector(okSel), no = dlg && dlg.querySelector(cancelSel);
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const ro = ok && ok.getBoundingClientRect(), rn = no && no.getBoundingClientRect();
      const natives = [...(dlg ? dlg.querySelectorAll('input[type="checkbox"], input[type="file"]') : [])].filter((i) => {
        const cs = getComputedStyle(i), r = i.getBoundingClientRect();
        const hidden = r.width <= 1 || r.height <= 1 || cs.opacity === "0" || cs.clipPath !== "none" && cs.clipPath !== "";
        return vis(i) && !hidden && cs.appearance !== "none";
      }).map((i) => i.id || i.type);
      // the switches are switch-shaped (wider than tall), not round dots or square boxes
      const notSwitch = [...(dlg ? dlg.querySelectorAll('input[type="checkbox"]') : [])].filter((i) => vis(i)).filter((i) => { const r = i.getBoundingClientRect(); return !(r.width >= 1.4 * r.height && getComputedStyle(i).appearance === "none"); }).map((i) => i.id);
      const t = document.getElementById("toast");
      return { open: vis(dlg), notSwitch, ok: ok ? ok.textContent.trim() : null, cancelLeft: !!(ro && rn && rn.right <= ro.left + 1), natives, toast: !t.classList.contains("hidden") && t.textContent === "an old message",
        current: dlg ? /current behaviour/i.test(dlg.textContent) : false, recommended: dlg ? /Automatic \(recommended\)/.test(dlg.innerHTML) : false };
    }, [id, okSel, cancelSel]);
    t.check(`3.10 ${name}: the main button names the action (${okRe.source.replace(/[\^$]/g, "")}), not "Do it"`, d.open && okRe.test(d.ok || "") && d.ok !== "Do it", J(d));
    t.check(`3.10 ${name}: Cancel is on the left of the main button`, d.open && d.cancelLeft, J(d));
    t.check(`3.10 ${name}: no native checkbox or file button shows (the app's own switch / file button)`, d.open && d.natives.length === 0, J(d));
    t.check(`3.10 ${name}: every on/off choice is drawn as the app's switch (wider than tall)`, d.open && d.notSwitch.length === 0, J(d));
    t.check(`3.10 ${name}: an old toast is cleared when the dialog opens`, d.open && !d.toast, J(d));
    if (/array/.test(name)) {
      // the count on the button follows the "How many" field (it remembers the last value, so read it, then change it)
      const live = await ev(page, () => { const f = document.getElementById("cad_n"), before = [f.value, document.getElementById("cadOk").textContent];
        f.value = "6"; f.dispatchEvent(new Event("input", { bubbles: true })); return { before, after: document.getElementById("cadOk").textContent }; });
      t.check(`3.10 ${name}: the button's count follows the How many field`, live.before[1].includes(" " + live.before[0] + " ") && / 6 /.test(live.after), J(live));
    }
    if (name === "cut control") t.check("3.10 cut control: says 'Automatic (recommended)', not 'current behaviour'", d.recommended && !d.current, J(d));
    await ev(page, () => { for (const id of ["cadCancel", "mtCancel", "trCancel", "rsCancel"]) { const b = document.getElementById(id); if (b && b.getClientRects().length) b.click(); } });
    await sleep(500);
  }
  t.check("no page error", !page.errors.length, J(page.errors.slice(0, 3)));
} catch (e) {
  t.check("124 ran to the end", false, String(e && e.stack || e).slice(0, 400));
}
await page.ctx.close();
await br.close(); await srv.close();
process.exit(t.done() ? 1 : 0);

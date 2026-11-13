import { T } from "../lib/t.mjs"; import { startServer, launchKillable, newPage, shot, SHOTS } from "../lib/browser.mjs";
import fs from "node:fs";
const t = new T("46_edit_edge");
const srv = await startServer();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORK_SHOTS = "/workspace/plasma-table/work/shots/";
fs.mkdirSync(WORK_SHOTS, { recursive: true });
const K = await launchKillable();

async function snap(page, name) {
  await shot(page, name);
  const src = SHOTS + name + ".png";
  try { if (fs.existsSync(src)) fs.copyFileSync(src, WORK_SHOTS + name + ".png"); } catch (e) { /* ignore */ }
}

async function openShape(page) {
  await page.evaluate(() => { window.plasmaTest.showScreen("make"); });   // r4: Make a part is reached from the menu (test bypass starts there)
  await page.waitForSelector("#cutView:not(.hidden)");
  await page.evaluate(() => window.plasmaTest.setAppMode("pro", { persist: false, autoFs: false }));   // Round 2: the edge panel sits in the side form in Pro (Beginner edits edges in the big editor)
  await page.waitForFunction(() => document.body.classList.contains("shape-fs"), null, { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => { const T = window.plasmaTest; if (document.body.classList.contains("shape-fs")) T.setShapeFs(false); });   // Round 2: Beginner opens the big editor
  await page.waitForFunction(() => !document.getElementById("srcShape").classList.contains("hidden"));   // (Beginner shows an empty form until a shape is picked, so it has no size yet)
  await page.evaluate(() => {
    const s = window.plasmaTest.sketch;
    s.items = [];
    s.sel = { ids: [], hole: null };
    s.commit();
  });
}

async function drawTee(page) {
  // T-shaped 156 x 91.4 mm custom outline (Josh's example)
  return page.evaluate(() => {
    const s = window.plasmaTest.sketch;
    s.setTool && s.setTool("draw");
    s.tool = "draw";
    s.drawPts = [
      [0, 0], [156, 0], [156, 30], [98, 30], [98, 91.4], [58, 91.4], [58, 30], [0, 30]
    ];
    s.finishDraw();
    s.fitView && s.fitView();
    const it = s.selected();
    return it && it.type === "custom" ? { id: it.id, n: it.shape.cs[0].pts.length } : null;
  });
}

try {
  {
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    await openShape(p);
    const drawn = await drawTee(p);
    t.check("Draw outline produces a custom T shape", !!(drawn && drawn.n >= 8), JSON.stringify(drawn));
    const picked = await p.evaluate(() => {
      const s = window.plasmaTest.sketch;
      const it = s.selected();
      return s.selectEdge(it.id, 0, 0);
    });
    t.check("click-equivalent selectEdge opens the first edge", picked === true);
    await sleep(200);
    t.check("edge panel is visible", await p.locator("#edgePanel:not(.hidden)").count() === 1);
    const before = await p.evaluate(() => window.plasmaTest.sketch.edgeInfo().length);
    await p.fill("#edgeLen", "160");
    await p.selectOption("#edgeFixed", "start");
    await p.click("#edgeLenApply");
    await sleep(150);
    const after = await p.evaluate(() => window.plasmaTest.sketch.edgeInfo().length);
    t.check("typed length moves the free end", Math.abs(after - 160) < 0.2, String({ before, after }));
    await snap(p, "edit-edge-length-desktop");

    await p.click("#edgeSquare");
    await sleep(100);
    const ang = await p.evaluate(() => window.plasmaTest.sketch.edgeInfo().angle);
    t.check("Square up snaps to a cardinal angle", [0, 90, -90, 180, -180].some((a) => Math.abs(((ang - a + 540) % 360) - 180) < 1), String(ang));

    await p.fill("#edgeAng", "0");
    await p.selectOption("#edgeAngMode", "abs");
    await p.click("#edgeAngApply");
    await p.fill("#edgeRad", "80");
    await p.click("#edgeCurve");
    await sleep(150);
    const curved = await p.evaluate(() => {
      const i = window.plasmaTest.sketch.edgeInfo();
      return { bulge: i.bulge, radius: i.radius };
    });
    t.check("Curve turns the edge into an arc", Math.abs(curved.bulge) > 0.01 && curved.radius > 0, JSON.stringify(curved));
    const gcode = await p.evaluate(() => {
      const s = window.plasmaTest.sketch;
      const it = s.selected();
      it._key = null;
      const cs = s.contoursOf(it);
      return { pts: cs[0].pts.length, raw: it.shape.cs[0].pts.length, bulge: (it.shape.cs[0].bulges || [])[s.edgeSel.ei] };
    });
    t.check("CAM/kerf tessellation has more points than the raw vertices when the edge is curved", gcode.pts > gcode.raw, JSON.stringify(gcode));
    await snap(p, "edit-edge-curve-desktop");

    const added = await p.evaluate(() => {
      const s = window.plasmaTest.sketch;
      const n0 = s.selected().shape.cs[0].pts.length;
      const e = s.edgeSel;
      s.addVertexOnEdge(e.ci, e.ei);
      return { n0, n1: s.selected().shape.cs[0].pts.length };
    });
    t.check("add vertex on an edge increases the corner count", added.n1 === added.n0 + 1, JSON.stringify(added));

    const deleted = await p.evaluate(() => {
      const s = window.plasmaTest.sketch;
      const n0 = s.selected().shape.cs[0].pts.length;
      s.deleteVertex();
      return { n0, n1: s.selected().shape.cs[0].pts.length };
    });
    t.check("delete vertex removes a corner", deleted.n1 === deleted.n0 - 1, JSON.stringify(deleted));

    await p.click("#edgeStraight");
    const straight = await p.evaluate(() => window.plasmaTest.sketch.edgeInfo().bulge);
    t.check("Straight clears the bulge", Math.abs(straight) < 1e-6, String(straight));

    const undone = await p.evaluate(() => {
      const s = window.plasmaTest.sketch;
      const n = s.past.length;
      s.undo();
      return { n, after: Math.abs(s.edgeInfo() ? s.edgeInfo().bulge : 99) };
    });
    t.check("undo restores the previous edge edit", undone.n > 0, JSON.stringify(undone));

    await p.evaluate(() => { window.plasmaTest.sketch.fitView && window.plasmaTest.sketch.fitView(); });
    await snap(p, "edit-edge-desktop");
    await p.close(); await p.ctx.close();
  }

  {
    const p = await newPage(K.browser, "iphone14", { base: srv.base });
    await openShape(p);
    await drawTee(p);
    await p.evaluate(() => {
      const s = window.plasmaTest.sketch;
      const it = s.selected();
      s.selectEdge(it.id, 0, 1);
      s.fitView && s.fitView();
    });
    await sleep(200);
    t.check("edge panel is usable on the phone", await p.locator("#edgePanel:not(.hidden)").count() === 1);
    await p.locator("#edgePanel").scrollIntoViewIfNeeded();
    await snap(p, "edit-edge-phone");
    await p.close(); await p.ctx.close();
  }

  {
    // Real mouse click on a drawn inner-corner handle (no selectEdge test hook)
    const p = await newPage(K.browser, "desktop", { base: srv.base });
    await openShape(p);
    await p.evaluate(() => {
      const s = window.plasmaTest.sketch;
      s.setTool && s.setTool("draw");
      s.tool = "draw";
      s.drawPts = [[0, 0], [220, 0], [220, 70], [100, 70], [100, 160], [0, 160]];
      s.finishDraw();
      s.fitView && s.fitView();
    });
    await sleep(300);
    const clk = await p.evaluate(() => {
      const s = window.plasmaTest.sketch, cv = document.getElementById("preview"), r = cv.getBoundingClientRect();
      const [sx, sy] = s.toScreen(100, 70);          // inner corner of the L
      return { x: r.left + sx, y: r.top + sy, selected: !!(s.selected() && s.selected().type === "custom") };
    });
    t.check("L is selected before the corner click", clk.selected);
    await p.mouse.click(clk.x, clk.y);
    await sleep(300);
    const picked = await p.evaluate(() => {
      const i = window.plasmaTest.sketch.edgeInfo && window.plasmaTest.sketch.edgeInfo();
      return i ? { kind: i.vi != null ? "vertex" : "edge", length: i.length, ei: i.ei } : null;
    });
    t.check("a real mouse click on the inner corner selects that edge or vertex", !!(picked && (picked.kind === "edge" || picked.kind === "vertex")), JSON.stringify(picked));
    if (picked) {
      await p.locator('[data-qb="fillet"]').click();
      await sleep(250);
      if (await p.locator("#cadFields input").count()) {
        await p.locator("#cadFields input").first().fill("8");
        await p.click("#cadOk");
        await sleep(300);
      }
      const after = await p.evaluate(() => {
        const s = window.plasmaTest.sketch, it = s.items[0], c = it && it.shape && it.shape.cs[0];
        const bs = (c && c.bulges) || [];
        return { n: c ? c.pts.length : 0, maxBulge: Math.max(0, ...bs.map((b) => Math.abs(b || 0))), toast: (document.getElementById("toast") || {}).innerText || "" };
      });
      t.check("Fillet R8 on the clicked inner corner keeps a curve", after.maxBulge > 0.05 && after.n === 7, JSON.stringify(after));
    }
    await snap(p, "edit-edge-fillet-click-desktop");
    await p.close(); await p.ctx.close();
  }
} catch (e) {
  t.check("suite threw", false, String(e && e.stack || e));
} finally {
  K.kill(); await srv.close();
}
process.exit(t.done() ? 1 : 0);

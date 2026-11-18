// Cross-page laptop operator-view audit (simulator / Practice table only).
// Operator stands at the FRONT: rail and home (0,0) at the back / top-left,
// +X right, +Y down toward the operator. Up jogs machine −Y, Down jogs +Y.
import fs from "node:fs";
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage, demoToShape } from "../lib/browser.mjs";

const t = new T("101_operator_view");
const OUT = "/workspace/out";
fs.mkdirSync(OUT, { recursive: true });

const srv = await startServer();
const br = await launch();
const ev = (page, f, a) => page.evaluate(f, a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function motionXY(text) {
  return [...String(text).matchAll(/\bG0?[01]\b[^G;\n]*\bX(-?[\d.]+)[^G;\n]*\bY(-?[\d.]+)/gi)].map((m) => [+m[1], +m[2]]);
}

const gcodeOf = (page) => ev(page, () => {
  const p = window.plasmaTest.S.prepared;
  return (p && p.lines && p.lines.join("\n")) || (p && p.source) || "";
});

async function hideToast(page) {
  await ev(page, () => { const el = document.getElementById("toast"); if (el) el.classList.add("hidden"); });
}

async function shot(page, name) {
  await hideToast(page);
  await sleep(80);
  await page.screenshot({ path: `${OUT}/opview2-${name}.png`, fullPage: false });
}

async function waitIdle(page, ms = 8000) {
  await page.waitForFunction(() => (window.plasmaTest.S.status || {}).state === "Idle", null, { timeout: ms }).catch(() => {});
  await sleep(150);
}

async function placeL(page, x = 15, y = 15) {
  await ev(page, ({ x, y }) => {
    const T = window.plasmaTest;
    T.showScreen("make"); T.setShapeFs(false);
    T.sketch.clear();
    T.sketch.add("lbracket", true, { a: 80, b: 50, t: 20, r: 0, hole: 0 });
    const it = T.sketch.items[0];
    if (it) { it.x = x; it.y = y; }
    if (T.sketch.commit) T.sketch.commit();
    else if (T.sketch.save) T.sketch.save();
  }, { x, y });
}

async function sendLToSetup(page, x = 15, y = 15) {
  await placeL(page, x, y);
  await ev(page, () => {
    const T = window.plasmaTest;
    T.sendToCutting(); T.goStep(3);
    const box = document.getElementById("showMach");
    if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
  await sleep(200);
}

function scanForbidden(text) {
  const s = String(text || "");
  // Sheet/table corner or "front of the table" wording that contradicts the laptop picture.
  // "job's bottom-left" (part space) and Make-a-part rotate-about-bottom-left are allowed.
  const hits = [];
  if (/sheet(?:'s)?\s+bottom-left/i.test(s) && !/job/i.test(s)) hits.push("sheet bottom-left");
  if (/bottom-left corner of the table/i.test(s)) hits.push("bottom-left of the table");
  if (/gantry[^\n.]{0,40}front|X beam along the front/i.test(s)) hits.push("gantry/front");
  if (/too far front\b/i.test(s)) hits.push("too far front");
  return hits;
}

async function visibleWording(page, rootSel) {
  return ev(page, (rootSel) => {
    const root = rootSel ? document.querySelector(rootSel) : document.body;
    if (!root) return { text: "", titles: [] };
    const text = (root.innerText || "").replace(/\s+/g, " ");
    const titles = [...root.querySelectorAll("[title],[aria-label]")].map((el) => (el.getAttribute("title") || "") + " " + (el.getAttribute("aria-label") || "")).filter((s) => /bottom-left|front|back-left|top-left/i.test(s));
    return { text, titles };
  }, rootSel);
}

async function openMachineSetup(page) {
  await ev(page, () => {
    const T = window.plasmaTest;
    T.showScreen("cut");
    const b = document.getElementById("menuSetup");
    if (b) b.click();
  });
  await page.waitForFunction(() => {
    const T = window.plasmaTest;
    const cv = document.getElementById("setupBed");
    return T.S.tab === "setup" && cv && cv.offsetParent && getComputedStyle(cv).display !== "none";
  }, null, { timeout: 10000 });
  await ev(page, () => { if (window.plasmaTest.drawSetupBed) window.plasmaTest.drawSetupBed(); });
  await sleep(150);
}

async function blur(page) {
  await ev(page, () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
}

async function lastJog(page) {
  return ev(page, () => {
    const log = (window.plasmaTest.S.demo && window.plasmaTest.S.demo.log) || [];
    const j = [...log].reverse().find((l) => /^\$J=/i.test(String(l)));
    return j || "";
  });
}

// ================================================================== page
const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: false });
await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make");
  T.setShapeFs(false);
  T.setAppMode("advanced", { autoFs: false, persist: false });
  T.sketch.clear();
  T.sketch.add("lbracket", true, { a: 80, b: 50, t: 20, r: 0, hole: 0 });
  const it = T.sketch.items[0];
  if (it) { it.x = 15; it.y = 15; }
  T.sketch.commit && T.sketch.commit();
});
await sleep(200);

// ------------------------------------------------------------------ Make a part (drawing, not a machine bed)
{
  const make = await ev(page, () => {
    const sk = window.plasmaTest.sketch, [w, h] = sk.size();
    const o = sk.toScreen(0, 0);
    const x = sk.toScreen(80, 0), y = sk.toScreen(0, 50);
    const canvas = document.getElementById("cad") || document.querySelector("#makeView canvas") || document.getElementById("preview");
    return {
      rot: window.plasmaTest.bedViewRotated(),
      screen: window.plasmaTest.screen(),
      o, x, y, w, h,
      machine: canvas && canvas.dataset.machine,
    };
  });
  t.check("Make a part is not a machine bed: view is not Y-flipped, (0,0) stays bottom-left",
    !make.rot && make.screen === "make" && make.o[1] > make.h * 0.5 && make.x[0] > make.o[0] && make.y[1] < make.o[1],
    JSON.stringify(make));
  const w = await visibleWording(page, "#makeView");
  const bad = scanForbidden(w.text);
  t.check("Make a part has no sheet/table 'bottom-left' wording that would contradict a machine view",
    bad.length === 0, JSON.stringify({ bad, slice: w.text.slice(0, 240) }));
  await shot(page, "make");
}

// ------------------------------------------------------------------ Settings (numeric bed size, no picture)
{
  await ev(page, () => window.plasmaTest.openSettings());
  await sleep(250);
  const set = await ev(page, () => {
    const x = document.getElementById("setBedX");
    const y = document.getElementById("setBedY");
    const z = document.getElementById("setBedZ");
    const canvases = [...document.querySelectorAll("#settingsView canvas, #settings canvas, [id*='settings'] canvas")].filter((c) => c.offsetParent);
    const dlg = document.getElementById("settings") || document.getElementById("settingsView") || document.body;
    return {
      x: x && x.value, y: y && y.value, z: z && z.value,
      canvases: canvases.length,
      text: (dlg.innerText || "").slice(0, 500),
    };
  });
  t.check("Settings bed size is numeric X/Y/Z, with no machine-bed picture",
    set.x && set.y && set.canvases === 0, JSON.stringify(set));
  t.check("Settings has no contradictory sheet-corner wording", scanForbidden(set.text).length === 0, set.text.slice(0, 240));
  await shot(page, "settings");
  await ev(page, () => window.plasmaTest.closeSettings && window.plasmaTest.closeSettings());
  await sleep(100);
}

// ------------------------------------------------------------------ Howto
{
  await ev(page, () => window.plasmaTest.openHowto && window.plasmaTest.openHowto());
  await sleep(200);
  const how = await ev(page, () => {
    const el = document.getElementById("howto") || document.getElementById("howtoDlg") || document.querySelector(".howto");
    return (el && (el.innerText || el.textContent)) || "";
  });
  t.check("Howto names the sheet corner as the back-left / top-left on a laptop",
    /back-left/i.test(how) && /top-left/i.test(how), how.slice(0, 400));
  t.check("Howto does not tell a laptop user the sheet corner is the bottom-left of the table",
    !/bottom-left corner of the table/i.test(how) && !/sheet's bottom-left/i.test(how), how.slice(0, 400));
  await shot(page, "howto");
  await ev(page, () => window.plasmaTest.closeHowto && window.plasmaTest.closeHowto());
  await sleep(100);
}

// Send the L-bracket to cutting and connect the Practice table
await ev(page, () => {
  const T = window.plasmaTest;
  T.showScreen("make"); T.setShapeFs(false);
  T.sendToCutting(); T.goStep(3);
});
await page.waitForFunction(() => window.plasmaTest.screen() === "cut" && window.plasmaTest.S.cur === 3, null, { timeout: 10000 });
await ev(page, () => document.getElementById("btnDemo").click());
await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
await waitIdle(page);

// ------------------------------------------------------------------ Machine setup
{
  await openMachineSetup(page);
  await ev(page, () => {
    const m = document.querySelector("#setupView .jogmount");
    if (m) m.scrollIntoView({ block: "nearest" });
    if (window.plasmaTest.drawSetupBed) window.plasmaTest.drawSetupBed();
  });
  await sleep(200);

  const ms = await ev(page, () => {
    const cv = document.getElementById("setupBed");
    const map = cv && cv._map;
    const home = (cv && cv._home) || (map && map.toPx(0, 0));
    const far = map && map.toPx(1200, 700);
    const labels = [...document.querySelectorAll("#setupView .j small")].map((s) => {
      const b = s.closest(".j");
      return { axis: b && b.dataset.axis, dir: b && b.dataset.dir, text: s.textContent };
    });
    const up = labels.find((l) => l.axis === "Y" && l.dir === "1");
    const down = labels.find((l) => l.axis === "Y" && l.dir === "-1");
    return {
      rot: window.plasmaTest.bedViewRotated(),
      tab: window.plasmaTest.S.tab,
      flip: cv && cv.dataset.flip,
      machine: cv && cv.dataset.machine,
      w: cv && cv.clientWidth, h: cv && cv.clientHeight,
      home, far,
      map: window.plasmaTest.jogToMachine("Y", 1),
      up, down,
      vp: [window.innerWidth, window.innerHeight],
    };
  });
  t.check("Machine setup: laptop bed is Y-flipped (rail / home at the top-left)",
    ms.rot && ms.tab === "setup" && ms.flip === "y" && ms.machine === "on"
      && ms.home && ms.home[0] < ms.w * 0.45 && ms.home[1] < ms.h * 0.45
      && ms.far && ms.far[0] > ms.home[0] && ms.far[1] > ms.home[1],
    JSON.stringify(ms));
  t.check("Machine setup: Up is labelled Y− and maps to machine −Y",
    ms.map[0] === "Y" && ms.map[1] === -1 && ms.up && /Y−|Y-/.test(ms.up.text) && ms.down && /Y\+/.test(ms.down.text),
    JSON.stringify({ map: ms.map, up: ms.up, down: ms.down }));

  await ev(page, () => document.getElementById("btnRef") && document.getElementById("btnRef").click());
  await page.waitForFunction(() => !!(window.plasmaTest.S.safety && window.plasmaTest.S.safety.referenced), null, { timeout: 8000 }).catch(() => {});
  await waitIdle(page);
  if (await ev(page, () => !!document.getElementById("btnDemoEdges"))) {
    await ev(page, () => document.getElementById("btnDemoEdges").click());
    await page.waitForFunction(() => !!(window.plasmaTest.S.safety && window.plasmaTest.S.safety.limits), null, { timeout: 8000 }).catch(() => {});
    await waitIdle(page);
  }
  await ev(page, () => {
    const m = document.querySelector("#setupView .jogmount");
    if (m) m.scrollIntoView({ block: "nearest" });
    if (window.plasmaTest.drawSetupBed) window.plasmaTest.drawSetupBed();
  });
  await blur(page);
  await ev(page, () => { const s = document.querySelector("#setupView .steps button[data-step='10']"); if (s) s.click(); });
  await sleep(80);

  // Home is at Y=0 (the rail). Up (−Y) is against that edge, so first jog Down
  // toward the operator, then Up back toward the rail.
  async function snapJog(start) {
    await ev(page, () => { if (window.plasmaTest.drawSetupBed) window.plasmaTest.drawSetupBed(); });
    return ev(page, (start) => {
      const w = window.plasmaTest.S.status.WPos || [0, 0, 0];
      const cv = document.getElementById("setupBed");
      const torch = cv && cv._torch;
      const log = (window.plasmaTest.S.demo.log || []).slice(start);
      const jog = [...log].reverse().find((l) => /^\$J=/i.test(String(l))) || "";
      return { x: w[0], y: w[1], torch, jog };
    }, start);
  }
  let nJog = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
  const atHome = await snapJog(nJog);
  await page.keyboard.down("ArrowDown"); await sleep(140); await page.keyboard.up("ArrowDown");
  await waitIdle(page);
  const down = await snapJog(nJog);
  t.check("Machine setup: ArrowDown sends $J with +Y and moves the torch toward the operator (down the picture)",
    /\$J=/.test(down.jog) && /Y(?!-)/.test(down.jog.replace(/Y-[\d.]+/g, " ")) && down.y > atHome.y + 1 && down.torch && atHome.torch && down.torch[1] > atHome.torch[1] + 2,
    JSON.stringify({ atHome, down }));

  nJog = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
  await page.keyboard.down("ArrowUp"); await sleep(140); await page.keyboard.up("ArrowUp");
  await waitIdle(page);
  const up = await snapJog(nJog);
  t.check("Machine setup: ArrowUp sends $J with a negative Y (toward the rail)",
    /\$J=.*Y-/.test(up.jog), JSON.stringify({ up, down }));
  t.check("Machine setup: ArrowUp decreases machine Y and moves the torch dot toward the top of the picture",
    up.y < down.y - 1 && up.torch && down.torch && up.torch[1] < down.torch[1] - 2,
    JSON.stringify({ down, up }));

  const msWords = await visibleWording(page, "#setupView");
  t.check("Machine setup visible text has no leftover sheet bottom-left / front-rail wording",
    scanForbidden(msWords.text).length === 0, msWords.text.slice(0, 300));
  await shot(page, "machine-setup");
}

// Back to Get-to-cutting
await ev(page, () => {
  const tab = document.querySelector(".tab[data-tab='cut']");
  if (tab) tab.click();
  window.plasmaTest.showScreen("cut");
  window.plasmaTest.goStep(1);
});
await sleep(250);

// ------------------------------------------------------------------ Step 1 Part (part preview, not a machine bed)
{
  const part = await ev(page, () => {
    const cv = document.getElementById("preview");
    const wrap = document.getElementById("showMachWrap");
    return {
      rot: window.plasmaTest.bedViewRotated(),
      step: window.plasmaTest.S.cur,
      machine: cv && cv.dataset.machine,
      toggleHidden: !wrap || wrap.classList.contains("hidden") || getComputedStyle(wrap).display === "none",
    };
  });
  t.check("Step 1 Part is a part preview, not a flipped machine bed",
    part.step === 1 && part.rot === false && part.toggleHidden, JSON.stringify(part));
  await shot(page, "part");
}

// ------------------------------------------------------------------ Setup (step 3 / Get-to-cutting 2)
await ev(page, () => {
  window.plasmaTest.goStep(3);
  const box = document.getElementById("showMach");
  if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
  if (window.plasmaTest.refresh) window.plasmaTest.refresh();
});
await sleep(300);

{
  const setup = await ev(page, () => {
    const sk = window.plasmaTest.sketch, [w, h] = sk.size();
    const o = sk.toScreen(0, 0);
    const far = sk.toScreen(1250, 700);
    const it = sk.items[0], ox = it ? it.x : 0, oy = it ? it.y : 0;
    const longTip = sk.toScreen(ox + 80, oy);     // long leg along +X at the part's min Y (toward the rail)
    const shortTip = sk.toScreen(ox, oy + 50);    // short leg along +Y (toward the operator)
    const help = (document.getElementById("bedStartHelp") || {}).textContent || "";
    const fit = (document.getElementById("fit") || {}).textContent || "";
    const label = [...document.querySelectorAll("canvas")].length;
    return {
      rot: window.plasmaTest.bedViewRotated(),
      step: window.plasmaTest.S.cur,
      o, far, longTip, shortTip, w, h, help, fit,
      axes: (document.getElementById("preview") || {}).dataset.axes,
      machine: (document.getElementById("preview") || {}).dataset.machine,
      map: window.plasmaTest.jogToMachine("Y", 1),
    };
  });
  t.check("Setup: bed is Y-flipped, home top-left, far corner toward bottom-right, gantry drawn",
    setup.rot && setup.step === 3 && setup.o[0] < setup.w * 0.45 && setup.o[1] < setup.h * 0.45
      && setup.far[0] > setup.o[0] && setup.far[1] > setup.o[1]
      && setup.axes === "on" && setup.machine === "on",
    JSON.stringify(setup));
  t.check("Setup: L-bracket is not Y-mirrored — long leg (Y=0) stays near the rail (top), short leg (+Y) goes down the screen",
    setup.longTip[1] < setup.shortTip[1] - 10 && setup.longTip[0] > setup.o[0] && setup.shortTip[1] > setup.o[1],
    JSON.stringify({ o: setup.o, longTip: setup.longTip, shortTip: setup.shortTip }));
  t.check("Setup help names the sheet corner as top-left / back-left, not bottom-left",
    /top-left/i.test(setup.help) && /back-left/i.test(setup.help) && !/bottom-left/i.test(setup.help),
    setup.help);
  t.check("Setup jog maps Up to machine −Y", setup.map[1] === -1, JSON.stringify(setup.map));

  const words = await visibleWording(page, "#cutView") ;
  t.check("Setup visible text has no leftover sheet bottom-left wording",
    scanForbidden(words.text).length === 0, JSON.stringify({ bad: scanForbidden(words.text), slice: words.text.slice(0, 280) }));

  // G-code of the L near the origin: long arm at low Y, short arm at higher Y; not mirrored
  const gtxt = await gcodeOf(page);
  const xy = motionXY(gtxt);
  const ys = xy.map((p) => p[1]), xs = xy.map((p) => p[0]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys), xMin = Math.min(...xs), xMax = Math.max(...xs);
  const nearRail = xy.filter((p) => p[1] <= yMin + 8);
  const towardOp = xy.filter((p) => p[1] >= yMax - 8);
  t.check("Setup: G-code for a part at the top-left of the picture stays near X0 Y0 (not flipped into high Y)",
    xy.length > 4 && yMin < 40 && xMin < 40 && yMax < 200 && xMax < 200,
    JSON.stringify({ n: xy.length, xMin, xMax, yMin, yMax, first: xy.slice(0, 3) }));
  t.check("Setup: G-code of the L is not Y-mirrored — the long leg (large X) is at low Y, the short leg at higher Y",
    Math.max(...nearRail.map((p) => p[0])) > Math.max(...towardOp.map((p) => p[0])) + 15
      && yMax - yMin > 20,
    JSON.stringify({ yMin, yMax, xAtLowY: nearRail, xAtHighY: towardOp }));

  // Drag down the screen: machine Y increases (toward the operator)
  const before = await ev(page, () => {
    const sk = window.plasmaTest.sketch, it = sk.items[0], b = sk.boxOf(it);
    const [sx, sy] = sk.toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    const r = document.getElementById("preview").getBoundingClientRect();
    return { x: it.x, y: it.y, sx, sy, cx: r.left + sx, cy: r.top + sy };
  });
  await page.mouse.move(before.cx, before.cy);
  await page.mouse.down();
  await page.mouse.move(before.cx, before.cy + 70, { steps: 8 });
  await page.mouse.up();
  await sleep(150);
  const afterDrag = await ev(page, () => {
    const sk = window.plasmaTest.sketch, it = sk.items[0], b = sk.boxOf(it);
    const [sx, sy] = sk.toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    return { x: it.x, y: it.y, sx, sy };
  });
  t.check("Setup: dragging down the screen moves the part down and increases machine Y",
    afterDrag.sy > before.sy + 15 && afterDrag.y > before.y + 5,
    JSON.stringify({ before, afterDrag }));
  // put it back near the origin for the cut / g-code checks
  await ev(page, (y0) => {
    const sk = window.plasmaTest.sketch, it = sk.items[0];
    if (it) { it.x = 15; it.y = 15; }
    if (sk.draw) sk.draw();
    if (window.plasmaTest.sendToCutting) { /* already on the bed */ }
    if (window.plasmaTest.refresh) window.plasmaTest.refresh();
  }, before.y);
  await ev(page, () => {
    // re-prepare from the sketch after the drag
    const T = window.plasmaTest;
    if (T.sendToCutting) T.sendToCutting();
    T.goStep(3);
    const box = document.getElementById("showMach");
    if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await sleep(250);

  // Fit warnings: too far back (small Y) vs too far forward (large Y, toward the operator)
  const fitW = await ev(page, () => {
    const p = window.plasmaTest.S.prepared;
    if (!p || !p.stats) return { skip: true };
    const saved = p.stats.bounds.slice();
    const L = window.plasmaTest.S.safety && window.plasmaTest.S.safety.limits;
    if (!L || !window.plasmaTest.S.safety.referenced) return { skip: true, reason: "no edges" };
    p.stats.bounds = [L.x[0] + 10, L.y[0] - 40, L.x[0] + 80, L.y[0] + 10];
    window.plasmaTest.refresh();
    const back = (document.getElementById("fit") || {}).textContent || "";
    p.stats.bounds = [L.x[0] + 10, L.y[1] - 10, L.x[0] + 80, L.y[1] + 40];
    window.plasmaTest.refresh();
    const fwd = (document.getElementById("fit") || {}).textContent || "";
    p.stats.bounds = saved;
    window.plasmaTest.refresh();
    return { back, fwd };
  });
  if (fitW.skip) {
    t.check("Setup: fit warnings exercised (edges + home were set on Machine setup)", false, JSON.stringify(fitW));
  } else {
    t.check("Setup: a part past Y=0 (the rail) is 'too far back', not 'too far forward'",
      /too far back/i.test(fitW.back) && !/too far forward/i.test(fitW.back), fitW.back);
    t.check("Setup: a part past the operator-side edge is 'too far forward'",
      /too far forward/i.test(fitW.fwd) && !/too far back/i.test(fitW.fwd), fitW.fwd);
  }

  await blur(page);
  // If we are already on Y=0, step toward the operator first so Up has room.
  await ev(page, () => {
    const y = Number((window.plasmaTest.S.status.WPos || [0, 0, 0])[1]);
    if (y < 8) {
      const [axis, dir] = window.plasmaTest.jogToMachine("Y", -1);
      window.plasmaTest.getM().command({ cmd: "jog", axis, dist: 10 * dir });
    }
  });
  await page.waitForFunction(() => {
    const st = window.plasmaTest.S.status || {};
    return st.state === "Idle" && Number((st.WPos || [0])[1]) >= 8;
  }, null, { timeout: 8000 }).catch(() => {});
  await sleep(200);
  const nJog = await ev(page, () => (window.plasmaTest.S.demo.log || []).length);
  const t0 = await ev(page, () => {
    const w = window.plasmaTest.S.status.WPos || [0, 0, 0];
    const sk = window.plasmaTest.sketch;
    const torch = sk && sk.toScreen(w[0], w[1]);
    return { y: w[1], torch };
  });
  await page.keyboard.down("ArrowUp"); await sleep(140); await page.keyboard.up("ArrowUp");
  await waitIdle(page);
  const t1 = await ev(page, (start) => {
    const w = window.plasmaTest.S.status.WPos || [0, 0, 0];
    const sk = window.plasmaTest.sketch;
    const torch = sk && sk.toScreen(w[0], w[1]);
    const log = (window.plasmaTest.S.demo.log || []).slice(start);
    const jog = [...log].reverse().find((l) => /^\$J=/i.test(String(l))) || "";
    return { y: w[1], torch, jog };
  }, nJog);
  t.check("Setup: ArrowUp sends −Y, the readout decreases Y, and the live torch moves toward the rail (up the screen)",
    t1.y < t0.y - 1 && t1.torch && t0.torch && t1.torch[1] < t0.torch[1] - 2 && /\$J=.*Y-/.test(t1.jog),
    JSON.stringify({ t0, t1 }));

  await shot(page, "setup");
}

// ------------------------------------------------------------------ Cut-test coupon (same bed, same orientation)
{
  await ev(page, () => {
    const b = document.getElementById("btnCoupon");
    if (b) b.click();
  });
  await sleep(400);
  await ev(page, () => {
    window.plasmaTest.goStep(3);
    const box = document.getElementById("showMach");
    if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    if (window.plasmaTest.refresh) window.plasmaTest.refresh();
  });
  await sleep(250);
  const cp = await ev(page, () => {
    const sk = window.plasmaTest.sketch, [w, h] = sk.size();
    const o = sk.toScreen(0, 0);
    const coupon = !!(window.plasmaTest.S.design && window.plasmaTest.S.design.coupon);
    const name = (window.plasmaTest.S.fileName || "") + " " + ((window.plasmaTest.S.design && window.plasmaTest.S.design.name) || "");
    return { rot: window.plasmaTest.bedViewRotated(), o, w, h, coupon, name, step: window.plasmaTest.S.cur };
  });
  const cxy = motionXY(await gcodeOf(page));
  const cyMin = Math.min(...cxy.map((p) => p[1]));
  const cxMin = Math.min(...cxy.map((p) => p[0]));
  t.check("Coupon uses the same Y-flipped bed: (0,0) at top-left",
    cp.rot && cp.o[0] < cp.w * 0.45 && cp.o[1] < cp.h * 0.45 && (cp.coupon || /coupon/i.test(cp.name)),
    JSON.stringify(cp));
  t.check("Coupon G-code stays near the sheet origin (not Y-flipped into machine space)",
    cxy.length > 4 && cyMin < 40 && cxMin < 40,
    JSON.stringify({ n: cxy.length, cxMin, cyMin, first: cxy.slice(0, 4) }));
  await shot(page, "coupon");
}

// Reload an L-bracket for the simulated cut (coupon replaced the design)
await sendLToSetup(page, 15, 15);
// Reconnect if needed
if (!await ev(page, () => window.plasmaTest.S.connected)) {
  await ev(page, () => document.getElementById("btnDemo").click());
  await page.waitForFunction(() => window.plasmaTest.S.connected, null, { timeout: 10000 });
}
await waitIdle(page);

// Start here + checklist + dry run, then simulate the cut
await ev(page, () => {
  const c = document.getElementById("zeroCard"); if (c) c.open = true;
});
await ev(page, () => document.getElementById("btnZero").click());
await sleep(400);
await ev(page, () => {
  document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; });
  document.getElementById("checklist").dispatchEvent(new Event("change", { bubbles: true }));
  const dry = document.getElementById("dryRun");
  if (dry && !dry.checked) { dry.checked = true; dry.dispatchEvent(new Event("change", { bubbles: true })); }
});
await sleep(200);

const gCut = motionXY(await gcodeOf(page));
await ev(page, () => { window.__cutPath = []; });
await ev(page, () => {
  window.__cutPath = [];
  if (window.__cutTimer) clearInterval(window.__cutTimer);
  window.__cutTimer = setInterval(() => {
    const st = window.plasmaTest.S.status || {};
    const w = st.WPos || [0, 0, 0];
    const cv = document.getElementById("preview");
    const map = cv && cv._map;
    const sk = window.plasmaTest.sketch;
    const px = (sk && sk.toScreen) ? sk.toScreen(w[0], w[1]) : (map && map.toPx(w[0], w[1]));
    window.__cutPath.push({ x: w[0], y: w[1], torch: !!st.torch, sx: px && px[0], sy: px && px[1], t: Date.now() });
  }, 40);
});
await ev(page, () => {
  const btn = document.getElementById("btnStart");
  try {
    if (btn && !btn.disabled) btn.click();
    else window.plasmaTest.getM().startJob({ dry_run: true });
  } catch (e) { window.__startErr = String(e.message || e); }
});
await page.waitForFunction(() => window.plasmaTest.S.cur === 4 || window.__startErr, null, { timeout: 8000 }).catch(() => {});
await ev(page, () => {
  if (window.plasmaTest.S.cur !== 4 && (window.plasmaTest.S.job || window.plasmaTest.getM().jobRunning())) {
    window.plasmaTest.S.job = window.plasmaTest.S.job || { running: true };
    window.plasmaTest.goStep(4);
  }
});
await sleep(400);
await shot(page, "cut");

// Wait until the practice job finishes (or 25s)
await page.waitForFunction(() => {
  const M = window.plasmaTest.getM();
  return window.__startErr || (window.plasmaTest.S.job && !M.jobRunning() && (window.plasmaTest.S.job.result || window.__cutPath.length > 20));
}, null, { timeout: 25000 }).catch(() => {});
await sleep(200);
await ev(page, () => { if (window.__cutTimer) clearInterval(window.__cutTimer); });

{
  const run = await ev(page, () => ({
    err: window.__startErr || "",
    step: window.plasmaTest.S.cur,
    running: !!(window.plasmaTest.getM().jobRunning && window.plasmaTest.getM().jobRunning()),
    result: window.plasmaTest.S.job && window.plasmaTest.S.job.result,
    n: (window.__cutPath || []).length,
    path: (window.__cutPath || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    rot: window.plasmaTest.bedViewRotated(),
  }));
  t.check("Cut step: the bed stays Y-flipped and the practice job started (no real hardware)",
    run.rot && !run.err && run.n > 5 && (run.step === 4 || run.result === "done"),
    JSON.stringify({ err: run.err, step: run.step, n: run.n, result: run.result, running: run.running }));

  const path = run.path || [];
  const cutYs = path.map((p) => p.y);
  const gYs = gCut.map((p) => p[1]);
  const pMin = Math.min(...cutYs), pMax = Math.max(...cutYs);
  const gMin = Math.min(...gYs), gMax = Math.max(...gYs);
  t.check("Simulated torch path stays in the same Y range as the G-code (not mirrored about the bed)",
    path.length > 5 && pMin > gMin - 15 && pMax < gMax + 15 && pMax - pMin > (gMax - gMin) * 0.3,
    JSON.stringify({ pMin, pMax, gMin, gMax, n: path.length, gN: gCut.length }));

  const withPx = path.filter((p) => Number.isFinite(p.sy));
  if (withPx.length > 5) {
    // higher machine Y should appear lower on the screen (larger sy)
    const lowY = withPx.reduce((a, b) => (a.y <= b.y ? a : b));
    const highY = withPx.reduce((a, b) => (a.y >= b.y ? a : b));
    t.check("Sim torch on the Cut picture: larger machine Y is further down the screen (toward the operator)",
      highY.sy > lowY.sy + 5,
      JSON.stringify({ lowY, highY }));
  } else {
    t.check("Sim torch positions were mapped onto the Cut picture", false, JSON.stringify({ n: withPx.length }));
  }
}

await hideToast(page);
await page.ctx.close();
await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

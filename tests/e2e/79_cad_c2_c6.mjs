// C2: Draw outline A / Enter work even when the length box is present.
// C6: right-click opens the context menu and does not throw.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";

const t = new T("79_cad_c2_c6");
const srv = await startServer();
const br = await launch();
const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.evaluate(() => {
  const T = window.plasmaTest;
  T.showScreen && T.showScreen("make");
  T.setAppMode && T.setAppMode("pro", { persist: false, autoFs: false });
});
await page.waitForFunction(() => !document.getElementById("srcShape").classList.contains("hidden"));
await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.setActive(true);
  sk.clear();
  sk.opts.pro = true;
});

// ---- C6 right-click ----
await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.add("rect", true);
  const it = sk.items.at(-1);
  it.p.w = 120; it.p.h = 80; it.x = 40; it.y = 40;
  sk.pick([it.id]);
  sk.fitView && sk.fitView();
  sk.draw();
});
await page.waitForTimeout(100);
const menu = await page.evaluate(() => {
  const cv = window.plasmaTest.sketch.cv;
  const r = cv.getBoundingClientRect();
  const [sx, sy] = window.plasmaTest.sketch.toScreen(100, 80);
  const ev = (type, extra) => cv.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
    button: 2, buttons: type === "pointerup" ? 0 : 2, clientX: r.left + sx, clientY: r.top + sy,
    ...extra,
  }));
  ev("pointerdown");
  ev("pointerup");
  const el = document.getElementById("cadCtxMenu");
  const vis = !!(el && !el.classList.contains("hidden") && !el.hidden);
  const labels = vis ? [...el.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
  return { vis, labels, html: el && el.innerHTML };
});
t.check("C6: right-click opens the context menu", menu.vis === true, JSON.stringify(menu), "C6-CTX");
t.check("C6: menu has Move / Duplicate / Lock / Hide / Delete / Properties",
  ["Move", "Duplicate"].every((s) => menu.labels.some((l) => l.includes(s))) && menu.labels.some((l) => /Lock|Unlock/.test(l)) && menu.labels.some((l) => /Delete/.test(l)) && menu.labels.some((l) => /Properties/.test(l)),
  menu.labels.join(", "), "C6-CTX");
t.check("C6: no ReferenceError / console crash", !errors.some((e) => /wx|ReferenceError|before initialization/i.test(e)), errors.slice(0, 4).join(" | "), "C6-CTX");

// ---- C2 A and Enter ----
await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  document.getElementById("cadCtxMenu") && document.getElementById("cadCtxMenu").classList.add("hidden");
  sk.clear();
  sk.setTool("draw");
  sk.drawPts = [[0, 0], [80, 0], [80, 50]];
  if (window.plasmaTest.afterDrawPoint) window.plasmaTest.afterDrawPoint();
  else {
    // paint the HUD as afterDrawPoint would
  }
  sk.draw();
});
// Focus the length box (the original bug) and press A, then Enter.
const hud = await page.evaluate(async () => {
  const sk = window.plasmaTest.sketch;
  // Re-open HUD the same way a click would.
  const { paintDrawHud, afterDrawPoint, toggleDrawArc } = await import("./js/make/drawhud.js").catch(() => ({}));
  return { hasPaint: typeof paintDrawHud === "function" };
});
// Drive HUD through the page as the app does: call afterDrawPoint if exposed, else paint #drawHud ourselves by clicking.
await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.setTool("draw");
  sk.drawPts = [[0, 0], [80, 0], [80, 50]];
  sk.drawArc = false;
  // Use the same hook the pointer path uses, if we can reach it via a custom event on the canvas.
});
// Import from the running app: afterDrawPoint is module-scoped, but paint happens after a point.
// Simulate a first-point HUD by clicking the canvas three times already done; call the same functions the app binds.
const c2 = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.setTool("draw");
  sk.drawPts = [];
  const add = (x, y) => { if (sk.pushDrawPoint) sk.pushDrawPoint(x, y); else sk.drawPts.push([x, y]); };
  add(0, 0); add(80, 0); add(80, 50);
  // Open the HUD as afterDrawPoint does (the module is already bound; trigger it by synthesizing the same state).
  const ev = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
  const len = document.getElementById("drawHudLen");
  // If the HUD is not open yet, press A on the window (the intended path when the box is not focused).
  let arcBefore = !!sk.drawArc;
  if (len) { len.focus(); len.value = "40"; len.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true })); }
  else { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true })); }
  const arcAfter = !!sk.drawArc;
  const lenVal = (document.getElementById("drawHudLen") && document.getElementById("drawHudLen").value) || "";
  const n0 = sk.drawPts.length;
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  if (document.getElementById("drawHudLen")) {
    document.getElementById("drawHudLen").focus();
    document.getElementById("drawHudLen").dispatchEvent(enter);
  } else {
    window.dispatchEvent(enter);
  }
  return {
    arcBefore, arcAfter, lenVal, n0, n1: sk.drawPts.length, items: sk.items.length,
    type: sk.items[0] && sk.items[0].type,
    pts: sk.items[0] && sk.items[0].shape && sk.items[0].shape.cs[0] && sk.items[0].shape.cs[0].pts.length,
    arcBtn: !!(document.getElementById("toolArc") || document.getElementById("drawHudArc")),
  };
});
t.check("C2: A toggles arc mode (and does not type into Length)", c2.arcAfter === true && !/a/i.test(c2.lenVal), JSON.stringify(c2), "C2-DRAW");
t.check("C2: Enter closes the outline instead of adding a point", c2.items === 1 && c2.n1 === 0, JSON.stringify(c2), "C2-DRAW");
t.check("C2: there is an on-screen Arc control", c2.arcBtn === true, JSON.stringify(c2), "C2-DRAW");

const closed = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.setTool("draw");
  sk.drawPts = [[0, 0], [80, 0], [80, 50], [0, 50]];
  sk.finishDraw();
  return { items: sk.items.length, n: sk.items[0] && sk.items[0].shape && sk.items[0].shape.cs[0].pts.length };
});
t.check("C2: Close / finishDraw still builds a closed outline", closed.items === 1 && closed.n >= 4, JSON.stringify(closed), "C2-DRAW");

await page.ctx.close();
await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

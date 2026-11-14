// C15: bolt circle fitted on a small plate (screenshot).
// C16: unsupported characters are warned and not added as “?”.
// C17: Escape closes Width × height.
// C19: Edit edge has Done / Cancel; the selected edge is highlighted.
// C22: help says Space is STOP; S and F are listed.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { mkdirSync } from "node:fs";

const t = new T("81_cad_c15_c28");
const srv = await startServer();
const br = await launch();
const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

mkdirSync("/workspace/out", { recursive: true });

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

// ---- C15 bolt circle on a 100×60 plate ----
const c15 = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.add("rect", true);
  const plate = sk.items[0];
  plate.p.w = 100; plate.p.h = 60; plate.x = 20; plate.y = 20;
  sk.pick([plate.id]);
  sk.add("boltcircle");
  const ring = sk.items.find((i) => i.type === "boltcircle");
  sk.fitView && sk.fitView();
  sk.draw();
  sk.onSelect();
  return {
    pcd: ring && ring.p.pcd,
    hole: ring && ring.p.hole,
    msg: (sk.messages || []).slice(-1)[0] || "",
    n: sk.items.length,
  };
});
t.check("C15: bolt circle lands on the plate", c15.n >= 2, JSON.stringify(c15), "C15-BOLT");
t.check("C15: ring Ø is fitted to the 100×60 plate", c15.pcd <= 40.1, JSON.stringify(c15), "C15-BOLT");
await page.waitForTimeout(80);
await page.screenshot({ path: "/workspace/out/c15-bolt-circle.png" });

// ---- C16 text dialog: £ is warned, Add stays off, letter height resets ----
await page.evaluate(() => {
  const toast = document.getElementById("toast");
  if (toast) { toast.textContent = ""; toast.classList.add("hidden"); }
  const T = window.plasmaTest;
  T.openMakeTool && T.openMakeTool("text");
});
await page.waitForFunction(() => {
  const dlg = document.getElementById("textDlg") || document.getElementById("mtText") && document.getElementById("mtText").closest(".dialog, .overlay, [role='dialog'], .maketool, .modal") ;
  return !!(document.getElementById("mtText") && document.getElementById("mtText").offsetParent);
}, null, { timeout: 8000 });
const c16 = await page.evaluate(() => {
  const size = document.getElementById("mtSize");
  const text = document.getElementById("mtText");
  const add = document.getElementById("mtAdd");
  const info = document.getElementById("mtInfo");
  const kind = document.getElementById("mtKind");
  const sizeVal = size && size.value;
  text.value = "£50";
  text.dispatchEvent(new Event("input", { bubbles: true }));
  text.dispatchEvent(new Event("change", { bubbles: true }));
  return new Promise((res) => setTimeout(() => res({
    sizeVal,
    disabled: add && add.disabled,
    info: info && info.textContent,
    kindOverflow: kind ? (kind.scrollWidth <= kind.clientWidth + 2 || kind.clientHeight >= 20) : true,
  }), 350));
});
t.check("C16: letter height is reset to 40 mm when the dialog opens", String(c16.sizeVal) === "40", `size=${c16.sizeVal}`, "C16-TEXT");
t.check("C16: Add is disabled while unsupported characters are present", c16.disabled === true, `disabled=${c16.disabled} info=${c16.info}`, "C16-TEXT");
t.check("C16: the dialog names the missing character", /£/.test(c16.info || "") && /not be added|aren't in the font|not in the font/i.test(c16.info || ""), c16.info, "C16-TEXT");
await page.screenshot({ path: "/workspace/out/c16-text-missing.png" });
await page.evaluate(() => {
  const close = document.getElementById("mtClose") || document.getElementById("mtCancel");
  if (close) close.click();
});

// ---- C17 Escape closes Width × height ----
const c17 = await page.evaluate(async () => {
  const T = window.plasmaTest;
  const sk = T.sketch;
  sk.clear();
  sk.add("rect", true);
  const it = sk.items[0];
  it.p.w = 80; it.p.h = 50; it.x = 20; it.y = 20;
  sk.pick([it.id]);
  sk.onSelect();
  const btn = document.querySelector('[data-qb="resize"]');
  if (btn) btn.click();
  const dlg = document.getElementById("resizeDlg");
  const opened = dlg && !dlg.classList.contains("hidden");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  return { opened, closed: dlg && dlg.classList.contains("hidden") };
});
t.check("C17: Width × height opens for an axis-aligned part", c17.opened === true, JSON.stringify(c17), "C17-ESC");
t.check("C17: Escape closes Width × height", c17.closed === true, JSON.stringify(c17), "C17-ESC");

// ---- C19 Done / Cancel on the edge panel ----
const c19 = await page.evaluate(() => {
  const done = document.getElementById("edgeDone");
  const cancel = document.getElementById("edgeCancel");
  return {
    done: !!(done && /done/i.test(done.textContent || "")),
    cancel: !!(cancel && /cancel/i.test(cancel.textContent || "")),
  };
});
t.check("C19: Edit edge has a Done button", c19.done, JSON.stringify(c19), "C19-EDGE");
t.check("C19: Edit edge has a Cancel button", c19.cancel, JSON.stringify(c19), "C19-EDGE");

// ---- C22 / C28 help text ----
const help = await page.evaluate(() => {
  const guide = document.querySelector("details.guide.howto") || document.querySelector("details.beginner-help");
  const text = (guide && guide.textContent) || "";
  return {
    found: !!guide,
    stop: /Space is STOP/i.test(text) && !/Hold Space to pan/i.test(text),
    keys: /S snap on\/off/i.test(text) && /F fit/i.test(text),
  };
});
t.check("C22: help says Space is STOP, not a pan key", help.stop, JSON.stringify(help), "C22-KEYS");
t.check("C22: the keys list mentions S snap and F fit", help.keys, JSON.stringify(help), "C22-KEYS");

// ---- C23 no Full screen button or tool ----
const c23 = await page.evaluate(() => {
  const btn = document.getElementById("btnShapeFs");
  const tool = document.querySelector('[data-qb="fs"]');
  return { btn: !!btn, tool: !!tool, fsClass: document.body.classList.contains("shape-fs") };
});
t.check("C23: no Full screen button or quickbar tool is shown", !c23.btn && !c23.tool && !c23.fsClass, JSON.stringify(c23), "C23-FS");

t.check("no page errors", errors.length === 0, errors.join(" | "), "E2E");

await br.close();
await srv.close();
process.exit(t.done() ? 1 : 0);

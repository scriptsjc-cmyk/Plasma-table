// C32 / C24: etch preview colour, fold bend lines, Score accepted, etch-first G-code.
import { T } from "../lib/t.mjs";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { mkdirSync } from "node:fs";

const t = new T("82_cad_etch");
const srv = await startServer();
const br = await launch();
const page = await newPage(br, "d1366", { base: srv.base, consoleErrors: true });
page.on("pageerror", (e) => console.log("pageerror", String(e)));

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

// ---- folded L: bend line is visible and distinct ----
const fold = await page.evaluate(() => {
  const sk = window.plasmaTest.sketch;
  sk.clear();
  sk.add("foldlbr", true);
  const it = sk.items[0];
  it.x = 20; it.y = 20;
  sk.pick([it.id]); sk.fitView(); sk.draw();
  const cs = sk.contours();
  const bends = cs.filter((c) => c.op === "score" || c.role === "bend");
  return { n: cs.length, bends: bends.length, ops: cs.map((c) => c.op || "cut") };
});
t.check("C32: fold preset includes a bend line on Make", fold.bends >= 1, fold, "C32-FOLD");
await page.screenshot({ path: "/workspace/out/c32-fold-bends.png" });

// ---- rectangle + a Score line: distinct preview, etch-first G-code ----
const job = await page.evaluate(async () => {
  const T = window.plasmaTest, sk = T.sketch;
  sk.clear();
  sk.add("rect", true);
  const plate = sk.items[0];
  plate.p.w = 120; plate.p.h = 80; plate.x = 20; plate.y = 20;
  const line = { id: sk.nextId++, type: "custom", p: { scale: 100 }, x: 30, y: 50, rot: 0, holes: {},
    name: "Etch", op: "score",
    shape: { cs: [{ pts: [[0, 0], [80, 0]], closed: false, op: "score", bulges: [0, 0] }] } };
  sk.items.push(line);
  sk.pick([line.id]); sk.fitView(); sk.draw();
  T.useShape && T.useShape();
  const I = window.ptInspector;
  const toast = document.getElementById("toast") && document.getElementById("toast").textContent;
  I && I.setCut && I.setCut({ operation: "score" });
  const toast2 = document.getElementById("toast") && document.getElementById("toast").textContent;
  T.useShape && T.useShape();
  const prep = T.S.prepared;
  const text = prep && prep.lines ? prep.lines.join("\n") : "";
  const etchAt = text.indexOf("PORTA-ETCH");
  const endAt = text.indexOf("PORTA-ETCH END");
  const after = endAt >= 0 ? text.slice(endAt) : "";
  const body = etchAt >= 0 && endAt > etchAt ? text.slice(etchAt, endAt) : "";
  return {
    toast: toast2 || toast,
    hasEtch: /PORTA-ETCH PLASMA|PORTA-ETCH SCRIBE/.test(text),
    etchFirst: etchAt >= 0 && endAt > etchAt && /\bM3\b/.test(after),
    noDelay: body !== "" && !/\bG4\s*P[1-9]/.test(body) && !/\bG4\s*P0\.[1-9]/.test(body),
    etches: !!(prep && prep.preview && prep.preview.etches && prep.preview.etches.length),
    cuts: !!(prep && prep.preview && prep.preview.cuts && prep.preview.cuts.length),
    why: (window.plasmaTest.scoreMarkProblem && window.plasmaTest.scoreMarkProblem()) || "",
  };
});
t.check("C32: inspector Score toast says it is etched first, not cut through", /etch/i.test(job.toast || "") && /not cut through/i.test(job.toast || ""), job.toast, "C32-UI");
t.check("C32: prepared job has an etch pass before the cuts", job.hasEtch && job.etchFirst, job, "C32-JOB");
t.check("C32: the etch pass has no pierce delay", job.noDelay, job, "C32-JOB");
t.check("C32: preview has distinct etch paths and cut paths", job.etches && job.cuts, job, "C32-PREV");
t.check("C32: Start/Download guard is clear when etch is written", job.why === "", job.why, "C32-GUARD");
await page.screenshot({ path: "/workspace/out/c32-etch-preview.png" });

// through-cut guard still fires if the etch flag is stripped from prepared output
const guard = await page.evaluate(() => {
  const T = window.plasmaTest;
  const lines = (T.S.prepared && T.S.prepared.lines || []).filter((l) => !/PORTA-ETCH/.test(l));
  const why = T.throughCutInEtch ? T.throughCutInEtch(lines, { hasEtchItems: true })
    : "no-fn";
  return why;
});
t.check("C32: stripping the etch flag is treated as a through-cut", /cut through|full power|no etch/i.test(guard) && guard !== "no-fn", guard, "C32-GUARD");

await br.close();
srv.close();
process.exit(t.done() ? 1 : 0);

// Parameter fuzz: every shape x every parameter x hostile values, through shape -> Sketch -> CAM -> job. Also localStorage tampering.
import { spawnSync } from "node:child_process"; import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs"; import { analyze } from "../lib/analyze.mjs";
const A = await load(); const t = new T("05_fuzz_params");
const VALS = [0, -1, -50, 1e-9, 0.001, 0.5, 1, 3, 1e4, 5000, 99999999, 1e9, 1e300, NaN, Infinity, -Infinity, "abc", "50", null, undefined, true, [], {}];
const stats = { cases: 0, threw: 0, nan: 0, empty: 0, oversize: 0, oversizeNoWarn: 0, negAccepted: [], zeroAccepted: [], hang: [] };
const cut = A.cutFor();
const tr = A.machine.travel_mm;
const sizeKeys = new Set(["w", "h", "d", "len", "wid", "a", "b"]);
const pipeline = (sk) => {
  const cs = sk.contours();
  if (!cs.length) return { empty: true };
  const flat = cs.flatMap((c) => c.pts.flat());
  if (!flat.every(Number.isFinite)) return { nanIn: true, cs };
  let cam; try { cam = A.designToGcode(cs, { kerf: 1.5, leadIn: 3, name: "fuzz" }); } catch (e) { return { threw: e.message, cs }; }
  const an = analyze(cam.gcode.split("\n")); let job = null, jobErr = null;
  try { job = A.prepareJob(cam.gcode, cut, A.machine, false); } catch (e) { jobErr = e.message; }
  return { cs, cam, an, job, jobErr };
};
for (const sh of A.SHAPES) {
  for (const [key] of sh.params) {
    for (const v of VALS) {
      stats.cases++;
      if (["n", "cols", "rows"].includes(key) && typeof v === "number" && v >= 1e4 && Number.isFinite(v)) {   // counts: run isolated with timeout + heap cap
        const r = spawnSync("node", ["--max-old-space-size=700", new URL("./_one.mjs", import.meta.url).pathname, sh.id, key, JSON.stringify(v)], { timeout: 8000, encoding: "utf8" });
        const tag = `${sh.id}.${key}=${v}`;
        if (r.error || r.status !== 0) { stats.hang.push(`${tag}: ${r.error ? "TIMEOUT>8s" : "crash/OOM exit " + r.status}`); t.check(`${tag}: handled without hang/OOM`, false, r.error ? "timeout >8s (tab would freeze)" : "out of memory / crash", "DOS-COUNT"); }
        else { let j = {}; try { j = JSON.parse(r.stdout.trim().split("\n").pop()); } catch (e) {} t.check(`${tag}: capped (<=5000 gcode lines) or rejected`, j.gcodeLines <= 5000 || j.contours === 0, JSON.stringify(j), "DOS-COUNT"); }
        continue;
      }
      const sk = A.newSketch(); sk.add(sh.id, true); const it = sk.items[0]; it.p[key] = v;
      const t0 = Date.now(); let r; try { r = pipeline(sk); } catch (e) { r = { threw: "UNCAUGHT " + e.message }; }
      const dt = Date.now() - t0; if (dt > 3000) stats.hang.push(`${sh.id}.${key}=${String(v)} took ${dt}ms`);
      const tag = `${sh.id}.${key}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
      if (r.threw) { stats.threw++; if (/UNCAUGHT/.test(r.threw)) t.check(`${tag}: no uncaught exception in pipeline`, false, r.threw, "FUZZ-THROW"); continue; }
      if (r.empty) { stats.empty++; continue; }
      if (r.nanIn) { stats.nan++; t.check(`${tag}: NaN/Infinity contour must never reach CAM`, false, "contour has non-finite points (UI would feed them to designToGcode)", "GCODE-NAN"); continue; }
      const bad = r.an.violations.filter((x) => ["non-finite-token", "non-finite-value", "rapid-while-torch-on", "cut-move-while-torch-off", "torch-left-on-at-end", "double-M3"].includes(x.type));
      if (bad.length) t.check(`${tag}: G-code safe`, false, JSON.stringify(bad.slice(0, 2)), "GCODE-SAFETY");
      if (r.job) { const aj = analyze(r.job.lines); if (aj.violations.length) t.check(`${tag}: prepared job safe`, false, JSON.stringify(aj.violations.slice(0, 2)), "GCODE-SAFETY"); }
      const [x0, y0, x1, y1] = r.an.bounds; const over = x1 > tr.x || y1 > tr.y;
      if (over) { stats.oversize++; if (!(r.job && r.job.warnings.some((w) => /bigger than the table/.test(w)))) { stats.oversizeNoWarn++; t.check(`${tag}: oversize job (${x1.toFixed(0)}x${y1.toFixed(0)}) must warn`, false, "", "GCODE-BOUNDS"); } }
      if (sizeKeys.has(key) && typeof v === "number" && v < 0) stats.negAccepted.push(tag + ` -> ${r.cs.length} contours`);
      if (sizeKeys.has(key) && v === 0 && r.cs.length) stats.zeroAccepted.push(tag + ` -> ${r.cs.length} contours, area0? ${r.an.blocks.length} cut blocks`);
    }
  }
}
t.note("fuzz cases", JSON.stringify({ cases: stats.cases, threw_caught: stats.threw, nanContours: stats.nan, emptyContours: stats.empty, oversize: stats.oversize, oversizeNoWarn: stats.oversizeNoWarn, slow: stats.hang.length }));
t.note("negative size accepted by model (first 8)", stats.negAccepted.slice(0, 8).join(" ; "));
t.check("negative sizes produce no cuttable contours at model level", stats.negAccepted.length === 0, `${stats.negAccepted.length} cases e.g. ${stats.negAccepted.slice(0, 3).join(" ; ")}`, "NEG-SIZE");
t.note("zero size accepted (first 8)", stats.zeroAccepted.slice(0, 8).join(" ; "));
t.check("zero sizes produce no cut blocks", stats.zeroAccepted.length === 0, `${stats.zeroAccepted.length} cases e.g. ${stats.zeroAccepted.slice(0, 3).join(" ; ")}`, "ZERO-SIZE");
t.check("no fuzz case takes > 3s (UI freeze)", stats.hang.length === 0, stats.hang.slice(0, 3).join(" ; "), "FUZZ-SLOW");

// ---- localStorage tampering: plasma.sketch with hostile items goes straight into the CAM
const tamper = [
  ["NaN size as string", { items: [{ id: 1, type: "rect", p: { w: "abc", h: 50, r: 0 }, x: 0, y: 0, rot: 0, holes: {} }] }],
  ["negative width", { items: [{ id: 1, type: "rect", p: { w: -100, h: 50, r: 0 }, x: 0, y: 0, rot: 0, holes: {} }] }],
  ["giant width", { items: [{ id: 1, type: "rect", p: { w: 1e8, h: 50, r: 0 }, x: 0, y: 0, rot: 0, holes: {} }] }],
  ["position 1e12", { items: [{ id: 1, type: "rect", p: { w: 100, h: 50, r: 0 }, x: 1e12, y: 0, rot: 0, holes: {} }] }],
  ["huge flange hole count (skipped: see DOS-COUNT)", { items: [{ id: 1, type: "flange", p: { d: 150, id: 60, pcd: 115, n: 1e9, hole: 12 }, x: 0, y: 0, rot: 0, holes: {} }] }],
  ["huge polygon n (skipped)", { items: [{ id: 1, type: "polygon", p: { n: 1e9, d: 100, r: 0 }, x: 0, y: 0, rot: 0, holes: {} }] }],
  ["holegrid 1e5 x 1e5 (skipped)", { items: [{ id: 1, type: "holegrid", p: { cols: 1e5, rows: 1e5, hole: 5, sx: 10, sy: 10 }, x: 0, y: 0, rot: 0, holes: {} }] }],
  ["custom with no shape", { items: [{ id: 1, type: "custom", p: { scale: 100 }, x: 0, y: 0, rot: 0, holes: {} }] }],
  ["custom with NaN pts", { items: [{ id: 1, type: "custom", p: { scale: 100 }, x: 0, y: 0, rot: 0, holes: {}, shape: { cs: [{ pts: [[0, 0], [10, null], [5, "x"]], closed: true }] } }] }],
  ["unknown type ignored", { items: [{ id: 1, type: "<img src=x onerror=alert(1)>", p: {}, x: 0, y: 0 }] }],
  ["items not array", { items: "x" }], ["null", null], ["array root", []],
  ["xss in extra fields", { items: [{ id: 1, type: "rect", p: { w: 10, h: 10, r: 0 }, x: 0, y: 0, rot: 0, holes: {}, name: "<script>alert(1)</script>" }] }],
  ["proto pollution", JSON.parse('{"items":[{"id":1,"type":"rect","p":{"w":10,"h":10,"r":0,"__proto__":{"x":1}},"x":0,"y":0,"rot":0,"holes":{}}],"__proto__":{"polluted":true}}')],
];
for (const [name, data] of tamper) {
  if (/skipped/.test(name)) continue;
  let sk, err = null, r = null; const t0 = Date.now();
  try { A.store.clear(); A.store.set("plasma.sketch", JSON.stringify(data)); const sketch = new A.Sketch((A.newSketch()).cv, {}); sk = sketch; sk.draw = () => {}; r = pipeline(sk); } catch (e) { err = e; }
  const dt = Date.now() - t0;
  t.check(`tamper '${name}': app loads without throwing`, !err, err && err.message, "LS-VALIDATE");
  if (!err && r) {
    t.check(`tamper '${name}': no NaN/Infinity in G-code`, !r.nanIn && !(r.an && r.an.violations.some((v) => /non-finite/.test(v.type))), "", "GCODE-NAN");
    const [, , x1, y1] = r.an ? r.an.bounds : [0, 0, 0, 0];
    t.check(`tamper '${name}': oversize design blocked or warned`, !r.an || (x1 <= tr.x && y1 <= tr.y) || (r.job && r.job.warnings.some((w) => /bigger than the table/.test(w))), `bounds ${x1}x${y1}`, "GCODE-BOUNDS");
    t.check(`tamper '${name}': negative width yields nothing/positive only`, !/negative/.test(name) || !r.cs || r.cs.length === 0, `contours=${r.cs && r.cs.length}`, "NEG-SIZE");
  }
  t.check(`tamper '${name}': finishes < 5s (no browser freeze)`, dt < 5000, `${dt}ms`, "FUZZ-SLOW");
}
t.check("Object.prototype not polluted by tampered localStorage", ({}).polluted === undefined && ({}).x === undefined);
process.exit(t.done() ? 1 : 0);

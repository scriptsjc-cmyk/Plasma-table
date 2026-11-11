// prepareJob() against hostile / sloppy imported G-code, plus dry-run behaviour and a random-line fuzzer.
import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs"; import { analyze } from "../lib/analyze.mjs";
const A = await load(); const t = new T("06_job_import"); const cut = A.cutFor();
const prep = (g, dry = false) => { try { return { job: A.prepareJob(g, cut, A.machine, dry) }; } catch (e) { return { err: e.message }; } };
const safe = (name, g, opts = {}) => {
  const r = prep(g, opts.dry); if (r.err) { t.note(`${name}: rejected`, r.err); return r; }
  const a = analyze(r.job.lines);
  const ends = (() => { let abs = true; for (const l of r.job.lines) { if (/G91/.test(l)) abs = false; if (/G90/.test(l)) abs = true; } return abs; })();
  t.check(`${name}: torch off at end & M5 present`, !a.violations.some((v) => v.type === "torch-left-on-at-end") && r.job.lines.filter((l) => l.trim() === "M5").length >= 1, JSON.stringify(a.violations.slice(0, 3)), "GCODE-SAFETY");
  t.check(`${name}: ends in absolute mode (G90)`, ends, "job ends in G91 relative mode", "GCODE-MODE");
  t.check(`${name}: no non-finite tokens`, !a.violations.some((v) => /non-finite/.test(v.type)), "", "GCODE-NAN");
  if (!opts.allowRapidOn) t.check(`${name}: no rapid (G0 XY) while torch on`, !a.violations.some((v) => v.type === "rapid-while-torch-on"), JSON.stringify(a.violations.filter((v) => v.type === "rapid-while-torch-on").slice(0, 2)), "IMPORT-RAPID-ON");
  return r;
};
const sq = (x, y, s) => [`G0 X${x} Y${y}`, "M3", `G1 X${x + s} Y${y}`, `G1 X${x + s} Y${y + s}`, `G1 X${x} Y${y + s}`, `G1 X${x} Y${y}`, "M5"];
safe("normal square", ["G21 G90", ...sq(10, 10, 50), "M30"].join("\n"));
safe("missing M5 at end", ["G21 G90", "G0 X0 Y0", "M3", "G1 X50 Y0", "M30"].join("\n"));
safe("missing M5 entirely, no M30", ["G0 X0 Y0", "M3", "G1 X50 Y0", "G1 X50 Y50"].join("\n"));
safe("M3 twice then one M5", ["G0 X0 Y0", "M3", "G1 X50 Y0", "M3", "G1 X50 Y50", "M5"].join("\n"));
const rr = safe("G0 rapid while torch on (CAM bug)", ["G0 X0 Y0", "M3", "G1 X50 Y0", "G0 X200 Y200", "G1 X250 Y200", "M5"].join("\n"), { allowRapidOn: true });
if (rr.job) { const a = analyze(rr.job.lines); t.check("rapid-with-torch-on in imported file is rejected or warned", !a.violations.some((v) => v.type === "rapid-while-torch-on") || rr.job.warnings.some((w) => /rapid|G0/i.test(w)), `violations=${a.violations.length}, warnings=${rr.job.warnings.join("|") || "none"}`, "IMPORT-RAPID-ON"); }
const mc = safe("M4 instead of M3", ["G0 X0 Y0", "M4", "G1 X50 Y0", "M5"].join("\n"));
safe("M03 / M05 zero padded", ["G0 X0 Y0", "M03", "G1 X50 Y0", "M05"].join("\n"));
safe("M3 and move on same line", ["G0 X0 Y0", "G1 X50 Y0 M3", "G1 X60 Y0 M5"].join("\n"));
safe("M5 then M3 same line", ["G0 X0 Y0 M3", "G1 X50 Y0", "M5 M3", "G1 X60 Y0", "M5"].join("\n"));
safe("comment hides M3 (paren)", ["G0 X0 Y0", "(M3 torch on)", "G1 X50 Y0", "M3", "G1 X70 Y0", "M5"].join("\n"));
safe("nested paren comment 'M3' leak", ["G0 X0 Y0", "(note (x) M3)", "G1 X50 Y0", "M3", "G1 X70 Y0", "M5"].join("\n"));
{ const r = prep(["G0 X0 Y0", "(note (x) M3)", "G1 X50 Y0", "G1 X60 Y0", "M3", "G1 X70 Y0", "M5"].join("\n")); if (r.job) { const m3 = r.job.lines.filter((l) => /^M3\b/.test(l)).length; t.check("nested-paren comment text 'M3' does not fire the torch (expect 1 pierce)", m3 === 1, `pierces=${r.job.stats.pierces}`, "IMPORT-COMMENT"); } }
safe("semicolon comment", ["G0 X0 Y0 ; M3", "G1 X50 Y0", "M3", "G1 X70 Y0", "M5"].join("\n"));
safe("G91 relative (rejected)", ["G91", "G0 X10", "M3", "G1 X10", "M5"].join("\n"));
safe("inches (rejected)", ["G20", "G0 X1", "M3", "G1 X2", "M5"].join("\n"));
safe("arcs", ["G0 X10 Y0", "M3", "G2 X10 Y0 I-10 J0", "M5"].join("\n"));
safe("arc with R (rejected)", ["G0 X0 Y0", "M3", "G2 X10 Y10 R10", "M5"].join("\n"));
safe("huge coordinates", ["G0 X0 Y0", "M3", "G1 X999999999 Y999999999", "M5"].join("\n"));
{ const r = prep(["G0 X0 Y0", "M3", "G1 X999999999 Y999999999", "M5"].join("\n")); if (r.job) t.check("huge job (1e9 mm) warned", r.job.warnings.some((w) => /bigger than the table/.test(w)), "", "GCODE-BOUNDS"); if (r.job) t.note("huge job: lines contain coordinate", r.job.lines.find((l) => /X999999999/.test(l)) || "none"); }
{ const r = prep(["G0 X0 Y0", "M3", "G1 X1.5E2 Y10", "M5"].join("\n")); if (r.job) t.check("exponent number X1.5E2 not silently truncated to X1.5", !r.job.lines.some((l) => /X1\.5( |$)/.test(l)) || r.job.warnings.length > 0, r.job.lines.find((l) => /^G1 X/.test(l)), "IMPORT-EXP"); }
{ const r = prep(["G0 X0 Y0", "M3", "G1 X-10 Y-10", "M5"].join("\n")); if (r.job) t.check("negative coordinates warned", r.job.warnings.some((w) => /left of|below/.test(w)), "", "GCODE-BOUNDS"); }
safe("settings lines ($) stripped", ["$130=100000", "$32=1", "G0 X0 Y0", "M3", "G1 X10", "M5"].join("\n"));
{ const r = prep(["$130=100000", "$32=1", "$H", "G0 X0 Y0", "M3", "G1 X10", "M5"].join("\n")); if (r.job) t.check("no $ command survives into the job", !r.job.lines.some((l) => l.startsWith("$")), r.job.lines.filter((l) => l.startsWith("$")).join("|"), "IMPORT-SETTINGS"); }
{ const r = prep(["G10 L2 P1 X500 Y500", "G92 X0 Y0", "G54", "G28", "M62 P0", "M7", "M8", "M6 T1", "S5000", "G0 X0 Y0", "M3", "G1 X10", "M5"].join("\n")); if (r.job) t.check("work-offset / coordinate-system / aux-output commands stripped (G10, G92, G28, M62, M7, M8, M6)", !r.job.lines.some((l) => /G10|G92|G28|G30|M62|M7|M8|M6|G54|G59/.test(l)), r.job.lines.filter((l) => /G10|G92|G28|M62|M7|M8|M6|G5/.test(l)).join("|"), "IMPORT-FILTER"); }
{ const r = prep(["G0 X0 Y0", "M3", "G1 X10", "M5", "G53 G0 Z0", "G38.2 Z-100 F100", "G1 Z50", "G0 Z-50", "M3", "G1 X20", "M5"].join("\n")); if (r.job) { const raw = r.job.lines.join("\n"); t.check("user Z moves/probes (G53, G38.2, G1 Z, G0 Z) stripped from imported file", !/G1 Z50|G0 Z-50|Z-100 F100/.test(raw.replace(/G38\.2 Z-50 F300/g, "")), r.job.lines.filter((l) => /Z-100|Z50|Z-50/.test(l)).join("|"), "IMPORT-FILTER"); } }
safe("empty file", ""); safe("only comments", "(hello)\n; hi\n%"); safe("garbage text", "lorem ipsum \x00\x01 <script>alert(1)</script> M3 M5");
safe("no M3 (rejected)", ["G0 X0 Y0", "G1 X10"].join("\n"));
safe("CRLF + lowercase", ["g21 g90", "g0 x0 y0", "m3", "g1 x10 y0", "m5", "m30"].join("\r\n"));
// dry-run
{
  const g = ["G21 G90", ...sq(10, 10, 50), ...sq(100, 10, 50), ...sq(200, 10, 50), ...sq(300, 10, 50), "M30"].join("\n");
  const r = prep(g, true); const a = analyze(r.job.lines);
  t.check("dry run: no M3 anywhere (torch can't fire)", !r.job.lines.some((l) => /^M[34]\b/.test(l.trim())) && a.m3 === 0, r.job.lines.filter((l) => /M3|M4/.test(l)).join("|"), "DRYRUN-TORCH");
  t.check("dry run: no probing/plunging moves", !r.job.lines.some((l) => /G38|G1 Z-/.test(l)));
  const net = (() => { let z = 0, abs = true; for (const l of r.job.lines) { if (/G91/.test(l)) abs = false; if (/G90/.test(l)) abs = true; const m = /G0 Z(-?[\d.]+)/.exec(l); if (m && !abs) z += +m[1]; } return z; })();
  t.check("dry run: net Z drift is zero (each M5 adds a +safe_lift Z raise but nothing lowers it again)", Math.abs(net) < 0.01, `net Z rise over 4 cuts = ${net} mm (8 mm per cut, unbounded)`, "DRYRUN-ZDRIFT");
  const real = prep(g, false); let zr = 0, abs = true; for (const l of real.job.lines) { if (/G91/.test(l)) abs = false; if (/G90/.test(l)) abs = true; let m = /G0 Z(-?[\d.]+)/.exec(l); if (m && !abs) zr += +m[1]; m = /G1 Z(-?[\d.]+)/.exec(l); if (m && !abs) zr += +m[1]; }
  t.note("real run net Z (probe moves excluded) ", zr);
}
// performance of a big file
{ const lines = ["G21 G90"]; for (let i = 0; i < 100000; i++) lines.push(`G0 X${i % 500} Y${(i * 7) % 300}`, "M3", `G1 X${(i % 500) + 1} Y${(i * 7) % 300}`, "M5"); const t0 = Date.now(); const r = prep(lines.join("\n")); const dt = Date.now() - t0; t.note("prepareJob 400k lines", `${dt}ms ${r.err || r.job.stats.pierces + " pierces"}`); t.check("prepareJob handles 400k-line file in < 10 s", dt < 10000, `${dt} ms`, "IMPORT-PERF"); }
// random line fuzzer: whatever junk is imported, the prepared job must be torch-safe
{
  const pool = ["G0", "G1", "G2", "G3", "M3", "M5", "M4", "M2", "M30", "X10", "Y-5", "X1e3", "X.5", "I5", "J-5", "G90", "G91", "G20", "G21", "G4 P1", "(c)", ";x", "M3 M5", "M5 M3", "F100", "S1000", "Z5", "$H", "X99999", "G53", "G38.2", "X", "NaN", "Infinity", "G0 X1 Y1", "G1 X5 Y5", "G2 X5 Y5 I1 J1", "%", "", "M", "G", "X-", "Y+.", "M 3", "m3", "g1 x1"];
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let bad = 0, rejected = 0, ok = 0; const examples = [];
  for (let i = 0; i < 4000; i++) {
    const n = 1 + Math.floor(rnd() * 12); const lines = []; for (let k = 0; k < n; k++) { const m = 1 + Math.floor(rnd() * 3); lines.push(Array.from({ length: m }, () => pool[Math.floor(rnd() * pool.length)]).join(rnd() < 0.5 ? " " : "")); }
    const g = lines.join("\n"); let job; try { job = A.prepareJob(g, cut, A.machine, false); } catch (e) { rejected++; if (!(e instanceof A.JobError)) { bad++; examples.push("THROW " + e.message + " :: " + JSON.stringify(g)); } continue; }
    ok++; const a = analyze(job.lines);
    const v = a.violations.filter((x) => ["torch-left-on-at-end", "non-finite-token", "non-finite-value", "double-M3", "m3-m5-imbalance"].includes(x.type));
    const last = (() => { let abs = true; for (const l of job.lines) { if (/G91/.test(l)) abs = false; if (/G90/.test(l)) abs = true; } return abs; })();
    if (v.length || !last) { bad++; if (examples.length < 5) examples.push(JSON.stringify(v[0] || "ends-in-G91") + " :: " + JSON.stringify(g)); }
  }
  t.note("random-file fuzz", `ok=${ok} rejected=${rejected} bad=${bad}`);
  t.check("random G-code fuzz (4000 files): prepared job never leaves torch on / relative mode / NaN", bad === 0, examples.slice(0, 3).join(" ## "), "GCODE-SAFETY");
}
process.exit(t.done() ? 1 : 0);

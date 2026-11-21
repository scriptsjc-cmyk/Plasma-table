#!/usr/bin/env node
// The deploy gate (run by .github/workflows/pages.yml before Pages deploys). Runs every unit suite, the safety and fit
// end-to-end suites. Fails if any check fails that is not listed in known-failures.txt, or if a suite crashes.
// An end-to-end suite that fails is run once more (Chrome timing on a busy runner); the second run must be clean.
//   node ci-gate.mjs            (from tests/, after npm ci)
import { spawn } from "node:child_process"; import fs from "node:fs"; import path from "node:path";
const root = new URL("./", import.meta.url).pathname;
const E2E = ["20_demo_job_safety", "22_stop_overlay", "70_laptop_cut", "74_r7_cut", "96_fits_screen", "110_r11_setup", "111_r13_transitions", "112_r15_safety", "92_r9_chrome", "113_r15_fits", "120_every_tool", "121_features", "122_loose_holes"];
const known = new Set(fs.readFileSync(path.join(root, "known-failures.txt"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
const unit = fs.readdirSync(path.join(root, "unit")).filter((f) => /^\d+_.*\.mjs$/.test(f)).sort().map((f) => "unit/" + f.replace(/\.mjs$/, ""));
const suites = [...unit, ...E2E.map((n) => "e2e/" + n)];
const run = (s) => new Promise((resolve) => {
  let out = ""; const p = spawn("node", [s + ".mjs"], { cwd: root, env: process.env });
  const kill = setTimeout(() => { out += "\nTIMEOUT\n"; p.kill("SIGKILL"); }, 900000);
  p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => {
    clearTimeout(kill);
    const summary = [...out.matchAll(/^\s*\S+: (\d+)\/(\d+) passed, (\d+) failed/gm)].pop();
    const fails = out.split("\n").filter((l) => /^\s*FAIL /.test(l)).map((l) => s + ": " + l.replace(/^\s*FAIL\s+/, "").split(" — ")[0].split("  -> ")[0].trim());
    const detail = Object.fromEntries(out.split("\n").filter((l) => /^\s*FAIL /.test(l)).map((l) => { const t = l.replace(/^\s*FAIL\s+/, ""); return [s + ": " + t.split(" — ")[0].split("  -> ")[0].trim(), t.slice(0, 400)]; }));
    resolve({ s, code, summary, fails, detail, out });
  });
});
const unexpected = (x) => !x.summary || x.fails.some((f) => !known.has(f));
const JOBS = Math.max(1, Number(process.env.JOBS) || 2);
const queue = [...suites], results = [];
await Promise.all(Array.from({ length: JOBS }, async () => { while (queue.length) {
  const s = queue.shift(); let r = await run(s);
  if (unexpected(r) && s.startsWith("e2e/")) { console.log(`retry ${s}`); r = await run(s); r.retried = true; }
  results.push(r);
  const bad = unexpected(r);
  console.log(`${bad ? "BLOCK" : "ok   "} ${s.padEnd(34)} ${r.summary ? r.summary[1] + "/" + r.summary[2] : "crashed / no summary"}${r.retried ? " (2nd run)" : ""}${r.fails.length ? "  known-fail: " + r.fails.filter((f) => known.has(f)).length : ""}`);
  if (bad) console.log((r.summary ? r.fails.filter((f) => !known.has(f)).map((f) => r.detail[f] || f) : [r.out.split("\n").slice(-15).join("\n")]).map((f) => "    " + f).join("\n"));
} }));
const blocked = results.filter(unexpected);
const stale = [...known].filter((k) => !results.some((r) => r.fails.includes(k)));
if (stale.length) console.log("\nknown failures that now pass (remove them from known-failures.txt):\n  " + stale.join("\n  "));
console.log(`\n${blocked.length ? "GATE FAILED: " + blocked.map((r) => r.s).join(", ") : "GATE PASSED"} (${results.length} suites)`);
process.exit(blocked.length ? 1 : 0);

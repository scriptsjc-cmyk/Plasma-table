#!/usr/bin/env node
// The one test command.   npm test            (from tests/)   everything: unit, then e2e
//   node run-all.mjs unit | e2e                only that group
//   node run-all.mjs 20 55 03                  only suites whose number matches (unit/03_*, e2e/20_*, ...)
//   JOBS=3 node run-all.mjs                    run 3 suites at once (default 2; each opens its own Chrome)
//   SITE_DIR=/path/to/copy node run-all.mjs    test another copy of the site (default: the repo root)
// Every suite prints a last line "<name>: <passed>/<total> passed, <failed> failed" and exits non-zero on a failure or crash.
// Logs: tests/results/<name>.log. Screenshots: tests/screenshots/ (git-ignored). Needs: node, google-chrome, python3, `npm install` once.
import { spawn } from "node:child_process"; import fs from "node:fs"; import path from "node:path";
const root = new URL("./", import.meta.url).pathname;
const args = process.argv.slice(2), groups = args.filter((a) => a === "unit" || a === "e2e"), nums = args.filter((a) => /^\d+$/.test(a));
const suites = [];
for (const g of ["unit", "e2e"]) {
  if (groups.length && !groups.includes(g)) continue;
  for (const f of fs.readdirSync(path.join(root, g)).sort()) {
    const m = f.match(/^(\d+)_.*\.mjs$/); if (!m) continue;                      // helpers start with "_" and are not suites
    if (nums.length && !nums.includes(m[1])) continue;
    suites.push({ group: g, file: `${g}/${f}`, name: f.replace(/\.mjs$/, "") });
  }
}
if (!suites.length) { console.error("no suites match", args.join(" ")); process.exit(2); }
fs.mkdirSync(path.join(root, "results"), { recursive: true });
const JOBS = Math.max(1, Number(process.env.JOBS) || 2);
const run = (s) => new Promise((resolve) => {
  const t0 = Date.now(); let out = "";
  const p = spawn("node", [s.file], { cwd: root, env: process.env });
  const kill = setTimeout(() => { out += "\nTIMEOUT after 900 s\n"; p.kill("SIGKILL"); }, 900000);
  p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => {
    clearTimeout(kill);
    const clean = out.split("\n").filter((l) => !/dbus|pid=/.test(l)).join("\n");
    fs.writeFileSync(path.join(root, "results", s.name + ".log"), clean);
    const m = [...clean.matchAll(/^\s*\S+: (\d+)\/(\d+) passed, (\d+) failed/gm)].pop();
    const r = { ...s, code, secs: Math.round((Date.now() - t0) / 1000), pass: m ? +m[1] : 0, total: m ? +m[2] : 0, fail: m ? +m[3] : 0, crashed: !m };
    const bad = r.crashed || r.fail > 0 || code !== 0;
    console.log(`${bad ? "FAIL" : "ok  "} ${s.name.padEnd(28)} ${m ? `${r.pass}/${r.total}` : "no summary line (crashed?)"}  ${r.secs}s${bad ? "   -> tests/results/" + s.name + ".log" : ""}`);
    if (bad) console.log(clean.split("\n").filter((l) => /^\s*FAIL/.test(l)).slice(0, 8).join("\n"));
    resolve(r);
  });
});
const results = []; const queue = [...suites];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => { while (queue.length) results.push(await run(queue.shift())); }));
const sum = (k) => results.reduce((a, r) => a + r[k], 0), bad = results.filter((r) => r.crashed || r.fail > 0 || r.code !== 0);
console.log(`\nTOTAL ${sum("pass")}/${sum("total")} checks passed in ${results.length} suites; ${bad.length ? "FAILED: " + bad.map((r) => r.name).join(", ") : "all green"}`);
process.exit(bad.length ? 1 : 0);

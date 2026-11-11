// Tiny test recorder. Every check is recorded; failures carry a finding id so REPORT.md can reference them.
import { writeFileSync, mkdirSync } from "node:fs";
export class T {
  constructor(suite) { this.suite = suite; this.rows = []; this.t0 = Date.now(); }
  check(name, cond, detail = "", id = "") {
    const pass = !!cond; if (process.env.TRACE) console.error("  .. " + name);
    this.rows.push({ name, pass, detail: String(detail ?? ""), id });
    if (!pass) console.log(`  FAIL ${id ? "[" + id + "] " : ""}${name}${detail ? " — " + String(detail).slice(0, 300) : ""}`);
    return pass;
  }
  // A check that exposes a REAL app bug we are not allowed to fix in this change set: it is reported as KNOWN (not counted as a failure) while it fails,
  // and as "now passes" (so the marker can be removed) once the app is fixed. `bug` is the id in tests/KNOWN-BUGS.md.
  known(name, cond, bug, detail = "") {
    const pass = !!cond; this.rows.push({ name, pass: true, known: !pass, bug, detail: String(detail ?? "") });
    console.log(pass ? `  note KNOWN-BUG ${bug} now PASSES — remove the known() marker: ${name}` : `  KNOWN ${bug}: ${name}${detail ? " — " + String(detail).slice(0, 240) : ""}`);
    return pass;
  }
  note(name, detail) { this.rows.push({ name, pass: true, info: true, detail: String(detail) }); console.log(`  note ${name}: ${String(detail).slice(0, 300)}`); }
  done() {
    const f = this.rows.filter((r) => !r.pass), n = this.rows.filter((r) => !r.info).length;
    const kn = this.rows.filter((r) => r.known).length;
    console.log(`${this.suite}: ${n - f.length - kn}/${n} passed, ${f.length} failed${kn ? `, ${kn} known app bug(s) (see tests/KNOWN-BUGS.md)` : ""}`);
    mkdirSync(new URL("../results/", import.meta.url), { recursive: true });
    writeFileSync(new URL(`../results/${this.suite}.json`, import.meta.url), JSON.stringify({ suite: this.suite, rows: this.rows }, null, 1));
    return f.length;
  }
}

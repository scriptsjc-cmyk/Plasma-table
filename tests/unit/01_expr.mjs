import { mod, readJs, allJsText, jsPath } from "../lib/site.mjs";
import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs";
const A = await load(); const t = new T("01_expr");
const good = [["100/2", 50], ["50+12.5", 62.5], ["(30+10)/2", 20], ["25*4", 100], ["80-5", 75], ["12,5", 12.5], [" 100 / 2 ", 50], ["100÷4", 25], ["3×7", 21], ["-5", -5], ["+5", 5], [".5", 0.5], ["5.", 5], ["((2))", 2], ["2*(3+4)", 14], ["007", 7]];
for (const [s, v] of good) { const r = A.evalExpr(s); t.check(`valid '${s}' = ${v}`, r === v, `got ${r}`); }
const bad = ["100/0", "0/0", "1e9", "1E5", "2+", "+", "*3", "", "   ", "abc", "alert(1)", "2**3", "1//2", "(1", "1)", "()", "--5", "5--5", "++5", "1 2", "0x10", "1_000", "Infinity", "NaN", "2(3)", "(2)(3)", "1;2", "1,2,3", "5%2", "1/*x*/2", "\n", "9".repeat(400), "1+".repeat(50000), "(".repeat(5000) + "1" + ")".repeat(5000), "constructor", "this", "`1`", "1..2", "1.2.3"];
for (const s of bad) {
  let r, ex = null; const t0 = Date.now();
  try { r = A.evalExpr(s); } catch (e) { ex = e; }
  t.check(`rejects/neutral '${String(s).slice(0, 30)}${String(s).length > 30 ? "…(" + String(s).length + ")" : ""}'`, !ex && (Number.isNaN(r) || r === undefined), ex ? "THREW " + ex.message : `got ${r}`);
  t.check(`fast '${String(s).slice(0, 20)}'`, Date.now() - t0 < 500, `${Date.now() - t0}ms`);
}
// very long numerics: finite but absurd
t.note("'9'*400", A.evalExpr("9".repeat(400)));
t.note("'99999999' (8 digits)", A.evalExpr("99999999"));
t.note("'0.0001'", A.evalExpr("0.0001"));
t.check("number-like very long returns NaN (Infinity)", Number.isNaN(A.evalExpr("9".repeat(400))));
t.check("no max clamp in evalExpr (documented: caller must clamp) — 99999999 accepted", A.evalExpr("99999999") === 99999999, "", "INFO");
// source scan: Function / eval use
import { readFileSync } from "node:fs";
const src = readJs("expr");
t.check("expr.js uses Function() constructor (eval-equivalent) — guarded by whitelist regex", !/Function\(/.test(src), "expr.js line 8: Function(`return (${s})`) — safe today only because of /^[-+*/().\\d]+$/ whitelist; breaks under CSP without 'unsafe-eval'", "SEC-EVAL");
process.exit(t.done() ? 1 : 0);

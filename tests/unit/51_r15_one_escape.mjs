// r15 8.3: one HTML-escape helper (core/dom.js `esc`) instead of five copies plus an inline one. The 7.9 lint (unit 48)
// checks it is used; this checks there is only one, that it escapes all five characters, and that the account dialogs'
// wrapper keeps its rule (null / undefined show as nothing).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { T } from "../lib/t.mjs";

const t = new T("51_r15_one_escape");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../js"), files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p); } })(root);
const impl = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\.replace\(\s*\/\[&<>[^\]]*\]\/g/g)) impl.push(`${path.relative(root, f)}:${src.slice(0, m.index).split("\n").length}`);
}
t.check("exactly one HTML-escape implementation in js/ (core/dom.js)", impl.length === 1 && impl[0].startsWith("core/dom.js:"), impl.join(", "));
globalThis.document = globalThis.document || { getElementById: () => null, querySelectorAll: () => [] };
const { esc } = await import("../../js/core/dom.js");
t.check("esc escapes & < > \" '", esc(`a&b<c>d"e'f`) === "a&amp;b&lt;c&gt;d&quot;e&#39;f", esc(`a&b<c>d"e'f`));
const U = await import("../../js/account/uibase.js");
t.check("the account dialogs' esc shows null / undefined as nothing and escapes like core", U.esc(null) === "" && U.esc(undefined) === "" && U.esc("<b>") === "&lt;b&gt;", JSON.stringify([U.esc(null), U.esc(undefined), U.esc("<b>")]));
process.exit(t.done() ? 1 : 0);

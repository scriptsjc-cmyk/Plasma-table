// r15 7.9: escape-in-innerHTML lint. Text that can come from a person or the database (names, labels, titles, notes,
// messages, errors, file names, material names) must go through an escape helper (esc / H.esc / escapeHtml) before it
// is put into innerHTML, outerHTML or insertAdjacentHTML. The check reads every such sink in js/, looks at each ${...}
// in its template (string literals and ternary tests aside, escaped calls removed) and fails on a raw text field.
// It cannot follow HTML built in a variable or helper first; those are escaped by hand where they are built.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { T } from "../lib/t.mjs";

const t = new T("48_r15_html_escape");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../js"), files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p); } })(root);
const SINK = /(innerHTML\s*\+?=|outerHTML\s*=|insertAdjacentHTML\s*\(\s*["'][a-z]+["']\s*,)\s*/g;
// read one JS expression starting at i (template literal aware), up to ; or newline-at-depth-0 or closing paren of the call
function interps(src, i) {
  const out = []; let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "`") { // template
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { let d = 1, j = i + 2; while (j < src.length && d) { if (src[j] === "{") d++; else if (src[j] === "}") d--; j++; } out.push(src.slice(i + 2, j - 1).trim()); i = j; continue; }
        i++;
      }
      continue;
    }
    if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; } continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") { if (depth === 0) break; depth--; }
    if ((c === ";" ) && depth === 0) break;
  }
  return out;
}
const ESCCALL = /\b(?:\w+\.)?(esc|escapeHtml|escHtml|htmlEsc)\w*\s*\(/g;
function stripEsc(e) {
  let out = "", i = 0; ESCCALL.lastIndex = 0; let m;
  while ((m = ESCCALL.exec(e))) { out += e.slice(i, m.index); let d = 1, j = m.index + m[0].length; while (j < e.length && d) { if (e[j] === "(") d++; else if (e[j] === ")") d--; j++; } out += "ESC()"; i = j; ESCCALL.lastIndex = j; }
  return out + e.slice(i);
}
function codeOnly(e) { // drop string literals; keep only the ${} code of nested templates
  let out = "";
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === "'" || c === '"') { const q = c; i++; while (i < e.length && e[i] !== q) { if (e[i] === "\\") i++; i++; } out += '""'; continue; }
    if (c === "`") { i++; while (i < e.length && e[i] !== "`") { if (e[i] === "\\") { i += 2; continue; } if (e[i] === "$" && e[i + 1] === "{") { let d = 1, j = i + 2; while (j < e.length && d) { if (e[j] === "{") d++; else if (e[j] === "}") d--; j++; } out += " (" + codeOnly(e.slice(i + 2, j - 1)) + ") "; i = j; continue; } i++; } continue; }
    out += c;
  }
  return out;
}
function stripTests(e) { // drop ternary tests:  test ? a : b  -> a : b  (top level only, approximate)
  return e.replace(/^[^?`]*\?(?!\?|\.)/, "");
}
const TEXT = /(?:^|[^\w.])(?:mat|material|name|label|title|msg|message|note|text|email|filename|fileName|err|error)\b(?!\s*[(:])|\.(name|label|title|msg|message|err|error|note|notes|text|email|units|desc|description|filename|fileName)\b(?!\s*\()/;
let sinks = 0, interpCount = 0;
const raw = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8"); let m; SINK.lastIndex = 0;
  while ((m = SINK.exec(src))) {
    sinks++;
    for (const e of interps(src, m.index + m[0].length)) {
      interpCount++;
      if (TEXT.test(stripTests(codeOnly(stripEsc(e))))) raw.push(`${path.relative(root, f)}:${src.slice(0, m.index).split("\n").length} \${${e.slice(0, 50)}}`);
    }
  }
}
t.check(`the lint finds the HTML sinks (${sinks} sinks, ${interpCount} interpolations)`, sinks >= 100 && interpCount >= 200, `${sinks} / ${interpCount}`);
t.check("no raw text field is put into HTML without an escape", raw.length === 0, raw.join("; "));
// the lint itself: a raw name is caught, an escaped one and a literal ternary are not
const probe = (e) => TEXT.test(stripTests(codeOnly(stripEsc(e))));
t.check("lint self-test: raw p.name, label and e.message are caught", probe("p.name") && probe("label") && probe("e.message") && probe("a.label.toLowerCase()"));
t.check("lint self-test: esc(p.name), H.esc(o.name), a literal ternary and a title= literal pass", !probe("esc(p.name)") && !probe("H.esc(o.name)") && !probe('on ? "sel" : ""') && !probe(`m.practice ? "disabled title='x'" : ""`));
process.exit(t.done() ? 1 : 0);

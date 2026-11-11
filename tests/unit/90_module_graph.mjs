// Structure checks for js/: the folders stay organised as the app grows.
//   * every module has a header comment saying what it is for
//   * module file names are unique across folders (tests and docs find modules by name)
//   * every relative import resolves to a real file, and nothing imports a missing name that the target does not export
//   * no circular imports (late calls go through js/core/hooks.js instead)
//   * no orphan module: everything is reachable from index.html (js/app.js, js/sw-register.js)
//   * core/ is the bottom layer: it imports nothing from the other folders
import fs from "node:fs"; import path from "node:path";
import { SITE, jsRel } from "../lib/site.mjs"; import { T } from "../lib/t.mjs";
const t = new T("90_module_graph");
const files = jsRel(); const text = Object.fromEntries(files.map((f) => [f, fs.readFileSync(SITE + f, "utf8")]));
// 1. header comment
for (const f of files) { const first = text[f].split("\n").find((l) => l.trim()); t.check(`${f}: starts with a comment saying what it is`, /^\s*(\/\/|\/\*)/.test(first || ""), (first || "").slice(0, 60)); }
// 2. unique names
const byName = {}; for (const f of files) (byName[path.basename(f)] ||= []).push(f);
for (const [n, fs2] of Object.entries(byName)) t.check(`file name ${n} is unique`, fs2.length === 1, fs2.join(", "));
// 3. imports resolve, named imports exist
const IMPORT = /(?:^|\n)\s*(import|export)\s+([^;]*?)\s*from\s*["'](\.[^"']+)["']/g;
const declNames = (s, from) => {                     // "export const a = 1, b = [2, 3];"  ->  a, b   (top-level commas only)
  const names = []; let depth = 0, expectName = true, i = from, word = "";
  for (; i < s.length; i++) { const c = s[i];
    if ("([{".includes(c)) depth++; else if (")]}".includes(c)) depth--; else if (c === ";" && depth === 0) break; else if (c === "\n" && depth === 0 && !expectName && /^\s*(export|function|const|let|class|async|\/\/)/.test(s.slice(i + 1, i + 16))) break;
    if (depth === 0 && c === "," ) { expectName = true; word = ""; continue; }
    if (expectName) { if (/[\w$]/.test(c)) word += c; else if (word && /\s|=/.test(c)) { names.push(word); word = ""; expectName = false; } } }
  return names; };
const exportsOf = (f) => { const s = text[f], out = new Set(); let m;
  for (m of s.matchAll(/(?:^|\n)export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (m of s.matchAll(/(?:^|\n)export\s+(?:const|let|var)\s+/g)) declNames(s, m.index + m[0].length).forEach((n) => out.add(n));
  for (m of s.matchAll(/(?:^|\n)export\s*\{([^}]*)\}/g)) m[1].split(",").forEach((x) => { const n = x.trim().split(/\s+as\s+/).pop().trim(); if (n) out.add(n); });
  return out; };
const edges = {}; const reexportAll = new Set();
for (const f of files) { edges[f] = new Set(); let m; IMPORT.lastIndex = 0;
  while ((m = IMPORT.exec(text[f]))) { const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[3]));
    if (!files.includes(target)) { t.check(`${f}: import "${m[3]}" resolves`, false, target); continue; }
    edges[f].add(target);
    const braces = m[2].match(/\{([^}]*)\}/); if (braces && !/^\s*export\s+\*/.test(m[0])) { const ex = exportsOf(target);
      for (const spec of braces[1].split(",").map((x) => x.trim()).filter(Boolean)) { const name = spec.split(/\s+as\s+/)[0].trim(); if (!ex.has(name)) t.check(`${f}: ${target} exports ${name}`, false, ""); } } } }
t.check("every relative import resolves to a module", true);
// 4. cycles
const color = {}; const cycles = []; const stack = [];
const dfs = (f) => { color[f] = 1; stack.push(f); for (const g of edges[f]) { if (color[g] === 1) cycles.push([...stack.slice(stack.indexOf(g)), g].join(" -> ")); else if (!color[g]) dfs(g); } stack.pop(); color[f] = 2; };
for (const f of files) if (!color[f]) dfs(f);
t.check("no circular imports", cycles.length === 0, [...new Set(cycles)].join(" | "));
// 5. orphans
const html = fs.readFileSync(SITE + "index.html", "utf8");
const roots = [...html.matchAll(/<script[^>]*src="(js\/[^"]+)"/g)].map((m) => m[1]);
const seen = new Set(); const walk = (f) => { if (seen.has(f)) return; seen.add(f); (edges[f] || []).forEach(walk); }; roots.forEach(walk);
for (const f of files) t.check(`${f} is used (reachable from index.html)`, seen.has(f), "");
// 6. core is the bottom layer
for (const f of files.filter((x) => x.startsWith("js/core/"))) t.check(`${f} imports only from core/`, [...edges[f]].every((g) => g.startsWith("js/core/")), [...edges[f]].join(", "));
process.exit(t.done() ? 1 : 0);

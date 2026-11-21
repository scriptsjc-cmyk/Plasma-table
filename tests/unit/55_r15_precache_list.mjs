// r15 Round 8 (pre-existing failure e2e/59 "30"): the committed sw.js precache list had drifted from the files
// (16 modules missing, so an offline reload in a local test came up without the app). The deploy re-stamps it,
// but the committed copy must agree too. This unit runs in the gate, so a new file can't slip past again.
import fs from "node:fs";
import path from "node:path";
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const t = new T("55_r15_precache_list");
const sw = fs.readFileSync(SITE + "sw.js", "utf8");
const block = sw.match(/\/\* precache:start \*\/([\s\S]*?)\/\* precache:end \*\//)?.[1] || "";
const list = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const walk = (dir, ext) => fs.existsSync(SITE + dir) ? fs.readdirSync(SITE + dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(dir + "/" + e.name, ext) : (e.name.endsWith(ext) ? [dir + "/" + e.name] : [])) : [];
const want = [...walk("js", ".js"), ...walk("css", ".css"), ...walk("html", ".html"), ...walk("fonts", ".woff2")];
const missing = want.filter((f) => !list.includes(f));
const gone = list.filter((f) => f !== "./" && !fs.existsSync(path.join(SITE, f)));
t.check("every js / css / html / font file is in the committed sw.js precache list", missing.length === 0, missing.join(", "));
t.check("every precache entry exists on disk", gone.length === 0, gone.join(", "));
process.exit(t.done() ? 1 : 0);

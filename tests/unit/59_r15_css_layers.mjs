// r15 8.1: the stylesheets use CSS cascade layers. tokens.css (the first file) declares the order "@layer tokens, app;".
// The design tokens sit in the lower "tokens" layer; every other linked stylesheet wraps all of its rules in the shared
// "app" layer. Blocks of one layer keep their link order, so the cascade is exactly what it was unlayered: no computed
// style changes (tools/style-diff.mjs, 54/54 identical; pixels identical). One layer per file was measured and rejected:
// layering turns cross-file specificity and !important wins around (hundreds of computed styles change), see DEV-STATUS.
// New rules that should sit above or below the app (a reset, a vendor sheet, an override) get their own named layer.
import fs from "node:fs";
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const t = new T("59_r15_css_layers");
const index = fs.readFileSync(SITE + "index.html", "utf8");
const links = [...index.matchAll(/<link rel="stylesheet" href="(css\/[^"]+\.css)">/g)].map((m) => m[1]);
t.check("index.html links tokens.css first", links[0] === "css/tokens.css", links.join(", "));
const layerOf = (f) => (f === "css/tokens.css" ? "tokens" : "app");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").trim();
const tokens = strip(fs.readFileSync(SITE + "css/tokens.css", "utf8"));
const order = (tokens.match(/^@layer ([^;{]+);/) || [])[1];
t.check("tokens.css opens with the layer order: tokens, app", !!order && order.split(",").map((x) => x.trim()).join(",") === "tokens,app", String(order));
for (const f of links) {
  let src = strip(fs.readFileSync(SITE + f, "utf8"));
  if (f === "css/tokens.css") src = src.replace(/^@layer [^;{]+;\s*/, "").replace(/^(@font-face\s*\{[^}]*\}\s*)+/, "");   // @font-face can't be layered
  const m = src.match(new RegExp(`^@layer ${layerOf(f)} \\{([\\s\\S]*)\\}$`));
  let depth = 0, ok = !!m;
  if (m) for (const ch of m[1]) { depth += (ch === "{") - (ch === "}"); if (depth < 0) { ok = false; break; } }
  t.check(`${f}: every rule is inside @layer ${layerOf(f)}`, ok && depth === 0);
  t.check(`${f}: no other layer is opened inside it`, !m || !/@layer\b/.test(m[1]));
}
process.exit(t.done() ? 1 : 0);

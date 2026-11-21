// r15 8.1: the stylesheets use CSS cascade layers. tokens.css (the first file) names one layer per stylesheet in the
// order index.html links them, and each file's rules sit inside its own layer, so which file wins is written down instead
// of depending on link order alone. Moving the rules into layers must not change any computed style (checked with
// tools/style-diff.mjs, file by file; see DEV-STATUS).
import fs from "node:fs";
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const t = new T("59_r15_css_layers");
const index = fs.readFileSync(SITE + "index.html", "utf8");
const links = [...index.matchAll(/<link rel="stylesheet" href="(css\/[^"]+\.css)">/g)].map((m) => m[1]);
const layerOf = (f) => f.replace(/^css\//, "").replace(/\.css$/, "").replace(/^screen-/, "");
const want = links.map(layerOf);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").trim();
const tokens = strip(fs.readFileSync(SITE + "css/tokens.css", "utf8"));
const order = (tokens.match(/^@layer ([^;{]+);/) || [])[1];
t.check("tokens.css opens with the layer order, one layer per linked stylesheet in link order",
  !!order && order.split(",").map((x) => x.trim()).join(",") === want.join(","), `${order} vs ${want.join(", ")}`);
for (const f of links) {
  let src = strip(fs.readFileSync(SITE + f, "utf8"));
  if (f === "css/tokens.css") src = src.replace(/^@layer [^;{]+;\s*/, "").replace(/^(@font-face\s*\{[^}]*\}\s*)+/, "");   // @font-face can't be layered
  const m = src.match(new RegExp(`^@layer ${layerOf(f)} \\{([\\s\\S]*)\\}$`));
  let depth = 0, ok = !!m;
  if (m) for (const ch of m[1]) { depth += (ch === "{") - (ch === "}"); if (depth < 0) { ok = false; break; } }
  t.check(`${f}: every rule is inside @layer ${layerOf(f)}`, ok && depth === 0);
}
process.exit(t.done() ? 1 : 0);

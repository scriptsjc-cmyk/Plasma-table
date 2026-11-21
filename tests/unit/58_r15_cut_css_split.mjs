// r15 8.1: screen-cut.css (3,258 lines) is split into the cut chrome plus Part, Run and Setup files. The split keeps
// every rule in the same order (the files are linked one after another), so the cascade, and the screen, are unchanged.
import fs from "node:fs";
import crypto from "node:crypto";
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const t = new T("58_r15_cut_css_split");
const FILES = ["css/screen-cut.css", "css/screen-cut-part.css", "css/screen-cut-run.css", "css/screen-cut-setup.css"];
const BEFORE = "53b0d87ff91f1f355e948962e70ccaab3de92cd3";   // the rules of screen-cut.css before the split (comments and spacing ignored)
const index = fs.readFileSync(SITE + "index.html", "utf8");
const links = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const at = links.indexOf(FILES[0]);
t.check("the four cut stylesheets are linked together, in order", at >= 0 && FILES.every((f, i) => links[at + i] === f), links.join(" "));
const have = FILES.filter((f) => fs.existsSync(SITE + f));
t.check("all four files exist", have.length === 4, have.join(", "));
const rules = have.map((f) => fs.readFileSync(SITE + f, "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
t.check("together they hold exactly the rules screen-cut.css had, in the same order", crypto.createHash("sha1").update(rules).digest("hex") === BEFORE);
for (const f of have) { const n = fs.readFileSync(SITE + f, "utf8").split("\n").length; t.check(`${f} is under 2,000 lines`, n < 2000, n + " lines"); }
process.exit(t.done() ? 1 : 0);

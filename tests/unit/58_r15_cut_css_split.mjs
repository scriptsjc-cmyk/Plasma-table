// r15 8.1: screen-cut.css (3,258 lines) is split into the cut chrome plus Part, Run and Setup files. The split keeps
// every rule in the same order (the files are linked one after another), so the cascade, and the screen, are unchanged.
import fs from "node:fs";
import crypto from "node:crypto";
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const t = new T("58_r15_cut_css_split");
// r16 tidy: screen-cut.css is split again (laptop chrome, r11 Setup grid), linked straight after it; the rules and their order are
// unchanged, so the hash below is the same.
const FILES = ["css/screen-cut.css", "css/screen-cut-laptop.css", "css/screen-cut-setupgrid.css", "css/screen-cut-part.css", "css/screen-cut-run.css", "css/screen-cut-setup.css"];
// the rules of screen-cut.css before the split (comments and spacing ignored) was 53b0d87f…; r15 8.1's container query (the
// Download G-code icon range asked of .cutgrid's width, same declarations, style-diff identical) and the mode-switch size token (pre-existing 65) are the deliberate changes since.
// r16 Round B (Josh 22 Nov) adds the Material rules for the ANDELI card (end of screen-cut-part.css) and lets the laptop card
// show Air, Nozzle and Mode (nth-child(n+4) / (n+5)); those are the only changes, made on purpose.
const BEFORE = "0dd23415f7d7a1b35edbfaf408d16228bd7d4efd";   // was 5851b599… before r16, ec6070a1… before the floating Other… / supply notice and the two-row thickness buttons
const index = fs.readFileSync(SITE + "index.html", "utf8");
const links = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const at = links.indexOf(FILES[0]);
t.check(`the ${FILES.length} cut stylesheets are linked together, in order`, at >= 0 && FILES.every((f, i) => links[at + i] === f), links.join(" "));
const have = FILES.filter((f) => fs.existsSync(SITE + f));
t.check(`all ${FILES.length} files exist`, have.length === FILES.length, have.join(", "));
// r15 8.1 @layer: each file's rules now sit inside "@layer app { ... }"; the wrapper is set aside, the rules must still match.
const unwrap = (src) => { const s = src.replace(/\/\*[\s\S]*?\*\//g, "").trim(); const m = s.match(/^@layer app \{([\s\S]*)\}$/); return m ? m[1] : s; };
const rules = have.map((f) => unwrap(fs.readFileSync(SITE + f, "utf8"))).join("\n").replace(/\s+/g, " ").trim();
t.check("together they hold exactly the rules screen-cut.css had, in the same order", crypto.createHash("sha1").update(rules).digest("hex") === BEFORE);
for (const f of have) { const n = fs.readFileSync(SITE + f, "utf8").split("\n").length; t.check(`${f} is under 2,000 lines`, n < 2000, n + " lines"); }
process.exit(t.done() ? 1 : 0);

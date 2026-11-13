// r9 item 1: unused exports are gone, and the app is split by main-menu area
// into HTML partials + CSS files that load on GitHub Pages with no build step.
import fs from "node:fs";
import { SITE, readJs } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const t = new T("91_r9_split");
const ck = (n, ok, i) => t.check(n, ok, typeof i === "string" ? i : (i != null ? JSON.stringify(i) : ""));

const html = (rel) => fs.readFileSync(SITE + rel, "utf8");
const index = html("index.html");
const allHtml = [index, ...["html/make.html", "html/cut.html", "html/parts.html", "html/setup.html"].map(html)].join("\n");
const sw = html("sw.js");
const boot = html("js/boot.js");
const stamp = html("scripts/stamp-version.sh");

const UNUSED = [
  ["safeDlgOpen", "safeprompt"],
  ["isAdvanced", "mode"],
  ["SNAP_KINDS", "snaps"],
  ["isItemHidden", "layers"],
  ["toolbarCustomOpen", "toolbarcustom"],
  ["getState", "cutfeatures-ui"],
  ["applyUnits", "settings"],
];
for (const [name, file] of UNUSED) {
  const src = readJs(file);
  ck(`${name} is no longer exported from ${file}`, !new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${name}\\b|const\\s+${name}\\b)`).test(src));
}

for (const f of ["html/make.html", "html/cut.html", "html/parts.html", "html/setup.html", "css/screen-parts.css", "css/screen-setup.css", "js/boot.js"]) {
  ck(`${f} exists`, fs.existsSync(SITE + f));
}

ck("index.html loads boot.js, not app.js directly", /src="js\/boot.js"/.test(index) && !/<script type="module" src="js\/app.js">/.test(index));
ck("index.html links the area stylesheets", /href="css\/screen-make.css"/.test(index) && /href="css\/screen-cut.css"/.test(index) && /href="css\/screen-parts.css"/.test(index) && /href="css\/screen-setup.css"/.test(index));
ck("boot.js fetches the four HTML partials", /html\/make\.html/.test(boot) && /html\/cut\.html/.test(boot) && /html\/parts\.html/.test(boot) && /html\/setup\.html/.test(boot));
ck("boot.js starts the app after the partials load", /await loadPartials\(\)/.test(boot) && /import\("\.\/app\.js"\)/.test(boot));

const ids = {
  "html/make.html": ["makeBar", "srcShape", "bgPick", "shapeLib"],
  "html/cut.html": ["stepper", "pickPane", "btnStart"],
  "html/setup.html": ["setupView", "wizard"],
  "html/parts.html": ["partsDlg", "partsList"],
};
for (const [file, want] of Object.entries(ids)) {
  const src = html(file);
  for (const id of want) ck(`${file} has #${id}`, new RegExp(`id="${id}"`).test(src));
}

const shared = ["btnStop", "connPill", "preview", "menuView", "cutView", "guideHead"];
for (const id of shared) ck(`shell keeps shared #${id}`, new RegExp(`id="${id}"`).test(index));
ck("E-STOP is still in the shared header, not in an area partial", /id="btnStop"/.test(index) && !/id="btnStop"/.test(html("html/make.html") + html("html/cut.html") + html("html/setup.html") + html("html/parts.html")));

ck("stamp-version.sh precaches html/ partials", /find html -type f -name '\*\.html'/.test(stamp));
for (const f of ["html/make.html", "html/cut.html", "html/parts.html", "html/setup.html", "css/screen-parts.css", "css/screen-setup.css", "js/boot.js"]) {
  ck(`sw.js precache lists ${f}`, sw.includes(`"${f}"`));
}
ck("service worker treats html/ files as required (offline install fails closed)", /html/.test(sw.match(/const isRequired[\s\S]*?;/)?.[0] || ""));

process.exit(t.done() ? 1 : 0);

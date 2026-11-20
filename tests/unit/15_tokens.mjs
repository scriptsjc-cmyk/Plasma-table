// Safety contrast tokens: alarm and warning text stay dark in light theme and light in dark theme.
import fs from "node:fs";
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";

const t = new T("15_tokens");
const ck = (n, ok, i) => t.check(n, ok, typeof i === "string" ? i : (i != null ? JSON.stringify(i) : ""));

const css = fs.readFileSync(SITE + "css/tokens.css", "utf8");
const light = css.split(/\[data-theme="dark"\]/)[0];
const dark = css.split(/\[data-theme="dark"\]/)[1] || "";

const varOf = (block, name) => {
  const m = block.match(new RegExp("--" + name + ":\\s*([^;]+)"));
  return m ? m[1].trim() : "";
};

ck("light theme alarm text is the dark red #7A1A12", varOf(light, "alarm-text").toUpperCase() === "#7A1A12");
ck("light theme warning text is the dark amber #7A3200", varOf(light, "warn-text").toUpperCase() === "#7A3200");
ck("dark theme alarm text is the light pink #FFD5D1", varOf(dark, "alarm-text").toUpperCase() === "#FFD5D1");
ck("dark theme warning text is the light amber #FFE3B0", varOf(dark, "warn-text").toUpperCase() === "#FFE3B0");
ck("dark theme go / on-go keep a dark label on the bright green", varOf(dark, "go").toUpperCase() === "#3DDC82" && varOf(dark, "on-go").toUpperCase() === "#05210E");

const layout = fs.readFileSync(SITE + "css/layout.css", "utf8") + fs.readFileSync(SITE + "css/screen-cut.css", "utf8");
ck("alarm and warning banners use the text tokens, not leftover hex", /\.banner\.red[^}]*color:\s*var\(--alarm-text\)/.test(layout) && /\.banner\.amber[^}]*color:\s*var\(--warn-text\)/.test(layout) && !/#7A1A12|#7A3B00/.test(layout));

// r13 section 3: every font size comes from a token (relative em sizes are allowed; only tokens.css holds px values).
const cssDir = SITE + "css/";
const others = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css") && f !== "tokens.css");
const rawFont = [];
for (const f of others) fs.readFileSync(cssDir + f, "utf8").split("\n").forEach((ln, i) => { if (/font-size:\s*[0-9.]+(px|rem)\b/.test(ln)) rawFont.push(f + ":" + (i + 1)); });
ck("no px or rem font sizes outside tokens.css (use --fs-xs/s/m/l/xl or a named STOP / readout token)", rawFont.length === 0, rawFont.slice(0, 10).join(", "));
ck("the type scale is five sizes: xs 12, s 13, m 15, l 18, xl 24", ["xs:12px", "s:13px", "m:15px", "l:18px", "xl:24px"].every((p) => { const [k, v] = p.split(":"); return varOf(light, "fs-" + k) === v; }));

// r13 section 3: colours and layers come from tokens.css too.
const rawHex = [], rawZ = [];
for (const f of others) fs.readFileSync(cssDir + f, "utf8").split("\n").forEach((ln, i) => {
  if (/#[0-9a-fA-F]{3,8}\b(?![-\w])/.test(ln.replace(/\/\*.*?\*\//g, ""))) rawHex.push(f + ":" + (i + 1));
  const z = ln.match(/z-index:\s*(\d+)/); if (z && +z[1] >= 10) rawZ.push(f + ":" + (i + 1));
});
ck("no hex colours outside tokens.css", rawHex.length === 0, rawHex.slice(0, 10).join(", "));
ck("no page-level z-index numbers outside tokens.css (10 and up use a --z- token)", rawZ.length === 0, rawZ.slice(0, 10).join(", "));
ck("STOP sits above the header in the layer scale", parseInt(varOf(light, "z-stop")) > parseInt(varOf(light, "z-header")));

process.exit(t.done() ? 1 : 0);

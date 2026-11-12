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

process.exit(t.done() ? 1 : 0);

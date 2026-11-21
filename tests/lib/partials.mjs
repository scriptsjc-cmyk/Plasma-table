// r15 8.4: build the page the way js/boot.js does at start-up (index.html with
// every <div id="slot-…"> replaced by its partial), so static tests can read
// the whole markup no matter which file a dialog lives in.
import fs from "node:fs";
import { SITE } from "./site.mjs";

export const partialList = () => {
  const boot = fs.readFileSync(SITE + "js/boot.js", "utf8");
  const list = boot.match(/const PARTIALS = \[([\s\S]*?)\]/)?.[1] || "";
  return [...list.matchAll(/"(html\/[^"]+\.html)"/g)].map((m) => m[1]);
};

// Top-level <template data-slot="…"> blocks, allowing <template>s nested inside.
function slotTemplates(src) {
  const out = []; const re = /<template\b[^>]*>|<\/template>/g; let depth = 0; let cur = null; let m;
  while ((m = re.exec(src))) {
    if (m[0] === "</template>") { depth--; if (depth === 0 && cur) { out.push([null, cur.name, src.slice(cur.start, m.index)]); cur = null; } continue; }
    if (depth === 0) { const name = m[0].match(/data-slot="([^"]+)"/)?.[1]; if (name) cur = { name, start: re.lastIndex }; }
    depth++;
  }
  return out;
}

const SLOT = (name) => new RegExp(`<div id="slot-${name}" hidden></div>`, "g");

// Returns { html, filled: [slot names in fill order], problems: [...] }.
export function assemblePage() {
  let html = fs.readFileSync(SITE + "index.html", "utf8");
  const filled = []; const problems = [];
  const fill = (name, body, url) => {
    const n = (html.match(SLOT(name)) || []).length;
    if (n !== 1) problems.push(`${url}: slot-${name} found ${n} times`);
    html = html.replace(SLOT(name), () => body);
    filled.push(name);
  };
  for (const url of partialList()) {
    const src = fs.readFileSync(SITE + url, "utf8");
    const tpls = slotTemplates(src);
    if (tpls.length) for (const [, name, body] of tpls) fill(name, body, url);
    else fill(url.replace(/^html\//, "").replace(/\.html$/, ""), src, url);
  }
  const left = [...html.matchAll(/id="slot-([^"]+)"/g)].map((m) => m[1]);
  if (left.length) problems.push("slots never filled: " + left.join(", "));
  return { html, filled, problems };
}

export const idsIn = (html) => [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

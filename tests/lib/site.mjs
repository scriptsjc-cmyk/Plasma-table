// Where the site under test lives, and how tests find its modules WITHOUT hard-coding folders.
// The site is the repo root unless SITE_DIR points at another copy of the build. Modules are found by file name
// (js/<area>/<name>.js), so moving a module between folders never breaks a test. Names are unique across folders.
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
export const SITE = (process.env.SITE_DIR || new URL("../../", import.meta.url).pathname).replace(/\/?$/, "/");
export const jsFiles = (dir = SITE + "js") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? jsFiles(path.join(dir, d.name)) : d.name.endsWith(".js") ? [path.join(dir, d.name)] : []);
export const jsRel = () => jsFiles().map((f) => path.relative(SITE, f).split(path.sep).join("/")).sort();          // ["js/core/state.js", ...]
export function jsRelOf(name) {                                                                                  // "account-ui" | "account-ui.js" -> "js/account/account-ui.js"
  const base = name.replace(/\.js$/, "") + ".js", hits = jsRel().filter((f) => f.split("/").pop() === base);
  if (hits.length !== 1) throw new Error(`js module "${name}": ${hits.length} matches ${JSON.stringify(hits)}`);
  return hits[0];
}
export const jsUrl = (name) => "/" + jsRelOf(name);                                                              // for import() inside the page
export const jsPath = (name) => SITE + jsRelOf(name);
export const readJs = (name) => fs.readFileSync(jsPath(name), "utf8");
export const mod = (name) => import(pathToFileURL(jsPath(name)).href);
export const allJsText = () => jsRel().map((f) => [f, fs.readFileSync(SITE + f, "utf8")]);
export const DATA = new URL("../data/", import.meta.url).pathname;
export const REPO = SITE.replace(/\/$/, "");

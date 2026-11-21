// r15 8.6: Round 2 (Features) code lives in its own modules - the model in make/part-features.js, the list in
// make/part-features-ui.js, and the Sketch's Features methods (Corners rows, corner pick) in make/sketch-features.js -
// not in sketch-edit.js / sketch-edge.js / sketch-input.js, which only call them.
import fs from "node:fs";
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const t = new T("52_r15_feature_modules");
const js = (f) => fs.readFileSync(new URL(`../../js/make/${f}`, import.meta.url), "utf8");
const METHODS = ["cornerRowable", "cornerList", "cornerRow", "cornerPickAt"];
const defines = (src, m) => new RegExp(`^\\s+${m}\\s*\\([^)]*\\)\\s*\\{`, "m").test(src);
t.check("sketch-features.js exists and defines the Sketch's Features methods", fs.existsSync(new URL("../../js/make/sketch-features.js", import.meta.url)) && METHODS.every((m) => defines(js("sketch-features.js"), m)));
for (const f of ["sketch-edit.js", "sketch-edge.js", "sketch-input.js", "sketch.js"]) {
  const src = js(f), here = METHODS.filter((m) => defines(src, m));
  t.check(`${f} does not define Features methods`, here.length === 0, here.join(", "));
}
const sk = A.newSketch();
t.check("the Sketch still has every Features method", METHODS.every((m) => typeof sk[m] === "function"), METHODS.filter((m) => typeof sk[m] !== "function").join(", "));
// and they still work: a 2.12 Corners row on a rectangle sets its radius, on an L-bracket adds a row
sk.add("lbracket", true); const it = sk.items[0];
const n = sk.cornerRow(it, { kind: "round", r: 3, at: [0] });
t.check("Corners row on one corner of an L-bracket still adds a row", n === 1 && (it.feats || []).some((f) => f.k === "corner" && Array.isArray(f.at)), JSON.stringify(it.feats));
process.exit(t.done() ? 1 : 0);

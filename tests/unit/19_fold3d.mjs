// Folded presets: 3D models exist, unfolded face sizes match the flat pattern,
// and previously shipped presets still produce the same flat contours (G-code unchanged).
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { bb } from "../lib/analyze.mjs";
import crypto from "node:crypto";
import fs from "node:fs";

const A = await load();
const t = new T("19_fold3d");

function hashContours(cs) {
  const bits = (cs || []).map((c) => {
    const pts = (c.pts || []).map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(" ");
    return `${c.closed === false ? "o" : "c"}:${pts}`;
  });
  return crypto.createHash("sha256").update(bits.join("|")).digest("hex").slice(0, 16);
}
function contains(outer, inner) {
  return inner[0] >= outer[0] - 1e-6 && inner[1] >= outer[1] - 1e-6 && inner[2] <= outer[2] + 1e-6 && inner[3] <= outer[3] + 1e-6
    && (inner[0] > outer[0] + 1e-6 || inner[1] > outer[1] + 1e-6 || inner[2] < outer[2] - 1e-6 || inner[3] < outer[3] - 1e-6);
}
function outlineArea(cs) {
  const items = (cs || []).map((c) => ({ c, a: Math.abs(A.signedArea(c.pts || [])), b: bb(c.pts || []) }));
  const isHole = (x) => items.some((y) => y !== x && y.a >= x.a && contains(y.b, x.b));
  return items.filter((x) => !isHole(x)).reduce((s, x) => s + x.a, 0);
}

const foldFns = A.FOLD_MODELS || {};
const isFold = A.isFoldPart || ((sh) => !!(sh && (sh.fold || foldFns[sh.id])));
const foldModel = A.foldModel || ((sh, p) => (sh.fold ? sh.fold(p) : foldFns[sh.id] && foldFns[sh.id](p)));

t.check("fold helpers are exported", typeof isFold === "function" && typeof foldModel === "function");

const foldShapes = A.SHAPES.filter(isFold);
t.check("there are many fold / formed presets", foldShapes.length >= 40, `got ${foldShapes.length}`);

const newFold = (A.FOLD_PRESETS || []).map((s) => s.id);
t.check("at least 30 new folded presets", newFold.length >= 30, `got ${newFold.length}`);
t.check("new folded ids are unique", new Set(newFold).size === newFold.length);
t.check("new folded presets are not in the basic Shapes list",
  newFold.every((id) => !(A.LIBRARY_SHAPE_GROUPS || A.BASIC_SHAPE_GROUPS || []).flatMap((g) => g.ids || []).includes(id)));

for (const sh of foldShapes) {
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  const m = foldModel(sh, p);
  t.check(`${sh.id}: produces a 3D model`, !!(m && m.faces && m.faces.length), "", "FOLD-EMPTY");
  if (!m || !m.faces) continue;
  t.check(`${sh.id}: every face has 3+ finite points`,
    m.faces.every((f) => Array.isArray(f.pts) && f.pts.length >= 3 && f.pts.every((q) => q.length >= 3 && q.every(Number.isFinite))),
    "", "FOLD-PTS");
  const panelArea = (m.panels || m.faces.map((f) => ({ w: f.w, h: f.h }))).reduce((s, q) => s + Math.max(0, q.w) * Math.max(0, q.h), 0);
  const sk = A.newSketch();
  sk.add(sh.id, true);
  const cs = sk.contours();
  const flat = outlineArea(cs);
  // Approximated developments (faceted cones, gores, saddles, flashing) must still build a 3D model;
  // their declared panel area can differ from the packed templates. Strict match for folded boxes, channels and new folded parts.
  const loose = /^(cone|elbow|fish|saddle|chim|cricket|roof|sky|takeoff|ductcap|rectcap|ybranch|britches|teetemp|coneadapter|conecentric|coneecc|cyclone|hopper|hopflange|gusflange|rectelbow|recttrans|sqrpyramid|s2r|r2s|panflash|valley|silocone)/;
  const skipArea = /^(ductcap)$/;
  const tol = loose.test(sh.id) ? 0.85 : 0.22;
  if (flat > 10 && panelArea > 10 && !skipArea.test(sh.id)) {
    const ratio = Math.abs(panelArea - flat) / Math.max(flat, panelArea);
    t.check(`${sh.id}: unfolded faces match the flat-pattern area`, ratio <= tol, `3D ${panelArea.toFixed(0)} vs flat ${flat.toFixed(0)} (${(ratio * 100).toFixed(1)}%)`, "FOLD-AREA");
  }
}

const goldPath = new URL("../data/existing-preset-flat.json", import.meta.url);
const gold = JSON.parse(fs.readFileSync(goldPath, "utf8"));
t.check("golden flat-pattern fixture is present", Array.isArray(gold.rows) && gold.rows.length > 50, String(gold.rows && gold.rows.length));
let changed = [];
for (const row of gold.rows) {
  const sh = A.SHAPES.find((s) => s.id === row.id);
  if (!sh) { changed.push(row.id + " (missing)"); continue; }
  const sk = A.newSketch();
  sk.add(row.id, true);
  const it = sk.items[0];
  if (it) { it.x = 0; it.y = 0; }
  const h = hashContours(sk.contours());
  if (h !== row.hash) changed.push(`${row.id} ${row.hash} -> ${h}`);
}
t.check("generated flat patterns for existing presets are unchanged", changed.length === 0, changed.slice(0, 8).join("; "));

process.exit(t.done() ? 1 : 0);

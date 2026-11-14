// Folded presets: 3D models exist, unfolded face sizes match the flat pattern,
// and previously shipped presets still produce the same flat contours (G-code unchanged).
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { bb } from "../lib/analyze.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { segmentsFor } from "../../js/make/duct.js";

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
  const loose = /^(cone|elbow|fish|saddle|chim|cricket|roof|sky|takeoff|ductcap|rectcap|ybranch|britches|teetemp|coneadapter|conecentric|coneecc|cyclone|hopper|hopflange|gusflange|rectelbow|recttrans|sqrpyramid|s2r|r2s|fanduct|panflash|valley|silocone)/;
  const skipArea = /^(ductcap)$/;
  const tol = loose.test(sh.id) ? 0.85 : 0.22;
  if (flat > 10 && panelArea > 10 && !skipArea.test(sh.id)) {
    const ratio = Math.abs(panelArea - flat) / Math.max(flat, panelArea);
    t.check(`${sh.id}: unfolded faces match the flat-pattern area`, ratio <= tol, `3D ${panelArea.toFixed(0)} vs flat ${flat.toFixed(0)} (${(ratio * 100).toFixed(1)}%)`, "FOLD-AREA");
  }
}

const TAB_IDS = ["opentabbox", "closedtabbox", "traytabs", "battbox"];
for (const id of TAB_IDS) {
  const sh = A.SHAPES.find((s) => s.id === id);
  t.check(`${id}: is registered`, !!sh);
  if (!sh) continue;
  const sk = A.newSketch();
  sk.add(id, true);
  const cs = sk.contours() || [];
  const items = cs.map((c) => ({ a: Math.abs(A.signedArea(c.pts || [])), b: bb(c.pts || []) }));
  const isHole = (x) => items.some((y) => y !== x && y.a >= x.a && contains(y.b, x.b));
  const outers = items.filter((x) => !isHole(x));
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  const tab = p.tab || 0, wall = p.ht || 0;
  const loose = outers.filter((x) => {
    const w = x.b[2] - x.b[0], h = x.b[3] - x.b[1];
    const a = Math.min(w, h), b = Math.max(w, h);
    return tab > 0 && Math.abs(a - tab) < 1.1 && Math.abs(b - wall) < 1.1;
  });
  t.check(`${id}: corner tabs are attached to the walls, not loose rectangles`, loose.length === 0, `${loose.length} loose tab-sized outlines`);
  t.check(`${id}: flat pattern is one connected box (lid is a flap by default)`, outers.length === 1, `${outers.length} outer outlines`);
}

// Square-to-round 3D must follow the flat pattern's triangulation (4 flats + corner fans).
for (const id of ["s2r", "s2roffset", "r2s", "fanduct"]) {
  const sh = A.SHAPES.find((s) => s.id === id);
  t.check(`${id}: is a fold part`, !!(sh && isFold(sh)));
  if (!sh) continue;
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  const m = foldModel(sh, p);
  const n = segmentsFor((p.d || 0) / 2);
  const flats = (m && m.faces || []).filter((f) => f.flat);
  t.check(`${id}: 3D has 4 flat mid-side triangles`, flats.length === 4, `flat=${flats.length}`);
  t.check(`${id}: each flat face is a triangle`, flats.every((f) => (f.pts || []).length === 3));
  t.check(`${id}: corner fans use the flat-pattern division (${n} per half-corner)`,
    !!(m && m.faces && m.faces.length === 4 + 8 * n),
    `faces=${m && m.faces && m.faces.length}, expected ${4 + 8 * n} (n=${n})`);
}

// New preset tabs, one-piece defaults, and "Separate pieces".
const groups = A.PRESET_GROUPS || [];
const gname = (id) => (groups.find((g) => g.id === id) || {}).name;
const gids = (id) => (groups.find((g) => g.id === id) || {}).ids || [];
t.check("Presets has a 3D / folding tab", gname("folded") === "3D / folding", gname("folded"));
t.check("Presets has a Pipework tab", gname("pipework") === "Pipework", gname("pipework"));
t.check("3D / folding tab lists the open box and U-channel", gids("folded").includes("openbox") && gids("folded").includes("uchannel"));
t.check("Pipework tab lists square-to-round, cone and the lobster-back elbow", ["s2r", "cone", "elbow3"].every((id) => gids("pipework").includes(id)), gids("pipework").slice(0, 8).join(","));
t.check("size-only duplicates are hidden from the tabs",
  ["trayflat", "totebox", "elbow2", "elbow4", "conesteep", "angleiron", "furring"].every((id) => !gids("folded").includes(id) && !gids("pipework").includes(id) && !gids("sheetmetal").includes(id) && !gids("enclosures").includes(id)));
t.check("hidden aliases stay registered", ["trayflat", "elbow2", "conesteep", "angleiron"].every((id) => A.SHAPES.some((s) => s.id === id)));

function outersOf(id, overrides = {}) {
  const sh = A.SHAPES.find((s) => s.id === id);
  const sk = A.newSketch();
  sk.add(id, true);
  const it = sk.items[0];
  if (it) { it.x = 0; it.y = 0; Object.assign(it.p, overrides); }
  // rebuild contours after param tweak
  if (it && typeof sk.touch === "function") sk.touch(it);
  const cs = sk.contours() || [];
  const items = cs.filter((c) => c.closed !== false).map((c) => ({ a: Math.abs(A.signedArea(c.pts || [])), b: bb(c.pts || []) }));
  const isHole = (x) => items.some((y) => y !== x && y.a >= x.a && contains(y.b, x.b));
  return items.filter((x) => !isHole(x));
}
// sketch.add may not pick up overrides unless we re-make. Prefer calling make() directly.
function outersFromMake(id, overrides = {}) {
  const sh = A.SHAPES.find((s) => s.id === id);
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  Object.assign(p, overrides);
  const cs = sh.make(p) || [];
  const items = cs.filter((c) => c.closed !== false).map((c) => ({ a: Math.abs(A.signedArea(c.pts || [])), b: bb(c.pts || []) }));
  const isHole = (x) => items.some((y) => y !== x && y.a >= x.a && contains(y.b, x.b));
  return items.filter((x) => !isHole(x));
}
t.check("open box defaults to one folding blank", outersFromMake("openbox").length === 1, String(outersFromMake("openbox").length));
t.check("open box Separate pieces splits into individual panels", outersFromMake("openbox", { split: 1 }).length >= 5, String(outersFromMake("openbox", { split: 1 }).length));
t.check("U-channel with ends defaults to one blank", outersFromMake("uchannel").length === 1, String(outersFromMake("uchannel").length));
t.check("U-channel Separate pieces packs the end plates", outersFromMake("uchannel", { split: 1 }).length >= 3, String(outersFromMake("uchannel", { split: 1 }).length));
t.check("shoebox stays two blanks (telescoping lid) and says so", (() => {
  const sh = A.SHAPES.find((s) => s.id === "shoebox");
  return !!(sh && sh.note) && outersFromMake("shoebox").length === 2;
})());
t.check("lobster-back elbow stays multi-piece and says so", (() => {
  const sh = A.SHAPES.find((s) => s.id === "elbow3");
  return !!(sh && sh.note) && outersFromMake("elbow3").length >= 3;
})());
t.check("angle gusset stays two pieces and says so", (() => {
  const sh = A.SHAPES.find((s) => s.id === "anglegus");
  return !!(sh && sh.note) && outersFromMake("anglegus").length === 2;
})());

// C32 added etched bend / fold lines to these flat patterns (angle brackets,
// channels, cuboid wrap). Those hashes were updated; elbow gores at t=0 were
// restored after a C35 wrap-around bug and must still match the original goldens.
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

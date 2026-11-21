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
  const loose = /^(cone|elbow|redelbow|fish|saddle|chim|cricket|roof|sky|takeoff|ductcap|rectcap|ybranch|britches|teetemp|coneadapter|conecentric|coneecc|cyclone|hopper|hopflange|gusflange|rectelbow|recttrans|sqrpyramid|s2r|r2s|fanduct|panflash|valley|silocone)/;
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
  const body = (m && m.faces || []).filter((f) => !f.flange);
  const flats = body.filter((f) => f.flat);
  t.check(`${id}: 3D has 4 flat mid-side triangles`, flats.length === 4, `flat=${flats.length}`);
  t.check(`${id}: each flat face is a triangle`, flats.every((f) => (f.pts || []).length === 3));
  t.check(`${id}: corner fans use the flat-pattern division (${n} per half-corner)`,
    body.length === 4 + 8 * n,
    `faces=${body.length}, expected ${4 + 8 * n} (n=${n})`);
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

t.check("square-to-round defaults to one folding body (plus optional flanges)", outersFromMake("s2r", { lip: 0, ring: 0 }).length === 1, String(outersFromMake("s2r", { lip: 0, ring: 0 }).length));
t.check("square-to-round default packs the body with flange frame and ring", outersFromMake("s2r").length === 3, String(outersFromMake("s2r").length));
t.check("square-to-round Separate pieces cuts the four sides apart", outersFromMake("s2r", { split: 1, lip: 0, ring: 0 }).length === 4, String(outersFromMake("s2r", { split: 1, lip: 0, ring: 0 }).length));
t.check("rectangular transition defaults to one folding blank", outersFromMake("recttrans").length === 1, String(outersFromMake("recttrans").length));
t.check("rectangular transition Separate pieces cuts the four sides apart", outersFromMake("recttrans", { split: 1 }).length === 4, String(outersFromMake("recttrans", { split: 1 }).length));
t.check("offset square-to-round falls back to two halves when a single unwrap overlaps", (() => {
  const sh = A.SHAPES.find((s) => s.id === "s2roffset");
  const n = outersFromMake("s2roffset", { lip: 0 }).length;
  const note = typeof sh.note === "function" ? sh.note(Object.fromEntries(sh.params.map((q) => [q[0], q[2]]))) : "";
  return n === 2 && /two halves/.test(note);
})());
t.check("a large square-to-round is two halves and says it is for the bed", (() => {
  const sh = A.SHAPES.find((s) => s.id === "s2r");
  const p = Object.fromEntries(sh.params.map((q) => [q[0], q[2]]));
  Object.assign(p, { a: 800, b: 600, d: 400, h: 500, lip: 0, ring: 0 });
  const n = outersFromMake("s2r", { a: 800, b: 600, d: 400, h: 500, lip: 0, ring: 0 }).length;
  const note = typeof sh.note === "function" ? sh.note(p) : "";
  return n === 2 && /two halves/.test(note) && /1300/.test(note);
})());
t.check("hopper with top flange defaults to one folding blank", outersFromMake("hopflange").length === 1, String(outersFromMake("hopflange").length));
t.check("fan duct defaults to one body plus the square flange", outersFromMake("fanduct").length === 2, String(outersFromMake("fanduct").length));

t.check("square-to-round default etch fans are a handful of lines, not a dense fill", (() => {
  const sh = A.SHAPES.find((s) => s.id === "s2r");
  const p = Object.fromEntries(sh.params.map((q) => [q[0], q[2]]));
  const cs = sh.make({ ...p, lip: 0, ring: 0 }) || [];
  const scores = cs.filter((c) => c.closed === false).length;
  const none = (sh.make({ ...p, lip: 0, ring: 0, fans: 0 }) || []).filter((c) => c.closed === false).length;
  return scores >= 15 && scores <= 40 && none < scores;
})());
t.check("lobster-back 3D is a full pipe of gore segments, not a ribbon", (() => {
  const sh = A.SHAPES.find((s) => s.id === "elbow3");
  const p = Object.fromEntries(sh.params.map((q) => [q[0], q[2]]));
  const m = foldModel(sh, p);
  const faces = (m && m.faces) || [];
  const gores = new Set(faces.map((f) => f.gore).filter((g) => g != null));
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const f of faces) for (const q of f.pts) {
    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); z0 = Math.min(z0, q[2]);
    x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); z1 = Math.max(z1, q[2]);
  }
  const d = p.d || 100;
  return gores.size === Math.max(2, Math.round(p.n || 3)) && (x1 - x0) > 0.8 * d && (y1 - y0) > 0.8 * d && (z1 - z0) > 0.8 * d;
})());
t.check("fishmouth 3D shows a saddle cut and a ghosted header", (() => {
  const sh = A.SHAPES.find((s) => s.id === "fishmouth");
  const p = Object.fromEntries(sh.params.map((q) => [q[0], q[2]]));
  const m = foldModel(sh, p);
  const faces = (m && m.faces) || [];
  return faces.some((f) => f.ghost) && faces.some((f) => !f.ghost);
})());
t.check("saddle-hole 3D keeps a ghosted branch", (() => {
  const sh = A.SHAPES.find((s) => s.id === "saddlehole");
  const p = Object.fromEntries(sh.params.map((q) => [q[0], q[2]]));
  const m = foldModel(sh, p);
  return ((m && m.faces) || []).some((f) => f.ghost);
})());


// Bolt-on pipe-end flanges: off by default (goldens unchanged); when on, a ring
// with bolt holes is added to the cut pattern and a matching plate appears in 3D.
for (const id of ["tube", "cone", "s2r", "elbow3"]) {
  const sh = A.SHAPES.find((s) => s.id === id);
  t.check(`${id}: has per-end flange options`, !!(sh && sh.params.some((q) => q[0] === "fl1") && sh.params.some((q) => q[0] === "fl2")));
}
const tubeOff = outersFromMake("tube");
const tubeOn = outersFromMake("tube", { fl1: 1, fl2: 1 });
t.check("rolled tube with flanges off is still one blank", tubeOff.length === 1, String(tubeOff.length));
t.check("rolled tube with both end flanges adds two ring blanks", tubeOn.length === 3, String(tubeOn.length));
t.check("a tube flange ring has a bore and bolt holes", (() => {
  const sh = A.SHAPES.find((s) => s.id === "tube");
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  Object.assign(p, { fl1: 1, fl2: 0 });
  const cs = sh.make(p) || [];
  const items = cs.filter((c) => c.closed !== false).map((c) => ({ a: Math.abs(A.signedArea(c.pts || [])), b: bb(c.pts || []), c }));
  const isHole = (x) => items.some((y) => y !== x && y.a >= x.a && contains(y.b, x.b));
  const rings = items.filter((x) => !isHole(x) && items.some((y) => y !== x && isHole(y) === false ? false : contains(x.b, y.b) && y.a < x.a));
  // the flange outer contains the bore plus several bolt holes
  const flange = items.filter((x) => !isHole(x)).sort((a, b) => b.a - a.a)[0];
  // actually get the ring (not the tube rectangle): the one that contains holes
  const outers = items.filter((x) => !isHole(x));
  const ring = outers.find((o) => items.filter((h) => h !== o && contains(o.b, h.b)).length >= 5);
  return !!(ring && items.filter((h) => h !== ring && contains(ring.b, h.b)).length >= 5);
})());
t.check("tube 3D shows both bolt-on flanges when they are on", (() => {
  const sh = A.SHAPES.find((s) => s.id === "tube");
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  const off = foldModel(sh, p);
  const on = foldModel(sh, { ...p, fl1: 1, fl2: 1 });
  const nOff = (off && off.faces || []).filter((f) => f.flange).length;
  const nOn = (on && on.faces || []).filter((f) => f.flange).length;
  return nOff === 0 && nOn >= 2;
})());
t.check("s2r 3D already shows the default lip frame and ring", (() => {
  const sh = A.SHAPES.find((s) => s.id === "s2r");
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  const m = foldModel(sh, p);
  return ((m && m.faces) || []).filter((f) => f.flange).length >= 2;
})());
t.check("open box with tabs and a hem keeps 3D faces matching the blank", (() => {
  const sh = A.SHAPES.find((s) => s.id === "openbox");
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  Object.assign(p, { tab: 12, hem: 10, split: 0 });
  const m = foldModel(sh, p);
  const panelArea = (m.panels || []).reduce((s, q) => s + Math.max(0, q.w) * Math.max(0, q.h), 0);
  const cs = sh.make(p);
  const items = (cs || []).map((c) => ({ a: Math.abs(A.signedArea(c.pts || [])), b: bb(c.pts || []) }));
  const isHole = (x) => items.some((y) => y !== x && y.a >= x.a && contains(y.b, x.b));
  const flat = items.filter((x) => !isHole(x)).reduce((s, x) => s + x.a, 0);
  const ratio = Math.abs(panelArea - flat) / Math.max(flat, panelArea);
  return ratio <= 0.22 && (m.faces || []).length >= 9;
})());
t.check("hat section / C-channel return flanges are in the 3D model", (() => {
  const hat = A.SHAPES.find((s) => s.id === "hatsect");
  const p = {};
  for (const [k, , d] of hat.params) p[k] = d;
  const m = foldModel(hat, p);
  return (m.faces || []).length >= 5 && (m.panels || []).some((q) => Math.abs(q.h - (p.flange || 0)) < 0.2 || Math.abs(q.w - (p.flange || 0)) < 0.2);
})());
t.check("machine guard window is cut in the 3D front", (() => {
  const sh = A.SHAPES.find((s) => s.id === "machineguard");
  const p = {};
  for (const [k, , d] of sh.params) p[k] = d;
  const m = foldModel(sh, p);
  return ((m && m.faces) || []).some((f) => (f.holes || []).length >= 1);
})());

// C32 added etched bend / fold lines to these flat patterns (angle brackets,
// channels, cuboid wrap). Those hashes were updated; elbow gores at t=0 were
// restored after a C35 wrap-around bug and must still match the original goldens.
// Square-to-round and rectangular transitions now default to one connected
// folding blank (or two halves if needed) with etch lines; hashes updated.
// r15 5.2: the dustpan bottom's back edge was 1.5 × the back width (the back never fitted); fixed, hash updated.
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

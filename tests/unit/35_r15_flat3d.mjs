// r15 5.2 the 3D is built from the flat pattern and its fold lines (not a separate hand-written model), so what you see
// folded is exactly what gets cut. Covers the generic builder and the eight presets whose old models were wrong.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const F = await import("../../js/make/flat3d.js");
const t = new T("35_r15_flat3d");
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
function newell(pts) { let x = 0, y = 0, z = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } return Math.hypot(x, y, z) / 2; }
const faceArea = (f) => newell(f.pts) - (f.holes || []).reduce((s, r) => s + newell(r), 0);
const area2 = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
function flatArea(cs) {
  const cl = cs.filter((c) => c.closed !== false && c.role !== "bend" && c.pts.length >= 3);
  const inside = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  let s = 0;
  for (const c of cl) { const depth = cl.filter((o) => o !== c && area2(o.pts) > area2(c.pts) && inside(c.pts[0], o.pts)).length; s += (depth % 2 ? -1 : 1) * area2(c.pts); }
  return s;
}
const solid = (m) => (m && m.faces ? m.faces.filter((f) => !f.ghost) : []);
const horiz = (f) => Math.abs(f.n[1]) > 0.99;
const vert = (f) => Math.abs(f.n[1]) < 0.02;
const sh = (id) => A.SHAPES.find((s) => s.id === id);
const defaults = (s) => Object.fromEntries(s.params.map(([k, , d]) => [k, d]));
const yRange = (f) => [Math.min(...f.pts.map((p) => p[1])), Math.max(...f.pts.map((p) => p[1]))];

// ---- the generic builder
const strip = (bends) => [{ pts: [[0, 0], [100, 0], [100, 70], [0, 70]], closed: true }, ...bends];
const bend = (x0, y0, x1, y1, o = {}) => ({ pts: [[x0, y0], [x1, y1]], closed: false, role: "bend", op: "score", ...o });
t.check("flat3d exports foldFlat and assembleFlat", typeof F.foldFlat === "function" && typeof F.assembleFlat === "function");
let m = F.assembleFlat([{ contours: strip([bend(0, 30, 100, 30)]) }]);
let fs = solid(m);
t.check("one fold line → two faces", fs.length === 2, String(fs.length));
t.check("a 90° fold stands the second face up", fs.length === 2 && Math.abs(dot(fs[0].n, fs[1].n)) < 1e-6, JSON.stringify(fs.map((f) => f.n)));
t.check("face areas are the flat panel areas (3000 + 4000)", fs.length === 2 && [3000, 4000].every((a) => fs.some((f) => Math.abs(faceArea(f) - a) < 1e-6)), JSON.stringify(fs.map(faceArea)));
const upMax = Math.max(...fs.flatMap((f) => f.pts.map((p) => p[1])));
t.check("a fold goes up by default (the flange rises 40 above the base)", Math.abs(upMax - 40) < 1e-6, String(upMax));
m = F.assembleFlat([{ contours: strip([bend(0, 30, 100, 30, { dir: "down" })]) }]);
const ys = solid(m).flatMap((f) => f.pts.map((p) => p[1]));
t.check("dir: down folds the other way (base ends up 40 above the table)", Math.abs(Math.max(...ys) - 40) < 1e-6 && solid(m).some((f) => horiz(f) && Math.abs(f.pts[0][1] - 40) < 1e-6), JSON.stringify(ys));
m = F.assembleFlat([{ contours: strip([bend(0, 30, 100, 30, { deg: 45 })]) }]);
fs = solid(m);
t.check("deg: 45 folds 45°", fs.length === 2 && Math.abs(Math.abs(dot(fs[0].n, fs[1].n)) - Math.SQRT1_2) < 1e-6);
const circ = (cx, cy, r) => ({ pts: Array.from({ length: 24 }, (_, i) => [cx + r * Math.cos(i * Math.PI / 12), cy + r * Math.sin(i * Math.PI / 12)]), closed: true, circle: { cx, cy, r } });
m = F.assembleFlat([{ contours: [...strip([bend(0, 30, 100, 30)]), circ(50, 50, 5), circ(20, 15, 4)] }]);
fs = solid(m);
const flange = fs.find((f) => !horiz(f)), base = fs.find(horiz);
t.check("holes go to the panel they are cut in", flange && base && flange.holes.length === 1 && base.holes.length === 1);
t.check("a hole on the flange rises with it (centre 20 up)", flange && Math.abs(flange.holes[0].reduce((s, p) => s + p[1], 0) / flange.holes[0].length - 20) < 0.01);
m = F.assembleFlat([{ contours: strip([bend(0, 20, 100, 20), bend(0, 50, 100, 50)]) }]);
fs = solid(m);
const legs = fs.filter((f) => !horiz(f));
t.check("two fold lines → a U with both legs up", fs.length === 3 && legs.length === 2 && legs.every((f) => Math.abs(yRange(f)[0]) < 1e-6 && Math.abs(yRange(f)[1] - 20) < 1e-6), JSON.stringify(fs.map(yRange)));
m = F.assembleFlat([{ contours: strip([bend(0, 30, 100, 30)]), pose: { o: [0, 0, 0], ax: [1, 0, 0], ay: [0, 1, 0] } }]);
t.check("a pose places the flat frame (standing piece)", solid(m).some((f) => Math.abs(f.n[2]) > 0.99));

// ---- the eight presets: the 3D is made from the cut pieces (same area as the flat pattern) and is the right shape
const EIGHT = ["panflash", "skylightcurb", "chimsquare", "chimround", "roofjack", "cricketflash", "dustpan", "pipeustrap"];
for (const id of EIGHT) {
  const s = sh(id), p = defaults(s);
  const model = A.foldModel(s, p), cs = s.make(p);
  const a3 = solid(model).reduce((x, f) => x + faceArea(f), 0), a2 = flatArea(cs);
  t.check(`${id}: has a 3D model`, solid(model).length > 0);
  t.check(`${id}: the 3D is made from the cut pieces (area ${Math.round(a3)} vs flat ${Math.round(a2)})`, a2 > 0 && Math.abs(a3 - a2) / a2 < 0.02);
  t.check(`${id}: sits on the table`, solid(model).length > 0 && Math.abs(Math.min(...solid(model).flatMap((f) => f.pts.map((q) => q[1])))) < 1e-6);
}
{ // pan flashing: pan + back + two side upstands, front open
  const s = sh("panflash"), p = defaults(s), fs = solid(A.foldModel(s, p));
  const pan = fs.filter(horiz), ups = fs.filter(vert);
  t.check("pan flashing: one flat pan w × d and three upstands", pan.length === 1 && Math.abs(faceArea(pan[0]) - p.w * p.d) < 1e-6 && ups.length === 3 && ups.every((f) => Math.abs(yRange(f)[1] - p.up) < 1e-6), JSON.stringify({ pan: pan.length, ups: ups.length }));
  const zFront = Math.max(...pan[0].pts.map((q) => q[2]));
  t.check("pan flashing: the front is open (no upstand along the front edge)", ups.every((f) => !f.pts.every((q) => Math.abs(q[2] - zFront) < 1e-6)));
}
{ // square chimney: base with a square opening, four collar sides standing on the opening's edges
  const s = sh("chimsquare"), p = defaults(s), fs = solid(A.foldModel(s, p));
  const base = fs.filter(horiz), sides = fs.filter(vert);
  t.check("square chimney: a flat base with the square opening", base.length === 1 && base[0].holes.length === 1);
  const hb = base[0] && base[0].holes[0];
  const hx = hb ? [Math.min(...hb.map((q) => q[0])), Math.max(...hb.map((q) => q[0]))] : [0, 0], hz = hb ? [Math.min(...hb.map((q) => q[2])), Math.max(...hb.map((q) => q[2]))] : [0, 0];
  const onEdge = (f) => f.pts.filter((q) => Math.abs(q[1]) < 1e-6).every((q) => q[0] >= hx[0] - 1e-6 && q[0] <= hx[1] + 1e-6 && q[2] >= hz[0] - 1e-6 && q[2] <= hz[1] + 1e-6 && (Math.abs(q[0] - hx[0]) < 1e-6 || Math.abs(q[0] - hx[1]) < 1e-6 || Math.abs(q[2] - hz[0]) < 1e-6 || Math.abs(q[2] - hz[1]) < 1e-6));
  t.check("square chimney: four collar sides stand on the opening's edges", sides.length === 4 && sides.every(onEdge) && sides.every((f) => Math.abs(yRange(f)[1] - Math.max(16, p.collar)) < 1e-6), JSON.stringify(sides.length));
}
for (const [id, extra] of [["chimround", 8], ["roofjack", 6]]) {
  const s = sh(id), p = defaults(s), fs = solid(A.foldModel(s, p));
  const base = fs.filter(horiz), collar = fs.filter((f) => !horiz(f));
  const hole = base[0] && base[0].holes[0];
  const hc = hole ? [hole.reduce((x, q) => x + q[0], 0) / hole.length, hole.reduce((x, q) => x + q[2], 0) / hole.length] : [NaN, NaN];
  t.check(`${id}: a flat base with the pipe hole`, base.length === 1 && base[0].holes.length === 1);
  const low = collar.flatMap((f) => f.pts).filter((q) => q[1] < 1e-6), top = collar.flatMap((f) => f.pts);
  const yTop = Math.max(...top.map((q) => q[1]));
  const rBot = low.length ? Math.max(...low.map((q) => Math.hypot(q[0] - hc[0], q[2] - hc[1]))) : 0;
  const rTop = Math.max(...top.filter((q) => q[1] > yTop - 1e-6).map((q) => Math.hypot(q[0] - hc[0], q[2] - hc[1])));
  t.check(`${id}: the collar cone stands on the hole (bottom Ø ${(2 * rBot).toFixed(1)}, top Ø ${(2 * rTop).toFixed(1)})`, collar.length > 8 && Math.abs(2 * rBot - (p.d + extra)) < 0.5 && Math.abs(2 * rTop - p.d) < 0.5);
}
{ // cricket: two plates meeting at a ridge
  const s = sh("cricketflash"), p = defaults(s), fs = solid(A.foldModel(s, p));
  const shared = fs.length === 2 ? fs[0].pts.filter((a) => fs[1].pts.some((b) => len(sub(a, b)) < 1e-6)) : [];
  t.check("cricket: two plates that are not flat with each other", fs.length === 2 && Math.abs(dot(fs[0].n, fs[1].n)) < 0.999);
  t.check("cricket: the plates share the ridge (length h)", shared.length === 2 && Math.abs(len(sub(shared[0], shared[1])) - p.h) < 1e-6, JSON.stringify(shared));
  t.check("cricket: the ridge is highest at the chimney (rise up)", Math.abs(Math.max(...shared.map((q) => q[1])) - p.rise) < 1e-6);
}
{ // skylight curb: four pans, each an apron on the roof and an upstand against the curb
  const s = sh("skylightcurb"), p = defaults(s), fs = solid(A.foldModel(s, p));
  const aprons = fs.filter(horiz), ups = fs.filter(vert);
  t.check("skylight curb: four aprons and four upstands", aprons.length === 4 && ups.length === 4, JSON.stringify([aprons.length, ups.length]));
  t.check("skylight curb: the upstands stand on the curb's sides", ups.every((f) => Math.abs(yRange(f)[1] - p.up) < 1.5 && f.pts.every((q) => Math.abs(Math.abs(q[0]) - p.w / 2) < 1e-6 || Math.abs(Math.abs(q[2]) - p.d / 2) < 1e-6)));
}
{ // dustpan: the bottom's back edge is the back's width (the flat pattern had it 1.5× too long), sides stand on the tapered edges
  const s = sh("dustpan"), p = defaults(s), cs = s.make(p);
  const quads = cs.filter((c) => c.closed !== false && c.pts.length === 4);
  const bot = quads.find((c) => { const ys = c.pts.map((q) => q[1]); return new Set(ys.map((y) => y.toFixed(3))).size === 2 && c.pts.some((q, i) => Math.abs(q[0] - c.pts[(i + 1) % 4][0]) > 1e-6 && Math.abs(q[1] - c.pts[(i + 1) % 4][1]) > 1e-6); });
  const backEdge = bot ? (() => { const yMax = Math.max(...bot.pts.map((q) => q[1])); const top = bot.pts.filter((q) => Math.abs(q[1] - yMax) < 1e-6); return Math.abs(top[0][0] - top[1][0]); })() : 0;
  t.check("dustpan: the bottom's back edge is the back width", Math.abs(backEdge - p.w) < 1e-6, String(backEdge));
  const fs = solid(A.foldModel(s, p));
  t.check("dustpan: a bottom, a back and two sides, front open", fs.filter(horiz).length === 1 && fs.filter(vert).length === 3);
}
{ // pipe clamp (U-saddle): a half wrap over the pipe with the two feet flat on the wall, each with its fixing hole
  const s = sh("pipeustrap"), p = defaults(s), fs = solid(A.foldModel(s, p));
  const feet = fs.filter((f) => horiz(f) && yRange(f)[1] < 1e-6);
  t.check("pipe clamp: two flat feet on the wall, each with its hole", feet.length === 2 && feet.every((f) => f.holes.length === 1), JSON.stringify(feet.map((f) => f.holes.length)));
  const top = Math.max(...fs.flatMap((f) => f.pts.map((q) => q[1])));
  t.check("pipe clamp: the wrap goes over the pipe (top ≈ pipe Ø)", Math.abs(top - p.d) < 0.06 * p.d, String(top));
  const xs = feet.map((f) => f.pts.map((q) => q[2]));
  t.check("pipe clamp: the feet point outwards, either side of the pipe", feet.length === 2 && ((Math.max(...xs[0]) <= -p.d / 2 + 0.5 && Math.min(...xs[1]) >= p.d / 2 - 0.5) || (Math.max(...xs[1]) <= -p.d / 2 + 0.5 && Math.min(...xs[0]) >= p.d / 2 - 0.5)), JSON.stringify(xs.map((x) => [Math.min(...x), Math.max(...x)])));
}

process.exit(t.done() ? 1 : 0);

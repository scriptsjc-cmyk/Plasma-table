// r15 5.3 holes go through to the 3D automatically: every hole cut in a folded preset's flat pattern shows in its 3D,
// the same size, and the 3D shows no hole that isn't cut.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const t = new T("36_r15_holes3d");
const area2 = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
const inside = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
function newell(pts) { let x = 0, y = 0, z = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } return Math.hypot(x, y, z) / 2; }
const defaults = (s) => Object.fromEntries(s.params.map(([k, , d]) => [k, d]));

const folds = A.SHAPES.filter(A.isFoldPart);
t.check("there are folded presets to check", folds.length > 80, String(folds.length));
const bad = [], badArea = [];
for (const s of folds) {
  const p = defaults(s);
  let cs; try { cs = s.make(p) || []; } catch (e) { continue; }
  const cl = cs.filter((c) => c.closed !== false && c.role !== "bend" && c.pts.length >= 3);
  const holes = cl.filter((c) => cl.some((o) => o !== c && area2(o.pts) > area2(c.pts) && inside(c.pts[0], o.pts)));
  const m = A.foldModel(s, p);
  if (!m) continue;
  const solid = m.faces.filter((f) => !f.ghost);
  const rings = solid.flatMap((f) => f.holes || []);
  const n3 = rings.length + (Number(m.openings) || 0);    // openings: holes shown by leaving the wrap's facets out
  if (n3 !== holes.length) bad.push(`${s.id} cut ${holes.length} / 3D ${n3}`);
  else if (!m.openings && holes.length) {
    const a2 = holes.reduce((x, c) => x + area2(c.pts), 0), a3 = rings.reduce((x, r) => x + newell(r), 0);
    if (Math.abs(a3 - a2) > 0.03 * a2) badArea.push(`${s.id} cut ${a2.toFixed(0)} / 3D ${a3.toFixed(0)}`);
  }
}
t.check("every cut hole shows in the 3D, and no extra ones", bad.length === 0, bad.join("; "));
t.check("the 3D holes are the cut holes' size", badArea.length === 0, badArea.join("; "));

// the brackets named in the plan, by name, with the hole on the right panel
const sh = (id) => A.SHAPES.find((s) => s.id === id);
{
  const s = sh("foldubr"), p = defaults(s), m = A.foldModel(s, p);
  const legs = m.faces.filter((f) => Math.abs(f.n[1]) < 0.02);
  t.check("U-bracket: one hole in each leg (not in the web)", legs.length === 2 && legs.every((f) => f.holes.length === 1) && m.faces.filter((f) => Math.abs(f.n[1]) > 0.99).every((f) => !f.holes.length));
}
{
  const s = sh("cabletray"), p = defaults(s), m = A.foldModel(s, p);
  const web = m.faces.filter((f) => Math.abs(f.n[1]) > 0.99 && Math.abs(f.pts[0][1]) < 1e-6);
  t.check("cable tray: the web holes are in the web", web.length === 1 && web[0].holes.length === Math.max(1, Math.floor(p.len / 50)));
  const top = Math.max(...m.faces.flatMap((f) => f.pts.map((q) => q[1])));
  t.check("cable tray: return flanges at the top of the sides, pointing in", Math.abs(top - p.leg) < 1e-6 && m.faces.filter((f) => Math.abs(f.n[1]) > 0.99 && Math.abs(f.pts[0][1] - p.leg) < 1e-6).length === 2);
}
{
  const s = sh("foldzbr"), p = defaults(s), m = A.foldModel(s, p);
  const ys = m.faces.map((f) => f.pts.map((q) => q[1]));
  const flats = m.faces.filter((f) => Math.abs(f.n[1]) > 0.99);
  t.check("Z-bracket: two legs bent opposite ways (one at the bottom, one at the top), each with its hole", flats.length === 2 && flats.every((f) => f.holes.length === 1) && Math.abs(Math.abs(flats[0].pts[0][1] - flats[1].pts[0][1]) - p.web) < 1e-6, JSON.stringify(ys));
}
{
  const s = sh("cyclonehop"), p = defaults(s), m = A.foldModel(s, p);
  const rings = m.faces.filter((f) => f.holes && f.holes.length);
  t.check("cyclone hopper: only the top ring that is cut shows", rings.length === 1);
}

process.exit(t.done() ? 1 : 0);

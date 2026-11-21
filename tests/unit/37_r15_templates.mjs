// r15 5.4 templates: the pipe templates (fishmouth, pipe-on-flat, tee, Y-branch, britches) are marked template: true,
// and their 3D draws the piece you cut in the accent colour on a grey pipe.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const F3 = await import("../../js/make/fold3d.js");
const t = new T("37_r15_templates");
const defaults = (s) => Object.fromEntries(s.params.map(([k, , d]) => [k, d]));
function newell(pts) { let x = 0, y = 0, z = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } return Math.hypot(x, y, z) / 2; }
const area2 = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };

const TEMPLATES = ["fishmouth", "fishflat", "teetemp", "ybranch", "britches"];
const marked = A.SHAPES.filter((s) => s.template === true).map((s) => s.id).sort();
t.check("exactly the five pipe templates are marked template: true", JSON.stringify(marked) === JSON.stringify(TEMPLATES.slice().sort()), JSON.stringify(marked));
for (const id of TEMPLATES) {
  const s = A.SHAPES.find((x) => x.id === id), p = defaults(s), m = A.foldModel(s, p);
  const solid = m ? m.faces.filter((f) => !f.ghost) : [];
  const acc = solid.filter((f) => f.accent), grey = solid.filter((f) => !f.accent);
  t.check(`${id}: the template is drawn in the accent colour`, acc.length > 0, String(acc.length));
  t.check(`${id}: on a grey pipe`, grey.length > 0, String(grey.length));
  const svg = F3.foldThumbSvg(F3.thicken(m, 1), 96, 72);
  t.check(`${id}: the thumbnail uses the accent colour`, /fill="rgb\((\d+),(\d+),(\d+)\)"/.test(svg) && [...svg.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)].some((x) => +x[3] > +x[1] + 60));
}
for (const id of ["fishmouth", "fishflat"]) {
  const s = A.SHAPES.find((x) => x.id === id), p = defaults(s), m = A.foldModel(s, p);
  const a3 = m.faces.filter((f) => f.accent && !f.ghost).reduce((x, f) => x + newell(f.pts), 0);
  const a2 = s.make(p).filter((c) => c.closed !== false).reduce((x, c) => x + area2(c.pts), 0);
  t.check(`${id}: the blue part is the template's size (3D ${a3.toFixed(0)} vs cut ${a2.toFixed(0)})`, Math.abs(a3 - a2) < 0.05 * a2);
}
t.check("a plain folded part has no accent faces", !A.foldModel(A.SHAPES.find((x) => x.id === "foldubr"), defaults(A.SHAPES.find((x) => x.id === "foldubr"))).faces.some((f) => f.accent));
const th = F3.thicken(A.foldModel(A.SHAPES.find((x) => x.id === "fishflat"), defaults(A.SHAPES.find((x) => x.id === "fishflat"))), 2);
t.check("thickness keeps the accent on the template's faces and edges", th.faces.filter((f) => f.accent).length > th.faces.filter((f) => !f.accent && !f.ghost && f.edge).length / 4);

process.exit(t.done() ? 1 : 0);

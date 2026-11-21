// r15 5.7 3D viewer extras: the sheet thickness on every face (the job's thickness unless the part says otherwise),
// dimension labels in 3D, and an Unfold slider from flat to folded.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const F3 = await import("../../js/make/fold3d.js");
const B = await import("../../js/make/bends.js");
const t = new T("39_r15_viewer3d");
const defaults = (s) => Object.fromEntries(s.params.map(([k, , d]) => [k, d]));
const sh = (id) => A.SHAPES.find((s) => s.id === id);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---- thickness
B.setBendContext({ thickness: () => null });
t.check("no job sheet: the 3D is drawn 3 mm thick", F3.displayThickness({}) === 3);
B.setBendContext({ thickness: () => 2 });
t.check("the 3D uses the job's sheet thickness (2 mm)", F3.displayThickness({}) === 2);
t.check("the part's own bend thickness wins (bt 1.2)", F3.displayThickness({ bt: 1.2 }) === 1.2);
{
  const s = sh("foldubr"), p = defaults(s), m = A.foldModel(s, p), th = F3.thicken(m, F3.displayThickness(p));
  const fronts = th.faces.filter((f) => !f.edge && !f.ghost), backs = th.faces.filter((f) => f.edge && f.holes && f.w !== 0 || (f.edge && f.pts.length > 4));
  t.check("every face gets its thickness (a front and a back per face)", fronts.length === m.faces.length && th.faces.filter((f) => f.edge).length >= m.faces.length, JSON.stringify([fronts.length, m.faces.length]));
  const span = (i) => { const v = th.faces.flatMap((f) => f.pts.map((q) => q[i])); return Math.max(...v) - Math.min(...v); };
  // r15 5.10 (Josh 21 Nov): the sheet lies on the inside of the bends, so the outside width is the web as drawn (it was web + 2 × 1 mm)
  t.check("the U-bracket's outside width is the web as drawn (the 2 mm sheet lies inside the bends)", Math.abs(span(2) - p.web) < 0.05 || Math.abs(span(0) - p.web) < 0.05, JSON.stringify([p.web, span(0), span(1), span(2)]));
}
B.setBendContext({ thickness: () => null });

// ---- dimensions
t.check("fold3d exports modelDims", typeof F3.modelDims === "function");
{
  const s = sh("foldubr"), p = defaults(s), d = F3.modelDims(A.foldModel(s, p));
  const got = [d.x, d.y, d.z].map((v) => Math.round(v)).sort((a, b) => a - b);
  t.check("U-bracket dimensions: 40 × 40 × 50 (len, leg, web)", JSON.stringify(got) === JSON.stringify([40, 40, 50]), JSON.stringify(d));
  const labels = F3.dimLabels(A.foldModel(s, p), F3.DEFAULT_CAM, 400, 300);
  t.check("three dimension labels, in mm", labels.length === 3 && labels.every((l) => /^\d+(\.\d)? mm$/.test(l.text) && Number.isFinite(l.x) && Number.isFinite(l.y)), JSON.stringify(labels));
}

// ---- unfold
t.check("foldModel takes an unfold amount", F3.foldModel.length >= 2);
for (const id of ["foldubr", "openbox", "foldzbr", "signbr", "cabletray"]) {
  const s = sh(id), p = defaults(s);
  const flat = F3.foldModel(s, p, { fold: 0 }), half = F3.foldModel(s, p, { fold: 0.5 }), full = F3.foldModel(s, p);
  const n0 = flat.faces[0].n;
  t.check(`${id}: unfolds (has the slider)`, full.unfoldable === true);
  t.check(`${id}: Unfold at 0 lies flat (every face parallel)`, flat.faces.every((f) => Math.abs(Math.abs(dot(f.n, n0)) - 1) < 1e-6));
  t.check(`${id}: half way, folds are part bent`, half.faces.some((f) => { const c = Math.abs(dot(f.n, half.faces[0].n)); return c > 0.05 && c < 0.95; }));
}
t.check("a rolled cone has no Unfold slider", !F3.foldModel(sh("cone"), defaults(sh("cone"))).unfoldable);
process.exit(t.done() ? 1 : 0);

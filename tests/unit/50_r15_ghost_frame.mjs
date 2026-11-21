// r15 7.5 (found with the takeoff screenshot): the ghost (context) parts of a 3D, such as the main duct under a take-off or
// the header under a fishmouth, must be drawn in the same frame as the part itself. Each was framed to fit the view on its
// own, so the ghost was drawn at another size and place (the take-off looked as if it hung under its duct).
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const F3 = await import("../../js/make/fold3d.js");
const t = new T("50_r15_ghost_frame");
// a canvas that records the points of every filled path, with the alpha it was filled at
function fakeCanvas() {
  const fills = []; let cur = [], alpha = 1; const stack = [];
  const ctx = new Proxy({}, { get(_, k) {
    if (k === "moveTo" || k === "lineTo") return (x, y) => cur.push([x, y]);
    if (k === "beginPath") return () => { cur = []; };
    if (k === "fill") return () => fills.push({ alpha, pts: cur.slice() });
    if (k === "save") return () => stack.push(alpha);
    if (k === "restore") return () => { alpha = stack.length ? stack.pop() : 1; };
    if (k === "createLinearGradient") return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "globalAlpha") return alpha;
    return () => {};
  }, set(_, k, v) { if (k === "globalAlpha") alpha = v; return true; } });
  return { cv: { clientWidth: 400, clientHeight: 300, width: 800, height: 600, getContext: () => ctx }, fills };
}
const V = (x, y, z) => [x, y, z];
// a solid square and a far bigger, long ghost plate (not the same shape, so it cannot land on the square by chance); the ghost has one face exactly on the solid one
const sq = [V(0, 0, 0), V(100, 0, 0), V(100, 0, 100), V(0, 0, 100)];
const faces = [{ pts: sq, n: V(0, 1, 0), holes: [] }, { pts: sq.map((q) => q.slice()), n: V(0, 1, 0), holes: [], ghost: true },
  { pts: [V(-500, -400, -60), V(700, -400, -60), V(700, -400, 140), V(-500, -400, 140)], n: V(0, -1, 0), holes: [], ghost: true }];
const { cv, fills } = fakeCanvas();
F3.drawFoldCanvas(cv, { faces });
const ghost = fills.filter((f) => f.alpha < 1 && f.pts.length === 4), solid = fills.filter((f) => f.alpha === 1 && f.pts.length === 4);
const key = (f) => f.pts.map((q) => q.map((v) => v.toFixed(1)).join(",")).sort().join(" ");
t.check("a ghost face on the same points as a solid face is drawn on the same pixels", solid.length >= 1 && ghost.some((g) => solid.some((s) => key(s) === key(g))), `solid ${solid.map(key).join(" | ")} ghost ${ghost.map(key).join(" | ")}`);
// thickening sits the view on the table: every point (shared or not, holes too) must move by the same amount, once.
// (Points shared by a face and its edge caps were moved two or three times, so with a ghost below the part, as under the
// take-off, the part was pulled apart: 96.6 mm tall became 228 mm.)
{
  const sh = A.SHAPES.find((x) => x.id === "takeoff"), p = Object.fromEntries(sh.params.map(([k, , v]) => [k, v]));
  const m = A.foldModel(sh, p), th = F3.thicken(m, 3);
  const ext = (fs) => { const v = fs.flatMap((f) => f.pts.map((q) => q[1])); return Math.max(...v) - Math.min(...v); };
  const solid = (mm) => mm.faces.filter((f) => !f.ghost), ghost = (mm) => mm.faces.filter((f) => f.ghost);
  const lift = Math.min(...ghost(th).flatMap((f) => f.pts.map((q) => q[1]))) - Math.min(...ghost(m).flatMap((f) => f.pts.map((q) => q[1])));
  const sLift = Math.min(...solid(th).flatMap((f) => f.pts.map((q) => q[1]))) - Math.min(...solid(m).flatMap((f) => f.pts.map((q) => q[1])));
  t.check("take-off thickened at 3 mm: the part keeps its height (within the sheet)", Math.abs(ext(solid(th)) - ext(solid(m))) <= 3.01, `${ext(solid(m)).toFixed(1)} → ${ext(solid(th)).toFixed(1)} mm`);
  t.check("take-off thickened: the part and its ghost duct move up together", Math.abs(lift - sLift) <= 3.01, `ghost +${lift.toFixed(1)}, part +${sLift.toFixed(1)}`);
}
{ // a plate with a hole, standing below the table: after thickening the hole is still in the middle of the plate
  const pts = [V(0, -50, 0), V(100, -50, 0), V(100, 50, 0), V(0, 50, 0)], hole = [V(40, -10, 0), V(40, 10, 0), V(60, 10, 0), V(60, -10, 0)];
  const th = F3.thicken({ faces: [{ pts, n: V(0, 0, 1), holes: [hole] }] }, 2), f = th.faces[0];
  const cy = (q) => q.reduce((a, v) => a + v[1], 0) / q.length;
  t.check("a hole moves with its face when the view is sat on the table", Math.abs(cy(f.pts) - cy(f.holes[0])) < 1e-6, `face y ${cy(f.pts).toFixed(2)}, hole y ${cy(f.holes[0]).toFixed(2)}`);
}
process.exit(t.done() ? 1 : 0);

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
process.exit(t.done() ? 1 : 0);

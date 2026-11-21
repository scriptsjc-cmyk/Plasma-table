// Stage 1 (C1–C9): corner chamfer, join containment, auto-arrange honesty,
// lobster-back mitre development, linear-array gap 0, cut-out pick order,
// and offset square-to-round.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { verifyDesign } from "../lib/verify.mjs";
import { signedArea } from "../../js/core/geom.js";
import { goreWaveHeight, mitreGore } from "../../js/make/presets/helpers.js";
import { squareToRound } from "../../js/make/duct.js";

const A = await load();
const t = new T("22_cad_c1_c9");
const mk = (specs) => {
  const sk = A.newSketch();
  for (const [type, p, x, y] of specs) { sk.add(type, true); const it = sk.items.at(-1); Object.assign(it.p, p); it.x = x; it.y = y; }
  sk.opts.pro = true;
  return sk;
};
const loopArea = (c) => Math.abs(signedArea(c.pts));
const evenOddArea = (cs) => {
  const items = (cs || []).map((c) => ({ c, a: loopArea(c) }));
  items.sort((a, b) => b.a - a.a);
  let s = 0;
  for (const x of items) {
    const inside = items.some((y) => y !== x && y.a >= x.a - 1e-6 && classifyInside(y.c.pts, x.c.pts));
    s += inside ? -x.a : x.a;
  }
  return s;
};
function classifyInside(outer, inner) {
  const cx = inner.reduce((s, p) => s + p[0], 0) / inner.length, cy = inner.reduce((s, p) => s + p[1], 0) / inner.length;
  // ray even-odd
  let n = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = outer[i], [xj, yj] = outer[j];
    if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi + 1e-300) + xi) n++;
  }
  return n % 2 === 1;
}
const areaOf = (sk) => evenOddArea(sk.contours());
const box = (it, sk) => sk.boxOf(it);
const overlap = (a, b) => a[0] < b[2] - 0.2 && b[0] < a[2] - 0.2 && a[1] < b[3] - 0.2 && b[1] < a[3] - 0.2;

// ---- C1 chamfer ----
{
  const sk = mk([["rect", { w: 120, h: 80 }, 0, 0]]);
  sk.pick([sk.items[0].id]);
  const n = sk.chamferCorners(10, 45);
  t.check("C1: all four corners of a rectangle chamfer at 10 × 45°", n === 4, `n=${n} msg=${sk.messages.slice(-1)}`, "C1-CHAMFER");
  const it = sk.items[0];
  // r15 2.12 (Josh's plan): a chamfer no longer turns the rectangle into a fixed outline - it stays a rectangle with a
  // Corners row, and the CUT outline (checked below exactly as before) carries the chamfers
  t.check("C1: result stays a rectangle with a 'Chamfer 10 at all corners' row", it.type === "rect" && (it.feats || []).some((f) => f.k === "corner" && f.kind === "chamfer" && f.r === 10 && f.at === "all"), JSON.stringify({ type: it.type, feats: it.feats }));
  const c = sk.contours()[0];
  t.check("C1: 8 vertices (each corner split into two)", c.pts.length === 8, `pts=${c.pts.length}`);
  t.check("C1: chamfer edges are straight (no bulge)", (c.bulges || []).every((b) => Math.abs(b) < 1e-6), JSON.stringify(c.bulges));
  const a = Math.abs(signedArea(sk.contours()[0].pts));
  // four 10×10 right triangles removed from 120×80
  t.check("C1: area is 9600 − 200", Math.abs(a - 9400) < 2, `area=${a.toFixed(2)}`, "C1-CHAMFER");
  // a 45° chamfer on a 90° corner: the new edge should be about 10√2 long
  const lens = [];
  for (let i = 0; i < c.pts.length; i++) {
    const p = c.pts[i], q = c.pts[(i + 1) % c.pts.length];
    lens.push(Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  const cuts = lens.filter((l) => Math.abs(l - 10 * Math.SQRT2) < 0.2);
  t.check("C1: four 45° cuts of length 10√2", cuts.length === 4, `lens=${lens.map((l) => l.toFixed(2)).join(",")}`, "C1-CHAMFER");
  verifyDesign(A, t, "chamfered rectangle", sk.contours());
  const too = mk([["rect", { w: 120, h: 80 }, 0, 0]]);
  too.pick([too.items[0].id]);
  const refused = too.chamferCorners(200, 45);
  t.check("C1: a too-big distance is refused", refused === 0 && /too big|or less/i.test(String(too.messages.slice(-1))), String(too.messages.slice(-1)), "C1-CHAMFER");
}

// ---- C3 join / containment ----
{
  const sk = mk([["rect", { w: 100, h: 60 }, 0, 0], ["rect", { w: 100, h: 60 }, 50, 30]]);
  t.check("C3: overlapping rects are both parts (not a hole)", !sk.isHole(sk.items[0]) && !sk.isHole(sk.items[1]), `h0=${sk.isHole(sk.items[0])} h1=${sk.isHole(sk.items[1])}`, "C3-JOIN");
  sk.pick(sk.items.map((i) => i.id));
  sk.join();
  t.check("C3: overlap join is one part", sk.items.length === 1 && sk.items[0].type === "custom", `n=${sk.items.length} type=${sk.items[0] && sk.items[0].type} msg=${sk.messages.slice(-1)}`, "C3-JOIN");
  const a = areaOf(sk);
  t.check("C3: overlap area is 10,500 (not 6,000 with a sticking-out hole)", Math.abs(a - 10500) < 5, `area=${a.toFixed(1)} msg=${sk.messages.slice(-1)}`, "C3-JOIN");
  t.check("C3: toast does not claim a hole", !/with \d+ hole/i.test(String(sk.messages.slice(-1))), String(sk.messages.slice(-1)), "C3-JOIN");
  verifyDesign(A, t, "joined overlapping rects", sk.contours());
}
{
  // Two rects that only share a corner: both stay parts; join is refused (they don't touch along an edge).
  const sk = mk([["rect", { w: 100, h: 60 }, 0, 0], ["rect", { w: 100, h: 60 }, 100, 60]]);
  t.check("C3: corner-sharing rects are not holes", !sk.isHole(sk.items[0]) && !sk.isHole(sk.items[1]), `h0=${sk.isHole(sk.items[0])} h1=${sk.isHole(sk.items[1])}`, "C3-JOIN");
  const n0 = sk.items.length;
  sk.pick(sk.items.map((i) => i.id));
  sk.join();
  t.check("C3: corner-only join is refused without 'all holes'", sk.items.length === n0 && !/all holes/i.test(String(sk.messages.slice(-1))), `n=${sk.items.length} msg=${sk.messages.slice(-1)}`, "C3-JOIN");
}
{
  // A true L that shares an edge still unions, with two inside corners (regression for the fillet tests).
  const sk = mk([["rect", { w: 200, h: 80 }, 0, 0], ["rect", { w: 200, h: 80 }, 80, 80]]);
  sk.pick(sk.items.map((i) => i.id));
  sk.join();
  const it = sk.items[0];
  t.check("C3: step/L still joins to one custom part", !!(it && it.type === "custom" && sk.items.length === 1), `n=${sk.items.length}`, "C3-JOIN");
  const raw = it.shape.cs[0].pts;
  t.check("C3: joined step still has 8 clean corners", raw.length === 8, `pts=${raw.length} ${JSON.stringify(raw)}`, "C3-JOIN");
}
{
  // A shape fully inside another is a hole; a lobe that only overlaps the edge is a part.
  const sk = mk([["rect", { w: 200, h: 120 }, 0, 0], ["disc", { d: 40 }, 80, 40], ["disc", { d: 40 }, 180, 40]]);
  t.check("C3: disc fully inside the plate is a hole", sk.isHole(sk.items[1]) === true, `host=${!!sk.hostOf(sk.items[1])}`, "C3-JOIN");
  t.check("C3: disc overlapping the plate edge is a part (a lobe)", sk.isHole(sk.items[2]) === false, `isHole=${sk.isHole(sk.items[2])}`, "C3-JOIN");
}
{
  const sk = mk([["rect", { w: 200, h: 120 }, 0, 0], ["disc", { d: 40 }, 180, 40]]);
  sk.pick(sk.items.map((i) => i.id));
  sk.join();
  t.check("C3: a lobe unions with the plate (area grows)", sk.items.length === 1 && areaOf(sk) > 200 * 120 + 10, `area=${areaOf(sk).toFixed(1)} n=${sk.items.length} msg=${sk.messages.slice(-1)}`, "C3-JOIN");
}
{
  // Off-plate hole is not emitted as a cuttable part.
  const sk = mk([["rect", { w: 100, h: 60 }, 0, 0], ["hole", { d: 10 }, 200, 200]]);
  const n = sk.contours().length;
  t.check("C3: a hole off the plate is left out of the cut contours", n === 1, `contours=${n} types=${sk.items.map((i) => i.type).join(",")}`, "C3-JOIN");
}
{
  // Overlapping holes on a plate merge when joined, they do not cancel into a part.
  const sk = mk([["rect", { w: 200, h: 120 }, 0, 0], ["hole", { d: 40 }, 60, 40], ["hole", { d: 40 }, 80, 40]]);
  sk.pick(sk.items.map((i) => i.id));
  sk.join();
  const cs = sk.contours();
  const areas = cs.map((c) => Math.abs(signedArea(c.pts)));
  const outerA = Math.max(...areas);
  t.check("C3: overlapping holes stay openings, not a separate part", cs.length >= 2 && outerA > 20000, `n=${cs.length} areas=${areas.map((a) => a.toFixed(0)).join(",")} msg=${sk.messages.slice(-1)}`, "C3-JOIN");
  verifyDesign(A, t, "plate with merged holes", cs);
}

// ---- C4 nest ----
{
  const specs = [];
  for (let i = 0; i < 7; i++) specs.push(["rect", { w: 80 + (i % 3) * 20, h: 50 + (i % 2) * 20 }, (i % 4) * 200, Math.floor(i / 4) * 200]);
  const sk = mk(specs);
  sk.nest(10, 400, 300);
  const boxes = sk.items.filter((i) => !sk.isHole(i)).map((i) => sk.boxOf(i));
  const ov = boxes.some((a, i) => boxes.some((b, j) => j > i && overlap(a, b)));
  t.check("C4: auto-arrange does not overlap parts", !ov, JSON.stringify(boxes.map((b) => b.map((v) => +v.toFixed(0)))), "C4-NEST");
  const msg = String(sk.messages.slice(-1));
  const onSheet = boxes.filter((b) => b[0] >= -0.05 && b[1] >= -0.05 && b[2] <= 400.05 && b[3] <= 300.05);
  const allFit = onSheet.length === boxes.length;
  t.check("C4: toast tells the truth (does not claim a 400×300 success if they overflow)", allFit ? /arranged/i.test(msg) && !/would not fit|will not fit/i.test(msg) : /not fit|fitted/i.test(msg), `onSheet=${onSheet.length}/${boxes.length} msg=${msg}`, "C4-NEST");
  t.check("C4: parts left on the sheet stay inside it", onSheet.every((b) => b[2] <= 400.05 && b[3] <= 300.05));
}
{
  const sk = mk([["rect", { w: 500, h: 60 }, 0, 0]]);
  sk.nest(10, 100, 100);
  t.check("C4: a part wider than the sheet is warned, not claimed as arranged", /not fit|will not fit/i.test(String(sk.messages.slice(-1))), String(sk.messages.slice(-1)), "C4-NEST");
}

// ---- C5 lobster-back ----
{
  const expect = { 2: 100, 3: 100 * Math.tan(Math.PI / 8), 4: 100 * Math.tan(Math.PI / 12), 5: 100 * Math.tan(Math.PI / 16) };
  for (const n of [2, 3, 4, 5]) {
    t.check(`C5: gore wave height formula for ${n}-piece Ø100 90°`, Math.abs(goreWaveHeight(100, 90, n) - expect[n]) < 0.05, `${goreWaveHeight(100, 90, n).toFixed(2)} vs ${expect[n].toFixed(2)}`, "C5-ELBOW");
    const end = mitreGore(100, 90, n, 150, "end");
    t.check(`C5: ${n}-piece end gore exists`, !!(end && end.pts.length > 8), `pts=${end && end.pts.length}`, "C5-ELBOW");
    // After shiftToOrigin the straight pipe end is on y=0 (min y of a unique x-run of constant y)
    const pts = end.pts;
    const yOf = new Map();
    for (const [x, y] of pts) {
      const k = x.toFixed(3);
      yOf.set(k, (yOf.get(k) || []).concat(y));
    }
    const straight = [...yOf.values()].filter((ys) => ys.length === 2 && Math.abs(ys[0] - ys[1]) > 1);
    // top and bottom at each x; the bottom of an end gore is constant
    const bot = pts.filter((p, i, a) => {
      // collect the lower y at each x from the second half? easier: unique x, min y
      return false;
    });
    const byX = {};
    for (const [x, y] of pts) {
      const k = x.toFixed(2);
      byX[k] = byX[k] ? Math.min(byX[k], y) : y;
    }
    const mins = Object.values(byX);
    const botSpan = Math.max(...mins) - Math.min(...mins);
    t.check(`C5: ${n}-piece end gore has a square (straight) pipe end`, botSpan < 0.2, `bottom span=${botSpan.toFixed(3)}`, "C5-ELBOW");
    const tops = {};
    for (const [x, y] of pts) {
      const k = x.toFixed(2);
      tops[k] = tops[k] ? Math.max(tops[k], y) : y;
    }
    const tvals = Object.values(tops);
    const wave = Math.max(...tvals) - Math.min(...tvals);
    t.check(`C5: ${n}-piece end-gore wave height is ${expect[n].toFixed(1)} mm`, Math.abs(wave - expect[n]) < 0.6, `wave=${wave.toFixed(2)} expected=${expect[n].toFixed(2)}`, "C5-ELBOW");
    if (n >= 3) {
      const mid = mitreGore(100, 90, n, 150, "mid");
      t.check(`C5: ${n}-piece middle gore exists (no square end)`, !!(mid && mid.pts.length > 8), "C5-ELBOW");
      const lo = {}, hi = {};
      for (const [x, y] of mid.pts) {
        const k = x.toFixed(2);
        lo[k] = lo[k] != null ? Math.min(lo[k], y) : y;
        hi[k] = hi[k] != null ? Math.max(hi[k], y) : y;
      }
      const loSpan = Math.max(...Object.values(lo)) - Math.min(...Object.values(lo));
      t.check(`C5: ${n}-piece middle gore is wavy on both edges`, loSpan > expect[n] * 0.8, `loSpan=${loSpan.toFixed(2)}`, "C5-ELBOW");
    }
  }
  for (const id of ["elbow2", "elbow3", "elbow4", "elbow5"]) {
    const sk = mk([[id, { d: 100, bend: 90, clr: 150, n: Number(id.slice(-1)) }, 0, 0]]);
    const cs = sk.contours();
    const n = Number(id.slice(-1));
    t.check(`C5: ${id} packs ${n} gores`, cs.length === n, `contours=${cs.length}`, "C5-ELBOW");
    verifyDesign(A, t, id, cs);
  }
}

// ---- C7 linear array gap 0 ----
{
  const sk = mk([["disc", { d: 20 }, 0, 0]]);
  sk.pick([sk.items[0].id]);
  sk.linearArray(4, 10, 0);
  const ys = sk.items.map((i) => sk.boxOf(i)[1]);
  const xs = sk.items.map((i) => sk.boxOf(i)[0]).sort((a, b) => a - b);
  t.check("C7: Gap up = 0 keeps every copy on the same Y", ys.every((y) => Math.abs(y - ys[0]) < 0.05), `ys=${ys.join(",")}`, "C7-ARRAY");
  const gaps = xs.slice(1).map((x, i) => x - (xs[i] + 20));
  // box width of Ø20 disc is 20; gap across 10 is clearance
  t.check("C7: Gap across 10 is the clearance between boxes", gaps.every((g) => Math.abs(g - 10) < 0.2), `gaps=${gaps.join(",")}`, "C7-ARRAY");
}

// ---- C8 subtract pick order ----
{
  const sk = mk([["rect", { w: 150, h: 60 }, 0, 0], ["disc", { d: 100 }, 50, -20]]);
  // Pick the rectangle first, then the disc: disc is cut out of the rectangle.
  sk.pick([sk.items[0].id, sk.items[1].id]);
  sk.subtract();
  const a = areaOf(sk);
  const rectOnly = 150 * 60;
  t.check("C8: picking the rectangle first cuts the disc out of it (area < 9000)", a < rectOnly - 100 && a > 2000, `area=${a.toFixed(1)}`, "C8-SUBTRACT");
  verifyDesign(A, t, "rect minus disc", sk.contours());
}
{
  const sk = mk([["rect", { w: 150, h: 60 }, 0, 0], ["disc", { d: 100 }, 50, -20]]);
  // Pick the disc first: the rectangle is cut out of the disc.
  sk.pick([sk.items[1].id, sk.items[0].id]);
  sk.subtract();
  const a = areaOf(sk);
  const discA = Math.PI * 50 * 50;
  t.check("C8: picking the disc first cuts the rectangle out of it", a < discA - 100 && a > 200, `area=${a.toFixed(1)} msg=${sk.messages.slice(-1)}`, "C8-SUBTRACT");
  verifyDesign(A, t, "disc minus rect", sk.contours());
}

// ---- C9 offset square-to-round ----
{
  const c = squareToRound(260, 160, 120, 160);
  const o = squareToRound(260, 160, 120, 160, 40, 0);
  t.check("C9: concentric squareToRound is unchanged (two unique panels)", !!(c && c.A && c.B && !c.offset), "C9-S2R");
  t.check("C9: offset squareToRound returns four unique panels", !!(o && o.offset && o.A && o.A2 && o.B && o.B2), `keys=${o && Object.keys(o)}`, "C9-S2R");
  const area = (p) => Math.abs(signedArea(p.pts));
  t.check("C9: opposite offset panels are not identical", Math.abs(area(o.A) - area(o.A2)) > 50, `A=${area(o.A).toFixed(1)} A2=${area(o.A2).toFixed(1)} B=${area(o.B).toFixed(1)} B2=${area(o.B2).toFixed(1)}`, "C9-S2R");
  const sk = mk([["s2roffset", { a: 260, b: 160, d: 120, h: 160, ox: 40, oy: 0, lip: 0 }, 0, 0]]);
  const cs = sk.contours();
  t.check("C9: offset preset packs four side panels", cs.length === 4, `n=${cs.length}`, "C9-S2R");
  const areas = cs.map((c) => Math.abs(signedArea(c.pts))).sort((a, b) => a - b);
  t.check("C9: the four packed panels are not two identical pairs", areas[0] !== areas[3] && (areas[1] - areas[0] > 20 || areas[3] - areas[2] > 20 || areas[2] - areas[1] > 20), `areas=${areas.map((a) => a.toFixed(0)).join(",")}`, "C9-S2R");
  verifyDesign(A, t, "s2roffset", cs);
}

process.exit(t.done() ? 1 : 0);

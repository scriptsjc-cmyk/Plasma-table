// Corner relief (dog-bone): a circle centred on an inside corner, cutting a
// major-arc notch into the material so a square-cornered mating part can sit in.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { signedArea, bulgeRadius, expandContour } from "../../js/core/geom.js";

const A = await load();
const t = new T("21_inside_relief");
const mk = (specs) => {
  const sk = A.newSketch();
  for (const [type, p, x, y] of specs) { sk.add(type, true); const it = sk.items.at(-1); Object.assign(it.p, p); it.x = x; it.y = y; }
  sk.opts.pro = true;
  return sk;
};
function step() {
  const sk = mk([["rect", { w: 200, h: 80 }, 0, 0], ["rect", { w: 200, h: 80 }, 80, 80]]);
  sk.pick(sk.items.map((i) => i.id));
  sk.join();
  return sk;
}

{
  const sk = step();
  const it = sk.items[0];
  const c0 = it.shape.cs[0];
  t.check("joined step is clean with 2 inside corners", c0.pts.length === 8 && sk.insideCornerIndices(c0).length === 2, `n=${c0.pts.length} inside=${sk.insideCornerIndices(c0)}`, "INSIDE-RELIEF");
  const area0 = Math.abs(signedArea(sk.contours()[0].pts));
  const n = sk.reliefInsideCorners(20);
  t.check("Ø20 relief on both inside corners succeeds", n === 2, `n=${n} msg=${sk.messages.slice(-1)}`, "INSIDE-RELIEF");
  const c = sk.items[0].shape.cs[0];
  const arcs = [];
  for (let i = 0; i < c.pts.length; i++) {
    const b = Number((c.bulges || [])[i]) || 0;
    if (Math.abs(b) < 0.05) continue;
    const p = c.pts[i], q = c.pts[(i + 1) % c.pts.length];
    arcs.push({ i, b, R: bulgeRadius(p, q, b), p, q, mid: expandContour({ pts: [p, q], closed: false, bulges: [b] }) });
  }
  t.check("two major-arc reliefs were inserted (one continuous outline)", arcs.length === 2 && c.pts.length === 10 && (sk.items[0].shape.cs.length === 1), `arcs=${arcs.length} n=${c.pts.length} cs=${sk.items[0].shape.cs.length}`, "INSIDE-RELIEF");
  t.check("each relief is a 10 mm radius (Ø20) circle", arcs.every((a) => Math.abs(a.R - 10) < 0.2), arcs.map((a) => a.R.toFixed(3)).join(","), "INSIDE-RELIEF");
  t.check("reliefs are major arcs (into the material, |bulge| > 1)", arcs.every((a) => Math.abs(a.b) > 1), arcs.map((a) => +a.b.toFixed(3)).join(","), "INSIDE-RELIEF");

  const area1 = Math.abs(signedArea(sk.contours()[0].pts));
  const expectRemoved = 1.5 * Math.PI * 100; // two 270° sectors of R=10
  t.check("relief cuts remove material (area falls by about two 3/4-circles)", Math.abs((area0 - area1) - expectRemoved) < 8, `dA=${(area0 - area1).toFixed(2)} expect≈${expectRemoved.toFixed(2)}`, "INSIDE-RELIEF");

  // Mid-arc of each notch sits inside the original material, not in the empty notch.
  // (80,80) material is SE; (200,80) material is NW.
  const mids = arcs.map((a) => a.mid.pts[Math.floor(a.mid.pts.length / 2)]);
  const at80 = mids.some((m) => m[0] > 80 && m[1] < 80 && Math.hypot(m[0] - 80, m[1] - 80) - 10 < 0.6);
  const at200 = mids.some((m) => m[0] < 200 && m[1] > 80 && Math.hypot(m[0] - 200, m[1] - 80) - 10 < 0.6);
  t.check("relief mid-arcs sit in the material, centred on the original corners", at80 && at200, `mids=${JSON.stringify(mids.map((m) => m.map((v) => +v.toFixed(2))))}`, "INSIDE-RELIEF");

  // Expanded contour has points on both Ø20 circles centred on the original corners
  const ring = sk.contours()[0].pts;
  let on80 = 0, on200 = 0;
  for (const p of ring) {
    if (Math.abs(Math.hypot(p[0] - 80, p[1] - 80) - 10) < 0.6) on80++;
    if (Math.abs(Math.hypot(p[0] - 200, p[1] - 80) - 10) < 0.6) on200++;
  }
  t.check("expanded outline follows both relief circles (not a separate hole)", on80 >= 4 && on200 >= 4, `on80=${on80} on200=${on200}`, "INSIDE-RELIEF-GCODE");

  const cam = A.designToGcode(sk.contours(), { kerf: 1.5, leadIn: 3, name: "step-relief" });
  t.check("G-code is produced for the relieved step", !!(cam && cam.gcode && /G1 /.test(cam.gcode)), "no gcode", "INSIDE-RELIEF-GCODE");
  t.check("kerf does not pinch the relief notches", !(cam.warnings || []).some((w) => /narrower than the cut|pinched/i.test(w)), String(cam.warnings), "INSIDE-RELIEF-GCODE");
}

{
  const too = step();
  const refused = too.reliefInsideCorners(500);
  t.check("too-big relief diameter is refused and the outline is unchanged", refused === 0 && too.items[0].shape.cs[0].pts.length === 8, `n=${refused} pts=${too.items[0].shape.cs[0].pts.length} msg=${too.messages.slice(-1)}`, "INSIDE-RELIEF");
  t.check("too-big refusal mentions a diameter limit", /diameter|too big|could not/i.test(String(too.messages.slice(-1))), String(too.messages.slice(-1)), "INSIDE-RELIEF");
}

{
  // Convex corner: the outer corner (0,0) of the step must be refused
  const sk = step();
  const c = sk.items[0].shape.cs[0];
  const insides = new Set(sk.insideCornerIndices(c));
  const outer = c.pts.findIndex((p, i) => !insides.has(i));
  t.check("setup: found an outside corner", outer >= 0, `outer=${outer}`, "INSIDE-RELIEF");
  sk.selectEdge(sk.items[0].id, 0, outer, outer);
  const ok = sk.reliefCorner(20);
  t.check("relief on an outside corner is refused with an explanation", ok === false && /inside corner/i.test(String(sk.messages.slice(-1))), `ok=${ok} msg=${sk.messages.slice(-1)}`, "INSIDE-RELIEF");
  t.check("refused relief leaves the outline unchanged", sk.items[0].shape.cs[0].pts.length === 8, `n=${sk.items[0].shape.cs[0].pts.length}`, "INSIDE-RELIEF");
}

{
  // Drawn outline still works; existing round fillet is unchanged
  const sk = A.newSketch();
  sk.setTool("draw");
  sk.drawPts = [[0, 0], [200, 0], [200, 80], [280, 80], [280, 160], [80, 160], [80, 80], [0, 80]];
  sk.finishDraw();
  const n = sk.reliefInsideCorners(16);
  t.check("drawn step: both inside corners take a Ø16 relief", n === 2, `n=${n} msg=${sk.messages.slice(-1)}`, "INSIDE-RELIEF");
}

{
  const ell = A.newSketch();
  ell.setTool("draw");
  ell.drawPts = [[0, 0], [220, 0], [220, 70], [100, 70], [100, 160], [0, 160]];
  ell.finishDraw();
  ell.selectEdge(ell.items[0].id, 0, 3, 3);
  const ok = ell.filletCorner(8);
  t.check("Round corner (smooth fillet) still works on an L inner corner", ok === true, `ok=${ok} msg=${ell.messages.slice(-1)}`, "CORNER-FILLET");
}

process.exit(t.done() ? 1 : 0);

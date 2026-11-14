// Inside (concave) corner fillets on a joined step/L and on a drawn outline:
// geometry, too-big refusal, and G-code / kerf follow the radius.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { signedArea, bulgeRadius, expandContour } from "../../js/core/geom.js";

const A = await load();
const t = new T("20_inside_fillet");
const mk = (specs) => {
  const sk = A.newSketch();
  for (const [type, p, x, y] of specs) { sk.add(type, true); const it = sk.items.at(-1); Object.assign(it.p, p); it.x = x; it.y = y; }
  sk.opts.pro = true;
  return sk;
};

function uniquePts(pts, min = 0.05) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < min) continue;
    out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < min) out.pop();
  return out;
}

// Two rectangles joined into a step: two inside corners at (80,80) and (200,80).
{
  const sk = mk([["rect", { w: 200, h: 80 }, 0, 0], ["rect", { w: 200, h: 80 }, 80, 80]]);
  sk.pick(sk.items.map((i) => i.id));
  sk.join();
  const it = sk.items[0];
  t.check("join makes one custom part", !!(it && it.type === "custom"), `type=${it && it.type} n=${sk.items.length}`, "INSIDE-FILLET");
  const c = it.shape.cs[0];
  const raw = c.pts, clean = uniquePts(raw);
  t.check("joined step has clean corners (no duplicate vertices)", raw.length === 8, `raw=${raw.length} unique=${clean.length} pts=${JSON.stringify(raw)}`, "INSIDE-FILLET");
  const insides = sk.insideCornerIndices(c);
  t.check("joined step has exactly 2 inside corners", insides.length === 2, `inside=${JSON.stringify(insides)} pts=${JSON.stringify(c.pts)}`, "INSIDE-FILLET");
  const area0 = Math.abs(signedArea(sk.contours()[0].pts));
  const n = sk.filletInsideCorners(10);
  t.check("All inside corners R10 succeeds on both", n === 2, `n=${n} msg=${sk.messages.slice(-1)}`, "INSIDE-FILLET");
  const c1 = sk.items[0].shape.cs[0];
  const bs = (c1.bulges || []).map((b) => Number(b) || 0);
  const arcs = [];
  for (let i = 0; i < c1.pts.length; i++) {
    const b = bs[i];
    if (Math.abs(b) < 0.05) continue;
    const p = c1.pts[i], q = c1.pts[(i + 1) % c1.pts.length];
    const R = bulgeRadius(p, q, b);
    arcs.push({ i, b, R, p, q });
  }
  t.check("two fillet arcs were inserted", arcs.length === 2 && c1.pts.length === 10, `arcs=${arcs.length} n=${c1.pts.length} R=${arcs.map((a) => a.R.toFixed(2))}`, "INSIDE-FILLET");
  t.check("each inside fillet is a 10 mm radius", arcs.every((a) => Math.abs(a.R - 10) < 0.15), arcs.map((a) => a.R.toFixed(3)).join(","), "INSIDE-FILLET");
  const area1 = Math.abs(signedArea(sk.contours()[0].pts));
  // two 90° inner fillets add 2 * (π r² / 4) ≈ 157.08 mm²
  t.check("inside fillets add material (area grows by about two quarter-circles)", Math.abs((area1 - area0) - 2 * Math.PI * 25) < 4, `dA=${(area1 - area0).toFixed(2)} expect≈157`, "INSIDE-FILLET");

  // tangent: the two legs around each arc stay axis-aligned on the original edges
  for (const a of arcs) {
    const exp = expandContour({ pts: [a.p, a.q], closed: false, bulges: [a.b] });
    // mid-arc sits in the empty (scrap) side of the original sharp corner
    const mid = exp.pts[Math.floor(exp.pts.length / 2)];
    const near80 = Math.hypot(mid[0] - 80, mid[1] - 80) < 20;
    const near200 = Math.hypot(mid[0] - 200, mid[1] - 80) < 20;
    t.check("fillet arc sits in the inside corner", near80 || near200, `mid=${mid.map((v) => +v.toFixed(2))}`, "INSIDE-FILLET");
  }

  const too = mk([["rect", { w: 200, h: 80 }, 0, 0], ["rect", { w: 200, h: 80 }, 80, 80]]);
  too.pick(too.items.map((i) => i.id)); too.join();
  const refused = too.filletInsideCorners(500);
  t.check("too-big inside radius is refused and the outline is unchanged", refused === 0 && too.items[0].shape.cs[0].pts.length === 8, `n=${refused} pts=${too.items[0].shape.cs[0].pts.length} msg=${too.messages.slice(-1)}`, "INSIDE-FILLET");
  t.check("too-big refusal mentions a limit or that it could not use the radius", /too big|or less|could not|already/i.test(String(too.messages.slice(-1))), String(too.messages.slice(-1)), "INSIDE-FILLET");

  // G-code + kerf: tessellated arcs stay on the 10 mm circle; kerf offset does not pinch
  const cam = A.designToGcode(sk.contours(), { kerf: 1.5, leadIn: 3, name: "step-fillet" });
  t.check("G-code is produced for the filleted step", !!(cam && cam.gcode && /G1 /.test(cam.gcode)), "no gcode", "INSIDE-FILLET-GCODE");
  t.check("kerf does not pinch the inside fillets", !(cam.warnings || []).some((w) => /narrower than the cut|pinched/i.test(w)), String(cam.warnings), "INSIDE-FILLET-GCODE");
  // points near each fillet on the design contour lie on the r=10 circle
  const ring = sk.contours()[0].pts;
  let onArc = 0;
  for (const p of ring) {
    if (Math.abs(Math.hypot(p[0] - 70, p[1] - 90) - 10) < 0.6) onArc++;       // inside corner (80,80), centre in scrap at (90,90)
    if (Math.abs(Math.hypot(p[0] - 210, p[1] - 70) - 10) < 0.6) onArc++;      // inside corner (200,80), centre (190,90)
  }
  t.check("expanded contour has points on both 10 mm inside-fillet arcs", onArc >= 4, `onArc=${onArc}`, "INSIDE-FILLET-GCODE");
}

// Drawn freehand outline (same step, two inside corners)
{
  const sk = A.newSketch();
  sk.setTool("draw");
  sk.drawPts = [[0, 0], [200, 0], [200, 80], [280, 80], [280, 160], [80, 160], [80, 80], [0, 80]];
  sk.finishDraw();
  const it = sk.items[0];
  const insides = sk.insideCornerIndices(it.shape.cs[0]);
  t.check("drawn step has 2 inside corners", insides.length === 2, `inside=${JSON.stringify(insides)}`, "INSIDE-FILLET");
  const n = sk.filletInsideCorners(12);
  t.check("drawn step: both inside corners fillet at R12", n === 2, `n=${n} msg=${sk.messages.slice(-1)}`, "INSIDE-FILLET");
  const bs = (sk.items[0].shape.cs[0].bulges || []).filter((b) => Math.abs(b || 0) > 0.05);
  t.check("drawn step keeps two curved edges", bs.length === 2, `bulges=${bs.length}`, "INSIDE-FILLET");
}

// Existing L inner-corner click path still works
{
  const ell = A.newSketch();
  ell.setTool("draw");
  ell.drawPts = [[0, 0], [220, 0], [220, 70], [100, 70], [100, 160], [0, 160]];
  ell.finishDraw();
  const host = ell.items[0];
  ell.selectEdge(host.id, 0, 3, 3);
  const ok = ell.filletCorner(8);
  t.check("Fillet R8 on a drawn L inner corner still succeeds", ok === true, `ok=${ok} msg=${ell.messages.slice(-1)}`, "CORNER-FILLET");
}

process.exit(t.done() ? 1 : 0);

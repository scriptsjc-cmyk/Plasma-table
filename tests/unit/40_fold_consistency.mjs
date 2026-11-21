// r15 7.5: every folded / rolled preset's 3D must be what gets cut. For every preset with a 3D model it fails when:
//   - the flat and 3D areas differ by more than 2 % (templates excepted: their 3D is the pipe the template wraps);
//   - the hole counts differ (templates excepted);
//   - a size field changes what is cut but not the 3D (the 3D ignores it; templates excepted);
//   - any two cut outlines overlap (catches Round 1.4);
// and checks the exact 3D size of a few parts whose fields are plainly the 3D's sizes.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const B = await import("../../js/make/bends.js");
B.setBendContext({ thickness: () => null });
const t = new T("40_fold_consistency");
const area2 = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
function newell(pts) { let x = 0, y = 0, z = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } return Math.hypot(x, y, z) / 2; }
const inside = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
const defaults = (s) => Object.fromEntries((s.params || []).map(([k, , d]) => [k, d]));
const solid = (m) => (m && m.faces ? m.faces.filter((f) => !f.ghost) : []);
const r3 = (v) => v.toFixed(3);
const sig3 = (m) => solid(m).map((f) => f.pts.map((q) => q.map(r3).join(",")).join(";") + "|" + (f.holes || []).map((r) => r.map((q) => q.map(r3).join(",")).join(";")).join("/")).join("\n");
const sig2 = (cs) => cs.map((c) => (c.role || "") + (c.op || "") + c.pts.map((q) => q.map(r3).join(",")).join(";")).join("\n");
const SHEET_KEYS = /^(bt|bir|bk|bd|bsz|split|sep|seg|segs|n|qty|copies)$/;
function bbox(m) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of solid(m)) for (const q of f.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
  return hi.map((h, k) => +(h - lo[k]).toFixed(4));
}

let n = 0;
const areaBad = [], holeBad = [], overlap = [], ignored = [];
for (const s of A.SHAPES) {
  const p = defaults(s);
  let m; try { m = A.foldModel(s, p); } catch (e) { t.check(`${s.id}: the 3D builds`, false, e.message); continue; }
  if (!m || !m.faces) continue;
  n++;
  const cs = s.make(p);
  const cl = cs.filter((c) => c.closed !== false && c.role !== "bend" && c.op !== "mark" && c.pts && c.pts.length >= 3);
  const depth = (c) => cl.filter((o) => o !== c && area2(o.pts) > area2(c.pts) && inside(c.pts[0], o.pts)).length;
  const fs = solid(m);
  if (!s.template) {
    const a2 = cl.reduce((x, c) => x + (depth(c) % 2 ? -1 : 1) * area2(c.pts), 0);
    const a3 = fs.reduce((x, f) => x + newell(f.pts) - (f.holes || []).reduce((y, r) => y + newell(r), 0), 0);
    if (!(a2 > 0) || Math.abs(a3 - a2) / a2 > 0.02) areaBad.push(`${s.id} ${(a3 / a2).toFixed(3)}`);
    // a model may draw a hole as cells left out of a rolled face and declare it (openings); it still has to match the cut
    const h2 = cl.filter((c) => depth(c) % 2 === 1).length, h3 = fs.reduce((x, f) => x + (f.holes || []).length, 0) + (Number(m.openings) || 0);
    if (h2 !== h3) holeBad.push(`${s.id} cut ${h2} / 3D ${h3}`);
    const c0 = sig2(cs), f0 = sig3(m);
    for (const [k, , d, o] of s.params || []) {
      if (typeof d !== "number" || !(d > 0) || (o && o.type === "select") || SHEET_KEYS.test(k)) continue;
      const q = { ...p, [k]: +(d * 1.1).toFixed(3) };
      let c1, f1; try { c1 = sig2(s.make(q)); f1 = sig3(A.foldModel(s, q)); } catch (e) { continue; }
      if (c1 !== c0 && f1 === f0) ignored.push(`${s.id}.${k}`);
    }
  }
  const outers = cl.filter((c) => depth(c) === 0);
  for (let i = 0; i < outers.length; i++) for (let j = i + 1; j < outers.length; j++) {
    if (outers[j].pts.some((q) => inside(q, outers[i].pts)) || outers[i].pts.some((q) => inside(q, outers[j].pts))) overlap.push(`${s.id} #${i}/#${j}`);
  }
}
t.check(`every fold preset has a 3D (${n} checked)`, n >= 90, String(n));
t.check("flat and 3D areas agree within 2 % (templates excepted)", areaBad.length === 0, areaBad.join(", "));
t.check("the 3D has the same holes as the cut (templates excepted)", holeBad.length === 0, holeBad.join(", "));
t.check("every size field that changes the cut also changes the 3D (templates excepted)", ignored.length === 0, ignored.join(", "));
t.check("no two cut outlines overlap", overlap.length === 0, overlap.join(", "));

// exact sizes where the fields are plainly the 3D's sizes
const sh = (id) => A.SHAPES.find((s) => s.id === id);
const sized = (id, extra, want, why) => {
  const s = sh(id), p = { ...defaults(s), ...extra }, b = bbox(A.foldModel(s, p)).slice().sort((x, y) => x - y), w = want(p).slice().sort((x, y) => x - y);
  t.check(`${id}: 3D size ${w.map((v) => +v.toFixed(2)).join(" × ")} (${why})`, b.every((v, i) => Math.abs(v - w[i]) < 0.05), JSON.stringify(b));
};
sized("foldubr", {}, (p) => [p.web, p.leg, p.len], "web × leg × width");
sized("tube", {}, (p) => [p.d, p.d, p.len != null ? p.len : p.h], "Ø × Ø × length");
sized("rectelbow", {}, (p) => [p.w, Math.max(10, p.r) + p.h, Math.max(10, p.r) + p.h], "cheek spacing w; 90° bend out to throat radius + duct height");
// r15 7.5-redelbow (Josh 21 Nov): the reducing elbow is tapering gores (unit 56 checks the joints). It starts upright on its
// big end, bends in the y–z plane: so it is exactly Ø d across x, its lowest ring is the round Ø d opening, and it has n gores.
{
  const s = sh("redelbow"), p = defaults(s), fs = solid(A.foldModel(s, p)), pts = fs.flatMap((f) => f.pts);
  const xs = pts.map((q) => q[0]), y0 = Math.min(...pts.map((q) => q[1])), low = pts.filter((q) => Math.abs(q[1] - y0) < 1e-6);
  const cx = low.reduce((a, q) => a + q[0], 0) / low.length, cz = low.reduce((a, q) => a + q[2], 0) / low.length;
  const radErr = Math.max(...low.map((q) => Math.abs(Math.hypot(q[0] - cx, q[2] - cz) - p.d / 2)));
  t.check(`redelbow: 3D is Ø ${p.d} across the bend plane, stands on a round Ø ${p.d} end, ${p.n} gores`,
    Math.abs(Math.max(...xs) - Math.min(...xs) - p.d) < 0.05 && low.length >= 24 && radErr < 0.05 && new Set(fs.map((f) => f.gore)).size === p.n,
    `x ${(Math.max(...xs) - Math.min(...xs)).toFixed(2)}, ${low.length} low points, radius off ${radErr.toFixed(3)}`);
}
// the offset rectangular transition's top opening sits ox along the width, as cut (rectangularTransition)
{
  const s = sh("recttransoff"), p = { ...defaults(s), ox: 30 }, fs = solid(A.foldModel(s, p));
  const top = Math.max(...fs.flatMap((f) => f.pts.map((q) => q[1]))), xs = fs.flatMap((f) => f.pts.filter((q) => Math.abs(q[1] - top) < 1e-6).map((q) => q[0]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  t.check("recttransoff: the 3D top opening is offset by ox (30 mm) and is a2 wide", Math.abs(cx - 30) < 0.05 && Math.abs(Math.max(...xs) - Math.min(...xs) - p.a2) < 0.05, `centre ${cx.toFixed(2)}, width ${(Math.max(...xs) - Math.min(...xs)).toFixed(2)}`);
}
// the hopper's top flange in 3D is the cut lip (strips trimmed where the cut trims them), joined blank and separate pieces
for (const split of [0, 1]) {
  const s = sh("hopflange"), p = { ...defaults(s), split }, cut = (q) => s.make(q).filter((c) => c.closed !== false && c.role !== "bend" && c.op !== "mark").reduce((x, c) => x + area2(c.pts), 0);
  const lipCut = cut(p) - cut({ ...p, lip: 0 });
  const fs = solid(A.foldModel(s, p)), top = Math.max(...fs.flatMap((f) => f.pts.map((q) => q[1])));
  const lip3 = fs.filter((f) => f.pts.every((q) => Math.abs(q[1] - top) < 1e-6)).reduce((x, f) => x + newell(f.pts), 0);
  t.check(`hopflange (${split ? "separate pieces" : "one blank"}): the 3D top flange is the cut lip (${lipCut.toFixed(0)} mm²)`, Math.abs(lip3 - lipCut) / lipCut < 0.005, `3D ${lip3.toFixed(0)} mm²`);
}
process.exit(t.done() ? 1 : 0);

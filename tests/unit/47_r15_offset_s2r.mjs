// r15 7.5 (found by unit 40): the offset (eccentric) square-to-round's flat panels must add up to the real surface.
// The panels were about a third too small at any offset (even 0.001 mm): a fan of triangles could be laid back over
// the panel instead of away from it, so the cut pieces could never close. Checked against an independent triangulation
// (each corner fanned to its quarter of the round, plus the four side triangles) and against the concentric pattern.
import { T } from "../lib/t.mjs";

const D = await import("../../js/make/duct.js");
const t = new T("47_r15_offset_s2r");
const area2 = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
const tri = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; };
function truth(A, B, d, H, ox, oy, n = 4000) {
  const C = [[A / 2, B / 2, 0], [-A / 2, B / 2, 0], [-A / 2, -B / 2, 0], [A / 2, -B / 2, 0]];
  const P = (th) => [ox + (d / 2) * Math.cos(th), oy + (d / 2) * Math.sin(th), H];
  let s = 0;
  for (let k = 0; k < 4; k++) for (let i = 0; i < n; i++) { const a = k * Math.PI / 2 + (i * Math.PI / 2) / n; s += tri(C[k], P(a), P(a + Math.PI / 2 / n)); }
  for (let k = 0; k < 4; k++) s += tri(C[k], C[(k + 1) % 4], P((k + 1) * Math.PI / 2));
  return s;
}
const total = (t2) => (t2.offset ? [t2.A, t2.B, t2.A2, t2.B2] : [t2.A, t2.B, t2.A, t2.B]).reduce((x, p) => x + area2(p.pts), 0);
const conc = total(D.squareToRound(260, 160, 120, 160, 0, 0));
const tiny = D.squareToRound(260, 160, 120, 160, 0.001, 0);
t.check("a 0.001 mm offset gives the same panels' area as the concentric pattern (within 0.5 %)", tiny && Math.abs(total(tiny) - conc) / conc < 0.005, JSON.stringify([tiny && Math.round(total(tiny)), Math.round(conc)]));
for (const [A, B, d, H, ox, oy] of [[260, 160, 120, 160, 40, 0], [260, 160, 120, 160, 0, 30], [300, 200, 150, 200, 50, -25], [400, 300, 200, 250, -60, 40]]) {
  const r = D.squareToRound(A, B, d, H, ox, oy), want = truth(A, B, d, H, ox, oy);
  t.check(`${A} × ${B} to Ø${d}, ${H} high, offset ${ox}, ${oy}: the four panels add up to the real surface (${Math.round(want)} mm², within 0.5 %)`, r && Math.abs(total(r) - want) / want < 0.005, JSON.stringify(r && Math.round(total(r))));
}
{ // true lengths: each panel's base is its rectangle side and its two seam edges are the 3D corner → round distances at ±45°
  const A = 260, B = 160, d = 120, H = 160, ox = 40, oy = 0, r = D.squareToRound(A, B, d, H, ox, oy), ps = [r.A, r.B, r.A2, r.B2];
  const C = [[-A / 2, -B / 2, 0], [A / 2, -B / 2, 0], [A / 2, B / 2, 0], [-A / 2, B / 2, 0]], mid = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const P = (th) => [ox + (d / 2) * Math.cos(th), oy + (d / 2) * Math.sin(th), H], d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const bad = [];
  ps.forEach((p, k) => {
    const q = p.pts, p0 = C[k], p1 = C[(k + 1) % 4];
    const want = [d3(p0, p1), d3(p1, P(mid[k] + Math.PI / 4)), d3(p0, P(mid[k] - Math.PI / 4))], got = [d2(q[0], q[1]), d2(q[1], q[2]), d2(q[0], q[q.length - 1])];
    if (want.some((w, i) => Math.abs(w - got[i]) > 0.01)) bad.push({ k, want: want.map((v) => +v.toFixed(2)), got: got.map((v) => +v.toFixed(2)) });
  });
  t.check("each offset panel's base and both seam edges are true lengths (they meet their neighbours)", bad.length === 0, JSON.stringify(bad.slice(0, 2)));
}
process.exit(t.done() ? 1 : 0);

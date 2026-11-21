// r15 7.5-saddle (Josh 21 Nov): the pipe-on-pipe saddle (cope) template must be the true intersection of a branch of
// radius r with a header of radius R, axes crossing at 90°. Wrapped round the branch, at angle θ (lateral offset
// r·sinθ across the header) the header surface is at √(R² − r²sin²θ) above the header axis, so the cope edge measured
// from its lowest points (the sides, sinθ = ±1) is  y(θ) = √(R² − r²sin²θ) − √(R² − r²): the branch is shortest on the
// header's crown line and longest at the sides. (It was R − √(R² − r²sin²θ), the same curve upside down: for 100 on 110
// it left gaps up to 6.35 mm.) Used by fishmouth, takeoff, britches and teetemp.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const { pipeSaddle } = await import("../../js/make/duct.js");
const t = new T("49_r15_saddle");
const exact = (d, D, th) => { const r = d / 2, R = D / 2; return Math.sqrt(R * R - r * r * Math.sin(th) ** 2) - Math.sqrt(R * R - r * r); };
const SIZES = [[80, 140], [100, 110], [80, 120], [50, 200], [150, 160], [100, 100]];
for (const [d, D] of SIZES) {
  const n = 48, s = pipeSaddle(d, D, 20, n), w = Math.PI * d;
  if (!t.check(`${d} on ${D}: the saddle builds`, !!s)) continue;
  let worst = 0, onHeader = 0;
  for (let i = 0; i <= n; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / n, [x, y] = s.pts[i];
    worst = Math.max(worst, Math.abs(x - (w * i) / n), Math.abs(y - exact(d, D, th)));
    // wrapped: the edge point (r·sinθ across the header, y up) must lie on the header, axis √(R² − r²) below y = 0
    const lat = (d / 2) * Math.sin(th), up = y + Math.sqrt((D / 2) ** 2 - (d / 2) ** 2);
    onHeader = Math.max(onHeader, Math.abs(Math.hypot(lat, up) - D / 2));
  }
  t.check(`${d} on ${D}: the cope edge is the exact intersection (within 0.01 mm)`, worst < 0.01, `worst ${worst.toFixed(3)} mm`);
  t.check(`${d} on ${D}: wrapped round the branch, the edge lies on the header surface`, onHeader < 0.01, `${onHeader.toFixed(3)} mm off`);
  t.check(`${d} on ${D}: shortest on the crown line, longest at the sides`, s.pts[n / 2][1] > s.pts[n / 4][1] + 0.5 * exact(d, D, 0) - 1e-9 && Math.abs(s.pts[n / 4][1]) < 1e-9);
}
// the four presets cut that curve
const near = (cs, d, D) => {
  const n = 48, w = Math.PI * d;
  return cs.some((c) => {
    if (c.closed === false || c.pts.length < n) return false;
    const x0 = Math.min(...c.pts.map((q) => q[0])), y0 = Math.min(...c.pts.map((q) => q[1]));
    for (let i = 0; i <= n; i++) {
      const th = -Math.PI + (2 * Math.PI * i) / n, ex = (w * i) / n + x0, ey = exact(d, D, th) + y0;
      if (!c.pts.some((q) => Math.hypot(q[0] - ex, q[1] - ey) < 0.01)) return false;
    }
    return true;
  });
};
for (const [id, q] of [["fishmouth", { d: 80, d2: 120, skirt: 30 }], ["fishmouth", { d: 100, d2: 110, skirt: 30 }], ["takeoff", { d: 80, d2: 140, len: 60, lip: 16 }], ["britches", { d: 80, d2: 140, len: 70 }], ["teetemp", { d: 80, d2: 100, len: 160, skirt: 25 }]]) {
  const s = A.SHAPES.find((x) => x.id === id), p = { ...Object.fromEntries(s.params.map(([k, , v]) => [k, v])), ...q };
  t.check(`${id} ${p.d} on ${p.d2}: the cut saddle is the exact intersection curve`, near(s.make(p), p.d, Math.max(p.d2, p.d)));
}
// takeoff 3D: the collar's shaped edge sits on the (ghost) main duct
{
  const s = A.SHAPES.find((x) => x.id === "takeoff"), p = Object.fromEntries(s.params.map(([k, , v]) => [k, v]));
  const m = A.foldModel(s, p), R = p.d2 / 2, r = p.d / 2, yA = -Math.sqrt(R * R - r * r);
  const ghost = m.faces.filter((f) => f.ghost), along = (() => { const q = ghost[0].pts; let best = [0, 0, 0]; for (const a of q) for (const b of q) { const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; if (Math.hypot(...v) > Math.hypot(...best)) best = v; } return best.map((v) => Math.abs(v)); })();
  const axisZ = along[2] > along[0];
  const edge = m.faces.filter((f) => !f.ghost).flatMap((f) => f.pts).filter((q) => q[1] < R - Math.sqrt(R * R - r * r) + 1e-6);
  const off = Math.max(...edge.map((q) => Math.abs(Math.hypot(axisZ ? q[0] : q[2], q[1] - yA) - R)));
  t.check("takeoff 3D: the main duct runs across the collar's sides and the collar edge sits on it (within 0.05 mm)", axisZ && off < 0.05, `duct along ${axisZ ? "z" : "x"}, edge ${off.toFixed(3)} mm off`);
}
process.exit(t.done() ? 1 : 0);

// r15 7.5-redelbow (Josh 21 Nov): a real reducing elbow, cut as n gores that taper and turn.
//
// One right cone runs from the big end (radius R1, z = 0) to the small end (radius R2, z = H) along +z. Mitre planes
// through the axis, tilted ±β about x (β = bend / 2(n−1)), cut it into n gores: the end gores are CLR·tanβ long on the
// axis and the middle ones twice that, as in a lobster-back of that centreline radius. Each gore is then turned half a
// turn about its joint plane's normal through the centre of the joint ellipse. An ellipse has that half-turn symmetry,
// so the joint lands exactly on itself and the two gores meet edge to edge, while the axis turns by 2β at every joint.
// The flat pattern of each gore is simply its part of the cone's development, so the cut is exact and the 3D is built
// from the same numbers (wrap() takes a point of a flat piece to where it goes in the formed elbow).
import { developedDia, sheetFrom } from "./sheetopts.js";
import { selfIntersects, signedArea } from "../core/geom.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mulM = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const apply = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const tr = (M) => [0, 1, 2].map((i) => [M[0][i], M[1][i], M[2][i]]);
// rigid motion x -> R x + t
const place = (T, x) => { const r = apply(T.R, x); return [r[0] + T.t[0], r[1] + T.t[1], r[2] + T.t[2]]; };
const unplace = (T, q) => apply(tr(T.R), sub(q, T.t));
const then = (T, F) => ({ R: mulM(T.R, F.R), t: place(T, F.t) });          // T ∘ F
const halfTurn = (C, N) => {                                                // 180° about the line through C along N
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => 2 * N[i] * N[j] - (i === j ? 1 : 0)));
  const RC = apply(R, C);
  return { R, t: [C[0] - RC[0], C[1] - RC[1], C[2] - RC[2]] };
};
// the elbow starts upright: cone +z becomes the 3D view's +y (a quarter turn about x)
const UPRIGHT = { R: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], t: [0, 0, 0] };

export const REDELBOW_LIMITS = { nMin: 2, nMax: 12 };

const fail = (reason) => ({ ok: false, reason, pieces: [] });

export function reducingElbow(p = {}, { samples = 96 } = {}) {
  const sheet = sheetFrom(p);
  const d = Number(p.d) || 0, d2 = Number(p.d2) || 0, n = Math.round(Number(p.n) || 0);
  const bend = Number(p.bend) || 0, clr = Number(p.clr) > 0 ? Number(p.clr) : 1.5 * d;
  if (!(n >= REDELBOW_LIMITS.nMin && n <= REDELBOW_LIMITS.nMax)) return fail(`A reducing elbow needs ${REDELBOW_LIMITS.nMin} to ${REDELBOW_LIMITS.nMax} pieces.`);
  if (!(bend > 0 && bend <= 180)) return fail("The bend angle must be more than 0° and at most 180°.");
  if (!(d > 0 && d2 > 0)) return fail("Type both end diameters.");
  if (!(d2 < d - 0.5)) return fail("The small end must be smaller than the big end. For one size all the way round, use a lobster-back elbow.");
  const R1 = developedDia(d, sheet.t, sheet.allow) / 2, R2 = developedDia(d2, sheet.t, sheet.allow) / 2;
  if (!(clr > R1)) return fail(`The centreline radius is too tight: make it more than the big end's radius (${Math.round(R1 * 10) / 10} mm).`);
  const beta = ((bend * Math.PI) / 180) / (2 * (n - 1)), tb = Math.tan(beta);
  const H = 2 * (n - 1) * clr * tb;                      // axis length: two half-length end gores and n − 2 middle ones
  const zA = (H * R1) / (R1 - R2), S1 = Math.hypot(R1, zA);
  const A = [0, 0, zA];
  const u = (th) => [(R1 * Math.cos(th)) / S1, (R1 * Math.sin(th)) / S1, -zA / S1];
  const onCone = (th, rho) => [A[0] + rho * u(th)[0], A[1] + rho * u(th)[1], A[2] + rho * u(th)[2]];
  // planes 0..n: the big end, the n − 1 mitres (alternately tilted), the small end
  const planes = [];
  for (let k = 0; k <= n; k++) {
    const z = k === 0 ? 0 : k === n ? H : clr * tb * (2 * k - 1);
    const b = k === 0 || k === n ? 0 : (k % 2 ? 1 : -1) * beta;
    planes.push({ Q: [0, 0, z], N: [0, Math.sin(b), Math.cos(b)] });
  }
  const rhoOn = (k, th) => { const P = planes[k], den = dot(P.N, u(th)); return dot(P.N, sub(P.Q, A)) / den; };
  // the mitres must stay apart all the way round (they cross inside the pipe when CLR is too tight for the taper)
  for (let k = 0; k < n; k++) for (let i = 0; i < 72; i++) {
    const th = (i * Math.PI) / 36, r0 = rhoOn(k, th), r1 = rhoOn(k + 1, th);
    if (!(r0 > r1 + 1) || !(r1 > 0)) return fail(`The centreline radius is too tight for this taper and number of pieces: make it bigger than ${Math.round(clr)} mm or use more pieces.`);
  }
  // placing: gore k+1 is gore k's placement then a half-turn about its joint
  const T = [UPRIGHT];
  for (let k = 1; k < n; k++) {
    const Pp = onCone(Math.PI / 2, rhoOn(k, Math.PI / 2)), Pm = onCone(-Math.PI / 2, rhoOn(k, -Math.PI / 2));
    const C = [(Pp[0] + Pm[0]) / 2, (Pp[1] + Pm[1]) / 2, (Pp[2] + Pm[2]) / 2];
    T.push(then(T[k - 1], halfTurn(C, planes[k].N)));
  }
  const Phi = (2 * Math.PI * R1) / S1;                  // the development's sector angle
  const steps = Math.max(24, Math.min(360, Math.round(samples) || 96));
  const seamRot = ((Number(sheet.seamAt) || 0) * Math.PI) / 180;
  const pieces = [];
  for (let k = 0; k < n; k++) {
    // seam on the gore's short side (the throat), turned on by seamAt
    const th0 = (rhoOn(k, Math.PI / 2) - rhoOn(k + 1, Math.PI / 2) < rhoOn(k, -Math.PI / 2) - rhoOn(k + 1, -Math.PI / 2) ? Math.PI / 2 : -Math.PI / 2) + seamRot;
    const psi0 = Math.PI / 2 - Phi / 2;
    const flatOf = (th, rho) => { const ps = psi0 + ((th - th0) * R1) / S1; return [rho * Math.cos(ps), rho * Math.sin(ps)]; };
    const raw = [], edge = [];
    for (let i = 0; i <= steps; i++) { const th = th0 + (2 * Math.PI * i) / steps; raw.push(flatOf(th, rhoOn(k, th))); edge.push("a"); }
    if (sheet.seam > 0) {
      const ps = psi0 + Phi, tv = [-Math.sin(ps) * sheet.seam, Math.cos(ps) * sheet.seam];
      const thE = th0 + 2 * Math.PI, ea = flatOf(thE, rhoOn(k, thE)), eb = flatOf(thE, rhoOn(k + 1, thE));
      raw.push([ea[0] + tv[0], ea[1] + tv[1]], [eb[0] + tv[0], eb[1] + tv[1]]); edge.push("seam", "seam");
    }
    for (let i = steps; i >= 0; i--) { const th = th0 + (2 * Math.PI * i) / steps; raw.push(flatOf(th, rhoOn(k + 1, th))); edge.push("b"); }
    const x0 = Math.min(...raw.map((q) => q[0])), y0 = Math.min(...raw.map((q) => q[1]));
    const flat = raw.map(([x, y]) => [x - x0, y - y0]);
    if (selfIntersects(flat) || Math.abs(signedArea(flat)) < 1) return fail("These sizes do not give a cuttable gore.");
    const Tk = T[k];
    const wrap = (x, y) => {
      const X = x + x0, Y = y + y0, rho = Math.hypot(X, Y);
      let ps = Math.atan2(Y, X); while (ps < psi0 - Math.PI + Phi / 2) ps += 2 * Math.PI; while (ps > psi0 + Math.PI + Phi / 2) ps -= 2 * Math.PI;
      return place(Tk, onCone(th0 + ((ps - psi0) * S1) / R1, rho));
    };
    // distance from a 3D point to this gore's surface (Infinity when it is past the gore's edges)
    const near = (q) => {
      const c = unplace(Tk, q), th = Math.atan2(c[1], c[0]), w = sub(c, A), uu = u(th), along = dot(w, uu);
      const ra = rhoOn(k, th), rb = rhoOn(k + 1, th);
      if (along > ra + 0.05 || along < rb - 0.05) return Infinity;
      return Math.hypot(...sub(w, uu.map((v) => v * along)));
    };
    // 3D grid of the formed gore: rings round it, lines straight down the cone (quads between two lines are flat)
    const grid = (segs = 48, rows = 4) => {
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const th = th0 + (2 * Math.PI * i) / segs, ra = rhoOn(k, th), rb = rhoOn(k + 1, th);
        pts.push(Array.from({ length: rows + 1 }, (_, j) => place(Tk, onCone(th, ra + ((rb - ra) * j) / rows))));
      }
      return pts;
    };
    const lenAt = (th) => rhoOn(k, th) - rhoOn(k + 1, th);
    pieces.push({ flat, edge, wrap, near, grid, short: lenAt(th0 - seamRot), long: lenAt(th0 - seamRot + Math.PI), wrapBig: 2 * Math.PI * (rhoOn(k, th0) * R1) / S1 });
  }
  // the two openings, for flanges: centre, plane normal pointing out of the elbow, and a direction in the plane
  const endFrame = (k, planeK, out) => {
    const Pp = onCone(Math.PI / 2, rhoOn(planeK, Math.PI / 2)), Pm = onCone(-Math.PI / 2, rhoOn(planeK, -Math.PI / 2));
    const c = [(Pp[0] + Pm[0]) / 2, (Pp[1] + Pm[1]) / 2, (Pp[2] + Pm[2]) / 2];
    return { origin: place(T[k], c), outward: apply(T[k].R, [0, 0, out]), xA: apply(T[k].R, [1, 0, 0]), yA: apply(T[k].R, [0, 1, 0]) };
  };
  return { ok: true, reason: "", n, beta, clr, R1, R2, pieces, ends: [endFrame(0, 0, -1), endFrame(n - 1, n, 1)] };
}

// True-length table (same layout as the lobster-back's): per gore the big-side edge length round the pipe, the length
// on the axis, and the seam (throat) and back lengths along the cone.
export function redElbowTable(p = {}) {
  const e = reducingElbow(p);
  if (!e.ok) return null;
  const sheet = sheetFrom(p), r1 = (v) => Math.round(v * 10) / 10;
  const L = (pts) => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  const axis = (k) => (k === 0 || k === e.n - 1 ? 1 : 2) * e.clr * Math.tan(e.beta);
  const gores = e.pieces.map((pc, k) => ({
    name: k === 0 ? "Big end gore" : k === e.n - 1 ? "Small end gore" : "Middle gore " + k,
    kind: k === 0 || k === e.n - 1 ? "end" : "mid",
    wrap: r1(L(pc.flat.filter((_, i) => pc.edge[i] === "a")) + sheet.seam), mid: r1(axis(k)), throat: r1(pc.short), back: r1(pc.long),
  }));
  return { kind: "redelbow", basis: ["inside", "mean", "outside"][sheet.allow] || "mean", thickness: sheet.t, developedDia: r1(2 * e.R1),
    wrap: gores[0].wrap, circ: r1(2 * Math.PI * e.R1), seam: r1(sheet.seam), seamAt: r1((((Number(sheet.seamAt) || 0) % 360) + 360) % 360),
    clr: r1(e.clr), bend: Number(p.bend) || 0, pieces: e.n, gores, triangulation: [] };
}

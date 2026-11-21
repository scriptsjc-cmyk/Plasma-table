// r15 5.1: bend allowance for folded flat patterns.
// A folded preset's sizes are the folded part's sizes; the flat strip you cut must be shorter by the bend deduction at
// every bend (a 90° air bend stretches the outside and the metal "uses up" less than the two flange lengths). Per bend:
//   BA = π/2 · (R + K·T)                    the length of the bent arc on the neutral line
//   outside sizes:  BD = 2(R + T) − BA      each face measured to the outside of the bend
//   inside sizes:   BD = 2R − BA            each face measured to the inside (this can be negative: the strip gets longer)
// T is the sheet thickness (0 = the job's), R the inside bend radius (0 = same as T), K the K-factor (0.44 for air bending
// mild steel is a good start). A deduction Josh has measured on his own brake can be typed in, or saved for a thickness.
// The deduction is applied to the flat pattern (what gets cut) only: each bend's band is taken out of the strip, holes and
// cut-outs keep their size and move with their face. Presets whose bend lines aren't square to the sheet (cones,
// transitions, triangulated ducts) are left as they are: their sheet thickness is handled by the Thickness basis option.

export const BEND_K = 0.44;
export const SIZE_OUTSIDE = 0, SIZE_INSIDE = 1, SIZE_AS_CUT = 2;
export const BEND_PARAMS = [
  ["bt", "Sheet thickness for the bends (0 = the job's)", 0],
  ["bir", "Inside bend radius (0 = same as the sheet)", 0],
  ["bsz", "Sizes are", SIZE_OUTSIDE, { type: "select", options: [
    { v: SIZE_OUTSIDE, l: "Outside (to the outside of each bend)" },
    { v: SIZE_INSIDE, l: "Inside (to the inside of each bend)" },
    { v: SIZE_AS_CUT, l: "As cut (no bend allowance)" },
  ] }],
  ["bk", "K-factor (0 = 0.44)", BEND_K],
  ["bd", "Measured deduction per bend (mm, 0 = work it out)", 0],
];
const BEND_KEYS = new Set(BEND_PARAMS.map(([k]) => k));

let ctx = { thickness: () => null, measured: () => null };
// The app tells this module the job's sheet thickness and the deductions Josh has saved (prefs), without an import cycle.
export function setBendContext(c = {}) { ctx = { thickness: c.thickness || (() => null), measured: c.measured || (() => null) }; }
export function jobThickness() { try { const v = Number(ctx.thickness()); return v > 0 ? v : null; } catch (e) { return null; } }
// what a folded part's flat pattern depends on besides its own fields (so a drawing's cached outline is redrawn when it changes)
export function bendKey() { const T = jobThickness(); return T ? [T, savedDeduction(T)] : 0; }
function savedDeduction(T) { try { const v = Number(ctx.measured(T)); return Number.isFinite(v) && v > 0 ? v : null; } catch (e) { return null; } }

export function bendDeduction({ t, r, k = BEND_K, inside = false, deg = 90 } = {}) {
  const T = Math.max(0, Number(t) || 0);
  if (!(T > 0)) return 0;
  const R = Number(r) > 0 ? Number(r) : T, K = Number(k) > 0 ? Number(k) : BEND_K;
  const th = (Math.max(1, Math.min(179, Number(deg) || 90)) * Math.PI) / 180;
  const ba = th * (R + K * T);
  const setback = Math.tan(th / 2) * (inside ? R : R + T);
  return 2 * setback - ba;
}

// What a preset's bend fields work out to: { bd (mm per bend), T, R, K, src, inside, asCut }
export function bendFor(p = {}, deg = 90) {
  const asCut = Number(p.bsz) === SIZE_AS_CUT, inside = Number(p.bsz) === SIZE_INSIDE;
  const own = Number(p.bt) > 0 ? Number(p.bt) : null, T = own || jobThickness();
  const R = Number(p.bir) > 0 ? Number(p.bir) : T, K = Number(p.bk) > 0 ? Number(p.bk) : BEND_K;
  const out = { bd: 0, T, R, K, inside, asCut, fromJob: !own && !!T, src: "worked out" };
  if (asCut) return out;
  if (Number(p.bd) > 0) return { ...out, bd: Number(p.bd), src: "typed" };
  if (!T) return out;
  const saved = !inside ? savedDeduction(T) : null;
  if (saved) return { ...out, bd: saved, src: "saved" };
  return { ...out, bd: bendDeduction({ t: T, r: R, k: K, inside, deg }) };
}

const fmt = (v) => String(Math.round(v * 100) / 100);
export function bendNote(p = {}, deg = 90) {
  const b = bendFor(p, deg);
  if (b.asCut) return "As cut: nothing is taken off for the bends (the sizes are the flat pattern).";
  if (!b.bd) return "Bends: no sheet thickness yet, so nothing is taken off. Pick the sheet on Cut › Part, or type it here.";
  const sizes = b.inside ? "Sizes are inside sizes." : "Sizes are outside sizes.";
  const verb = b.bd >= 0 ? `${fmt(b.bd)} mm taken off per bend` : `${fmt(-b.bd)} mm added per bend`;
  const why = b.src === "typed" ? "your measured deduction"
    : b.src === "saved" ? `your saved deduction for ${fmt(b.T)} mm`
    : `${fmt(b.T)} mm sheet${b.fromJob ? " (the job's)" : ""}, inside radius ${fmt(b.R)}, K ${fmt(b.K)}`;
  return `Bends: ${verb} (${why}). ${sizes}`;
}

const NEAR = 1e-6;
const isBend = (c) => c && c.role === "bend" && c.pts && c.pts.length === 2;
const bbox = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
const inside = (a, b, e = 1e-6) => a[0] >= b[0] - e && a[1] >= b[1] - e && a[2] <= b[2] + e && a[3] <= b[3] + e;

// one axis: v -> v − Σ g(v − b). BD ≥ 0 takes a BD-wide band out at each bend (centred on it); BD < 0 opens a gap of |BD|.
function axisMap(pos, BD) {
  const g = BD >= 0 ? (d) => Math.max(0, Math.min(BD, d + BD / 2)) : (d) => (d < -NEAR ? 0 : d > NEAR ? BD : BD / 2);
  return (v) => { let s = v; for (const b of pos) s -= g(v - b); return s; };
}
function breaks(pos, BD) { return BD >= 0 ? pos.flatMap((b) => [b - BD / 2, b + BD / 2]) : pos.slice(); }
// split a polyline's edges where they cross a break on either axis (so the map stays exact along slanted edges)
function subdivide(pts, closed, bx, by) {
  const out = [], n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    out.push(pts[i]);
    if (i >= m) continue;
    const a = pts[i], b = pts[(i + 1) % n], ts = [];
    for (const x of bx) { const d = b[0] - a[0]; if (Math.abs(d) > NEAR) { const t = (x - a[0]) / d; if (t > NEAR && t < 1 - NEAR) ts.push(t); } }
    for (const y of by) { const d = b[1] - a[1]; if (Math.abs(d) > NEAR) { const t = (y - a[1]) / d; if (t > NEAR && t < 1 - NEAR) ts.push(t); } }
    ts.sort((p, q) => p - q);
    for (const t of ts) out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
// with BD < 0 a crossing point is two points (each side of the gap)
function mapPts(pts, closed, fx, fy, xs, ys, BD) {
  const sub = subdivide(pts, closed, breaks(xs, BD), breaks(ys, BD)), out = [];
  const n = sub.length;
  for (let i = 0; i < n; i++) {
    const p = sub[i];
    if (BD < 0) {
      const prev = sub[(i - 1 + n) % n], next = sub[(i + 1) % n];
      const onX = xs.find((b) => Math.abs(p[0] - b) <= NEAR), onY = ys.find((b) => Math.abs(p[1] - b) <= NEAR);
      // a point on a bend position that the outline passes straight through: one point on each side of the gap
      if (onX != null && (closed || (i > 0 && i < n - 1)) && (prev[0] - onX) * (next[0] - onX) < -NEAR) {
        const l = [fx(onX - 2 * NEAR) , fy(p[1])], r = [fx(onX + 2 * NEAR), fy(p[1])];
        out.push(...(prev[0] < onX ? [l, r] : [r, l])); continue;
      }
      if (onY != null && (closed || (i > 0 && i < n - 1)) && (prev[1] - onY) * (next[1] - onY) < -NEAR) {
        const l = [fx(p[0]), fy(onY - 2 * NEAR)], r = [fx(p[0]), fy(onY + 2 * NEAR)];
        out.push(...(prev[1] < onY ? [l, r] : [r, l])); continue;
      }
    }
    out.push([fx(p[0]), fy(p[1])]);
  }
  // drop repeats a collapsed band leaves behind
  const clean = [];
  for (const q of out) { const l = clean[clean.length - 1]; if (!l || Math.abs(l[0] - q[0]) > 1e-9 || Math.abs(l[1] - q[1]) > 1e-9) clean.push(q); }
  if (closed && clean.length > 2) { const f = clean[0], l = clean[clean.length - 1]; if (Math.abs(f[0] - l[0]) <= 1e-9 && Math.abs(f[1] - l[1]) <= 1e-9) clean.pop(); }
  return clean;
}

// Take the bend deduction out of a flat pattern. Returns the contours unchanged when BD is 0 or a bend isn't square.
export function applyBendDeduction(contours, BD) {
  const cs = contours || [];
  if (!(Math.abs(BD) > 1e-9)) return cs;
  const bendsAll = cs.filter(isBend);
  if (!bendsAll.length) return cs;
  const axis = (c) => (Math.abs(c.pts[0][0] - c.pts[1][0]) <= NEAR ? "x" : Math.abs(c.pts[0][1] - c.pts[1][1]) <= NEAR ? "y" : null);
  if (bendsAll.some((c) => !axis(c))) return cs;
  // each piece (an outline not inside another) shrinks by its own bends only
  const closed = cs.map((c, i) => ({ c, i, b: bbox(c.pts) })).filter((o) => o.c.closed !== false && o.c.role !== "bend");
  const outers = closed.filter((o) => !closed.some((q) => q !== o && inside(o.b, q.b) && (q.b[2] - q.b[0]) * (q.b[3] - q.b[1]) > (o.b[2] - o.b[0]) * (o.b[3] - o.b[1]) + NEAR));
  const pieceOf = (b) => outers.find((o) => inside(b, o.b, 1e-4));
  const plan = outers.map((o) => {
    const own = bendsAll.filter((c) => pieceOf(bbox(c.pts)) === o);
    const xs = [...new Set(own.filter((c) => axis(c) === "x").map((c) => c.pts[0][0]))].sort((a, b) => a - b);
    const ys = [...new Set(own.filter((c) => axis(c) === "y").map((c) => c.pts[0][1]))].sort((a, b) => a - b);
    return { o, xs, ys, fx: axisMap(xs, BD), fy: axisMap(ys, BD) };
  });
  const planOf = (o) => plan.find((q) => q.o === o);
  const touchesBand = (b, P) => {
    const hit = (lo, hi, pos) => pos.some((v) => (BD >= 0 ? hi > v - BD / 2 + NEAR && lo < v + BD / 2 - NEAR : lo < v - NEAR && hi > v + NEAR));
    return hit(b[0], b[2], P.xs) || hit(b[1], b[3], P.ys);
  };
  return cs.map((c) => {
    if (!c || !c.pts || !c.pts.length) return c;
    const b = bbox(c.pts), owner = outers.find((o) => o.c === c) || pieceOf(b), P = owner && planOf(owner);
    if (!P || (!P.xs.length && !P.ys.length)) return c;
    const isOuter = owner.c === c;
    if (!isOuter && !isBend(c) && !touchesBand(b, P)) {
      // a hole or cut-out inside one face: it moves with the face, same size and shape
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, dx = P.fx(cx) - cx, dy = P.fy(cy) - cy;
      const out = { ...c, pts: c.pts.map(([x, y]) => [x + dx, y + dy]) };
      if (c.circle) out.circle = { ...c.circle, cx: c.circle.cx + dx, cy: c.circle.cy + dy };
      return out;
    }
    const out = { ...c, pts: mapPts(c.pts, c.closed !== false && !isBend(c), P.fx, P.fy, P.xs, P.ys, BD) };
    if (c.circle) { const { circle, ...rest } = out; return rest; }
    return out;
  });
}

// Give a folded preset the bend fields and make its flat pattern take the deduction off. Only presets whose default
// pattern has bend lines, all square to the sheet, qualify.
export function attachBendAllowance(sh, { isFold } = {}) {
  if (!sh || typeof sh.make !== "function" || sh.bendAllowance != null) return sh;
  if (isFold && !isFold(sh)) return sh;
  if ((sh.params || []).some(([k]) => BEND_KEYS.has(k))) return sh;
  let cs = [];
  try { cs = sh.make(Object.fromEntries(sh.params.map(([k, , d]) => [k, d]))) || []; } catch (e) { return sh; }
  const bl = cs.filter(isBend);
  const square = bl.length > 0 && bl.every((c) => Math.abs(c.pts[0][0] - c.pts[1][0]) <= NEAR || Math.abs(c.pts[0][1] - c.pts[1][1]) <= NEAR);
  if (!square) { sh.bendAllowance = false; return sh; }
  const make = sh.make, note = sh.note;
  sh.params = [...sh.params, ...BEND_PARAMS];
  const deg = Number(sh.bendDeg) || 90;            // a preset whose bends aren't 90° says so (the ridge cap's are 45°)
  sh.make = (p) => applyBendDeduction(make(p), bendFor(p, deg).bd);
  sh.note = (p) => [typeof note === "function" ? note(p) : note, bendNote(p, deg)].filter(Boolean).join(" ");
  sh.bendAllowance = true;
  return sh;
}

// True-shape nesting and saved remnants. Pure maths (no DOM), so the browser and the node tests run the same code.
//
// How the packing works
//  * the sheet (or a saved remnant, any shape) is a grid of small cells. A placed part marks every cell it touches (conservative);
//    a part being tried is marked with a margin of "gap" (cut width + clearance) all round. If the two never share a cell, the
//    parts are at least a gap apart, by construction. Every placement is then checked again with exact outline distances.
//  * parts are tried biggest first, at every allowed turn (0, 90, 180, 270, or finer steps), at the lowest-leftmost free spot,
//    and the turn that sits lowest wins. Holes are free space, so a small part can drop into the hole of a big one: with
//    "fill holes first" every enclosed pocket is tried before the open sheet.
//  * after the grid spot is found the part slides down and left in small exact steps to close the last few millimetres.
//  * the leftover sheet is traced from a distance field (so its outline is smooth and exact to a fraction of a cell) and kept
//    at least half a kerf away from every part.
import { pointInPoly, segX } from "./geom.js";
import { march, simplifyRing, ringArea } from "./trace.js";

const D2R = Math.PI / 180;
const HALF_DIAG = Math.SQRT1_2 * 1.0001;
const TIE = 0.015;           // envelopes within 1.5% count as equal: the first turn tried (0, then 90, 180...) keeps the spot, which keeps shapes pairing up

// ---------------------------------------------------------------- small geometry
export const rotPt = ([x, y], a) => { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [x * c - y * s, x * s + y * c]; };
export function ringsBox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  return [x0, y0, x1, y1];
}
const segPt = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const segSeg = (a, b, c, d) => (segX(a, b, c, d) ? 0 : Math.min(segPt(a[0], a[1], c[0], c[1], d[0], d[1]), segPt(b[0], b[1], c[0], c[1], d[0], d[1]), segPt(c[0], c[1], a[0], a[1], b[0], b[1]), segPt(d[0], d[1], a[0], a[1], b[0], b[1])));
const boxGap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
export const inMaterial = (p, rings) => { let n = 0; for (const r of rings) if (pointInPoly(p, r)) n++; return n % 2 === 1; };
export function ringsArea(rings) {                       // material area: rings nested an even number of times count, odd ones are holes
  const ar = rings.map((r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; });
  let tot = 0;
  rings.forEach((r, i) => { let d = 0; for (let j = 0; j < rings.length; j++) if (j !== i && ar[j] > ar[i] && pointInPoly(r[0], rings[j])) d++; tot += d % 2 ? -ar[i] : ar[i]; });
  return tot;
}

// exact: do two parts overlap (cross, or one sits in the material of the other), and how close are their outlines
export function pairDistance(A, B, boxA = ringsBox(A), boxB = ringsBox(B), cap = Infinity) {
  if (boxGap(boxA, boxB) > cap) return { overlap: false, dist: boxGap(boxA, boxB) };
  let d = Infinity, cross = false;
  for (const ra of A) for (const rb of B) {
    for (let i = 0; i < ra.length; i++) {
      const a0 = ra[i], a1 = ra[(i + 1) % ra.length];
      const lx0 = Math.min(a0[0], a1[0]) - d, lx1 = Math.max(a0[0], a1[0]) + d, ly0 = Math.min(a0[1], a1[1]) - d, ly1 = Math.max(a0[1], a1[1]) + d;
      for (let j = 0; j < rb.length; j++) {
        const b0 = rb[j], b1 = rb[(j + 1) % rb.length];
        if (d < Infinity && ((b0[0] < lx0 && b1[0] < lx0) || (b0[0] > lx1 && b1[0] > lx1) || (b0[1] < ly0 && b1[1] < ly0) || (b0[1] > ly1 && b1[1] > ly1))) continue;
        const v = segSeg(a0, a1, b0, b1);
        if (v === 0) cross = true;
        if (v < d) d = v;
      }
    }
  }
  const inside = B.some((r) => inMaterial(r[0], A)) || A.some((r) => inMaterial(r[0], B));
  return { overlap: cross || inside, dist: d };
}

// is a part wholly inside the usable area (the sheet, any saved remnant shape, the machine's work area), at least `margin` from its edge?
// region: { w, h, rings?, clip? }
export function insideRegion(rings, box, region, margin) {
  const eps = 1e-6;
  const cl = region.clip || [0, 0, region.w, region.h];
  const x0 = Math.max(0, cl[0]), y0 = Math.max(0, cl[1]), x1 = Math.min(region.w, cl[2]), y1 = Math.min(region.h, cl[3]);
  if (box[0] < x0 + margin - eps || box[1] < y0 + margin - eps || box[2] > x1 - margin + eps || box[3] > y1 - margin + eps) return false;
  if (!region.rings) return true;
  for (const r of rings) for (const p of r) if (!inMaterial(p, region.rings)) return false;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const ax0 = Math.min(a[0], b[0]) - margin, ax1 = Math.max(a[0], b[0]) + margin, ay0 = Math.min(a[1], b[1]) - margin, ay1 = Math.max(a[1], b[1]) + margin;
      for (const rr of region.rings) for (let j = 0; j < rr.length; j++) {
        const c = rr[j], d = rr[(j + 1) % rr.length];
        if (ax0 > Math.max(c[0], d[0]) || ax1 < Math.min(c[0], d[0]) || ay0 > Math.max(c[1], d[1]) || ay1 < Math.min(c[1], d[1])) continue;
        if (segX(a, b, c, d)) return false;
        if (margin > 0 && segSeg(a, b, c, d) < margin - eps) return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------- rasterising
// cells of size c; cell (i,j) has its centre at ((i+.5)c, (j+.5)c). Returns the window, an inside (even-odd) flag and the distance
// from each centre to the nearest outline (capped at R)
function rasterize(rings, c, R, lo, hi) {
  const [bx0, by0, bx1, by1] = ringsBox(rings);
  const pad = Math.ceil(R / c) + 1;
  const i0 = lo ? lo[0] : Math.floor(bx0 / c) - pad, j0 = lo ? lo[1] : Math.floor(by0 / c) - pad;
  const i1 = hi ? hi[0] : Math.floor(bx1 / c) + pad, j1 = hi ? hi[1] : Math.floor(by1 / c) + pad;
  const mw = i1 - i0 + 1, mh = j1 - j0 + 1;
  const inside = new Uint8Array(mw * mh), dmin = new Float32Array(mw * mh).fill(R * 1.0001 + 1e-6);   // (just beyond the cap, so "far" never counts as "near")
  for (let jj = 0; jj < mh; jj++) {
    const yc = (j0 + jj + 0.5) * c, xs = [];
    for (const r of rings) {
      for (let k = 0, n = r.length; k < n; k++) {
        const p = r[k], q = r[(k + 1) % n];
        if ((p[1] <= yc) !== (q[1] <= yc)) xs.push(p[0] + ((yc - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] / c - 0.5) - i0), b = Math.min(mw - 1, Math.floor(xs[k + 1] / c - 0.5) - i0);
      for (let ii = a; ii <= b; ii++) inside[jj * mw + ii] = 1;
    }
  }
  for (const r of rings) {
    for (let k = 0, n = r.length; k < n; k++) {
      const p = r[k], q = r[(k + 1) % n];
      const xa = Math.min(p[0], q[0]) - R, xb = Math.max(p[0], q[0]) + R;
      const ia = Math.max(0, Math.floor(xa / c - 0.5) - i0), ib = Math.min(mw - 1, Math.ceil(xb / c - 0.5) - i0);
      const dx = q[0] - p[0];
      for (let ii = ia; ii <= ib; ii++) {
        const xc = (i0 + ii + 0.5) * c;
        let ylo, yhi;
        if (Math.abs(dx) < 1e-12) { ylo = Math.min(p[1], q[1]); yhi = Math.max(p[1], q[1]); }
        else {
          const t0 = Math.max(0, Math.min(1, (xc - R - p[0]) / dx)), t1 = Math.max(0, Math.min(1, (xc + R - p[0]) / dx));
          const y0 = p[1] + t0 * (q[1] - p[1]), y1 = p[1] + t1 * (q[1] - p[1]);
          ylo = Math.min(y0, y1); yhi = Math.max(y0, y1);
        }
        const ja = Math.max(0, Math.floor((ylo - R) / c - 0.5) - j0), jb = Math.min(mh - 1, Math.ceil((yhi + R) / c - 0.5) - j0);
        for (let jj = ja; jj <= jb; jj++) {
          const d = segPt(xc, (j0 + jj + 0.5) * c, p[0], p[1], q[0], q[1]);
          const idx = jj * mw + ii;
          if (d < dmin[idx]) dmin[idx] = d;
        }
      }
    }
  }
  return { i0, j0, mw, mh, inside, dmin };
}

// runs of set cells per row, as [row, from, to] triples, for the "inside or within r" mask
function runsOf(rs, r) {
  const out = [];
  for (let jj = 0; jj < rs.mh; jj++) {
    let s = -1;
    for (let ii = 0; ii <= rs.mw; ii++) {
      const on = ii < rs.mw && (rs.inside[jj * rs.mw + ii] || rs.dmin[jj * rs.mw + ii] <= r);
      if (on && s < 0) s = ii;
      else if (!on && s >= 0) { out.push(rs.j0 + jj, rs.i0 + s, rs.i0 + ii - 1); s = -1; }
    }
  }
  return Int32Array.from(out);
}

// ---------------------------------------------------------------- the free-space grid
class Grid {
  constructor(region, c) {
    this.c = c; this.W = region.w; this.H = region.h;
    this.nx = Math.max(1, Math.floor(region.w / c + 1e-9)); this.ny = Math.max(1, Math.floor(region.h / c + 1e-9));
    const N = this.nx * this.ny;
    this.occ = new Uint8Array(N); this.stat = new Uint8Array(N);
    this.nextOcc = new Int32Array(N); this.nextFree = new Int32Array(N);
    const cl = region.clip || [0, 0, region.w, region.h];
    const x0 = Math.max(0, cl[0]), y0 = Math.max(0, cl[1]), x1 = Math.min(region.w, cl[2]), y1 = Math.min(region.h, cl[3]);
    let rs = null;
    if (region.rings) rs = rasterize(region.rings, c, c * 2, [0, 0], [this.nx - 1, this.ny - 1]);
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        let bad = (i * c < x0 - 1e-9) || ((i + 1) * c > x1 + 1e-9) || (j * c < y0 - 1e-9) || ((j + 1) * c > y1 + 1e-9);
        if (!bad && rs) { const q = j * rs.mw + i; bad = !rs.inside[q] || rs.dmin[q] <= HALF_DIAG * c; }
        if (bad) { this.occ[j * this.nx + i] = 1; this.stat[j * this.nx + i] = 1; }
      }
    }
    for (let j = 0; j < this.ny; j++) this.rebuildRow(j);
  }
  rebuildRow(j) {
    const { nx, occ, nextOcc, nextFree } = this, b = j * nx;
    let o = nx, f = nx;                                  // nearest occupied / free cell at or after i
    for (let i = nx - 1; i >= 0; i--) {
      if (occ[b + i]) o = i; else f = i;
      nextOcc[b + i] = o; nextFree[b + i] = f;
    }
  }
  stamp(runs, ox, oy) {
    const { nx, ny, occ } = this; const touched = new Set();
    for (let k = 0; k < runs.length; k += 3) {
      const j = runs[k] + oy; if (j < 0 || j >= ny) continue;
      const a = Math.max(0, runs[k + 1] + ox), b = Math.min(nx - 1, runs[k + 2] + ox);
      for (let i = a; i <= b; i++) occ[j * nx + i] = 1;
      touched.add(j);
    }
    for (const j of touched) this.rebuildRow(j);
  }
  // free components that are not next to the outside of the sheet: the holes and pockets between parts
  pockets(minCells) {
    const { nx, ny, occ, stat } = this, N = nx * ny, lab = new Int32Array(N), out = [];
    const stack = new Int32Array(N);
    let id = 0;
    for (let s = 0; s < N; s++) {
      if (occ[s] || lab[s]) continue;
      id++; let sp = 0, cnt = 0, open = false, x0 = nx, y0 = ny, x1 = 0, y1 = 0;
      stack[sp++] = s; lab[s] = id;
      while (sp) {
        const q = stack[--sp], i = q % nx, j = (q - i) / nx; cnt++;
        if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
        const nb = [i > 0 ? q - 1 : -1, i < nx - 1 ? q + 1 : -1, j > 0 ? q - nx : -1, j < ny - 1 ? q + nx : -1];
        if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) open = true;
        for (const m of nb) {
          if (m < 0) continue;
          if (stat[m]) open = true;
          else if (!occ[m] && !lab[m]) { lab[m] = id; stack[sp++] = m; }
        }
      }
      if (!open && cnt >= minCells) out.push({ id, cells: cnt, box: [x0, y0, x1, y1] });
    }
    return { lab, list: out.sort((a, b) => a.cells - b.cells) };
  }
}

// ---------------------------------------------------------------- one part at one turn
function prepared(unit, ang, c, gap) {
  const cx = (unit.box[0] + unit.box[2]) / 2, cy = (unit.box[1] + unit.box[3]) / 2;
  const q = unit.rings.map((r) => r.map((p) => rotPt([p[0] - cx, p[1] - cy], ang)));
  const b = ringsBox(q);
  const rings = q.map((r) => r.map((p) => [p[0] - b[0], p[1] - b[1]]));
  const R = gap + HALF_DIAG * c;
  const rs = rasterize(rings, c, R);
  const dil = runsOf(rs, gap + HALF_DIAG * c), und = runsOf(rs, HALF_DIAG * c);
  let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity;
  for (let k = 0; k < dil.length; k += 3) { jMin = Math.min(jMin, dil[k]); jMax = Math.max(jMax, dil[k]); iMin = Math.min(iMin, dil[k + 1]); iMax = Math.max(iMax, dil[k + 2]); }
  let cells = 0; for (let k = 0; k < und.length; k += 3) cells += und[k + 2] - und[k + 1] + 1;
  // runs sorted so the rows most likely to hit something (top and bottom) are tested first
  const order = []; for (let k = 0; k < dil.length; k += 3) order.push(k);
  order.sort((a, b) => Math.abs(dil[b] - (jMin + jMax) / 2) - Math.abs(dil[a] - (jMin + jMax) / 2));
  const dilS = new Int32Array(dil.length); order.forEach((k, n) => { dilS[n * 3] = dil[k]; dilS[n * 3 + 1] = dil[k + 1]; dilS[n * 3 + 2] = dil[k + 2]; });
  return { ang, cx, cy, rings, box: [0, 0, b[2] - b[0], b[3] - b[1]], bmin: [b[0], b[1]], dil: dilS, und, iMin, iMax, jMin, jMax, cells, first: und.length ? [und[1], und[0]] : [0, 0] };
}

// first free spot for a prepared part, scanning bottom row first, left to right (row-major); start = { ox, oy } resumes just after a spot
function scan(grid, m, stop, bounds, start) {
  const { nx, ny, nextOcc, nextFree } = grid, c = grid.c;
  const oxLo = Math.max(-m.iMin, bounds ? bounds[0] : -Infinity), oxHi = Math.min(nx - 1 - m.iMax, bounds ? bounds[2] : Infinity);
  const oyLo = Math.max(-m.jMin, bounds ? bounds[1] : -Infinity), oyHi = Math.min(ny - 1 - m.jMax, bounds ? bounds[3] : Infinity);
  const dil = m.dil, nr = dil.length, hMm = m.box[3];
  for (let oy = start ? Math.max(oyLo, start.oy) : oyLo; oy <= oyHi; oy++) {
    if (stop && stop(oy * c + hMm, m.box[2])) return null;
    let ox = start && oy === start.oy ? Math.max(oxLo, start.ox + 1) : oxLo;
    while (ox <= oxHi) {
      let next = -1;
      for (let k = 0; k < nr; k += 3) {
        const row = (oy + dil[k]) * nx, a = ox + dil[k + 1], q = nextOcc[row + a];
        if (q <= ox + dil[k + 2]) { next = nextFree[row + q] - dil[k + 1]; break; }       // slide so this run starts past the blocked stretch
      }
      if (next < 0) return { ox, oy };
      ox = Math.max(next, ox + 1);
    }
  }
  return null;
}

// ---------------------------------------------------------------- nest
// units: [{ id, rings, fixed? }]   region: { w, h, rings?, clip? }   opts: { gap, angles, pockets, timeMs, cell, refine, onProgress, shouldCancel }
// Result: { placements: [{ id, placed, angle, c, t, rings }], failed: [ids], cell, ms, turns }
// A part moves as p' = R(angle) * (p - c) + t  (turning anticlockwise about c, the middle of its box).
export async function nestUnits(units, region, opts = {}) {
  const t0 = Date.now();
  const gap = Math.max(0, Number(opts.gap) || 0);
  const budget = opts.timeMs || 20000;
  const angles = (opts.angles && opts.angles.length ? opts.angles : [0]).slice();
  let c = opts.cell || Math.max(0.75, Math.min(6, gap / 2 || 1.5));
  c = Math.max(c, Math.sqrt((region.w * region.h) / 1.6e6));
  const grid = new Grid(region, c);
  const tick = opts.yield || (() => new Promise((r) => setTimeout(r, 0)));
  const placed = [];                                     // { id, rings, box }
  const result = new Map();
  // fixed parts first: they stay put and take their cells
  for (const u of units.filter((x) => x.fixed)) {
    const rs = rasterize(u.rings, c, HALF_DIAG * c);
    const runs = runsOf(rs, HALF_DIAG * c);
    grid.stamp(runs, 0, 0);
    placed.push({ id: u.id, rings: u.rings, box: ringsBox(u.rings) });
    result.set(u.id, { id: u.id, placed: true, fixed: true, angle: 0, c: [0, 0], t: [0, 0], rings: u.rings });
  }
  const mine = units.filter((x) => !x.fixed);
  const prep0 = new Map();
  for (const u of mine) { u.box = ringsBox(u.rings); prep0.set(u.id, prepared(u, 0, c, gap)); }
  mine.sort((a, b) => prep0.get(b.id).cells - prep0.get(a.id).cells);
  const failed = [];
  let done = 0, anglesUsed = 0, usedW = 0, usedH = 0;
  for (const o of placed) { usedW = Math.max(usedW, o.box[2]); usedH = Math.max(usedH, o.box[3]); }
  const verify = (rings, box) => {
    if (!insideRegion(rings, box, region, gap)) return false;
    for (const o of placed) {
      if (boxGap(box, o.box) >= gap) continue;
      const r = pairDistance(rings, o.rings, box, o.box, gap);
      if (r.overlap || r.dist < gap - 1e-6) return false;
    }
    return true;
  };
  for (const u of mine) {
    if (opts.shouldCancel && opts.shouldCancel()) { for (const v of mine.slice(done)) failed.push(v.id); break; }
    const remaining = mine.length - done;
    const spent = Date.now() - t0, partBudget = Math.max(150, (budget - spent) / remaining);
    const tp = Date.now();
    let best = null;
    const maskFor = (a) => { u._m = u._m || {}; return (u._m[a] = u._m[a] || (a === 0 ? prep0.get(u.id) : prepared(u, a, c, gap))); };
    // a part that can only make the envelope bigger than the best found so far is not worth scanning further
    const stopAt = (top, w) => !!best && Math.max(usedW, w) * Math.max(usedH, top) >= best.env * (1 - TIE);
    const tryMask = (m, bounds, pocketId, lab) => {
      let from = null;
      for (let guard = 0; guard < 12; guard++) {
        const r = scan(grid, m, stopAt, bounds, from);
        if (!r) return;
        from = r;
        if (pocketId && lab[(r.oy + m.first[1]) * grid.nx + r.ox + m.first[0]] !== pocketId) continue;
        const rings = m.rings.map((q) => q.map((p) => [p[0] + r.ox * c, p[1] + r.oy * c]));
        const box = [r.ox * c, r.oy * c, r.ox * c + m.box[2], r.oy * c + m.box[3]];
        if (!verify(rings, box)) continue;
        const top = r.oy * c + m.box[3], right = r.ox * c + m.box[2];
        const env = Math.max(usedW, right) * Math.max(usedH, top);          // the box round everything placed so far, with this part added
        if (!best || env < best.env * (1 - TIE)) best = { m, ox: r.ox, oy: r.oy, top, env, rings, box };
        return;
      }
    };
    const order = angles;
    let tried = 0;
    // 1) holes and pockets, smallest first
    if (opts.pockets !== false && placed.length) {
      const pk = grid.pockets(Math.max(4, Math.floor(prep0.get(u.id).cells * 0.8)));
      for (const p of pk.list) {
        for (const a of order) {
          if (tried >= 4 && Date.now() - tp > partBudget) break;
          const m = maskFor(a); tried++;
          if (m.cells > p.cells * 1.02) continue;
          tryMask(m, [p.box[0] - m.iMin, p.box[1] - m.jMin, p.box[2] - m.iMax, p.box[3] - m.jMax], p.id, pk.lab);
        }
        if (best) break;
      }
    }
    // 2) the open sheet
    if (!best) {
      for (const a of order) {
        if (tried >= 4 && Date.now() - tp > partBudget) break;
        const m = maskFor(a); tried++;
        tryMask(m, null);
      }
    }
    anglesUsed += tried;
    if (!best) { failed.push(u.id); result.set(u.id, { id: u.id, placed: false }); }
    else {
      let { m, ox, oy, rings, box } = best, dx = 0, dy = 0;
      // slide down and left in exact sub-cell steps
      if (opts.refine !== false) {
        const trial = (sx, sy) => {
          const r2 = rings.map((q) => q.map((p) => [p[0] + dx + sx, p[1] + dy + sy])), b2 = [box[0] + dx + sx, box[1] + dy + sy, box[2] + dx + sx, box[3] + dy + sy];
          return verify(r2, b2);
        };
        for (const st of [c * 0.9, c * 0.6, c * 0.3, c * 0.12]) {
          for (let n = 0; n < 3 && trial(0, -st); n++) dy -= st;
          for (let n = 0; n < 3 && trial(-st, 0); n++) dx -= st;
        }
        for (const st of [c * 0.9, c * 0.6, c * 0.3, c * 0.12]) {
          for (let n = 0; n < 3 && trial(0, -st); n++) dy -= st;
          for (let n = 0; n < 3 && trial(-st, 0); n++) dx -= st;
        }
      }
      const fr = rings.map((q) => q.map((p) => [p[0] + dx, p[1] + dy])), fb = [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy];
      // p' = R(a)(p - c0) + t, where t puts the turned box's lower-left corner at fb
      const tx = fb[0] - m.bmin[0], ty = fb[1] - m.bmin[1];
      if (dx || dy) { const rs2 = rasterize(fr, c, HALF_DIAG * c); grid.stamp(runsOf(rs2, HALF_DIAG * c), 0, 0); }   // slid off the grid: mark the cells it really covers
      else grid.stamp(m.und, ox, oy);
      placed.push({ id: u.id, rings: fr, box: fb }); usedW = Math.max(usedW, fb[2]); usedH = Math.max(usedH, fb[3]);
      result.set(u.id, { id: u.id, placed: true, angle: m.ang, c: [m.cx, m.cy], t: [tx, ty], rings: fr });
    }
    done++;
    if (opts.onProgress) opts.onProgress(done, mine.length, u.id);
    await tick();
  }
  return { placements: units.map((u) => result.get(u.id) || { id: u.id, placed: false }), failed, cell: c, ms: Date.now() - t0, tried: anglesUsed };
}

// the angles for a "turn parts" setting: 0 = none, 90 = quarter turns, or any step that divides 360
export function turnAngles(step) {
  const s = Number(step) || 0;
  if (!(s > 0) || s >= 360) return [0];
  const out = [];
  for (let a = 0; a < 360 - 1e-6; a += s) out.push(Math.round(a * 1000) / 1000);
  // coarse turns first, so a short time budget still tries the useful ones
  const rank = (a) => { for (const g of [90, 45, 30, 15, 10, 5, 1]) if (Math.abs(a / g - Math.round(a / g)) < 1e-9) return g; return 0; };
  return out.sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : rank(b) - rank(a) || a - b));
}

// ---------------------------------------------------------------- the same maths, applied to points (so callers move their own items)
export function applyPlacement(p, pl) { const q = rotPt([p[0] - pl.c[0], p[1] - pl.c[1]], pl.angle); return [q[0] + pl.t[0], q[1] + pl.t[1]]; }

// every rule the layout step checks, applied to a finished layout: inside the sheet, no overlap, at least gap apart.
// layout: [{ id, rings }]  Returns { ok, problems:[text], minDist }
export function verifyLayout(layout, region, gap) {
  const problems = []; let minDist = Infinity;
  const boxes = layout.map((u) => ringsBox(u.rings));
  layout.forEach((u, i) => { if (!insideRegion(u.rings, boxes[i], region, 0)) problems.push(`${u.id} is outside the sheet`); });
  for (let i = 0; i < layout.length; i++) for (let j = i + 1; j < layout.length; j++) {
    const r = pairDistance(layout[i].rings, layout[j].rings, boxes[i], boxes[j], gap + 50);
    if (r.overlap) problems.push(`${layout[i].id} and ${layout[j].id} overlap`);
    else { minDist = Math.min(minDist, r.dist); if (r.dist < gap - 0.001) problems.push(`${layout[i].id} and ${layout[j].id} are ${r.dist.toFixed(2)} mm apart`); }
  }
  return { ok: !problems.length, problems, minDist };
}

// ---------------------------------------------------------------- leftover sheet (remnants)
// The sheet (or a remnant) minus every part, kept `inset` away from each part's outline. Returns pieces biggest first:
// [{ rings (outer first, then holes, lower-left of its box at 0,0), w, h, area, at:[x,y] }]
export function leftoverPieces(region, partRings, opts = {}) {
  const inset = Math.max(0, Number(opts.inset) || 0), minArea = opts.minArea ?? 5000, maxPieces = opts.maxPieces || 6;
  let c = opts.cell || Math.max(1, Math.min(3, (inset + 1) / 1.5));
  c = Math.max(c, Math.sqrt((region.w * region.h) / 1.2e6));
  const pad = 2, nx = Math.ceil(region.w / c) + 2 * pad + 1, ny = Math.ceil(region.h / c) + 2 * pad + 1;
  const R = inset + 3 * c, F = new Float32Array(nx * ny);
  // node (i,j) sits at ((i-pad)c, (j-pad)c). rasterize() measures at cell centres, so the outlines are shifted by half a cell first.
  const shifted = (rings) => rings.map((r) => r.map(([x, y]) => [x + c / 2, y + c / 2]));
  const sdf = (rings, cap) => rasterize(shifted(rings), c, cap, [-pad, -pad], [nx - pad - 1, ny - pad - 1]);
  const regD = region.rings ? sdf(region.rings, 3 * c) : null, parts = partRings.length ? sdf(partRings, R) : null;
  const clip = region.clip;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = (i - pad) * c, y = (j - pad) * c, k = j * nx + i;
      let inReg = regD ? (regD.inside[k] ? regD.dmin[k] : -regD.dmin[k]) : Math.min(x, region.w - x, y, region.h - y);
      if (clip) inReg = Math.min(inReg, x - clip[0], clip[2] - x, y - clip[1], clip[3] - y);
      const dp = parts ? (parts.inside[k] ? -parts.dmin[k] : parts.dmin[k]) : Infinity;
      F[k] = -Math.min(inReg, dp - inset - c * 0.2);       // (the outline is simplified within 0.2 cell, so keep that much extra clear)
    }
  }
  const rings = march(F, nx, ny).map((r) => r.map(([i, j]) => [(i - pad) * c, (j - pad) * c]));
  return buildPieces(rings, c, minArea, maxPieces);
}
function buildPieces(rings, c, minArea, maxPieces) {
  const info = rings.map((r) => ({ r: simplifyRing(r, c * 0.2), a: ringArea(r) })).filter((o) => Math.abs(o.a) > c * c * 2);
  const outers = info.filter((o) => o.a > 0), holes = info.filter((o) => o.a < 0);
  const pieces = outers.map((o) => ({ outer: o, holes: [] }));
  for (const h of holes) {
    let host = null;
    for (const p of pieces) if (pointInPoly(h.r[0], p.outer.r) && (!host || p.outer.a < host.outer.a)) host = p;
    if (host) host.holes.push(h);
  }
  const out = [];
  for (const p of pieces) {
    const area = p.outer.a + p.holes.reduce((s, h) => s + h.a, 0);
    if (area < minArea) continue;
    const all = [p.outer.r, ...p.holes.map((h) => h.r)];
    const b = ringsBox([p.outer.r]);
    out.push({ rings: all.map((r) => r.map(([x, y]) => [x - b[0], y - b[1]])), w: b[2] - b[0], h: b[3] - b[1], area, at: [b[0], b[1]] });
  }
  return out.sort((a, b) => b.area - a.area).slice(0, maxPieces);
}

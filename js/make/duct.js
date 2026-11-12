// Flat patterns for sheet-metal transitions (pure maths, no DOM, so it can be unit-tested in node).
//
//  * Rectangular / square to round: TRIANGULATION development.
//    The round end is split into four quarter arcs, one over each corner of the rectangle. The surface is made of
//      - four flat isosceles triangles (one per rectangle edge, apex on the circle straight above the edge's middle), and
//      - four oblique "corner cones" (apex = the rectangle corner, base = a quarter of the circle).
//    Each cone is split into straight triangles (corner, circle point i, circle point i+1) whose three sides are the TRUE
//    3D lengths, then unrolled flat. The seams run up the middle of each corner cone, so the flat pattern is four side panels:
//    two for the Width (A) edges and two for the Depth (B) edges. A panel is symmetrical: a straight base edge, the flat
//    triangle in the middle and half a corner cone fanned out on each side.
//    Dimensions are the finished size to the sheet's centre-line (thickness is not added).
//  * Round to round (cone / reducer): an annular sector.
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// number of straight segments for each half corner cone (more = rounder top edge)
function segmentsFor(R) { return Math.max(4, Math.min(16, Math.ceil(R / 12))); }

// 3D model of one side of the transition, in the side's own frame:
// edge half-length u (the straight base edge runs from (-u,-v,0) to (u,-v,0)), v = distance from the middle to that edge,
// round end radius R at height H, centred over the rectangle.
function sideModel(u, v, R, H, n = segmentsFor(R)) {
  const corner = [u, -v, 0];
  const Q = [];
  for (let j = 0; j <= n; j++) {
    const th = -Math.PI / 2 + (j * (Math.PI / 4)) / n;          // from straight below the edge's middle, to the seam at the arc's middle
    Q.push([R * Math.cos(th), R * Math.sin(th), H]);
  }
  return { u, v, R, H, n, corner, Q };
}

// Unroll one side. Returns { pts (counter-clockwise outline), ... } or null if the pattern would fold over itself.
function developSide(u, v, R, H, n = segmentsFor(R)) {
  const m = sideModel(u, v, R, H, n);
  const { corner, Q } = m;
  const l = Q.map((q) => dist3(corner, q));                    // true length: corner -> circle point
  const c = Q.slice(0, -1).map((q, j) => dist3(q, Q[j + 1]));   // true chord between neighbouring circle points
  const hT = Math.hypot(R - v, H);                              // height of the flat triangle: base middle -> apex
  const right = [[u + l[0] * Math.cos(Math.atan2(hT, -u)), l[0] * Math.sin(Math.atan2(hT, -u))]];
  let phi = Math.atan2(hT, -u);
  const angles = [];
  for (let j = 0; j < n; j++) {
    const cosA = (l[j] * l[j] + l[j + 1] * l[j + 1] - c[j] * c[j]) / (2 * l[j] * l[j + 1]);
    const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
    angles.push(a);
    phi -= a;                                                   // the fan turns away from the flat triangle
    right.push([u + l[j + 1] * Math.cos(phi), l[j + 1] * Math.sin(phi)]);
  }
  // outline: base left, base right, up the seam, along the top edge back over the middle apex, down the left half
  const apex = [0, hT];
  const rightRev = right.slice(1).reverse();                    // Q_n' ... Q_1'
  const leftHalf = right.slice(1).map(([x, y]) => [-x, y]);     // Q_1'(L) ... Q_n'(L)
  const pts = [[-u, 0], [u, 0], ...rightRev, apex, ...leftHalf];
  // sanity: simple polygon with positive area
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
  if (!(area > 1e-6) || selfCross(pts)) return null;
  return { pts, apex, fan: right, hT, lengths: l, chords: c, angles, seamLength: l[n], model: m };
}

function segX(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}
function selfCross(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segX(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
  }
  return false;
}

// The whole transition: A = width, B = depth (rectangular end), D = round diameter, H = height between the two ends.
// Returns { A: panel for the Width edges (make 2), B: panel for the Depth edges (make 2) } or null.
export function squareToRound(A, B, D, H) {
  const R = D / 2, n = segmentsFor(R);
  const pa = developSide(A / 2, B / 2, R, H, n);     // the edge of length A sits B/2 from the middle
  const pb = developSide(B / 2, A / 2, R, H, n);
  if (!pa || !pb) return null;
  return { A: pa, B: pb, n, R };
}

// Round to round cone (frustum): bottom diameter D1, top diameter D2, straight height H.
// Returns the flat annular sector: outer radius, inner radius, angle (radians).
export function coneDevelopment(D1, D2, H) {
  const big = Math.max(D1, D2), small = Math.min(D1, D2);
  const dr = (big - small) / 2;
  const slant = Math.hypot(H, dr);
  if (!(dr > 1e-6)) return null;                    // same diameter: that is a rolled tube, not a cone
  const Ro = slant * big / (big - small);            // apex -> big end, along the slant
  const Ri = Ro - slant;
  const ang = (Math.PI * big) / Ro;                  // circumference of the big end = arc length of the sector
  return { Ro, Ri, ang, slant };
}

// ---- extra developments for the preset library (offset transitions, lofts, saddles)

function placeByDistances(p, dP, q, dQ, side) {
  const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy);
  if (d < 1e-9) return [p[0], p[1] + (side >= 0 ? dP : -dP)];
  const a = (dP * dP - dQ * dQ + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, dP * dP - a * a));
  const ux = dx / d, uy = dy / d;
  const s = side >= 0 ? 1 : -1;
  return [p[0] + a * ux - s * h * uy, p[1] + a * uy + s * h * ux];
}

// Unroll a closed loft between two 3D polylines of equal length (first point is the seam).
// Returns a closed 2D outline or null if the pattern would fold over itself.
export function unrollLoft(bottom, top) {
  const n = bottom && top ? Math.min(bottom.length, top.length) : 0;
  if (n < 4) return null;
  const A = bottom, B = top;
  const bot2 = [[0, 0]];
  const top2 = [[0, dist3(A[0], B[0])]];
  const a1 = placeByDistances(bot2[0], dist3(A[0], A[1]), top2[0], dist3(B[0], A[1]), -1);
  bot2.push(a1 && a1[1] >= -1e-6 ? a1 : [dist3(A[0], A[1]), 0]);
  const b1 = placeByDistances(bot2[1], dist3(A[1], B[1]), top2[0], dist3(B[0], B[1]), 1);
  if (!b1 || !Number.isFinite(b1[0])) return null;
  top2.push(b1);
  for (let i = 1; i < n; i++) {
    const i1 = (i + 1) % n;
    const aNext = placeByDistances(bot2[i], dist3(A[i], A[i1]), top2[i], dist3(B[i], A[i1]), -1);
    if (!aNext || !Number.isFinite(aNext[0])) return null;
    bot2.push(aNext);
    const bNext = placeByDistances(bot2[i + 1], dist3(A[i1], B[i1]), top2[i], dist3(B[i], B[i1]), 1);
    if (!bNext || !Number.isFinite(bNext[0])) return null;
    top2.push(bNext);
  }
  bot2.pop();
  top2.pop();
  const pts = [...bot2, ...top2.slice().reverse()];
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (!(Math.abs(area) > 1e-3) || selfCross(pts)) return null;
  return { pts, area };
}

// Offset (eccentric) round-to-round reducer: two circles in parallel planes, optionally offset.
export function offsetRoundToRound(d1, d2, H, ox = 0, oy = 0, segs = 24) {
  if (!(d1 >= 10 && d2 >= 10 && H >= 5 && d1 !== d2 || Math.hypot(ox, oy) > 0.5)) {
    if (!(d1 >= 10 && d2 >= 10 && H >= 5)) return null;
  }
  const n = Math.max(16, Math.min(36, segs));
  const b = [], t = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    b.push([(d1 / 2) * Math.cos(a), (d1 / 2) * Math.sin(a), 0]);
    t.push([ox + (d2 / 2) * Math.cos(a), oy + (d2 / 2) * Math.sin(a), H]);
  }
  return unrollLoft(b, t);
}

// Rectangular-to-rectangular (or offset) transition: four trapezoid side panels.
export function rectangularTransition(A, B, A2, B2, H, ox = 0, oy = 0) {
  if (!(A >= 10 && B >= 10 && A2 >= 10 && B2 >= 10 && H >= 5)) return null;
  const trap = (bot, top, rise, off) => {
    const tx0 = (bot - top) / 2 + off, tx1 = tx0 + top;
    const pts = [[0, 0], [bot, 0], [tx1, rise], [tx0, rise]];
    if (selfCross(pts)) return null;
    return { pts };
  };
  const frontH = Math.hypot(H, (B / 2) - (oy - B2 / 2));
  const backH  = Math.hypot(H, (-B / 2) - (oy + B2 / 2));
  const leftH  = Math.hypot(H, (A / 2) - (ox - A2 / 2));
  const rightH = Math.hypot(H, (-A / 2) - (ox + A2 / 2));
  const panels = [
    trap(A, A2, frontH, ox),
    trap(A, A2, backH, -ox),
    trap(B, B2, leftH, oy),
    trap(B, B2, rightH, -oy),
  ];
  return panels.every(Boolean) ? panels : null;
}

// 90° pipe-on-pipe saddle / fishmouth: unrolled branch end, plus a skirt so the pattern is a sturdy closed band.
export function pipeSaddle(branchD, headerD, skirt = 20, n = 48) {
  const d = branchD, D = headerD;
  if (!(d >= 10 && D >= d && skirt >= 4)) return null;
  const r = d / 2, R = D / 2, w = Math.PI * d;
  const ys = [];
  for (let i = 0; i <= n; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / n;
    const xOff = r * Math.sin(th);
    const inside = R * R - xOff * xOff;
    ys.push(inside > 0 ? (R - Math.sqrt(inside)) : 0);
  }
  const ymin = Math.min(...ys);
  const curve = ys.map((y, i) => [(w * i) / n, y - ymin]);
  const peak = Math.max(...curve.map((p) => p[1]));
  const ySkirt = peak + Math.max(8, skirt);
  const pts = [...curve, [w, ySkirt], [0, ySkirt]];
  if (selfCross(pts)) return null;
  return { pts, w, h: ySkirt };
}

// Pipe cut to sit on a flat plate (end coping is a straight wrap — a rectangle — or a bevelled end).
export function pipeOnFlat(d, rise, skirt = 20, n = 48) {
  if (!(d >= 10 && rise >= 0 && skirt >= 4)) return null;
  const w = Math.PI * d;
  const curve = [];
  for (let i = 0; i <= n; i++) {
    const th = (2 * Math.PI * i) / n;
    curve.push([(w * i) / n, rise * (1 - Math.cos(th)) / 2]);
  }
  const ySkirt = Math.max(...curve.map((p) => p[1])) + Math.max(8, skirt);
  const pts = [...curve, [w, ySkirt], [0, ySkirt]];
  if (selfCross(pts)) return null;
  return { pts };
}

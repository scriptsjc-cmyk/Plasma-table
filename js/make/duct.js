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

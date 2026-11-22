// r15 10.3: n points shared out evenly along a path (by length). An open path includes both ends; a closed one shares
// them round the loop with no doubled point at the start. Each point has the path's direction there (degrees).
export function pointsAlongPath(pts, closed, n) {
  n = Math.floor(Number(n) || 0);
  if (!pts || pts.length < 2 || n < 1) return [];
  const P = closed ? [...pts, pts[0]] : pts;
  const seg = [];
  let total = 0;
  for (let i = 0; i + 1 < P.length; i++) { const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); seg.push(L); total += L; }
  if (!(total > 1e-9)) return [];
  const step = closed ? total / n : (n === 1 ? 0 : total / (n - 1));
  const out = [];
  let i = 0, run = 0;
  for (let k = 0; k < n; k++) {
    const want = Math.min(total, k * step);
    while (i < seg.length - 1 && run + seg[i] < want - 1e-9) { run += seg[i]; i++; }
    while (i < seg.length - 1 && seg[i] < 1e-9) i++;
    const a = P[i], b = P[i + 1], t = seg[i] > 1e-9 ? Math.min(1, Math.max(0, (want - run) / seg[i])) : 0;
    // at a joint, take the direction of the edge that starts there
    let j = i;
    if (t >= 1 - 1e-9 && j + 1 < seg.length) j = i + 1;
    const ang = Math.atan2(P[j + 1][1] - P[j][1], P[j + 1][0] - P[j][0]) * 180 / Math.PI;
    out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, angle: Math.round(ang * 1e6) / 1e6 });
  }
  return out;
}

// Visible snaps (endpoint, midpoint, centre, tangent, grid) and simple constraints.
const KINDS = ["endpoint", "midpoint", "centre", "tangent", "grid"];

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

export function collectSnapPoints(sk, excludeIds) {
  const skip = new Set(excludeIds || []);
  const pts = [];
  for (const it of sk.items || []) {
    if (skip.has(it.id) || it.hide) continue;
    const cs = sk.contoursOf(it);
    for (const c of cs) {
      if (c.circle) pts.push({ x: c.circle.cx, y: c.circle.cy, kind: "centre", r: c.circle.r, it });
      const p = c.pts || [];
      const n = p.length, closed = c.closed !== false;
      for (let i = 0; i < n; i++) {
        const a = p[i], b = p[(i + 1) % n];
        pts.push({ x: a[0], y: a[1], kind: "endpoint", it });
        if (!closed && i === n - 1) continue;
        pts.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, kind: "midpoint", it, a, b });
      }
    }
  }
  return pts;
}

export function snapWorld(sk, wx, wy, excludeIds) {
  const tol = 10 / ((sk.view && sk.view.s) || 1);
  let best = null, bestD = tol;
  const candidates = collectSnapPoints(sk, excludeIds);
  for (const p of candidates) {
    const d = dist([wx, wy], [p.x, p.y]);
    if (d < bestD) { bestD = d; best = { x: p.x, y: p.y, kind: p.kind, it: p.it }; }
  }
  // tangent: closest point on a circle in the same direction as the cursor
  for (const p of candidates) {
    if (p.kind !== "centre" || !(p.r > 0)) continue;
    const d = dist([wx, wy], [p.x, p.y]);
    if (d < 1e-6) continue;
    const tx = p.x + p.r * (wx - p.x) / d, ty = p.y + p.r * (wy - p.y) / d;
    const td = dist([wx, wy], [tx, ty]);
    if (td < bestD) { bestD = td; best = { x: tx, y: ty, kind: "tangent", it: p.it }; }
  }
  const step = sk.opts && sk.opts.snap;
  if (step) {
    const gx = Math.round(wx / step) * step, gy = Math.round(wy / step) * step;
    const d = dist([wx, wy], [gx, gy]);
    if (d < bestD) { bestD = d; best = { x: gx, y: gy, kind: "grid" }; }
  }
  return best;
}

// Horizontal / vertical / equal / parallel against the last drawn segment or a nearby edge.
export function constraintOf(sk, from, to) {
  if (!from || !to) return null;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const angTol = 4 * Math.PI / 180;
  const a = Math.atan2(dy, dx);
  const tags = [];
  if (Math.abs(Math.sin(a)) < Math.sin(angTol)) tags.push("horizontal");
  if (Math.abs(Math.cos(a)) < Math.sin(angTol)) tags.push("vertical");
  const len = Math.hypot(dx, dy);
  const edges = [];
  for (const it of sk.items || []) {
    if (it.hide) continue;
    for (const c of sk.contoursOf(it)) {
      const p = c.pts || [];
      for (let i = 0; i < p.length; i++) {
        const A = p[i], B = p[(i + 1) % p.length];
        edges.push({ A, B, len: Math.hypot(B[0] - A[0], B[1] - A[1]), ang: Math.atan2(B[1] - A[1], B[0] - A[0]) });
      }
    }
  }
  for (const e of edges) {
    if (Math.abs(e.len - len) < 0.6 && len > 2) { tags.push("equal"); break; }
  }
  for (const e of edges) {
    let da = Math.abs(e.ang - a) % Math.PI;
    if (da > Math.PI / 2) da = Math.PI - da;
    if (da < angTol && e.len > 2) { tags.push("parallel"); break; }
  }
  return tags.length ? tags : null;
}

export function applyConstraints(from, to, tags) {
  if (!from || !to || !tags || !tags.length) return to;
  let [x, y] = to;
  if (tags.includes("horizontal")) y = from[1];
  if (tags.includes("vertical")) x = from[0];
  return [x, y];
}


// Independent G-code safety analyser (does not reuse app code). Works on raw CAM output and on the prepared job.
const W = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;
export function analyze(lines) {
  const V = [];                       // violations
  let abs = true, motion = 0, torch = false, x = 0, y = 0, z = 0, machineCoords = false;
  let cur = null; const blocks = []; let pendingLead = null;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  let m3 = 0, m5 = 0, pierceBeforeMove = 0;
  const bad = /NaN|Infinity|undefined|null|\[object/i;
  const note = (type, i, l) => V.push({ type, line: i + 1, text: l });
  lines.forEach((raw, i) => {
    const l0 = String(raw);
    if (bad.test(l0)) note("non-finite-token", i, l0);
    const l = l0.replace(/\(.*?\)/g, "").split(";")[0].toUpperCase().trim();
    if (!l) return;
    const g = [], w = {}, m = [];
    for (const mm of l.matchAll(W)) { const v = parseFloat(mm[2]); if (mm[1] === "G") g.push(v); else if (mm[1] === "M") m.push(v); else w[mm[1]] = v; }
    for (const v of Object.values(w)) if (!Number.isFinite(v)) note("non-finite-value", i, l0);
    if (g.includes(90)) abs = true;
    if (g.includes(91)) abs = false;
    if (g.includes(53)) machineCoords = true;
    if (g.includes(20)) note("inches", i, l0);
    const isProbe = g.some((v) => v >= 38 && v < 39);
    for (const v of g) if ([0, 1, 2, 3].includes(v)) motion = v;
    const hasXY = "X" in w || "Y" in w;
    // M5 first on the line, then moves, then M3 (mirrors grbl order of execution: M-codes after motion on the same line is
    // actually executed BEFORE motion for spindle in grbl; the app never puts both on one line, flag it if it happens)
    if ((m.includes(3) || m.includes(4)) && (hasXY || "Z" in w)) note("m3-and-motion-same-line", i, l0);
    if (m.includes(5) && (hasXY || "Z" in w)) note("m5-and-motion-same-line", i, l0);
    if (m.includes(5)) { if (torch) { torch = false; if (cur) { blocks.push(cur); cur = null; } } m5++; }
    if (hasXY && !isProbe && !machineCoords) {
      const nx = "X" in w ? (abs ? w.X : x + w.X) : x, ny = "Y" in w ? (abs ? w.Y : y + w.Y) : y;
      if (motion === 0 && torch) note("rapid-while-torch-on", i, l0);
      if (motion !== 0 && !torch && !g.includes(4)) note("cut-move-while-torch-off", i, l0);
      if (torch && cur) {
        if (motion === 2 || motion === 3) {
          const cx = x + (w.I || 0), cy = y + (w.J || 0), r = Math.hypot(x - cx, y - cy), r2 = Math.hypot(nx - cx, ny - cy);
          if (Math.abs(r - r2) > 0.02) note("arc-radius-mismatch", i, l0 + ` r0=${r.toFixed(3)} r1=${r2.toFixed(3)}`);
          const a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx), cw = motion === 2;
          let sw = cw ? a0 - a1 : a1 - a0; while (sw <= 1e-9) sw += 2 * Math.PI;
          if (Math.hypot(nx - x, ny - y) < 1e-6) sw = 2 * Math.PI;
          const n = Math.max(8, Math.ceil(sw / (Math.PI / 90)));
          for (let k = 1; k <= n; k++) { const a = cw ? a0 - sw * k / n : a0 + sw * k / n; cur.pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        } else cur.pts.push([nx, ny]);
      }
      for (const [px, py] of [[x, y], [nx, ny]]) { minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py); }
      if (!torch) pendingLead = [nx, ny];
      x = nx; y = ny;
    }
    if (g.includes(53) && !hasXY) { /* machine Z move */ }
    if (g.includes(53)) machineCoords = false;
    if (m.includes(3) || m.includes(4)) {
      if (torch) note("double-M3", i, l0);
      torch = true; m3++;
      cur = { lead: pendingLead ? [...pendingLead] : [x, y], line: i + 1, pts: [[x, y]], order: blocks.length };
    }
    if (m.includes(2) || m.includes(30)) { if (torch) { note("M30-with-torch-on", i, l0); } torch = false; }
  });
  if (torch) V.push({ type: "torch-left-on-at-end" });
  if (m3 !== m5 && m5 < m3) V.push({ type: "m3-m5-imbalance", m3, m5 });
  if (cur) blocks.push(cur);
  return { violations: V, blocks, m3, m5, bounds: [minx, miny, maxx, maxy] };
}
export const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
export const inPoly = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
export const bb = (p) => p.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
function cross(a, b, c, d) { const o = (p, q, r) => (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]); const d1=o(c,d,a),d2=o(c,d,b),d3=o(a,b,c),d4=o(a,b,d); return d1*d2<-1e-9&&d3*d4<-1e-9; }
export function selfCross(p) { const n = p.length; if (n > 1500) return false; for (let i = 0; i < n - 1; i++) for (let j = i + 2; j < n - 1; j++) { if (i === 0 && j === n - 2) continue; if (cross(p[i], p[i+1], p[j], p[j+1])) return true; } return false; }

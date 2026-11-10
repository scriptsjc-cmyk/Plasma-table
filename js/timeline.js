// Playable cut preview: turn the prepared job into a timeline (where the torch is at second t) so the screen can
// play it, scrub it and show a time estimate. Rapids are dashed, cuts solid, pierces are dots. Nothing here talks to the machine.
import { arcPoints } from "./job.js";

const WORD = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/gi;

export function buildTimeline(lines, machine = {}, cutIndex = []) {
  const rapid = machine.rapid_feed_estimate || 6000, probe = machine.probe || {};
  const probeT = ((probe.probe_distance_mm || 50) / Math.max(probe.probe_feed || 300, 1)) * 60 * 0.3;
  let x = 0, y = 0, motion = 0, feed = 1000, torch = false, abs = true, t = 0, pierceN = 0;
  let delay = 0;
  const segs = [], pierces = [];
  let pendingPierce = null;
  const push = (kind, pts, len, speed) => {
    const dur = (len / Math.max(speed, 1)) * 60;
    segs.push({ kind, pts, len, t0: t, t1: t + dur, cut: pierceN });
    t += dur;
  };
  for (const raw of lines) {
    const u = String(raw).toUpperCase().replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim();
    if (!u) continue;
    const g = [], w = {}, m = [];
    for (const mm of u.matchAll(WORD)) { const v = parseFloat(mm[2]); if (mm[1] === "G") g.push(v); else if (mm[1] === "M") m.push(Math.trunc(v)); else w[mm[1]] = v; }
    if (g.includes(90)) abs = true;
    if (g.includes(91)) abs = false;
    if ("F" in w) feed = w.F;
    if (g.some((v) => v >= 38 && v < 39) || g.includes(31)) { t += probeT; continue; }
    if (g.includes(4)) { t += w.P || 0; continue; }
    if (g.includes(53)) { t += "Z" in w ? 0.4 : 0; continue; }
    for (const v of g) if ([0, 1, 2, 3].includes(v)) motion = v;
    if (m.includes(5)) torch = false;
    if (("X" in w || "Y" in w) && abs) {
      const nx = "X" in w ? w.X : x, ny = "Y" in w ? w.Y : y;
      let pts, len;
      if ((motion === 2 || motion === 3) && ("I" in w || "J" in w)) ({ pts, length: len } = arcPoints(x, y, nx, ny, w.I || 0, w.J || 0, motion === 2));
      else { pts = [[nx, ny]]; len = Math.hypot(nx - x, ny - y); }
      push(torch && motion !== 0 ? "cut" : "rapid", [[x, y], ...pts], len, motion === 0 ? rapid : feed);
      x = nx; y = ny;
    } else if ("Z" in w && !abs) t += 0.1;
    if ((m.includes(3) || m.includes(4)) && !torch) {
      torch = true; pierceN++;
      const at = (cutIndex[pierceN - 1] && cutIndex[pierceN - 1].at) || [x, y];
      pierces.push({ n: pierceN, t, at: [x, y] });
      t += 1.0 + probeT;          // probe + lift + torch on
    }
  }
  return { segs, pierces, total: t, rapidLen: segs.filter((s) => s.kind === "rapid").reduce((a, s) => a + s.len, 0) };
}

// everything drawn up to time `at`: returns { done: [{kind, pts}], torch: [x, y], firing: bool, cut: n }
export function stateAt(tl, at) {
  const done = []; let pos = [0, 0], firing = false, cut = 0;
  for (const s of tl.segs) {
    if (s.t0 >= at) break;
    const f = s.t1 > s.t0 ? Math.min(1, (at - s.t0) / (s.t1 - s.t0)) : 1;
    const target = s.len * f;
    const pts = [s.pts[0]]; let acc = 0;
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1], b = s.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + l <= target + 1e-9) { pts.push(b); acc += l; }
      else { const k = l ? (target - acc) / l : 0; pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); break; }
    }
    done.push({ kind: s.kind, pts });
    pos = pts[pts.length - 1];
    firing = s.kind === "cut" && f < 1;
    cut = s.cut;
  }
  const dots = tl.pierces.filter((p) => p.t <= at).map((p) => p.at);
  return { done, torch: pos, firing, cut, dots };
}

export function clockText(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// r15 6.3: the small-hole rule, built once. A hole under 1.5 × the sheet thickness may not cut cleanly with plasma (the
// pierce and the bevel eat it), so it is better drilled. Used by the Features rows' live check (Round 2 item 10) and
// shown live under every hole-size field in the size form; "Mark for drilling" etches a cross at the hole's centre instead.
const exact = (v) => Math.round(Number(v) * 1e6) / 1e6;

export function smallHoleRule(d, thickness) {
  const D = Number(d), t = Number(thickness) > 0 ? Number(thickness) : 3;
  if (!(D > 0)) return null;                                   // 0 = no hole (or "auto")
  const limit = exact(1.5 * t);
  if (D >= limit - 1e-9) return null;
  return { limit, text: `Hole Ø${exact(D)} is smaller than 1.5 × thickness (${limit} mm), so it may not cut cleanly. Drill it instead?` };
}

// a size-form field that is a hole's diameter: "Hole Ø", "Bolt hole Ø", "Centre hole Ø", "Fixing Ø", a loose hole's Diameter…
const HOLE_LABEL = /\bhole Ø|^(fixing|bolt|screw|keyhole) Ø/i;
export function isHoleSizeParam(sh, param) {
  if (!sh || !param) return false;
  const [k, label, , meta] = param;
  if (meta && meta.type === "select") return false;
  if (sh.hole && k === "d") return true;
  return HOLE_LABEL.test(String(label || ""));
}

// a drill mark: an etched cross at the centre, as wide as the hole (at least 3 mm across) so the size still shows
export function drillMark(cx, cy, d) {
  const a = Math.max(1.5, (Number(d) || 0) / 2);
  return [
    { pts: [[cx - a, cy], [cx + a, cy]], closed: false, op: "mark", role: "drill" },
    { pts: [[cx, cy - a], [cx, cy + a]], closed: false, op: "mark", role: "drill" },
  ];
}

// the round holes of a size whose field is marked for drilling become drill marks (the rest is unchanged)
export function applyDrill(cs, sizes, from = 0) {
  const want = (sizes || []).map(Number).filter((v) => v > 0);
  if (!want.length) return cs;
  const out = [];
  cs.forEach((c, i) => {
    if (i < from || !c || c.closed === false || c.op || c.role || !c.pts || c.pts.length < 3) { out.push(c); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of c.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const w = x1 - x0, h = y1 - y0, d = c.circle ? 2 * c.circle.r : Math.max(w, h);
    const round = c.circle || Math.abs(w - h) < Math.max(0.05, d * 0.02);
    if (round && want.some((v) => Math.abs(v - d) < Math.max(0.05, v * 0.01))) {
      const cx = c.circle ? c.circle.cx : (x0 + x1) / 2, cy = c.circle ? c.circle.cy : (y0 + y1) / 2;
      out.push(...drillMark(cx, cy, d));
    } else out.push(c);
  });
  return out;
}

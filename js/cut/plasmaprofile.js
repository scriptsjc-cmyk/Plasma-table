// r16 Round B: the plasma that drives the table (the ANDELI CUT-65DS sold with it, or Josh's Reboot 60A) and the power
// supply it is plugged into. Pure functions only (no page, no storage), so the unit tests can check every number.
//   expandChart   materials marked "same_as" (Galvanised, Zintec, Corten, Chequer plate) get the rows of the one they copy
//   rowFor        the chart row for any thickness: exact, or between two rows (amps and pierce delay round UP, speed DOWN)
//   supplyCap     the most amps the chosen supply can hold; capRow scales the speed down when the row needs more
//   cutStatus     pierce OK / edge start / over the supply / rough edge / over the plasma's limit
//   dutyCheck     whether a job's arc-on time fits the plasma's duty cycle at those amps
//   parseThickness  "3", "3 mm", "3/16", "3/16\"", "0.125in", "16 swg"

export const DEFAULT_SUPPLY = "16a";

export function expandChart(chart) {
  if (!chart || !Array.isArray(chart.materials)) return chart;
  const byName = new Map(chart.materials.filter((m) => Array.isArray(m.rows)).map((m) => [m.name, m]));
  for (const m of chart.materials) {
    if (Array.isArray(m.rows) || !m.same_as) continue;
    const src = byName.get(m.same_as);
    const max = Number(m.max_cuttable_mm) || Infinity;
    m.rows = src ? src.rows.filter((r) => r.thickness_mm <= max).map((r) => ({ ...r })) : [];
  }
  chart.materials = chart.materials.filter((m) => Array.isArray(m.rows) && m.rows.length);
  return chart;
}

export const profileOf = (chart) => (chart && chart.profile) || null;
export function suppliesOf(chart) { return (chart && Array.isArray(chart.supplies)) ? chart.supplies : []; }
export function supplyOf(chart, id) {
  const list = suppliesOf(chart);
  return list.find((s) => s.id === id) || list.find((s) => s.id === DEFAULT_SUPPLY) || list[0] || null;
}
export function materialMax(mat) {
  const rows = (mat && mat.rows) || [];
  const last = rows.length ? rows[rows.length - 1].thickness_mm : 0;
  return Math.min(Number(mat && mat.max_cuttable_mm) || last, last || Infinity);
}

// the row for a thickness; between two rows the cut gets the thicker row's amps, pierce, kerf and lead, and a speed
// worked out in between, rounded down to 10 mm/min (slower is the safe side)
export function rowFor(mat, t) {
  const rows = (mat && mat.rows) || [];
  if (!rows.length) return null;
  const T = Number(t);
  const exact = rows.find((r) => Number(r.thickness_mm) === T);
  if (exact) return exact;
  if (!(T > 0) || T < rows[0].thickness_mm) return rows[0];
  const hi = rows.findIndex((r) => r.thickness_mm > T);
  if (hi < 0) return null;                                       // thicker than this material goes: no row
  const a = rows[hi - 1], b = rows[hi];
  const f = (T - a.thickness_mm) / (b.thickness_mm - a.thickness_mm);
  const feed = Math.floor((a.feed_mm_min + (b.feed_mm_min - a.feed_mm_min) * f) / 10) * 10;
  return { ...b, thickness_mm: T, feed_mm_min: feed, between: [a.thickness_mm, b.thickness_mm] };
}

// amps: what the row asks for, never more than the plasma or the supply can give
export function supplyCap(chart, supplyId) {
  const p = profileOf(chart), s = supplyOf(chart, supplyId);
  const machineMax = p ? (s && s.v110 ? p.amps_max_110v : p.amps_max_230v) || Infinity : Infinity;
  return Math.min(machineMax, s && Number(s.amps_cap) > 0 ? Number(s.amps_cap) : Infinity);
}
export function capRow(chart, row, supplyId) {
  if (!row) return row;
  const cap = supplyCap(chart, supplyId);
  if (!(Number(row.amps) > cap)) return { ...row, capped: false };
  const feed = Math.floor((row.feed_mm_min * cap / row.amps) / 10) * 10;
  return { ...row, amps: cap, feed_mm_min: feed, chart_amps: row.amps, chart_feed: row.feed_mm_min, capped: true, nozzle_mm: nozzleFor(chart, cap) ?? row.nozzle_mm };
}
export function nozzleFor(chart, amps) {
  const n = (profileOf(chart) || {}).nozzles || [];
  const hit = n.find((x) => amps <= x.amps_max);
  return hit ? hit.mm : (n.length ? n[n.length - 1].mm : null);
}
export function pierceMax(chart, supplyId) {
  const p = profileOf(chart), s = supplyOf(chart, supplyId);
  if (!p) return Infinity;
  return (s && s.v110 ? p.pierce_max_mm_110v : p.pierce_max_mm) || Infinity;
}
export function ecoAdvised(chart, amps) {
  const p = profileOf(chart);
  return !!(p && p.eco_mode && Number(p.eco_amps) > 0 && amps <= p.eco_amps);
}

// what the badge under the settings card says. kind: ok | edge | supply | rough | over
export function cutStatus(chart, mat, t, supplyId) {
  const s = supplyOf(chart, supplyId), out = [];
  const max = materialMax(mat);
  if (Number(t) > max) return [{ kind: "over", text: `Over ${max} mm is beyond this plasma for ${String(mat.name).toLowerCase()} – use a saw or waterjet.` }];
  const row = rowFor(mat, t);
  const cap = supplyCap(chart, supplyId), p = profileOf(chart);
  if (row && Number(row.amps) > cap && s && s.limited) {
    const machineLimit = s.v110 && p && cap >= p.amps_max_110v;
    out.push({ kind: "supply", text: machineLimit
      ? `On 110 V the plasma gives ${cap} A at most – this cuts slower. A 16 A supply gives full power.`
      : `Over your ${s.label.replace(/,.*$/, "")}'s limit – it will cut slower at ${cap} A, and may trip it part-way through. Needs a 16 A supply for full power.` });
  }
  if (Number(t) > pierceMax(chart, supplyId))
    out.push({ kind: "edge", text: `Too thick to pierce (over ${pierceMax(chart, supplyId)} mm) – start each cut from the sheet edge or a drilled start hole.` });
  if (row && row.quality === "rough") out.push({ kind: "rough", text: "Rough edge – fine for scrap, not finished parts." });
  else if (row && row.quality === "usable") out.push({ kind: "rough", text: "Usable edge – expect some clean-up." });
  if (!out.length) out.push({ kind: "ok", text: "Pierce OK" });
  return out;
}

// duty cycle: the % of each 10 minutes the arc can run at these amps (straight line between the plasma's figures)
export function dutyPct(chart, amps) {
  const d = ((profileOf(chart) || {}).duty || []).slice().sort((a, b) => a.amps - b.amps);
  if (!d.length) return 100;
  if (amps <= d[0].amps) return d[0].pct;
  for (let i = 1; i < d.length; i++) {
    if (amps <= d[i].amps) { const a = d[i - 1], b = d[i]; return Math.round(a.pct + (b.pct - a.pct) * (amps - a.amps) / (b.amps - a.amps)); }
  }
  return d[d.length - 1].pct;
}
// arcSeconds: torch-on time of the job; totalSeconds: the whole job. Looks at the busiest 10 minutes.
export function dutyCheck(chart, amps, arcSeconds, totalSeconds) {
  const pct = dutyPct(chart, amps);
  const allowed = 600 * pct / 100;
  const arc = Math.max(0, Number(arcSeconds) || 0), total = Math.max(arc, Number(totalSeconds) || 0);
  const busiest = total > 600 ? 600 * arc / total : arc;
  const fullAmps = ((profileOf(chart) || {}).duty || []).find((x) => x.pct >= 100);
  return { pct, allowedSeconds: Math.round(allowed), busiestSeconds: Math.round(busiest), ok: pct >= 100 || busiest <= allowed, safeAmps: fullAmps ? fullAmps.amps : null };
}

// typed sheet thickness → mm. SWG is the UK sheet gauge.
const SWG = { 8: 4.06, 9: 3.66, 10: 3.25, 11: 2.95, 12: 2.64, 13: 2.34, 14: 2.03, 16: 1.63, 18: 1.22, 20: 0.91, 22: 0.71, 24: 0.56 };
export function parseThickness(text) {
  const s = String(text || "").trim().toLowerCase().replace(/,/g, ".").replace(/″/g, '"');
  if (!s) return null;
  let m = s.match(/^(\d+)\s*(swg|g|ga|gauge)$/);
  if (m) return SWG[Number(m[1])] ?? null;
  const unit = (u) => (!u || u === "mm") ? 1 : 25.4;
  const done = (v) => { v = Math.round(v * 100) / 100; return v > 0 && v < 1000 ? v : null; };
  m = s.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)\s*(in|inch|inches|")?$/);         // 3/16, 1 1/4", fractions are inches
  if (m) { const d = Number(m[3]); if (!(d > 0)) return null; return done(((m[1] ? Number(m[1]) : 0) + Number(m[2]) / d) * 25.4); }
  m = s.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(mm|in|inch|inches|")?$/);
  if (m) return done(Number(m[1]) * unit(m[2]));
  return null;
}

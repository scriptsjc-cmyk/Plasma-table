// Etch / Score / Mark: a real first pass (plasma etch or a scribe/marker tool)
// that must never become a through-cut. Used by CAM, the job builder and Start/Download guards.
export const ETCH_OPS = ["score", "mark"];
export const ETCH_START_PLASMA = "; PORTA-ETCH PLASMA";
export const ETCH_START_SCRIBE = "; PORTA-ETCH SCRIBE";
export const ETCH_END = "; PORTA-ETCH END";

export function isEtchOp(op) { return ETCH_OPS.includes(op); }

export function defaultEtchSettings() {
  return {
    tool: "plasma",          // "plasma" | "scribe"
    pauseAfter: false,       // M0 after etch so the operator can set cut amps
    plasma: { amps: null, feed_mm_min: null, height_mm: null }, // null = from the cut chart
    scribe: { on: "M8", off: "M9", offsetX: 0, offsetY: 0 },
  };
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export function sanitizeEtchSettings(raw) {
  const d = defaultEtchSettings(), src = raw && typeof raw === "object" ? raw : {};
  const out = defaultEtchSettings();
  out.tool = src.tool === "scribe" ? "scribe" : "plasma";
  out.pauseAfter = src.pauseAfter === true;
  const p = src.plasma && typeof src.plasma === "object" ? src.plasma : {};
  const amps = num(p.amps), feed = num(p.feed_mm_min), ht = num(p.height_mm);
  if (amps != null && amps >= 5 && amps <= 200) out.plasma.amps = amps;
  if (feed != null && feed >= 50 && feed <= 30000) out.plasma.feed_mm_min = feed;
  if (ht != null && ht >= 0 && ht <= 25) out.plasma.height_mm = ht;
  const s = src.scribe && typeof src.scribe === "object" ? src.scribe : {};
  const on = sanitizeMcode(s.on, d.scribe.on);
  const off = sanitizeMcode(s.off, d.scribe.off);
  if (!on || !off) return { settings: d, errors: ["Scribe / marker on and off must be M-codes such as M8 and M9."] };
  out.scribe.on = on; out.scribe.off = off;
  const ox = num(s.offsetX), oy = num(s.offsetY);
  if (ox != null && Math.abs(ox) <= 50) out.scribe.offsetX = ox;
  if (oy != null && Math.abs(oy) <= 50) out.scribe.offsetY = oy;
  return { settings: out, errors: [] };
}

export function sanitizeMcode(v, fallback) {
  const s = String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return fallback;
  const m = s.match(/^M(\d{1,3})$/);
  if (!m) return null;
  const n = Number(m[1]);
  // Never allow torch on/off or program end as a "scribe" code — that would become a through-cut or end the job.
  if ([2, 3, 4, 5, 30].includes(n)) return null;
  return "M" + n;
}

// Per-material plasma etch: low amps, high speed, no pierce delay. Chart fields win; otherwise a safe estimate.
export function plasmaEtchFromRow(row, chart) {
  const r = row || {}, c = chart || {};
  const cutAmps = Number(r.amps) || 40;
  const cutFeed = Number(r.feed_mm_min) || 1000;
  const cutH = Number(r.cut_height_mm ?? c.cut_height_mm) || 1.5;
  const amps = Number(r.etch_amps) > 0 ? Number(r.etch_amps) : Math.max(10, Math.min(25, Math.round(cutAmps * 0.35)));
  const feed = Number(r.etch_feed_mm_min) > 0 ? Number(r.etch_feed_mm_min) : Math.max(cutFeed * 2, Math.min(12000, cutFeed * 3));
  const height = Number(r.etch_height_mm) > 0 ? Number(r.etch_height_mm) : cutH;
  return { amps, feed_mm_min: Math.round(feed), height_mm: height, pierce_delay_s: 0, cut_amps: cutAmps };
}

export function etchSettingsNow(settings) {
  return sanitizeEtchSettings(settings && settings.etch ? settings.etch : settings).settings;
}

export function resolveEtch(row, chart, settings) {
  const st = etchSettingsNow(settings);
  const plasma = plasmaEtchFromRow(row, chart);
  if (st.plasma.amps != null) plasma.amps = st.plasma.amps;
  if (st.plasma.feed_mm_min != null) plasma.feed_mm_min = st.plasma.feed_mm_min;
  if (st.plasma.height_mm != null) plasma.height_mm = st.plasma.height_mm;
  return { tool: st.tool, pauseAfter: st.pauseAfter, plasma, scribe: st.scribe };
}

export function etchConfigProblem(resolved) {
  if (!resolved) return "Etch settings are missing.";
  if (resolved.tool === "scribe") {
    if (!sanitizeMcode(resolved.scribe && resolved.scribe.on) || !sanitizeMcode(resolved.scribe && resolved.scribe.off)) {
      return "Scribe / marker needs a tool-on and tool-off M-code in Settings (Etch / mark). They cannot be the torch codes M3 / M5.";
    }
  } else if (!(resolved.plasma && resolved.plasma.feed_mm_min > 0)) {
    return "Plasma etch needs a feed rate in Settings (Etch / mark) or the cut chart.";
  }
  return "";
}

function fmt(v) {
  let s = Number(v).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0" || s === "") s = "0";
  return s;
}

function offsetPts(pts, dx, dy) {
  if (!(dx || dy)) return pts;
  return pts.map(([x, y]) => [x + dx, y + dy]);
}

// Design-space etch paths → G-code lines (no kerf, no lead-in, no pierce). Transform T maps to job coordinates.
export function emitEtchGcode(contours, { T = (p) => p, resolved, name = "etch" } = {}) {
  const list = (contours || []).filter((c) => c && c.pts && c.pts.length >= 2);
  if (!list.length) return { lines: [], count: 0 };
  const r = resolved || resolveEtch();
  const why = etchConfigProblem(r);
  if (why) throw new Error(why);
  const scribe = r.tool === "scribe";
  const dx = scribe ? (Number(r.scribe.offsetX) || 0) : 0;
  const dy = scribe ? (Number(r.scribe.offsetY) || 0) : 0;
  const lines = [];
  lines.push(scribe ? ETCH_START_SCRIBE : ETCH_START_PLASMA);
  if (scribe) {
    lines.push(`; scribe/marker on ${r.scribe.on}, off ${r.scribe.off}` + ((dx || dy) ? `, offset ${fmt(dx)}, ${fmt(dy)} mm` : ""));
  } else {
    lines.push(`; plasma etch: set the unit to ${r.plasma.amps} A, ${r.plasma.feed_mm_min} mm/min, no pierce delay (will not cut through)`);
  }
  for (const c of list) {
    const pts = offsetPts(c.pts, dx, dy).map(T);
    const a = pts[0];
    lines.push(`G0 X${fmt(a[0])} Y${fmt(a[1])}`);
    lines.push(scribe ? r.scribe.on : "M3");
    for (let i = 1; i < pts.length; i++) lines.push(`G1 X${fmt(pts[i][0])} Y${fmt(pts[i][1])}`);
    if (c.closed !== false && pts.length >= 3) {
      const d = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
      if (d > 0.05) lines.push(`G1 X${fmt(pts[0][0])} Y${fmt(pts[0][1])}`);
    }
    lines.push(scribe ? r.scribe.off : "M5");
  }
  lines.push(ETCH_END);
  if (r.pauseAfter) {
    const amps = r.plasma && r.plasma.cut_amps;
    lines.push(amps ? `; set the plasma back to ${amps} A for cutting` : "; set the plasma back to the cutting current");
    lines.push("M0");
  } else if (!scribe && r.plasma && r.plasma.cut_amps) {
    lines.push(`; after etch, set the plasma to ${r.plasma.cut_amps} A before the cuts that follow`);
  }
  return { lines, count: list.length, tool: r.tool };
}

// Split a prepared G-code listing into etch block(s) and the rest.
export function etchSections(lines) {
  const text = Array.isArray(lines) ? lines : String(lines || "").split(/\r?\n/);
  const blocks = [];
  let cur = null, rest = [];
  for (const raw of text) {
    const s = String(raw);
    if (/PORTA-ETCH (PLASMA|SCRIBE)/i.test(s)) { cur = { kind: /SCRIBE/i.test(s) ? "scribe" : "plasma", lines: [s] }; continue; }
    if (/PORTA-ETCH END/i.test(s)) { if (cur) { cur.lines.push(s); blocks.push(cur); cur = null; } else rest.push(s); continue; }
    if (cur) cur.lines.push(s); else rest.push(s);
  }
  if (cur) blocks.push(cur);
  return { blocks, rest };
}

// True when an etch pass would actually be a through-cut (pierce delay, or etch geometry cut as a normal pierce).
export function throughCutInEtch(lines, { hasEtchItems = false } = {}) {
  const { blocks, rest } = etchSections(lines);
  if (hasEtchItems && !blocks.length) {
    return "Score / Mark lines would be cut through at full power (no etch pass was written). Check Etch / mark in Settings.";
  }
  for (const b of blocks) {
    const body = b.lines.join("\n");
    // A positive dwell after torch-on in an etch block is a pierce delay — that would cut through.
    const delay = [...body.matchAll(/\bG4\s*P([0-9.]+)/gi)].map((m) => Number(m[1])).filter((n) => n > 0.05);
    if (b.kind === "plasma" && delay.length) {
      return "Plasma etch would have used a pierce delay, which would cut through the sheet. The etch pass must run with no pierce delay.";
    }
    if (b.kind === "scribe" && /\bM0*3\b|\bM0*4\b/i.test(body)) {
      return "A scribe / marker pass used the torch (M3). That would cut through. Use the configured tool-on M-code, not M3.";
    }
  }
  return "";
}

export function hasEtchItems(items, hidden) {
  const layerHidden = hidden || ((it) => !!(it && it.hide));
  return !!(items && items.some((it) => isEtchOp(it.op) && !layerHidden(it)));
}

export function hasEtchContours(contours) {
  return !!(contours && contours.some((c) => isEtchOp(c.op)));
}

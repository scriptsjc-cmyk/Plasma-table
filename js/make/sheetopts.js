// Shared sheet-metal options (C35): thickness basis, seam, and a printable true-length table.
// When thickness is 0 the developments stay exactly as they were (existing tests stay green).

export const ALLOW_INSIDE = 0, ALLOW_MEAN = 1, ALLOW_OUTSIDE = 2;
export const ALLOW_LABELS = ["inside", "mean", "outside"];

export const SHEET_PARAMS = [
  ["t", "Material thickness (0 = as drawn)", 0],
  ["allow", "Thickness basis (0 inside, 1 mean, 2 outside)", 1, {
    type: "select",
    options: [
      { v: 0, l: "Inside" },
      { v: 1, l: "Mean (neutral axis)" },
      { v: 2, l: "Outside" },
    ],
  }],
  ["seam", "Seam allowance (mm)", 0],
  ["seamAt", "Seam position (°)", 0],
];

export function sheetFrom(p = {}) {
  const t = Math.max(0, Number(p.t) || 0);
  let allow = Number(p.allow);
  if (!Number.isFinite(allow)) allow = ALLOW_MEAN;
  allow = Math.max(0, Math.min(2, Math.round(allow)));
  const seam = Math.max(0, Number(p.seam) || 0);
  const seamAt = Number(p.seamAt) || 0;
  return { t, allow, seam, seamAt };
}

export function developedDia(od, t, allow) {
  const D = Number(od) || 0, T = Math.max(0, Number(t) || 0);
  if (!(T > 0)) return D;
  const a = allow === ALLOW_INSIDE || allow === "inside" ? ALLOW_INSIDE
    : allow === ALLOW_OUTSIDE || allow === "outside" ? ALLOW_OUTSIDE
    : ALLOW_MEAN;
  if (a === ALLOW_INSIDE) return Math.max(0.5, D - 2 * T);
  if (a === ALLOW_OUTSIDE) return D;
  return Math.max(0.5, D - T);
}

export function wrapLength(od, t, allow, seam) {
  return Math.PI * developedDia(od, t, allow) + Math.max(0, Number(seam) || 0);
}

export function seamShift(circ, seamAt) {
  const a = ((Number(seamAt) || 0) % 360 + 360) % 360;
  return circ * a / 360;
}

const r1 = (v) => Math.round(v * 10) / 10;

// True lengths for a gored elbow: one row per gore, plus wrap and triangulation notes.
export function elbowTable(d, bendDeg, pieces, clr, opts = {}) {
  const { t = 0, allow = ALLOW_MEAN, seam = 0, seamAt = 0 } = opts;
  const n = Math.max(2, Math.min(12, Math.round(Number(pieces) || 2)));
  const dia = developedDia(d, t, allow);
  const R = dia / 2;
  const a = ((Number(bendDeg) || 0) * Math.PI / 180) / (2 * (n - 1));
  let rad = Number(clr);
  if (!Number.isFinite(rad) || rad <= 0) rad = 1.5 * (Number(d) || dia);
  if (rad < R + 1) rad = R + 1;
  const L = rad * Math.tan(a);              // centreline length of an end gore
  const amp = R * Math.tan(a);
  const circ = Math.PI * dia;
  const wrap = circ + Math.max(0, seam);
  const back = (kind) => kind === "mid" ? 2 * L + 2 * amp : L + amp;
  const throat = (kind) => kind === "mid" ? 2 * L : Math.max(0, L - amp);
  const mid = (kind) => kind === "mid" ? 2 * L : L;
  const gores = [];
  gores.push({ name: "End gore 1", kind: "end", wrap: r1(wrap), mid: r1(mid("end")), throat: r1(throat("end")), back: r1(back("end")) });
  for (let i = 0; i < n - 2; i++) {
    gores.push({ name: "Middle gore " + (i + 1), kind: "mid", wrap: r1(wrap), mid: r1(mid("mid")), throat: r1(throat("mid")), back: r1(back("mid")) });
  }
  gores.push({ name: "End gore 2", kind: "end", wrap: r1(wrap), mid: r1(mid("end")), throat: r1(throat("end")), back: r1(back("end")) });
  const tri = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const x = r1((wrap * i) / steps);
    const c = Math.cos((2 * Math.PI * (circ * i / steps)) / circ || 0);
    // end gore heights at this station (square end at y=0)
    const top = r1(L + amp * Math.cos((2 * Math.PI * i) / steps));
    tri.push({ x, endTop: top, endBot: 0, midTop: r1(2 * L + amp * (1 + Math.cos((2 * Math.PI * i) / steps))), midBot: r1(amp * (1 - Math.cos((2 * Math.PI * i) / steps))) });
  }
  return {
    kind: "elbow",
    basis: ALLOW_LABELS[allow] || "mean",
    thickness: t,
    developedDia: r1(dia),
    wrap: r1(wrap),
    circ: r1(circ),
    seam: r1(seam),
    seamAt: r1(((seamAt % 360) + 360) % 360),
    clr: r1(rad),
    bend: Number(bendDeg) || 0,
    pieces: n,
    gores,
    triangulation: tri,
  };
}

export function tableToHtml(tab) {
  if (!tab) return "<p>No table for this part.</p>";
  const rows = (tab.gores || []).map((g) =>
    `<tr><td>${g.name}</td><td>${g.wrap}</td><td>${g.mid}</td><td>${g.throat}</td><td>${g.back}</td></tr>`).join("");
  const tri = (tab.triangulation || []).map((r) =>
    `<tr><td>${r.x}</td><td>${r.endBot}</td><td>${r.endTop}</td><td>${r.midBot}</td><td>${r.midTop}</td></tr>`).join("");
  return `<article class="sheet-table">
    <h2>True-length table</h2>
    <p>${tab.pieces}-piece ${tab.bend}° ${tab.kind === "redelbow" ? "reducing elbow · big end" : "elbow ·"} ${tab.basis} diameter ${tab.developedDia} mm
      · wrap ${tab.wrap} mm (including ${tab.seam} mm seam at ${tab.seamAt}°)
      · CLR ${tab.clr} mm · thickness ${tab.thickness} mm.</p>
    <table><thead><tr><th>Gore</th><th>Wrap (mm)</th><th>Centreline (mm)</th><th>Throat (mm)</th><th>Back (mm)</th></tr></thead>
    <tbody>${rows}</tbody></table>
${tri ? `<h3>Triangulation (marking-out stations)</h3>
    <table><thead><tr><th>Around (mm)</th><th>End square</th><th>End mitre</th><th>Mid throat side</th><th>Mid back side</th></tr></thead>
    <tbody>${tri}</tbody></table>` : ""}
    <p class="muted small">All lengths in millimetres. Mark the wrap along the developed circumference, then transfer the station heights.</p>
  </article>`;
}

export function openSheetTable(html) {
  const w = window.open("", "sheet-table", "width=720,height=800");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><title>True-length table</title>
    <style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#1a1a1a}
    table{border-collapse:collapse;width:100%;margin:12px 0}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#f4f4f4} h2,h3{margin:0.6em 0 0.3em}
    .muted{color:#555}@media print{button{display:none}}</style></head>
    <body>${html}<p><button onclick="window.print()">Print</button></p></body></html>`);
  w.document.close();
  return true;
}

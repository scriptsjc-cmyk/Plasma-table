// Turns the drawing into a job: kerf / lead-in, the safety check and loadJob().
import { checkDesign, machineLimits } from "./check.js";
import { screen } from "../ui/flow.js";
import { designToGcode } from "./cam.js";
import { camOpts } from "./camedit.js";
import { paintCutList } from "./cutlist.js";
import { paintStartCut } from "./restart.js";
import * as CF from "./cutfeatures-ui.js";
import { $, $$, esc } from "../core/dom.js";
import { overrides, row } from "./material.js";
import { M, S, sketch } from "../core/state.js";
import { refresh } from "../core/hooks.js";

// ------------------------------------------------------------------ job prepare + preview
export function kerfNow() { const v = Number($("ovKerf").value); return v > 0 ? v : (row().kerf_mm ?? S.chart.kerf_mm ?? 1.5); }
export function leadNow() { const v = $("ovLead").value.trim(); return v !== "" && Number(v) >= 0 ? Number(v) : (row().lead_in_mm ?? S.chart.lead_in_mm ?? 3); }
// ---- cut check + what the machine can do
function limitsNow() {
  const t = S.cfg.travel_mm, L = S.safety.limits;
  const table = L ? [Math.round(L.x[1] - L.x[0]), Math.round(L.y[1] - L.y[0])] : [t.x, t.y];
  return { thickness: S.thickness, kerf: kerfNow(), leadIn: leadNow(), table, accuracy: S.cfg.accuracy_mm ?? 0.5, slatPitch: S.cfg.slat_pitch_mm ?? 100 };
}
function runCheck(contours) {
  try { return checkDesign(contours, limitsNow()); } catch (e) { console.error(e); return null; }
}
export function renderCutCheck() {
  const chk = S.check, mat = `${(S.material || "").toLowerCase()} ${S.thickness} mm`;
  const html = !chk ? "" : `
    <div class="cchead">Cut check <span>· ${esc(mat)}</span></div>
    ${chk.groups.length ? `<ol>${chk.groups.map((g) => `<li class="${g.level}"><b>${g.n}</b><span>${g.spots.length > 1 ? `<i>${g.spots.length} places:</i> ` : ""}${esc(g.text)}</span></li>`).join("")}</ol>`
      : `<p class="ok">✓ Looks cuttable – nothing too small, thin or close for ${esc(mat)}.</p>`}`;
  const tabBtn = chk && !S.cam.tabs && chk.groups.some((g) => /slats|tip/i.test(g.text))
    ? `<div class="row"><button type="button" class="small" data-r2act="tabs">Add 2 hold-down tabs per part</button></div>` : "";
  // Round 5: the cut check is for cutting, not for designing. While you make a part nothing is flagged (no panel, no marks on the
  // drawing); it is shown on the cutting screen, when a file is loaded or the part has been sent to be cut.
  const cutting = screen() === "cut";
  $("cutCheck").innerHTML = "";
  $("cutCheck2").innerHTML = html + tabBtn;
  if ($("cutCheck3")) $("cutCheck3").innerHTML = cutting ? html + tabBtn : "";
  if (sketch) sketch.setMarks(cutting && S.src === "shape" && chk ? chk.issues : []);
  const L = machineLimits(limitsNow());
  const rows = [
    ["Cutting area", `${L.table[0]} × ${L.table[1]} mm${S.safety.limits ? " (your edges)" : ""}`],
    ["Accuracy", `about ±${L.accuracy} mm`],
    ["Cut width (kerf)", `${L.kerf} mm – allowed for automatically, parts come out the size you draw`],
    ["Smallest hole", `${L.minHole} mm for ${L.thickness} mm sheet (about 1½ × thickness) – smaller is better drilled`],
    ["Thinnest strip of metal", `${L.minStrip} mm between cuts`],
    ["Gap between parts", `${L.minPartGap} mm or more (lead-in + cut)`],
    ["Inside corners", `come out slightly round (about ${L.insideCorner} mm radius)`],
    ["Edges", "a little bevel and dross on thick plate – normal for plasma"],
    ["Small parts", `under about ${L.slatPitch} mm can tip between the slats – put scrap under them`],
  ];
  const body = `<table class="limits">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${esc(b)}</td></tr>`).join("")}</table>`;
  $$(".limitsBody").forEach((el) => (el.innerHTML = body));
}
export function loadJob() {
  if (!S.gcode && !S.design) return;
  try {
    let gcode = S.gcode, cam = null, pre = [];
    if (S.design) {
      cam = designToGcode(S.design.contours, { kerf: kerfNow(), leadIn: leadNow(), name: S.fileName, keepOrigin: !!(S.sheetMode && S.src === "shape" && !S.design.straight), ...camOpts() });
      gcode = cam.gcode;
      pre = [...(S.design.warnings || []), ...cam.warnings];
      if (S.design.straight) pre = pre.filter((w) => !/aren't closed shapes/.test(w));
    }
    S.prepared = M.loadJob({ gcode, name: S.fileName, material: S.material, thickness: S.thickness,
      dry_run: $("dryRun").checked, overrides: overrides() });
    // B5 36: 9-point job origin. Shift the whole program so the chosen point of the job's box sits at work zero, then load it again so every check sees the real moves.
    const og = CF.jobOriginShift(S.prepared.stats && S.prepared.stats.bounds);
    if (og) {
      gcode = CF.shiftGcode(gcode, og[0], og[1]);
      S.prepared = M.loadJob({ gcode, name: S.fileName, material: S.material, thickness: S.thickness, dry_run: $("dryRun").checked, overrides: overrides() });
      if (cam) cam = { ...cam, shift: [cam.shift[0] + og[0], cam.shift[1] + og[1]], outline: CF.shiftOutline(cam.outline, og) };
      else S.prepared.shift = null;
    }
    if (cam) { Object.assign(S.prepared, { outline: cam.outline, summary: cam.summary, shift: cam.shift, cutInfo: cam.cutInfo, allCuts: cam.allCuts, autoOrder: cam.autoOrder }); }
    S.check = S.design ? runCheck(S.design.contours) : null;
    if (S.check && cam) S.prepared.marks = S.check.issues.map((m) => ({ ...m, at: [m.at[0] + cam.shift[0], m.at[1] + cam.shift[1]] }));
    // the "left of zero" warning doesn't apply to parts we laid out ourselves
    const ws = [...pre, ...S.prepared.warnings.filter((w) => !((cam || og) && /zero point/.test(w)))];
    $("warnings").innerHTML = ws.map((w) => `<li>${esc(w)}</li>`).join("");
    renderCutCheck();
  } catch (e) {
    S.prepared = null;
    $("warnings").innerHTML = `<li>${esc(e.message)}</li>`;
  }
  paintCutList(); paintStartCut();
  refresh();
}

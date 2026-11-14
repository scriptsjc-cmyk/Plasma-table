// CAD dialog (trim, offset, ...) and the Pro command runner.
import { evalExpr } from "../core/expr.js";
import { $, esc, toast } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { renderProTools } from "./protools.js";
import { clickVerb } from "../ui/laptop.js";
import { def } from "./sketch-util.js";
import { FLANGE_STANDARDS, lookupFlange, applyFlangeDims, flangeShapeKeys } from "./flange-tables.js";
import { getPrefs, savePrefs } from "../core/prefs.js";

export function cadLastFor(title) {
  try { return (getPrefs().cadLast || {})[title] || {}; } catch (e) { return {}; }
}
export function rememberCadLast(title, vals) {
  if (!title || !vals) return;
  try {
    const all = { ...(getPrefs().cadLast || {}) };
    all[title] = { ...vals };
    savePrefs({ cadLast: all });
  } catch (e) { /* headless */ }
}
function withLastUsed(title, fields) {
  const last = cadLastFor(title);
  return fields.map((f) => {
    if (f.note || f.remember === false || last[f.id] == null) return f;
    return { ...f, value: last[f.id] };
  });
}
function readCadVals(fields, { loose } = {}) {
  const vals = {};
  for (const f of fields) {
    if (f.note) continue;
    const el = $("cad_" + f.id);
    if (f.type === "checkbox") { vals[f.id] = !!(el && el.checked); continue; }
    const raw = el ? el.value : "";
    if (f.type === "select" || f.type === "textarea" || f.text) { vals[f.id] = raw; continue; }
    const n = evalExpr(raw);
    if (!Number.isFinite(n)) {
      if (loose) { vals[f.id] = f.value; continue; }
      return { error: f.label };
    }
    vals[f.id] = n;
  }
  return { vals };
}

export function openCad(title, fields, onOk, onPreview) {
  const used = withLastUsed(title, fields);
  $("cadTitle").textContent = title;
  $("cadFields").innerHTML = used.map((f) => {
    if (f.note) return `<p class="muted small">${esc(f.note)}</p>`;
    if (f.type === "checkbox") return `<label class="check"><input id="cad_${f.id}" type="checkbox"${f.value ? " checked" : ""}> ${esc(f.label)}</label>`;
    if (f.type === "select") return `<label>${esc(f.label)}<select id="cad_${f.id}">${(f.options || []).map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(f.value) ? " selected" : ""}>${esc(o.l)}</option>`).join("")}</select></label>`;
    if (f.type === "textarea") return `<label>${esc(f.label)}<textarea id="cad_${f.id}" rows="${f.rows || 8}" style="width:100%;font:inherit">${esc(String(f.value ?? ""))}</textarea></label>`;
    return `<label>${esc(f.label)}<input id="cad_${f.id}" type="${f.type || "number"}" inputmode="${f.text ? "text" : "decimal"}" step="any" value="${esc(String(f.value ?? ""))}"></label>`;
  }).join("");
  const dlg = $("cadDialog");
  dlg.classList.remove("hidden");
  dlg._preview = onPreview || null;
  const runPreview = () => {
    const got = readCadVals(used, { loose: true });
    if (!got.vals) return;
    if (sketch && sketch.setCadPreview) sketch.setCadPreview(title, got.vals);
    if (dlg._preview) dlg._preview(got.vals);
  };
  dlg._runPreview = runPreview;
  dlg._ok = () => {
    const got = readCadVals(used);
    if (got.error) { toast("Check the number in " + got.error, true); return; }
    rememberCadLast(title, got.vals);
    dlg.classList.add("hidden");
    dlg._ok = null;
    dlg._preview = null;
    dlg._runPreview = null;
    if (sketch && sketch.clearCadPreview) sketch.clearCadPreview();
    onOk(got.vals);
  };
  runPreview();
}
export function closeCad() {
  const dlg = $("cadDialog");
  if (dlg) { dlg.classList.add("hidden"); dlg._ok = null; dlg._preview = null; dlg._runPreview = null; }
  if (sketch && sketch.clearCadPreview) sketch.clearCadPreview();
}
export function runPro(cmd) {
  const sheet = S.cfg && S.cfg.travel_mm ? S.cfg.travel_mm : { x: 1300, y: 800 };
  if (cmd === "draw") { sketch.setTool("draw"); renderProTools(); toast(clickVerb() + " points on the drawing, then Close outline."); return; }
  if (cmd === "measure") { sketch.setTool("measure"); renderProTools(); toast(clickVerb() + " two points to measure."); return; }
  if (cmd === "points") { sketch.setPointSnap(!sketch.opts.pointSnap); renderProTools(); return; }
  if (cmd === "lock") { sketch.toggleLock(); return; }
  if (cmd === "subtract") { sketch.subtract(); return; }
  if (cmd === "distx") { sketch.distribute("x"); return; }
  if (cmd === "disty") { sketch.distribute("y"); return; }
  if (cmd === "linarray") {
    openCad("Linear array", [
      { id: "n", label: "How many (including this one, max 50)", value: 3 },
      { id: "gx", label: "Gap across (mm)", value: 10 },
      { id: "gy", label: "Gap up (mm)", value: 0 },
      { note: "The array is limited to 50 copies, including this one. A larger number is clipped to 50." },
    ], (v) => sketch.linearArray(v.n, v.gx, v.gy), (v) => sketch.setCadPreview && sketch.setCadPreview("Linear array", v));
    return;
  }
  if (cmd === "polar") {
    const list = sketch.picked();
    const holeish = list.some((i) => sketch.isHole(i) || (def(i.type) && def(i.type).hole));
    openCad("Circular array", [
      { id: "n", label: "How many around the circle", value: 4 },
      { id: "pcd", label: "Circle Ø (PCD, mm) – 0 = auto", value: 0 },
      { id: "pivot", type: "select", label: "Pivot (centre of the circle)", value: holeish ? "host" : "shape", options: [
        { v: "host", l: "Centre of the plate (or host part)" },
        { v: "shape", l: "Centre of the picked shape" },
        { v: "click", l: "Click a point on the drawing" },
      ] },
      { note: "For a ring of holes on a plate, pick the hole and use the plate centre. Or click the centre yourself." },
    ], (v) => sketch.polarArray(v.n, v.pcd, { mode: v.pivot }), (v) => sketch.setCadPreview && sketch.setCadPreview("Circular array", v));
    return;
  }
  if (cmd === "offset") {
    openCad("Offset the outline", [
      { id: "d", label: "Offset (mm) – plus grows, minus shrinks", value: 5 },
      { id: "keep", type: "checkbox", label: "Keep the original part" },
      { id: "both", type: "checkbox", label: "Both sides (a strip of this width)" },
      { note: "A shrink that would invert, spike or leave a sliver is refused. Circles stay circles." },
    ], (v) => sketch.offsetBy(v.d, { keepOriginal: v.keep, bothSides: v.both }), (v) => sketch.setCadPreview && sketch.setCadPreview("Offset the outline", v));
    return;
  }
  if (cmd === "nest") {
    openCad("Auto-arrange on the sheet", [
      { id: "gap", label: "Gap between parts (mm)", value: 10 },
      { id: "sw", label: "Sheet width (mm) – 0 = pack tight, no sheet limit", value: sheet.x },
      { id: "sh", label: "Sheet height (mm)", value: sheet.y },
      { id: "turn", type: "select", label: "Allow parts to turn", value: "90", options: [
        { v: "0", l: "Keep orientation" },
        { v: "90", l: "Quarter turns (0, 90, 180, 270°)" },
        { v: "45", l: "Every 45°" },
        { v: "15", l: "Every 15°" },
      ] },
      { note: "True-shape packing sits irregular parts together (not just their boxes), with the gap you type all round." },
    ], (v) => sketch.nest(v.gap, v.sw, v.sh, { angles: Number(v.turn) || 0 }));
    return;
  }
  if (cmd === "rotpt") {
    openCad("Rotate about a point", [
      { id: "deg", label: "Angle (°), anticlockwise", value: 90 },
      { note: "After OK, click the pivot on the drawing. Turn 90° still turns about the bottom-left corner; the Angle field on the part still turns about the centre." },
    ], (v) => sketch.startRotatePick(v.deg));
    return;
  }
  if (cmd === "scalepct") {
    openCad("Scale by percent", [
      { id: "pct", label: "Scale (%) — 100 is unchanged, 50 is half, 200 is double", value: 50 },
      { id: "pivot", type: "select", label: "Scale about", value: "centre", options: [
        { v: "centre", l: "Centre of the picked parts" },
        { v: "corner", l: "Bottom-left corner" },
        { v: "click", l: "Click a point on the drawing" },
      ] },
    ], (v) => sketch.startScalePick(v.pct, v.pivot));
    return;
  }
  if (cmd === "drivedim") {
    sketch.onDriveReady = (a, b) => {
      const now = sketch.featureDistance(a, b);
      openCad("Set this distance", [
        { id: "dist", label: "Distance (mm)", value: now != null ? Math.round(now * 10) / 10 : 15 },
        { note: "A hole will move so it sits this far from the other hole, or from the edge." },
      ], (v) => {
        sketch.applyDriveDim(a, b, v.dist);
        sketch.drivePick = null;
        sketch.setTool(null);
      });
    };
    sketch.startDriveDim();
    return;
  }
  if (cmd === "sliver") {
    let kerf = 1.5;
    try { const el = document.getElementById("ovKerf"); if (el && el.value !== "") kerf = Number(el.value) || kerf; } catch (e) {}
    openCad("Merge slivers closer than the cut width", [
      { id: "kerf", label: "Cut width / kerf (mm)", value: kerf },
      { note: "Tiny holes and webs narrower than this are merged into the surrounding metal, so they are not left as uncuttable slivers. This does not run on its own — only when you ask." },
    ], (v) => sketch.mergeSlivers(v.kerf));
    return;
  }
  if (cmd === "cutctl") {
    const c = S.cam || (S.cam = { tabs: 0, tabW: 3, leadOut: 0, over: 0, starts: {}, tabOver: {} });
    openCad("Cut control (whole job)", [
      { id: "leadIn", label: "Lead-in length (mm)", value: Number(document.getElementById("ovLead") && document.getElementById("ovLead").value) || 3 },
      { id: "leadType", type: "select", label: "Lead-in type", value: c.leadType || "auto", options: [
        { v: "auto", l: "Automatic (current behaviour)" },
        { v: "straight", l: "Straight" },
        { v: "arc", l: "Arc" },
      ] },
      { id: "leadSide", type: "select", label: "Lead-in side", value: c.leadSide || "auto", options: [
        { v: "auto", l: "Scrap side (automatic)" },
        { v: "outside", l: "Outside" },
        { v: "inside", l: "Inside" },
      ] },
      { id: "leadOut", label: "Lead-out (mm)", value: c.leadOut || 0 },
      { id: "tabs", label: "Hold-down tabs per part", value: c.tabs || 0 },
      { id: "tabW", label: "Tab width (mm)", value: c.tabW || 3 },
      { id: "showKerf", type: "checkbox", label: "Show torch path (kerf preview) on this drawing", value: !!(sketch.opts && sketch.opts.showKerf) },
      { note: "These are the same job-wide settings as the Inspector and the cutting screen. Dragging a pierce point is done on the cutting-screen preview. Automatic lead-ins stay as they are unless you pick a type or side." },
    ], (v) => {
      c.leadType = v.leadType || "auto";
      c.leadSide = v.leadSide || "auto";
      c.leadOut = v.leadOut;
      c.tabs = Math.round(v.tabs);
      c.tabW = v.tabW;
      const leadEl = document.getElementById("ovLead");
      if (leadEl && Number.isFinite(v.leadIn)) leadEl.value = String(v.leadIn);
      sketch.opts = sketch.opts || {};
      sketch.opts.showKerf = !!v.showKerf;
      sketch.draw();
      toast(v.showKerf ? "Torch-path preview is on. Lead-in, tabs and lead-out are saved on the job." : "Cut settings saved on the job.");
    });
    return;
  }
  if (cmd === "flangestd") {
    const it = sketch.selected();
    const keys = it && flangeShapeKeys(it.type);
    if (!keys) { toast("Pick a flange first, then fill it from a standard.", true); return; }
    const std0 = FLANGE_STANDARDS[0];
    const series0 = std0.series[1] || std0.series[0];
    const sizes0 = std0.sizesOf(series0);
    openCad("Fill from a flange standard", [
      { id: "std", type: "select", label: "Standard", value: std0.id, options: FLANGE_STANDARDS.map((s) => ({ v: s.id, l: s.name })) },
      { id: "series", type: "select", label: "PN / Class", value: String(series0), options: std0.series.map((s) => ({ v: String(s), l: String(s) })) },
      { id: "size", type: "select", label: "DN / NPS", value: String(sizes0[6] || sizes0[0]), options: sizes0.map((s) => ({ v: String(s), l: String(s) })) },
      { note: "This fills outside Ø, bore, pitch circle, hole count and hole Ø. You can still edit the sizes afterwards. Change Standard, then OK — or cancel and open again to pick a different series." },
    ], (v) => {
      const dim = lookupFlange(v.std, v.series, v.size);
      if (!dim) { toast("That size is not in the table.", true); return; }
      sketch.remember();
      applyFlangeDims(it.p, dim, keys);
      sketch.commit(); sketch.draw(); sketch.onSelect();
      toast(`${v.std === "asme" ? "ASME B16.5" : "BS EN 1092-1"} ${v.series} × ${v.size}: OD ${dim.od}, bore ${dim.id}, PCD ${dim.pcd}, ${dim.n} × Ø${dim.hole}.`);
    });
    return;
  }
}
export function bindCad() {
  $("cadOk").onclick = () => { if ($("cadDialog")._ok) $("cadDialog")._ok(); };
  $("cadCancel").onclick = closeCad;
  $("cadDialog").addEventListener("click", (e) => { if (e.target === $("cadDialog")) closeCad(); });
  const fields = $("cadFields");
  if (fields && !fields.dataset.previewBound) {
    fields.dataset.previewBound = "1";
    const kick = () => { const dlg = $("cadDialog"); if (dlg && dlg._runPreview) dlg._runPreview(); };
    fields.addEventListener("input", kick);
    fields.addEventListener("change", kick);
  }
}

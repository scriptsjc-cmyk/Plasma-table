// Export the current drawing (design geometry, not the kerfed toolpath) as DXF R12 or SVG, keeping arcs as arcs.
import { S, sketch } from "../core/state.js";
import { fitContour, contoursToDxf, contoursToSvg } from "../core/arcs.js";
import { $, toast } from "../core/dom.js";

export function currentDrawingContours() {
  if (!sketch || !Array.isArray(sketch.items)) return [];
  const items = sketch.items.filter((i) => !(sketch.layerHidden && sketch.layerHidden(i)));
  const out = [];
  for (const it of items) {
    if (it.type === "custom" && sketch.rawWorld) {
      for (const c of sketch.rawWorld(it)) out.push(c);
    } else {
      for (const c of (sketch.contoursOf(it) || [])) out.push(fitContour(c));
    }
  }
  return out;
}

export function drawingFileBase() {
  const raw = String((S && S.fileName) || (sketch && sketch.name && sketch.name()) || "part");
  return raw.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "part";
}

export function exportDrawing(fmt) {
  const cs = currentDrawingContours();
  if (!cs.length) { toast("Nothing to export. Draw a part first.", true); return false; }
  const svg = fmt === "svg";
  const text = svg ? contoursToSvg(cs) : contoursToDxf(cs);
  const ext = svg ? ".svg" : ".dxf";
  const mime = svg ? "image/svg+xml" : "application/dxf";
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = drawingFileBase() + ext;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Downloaded the drawing as " + (svg ? "SVG" : "DXF") + ".");
  return true;
}

export function closeMakeExportPop() {
  const pop = $("makeExportPop"); if (!pop) return;
  pop.classList.add("hidden"); pop.hidden = true;
}
export function openMakeExportPop() {
  const pop = $("makeExportPop"); if (!pop) return;
  pop.classList.remove("hidden"); pop.hidden = false;
}

export function bindDrawingExport() {
  const btn = $("btnMakeExport");
  if (btn) btn.onclick = () => openMakeExportPop();
  if ($("makeExpDxf")) $("makeExpDxf").onclick = () => { if (exportDrawing("dxf")) closeMakeExportPop(); };
  if ($("makeExpSvg")) $("makeExpSvg").onclick = () => { if (exportDrawing("svg")) closeMakeExportPop(); };
  if ($("makeExpCancel")) $("makeExpCancel").onclick = () => closeMakeExportPop();
  const pop = $("makeExportPop");
  if (pop) pop.addEventListener("click", (e) => { if (e.target === pop) closeMakeExportPop(); });
  if ($("exportDxf")) $("exportDxf").onclick = () => { exportDrawing("dxf"); };
  if ($("exportSvg")) $("exportSvg").onclick = () => { exportDrawing("svg"); };
}

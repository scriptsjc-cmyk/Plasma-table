// CAD dialog (trim, offset, ...) and the Pro command runner.
import { evalExpr } from "../core/expr.js";
import { $, esc, toast } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { renderProTools } from "./protools.js";
import { clickVerb } from "../ui/laptop.js";
import { def } from "./sketch-util.js";

export function openCad(title, fields, onOk) {
  $("cadTitle").textContent = title;
  $("cadFields").innerHTML = fields.map((f) => {
    if (f.note) return `<p class="muted small">${esc(f.note)}</p>`;
    if (f.type === "checkbox") return `<label class="check"><input id="cad_${f.id}" type="checkbox"${f.value ? " checked" : ""}> ${esc(f.label)}</label>`;
    if (f.type === "select") return `<label>${esc(f.label)}<select id="cad_${f.id}">${(f.options || []).map((o) => `<option value="${esc(o.v)}"${o.v === f.value ? " selected" : ""}>${esc(o.l)}</option>`).join("")}</select></label>`;
    if (f.type === "textarea") return `<label>${esc(f.label)}<textarea id="cad_${f.id}" rows="${f.rows || 8}" style="width:100%;font:inherit">${esc(String(f.value ?? ""))}</textarea></label>`;
    return `<label>${esc(f.label)}<input id="cad_${f.id}" type="${f.type || "number"}" inputmode="${f.text ? "text" : "decimal"}" step="any" value="${esc(String(f.value ?? ""))}"></label>`;
  }).join("");
  $("cadDialog").classList.remove("hidden");
  $("cadDialog")._ok = () => {
    const vals = {};
    for (const f of fields) {
      if (f.note) continue;
      if (f.type === "checkbox") { vals[f.id] = !!($("cad_" + f.id) && $("cad_" + f.id).checked); continue; }
      const raw = $("cad_" + f.id).value;
      if (f.type === "select" || f.type === "textarea" || f.text) { vals[f.id] = raw; continue; }
      vals[f.id] = evalExpr(raw);
      if (!Number.isFinite(vals[f.id])) { toast("Check the number in " + f.label, true); return; }
    }
    $("cadDialog").classList.add("hidden");
    onOk(vals);
  };
}
export function closeCad() { $("cadDialog").classList.add("hidden"); $("cadDialog")._ok = null; }
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
    ], (v) => sketch.linearArray(v.n, v.gx, v.gy));
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
    ], (v) => sketch.polarArray(v.n, v.pcd, { mode: v.pivot }));
    return;
  }
  if (cmd === "offset") {
    openCad("Offset the outline", [
      { id: "d", label: "Offset (mm) – plus grows, minus shrinks", value: 5 },
      { id: "keep", type: "checkbox", label: "Keep the original part" },
      { id: "both", type: "checkbox", label: "Both sides (a strip of this width)" },
      { note: "A shrink that would invert, spike or leave a sliver is refused. Circles stay circles." },
    ], (v) => sketch.offsetBy(v.d, { keepOriginal: v.keep, bothSides: v.both }));
    return;
  }
  if (cmd === "nest") {
    openCad("Auto-arrange on the sheet", [
      { id: "gap", label: "Gap between parts (mm)", value: 10 },
      { id: "sw", label: "Sheet width (mm)", value: sheet.x },
      { id: "sh", label: "Sheet height (mm)", value: sheet.y },
    ], (v) => sketch.nest(v.gap, v.sw, v.sh));
    return;
  }
}
export function bindCad() {
  $("cadOk").onclick = () => { if ($("cadDialog")._ok) $("cadDialog")._ok(); };
  $("cadCancel").onclick = closeCad;
  $("cadDialog").addEventListener("click", (e) => { if (e.target === $("cadDialog")) closeCad(); });
}

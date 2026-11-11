// CAD dialog (trim, offset, ...) and the Pro command runner.
import { evalExpr } from "../core/expr.js";
import { $, esc, toast } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { renderProTools } from "./protools.js";

export function openCad(title, fields, onOk) {
  $("cadTitle").textContent = title;
  $("cadFields").innerHTML = fields.map((f) => `<label>${esc(f.label)}<input id="cad_${f.id}" type="${f.type || "number"}" inputmode="decimal" step="any" value="${esc(String(f.value ?? ""))}"></label>`).join("");
  $("cadDialog").classList.remove("hidden");
  $("cadDialog")._ok = () => {
    const vals = {};
    for (const f of fields) {
      const raw = $("cad_" + f.id).value;
      vals[f.id] = f.text ? raw : evalExpr(raw);
      if (!f.text && !Number.isFinite(vals[f.id])) { toast("Check the number in " + f.label, true); return; }
    }
    $("cadDialog").classList.add("hidden");
    onOk(vals);
  };
}
export function closeCad() { $("cadDialog").classList.add("hidden"); $("cadDialog")._ok = null; }
export function runPro(cmd) {
  const sheet = S.cfg && S.cfg.travel_mm ? S.cfg.travel_mm : { x: 1300, y: 800 };
  if (cmd === "draw") { sketch.setTool("draw"); renderProTools(); toast("Tap points on the drawing, then Close outline."); return; }
  if (cmd === "measure") { sketch.setTool("measure"); renderProTools(); toast("Tap two points to measure."); return; }
  if (cmd === "points") { sketch.setPointSnap(!sketch.opts.pointSnap); renderProTools(); return; }
  if (cmd === "lock") { sketch.toggleLock(); return; }
  if (cmd === "subtract") { sketch.subtract(); return; }
  if (cmd === "distx") { sketch.distribute("x"); return; }
  if (cmd === "disty") { sketch.distribute("y"); return; }
  if (cmd === "linarray") {
    openCad("Linear array", [
      { id: "n", label: "How many (including this one)", value: 3 },
      { id: "gx", label: "Gap across (mm)", value: 10 },
      { id: "gy", label: "Gap up (mm)", value: 0 },
    ], (v) => sketch.linearArray(v.n, v.gx, v.gy));
    return;
  }
  if (cmd === "polar") {
    openCad("Circular array", [
      { id: "n", label: "How many around the circle", value: 4 },
      { id: "pcd", label: "Circle Ø (PCD, mm) – 0 = auto", value: 0 },
    ], (v) => sketch.polarArray(v.n, v.pcd));
    return;
  }
  if (cmd === "offset") {
    openCad("Offset the outline", [
      { id: "d", label: "Offset (mm) – plus grows, minus shrinks", value: 5 },
    ], (v) => sketch.offsetBy(v.d));
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

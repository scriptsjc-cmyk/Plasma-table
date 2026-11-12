// Machine panels on the Get set up screen: edge/limits panel, controller settings backup, test patterns, command buttons.
import { showScreen } from "../ui/flow.js";
import { $, $$, toast } from "../core/dom.js";
import { M, S, sketch } from "../core/state.js";
import { goStep, showTab } from "../ui/nav.js";
import { useShape } from "../make/useshape.js";
import { cmd, requireMachine } from "./access.js";
import { overrides } from "../cut/material.js";
import { sendConsoleLine } from "./console.js";

// ------------------------------------------------------------------ wiring

export function fillEdgePanel() {
  const box = $("edgePanel");
  if (!box || !sketch) return;
  const info = sketch.edgeInfo && sketch.edgeInfo();
  const show = !!(info && sketch.isEditableCustom && sketch.isEditableCustom(info.it));
  box.classList.toggle("hidden", !show);
  if (show) box.removeAttribute("hidden"); else box.setAttribute("hidden", "");
  if (!show) return;
  if ($("edgeLen")) $("edgeLen").value = String(Math.round(info.length * 100) / 100);
  if ($("edgeAng")) $("edgeAng").value = String(Math.round((($("edgeAngMode") && $("edgeAngMode").value === "rel" ? info.relAngle : info.angle) || 0) * 10) / 10);
  if ($("edgeBulge")) $("edgeBulge").value = String(Math.round(info.bulge * 1000) / 1000);
  if ($("edgeRad")) $("edgeRad").value = info.radius && Number.isFinite(info.radius) ? String(Math.round(info.radius * 10) / 10) : "";
  if ($("edgeHint")) $("edgeHint").textContent = info.vi != null
    ? "Corner selected. Drag it, or press Delete to remove it (an outline needs at least three corners)."
    : "Edge selected. Set a length, square it up, type an angle, or turn it into a curve. Double-click to add a corner.";
}
function bindEdgePanel() {
  if (!$("edgePanel") || $("edgePanel")._bound) return;
  $("edgePanel")._bound = true;
  $("edgeLenApply") && ($("edgeLenApply").onclick = () => { sketch.setEdgeLength(Number($("edgeLen").value), $("edgeFixed").value); fillEdgePanel(); });
  $("edgeSquare") && ($("edgeSquare").onclick = () => { sketch.squareUpEdge("cardinal"); fillEdgePanel(); });
  $("edgeSquarePrev") && ($("edgeSquarePrev").onclick = () => { sketch.squareUpEdge("prev"); fillEdgePanel(); });
  $("edgeAngApply") && ($("edgeAngApply").onclick = () => { sketch.setEdgeAngle(Number($("edgeAng").value), $("edgeAngMode").value === "rel"); fillEdgePanel(); });
  $("edgeCurve") && ($("edgeCurve").onclick = () => {
    const r = Number($("edgeRad").value), b = Number($("edgeBulge").value);
    if (r > 0) sketch.setEdgeCurve({ radius: r });
    else if (Number.isFinite(b) && $("edgeBulge").value !== "") sketch.setEdgeCurve({ bulge: b });
    else sketch.setEdgeCurve({});
    fillEdgePanel();
  });
  $("edgeStraight") && ($("edgeStraight").onclick = () => { sketch.straightenEdge(); fillEdgePanel(); });
  $("edgeAddV") && ($("edgeAddV").onclick = () => { const e = sketch.edgeSel; if (e) sketch.addVertexOnEdge(e.ci, e.ei); fillEdgePanel(); });
  $("edgeDelV") && ($("edgeDelV").onclick = () => { sketch.deleteVertex(); fillEdgePanel(); });
}
// Admin console / settings: never while a job is cutting (a G-code line or $ write must not interleave with the job),
// and anything that moves the machine or writes a setting only when it is Idle.
// Read $$ from the controller right now and wait for the answer (it ends when no new line arrives for a moment).
export async function readControllerSettings() {
  if (!M.grbl) return null;
  S._settingsCapture = [];
  try { M.grbl.send("$$"); M.grbl.send("$I"); } catch (e) { S._settingsCapture = null; return null; }
  const t0 = Date.now(); let last = 0, lastT = Date.now();
  while (Date.now() - t0 < 5000) {
    await new Promise((r) => setTimeout(r, 120));
    const n = (S._settingsCapture || []).length;
    if (n !== last) { last = n; lastT = Date.now(); }
    else if (n > 0 && Date.now() - lastT >= 450) break;
  }
  const lines = S._settingsCapture || [];
  S._settingsCapture = null;
  const map = {};
  for (const l of lines) { const m = String(l).match(/^\$(\d{1,3})=(-?\d+(?:\.\d+)?)\s*(?:\(.*)?$/); if (m) map[Number(m[1])] = Number(m[2]); }
  return { lines, map };
}
// Back up what the controller reports RIGHT NOW (not what the form last showed), check the copy reads back identically,
// save it as a file and keep a second copy on this device. Returns the snapshot, or null when it could not be made.
export function takeVerifiedBackup(snap) {
  const ids = Object.keys((snap && snap.map) || {}).sort((a, b) => a - b);
  if (!ids.length) { toast("The controller didn't report any settings, so nothing was written.", true); return null; }
  const body = ids.map((k) => "$" + k + "=" + snap.map[k]).join("\n") + "\n";
  const back = {};
  for (const l of body.split("\n")) { const m = l.match(/^\$(\d+)=(.+)$/); if (m) back[m[1]] = Number(m[2]); }
  if (Object.keys(back).length !== ids.length || ids.some((k) => back[k] !== snap.map[k])) { toast("The settings backup didn't read back correctly, so nothing was written.", true); return null; }
  try { localStorage.setItem("plasma.fw.lastBackup", JSON.stringify({ at: new Date().toISOString(), body })); } catch (e) { /* storage full or blocked: the file is still saved */ }
  const blob = new Blob([body], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "grbl-settings-backup-" + new Date().toISOString().replace(/[:.]/g, "-") + ".txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return { body, count: ids.length };
}
export function adminMayTalk(needsIdle) {
  if (M.jobRunning()) { toast("A job is running. Press STOP, or wait until it finishes.", true); return false; }
  if (needsIdle && M.state() !== "Idle") { toast("The machine must be Idle (it is " + M.state() + ").", true); return false; }
  return true;
}
export function addTestPattern(kind) {
  if (!sketch) return;
  if (M && M.jobRunning()) { toast("A job is running. Add test patterns after it finishes.", true); return; }
  if (!showScreen("cut")) return;                 // test patterns are for cutting: they land on the bed
  showTab("cut");
  S.src = "shape";
  $("srcShape").classList.remove("hidden");
  goStep(1);
  if (kind === "square") {
    sketch.add("rect");
    const it = sketch.selected(); if (it) { it.p.w = 100; it.p.h = 100; it._key = null; sketch.commit(); sketch.onSelect(); }
    toast("Added a 100 mm calibration square.");
  } else if (kind === "circle") {
    sketch.add("circle");
    const it = sketch.selected();
    if (it) {
      if ("d" in (it.p || {})) it.p.d = 50;
      else if ("r" in (it.p || {})) it.p.r = 25;
      it._key = null; sketch.commit(); sketch.onSelect();
    }
    toast("Added a 50 mm calibration circle.");
  } else if (kind === "kerf") {
    for (let i = 0; i < 5; i++) {
      sketch.add("rect");
      const it = sketch.selected();
      if (!it) continue;
      it.p.w = 80; it.p.h = 8;
      it.x = 10; it.y = 10 + i * 20;
      it._key = null;
    }
    sketch.commit(); sketch.onSelect();
    toast("Added a kerf / speed ladder (five 80×8 mm bars). Cut each at a different speed.");
  }
  useShape(); goStep(3);
}
const UNLOCK_CONFIRM = "Unlock the controller ($X)?\n\nIt will accept moves again, but it may not know where the torch is. Check the torch is clear and nothing is in the way. Home or set the start point again before cutting.";
export function bindMachineControls() {
  // Unlock ($X) only after the operator confirms: it clears the alarm without the machine knowing where it is
  const unlock = () => { if (confirm(UNLOCK_CONFIRM)) cmd("unlock"); };
  $("btnUnlock").onclick = unlock;
  $("btnUnlock2").onclick = () => {
    if (S.status.inputs && S.status.inputs.estop) { toast("Release the e-stop first (twist it), then press Unlock.", true); return; }
    unlock();
  };
  $("btnDemoEstop").onclick = () => { if (S.demo) S.demo.setEstop(!S.demo.estop); };
  $$(".do-home").forEach((b) => (b.onclick = () => cmd("home")));
  $$(".do-raise").forEach((b) => (b.onclick = () => cmd("raise")));
  $("btnGoStart").onclick = () => cmd("goto_zero");
  $$("[data-cmd]").forEach((b) => (b.onclick = () => cmd(b.dataset.cmd)));
  $("btnRef").onclick = () => { if (confirm("Is the torch exactly at the home corner, raised right up?")) cmd("set_reference"); };
  $("btnClearLimits").onclick = () => { if (confirm("Clear the saved edges? Crash protection will be off until you set them again.")) cmd("limits_clear"); };
  $("btnTouchTest").onclick = () => cmd("touchoff_test", { material: S.material, thickness: S.thickness, overrides: overrides() });
  $("btnTorchTest").onclick = () => { if (!requireMachine("Link your machine to run jobs")) return; if (confirm("Fire the torch for half a second?\nTorch over scrap, earth clamp on, hands clear.")) cmd("torch_test", { confirm: true }); };
  $("btnPushSettings").onclick = () => { if (confirm("Send the controller settings? Only after editing the CHANGE-ME values for your machine.")) cmd("push_settings"); };
  $("consoleForm").onsubmit = (e) => { e.preventDefault(); sendConsoleLine($("consoleIn").value, $("consoleIn")); };
  bindEdgePanel();
}

// Download G-code: clicking Download asks which dialect to save as, then writes the file.
import { currentSettings } from "../machine/settings.js";
import { convertGcode, dialectExtension } from "../machine/dialect.js";
import { openGate } from "../account/accounthome.js";
import * as Acc from "../account/account.js";
import { $, toast } from "../core/dom.js";
import { S } from "../core/state.js";
import { loadJob } from "./prepare.js";
import { scoreMarkProblem } from "./checklist.js";
import { lockText } from "../machine/access.js";

function exportDialect() {
  const sel = $("exportDialect");
  if (sel && sel.value) return sel.value;
  try { return (currentSettings() && currentSettings().dialect) || "grbl"; } catch (e) { return "grbl"; }
}
function exportLineNumbers() {
  const c = $("exportN");
  if (c) return !!c.checked;
  try { return !!(currentSettings() && currentSettings().lineNumbers); } catch (e) { return false; }
}
function fillExportDefaults() {
  try {
    const s = currentSettings();
    if ($("exportDialect") && !$("exportDialect").dataset.touched) $("exportDialect").value = (s && s.dialect) || "grbl";
    if ($("exportN") && !$("exportN").dataset.touched) $("exportN").checked = !!(s && s.lineNumbers);
  } catch (err) { /* ignore */ }
}
export function closeExportPop() {
  const pop = $("exportPop"); if (!pop) return;
  pop.classList.add("hidden"); pop.hidden = true;
}
export function openExportPop() {
  const pop = $("exportPop"); if (!pop) return;
  fillExportDefaults();
  pop.classList.remove("hidden"); pop.hidden = false;
}
export function exportGcode() {
  if (!Acc.allowExportWithoutMachine() && !Acc.hasLinkedMachine()) {
    openGate(lockText("download G-code"));
    return;
  }
  const sm = scoreMarkProblem();
  if (sm) { toast("Not downloaded. " + sm, true); return; }
  if (!S.prepared) loadJob();
  let text = "";
  if (S.prepared && Array.isArray(S.prepared.lines) && S.prepared.lines.length) text = S.prepared.lines.join("\n") + "\n";
  else if (S.prepared && S.prepared.source) text = S.prepared.source;
  else if (S.gcode) text = S.gcode;
  if (!text) { toast("Nothing to export yet. Load or design a part first.", true); return; }
  const dialect = exportDialect();
  const numbered = exportLineNumbers();
  text = convertGcode(text, dialect, { lineNumbers: numbered });
  const ext = dialectExtension(dialect);
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (String(S.fileName || "part").replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "part") + ext;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Downloaded " + dialect.toUpperCase() + " file");
  closeExportPop();
}
function askThenExport() {
  if (!Acc.allowExportWithoutMachine() && !Acc.hasLinkedMachine()) {
    openGate(lockText("download G-code"));
    return;
  }
  const sm = scoreMarkProblem();
  if (sm) { toast("Not downloaded. " + sm, true); return; }
  openExportPop();
}
export function bindExport() {
  const ask = (e) => { if (e) e.preventDefault(); askThenExport(); };
  if ($("btnExport")) $("btnExport").onclick = ask;
  if ($("btnExport3")) $("btnExport3").onclick = ask;
  if ($("btnExport4")) $("btnExport4").onclick = ask;
  if ($("exportGo")) $("exportGo").onclick = () => exportGcode();
  if ($("exportCancel")) $("exportCancel").onclick = () => closeExportPop();
  if ($("exportDialect")) $("exportDialect").addEventListener("change", () => { $("exportDialect").dataset.touched = "1"; });
  if ($("exportN")) $("exportN").addEventListener("change", () => { $("exportN").dataset.touched = "1"; });
  document.addEventListener("click", (e) => {
    const pop = $("exportPop"); if (!pop || pop.classList.contains("hidden")) return;
    if (e.target.closest("#exportPop") || e.target.closest("#btnExport") || e.target.closest("#btnExport3") || e.target.closest("#btnExport4")) return;
    closeExportPop();
  });
}

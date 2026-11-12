// Download G-code (dialect, line numbers) and its menu.
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
export function exportGcode() {
  if (!Acc.allowExportWithoutMachine() && !Acc.hasLinkedMachine()) {
    openGate(lockText("download G-code"));
    return;
  }
  // Round 5 (safety): Score/Mark lines would come out as full-power through-cuts (the torch only switches on and off),
  // so nothing is written until they are set back to Cut or their layer is hidden. Said before any file is saved.
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
}
export function bindExport() {
  $("btnExport").onclick = exportGcode;
  if ($("btnExport3")) $("btnExport3").onclick = exportGcode;      // Beginner has no Download button on the preview: it is here on Get set up, and on the run screen
  if ($("btnExport4")) $("btnExport4").onclick = exportGcode;
  if ($("btnExportMenu")) $("btnExportMenu").onclick = (e) => {
    e.stopPropagation();
    const pop = $("exportPop"); if (!pop) return;
    const on = pop.classList.contains("hidden");
    pop.classList.toggle("hidden", !on); pop.hidden = !on;
    $("btnExportMenu").setAttribute("aria-expanded", on ? "true" : "false");
    try {
      const s = currentSettings();
      if ($("exportDialect") && !$("exportDialect").dataset.touched) $("exportDialect").value = s.dialect || "grbl";
      if ($("exportN") && !$("exportN").dataset.touched) $("exportN").checked = !!s.lineNumbers;
    } catch (err) { /* ignore */ }
  };
  if ($("exportDialect")) $("exportDialect").addEventListener("change", () => { $("exportDialect").dataset.touched = "1"; });
  if ($("exportN")) $("exportN").addEventListener("change", () => { $("exportN").dataset.touched = "1"; });
  document.addEventListener("click", (e) => {
    const pop = $("exportPop"); if (!pop || pop.classList.contains("hidden")) return;
    if (e.target.closest("#exportPop") || e.target.closest("#btnExportMenu")) return;
    pop.classList.add("hidden"); pop.hidden = true;
  });
}

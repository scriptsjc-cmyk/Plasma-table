// Save the current drawing as a part (over / copy), the conflict dialog and the 8-second undo.
import { $, closeAll, host, openDlg, toast } from "./uibase.js";
import { openAccount } from "./accounthome.js";
import { refreshPartsList } from "./partslist.js";
import * as A from "./account.js";

// Save: a brand-new drawing saves straight away. A part that came from the account asks first: save over it
// (an Undo bar puts the old version back) or save as a copy in the same parts list.
export async function saveCurrent(mode) {
  if (!A.isSignedIn()) { openAccount("in"); throw new Error("Sign in to save parts to your account."); }
  if (!host || !host.getDesign) throw new Error("Nothing to save.");
  const items = host.getDesign();
  if (!items || !items.length) throw new Error("The drawing is empty.");
  const cur = host.currentPart ? host.currentPart() : null;
  const name0 = ($("partName") && $("partName").value.trim()) || (host.fileName && host.fileName()) || "Untitled part";
  if (cur && cur.id && !mode) {
    $("saveTitle").textContent = "Save “" + (cur.name || name0) + "”";
    $("saveName").value = cur.name || name0;
    $("saveText").textContent = "Save over the original keeps one part (an Undo button appears so you can put the old one back). Save as copy adds a new part next to it and leaves the original alone.";
    $("saveOver").classList.remove("hidden");
    openDlg("saveDlg");
    setTimeout(() => $("saveName").select && $("saveName").select(), 30);
    return null;
  }
  const name = $("saveDlg")._name || name0;
  $("saveDlg")._name = null;
  if (mode === "copy") {
    const base = String(name).replace(/ \(copy( \d+)?\)$/, "");
    const nm = name === (cur && cur.name) ? base + " (copy)" : name;
    const fold = cur && cur.data && cur.data.folder;     // a copy stays in the same folder as the original
    const p = await A.savePart({ name: nm, data: { items, ...(fold ? { folder: fold } : {}), ...(host.designMeta && host.designMeta() ? { meta: host.designMeta() } : {}) } });
    if (host.rememberPart) host.rememberPart(p);
    if ($("partName")) $("partName").value = p.name;
    toast("Saved a copy: “" + p.name + "”");
    await refreshPartsList();
    return p;
  }
  let prev = null;
  if (mode === "over" && cur && cur.id) { try { prev = await A.loadPart(cur.id); } catch { prev = null; } }
  try {
    const dm = host.designMeta && host.designMeta();
    const p = await A.savePart({ id: cur && cur.id, name, data: { items, ...(dm ? { meta: dm } : {}) }, updated_at: cur && cur.updated_at });
    if (host.rememberPart) host.rememberPart(p);
    if ($("partName")) $("partName").value = p.name;
    toast("Saved “" + p.name + "”");
    await refreshPartsList();
    if (prev) offerUndo(p, prev);
    return p;
  } catch (err) {
    if (err && err.conflict) {
      $("conflictDlg")._job = { id: cur && cur.id, name, data: { items }, updated_at: cur && cur.updated_at, conflict: err.conflict };
      $("conflictText").textContent = "This part was also changed somewhere else. Keep yours (last write wins), keep both, or open the other copy?";
      openDlg("conflictDlg");
      return null;
    }
    throw err;
  }
}
let undoTimer = null, undoJob = null;
function offerUndo(saved, prev) {
  undoJob = { saved, prev };
  $("undoText").textContent = "Saved over “" + saved.name + "”.";
  $("undoSave").classList.remove("hidden");
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $("undoSave").classList.add("hidden"); undoJob = null; }, 60000);
}
export async function undoSave() {
  if (!undoJob) return false;
  const { saved, prev } = undoJob; undoJob = null;
  clearTimeout(undoTimer); $("undoSave").classList.add("hidden");
  try {
    const p = await A.savePart({ id: saved.id, name: prev.name, data: prev.data, updated_at: saved.updated_at });
    if (host.loadDesign) host.loadDesign(p);
    toast("Put back the previous version of “" + p.name + "”");
    await refreshPartsList();
    return true;
  } catch (err) { toast(err.message, true); return false; }
}
export function bindSavePart() {
  const doSave = (mode) => async () => {
    $("saveDlg")._name = $("saveName").value.trim() || "Untitled part";
    closeAll();
    try { await saveCurrent(mode); } catch (err) { toast(err.message, true); }
  };
  $("saveOver").onclick = doSave("over");
  $("saveCopy").onclick = doSave("copy");
  $("btnUndoSave").onclick = () => undoSave();
  $("btnUndoX").onclick = () => { $("undoSave").classList.add("hidden"); undoJob = null; };
  $("btnSavePart").onclick = async () => { try { await saveCurrent(); } catch (err) { toast(err.message, true); } };
  $("conflictMine").onclick = async () => {
    const job = $("conflictDlg")._job;
    if (!job) return closeAll();
    try {
      const p = await A.savePart({ ...job, keepBoth: false, updated_at: new Date().toISOString() });
      if (host && host.rememberPart) host.rememberPart(p);
      toast("Kept your copy");
      closeAll();
    } catch (err) { toast(err.message, true); }
  };
  $("conflictBoth").onclick = async () => {
    const job = $("conflictDlg")._job;
    if (!job) return closeAll();
    try {
      const p = await A.savePart({ ...job, keepBoth: true });
      if (host && host.rememberPart) host.rememberPart(p);
      toast("Kept both copies");
      closeAll();
    } catch (err) { toast(err.message, true); }
  };
  $("conflictTheirs").onclick = async () => {
    const job = $("conflictDlg")._job;
    if (!job || !job.conflict) return closeAll();
    try {
      if (host && host.loadDesign) host.loadDesign(job.conflict.remote);
      toast("Loaded the other copy");
      closeAll();
    } catch (err) { toast(err.message, true); }
  };
}

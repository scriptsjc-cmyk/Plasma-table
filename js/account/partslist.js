// The saved-parts list in the account dialog: folders, rows, rename, delete, open.
import { $, closeAll, esc, host, toast } from "./uibase.js";
import { MY, addKnownFolder, cleanFolderName, deleteFolder, folderOf, groupParts, moveParts, openImport, renameFolder, sizeText, thumbSvg } from "./partsfolders.js";
import * as A from "./account.js";

// ---- parts list, grouped in folders (a folder is just a name stored inside each part's data; no new SQL)
const closedFolders = () => { try { return new Set(JSON.parse(localStorage.getItem("plasma.folders.closed") || "[]")); } catch { return new Set(); } };
const setClosed = (set) => { try { localStorage.setItem("plasma.folders.closed", JSON.stringify([...set])); } catch { /* ignore */ } };
export let partsRows = [];
export const metaCache = new Map();
function partRowHtml(p, folders) {
  const when = p.updated_at ? new Date(p.updated_at).toLocaleString() : "";
  const meta = p.meta || metaCache.get(p.id + "|" + p.updated_at) || null, cur = folderOf(p);
  return `<div class="partrow" data-id="${esc(p.id)}" data-key="${esc(p.id + "|" + p.updated_at)}">
    <span class="pthumbcell">${thumbSvg(meta)}</span>
    <div class="partinfo"><b>${esc(p.name)}</b><div class="muted small"><span class="psize">${esc(sizeText(meta))}</span>${meta ? " · " : ""}${esc(when)}</div></div>
    <div class="row">
      <button type="button" class="small" data-act="load">Open</button>
      <button type="button" class="small" data-act="edit" title="Open it in the full-screen shape editor">Edit</button>
      <button type="button" class="small" data-act="dup" title="Make a copy of this part in this folder">Duplicate</button>
      <button type="button" class="small" data-act="rename">Rename</button>
      <select class="small movesel" data-act="move" aria-label="Move ${esc(p.name)} to a folder"><option value="">Move to…</option>${folders.filter((f) => f !== cur).map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join("")}<option value="__new">＋ New folder…</option></select>
      <button type="button" class="small pdel" data-act="del">Delete</button>
    </div>
  </div>`;
}
export async function refreshPartsList() {
  const box = $("partsList");
  if (!box) return;
  if (!A.isSignedIn()) { box.innerHTML = "<p class='muted'>Sign in to see saved parts.</p>"; return; }
  try {
    partsRows = await A.listParts();
    const groups = groupParts(partsRows), names = groups.map((g) => g.name), closed = closedFolders();
    if (!partsRows.length && groups.length === 1) { box.innerHTML = "<p class='muted'>No parts saved yet. Save a drawing, or use “Import DXF / SVG”.</p>"; return; }
    box.innerHTML = groups.map((g) => {
      const isClosed = closed.has(g.name);
      return `<section class="pfolder ${isClosed ? "closed" : ""}" data-folder="${esc(g.name)}">
        <div class="pfhead">
          <button type="button" class="pftoggle" data-fact="toggle" aria-expanded="${!isClosed}" title="${isClosed ? "Show" : "Hide"} this folder"><span class="caret">${isClosed ? "▸" : "▾"}</span> <b>📁 ${esc(g.name)}</b> <span class="muted small">${g.rows.length} part${g.rows.length === 1 ? "" : "s"}</span></button>
          ${g.name === MY ? "" : `<button type="button" class="small" data-fact="frename">Rename</button><button type="button" class="small warn" data-fact="fdelete">Delete</button>`}
        </div>
        <div class="pfbody">${g.rows.length ? g.rows.map((p) => partRowHtml(p, names)).join("") : "<p class='muted small pfempty'>Empty. Use “Move to…” on a part, or import DXF / SVG files into this folder.</p>"}</div>
      </section>`;
    }).join("");
    fillMissingMeta();
  } catch (e) { box.innerHTML = "<p class='muted'>" + esc(e.message) + "</p>"; }
}
// older parts have no preview stored yet: build one in the background (not saved, just shown)
async function fillMissingMeta() {
  const rows = partsRows.filter((p) => !p.meta && !metaCache.has(p.id + "|" + p.updated_at)).slice(0, 40);
  for (const p of rows) {
    try {
      const full = await A.loadPart(p.id), items = full.data && (full.data.items || full.data);
      const m = host && host.metaOfItems && Array.isArray(items) ? host.metaOfItems(items) : null;
      if (!m) continue;
      metaCache.set(p.id + "|" + p.updated_at, m);
      const el = document.querySelector(`#partsList .partrow[data-key="${CSS.escape(p.id + "|" + p.updated_at)}"]`);
      if (el) { el.querySelector(".pthumbcell").innerHTML = thumbSvg(m); const ps = el.querySelector(".psize"); if (ps && !ps.textContent) ps.textContent = sizeText(m) + " · "; }
    } catch { /* leave it blank */ }
  }
}
export function bindPartsList() {
  $("btnImportDxfs") && ($("btnImportDxfs").onclick = () => openImport());
  $("btnNewFolder") && ($("btnNewFolder").onclick = async () => {
    const n = cleanFolderName(prompt("Name for the new folder", ""));
    if (!n) return;
    addKnownFolder(n); await refreshPartsList(); toast("Folder “" + n + "” made. Use “Move to…” on a part to put it in.");
  });
  document.addEventListener("parts-changed", () => { refreshPartsList(); });
  $("partsList").addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-act='move']"); if (!sel || !sel.value) return;
    const row = sel.closest(".partrow"), id = row && row.dataset.id; let to = sel.value;
    try {
      if (to === "__new") { to = cleanFolderName(prompt("Name for the new folder", "")); if (!to) { sel.value = ""; return; } }
      await moveParts([id], to); await refreshPartsList(); toast("Moved to “" + to + "”");
    } catch (err) { toast(err.message, true); }
  });
  $("partsList").addEventListener("click", async (e) => {
    const fb = e.target.closest("button[data-fact]");
    if (fb) {
      const folder = fb.closest(".pfolder").dataset.folder;
      try {
        if (fb.dataset.fact === "toggle") { const c = closedFolders(); c.has(folder) ? c.delete(folder) : c.add(folder); setClosed(c); await refreshPartsList(); }
        else if (fb.dataset.fact === "frename") {
          const n = cleanFolderName(prompt("New folder name", folder)); if (!n || n === folder) return;
          await renameFolder(folder, n, partsRows); await refreshPartsList(); toast("Folder renamed to “" + n + "”");
        } else if (fb.dataset.fact === "fdelete") {
          const n = partsRows.filter((r) => folderOf(r) === folder).length;
          if (!confirm(`Delete the folder “${folder}”${n ? ` and the ${n} part${n === 1 ? "" : "s"} in it` : ""}? This can't be undone.`)) return;
          await deleteFolder(folder, partsRows); await refreshPartsList(); toast("Folder deleted");
        }
      } catch (err) { toast(err.message, true); }
      return;
    }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const row = b.closest(".partrow");
    const id = row && row.dataset.id;
    if (!id) return;
    try {
      if (b.dataset.act === "load") {
        const p = await A.loadPart(id);
        if (host && host.loadDesign) host.loadDesign(p);
        toast("Opened “" + p.name + "”");
        closeAll();
      } else if (b.dataset.act === "edit") {
        const p = await A.loadPart(id);
        if (host && host.loadDesign) host.loadDesign(p);
        closeAll();
        if (host && host.openEditor) host.openEditor();
        toast("Editing “" + p.name + "”. Save… offers overwrite or a copy.");
      } else if (b.dataset.act === "dup") {
        const p = await A.loadPart(id);
        const c = await A.savePart({ name: p.name + " (copy)", data: p.data });
        await refreshPartsList();
        toast("Made “" + c.name + "”");
      } else if (b.dataset.act === "rename") {
        const name = prompt("New name", row.querySelector("b").textContent);
        if (!name) return;
        await A.renamePart(id, name);
        await refreshPartsList();
      } else if (b.dataset.act === "del") {
        if (!confirm("Delete this part from your account?")) return;
        await A.deletePart(id);
        await refreshPartsList();
        toast("Deleted");
      }
    } catch (err) { toast(err.message, true); }
  });
}
export const setPartsRows = (v) => { partsRows = v; };

// Round 3: folders for the parts list + batch "Import DXFs" (up to 20 files, each saved as a part).
// Storage is the normal saved-parts storage (account.js): a part's folder name and its preview/size live INSIDE its `data`
// (data.folder, data.meta), so no new SQL is needed and old parts without a folder simply belong to "My parts".
import * as A from "./account.js";
import { parseDXF } from "./dxf.js";
import { parseSVG } from "./svg.js";
import { contoursToEditable } from "./editable.js";

export const MY = "My parts", MAX_FILES = 20, MAX_BYTES = 8 * 1024 * 1024;
const r1 = (v) => Math.round(v * 10) / 10;
const $ = (id) => document.getElementById(id);
let H = { toast() {}, esc: (s) => String(s) };

// ---------------------------------------------------------------- geometry helpers (preview + size)
function boxOfContours(cs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const p of c.pts || []) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}
// a small SVG path (about 60 units across, y pointing up) for the thumbnail
export function metaFromContours(cs) {
  const b = boxOfContours(cs); if (!b) return null;
  const w = b[2] - b[0], h = b[3] - b[1], k = 60 / Math.max(w, h, 1e-6), tw = Math.max(2, Math.round(w * k)), th = Math.max(2, Math.round(h * k));
  const parts = [];
  let budget = 500;
  for (const c of cs) {
    const pts = c.pts || []; if (pts.length < 2) continue;
    const step = Math.max(1, Math.ceil(pts.length / Math.max(8, Math.min(60, Math.floor(budget / Math.max(1, cs.length))))));
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
    if (out[out.length - 1] !== pts[pts.length - 1] && c.closed === false) out.push(pts[pts.length - 1]);
    budget -= out.length;
    parts.push("M" + out.map((p) => `${Math.round((p[0] - b[0]) * k * 10) / 10} ${Math.round((th - (p[1] - b[1]) * k) * 10) / 10}`).join("L") + (c.closed === false ? "" : "Z"));
  }
  return { w: r1(w), h: r1(h), t: parts.join(""), tw, th };
}
export function thumbSvg(meta, cls = "pthumb") {
  if (!meta || !meta.t) return `<span class="${cls} none" aria-hidden="true">▢</span>`;
  return `<svg class="${cls}" viewBox="-2 -2 ${meta.tw + 4} ${meta.th + 4}" aria-hidden="true"><path d="${meta.t}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
export const sizeText = (meta) => meta ? `${meta.w} × ${meta.h} mm` : "";

// ---------------------------------------------------------------- reading one drawing file
export async function readDrawing(file) {
  const ext = String(file.name || "").toLowerCase().split(".").pop();
  if (ext !== "dxf" && ext !== "svg") throw new Error("Not a DXF file.");
  if (file.size > MAX_BYTES) throw new Error("File is bigger than 8 MB.");
  const text = await file.text();
  if (text.indexOf("\u0000") >= 0) throw new Error("This looks like a binary file, not a text DXF. Save it from your CAD as ASCII DXF.");
  const r = ext === "dxf" ? parseDXF(text) : parseSVG(text);
  if (!r || !r.contours || !r.contours.length) throw new Error("No closed shapes to cut were found. The file may be damaged or only hold open lines.");
  const e = contoursToEditable(r.contours);
  if (!e || !e.parts.length) throw new Error("Nothing editable was found in this file.");
  const meta = metaFromContours(r.contours);
  if (!meta || !(meta.w > 0) || !(meta.h > 0)) throw new Error("The drawing has no size.");
  const items = e.parts.map(({ cs, x, y }) => ({ type: "custom", p: { scale: 100 }, x, y, rot: 0, holes: {}, shape: { cs } }));
  const curves = r.curves && (r.curves.splines || r.curves.ellipses) ? r.curves.splines + r.curves.ellipses : 0;
  return { name: String(file.name).replace(/\.[^.]+$/, "").trim() || "Imported part", items, meta, units: r.units || "", curves, warnings: r.warnings || [] };
}
// factor 25.4 (it was inches) or 1/25.4 (it was mm shown as inches)
export function scaled(d, k) {
  if (!k || k === 1) return { items: d.items, meta: d.meta };
  const items = d.items.map((it) => ({ ...it, x: Math.round(it.x * k * 100) / 100, y: Math.round(it.y * k * 100) / 100, shape: { cs: it.shape.cs.map((c) => ({ ...c, pts: c.pts.map(([x, y]) => [x * k, y * k]) })) } }));
  return { items, meta: { ...d.meta, w: r1(d.meta.w * k), h: r1(d.meta.h * k) } };
}

// ---------------------------------------------------------------- folders
export const folderOf = (row) => (row && row.folder && String(row.folder).trim()) || MY;
const regKey = () => { const u = A.currentUser && A.currentUser(); return "plasma.folders." + (u ? u.id : "x"); };
export function knownFolders() { try { return JSON.parse(localStorage.getItem(regKey()) || "[]").filter((x) => typeof x === "string"); } catch { return []; } }
function setKnown(list) { try { localStorage.setItem(regKey(), JSON.stringify([...new Set(list)])); } catch { /* ignore */ } }
export function addKnownFolder(name) { setKnown([...knownFolders(), name]); }
export function cleanFolderName(n) { return String(n || "").replace(/\s+/g, " ").trim().slice(0, 60); }
export function defaultImportFolder() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `Imported ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// rows -> [{ name, rows }] with "My parts" first, then the other folders (A–Z), including empty folders this device knows about
export function groupParts(rows) {
  const m = new Map(); m.set(MY, []);
  for (const f of knownFolders()) if (!m.has(f)) m.set(f, []);
  for (const r of rows) { const f = folderOf(r); if (!m.has(f)) m.set(f, []); m.get(f).push(r); }
  const rest = [...m.keys()].filter((k) => k !== MY).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return [MY, ...rest].map((name) => ({ name, rows: m.get(name) }));
}
export async function moveParts(ids, folder) {
  folder = cleanFolderName(folder) || MY;
  for (const id of ids) { const p = await A.loadPart(id); await A.savePart({ id, name: p.name, data: { ...(p.data || {}), folder: folder === MY ? undefined : folder }, updated_at: p.updated_at }); }
  if (folder !== MY) addKnownFolder(folder);
}
export async function renameFolder(oldName, newName, rows) {
  newName = cleanFolderName(newName); if (!newName) throw new Error("Type a folder name.");
  if (oldName === MY) throw new Error("“My parts” can't be renamed.");
  await moveParts(rows.filter((r) => folderOf(r) === oldName).map((r) => r.id), newName);
  setKnown(knownFolders().filter((f) => f !== oldName).concat(newName === MY ? [] : [newName]));
}
export async function deleteFolder(name, rows) {
  if (name === MY) throw new Error("“My parts” can't be deleted.");
  for (const r of rows.filter((x) => folderOf(x) === name)) await A.deletePart(r.id);
  setKnown(knownFolders().filter((f) => f !== name));
}

// ---------------------------------------------------------------- the Import DXFs dialog
let files = [];      // { file, name, d, err, k, status, msg }
let busy = false;
const FACT = { "1": 1, "25.4": 25.4, "0.03937": 1 / 25.4 };
function note() { return $("impNote"); }
function render() {
  const list = $("impList"), ok = files.filter((f) => f.d);
  list.innerHTML = files.length ? files.map((f, i) => {
    const sz = f.d ? scaled(f.d, f.k).meta : null, kk = String(f.k === 1 ? "1" : f.k > 1 ? "25.4" : "0.03937");
    const hint = f.d && f.k === 1 && sz.w < 12 && sz.h < 12 ? `<span class="warnchip">Only ${sz.w} × ${sz.h} mm. Was it inches?</span>` : "";
    const st = f.status === "ok" ? `<span class="okchip">✓ Saved</span>` : f.status === "saving" ? `<span class="muted">Saving…</span>` : f.status === "err" ? `<span class="errchip">✗ ${H.esc(f.msg)}</span>` : f.err ? `<span class="errchip">✗ ${H.esc(f.err)}</span>` : `<span class="muted">Ready</span>`;
    return `<div class="improw ${f.err || f.status === "err" ? "bad" : ""}" data-i="${i}">
      ${f.d ? thumbSvg(sz) : `<span class="pthumb none">⚠</span>`}
      <div class="grow"><b>${H.esc(f.name)}</b>
        <div class="muted small">${sz ? sizeText(sz) : ""}${f.d && f.d.units ? " · " + H.esc(f.d.units) : ""}${f.d && f.d.curves ? ` · ${f.d.curves} curve(s) made into short lines` : ""} ${hint}</div>
        <div class="small">${st}</div></div>
      ${f.d && !busy && f.status !== "ok" ? `<div class="unitbtns" role="group" aria-label="Size check for ${H.esc(f.name)}">
        <button type="button" class="small ${kk === "1" ? "sel" : ""}" data-k="1" title="Size is right (mm)">mm</button>
        <button type="button" class="small ${kk === "25.4" ? "sel" : ""}" data-k="25.4" title="It was inches: multiply by 25.4">× 25.4</button>
        <button type="button" class="small ${kk === "0.03937" ? "sel" : ""}" data-k="0.03937" title="It was mm shown as inches: divide by 25.4">÷ 25.4</button></div>` : ""}
    </div>`;
  }).join("") : `<p class="muted">No files yet. Drop DXF files here, or tap “Choose DXF files”.</p>`;
  $("impAll").classList.toggle("hidden", ok.length < 2 || busy);
  const todo = files.filter((f) => f.d && f.status !== "ok").length;
  $("impGo").disabled = busy || !todo;
  $("impGo").textContent = busy ? "Importing…" : todo ? `Import ${todo} file${todo === 1 ? "" : "s"}` : "Import";
}
async function addFiles(list) {
  const picked = [...list];
  if (busy) return;
  const total = files.length + picked.length;
  if (total > MAX_FILES) {
    note().textContent = `That is ${total} files. The limit is ${MAX_FILES} per import, so nothing was added. Pick ${MAX_FILES} or fewer, or import them in more than one batch.`;
    note().classList.add("bad"); H.toast(`Too many files: the limit is ${MAX_FILES} per import.`, true); return;
  }
  note().classList.remove("bad"); note().textContent = "";
  for (const file of picked) {
    const row = { file, name: String(file.name).replace(/\.[^.]+$/, ""), d: null, err: "", k: 1, status: "", msg: "" };
    files.push(row);
    try { row.d = await readDrawing(file); row.name = row.d.name; } catch (e) { row.err = e.message || "Can't read this file."; }
    render();
  }
  const bad = files.filter((f) => f.err).length;
  if (bad) note().textContent = `${bad} file${bad === 1 ? "" : "s"} can't be read and will be skipped. The rest can still be imported.`;
}
async function runImport() {
  if (!A.isSignedIn()) { H.toast("Sign in first. Imported parts are saved to your parts list.", true); H.openSignIn && H.openSignIn(); return; }
  const folder = cleanFolderName($("impFolder").value) || defaultImportFolder();
  busy = true; render();
  const todo = files.filter((f) => f.d && f.status !== "ok");
  let done = 0, okN = 0, badN = 0;
  const bar = $("impBar"); bar.max = todo.length; bar.value = 0; bar.classList.remove("hidden");
  for (const f of todo) {
    f.status = "saving"; render();
    try {
      const s = scaled(f.d, f.k);
      await A.savePart({ name: f.name, data: { items: s.items, folder: folder === MY ? undefined : folder, meta: s.meta } });
      f.status = "ok"; okN++;
    } catch (e) { f.status = "err"; f.msg = e.message || "Could not save."; badN++; }
    done++; bar.value = done; render();
  }
  busy = false;
  if (folder !== MY) addKnownFolder(folder);
  render();
  $("impSummary").textContent = `${okN} saved${badN ? `, ${badN} failed` : ""}${files.some((f) => f.err) ? `, ${files.filter((f) => f.err).length} unreadable (skipped)` : ""}. Folder: “${folder}”.`;
  $("impSummary").classList.remove("hidden");
  $("impCancel").textContent = "Close";
  H.toast(`Imported ${okN} part${okN === 1 ? "" : "s"} into “${folder}”.` + (badN ? ` ${badN} failed.` : ""), !!badN);
  document.dispatchEvent(new CustomEvent("parts-changed"));
}
export function openImport(initialFiles) {
  if (!A.isSignedIn()) { H.toast("Sign in (or make a free account) to import into your parts list.", true); H.openSignIn && H.openSignIn(); return; }
  files = []; busy = false;
  $("impFolder").value = defaultImportFolder();
  $("impFolderList").innerHTML = "";
  A.listParts().then((rows) => { $("impFolderList").innerHTML = groupParts(rows).map((g) => `<option value="${H.esc(g.name)}">`).join(""); }).catch(() => {});
  $("impSummary").classList.add("hidden"); $("impBar").classList.add("hidden"); $("impCancel").textContent = "Cancel";
  note().textContent = ""; note().classList.remove("bad"); $("impFiles").value = "";
  render();
  $("importDlg").classList.remove("hidden");
  if (initialFiles && initialFiles.length) addFiles(initialFiles);
}
const close = () => { if (busy) return; $("importDlg").classList.add("hidden"); H.uiBlock && H.uiBlock(); };
export function initPartsFolders(host) {
  H = { ...H, ...host };
  const dlg = $("importDlg"); if (!dlg) return;
  $("impFiles").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  $("impCancel").onclick = close;
  $("impGo").onclick = () => runImport();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  const drop = $("impDrop");
  ["dragenter", "dragover"].forEach((ev) => dlg.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => dlg.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || e.target === dlg) drop.classList.remove("over"); }));
  dlg.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  $("impList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]"), row = e.target.closest(".improw"); if (!b || !row) return;
    files[Number(row.dataset.i)].k = FACT[b.dataset.k] || 1; render();
  });
  $("impAll").addEventListener("click", (e) => {
    const b = e.target.closest("[data-all]"); if (!b) return;
    const k = FACT[b.dataset.all] || 1;
    for (const f of files) if (f.d && f.status !== "ok") f.k = k;
    render();
  });
}

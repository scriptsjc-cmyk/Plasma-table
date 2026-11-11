// The shape library, the shape-versions pop-up and the Add text / Trace tool launchers.
import { SHAPE_GROUPS, presetOrShape, shapeThumb } from "./shapes.js";
import { variantKey, variantsFor } from "./variants.js";
import { shapeDef } from "./sketch.js";
import { initMakeTools } from "./maketools.js";
import { S, makeTools, setMakeTools, sketch } from "../core/state.js";
import { showSource, useShape } from "./useshape.js";
import { $, esc, toast } from "../core/dom.js";
import { isProMode } from "../ui/mode.js";
import { addShapeId, beginnerPick, paintGuide } from "./shapeform.js";

// keep the boxes in step while dragging, without rebuilding them


let libCat = "all";
export function openMakeTool(which) {
  if (!makeTools || (S.job && S.job.running)) return;
  if (S.src !== "shape") showSource("shape");
  if (which === "text") makeTools.openText(); else makeTools.openTrace();
}
export function openLibrary() {
  $("shapeLib").classList.remove("hidden");
  $("libSearch").value = "";
  renderLibrary();
  setTimeout(() => { if (matchMedia("(pointer: fine)").matches) $("libSearch").focus(); }, 30);
}
export function closeLibrary() { $("shapeLib").classList.add("hidden"); S.uiBlockUntil = Date.now() + 450; }
// "l bracket", "L-bracket" and "lbracket" all match: ignore case, spaces, hyphens and underscores
function normQ(s) { return String(s || "").toLowerCase().replace(/[\s\-_()/.,]+/g, " ").trim(); }
export function matchesQuery(hay, q) {
  const h = normQ(hay), hs = h.replace(/ /g, "");
  const toks = normQ(q).split(" ").filter(Boolean);
  if (!toks.length) return true;
  if (hs.includes(toks.join(""))) return true;
  return toks.every((tk) => h.includes(tk) || hs.includes(tk));
}
function renderLibrary() {
  const q = $("libSearch").value.trim().toLowerCase();
  const cats = [{ id: "all", name: "All" }, ...SHAPE_GROUPS];
  $("libCats").innerHTML = cats.map((c) => `<button type="button" data-cat="${esc(c.id)}" class="${c.id === libCat ? "on" : ""}">${esc(c.name)}</button>`).join("");
  let ids;
  if (libCat === "all" || q) { const seen = new Set(); ids = SHAPE_GROUPS.flatMap((g) => g.ids).filter((id) => !seen.has(id) && seen.add(id)); }
  else ids = (SHAPE_GROUPS.find((g) => g.id === libCat) || { ids: [] }).ids;
  const list = ids.map((id) => presetOrShape(id)).filter(Boolean)
    .filter((s) => !q || matchesQuery((s.name + " " + (s.tip || "") + " " + s.id + " " + (s.aka || "")), q));
  $("libGrid").innerHTML = list.length ? list.map((s) => `<button type="button" data-shape="${esc(s.id)}" title="${esc(s.tip || s.name)}">${shapeThumb(s, 64, 44)}<span class="libname">${esc(s.name)}</span></button>`).join("")
    : `<p class="muted">No shapes match “${esc(q)}”.</p>`;
}
export function openVersions() {
  const it = sketch.selected();
  if (!it) { toast("Tap a shape first, then Versions."); return; }
  const vs = variantsFor(it.type);
  if (!vs.length) { toast("This shape has no other versions."); return; }
  const cur = sketch.currentVariantKey();
  $("verTitle").textContent = "Versions of " + shapeDef(it.type).name.toLowerCase();
  $("verBody").innerHTML = vs.map((v) => { const d = shapeDef(v.id); return `<button type="button" data-var="${esc(variantKey(v))}" class="${variantKey(v) === cur ? "sel" : ""}">${d ? shapeThumb(d, 40, 28) : ""}<span>${esc(v.label || (d ? d.name : v.id))}</span></button>`; }).join("");
  $("verPop").classList.remove("hidden");
}
export function closeVersions() { $("verPop").classList.add("hidden"); S.uiBlockUntil = Date.now() + 450; }
export function bindLibrary() {
  if ($("bgMore")) $("bgMore").onclick = () => openLibrary();
  setMakeTools(initMakeTools({
    sketch, isPro: isProMode, toast,
    blocked: () => !!(S.job && S.job.running),
    afterAdd: () => { S.bgChoosing = false; if (S.src !== "shape") showSource("shape"); sketch.fitView(); useShape(); },
  }));
  const bgm = document.querySelector("#bgPick .bgmore");
  if (bgm) bgm.insertAdjacentHTML("beforeend", `<button type="button" id="bgText" class="xl">Aa Add text</button><button type="button" id="bgTrace" class="xl">▧ Trace a picture</button>`);
  if ($("bgText")) $("bgText").onclick = () => openMakeTool("text");
  if ($("bgTrace")) $("bgTrace").onclick = () => openMakeTool("trace");
  if ($("bgChange")) $("bgChange").onclick = () => { S.bgChoosing = true; paintGuide(); };
  const addTile = (e) => {
    if (Date.now() < (S.uiBlockUntil || 0)) return;      // a second tap just after a sheet closed would hit whatever is under it
    if (e.target.closest("[data-lib]")) { openLibrary(); return; }
    const tl = e.target.closest("[data-tool]"); if (tl) { openMakeTool(tl.dataset.tool); return; }
    const b = e.target.closest("[data-shape]"); if (b) addShapeId(b.dataset.shape);
  };
  $("shapeTiles").onclick = addTile;
 $("holeTiles").onclick = addTile;
  $("libClose").onclick = closeLibrary;
  $("shapeLib").addEventListener("click", (e) => {
    if (e.target === $("shapeLib")) { closeLibrary(); return; }
    const c = e.target.closest("[data-cat]"); if (c) { libCat = c.dataset.cat; renderLibrary(); return; }
    const b = e.target.closest("[data-shape]"); if (b) { closeLibrary(); if (!isProMode()) beginnerPick(b.dataset.shape); else addShapeId(b.dataset.shape); }
  });
  $("libSearch").addEventListener("input", renderLibrary);
  $("verClose").onclick = closeVersions;
  $("verPop").addEventListener("click", (e) => {
    if (e.target === $("verPop")) { closeVersions(); return; }
    const v = e.target.closest("[data-var]"); if (!v) return;
    const it = sketch.selected(); if (!it) return;
    const spec = variantsFor(it.type).find((x) => variantKey(x) === v.dataset.var);
    if (spec) { sketch.applyVariant(spec); closeVersions(); }
  });
}

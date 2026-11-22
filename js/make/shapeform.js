// Make a part: Simple view templates, the guide, and the size/position form for the selected shape.
import { SHAPES, SHAPE_PRESETS, shapeThumb } from "./shapes.js";
import { screen } from "../ui/flow.js";
import { shapeDef } from "./sketch.js";
import { variantKey, variantsFor } from "./variants.js";
import { saveCurrent } from "../account/savepart.js";
import { evalExpr } from "../core/expr.js";
import { $, esc, toast } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { syncModeSwitch } from "../ui/mode.js";
import { renderProTools, setShapeFs } from "./protools.js";
import { runPro } from "./cad.js";
import { showSource, useShape, useShapeSoon } from "../core/hooks.js";
import { paintCutSummary } from "./cutsummary.js";
import { onShapeFormPainted } from "./phonesheet.js";
import { clickVerb } from "../ui/laptop.js";
import { isFoldPart, mountFoldView } from "./fold3d.js";
import { bendFor } from "./bends.js";
import { getPrefs, savePrefs } from "../core/prefs.js";
import { flangeShapeKeys } from "./flange-tables.js";
import { tableToHtml, openSheetTable } from "./sheetopts.js";
import { setInfoText } from "../ui/hovertip.js";
import { maybeOpenSizeTab } from "./inspector.js";
import { smallHoleRule, isHoleSizeParam } from "./holerule.js";

let editBefore = null;
const QUICK_PARTS = ["rect", "plate", "disc", "ring", "flange", "triangle", "gusset", "slot"];
export function renderShapeTiles() {
  const tile = (sh) => `<button data-shape="${esc(sh.id)}" title="${esc(sh.tip || "Add " + sh.name)}"><i>${shapeThumb(sh, 40, 28) || esc(sh.icon)}</i>${esc(sh.name)}</button>`;
  $("shapeTiles").innerHTML = QUICK_PARTS.map((id) => SHAPES.find((s) => s.id === id)).filter(Boolean).map(tile).join("")
    + `<button data-lib="1" class="libmore" title="Every shape, by category"><i>⋯</i>More shapes (${SHAPES.filter((s) => !s.hole).length})</button>`
    + `<button data-tool="text" class="mktool" title="Type words and cut them as a name plate or as letters"><i>Aa</i>Add text</button>`
    + `<button data-tool="trace" class="mktool" title="Turn a logo or picture into outlines you can cut"><i>▧</i>Trace a picture</button>`;
  $("holeTiles").innerHTML = SHAPES.filter((sh) => sh.hole).map(tile).join("");
  renderBeginnerShapes();
  $("skSnap").value = String(sketch.opts.snap);
  $("skGuides").checked = !!sketch.opts.guides;
  syncModeSwitch();
  renderProTools();
}
// ---- Beginner: big plain shape buttons first, and a one-step-at-a-time guide
const BEGIN_SHAPES = [["bracket", "Bracket"], ["plate", "Plate with holes"], ["flange", "Flange"], ["gusset", "Gusset"], ["rect", "Rectangle"], ["disc", "Circle"], ["ring", "Ring"], ["triangle", "Triangle"], ["slot", "Slot"]];
function renderBeginnerShapes() {
  const box = $("bgShapes"); if (!box) return;
  const cur = sketch && sketch.items.length === 1 ? sketch.items[0].type : null;
  box.innerHTML = BEGIN_SHAPES.map(([id, label]) => SHAPES.find((s) => s.id === id)
    ? `<button type="button" data-bshape="${esc(id)}" class="${cur === id ? "sel" : ""}"><i>${shapeThumb(SHAPES.find((s) => s.id === id), 72, 48)}</i><span>${esc(label)}</span></button>` : "").join("");
}
// add a shape by id; a library preset like "flange6" adds its base shape with its sizes already set
// a circle looks the same turned any way, so "Turn it" is hidden for it
const isRoundType = (type) => type === "disc" || type === "hole" || type === "ring";
export function addShapeId(id) {
  const pr = SHAPE_PRESETS[id];
  if (pr) sketch.add(pr.base, false, pr.p); else sketch.add(id);
}
export function beginnerPick(id) {
  if (S.job && S.job.running) return;
  S.bgChoosing = false;
  if (S.src !== "shape") showSource("shape");
  // r8 item 12: tapping another template ADDS it, so you can combine a plate and holes.
  addShapeId(id);
  sketch.fitView();
  useShape();      // build the job now, not 250 ms later: a shape that is picked must enable Next straight away
}
// Make a part: one page. Beginner gets a plain two-line guide on top; Pro gets none.
export function paintGuide() {
  const mk = screen() === "make", beg = document.body.classList.contains("beginner");
  const has = !!(sketch && sketch.items.length);
  document.body.classList.toggle("bg-picked", !!(mk && beg && S.src === "shape" && has && !S.bgChoosing && S.cur === 1));
  const nx = $("next1");
  if (nx) nx.textContent = mk
    ? (S.prepared ? "✂ Cut this part →" : (has ? "Getting it ready…" : "Pick a template to continue"))
    : (S.prepared ? "Next: Setup →" : "Pick a part first");
  const mt = $("matLine"); if (mt) mt.textContent = S.material ? `Cutting ${S.material.toLowerCase()}, ${S.thickness} mm thick. Not right? ${clickVerb()} a different one.` : "";
  const t = $("step1Title"); if (t) t.textContent = mk ? "Make a part" : "What do you want to cut?";
  const gh = $("guideHead"); if (!gh || !mk || !beg) return;
  $("ghStep").textContent = "Make a part";
  $("ghTitle").textContent = has ? "Set the size" : "Pick a template";
  const helpEl = $("ghHelp");
  if (helpEl) {
    const help = has ? "Type how big it should be, turn it, add holes. When it looks right, press Cut this part." : clickVerb() + " a template and fill in the numbers, or open Advanced tools to draw freely.";
    const short = has ? "Type how big it should be." : clickVerb() + " a template and fill in the numbers.";
    setInfoText(helpEl, short, help, has ? "More about setting the size" : "More about picking a template");
  }
  gh.style.setProperty("--prog", has ? "100%" : "0%");
}
const HOLE_ADDERS = [["slothole", "Slot hole"], ["cornerholes", "Corner holes (4)"], ["holerow", "Row of holes"], ["boltcircle", "Ring of holes"], ["holegrid", "Grid of holes"]];
const ALIGN = [["left", "⇤ Left"], ["centre", "↔ Centre"], ["right", "⇥ Right"], ["both", "◎ Dead centre"],
  ["bottom", "⤓ Bottom"], ["middle", "↕ Middle"], ["top", "⤒ Top"]];
function customSizeHtml(it, b) {
  if (!it || it.type !== "custom") return "";
  const W = Math.round((b[2] - b[0]) * 100) / 100, H = Math.round((b[3] - b[1]) * 100) / 100;
  return `<div class="grid2 custsize">
      <label>Width (mm)<input type="number" step="any" min="2" inputmode="decimal" data-cw="1" value="${W}"></label>
      <label>Height (mm)<input type="number" step="any" min="2" inputmode="decimal" data-ch="1" value="${H}"></label>
      <label class="check wide2"><input type="checkbox" id="keepProp" ${S.keepProp === false ? "" : "checked"}> Keep proportions</label>
    </div>`;
}
// Pro: where a picked hole (or hole pattern) sits in its part, measured from the part's edges
function holeHostHtml(it, sh) {
  const host = sketch.hostPart(it); if (!host) return "";
  const hb = sketch.boxOf(host), b = sketch.boxOf(it);
  const cx = Math.round(((b[0] + b[2]) / 2 - hb[0]) * 100) / 100, cy = Math.round(((b[1] + b[3]) / 2 - hb[1]) * 100) / 100;
  return `<h4>Where it sits in the part</h4>
    <div class="grid2">
      <label>Centre from the part's left edge<input type="number" step="any" inputmode="decimal" data-hrel="x" value="${cx}"></label>
      <label>Centre from the part's bottom edge<input type="number" step="any" inputmode="decimal" data-hrel="y" value="${cy}"></label>
    </div>
    <div class="skbtns"><button data-sk="centreInHost">◎ Centre in the part</button><button data-sk="pickHost">↩ Select the part</button><button data-pro="linarray">Row of copies</button><button data-pro="polar">Circle of copies</button></div>`;
}
// round 5 item 9: Beginner's simple parts list (tap one to pick it), shown once there is more than one part or any part is locked
function beginnerPartsHtml() {
  const parts = sketch.items.filter((o) => !sketch.isHole(o)), locked = sketch.items.some((i) => i.lock);
  if (parts.length < 2 && !locked) return "";
  const picked = new Set(sketch.picked().map((i) => i.id));
  const li = parts.map((it, n) => {
    const b = sketch.boxOf(it), sh = shapeDef(it.type);
    const size = `${Math.round((b[2] - b[0]) * 10) / 10} × ${Math.round((b[3] - b[1]) * 10) / 10} mm`;
    return `<li><button type="button" data-bpart="${it.id}" class="${picked.has(it.id) ? "sel" : ""}" aria-pressed="${picked.has(it.id)}"><b>${n + 1}. ${esc(sh ? sh.name : it.type)}</b><span>${size}${it.lock ? " · 🔒 locked" : ""}</span></button></li>`;
  }).join("");
  const unlock = locked ? `<p class="tip lockline">A locked part can't be moved or resized. <button type="button" data-sk="unlockAll">🔓 Unlock all</button></p>` : "";
  return `<div class="bgparts"><h4>Parts in this drawing</h4><ul>${li}</ul>${unlock}</div>`;
}

// Version chips use a short name so it fits the chip; the full name is the tooltip (r13 #10).
const SHORT_VARIANT = { "Square corners": "Square", "Rounded rectangle": "Rounded rect.", "Corner + centre hole": "Corner + centre", "Corner + centre holes": "Corner + centre" };
function shortVariantLabel(label) { return SHORT_VARIANT[label] || label; }
// r15 6.3: under a hole-size field, the small-hole rule live (same check as the Features rows), with Mark for drilling
const sheetT = () => { const t = Number(S.thickness); return Number.isFinite(t) && t > 0 ? t : 3; };
export function holeNoteHtml(it, sh, k) {
  const param = sh && (sh.params || []).find((q) => q[0] === k);
  if (!param || !isHoleSizeParam(sh, param)) return "";
  if (Array.isArray(it.drill) && it.drill.includes(k)) return `<p class="holerule small" data-hr="${esc(k)}" role="status">✚ Marked for drilling: an etched cross at each of these holes' centres. <button type="button" class="small quiet" data-undrill="${esc(k)}">Cut it instead</button></p>`;
  const r = smallHoleRule(it.p[k], sheetT());
  return r ? `<p class="holerule warntext small" data-hr="${esc(k)}" role="status">⚠ ${esc(r.text)} <button type="button" class="small" data-drill="${esc(k)}">Mark for drilling</button></p>` : "";
}
function refreshHoleNote(inp, it) {
  const k = inp.dataset.p, sh = shapeDef(it.type), lab = inp.closest("label"); if (!lab) return;
  const old = lab.parentElement && lab.parentElement.querySelector(`.holerule[data-hr="${CSS.escape(k)}"]`);
  const html = holeNoteHtml(it, sh, k);
  if (old) { if (html) old.outerHTML = html; else old.remove(); }
  else if (html) lab.insertAdjacentHTML("afterend", html);
}
function paramField(it, param) {
  const [k, label, , meta] = param;
  const val = it.p[k];
  if (meta && meta.type === "select") {
    const opts = (meta.options || []).map((o) => `<option value="${esc(String(o.v))}"${String(o.v) === String(val) ? " selected" : ""}>${esc(o.l)}</option>`).join("");
    return `<label><span class="plabel" title="${esc(label)}">${esc(label)}</span><select data-p="${esc(k)}" data-psel="1">${opts}</select></label>`;
  }
  return `<label><span class="plabel" title="${esc(label)}">${esc(label)}</span><input type="number" step="any" min="0" inputmode="decimal" data-p="${esc(k)}" value="${esc(String(val))}"></label>${holeNoteHtml(it, shapeDef(it.type), k)}`;
}
function extraFormHtml(it, sh) {
  let html = "";
  if (sh && sh.note) {
    const note = typeof sh.note === "function" ? sh.note(it && it.p ? it.p : {}) : sh.note;
    if (note) html += `<p class="tip fold-note">${esc(String(note))}</p>`;
  }
  // r15 5.1: a deduction measured on your own brake can be kept for this sheet thickness (every folded part then uses it)
  if (sh && sh.bendAllowance && it && it.p && Number(it.p.bd) > 0) {
    const b = bendFor({ ...it.p, bd: 0 }), T = b.T, v = Number(it.p.bd);
    if (T > 0 && Number(it.p.bsz) !== 2) html += `<div class="skbtns"><button type="button" class="quiet" data-bend-save="${esc(String(v))}" data-bend-th="${esc(String(T))}">Remember ${esc(String(v))} mm for every ${esc(String(T))} mm bend</button></div>`;
  }
  if (sh && sh.table) {
    html += `<div class="skbtns"><button type="button" data-sheet-table="1">Print true-length / marking-out table</button></div>`;
  }
  if (it && flangeShapeKeys(it.type)) {
    html += `<div class="skbtns"><button type="button" data-pro="flangestd">Fill from BS EN 1092-1 / ASME B16.5…</button></div>`;
  }
  if (sketch.opts && sketch.opts.pro) {
    html += `<p class="muted small insp-arrange"><label class="check"><input type="checkbox" id="sfShowKerf"${sketch.opts.showKerf ? " checked" : ""}> Show torch path (kerf preview)</label>
      <button type="button" class="quiet" data-pro="cutctl">Cut control…</button></p>`;
  }
  return html;
}

export function renderShapeForm() {
  try { renderShapeFormCore(); } finally {
    try { paintFoldView(); } catch (e) { /* 3D view optional */ }
    try { onShapeFormPainted(); } catch (e) { /* phone sheet optional */ }
    try { maybeOpenSizeTab(); } catch (e) { /* laptop inspector tabs optional */ }
  }
}
function paintFoldView() {
  const formHost = document.getElementById("fold3dHost");
  const stray = document.getElementById("fold3dDock");
  if (stray) { stray.replaceChildren(); stray.hidden = true; stray.remove(); }
  const it = sketch && sketch.selected();
  const sh = it && shapeDef(it.type);
  const on = !!(it && sh && isFoldPart(sh));
  document.body.classList.toggle("has-fold3d", on);
  if (on && formHost) mountFoldView(formHost, sh, it.p);
  else if (formHost) { formHost.replaceChildren(); formHost.hidden = true; }
}
function renderShapeFormCore() {
  try { paintCutSummary(); } catch (e) { /* the cut chart is not loaded yet */ }
  // round 5 item 7: Beginner always sees the size boxes: with nothing picked, the only part is picked for you
  // (not in the full-screen editor, where Esc first drops the pick and then leaves)
  if (!sketch.opts.pro && !sketch.layout && !S.shapeFs && !sketch.picked().length) {
    const parts = sketch.items.filter((o) => !sketch.isHole(o));
    if (parts.length === 1) { sketch.pick([parts[0].id]); sketch.autoPick = parts[0].id; sketch.draw(); }
  }
  const list = sketch.picked(), it = sketch.selected();
  $("skUndo").disabled = !sketch.past.length; $("skRedo").disabled = !sketch.future.length;
  $("skClear").disabled = !sketch.items.length; $("skAll").disabled = !sketch.items.length;
  paintGuide(); renderBeginnerShapes();
  if (!list.length) {
    $("shapeForm").innerHTML = !sketch.items.length ? "" : sketch.opts.pro
      ? `<p class="muted">Click a shape on the drawing to change it. Shift-click or drag a box round several to move, copy, join or line them up.</p>`
      : beginnerPartsHtml() + `<p class="muted">${clickVerb()} a part in the list or on the drawing to change it.</p>`;
    return;
  }
  if (list.length > 1) {
    const pro = sketch.opts.pro ? `
      <h4>Pro</h4>
      <div class="skbtns">
        <button data-pro="subtract">✂ Subtract</button>
        <button data-pro="distx">↔ Space across</button>
        <button data-pro="disty">↕ Space up</button>
        <button data-pro="linarray">Linear array</button>
        <button data-pro="polar">Circular array</button>
        <button data-pro="lock">${list.every((i) => i.lock) ? "Unlock" : "🔒 Lock"}</button>
        <button data-sk="flipV">⇅ Flip up/down</button>
      </div>` : "";
    $("shapeForm").innerHTML = (sketch.opts.pro ? "" : beginnerPartsHtml()) + `
      <div class="selhead"><b>${list.length} shapes picked</b></div>
      <p class="tip">Drag any of them to move them all. <b>Join</b> makes touching shapes one part (with their holes).</p>
      <div class="skbtns">
        <button data-sk="join" class="join" title="Ctrl+J">⬟ Join into one part</button>
        <button data-sk="group" title="Keep them as separate parts that move together">▣ Group</button>
        <button data-sk="ungroup">▢ Ungroup</button>
        <button data-sk="duplicate" title="Ctrl+D">⧉ Copy</button>
        <button data-sk="rotateBy" data-arg="90" title="Turns 90° about the bottom-left corner">⟳ Turn 90°</button>
        <button data-sk="mirror" title="Mirror left-right (H)">⇋ Mirror</button>
        <button data-sk="remove" class="danger" title="Delete">🗑 Delete</button>
      </div>
      <h4>Line up with the biggest one</h4>
      <div class="alignrow">${ALIGN.map(([k, t]) => `<button data-sk="align" data-arg="${k}">${t}</button>`).join("")}</div>
      <div class="alignrow">
        <button data-sk="distribute" data-arg="x">↔ Space evenly</button>
        <button data-sk="distribute" data-arg="y">↕ Space evenly</button>
      </div>${pro}`;
    return;
  }
  const sh = shapeDef(it.type), b = sketch.boxOf(it);
  if (!sketch.opts.pro) {                        // Beginner: just the sizes, turn, add a hole, remove
    $("shapeForm").innerHTML = beginnerPartsHtml() + `
      <div class="selhead"><b>${esc(sh.name)}</b>${it.lock ? " 🔒" : ""}</div>
      <div id="fold3dHost" class="fold3d-host" hidden></div>
      ${it.lock ? `<p class="tip lockline">This part is locked, so it can't change. <button type="button" data-sk="toggleLock">🔓 Unlock</button></p>` : `<p class="tip">Type the size in millimetres.</p>`}
      <div class="grid2">${(it.type === "custom" ? [] : sh.params).map((pr) => paramField(it, pr)).join("")}</div>${customSizeHtml(it, b)}${extraFormHtml(it, sh)}
      <div class="skbtns bigbtns">
        ${isRoundType(it.type) ? "" : `<button data-sk="rotateBy" data-arg="90">⟳ Turn it</button>`}
        ${!sh.hole && !sh.sheet && shapeDef("hole") ? `<button data-sk="add" data-arg="hole">◦ Add a hole</button>` : ""}
        ${sh.hole && sketch.hostPart(it) ? `<button data-sk="pickHost">↩ Back to the part</button><button data-sk="centreInHost">◎ Centre it</button>` : ""}
        ${sh.sheet ? `<button data-sk="explode" title="Make each piece its own part, so you can place them on the bed one by one">✂ Split into parts</button>` : ""}
        <button data-sk="remove" class="quiet">🗑 Remove</button>
      </div>
      ${!sh.hole && !sh.sheet ? `<p class="tip">More holes:</p><div class="skbtns holeadd">${HOLE_ADDERS.map(([id, label]) => shapeDef(id) ? `<button data-sk="add" data-arg="${id}">${esc(label)}</button>` : "").join("")}</div>
      <details class="holeaddmenu"><summary title="Add more holes to this part">＋ More holes</summary><div class="skbtns holeaddpop popover">${HOLE_ADDERS.map(([id, label]) => shapeDef(id) ? `<button data-sk="add" data-arg="${id}">${esc(label)}</button>` : "").join("")}</div></details>` : ""}`;
    return;
  }
  const moved = Object.keys(it.holes || {}).length;
  const host = sketch.hostPart(it);
  const hb = host ? sketch.boxOf(host) : null;
  // A hole in a part is positioned from that part's bottom-left, not from the sheet origin.
  const posX = Math.round(((hb ? b[0] - hb[0] : b[0]) * 10)) / 10;
  const posY = Math.round(((hb ? b[1] - hb[1] : b[1]) * 10)) / 10;
  const posXLab = host ? "Position X (from the part's left edge)" : "Position X (left edge)";
  const posYLab = host ? "Position Y (from the part's bottom edge)" : "Position Y (bottom edge)";
  const curKey = sketch.currentVariantKey();
  const vars = variantsFor(it.type).map((v) => {
    const d = shapeDef(v.id); const label = v.label || (d ? d.name : v.id);
    return `<button type="button" data-var="${esc(variantKey(v))}" title="${esc(label)}" aria-label="${esc(label)}" class="${variantKey(v) === curKey ? "sel" : ""}">${esc(shortVariantLabel(label))}</button>`;
  }).join("");
  const varBox = vars ? `<div class="varbox"><h4>Versions of this shape</h4><div class="varrow">${vars}</div><p class="muted small">Keeps this size and place. Then edit holes, radii and so on below. ${clickVerb()} a blue size on the drawing to type an exact measurement.</p></div>` : `<p class="muted small">${clickVerb()} a blue size on the drawing to type an exact measurement.</p>`;
  const proOne = sketch.opts.pro ? `
      <div class="skbtns insp-arrange">
        <button data-pro="linarray">Linear array</button>
        <button data-pro="polar">Circular array</button>
        <button data-pro="offset">Offset</button>
        <button data-pro="lock">${it.lock ? "Unlock" : "🔒 Lock"}</button>
        <button data-sk="flipV">⇅ Flip up/down</button>
      </div>` : "";
  $("shapeForm").innerHTML = `
    <div class="selhead"><b>${esc(sh.name)}</b>${it.lock ? " 🔒" : ""}${sketch.sel.hole != null ? ` <span class="muted">· hole picked – drag it or use the arrow keys</span>` : ""}</div>
    <div id="fold3dHost" class="fold3d-host" hidden></div>
    ${varBox}
    ${sh.tip ? `<p class="tip">${esc(sh.tip)}</p>` : ""}
    ${customSizeHtml(it, b)}
    <div class="grid2">${(it.type === "custom" ? [] : sh.params).map((pr) => paramField(it, pr)).join("")}
      ${/* r15 4.16: the overall size only when Width and Height aren't already the fields above */ ""}${it.type === "custom" || (sh.params.some((pr) => pr[0] === "w") && sh.params.some((pr) => pr[0] === "h")) ? "" : `<label>Size<input type="text" disabled value="${Math.round((b[2] - b[0]) * 10) / 10} × ${Math.round((b[3] - b[1]) * 10) / 10} mm"></label>`}
    </div>
    <div class="grid2 insp-arrange">
      <label>${esc(posXLab)}<input type="number" step="any" inputmode="decimal" data-pos="x" value="${posX}"></label>
      <label>${esc(posYLab)}<input type="number" step="any" inputmode="decimal" data-pos="y" value="${posY}"></label>
      <label>Angle °<input type="number" step="any" inputmode="decimal" data-angle="1" value="${Math.round((it.rot || 0) * 10) / 10}"></label>
    </div>
    ${extraFormHtml(it, sh)}
    <div class="skbtns insp-arrange">
      ${isRoundType(it.type) ? "" : `<button data-sk="rotateBy" data-arg="90" title="Turns 90° about the bottom-left corner">⟳ Turn 90°</button>`}
      <button data-sk="mirror" title="Mirror left-right (H)">⇋ Mirror</button>
      <button data-sk="duplicate" title="Ctrl+D">⧉ Copy</button>
      ${moved ? `<button data-sk="resetHoles">↺ Holes back</button>` : ""}
      ${sh.sheet ? `<button data-sk="explode" title="Make each piece its own part, so you can place them on the bed one by one">✂ Split into parts</button>` : ""}
      <button data-sk="centreBetween" title="Centre this shape between two edges">◎ Centre between…</button>
      <button data-sk="remove" class="danger" title="Delete">🗑 Delete</button>
    </div>${proOne}${holeHostHtml(it, sh)}`;
}
// r15 2.19 (Josh t543u): a bigger size typed in the Size tab zooms the view to fit again, exactly like Fit. It waits until the
// typing pauses (so "900" doesn't zoom at 9 and 90), and a smaller size leaves the view where it is.
let fitBox = null, refitTimer = null;
function drawingSize() { const b = sketch.allBox(); return Number.isFinite(b[0]) ? [b[2] - b[0], b[3] - b[1]] : null; }
function refitSoon() {
  clearTimeout(refitTimer);
  refitTimer = setTimeout(() => {
    const now = drawingSize();
    if (now && (!fitBox || now[0] > fitBox[0] + 1e-9 || now[1] > fitBox[1] + 1e-9)) sketch.fitView();
    fitBox = now;
  }, 400);
}
export function bindShapeForm() {
  if ($("fsDone")) $("fsDone").onclick = () => setShapeFs(false);
  if ($("fsSave")) $("fsSave").onclick = () => saveCurrent().catch((e) => toast(e.message, true));
  if ($("btnShapeFs")) $("btnShapeFs").onclick = () => setShapeFs(true);
  $("btnSavePartQuick").onclick = () => saveCurrent().catch((e) => toast(e.message, true));
  // step 1: Make a part
  if ($("bgShapes")) $("bgShapes").onclick = (e) => { const b = e.target.closest("[data-bshape]"); if (b) beginnerPick(b.dataset.bshape); };
  $("shapeForm").addEventListener("focusin", (e) => { if (e.target.matches("input")) { editBefore = sketch.snapshot(); fitBox = drawingSize(); } });
  $("shapeForm").addEventListener("input", (e) => {
    const i = e.target, v = evalExpr(i.value) ;
    if (i.value.trim() === "" || !Number.isFinite(v)) return;
    const it = sketch.selected(); if (!it) return;
    if (i.dataset.angle || i.dataset.cw || i.dataset.ch || i.dataset.hrel || i.dataset.pos) return;     // applied on change (typed position is never snapped)
    if (i.dataset.p) {
      if (it.lock) return;
      const k = i.dataset.p;
      const sizeKeys = ["w", "h", "d", "a", "b", "len", "wid", "s"];
      if (v < 0) return;
      if (sizeKeys.includes(k) && (v < 2 || v > (sketch.maxMm || 2600))) return;
      if (["n", "cols", "rows"].includes(k) && (v < 0 || v > 64)) return;
      if (v > (sketch.maxMm || 2600) * 4) return;
      it.p[k] = v;
      refreshHoleNote(i, it);
    }
    sketch.save(); sketch.draw(); useShapeSoon();
    if (i.dataset.p) refitSoon();
  });
  $("shapeForm").addEventListener("change", (e) => {
    if (e.target.id === "keepProp") { S.keepProp = e.target.checked; return; }
    if (e.target.dataset.cw || e.target.dataset.ch) {
      const it = sketch.selected();
      const W = evalExpr($("shapeForm").querySelector("[data-cw]").value), H = evalExpr($("shapeForm").querySelector("[data-ch]").value);
      const keep = !$("keepProp") || $("keepProp").checked;
      if (!it || !sketch.resizeCustomTo(it, W, H, keep, e.target.dataset.cw ? "w" : "h")) toast("That size isn't possible for this part (too small, too big, or locked).", true);
      editBefore = sketch.snapshot(); renderShapeForm(); useShapeSoon(); return;
    }
    if (e.target.dataset.hrel) {
      const v = evalExpr(e.target.value), it = sketch.selected();
      if (it && !it.lock && Number.isFinite(v)) sketch.setHoleOffset(e.target.dataset.hrel, v);
      editBefore = sketch.snapshot(); renderShapeForm(); useShapeSoon(); return;
    }
    if (e.target.dataset.pos) {
      const v = evalExpr(e.target.value);
      if (Number.isFinite(v)) {
        sketch.setPos(e.target.dataset.pos, v);
        toast("Applied " + (e.target.dataset.pos === "x" ? "X" : "Y") + " = " + v + " mm.");
      }
      editBefore = sketch.snapshot(); renderShapeForm(); useShapeSoon(); return;
    }
    if (e.target.dataset.angle) {
      const v = evalExpr(e.target.value);
      if (Number.isFinite(v)) {
        sketch.setAngle(v);
        toast("Rotated " + v + "° about the centre.");
      }
      editBefore = sketch.snapshot(); renderShapeForm(); useShapeSoon(); return;
    }
    if (e.target.dataset.psel) {
      const it = sketch.selected();
      if (it && !it.lock) {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) { it.p[e.target.dataset.p] = n; sketch.save(); sketch.draw(); useShapeSoon(); }
      }
      editBefore = sketch.snapshot(); renderShapeForm(); return;
    }
    if (e.target.id === "sfShowKerf") {
      sketch.opts = sketch.opts || {};
      sketch.opts.showKerf = !!e.target.checked;
      sketch.draw();
      return;
    }
    if (editBefore && editBefore !== sketch.snapshot()) { sketch.past.push(editBefore); sketch.future = []; }
    editBefore = sketch.snapshot(); renderShapeForm();
  });
  // r15 6.3: pressing Mark for drilling / Cut it instead mustn't blur the size field first (its change re-renders the form
  // and the click would land on a button that is gone)
  $("shapeForm").addEventListener("mousedown", (e) => { if (e.target.closest("[data-drill],[data-undrill]")) e.preventDefault(); });
  $("shapeForm").addEventListener("click", (e) => {
    const v = e.target.closest("[data-var]");
    if (v) {
      const it = sketch.selected(); if (!it) return;
      const spec = variantsFor(it.type).find((x) => variantKey(x) === v.dataset.var);
      if (spec) sketch.applyVariant(spec);
      return;
    }
    const bp = e.target.closest("[data-bpart]");
    if (bp) { sketch.pick([Number(bp.dataset.bpart)]); sketch.draw(); renderShapeForm(); return; }
    const p = e.target.closest("[data-pro]");
    if (p) { runPro(p.dataset.pro); return; }
    const dr = e.target.closest("[data-drill],[data-undrill]");
    if (dr) {                                    // r15 6.3: Mark for drilling / Cut it instead, one undo step
      const it = sketch.selected(); if (!it || it.lock) return;
      const k = dr.dataset.drill || dr.dataset.undrill, before = sketch.snapshot();
      const set = new Set(it.drill || []);
      if (dr.dataset.drill) set.add(k); else set.delete(k);
      if (set.size) it.drill = [...set]; else delete it.drill;
      if (editBefore && editBefore !== before) sketch.past.push(editBefore);     // the size typed just before is its own undo step
      sketch.past.push(before); sketch.future = [];
      it._key = undefined;
      sketch.save(); sketch.draw(); useShapeSoon(); editBefore = sketch.snapshot(); renderShapeForm();
      toast(dr.dataset.drill ? "Marked for drilling: each of these holes is an etched cross now, not cut. Drill them after cutting." : "These holes are cut again.");
      return;
    }
    const bs = e.target.closest("[data-bend-save]");
    if (bs) {
      const th = String(Number(bs.dataset.bendTh)), v = Number(bs.dataset.bendSave);
      try { savePrefs({ bendBD: { ...(getPrefs().bendBD || {}), [th]: v } }); } catch (err) { /* ignore */ }
      toast(`Saved: ${v} mm per bend for ${th} mm sheet. Folded parts on ${th} mm use it (type 0 in a part to work it out instead).`);
      renderShapeForm();
      return;
    }
    const tb = e.target.closest("[data-sheet-table]");
    if (tb) {
      const it = sketch.selected();
      const sh = it && shapeDef(it.type);
      if (sh && sh.table) {
        const html = tableToHtml(sh.table(it.p));
        if (!openSheetTable(html)) toast("Allow pop-ups to print the true-length table.", true);
      }
      return;
    }
    const b = e.target.closest("[data-sk]"); if (!b) return;
    const a = b.dataset.arg; sketch[b.dataset.sk](a === undefined ? undefined : isNaN(Number(a)) ? a : Number(a));
  });
}

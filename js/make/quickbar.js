// The Pro quick bar: search palette and its actions.
import { screen } from "../ui/flow.js";
import { variantsFor } from "./variants.js";
import { shapeDef } from "./sketch.js";
import { S, sketch } from "../core/state.js";
import { $, esc, toast } from "../core/dom.js";
import { isProMode } from "../ui/mode.js";
import { matchesQuery, openLibrary, openMakeTool, openVersions } from "./library.js";
import { openResize } from "./files.js";
import { openCad, runPro } from "./cad.js";
import { setShapeFs } from "./protools.js";
import { openDimEdit } from "./dimedit.js";
import { savePrefs } from "../core/prefs.js";
import { mountScrollRow, refreshScrollRows } from "../ui/scrollrow.js";
import { openPresetBrowser } from "./presetbrowser.js";
import { clickVerb } from "../ui/laptop.js";
import { getToolIds, toolInfo, openToolbarCustom, TOOL_GROUPS } from "./toolbarcustom.js";

function sizeDimForSelection() {
  const it = sketch.selected(); if (!it) return null;
  sketch.draw();
  return sketch.dimHits.find((h) => h.kind === "w") || sketch.dimHits.find((h) => h.kind === "d") || null;
}
let paletteQ = "";
// Undo, Redo, Fit and Delete sit in the Make a part header, not over the canvas.
// In the full-screen editor the same four move to the tool bar under the picture.
function paintPinnedTools(B, wrap, qb) {
  let pin = $("qbPinned");
  if (!pin) {
    pin = document.createElement("div");
    pin.id = "qbPinned";
    pin.className = "qb-pinned";
    pin.setAttribute("role", "group");
    pin.setAttribute("aria-label", "Edit the drawing");
  }
  const show = screen() === "make" || S.shapeFs;
  pin.hidden = !show;
  pin.classList.toggle("hidden", !show);
  const bar = $("makeBar");
  if (show && S.shapeFs && wrap) {
    if (pin.parentElement !== wrap) wrap.insertBefore(pin, qb || wrap.firstChild);
  } else if (bar) {
    const slot = $("btnSimpleSnap") || $("btnDragPan") || $("btnMakeCheckCut") || $("btnViewParts") || $("editorSwitch");
    if (pin.parentElement !== bar) bar.insertBefore(pin, slot || null);
  }
  if (!show) { pin.innerHTML = ""; return; }
  pin.innerHTML = B("undo", "↶", "Undo") + B("redo", "↷", "Redo") + B("fit", "⤢", "Fit") + B("del", "🗑", "Delete");
  pin.querySelectorAll("[data-qb]").forEach((btn) => {
    btn.onclick = () => { if (Date.now() < (S.uiBlockUntil || 0)) return; if (btn.getAttribute("aria-disabled") !== "true") quickAction(btn.dataset.qb); };
  });
}

export function renderQuickBar() {
  const qb = $("quickBar"); if (!qb || !sketch) return;
  const on = screen() === "make" && S.src === "shape" && ((S.cur === 1 && isProMode()) || S.shapeFs);
  qb.classList.toggle("hidden", !on);
  const wrap = document.getElementById("quickBarWrap") || qb.closest(".scrollrow-wrap");
  if (wrap) wrap.classList.toggle("hidden", !on);
  const grid = qb.closest(".cutgrid"); if (grid) grid.classList.toggle("with-qb", on);
  const one = sketch.selected(), any = sketch.picked().length > 0, many = sketch.picked().length > 1;
  const locked = sketch.picked().some((i) => i.lock);
  const hasVer = !!(one && variantsFor(one.type).length);
  const dis = {
    undo: !sketch.past.length, redo: !sketch.future.length,
    dup: !any, del: !any || locked, rot: !any || locked, mir: !any || locked,
    size: !one || locked, resize: !one || locked, ver: !hasVer || locked, join: !many || locked, subtract: !many || locked,
    offset: !one || locked, linarray: !one || locked, polar: !one || locked,
    alignl: !many, alignb: !many, edge: !(one && one.type === "custom"),
  };
  const onCls = { snap: !!sketch.opts.snap, draw: sketch.tool === "draw", measure: sketch.tool === "measure", rect: sketch.tool === "rect", disc: sketch.tool === "disc", fs: S.shapeFs, size: !!one };
  // UX2 fix: a greyed tool says why (tooltip + screen reader label)
  const whyOff = (id) => {
    if (id === "undo") return "nothing to undo"; if (id === "redo") return "nothing to redo";
    if (locked && !["undo", "redo"].includes(id) && any) return "the selected shape is locked";
    if (id === "join" || id === "subtract" || id === "alignl" || id === "alignb") return "select two or more shapes first";
    if (id === "edge") return "select a drawn or joined outline first (Draw outline, then tap it)";
    if (id === "ver") return "this shape has no versions";
    if (["size", "resize", "offset", "linarray", "polar"].includes(id)) return "select one shape first";
    return "select a shape first";
  };
  const HINTS = { rot: "", mir: "", undo: "Ctrl+Z", redo: "Ctrl+Y", del: "Del", dup: "Ctrl+D", fit: "F", fs: "Esc", join: "Ctrl+J", snap: "S", rect: "R", disc: "C", draw: "L", measure: "D", select: "M", presets: "" };
  const B = (id, icon, label) => {
    const hint = (sketch.opts.pro && HINTS[id]) ? HINTS[id] : "";
    const title = hint ? `${label} (${hint})` : label;
    const kbd = hint ? ` <kbd>${esc(hint)}</kbd>` : "";
    const why = dis[id] ? ` – ${whyOff(id)}` : "";
    return `<button type="button" data-qb="${id}" class="${onCls[id] ? "on" : ""}${id === "del" ? " danger" : ""}" ${dis[id] ? 'aria-disabled="true"' : ""} data-why="${esc(dis[id] ? whyOff(id) : "")}" data-label="${esc(label)}" title="${esc(title + why)}" aria-label="${esc(title + why)}"><i>${icon}</i><span>${esc(label)}${kbd}</span></button>`;
  };
  paintPinnedTools(B, wrap, qb);
  if (!on) { qb.innerHTML = ""; refreshScrollRows(); return; }
  const q = paletteQ;
  const parts = [`<div class="qb-search"><button type="button" id="qbSearchBtn" class="qb-search-btn" aria-label="Search tools" title="Search tools">🔍</button><input id="qbSearch" type="search" placeholder="Search" aria-label="Search tools" value="${esc(q)}" autocomplete="off"></div>`];
  const chosen = getToolIds();
  const chosenSet = new Set(chosen);
  const grouped = [];
  for (const grp of TOOL_GROUPS) {
    const items = grp.items.filter(([id, , lab]) => chosenSet.has(id) && (!q || matchesQuery(lab + " " + id + " " + grp.g, q)));
    if (items.length) grouped.push({ g: grp.g, items });
  }
  // Keep the user's order, and put a group heading wherever the group changes.
  if (!q) {
    const infoOf = (id) => toolInfo(id) || { icon: "", label: id, group: "Tools" };
    let lastG = null;
    for (const id of chosen) {
      const n = infoOf(id);
      const g = n.group || "Tools";
      if (g !== lastG) {
        parts.push(`<div class="qb-group" role="heading" aria-level="3">${esc(g)}</div>`);
        lastG = g;
      }
      parts.push(B(id, n.icon, n.label));
    }
  } else {
    for (const grp of grouped) {
      parts.push(`<div class="qb-group" role="heading" aria-level="3">${esc(grp.g)}</div>`);
      parts.push(...grp.items.map(([id, ic, lab]) => B(id, ic, lab)));
    }
  }
  if (parts.length === 1) parts.push(`<p class="muted small">No tool matches “${esc(q)}”.</p>`);
  parts.push(B("customise", "⚙", "Customise toolbar"));
  const hadFocus = document.activeElement && document.activeElement.id === "qbSearch";
  qb.innerHTML = parts.join("");
  if (hadFocus) { const s = $("qbSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  mountScrollRow(qb);
  refreshScrollRows();
  syncQbRoving();
}
function qbToolButtons() {
  const wrap = document.getElementById("quickBarWrap") || ($("quickBar") && $("quickBar").closest(".scrollrow-wrap"));
  if (!wrap) return [];
  return [...wrap.querySelectorAll("button[data-qb], #qbSearchBtn")];
}
function syncQbRoving() {
  const btns = qbToolButtons();
  if (!btns.length) return;
  const focused = btns.indexOf(document.activeElement);
  const cur = focused >= 0 ? focused : 0;
  btns.forEach((b, i) => { b.tabIndex = i === cur ? 0 : -1; });
}
function bindQbRoving() {
  const wrap = document.getElementById("quickBarWrap") || ($("quickBar") && $("quickBar").closest(".scrollrow-wrap"));
  if (!wrap || wrap.dataset.roving === "1") return;
  wrap.dataset.roving = "1";
  wrap.addEventListener("keydown", (e) => {
    if (e.target && e.target.id === "qbSearch") return;
    const btns = qbToolButtons();
    if (!btns.length) return;
    const i = Math.max(0, btns.indexOf(document.activeElement));
    let n = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % btns.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + btns.length) % btns.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = btns.length - 1;
    else return;
    e.preventDefault();
    btns.forEach((b, k) => { b.tabIndex = k === n ? 0 : -1; });
    btns[n].focus();
  });
}

export function quickAction(a) {
  switch (a) {
    case "presets": openPresetBrowser(); break;
    case "customise": openToolbarCustom(); break;
    case "rect": case "disc": case "triangle": case "slot": case "sector": case "hole": case "slothole": case "boltcircle":
      if (shapeDef(a)) sketch.add(a); else toast("That shape isn't available.", true); break;
    case "lib": openLibrary(); break;
    case "text": case "trace": openMakeTool(a); break;
    case "undo": sketch.undo(); break;
    case "redo": sketch.redo(); break;
    case "dup": sketch.duplicate(); break;
    case "del": sketch.remove(); break;
    case "rot": sketch.rotateBy(90); break;
    case "mir": sketch.mirror(); break;
    case "size": { const d = sizeDimForSelection(); if (d) openDimEdit(d); else toast(clickVerb() + " one shape first."); break; }
    case "resize": openResize(); break;
    case "ver": openVersions(); break;
    case "fit": sketch.fitView(); break;
    case "snap": sketch.opts.snap = sketch.opts.snap ? 0 : 1; try { sketch.saveOpts && sketch.saveOpts(); } catch (e) { /* ignore */ } try { savePrefs({ snap: !!sketch.opts.snap }); const ys = document.getElementById("yoursSnap"); if (ys) ys.checked = !!sketch.opts.snap; } catch (e) { /* ignore */ } sketch.draw(); toast(sketch.opts.snap ? "Snap on (1 mm)" : "Snap off"); break;
    case "draw": case "measure": case "nest": case "offset": case "linarray": case "polar": case "subtract":
      runPro(a); break;
    case "join": sketch.join(); break;
    case "alignl": sketch.align("left"); break;
    case "alignb": sketch.align("bottom"); break;
    case "edge": { const ep = $("edgePanel"); if (ep) { ep.classList.remove("hidden"); ep.hidden = false; ep.scrollIntoView({ block: "nearest" }); } toast(clickVerb() + " an edge on the outline, then change its length, angle or curve."); break; }
    case "fs": setShapeFs(false); toast("The full-screen editor was removed. The tools stay in this header."); break;
    case "dims": { const d = sizeDimForSelection(); if (d) openDimEdit(d); else toast(clickVerb() + " a blue size on the drawing, then type the new number."); break; }
    case "fillet":
      openCad("Fillet a corner", [{ id: "r", label: "Radius (mm)", value: 5 }], (v) => {
        if (!(v.r > 0)) { toast("Enter a radius.", true); return; }
        if (sketch.edgeInfo && sketch.edgeInfo()) { sketch.setEdgeCurve({ radius: v.r }); toast("Corner filleted."); }
        else toast(clickVerb() + " an edge on a custom outline first (Draw outline, then Edit edge), then Fillet.");
      });
      break;
    case "chamfer":
      openCad("Chamfer / flatten an edge", [{ id: "none", label: clickVerb() + " an edge first. This makes that edge straight. Use a chamfered rectangle from the library for a ready-made chamfer.", value: "", text: true }], () => {
        if (sketch.edgeInfo && sketch.edgeInfo()) { sketch.setEdgeCurve({}); toast("Edge flattened. Adjust the corners by dragging."); }
        else toast(clickVerb() + " an edge first, or add a Chamfer rectangle from All shapes.");
      });
      break;
  }
  renderQuickBar();
}
export function bindQuickBar() {
  if ($("qbSearch") || $("quickBar")) {
    $("quickBar").addEventListener("input", (e) => {
      if (e.target && e.target.id === "qbSearch") { paletteQ = e.target.value; renderQuickBar(); }
    });
    $("quickBar").addEventListener("click", (e) => {
      const s = e.target.closest && e.target.closest("#qbSearchBtn");
      if (!s) return;
      e.preventDefault();
      const wrap = $("quickBarWrap") || $("quickBar").closest(".scrollrow-wrap");
      if (wrap) wrap.classList.toggle("search-open");
      const inp = $("qbSearch"); if (inp && wrap && wrap.classList.contains("search-open")) inp.focus();
    });
  }
  $("quickBar").addEventListener("click", (e) => { if (Date.now() < (S.uiBlockUntil || 0)) return; const b = e.target.closest("[data-qb]"); if (b && !b.disabled && b.getAttribute("aria-disabled") !== "true") quickAction(b.dataset.qb); });
  bindQbRoving();
}

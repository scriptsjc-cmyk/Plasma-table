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
import { setInspectorTab } from "./inspector.js";
import { getToolIds, toolInfo, openToolbarCustom, TOOL_GROUPS } from "./toolbarcustom.js";

function sizeDimForSelection() {
  const it = sketch.selected(); if (!it) return null;
  sketch.draw();
  return sketch.dimHits.find((h) => h.kind === "w") || sketch.dimHits.find((h) => h.kind === "d") || null;
}
let paletteQ = "";
let moreOpen = false;
// Most-used tools stay on the rail; the rest live under More (C46).
const TOOL_SYNONYMS = {
  etch: "score mark scribe etch line",
  presets: "flange pipe elbow preset tabs parts library",
  draw: "line outline polyline",
  arc3: "3-point arc three point arc",
  arctan: "tangent arc",
  spline: "curve spline path",
  sliver: "merge slivers sliver gaps",          // r15 4.22: the old names still find the tools
  drivedim: "hole distance dimension drive",
};
const RAIL_GROUP = {
  presets: "Draw", rect: "Draw", disc: "Draw", draw: "Draw", arc3: "Draw", arctan: "Draw", spline: "Draw", etch: "Draw", measure: "Draw", snap: "Draw",
  join: "Edit", subtract: "Edit", offset: "Edit", fillet: "Edit", trim: "Edit",
};
export const PRIMARY_TOOL_IDS = ["undo", "redo", "snap", "presets", "rect", "disc", "draw", "arc3", "arctan", "spline", "etch", "measure", "join", "subtract", "offset", "fillet", "trim", "fit", "dup", "del"];

// r15 4.18: 3-point arc, Tangent arc and Spline look alike, so the rail has one "Arc ▾" button that opens them
const ARC_TOOLS = ["arc3", "arctan", "spline"];
let arcOpen = false;
function arcPopEl() {
  let pop = document.getElementById("qbArcPop");
  if (!pop) {
    pop = document.createElement("div"); pop.id = "qbArcPop"; pop.className = "qb-arcpop hidden"; pop.setAttribute("role", "menu"); pop.setAttribute("aria-label", "Arcs and curves");
    document.body.appendChild(pop);
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("[data-qb]"); if (!b) return;
      e.stopPropagation();
      toggleArc(false);
      if (!b.disabled && b.getAttribute("aria-disabled") !== "true") quickAction(b.dataset.qb);
    });
    document.addEventListener("click", (e) => { if (!arcOpen) return; const btn = document.querySelector('#quickBar [data-qb="arcmenu"]'); if (pop.contains(e.target) || (btn && btn.contains(e.target))) return; toggleArc(false); });
    document.addEventListener("keydown", (e) => { if (arcOpen && e.key === "Escape") toggleArc(false); });
  }
  return pop;
}
export function toggleArc(force) {
  arcOpen = force == null ? !arcOpen : !!force;
  const pop = arcPopEl(), btn = document.querySelector('#quickBar [data-qb="arcmenu"]');
  pop.classList.toggle("hidden", !arcOpen);
  if (btn) { btn.setAttribute("aria-expanded", arcOpen ? "true" : "false"); btn.classList.toggle("open", arcOpen); }
  if (arcOpen && btn) {
    const r = btn.getBoundingClientRect();
    Object.assign(pop.style, { position: "fixed", left: Math.round(r.right + 6) + "px", top: Math.round(r.top) + "px" });
    const pr = pop.getBoundingClientRect();
    if (pr.bottom > innerHeight - 8) pop.style.top = Math.max(8, Math.round(innerHeight - 8 - pr.height)) + "px";
  }
  return arcOpen;
}

export function moreToolsOpen() { return moreOpen; }
export function toggleMore(force) {
  moreOpen = force == null ? !moreOpen : !!force;
  const pop = document.getElementById("qbMorePop");
  const btn = document.querySelector('#quickBar [data-qb="more"]');
  if (pop) {
    pop.classList.toggle("is-open", moreOpen);
    pop.classList.toggle("hidden", !moreOpen);
    pop.setAttribute("aria-hidden", moreOpen ? "false" : "true");
  }
  if (btn) {
    btn.classList.toggle("on", moreOpen);
    btn.setAttribute("aria-expanded", moreOpen ? "true" : "false");
  }
  document.body.classList.toggle("qb-more-open", moreOpen);
  if (!moreOpen) document.body.classList.remove("qb-searching");
  if (moreOpen) placeMorePop();
  return moreOpen;
}

// r15 (7.2 / 3.3): on a laptop "⋯ More" opens beside the rail, from the top of the drawing down, fitted to the window: the
// tools flow into as many columns as it takes, so every one is in view with no scrolling (it used to open upwards off
// the top of the screen as one long scrolling list).
const MORE_COL_W = 176;
export function placeMorePop() {
  const pop = document.getElementById("qbMorePop"), list = pop && pop.querySelector(".qb-more-list");
  const rail = document.getElementById("quickBarWrap") || $("quickBar");
  if (!pop || !list || !rail || pop.classList.contains("hidden")) return;
  const laptop = matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)").matches && !document.body.classList.contains("phone-ui");
  const clear = () => { for (const k of ["position", "left", "top", "bottom", "width", "maxHeight", "overflow"]) pop.style[k] = ""; list.style.columnCount = ""; list.classList.remove("is-tight"); };
  if (!laptop) { clear(); return; }
  const rr = rail.getBoundingClientRect(), pane = rail.closest(".cutgrid") || rail.parentElement;
  const pr = pane ? pane.getBoundingClientRect() : rr;
  const top = Math.max(8, Math.round(pr.top)), left = Math.round(rr.right + 6);
  const availH = Math.max(160, Math.min(window.innerHeight, pr.bottom || window.innerHeight) - top - 8);
  // keep it over the drawing if the tools fit there, so the inspector beside it stays usable; else use the window
  const pv = document.querySelector('[data-screen="make"] .previewPane'), pvr = pv && pv.getBoundingClientRect();
  const fitIn = (maxCols) => {
    for (let cols = 1; cols <= maxCols; cols++) {
      list.style.columnCount = String(cols);
      pop.style.width = (cols * MORE_COL_W + (cols - 1) * 8 + 18) + "px";
      if (pop.scrollHeight <= pop.clientHeight + 1) return true;
    }
    return false;
  };
  const colsIn = (right) => Math.max(1, Math.floor((Math.max(MORE_COL_W, right - left - 8) + 8) / (MORE_COL_W + 8)));
  Object.assign(pop.style, { position: "fixed", left: left + "px", top: top + "px", bottom: "auto", maxHeight: availH + "px", overflow: "hidden" });
  list.classList.remove("is-tight");
  if (pvr && pvr.width > MORE_COL_W) {
    if (fitIn(colsIn(pvr.right))) return;
    list.classList.add("is-tight");   // groups may continue in the next column: packs tighter
    if (fitIn(colsIn(pvr.right))) return;
    list.classList.remove("is-tight");
  }
  if (fitIn(colsIn(window.innerWidth))) return;
  pop.style.overflow = "auto";   // a window too small for every tool even in columns: let it scroll rather than cut tools off
}
if (typeof window !== "undefined") window.addEventListener("resize", () => { if (moreOpen) placeMorePop(); });
export function focusToolSearch() {
  moreOpen = true;
  document.body.classList.add("qb-searching", "qb-more-open");
  try { renderQuickBar(); } catch (e) { /* not ready */ }
  const s = document.getElementById("qbSearch") || document.getElementById("qbMoreSearch");
  if (s) { s.focus(); if (s.select) s.select(); }
  toggleMore(true);
}

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
  function put(parent, el, before) {
    if (!parent || !el) return;
    const ref = (before && before.parentNode === parent) ? before : null;
    if (el.parentNode === parent && el.nextElementSibling === ref) return;
    try { parent.insertBefore(el, ref); } catch (e) { parent.appendChild(el); }
  }
  if (show && S.shapeFs && wrap) {
    put(wrap, pin, qb || wrap.firstChild);
  } else if (bar) {
    const slot = $("btnSimpleSnap") || $("btnDragPan") || $("btnMakeCheckCut") || $("btnViewParts") || $("editorSwitch");
    put(bar, pin, slot);
  }
  if (!show) { pin.innerHTML = ""; pin._qbHtml = ""; return; }
  const html = B("undo", "↶", "Undo") + B("redo", "↷", "Redo") + B("fit", "⤢", "Fit") + B("del", "🗑", "Delete");
  if (pin._qbHtml === html) return;   // r15 Round 8: unchanged, so keep the same buttons (see renderQuickBar)
  pin.innerHTML = html; pin._qbHtml = html;
  pin.querySelectorAll("[data-qb]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.qb;
      if (Date.now() < (S.uiBlockUntil || 0) && id !== "undo" && id !== "redo") return;
      if (btn.getAttribute("aria-disabled") !== "true") quickAction(id);
    };
  });
}

export function renderQuickBar() {
  const qb = $("quickBar"); if (!qb || !sketch) return;
  if (screen() !== "make" && !S.shapeFs) { paletteQ = ""; if (moreOpen) toggleMore(false); }
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
    size: !one || locked, resize: !one || locked || !(one && sketch.canResize(one)), ver: !hasVer || locked, join: !many || locked, subtract: !many || locked,
    offset: !one || locked, linarray: !one || locked, polar: !one || locked,
    alignl: !many, alignr: !many, alignt: !many, alignb: !many, aligncx: !many, aligncy: !many, alignc: !many,
    distx: !many, disty: !many, mirv: !any || locked,
    edge: !(one && one.type === "custom"),
  };
  const onCls = { snap: !!sketch.opts.snap, draw: sketch.tool === "draw", measure: sketch.tool === "measure", rect: sketch.tool === "rect", disc: sketch.tool === "disc", size: !!one, trim: sketch.tool === "trim", arc3: sketch.tool === "arc3", arctan: sketch.tool === "arctan", spline: sketch.tool === "spline", maketan: sketch.tool === "maketan", makeconc: sketch.tool === "makeconc" };
  // UX2 fix: a greyed tool says why (tooltip + screen reader label)
  const whyOff = (id) => {
    if (id === "undo") return "nothing to undo"; if (id === "redo") return "nothing to redo";
    if (locked && !["undo", "redo"].includes(id) && any) return "the selected shape is locked";
    if (id === "join" || id === "subtract" || id === "alignl" || id === "alignr" || id === "alignt" || id === "alignb" || id === "aligncx" || id === "aligncy" || id === "alignc" || id === "distx" || id === "disty") return "Shift-click or Ctrl-click to pick two or more shapes first";
    if (id === "edge") return "select a drawn or joined outline first (Draw outline, then tap it)";
    if (id === "ver") return "this shape has no versions";
    if (id === "resize" && one && one.lock) return "this part is locked";
    if (id === "resize" && one && (one.rot || 0) % 90 !== 0) return "this part is not axis-aligned (turn it to a 0° or 90° angle first)";
    if (id === "resize" && one && !sketch.canResize(one)) return "this part can't be resized here";
    if (["size", "resize", "offset", "linarray", "polar"].includes(id)) return "select one shape first";
    return "select a shape first";
  };
  const HINTS = { rot: "", mir: "H", mirv: "V", undo: "Ctrl+Z", redo: "Ctrl+Y", del: "Del", dup: "Ctrl+D", fit: "F", join: "Ctrl+J", snap: "S", rect: "R", disc: "C", draw: "L", measure: "D", select: "M", presets: "" };
  const B = (id, icon, label) => {
    const hint = (sketch.opts.pro && HINTS[id]) ? HINTS[id] : "";
    const long = id === "subtract"
      ? "Cut out — Shift-click or Ctrl-click to pick more. Later-picked shapes are cut from the first-picked part"
      : id === "join" ? "Join into one part — Shift-click or Ctrl-click to pick the shapes, then Join"
      : id === "rot" ? "Turns 90° about the bottom-left corner"
      : label;
    const title = hint ? `${long} (${hint})` : long;
    const kbd = hint ? ` <kbd>${esc(hint)}</kbd>` : "";
    const why = dis[id] ? ` – ${whyOff(id)}` : "";
    return `<button type="button" data-qb="${id}" class="${onCls[id] ? "on" : ""}${id === "del" && !dis[id] ? " danger" : ""}" ${dis[id] ? 'aria-disabled="true"' : ""} data-why="${esc(dis[id] ? whyOff(id) : "")}" data-label="${esc(label)}" title="${esc(title + why)}" aria-label="${esc(title + why)}"><i>${icon}</i><span>${esc(label)}${kbd}</span></button>`;
  };
  paintPinnedTools(B, wrap, qb);
  if (!on) { qb.innerHTML = ""; qb._qbHtml = ""; if (arcOpen) toggleArc(false); refreshScrollRows(); return; }
  const q = paletteQ;
  const searchHtml = `<div class="qb-search"><button type="button" id="qbSearchBtn" class="qb-search-btn" aria-label="Search tools" title="Search tools (Ctrl+K or /)">🔍</button><input id="qbSearch" type="search" placeholder="Search tools" aria-label="Search tools" value="${esc(q)}" autocomplete="off"></div>`;
  const parts = [searchHtml];
  const chosen = getToolIds();
  const grouped = [];
  for (const grp of TOOL_GROUPS) {
    const items = grp.items.filter(([id, , lab]) => !q || matchesQuery(lab + " " + id + " " + grp.g + " " + (TOOL_SYNONYMS[id] || ""), q));   // r15: search finds every tool
    if (items.length) grouped.push({ g: grp.g, items });
  }
  const infoOf = (id) => toolInfo(id) || { icon: "", label: id, group: "Tools" };
  const addId = (id) => { const n = infoOf(id); parts.push(B(id, n.icon, n.label)); };
  if (q) {
    parts.push(`<button type="button" id="qbFilterChip" class="qb-filter-chip" title="Clear the tool filter" aria-label="Clear filter">Showing: ${esc(q)} ×</button>`);
    for (const grp of grouped) {
      parts.push(`<div class="qb-group" role="heading" aria-level="3">${esc(grp.g)}</div>`);
      parts.push(...grp.items.map(([id, ic, lab]) => B(id, ic, lab)));
    }
    if (parts.length === 1) parts.push(`<p class="muted small">No tool matches “${esc(q)}”.</p>`);
    parts.push(B("customise", "⚙", "Customise toolbar"));
  } else {
    const primary = chosen.filter((id) => PRIMARY_TOOL_IDS.includes(id));
    // r15 (3.3): More lists every tool that is not on the rail (Ungroup, Align right, Distribute, Hole distance… were
    // in no place you could click unless you customised the toolbar first)
    const arcs = primary.filter((id) => ARC_TOOLS.includes(id));
    const grouped = arcs.length >= 2;                     // r15 4.18: two or more of them -> one Arc ▾ button
    // r15 4.20: where the header has its Snap ▾ menu, Snap is set there only (not a rail button too); it stays in ⋯ More and the search
    const sm = document.getElementById("btnSnapMenu"), headerSnap = !!(sm && sm.getClientRects().length);
    // the arcs are reached from the rail's Arc ▾, so ⋯ More doesn't list them again (it must still fit over the drawing)
    const onRail = new Set(primary.filter((id) => !(headerSnap && id === "snap")));
    // Draw · Edit · Arrange, split by thin dividers (r13 #11)
    let lastRail = null, arcDone = false;
    for (const id of primary) {
      if (headerSnap && id === "snap") continue;
      if (grouped && arcs.includes(id)) {
        if (arcDone) continue;
        arcDone = true;
        const live = arcs.find((a) => sketch.tool === a);
        if (lastRail && lastRail !== "Draw") parts.push(`<span class="qb-div" role="separator" aria-hidden="true"></span>`);
        lastRail = "Draw";
        const ic = (toolInfo(live || arcs[0]) || {}).icon || "⌓";
        parts.push(`<button type="button" data-qb="arcmenu" class="qb-arc-btn${live ? " on" : ""}" aria-haspopup="menu" aria-expanded="${arcOpen ? "true" : "false"}" aria-controls="qbArcPop" title="Arcs and curves: ${esc(arcs.map((a) => infoOf(a).label).join(", "))}" aria-label="Arcs and curves"><i>${ic}<small aria-hidden="true">▾</small></i><span>Arc ▾</span></button>`);
        continue;
      }
      const g = RAIL_GROUP[id] || "Arrange";
      if (lastRail && g !== lastRail) parts.push(`<span class="qb-div" role="separator" aria-hidden="true"></span>`);
      lastRail = g;
      addId(id);
    }
    arcPopEl().innerHTML = grouped ? arcs.map((a) => { const n = infoOf(a); return B(a, n.icon, n.label); }).join("") : "";
    if (!grouped && arcOpen) toggleArc(false);
    parts.push(`<button type="button" data-qb="more" class="qb-more-btn${moreOpen ? " on" : ""}" aria-expanded="${moreOpen ? "true" : "false"}" aria-controls="qbMorePop" title="More tools" aria-label="More tools"><i>⋯</i><span>More</span></button>`);
    // one block per tool group, so a short group never splits across the panel's columns (a long one may)
    const extra = [];
    for (const grp of TOOL_GROUPS) {
      const ids = grp.items.map((it) => it[0]).filter((id) => !onRail.has(id));
      if (!ids.length) continue;
      extra.push(`<div class="qb-more-grp${ids.length > 8 ? " is-long" : ""}"><div class="qb-group" role="heading" aria-level="3">${esc(grp.g)}</div>${ids.map((id) => { const n = infoOf(id); return B(id, n.icon, n.label); }).join("")}</div>`);
    }
    extra.push(B("customise", "⚙", "Customise toolbar"));
    parts.push(`<div id="qbMorePop" class="qb-more${moreOpen ? " is-open" : " hidden"}" role="menu" aria-hidden="${moreOpen ? "false" : "true"}">${searchHtml.replace('id="qbSearch"', 'id="qbMoreSearch"').replace('id="qbSearchBtn"', 'id="qbMoreSearchBtn"')}<div class="qb-more-list">${extra.join("")}</div></div>`);
  }
  const hadFocus = document.activeElement && (document.activeElement.id === "qbSearch" || document.activeElement.id === "qbMoreSearch");
  const focusId = hadFocus ? document.activeElement.id : "";
  // r15 Round 8: refresh() runs on every machine status report (about 10 a second when connected). Rebuild the bar only when
  // its markup changes, so a press and its release land on the same button (and hover / keyboard focus stay put).
  const html = parts.join("");
  if (qb._qbHtml !== html) {
    qb.innerHTML = html;
    qb._qbHtml = html;
    const chip = qb.querySelector("#qbFilterChip");
    if (chip) chip.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); paletteQ = ""; moreOpen = true; renderQuickBar(); });
    if (hadFocus) {
      const s = $(focusId) || $("qbSearch") || $("qbMoreSearch");
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }
  }
  mountScrollRow(qb);
  refreshScrollRows();
  syncQbRoving();
  if (moreOpen) placeMorePop();
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

let lastRD = null;
export function quickAction(a) {
  switch (a) {
    case "presets": openPresetBrowser(); break;
    case "more": toggleMore(); return;
    case "arcmenu": toggleArc(); return;
    case "customise": openToolbarCustom(); toggleMore(false); break;
    // r15 3.6: the Rectangle / Circle buttons draw, like the R / C keys (click-click or drag); a double-click drops a standard one
    case "rect": case "disc": {
      // the bar re-renders on the first click, so a double-click is two clicks on the same button within 450 ms
      const now = Date.now(), dbl = lastRD && lastRD.a === a && now - lastRD.t < 450;
      lastRD = dbl ? null : { a, t: now };
      if (dbl) { sketch.setTool(null); sketch.add(a); break; }
      if (sketch.tool === a) sketch.setTool(null);
      else {
        sketch.setTool(a);
        toast(a === "rect" ? "Click two corners, or drag. Type the width and height if you like. Double-click the button for a standard one."
          : "Click the centre, then the edge, or drag. Type the diameter if you like. Double-click the button for a standard one.");
      }
      if (sketch.onSelect) sketch.onSelect();
      break;
    }
    case "triangle": case "slot": case "sector": case "hole": case "slothole": case "boltcircle":
      if (shapeDef(a)) sketch.add(a); else toast("That shape isn't available.", true); break;
    case "lib": openLibrary(); break;
    case "text": case "trace": openMakeTool(a); break;
    case "etch": {
      const list = sketch.picked().filter((i) => sketch.canMutate(i));
      if (list.length) {
        sketch.remember();
        for (const it of list) it.op = "score";
        sketch.commit(); sketch.draw(); sketch.onSelect && sketch.onSelect();
        toast(list.length === 1 ? "Set to Etch / mark: it will be etched first, not cut through." : list.length + " parts set to Etch / mark: they will be etched first, not cut through.");
      } else {
        sketch.setTool("draw");
        sketch.drawEtch = true;
        toast("Draw the etch line, then Etch line (or Enter) when it has two or more points. It will be marked, not cut through.");
      }
      break;
    }
    case "undo": sketch.undo(); break;
    case "redo": sketch.redo(); break;
    case "dup": sketch.duplicate(); break;
    case "del": sketch.remove(); break;
    case "rot": sketch.rotateBy(90); break;
    case "mir": sketch.mirror(); break;
    case "mirv": sketch.flipV(); break;
    case "size": { const d = sizeDimForSelection(); if (d) openDimEdit(d); else toast(clickVerb() + " one shape first."); break; }
    case "resize": openResize(); break;
    case "ver": openVersions(); break;
    case "fit": sketch.fitView(); break;
    case "snap": {
      const step = sketch.toggleSnap ? sketch.toggleSnap() : (sketch.opts.snap = sketch.opts.snap ? 0 : 1);
      try { savePrefs({ snap: !!step, snapStep: step || savePrefs && undefined }); } catch (e) { /* ignore */ }
      try { const ys = document.getElementById("yoursSnap"); if (ys) ys.checked = !!step; } catch (e) { /* ignore */ }
      try { import("./headertools.js").then((m) => m.paintMakeHeaderTools && m.paintMakeHeaderTools()).catch(() => {}); } catch (e) { /* ignore */ }
      sketch.draw();
      toast(step ? ("Snap on (" + step + " mm)") : "Snap off");
      break;
    }
    case "draw": case "measure": case "nest": case "offset": case "linarray": case "polar": case "subtract":
      runPro(a); break;
    case "trim": sketch.startTrimMode && sketch.startTrimMode("trim"); break;
    case "extend": sketch.startTrimMode && sketch.startTrimMode("extend"); break;
    case "break": sketch.startTrimMode && sketch.startTrimMode("break"); break;
    case "arc3": sketch.startArc3 && sketch.startArc3(); break;
    case "arctan": sketch.startTanArc && sketch.startTanArc(); break;
    case "spline": sketch.startSpline && sketch.startSpline(); break;
    case "curvepoints": {
      openCad("Curve through points", [
        { id: "list", type: "textarea", rows: 8, label: "Points — one x,y (or r,θ) per line, or a pasted CSV", value: "", text: true },
        { id: "mode", type: "select", label: "Numbers are", value: "xy", options: [{ v: "xy", l: "x, y (mm)" }, { v: "polar", l: "r, θ (mm and degrees)" }] },
        { id: "closed", type: "checkbox", label: "Close the curve" },
        { note: "A smooth curve is fitted to editable arcs, so you can still change it afterwards." },
      ], (v) => {
        if (!sketch.addPointsContour(v.list, v.mode, v.closed)) toast(sketch._lastMessage || "Could not build that curve.", true);
      });
      break;
    }
    case "group": sketch.group(); break;
    case "ungroup": sketch.ungroup(); break;
    case "rotpt": case "scalepct": case "drivedim": case "sliver": case "cutctl": case "flangestd":
      runPro(a); break;
    case "maketan": sketch.startMakeRel && sketch.startMakeRel("tangent"); break;
    case "makeconc": sketch.startMakeRel && sketch.startMakeRel("concentric"); break;
    case "join": sketch.join(); break;
    case "alignl": sketch.align("left"); break;
    case "alignr": sketch.align("right"); break;
    case "alignt": sketch.align("top"); break;
    case "alignb": sketch.align("bottom"); break;
    case "aligncx": sketch.align("centre"); break;
    case "aligncy": sketch.align("middle"); break;
    case "alignc": sketch.align("both"); break;
    case "distx": sketch.distribute("x"); break;
    case "disty": sketch.distribute("y"); break;
    case "edge": { const ep = $("edgePanel"); setInspectorTab("part"); if (ep) { ep.classList.remove("hidden"); ep.hidden = false; const pane = ep.closest("#srcShape"); if (!pane || getComputedStyle(pane).overflowY !== "hidden") ep.scrollIntoView({ block: "nearest" }); } toast(clickVerb() + " an edge on the outline, then change its length, angle or curve."); break; }
    case "dims": { const d = sizeDimForSelection(); if (d) openDimEdit(d); else toast(clickVerb() + " a blue size on the drawing, then type the new number."); break; }
    case "fillet": {
      const it = sketch.selected();
      if (!it) { toast(clickVerb() + " a part first, then Fillet."); break; }
      if (sketch.layout) { toast("Open the part to fillet its corners."); break; }
      const info = sketch.edgeInfo && sketch.edgeInfo();
      const hasCorner = !!(info && info.vi != null);
      const prev = sketch.filletPick || {};
      const kind0 = prev.mode === "relief" ? "relief" : "round";
      openCad("Fillet a corner", [
        { id: "r", label: kind0 === "relief" ? "Diameter (mm)" : "Radius (mm)", value: prev.radius || 5 },
        { id: "mode", type: "select", label: "Kind", value: kind0, options: [
          { v: "round", l: "Round corner" },
          { v: "relief", l: "Relief cut (circle into corner)" },
        ] },
        { id: "inside", label: "All inside corners", type: "checkbox", value: false },
        { note: hasCorner
          ? "Fillet applies to the corner you clicked. Tick All inside corners to do every inside corner at once. A relief cut is only for inside corners."
          : "Choose Round corner (smooth radius) or Relief cut (a circle into the inside corner so a square corner can sit in). Then press Fillet and click the corners, or tick All inside corners." },
      ], (v) => {
        if (!(v.r > 0)) { toast(v.mode === "relief" ? "Enter a diameter." : "Enter a radius.", true); return; }
        const relief = v.mode === "relief";
        if (v.inside) {
          const n = relief ? sketch.reliefInsideCorners(v.r) : sketch.filletInsideCorners(v.r);
          if (n > 0) toast(n === 1 ? (relief ? "Inside corner relieved." : "Inside corner rounded.") : n + (relief ? " inside corners relieved." : " inside corners rounded."));
        } else if (hasCorner && relief) {
          if (sketch.reliefCorner(v.r)) toast("Relief cut added.");
        } else if (hasCorner) {
          if (sketch.filletCorner(v.r)) toast("Corner filleted.");
        } else {
          sketch.startFilletPick(v.r, relief ? "relief" : "round");
          toast(relief
            ? "Click each inside corner to cut a circle into it. Outside corners cannot take a relief."
            : "Click each corner you want to round. Inside corners get a smooth inner radius.");
        }
      });
      // Switch the size label when the kind changes (radius vs diameter).
      const modeEl = document.getElementById("cad_mode"), sizeEl = document.getElementById("cad_r");
      const sizeLab = sizeEl && sizeEl.closest("label");
      const syncKind = () => {
        if (!modeEl || !sizeLab) return;
        const text = modeEl.value === "relief" ? "Diameter (mm)" : "Radius (mm)";
        if (sizeLab.childNodes[0] && sizeLab.childNodes[0].nodeType === 3) sizeLab.childNodes[0].textContent = text;
      };
      if (modeEl) modeEl.addEventListener("change", syncKind);
      break;
    }
    case "chamfer": {
      const it = sketch.selected();
      if (!it) { toast(clickVerb() + " a part first, then Chamfer."); break; }
      if (sketch.layout) { toast("Open the part to chamfer its corners."); break; }
      const info = sketch.edgeInfo && sketch.edgeInfo();
      const hasCorner = !!(info && info.vi != null);
      const prev = sketch.filletPick || {};
      openCad("Chamfer a corner", [
        { id: "d", label: "Distance (mm)", value: prev.mode === "chamfer" ? (prev.radius || 5) : 5 },
        { id: "ang", label: "Angle (degrees)", value: prev.angle || 45 },
        { id: "all", label: "All corners", type: "checkbox", value: false },
        { note: hasCorner
          ? "Chamfer applies to the corner you clicked. Tick All corners to chamfer every sharp corner. The default 45° trims both edges equally on a square corner."
          : "Type a distance and an angle (45° is a true 45° on a square corner), then press Chamfer and click the corners, or tick All corners." },
      ], (v) => {
        if (!(v.d > 0)) { toast("Enter a distance.", true); return; }
        const ang = v.ang > 0 ? v.ang : 45;
        if (v.all) {
          const n = sketch.chamferCorners(v.d, ang);
          if (n > 0) toast(n === 1 ? "Corner chamfered." : n + " corners chamfered.");
        } else if (hasCorner) {
          if (sketch.chamferCorner(v.d, ang)) toast("Corner chamfered.");
        } else {
          sketch.startFilletPick(v.d, "chamfer", ang);
          toast("Click each corner you want to chamfer.");
        }
      });
      break;
    }
  }
  renderQuickBar();
}
export function bindQuickBar() {
  if ($("qbSearch") || $("quickBar")) {
    $("quickBar").addEventListener("input", (e) => {
      if (e.target && (e.target.id === "qbSearch" || e.target.id === "qbMoreSearch")) {
        paletteQ = e.target.value;
        moreOpen = true;
        renderQuickBar();
      }
    });
    $("quickBar").addEventListener("click", (e) => {
      const s = e.target.closest && e.target.closest("#qbSearchBtn, #qbMoreSearchBtn");
      if (!s) return;
      e.preventDefault();
      const wrap = $("quickBarWrap") || $("quickBar").closest(".scrollrow-wrap");
      if (wrap) wrap.classList.toggle("search-open");
      const inp = $("qbSearch") || $("qbMoreSearch");
      if (inp) inp.focus();
    });
  }
  $("quickBar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-qb]");
    if (!b) return;
    const id = b.dataset.qb;
    if (id === "more" || id === "arcmenu") e.stopPropagation();
    if (Date.now() < (S.uiBlockUntil || 0) && id !== "undo" && id !== "redo") return;
    if (!b.disabled && b.getAttribute("aria-disabled") !== "true") quickAction(id);
    if (id !== "more") { paletteQ = ""; toggleMore(false); }
    if (id !== "arcmenu" && arcOpen) toggleArc(false);
  });
  document.addEventListener("click", (e) => {
    if (!moreOpen) return;
    const wrap = $("quickBarWrap") || $("quickBar");
    if (wrap && wrap.contains(e.target)) return;
    toggleMore(false);
  });
  bindQbRoving();
}

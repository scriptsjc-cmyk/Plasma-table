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
    btn.onclick = () => {
      const id = btn.dataset.qb;
      if (Date.now() < (S.uiBlockUntil || 0) && id !== "undo" && id !== "redo") return;
      if (btn.getAttribute("aria-disabled") !== "true") quickAction(id);
    };
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
    case "etch": {
      const list = sketch.picked().filter((i) => sketch.canMutate(i));
      if (list.length) {
        sketch.remember();
        for (const it of list) it.op = "score";
        sketch.commit(); sketch.draw(); sketch.onSelect && sketch.onSelect();
        toast(list.length === 1 ? "Set to Score: it will be etched first, not cut through." : list.length + " parts set to Score: they will be etched first, not cut through.");
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
    case "edge": { const ep = $("edgePanel"); if (ep) { ep.classList.remove("hidden"); ep.hidden = false; ep.scrollIntoView({ block: "nearest" }); } toast(clickVerb() + " an edge on the outline, then change its length, angle or curve."); break; }
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
          ? "Do it applies to the corner you clicked. Tick All inside corners to do every inside corner at once. A relief cut is only for inside corners."
          : "Choose Round corner (smooth radius) or Relief cut (a circle into the inside corner so a square corner can sit in). Then Do it and click the corners, or tick All inside corners." },
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
          ? "Do it applies to the corner you clicked. Tick All corners to chamfer every sharp corner. The default 45° trims both edges equally on a square corner."
          : "Type a distance and an angle (45° is a true 45° on a square corner), then Do it and click the corners, or tick All corners." },
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
  $("quickBar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-qb]");
    if (!b) return;
    const id = b.dataset.qb;
    if (Date.now() < (S.uiBlockUntil || 0) && id !== "undo" && id !== "redo") return;
    if (!b.disabled && b.getAttribute("aria-disabled") !== "true") quickAction(id);
  });
  bindQbRoving();
}

// Type-while-drawing: length/angle for lines, Tab between width/height for rectangles, Enter to commit, Esc to cancel.
import { sketch } from "../core/state.js";
import { $ } from "../core/dom.js";
import { evalExpr } from "../core/expr.js";
import { parseTypedSize } from "./typedsize.js";

let fields = [];
let focusI = 0;

export function hudOpen() {
  const el = $("drawHud");
  return !!(el && !el.classList.contains("hidden") && !el.hidden);
}

export function closeDrawHud() {
  const el = $("drawHud");
  if (!el) return;
  el.classList.add("hidden");
  el.hidden = true;
  el.innerHTML = "";
  fields = [];
  if (sketch) { sketch.drawDraft = null; sketch.draw(); }
}

// "120 x 80" in one box: both sizes (a single number is just the width here)
function pairIn(el) {
  const raw = String((el && el.value) || "");
  if (!/\d\s*(?:[xX×*,]|\bby\b)\s*[\d.(]/.test(raw)) return null;
  return parseTypedSize("rect", raw);
}
function num(el, fallback) {
  const v = evalExpr(el && el.value);
  return Number.isFinite(v) ? v : fallback;
}

function lastPt() {
  const pts = (sketch && sketch.drawPts) || [];
  return pts.length ? pts[pts.length - 1] : null;
}


export function toggleDrawArc() {
  if (!sketch || sketch.tool !== "draw") return false;
  sketch.drawArc = !sketch.drawArc;
  sketch.onMessage(sketch.drawArc ? "Next segment will be a curve. Press A or Arc again for a straight line." : "Next segment will be a straight line.");
  paintDrawHud();
  return sketch.drawArc;
}

export function applyHudPoint() {
  if (!sketch || !hudOpen()) return false;
  const tool = sketch.tool;
  if (tool === "draw") {
    const a = lastPt();
    if (!a) return false;
    const raw = (($("drawHudLen") && $("drawHudLen").value) || "").trim();
    let x, y;
    const xy = raw.match(/^(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)$/);
    const polar = raw.match(/^(-?[\d.]+)\s*@\s*(-?[\d.]+)$/);
    if (xy) { x = Number(xy[1]); y = Number(xy[2]); }
    else if (polar) {
      const len = Number(polar[1]), ang = Number(polar[2]) * Math.PI / 180;
      x = a[0] + len * Math.cos(ang); y = a[1] + len * Math.sin(ang);
    } else {
      const len = num($("drawHudLen"), 0);
      const ang = num($("drawHudAng"), 0) * Math.PI / 180;
      if (!(len >= 0.5)) return false;
      x = a[0] + len * Math.cos(ang); y = a[1] + len * Math.sin(ang);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (Math.abs(x) > sketch.maxMm || Math.abs(y) > sketch.maxMm) { sketch.onMessage("That point is off the table."); return false; }
    const nx = Math.round(x * 10) / 10, ny = Math.round(y * 10) / 10;
    if (sketch.pushDrawPoint) sketch.pushDrawPoint(nx, ny);
    else sketch.drawPts.push([nx, ny]);
    sketch.draw();
    paintDrawHud();
    return true;
  }
  if (tool === "rect" || tool === "disc") {
    return commitRectDisc({ fromHud: true });
  }
  return false;
}

export function commitRectDisc(opts = {}) {
  if (!sketch || !sketch.drawDraft) return false;
  const d = sketch.drawDraft;
  const fromHud = !!opts.fromHud;
  if (d.kind === "rect") {
    const both = fromHud ? pairIn($("drawHudW")) : null;          // r15 10.7: "120 × 80" typed in the width box
    const w = both ? both.w : Math.abs(fromHud ? num($("drawHudW"), d.w) : d.w);
    const h = both ? both.h : Math.abs(fromHud ? num($("drawHudH"), d.h) : d.h);
    if (w < 2 || h < 2) { if (d.typed) sketch.onMessage("Type a size such as 120 x 80, then Enter."); return false; }
    const x = d.typed ? d.ox - w / 2 : Math.min(d.x, d.x + (d.w >= 0 ? w : -w));
    const y = d.typed ? d.oy - h / 2 : Math.min(d.y, d.y + (d.h >= 0 ? h : -h));
    // add() places at a default; then move to the typed corner
    sketch.add("rect", true, { w, h });
    const it = sketch.selected() || sketch.items[sketch.items.length - 1];
    if (it) { it.x = x; it.y = y; sketch.commit(); sketch.onSelect(); }
    sketch.setTool(null);
    closeDrawHud();
    return true;
  }
  if (d.kind === "disc") {
    const typedD = fromHud ? parseTypedSize("disc", ($("drawHudD") || {}).value) : null;     // r15 10.7: Ø40, R20, 40
    const dia = typedD ? typedD.d : Math.abs(fromHud ? num($("drawHudD"), d.d) : d.d);
    if (dia < 2) { if (d.typed) sketch.onMessage("Type a size such as Ø40 or R20, then Enter."); return false; }
    sketch.add("disc", true, { d: dia });
    const it = sketch.selected() || sketch.items[sketch.items.length - 1];
    if (it) { it.x = d.cx - dia / 2; it.y = d.cy - dia / 2; sketch.commit(); sketch.onSelect(); }
    sketch.setTool(null);
    closeDrawHud();
    return true;
  }
  return false;
}


export function syncDrawHudValues() {
  if (!sketch || !sketch.drawDraft) return;
  const d = sketch.drawDraft;
  if (d.kind === "rect") {
    if ($("drawHudW")) $("drawHudW").value = String(Math.round(Math.abs(d.w || 0) * 10) / 10);
    if ($("drawHudH")) $("drawHudH").value = String(Math.round(Math.abs(d.h || 0) * 10) / 10);
  } else if (d.kind === "disc") {
    if ($("drawHudD")) $("drawHudD").value = String(Math.round(Math.abs(d.d || 0) * 10) / 10);
  }
}

export function cancelDrawHud() {
  if (sketch) {
    sketch.drawPts = [];
    sketch.drawDraft = null;
    if (sketch.tool === "rect" || sketch.tool === "disc") sketch.setTool(null);
    else sketch.draw();
  }
  closeDrawHud();
}

export function paintDrawHud() {
  const el = $("drawHud");
  if (!el || !sketch) return;
  const tool = sketch.tool;
  if (tool === "draw") {
    const a = lastPt();
    if (!a) { closeDrawHud(); return; }
    const draft = sketch.drawDraft;
    const len = draft && draft.len != null ? draft.len : "";
    const ang = draft && draft.ang != null ? draft.ang : 0;
    const arcOn = !!(sketch.drawArc);
    el.innerHTML = `<span class="drawhud-lab">Length</span><input id="drawHudLen" type="text" inputmode="decimal" value="${len}" aria-label="Length in millimetres">
      <span class="drawhud-lab">Angle</span><input id="drawHudAng" type="text" inputmode="decimal" value="${ang}" aria-label="Angle in degrees">
      <button type="button" id="drawHudAdd" class="small">Add point</button>
      <button type="button" id="drawHudArc" class="small${arcOn ? " on" : ""}" aria-pressed="${arcOn ? "true" : "false"}">${arcOn ? "Arc on" : "Arc"}</button>
      <button type="button" id="drawHudClose" class="small go">Close</button>
      <button type="button" id="drawHudEtch" class="small">Etch line</button>
      <span class="muted small">Enter or Close finishes the outline · Etch line keeps it open as a mark (not cut through) · A or Arc starts a curve · type a length, or 100,50 for a point, or 40@90 for length@angle · Esc cancels</span>`;
    el.classList.remove("hidden"); el.hidden = false;
    fields = ["drawHudLen", "drawHudAng"];
  } else if (tool === "rect" && sketch.drawDraft) {
    const d = sketch.drawDraft;
    el.innerHTML = `<span class="drawhud-lab">Width</span><input id="drawHudW" type="text" inputmode="decimal" value="${Math.abs(d.w || 0)}" aria-label="Width in millimetres">
      <span class="drawhud-lab">Height</span><input id="drawHudH" type="text" inputmode="decimal" value="${Math.abs(d.h || 0)}" aria-label="Height in millimetres">
      <span class="muted small">Tab switches · Enter places it · Esc cancels</span>`;
    el.classList.remove("hidden"); el.hidden = false;
    fields = ["drawHudW", "drawHudH"];
  } else if (tool === "disc" && sketch.drawDraft) {
    const d = sketch.drawDraft;
    el.innerHTML = `<span class="drawhud-lab">Diameter</span><input id="drawHudD" type="text" inputmode="decimal" value="${Math.abs(d.d || 0)}" aria-label="Diameter in millimetres">
      <span class="muted small">Enter places it · Esc cancels</span>`;
    el.classList.remove("hidden"); el.hidden = false;
    fields = ["drawHudD"];
  } else {
    closeDrawHud();
    return;
  }
  dockHud();
  bindHudInputs();
}

// r15 3.2: on a laptop the box docks over the top of the side panel, never on the drawing (it used to sit over the bottom of
// the drawing and silently eat clicks there). Phones keep it at the bottom of the screen.
function dockHud() {
  const el = $("drawHud"), side = $("srcShape");
  if (!el) return;
  const laptop = !!(window.matchMedia && window.matchMedia("(min-width: 900px) and (pointer: fine)").matches) && !document.body.classList.contains("phone-ui");
  const r = side && side.getClientRects().length ? side.getBoundingClientRect() : null;
  const cv = sketch && sketch.cv ? sketch.cv.getBoundingClientRect() : null;
  if (laptop && r && r.width >= 260 && (!cv || r.left >= cv.right - 1)) {
    el.classList.add("docked");
    el.style.left = Math.round(r.left) + "px"; el.style.top = Math.round(r.top) + "px"; el.style.width = Math.round(r.width) + "px";
  } else {
    el.classList.remove("docked");
    el.style.left = el.style.top = el.style.width = "";
  }
}
if (typeof window !== "undefined") window.addEventListener("resize", () => { if (hudOpen()) dockHud(); });

function bindHudInputs() {
  for (const id of fields) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("keydown", onHudKey);
    el.addEventListener("input", onHudInput);
  }
  const add = $("drawHudAdd");
  if (add) add.addEventListener("click", () => applyHudPoint());
  const arc = $("drawHudArc");
  if (arc) arc.addEventListener("click", () => toggleDrawArc());
  const close = $("drawHudClose");
  if (close) close.addEventListener("click", () => {
    if (sketch && sketch.drawPts && sketch.drawPts.length >= 3) { sketch.finishDraw(); closeDrawHud(); }
  });
  const etch = $("drawHudEtch");
  if (etch) etch.addEventListener("click", () => {
    if (sketch && sketch.finishOpenDraw && sketch.drawPts && sketch.drawPts.length >= 2) { sketch.finishOpenDraw(); closeDrawHud(); }
  });
}

function onHudInput() {
  if (!sketch) return;
  if (sketch.tool === "draw") {
    const a = lastPt(); if (!a) return;
    const len = num($("drawHudLen"), 0), ang = num($("drawHudAng"), 0) * Math.PI / 180;
    sketch.drawDraft = { kind: "line", len: num($("drawHudLen"), 0), ang: num($("drawHudAng"), 0), x: a[0] + len * Math.cos(ang), y: a[1] + len * Math.sin(ang) };
    sketch.draw();
  } else if (sketch.tool === "rect" && sketch.drawDraft) {
    const d = sketch.drawDraft, both = pairIn($("drawHudW"));
    d.w = both ? both.w : num($("drawHudW"), d.w);
    d.h = both ? both.h : num($("drawHudH"), d.h);
    if (d.typed) { d.x = d.ox - Math.abs(d.w) / 2; d.y = d.oy - Math.abs(d.h) / 2; }
    sketch.draw();
  } else if (sketch.tool === "disc" && sketch.drawDraft) {
    const t = parseTypedSize("disc", ($("drawHudD") || {}).value);
    sketch.drawDraft.d = t ? t.d : num($("drawHudD"), sketch.drawDraft.d);
    sketch.draw();
  }
}

function onHudKey(e) {
  if ((e.key === "a" || e.key === "A") && !(e.ctrlKey || e.metaKey) && sketch && sketch.tool === "draw") {
    e.preventDefault(); e.stopPropagation();
    toggleDrawArc();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault(); e.stopPropagation();
    // Enter always finishes a started outline (3+ points), even if a length is in the box.
    if (sketch && sketch.tool === "draw" && sketch.drawEtch && sketch.finishOpenDraw && sketch.drawPts && sketch.drawPts.length >= 2) {
      sketch.finishOpenDraw(); closeDrawHud(); return;
    }
    if (sketch && sketch.tool === "draw" && sketch.drawPts && sketch.drawPts.length >= 3) {
      sketch.finishDraw(); closeDrawHud(); return;
    }
    // r15 3.5: an empty box on a two-point line: say what to do instead of silently doing nothing
    if (sketch && sketch.tool === "draw" && sketch.drawPts && sketch.drawPts.length === 2 && !((($("drawHudLen") || {}).value || "").trim())) { sketch.finishDraw(); return; }
    applyHudPoint(); return;
  }
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelDrawHud(); return; }
  if (e.key === "Tab" && fields.length > 1) {
    e.preventDefault(); e.stopPropagation();
    const cur = fields.indexOf(e.currentTarget.id);
    const next = e.shiftKey ? (cur - 1 + fields.length) % fields.length : (cur + 1) % fields.length;
    const el = $(fields[next]); if (el) { el.focus(); el.select(); }
  }
}

export function focusHud(which) {
  const id = which || fields[0];
  const el = $(id);
  if (el) { el.focus(); el.select(); }
}

export function startRectAt(wx, wy) {
  if (!sketch) return;
  sketch.drawDraft = { kind: "rect", x: wx, y: wy, w: 40, h: 30 };
  paintDrawHud();
  focusHud("drawHudW");
  if (sketch.onMessage) sketch.onMessage("Move to set the size, then click again or press Enter. Or type the width and height.");
}

export function startDiscAt(wx, wy) {
  if (!sketch) return;
  sketch.drawDraft = { kind: "disc", cx: wx, cy: wy, d: 40 };
  paintDrawHud();
  focusHud("drawHudD");
  if (sketch.onMessage) sketch.onMessage("Move to set the size, then click again or press Enter. Or type the diameter.");
}

// r15 10.7: a number typed with Rectangle / Circle picked (before any click) opens the box with it; Enter places the shape
// centred on the middle of the view.
export function typeSizeStart(key) {
  if (!sketch || !(sketch.tool === "rect" || sketch.tool === "disc") || sketch.drawDraft) return false;
  const [vw, vh] = sketch.size();
  const [cx, cy] = sketch.toWorld(vw / 2, vh / 2);
  const ox = Math.round(cx), oy = Math.round(cy);
  sketch.drawDraft = sketch.tool === "rect" ? { kind: "rect", x: ox, y: oy, w: 0, h: 0, ox, oy, typed: true } : { kind: "disc", cx: ox, cy: oy, d: 0, typed: true };
  paintDrawHud();
  const id = sketch.tool === "rect" ? "drawHudW" : "drawHudD", el = $(id);
  if (!el) return false;
  el.value = String(key || "");
  focusI = Math.max(0, fields.indexOf(id));
  el.focus({ preventScroll: true });
  try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* type=text only */ }
  if (sketch.onMessage) sketch.onMessage(sketch.tool === "rect" ? "Type the size, e.g. 120 x 80 (or Tab to the height), then Enter." : "Type the size, e.g. Ø40 or R20, then Enter.");
  return true;
}

export function afterDrawPoint() {
  if (!sketch || sketch.tool !== "draw") return;
  const a = lastPt(); if (!a) return;
  sketch.drawDraft = { kind: "line", len: 40, ang: 0, x: a[0] + 40, y: a[1] };
  paintDrawHud();
  // Do not steal focus: A and Enter must stay as drawing keys, and the phone keyboard would cover the canvas.
}

export function bindDrawHud() {
  const el = $("drawHud");
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape" || e.key === "Tab") e.stopPropagation();
  });
  if (sketch && !sketch.onDrawFinished) sketch.onDrawFinished = () => closeDrawHud();
}

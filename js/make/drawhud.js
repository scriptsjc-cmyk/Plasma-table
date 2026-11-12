// Type-while-drawing: length/angle for lines, Tab between width/height for rectangles, Enter to commit, Esc to cancel.
import { sketch } from "../core/state.js";
import { $ } from "../core/dom.js";
import { evalExpr } from "../core/expr.js";

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

function num(el, fallback) {
  const v = evalExpr(el && el.value);
  return Number.isFinite(v) ? v : fallback;
}

function lastPt() {
  const pts = (sketch && sketch.drawPts) || [];
  return pts.length ? pts[pts.length - 1] : null;
}

export function applyHudPoint() {
  if (!sketch || !hudOpen()) return false;
  const tool = sketch.tool;
  if (tool === "draw") {
    const a = lastPt();
    if (!a) return false;
    const len = num($("drawHudLen"), 0);
    const ang = num($("drawHudAng"), 0) * Math.PI / 180;
    if (!(len >= 0.5)) return false;
    const x = a[0] + len * Math.cos(ang), y = a[1] + len * Math.sin(ang);
    if (Math.abs(x) > sketch.maxMm || Math.abs(y) > sketch.maxMm) { sketch.onMessage("That point is off the table."); return false; }
    const nx = Math.round(x * 10) / 10, ny = Math.round(y * 10) / 10;
    if (sketch.pushDrawPoint) sketch.pushDrawPoint(nx, ny);
    else sketch.drawPts.push([nx, ny]);
    sketch.draw();
    paintDrawHud();
    return true;
  }
  if (tool === "rect" || tool === "disc") {
    return commitRectDisc();
  }
  return false;
}

export function commitRectDisc() {
  if (!sketch || !sketch.drawDraft) return false;
  const d = sketch.drawDraft;
  if (d.kind === "rect") {
    const w = Math.abs(num($("drawHudW"), d.w)), h = Math.abs(num($("drawHudH"), d.h));
    if (w < 2 || h < 2) return false;
    const x = Math.min(d.x, d.x + (d.w >= 0 ? w : -w));
    const y = Math.min(d.y, d.y + (d.h >= 0 ? h : -h));
    // add() places at a default; then move to the typed corner
    sketch.add("rect", true, { w, h });
    const it = sketch.selected() || sketch.items[sketch.items.length - 1];
    if (it) { it.x = x; it.y = y; sketch.commit(); sketch.onSelect(); }
    sketch.setTool(null);
    closeDrawHud();
    return true;
  }
  if (d.kind === "disc") {
    const dia = Math.abs(num($("drawHudD"), d.d));
    if (dia < 2) return false;
    sketch.add("disc", true, { d: dia });
    const it = sketch.selected() || sketch.items[sketch.items.length - 1];
    if (it) { it.x = d.cx - dia / 2; it.y = d.cy - dia / 2; sketch.commit(); sketch.onSelect(); }
    sketch.setTool(null);
    closeDrawHud();
    return true;
  }
  return false;
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
    el.innerHTML = `<span class="drawhud-lab">Length</span><input id="drawHudLen" type="text" inputmode="decimal" value="${len}" aria-label="Length in millimetres">
      <span class="drawhud-lab">Angle</span><input id="drawHudAng" type="text" inputmode="decimal" value="${ang}" aria-label="Angle in degrees">
      <span class="muted small">Enter adds a point, or closes if the box is empty · Esc cancels</span>`;
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
  bindHudInputs();
}

function bindHudInputs() {
  for (const id of fields) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("keydown", onHudKey);
    el.addEventListener("input", onHudInput);
  }
}

function onHudInput() {
  if (!sketch) return;
  if (sketch.tool === "draw") {
    const a = lastPt(); if (!a) return;
    const len = num($("drawHudLen"), 0), ang = num($("drawHudAng"), 0) * Math.PI / 180;
    sketch.drawDraft = { kind: "line", len: num($("drawHudLen"), 0), ang: num($("drawHudAng"), 0), x: a[0] + len * Math.cos(ang), y: a[1] + len * Math.sin(ang) };
    sketch.draw();
  } else if (sketch.tool === "rect" && sketch.drawDraft) {
    sketch.drawDraft.w = num($("drawHudW"), sketch.drawDraft.w);
    sketch.drawDraft.h = num($("drawHudH"), sketch.drawDraft.h);
    sketch.draw();
  } else if (sketch.tool === "disc" && sketch.drawDraft) {
    sketch.drawDraft.d = num($("drawHudD"), sketch.drawDraft.d);
    sketch.draw();
  }
}

function onHudKey(e) {
  if (e.key === "Enter") {
    e.preventDefault(); e.stopPropagation();
    // Empty length box + at least 3 points: close the outline (item 17). A typed length still adds a point.
    if (sketch && sketch.tool === "draw" && sketch.drawPts && sketch.drawPts.length >= 3 && !(num($("drawHudLen"), 0) >= 0.5)) {
      sketch.finishDraw(); closeDrawHud(); return;
    }
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
}

export function startDiscAt(wx, wy) {
  if (!sketch) return;
  sketch.drawDraft = { kind: "disc", cx: wx, cy: wy, d: 40 };
  paintDrawHud();
  focusHud("drawHudD");
}

export function afterDrawPoint() {
  if (!sketch || sketch.tool !== "draw") return;
  const a = lastPt(); if (!a) return;
  sketch.drawDraft = { kind: "line", len: 40, ang: 0, x: a[0] + 40, y: a[1] };
  paintDrawHud();
  focusHud("drawHudLen");
}

export function bindDrawHud() {
  const el = $("drawHud");
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape" || e.key === "Tab") e.stopPropagation();
  });
  if (sketch && !sketch.onDrawFinished) sketch.onDrawFinished = () => closeDrawHud();
}

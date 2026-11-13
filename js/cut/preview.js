// The preview canvas: sheet, parts, cut order, torch path, machine bed and gantry drawing.
import { screen } from "../ui/flow.js";
import * as Setup from "./setup.js";
import { drawHandles } from "./camedit.js";
import { drawNumbers, drawPlay, playActive } from "./playback.js";
import { S, sketch } from "../core/state.js";
import { $, themeColor } from "../core/dom.js";
import { renderQuickBar } from "../core/hooks.js";
import { applyPreviewCam, previewCam } from "./previewnav.js";
import { drawGantry, drawMachineBed, isPartPreview, machineVisible, markMachine } from "./machinedraw.js";
import { bedViewRotated, drawAxisHints } from "./bedview.js";

// where the start point is, in table view coordinates (the one being dragged wins)
function originView() { const w = wcoNow(); return toView(w[0], w[1]); }
export function fromView(vx, vy) { return S.safety.referenced ? [vx + S.safety.ref[0], vy + S.safety.ref[1]] : [vx, vy]; }
export function wcoNow() {
  const st = S.status;
  return st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : [0, 0, 0];
}
const edgesOn = () => !!(S.safety.limits && S.safety.referenced);
export function toView(mx, my) { return S.safety.referenced ? [mx - S.safety.ref[0], my - S.safety.ref[1]] : [mx, my]; }
// the machine's reachable area written in the sheet picture's coordinates (the work zero = the sheet's bottom-left corner)
export function workAreaSheet() {
  if (!edgesOn()) return null;
  const w = wcoNow(), ref = S.safety.ref, L = S.safety.limits;
  return { x: [L.x[0] - w[0] + ref[0], L.x[1] - w[0] + ref[0]], y: [L.y[0] - w[1] + ref[1], L.y[1] - w[1] + ref[1]] };
}
function viewArea() {
  if (edgesOn()) return { x: S.safety.limits.x, y: S.safety.limits.y, label: "machine edges" };
  const t = S.cfg.travel_mm;
  return { x: [0, t.x], y: [0, t.y], label: "table" };
}
// On Cut step 1 the canvas is only a preview of the chosen part (centred and fitted).
// The table, gantry and torch appear from Setup (step 3) onward, when Show machine is on.

export function fit() {
  if (!S.prepared) return { cls: "", text: "" };
  if (!S.safety.limits) return { cls: "unknown", text: S.demo ? "Demo: tap here and the edges are set up for you." : "Edges not set up – can't check it fits (Machine setup tab)." };
  if (!S.connected && !S.safety.referenced) return { cls: "unknown", text: "Connect to the table to check it fits." };    // round 5 item 11: no homing prompt without a machine
  if (!S.safety.referenced) return { cls: "unknown", text: "Home the machine to check it fits." };
  const b = S.prepared.stats.bounds, w = wcoNow(), ref = S.safety.ref, L = S.safety.limits;
  const x0 = b[0] + w[0] - ref[0], x1 = b[2] + w[0] - ref[0], y0 = b[1] + w[1] - ref[1], y1 = b[3] + w[1] - ref[1];
  const over = [];
  if (x0 < L.x[0] - 0.05) over.push(`${Math.ceil(L.x[0] - x0)} mm too far left`);
  if (x1 > L.x[1] + 0.05) over.push(`${Math.ceil(x1 - L.x[1])} mm too far right`);
  if (y0 < L.y[0] - 0.05) over.push(`${Math.ceil(L.y[0] - y0)} mm too far forward`);
  if (y1 > L.y[1] + 0.05) over.push(`${Math.ceil(y1 - L.y[1])} mm too far back`);
  return over.length ? { cls: "bad", bad: true, text: `✗ Won't fit: ${over.join(", ")}. Move the start point.` }
    : { cls: "good", text: "✓ Fits on the machine" };
}
export function drawPreview() {
  const cv = $("preview");
  const grid = cv && cv.closest(".cutgrid");
  if (grid) grid.classList.toggle("nofile", screen() === "cut" && S.cur === 1 && !S.prepared);
  if (!cv || !cv.offsetParent) return;
  const editing = !!sketch && S.src === "shape" && (screen() === "make" ? S.cur === 1 : (S.cur === 3 && Setup.layoutActive()));
  if (sketch) renderQuickBar();
  if (sketch && sketch.active !== editing) sketch.setActive(editing);
  // Keep the toggle available on Setup (step 3) and Cut (step 4), including layout mode.
  const hideToggle = screen() !== "cut" || Number(S.cur) === 1;
  $("showMachWrap").classList.toggle("hidden", hideToggle);
  if (editing) { sketch.draw(); markMachine(cv); return; }
  drawCanvas(cv, true);
  markMachine(cv);
}
function drawCanvas(cv, main) {
  if (!cv || !cv.offsetParent) return;
  const ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600;
  // steps 1-2: zoom in on the part. Step 3 onwards (and the Move tab): the whole table, with the part where it will be cut.
  const zoom = main && S.prepared && isPartPreview();
  let A, ox = 0, oy = 0;
  if (isPartPreview() && !S.prepared) {
    const ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600;
    const box = cv.closest(".previewPane") || cv.parentElement;
    const dock = box && box.querySelector(".previewDock");
    const h = Math.max(120, (box ? (box.clientHeight - (dock ? dock.offsetHeight : 0)) : 0) || cv.clientHeight || 200);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = themeColor("--cad-canvas", "#FFFFFF"); ctx.fillRect(0, 0, w, h);
    cv._zmap = null; cv._map = null;
    return;
  }
  if (zoom) {
    const b = S.prepared.stats.bounds, pad = Math.max(5, 0.06 * Math.max(b[2] - b[0], b[3] - b[1]));
    A = { x: [b[0] - pad, b[2] + pad], y: [b[1] - pad, b[3] + pad], label: "" };
  } else {
    const T = viewArea();
    // room around the table for the machine: X beam along the front, Y arm off its carriage
    const mg = machineVisible() ? [70, 190, 70, 140] : [0, 0, 0, 0];   // left, front, back, right
    A = { x: [T.x[0] - mg[0], T.x[1] + mg[3]], y: [T.y[0] - mg[1], T.y[1] + mg[2]], label: T.label, table: T };
    [ox, oy] = originView();
  }
  const ax = A.x[1] - A.x[0], ay = A.y[1] - A.y[0];
  let h = Math.max(180, Math.min(520, Math.round(w * (ay / ax))));
  const fill = document.body.classList.contains("short-land") || document.body.classList.contains("app-shell") || document.body.classList.contains("shape-fs");
  if (fill) {
    const box = cv.closest(".previewPane") || cv.parentElement;
    const dock = box && box.querySelector(".previewDock");
    const avail = box ? (box.clientHeight - (dock ? dock.offsetHeight : 0)) : 0;
    h = Math.max(120, avail || cv.clientHeight || 200);
  }
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  if (fill) cv.style.height = "";
  else cv.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const C = {
    canvas: themeColor("--cad-canvas", "#FFFFFF"),
    partLine: themeColor("--cad-part-line", "#334155"),
    sel: themeColor("--cad-sel", "#0078D4"),
    lock: themeColor("--cad-lock", "#C05600"),
    label: themeColor("--cad-label", "#4B5563"),
    tagText: themeColor("--cad-tag-text", "#FFFFFF"),
    danger: themeColor("--cad-danger", "#C42B1C"),
    go: themeColor("--go", "#0A6A32"),
    bed: themeColor("--cad-grid", "#ECEEF1"),
    slat: themeColor("--cad-grid-major", "#D5DAE0"),
  };
  ctx.fillStyle = C.canvas; ctx.fillRect(0, 0, w, h);
  applyPreviewCam(ctx, w, h);
  const pad = 12, sc = Math.min((w - 2 * pad) / ax, (h - 2 * pad) / ay);
  const offX = (w - ax * sc) / 2, offY = (h - ay * sc) / 2;
  const rot = !isPartPreview() && bedViewRotated();
  const X0 = (x) => offX + (x - A.x[0]) * sc, Y0 = (y) => h - offY - (y - A.y[0]) * sc;
  const X = (x) => rot ? w - X0(x) : X0(x), Y = (y) => rot ? h - Y0(y) : Y0(y);
  const cam = previewCam();
  const toMmRaw = (px, py) => {
    if (rot) { px = w - px; py = h - py; }
    return [A.x[0] + (px - offX) / sc, A.y[0] + (h - offY - py) / sc];
  };
  const toMm = (px, py) => {
    if (cam.s === 1 && !cam.x && !cam.y) return toMmRaw(px, py);
    return toMmRaw(w / 2 + (px - w / 2 - cam.x) / cam.s, h / 2 + (py - h / 2 - cam.y) / cam.s);
  };
  const toPx = (x, y) => {
    const px = X(x), py = Y(y);
    if (cam.s === 1 && !cam.x && !cam.y) return [px, py];
    return [w / 2 + cam.x + cam.s * (px - w / 2), h / 2 + cam.y + cam.s * (py - h / 2)];
  };
  cv._zmap = main && zoom ? { toMm, toPx } : null;
  cv._map = zoom ? null : { toMm, toPx, sc, T: A.table };
  if (!zoom && !isPartPreview()) drawMachineBed(ctx, A.table, X, Y, sc);
  if (S.prepared) {
    const pv = S.prepared.preview;
    const path = (p) => { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + ox), Y(y + oy)) : ctx.moveTo(X(x + ox), Y(y + oy)))); ctx.stroke(); };
    if (S.prepared.outline) { ctx.strokeStyle = C.partLine; ctx.lineWidth = 1; S.prepared.outline.forEach((p) => path([...p, p[0]])); }
    if (pv && Array.isArray(pv.rapids)) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C.label; ctx.lineWidth = 1; pv.rapids.forEach(path);
    }
    ctx.setLineDash([]); ctx.strokeStyle = fit().bad ? C.danger : C.lock; ctx.lineWidth = zoom ? 2.5 : 2;
    const playing = main && playActive();
    if (playing) ctx.globalAlpha = 0.22;
    for (const p of (pv && pv.cuts) || []) { path(p); ctx.fillStyle = C.lock; ctx.beginPath(); ctx.arc(X(p[0][0] + ox), Y(p[0][1] + oy), zoom ? 4 : 3, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (playing) drawPlay(ctx, X, Y, ox, oy, C, zoom);
    if (main && !S.job) drawNumbers(ctx, X, Y, ox, oy, C);
    if (main && zoom) drawHandles(ctx, X, Y, C);
    if (zoom && S.prepared.marks) S.prepared.marks.forEach((m) => {     // cut check markers
      const col = m.level === "error" ? C.danger : m.level === "warn" ? C.lock : C.sel;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(m.at[0]), Y(m.at[1]), 10, 0, 7); ctx.fill();
      ctx.strokeStyle = C.canvas; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.tagText; ctx.font = "bold 12px Barlow, system-ui"; ctx.textAlign = "center";
      ctx.fillText(String(m.n), X(m.at[0]), Y(m.at[1]) + 4); ctx.textAlign = "start";
    });
    if (zoom) {
      ctx.fillStyle = C.label; ctx.font = "12px system-ui";
      ctx.fillText("orange: torch path   grey: your part   dots: where it pierces", 8, h - 8);
    }
  }
  if (!isPartPreview()) {
    ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(ox) - 9, Y(oy)); ctx.lineTo(X(ox) + 9, Y(oy)); ctx.moveTo(X(ox), Y(oy) - 9); ctx.lineTo(X(ox), Y(oy) + 9); ctx.stroke();
  }
  if (!zoom && !isPartPreview()) {
    drawGantry(ctx, A.table, X, Y, sc, { toView });
    drawAxisHints(ctx, (x, y) => [X(x), Y(y)]);
  }
}

// The preview canvas: sheet, parts, cut order, torch path, machine bed and gantry drawing.
import { screen } from "../ui/flow.js";
import * as Setup from "./setup.js";
import { drawHandles } from "./camedit.js";
import { drawNumbers, drawPlay, playActive } from "./playback.js";
import { S, sketch } from "../core/state.js";
import { $, themeColor } from "../core/dom.js";
import { renderQuickBar } from "../core/hooks.js";
import { applyPreviewCam, previewCam } from "./previewnav.js";

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
  $("showMachWrap").classList.toggle("hidden", editing || (!!S.prepared && S.cur <= 2));
  if (editing) { sketch.draw(); return; }
  drawCanvas(cv, true);
}
function drawCanvas(cv, main) {
  if (!cv || !cv.offsetParent) return;
  const ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600;
  // steps 1-2: zoom in on the part. Step 3 onwards (and the Move tab): the whole table, with the part where it will be cut.
  const zoom = main && S.prepared && S.cur <= 2;
  let A, ox = 0, oy = 0;
  if (zoom) {
    const b = S.prepared.stats.bounds, pad = Math.max(5, 0.06 * Math.max(b[2] - b[0], b[3] - b[1]));
    A = { x: [b[0] - pad, b[2] + pad], y: [b[1] - pad, b[3] + pad], label: "" };
  } else {
    const T = viewArea();
    // room around the table for the machine: X beam along the front, Y arm off its carriage
    const mg = S.showMachine ? [70, 190, 70, 140] : [0, 0, 0, 0];   // left, front, back, right
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
  const X = (x) => offX + (x - A.x[0]) * sc, Y = (y) => h - offY - (y - A.y[0]) * sc;
  const cam = previewCam();
  const toMmRaw = (px, py) => [A.x[0] + (px - offX) / sc, A.y[0] + (h - offY - py) / sc];
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
  if (!zoom) drawMachineBed(ctx, A.table, X, Y, sc);
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
  ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(ox) - 9, Y(oy)); ctx.lineTo(X(ox) + 9, Y(oy)); ctx.moveTo(X(ox), Y(oy) - 9); ctx.lineTo(X(ox), Y(oy) + 9); ctx.stroke();
  if (!zoom) drawGantry(ctx, A.table, X, Y, sc);
}
// ---- bird's-eye view of the machine (HMM-style: X beam along the front, Y arm cantilevered across the table,
// torch on a plate on the left face of the arm). Sizes in mm.
const MACH = { beamH: 50, armW: 50, plate: 26, torchOff: 30, carW: 190, carD: 120, motor: 57 };
function drawMachineBed(ctx, T, X, Y, sc) {
  const [x0, x1] = T.x, [y0, y1] = T.y;
  const R = (x, y, w, h) => [X(x), Y(y + h), w * sc, h * sc];
  // water tray / table
  ctx.fillStyle = themeColor("--cad-grid", "#ECEEF1"); ctx.fillRect(...R(x0, y0, x1 - x0, y1 - y0));
  if (S.showMachine) {
    ctx.strokeStyle = themeColor("--cad-grid-major", "#D5DAE0"); ctx.lineWidth = Math.max(1, 3 * sc);                 // slats every 100 mm
    ctx.beginPath();
    for (let x = Math.ceil((x0 + 1) / 100) * 100; x < x1; x += 100) { ctx.moveTo(X(x), Y(y0)); ctx.lineTo(X(x), Y(y1)); }
    ctx.stroke();
    ctx.strokeStyle = themeColor("--line", "#D0D5DD"); ctx.lineWidth = 1; ctx.beginPath();                  // slat teeth (light)
    for (let y = y0 + 50; y < y1; y += 50) for (let x = Math.ceil((x0 + 1) / 100) * 100; x < x1; x += 100) { ctx.moveTo(X(x) - 2, Y(y)); ctx.lineTo(X(x) + 2, Y(y)); }
    ctx.stroke();
  }
  ctx.strokeStyle = edgesOn() ? themeColor("--go", "#0A6A32") : themeColor("--line-strong", "#B8BFC9"); ctx.lineWidth = edgesOn() ? 2 : 1;
  ctx.strokeRect(...R(x0, y0, x1 - x0, y1 - y0));
  ctx.fillStyle = themeColor("--cad-label", "#4B5563"); ctx.font = "12px Barlow, system-ui";
  ctx.textAlign = "right"; ctx.fillText(`${T.label} ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} mm`, X(x1) - 8, Y(y1) - 8 + 20); ctx.textAlign = "start";
  if (!S.showMachine) return;
  // X beam: box section with the rail on top and end caps
  const bx0 = x0 - 40, bx1 = x1 + 110, by = y0 - 20 - MACH.beamH;
  ctx.fillStyle = "#262d36"; ctx.fillRect(...R(bx0, by, bx1 - bx0, MACH.beamH));
  ctx.fillStyle = "#3a4552"; ctx.fillRect(...R(bx0, by + MACH.beamH - 10, bx1 - bx0, 6));   // rail
  ctx.fillStyle = "#56677a"; ctx.fillRect(...R(bx0, by + MACH.beamH - 8, bx1 - bx0, 2));
  ctx.strokeStyle = "#465464"; ctx.lineWidth = 1; ctx.strokeRect(...R(bx0, by, bx1 - bx0, MACH.beamH));
  ctx.fillStyle = "#3557c9"; ctx.fillRect(...R(bx0 - 6, by - 4, 8, MACH.beamH + 8)); ctx.fillRect(...R(bx1 - 2, by - 4, 8, MACH.beamH + 8));
  ctx.fillStyle = "#6d7c8c"; ctx.font = "11px Barlow, system-ui";
  ctx.textAlign = "right"; ctx.fillText("X beam", X(bx1) - 8, Y(by + MACH.beamH / 2) + 4); ctx.textAlign = "start";
}
function drawGantry(ctx, T, X, Y, sc) {
  const has = !!S.status.MPos;
  const [tx, ty] = has ? toView(S.status.MPos[0], S.status.MPos[1]) : [T.x[0], T.y[0]];
  const r = Math.max(5, 9 * sc);
  if (!S.showMachine) {                      // just the torch dot
    if (!has) return;
    ctx.fillStyle = S.status.torch ? themeColor("--torch", "#C05600") : themeColor("--text", "#1F2A37");
    ctx.beginPath(); ctx.arc(X(tx), Y(ty), 6, 0, 7); ctx.fill();
    return;
  }
  const M_ = MACH, R = (x, y, w, h) => [X(x), Y(y + h), w * sc, h * sc];
  const rr = (x, y, w, h, rad) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(...R(x, y, w, h), rad * sc); else ctx.rect(...R(x, y, w, h)); };
  const armX = tx + M_.torchOff, armC = armX + M_.armW / 2;          // arm's left face sits just right of the torch
  const by = T.y[0] - 20 - M_.beamH, top = T.y[1] + 30, carY = by - 25;
  ctx.globalAlpha = has ? 1 : 0.5;
  // cable chain from the left end of the beam to the carriage (in front of the beam)
  const chainY = by - 34, cx0 = T.x[0] - 30, cx1 = armC - M_.carW / 2;
  if (cx1 > cx0) {
    ctx.fillStyle = "#1b2027"; ctx.fillRect(...R(cx0, chainY, cx1 - cx0, 18));
    ctx.strokeStyle = "#3a4450"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = cx0; x < cx1; x += 14) { ctx.moveTo(X(x), Y(chainY)); ctx.lineTo(X(x), Y(chainY + 18)); }
    ctx.stroke();
  }
  // X carriage: blue plate with bearings and the X motor
  ctx.fillStyle = "#2f4fb8"; ctx.strokeStyle = "#5b7be0"; ctx.lineWidth = 1;
  rr(armC - M_.carW / 2, carY, M_.carW, M_.carD, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c9d1d9";
  for (const dx of [-70, 70]) for (const dy of [12, M_.carD - 12]) { ctx.beginPath(); ctx.arc(X(armC + dx), Y(carY + dy), Math.max(1.5, 7 * sc), 0, 7); ctx.fill(); }
  ctx.fillStyle = "#15191e"; ctx.fillRect(...R(armC + 40, carY - 30, M_.motor, M_.motor));        // X motor hangs off the front
  ctx.strokeStyle = "#3d4752"; ctx.strokeRect(...R(armC + 40, carY - 30, M_.motor, M_.motor));
  ctx.fillStyle = "#2a3038"; ctx.beginPath(); ctx.arc(X(armC + 40 + M_.motor / 2), Y(carY - 30 + M_.motor / 2), 14 * sc, 0, 7); ctx.fill();
  // Y arm: black box section with its rail, end cap and the Y motor at the back end
  const armLen = top - carY;
  ctx.fillStyle = "#1c2128"; ctx.fillRect(...R(armX, carY, M_.armW, armLen));
  ctx.fillStyle = "#2c333c"; ctx.fillRect(...R(armX, carY, 6, armLen));                            // lit edge
  ctx.fillStyle = "#56677a"; ctx.fillRect(...R(armX + M_.armW - 8, carY, 3, armLen));               // rail
  ctx.strokeStyle = "#465464"; ctx.strokeRect(...R(armX, carY, M_.armW, armLen));
  ctx.fillStyle = "#3557c9"; ctx.fillRect(...R(armX - 3, top - 6, M_.armW + 6, 8));                // end cap
  ctx.fillStyle = "#15191e"; ctx.fillRect(...R(armX + M_.armW + 2, carY + 10, M_.motor, M_.motor)); // Y motor
  ctx.strokeStyle = "#3d4752"; ctx.strokeRect(...R(armX + M_.armW + 2, carY + 10, M_.motor, M_.motor));
  // Z carriage: blue plate on the arm's left face, height sensor, torch body and red handle
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#2f4fb8"; ctx.strokeStyle = "#7aa2f0"; ctx.lineWidth = 1;
  rr(tx - 4, ty - 40, M_.torchOff + 4, 80, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c9d1d9"; ctx.beginPath(); ctx.arc(X(tx + 14), Y(ty + 26), Math.max(2, 7 * sc), 0, 7); ctx.fill();   // sensor
  ctx.save(); ctx.translate(X(tx), Y(ty)); ctx.rotate(Math.PI * 0.82);                                 // handle out to the front-left
  ctx.fillStyle = "#b5453f"; ctx.fillRect(0, -11 * sc, 130 * sc, 22 * sc);
  ctx.fillStyle = "#8f322e"; for (let k = 30; k < 120; k += 22) ctx.fillRect(k * sc, -11 * sc, 4 * sc, 22 * sc);
  ctx.restore();
  ctx.fillStyle = "#3d4752"; ctx.beginPath(); ctx.arc(X(tx), Y(ty), 16 * sc + 2, 0, 7); ctx.fill();   // torch body
  if (S.status.torch) { ctx.fillStyle = "rgba(192,86,0,.38)"; ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 2.4, 0, 7); ctx.fill(); }
  ctx.fillStyle = S.status.torch ? themeColor("--torch", "#C05600") : themeColor("--text", "#1F2A37");
  ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 0.75, 0, 7); ctx.fill();
  ctx.strokeStyle = "#121920"; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(X(tx) - r, Y(ty)); ctx.lineTo(X(tx) + r, Y(ty)); ctx.moveTo(X(tx), Y(ty) - r); ctx.lineTo(X(tx), Y(ty) + r); ctx.stroke();
}

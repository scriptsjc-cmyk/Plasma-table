// Bird's-eye table, gantry and torch for the cutting preview (HMM-style: X beam along the front,
// Y arm cantilevered across the table, torch on a plate on the left face of the arm). Sizes in mm.
import { screen } from "../ui/flow.js";
import { S } from "../core/state.js";
import { themeColor } from "../core/dom.js";

export const MACH = { beamH: 50, armW: 50, plate: 26, torchOff: 30, carW: 190, carD: 120, motor: 57 };

const edgesOn = () => !!(S.safety && S.safety.limits && S.safety.referenced);

export function isPartPreview() { return screen() === "cut" && Number(S.cur) === 1; }
export function machineVisible() { return !!S.showMachine && !isPartPreview(); }

export function markMachine(cv) {
  if (cv) cv.dataset.machine = machineVisible() ? "on" : "off";
}

// Torch in the same coordinates as X/Y. opts.sheet uses work position (layout/sheet space);
// otherwise machine-view space (MPos run through opts.toView, as the G-code preview does).
export function torchXY(T, opts = {}) {
  if (opts.sheet) {
    const w = S.status && S.status.WPos;
    return w ? [w[0], w[1]] : [T.x[0], T.y[0]];
  }
  const has = !!(S.status && S.status.MPos);
  if (has && opts.toView) return opts.toView(S.status.MPos[0], S.status.MPos[1]);
  return has ? [S.status.MPos[0], S.status.MPos[1]] : [T.x[0], T.y[0]];
}

export function drawMachineBed(ctx, T, X, Y, sc) {
  if (!machineVisible() || !T) return;
  const [x0, x1] = T.x, [y0, y1] = T.y;
  const R = (x, y, w, h) => [X(x), Y(y + h), w * sc, h * sc];
  // water tray / table
  ctx.fillStyle = themeColor("--cad-grid", "#ECEEF1"); ctx.fillRect(...R(x0, y0, x1 - x0, y1 - y0));
  ctx.strokeStyle = themeColor("--cad-grid-major", "#D5DAE0"); ctx.lineWidth = Math.max(1, 3 * sc);                 // slats every 100 mm
  ctx.beginPath();
  for (let x = Math.ceil((x0 + 1) / 100) * 100; x < x1; x += 100) { ctx.moveTo(X(x), Y(y0)); ctx.lineTo(X(x), Y(y1)); }
  ctx.stroke();
  ctx.strokeStyle = themeColor("--line", "#D0D5DD"); ctx.lineWidth = 1; ctx.beginPath();                  // slat teeth (light)
  for (let y = y0 + 50; y < y1; y += 50) for (let x = Math.ceil((x0 + 1) / 100) * 100; x < x1; x += 100) { ctx.moveTo(X(x) - 2, Y(y)); ctx.lineTo(X(x) + 2, Y(y)); }
  ctx.stroke();
  ctx.strokeStyle = edgesOn() ? themeColor("--go", "#0A6A32") : themeColor("--line-strong", "#B8BFC9"); ctx.lineWidth = edgesOn() ? 2 : 1;
  ctx.strokeRect(...R(x0, y0, x1 - x0, y1 - y0));
  ctx.fillStyle = themeColor("--cad-label", "#4B5563"); ctx.font = "12px Barlow, system-ui";
  ctx.textAlign = "right"; ctx.fillText(`${T.label} ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} mm`, X(x1) - 8, Y(y1) - 8 + 20); ctx.textAlign = "start";
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

export function drawGantry(ctx, T, X, Y, sc, opts = {}) {
  if (!machineVisible() || !T) return;
  const has = !!(S.status && S.status.MPos);
  const [tx, ty] = torchXY(T, opts);
  const r = Math.max(5, 9 * sc);
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
  if (S.status && S.status.torch) { ctx.fillStyle = "rgba(192,86,0,.38)"; ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 2.4, 0, 7); ctx.fill(); }
  ctx.fillStyle = (S.status && S.status.torch) ? themeColor("--torch", "#C05600") : themeColor("--text", "#1F2A37");
  ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 0.75, 0, 7); ctx.fill();
  ctx.strokeStyle = "#121920"; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(X(tx) - r, Y(ty)); ctx.lineTo(X(tx) + r, Y(ty)); ctx.moveTo(X(tx), Y(ty) - r); ctx.lineTo(X(tx), Y(ty) + r); ctx.stroke();
}

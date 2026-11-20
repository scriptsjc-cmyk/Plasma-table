// Machine setup bed picture: the table, gantry, home corner and current torch
// position. Laptop uses the same Y-only flip as the Cut bed view.
import { S } from "../core/state.js";
import { $, themeColor } from "../core/dom.js";
import { drawAxisHints, bedViewRotated } from "../cut/bedview.js";
import { drawGantry, drawMachineBed, markMachine } from "../cut/machinedraw.js";
import { toView, viewArea } from "../cut/preview.js";
import { setInfoText } from "../ui/hovertip.js";
import { isShellLaptop } from "../ui/laptop.js";
import { enter } from "../ui/transition.js";

function fmt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? (Math.abs(v) < 0.05 ? "0" : v.toFixed(1)) : "–";
}

export function homeNoteText() {
  const mp = (S.status && S.status.MPos) || null;
  const pos = mp ? `X ${fmt(mp[0])}, Y ${fmt(mp[1])}, Z ${fmt(mp[2])} mm` : "unknown (not connected)";
  const ref = S.safety && S.safety.referenced ? S.safety.ref : null;
  const mode = S.safety && S.safety.ref_mode;
  let home;
  if (ref) {
    const how = mode === "homed" ? "after a switch-seeking $H" : "where the torch was when you set it";
    home = `Home 0,0 on the picture is ${how} (controller reports machine X ${fmt(ref[0])}, Y ${fmt(ref[1])} there).`;
  } else {
    home = "Home is not set yet. Until you set it, the controller reports 0,0 at wherever the head was when it powered on — that may not be a real corner.";
  }
  return `This table has no limit switches, so it cannot find home by itself. Jog the torch to your marked home corner (raised right up) and press “Set this as home (0,0)”. The motors do not move.\n\n$H (Home all) is not used: the FluidNC config has no homing cycles or switch pins, so $H would raise an alarm (“No homing cycles defined”). A single-axis $HX with no switch would search the full travel for a pin that is not there.\n\nCurrent machine position: ${pos}.\n${home}`;
}

// One plain-words line on the bed picture; the rest (no switches, $H, live position) is behind the "i" (r13 #30).
export function homeNoteLine() {
  const ref = S.safety && S.safety.referenced;
  return ref
    ? "Home is set. Jog anywhere; the picture shows where the torch is."
    : "No home switches: jog to your home corner, then press “Set this as home”.";
}

export function paintSetupHomeNote() {
  const el = $("setupHomeNote");
  if (!el) return;
  const full = homeNoteText();
  setInfoText(el, homeNoteLine(), full, "More about homing and $H");
  const lab = el.querySelector(".info-label");
  if (lab) lab.title = full;
}

// A canvas text's box (CSS px, before any transform) for the current font, align and baseline.
function textBox(ctx, text, x, y) {
  const m = ctx.measureText(text);
  return { l: x - m.actualBoundingBoxLeft, r: x + m.actualBoundingBoxRight, t: y - m.actualBoundingBoxAscent, b: y + m.actualBoundingBoxDescent };
}

const SETUP_TABS = ["edges", "motors", "torch", "controller"];
export function setSetupTab(name) {
  const tab = SETUP_TABS.includes(name) ? name : "edges";
  const view = $("setupView");
  const was = view && view.dataset.setupTab;
  if (view) view.dataset.setupTab = tab;
  if (view && was && was !== tab) enter(view.querySelector(`.setup-pane[data-setup-pane="${tab}"]`), "fade");
  view && view.querySelectorAll(".setup-tabs [data-setup-tab]").forEach((b) => {
    const on = b.getAttribute("data-setup-tab") === tab;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
}

let jogHome = null;
export function placeSetupJog() {
  const mount = document.querySelector("#setupCards .jogmount, #setupBedWrap .jogmount");
  const bed = $("setupBedWrap");
  const card = document.querySelector("#setupCards .setup-pane[data-setup-pane=\"edges\"] .card");
  if (!mount || !bed) return;
  if (!jogHome) jogHome = { parent: card || mount.parentNode, next: mount.nextElementSibling };
  const on = isShellLaptop() && !$("setupView").classList.contains("hidden");
  if (on) {
    if (mount.parentNode !== bed) bed.appendChild(mount);
  } else if (jogHome.parent && mount.parentNode !== jogHome.parent) {
    const next = (jogHome.next && jogHome.next.parentNode === jogHome.parent) ? jogHome.next : null;
    try { jogHome.parent.insertBefore(mount, next); } catch (e) { jogHome.parent.appendChild(mount); }
  }
}

export function bindSetupTabs() {
  const view = $("setupView");
  if (!view || view.dataset.tabsBound) return;
  view.dataset.tabsBound = "1";
  if (!view.dataset.setupTab) view.dataset.setupTab = "edges";
  view.addEventListener("click", (e) => {
    const b = e.target.closest(".setup-tabs [data-setup-tab]");
    if (!b) return;
    setSetupTab(b.getAttribute("data-setup-tab"));
  });
  setSetupTab(view.dataset.setupTab);
}

export function drawSetupBed() {
  bindSetupTabs();
  placeSetupJog();
  paintSetupHomeNote();
  const cv = $("setupBed");
  if (!cv || !cv.offsetParent) return;
  const ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const box = cv.parentElement;
  const w = Math.max(200, (box && box.clientWidth) || cv.clientWidth || 480);
  const h = Math.max(200, (box && (box.clientHeight - ($("setupHomeNote") ? $("setupHomeNote").offsetHeight + 12 : 0))) || cv.clientHeight || 320);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  cv.style.width = w + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = themeColor("--cad-canvas", "#FFFFFF");
  ctx.fillRect(0, 0, w, h);

  const T = viewArea();
  const mg = [70, 190, 70, 140]; // left, back/rail (Y=0), front (+Y), right — room for the gantry
  const A = { x: [T.x[0] - mg[0], T.x[1] + mg[3]], y: [T.y[0] - mg[1], T.y[1] + mg[2]], table: T };
  const ax = A.x[1] - A.x[0], ay = A.y[1] - A.y[0];
  const pad = 12, sc = Math.min((w - 2 * pad) / ax, (h - 2 * pad) / ay);
  const offX = (w - ax * sc) / 2, offY = (h - ay * sc) / 2;
  const rot = bedViewRotated();
  const X0 = (x) => offX + (x - A.x[0]) * sc, Y0 = (y) => h - offY - (y - A.y[0]) * sc;
  const X = (x) => X0(x), Y = (y) => rot ? h - Y0(y) : Y0(y);

  // Force the machine drawing on (Machine setup always shows the table).
  const prev = S.showMachine;
  S.showMachine = true;
  try {
    drawMachineBed(ctx, T, X, Y, sc);
    drawGantry(ctx, T, X, Y, sc, { toView });
    drawAxisHints(ctx, (x, y) => [X(x), Y(y)]);
  } finally { S.showMachine = prev; }

  // Home 0,0 is the view origin: the set home corner, or controller power-up 0,0 if not set.
  const [hx, hy] = [X(0), Y(0)];
  ctx.save();
  ctx.strokeStyle = themeColor("--go", "#0A6A32");
  ctx.fillStyle = themeColor("--go", "#0A6A32");
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hx - 14, hy); ctx.lineTo(hx + 14, hy);
  ctx.moveTo(hx, hy - 14); ctx.lineTo(hx, hy + 14);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(hx, hy, 5, 0, 7); ctx.fill();
  ctx.font = "bold 13px Barlow, system-ui";
  const homeTop = rot || hy < h * 0.4;
  ctx.textAlign = hx < w * 0.55 ? "left" : "right";
  ctx.textBaseline = homeTop ? "top" : "bottom";
  const hxOff = hx < w * 0.55 ? 12 : -12;
  const hyOff = homeTop ? 12 : -12;
  const homeLabel = (S.safety && S.safety.referenced)
    ? "Home 0,0 — machine thinks it is here"
    : "Controller 0,0 (power-up — home not set)";
  ctx.fillText(homeLabel, hx + hxOff, hy + hyOff);
  const homeBox = textBox(ctx, homeLabel, hx + hxOff, hy + hyOff);
  ctx.restore();

  const mp = S.status && S.status.MPos;
  if (mp) {
    const [vx, vy] = toView(mp[0], mp[1]);
    const [tx, ty] = [X(vx), Y(vy)];
    ctx.save();
    ctx.fillStyle = themeColor("--text", "#1F2A37");
    ctx.font = "12px Barlow, system-ui";
    ctx.textAlign = tx < w * 0.55 ? "left" : "right";
    ctx.textBaseline = ty < h * 0.5 ? "top" : "bottom";
    const lx = tx < w * 0.55 ? 16 : -16, ly = ty < h * 0.5 ? 18 : -18;
    const torchLabel = `Torch  X ${fmt(mp[0])}  Y ${fmt(mp[1])}  Z ${fmt(mp[2])} mm`;
    // r13: never on top of the Home 0,0 label (the torch is often parked at home): step below or above it.
    let [px, py] = [tx + lx, ty + ly];
    const hit = (b, c) => Math.min(b.r, c.r) - Math.max(b.l, c.l) > 0 && Math.min(b.b, c.b) - Math.max(b.t, c.t) > 0;
    if (hit(textBox(ctx, torchLabel, px, py), homeBox)) {
      const below = ctx.textBaseline === "top" ? homeBox.b + 4 : homeBox.b + 4 + (textBox(ctx, torchLabel, 0, 0).b - textBox(ctx, torchLabel, 0, 0).t);
      const above = ctx.textBaseline === "top" ? homeBox.t - 4 - (textBox(ctx, torchLabel, 0, 0).b - textBox(ctx, torchLabel, 0, 0).t) : homeBox.t - 4;
      const fitsBelow = (ctx.textBaseline === "top" ? below + 16 : below) <= h - 2;
      py = fitsBelow ? below : above;
    }
    ctx.fillText(torchLabel, px, py);
    ctx.restore();
  }
  const torchPx = mp ? [X(toView(mp[0], mp[1])[0]), Y(toView(mp[0], mp[1])[1])] : null;
  cv._map = { toPx: (x, y) => [X(x), Y(y)], sc, T };
  cv._home = [X(0), Y(0)];
  cv._torch = torchPx;
  markMachine(cv);
  cv.dataset.setupBed = "on";
  cv.dataset.homeSet = (S.safety && S.safety.referenced) ? "1" : "0";
  cv.dataset.flip = rot ? "y" : "off";
}

// Machine setup bed picture: the table, gantry, home corner and current torch
// position. Laptop uses the same Y-only flip as the Cut bed view.
import { S } from "../core/state.js";
import { $, themeColor } from "../core/dom.js";
import { drawAxisHints, bedViewRotated } from "../cut/bedview.js";
import { drawGantry, drawMachineBed, gantryBoxes, markMachine } from "../cut/machinedraw.js";
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
  // r15 4.10 (checker): the labels keep off the gantry (beam, Y leg, carriage, torch handle) and each other. First choice is
  // where they always went; then further out, the other side, the other way up — the first spot that is clear and on the canvas.
  const gantry = gantryBoxes(T, X, Y, sc, { toView });
  const hitB = (b, c) => Math.min(b.r, c.r) - Math.max(b.l, c.l) > -1 && Math.min(b.b, c.b) - Math.max(b.t, c.t) > -1;
  const place = (text, ax, ay, dx0, dy0, sideR, down, avoid) => {
    let first = null;
    for (const dy of [dy0, dy0 + 18, dy0 + 36, dy0 + 54, dy0 + 72, dy0 + 90]) for (const dx of [dx0, dx0 + 40, dx0 + 80, dx0 + 120])
      for (const sR of [sideR, !sideR]) for (const dn of [down, !down]) {
        ctx.textAlign = sR ? "left" : "right"; ctx.textBaseline = dn ? "top" : "bottom";
        const x = ax + (sR ? dx : -dx), y = ay + (dn ? dy : -dy), bx = textBox(ctx, text, x, y);
        const spot = { x, y, bx, align: ctx.textAlign, base: ctx.textBaseline };
        if (!first) first = spot;
        if (bx.l >= 2 && bx.r <= w - 2 && bx.t >= 2 && bx.b <= h - 2 && !avoid.some((o) => hitB(bx, o))) return spot;
      }
    return first;
  };
  const homeLabel = (S.safety && S.safety.referenced)
    ? "Home 0,0 — machine thinks it is here"
    : "Controller 0,0 (power-up — home not set)";
  const hs = place(homeLabel, hx, hy, 12, 12, hx < w * 0.55, rot || hy < h * 0.4, gantry);
  ctx.textAlign = hs.align; ctx.textBaseline = hs.base;
  ctx.fillText(homeLabel, hs.x, hs.y);
  const homeBox = hs.bx;
  ctx.restore();

  const mp = S.status && S.status.MPos;
  let torchBox = null;
  if (mp) {
    const [vx, vy] = toView(mp[0], mp[1]);
    const [tx, ty] = [X(vx), Y(vy)];
    ctx.save();
    ctx.fillStyle = themeColor("--text", "#1F2A37");
    ctx.font = "12px Barlow, system-ui";
    const torchLabel = `Torch  X ${fmt(mp[0])}  Y ${fmt(mp[1])}  Z ${fmt(mp[2])} mm`;
    // r13: never on top of the Home 0,0 label (the torch is often parked at home)
    const ts = place(torchLabel, tx, ty, 16, 18, tx < w * 0.55, ty < h * 0.5, [...gantry, homeBox]);
    ctx.textAlign = ts.align; ctx.textBaseline = ts.base;
    ctx.fillText(torchLabel, ts.x, ts.y);
    torchBox = ts.bx;
    ctx.restore();
  }
  cv._labels = { home: homeBox, torch: torchBox };
  cv._gantry = gantry;
  const torchPx = mp ? [X(toView(mp[0], mp[1])[0]), Y(toView(mp[0], mp[1])[1])] : null;
  cv._map = { toPx: (x, y) => [X(x), Y(y)], sc, T };
  cv._home = [X(0), Y(0)];
  cv._torch = torchPx;
  markMachine(cv);
  cv.dataset.setupBed = "on";
  cv.dataset.homeSet = (S.safety && S.safety.referenced) ? "1" : "0";
  cv.dataset.flip = rot ? "y" : "off";
}

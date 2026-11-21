// r15 8.5 (split from fold3d.js): the 3D view in the Size tab, the lightbox (Expand), turning it with the mouse, tiles.
import { viewModel } from "./fold3d-geom.js";
import { foldModel } from "./fold3d-models.js";
import { DEFAULT_CAM, drawFoldCanvas, foldThumbSvg } from "./fold3d-render.js";

// Persist orbit per part so re-painting the form doesn't snap the view back.
const orbit = { yaw: DEFAULT_CAM.yaw, pitch: DEFAULT_CAM.pitch, key: "" };
// Phone "Folded view" starts collapsed; remember if the user opened it this session.
const phoneFold = { open: false };
function isPhoneFold() {
  return typeof document !== "undefined" && (
    document.body.classList.contains("phone-ui") || !document.body.classList.contains("laptop-ui")
  );
}

function modelForCanvas(canvas) {
  const lb = canvas && canvas.closest("#fold3dLightbox");
  if (lb && lb._model) return lb._model;
  const h = canvas && canvas.closest(".fold3d-host");
  return h && h._model;
}

function redrawFoldCanvases(model) {
  if (!model || typeof document === "undefined") return;
  for (const cv of document.querySelectorAll("canvas.fold3d")) {
    const m = modelForCanvas(cv) || model;
    if (m) drawFoldCanvas(cv, m, orbit);
  }
}

function closeFoldLightbox() {
  const ov = typeof document !== "undefined" && document.getElementById("fold3dLightbox");
  if (ov) { ov.hidden = true; ov._model = null; }
}

function openFoldLightbox(host) {
  if (typeof document === "undefined" || !host || !host._model || isPhoneFold()) return;
  let ov = document.getElementById("fold3dLightbox");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "fold3dLightbox";
    ov.className = "fold3d-lb";
    ov.innerHTML = `<div class="fold3d-lb-inner" role="dialog" aria-label="Enlarged folded 3D view"><button type="button" class="fold3d-lb-close" aria-label="Close">✕</button><canvas class="fold3d fold3d-lb-canvas" width="1280" height="800" aria-label="Folded 3D view, drag to turn"></canvas></div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov) closeFoldLightbox(); });
    ov.querySelector(".fold3d-lb-close").addEventListener("click", closeFoldLightbox);
    bindOrbit(ov.querySelector("canvas.fold3d"));
    if (!window.__fold3dEsc) {
      window.__fold3dEsc = true;
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeFoldLightbox(); });
    }
  }
  ov._model = host._model;
  ov.hidden = false;
  const cv = ov.querySelector("canvas.fold3d");
  requestAnimationFrame(() => drawFoldCanvas(cv, ov._model, orbit));
}

export function mountFoldView(host, sh, params) {
  if (!host) return;
  const full = foldModel(sh, params);
  const key0 = sh && sh.id;
  if (host._foldKey !== key0) { host._foldKey = key0; host._fold = 1; }   // a new part starts folded
  host._sh = sh; host._params = params;
  const amt = full && full.unfoldable ? (host._fold != null ? host._fold : 1) : 1;
  const mid = amt < 1 ? foldModel(sh, params, { fold: amt }) : full;
  const model = viewModel(mid, params);
  if (!model || !model.faces.length) { host.replaceChildren(); host.hidden = true; return; }
  host.hidden = false;
  const key = sh && sh.id;
  if (orbit.key !== key) { orbit.key = key; orbit.yaw = DEFAULT_CAM.yaw; orbit.pitch = DEFAULT_CAM.pitch; }
  const phone = isPhoneFold();
  let canvas = host.querySelector("canvas.fold3d");
  if (!canvas) {
    const thumb = foldThumbSvg(model, 56, 40);
    const open = phone ? (phoneFold.open ? " open" : "") : " open";
    host.innerHTML = `<details class="fold3d-box"${open}><summary class="fold3d-sum"><span class="fold3d-sum-label">Folded view</span><span class="fold3d-mini">${thumb}</span></summary><div class="fold3d-wrap"><canvas class="fold3d" width="720" height="480" aria-label="Folded 3D view, drag to turn. The drawing is the flat pattern you cut."></canvas><button type="button" class="fold3d-expand">Expand</button><div class="fold3d-unfold" hidden><span aria-hidden="true">Unfold</span><input type="range" min="0" max="100" step="1" value="100" aria-label="Unfold: 0 is flat, 100 is folded"></div><p class="fold3d-cap"></p></div></details>`;
    canvas = host.querySelector("canvas.fold3d");
    bindOrbit(canvas);
    const box = host.querySelector("details.fold3d-box");
    if (box) box.addEventListener("toggle", () => {
      if (isPhoneFold()) phoneFold.open = box.open;
      if (box.open && host._model) drawFoldCanvas(canvas, host._model, orbit);
    });
    const exp = host.querySelector(".fold3d-expand");
    if (exp) exp.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openFoldLightbox(host); });
    const sl = host.querySelector(".fold3d-unfold input");
    if (sl) sl.addEventListener("input", () => {
      host._fold = Math.max(0, Math.min(1, Number(sl.value) / 100));
      const m = viewModel(foldModel(host._sh, host._params, { fold: host._fold }), host._params);
      if (!m) return;
      host._model = m;
      drawFoldCanvas(canvas, m, orbit);
    });
    if (typeof ResizeObserver !== "undefined" && !host._foldRo) {
      host._foldRo = new ResizeObserver(() => {
        if (host._model) {
          const cv = host.querySelector("canvas.fold3d");
          if (cv && cv.getClientRects().length) drawFoldCanvas(cv, host._model, orbit);
        }
      });
      const wrap = host.querySelector(".fold3d-wrap");
      if (wrap) host._foldRo.observe(wrap);
    }
  } else {
    const mini = host.querySelector(".fold3d-mini");
    if (mini) mini.innerHTML = foldThumbSvg(model, 56, 40);
  }
  drawFoldCanvas(canvas, model, orbit);
  host._model = model;
  const unf = host.querySelector(".fold3d-unfold");
  if (unf) {
    unf.hidden = !(full && full.unfoldable);
    const inp = unf.querySelector("input");
    if (inp) inp.value = String(Math.round(amt * 100));
  }
  // r15 5.4: a pipe template says what the colours are
  const cap = host.querySelector(".fold3d-cap");
  if (cap) cap.textContent = sh && sh.template
    ? "Template — wrap it round the pipe to mark the cut. Blue: the template you cut; grey: the pipe. Drag to turn."
    : "Folded view — drag to turn. The drawing is the flat pattern you cut.";
  host._sh = sh;
  host._params = params;
  const lb = typeof document !== "undefined" && document.getElementById("fold3dLightbox");
  if (lb && !lb.hidden) { lb._model = model; const lbc = lb.querySelector("canvas.fold3d"); if (lbc) drawFoldCanvas(lbc, model, orbit); }
}

function bindOrbit(canvas) {
  if (!canvas || canvas._foldOrbit) return;
  canvas._foldOrbit = true;
  let dragging = false, lx = 0, ly = 0;
  const redraw = () => {
    const m = modelForCanvas(canvas);
    if (m) redrawFoldCanvases(m);
  };
  const down = (x, y) => { dragging = true; lx = x; ly = y; canvas.style.cursor = "grabbing"; };
  const move = (x, y) => {
    if (!dragging) return;
    orbit.yaw += (x - lx) * 0.01;
    orbit.pitch = Math.max(-1.2, Math.min(1.2, orbit.pitch + (y - ly) * 0.01));
    lx = x; ly = y; redraw();
  };
  const up = () => { dragging = false; canvas.style.cursor = "grab"; };
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); down(e.clientX, e.clientY); });
  canvas.addEventListener("pointermove", (e) => { if (dragging) { e.preventDefault(); move(e.clientX, e.clientY); } });
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("lostpointercapture", up);
}

// Combined tile: 3D as the main picture, with a small flat-pattern inset so both are visible.
export function foldTileSvg(sh, flatSvg, w = 96, h = 72, params) {
  const model = viewModel(foldModel(sh, params), params);
  if (!model) return flatSvg || "";
  const main = foldThumbSvg(model, w, h);
  if (!flatSvg) return main;
  // nest the flat thumb in the lower-left
  const iw = 30, ih = 22, ix = 3, iy = h - ih - 3;
  const inner = String(flatSvg).replace(/<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" class="fold-thumb">
    ${main.replace(/<\/?svg[^>]*>/g, "")}
    <rect x="${ix - 1}" y="${iy - 1}" width="${iw + 2}" height="${ih + 2}" rx="2" fill="#fff" stroke="#9aa3ad" stroke-width="0.8"/>
    <g transform="translate(${ix} ${iy})">${inner.replace(/viewBox="[^"]*"/, "").replace(/width="[^"]*"/, `width="${iw}"`).replace(/height="[^"]*"/, `height="${ih}"`)}</g>
  </svg>`;
}

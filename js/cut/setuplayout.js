// r11 Setup step (Get to cutting step 2): laptop-only placement helpers.
import { $ } from "../core/dom.js";
import { sketch } from "../core/state.js";

export const SETUP_LAPTOP_MQ = "(min-width: 1200px) and (min-height: 560px) and (hover: hover) and (pointer: fine)";
export function isSetupLaptop() {
  try { return window.matchMedia(SETUP_LAPTOP_MQ).matches; } catch (e) { return false; }
}

function homeSlot(card) {
  const jog = card && card.querySelector(".jogmount .jog");
  if (!jog || !jog.children[5]) return null;
  jog.children[5].classList.add("jog-home-slot");
  return jog.children[5];
}

// On the laptop Setup step, Home sits in the centre of the jog pad. Everywhere
// else it stays in the Home / Raise / Go to start row.

let originHome = null;
function placeOriginOpts() {
  const btn = $("btnOriginOpts");
  const pane = document.querySelector(".previewPane");
  if (!btn) return;
  if (!originHome) originHome = { parent: btn.parentNode, next: btn.nextElementSibling };
  const on = isSetupLaptop() && document.body.dataset.screen === "cut" && document.body.dataset.step === "3" && document.body.classList.contains("machine-connected");
  if (on && pane && btn.parentNode !== pane) pane.appendChild(btn);
  else if (!on && originHome.parent && btn.parentNode !== originHome.parent) {
    const next = (originHome.next && originHome.next.parentNode === originHome.parent) ? originHome.next : null;
    try { originHome.parent.insertBefore(btn, next); } catch (e) { originHome.parent.appendChild(btn); }
  }
}
export function placeTorchHome() {
  const card = $("zeroCard"); if (!card) return;
  const home = card.querySelector(".do-home"); if (!home) return;
  const slot = homeSlot(card);
  const row = card.querySelector(".homerow");
  if (isSetupLaptop() && slot && home.parentNode !== slot) slot.appendChild(home);
  else if (!isSetupLaptop() && row && home.parentNode !== row) {
    const raise = row.querySelector(".do-raise");
    row.insertBefore(home, raise || row.firstChild);
  }
}

const homes = new Map();
function remember(el, key) {
  if (!el || homes.has(key)) return;
  homes.set(key, { parent: el.parentNode, next: el.nextElementSibling });
}
function restore(el, key) {
  const h = homes.get(key); if (!el || !h || !h.parent) return;
  if (el.parentNode === h.parent) return;
  h.parent.insertBefore(el, h.next);
}

function paintCanvasChips() {
  const chip = $("dragChip");
  if (chip) chip.classList.toggle("hidden", !(isSetupLaptop() && document.body.dataset.screen === "cut" && document.body.dataset.step === "3"));
}
export function placeSetupColumns() {
  paintCanvasChips();
  placeOriginOpts();

  const layout = $("layoutCard");
  const check = $("checkCard");
  const pane = document.querySelector("#cutView .previewPane");
  const nav = document.querySelector(".step[data-step='3'] > .nav");
  const mat = check && check.querySelector(".checkmat") || layout && layout.querySelector(".checkmat");
  const start = $("startCutRow");
  const back = (layout && layout.querySelector(".back")) || (nav && nav.querySelector(".back"));
  const fit = $("layFit"), zoom = $("layZoom");
  const sel = $("layoutSel");
  remember(mat, "mat"); remember(start, "start"); remember(back, "back");
  remember(fit, "fit"); remember(zoom, "zoom"); remember(sel, "sel");
  const hint = $("zeroCard") && $("zeroCard").querySelector(".keyhint");
  remember(hint, "hint");
  const disc = $("btnDisconnect"), link = $("btnLinkMachine"), menu = $("connMenu");
  remember(disc, "disc"); remember(link, "link");
  if (isSetupLaptop() && document.body.dataset.screen === "cut" && document.body.dataset.step === "3") {
    if (menu && disc && disc.parentNode !== menu) menu.appendChild(disc);
    if (menu && link && link.parentNode !== menu) menu.appendChild(link);
    if (layout && mat && mat.parentNode !== layout) layout.appendChild(mat);
    if (layout && start && start.parentNode !== layout) layout.appendChild(start);
    if (layout && back && back.parentNode !== layout) layout.appendChild(back);
    if (pane && fit && fit.parentNode !== pane) pane.appendChild(fit);
    if (pane && zoom && zoom.parentNode !== pane) pane.appendChild(zoom);
    if (pane && sel && sel.parentNode !== pane) pane.appendChild(sel);
    const wrap = $("zeroCard") && $("zeroCard").querySelector(".jogwrap");
    if (wrap && hint && hint.parentNode !== wrap) wrap.appendChild(hint);
    if (back) back.textContent = "← Back to part";
  } else {
    restore(hint, "hint"); restore(link, "link"); restore(disc, "disc");
    restore(sel, "sel"); restore(zoom, "zoom"); restore(fit, "fit");
    restore(start, "start"); restore(mat, "mat"); restore(back, "back");
    if (back) back.textContent = "← Back";
  }
  placeLayoutToolbar();
  placeTorchHome();
  syncGridSnap();
}

export function placeLayoutToolbar() {
  const bar = $("layoutSel");
  const pane = document.querySelector("#cutView .previewPane");
  if (!bar || !pane) return;
  if (!isSetupLaptop()) { bar.style.left = ""; bar.style.top = ""; return; }
  if (bar.classList.contains("hidden") || !bar.offsetParent) return;
  const sk = sketch;
  const one = sk && typeof sk.selected === "function" ? sk.selected() : null;
  const cv = (sk && sk.cv) || $("preview");
  if (!one || !cv || typeof sk.boxOf !== "function" || typeof sk.toScreen !== "function") {
    bar.style.left = "8px";
    bar.style.top = "8px";
    return;
  }
  const b = sk.boxOf(one);
  const [sx, sy] = sk.toScreen(b[2], b[3]);
  const cr = cv.getBoundingClientRect();
  const pr = pane.getBoundingClientRect();
  const scaleX = cr.width / (cv.width || cr.width);
  const scaleY = cr.height / (cv.height || cr.height);
  let left = cr.left - pr.left + sx * scaleX + 8;
  let top = cr.top - pr.top + sy * scaleY - 8;
  bar.style.left = "0px"; bar.style.top = "0px";
  const br = bar.getBoundingClientRect();
  const maxL = Math.max(8, pr.width - br.width - 8);
  const maxT = Math.max(8, pr.height - br.height - 8);
  left = Math.max(8, Math.min(left, maxL));
  top = Math.max(8, Math.min(top, maxT));
  const stop = $("btnStop") && $("btnStop").getBoundingClientRect();
  if (stop && stop.width) {
    const absL = pr.left + left, absT = pr.top + top;
    const overlap = absL < stop.right + 8 && absL + br.width > stop.left - 8 && absT < stop.bottom + 8 && absT + br.height > stop.top - 8;
    if (overlap) left = Math.max(8, stop.left - pr.left - br.width - 12);
  }
  bar.style.left = left + "px";
  bar.style.top = top + "px";
}

function syncGridSnap() {
  const sel = $("layGrid");
  const box = $("gridSnap");
  if (!sel || !box) return;
  const v = String(sel.value || "0");
  box.querySelectorAll("[data-snap]").forEach((b) => b.classList.toggle("is-on", b.dataset.snap === v));
}

let openPop = null, popPrevFocus = null;
export function closeSetupPop() {
  if (!openPop) return;
  const { panel, anchor, home } = openPop;
  const nestStop = $("nestStop");
  if (panel && panel.id === "nestBox" && nestStop && !nestStop.classList.contains("hidden")) return;
  panel.classList.remove("is-setup-pop");
  panel.style.left = ""; panel.style.top = ""; panel.style.position = "";
  if (home && home.parent && panel.parentNode !== home.parent) home.parent.insertBefore(panel, home.next);
  if (panel.id === "originCard" || panel.id === "nestBox") {
    if (panel.tagName === "DETAILS") panel.open = false;
  }
  if (anchor) anchor.setAttribute("aria-expanded", "false");
  openPop = null;
  if (popPrevFocus && typeof popPrevFocus.focus === "function") {
    try { popPrevFocus.focus(); } catch (e) { /* ignore */ }
  }
  popPrevFocus = null;
}

export function openSetupPop(anchor, panel) {
  if (!anchor || !panel) return;
  if (openPop && openPop.panel === panel) { closeSetupPop(); return; }
  closeSetupPop();
  popPrevFocus = document.activeElement;
  const home = { parent: panel.parentNode, next: panel.nextElementSibling };
  document.body.appendChild(panel);
  if (panel.tagName === "DETAILS") panel.open = true;
  panel.classList.add("is-setup-pop");
  panel.style.position = "fixed";
  panel.style.visibility = "hidden";
  // measure then place
  requestAnimationFrame(() => {
    const ar = anchor.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const stop = $("btnStop") && $("btnStop").getBoundingClientRect();
    let left = ar.left;
    let top = ar.bottom + 6;
    if (left + pr.width > innerWidth - 8) left = Math.max(8, innerWidth - pr.width - 8);
    if (top + pr.height > innerHeight - 8) top = Math.max(8, ar.top - pr.height - 6);
    if (stop && stop.width) {
      const overlap = left < stop.right + 8 && left + pr.width > stop.left - 8 && top < stop.bottom + 8 && top + pr.height > stop.top - 8;
      if (overlap) left = Math.max(8, stop.left - pr.width - 12);
    }
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.visibility = "";
    const focusable = panel.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusable) focusable.focus();
  });
  if (anchor) anchor.setAttribute("aria-expanded", "true");
  openPop = { anchor, panel, home };
}

function bindPops() {
  const nestBtn = $("btnNestPop"), nest = $("nestBox");
  if (nestBtn && nest) {
    nestBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!isSetupLaptop()) {
        nest.open = !nest.open;
        return;
      }
      openSetupPop(nestBtn, nest);
    });
  }
  const originBtn = $("btnOriginOpts"), origin = $("originCard");
  if (originBtn && origin) {
    originBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openSetupPop(originBtn, origin);
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openPop) { e.preventDefault(); closeSetupPop(); }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!openPop) return;
    if (openPop.panel.contains(e.target) || (openPop.anchor && openPop.anchor.contains(e.target))) return;
    if (e.target.closest && e.target.closest("#btnStop")) return;
    closeSetupPop();
  });
}

function bindGridSnap() {
  const box = $("gridSnap"), sel = $("layGrid");
  if (!box || !sel) return;
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-snap]"); if (!b) return;
    sel.value = b.dataset.snap;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    syncGridSnap();
  });
  sel.addEventListener("change", syncGridSnap);
  syncGridSnap();
}

function bindBeforeCut() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".beforecut-link");
    if (!b) return;
    if (b.dataset.before === "cutStatus") {
      const btn = $("cutStatus");
      if (btn) btn.click();
    }
  });
}

function paintGapTip() {
  const tip = $("gapInfo"), note = $("sheetNote");
  if (tip && note) {
    const text = (note.textContent || "").trim();
    if (text) tip.setAttribute("data-tip", text);
  }
}

export function bindSetupLayout() {
  bindBeforeCut();
  bindPops();
  bindGridSnap();
  const apply = () => { placeSetupColumns(); paintGapTip(); };
  apply();
  try { window.matchMedia(SETUP_LAPTOP_MQ).addEventListener("change", apply); } catch (e) { /* placed once */ }
  window.addEventListener("resize", () => { placeLayoutToolbar(); });
}

export { paintGapTip };

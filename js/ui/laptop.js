// Laptop chrome (wide, fine pointer) and the phone "turn sideways" hint.
import { getPrefs, savePrefs } from "../core/prefs.js";
import { $ } from "../core/dom.js";
import { screen } from "./flow.js";
import { renderQuickBar } from "../core/hooks.js";

const LAPTOP_MQ = "(min-width: 900px) and (pointer: fine)";

export function isLaptopUi() {
  try { return !!(window.matchMedia && window.matchMedia(LAPTOP_MQ).matches); }
  catch (e) { return false; }
}
export function clickVerb() { return isLaptopUi() ? "Click" : "Tap"; }
export function clickVerbLower() { return isLaptopUi() ? "click" : "tap"; }

export function syncLaptopUi() {
  document.body.classList.toggle("laptop-ui", isLaptopUi());
  paintSidewaysHint();
}

const SHELL_MQ = "(min-width: 1280px) and (hover: hover) and (pointer: fine)";
export function isShellLaptop() {
  try { return !!(window.matchMedia && window.matchMedia(SHELL_MQ).matches); }
  catch (e) { return false; }
}

function safeInsert(parent, el, before) {
  if (!parent || !el) return;
  const ref = (before && before.parentNode === parent) ? before : null;
  if (el.parentNode === parent && el.nextElementSibling === ref) return;
  // If the stored neighbour has moved, append rather than throw or skip, so tools are not left behind.
  try { parent.insertBefore(el, ref); } catch (e) {
    if (el.parentNode !== parent) parent.appendChild(el);
  }
}
function placeNode(el, homeKey, parent, before) {
  if (!el) return;
  if (!homeKey.ref) homeKey.ref = { parent: el.parentNode, next: el.nextElementSibling };
  if (parent && el.parentNode !== parent) safeInsert(parent, el, before || null);
}
function restoreNode(el, homeKey) {
  const h = homeKey.ref;
  if (!el || !h || !h.parent) return;
  safeInsert(h.parent, el, h.next);
}
function tuckSelectSnap(onAdv) {
  const selPop = $("makeSelectPop"), snapPop = $("makeSnapPop");
  const selWrap = $("makeSelectWrap"), snapWrap = $("makeSnapWrap");
  const all = $("skAll"), clr = $("skClear"), snap = $("skSnap"), guides = $("skGuides");
  const tools = document.querySelector(".sktools");
  const opts = document.querySelector(".skopts");
  if (selWrap) selWrap.classList.toggle("hidden", !onAdv);
  const snapWas = !!snapWrap && !snapWrap.classList.contains("hidden");
  if (snapWrap) snapWrap.classList.toggle("hidden", !onAdv);
  // r15 4.20: the rail leaves Snap out only while the header's Snap ▾ shows, so draw the rail again when that changes
  if (snapWrap && snapWas !== onAdv) queueMicrotask(() => { try { renderQuickBar(); } catch (e) { /* not ready yet */ } });
  if (onAdv && selPop && snapPop) {
    if (all) safeInsert(selPop, all, null);
    if (clr) safeInsert(selPop, clr, null);
    const snapLab = snap && snap.closest("label");
    if (snapLab) safeInsert(snapPop, snapLab, null);
    const guideLab = guides && guides.closest("label");
    if (guideLab) safeInsert(snapPop, guideLab, null);
  } else {
    if (tools && all) safeInsert(tools, all, ($("skFit") && $("skFit").nextElementSibling) || null);
    if (tools && clr) safeInsert(tools, clr, null);
    if (opts && snap) {
      const snapLab = snap.closest("label");
      if (snapLab) safeInsert(opts, snapLab, opts.firstChild);
    }
    if (opts && guides) {
      const guideLab = guides.closest("label");
      if (guideLab) safeInsert(opts, guideLab, null);
    }
  }
}

// r15 8.2 (Josh 22 Nov, "Yes to 8.2"): the laptop chrome's DOM moves are one table. Each row says which element moves, when
// it sits in its laptop place, where that is, and what it goes before; otherwise it goes back where the page put it. Rows are
// placed in table order and put back in reverse order, so a row can rely on the rows above it already being in place.
const homes = new Map();
function laptopState() {
  const b = document.body, shell = isShellLaptop(), make = b.dataset.screen === "make";
  const bar = $("makeBar");
  return {
    bar, top: document.querySelector(".topbar"),
    tools: document.querySelector("#srcShape .sktools") || document.querySelector(".sktools"),
    opts: document.querySelector("#srcShape .skopts") || document.querySelector(".skopts"),
    tabs: document.querySelector(".topbar .tabs") || document.querySelector("header .tabs") || document.querySelector(".tabs"),
    pin: $("qbPinned"),
    onBar: shell && make && !b.classList.contains("header-hidden"),
    onAdv: !!(bar && shell && make && (b.classList.contains("pro-mode") || b.classList.contains("advanced-mode"))),
  };
}
const MOVES = [
  // the Make bar joins the header, before STOP (r12)
  { id: "makeBar", el: (c) => c.bar, need: (c) => !!(c.bar && c.top), when: (c) => c.onBar, to: (c) => c.top, before: () => $("btnStop") || null },
  // Advanced: the sketch tools, then the sketch options, ride in the Make bar after the pinned tools
  { id: "sktools", el: (c) => c.tools, when: (c) => c.onAdv, to: (c) => c.bar, before: (c) => (c.pin ? c.pin.nextElementSibling : c.bar.firstChild) },
  { id: "skopts", el: (c) => c.opts, when: (c) => c.onAdv, to: (c) => c.bar, before: (c) => (c.tools ? c.tools.nextElementSibling : (c.pin ? c.pin.nextElementSibling : null)) },
  // the Cut header is a two-row grid (menu + STOP, then Part / Setup / Cut / Layout); .tabs always stays home, or Layout
  // lands on the connection chip's row and they overlap at 1280
  { id: "tabs", el: (c) => c.tabs, when: () => false },
];
export function placeMakeBar() {
  const c = laptopState();
  const home = (m) => { if (!homes.has(m.id)) homes.set(m.id, { ref: null }); return homes.get(m.id); };
  const live = MOVES.filter((m) => m.el(c) && (!m.need || m.need(c)));
  const placed = live.filter((m) => m.when(c)), back = live.filter((m) => !m.when(c)).reverse();
  for (const m of placed) placeNode(m.el(c), home(m), m.to(c), m.before(c));
  for (const m of back) restoreNode(m.el(c), home(m));
  tuckSelectSnap(c.onAdv);
}

function closeHeadPops() {
  for (const id of ["makeSelectPop", "makeSnapPop"]) {
    const pop = $(id);
    if (!pop) continue;
    pop.classList.add("hidden");
    pop.hidden = true;
  }
  for (const id of ["btnSelectMenu", "btnSnapMenu"]) {
    const b = $(id);
    if (b) b.setAttribute("aria-expanded", "false");
  }
}
function bindHeadMenus() {
  const toggle = (btnId, popId) => {
    const btn = $(btnId), pop = $(popId);
    if (!btn || !pop || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = pop.classList.contains("hidden");
      closeHeadPops();
      if (open) {
        pop.classList.remove("hidden");
        pop.hidden = false;
        btn.setAttribute("aria-expanded", "true");
      }
    });
  };
  toggle("btnSelectMenu", "makeSelectPop");
  toggle("btnSnapMenu", "makeSnapPop");
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".head-dd")) return;
    closeHeadPops();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeHeadPops(); });
}

export function bindLaptopUi() {
  syncLaptopUi();
  placeMakeBar();
  bindHeadMenus();
  try {
    const mq = window.matchMedia(LAPTOP_MQ);
    const on = () => { syncLaptopUi(); placeMakeBar(); };
    if (mq.addEventListener) mq.addEventListener("change", on);
    else if (mq.addListener) mq.addListener(on);
    const shell = window.matchMedia(SHELL_MQ);
    if (shell.addEventListener) shell.addEventListener("change", placeMakeBar);
    else if (shell.addListener) shell.addListener(placeMakeBar);
  } catch (e) { /* older engines */ }
  window.addEventListener("resize", () => paintSidewaysHint());
  window.addEventListener("orientationchange", () => paintSidewaysHint());
  const btn = $("sidewaysHintDismiss");
  if (btn) btn.addEventListener("click", () => {
    savePrefs({ dismissSideways: true });
    paintSidewaysHint();
  });
  try {
    new MutationObserver(() => { paintSidewaysHint(); placeMakeBar(); }).observe(document.body, { attributes: true, attributeFilter: ["data-screen", "class"] });
  } catch (e) { /* ignore */ }
}

// Small dismissable hint on a phone in portrait, on Make only: on the cutting screen it would sit on Pause / More / Start
// (r7 U2), and Bed & start upright already has its own turn-sideways cover.
export function paintSidewaysHint() {
  const el = $("sidewaysHint");
  if (!el) return;
  const onPhone = document.body.classList.contains("phone-ui");
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const scr = typeof screen === "function" ? screen() : document.body.dataset.screen;
  const allowed = scr === "make";
  const dismissed = !!getPrefs().dismissSideways;
  const show = onPhone && portrait && allowed && !dismissed;
  el.classList.toggle("hidden", !show);
  el.hidden = !show;
  el.setAttribute("aria-hidden", show ? "false" : "true");
}

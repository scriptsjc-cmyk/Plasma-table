// Laptop chrome (wide, fine pointer) and the phone "turn sideways" hint.
import { getPrefs, savePrefs } from "../core/prefs.js";
import { $ } from "../core/dom.js";
import { screen } from "./flow.js";

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

let makeHome = null, tabsHome = null, skToolsHome = null, skOptsHome = null;
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
export function placeMakeBar() {
  const bar = $("makeBar");
  const tabs = document.querySelector(".topbar .tabs") || document.querySelector("header .tabs") || document.querySelector(".tabs");
  const top = document.querySelector(".topbar");
  const stop = $("btnStop");
  if (bar && top) {
    if (!makeHome) makeHome = { ref: null };
    const on = isShellLaptop() && document.body.dataset.screen === "make" && !document.body.classList.contains("header-hidden");
    if (on) placeNode(bar, makeHome, top, stop || null);
    else restoreNode(bar, makeHome);
  }
  const tools = document.querySelector("#srcShape .sktools") || document.querySelector(".sktools");
  const opts = document.querySelector("#srcShape .skopts") || document.querySelector(".skopts");
  const pin = $("qbPinned");
  const onAdv = !!(bar && isShellLaptop() && document.body.dataset.screen === "make" && (document.body.classList.contains("pro-mode") || document.body.classList.contains("advanced-mode")));
  if (onAdv) {
    if (tools) {
      if (!skToolsHome) skToolsHome = { ref: null };
      placeNode(tools, skToolsHome, bar, pin ? pin.nextElementSibling : bar.firstChild);
    }
    if (opts) {
      if (!skOptsHome) skOptsHome = { ref: null };
      placeNode(opts, skOptsHome, bar, tools ? tools.nextElementSibling : (pin ? pin.nextElementSibling : null));
    }
  } else {
    if (opts) {
      if (!skOptsHome) skOptsHome = { ref: null };
      restoreNode(opts, skOptsHome);
    }
    if (tools) {
      if (!skToolsHome) skToolsHome = { ref: null };
      restoreNode(tools, skToolsHome);
    }
  }
  // The Cut header is a two-row grid: menu + STOP on row 1, .tabs (Part / Setup / Cut / Layout) on row 2.
  // Moving .tabs into .topbar-main puts Layout on the same row as the connection chip and they overlap at 1280.
  if (tabs) {
    if (!tabsHome) tabsHome = { ref: null };
    restoreNode(tabs, tabsHome);
  }
}

export function bindLaptopUi() {
  syncLaptopUi();
  placeMakeBar();
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

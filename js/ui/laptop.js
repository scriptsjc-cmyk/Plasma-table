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

export function bindLaptopUi() {
  syncLaptopUi();
  try {
    const mq = window.matchMedia(LAPTOP_MQ);
    const on = () => syncLaptopUi();
    if (mq.addEventListener) mq.addEventListener("change", on);
    else if (mq.addListener) mq.addListener(on);
  } catch (e) { /* older engines */ }
  window.addEventListener("resize", () => paintSidewaysHint());
  window.addEventListener("orientationchange", () => paintSidewaysHint());
  const btn = $("sidewaysHintDismiss");
  if (btn) btn.addEventListener("click", () => {
    savePrefs({ dismissSideways: true });
    paintSidewaysHint();
  });
  try {
    new MutationObserver(() => paintSidewaysHint()).observe(document.body, { attributes: true, attributeFilter: ["data-screen", "class"] });
  } catch (e) { /* ignore */ }
}

// Small dismissable hint on a phone in portrait, on Make and Cut only.
export function paintSidewaysHint() {
  const el = $("sidewaysHint");
  if (!el) return;
  const onPhone = document.body.classList.contains("phone-ui");
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const scr = typeof screen === "function" ? screen() : document.body.dataset.screen;
  const allowed = scr === "make" || scr === "cut";
  const dismissed = !!getPrefs().dismissSideways;
  const show = onPhone && portrait && allowed && !dismissed;
  el.classList.toggle("hidden", !show);
  el.hidden = !show;
  el.setAttribute("aria-hidden", show ? "false" : "true");
}

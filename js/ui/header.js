// Hide the top header (logo, account, settings) on Make and Cut.
// STOP never hides, moves, or shrinks: it stays a sibling of .topbar-main.
import { $ } from "../core/dom.js";
import { applyChrome, getPrefs, savePrefs } from "../core/prefs.js";

export function headerHidden() { return !!getPrefs().hideHeader; }

export function setHeaderHidden(on) {
  savePrefs({ hideHeader: !!on });
  applyChrome();
  syncHeaderButtons();
}

export function syncHeaderButtons() {
  const hidden = headerHidden();
  const show = $("btnShowHeader"), hide = $("btnHideHeader"), stop = $("btnStop");
  if (show) { show.classList.toggle("hidden", !hidden); show.hidden = !hidden; }
  if (hide) { hide.classList.toggle("hidden", hidden); hide.hidden = hidden; }
  // Never allow a style or class to hide or shrink STOP.
  if (stop) {
    stop.hidden = false;
    stop.classList.remove("hidden");
    stop.style.removeProperty("display");
    stop.style.removeProperty("visibility");
    stop.style.removeProperty("width");
    stop.style.removeProperty("height");
    stop.style.removeProperty("transform");
  }
}

export function bindHeader() {
  const hide = $("btnHideHeader"), show = $("btnShowHeader");
  if (hide) hide.onclick = () => setHeaderHidden(true);
  if (show) show.onclick = () => setHeaderHidden(false);
  syncHeaderButtons();
}

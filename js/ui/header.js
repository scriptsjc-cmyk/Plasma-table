// Hide the whole Porta Plazma account bar on Make and Cut. A faint logo in the corner brings it back.
// On Cut, STOP stays a fixed floating control (same size, top-right). On Make it can hide with the
// bar unless a machine is connected or a job is running, in which case it floats too.
import { $ } from "../core/dom.js";
import { applyChrome, getPrefs, savePrefs } from "../core/prefs.js";
import { S } from "../core/state.js";

export function headerHidden() { return !!getPrefs().hideHeader; }

function stopMustFloat() {
  const scr = (document.body && document.body.dataset && document.body.dataset.screen) || "";
  if (scr === "cut") return true;
  if (scr === "make" && S && (S.connected || (S.job && S.job.running))) return true;
  return false;
}

export function setHeaderHidden(on) {
  savePrefs({ hideHeader: !!on });
  applyChrome();
  syncHeaderButtons();
}

export function syncHeaderButtons() {
  const hidden = headerHidden();
  const show = $("btnShowHeader"), hide = $("btnHideHeader"), stop = $("btnStop");
  if (document.body) document.body.classList.toggle("header-stop-float", !!(hidden && stopMustFloat()));
  if (show) { show.classList.toggle("hidden", !hidden); show.hidden = !hidden; }
  if (hide) { hide.classList.toggle("hidden", hidden); hide.hidden = hidden; }
  // Never allow a style or class to hide or shrink STOP when it must stay up.
  if (stop && hidden && stopMustFloat()) {
    stop.hidden = false;
    stop.classList.remove("hidden");
    stop.style.removeProperty("display");
    stop.style.removeProperty("visibility");
    stop.style.removeProperty("width");
    stop.style.removeProperty("height");
    stop.style.removeProperty("transform");
    const r = stop.getBoundingClientRect();
    const w = Math.ceil(r.width || 0);
    if (w) document.documentElement.style.setProperty("--stop-float-w", w + "px");
    else document.documentElement.style.removeProperty("--stop-float-w");
  } else {
    document.documentElement.style.removeProperty("--stop-float-w");
  }
}

export function bindHeader() {
  const hide = $("btnHideHeader"), show = $("btnShowHeader");
  if (hide) hide.onclick = () => setHeaderHidden(true);
  if (show) show.onclick = () => setHeaderHidden(false);
  syncHeaderButtons();
  try {
    new MutationObserver(() => syncHeaderButtons()).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
  } catch (e) { /* older engines: refresh() will still sync */ }
}

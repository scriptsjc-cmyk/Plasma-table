// The "why is this off" tip that appears when you press a switched-off control.
import { $ } from "../core/dom.js";
import { H } from "./host.js";

// ================================================================ greyed-out controls say why (tap anywhere)
// Reasons already live on the control as data-why + aria-disabled="true" (whyOff() lives in ui/gate.js).
let whyTimer = 0;
function whyMessage(el) {
  const why = (el.getAttribute("data-why") || "").trim();
  if (!why) return "";
  const label = (el.dataset.label || "").trim();
  if (!label) return why.endsWith(".") ? why : why + ".";
  const short = label.replace(/\s*\([^)]*\)\s*$/, "");
  return short + " is off: " + (why.endsWith(".") ? why : why + ".");
}
function placeWhyTip(el, anchor) {
  const stop = $("btnStop");
  const sr = stop ? stop.getBoundingClientRect() : null;
  el.style.left = "0px"; el.style.top = "0px";
  const w = el.offsetWidth, h = el.offsetHeight;
  const r = anchor.getBoundingClientRect();
  let left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  const hits = (t, l) => sr && !(l + w < sr.left || l > sr.right || t + h < sr.top || t > sr.bottom);
  if (hits(top, left)) {
    const below = sr.bottom + 6;
    const above = sr.top - h - 6;
    top = below + h <= innerHeight - 8 ? below : Math.max(8, above);
    if (hits(top, left)) left = Math.max(8, sr.left - w - 8);
  }
  el.style.left = left + "px";
  el.style.top = top + "px";
}
function showWhy(text, anchor) {
  const tip = $("whyTip");
  const inline = $("qbWhy");
  if (inline) {
    const inBar = anchor && anchor.closest("#quickBar");
    if (inBar) { inline.textContent = text; inline.classList.remove("hidden"); }
    else inline.classList.add("hidden");
  }
  if (!tip) { if (H) H.toast(text); return; }
  tip.textContent = text;
  tip.classList.remove("hidden");
  if (anchor && anchor.getBoundingClientRect) placeWhyTip(tip, anchor);
  else { tip.style.left = "50%"; tip.style.top = ""; tip.style.bottom = "24px"; tip.style.transform = "translateX(-50%)"; }
  if (anchor) tip.style.transform = "";
  clearTimeout(whyTimer);
  whyTimer = setTimeout(() => { tip.classList.add("hidden"); if (inline) inline.classList.add("hidden"); }, 4500);
}
export function bindWhy() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[aria-disabled='true'][data-why]");
    if (!b) return;
    const text = whyMessage(b);
    if (!text) return;
    e.preventDefault();
    e.stopPropagation();
    showWhy(text, b);
  }, true);
}

// Laptop cutting screen (r7 J12): the empty space in the tab row next to Cut / Machine setup holds, after a divider, the step bar
// (moved in from above the picture, so the picture gets that height), the start-point state, the Space = STOP hint and the Layout
// button (js/cut/cutpanels.js). Phones and touch tablets keep the step bar where it was and never see the row (css/screen-cut.css).
import { $ } from "../core/dom.js";
import { S } from "../core/state.js";

export const LAPTOP_CUT_MQ = "(min-width: 1100px) and (min-height: 560px) and (hover: hover) and (pointer: fine)";
export function isLaptopCut() { try { return window.matchMedia(LAPTOP_CUT_MQ).matches; } catch (e) { return false; } }

let home = null;                 // where the step bar sits when it is not in the tab row
function placeStepper() {
  const st = $("stepper"), slot = $("cutBarSteps"); if (!st || !slot) return;
  if (!home) home = { parent: st.parentNode, next: st.nextElementSibling };
  if (isLaptopCut()) { if (st.parentNode !== slot) slot.appendChild(st); }
  else if (st.parentNode !== home.parent) home.parent.insertBefore(st, home.next);
}
export function paintCutBar() {
  const el = $("cutBarStart"); if (!el) return;
  const state = !S.connected ? "off" : S.zeroSet ? "set" : "unset";
  const text = { off: "Not connected", set: "Start point set ✓", unset: "Start point not set" }[state];
  if (el.textContent !== text) el.textContent = text;
  el.dataset.state = state;
}
export function bindCutBar() {
  placeStepper();
  try { window.matchMedia(LAPTOP_CUT_MQ).addEventListener("change", placeStepper); } catch (e) { /* older engines: placed once */ }
}

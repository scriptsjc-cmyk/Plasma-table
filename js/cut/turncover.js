// The portrait "turn your phone sideways" cover on Bed & start (css/screen-cut.css): "Use it upright" hides it until the next visit.
import { $ } from "../core/dom.js";

export function bindTurnCover() {
  const b = $("btnTurnUpright");
  if (b) b.onclick = () => document.body.classList.add("turn-upright");
}

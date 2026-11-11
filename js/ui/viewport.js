// Window size / orientation relayout and the machine-outline toggle.
import { $ } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { drawPreview } from "../cut/preview.js";

export function bindViewport() {
  $("showMach").addEventListener("change", () => {
    S.showMachine = $("showMach").checked;
    try { localStorage.setItem("plasma.showMachine", S.showMachine ? "1" : "0"); } catch (e) { /* ignore */ }
    drawPreview();
  });
  let layoutTimer = null, lastShort = null;
  const relayout = () => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      const short = matchMedia("(orientation: landscape) and (max-height: 540px)").matches;
      document.body.classList.toggle("short-land", short);
      const changed = short !== lastShort; lastShort = short;
      drawPreview();
      if (sketch && sketch.active && changed) sketch.fitView();
    }, 60);
  };
  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", relayout);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", relayout);
  relayout();
}

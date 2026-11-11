// Escape / Enter / Tab handling for the open dialogs (capture phase, so a dialog wins over the page).
import { acctOverlayOpen } from "../account/uibase.js";
import { closeAccountUi } from "../account/accounthome.js";
import { $ } from "../core/dom.js";
import { S } from "../core/state.js";
import { applyDimEdit, closeDimEdit, closeNumPad, nudgeDimEdit, tabDimEdit } from "../make/dimedit.js";
import { setShapeFs } from "../make/protools.js";
import { closeCad } from "../make/cad.js";
import { closeLibrary, closeVersions } from "../make/library.js";

export function bindDialogKeys() {
  document.addEventListener("keydown", (e) => {
    if (acctOverlayOpen()) {
      // (Esc only closes things. The space bar is the one STOP key: flow.js)
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); closeAccountUi(); }
      return;
    }
    if ($("dimEdit") && !$("dimEdit").classList.contains("hidden")) {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); applyDimEdit(); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeDimEdit(); return; }
      if (e.key === "Tab") { e.preventDefault(); e.stopPropagation(); tabDimEdit(); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); nudgeDimEdit(1); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); nudgeDimEdit(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); nudgeDimEdit(1); return; }
      if (e.target && e.target.id === "dimEditInput") return;
      e.stopPropagation();
      return;
    }
    if (S.shapeFs && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setShapeFs(false); return; }
    if (!$("numPad").classList.contains("hidden")) {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if ($("numPad")._apply) $("numPad")._apply(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeNumPad(); }
      else if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); const el = $("numPadValue"); if ($("numPad")._cur) { el.textContent = ""; $("numPad")._cur = false; } else el.textContent = el.textContent.slice(0, -1); }
      else if (/^[0-9.+\-*/()]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); const el = $("numPadValue"); if ($("numPad")._cur) { el.textContent = ""; $("numPad")._cur = false; } el.textContent += e.key; }
      else e.stopPropagation();
      return;
    }
    if (!$("cadDialog").classList.contains("hidden") && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); closeCad(); return; }
    if ((!$("shapeLib").classList.contains("hidden") || !$("verPop").classList.contains("hidden")) && e.key === "Escape") {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (!$("shapeLib").classList.contains("hidden")) closeLibrary();
      if (!$("verPop").classList.contains("hidden")) closeVersions();
      return;
    }
  }, true);
}

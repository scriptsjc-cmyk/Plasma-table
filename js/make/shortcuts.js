// Keyboard shortcut sheet and tool search (C49). Space is STOP, never a shortcut or pan.
import { $ } from "../core/dom.js";
import { focusToolSearch } from "./quickbar.js";

export const CAD_SHORTCUTS = [
  { keys: "S", does: "Snap on or off (remembers the last step)" },
  { keys: "F", does: "Fit the drawing in the view" },
  { keys: "R", does: "Rectangle — click and drag to size" },
  { keys: "C", does: "Circle — click and drag to size" },
  { keys: "L", does: "Draw outline" },
  { keys: "D", does: "Measure" },
  { keys: "M", does: "Select / move" },
  { keys: "H", does: "Mirror left–right" },
  { keys: "V", does: "Mirror up–down" },
  { keys: "Ctrl+D", does: "Duplicate the selection" },
  { keys: "Ctrl+J", does: "Join selected parts" },
  { keys: "Ctrl+Z / Ctrl+Y", does: "Undo / redo" },
  { keys: "Del", does: "Delete the selection" },
  { keys: "Arrow keys", does: "Nudge the selection (Shift = 10 mm, Alt = 0.1 mm)" },
  { keys: "Ctrl+K or /", does: "Search tools" },
  { keys: "?", does: "Show this shortcut list" },
  { keys: "Esc", does: "Cancel the current tool or clear the selection" },
  { keys: "Space", does: "STOP the machine — never pans, never searches" },
];

export function shortcutSheetOpen() {
  const el = $("shortcutSheet");
  return !!(el && !el.classList.contains("hidden") && !el.hidden);
}

export function closeShortcutSheet() {
  const el = $("shortcutSheet");
  if (!el) return;
  el.classList.add("hidden");
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
}

export function openShortcutSheet() {
  let el = $("shortcutSheet");
  if (!el) {
    el = document.createElement("div");
    el.id = "shortcutSheet";
    el.className = "cadctx shortcut-sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-labelledby", "shortcutSheetTitle");
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="shortcut-sheet-inner">
    <div class="shortcut-sheet-head">
      <h2 id="shortcutSheetTitle">Keyboard shortcuts</h2>
      <button type="button" id="shortcutSheetClose" class="small" aria-label="Close">✕</button>
    </div>
    <p class="muted small">Space is always STOP. It never pans the drawing and never opens search.</p>
    <table class="shortcut-table"><tbody>${CAD_SHORTCUTS.map((r) =>
      `<tr><th scope="row"><kbd>${r.keys}</kbd></th><td>${r.does}</td></tr>`).join("")}</tbody></table>
  </div>`;
  el.classList.remove("hidden");
  el.hidden = false;
  el.setAttribute("aria-hidden", "false");
  const btn = $("shortcutSheetClose");
  if (btn) btn.onclick = () => closeShortcutSheet();
  el.onclick = (e) => { if (e.target === el) closeShortcutSheet(); };
}

function typingInField() {
  const a = document.activeElement;
  if (!a) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName)) return true;
  return a.isContentEditable;
}

export function bindShortcuts() {
  if (typeof window === "undefined" || window.__cadShortcutsBound) return;
  window.__cadShortcutsBound = true;
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shortcutSheetOpen()) {
      e.preventDefault();
      closeShortcutSheet();
      return;
    }
    if (typingInField()) return;
    if (e.key === " ") return; // STOP — never search or pan
    const ctrl = e.ctrlKey || e.metaKey;
    const k = (e.key || "").toLowerCase();
    if (!ctrl && (e.key === "?" || (k === "/" && e.shiftKey))) {
      e.preventDefault();
      shortcutSheetOpen() ? closeShortcutSheet() : openShortcutSheet();
      return;
    }
    if ((ctrl && k === "k") || (!ctrl && k === "/" && !e.shiftKey)) {
      e.preventDefault();
      closeShortcutSheet();
      focusToolSearch();
    }
  });
}

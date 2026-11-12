// Right-click context menu on the Make canvas (laptop CAD mouse).
import { sketch } from "../core/state.js";
import { $ } from "../core/dom.js";
import { paintLayers } from "./layers.js";

const ITEMS = [
  { id: "move", label: "Move" },
  { id: "dup", label: "Duplicate" },
  { id: "lock", label: "Lock / unlock" },
  { id: "hide", label: "Hide / show" },
  { id: "del", label: "Delete" },
  { id: "props", label: "Properties" },
];

export function closeCtxMenu() {
  const el = $("cadCtxMenu");
  if (el) { el.classList.add("hidden"); el.hidden = true; }
}

export function openCtxMenu(sx, sy, hit) {
  const el = $("cadCtxMenu");
  if (!el || !sketch) return;
  const it = hit && hit.it;
  el.innerHTML = ITEMS.map((item) => {
    const off = !it && item.id !== "props" ? " disabled" : "";
    let label = item.label;
    if (item.id === "lock" && it) label = it.lock ? "Unlock" : "Lock";
    if (item.id === "hide" && it) label = it.hide ? "Show" : "Hide";
    return `<button type="button" class="cadctx-item${off}" data-act="${item.id}" ${!it && item.id !== "props" ? "disabled" : ""}>${label}</button>`;
  }).join("");
  el.classList.remove("hidden");
  el.hidden = false;
  const r = sketch.cv.getBoundingClientRect();
  let left = r.left + sx, top = r.top + sy;
  el.style.left = "0px"; el.style.top = "0px";
  const mw = el.offsetWidth || 180, mh = el.offsetHeight || 200;
  if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  if (top + mh > window.innerHeight - 8) top = window.innerHeight - mh - 8;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
  el.dataset.id = it ? String(it.id) : "";
}

export function bindCtxMenu() {
  const el = $("cadCtxMenu");
  if (!el) return;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const id = Number(el.dataset.id);
    const it = Number.isFinite(id) ? sketch.item(id) : null;
    if (it && !sketch.sel.ids.includes(it.id)) { sketch.pick([it.id]); sketch.onSelect(); }
    if (act === "move") { sketch.setTool(null); }
    else if (act === "dup" && it) sketch.duplicate();
    else if (act === "lock" && it) { it.lock = !it.lock; sketch.draw(); if (sketch.onChange) sketch.onChange(true); }
    else if (act === "hide" && it) { it.hide = !it.hide; sketch.draw(); if (sketch.onChange) sketch.onChange(true); }
    else if (act === "del" && it) sketch.remove();
    else if (act === "props") {
      const pane = $("shapeForm") || $("stepPane");
      if (pane) pane.scrollIntoView({ block: "nearest" });
    }
    paintLayers();
    closeCtxMenu();
  });
  document.addEventListener("pointerdown", (e) => {
    if (el.classList.contains("hidden")) return;
    if (!el.contains(e.target)) closeCtxMenu();
  }, true);
}

// Parts list: every shape and hole, with pick / hide / lock.
import { sketch } from "../core/state.js";
import { $ } from "../core/dom.js";


export function isItemHidden(sk, it) {
  return !!(it && (it.hide || (sk.hiddenLayers && sk.hiddenLayers.has(it.op || "cut"))));
}

export function paintLayers() {
  const list = $("layersList");
  if (!list || !sketch) return;
  const items = sketch.items || [];
  if (!items.length) {
    list.innerHTML = `<li class="muted">No parts on the drawing yet.</li>`;
    return;
  }
  const sel = new Set((sketch.sel && sketch.sel.ids) || []);
  list.innerHTML = items.map((it) => {
    const hole = sketch.isHole && sketch.isHole(it);
    const hidden = !!it.hide;
    const lock = !!it.lock;
    const on = sel.has(it.id) ? " on" : "";
    const name = `${hole ? "Hole" : (it.type || "part")} #${it.id}`;
    return `<li class="layer-row${on}${hidden ? " is-hidden" : ""}${lock ? " is-lock" : ""}" data-id="${it.id}">
      <button type="button" class="layer-pick" data-id="${it.id}" title="Select">${esc(name)}</button>
      <button type="button" class="layer-hide iconbtn" data-id="${it.id}" aria-pressed="${hidden}" title="${hidden ? "Show" : "Hide"}">${hidden ? "○" : "●"}</button>
      <button type="button" class="layer-lock iconbtn" data-id="${it.id}" aria-pressed="${lock}" title="${lock ? "Unlock" : "Lock"}">${lock ? "🔒" : "🔓"}</button>
    </li>`;
  }).join("");
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function bindLayers() {
  const list = $("layersList");
  if (!list) return;
  list.addEventListener("click", (e) => {
    if (!sketch) return;
    const hide = e.target.closest(".layer-hide");
    const lock = e.target.closest(".layer-lock");
    const pick = e.target.closest(".layer-pick, .layer-row");
    const id = Number((hide || lock || pick) && (hide || lock || pick).dataset.id);
    if (!Number.isFinite(id)) return;
    const it = sketch.item(id);
    if (!it) return;
    if (hide) {
      it.hide = !it.hide;
      sketch.draw();
      if (sketch.onChange) sketch.onChange(true);
      paintLayers();
      return;
    }
    if (lock) {
      it.lock = !it.lock;
      sketch.draw();
      if (sketch.onChange) sketch.onChange(true);
      paintLayers();
      return;
    }
    if (pick) {
      sketch.pick([id]);
      sketch.draw();
      sketch.onSelect();
    }
  });
  paintLayers();
}

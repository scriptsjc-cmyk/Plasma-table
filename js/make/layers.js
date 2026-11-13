// Parts list: every shape and hole, with pick / hide / lock.
// Holes that sit in a part are listed under that part (not as peer "Hole #2" parts).
// Dashed outlines on the drawing are those holes; they are still cut in the part.
import { sketch } from "../core/state.js";
import { $ } from "../core/dom.js";
import { shapeDef } from "./sketch-util.js";

function itemName(it) {
  const d = it && shapeDef(it.type);
  const base = (d && d.name) || (it && it.type) || "part";
  return base + " #" + it.id;
}

function rowHtml(it, { under } = {}) {
  const hole = sketch.isHole && sketch.isHole(it);
  const hidden = !!it.hide;
  const lock = !!it.lock;
  const sel = new Set((sketch.sel && sketch.sel.ids) || []);
  const on = sel.has(it.id) ? " on" : "";
  const name = under
    ? `${(shapeDef(it.type) && shapeDef(it.type).name) || it.type} in ${itemName(under)}`
    : itemName(it);
  const title = under
    ? "Dashed on the drawing — this is a hole cut in " + itemName(under) + ", not a separate part."
    : hole ? "This hole is not inside a part yet." : "";
  return `<li class="layer-row${on}${hidden ? " is-hidden" : ""}${lock ? " is-lock" : ""}${under ? " is-hole" : ""}" data-id="${it.id}">
      <button type="button" class="layer-pick" data-id="${it.id}" title="${esc(title || "Select")}">${esc(name)}</button>
      <button type="button" class="layer-hide iconbtn" data-id="${it.id}" aria-pressed="${hidden}" title="${hidden ? "Show" : "Hide"}">${hidden ? "○" : "●"}</button>
      <button type="button" class="layer-lock iconbtn" data-id="${it.id}" aria-pressed="${lock}" title="${lock ? "Unlock" : "Lock"}">${lock ? "🔒" : "🔓"}</button>
    </li>`;
}

export function paintLayers() {
  const list = $("layersList");
  if (!list || !sketch) return;
  const items = sketch.items || [];
  const hint = "Dashed outlines on the drawing are holes cut in a part, not separate parts.";
  if (!items.length) {
    list.innerHTML = `<li class="muted">No parts on the drawing yet.</li>`;
    paintLayersHint("");
    return;
  }
  const parts = items.filter((it) => !(sketch.isHole && sketch.isHole(it)));
  const holes = items.filter((it) => sketch.isHole && sketch.isHole(it));
  const used = new Set();
  let html = "";
  for (const p of parts) {
    html += rowHtml(p);
    for (const h of holes) {
      const host = sketch.hostPart && sketch.hostPart(h);
      if (host && host.id === p.id) { html += rowHtml(h, { under: p }); used.add(h.id); }
    }
  }
  for (const h of holes) if (!used.has(h.id)) html += rowHtml(h);
  list.innerHTML = html;
  paintLayersHint(holes.length ? hint : "");
}

function paintLayersHint(text) {
  const panel = $("layersPanel");
  if (!panel) return;
  let el = $("layersHint");
  if (!el) {
    el = document.createElement("p");
    el.id = "layersHint";
    el.className = "muted small layer-hint";
    const head = panel.querySelector(".layershead");
    if (head && head.nextSibling) panel.insertBefore(el, head.nextSibling);
    else panel.appendChild(el);
  }
  el.textContent = text || "";
  el.hidden = !text;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function openPartsList() {
  const el = $("layersPanel");
  if (!el) return;
  paintLayers();
  el.classList.add("is-open");
  el.hidden = false;
  const close = $("layersClose");
  if (close) close.focus();
}

export function closePartsList() {
  const el = $("layersPanel");
  if (!el) return;
  el.classList.remove("is-open");
}

export function bindLayers() {
  const list = $("layersList");
  if (!list) return;
  const view = $("btnViewParts");
  if (view && !view.dataset.bound) {
    view.dataset.bound = "1";
    view.addEventListener("click", () => {
      const el = $("layersPanel");
      if (el && el.classList.contains("is-open")) closePartsList();
      else openPartsList();
    });
  }
  const close = $("layersClose");
  if (close && !close.dataset.bound) {
    close.dataset.bound = "1";
    close.addEventListener("click", () => closePartsList());
  }
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

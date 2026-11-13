// Customise the Advanced tools toolbar: add, remove and reorder from the full catalogue.
// Saved in localStorage with the other "Make it yours" prefs (keyed by signed-in user when one is known).
// The profiles table has no prefs column, so this is not synced to the cloud account row.
import { getPrefs, savePrefs } from "../core/prefs.js";
import { $ } from "../core/dom.js";

function refreshBar() {
  import("./quickbar.js").then((m) => { try { m.renderQuickBar(); } catch (e) { /* ignore */ } }).catch(() => {});
}

export const TOOL_GROUPS = [
  { g: "Shapes", items: [["presets", "▦", "Preset parts"], ["rect", "▭", "Rectangle"], ["disc", "◯", "Circle"], ["triangle", "△", "Triangle"], ["slot", "⊂⊃", "Slot"], ["sector", "◔", "Arc / sector"], ["lib", "⋯", "All shapes…"]] },
  { g: "Holes", items: [["hole", "◦", "Hole"], ["slothole", "⊖", "Slot hole"], ["boltcircle", "⁘", "Bolt circle"]] },
  { g: "Draw", items: [["draw", "✎", "Draw outline"], ["edge", "⟋", "Edit edge"], ["measure", "📏", "Measure"], ["text", "Aa", "Add text"], ["trace", "▧", "Trace a picture"], ["dims", "↔ mm", "Dimensions"]] },
  { g: "Snaps & constraints", items: [["snap", "⌗", "Snap"]] },
  { g: "Transform", items: [["rot", "⟳", "Turn 90°"], ["mir", "⇋", "Mirror"], ["alignl", "⇤", "Align left"], ["alignb", "⤓", "Align bottom"], ["size", "↔", "Size"], ["resize", "⤡", "Width × height"]] },
  { g: "Boolean & offset", items: [["join", "⊕", "Join (union)"], ["subtract", "⊖", "Cut out"], ["offset", "⧈", "Offset"]] },
  { g: "Arrays", items: [["linarray", "⋯", "Array"], ["polar", "✲", "Circle array"], ["nest", "⊞", "Auto-arrange"]] },
  { g: "Edit", items: [["fillet", "⌒", "Fillet"], ["chamfer", "⌜", "Chamfer"], ["ver", "◈", "Versions"], ["dup", "⧉", "Copy"]] },
  { g: "View", items: [["fs", "⛶", "Full screen"]] },
];

// Always shown next to "Make a part"; not part of the customisable rail.
export const HEADER_TOOLS = [
  ["undo", "↶", "Undo"],
  ["redo", "↷", "Redo"],
  ["fit", "⤢", "Fit"],
  ["del", "🗑", "Delete"],
];

const TOOL_INFO = new Map();
for (const grp of TOOL_GROUPS) for (const it of grp.items) TOOL_INFO.set(it[0], { icon: it[1], label: it[2], group: grp.g });
for (const it of HEADER_TOOLS) TOOL_INFO.set(it[0], { icon: it[1], label: it[2], group: "Header" });

export const KNOWN_TOOLS = new Set(TOOL_INFO.keys());

export const DEFAULT_TOOL_IDS = TOOL_GROUPS.flatMap((grp) => grp.items.map((it) => it[0]));

export function toolInfo(id) { return TOOL_INFO.get(id) || null; }

export function sanitizeToolList(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [], seen = new Set();
  for (const id of raw) {
    const k = String(id);
    if (!KNOWN_TOOLS.has(k) || seen.has(k)) continue;
    if (HEADER_TOOLS.some((h) => h[0] === k)) continue; // header tools stay in the header
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function getToolIds() {
  const custom = sanitizeToolList(getPrefs().tools);
  return custom || DEFAULT_TOOL_IDS.slice();
}

export function saveToolIds(ids, userId) {
  const list = sanitizeToolList(ids);
  savePrefs({ tools: list == null ? null : list }, userId);
  return getToolIds();
}

export function resetToolIds(userId) {
  savePrefs({ tools: null }, userId);
  return getToolIds();
}

export function openToolbarCustom() {
  const el = $("toolbarCustom");
  if (!el) return;
  paintToolbarCustom();
  el.hidden = false;
  el.classList.remove("hidden");
  requestAnimationFrame(() => el.classList.add("is-open"));
  el.setAttribute("aria-hidden", "false");
  const close = $("tcClose");
  if (close) close.focus();
}

export function closeToolbarCustom() {
  const el = $("toolbarCustom");
  if (!el) return;
  el.classList.remove("is-open");
  el.setAttribute("aria-hidden", "true");
  const hide = () => { el.hidden = true; el.classList.add("hidden"); };
  setTimeout(hide, 200);
}

function paintToolbarCustom() {
  const mine = $("tcMine");
  const cat = $("tcCatalog");
  if (!mine || !cat) return;
  const ids = getToolIds();
  const on = new Set(ids);
  mine.innerHTML = ids.length
    ? ids.map((id, i) => {
      const info = toolInfo(id) || { icon: "", label: id };
      return `<li class="tc-row" data-id="${id}">
        <span class="tc-lab"><i>${info.icon}</i> ${esc(info.label)}</span>
        <button type="button" class="small" data-tc="up" data-id="${id}" ${i === 0 ? "disabled" : ""} aria-label="Move ${esc(info.label)} up">▲</button>
        <button type="button" class="small" data-tc="down" data-id="${id}" ${i === ids.length - 1 ? "disabled" : ""} aria-label="Move ${esc(info.label)} down">▼</button>
        <button type="button" class="small" data-tc="remove" data-id="${id}" aria-label="Remove ${esc(info.label)}">Remove</button>
      </li>`;
    }).join("")
    : `<li class="muted">Nothing in the toolbar yet. Add tools from the catalogue.</li>`;
  cat.innerHTML = TOOL_GROUPS.map((grp) => {
    const rows = grp.items.map(([id, icon, label]) => {
      const added = on.has(id);
      return `<li class="tc-row${added ? " is-on" : ""}">
        <span class="tc-lab"><i>${icon}</i> ${esc(label)}</span>
        <button type="button" class="small" data-tc="add" data-id="${id}" ${added ? "disabled" : ""}>${added ? "Added" : "Add"}</button>
      </li>`;
    }).join("");
    return `<h3>${esc(grp.g)}</h3><ul class="tc-list">${rows}</ul>`;
  }).join("");
}

function moveId(ids, id, dir) {
  const i = ids.indexOf(id);
  if (i < 0) return ids;
  const j = i + dir;
  if (j < 0 || j >= ids.length) return ids;
  const next = ids.slice();
  const [t] = next.splice(i, 1);
  next.splice(j, 0, t);
  return next;
}

function onCustomClick(e) {
  const btn = e.target.closest("[data-tc]");
  if (!btn || btn.disabled) return;
  const id = btn.dataset.id;
  const act = btn.dataset.tc;
  let ids = getToolIds();
  if (act === "add" && id && !ids.includes(id)) ids = ids.concat([id]);
  else if (act === "remove") ids = ids.filter((x) => x !== id);
  else if (act === "up") ids = moveId(ids, id, -1);
  else if (act === "down") ids = moveId(ids, id, 1);
  else return;
  saveToolIds(ids);
  paintToolbarCustom();
  refreshBar();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function bindToolbarCustom() {
  const el = $("toolbarCustom");
  if (!el || el.dataset.bound === "1") return;
  el.dataset.bound = "1";
  el.addEventListener("click", (e) => {
    if (e.target === el) closeToolbarCustom();
    onCustomClick(e);
  });
  const close = $("tcClose");
  if (close) close.addEventListener("click", () => closeToolbarCustom());
  const reset = $("tcReset");
  if (reset) reset.addEventListener("click", () => {
    resetToolIds();
    paintToolbarCustom();
    refreshBar();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!el.classList.contains("is-open")) return;
    e.preventDefault();
    closeToolbarCustom();
  });
  const openBtn = $("btnCustomiseToolbar");
  if (openBtn) openBtn.addEventListener("click", () => openToolbarCustom());
}

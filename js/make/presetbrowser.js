// Roomy Preset parts browser: categories, search, and a fill-in-numbers form.
import { PRESET_GROUPS, PRESET_SHAPES, presetOrShape, shapeThumb, SHAPE_GROUPS } from "./shapes.js";
import { matchesQuery } from "./library.js";
import { addShapeId } from "./shapeform.js";
import { $ , esc } from "../core/dom.js";
import { S } from "../core/state.js";
import { showSource } from "./useshape.js";

let cat = "all";

export function openPresetBrowser() {
  const el = $("presetBrowser");
  if (!el) return;
  const q = $("pbSearch");
  if (q) q.value = "";
  cat = "all";
  renderPresetBrowser();
  el.classList.remove("hidden");
  el.hidden = false;
  el.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => el.classList.add("is-open"));
  setTimeout(() => { if (q && matchMedia("(pointer: fine)").matches) q.focus(); }, 40);
}

export function closePresetBrowser() {
  const el = $("presetBrowser");
  if (!el) return;
  el.classList.remove("is-open");
  const hide = () => { el.classList.add("hidden"); el.hidden = true; el.setAttribute("aria-hidden", "true"); };
  setTimeout(hide, 180);
  S.uiBlockUntil = Date.now() + 450;
}

function allGroups() {
  // Prefer the new preset categories; also show the original library groups under "All".
  return PRESET_GROUPS && PRESET_GROUPS.length ? PRESET_GROUPS : SHAPE_GROUPS;
}

function renderPresetBrowser() {
  const catsEl = $("pbCats"), grid = $("pbGrid"), qEl = $("pbSearch");
  if (!catsEl || !grid) return;
  const q = (qEl && qEl.value || "").trim();
  const groups = allGroups();
  const cats = [{ id: "all", name: "All" }, ...groups];
  catsEl.innerHTML = cats.map((c) => `<button type="button" data-pbcat="${esc(c.id)}" class="${c.id === cat ? "on" : ""}">${esc(c.name)}</button>`).join("");
  let ids;
  if (cat === "all" || q) {
    const seen = new Set();
    ids = groups.flatMap((g) => g.ids).filter((id) => !seen.has(id) && seen.add(id));
  } else ids = (groups.find((g) => g.id === cat) || { ids: [] }).ids;
  const list = ids.map((id) => presetOrShape(id) || PRESET_SHAPES.find((s) => s.id === id)).filter(Boolean)
    .filter((s) => !q || matchesQuery((s.name + " " + (s.tip || "") + " " + s.id + " " + (s.aka || "")), q));
  grid.innerHTML = list.length
    ? list.map((s) => `<button type="button" class="pb-tile" data-shape="${esc(s.id)}" title="${esc(s.tip || s.name)}">${shapeThumb(s, 96, 72)}<span class="pb-name">${esc(s.name)}</span></button>`).join("")
    : `<p class="muted">No parts match “${esc(q)}”.</p>`;
}

export function bindPresetBrowser() {
  const el = $("presetBrowser");
  if (!el) return;
  if ($("pbClose")) $("pbClose").onclick = () => closePresetBrowser();
  if ($("btnPresetParts")) $("btnPresetParts").onclick = () => openPresetBrowser();
  if ($("pbSearch")) $("pbSearch").addEventListener("input", () => renderPresetBrowser());
  if ($("pbCats")) $("pbCats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pbcat]"); if (!b) return;
    cat = b.dataset.pbcat; renderPresetBrowser();
  });
  if ($("pbGrid")) $("pbGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-shape]"); if (!b) return;
    closePresetBrowser();
    if (S.src !== "shape") showSource("shape");
    addShapeId(b.dataset.shape);
    const form = $("shapeForm") || $("stepPane");
    if (form) form.scrollIntoView({ block: "nearest" });
  });
  el.addEventListener("click", (e) => { if (e.target === el) closePresetBrowser(); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el && !el.classList.contains("hidden")) { e.preventDefault(); closePresetBrowser(); }
  });
}

export { renderPresetBrowser };

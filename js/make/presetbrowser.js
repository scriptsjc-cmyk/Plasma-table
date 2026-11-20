// Roomy Preset parts browser: categories, search, and a fill-in-numbers form.
import { PRESET_GROUPS, PRESET_SHAPES, presetOrShape, shapeThumb, SHAPE_GROUPS } from "./shapes.js";
import { matchesQuery } from "./library.js";
import { addShapeId } from "./shapeform.js";
import { $ , esc } from "../core/dom.js";
import { S } from "../core/state.js";
import { showSource } from "./useshape.js";
import { getPrefs, savePrefs } from "../core/prefs.js";
import { pageSizeFor, slicePage, paintPager, bindPager, bindPagerKeys } from "../ui/pager.js";

let cat = "all";
let page = 1;

export function openPresetBrowser() {
  const el = $("presetBrowser");
  if (!el) return;
  const q = $("pbSearch");
  if (q) q.value = "";
  cat = "all";
  page = 1;
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
  const cats = [{ id: "favs", name: "Favourites" }, { id: "recent", name: "Recent" }, { id: "all", name: "All" }, ...groups];
  catsEl.innerHTML = cats.map((c) => `<button type="button" role="tab" aria-selected="${c.id === cat ? "true" : "false"}" data-pbcat="${esc(c.id)}" class="${c.id === cat ? "on" : ""}" title="${esc(c.name)}">${esc(c.name)}</button>`).join("");
  let ids;
  const favs = listFavs(), recent = listRecent();
  if (cat === "favs") ids = favs.slice();
  else if (cat === "recent") ids = recent.slice();
  else if (cat === "all" || q) {
    const seen = new Set();
    ids = groups.flatMap((g) => g.ids).filter((id) => !seen.has(id) && seen.add(id));
    if (q) for (const s of PRESET_SHAPES) if (s.hidden && !seen.has(s.id) && seen.add(s.id)) ids.push(s.id);
  } else ids = (groups.find((g) => g.id === cat) || { ids: [] }).ids;
  const list = ids.map((id) => presetOrShape(id) || PRESET_SHAPES.find((s) => s.id === id)).filter(Boolean)
    .filter((s) => !q || matchesQuery((s.name + " " + (s.tip || "") + " " + s.id + " " + (s.aka || "")), q));
  const empty = cat === "favs" ? "Star parts to keep them here." : cat === "recent" ? "Parts you pick will show up here." : `No parts match “${esc(q)}”.`;
  const per = pageSizeFor(grid, { minW: 128, minH: 108, gap: 10, fallback: 8 });
  const sliced = slicePage(list, page, per);
  page = sliced.page;
  grid.innerHTML = sliced.items.length
    ? sliced.items.map((s) => {
        const on = favs.includes(s.id);
        return `<div class="pb-tilewrap"><button type="button" class="pb-tile" data-shape="${esc(s.id)}" title="${esc(s.tip || s.name)}">${shapeThumb(s, 96, 72)}<span class="pb-name">${esc(s.name)}</span></button><button type="button" class="pb-fav${on ? " on" : ""}" data-pbfav="${esc(s.id)}" aria-pressed="${on ? "true" : "false"}" title="${on ? "Remove from favourites" : "Add to favourites"}" aria-label="${on ? "Remove from favourites" : "Add to favourites"}">${on ? "★" : "☆"}</button></div>`;
      }).join("")
    : `<p class="muted">${empty}</p>`;
  paintPager($("pbPage"), sliced, `Page ${sliced.page} of ${sliced.pages}`);
  if (!list.length) { const bar = $("pbPage"); if (bar) bar.hidden = true; }
  // Measure after layout so the first open uses a real page size, not the fallback.
  requestAnimationFrame(() => {
    const again = pageSizeFor(grid, { minW: 128, minH: 108, gap: 10, fallback: 8 });
    if (again !== per) renderPresetBrowser();
  });
}

export function listFavs() {
  try { return [...(getPrefs().pbFavs || [])]; } catch (e) { return []; }
}
export function listRecent() {
  try { return [...(getPrefs().pbRecent || [])]; } catch (e) { return []; }
}
export function toggleFav(id) {
  if (!id) return listFavs();
  const cur = listFavs();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, 40);
  try { savePrefs({ pbFavs: next }); } catch (e) { /* headless */ }
  return next;
}
export function rememberRecent(id) {
  if (!id) return listRecent();
  const next = [id, ...listRecent().filter((x) => x !== id)].slice(0, 20);
  try { savePrefs({ pbRecent: next }); } catch (e) { /* headless */ }
  return next;
}

export function bindPresetBrowser() {
  const el = $("presetBrowser");
  if (!el) return;
  if ($("pbClose")) $("pbClose").onclick = () => closePresetBrowser();
  if ($("btnPresetParts")) $("btnPresetParts").onclick = () => openPresetBrowser();
  if ($("pbSearch")) $("pbSearch").addEventListener("input", () => { page = 1; renderPresetBrowser(); });
  if ($("pbCats")) $("pbCats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pbcat]"); if (!b) return;
    cat = b.dataset.pbcat; page = 1; renderPresetBrowser();
  });
  if ($("pbGrid")) $("pbGrid").addEventListener("click", (e) => {
    const fav = e.target.closest("[data-pbfav]");
    if (fav) { e.preventDefault(); e.stopPropagation(); toggleFav(fav.dataset.pbfav); renderPresetBrowser(); return; }
    const b = e.target.closest("[data-shape]"); if (!b) return;
    rememberRecent(b.dataset.shape);
    closePresetBrowser();
    if (S.src !== "shape") showSource("shape");
    addShapeId(b.dataset.shape);
    const form = $("shapeForm") || $("stepPane");
    if (form) form.scrollIntoView({ block: "nearest" });
  });
  el.addEventListener("click", (e) => { if (e.target === el) closePresetBrowser(); });
  bindPager($("pbPage"), () => page, (n) => { page = n; renderPresetBrowser(); });
  const grid = $("pbGrid");
  if (grid && !grid._pbRo && typeof ResizeObserver !== "undefined") {
    let last = 0;
    grid._pbRo = new ResizeObserver(() => {
      const next = pageSizeFor(grid, { minW: 128, minH: 108, gap: 10, fallback: 8 });
      if (next !== last) { last = next; renderPresetBrowser(); }
    });
    grid._pbRo.observe(grid);
  }
  bindPagerKeys(el, () => el && !el.classList.contains("hidden") && !el.hidden, () => page, (n) => { page = n; renderPresetBrowser(); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el && !el.classList.contains("hidden")) { e.preventDefault(); closePresetBrowser(); }
  });
}


export { renderPresetBrowser };

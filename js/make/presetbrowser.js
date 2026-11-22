// Preset parts browser (r16, Josh 22 Nov: fewer near-identical tiles, more explanation).
// Browsing shows one card per FAMILY (presets/families.js). Opening a card shows what the part is for, its starting points
// (the old separate presets) and how to size it for your job; "Use this part" adds the chosen one. Search, Favourites and
// Recent list the starting points themselves, so a part you know by name is one click.
import { PRESET_SHAPES, presetOrShape, shapeThumb, SHAPE_PRESETS } from "./shapes.js";
import { FAMILIES, FAMILY_CATEGORIES, familyById, familyOfShape, pickKey } from "./presets/families.js";
import { matchesQuery } from "./library.js";
import { $, esc } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { showSource } from "./useshape.js";
import { getPrefs, savePrefs } from "../core/prefs.js";
import { slicePage, paintPager, bindPager, bindPagerKeys } from "../ui/pager.js";

let cat = "all";
let page = 1;
let openFam = null;        // the family whose page is open (null = the card grid)
let openPick = 0;          // index of the chosen starting point on that page

const CARD_PAGE = { minW: 150, minH: 120, gap: 10, fallback: 12 };
const TILE_PAGE = { minW: 140, minH: 128, gap: 10, fallback: 8 };

function gridPageSize(grid, dims = CARD_PAGE) {
  if (!grid) return dims.fallback;
  const r = grid.getBoundingClientRect();
  const s = getComputedStyle(grid);
  const padX = (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0);
  const padY = (parseFloat(s.paddingTop) || 0) + (parseFloat(s.paddingBottom) || 0);
  const gap = parseFloat(s.rowGap || s.columnGap || s.gap) || dims.gap;
  const w = Math.max(0, r.width - padX), h = Math.max(0, r.height - padY);
  if (w < 8 || h < 8) return dims.fallback;
  const cols = Math.max(1, Math.floor((w + gap) / (dims.minW + gap)));
  const rows = Math.max(1, Math.floor((h + gap) / (dims.minH + gap)));
  return Math.max(1, cols * rows);
}

// a starting point: the shape plus the starting values that differ from its defaults
function pickShape(pick) {
  const sh = presetOrShape(pick.shape) || PRESET_SHAPES.find((s) => s.id === pick.shape);
  if (!sh) return null;
  if (!pick.p) return sh;
  return { ...sh, presetOf: true, p: { ...(sh.presetOf ? sh.p : {}), ...pick.p } };
}
function pickFromKey(key) {
  for (const f of FAMILIES) for (const p of f.picks) if (pickKey(p) === key) return { fam: f, pick: p };
  const sh = presetOrShape(key);
  return sh ? { fam: familyOfShape(key), pick: { shape: key, label: sh.name } } : null;
}
export function addPick(pick) {
  const pr = SHAPE_PRESETS[pick.shape];
  if (pr) sketch.add(pr.base, false, { ...pr.p, ...(pick.p || {}) });
  else if (pick.p) sketch.add(pick.shape, false, { ...pick.p });
  else sketch.add(pick.shape);
}

export function openPresetBrowser(famId) {
  const el = $("presetBrowser");
  if (!el) return;
  const q = $("pbSearch");
  if (q) q.value = "";
  cat = "all"; page = 1;
  openFam = typeof famId === "string" ? familyById(famId) : null; openPick = 0;
  renderPresetBrowser();
  el.classList.remove("hidden");
  el.hidden = false;
  el.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => el.classList.add("is-open"));
  setTimeout(() => { if (q && !openFam && matchMedia("(pointer: fine)").matches) q.focus(); }, 40);
}

export function closePresetBrowser() {
  const el = $("presetBrowser");
  if (!el) return;
  el.classList.remove("is-open");
  const hide = () => { el.classList.add("hidden"); el.hidden = true; el.setAttribute("aria-hidden", "true"); };
  setTimeout(hide, 180);
  S.uiBlockUntil = Date.now() + 450;
}

function famCard(f) {
  const first = pickShape(f.picks[0]);
  return `<button type="button" class="pb-card" data-fam="${esc(f.id)}" title="${esc(f.what)}">
    <span class="pb-cardpic">${first ? shapeThumb(first, 120, 76) : ""}</span>
    <span class="pb-name pb-cardname">${esc(f.name)}</span>
    <span class="pb-cardcount">${f.picks.length > 1 ? `${f.picks.length} versions` : "1 version"}</span>
  </button>`;
}
function pickTile(key, favs) {
  const hit = pickFromKey(key); if (!hit) return "";
  const sh = pickShape(hit.pick); if (!sh) return "";
  const on = favs.includes(key);
  const name = hit.pick.label || sh.name;
  const sub = hit.fam ? hit.fam.name : "";
  return `<div class="pb-tilewrap"><button type="button" class="pb-tile" data-shape="${esc(hit.pick.shape)}" data-pick="${esc(key)}" title="${esc(sh.tip || sh.name)}">${shapeThumb(sh, 96, 72)}<span class="pb-name" title="${esc(name)}">${esc(name)}</span>${sub ? `<span class="pb-sub">${esc(sub)}</span>` : ""}</button><button type="button" class="pb-fav${on ? " on" : ""}" data-pbfav="${esc(key)}" aria-pressed="${on ? "true" : "false"}" title="${on ? "Remove from favourites" : "Add to favourites"}" aria-label="${on ? "Remove from favourites" : "Add to favourites"}">${on ? "★" : "☆"}</button></div>`;
}

function detailHtml(f, favs) {
  const pick = f.picks[Math.min(openPick, f.picks.length - 1)];
  const sh = pickShape(pick);
  const key = pickKey(pick), on = favs.includes(key);
  return `<div class="pb-detail" data-famopen="${esc(f.id)}">
    <div class="pb-dpic">
      <div class="pb-dthumb">${sh ? shapeThumb(sh, 300, 200) : ""}</div>
      <b class="pb-dpickname">${esc(pick.label)}</b>
      ${sh && sh.tip ? `<p class="pb-dtip">${esc(sh.tip)}</p>` : ""}
    </div>
    <div class="pb-dinfo">
      <div class="pb-dhead"><button type="button" class="pb-back" data-pbback="1">← All parts</button><h3>${esc(f.name)}</h3></div>
      <p class="pb-dwhat">${esc(f.what)}</p>
      <h4>Pick a starting point</h4>
      <div class="pb-picks" role="radiogroup" aria-label="Starting points">${f.picks.map((p, i) =>
        `<button type="button" role="radio" aria-checked="${i === openPick ? "true" : "false"}" class="${i === openPick ? "on" : ""}" data-pickidx="${i}">${esc(p.label)}</button>`).join("")}</div>
      <div class="pb-howto"><h4>How to size it for your job</h4><p>${esc(f.size)}</p></div>
      <div class="pb-dactions">
        <button type="button" class="pb-dfav${on ? " on" : ""}" data-pbfav="${esc(key)}" aria-pressed="${on ? "true" : "false"}">${on ? "★ Favourite" : "☆ Favourite"}</button>
        <button type="button" class="primary pb-use" data-pbuse="1">Use this part</button>
      </div>
    </div>
  </div>`;
}

function renderPresetBrowser() {
  const catsEl = $("pbCats"), grid = $("pbGrid"), qEl = $("pbSearch");
  if (!catsEl || !grid) return;
  const q = (qEl && qEl.value || "").trim();
  const cats = [{ id: "favs", name: "Favourites" }, { id: "recent", name: "Recent" }, { id: "all", name: "All" }, ...FAMILY_CATEGORIES];
  catsEl.innerHTML = cats.map((c) => `<button type="button" role="tab" aria-selected="${c.id === cat ? "true" : "false"}" data-pbcat="${esc(c.id)}" class="${c.id === cat ? "on" : ""}" title="${esc(c.name)}">${esc(c.name)}</button>`).join("");
  const favs = listFavs();
  const bar = $("pbPage");
  grid.classList.toggle("pb-isdetail", !!openFam);
  if (openFam) {                                     // one family's page
    grid.classList.remove("pb-istiles");
    grid.innerHTML = detailHtml(openFam, favs);
    if (bar) bar.hidden = true;
    return;
  }
  let html, count, sliced, dims = CARD_PAGE;
  if (q || cat === "favs" || cat === "recent") {     // starting points as one-click tiles
    dims = TILE_PAGE;
    let keys;
    if (cat === "favs" && !q) keys = favs.slice();
    else if (cat === "recent" && !q) keys = listRecent();
    else {
      keys = [];
      const seen = new Set();
      for (const f of FAMILIES) for (const p of f.picks) {
        const s = presetOrShape(p.shape) || {};
        if (!seen.has(pickKey(p)) && matchesQuery(`${p.label} ${f.name} ${s.name || ""} ${s.aka || ""} ${s.tip || ""} ${p.shape}`, q)) { seen.add(pickKey(p)); keys.push(pickKey(p)); }
      }
      for (const s of PRESET_SHAPES) if (!seen.has(s.id) && !familyOfShape(s.id) && matchesQuery(`${s.name} ${s.tip || ""} ${s.id} ${s.aka || ""}`, q)) { seen.add(s.id); keys.push(s.id); }
    }
    keys = keys.filter((k) => pickFromKey(k));
    count = keys.length;
    sliced = slicePage(keys, page, gridPageSize(grid, dims));
    html = sliced.items.map((k) => pickTile(k, favs));
  } else {                                           // family cards
    const fams = cat === "all" ? FAMILIES : FAMILIES.filter((f) => f.cat === cat);
    count = fams.length;
    sliced = slicePage(fams, page, gridPageSize(grid, dims));
    html = sliced.items.map(famCard);
  }
  page = sliced.page;
  grid.classList.toggle("pb-istiles", dims === TILE_PAGE);
  const empty = cat === "favs" && !q ? "Star a part (☆ on its page or tile) to keep it here." : cat === "recent" && !q ? "Parts you pick will show up here." : `No parts match “${esc(q)}”. Try a simpler word, like bracket, flange or hook.`;
  grid.innerHTML = count ? html.join("") : `<p class="muted">${empty}</p>`;
  paintPager(bar, sliced, `Page ${sliced.page} of ${sliced.pages}`);
  if (!count && bar) bar.hidden = true;
  const per = sliced.size;
  requestAnimationFrame(() => {                      // measure after layout so the first open uses a real page size
    if (openFam) return;
    if (gridPageSize(grid, dims) !== per) renderPresetBrowser();
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

function usePick(pick) {
  rememberRecent(pickKey(pick));
  openFam = null;
  closePresetBrowser();
  if (S.src !== "shape") showSource("shape");
  addPick(pick);
  const form = $("shapeForm") || $("stepPane");
  if (form) form.scrollIntoView({ block: "nearest" });
}

export function bindPresetBrowser() {
  const el = $("presetBrowser");
  if (!el) return;
  if ($("pbClose")) $("pbClose").onclick = () => closePresetBrowser();
  if ($("btnPresetParts")) $("btnPresetParts").onclick = () => openPresetBrowser();
  if ($("pbSearch")) $("pbSearch").addEventListener("input", () => { page = 1; openFam = null; renderPresetBrowser(); });
  if ($("pbCats")) $("pbCats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pbcat]"); if (!b) return;
    cat = b.dataset.pbcat; page = 1; openFam = null;
    if ($("pbSearch")) $("pbSearch").value = "";
    renderPresetBrowser();
  });
  if ($("pbGrid")) $("pbGrid").addEventListener("click", (e) => {
    const fav = e.target.closest("[data-pbfav]");
    if (fav) { e.preventDefault(); e.stopPropagation(); toggleFav(fav.dataset.pbfav); renderPresetBrowser(); return; }
    const card = e.target.closest("[data-fam]");
    if (card) {
      openFam = familyById(card.dataset.fam); openPick = 0; renderPresetBrowser();
      const u = $("pbGrid").querySelector("[data-pbuse]"); if (u && matchMedia("(pointer: fine)").matches) u.focus();
      return;
    }
    if (e.target.closest("[data-pbback]")) { openFam = null; renderPresetBrowser(); return; }
    const pi = e.target.closest("[data-pickidx]");
    if (pi && openFam) {
      openPick = Number(pi.dataset.pickidx) || 0; renderPresetBrowser();
      const b = $("pbGrid").querySelector(`[data-pickidx="${openPick}"]`); if (b) b.focus();
      return;
    }
    if (e.target.closest("[data-pbuse]") && openFam) { usePick(openFam.picks[openPick] || openFam.picks[0]); return; }
    const tile = e.target.closest("[data-pick], [data-shape]"); if (!tile) return;
    const hit = pickFromKey(tile.dataset.pick || tile.dataset.shape);
    if (hit) usePick(hit.pick);
  });
  el.addEventListener("click", (e) => { if (e.target === el) closePresetBrowser(); });
  bindPager($("pbPage"), () => page, (n) => { page = n; renderPresetBrowser(); });
  const grid = $("pbGrid");
  if (grid && !grid._pbRo && typeof ResizeObserver !== "undefined") {
    let last = 0;
    grid._pbRo = new ResizeObserver(() => {
      if (openFam) return;
      const next = gridPageSize(grid, grid.classList.contains("pb-istiles") ? TILE_PAGE : CARD_PAGE);
      if (next !== last) { last = next; renderPresetBrowser(); }
    });
    grid._pbRo.observe(grid);
  }
  bindPagerKeys(el, () => el && !el.classList.contains("hidden") && !el.hidden && !openFam, () => page, (n) => { page = n; renderPresetBrowser(); });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !el || el.classList.contains("hidden")) return;
    e.preventDefault();
    if (openFam) { openFam = null; renderPresetBrowser(); return; }   // Esc on a family page goes back to the cards first
    closePresetBrowser();
  });
}

export { renderPresetBrowser };

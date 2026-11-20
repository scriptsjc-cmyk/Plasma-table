// Fit a list to its box by showing one page of tiles or rows, with no inner scroll.
import { pageTurn } from "./transition.js";
export function pageSizeFor(el, { minW = 160, minH = 140, gap = 12, fallback = 8 } = {}) {
  if (!el) return fallback;
  const r = el.getBoundingClientRect();
  const w = Math.max(0, r.width - 16), h = Math.max(0, r.height - 16);
  if (w < 8 || h < 8) return fallback;
  const cols = Math.max(1, Math.floor((w + gap) / (minW + gap)));
  const rows = Math.max(1, Math.floor((h + gap) / (minH + gap)));
  return Math.max(1, cols * rows);
}

export function slicePage(list, page, size) {
  const n = Array.isArray(list) ? list.length : 0;
  const per = Math.max(1, size || 1);
  const pages = Math.max(1, Math.ceil(n / per) || 1);
  const p = Math.min(Math.max(1, page || 1), pages);
  return { page: p, pages, size: per, items: (list || []).slice((p - 1) * per, p * per) };
}

export function paintPager(el, { page, pages }, label) {
  if (!el) return;
  const p = page, n = pages;
  el.hidden = false;
  el.innerHTML = `<button type="button" class="pagebar-prev" data-page-dir="-1"${p <= 1 ? " disabled" : ""} aria-label="Previous page">‹</button>`
    + `<span class="pagebar-status">${label || `Page ${p} of ${n}`}</span>`
    + `<button type="button" class="pagebar-next" data-page-dir="1"${p >= n ? " disabled" : ""} aria-label="Next page">›</button>`;
}

export function bindPager(el, get, set) {
  if (!el || el.dataset.pagerBound) return;
  el.dataset.pagerBound = "1";
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-page-dir]");
    if (!b || b.disabled) return;
    const dir = Number(b.getAttribute("data-page-dir")), was = get() || 1;
    set(was + dir);
    if ((get() || 1) !== was) pageTurn(el.previousElementSibling, dir);
  });
}

export function bindPagerKeys(host, isOpen, get, set) {
  if (!host || host.dataset.pagerKeys) return;
  host.dataset.pagerKeys = "1";
  host.addEventListener("wheel", (e) => {
    if (!isOpen()) return;
    if (e.deltaY === 0 && e.deltaX === 0) return;
    e.preventDefault();
    set((get() || 1) + (e.deltaY > 0 || e.deltaX > 0 ? 1 : -1));
  }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    if (e.key === "PageDown") { e.preventDefault(); set((get() || 1) + 1); }
    else if (e.key === "PageUp") { e.preventDefault(); set((get() || 1) - 1); }
  });
}

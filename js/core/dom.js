// Tiny DOM and text helpers used everywhere: $ / $$, esc, clock, toast.


export const $ = (id) => document.getElementById(id);
export const themeColor = (name, fallback) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
  catch { return fallback; }
};
export const $$ = (sel) => [...document.querySelectorAll(sel)];
// ------------------------------------------------------------------ small helpers
let toastTimer;
// The bottom of the header, or of the lowest visible safety banner (Alarm / E-stop / link-lost / home) under it.
export function bannerBottom() {
  const topbar = document.querySelector(".topbar");
  let top = topbar ? topbar.getBoundingClientRect().bottom : 56;
  for (const id of ["estopBar", "alarmBar", "lostBar", "homeBar"]) {
    const el = $(id);
    if (!el || el.classList.contains("hidden")) continue;
    const r = el.getBoundingClientRect();
    if (r.height && r.bottom > top) top = r.bottom;
  }
  return top;
}
// A toast sits under the banners so it never covers Alarm / E-stop / link-lost, and under an open safe confirm so it never
// covers the dialog's title or buttons (r7 U6).
export function placeToast() {
  const t = $("toast"); if (!t) return;
  const laptop = window.matchMedia && matchMedia("(min-width: 1200px) and (hover: hover) and (pointer: fine)").matches;
  if (!laptop) {
    // Phones and tablets: just under the header / banners, clear of the bottom actions,
    // and below an open safety dialog so it never covers its title or buttons (r7 U6).
    t.style.bottom = ""; t.style.left = ""; t.style.transform = "";
    let top = bannerBottom();
    const dlg = $("safeDlg"), card = dlg && !dlg.classList.contains("hidden") && dlg.querySelector(".safedlg-card");
    if (card) top = Math.max(top, card.getBoundingClientRect().bottom);
    t.style.top = (top + 8) + "px";
    return;
  }
  // Laptop (r13 #21): bottom-centre, above the bottom edge, never over the header, step tabs or STOP.
  // r15: and never over a control. If bottom-centre would cover one, try the drawing on screen (low, middle, high),
  // the bottom corners and just under the header, then take the spot that covers the fewest. While a modal dialog is
  // open only its own controls (and STOP) count: everything behind it can't be used anyway.
  const W = window.innerWidth;
  const spots = [{ bottom: 24, cx: W / 2 }];
  const modal = openModalCard();
  const cv = modal ? null : [...document.querySelectorAll("canvas")].map((c) => c.getBoundingClientRect())
    .filter((r) => r.width > 200 && r.height > 150 && r.bottom > 0 && r.top < window.innerHeight)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (cv) {
    const cx = (cv.left + cv.right) / 2;
    spots.push({ top: cv.bottom - 64, cx }, { top: (cv.top + cv.bottom) / 2 - 20, cx }, { top: cv.top + 48, cx });
  }
  spots.push({ bottom: 24, cx: 0 }, { bottom: 24, cx: W }, { top: bannerBottom() + 8, cx: W / 2 });
  const stop = $("btnStop"), sr = stop && stop.getBoundingClientRect();
  const hits = (a, b, m = 4) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > m && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > m;
  const controls = [...(modal || document).querySelectorAll("button, input, select, textarea, a[href], [role=button]")].filter((el) => {
    if (t.contains(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }).map((el) => el.getBoundingClientRect());
  let best = null;
  for (const sp of spots) {
    t.style.transform = "none";
    t.style.top = sp.top != null ? Math.round(sp.top) + "px" : "auto";
    t.style.bottom = sp.bottom != null ? sp.bottom + "px" : "auto";
    t.style.left = "0px";
    const w = t.getBoundingClientRect().width;
    t.style.left = Math.round(Math.max(8, Math.min(W - w - 8, sp.cx - w / 2))) + "px";
    const tr = t.getBoundingClientRect();
    const n = controls.filter((r) => hits(r, tr)).length + (sr && hits(sr, tr) ? 1000 : 0);
    if (!best || n < best.n) best = { n, top: t.style.top, bottom: t.style.bottom, left: t.style.left };
    if (n === 0) break;
  }
  Object.assign(t.style, { top: best.top, bottom: best.bottom, left: best.left });
  watchModals();
}
// the open modal dialog, if any (the last one in the page is the one on top)
function openModalCard() {
  const open = [...document.querySelectorAll('[aria-modal="true"]')].filter((el) => !el.classList.contains("hidden") && !el.hidden && el.getClientRects().length > 0);
  return open.length ? open[open.length - 1] : null;
}
// r15 7.3: a dialog that opens while a toast is up must not end up under it — move the toast again when one opens
let modalWatch = null;
const watched = new WeakSet();
function watchModals() {
  if (typeof MutationObserver === "undefined") return;
  if (!modalWatch) modalWatch = new MutationObserver(() => { const t = $("toast"); if (t && !t.classList.contains("hidden")) placeToast(); });
  for (const el of document.querySelectorAll('[aria-modal="true"]')) {
    if (watched.has(el)) continue;
    watched.add(el);
    modalWatch.observe(el, { attributes: true, attributeFilter: ["class", "hidden"] });
  }
}
export function toast(text, err = false) {
  const t = $("toast");
  t.textContent = text;
  t.className = "toast" + (err ? " err" : "");
  placeToast();
  // the action that raised the toast often changes the layout straight after (a panel opens, a tab switches): place it
  // again once that has happened so it doesn't end up over a control that appeared under it
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(() => { if (!t.classList.contains("hidden")) placeToast(); }));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), err ? 6000 : 2500);
}
export function clock(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + ":" + String(r).padStart(2, "0");
}
export function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

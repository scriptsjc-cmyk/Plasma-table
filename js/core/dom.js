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
  // r13: toasts sit bottom-centre, above the bottom edge, and never over the header, step tabs or STOP.
  t.style.top = "auto";
  t.style.bottom = "24px";
  t.style.left = "50%";
  t.style.transform = "translateX(-50%)";
  const stop = $("btnStop");
  if (stop) {
    const sr = stop.getBoundingClientRect(), tr = t.getBoundingClientRect();
    const ox = Math.min(sr.right, tr.right) - Math.max(sr.left, tr.left);
    const oy = Math.min(sr.bottom, tr.bottom) - Math.max(sr.top, tr.top);
    if (ox > 4 && oy > 4) t.style.bottom = Math.max(24, window.innerHeight - sr.top + 12) + "px";
  }
}
export function toast(text, err = false) {
  const t = $("toast");
  t.textContent = text;
  t.className = "toast" + (err ? " err" : "");
  placeToast();
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

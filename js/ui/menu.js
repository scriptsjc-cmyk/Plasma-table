// The top menu and a small scroll fix for the FluidNC box.
import { $ } from "../core/dom.js";

// B5 14: opening the FluidNC (Wi-Fi) box brings its host / port fields clear of the sticky Back / Start bar
export function bindFnScroll() {
  const d = $("fnBox"); if (!d) return;
  d.addEventListener("toggle", () => { if (d.open) setTimeout(() => { try { d.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ } }, 0); });
}
// Narrow header: pills collapse into one menu. STOP and a lit torch stay on the bar.
function closeTopMenu() {
  const bar = document.querySelector(".topbar");
  const btn = $("btnTopMenu");
  if (bar) bar.classList.remove("menu-open");
  if (btn) btn.setAttribute("aria-expanded", "false");
}
export function bindTopMenu() {
  const btn = $("btnTopMenu");
  const bar = document.querySelector(".topbar");
  const menu = $("topMenu");
  if (!btn || !bar || !menu) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const on = !bar.classList.contains("menu-open");
    bar.classList.toggle("menu-open", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
  });
  document.addEventListener("click", (e) => {
    if (!bar.classList.contains("menu-open")) return;
    if (e.target.closest("#btnTopMenu")) return;
    if (e.target.closest("#topMenu")) {
      if (e.target.closest("button, a")) closeTopMenu();
      return;
    }
    closeTopMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTopMenu(); });
}

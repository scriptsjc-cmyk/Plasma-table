// The top menu, the phone cutting screen's "More" sheet and a small scroll fix for the FluidNC box.
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

// ---------------------------------------------------------------- phone "More" sheet on the cutting screen
// On a phone the cutting screen keeps only STOP, the step's main buttons, progress and position in view. Each step's secondary
// controls are MOVED (never copied: same elements, ids and handlers) into #cutSheet while it is open, then put back where they
// were. The sheet sits over the bed picture only. Escape, the close button or leaving the step closes it; Tab stays inside it.
const SHEET_ITEMS = {
  3: ["#btnExport3", "#showMachWrap", "#layoutCard .sheetrow", "#nestBox", "#originCard"],   // r7 U8: + sheet size, nest, saved start points
  4: ["#livePanel", "#lpNote", "#liveSpeedBox", "#runHelp"],
};
const PHONE_MQ = "(max-width: 899px), (orientation: landscape) and (max-height: 540px)";   // = the phone section of css/screen-cut.css
const sheet = { open: false, step: null, running: false, opener: null, moved: [] };
const isRunning = () => document.body.classList.contains("running-job");
const sheetFocusables = () => [...$("cutSheet").querySelectorAll("button, select, input, summary, [tabindex]:not([tabindex='-1'])")]
  .filter((el) => !el.disabled && el.getClientRects().length);
function setExpanded(on) {
  document.querySelectorAll(".cutmore-btn").forEach((b) => b.setAttribute("aria-expanded", on ? "true" : "false"));
}
function closeCutSheet() {
  if (!sheet.open) return;
  for (const { el, mark } of sheet.moved.reverse()) mark.replaceWith(el);   // back to the exact spot it came from
  sheet.moved = []; sheet.open = false; sheet.step = null;
  const box = $("cutSheet"); box.classList.add("hidden"); box.hidden = true;
  document.body.classList.remove("cutsheet-open");
  setExpanded(false);
  const back = sheet.opener; sheet.opener = null;
  if (back && back.getClientRects().length) back.focus();
}
function openCutSheet(opener) {
  const step = Number(document.body.dataset.step);
  const items = SHEET_ITEMS[step];
  if (!items || document.body.dataset.screen !== "cut") return;
  if (sheet.open) closeCutSheet();
  const body = $("cutSheetBody");
  for (const sel of items) {
    const el = document.querySelector(sel); if (!el) continue;
    const mark = document.createComment("cutsheet:" + sel);
    el.replaceWith(mark); body.appendChild(el);
    sheet.moved.push({ el, mark });
  }
  sheet.open = true; sheet.step = step; sheet.running = isRunning(); sheet.opener = opener || null;
  const box = $("cutSheet"); box.hidden = false; box.classList.remove("hidden");
  document.body.classList.add("cutsheet-open");
  setExpanded(true);
  const first = sheetFocusables()[0]; if (first) first.focus();
}
export function bindCutMore() {
  if (!$("cutSheet")) return;
  document.querySelectorAll(".cutmore-btn").forEach((b) => b.addEventListener("click", () => (sheet.open ? closeCutSheet() : openCutSheet(b))));
  $("cutSheetClose").addEventListener("click", closeCutSheet);
  document.addEventListener("keydown", (e) => {
    if (!sheet.open) return;
    if (e.key === "Escape") { e.preventDefault(); closeCutSheet(); return; }
    if (e.key !== "Tab") return;
    const f = sheetFocusables(); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  });
  // a new step or screen, or a job starting or ending (STOP included) puts everything back first
  new MutationObserver(() => {
    if (!sheet.open) return;
    if (document.body.dataset.screen !== "cut" || Number(document.body.dataset.step) !== sheet.step || isRunning() !== sheet.running) closeCutSheet();
  }).observe(document.body, { attributes: true, attributeFilter: ["data-step", "data-screen", "class"] });
  // the phone layout went away (rotated to a wide screen, window made wider): no sheet on the laptop layout
  const phone = matchMedia(PHONE_MQ);
  phone.addEventListener("change", () => { if (!phone.matches) closeCutSheet(); });
}
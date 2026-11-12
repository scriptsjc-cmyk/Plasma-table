// Beginner / Pro mode switch and the account mode that decides it.
import { screen } from "./flow.js";
import { paintSettings } from "../machine/settings.js";
import { paintCutList } from "../cut/cutlist.js";
import { paintStartCut } from "../cut/restart.js";
import * as Acc from "../account/account.js";
import { S, sketch } from "../core/state.js";
import { $$, toast } from "../core/dom.js";
import { renderMatPreset } from "../cut/material.js";
import { paintChrome, paintGuide, renderProTools, renderQuickBar, renderShapeForm, setShapeFs } from "../core/hooks.js";

export function isProMode() {
  return !!(sketch && sketch.opts.pro);
}
// Beginner / Pro only styles the Make-a-part screen. The cutting screen is the same for everyone, so it has neither class.
export function applyBodyMode() {
  const cutting = screen() === "cut", pro = !!(sketch && sketch.opts.pro);
  document.body.classList.toggle("beginner", !cutting && !pro);
  document.body.classList.toggle("pro-mode", !cutting && pro);
  document.body.dataset.mode = pro ? "pro" : "beginner";      // on every screen, for mode-specific wording (Settings); the layout classes above stay Make-only
}
export function syncModeSwitch() {
  const pro = isProMode();
  const mode = pro ? "pro" : "beginner";
  $$("#modeSwitch [data-mode], #topModeSwitch [data-mode]").forEach((b) => b.classList.toggle("sel", b.dataset.mode === mode));
  $$('input[name="acctMode"], input[name="suMode"]').forEach((r) => { r.checked = r.value === mode; });
}
export function setAppMode(mode, opts) {
  const persist = !opts || opts.persist !== false;
  const autoFs = !opts || opts.autoFs !== false;
  const pro = mode === "pro";
  if ((mode === "pro" || mode === "beginner") && sketch) sketch.setPro(pro);
  applyBodyMode();
  syncModeSwitch();
  if (sketch) {
    renderProTools(); renderShapeForm(); renderQuickBar();
    if (autoFs && screen() === "make") {
      const dlgOpen = !!document.querySelector(".acctdlg:not(.hidden), .shapelib:not(.hidden)");
      if (isProMode() && S.src === "shape" && !dlgOpen) setShapeFs(true);
      else if (!isProMode() && S.shapeFs) setShapeFs(false);
    }
  }
  renderMatPreset();
  paintGuide(); paintCutList(); paintStartCut();
  try { paintSettings(); } catch (e) { /* settings not ready */ }
  if (persist && Acc.isSignedIn() && (mode === "pro" || mode === "beginner")) {
    Acc.setMode(mode).catch(proNotAllowed);
  }
  try { paintChrome(); } catch (e) { /* ignore */ }
}
// The server refused Pro for this account (supabase/b5-gating.sql, profiles.pro_allowed = false): go back to Beginner and say why.
function proNotAllowed(e) {
  if (!e || e.code !== "pro_not_allowed") return;
  try { setAppMode("beginner", { persist: false, autoFs: false }); } catch (err) { /* ignore */ }
  toast(e.message, true);
}
export function firmwareDenied() {
  if (Acc.canFirmware()) return false;
  toast(Acc.isAdmin() || Acc.isPro() ? "Firmware tools need a machine linked to your account." : "Pro or admin only", true);
  return true;
}
export function applyAccountMode(mode) {
  if (mode === "pro" || mode === "beginner") setAppMode(mode, { persist: false });
  else setAppMode(isProMode() ? "pro" : "beginner", { persist: false, autoFs: false });
}
export function bindMode() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#modeSwitch [data-mode], #topModeSwitch [data-mode]");
    if (!b) return;
    e.preventDefault();
    setAppMode(b.dataset.mode);
  });
}

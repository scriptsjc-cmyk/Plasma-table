// Simple / Advanced editor on Make a part. The cutting screen is the same for everyone.
// Older Beginner / Pro names are still accepted as aliases and still drive the existing layout classes
// (beginner / pro-mode) so cutting-screen CSS can stay as it is.
import { screen } from "./flow.js";
import { paintSettings } from "../machine/settings.js";
import { paintCutList } from "../cut/cutlist.js";
import { paintStartCut } from "../cut/restart.js";
import * as Acc from "../account/account.js";
import { S, sketch } from "../core/state.js";
import { $, $$, toast } from "../core/dom.js";
import { renderMatPreset } from "../cut/material.js";
import { paintChrome, paintGuide, renderProTools, renderQuickBar, renderShapeForm, setShapeFs } from "../core/hooks.js";
import { getPrefs, savePrefs } from "../core/prefs.js";

export function normEditorMode(mode) {
  if (mode === "pro" || mode === "advanced") return "advanced";
  if (mode === "beginner" || mode === "simple") return "simple";
  return null;
}

export function isProMode() {
  return !!(sketch && sketch.opts.pro);
}
export const isAdvanced = isProMode;

// Layout classes stay beginner / pro-mode so existing Make and shared CSS keep working.
// The cutting screen is the same for everyone, so it has neither class.
export function applyBodyMode() {
  const cutting = screen() === "cut", pro = !!(sketch && sketch.opts.pro);
  document.body.classList.toggle("beginner", !cutting && !pro);
  document.body.classList.toggle("pro-mode", !cutting && pro);
  document.body.classList.toggle("simple-mode", !cutting && !pro);
  document.body.classList.toggle("advanced-mode", !cutting && pro);
  document.body.dataset.mode = pro ? "pro" : "beginner";
}

export function syncModeSwitch() {
  const advanced = isProMode();
  const adv = $("btnAdvancedTools"), simp = $("btnSimpleView");
  if (adv) adv.classList.toggle("hidden", advanced);
  if (simp) simp.classList.toggle("hidden", !advanced);
}

export function setAppMode(mode, opts) {
  const persist = !opts || opts.persist !== false;
  const autoFs = !opts || opts.autoFs !== false;
  const editor = normEditorMode(mode) || (isProMode() ? "advanced" : "simple");
  const pro = editor === "advanced";
  if (sketch) sketch.setPro(pro);
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
  if (persist) {
    try { savePrefs({ mode: editor }); } catch (e) { /* ignore */ }
  }
  try { paintChrome(); } catch (e) { /* ignore */ }
  try { document.dispatchEvent(new Event("editor-mode")); } catch (e) { /* ignore */ }
}

// Signing in used to copy profiles.mode onto the editor. The last Simple / Advanced
// choice now lives in prefs, so an older beginner/pro value on the account does not override it.
export function applyAccountMode(mode) {
  const fromPrefs = normEditorMode(getPrefs().mode);
  const fromAcct = normEditorMode(mode);
  setAppMode(fromPrefs || fromAcct || "simple", { persist: false, autoFs: false });
}

export function firmwareDenied() {
  if (Acc.canFirmware()) return false;
  toast(Acc.isAdmin() || Acc.isPro() ? "Firmware tools need a machine linked to your account." : "Pro or admin only", true);
  return true;
}

export function bindMode() {
  const adv = $("btnAdvancedTools");
  if (adv) adv.addEventListener("click", (e) => { e.preventDefault(); setAppMode("advanced"); });
  const simp = $("btnSimpleView");
  if (simp) simp.addEventListener("click", (e) => { e.preventDefault(); setAppMode("simple"); });
  syncModeSwitch();
}

// Settings → Make it yours: the per-user appearance and canvas preferences, applied live.
// Saved in this browser (per signed-in account id). Not uploaded — the database has no prefs column.
import { applyChrome, bindThemeMedia, getPrefs, loadPrefs, prefsKey, resetPrefs, savePrefs } from "../core/prefs.js";
import { setAppMode } from "./mode.js";
import * as Acc from "../account/account.js";
import { sketch } from "../core/state.js";
import { $, toast } from "../core/dom.js";
import { refreshScrollRows } from "./scrollrow.js";

function userId() {
  try { const u = Acc.currentUser && Acc.currentUser(); return u && (u.id || u.email) || ""; }
  catch (e) { return ""; }
}

function snapOn(on) {
  if (!sketch || !sketch.setSnap) return;
  const want = on ? 1 : 0;
  if ((sketch.opts.snap ? 1 : 0) !== want) sketch.setSnap(want);
}

function applyAll(p, { mode = true } = {}) {
  applyChrome(p);
  snapOn(p.snap);
  if (mode && (p.mode === "simple" || p.mode === "advanced" || p.mode === "pro" || p.mode === "beginner")) {
    try { setAppMode(p.mode, { persist: false, autoFs: false }); } catch (e) { /* not ready */ }
  }
  try { if (sketch && sketch.draw) sketch.draw(); } catch (e) { /* ignore */ }
  refreshScrollRows();
}

function fillForm(p) {
  const set = (id, v) => { const el = $(id); if (!el) return; if (el.type === "checkbox") el.checked = !!v; else el.value = String(v); };
  set("yoursTheme", p.theme);
  set("yoursAccent", p.accent);
  set("yoursToolbar", p.toolbar);
  set("yoursButtons", p.buttons);
  set("yoursUnits", p.units);
  set("yoursGrid", p.grid);
  set("yoursGridSize", p.gridSize);
  set("yoursSnap", p.snap);
  set("yoursCanvas", p.canvas);
  set("yoursWheelZoom", p.wheelZoom);
}

function readForm() {
  const val = (id) => { const el = $(id); return el ? el.value : undefined; };
  const chk = (id) => { const el = $(id); return el ? !!el.checked : undefined; };
  return {
    theme: val("yoursTheme"),
    accent: val("yoursAccent"),
    toolbar: val("yoursToolbar"),
    buttons: val("yoursButtons"),
    units: val("yoursUnits"),
    mode: getPrefs().mode,
    grid: chk("yoursGrid"),
    gridSize: Number(val("yoursGridSize")),
    snap: chk("yoursSnap"),
    canvas: val("yoursCanvas"),
    wheelZoom: chk("yoursWheelZoom"),
  };
}

function onChange(e) {
  const field = e && e.target && e.target.id;
  const draft = readForm();
  const next = savePrefs(draft, userId());
  // Display units only — do not rewrite machine Settings units.
  // Simple / Advanced is remembered from the Make a part buttons, not from this pane.
  applyAll(next, { mode: false });
}

export function paintYours() { fillForm(getPrefs()); }

export function initYours() {
  const uid = userId();
  let stored = null;
  try { stored = localStorage.getItem(prefsKey(uid)); } catch (e) { stored = null; }
  loadPrefs(uid);
  if (!stored) {
    const patch = {};
    if (sketch && sketch.opts && sketch.opts.pro) patch.mode = "advanced";
    // pick up display units already chosen in Settings, and a saved Pro sketch mode
    try {
      const raw = JSON.parse(localStorage.getItem("plasma.settings.v1") || "null");
      if (raw && (raw.units === "mm" || raw.units === "inch")) patch.units = raw.units;
    } catch (e) { /* ignore */ }
    if (Object.keys(patch).length) savePrefs(patch, uid);
  }
  bindThemeMedia();
  applyAll(getPrefs(), { mode: false });   // mode is applied by app.js after this, then the account may override
  Acc.onAccountChange(() => {
    loadPrefs(userId());
    applyAll(getPrefs(), { mode: false });
    fillForm(getPrefs());
  });
}

export function bindYours() {
  const pane = document.querySelector('[data-setpane="yours"]');
  if (pane) pane.addEventListener("change", onChange);
  if ($("yoursReset")) $("yoursReset").onclick = () => {
    const p = resetPrefs(userId());
    fillForm(p);
    applyAll(p, { mode: true });
  };
}

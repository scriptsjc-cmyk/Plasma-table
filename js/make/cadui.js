// Laptop CAD chrome: shortcuts, layers, preset browser, type-while-drawing, context menu.
import { bindLaptopUi, syncLaptopUi, isLaptopUi, paintSidewaysHint } from "../ui/laptop.js";
import { bindLayers, paintLayers } from "./layers.js";
import { bindCtxMenu } from "./ctxmenu.js";
import { bindDrawHud, startRectAt, startDiscAt, applyHudPoint, cancelDrawHud, paintDrawHud } from "./drawhud.js";
import { bindPresetBrowser } from "./presetbrowser.js";
import { bindToolbarCustom } from "./toolbarcustom.js";
import { bindSheetSize, paintSheetSize } from "./sheetsize.js";
import { sketch } from "../core/state.js";
import { renderQuickBar, focusToolSearch } from "./quickbar.js";
import { bindShortcuts, openShortcutSheet, closeShortcutSheet } from "./shortcuts.js";
import { initInspectorTabs } from "./inspector.js";
import { bindFeatureList, bindFeatureSheet, bindLooseOffer, renderFeatureList } from "./part-features-ui.js";

export { isLaptopUi, syncLaptopUi, paintSidewaysHint, paintLayers };

export function bindCadUi() {
  bindLaptopUi();
  initInspectorTabs();
  bindFeatureList();
  bindLooseOffer();
  bindFeatureSheet();
  bindLayers();
  bindCtxMenu();
  bindDrawHud();
  bindPresetBrowser();
  bindToolbarCustom();
  bindSheetSize();
  bindShortcuts();
  if (sketch) {
    const prevSel = sketch.onSelect;
    sketch.onSelect = (...a) => { try { if (prevSel) prevSel(...a); } finally { paintLayers(); paintSheetSize(); renderFeatureList(); } };
    const prevCh = sketch.onChange;
    sketch.onChange = (...a) => { try { if (prevCh) prevCh(...a); } finally { paintLayers(); paintSheetSize(); if (a[0]) renderFeatureList(); } };
  }
  syncLaptopUi();
  if (typeof renderQuickBar === "function") try { renderQuickBar(); } catch (e) { /* not ready */ }
  publishCadTestHooks();
}

export function publishCadTestHooks() {
  if (typeof window !== "undefined" && window.plasmaTest) {
    Object.assign(window.plasmaTest, { startRectAt, startDiscAt, applyHudPoint, cancelDrawHud, paintDrawHud, openShortcutSheet, closeShortcutSheet, focusToolSearch });
  }
}


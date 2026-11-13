// Laptop CAD chrome: shortcuts, layers, preset browser, type-while-drawing, context menu.
import { bindLaptopUi, syncLaptopUi, isLaptopUi, paintSidewaysHint } from "../ui/laptop.js";
import { bindLayers, paintLayers } from "./layers.js";
import { bindCtxMenu } from "./ctxmenu.js";
import { bindDrawHud, startRectAt, startDiscAt, applyHudPoint, cancelDrawHud, paintDrawHud } from "./drawhud.js";
import { bindPresetBrowser } from "./presetbrowser.js";
import { bindToolbarCustom } from "./toolbarcustom.js";
import { bindSheetSize, paintSheetSize } from "./sheetsize.js";
import { sketch } from "../core/state.js";
import { renderQuickBar } from "./quickbar.js";

export { isLaptopUi, syncLaptopUi, paintSidewaysHint, paintLayers };

export function bindCadUi() {
  bindLaptopUi();
  bindLayers();
  bindCtxMenu();
  bindDrawHud();
  bindPresetBrowser();
  bindToolbarCustom();
  bindSheetSize();
  if (sketch) {
    const prevSel = sketch.onSelect;
    sketch.onSelect = (...a) => { try { if (prevSel) prevSel(...a); } finally { paintLayers(); paintSheetSize(); } };
    const prevCh = sketch.onChange;
    sketch.onChange = (...a) => { try { if (prevCh) prevCh(...a); } finally { paintLayers(); paintSheetSize(); } };
  }
  syncLaptopUi();
  if (typeof renderQuickBar === "function") try { renderQuickBar(); } catch (e) { /* not ready */ }
  publishCadTestHooks();
}

export function publishCadTestHooks() {
  if (typeof window !== "undefined" && window.plasmaTest) {
    Object.assign(window.plasmaTest, { startRectAt, startDiscAt, applyHudPoint, cancelDrawHud, paintDrawHud });
  }
}


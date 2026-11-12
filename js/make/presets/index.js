// Parametric preset parts, split by category and registered as a single list.
import { PLATE_PRESETS } from "./plates-brackets.js";
import { GUSSET_PRESETS } from "./gussets.js";
import { FLANGE_PRESETS } from "./flanges.js";
import { TAB_PRESETS } from "./tabs-slots.js";
import { SIGN_PRESETS } from "./signs-frames.js";
import { HOOK_PRESETS } from "./hooks-hangers.js";
import { GEAR_PRESETS } from "./gears-sprockets.js";
import { BOX_PRESETS } from "./enclosures.js";
import { FAB_PRESETS } from "./fab-transitions.js";
import { R8_PRESETS } from "./r8-parts.js";

export const PRESET_CATEGORIES = [
  { id: "plates", name: "Plates & brackets", items: PLATE_PRESETS },
  { id: "stiffeners", name: "Gussets", items: GUSSET_PRESETS },
  { id: "pipeflanges", name: "Flanges", items: FLANGE_PRESETS },
  { id: "tabslots", name: "Tabs & slots", items: TAB_PRESETS },
  { id: "signage", name: "Signs & frames", items: SIGN_PRESETS },
  { id: "hangers", name: "Hooks & hangers", items: HOOK_PRESETS },
  { id: "gearing", name: "Gears & sprockets", items: GEAR_PRESETS },
  { id: "enclosures", name: "Enclosures & boxes", items: BOX_PRESETS },
  { id: "sheetmetal", name: "Sheet-metal patterns", items: FAB_PRESETS },
  { id: "r8parts", name: "More workshop parts", items: R8_PRESETS },
];

// Existing fabrication shapes (already in SHAPES) belong in Preset parts, not More shapes.
export const WORKSHOP_IDS = ["plate", "slotted", "slot2", "baseplate", "tab", "lbracket", "bracket", "tplate", "strap", "gusset", "wgusset", "shelf", "lug", "banjo", "keyhole", "dshape", "link", "sign", "hook", "flange4", "flange6", "flange8", "flange10", "flange12", "flangeblind", "flange", "sqwasher", "frame", "s2r", "cone", "tube"];

export const PRESET_SHAPES = PRESET_CATEGORIES.flatMap((c) => c.items);

export const PRESET_GROUPS = PRESET_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  ids: c.items.map((s) => s.id),
})).concat([{ id: "workshop", name: "Workshop parts", ids: WORKSHOP_IDS }]);

export const PRESET_IDS = new Set(PRESET_SHAPES.map((s) => s.id));


export { R8_PRESETS };

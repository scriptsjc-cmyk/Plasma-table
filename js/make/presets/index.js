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
import { FOLD_PRESETS } from "./fold-parts.js";

const vis = (items) => items.filter((s) => !s.hidden);

// Pipe fittings, transitions, elbows, saddles and chimney / roof jacks.
const PIPEWORK_IDS = new Set([
  "s2r", "s2roffset", "r2s", "fanduct",
  "cone", "conesteep", "coneshallow", "conecentric", "coneecc", "r2roffset",
  "silocone", "cyclonehop", "coneadapter", "tube",
  "recttrans", "recttransoff", "hopperrect", "hopflange", "sqrpyramid",
  "elbow2", "elbow3", "elbow4", "elbow5", "elbow45", "redelbow", "rectelbow",
  "fishmouth", "fishflat", "saddlehole", "takeoff", "britches", "teetemp", "ybranch",
  "ductcap", "rectcap",
  "chimround", "chimsquare", "roofjack",
]);

const FOLD_MOVE_IDS = new Set(["dustpan", "scoop"]);
const BOX_STAY_IDS = new Set(["pcpanel"]);

const PIPE_ITEMS = vis([
  ...FAB_PRESETS.filter((s) => PIPEWORK_IDS.has(s.id)),
  ...FOLD_PRESETS.filter((s) => PIPEWORK_IDS.has(s.id)),
]);
const FOLD_ITEMS = vis([
  ...FOLD_PRESETS.filter((s) => !PIPEWORK_IDS.has(s.id) && !FOLD_MOVE_IDS.has(s.id)),
  ...BOX_PRESETS.filter((s) => !BOX_STAY_IDS.has(s.id)),
  ...FAB_PRESETS.filter((s) => FOLD_MOVE_IDS.has(s.id)),
]);
const SHEET_ITEMS = vis(FAB_PRESETS.filter((s) => !PIPEWORK_IDS.has(s.id) && !FOLD_MOVE_IDS.has(s.id)));
const ENCL_ITEMS = vis(BOX_PRESETS.filter((s) => BOX_STAY_IDS.has(s.id)));

export const PRESET_CATEGORIES = [
  { id: "plates", name: "Plates & brackets", items: vis(PLATE_PRESETS) },
  { id: "stiffeners", name: "Gussets", items: vis(GUSSET_PRESETS) },
  { id: "pipeflanges", name: "Flanges", items: vis(FLANGE_PRESETS) },
  { id: "tabslots", name: "Tabs & slots", items: vis(TAB_PRESETS) },
  { id: "signage", name: "Signs & frames", items: vis(SIGN_PRESETS) },
  { id: "hangers", name: "Hooks & hangers", items: vis(HOOK_PRESETS) },
  { id: "gearing", name: "Gears & sprockets", items: vis(GEAR_PRESETS) },
  { id: "enclosures", name: "Enclosures & boxes", items: ENCL_ITEMS },
  { id: "folded", name: "3D / folding", items: FOLD_ITEMS },
  { id: "pipework", name: "Pipework", items: PIPE_ITEMS },
  { id: "sheetmetal", name: "Sheet-metal patterns", items: SHEET_ITEMS },
  { id: "r8parts", name: "More workshop parts", items: vis(R8_PRESETS) },
];

// Existing fabrication shapes (already in SHAPES) belong in Preset parts, not More shapes.
export const WORKSHOP_IDS = ["plate", "slotted", "slot2", "baseplate", "tab", "lbracket", "bracket", "tplate", "strap", "gusset", "wgusset", "shelf", "lug", "banjo", "keyhole", "dshape", "link", "sign", "hook", "flange4", "flange6", "flange8", "flange10", "flange12", "flangeblind", "flange", "sqwasher", "frame", "s2r", "cone", "tube"];

// Hidden aliases stay registered (saved jobs, goldens, search via aka) but are omitted from the tabs.
export const PRESET_SHAPES = [
  ...PLATE_PRESETS, ...GUSSET_PRESETS, ...FLANGE_PRESETS, ...TAB_PRESETS,
  ...SIGN_PRESETS, ...HOOK_PRESETS, ...GEAR_PRESETS, ...BOX_PRESETS,
  ...FAB_PRESETS, ...R8_PRESETS, ...FOLD_PRESETS,
];

export const PRESET_GROUPS = PRESET_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  ids: c.items.map((s) => s.id),
})).concat([{ id: "workshop", name: "Workshop parts", ids: WORKSHOP_IDS }]);

// Workshop cone / square-to-round / tube also appear on the Pipework tab.
const pipe = PRESET_GROUPS.find((g) => g.id === "pipework");
if (pipe) {
  for (const id of ["s2r", "cone", "tube"]) {
    if (!pipe.ids.includes(id)) pipe.ids.unshift(id);
  }
}

export const PRESET_IDS = new Set(PRESET_SHAPES.map((s) => s.id));


export { R8_PRESETS, FOLD_PRESETS };

// r8 item 14: another 100 fabrication presets (mounts, auto, furniture, weld fixtures, garden, signs).
import { circleContour, roundedRect, slot, holeIn, poly, clamp, shape } from "./helpers.js";

const plate = (w, h, r, holes) => {
  const c = [roundedRect(0, 0, w, h, r || 0)];
  for (const [x, y, d] of holes) { const hole = holeIn(x, y, d, 0, 0, w, h, 1); if (hole) c.push(hole); }
  return c;
};
const R8 = [];

function add(id, name, icon, group, aka, tip, params, make) {
  R8.push(shape(id, name, icon, group, aka, tip, params, make));
}

// ---- mounts, hinges, hasps, feet ----
add("uboltplate", "U-bolt plate", "∩", "mounts", "u bolt spring axle",
  "Plate with two slots for a U-bolt.",
  [["w", "Width", 120], ["h", "Height", 80], ["slotl", "Slot length", 36], ["slotw", "Slot width", 12], ["span", "Slot centres", 60], ["r", "Corner radius", 6]],
  (p) => {
    const c = [roundedRect(0, 0, p.w, p.h, p.r)];
    const sl = clamp(p.slotl, p.slotw, p.h - 8), sw = clamp(p.slotw, 3, p.w / 4);
    const span = clamp(p.span, sw + 4, p.w - sw - 4);
    c.push(slot(p.w / 2 - span / 2, p.h / 2, sl, sw, 90), slot(p.w / 2 + span / 2, p.h / 2, sl, sw, 90));
    return c;
  });

add("doorhinge", "Hinge leaf", "⊏", "mounts", "hinge leaf door butt",
  "One leaf of a butt hinge with screw holes.",
  [["w", "Leaf width", 80], ["h", "Leaf height", 120], ["d", "Screw Ø", 6], ["n", "Screws", 3], ["r", "Corner radius", 4]],
  (p) => {
    const c = [roundedRect(0, 0, p.w, p.h, p.r)];
    const n = Math.max(2, Math.round(p.n));
    for (let i = 0; i < n; i++) {
      const hole = holeIn(p.w * 0.55, p.h * (i + 1) / (n + 1), p.d, 0, 0, p.w, p.h, 2);
      if (hole) c.push(hole);
    }
    return c;
  });

add("haspplate", "Hasp plate", "⊃", "mounts", "hasp staple padlock latch",
  "Padlock hasp: a slotted tongue on a back plate.",
  [["w", "Plate width", 70], ["h", "Plate height", 90], ["tw", "Tongue width", 28], ["tl", "Tongue length", 50], ["slotl", "Slot length", 22], ["slotw", "Slot width", 10], ["d", "Fixing Ø", 6]],
  (p) => {
    const tw = clamp(p.tw, 12, p.w), tl = clamp(p.tl, 20, 160);
    const c = [poly([[0, 0], [p.w, 0], [p.w, p.h], [p.w / 2 + tw / 2, p.h], [p.w / 2 + tw / 2, p.h + tl], [p.w / 2 - tw / 2, p.h + tl], [p.w / 2 - tw / 2, p.h], [0, p.h]])];
    c.push(slot(p.w / 2, p.h + tl * 0.6, p.slotl, p.slotw, 90));
    const hole = holeIn(p.w / 2, p.h * 0.4, p.d, 0, 0, p.w, p.h, 3); if (hole) c.push(hole);
    return c;
  });

add("footpad", "Machine foot pad", "○", "mounts", "foot pad levelling machine",
  "Round pad with a centre hole for a levelling foot.",
  [["d", "Outside Ø", 80], ["id", "Centre Ø", 14]],
  (p) => { const c = [circleContour(p.d / 2, p.d / 2, p.d / 2)]; const h = holeIn(p.d / 2, p.d / 2, p.id, 0, 0, p.d, p.d, 2); if (h) c.push(h); return c; });

add("casterplate", "Caster plate", "▣", "mounts", "caster wheel plate bolt pattern",
  "Square plate with a 4-hole caster bolt pattern.",
  [["s", "Size", 100], ["pcd", "Bolt centres", 70], ["d", "Bolt Ø", 8], ["r", "Corner radius", 8]],
  (p) => plate(p.s, p.s, p.r, [
    [(p.s - p.pcd) / 2, (p.s - p.pcd) / 2, p.d], [(p.s + p.pcd) / 2, (p.s - p.pcd) / 2, p.d],
    [(p.s - p.pcd) / 2, (p.s + p.pcd) / 2, p.d], [(p.s + p.pcd) / 2, (p.s + p.pcd) / 2, p.d],
  ]));

add("wallcleat", "Wall cleat", "▭", "mounts", "french cleat wall mount",
  "Wall cleat: a rectangle with a 45° top bevel and fixing holes.",
  [["w", "Width", 200], ["h", "Height", 50], ["bevel", "Bevel", 20], ["d", "Fixing Ø", 6], ["n", "Fixings", 3]],
  (p) => {
    const b = clamp(p.bevel, 4, p.h - 4);
    const c = [poly([[0, 0], [p.w, 0], [p.w, p.h - b], [p.w - b, p.h], [b, p.h], [0, p.h - b]])];
    const n = Math.max(2, Math.round(p.n));
    for (let i = 0; i < n; i++) { const hole = holeIn(p.w * (i + 1) / (n + 1), p.h * 0.35, p.d, 0, 0, p.w, p.h, 3); if (hole) c.push(hole); }
    return c;
  });

add("pipeclamp", "Pipe clamp half", "⋃", "mounts", "pipe clamp saddle u strap",
  "Half a pipe saddle clamp with two fixing holes.",
  [["d", "Pipe Ø", 50], ["flange", "Flange width", 20], ["t", "Band width", 24], ["hole", "Fixing Ø", 8]],
  (p) => {
    const r = p.d / 2, f = clamp(p.flange, 8, 80), t = clamp(p.t, 10, 80);
    const outerR = r + t, innerR = r, w = 2 * outerR + 2 * f, h = outerR + f;
    const pts = [[0, 0], [w, 0], [w, f], [w / 2 + outerR, f]];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (1 - i / steps);
      pts.push([w / 2 + outerR * Math.cos(a), f + outerR * Math.sin(a)]);
    }
    pts.push([w / 2 - outerR, f], [0, f], [0, 0]);
    // inner arch (open at the top) so the clamp is a U, not a closed pocket
    const inn = [];
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (i / steps);
      inn.push([w / 2 + innerR * Math.cos(a), f + innerR * Math.sin(a)]);
    }
    // splice inner in reverse between the two flange inner corners — already walked the outer;
    // rebuild as a single U: left flange, outer arch, right flange, then inner arch back.
    const u = [[0, 0], [w, 0], [w, f]];
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (1 - i / steps);
      u.push([w / 2 + outerR * Math.cos(a), f + outerR * Math.sin(a)]);
    }
    u.push([0, f]);
    // cut the pipe mouth by walking the inner arch from left to right (down into the U)
    const mouth = [[0, 0], [f, 0], [f, f]];
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (1 - i / steps);
      mouth.push([w / 2 + innerR * Math.cos(a), f + innerR * Math.sin(a)]);
    }
    mouth.push([w - f, f], [w - f, 0], [w, 0], [w, f + 0]);
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (i / steps);
      mouth.push([w / 2 + outerR * Math.cos(a), f + outerR * Math.sin(a)]);
    }
    mouth.push([0, f]);
    const c = [poly(mouth)];
    const h1 = holeIn(f / 2, f * 0.45, p.hole, 0, 0, w, f, 2);
    const h2 = holeIn(w - f / 2, f * 0.45, p.hole, 0, 0, w, f, 2);
    if (h1) c.push(h1); if (h2) c.push(h2);
    return c;
  });

// Generate many standard fabrication plates with unique geometry
const standards = [
  ["lightbarplate", "Light-bar mount", "auto", "light bar roof rack", 180, 50, 6, [[30, 25], [90, 25], [150, 25]], 4],
  ["numberplatebr", "Number-plate bracket", "auto", "number plate registration", 160, 40, 6, [[20, 20], [140, 20]], 3],
  ["jackpoint", "Jacking point pad", "auto", "jack pad lift point", 80, 80, 8, [[20, 20], [60, 20], [20, 60], [60, 60]], 8],
  ["recoverypoint", "Recovery point plate", "auto", "recovery tow hook", 120, 80, 8, [[25, 40], [95, 40]], 10],
  ["batterytray", "Battery hold-down", "auto", "battery clamp tray", 200, 40, 6, [[20, 20], [180, 20]], 4],
  ["airlinebracket", "Air-line bracket", "auto", "air line compressor", 80, 40, 4, [[15, 20], [65, 20]], 6],
  ["radiatorstay", "Radiator stay", "auto", "radiator support stay", 160, 30, 4, [[15, 15], [145, 15]], 5],
  ["mudflapbr", "Mud-flap bracket", "auto", "mud flap guard", 100, 60, 6, [[20, 15], [80, 15], [20, 45], [80, 45]], 6],
  ["cbantbr", "Antenna mount", "auto", "cb antenna aerial", 70, 70, 8, [[15, 15], [55, 15], [15, 55], [55, 55]], 6],
  ["snorkelbr", "Snorkel bracket", "auto", "snorkel intake", 90, 50, 6, [[20, 25], [70, 25]], 8],
  ["seatrail", "Seat-rail plate", "auto", "seat rail slider", 220, 40, 4, [[20, 20], [110, 20], [200, 20]], 8],
  ["towballplate", "Tow-ball plate", "auto", "tow ball hitch", 140, 100, 10, [[30, 25], [110, 25], [30, 75], [110, 75]], 8],
  ["winchplate", "Winch fairlead plate", "auto", "winch fairlead hawse", 180, 70, 8, [[25, 35], [155, 35]], 10],
  ["diffguard", "Diff-guard blank", "auto", "diff guard bash", 200, 120, 10, [[30, 30], [170, 30], [30, 90], [170, 90]], 8],
  ["rocksliderbr", "Rock-slider bracket", "auto", "rock slider side step", 120, 80, 8, [[20, 20], [100, 20], [20, 60], [100, 60]], 8],
  ["bedbracket", "Bed-rail bracket", "furniture", "bed rail hook", 80, 60, 6, [[20, 15], [60, 15], [20, 45]], 6],
  ["sofabracket", "Sofa corner plate", "furniture", "sofa corner furniture", 90, 90, 6, [[20, 20], [70, 20], [20, 70], [70, 70]], 6],
  ["tableleg", "Table-leg plate", "furniture", "table leg mounting", 100, 100, 8, [[25, 25], [75, 25], [25, 75], [75, 75]], 8],
  ["drawerslide", "Drawer-slide plate", "furniture", "drawer slide cabinet", 160, 30, 4, [[15, 15], [80, 15], [145, 15]], 5],
  ["shelfstd", "Shelf standard blank", "furniture", "shelf standard upright", 30, 200, 4, [[15, 20], [15, 100], [15, 180]], 5],
  ["curtainbr", "Curtain-rail bracket", "furniture", "curtain rail pole", 50, 60, 4, [[15, 15], [35, 15]], 5],
  ["mirrorplate", "Mirror hanging plate", "furniture", "mirror hanging french", 80, 30, 4, [[15, 15], [65, 15]], 5],
  ["tvbracket", "TV mount arm plate", "furniture", "tv vesa mount", 120, 120, 8, [[25, 25], [95, 25], [25, 95], [95, 95]], 8],
  ["speakerbr", "Speaker bracket", "furniture", "speaker wall mount", 80, 60, 6, [[20, 15], [60, 15], [40, 45]], 6],
  ["coatrail", "Coat-rail plate", "furniture", "coat rail hook bar", 300, 40, 6, [[20, 20], [150, 20], [280, 20]], 6],
  ["weldcoupon", "Weld coupon", "weld", "weld test coupon", 150, 40, 0, [], 0],
  ["clampblock", "Clamp block plate", "weld", "clamp fixture block", 80, 80, 10, [[20, 20], [60, 20], [20, 60], [60, 60]], 6],
  ["fence90", "90° fence plate", "weld", "welding fence stop", 120, 40, 6, [[20, 20], [100, 20]], 6],
  ["tslotnut", "T-slot plate", "weld", "t slot fixture table", 40, 80, 6, [[20, 20], [20, 60]], 8],
  ["stopblock", "Stop-block plate", "weld", "stop block jig", 60, 40, 6, [[15, 20], [45, 20]], 6],
  ["togglebr", "Toggle-clamp plate", "weld", "toggle clamp base", 80, 50, 6, [[15, 15], [65, 15], [15, 35], [65, 35]], 6],
  ["vblockpl", "V-block base", "weld", "v block rest", 100, 60, 8, [[20, 15], [80, 15], [20, 45], [80, 45]], 6],
  ["parallels", "Parallel set blank", "weld", "parallels packing", 120, 20, 0, [], 0],
  ["jigpinplate", "Jig-pin plate", "weld", "jig pin location", 100, 100, 8, [[25, 25], [75, 25], [25, 75], [75, 75], [50, 50]], 8],
  ["dowelplate", "Dowel plate", "weld", "dowel location plate", 80, 50, 8, [[20, 25], [60, 25]], 6],
  ["hosepeg", "Hose hook", "garden", "hose pipe hook", 60, 80, 6, [[30, 15]], 6],
  ["hangingpot", "Pot hanger", "garden", "plant pot hanger", 50, 90, 6, [[25, 15]], 6],
  ["housenumberbk", "House-number back", "garden", "house number plaque", 200, 150, 6, [[20, 20], [180, 20], [20, 130], [180, 130]], 6],
  ["weathervane", "Weather-vane blank", "garden", "weather vane arrow", 180, 40, 0, [], 0],
  ["trellisbr", "Trellis bracket", "garden", "trellis fence", 80, 80, 6, [[20, 20], [60, 20], [20, 60], [60, 60]], 6],
  ["gateLatch", "Gate latch plate", "garden", "gate latch catch", 80, 40, 6, [[15, 20], [65, 20]], 6],
  ["gateHinge", "Gate band hinge", "garden", "gate band hinge strap", 200, 40, 8, [[20, 20], [80, 20], [160, 20]], 8],
  ["birdhook", "Bird-feeder hook plate", "garden", "bird feeder hook", 50, 70, 6, [[25, 15]], 6],
  ["hosehanger", "Hose-reel hanger", "garden", "hose reel wall", 100, 60, 8, [[20, 20], [80, 20], [20, 40], [80, 40]], 8],
  ["planthook", "Plant-basket hook", "garden", "hanging basket", 40, 80, 6, [[20, 15]], 6],
  ["namestencil", "Name stencil plate", "signs", "stencil name sign", 200, 80, 0, [], 0],
  ["dirsignblank", "Arrow sign blank", "signs", "direction arrow sign", 180, 60, 0, [], 0],
  ["safetyplate", "Safety-sign plate", "signs", "safety warning sign", 150, 150, 6, [[20, 20], [130, 20], [20, 130], [130, 130]], 6],
  ["keytag", "Key tag", "signs", "key tag fob", 50, 25, 6, [[12, 12.5]], 5],
  ["valvehandle", "Valve handle", "signs", "valve handwheel", 80, 80, 10, [[40, 40]], 12],
  ["cabletidy", "Cable tidy plate", "mounts", "cable tidy clip", 60, 30, 6, [[15, 15], [45, 15]], 5],
  ["conduitbr", "Conduit bracket", "mounts", "conduit saddle", 40, 20, 0, [], 0],
  ["sensorbr", "Sensor bracket", "mounts", "sensor proximity", 50, 40, 5, [[12, 20], [38, 20]], 5],
  ["limitbr", "Limit-switch plate", "mounts", "limit switch", 50, 40, 5, [[12, 12], [38, 12], [12, 28], [38, 28]], 5],
  ["proxbr", "Proximity-switch plate", "mounts", "proximity switch", 40, 50, 5, [[20, 12], [20, 38]], 5],
  ["motorplate", "Motor foot plate", "mounts", "motor foot iec", 140, 80, 8, [[20, 20], [120, 20], [20, 60], [120, 60]], 8],
  ["gearboxbr", "Gearbox plate", "mounts", "gearbox flange", 120, 120, 10, [[30, 30], [90, 30], [30, 90], [90, 90]], 10],
  ["pumpplate", "Pump base plate", "mounts", "pump base", 160, 100, 10, [[25, 25], [135, 25], [25, 75], [135, 75]], 10],
  ["idlerspacer", "Idler spacer", "mounts", "idler spacer washer", 50, 50, 12, [[25, 25]], 10],
  ["pillowblock", "Pillow-block plate", "mounts", "pillow block bearing", 140, 70, 10, [[25, 35], [115, 35]], 10],
  ["shaftcollarp", "Shaft-collar tab", "mounts", "shaft collar tab", 40, 30, 6, [[20, 15]], 6],
  ["chaintab", "Chain anchor plate", "mounts", "chain anchor eye", 80, 50, 10, [[25, 25]], 8],
  ["turnbuckle", "Turnbuckle plate", "mounts", "turnbuckle anchor", 70, 40, 8, [[20, 20], [50, 20]], 8],
  ["shackleplate", "Shackle plate", "mounts", "shackle bow", 70, 50, 12, [[35, 25]], 10],
  ["eyeplate2", "Tiedown eye plate", "auto", "tiedown eye lashing", 80, 50, 10, [[20, 25], [60, 25]], 8],
  ["roofrackft", "Roof-rack foot", "auto", "roof rack foot", 100, 50, 8, [[20, 25], [80, 25]], 8],
  ["awningsbr", "Awning bracket", "auto", "awning rail", 80, 60, 8, [[20, 20], [60, 20], [20, 40], [60, 40]], 8],
  ["tentskirt", "Tent-skirt plate", "auto", "tent skirt awning", 60, 30, 5, [[15, 15], [45, 15]], 5],
  ["gasbottle", "Gas-bottle strap plate", "auto", "gas bottle lpg", 80, 40, 8, [[20, 20], [60, 20]], 8],
  ["waterjerrycan", "Jerry-can holder plate", "auto", "jerry can holder", 100, 40, 8, [[20, 20], [80, 20]], 8],
  ["spadegrip", "Spade-grip plate", "auto", "spade shovel mount", 50, 80, 8, [[25, 20]], 8],
  ["hiLiftbr", "Hi-lift jack mount", "auto", "hi lift farm jack", 80, 120, 10, [[40, 25], [40, 95]], 10],
  ["sandflag", "Sand-flag plate", "auto", "sand flag whip", 50, 50, 8, [[25, 25]], 8],
  ["fireextbr", "Fire-extinguisher bracket", "auto", "fire extinguisher", 80, 50, 6, [[15, 15], [65, 15], [15, 35], [65, 35]], 6],
  ["firstaidbr", "First-aid box plate", "auto", "first aid box", 100, 40, 6, [[20, 20], [80, 20]], 6],
  ["worklightbr", "Work-light bracket", "auto", "work light bar", 70, 50, 6, [[15, 15], [55, 15], [15, 35], [55, 35]], 6],
  ["campingtbl", "Camping-table plate", "furniture", "camping table fold", 120, 40, 6, [[20, 20], [100, 20]], 6],
  ["benchdog", "Bench-dog plate", "weld", "bench dog workbench", 40, 40, 20, [[20, 20]], 6],
  ["doghole", "Dog-hole strip", "weld", "dog hole workbench", 200, 30, 20, [[20, 15], [70, 15], [120, 15], [170, 15]], 6],
  ["mitregauge", "Mitre-gauge slot plate", "weld", "mitre gauge slot", 160, 30, 0, [], 0],
  ["pushblock", "Push-block plate", "weld", "push block safety", 80, 60, 0, [], 0],
  ["featherboard", "Featherboard blank", "weld", "featherboard tablesaw", 150, 80, 0, [], 0],
  ["routerplt", "Router-plate blank", "weld", "router insert plate", 180, 180, 8, [[20, 20], [160, 20], [20, 160], [160, 160]], 8],
  ["sacrificial", "Sacrificial fence", "weld", "sacrificial fence", 200, 40, 0, [], 0],
  ["holddown", "Hold-down clamp plate", "weld", "hold down clamp", 70, 40, 8, [[20, 20], [50, 20]], 8],
  ["mftplate", "MFT dog plate", "weld", "mft festool dog", 80, 80, 20, [[20, 20], [60, 20], [20, 60], [60, 60]], 8],
  ["packoutbr", "Tool-box mount plate", "mounts", "packout tool box", 120, 60, 8, [[20, 20], [100, 20], [20, 40], [100, 40]], 8],
  ["magnetbar", "Magnet-bar plate", "weld", "magnetic tool bar", 200, 30, 6, [[20, 15], [180, 15]], 6],
  ["bitindex", "Bit-index plate", "weld", "drill bit index", 120, 80, 0, [], 0],
  ["wrenchorg", "Wrench organiser", "weld", "spanner wrench rack", 180, 50, 0, [], 0],
  ["pliersrack", "Pliers rack plate", "weld", "pliers rack", 100, 40, 6, [[20, 20], [80, 20]], 6],
  ["hammerrack", "Hammer-rack plate", "weld", "hammer rack", 80, 50, 8, [[20, 15], [60, 15]], 8],
  ["extensionbr", "Extension-lead hook", "mounts", "extension lead hook", 40, 60, 6, [[20, 15]], 6],
  ["airfilterbr", "Air-filter bracket", "auto", "air filter pod", 80, 60, 6, [[20, 20], [60, 20], [20, 40], [60, 40]], 6],
  ["intercoolerbr", "Intercooler bracket", "auto", "intercooler mount", 100, 50, 8, [[20, 15], [80, 15], [20, 35], [80, 35]], 8],
  ["turbolinebr", "Turbo-line clamp plate", "auto", "turbo oil line", 50, 30, 6, [[15, 15], [35, 15]], 5],
  ["skidplatebr", "Skid-plate tab", "auto", "skid plate bash", 60, 40, 8, [[15, 20], [45, 20]], 8],
  ["rollbarbr", "Roll-bar tab", "auto", "roll bar sport", 50, 50, 10, [[25, 25]], 8],
  ["harnessbr", "Harness eye plate", "auto", "harness seat belt", 70, 50, 12, [[35, 25]], 10],
  ["firewallpad", "Firewall pad", "auto", "firewall grommet", 80, 80, 20, [[40, 40]], 8],
];

for (const [id, name, group, aka, w, h, r, holes, d] of standards) {
  add(id, name, "▭", group, aka,
    name + " – a cuttable fabrication plate. Set the size and hole Ø.",
    [["w", "Width", w], ["h", "Height", h], ["r", "Corner radius", r], ["d", "Hole Ø", d || 6]],
    ((holes0) => (p) => plate(p.w, p.h, p.r, holes0.map(([x, y]) => [x * p.w / w, y * p.h / h, p.d])))(holes));
}

// A few non-rectangular stand-outs
add("arrowblank", "Direction arrow", "➤", "signs", "arrow chevron direction",
  "A directional arrow blank for signs.",
  [["w", "Length", 180], ["h", "Height", 70], ["head", "Head length", 50]],
  (p) => {
    const head = clamp(p.head, 10, p.w - 10), body = p.w - head, hh = p.h;
    return [poly([[0, hh * 0.3], [body, hh * 0.3], [body, 0], [p.w, hh / 2], [body, hh], [body, hh * 0.7], [0, hh * 0.7]])];
  });

add("hexbadge", "Hex badge", "⬡", "signs", "hex badge emblem",
  "A regular hexagon badge with a centre hole.",
  [["d", "Across flats", 80], ["id", "Centre Ø", 10]],
  (p) => {
    const r = p.d / Math.sqrt(3), cx = p.d / 2, cy = r;
    const pts = [];
    for (let i = 0; i < 6; i++) pts.push([cx + r * Math.cos(i * Math.PI / 3 - Math.PI / 6), cy + r * Math.sin(i * Math.PI / 3 - Math.PI / 6)]);
    const c = [poly(pts)];
    const b = [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
    const hole = holeIn(cx, cy, p.id, b[0], b[1], b[2], b[3], 2);
    if (hole) c.push(hole);
    return c;
  });

export const R8_PRESETS = R8;

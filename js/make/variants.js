// Families of shape "versions". Tapping a variant keeps the selected part's
// size and position, and switches it to that version (rounded, flange, etc.).
const FAMILIES = {
  rect: ["rect", "roundrect", "chamfer", "plate", "slotted", "tab", "bracket", "sign"],
  square: ["square", "rect", "roundrect", "chamfer", "plate", "sign"],
  roundrect: ["rect", "roundrect", "chamfer", "plate", "sign"],
  plate: ["rect", "chamfer", "plate", "slotted", "tab", "bracket"],
  chamfer: ["rect", "chamfer", "plate", "slotted", "tab"],
  slotted: ["rect", "chamfer", "plate", "slotted", "tab"],
  tab: ["rect", "chamfer", "plate", "slotted", "tab"],
  sign: ["sign", "rect", "roundrect", "plate"],
  bracket: ["rect", "bracket", "plate", "tab", "lbracket", "shelf"],
  lbracket: ["lbracket", "bracket", "shelf", "rect"],
  shelf: ["shelf", "lbracket", "bracket"],
  disc: ["disc", "ellipse", "ring", "flange"],
  ellipse: ["ellipse", "disc", "ring"],
  ring: ["disc", "ring", "flange"],
  flange: ["disc", "ring", "flange"],
  triangle: ["triangle", "gusset"],
  eqtriangle: ["eqtriangle", "triangle", "gusset"],
  rtriangle: ["rtriangle", "triangle", "gusset"],
  gusset: ["triangle", "gusset"],
  slot: ["slot", "slothole", "link"],
  link: ["link", "slot", "ring"],
  slothole: ["slot", "slothole"],
  polygon: ["polygon", "disc"],
  hexagon: ["hexagon", "octagon", "polygon", "disc"],
  octagon: ["octagon", "hexagon", "polygon", "disc"],
  star: ["star", "polygon", "disc"],
  sector: ["sector", "disc"],
  dshape: ["dshape", "disc"],
};

// Extra "versions" that are the same type but with useful starting parameters.
const PRESETS = {
  rect: [
    { id: "rect", label: "Square corners", p: { r: 0 } },
    { id: "rect", label: "Rounded", key: "rounded", p: { r: 8 } },
    { id: "roundrect", label: "Rounded rectangle", p: { r: 8 } },
    { id: "chamfer", label: "Chamfered", p: { c: 8 } },
    { id: "slotted", label: "Slotted", p: {} },
    { id: "plate", label: "Corner holes", p: {} },
    { id: "plate", label: "Corner + centre hole", key: "plate-mid", p: { mid: 12 } },
    { id: "tab", label: "With tab", p: {} },
    { id: "bracket", label: "Bracket", p: {} },
    { id: "sign", label: "Sign blank", p: {} },
  ],
  disc: [
    { id: "disc", label: "Solid disc", p: {} },
    { id: "ellipse", label: "Ellipse", p: {} },
    { id: "ring", label: "Ring / washer", p: {} },
    { id: "flange", label: "Flange (bolt circle)", p: {} },
  ],
  triangle: [
    { id: "triangle", label: "Triangle", p: { r: 0 } },
    { id: "triangle", label: "Radiused", key: "tri-r", p: { r: 8 } },
    { id: "gusset", label: "Gusset", p: {} },
    { id: "gusset", label: "Gusset with hole", key: "gusset-hole", p: { hole: 10 } },
  ],
};

function familyOf(type) {
  return FAMILIES[type] || null;
}

export function variantsFor(type) {
  if (PRESETS[type]) return PRESETS[type];
  if (PRESETS.rect && (FAMILIES.rect || []).includes(type)) return PRESETS.rect;
  if (PRESETS.disc && (FAMILIES.disc || []).includes(type)) return PRESETS.disc;
  if (PRESETS.triangle && (FAMILIES.triangle || []).includes(type)) return PRESETS.triangle;
  const fam = familyOf(type);
  if (!fam) return [];
  return fam.map((id) => ({ id, label: null, p: {} }));
}

export function variantKey(v) { return v.key || (Object.keys(v.p || {}).length ? `${v.id}:${JSON.stringify(v.p)}` : v.id); }

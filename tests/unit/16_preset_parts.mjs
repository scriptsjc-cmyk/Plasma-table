// Every new parametric preset: defaults produce a closed, non-self-intersecting
// outline that fits the bed and exports G-code.
import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs";
import { verifyDesign } from "../lib/verify.mjs";
import { selfCross, bb } from "../lib/analyze.mjs";

const A = await load();
const t = new T("16_preset_parts");
const travel = A.machine.travel_mm;

t.check("at least 100 new preset parts are registered", A.PRESET_SHAPES.length >= 100, `got ${A.PRESET_SHAPES.length}`);
const ids = A.PRESET_SHAPES.map((s) => s.id);
t.check("new preset ids are unique", new Set(ids).size === ids.length, ids.filter((id, i) => ids.indexOf(id) !== i).join(","));
t.check("new presets are in SHAPES", A.PRESET_SHAPES.every((s) => A.SHAPES.some((x) => x.id === s.id)));

for (const sh of A.PRESET_SHAPES) {
  const sk = A.newSketch();
  sk.add(sh.id, true);
  const it = sk.items[0];
  if (it) { it.x = 25; it.y = 40; }
  const cs = sk.contours();
  t.check(`${sh.id}: produces contours`, cs.length > 0, "", "SHAPE-EMPTY");
  t.check(`${sh.id}: all contours closed and have ≥3 points`, cs.every((c) => c.closed !== false && c.pts.length >= 3), "", "PATH-OPEN");
  t.check(`${sh.id}: no self-intersecting contour`, cs.every((c) => !selfCross(c.pts)), "", "SELF-X");
  if (cs.length) {
    const box = bb(cs.flatMap((c) => c.pts));
    const w = box[2] - box[0], h = box[3] - box[1];
    t.check(`${sh.id}: fits the bed ${travel.x}×${travel.y}`, w <= travel.x + 1e-6 && h <= travel.y + 1e-6, `${w.toFixed(1)}×${h.toFixed(1)}`, "GCODE-BOUNDS");
  }
  verifyDesign(A, t, `preset ${sh.id}`, cs);
}

process.exit(t.done() ? 1 : 0);

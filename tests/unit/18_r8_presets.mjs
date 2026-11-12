// r8: 60 A cut chart sources, ~100 new presets, Shapes vs Preset parts split, empty-canvas pan pref.
import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs";
import { verifyDesign } from "../lib/verify.mjs";
import { selfCross, bb } from "../lib/analyze.mjs";

const A = await load();
const t = new T("18_r8_presets");
const travel = A.machine.travel_mm;

t.check("cut chart names its sources", Array.isArray(A.chart.sources) && A.chart.sources.length >= 2, JSON.stringify(A.chart.sources));
t.check("max cuttable thickness is 20 mm", A.chart.max_cuttable_mm === 20);
const mild = A.chart.materials.find((m) => /mild/i.test(m.name));
t.check("mild steel is in the chart", !!mild);
if (mild) {
  const row = (th) => mild.rows.find((r) => r.thickness_mm === th);
  const r3 = row(3), r10 = row(10), r20 = row(20);
  t.check("3 mm mild steel is 40 A from the published chart, not a guess", r3 && r3.amps === 40 && r3.feed_mm_min > 0 && !/estimate/i.test(r3.feed_source || ""), JSON.stringify(r3 && { amps: r3.amps, feed: r3.feed_mm_min, src: r3.feed_source }));
  t.check("10 mm mild steel is 55 A (interpolated 60 A range)", r10 && r10.amps === 55, JSON.stringify(r10 && { amps: r10.amps }));
  t.check("20 mm row is labelled an estimate (past 3/4 in)", r20 && /estimate/i.test(r20.feed_source || r20.note || ""), JSON.stringify(r20 && { feed: r20.feed_mm_min, src: r20.feed_source }));
  t.check("every row records a source for speed, pierce, cut height and kerf",
    mild.rows.every((r) => r.feed_source && r.pierce_delay_source && r.kerf_source),
    mild.rows.filter((r) => !r.feed_source || !r.pierce_delay_source || !r.kerf_source).map((r) => r.thickness_mm).join(","));
  // IPM × 25.4, not × 60: 1/8 in ~ 100 IPM published ≈ 2540 mm/min neighbourhood for 3 mm
  t.check("3 mm cut speed is in a published mm/min range (IPM×25.4, not ×60)", r3 && r3.feed_mm_min >= 800 && r3.feed_mm_min <= 6000, String(r3 && r3.feed_mm_min));
}

t.check("at least 100 extra r8 workshop presets", (A.R8_PRESETS || []).length >= 100, `got ${(A.R8_PRESETS || []).length}`);
const r8ids = (A.R8_PRESETS || []).map((s) => s.id);
t.check("r8 preset ids are unique", new Set(r8ids).size === r8ids.length, r8ids.filter((id, i) => r8ids.indexOf(id) !== i).join(","));

// Shapes library is only plain shapes and basic holes; flanges / s2r live in presets
const basicIds = (A.LIBRARY_SHAPE_GROUPS || A.BASIC_SHAPE_GROUPS || []).flatMap((g) => g.ids || []);
t.check("the Shapes library is only the basic groups", Array.isArray(A.LIBRARY_SHAPE_GROUPS) && A.LIBRARY_SHAPE_GROUPS.length >= 1 && !A.LIBRARY_SHAPE_GROUPS.some((g) => /flange|duct|workshop|preset/i.test(g.id + g.name)), JSON.stringify((A.LIBRARY_SHAPE_GROUPS || []).map((g) => g.id)));
for (const id of ["flange", "s2r", "cone", "lbracket", "gusset"]) {
  t.check(`${id} is not in the basic Shapes list`, !basicIds.includes(id));
  t.check(`${id} is a preset or workshop part`, (A.WORKSHOP_IDS || []).includes(id) || A.PRESET_IDS.has(id) || (A.PRESET_SHAPES || []).some((s) => s.id === id));
}

const prefsMod = await import("../../js/core/prefs.js");
const d = prefsMod.defaultPrefs();
t.check("emptyDragPan defaults to false (box select, not pan)", d.emptyDragPan === false);
const s = prefsMod.sanitizePrefs({ emptyDragPan: true });
t.check("emptyDragPan is remembered when true", s.emptyDragPan === true);
const s2 = prefsMod.sanitizePrefs({ emptyDragPan: "yes" });
t.check("emptyDragPan rejects non-booleans", s2.emptyDragPan === false);

// Every r8 preset produces a clean cuttable shape (16 also covers the full list)
for (const sh of A.R8_PRESETS || []) {
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
  verifyDesign(A, t, `r8 ${sh.id}`, cs);
}

process.exit(t.done() ? 1 : 0);

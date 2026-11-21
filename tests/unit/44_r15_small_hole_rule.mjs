// r15 6.3: the small-hole rule (a hole under 1.5 × the sheet thickness may not cut cleanly) is one check, used by the
// Features rows (Round 2 item 10) and shown live under every hole-size field; "Mark for drilling" etches a cross at
// each centre instead of cutting the hole.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";

const A = await load();
const H = await import("../../js/make/holerule.js").catch(() => ({}));
const PF = await import("../../js/make/part-features.js");
const t = new T("44_r15_small_hole_rule");
const J = (x) => String(JSON.stringify(x)).slice(0, 300);
const sh = (id) => A.SHAPES.find((s) => s.id === id);
const param = (id, k) => (sh(id).params || []).find((p) => p[0] === k);

// ---- the rule
t.check("holerule.js exports smallHoleRule, isHoleSizeParam and drillMark", typeof H.smallHoleRule === "function" && typeof H.isHoleSizeParam === "function" && typeof H.drillMark === "function");
const r = H.smallHoleRule ? H.smallHoleRule(4, 3) : null;
t.check("Ø4 in 3 mm sheet is small: limit 4.5 mm, says drill it", !!r && r.limit === 4.5 && /1\.5 × thickness/.test(r.text) && /Drill it/i.test(r.text), J(r));
t.check("Ø4.5 and Ø5 in 3 mm are fine; 0 (= none) is never flagged", H.smallHoleRule && !H.smallHoleRule(4.5, 3) && !H.smallHoleRule(5, 3) && !H.smallHoleRule(0, 3));
t.check("it follows the thickness (Ø8 is small in 6 mm)", H.smallHoleRule && !!H.smallHoleRule(8, 6) && !H.smallHoleRule(8, 5));
{
  const f = PF.newFeature ? PF.newFeature("hole", 1, 100, 60) : { id: 1, k: "hole", x: 50, y: 30, d: 4 };
  f.d = 4;
  const msgs = [...PF.featureIssues([f], [[0, 0], [100, 0], [100, 60], [0, 60]], 3).values()].flat();
  t.check("a Features row says exactly the same thing (one engine)", !!r && msgs.includes(r.text), J({ msgs, r }));
}
// ---- which fields are hole sizes
if (H.isHoleSizeParam) {
  const yes = [["plate", "hole"], ["flange", "hole"], ["plate", "mid"], ["hole", "d"], ["pipeclamp", "hole"], ["lbracket", "hole"]];
  const no = [["flange", "pcd"], ["plate", "inset"], ["disc", "d"], ["ring", "id"], ["flange", "d"], ["boltcircle", "n"]];
  const bad = [...yes.filter(([i, k]) => !H.isHoleSizeParam(sh(i), param(i, k))).map((x) => "missed " + x), ...no.filter(([i, k]) => H.isHoleSizeParam(sh(i), param(i, k))).map((x) => "wrong " + x)];
  t.check("hole-size fields are found by their label (Hole Ø, Bolt hole Ø, Fixing Ø, a loose hole's Diameter), not PCDs, insets or outside sizes", !bad.length, J(bad));
}
// ---- Mark for drilling on a shape's own holes
{
  const sk = A.newSketch(); sk.add("plate", true); const it = sk.items[0];
  it.p.hole = 4; it.p.mid = 0;
  const before = sk.contoursOf(it).filter((c) => c.closed !== false && !c.op).length;
  it.drill = ["hole"];
  const cs = sk.contoursOf(it);
  const cut = cs.filter((c) => c.closed !== false && !c.op), marks = cs.filter((c) => c.role === "drill");
  t.check("drilled: the four Ø4 holes are not cut (only the outline is)", before === 5 && cut.length === 1, J({ before, cut: cut.length }));
  t.check("drilled: a cross is etched at each centre (2 marks per hole, op 'mark')", marks.length === 8 && marks.every((c) => c.op === "mark" && c.closed === false && c.pts.length === 2), J(marks.length));
  const g = A.designToGcode(sk.contours(), { kerf: 1.5, leadIn: 3, name: "d" });
  t.check("the job etches the marks and pierces once (the outline)", /PORTA-ETCH/.test(g.gcode) && g.summary.holes === 0 && g.summary.parts === 1, J(g.summary));
  const back = sk.sanitizeItem(JSON.parse(JSON.stringify({ ...it, drill: ["hole", "nonsense"] })));
  t.check("saved and loaded, the drill choice stays (unknown names dropped)", JSON.stringify(back.drill) === JSON.stringify(["hole"]), J(back.drill));
  it.p.hole = 10;
  t.check("the choice belongs to the field: made bigger (Ø10) the holes stay marked until 'Cut it instead'", sk.contoursOf(it).filter((c) => c.role === "drill").length === 8);
  it.drill = [];
  t.check("'Cut it instead' (no drill names): the holes are cut again", sk.contoursOf(it).filter((c) => c.closed !== false && !c.op).length === 5);
}
// ---- Mark for drilling on a Features row
{
  const ops = PF.FEATURE_OPS.map((o) => o[0]);
  t.check("Features: holes can be 'Mark for drilling'", typeof PF.featureOps === "function" && PF.featureOps({ k: "hole" }).some((o) => o[0] === "drill") && !PF.featureOps({ k: "slot" }).some((o) => o[0] === "drill"), J(ops));
  const f = PF.newFeature("bolt", 2, 100, 60); f.d = 3;
  t.check("setFeatureValue accepts drill for holes only", PF.setFeatureValue(f, "op", "drill") === true && f.op === "drill" && PF.setFeatureValue(PF.newFeature("slot", 3, 100, 60), "op", "drill") === false);
  const cs = PF.featureContours(f);
  t.check("a drilled bolt circle gives crosses, no cut circles", cs.length === 2 * f.n && cs.every((c) => c.op === "mark" && c.role === "drill"), J(cs.map((c) => [c.op, c.role])));
  const msgs = [...PF.featureIssues([f], [[0, 0], [100, 0], [100, 60], [0, 60]], 3).values()].flat();
  t.check("a drilled hole is no longer flagged as too small", !msgs.some((m) => /1\.5 × thickness/.test(m)), J(msgs));
}
t.done();

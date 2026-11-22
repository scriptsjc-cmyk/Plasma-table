// r16 preset families (Josh 22 Nov 2026: "a lot of separate parts that are the same thing just slight adjustments … less
// wasted space and more explanation … do all these and organise it better"). The browser shows one card per family;
// every preset shape is still registered under its own id, and every one is reachable from a family.
import "../lib/env.mjs";
import fs from "node:fs";
import { T } from "../lib/t.mjs";
import { SITE } from "../lib/site.mjs";

const t = new T("66_r16_families");
const S = await import("../../js/make/shapes.js");
const P = await import("../../js/make/presets/index.js");
const F = await import("../../js/make/presets/families.js");

const shownBefore = new Set(S.PRESET_GROUPS.flatMap((g) => g.ids));
const inFam = new Set(F.FAMILIES.flatMap((f) => f.picks.map((p) => p.shape)));
const lost = [...shownBefore].filter((id) => !inFam.has(id));
t.check("every preset the old browser showed is a starting point in a family", lost.length === 0, lost.join(","));
const unknown = [...inFam].filter((id) => !S.presetOrShape(id));
t.check("every starting point is a real registered shape", unknown.length === 0, unknown.join(","));
const picks = F.FAMILIES.reduce((n, f) => n + f.picks.length, 0);
t.check("far fewer cards than parts (one card per family)", F.FAMILIES.length <= 60 && F.FAMILIES.length * 4 < shownBefore.size + 60, `${F.FAMILIES.length} families for ${shownBefore.size} parts`);
t.check("all the starting points are kept", picks >= shownBefore.size, `${picks} picks`);
const cats = new Set(F.FAMILY_CATEGORIES.map((c) => c.id));
t.check("every family sits in a category, and every category has families", F.FAMILIES.every((f) => cats.has(f.cat)) && [...cats].every((c) => F.FAMILIES.some((f) => f.cat === c)));
t.check("every family says what it is for and how to size it", F.FAMILIES.every((f) => f.what && f.what.length > 20 && f.size && f.size.length > 40), F.FAMILIES.filter((f) => !(f.what && f.size)).map((f) => f.id).join(","));
const ids = F.FAMILIES.map((f) => f.id);
t.check("family ids are unique", new Set(ids).size === ids.length);
const badP = [];
for (const f of F.FAMILIES) for (const p of f.picks) if (p.p) {
  const keys = S.presetOrShape(p.shape).params.map((x) => x[0]);
  for (const k of Object.keys(p.p)) if (!keys.includes(k)) badP.push(`${f.id}/${p.label}/${k}`);
}
t.check("starting values only set sizes the shape has", badP.length === 0, badP.join(","));
const dupLabels = F.FAMILIES.filter((f) => new Set(f.picks.map((p) => p.label)).size !== f.picks.length).map((f) => f.id);
t.check("no two starting points in a family share a name", dupLabels.length === 0, dupLabels.join(","));
const dupKeys = F.FAMILIES.filter((f) => new Set(f.picks.map(F.pickKey)).size !== f.picks.length).map((f) => f.id);
t.check("no two starting points in a family are the same part", dupKeys.length === 0, dupKeys.join(","));
// a starting point with its own values makes a different part from the plain one (e.g. elbows by number of pieces)
const el = S.presetOrShape("elbow3");
const mk = (p) => el.make({ ...Object.fromEntries(el.params.map(([k, , d]) => [k, d])), ...p }).length;
t.check("elbow starting points really differ (2 pieces vs 5 pieces)", mk({ n: 2 }) !== mk({ n: 5 }), `${mk({ n: 2 })} vs ${mk({ n: 5 })}`);
for (const k of ["w", "h", "r", "hole", "inset", "d", "id", "pcd", "teeth", "module", "slotl", "slotw", "clr"])
  t.check(`the "${k}" size box has a plain-English tip`, F.paramHelp(k).length > 15);
t.check("the family look-up finds a shape's family", F.familyOfShape("angle2h") && F.familyOfShape("angle2h").id === "flatbracket");
const src = fs.readFileSync(SITE + "js/make/presetbrowser.js", "utf8");
t.check("the browser uses the families (cards, a family page, Use this part)", /data-fam=/.test(src) && /data-pbuse/.test(src) && /How to size it for your job/.test(src));
t.done();

// r16 (Claude, Josh approved 22 Nov: "Would you be able to do this update", Rounds A, B and C of porta-plan-r16):
//   A0 the name is Porta Plasma everywhere; backups saved under the old name still restore
//   A1 presets whose sizes say "Inside" start with "Sizes are: Inside"
//   B  the ANDELI CUT-65DS chart: materials and limits, any thickness, supply caps, pierce / edge badges, duty cycle
import "../lib/env.mjs";
import fs from "node:fs";
import { T } from "../lib/t.mjs";
import { mod, SITE, allJsText } from "../lib/site.mjs";

const t = new T("65_r16");

// ---------------------------------------------------------------- A0
{
  const files = ["index.html", "manifest.json", "logo.svg", "logo-dark.svg", "favicon.svg", "README.md", "config/machine.json", "html/settings.html", "html/account.html"];
  const bad = files.filter((f) => /plazma/i.test(fs.readFileSync(SITE + f, "utf8")));
  t.check("A0 no page, icon or config file says Plazma", bad.length === 0, bad.join(", "));
  const jsBad = allJsText().filter(([f, s]) => /Porta Plazma/i.test(s)).map(([f]) => f);
  t.check("A0 no script shows the old name", jsBad.length === 0, jsBad.join(", "));
  const man = JSON.parse(fs.readFileSync(SITE + "manifest.json", "utf8"));
  t.check("A0 the installed app is called Porta Plasma", /^Porta Plasma/.test(man.name) && /^Porta Plasma/.test(man.short_name), man.name);
  const B = await mod("machinebackup");
  const make = (kind) => ({ kind, v: 1, at: "2026-11-20T10:00:00.000Z", app: {}, presets: [] });
  const oldRes = B.checkBackup(make("porta-plazma-machine-backup")), newRes = B.checkBackup(make(B.BACKUP_KIND));
  t.check("A0 new backups say porta-plasma", B.BACKUP_KIND === "porta-plasma-machine-backup");
  t.check("A0 a backup saved under the old name is not refused for its name", !oldRes.errors.includes("That file is not a machine settings backup."), JSON.stringify(oldRes.errors));
  t.check("A0 old and new names are checked the same way", JSON.stringify(oldRes.errors) === JSON.stringify(newRes.errors), JSON.stringify([oldRes.errors, newRes.errors]));
  t.check("A0 any other kind is still refused", B.checkBackup(make("something-else")).errors[0] === "That file is not a machine settings backup.");
}

// ---------------------------------------------------------------- A1
{
  const B = await mod("bends");
  B.setBendContext({ thickness: () => 2 });
  const { SHAPES } = await mod("shapes");
  const flat = (id) => {
    const sh = SHAPES.find((s) => s.id === id), p = Object.fromEntries(sh.params.map(([k, , d]) => [k, d]));
    let lo = [1e9, 1e9], hi = [-1e9, -1e9];
    for (const c of sh.make(p)) for (const q of c.pts) { lo = [Math.min(lo[0], q[0]), Math.min(lo[1], q[1])]; hi = [Math.max(hi[0], q[0]), Math.max(hi[1], q[1])]; }
    return { p, w: Math.round((hi[0] - lo[0]) * 1000) / 1000, h: Math.round((hi[1] - lo[1]) * 1000) / 1000 };
  };
  const ob = flat("openbox");
  t.check("A1 the open box (Inside sizes) starts on Sizes are: Inside", ob.p.bsz === B.SIZE_INSIDE, ob.p.bsz);
  t.check("A1 a 150 x 100 inside box in 2 mm unfolds to 251.048 x 201.048", ob.w === 251.048 && ob.h === 201.048, JSON.stringify(ob));
  const uc = flat("uchannel");
  t.check("A1 the U-channel (outside sizes) still starts on Outside, unchanged", uc.p.bsz === B.SIZE_OUTSIDE && uc.h === 133.048, JSON.stringify(uc));
  const BK = new Set(["bt", "bir", "bsz", "bk", "bd"]);
  const inside = SHAPES.filter((s) => s.bendAllowance === true && s.params.some(([k, l]) => !BK.has(k) && /^inside\b|\(inside\)/i.test(String(l))));
  t.check("A1 every folded preset with Inside sizes starts on Inside", inside.length >= 5 && inside.every((s) => s.params.find(([k]) => k === "bsz")[2] === B.SIZE_INSIDE), inside.map((s) => s.id).join(","));
}

// ---------------------------------------------------------------- B
const P = await mod("plasmaprofile");
const chart = P.expandChart(JSON.parse(fs.readFileSync(SITE + "config/cut_chart.json", "utf8")));
const mat = (n) => chart.materials.find((m) => m.name === n);
{
  t.check("B1 the default chart is the ANDELI CUT-65DS", chart.profile.id === "andeli-cut65ds" && chart.profile.amps_max_230v === 65 && chart.profile.amps_max_110v === 45);
  t.check("B1 the Reboot 60A chart is kept for Josh's own table", fs.existsSync(SITE + "config/cut_chart_reboot60.json"));
  t.check("B1 pierce limit 8 mm (6 mm on 110 V)", chart.profile.pierce_max_mm === 8 && chart.profile.pierce_max_mm_110v === 6);
  const names = chart.materials.map((m) => m.name);
  t.check("B2 materials include galvanised, Zintec, Corten, chequer plate, copper and brass", ["Mild steel", "Stainless steel", "Aluminium", "Galvanised", "Zintec", "Corten", "Chequer plate", "Copper", "Brass"].every((n) => names.includes(n)), names.join(","));
  t.check("B2 the first three stay mild steel, stainless, aluminium (saved jobs keep their names)", names.slice(0, 3).join() === "Mild steel,Stainless steel,Aluminium");
  t.check("B2 galvanised cuts like mild steel", mat("Galvanised").rows[2].feed_mm_min === mat("Mild steel").rows[2].feed_mm_min);
  t.check("B2 galvanised warns about zinc fumes", /fume/i.test(mat("Galvanised").tip || ""));
  const max = (n) => P.materialMax(mat(n));
  t.check("B3 limits: mild steel 25, stainless 16, aluminium 16, copper and brass 6", max("Mild steel") === 25 && max("Stainless steel") === 16 && max("Aluminium") === 16 && max("Copper") === 6 && max("Brass") === 6,
    JSON.stringify(names.map((n) => [n, max(n)])));
  t.check("B3 no 20 mm stainless or aluminium rows", !mat("Stainless steel").rows.some((r) => r.thickness_mm > 16) && !mat("Aluminium").rows.some((r) => r.thickness_mm > 16));
  const ms = mat("Mild steel");
  t.check("B3 every row has PSI and a nozzle", chart.materials.every((m) => m.rows.every((r) => r.air_psi > 0 && r.nozzle_mm > 0)));
  t.check("B3 3 mm mild steel: 40 A, 55 PSI, 1.0 nozzle, 2330 mm/min", (({ amps, air_psi, nozzle_mm, feed_mm_min }) => amps === 40 && air_psi === 55 && nozzle_mm === 1 && feed_mm_min === 2330)(P.rowFor(ms, 3)));
  t.check("B3 stainless runs at about 80 % and aluminium about 115 % of mild steel", P.rowFor(mat("Stainless steel"), 3).feed_mm_min === 1860 && P.rowFor(mat("Aluminium"), 3).feed_mm_min === 2680);
  t.check("B3 rough rows are marked", P.rowFor(ms, 20).quality === "rough" && P.rowFor(ms, 6).quality === "clean");
}
{
  const ms = mat("Mild steel");
  const r = P.rowFor(ms, 2.5);
  t.check("B4 2.5 mm sits between 2 and 3 mm: the 3 mm amps, a speed in between rounded down", r.amps === 40 && r.feed_mm_min === 2490 && r.between.join() === "2,3", JSON.stringify(r));
  t.check("B4 thicker than the material goes has no row", P.rowFor(ms, 26) === null);
  t.check("B4 thinner than the first row uses the first row", P.rowFor(ms, 0.8).thickness_mm === 1);
  const cases = [["3", 3], ["3 mm", 3], ["3/16", 4.76], ["3/16\"", 4.76], ["1 1/4in", 31.75], ["0.125in", 3.18], ["16 swg", 1.63], ["10g", 3.25], ["2,5", 2.5], ["abc", null], ["", null], ["3/0", null]];
  const bad = cases.filter(([s, v]) => P.parseThickness(s) !== v);
  t.check("B4 thickness can be typed in mm, inches, fractions or SWG", bad.length === 0, JSON.stringify(bad.map(([s, v]) => [s, v, P.parseThickness(s)])));
}
{
  const ms = mat("Mild steel");
  t.check("B1 16 A gives the full 65 A", P.supplyCap(chart, "16a") === 65 && P.capRow(chart, P.rowFor(ms, 12), "16a").amps === 65);
  t.check("B1 13 A is capped at 30 A", P.supplyCap(chart, "13a") === 30);
  t.check("B1 110 V: 3.3 kVA 28 A, 5 kVA 40 A, 10 kVA the plasma's 45 A", P.supplyCap(chart, "110v-3") === 28 && P.supplyCap(chart, "110v-5") === 40 && P.supplyCap(chart, "110v-10") === 45);
  const c6 = P.capRow(chart, P.rowFor(ms, 6), "13a");
  t.check("B1 6 mm on 13 A: 30 A and the speed scaled down (1290 x 30 / 45)", c6.capped && c6.amps === 30 && c6.feed_mm_min === 860 && c6.chart_amps === 45, JSON.stringify(c6));
  t.check("B1 a row inside the cap is untouched", P.capRow(chart, P.rowFor(ms, 1.5), "13a").capped === false && P.capRow(chart, P.rowFor(ms, 1.5), "13a").feed_mm_min === 2860);
  const kinds = (m, th, s) => P.cutStatus(chart, mat(m), th, s).map((x) => x.kind).join(",");
  t.check("B5 3 mm on 16 A: Pierce OK", kinds("Mild steel", 3, "16a") === "ok");
  t.check("B5 10 mm on 16 A: too thick to pierce (edge start)", kinds("Mild steel", 10, "16a") === "edge");
  t.check("B5 8 mm pierces on 230 V but not on 110 V", kinds("Mild steel", 8, "16a") === "ok" && kinds("Mild steel", 8, "110v-10").includes("edge"));
  t.check("B2 6 mm on 13 A: over the supply's limit", kinds("Mild steel", 6, "13a") === "supply");
  t.check("B2 16 A never shows the supply badge", chart.materials.every((m) => m.rows.every((r) => !kinds(m.name, r.thickness_mm, "16a").includes("supply"))));
  t.check("B3 20 mm mild steel: rough edge", kinds("Mild steel", 20, "16a").includes("rough"));
  t.check("B3 20 mm aluminium: over the plasma's limit", kinds("Aluminium", 20, "16a") === "over");
  t.check("B2 ECO advised for thin sheet at low amps only", P.ecoAdvised(chart, 30) && !P.ecoAdvised(chart, 45));
}
{
  t.check("B6 duty: 100 % at 45 A, 60 % at 55 A, 30 % at 65 A, 80 % at 50 A", P.dutyPct(chart, 45) === 100 && P.dutyPct(chart, 55) === 60 && P.dutyPct(chart, 65) === 30 && P.dutyPct(chart, 50) === 80);
  const a = P.dutyCheck(chart, 65, 150, 300), b = P.dutyCheck(chart, 65, 400, 900), c = P.dutyCheck(chart, 45, 5000, 6000);
  t.check("B6 2.5 min of arc at 65 A fits (3 min in 10)", a.ok && a.allowedSeconds === 180, JSON.stringify(a));
  t.check("B6 a busy long job at 65 A does not fit, and 45 A is offered", !b.ok && b.safeAmps === 45, JSON.stringify(b));
  t.check("B6 45 A can run all day", c.ok && c.pct === 100);
}

// ---------------------------------------------------------------- tidy (Josh 22 Nov: "I also need a more tidier code")
{
  const crypto = await import("node:crypto");
  const MAKE = ["css/screen-make.css", "css/screen-make-laptop.css", "css/screen-make-panels.css"];
  const index = fs.readFileSync(SITE + "index.html", "utf8");
  const links = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  const at = links.indexOf(MAKE[0]);
  t.check("TIDY the three Make stylesheets are linked together, in order", at >= 0 && MAKE.every((f, i) => links[at + i] === f), links.join(" "));
  const unwrap = (src) => { const s2 = src.replace(/\/\*[\s\S]*?\*\//g, "").trim(); const m = s2.match(/^@layer app \{([\s\S]*)\}$/); return m ? m[1] : s2; };
  const rules = MAKE.map((f) => unwrap(fs.readFileSync(SITE + f, "utf8"))).join("\n").replace(/\s+/g, " ").trim();
  // the rules of screen-make.css just before the split (r16 C2 included): the split moves no rule and changes none
  t.check("TIDY together they hold exactly the rules screen-make.css had, in the same order", crypto.createHash("sha1").update(rules).digest("hex") === "2960b5467782e8af1d337783850b07577ea4aa62");
  for (const f of [...MAKE, "css/screen-cut.css", "css/screen-cut-laptop.css", "css/screen-cut-setupgrid.css"]) {
    const n = fs.readFileSync(SITE + f, "utf8").split("\n").length;
    t.check(`TIDY ${f} is under 1,000 lines`, n < 1000, n + " lines");
  }
  const WAS = "align applyVariant arrayPivotOf cancelCentrePick cancelPolarPick centreBetween centrePrompt currentVariantKey cutOutline defaultDrawBulge distribute finishDraw finishOpenDraw flipV hitCentreEdge join joinParts linearArray mirror moveHole nest nudge offsetBy polarArray popDrawPoint pushDrawPoint resetHoles resizeCustomTo resizeTo rotateBy setAngle setHoleOffset setName setParam setPos startPolarPick subtract takeCentreEdge toggleHide toggleLock unlockAll variants _copyOwnedHoles _placeCentre".split(" ");
  const src = ["sketch-edit", "sketch-arrange", "sketch-shapeops"].map((f) => fs.readFileSync(SITE + `js/make/${f}.js`, "utf8")).join("\n");
  const defs = WAS.map((m) => (src.match(new RegExp(`^  ${m}\\(`, "gm")) || []).length);
  t.check("TIDY every sketch edit command is defined exactly once across the three files", defs.every((n) => n === 1), WAS.filter((m, i) => defs[i] !== 1).join(","));
  const { load } = await import("../lib/env.mjs");
  const A = await load(); const sk = A.newSketch();
  t.check("TIDY the Sketch still has every edit command", WAS.every((m) => typeof sk[m] === "function"), WAS.filter((m) => typeof sk[m] !== "function").join(","));
  sk.add("rect", true); sk.pick([sk.items[0].id]); sk.linearArray(3, 10, 0);
  t.check("TIDY a linear array still works after the move", sk.items.length === 3, String(sk.items.length));
  const lap = fs.readFileSync(SITE + "js/ui/laptop.js", "utf8");
  t.check("TIDY 8.2 the laptop DOM moves come from one table", /const MOVES = \[/.test(lap) && !/makeHome|skToolsHome|skOptsHome|tabsHome/.test(lap));
}
t.done();

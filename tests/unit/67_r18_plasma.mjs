// r18 (Josh 23 Nov 2026: "adjust the cnc depending on what plazma cutter is being used … a reboot as well but made default
// what it is now"): pick the plasma (ANDELI CUT-65DS default, Reboot 60A) in the setup guide or Settings › Torch; the cut
// chart swaps straight away and the torch start type follows it unless set by hand.
import "../lib/env.mjs";
import fs from "node:fs";
import { T } from "../lib/t.mjs";
import { SITE } from "../lib/site.mjs";

const t = new T("67_r18_plasma");
const PP = await import("../../js/cut/plasmapick.js");
const PR = await import("../../js/cut/plasmaprofile.js");
const ST = await import("../../js/core/state.js");
const SET = await import("../../js/machine/settings.js");
const read = (f) => PR.expandChart(JSON.parse(fs.readFileSync(SITE + f, "utf8")));

t.check("the ANDELI CUT-65DS is the default plasma", PP.DEFAULT_PLASMA === "andeli-cut65ds" && PP.currentPlasmaId() === "andeli-cut65ds");
t.check("the Reboot 60A is the other choice", PP.PLASMAS.map((p) => p.id).join() === "andeli-cut65ds,reboot60");
t.check("an unknown saved plasma falls back to the default", PP.plasmaById("nonsense").id === "andeli-cut65ds");
for (const p of PP.PLASMAS) {
  const c = read(p.file);
  t.check(`${p.name}: its chart says which plasma it is`, c.profile && c.profile.id === p.id);
  t.check(`${p.name}: 16 A gives full power and 13 A is capped`, PR.supplyCap(c, "16a") === c.profile.amps_max_230v && PR.supplyCap(c, "13a") === 30);
  t.check(`${p.name}: every row has a nozzle, PSI and an edge quality`, c.materials.every((m) => m.rows.every((r) => r.nozzle_mm > 0 && r.air_psi > 0 && r.quality)));
  t.check(`${p.name}: galvanised, Zintec, Corten and chequer plate are there`, ["Galvanised", "Zintec", "Corten", "Chequer plate"].every((n) => c.materials.some((m) => m.name === n)));
  t.check(`${p.name}: stainless and aluminium stop at 16 mm`, ["Stainless steel", "Aluminium"].every((n) => PR.materialMax(c.materials.find((m) => m.name === n)) === 16));
}
t.check("Andeli is pilot arc, Reboot is touch start", read("config/cut_chart.json").profile.cutter_kind === "pilot-arc" && read("config/cut_chart_reboot60.json").profile.cutter_kind === "touch-start");

// swapping the plasma swaps the chart everywhere, with no reload
const files = Object.fromEntries(PP.PLASMAS.map((p) => [p.file, fs.readFileSync(SITE + p.file, "utf8")]));
ST.S.material = "Copper";
let after = 0;
const r1 = await PP.setPlasma("reboot60", { fetchText: async (u) => files[u], after: () => { after++; } });
t.check("choosing the Reboot loads its chart", r1.ok && ST.S.chart.profile.id === "reboot60" && after === 1, JSON.stringify(r1.why || ""));
t.check("a material the Reboot chart doesn't have falls back to the first one", ST.S.material === "Mild steel");
t.check("the choice is remembered", PP.currentPlasmaId() === "reboot60" && PP.plasmaChosen());
t.check("the torch start type follows the plasma (Reboot → touch start)", SET.resolveCutterKind("auto") === "touch-start");
const r2 = await PP.setPlasma("andeli-cut65ds", { fetchText: async (u) => files[u] });
t.check("back to the Andeli", r2.ok && ST.S.chart.profile.id === "andeli-cut65ds" && SET.resolveCutterKind("auto") === "pilot-arc");
t.check("a start type set by hand still wins", SET.resolveCutterKind("touch-start") === "touch-start" && SET.resolveCutterKind("hf") === "hf");
const setSrc = fs.readFileSync(SITE + "js/machine/settings.js", "utf8");
t.check("an unset start type means 'same as your plasma'", SET.sanitizeCutterKind("auto") === "auto" && /cutter: \{ kind: "auto" \}/.test(setSrc) && /kindRaw == null \|\| kindRaw === "" \? "auto"/.test(setSrc));
const bad = await PP.setPlasma("reboot60", { fetchText: async () => { throw new Error("offline"); } });
t.check("if the chart can't load, nothing changes and the reason is given", !bad.ok && /Couldn't load/.test(bad.why) && ST.S.chart.profile.id === "andeli-cut65ds");
const html = fs.readFileSync(SITE + "html/settings.html", "utf8");
t.check("Settings › Torch has the plasma choice, with no reload button", /id="setPlasmaProfile"/.test(html) && !/setPlasmaReload/.test(html));
t.check("Cutter type offers 'Same as your plasma'", /<option value="auto">Same as your plasma/.test(html));
const tools = fs.readFileSync(SITE + "js/ui/tools.js", "utf8");
t.check("the setup guide starts with choosing the plasma", /const GUIDE = \[[\s\S]*?id: "plasma"[\s\S]*?id: "connect"/.test(tools));
t.done();

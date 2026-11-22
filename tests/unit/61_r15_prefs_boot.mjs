// r15 Round 8 (pre-existing 10 PRO-PERSIST, 69_simple_advanced_phone): at start-up the cut panel saves the speeds and material
// into the prefs (syncCutPrefsToAccount, from renderMaterials) before Make it yours has loaded them. That save used to write
// the default prefs over the stored ones, so every reload lost the Simple / Advanced choice, theme, accent and the rest.
// A save before the first load must merge into what is stored.
import "../lib/env.mjs";
import { T } from "../lib/t.mjs";
import { mod } from "../lib/site.mjs";

const t = new T("61_r15_prefs_boot");
localStorage.setItem("plasma.yours.v1", JSON.stringify({ mode: "advanced", theme: "dark", accent: "green", toolbar: "top" }));
localStorage.setItem("plasma.material", JSON.stringify({ m: "Mild steel", t: 3 }));
const P = await mod("prefs");          // a fresh page: nothing loaded yet
P.syncCutPrefsToAccount();             // what renderMaterials does during start-up
const stored = JSON.parse(localStorage.getItem("plasma.yours.v1") || "{}");
t.check("an early save keeps the stored Advanced choice", stored.mode === "advanced", JSON.stringify(stored));
t.check("an early save keeps the stored theme, accent and toolbar", stored.theme === "dark" && stored.accent === "green" && stored.toolbar === "top", JSON.stringify(stored));
t.check("an early save still stores the material", stored.material && stored.material.m === "Mild steel", JSON.stringify(stored.material));
t.check("getPrefs before the first load reads what is stored", P.getPrefs().mode === "advanced", JSON.stringify(P.getPrefs()));
process.exit(t.done() ? 1 : 0);

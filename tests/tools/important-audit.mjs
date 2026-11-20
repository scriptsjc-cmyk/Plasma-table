// How the r13 !important pass was checked. 1) python3 tools/important-scan.py <repo>  -> imp/decls.json (every !important, its selector and span)
// 2) DECLS=.../decls.json OUT=.../res.json node tools/important-audit.mjs  -> per declaration: tested in some state/size, and whether demoting it changed any computed style
// 3) ONLY=<json list of candidates> ... -> demote them all at once and list any that change; drop those, repeat until none. Then remove the rest from the CSS.
// Harness: for each !important declaration, demote it in the live CSSOM and check whether any matched element's computed value changes.
import fs from "node:fs";
import { startServer, launch, newPage, demoToShape, ensurePracticeHomed, PROFILES } from "../lib/browser.mjs";
import { devices } from "playwright";
PROFILES.p844 ||= { ...devices["iPhone 14"], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } };
const decls = JSON.parse(fs.readFileSync(process.env.DECLS, "utf8"));
const only = process.env.ONLY ? new Set(JSON.parse(fs.readFileSync(process.env.ONLY, "utf8"))) : null;   // for the combined check: demote these all at once
const srv = await startServer(); const br = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = decls.map(() => ({ tested: 0, changed: 0, why: "" }));

const PAGE_FN = ([decls, only]) => {
  const norm = (x) => (x || "").replace(/\/\*.*?\*\//g, "").replace(/["'\s]/g, "").replace(/::/g, ":");
  // index CSSOM style rules by file + chain + selector
  const idx = new Map();
  const walk = (rules, file, chain) => { for (const r of rules) {
    if (r instanceof CSSStyleRule) { const k = file + "|" + chain.join("|") + "|" + norm(r.selectorText); (idx.get(k) || idx.set(k, []).get(k)).push(r); }
    else if (r.cssRules && !(r instanceof CSSKeyframesRule)) {
      const pre = r instanceof CSSMediaRule ? "@media" + r.conditionText : r instanceof CSSSupportsRule ? "@supports" + r.conditionText : r instanceof CSSContainerRule ? "@container" + r.conditionText : "@?";
      walk(r.cssRules, file, chain.concat(norm(pre)));
    } } };
  for (const sh of document.styleSheets) { if (!sh.href) continue; const f = sh.href.split("/").pop().split("?")[0]; try { walk(sh.cssRules, f, []); } catch (e) {} }
  const activeChain = (r) => { for (let p = r.parentRule; p; p = p.parentRule) { if (p instanceof CSSMediaRule && !matchMedia(p.conditionText).matches) return false; if (p instanceof CSSSupportsRule && !CSS.supports(p.conditionText)) return false; } return true; };
  const out = [];
  const demote = (r, prop) => { const before = [...r.style].filter((p) => r.style.getPropertyPriority(p) === "important");
    const v = r.style.getPropertyValue(prop); if (!v) return null; r.style.setProperty(prop, v, "");
    const after = new Set([...r.style].filter((p) => r.style.getPropertyPriority(p) === "important"));
    return { longs: before.filter((p) => !after.has(p)), restore: () => r.style.setProperty(prop, v, "important") }; };
  const targets = (r) => { const sel = r.selectorText; const parts = sel.split(/,(?![^(]*\))/); const res = [];
    for (const raw of parts) { const m = raw.match(/::?(before|after|placeholder|selection|-webkit-[\w-]+|marker|backdrop|file-selector-button|first-line|first-letter)\b(\(.*\))?\s*$/);
      const pseudo = m ? m[0].trim() : null; if (pseudo && !/^::?(before|after)$/.test(pseudo)) return null;   // can't measure: keep
      const base = pseudo ? raw.slice(0, raw.length - m[0].length) : raw;
      let els; try { els = document.querySelectorAll(base.trim() || "*"); } catch (e) { return null; }
      for (const el of els) res.push([el, pseudo ? (pseudo.includes("before") ? "::before" : "::after") : null]); }
    return res; };
  const read = (pairs, longs) => pairs.map(([el, ps]) => { const cs = getComputedStyle(el, ps); return longs.map((p) => cs.getPropertyValue(p)).join("|"); });
  if (only) {   // combined: demote all listed at once, report which listed decls see a change
    const ops = [];
    for (const i of only) { const d = decls[i]; const k = d.file + "|" + d.chain.map(norm).join("|") + "|" + norm(d.sel); for (const r of idx.get(k) || []) ops.push([i, r, d.prop]); }
    const meas = ops.map(([i, r, prop]) => { const t = targets(r); const l = [...r.style].filter((p) => r.style.getPropertyPriority(p) === "important"); return { i, t, l, b: t ? read(t, l) : null }; });
    const undo = ops.map(([i, r, prop]) => demote(r, prop)).filter(Boolean);
    for (const m of meas) { if (!m.t) continue; const a = read(m.t, m.l); if (a.join("#") !== m.b.join("#")) out.push(m.i); }
    undo.forEach((u) => u.restore());
    return out;
  }
  decls.forEach((d, i) => {
    if (d.kf) { out.push({ i, t: 0, c: 0, w: "keyframes" }); return; }
    if (/^(transition|animation)/.test(d.prop || "")) { out.push({ i, t: 0, c: 1, w: "transition prop" }); return; }
    const k = d.file + "|" + d.chain.map(norm).join("|") + "|" + norm(d.sel); const rs = idx.get(k);
    if (!rs || !rs.length) { out.push({ i, t: 0, c: 0, w: "no rule " + k.slice(0, 120) }); return; }
    let tested = 0, changed = 0;
    for (const r of rs) {
      if (!activeChain(r)) continue;
      const t = targets(r); if (!t) { changed = 1; continue; }
      const pairs = t.filter(([el, ps]) => { try { return el.matches(r.selectorText.split(/,(?![^(]*\))/).map((s) => s.replace(/::?(before|after)\s*$/, "")).join(",")); } catch (e) { return false; } });
      if (!pairs.length) continue;
      const longs0 = [...r.style].filter((p) => r.style.getPropertyPriority(p) === "important");
      const b = read(pairs, longs0);
      const dm = demote(r, d.prop); if (!dm) { changed = 1; continue; }
      const a = read(pairs, dm.longs.length ? dm.longs : longs0), b2 = read(pairs, dm.longs.length ? dm.longs : longs0);
      dm.restore();
      const bb = read(pairs, dm.longs.length ? dm.longs : longs0);
      tested = 1; if (a.join("#") !== bb.join("#")) changed = 1;
    }
    out.push({ i, t: tested, c: changed });
  });
  return out;
};

const STATES = [
  ["menu", async (p) => { await p.evaluate(() => window.plasmaTest.showScreen("menu")); }],
  ["make simple", async (p) => { await p.evaluate(() => { const T = window.plasmaTest; T.showScreen("make"); T.setAppMode("simple", { persist: false, autoFs: false }); T.setShapeFs(false); T.sketch.clear(); T.sketch.add("rect"); }); }],
  ["make simple fs", async (p) => { await p.evaluate(() => { const T = window.plasmaTest; T.setShapeFs(true); }); }],
  ["make adv", async (p) => { await p.evaluate(() => { const T = window.plasmaTest; T.setShapeFs(false); T.setAppMode("advanced", { persist: false, autoFs: false }); T.sketch.add("rect"); }); }],
  ["presets", async (p) => { await p.evaluate(() => window.plasmaTest.openPresetBrowser()); }],
  ["cut part", async (p) => { await p.evaluate(() => { const T = window.plasmaTest; document.getElementById("pbClose")?.click(); T.setAppMode("simple", { persist: false, autoFs: false }); T.sendToCutting(); T.goStep(1); }); }],
  ["cut setup", async (p) => { await p.evaluate(() => window.plasmaTest.goStep(3)); }],
  ["connected part", async (p) => { await demoToShape(p, { stay: "cut" }); await ensurePracticeHomed(p); await p.evaluate(() => window.plasmaTest.goStep(1)); }],
  ["connected setup", async (p) => { await p.evaluate(() => window.plasmaTest.goStep(3)); }],
  ["machine setup", async (p) => { await p.evaluate(() => import(new URL("js/ui/nav.js", location.href).href).then((n) => n.showTab("setup"))); }],
  ["machine motors", async (p) => { await p.evaluate(() => document.querySelector('[data-setup-tab="motors"]')?.click()); }],
  ["machine torch", async (p) => { await p.evaluate(() => document.querySelector('[data-setup-tab="torch"]')?.click()); }],
  ["running", async (p) => { await p.evaluate(() => import(new URL("js/ui/nav.js", location.href).href).then((n) => n.showTab("cut")));
    await p.evaluate(() => window.plasmaTest.demoEdges()); await sleep(6000); await p.evaluate(() => window.plasmaTest.goStep(3)); await sleep(400);
    await p.evaluate(() => document.getElementById("btnZero").click()); await sleep(400);
    await p.evaluate(() => { document.querySelectorAll("#checklist input").forEach((i) => { if (!i.disabled) i.checked = true; }); document.getElementById("checklist").dispatchEvent(new Event("change")); });
    await p.evaluate(() => document.getElementById("btnStart").click()); await sleep(1500); }],
  ["stopped", async (p) => { await p.evaluate(() => document.getElementById("btnStop").click()); }],
  ["header hidden", async (p) => { await p.evaluate(() => { try { window.plasmaTest.setHeaderHidden(true); } catch (e) {} }); }],
];
const sizes = (process.env.SIZES || "d1280x600,d1366x640,d1536x730,d1440x800,d1920x970,d1366,iphone14,p844").split(",");
let combinedBad = new Set();
for (const prof of sizes) {
  const page = await newPage(br, prof, { base: srv.base, consoleErrors: false });
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
  for (const [name, go] of STATES) {
    try { await go(page); } catch (e) { console.error(prof, name, "state failed", String(e).slice(0, 100)); continue; }
    await sleep(350);
    const res = await page.evaluate(PAGE_FN, [decls, only ? [...only] : null]);
    if (only) res.forEach((i) => combinedBad.add(i));
    else res.forEach((x) => { const r = result[x.i]; r.tested ||= x.t; r.changed ||= x.c; if (x.w) r.why = x.w; if (x.c && !r.where) r.where = prof + "/" + name; });
  }
  await page.context().close();
  console.error("done", prof);
}
await br.close(); srv.close();
fs.writeFileSync(process.env.OUT, JSON.stringify(only ? [...combinedBad] : result));

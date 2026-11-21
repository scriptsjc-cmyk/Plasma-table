// r15 Round 8 safety net for CSS refactors (@layer, container queries): open every scene at every size in two copies of
// the site side by side and compare the computed style of every element (and its ::before / ::after), property by property.
// Screenshots only see what a scene shows; this also covers hidden dialogs, sheets and menus (they still get computed
// styles). Not covered: :hover / :focus / :active states.
//   node tools/style-diff.mjs <siteA> <siteB> [--only=profile,…] [--scenes=name,…]
// Exit 1 and a list of element / property / A value / B value when anything differs.
import path from "node:path";
import { startServer, launch, newPage } from "../lib/browser.mjs";
import { PROFILES, SCENES, prepare } from "./scenes.mjs";

const args = process.argv.slice(2), opt = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1];
const [siteA, siteB] = args.filter((a) => !a.startsWith("--")).map((d) => path.resolve(d) + "/");
if (!siteA || !siteB) { console.log("usage: style-diff.mjs <siteA> <siteB> [--only=profiles] [--scenes=names]"); process.exit(2); }
const profs = opt("only") ? opt("only").split(",") : PROFILES;
const scenes = Object.entries(SCENES).filter(([n]) => !opt("scenes") || opt("scenes").split(",").includes(n));

// every element in document order: a key (nearest id + tag path) and its computed styles as one string per pseudo
const COLLECT = () => {
  const out = {}, seen = {};
  const keyOf = (el) => { const parts = []; let e = el; while (e && e.nodeType === 1) { if (e.id) { parts.unshift("#" + e.id); break; } const sib = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [e]; parts.unshift(e.tagName.toLowerCase() + (sib.length > 1 ? `:${sib.indexOf(e)}` : "")); e = e.parentElement; } return parts.join(">"); };
  const dump = (cs) => { const o = []; for (let i = 0; i < cs.length; i++) { const p = cs[i]; o.push(p + ":" + cs.getPropertyValue(p)); } return o.join("\n"); };
  for (const el of document.querySelectorAll("*")) {
    if (el.closest("head") || el.tagName === "STYLE" || el.tagName === "SCRIPT") continue;
    let k = keyOf(el); if (seen[k]) k += "~" + seen[k]++; else seen[k] = 1;
    out[k] = [dump(getComputedStyle(el)), dump(getComputedStyle(el, "::before")), dump(getComputedStyle(el, "::after"))];
  }
  return out;
};

const sa = await startServer({ site: siteA }), sb = await startServer({ site: siteB }), br = await launch();
let bad = 0, pages = 0;
const JOBS = Math.max(1, Number(process.env.JOBS) || 3);
async function oneProfile(prof) {
  for (const [name, run] of scenes) {
    const grab = async (srv) => { const page = await newPage(br, prof, { base: srv.base, consoleErrors: false }); try { await prepare(page, run); return await page.evaluate(COLLECT); } finally { await page.context().close(); } };
    // a pair that differs is grabbed again once: the header height (--topbar-h) is measured by JS and can land a moment
    // later at iPhone 14 landscape, so only differences that show twice are reported
    let diffs = [];
    try {
      for (let tryNo = 0; tryNo < 2; tryNo++) { diffs = compareOnce(await grab(sa), await grab(sb)); if (!diffs.length) break; }
    } catch (e) { console.log(`  ! ${prof} ${name}: ${e.message.split("\n")[0]}`); bad++; continue; }
    pages++;
    if (diffs.length) { bad++; console.log(`DIFF ${prof} ${name}: ${diffs.length}\n` + diffs.slice(0, 25).map((d) => "    " + d.slice(0, 220)).join("\n")); }
  }
}
function compareOnce(A, B) {
    const diffs = [];
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (!A[k] || !B[k]) { diffs.push(`${k}: only in ${A[k] ? "A" : "B"}`); continue; }
      ["", "::before", "::after"].forEach((ps, i) => {
        if (A[k][i] === B[k][i]) return;
        const ma = new Map(A[k][i].split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1)]));
        const mb = new Map(B[k][i].split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1)]));
        for (const p of new Set([...ma.keys(), ...mb.keys()])) if (ma.get(p) !== mb.get(p)) diffs.push(`${k}${ps} ${p}: ${ma.get(p)} -> ${mb.get(p)}`);
      });
    }
    return diffs;
}
const queue = profs.slice();
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => { while (queue.length) await oneProfile(queue.shift()); }));
await br.close(); sa.close(); sb.close();
console.log(bad ? `${bad} of ${pages} scene/size pairs differ` : `all ${pages} scene/size pairs have identical computed styles`);
process.exit(bad ? 1 : 0);

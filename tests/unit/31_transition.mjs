// r13 section 2: the transition helper never animates STOP, never animates during a job or with reduced motion, and never delays the change.
import { SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";
import fs from "node:fs";

const t = new T("31_transition");
const mkEl = (id) => {
  const cls = new Set(), kids = [];
  return { id, kids, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), has: cls },
    contains: (o) => o === this || kids.includes(o), offsetWidth: 1, addEventListener() {}, removeEventListener() {} };
};
const stop = mkEl("btnStop"), body = mkEl("body");
let reducedOn = false;
globalThis.window = { matchMedia: () => ({ matches: reducedOn }) };
globalThis.document = { body, getElementById: (id) => (id === "btnStop" ? stop : null) };
globalThis.setTimeout = () => 0;
const tx = await import(SITE + "js/ui/transition.js");

const a = mkEl("a"); tx.enter(a, "fwd");
t.check("a step change gets the short slide class", a.classList.contains("tx-fwd"));
tx.enter(stop, "fade");
t.check("STOP itself is never animated", !stop.classList.contains("tx-fade"));
const bar = mkEl("bar"); bar.kids.push(stop); bar.contains = (o) => o === stop; tx.enter(bar, "pop");
t.check("nothing that holds STOP is animated", !bar.classList.contains("tx-pop"));
for (const c of ["running-job", "job-live", "estop-latched"]) {
  body.classList.add(c); const e = mkEl("e"); tx.enter(e, "fade");
  t.check(`no animation while body.${c}`, !e.classList.contains("tx-fade") && tx.still());
  body.classList.remove(c);
}
reducedOn = true; const r = mkEl("r"); tx.enter(r, "fade");
t.check("reduced motion: no animation", !r.classList.contains("tx-fade")); reducedOn = false;
let ran = false; const out = tx.go(() => { ran = true; return 42; }, "fade", null);
t.check("go() runs the change straight away and returns its result", ran && out === 42);

const css = fs.readFileSync(SITE + "css/components.css", "utf8");
const block = css.slice(css.indexOf("r13 section 2: transitions"));
t.check("transition CSS is inside prefers-reduced-motion: no-preference and skips running jobs", /prefers-reduced-motion: no-preference/.test(block) && /body:not\(\.running-job\):not\(\.job-live\) \.tx-fwd/.test(block));
t.check("transition CSS never names STOP", !/btnStop|\.estop/.test(block.replace(/\/\*[\s\S]*?\*\//g, "")));
t.check("every transition is 0.15 s or less", (block.match(/animation:[^;]+/g) || []).every((a) => /var\(--motion\)|\.1[0-5]?s|\.12s/.test(a)));
process.exit(t.done() ? 1 : 0);

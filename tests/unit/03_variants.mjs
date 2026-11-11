import { T } from "../lib/t.mjs"; import { load } from "../lib/env.mjs"; import { verifyDesign } from "../lib/verify.mjs";
const A = await load(); const t = new T("03_variants");
const box = (sk, it) => sk.boxOf(it);
const near = (a, b, tol = 0.25) => Math.abs(a - b) <= tol;
const bases = [["rect", { w: 100, h: 50 }, 10, 20], ["rect", { w: 200, h: 120 }, 300, 77.5], ["rect", { w: 40, h: 40 }, 0, 0], ["disc", { d: 100 }, 15, 15], ["triangle", { w: 100, h: 80 }, 5, 5], ["plate", { w: 120, h: 80 }, 50, 50],
  ["chamfer", { w: 100, h: 60 }, 33, 11], ["slotted", { w: 120, h: 60 }, 8, 8], ["tab", { w: 80, h: 50 }, 20, 20], ["bracket", { w: 50, h: 120 }, 70, 3], ["slot", { len: 120, wid: 40 }, 9, 9], ["gusset", { a: 100, b: 100 }, 0, 40], ["flange", { d: 150 }, 100, 100], ["ring", { d: 100 }, 1, 1], ["polygon", { d: 100 }, 12, 12]];
let n = 0;
for (const [type, p0, x, y] of bases) {
  const fam = A.variantsFor(type);
  t.check(`${type}: has a Versions row`, fam.length >= 2, `${fam.length}`);
  for (const v of fam) {
    const sk = A.newSketch(); sk.add(type, true); const it = sk.items[0];
    Object.assign(it.p, p0); it.x = x; it.y = y; sk.pick([it.id]);
    const b0 = box(sk, it), w0 = b0[2] - b0[0], h0 = b0[3] - b0[1];
    const lbl = `${type} -> ${v.label || v.id}${v.key ? "" : ""}`;
    sk.applyVariant(v);
    const it2 = sk.selected(); n++;
    if (!t.check(`${lbl}: still selected/exists`, !!it2)) continue;
    const b1 = box(sk, it2), w1 = b1[2] - b1[0], h1 = b1[3] - b1[1];
    const uniform = ["disc", "ring", "flange", "polygon"].includes(it2.type);
    t.check(`${lbl}: keeps position (${x},${y})`, near(b1[0], b0[0]) && near(b1[1], b0[1]), `before ${b0.map((v) => +v.toFixed(2))} after ${b1.map((v) => +v.toFixed(2))}`, "VAR-POS");
    // B5 22: a round/regular shape is the same size both ways, so from a non-square outline it takes the larger size (and tells the user)
    t.check(`${lbl}: keeps size ${w0.toFixed(1)}x${h0.toFixed(1)}`, (near(w1, w0) && near(h1, h0)) || (uniform && near(w1, h1) && near(w1, Math.max(w0, h0))), `got ${w1.toFixed(2)}x${h1.toFixed(2)}`, "VAR-SIZE");
    const cs = sk.contours();
    t.check(`${lbl}: all contours finite, closed, >=3 pts`, cs.length > 0 && cs.every((c) => c.pts.length >= 3 && c.pts.flat().every(Number.isFinite)), "", "VAR-GEOM");
    verifyDesign(A, t, `variant ${lbl}`, cs);
    // every feature (hole/slot) must sit inside the outline, otherwise the torch cuts air / chops the part
    { const out = cs[0], ob = A.bbox([out]); const inside = (c) => c.pts.every((q) => A.pointInPoly(q, out.pts));
      const stray = cs.slice(1).filter((c) => !inside(c));
      const flagged = (() => { try { const r = A.checkDesign(cs, { thickness: 3, kerf: 1.5, leadIn: 3, table: [1300, 800] }); return r.groups.some((g) => g.level === "bad" || g.level === "error" || /outside|cross|overlap|through|edge/i.test(g.text)); } catch (e) { return "ERR " + e.message; } })();
      t.check(`${lbl}: all holes/slots inside the outline`, stray.length === 0, `${stray.length} feature(s) outside/overlapping the part; cut check flagged=${flagged}`, "VAR-STRAY");
      if (stray.length) t.check(`${lbl}: stray features are flagged by the cut check`, flagged === true, `cut check silent=${!flagged}`, "VAR-STRAY-UNFLAGGED"); }
    sk.undo();
    const bu = box(sk, sk.items[0]);
    t.check(`${lbl}: undo restores type+size+pos`, sk.items[0].type === type && near(bu[0], b0[0], 0.05) && near(bu[2] - bu[0], w0, 0.05), `${sk.items[0].type} ${bu.map((v) => +v.toFixed(2))}`, "VAR-UNDO");
    sk.redo();
    t.check(`${lbl}: redo reapplies`, sk.items[0].type === it2.type, "");
  }
}
// chain every variant in sequence (drift check)
{
  const sk = A.newSketch(); sk.add("rect", true); const it = sk.items[0]; it.p.w = 137; it.p.h = 63; it.x = 41; it.y = 29; sk.pick([it.id]);
  const b0 = box(sk, it);
  const order = ["Rounded", "Chamfered", "Slotted", "Corner holes", "Corner + centre hole", "With tab", "Bracket", "Square corners", "Rounded", "With tab", "Corner holes", "Chamfered"];
  for (const k of order) { const v = A.variantsFor(sk.selected().type).find((q) => q.label === k); if (!v) { t.check(`chain: variant ${k} reachable from ${sk.selected().type}`, false, "", "VAR-CHAIN"); continue; } sk.applyVariant(v); }
  const b1 = box(sk, sk.selected());
  t.check("chain of 12 variant switches: size/pos drift < 0.5mm", near(b1[0], b0[0], .5) && near(b1[1], b0[1], .5) && near(b1[2] - b1[0], b0[2] - b0[0], .5) && near(b1[3] - b1[1], b0[3] - b0[1], .5), `before ${b0.map((v) => +v.toFixed(1))} after ${b1.map((v) => +v.toFixed(1))} type=${sk.selected().type}`, "VAR-SIZE");
}
// idempotence: tapping the same version repeatedly must not keep shrinking/growing the part
for (const [type, p0, lab] of [["triangle", { w: 100, h: 80 }, "Gusset"], ["triangle", { w: 100, h: 80 }, "Radiused"], ["rect", { w: 100, h: 50 }, "With tab"], ["rect", { w: 100, h: 50 }, "Rounded"], ["disc", { d: 100 }, "Flange (bolt circle)"]]) {
  const sk = A.newSketch(); sk.add(type, true); Object.assign(sk.items[0].p, p0); sk.pick([sk.items[0].id]);
  const get = () => { const b = sk.boxOf(sk.selected()); return [b[2] - b[0], b[3] - b[1]]; };
  const findV = () => A.variantsFor(sk.selected().type).find((q) => q.label === lab || (!q.label && A.shapeDef(q.id).name === lab));
  sk.applyVariant(findV()); const a = get(); for (let i = 0; i < 5; i++) sk.applyVariant(findV()); const b = get();
  t.check(`tap '${lab}' x6 on ${type}: size stable`, near(a[0], b[0], 0.3) && near(a[1], b[1], 0.3), `after 1 tap ${a.map((v) => +v.toFixed(1))}, after 6 taps ${b.map((v) => +v.toFixed(1))}`, "VAR-DRIFT");
}
// current-variant highlight sanity: each variant button when applied reports itself selected
for (const v of A.variantsFor("rect")) {
  const sk = A.newSketch(); sk.add("rect", true); sk.pick([sk.items[0].id]); sk.applyVariant(v);
  t.check(`highlight: '${v.label}' marks its own button`, sk.currentVariantKey() === A.variantKey(v), `key=${sk.currentVariantKey()} expected ${A.variantKey(v)}`, "VAR-HILITE");
}
// custom (joined) parts: no variants
{ const sk = A.newSketch(); sk.add("rect", true); sk.add("rect", true); sk.items[1].x = 50; sk.pick(sk.items.map((i) => i.id)); sk.join(); const s = sk.selected(); if (s) t.check("custom part: no Versions row", sk.variants().length === 0 && (sk.applyVariant({ id: "rect", p: {} }), sk.selected().type === "custom")); }
t.note("variant applications tested", n);
process.exit(t.done() ? 1 : 0);

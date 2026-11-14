// Stage 2 (C10–C14): fillet no-op / one undo, offset keep/both/refuse/circles,
// circular-array pivot, import parts onto the Make drawing.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { assessOffset, detectCircle, signedArea } from "../../js/core/geom.js";
import { parseDXF } from "../../js/make/dxf.js";
import { contoursToEditable } from "../../js/make/editable.js";

const A = await load();
const t = new T("23_cad_c10_c14");
const mk = (specs) => {
  const sk = A.newSketch();
  for (const [type, p, x, y] of specs) { sk.add(type, true); const it = sk.items.at(-1); Object.assign(it.p, p); it.x = x; it.y = y; }
  sk.opts.pro = true;
  return sk;
};
const box = (it, sk) => sk.boxOf(it);
const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// ---- C11 fillet: no-op must not convert; the batch is one undo ----
{
  const sk = mk([["rect", { w: 120, h: 80 }, 0, 0]]);
  const it = sk.items[0];
  sk.pick([it.id]);
  const past0 = sk.past.length;
  const n = sk.filletInsideCorners(8);
  t.check("C11: a plain rectangle has no inside corners to fillet", n === 0, `n=${n} msg=${sk.messages.slice(-1)}`, "C11-FILLET");
  t.check("C11: the rectangle is not converted to a joined part", it.type === "rect", `type=${it.type}`, "C11-FILLET");
  t.check("C11: a no-op does not add an undo step", sk.past.length === past0, `past=${sk.past.length} was=${past0}`, "C11-FILLET");

  // Joined step: two inside corners, one undo peels both.
  const step = mk([["rect", { w: 200, h: 80 }, 0, 0], ["rect", { w: 200, h: 80 }, 80, 80]]);
  step.pick(step.items.map((i) => i.id));
  step.join();
  const before = step.items[0].shape.cs[0].pts.length;
  const past1 = step.past.length;
  const n2 = step.filletInsideCorners(10);
  t.check("C11: both inside corners fillet in one go", n2 === 2, `n=${n2}`, "C11-FILLET");
  t.check("C11: batch added a single undo step", step.past.length === past1 + 1, `past=${step.past.length} was=${past1}`, "C11-FILLET");
  step.undo();
  t.check("C11: one undo restores both corners", step.items[0].shape.cs[0].pts.length === before, `pts=${step.items[0].shape.cs[0].pts.length} before=${before}`, "C11-FILLET");
}

// ---- C12 offset: refuse invert / sliver; keep original; both sides; circles ----
{
  const tiny = [[0, 0], [80, 0], [80, 60], [0, 60]];
  t.check("C12: −500 on a small part is refused (larger than half)", /shrink|invert|half|or less/i.test(assessOffset(tiny, [[-500, -500], [580, -500], [580, 560], [-500, 560]], -500) || ""), String(assessOffset(tiny, [[-500, -500], [580, -500], [580, 560], [-500, 560]], -500)), "C12-OFFSET");
  const sliverOff = [[0, 0], [80, 0], [80, 1.2], [0, 1.2]];
  t.check("C12: a 1.2 mm sliver is refused", /sliver|thin/i.test(assessOffset(tiny, sliverOff, -29) || ""), String(assessOffset(tiny, sliverOff, -29)), "C12-OFFSET");

  const sk = mk([["rect", { w: 100, h: 80 }, 0, 0]]);
  sk.pick([sk.items[0].id]);
  const past0 = sk.past.length;
  sk.offsetBy(-500);
  t.check("C12: offset −500 does not change the rectangle", sk.items.length === 1 && sk.items[0].type === "rect" && sk.items[0].p.w === 100, `type=${sk.items[0].type} w=${sk.items[0].p && sk.items[0].p.w} msg=${sk.messages.slice(-1)}`, "C12-OFFSET");
  t.check("C12: a refused offset does not add an undo step", sk.past.length === past0, `past=${sk.past.length}`, "C12-OFFSET");
  sk.offsetBy(-45);
  t.check("C12: offset −45 on a 80 mm-tall part is refused", sk.items[0].type === "rect", `type=${sk.items[0].type} msg=${sk.messages.slice(-1)}`, "C12-OFFSET");

  const keep = mk([["rect", { w: 100, h: 80 }, 0, 0]]);
  keep.pick([keep.items[0].id]);
  keep.offsetBy(10, { keepOriginal: true });
  t.check("C12: Keep original leaves the first part and adds the offset", keep.items.length === 2 && keep.items[0].type === "rect" && keep.items[0].p.w === 100, `n=${keep.items.length} t0=${keep.items[0].type} t1=${keep.items[1] && keep.items[1].type}`, "C12-OFFSET");
  const ob = box(keep.items[1], keep);
  t.check("C12: the kept offset is 20 mm larger", Math.abs((ob[2] - ob[0]) - 120) < 0.6 && Math.abs((ob[3] - ob[1]) - 100) < 0.6, `box=${ob.map((v) => v.toFixed(1))}`, "C12-OFFSET");

  const band = mk([["rect", { w: 100, h: 80 }, 0, 0]]);
  band.pick([band.items[0].id]);
  band.offsetBy(10, { bothSides: true });
  const cs = band.contours();
  t.check("C12: both sides makes a strip (outer + hole)", cs.length === 2, `cs=${cs.length}`, "C12-OFFSET");
  const aOut = Math.abs(signedArea(cs[0].pts)), aIn = Math.abs(signedArea(cs[1].pts));
  // Outward offset uses round joins, so the outer is a little under 120×100 (11913) and the inner is 80×60.
  t.check("C12: strip area is a 10 mm band", Math.abs(aIn - 4800) < 20 && (aOut - aIn) > 7000 && (aOut - aIn) < 7300, `aOut=${aOut.toFixed(1)} aIn=${aIn.toFixed(1)}`, "C12-OFFSET");

  const disc = mk([["disc", { d: 100 }, 0, 0]]);
  disc.pick([disc.items[0].id]);
  disc.offsetBy(8);
  t.check("C12: offsetting a disc keeps it as a disc", disc.items[0].type === "disc", `type=${disc.items[0].type}`, "C12-OFFSET");
  t.check("C12: disc diameter grows by twice the offset", Math.abs(disc.items[0].p.d - 116) < 0.2, `d=${disc.items[0].p.d}`, "C12-OFFSET");
  const circ = detectCircle(disc.contoursOf(disc.items[0])[0].pts);
  t.check("C12: the result is still a true circle", !!(circ && Math.abs(circ.r - 58) < 0.4), JSON.stringify(circ), "C12-OFFSET");
}

// ---- C13 circular array pivot ----
{
  const sk = mk([["rect", { w: 200, h: 160 }, 0, 0]]);
  sk.pick([sk.items[0].id]);
  sk.add("hole", true, { d: 10 });
  const hole = sk.items.find((i) => i.type === "hole");
  t.check("C13: a hole was added on the plate", !!hole, `items=${sk.items.map((i) => i.type).join(",")}`, "C13-POLAR");
  // Park the hole off the plate centre so a shape-centre array would land in the wrong place.
  const pb = box(sk.items[0], sk);
  const pc = centre(pb);
  hole.x = pb[0] + 15; hole.y = pb[1] + 15; hole._key = null;
  sk.pick([hole.id]);
  const hc = centre(box(hole, sk));
  t.check("C13: the hole is not on the plate centre", Math.hypot(hc[0] - pc[0], hc[1] - pc[1]) > 40, `hole=${hc.map((v) => v.toFixed(1))} plate=${pc.map((v) => v.toFixed(1))}`, "C13-POLAR");
  sk.polarArray(4, 80, { mode: "host" });
  const holes = sk.items.filter((i) => i.type === "hole");
  t.check("C13: four holes after a plate-centre array", holes.length === 4, `n=${holes.length}`, "C13-POLAR");
  const centres = holes.map((h) => centre(box(h, sk)));
  const radii = centres.map((c) => Math.hypot(c[0] - pc[0], c[1] - pc[1]));
  t.check("C13: every copy sits on a 40 mm radius about the plate centre", radii.every((r) => Math.abs(r - 40) < 1.5), `r=${radii.map((r) => r.toFixed(2)).join(",")} plate=${pc.map((v) => v.toFixed(1))}`, "C13-POLAR");

  const pt = mk([["rect", { w: 40, h: 20 }, 0, 0]]);
  pt.pick([pt.items[0].id]);
  pt.polarArray(4, 100, { x: 200, y: 200, mode: "point" });
  t.check("C13: a clicked-point pivot makes four copies", pt.items.length === 4, `n=${pt.items.length}`, "C13-POLAR");
  const cr = pt.items.map((it) => centre(box(it, pt)));
  const rr = cr.map((c) => Math.hypot(c[0] - 200, c[1] - 200));
  t.check("C13: copies orbit the clicked point", rr.every((r) => Math.abs(r - rr[0]) < 1.2) && rr[0] > 10, `r=${rr.map((r) => r.toFixed(2)).join(",")}`, "C13-POLAR");
}

// ---- C14 import a DXF into the Make sketch ----
{
  const dxf = "0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\n0\n10\n50\n20\n50\n40\n20\n0\nENDSEC\n0\nEOF\n";
  const r = parseDXF(dxf);
  t.check("C14: sample DXF parses a circle", !!(r && r.contours && r.contours.length), `n=${r && r.contours && r.contours.length}`, "C14-IMPORT");
  const e = contoursToEditable(r.contours);
  const sk = A.newSketch();
  const n = sk.importParts(e.parts, true);
  t.check("C14: importParts puts the outline on the drawing", n === 1 && sk.items.length === 1 && sk.items[0].type === "custom", `n=${n} items=${sk.items.length} type=${sk.items[0] && sk.items[0].type}`, "C14-IMPORT");
  const b = box(sk.items[0], sk);
  t.check("C14: imported circle is about Ø40", Math.abs((b[2] - b[0]) - 40) < 1 && Math.abs((b[3] - b[1]) - 40) < 1, `box=${b.map((v) => v.toFixed(1))}`, "C14-IMPORT");
}

process.exit(t.done() ? 1 : 0);

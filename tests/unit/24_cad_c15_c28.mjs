// Stage 3 (C15–C28): bolt-circle fit, text glyphs, arrays keep holes, typed
// position, snap restore, hide persist, tiny holes, array cap, outline names.
import { T } from "../lib/t.mjs";
import { load } from "../lib/env.mjs";
import { textToContours, hasGlyph } from "../../js/make/textshape.js";
import { sanitizeToolList, toolInfo, DEFAULT_TOOL_IDS } from "../../js/make/toolbarcustom.js";

const A = await load();
const t = new T("24_cad_c15_c28");
const mk = (specs) => {
  const sk = A.newSketch();
  for (const [type, p, x, y] of specs) { sk.add(type, true); const it = sk.items.at(-1); if (p) Object.assign(it.p, p); if (x != null) it.x = x; if (y != null) it.y = y; }
  sk.opts.pro = true;
  sk.messages = sk.messages || [];
  return sk;
};

// ---- C15 bolt circle shrinks to fit the plate ----
{
  const sk = mk([["rect", { w: 100, h: 60 }, 0, 0]]);
  const plate = sk.items[0];
  sk.pick([plate.id]);
  sk.add("boltcircle", true);
  const ring = sk.items.find((i) => i.type === "boltcircle");
  t.check("C15: a bolt circle is added on the plate", !!ring, `items=${sk.items.map((i) => i.type)}`, "C15-BOLT");
  t.check("C15: default 80 mm ring is shrunk to fit a 100×60 plate", ring && ring.p.pcd <= 40.1, `pcd=${ring && ring.p.pcd} msgs=${sk.messages.slice(-2)}`, "C15-BOLT");
  t.check("C15: the ring still has a usable hole size", ring && ring.p.hole >= 2, `hole=${ring && ring.p.hole}`, "C15-BOLT");
}

// ---- C16 unsupported characters are not substituted with “?” ----
{
  t.check("C16: ASCII letters are in the font", hasGlyph("standard", "A") && hasGlyph("standard", "5"), "A/5 missing", "C16-TEXT");
  t.check("C16: £ is not in the font", !hasGlyph("standard", "£"), "£ unexpectedly present", "C16-TEXT");
  const r = textToContours("£50", { font: "standard", size: 40 });
  t.check("C16: missing characters are reported", (r.missing || []).includes("£"), `missing=${JSON.stringify(r.missing)}`, "C16-TEXT");
  t.check("C16: contours are produced for the letters that exist (5 and 0)", r.contours.length > 0 && r.width > 0, `n=${r.contours.length} w=${r.width}`, "C16-TEXT");
  const empty = textToContours("£Ω", { font: "standard", size: 40 });
  t.check("C16: text made only of missing glyphs has no cut paths", empty.contours.length === 0, `n=${empty.contours.length} missing=${JSON.stringify(empty.missing)}`, "C16-TEXT");
}

// ---- C18 drawn outline is named Outline, not Joined part ----
{
  const sk = A.newSketch();
  sk.drawPts = [[0, 0], [80, 0], [80, 50], [0, 50]];
  sk.drawBulges = [0, 0, 0, 0];
  sk.finishDraw();
  const it = sk.items[0];
  t.check("C18: a finished outline is a custom part named Outline", it && it.type === "custom" && it.name === "Outline", `type=${it && it.type} name=${it && it.name}`, "C18-OUTLINE");
  const saved = sk.sanitizeItem(it);
  t.check("C18: the Outline name is kept when the drawing is saved", saved && saved.name === "Outline", `name=${saved && saved.name}`, "C18-OUTLINE");
}

// ---- C20 unpicked holes travel with a linear array ----
{
  const sk = mk([["rect", { w: 100, h: 60 }, 0, 0]]);
  const plate = sk.items[0];
  sk.pick([plate.id]);
  sk.add("hole", true, { d: 10 });
  const hole = sk.items.find((i) => i.type === "hole");
  t.check("C20: the hole belongs to the plate on Make", sk.ownedHoles(plate).some((h) => h.id === hole.id), `holes=${sk.ownedHoles(plate).map((h) => h.id)} host=${hole && (sk.hostPart(hole) || sk.hostOf(hole) || {}).id}`, "C20-ARRAY");
  sk.pick([plate.id]);
  const n0 = sk.items.length;
  sk.linearArray(3, 10, 0);
  const plates = sk.items.filter((i) => i.type === "rect");
  const holes = sk.items.filter((i) => i.type === "hole");
  t.check("C20: arraying the plate also copies its unpicked hole", plates.length === 3 && holes.length === 3, `rects=${plates.length} holes=${holes.length} total=${sk.items.length} was=${n0}`, "C20-ARRAY");
}

// ---- C21 typed position is applied exactly, never snapped ----
{
  const sk = mk([["rect", { w: 80, h: 50 }, 10, 10]]);
  sk.opts.snap = 5;
  const it = sk.items[0];
  sk.pick([it.id]);
  sk.setPos("x", 300);
  const b = sk.boxOf(it);
  t.check("C21: typing 300 mm places the left edge at 300, not a snap step", Math.abs(b[0] - 300) < 1e-9, `left=${b[0]} x=${it.x}`, "C21-POS");
  sk.setPos("y", 12.5);
  const b2 = sk.boxOf(it);
  t.check("C21: a half-millimetre Y is kept exactly", Math.abs(b2[1] - 12.5) < 1e-9, `bottom=${b2[1]}`, "C21-POS");
}

// ---- C23 Full screen is dropped from saved tool lists ----
{
  const list = sanitizeToolList(["rect", "fs", "draw", "fs", "undo"]);
  t.check("C23: fs is stripped from a saved catalogue", list && !list.includes("fs"), `list=${JSON.stringify(list)}`, "C23-FS");
  t.check("C23: there is no Full screen tool in the catalogue", !toolInfo("fs"), `info=${JSON.stringify(toolInfo("fs"))}`, "C23-FS");
  t.check("C23: the default rail does not include Full screen", !DEFAULT_TOOL_IDS.includes("fs"), `defaults has fs`, "C23-FS");
}

// ---- C25 mirror up-down and dead-centre align exist ----
{
  const sk = mk([["rect", { w: 80, h: 40 }, 0, 0], ["rect", { w: 40, h: 20 }, 100, 30]]);
  sk.pick(sk.items.map((i) => i.id));
  const y0 = sk.boxOf(sk.items[0])[1];
  sk.flipV();
  t.check("C25: flipV is a real action", typeof sk.flipV === "function" && sk.boxOf(sk.items[0])[1] !== undefined, `y0=${y0}`, "C25-ALIGN");
  sk.align("both");
  const a = sk.boxOf(sk.items[0]), b = sk.boxOf(sk.items[1]);
  const acx = (a[0] + a[2]) / 2, bcx = (b[0] + b[2]) / 2;
  const acy = (a[1] + a[3]) / 2, bcy = (b[1] + b[3]) / 2;
  t.check("C25: dead-centre lines both mid-points up with the larger part", Math.abs(acx - bcx) < 0.15 && Math.abs(acy - bcy) < 0.15, `a=${acx.toFixed(2)},${acy.toFixed(2)} b=${bcx.toFixed(2)},${bcy.toFixed(2)}`, "C25-ALIGN");
  t.check("C25: mirror up-down is in the default rail", DEFAULT_TOOL_IDS.includes("mirv"), "mirv missing from defaults", "C25-ALIGN");
}

// ---- C26 setAngle rotates about the bbox centre ----
{
  const sk = mk([["rect", { w: 80, h: 40 }, 10, 20]]);
  const it = sk.items[0];
  sk.pick([it.id]);
  const c0 = (() => { const b = sk.boxOf(it); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; })();
  sk.setAngle(90);
  const c1 = (() => { const b = sk.boxOf(it); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; })();
  t.check("C26: a 90° angle is stored", (it.rot % 360) === 90, `rot=${it.rot}`, "C26-ANGLE");
  t.check("C26: the part stays centred when the angle is set", Math.abs(c0[0] - c1[0]) < 0.2 && Math.abs(c0[1] - c1[1]) < 0.2, `before=${c0} after=${c1}`, "C26-ANGLE");
}

// ---- C27 hide is saved and is undoable ----
{
  const sk = mk([["rect", { w: 80, h: 40 }, 0, 0]]);
  const it = sk.items[0];
  sk.toggleHide(it);
  t.check("C27: hide toggles on", !!it.hide, `hide=${it.hide}`, "C27-HIDE");
  const saved = sk.sanitizeItem(it);
  t.check("C27: hide is kept when the drawing is saved", saved && saved.hide === true, `saved=${JSON.stringify(saved && { hide: saved.hide, lock: saved.lock })}`, "C27-HIDE");
  sk.undo();
  t.check("C27: undo shows the part again", !sk.items[0].hide, `hide=${sk.items[0].hide}`, "C27-HIDE");
}

// ---- C28 tidy: tiny holes refused, snap step restored, array cap ----
{
  const sk = mk([["rect", { w: 100, h: 80 }, 0, 0]]);
  sk.pick([sk.items[0].id]);
  const n0 = sk.items.length;
  sk.add("hole", false, { d: 1 });
  t.check("C28: a 1 mm hole is refused", sk.items.length === n0, `n=${sk.items.length} msgs=${sk.messages.slice(-1)}`, "C28-TIDY");
  t.check("C28: the refusal is explained", /2 mm/i.test(sk.messages.slice(-1)[0] || ""), sk.messages.slice(-1)[0], "C28-TIDY");

  sk.setSnap(5);
  t.check("C28: snap can be 5 mm", sk.opts.snap === 5, `snap=${sk.opts.snap}`, "C28-TIDY");
  const off = sk.toggleSnap();
  t.check("C28: toggling snap off leaves 0, not 1", off === 0 && sk.opts.snap === 0, `off=${off} snap=${sk.opts.snap}`, "C28-TIDY");
  const on = sk.toggleSnap();
  t.check("C28: toggling snap on restores the last 5 mm step", on === 5 && sk.opts.snap === 5, `on=${on} snap=${sk.opts.snap}`, "C28-TIDY");

  const sk2 = mk([["rect", { w: 20, h: 10 }, 0, 0]]);
  sk2.pick([sk2.items[0].id]);
  sk2.linearArray(500, 2, 0);
  t.check("C28: a 500-copy array is clipped to 50", sk2.items.length === 50, `n=${sk2.items.length} msg=${sk2.messages.slice(-1)}`, "C28-TIDY");
  t.check("C28: the 50-copy cap is mentioned", /50/.test(sk2.messages.slice(-1)[0] || ""), sk2.messages.slice(-1)[0], "C28-TIDY");
}

process.exit(t.done() ? 1 : 0);

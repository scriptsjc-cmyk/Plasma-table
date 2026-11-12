// Step 3 "Get set up": lay the parts out on the sheet (drag, turn, copy, delete, snap guides, live gaps,
// red when parts touch / overlap / hang off the sheet or the machine's work area), add parts from the account list or
// from several drawing files at once (with a quantity for each), then the start point and the final checks.
// The sheet's bottom-left corner is the work zero, so every part is cut exactly where it sits on the sheet picture.
import { segX, pointInPoly, bbox } from "../core/geom.js";
import { shapeDef } from "../make/sketch.js";
import { parseDXF } from "../make/dxf.js";
import { groupParts, thumbSvg, sizeText } from "../account/partsfolders.js";
import { parseSVG } from "../make/svg.js";
import { contoursToEditable } from "../make/editable.js";
import * as Acc from "../account/account.js";
import { insideRegion } from "./nest.js";
import { initNestUi, paintNest, nestNow } from "./nestui.js";

let H = null;
const $ = (id) => document.getElementById(id);
const r1 = (v) => Math.round(v * 10) / 10;
const KEY = "plasma.sheet";

export const sheet = { w: 1250, h: 2500, clearance: 2, remnant: null, plain: null };     // remnant: a saved leftover shape used as the sheet (outline in rings, lower-left at 0,0)
let layoutOn = false, last = { ok: true, bad: new Set(), problems: [], units: [] };

export function initSetup(host) {
  H = host;
  try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j && j.w > 0 && j.h > 0) {
    sheet.w = j.w; sheet.h = j.h; sheet.clearance = j.clearance ?? 2;
    if (j.remnant && Array.isArray(j.remnant.rings) && j.remnant.rings.length) { sheet.remnant = j.remnant; sheet.plain = j.plain || null; }
  } else defaultSheet(); }
  catch { defaultSheet(); }
  bind();
}
function defaultSheet() { const t = H.S.cfg && H.S.cfg.travel_mm; if (t) { sheet.w = t.x; sheet.h = t.y; } }
const saveSheet = () => { try { localStorage.setItem(KEY, JSON.stringify(sheet)); } catch { /* ignore */ } };
// the usable area as the packer and the checks see it: the sheet (or the saved remnant shape), clipped to the machine's work area
export function region(withClip = true) {
  const wa = withClip ? workArea() : null;
  return { w: sheet.w, h: sheet.h, rings: sheet.remnant ? sheet.remnant.rings : undefined, clip: wa ? [wa.x[0], wa.y[0], wa.x[1], wa.y[1]] : undefined };
}
const gapMm = () => Math.max(0, (Number(H.kerf()) || 0) + (Number(sheet.clearance) || 0));

// ------------------------------------------------------------------ geometry checks
const segPt = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const segSeg = (a, b, c, d) => (segX(a, b, c, d) ? 0 : Math.min(segPt(a, c, d), segPt(b, c, d), segPt(c, a, b), segPt(d, a, b)));
const boxGap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const inMaterial = (p, rings) => rings.reduce((n, r) => n + (pointInPoly(p, r) ? 1 : 0), 0) % 2 === 1;

// every separate part on the sheet (a shape dropped inside another part's outline is that part's hole, not a part)
function unitsOf(sk) {
  const out = [];
  for (const it of sk.items) {
    if (shapeDef(it.type) && shapeDef(it.type).multi) continue;
    if (sk.isHole(it) && sk._holes && sk._holes.has(it.id)) continue;      // a hole drawn inside a part (a shape dropped onto another part later is NOT one: that's an overlap)
    if (sk.isHole(it) && !(sk._seen && sk._seen.has(it.id)) && sk.hostOf(it)) continue;           // before the bed layout opens: a hole sitting in a part is that part's hole, so Make and the bed count the same parts
    const cs = sk.contoursOf(it); if (!cs.length) continue;
    const rings = cs.map((c) => c.pts);
    out.push({ it, id: it.id, rings, box: bbox([{ pts: rings.flat() }]), key: it._key });
  }
  out.forEach((u, i) => { u.n = i + 1; });
  return out;
}
const pairCache = new Map();
function pairInfo(A, B, gap) {
  const k = A.id + "|" + B.id + "|" + gap;
  const c = pairCache.get(k);
  if (c && c.a === A.key && c.b === B.key) return c.r;
  let r = { overlap: false, dist: Infinity };
  if (boxGap(A.box, B.box) < gap + 0.001) {
    let d = Infinity, cross = false;
    for (const ra of A.rings) for (const rb of B.rings) {
      for (let i = 0; i < ra.length; i++) {
        const a0 = ra[i], a1 = ra[(i + 1) % ra.length];
        for (let j = 0; j < rb.length; j++) {
          const v = segSeg(a0, a1, rb[j], rb[(j + 1) % rb.length]);
          if (v === 0) cross = true;
          if (v < d) d = v;
        }
      }
    }
    const inside = B.rings.some((r2) => inMaterial(r2[0], A.rings)) || A.rings.some((r2) => inMaterial(r2[0], B.rings));
    r = { overlap: cross || inside, dist: d };
  }
  pairCache.set(k, { a: A.key, b: B.key, r });
  if (pairCache.size > 4000) pairCache.clear();
  return r;
}

export function workArea() { return H && H.workArea ? H.workArea() : null; }

// the part count shown everywhere (header and bottom bar) comes from here, so the two can never disagree
export function partCount(sk) { return sk ? unitsOf(sk).length : 0; }

export function analyze(sk) {
  const gap = gapMm(), units = unitsOf(sk), bad = new Set(), problems = [];
  const wa = workArea();
  const eps = 0.05;
  for (const u of units) {
    const b = u.box;
    if (b[0] < -eps || b[1] < -eps || b[2] > sheet.w + eps || b[3] > sheet.h + eps) { bad.add(u.id); problems.push({ ids: [u.id], text: `Part ${u.n} is off the sheet.` }); }
    else if (sheet.remnant && !insideRegion(u.rings, b, region(false), 0)) { bad.add(u.id); problems.push({ ids: [u.id], text: `Part ${u.n} is outside the saved remnant's outline.` }); }
    else if (wa && (b[0] < wa.x[0] - eps || b[2] > wa.x[1] + eps || b[1] < wa.y[0] - eps || b[3] > wa.y[1] + eps)) { bad.add(u.id); problems.push({ ids: [u.id], text: `Part ${u.n} is outside the machine's work area.` }); }
  }
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    const r = pairInfo(units[i], units[j], gap);
    if (r.overlap) { bad.add(units[i].id); bad.add(units[j].id); problems.push({ ids: [units[i].id, units[j].id], text: `Parts ${units[i].n} and ${units[j].n} overlap.` }); }
    else if (r.dist < gap - 0.001) { bad.add(units[i].id); bad.add(units[j].id); problems.push({ ids: [units[i].id, units[j].id], text: `Parts ${units[i].n} and ${units[j].n} are ${r1(r.dist)} mm apart; keep at least ${r1(gap)} mm.` }); }
  }
  last = { ok: !problems.length, bad, problems, units, gap };
  return last;
}
// the start button's reasons (the text is shown under it)
export function blockText() {
  if (!layoutOn || !H.sketch()) return [];
  const a = analyze(H.sketch());
  const out = a.problems.slice(0, 3).map((p) => "Layout: " + p.text);
  if (a.problems.length > 3) out.push(`Layout: …and ${a.problems.length - 3} more problem${a.problems.length - 3 > 1 ? "s" : ""}.`);
  if (out.length) out.push("Move the parts apart (or onto the sheet) in the sheet picture.");
  return out;
}
export const layoutActive = () => layoutOn;

// ------------------------------------------------------------------ drawing on the sketch canvas
let zoomParts = true;                                          // B5 19: open zoomed to the parts (with a margin); "Whole sheet" shows the whole sheet again
function paintZoomBtns() {
  const fit = $("layFit"), zoom = $("layZoom");
  if (fit) fit.classList.toggle("hidden", !zoomParts);        // zoomed in: offer "Whole sheet"
  if (zoom) { zoom.classList.toggle("hidden", zoomParts); zoom.textContent = "🔍 Zoom to parts"; }   // whole sheet showing: offer "Zoom to parts"
}
function viewBox(sk) {
  if (zoomParts && sk && sk.items.length) {                    // just the parts, with a margin, instead of the whole sheet
    const b = sk.allBox(), m = Math.max(20, Math.max(b[2] - b[0], b[3] - b[1]) * 0.08);
    return [Math.min(0, b[0] - m) < b[0] - m ? b[0] - m : b[0] - m, b[1] - m, b[2] + m, b[3] + m];
  }
  const wa = workArea();
  const x0 = Math.min(0, wa ? wa.x[0] : 0), y0 = Math.min(0, wa ? wa.y[0] : 0);
  // the sheet, but never zoom out further than the machine area / a sensible window around the parts
  const W = wa ? Math.max(sheet.w, wa.x[1]) : sheet.w, Hh = wa ? Math.max(sheet.h, wa.y[1]) : sheet.h;
  return [x0, y0, W, Hh];
}
function drawBg(sk, ctx, S, C, w, h) {
  const [x0, y0] = S(0, sheet.h), [x1, y1] = S(sheet.w, 0);
  if (sheet.remnant) {                                                    // a saved leftover: draw its real outline
    ctx.beginPath();
    for (const r of sheet.remnant.rings) { r.forEach(([x, y], i) => { const [X, Y] = S(x, y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); }
    ctx.fillStyle = "rgba(90,130,190,.16)"; ctx.fill("evenodd");
    ctx.strokeStyle = "#5b7fb0"; ctx.lineWidth = 2; ctx.stroke();
    ctx.setLineDash([2, 6]); ctx.lineWidth = 1; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
  } else {
    ctx.fillStyle = "rgba(90,130,190,.10)"; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = "#5b7fb0"; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.fillStyle = "#3d5a85"; ctx.font = "bold 12px Barlow, system-ui"; ctx.textAlign = "left";
  const mat = H.S.material ? ` · ${H.S.material.toLowerCase()} ${H.S.thickness} mm` : "";
  ctx.fillText(`${sheet.remnant ? "Remnant " + sheet.remnant.name + " " : "Sheet "}${r1(sheet.w)} × ${r1(sheet.h)} mm${mat}`, Math.max(4, x0 + 6), Math.max(14, y0 + 16));
  const wa = workArea();
  if (wa) {
    const [a0, b0] = S(wa.x[0], wa.y[1]), [a1, b1] = S(wa.x[1], wa.y[0]);
    ctx.setLineDash([8, 5]); ctx.strokeStyle = "#2e8b57"; ctx.lineWidth = 2; ctx.strokeRect(a0, b0, a1 - a0, b1 - b0); ctx.setLineDash([]);
    ctx.fillStyle = "#2e8b57"; ctx.fillText("Machine work area", Math.max(4, a0 + 6), Math.min(h - 6, b1 - 6));
  }
  // the start point = the sheet's bottom-left corner
  const [ox, oy] = S(0, 0);
  ctx.fillStyle = "#c05600"; ctx.beginPath(); ctx.arc(ox, oy, 5, 0, 7); ctx.fill();
  if (H.S.zeroSet) ctx.fillText("Start point (0, 0)", Math.min(w - 110, ox + 8), Math.min(h - 26, oy - 24));     // round 5 item 21: named only once it is set
}
function drawTop(sk, ctx, S, C) {
  const a = last, gap = a.gap ?? gapMm();
  for (const u of a.units) {
    const [X, Y] = S((u.box[0] + u.box[2]) / 2, (u.box[1] + u.box[3]) / 2);
    ctx.fillStyle = a.bad.has(u.id) ? C.danger : "#475569"; ctx.font = "bold 13px Barlow, system-ui"; ctx.textAlign = "center";
    ctx.fillText(String(u.n), X, Y + 4); ctx.textAlign = "left";
  }
  // live distances for the picked part: to the sheet edges and to the nearest part on each side
  const one = sk.selected();
  const me = one && a.units.find((u) => u.id === one.id || (sk.hostOf && sk.hostOf(one) && u.id === sk.hostOf(one).id));
  if (!me) return;
  const b = me.box, others = a.units.filter((u) => u !== me);
  const dirs = [
    { n: "L", edge: b[0], d: b[0], from: [b[0], (b[1] + b[3]) / 2], to: () => [0, (b[1] + b[3]) / 2], hit: (o) => o.box[3] > b[1] && o.box[1] < b[3] && o.box[2] <= b[0], dist: (o) => b[0] - o.box[2], pt: (o) => [o.box[2], (b[1] + b[3]) / 2] },
    { n: "R", d: sheet.w - b[2], from: [b[2], (b[1] + b[3]) / 2], to: () => [sheet.w, (b[1] + b[3]) / 2], hit: (o) => o.box[3] > b[1] && o.box[1] < b[3] && o.box[0] >= b[2], dist: (o) => o.box[0] - b[2], pt: (o) => [o.box[0], (b[1] + b[3]) / 2] },
    { n: "B", d: b[1], from: [(b[0] + b[2]) / 2, b[1]], to: () => [(b[0] + b[2]) / 2, 0], hit: (o) => o.box[2] > b[0] && o.box[0] < b[2] && o.box[3] <= b[1], dist: (o) => b[1] - o.box[3], pt: (o) => [(b[0] + b[2]) / 2, o.box[3]] },
    { n: "T", d: sheet.h - b[3], from: [(b[0] + b[2]) / 2, b[3]], to: () => [(b[0] + b[2]) / 2, sheet.h], hit: (o) => o.box[2] > b[0] && o.box[0] < b[2] && o.box[1] >= b[3], dist: (o) => o.box[1] - b[3], pt: (o) => [(b[0] + b[2]) / 2, o.box[1]] },
  ];
  for (const dd of dirs) {
    let best = { d: dd.d, to: dd.to(), part: false };
    for (const o of others) if (dd.hit(o)) { const d = dd.dist(o); if (d < best.d) best = { d, to: dd.pt(o), part: true }; }
    if (!(best.d > -0.05)) continue;
    const [fx, fy] = S(dd.from[0], dd.from[1]), [tx, ty] = S(best.to[0], best.to[1]);
    const red = best.part && best.d < gap - 0.001;
    ctx.strokeStyle = red ? C.danger : "#7a8aa0"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    if (Math.hypot(tx - fx, ty - fy) > 26) sk.tag(ctx, `${r1(best.d)}`, (fx + tx) / 2, (fy + ty) / 2 - 8, red ? C.danger : "#51627a");
  }
}
const LAYOUT = { get sheet() { return sheet; }, get gap() { return gapMm(); }, analyze, drawBg, drawTop, viewBox };

// ------------------------------------------------------------------ entering / leaving the step
const designOk = () => !!(H.S.design && !H.S.design.straight && H.S.design.contours && H.S.design.contours.length);
export function enter() {
  const sk = H.sketch(); if (!sk) return;
  const card = $("layoutCard");
  // a drawing file becomes movable parts (lines and true arcs) the first time we get here
  if (H.S.src === "file" && designOk()) convertFile();
  const can = H.S.src === "shape" && sk.items.length > 0 && !(H.S.design && H.S.design.straight);
  card.classList.toggle("hidden", !can);
  layoutOn = can;
  H.S.sheetMode = can;
  if (!can) { sk.layout = null; return; }
  $("sheetW").value = sheet.w; $("sheetH").value = sheet.h; $("sheetClr").value = sheet.clearance;
  paintNest();
  sk.layout = LAYOUT; sk.layoutBase = sk.past.length; sk._layUndone = 0; sk.opts.guides = true; sk.tool = null;
  $("layGrid").value = String(sk.opts.snap || 0);
  // shapes that sit inside another part's outline when the layout opens are holes of that part; anything new is a part
  sk._holes = sk._holes || new Set(); sk._seen = sk._seen || new Set();
  for (const it of sk.items) { if (!sk._seen.has(it.id) && sk.isHole(it) && sk.hostOf(it)) sk._holes.add(it.id); }
  if (!sk._layoutPlaced) { sk._layoutPlaced = true; bringOnSheet(sk); }
  sk.pick([]);
  zoomParts = true; paintZoomBtns();
  paint();
  H.loadJob();
  H.refresh();
  setTimeout(() => { sk.fitView(); }, 30);
}
export function leave() {
  const sk = H.sketch(); layoutOn = false; if (sk) sk.layout = null;      // (sheetMode stays on: the job keeps its sheet coordinates)
}
function convertFile() {
  const e = contoursToEditable(H.S.design.contours); if (!e) return;
  const sk = H.sketch();
  sk.importParts(e.parts, true);
  sk._layoutPlaced = false;
  H.S.src = "shape"; H.showSource("shape", { noFs: true }); H.S.currentPart = null;
  H.S.fileName = String(H.S.design.name || "Imported drawing").replace(/\.[^.]+$/, "");
  H.useShape();
  H.toast("Your drawing is now parts you can move on the sheet.");
}
// everything onto the sheet: if the group isn't already on it, move it to the lower-left with a margin
function bringOnSheet(sk) {
  const b = sk.allBox(), g = gapMm() + 3;
  if (b[0] >= g && b[1] >= g && b[2] <= sheet.w && b[3] <= sheet.h) return;
  moveItems(sk, sk.items, g - b[0], g - b[1]);
}
function moveItems(sk, items, dx, dy) { for (const it of items) { it.x = r1(it.x + dx); it.y = r1(it.y + dy); } sk.commit(); }

// ------------------------------------------------------------------ finding a free place for new parts
function boxesOf(sk, skip) { return unitsOf(sk).filter((u) => !skip.includes(u.it)).map((u) => u.box); }
export function placeFree(sk, items) {
  if (!items.length) return true;
  const gap = gapMm() + 0.5;
  const ub = items.map((i) => sk.boxOf(i)), blk = [Math.min(...ub.map((b) => b[0])), Math.min(...ub.map((b) => b[1])), Math.max(...ub.map((b) => b[2])), Math.max(...ub.map((b) => b[3]))];
  const w = blk[2] - blk[0], h = blk[3] - blk[1];
  const others = boxesOf(sk, items), step = Math.max(2, Math.min(10, Math.min(w, h) / 6));
  const m = gap;
  for (let y = m; y + h <= sheet.h - m + 1e-6; y += step) {
    for (let x = m; x + w <= sheet.w - m + 1e-6; x += step) {
      let hit = false;
      for (const o of others) if (x < o[2] + gap && x + w > o[0] - gap && y < o[3] + gap && y + h > o[1] - gap) { hit = true; break; }
      if (!hit) { for (const it of items) { it.x = r1(it.x + x - blk[0]); it.y = r1(it.y + y - blk[1]); } return true; }
    }
  }
  return false;
}
function arrangeAll() {
  if (sheet.remnant) { nestNow({ turn: 0, holes: false }); return; }      // the row packer only knows rectangles: on a remnant use the outline packer
  const sk = H.sketch(); sk.remember();
  const gap = gapMm() + 0.5;
  // biggest first, each with the things nested inside it
  const us = unitsOf(sk).sort((a, b) => (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]) - (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]));
  const groups = us.map((u) => [u.it, ...sk.items.filter((i) => i !== u.it && sk.hostOf && sk.hostOf(i) === u.it)]);
  // park everything far away, then place one by one
  const far = sheet.w + sheet.h + 5000;
  for (const g of groups) for (const it of g) { it.x += far; it.y += far; }
  let fail = 0;
  for (const g of groups) {
    const b0 = g.map((i) => sk.boxOf(i)), bx = Math.min(...b0.map((b) => b[0]));
    if (!placeFree(sk, g)) { fail++; for (const it of g) { it.x -= far; it.y -= far; } }
    void bx;
  }
  sk.commit(); sk.fitView(); paint();
  H.toast(fail ? `${fail} part${fail > 1 ? "s" : ""} didn't fit on the sheet. Make the sheet bigger or remove some.` : "Parts arranged with the right gaps.", !!fail);
  void gap;
}

// ------------------------------------------------------------------ adding parts: saved parts + several files, with quantities
let pending = [];            // { name, items: [sketch items], qty, note }
function sketchItemsFromContours(contours, name) {
  const e = contoursToEditable(contours); if (!e) return null;
  return e.parts.map(({ cs, x, y }) => ({ type: "custom", p: { scale: 100 }, x, y, rot: 0, holes: {}, shape: { cs } }));
}
async function readFiles(files) {
  const notes = [];
  for (const f of files) {
    try {
      const text = await f.text();
      const ext = f.name.toLowerCase().split(".").pop();
      if (ext !== "dxf" && ext !== "svg") { notes.push(`${f.name}: only DXF or SVG files can be laid out.`); continue; }
      const r = ext === "dxf" ? parseDXF(text) : parseSVG(text);
      const items = sketchItemsFromContours(r.contours, f.name);
      if (!items) { notes.push(`${f.name}: nothing to cut was found.`); continue; }
      const b = bbox(r.contours);
      pending.push({ name: f.name.replace(/\.[^.]+$/, ""), items, qty: 1, size: [r1(b[2] - b[0]), r1(b[3] - b[1])], units: r.units, curves: r.curves, contours: r.contours });
      if (r.curves && (r.curves.splines || r.curves.ellipses)) notes.push(`${f.name}: ${r.curves.splines + r.curves.ellipses} spline/ellipse curve(s) became short straight lines so the part can be edited.`);
    } catch (e) { notes.push(`${f.name}: ${e.message}`); }
  }
  return notes;
}
// "Is this size right?" for every file just chosen, one after the other (same dialog as a single import). One answer can be
// applied to all the rest when it is a units answer (mm / inches); a scale-to-size answer only ever applies to its own file.
async function checkSizes(from) {
  if (!H.sizeCheckWanted || !H.sizeCheckWanted()) return;
  let all = null;
  for (let i = from; i < pending.length; i++) {
    const p = pending[i]; if (!p.contours) continue;
    let k = 1;
    if (all !== null) k = all;
    else {
      const left = pending.slice(i + 1).filter((q) => q.contours).length;
      const d = { name: p.name, contours: p.contours };
      const r = await new Promise((res) => H.askSize(d, p.units, (kk, a) => res({ kk, a }), { left, name: p.name }));
      k = r.kk; p.contours = d.contours;
      if (r.a && (k === 1 || Math.abs(k - 25.4) < 1e-9 || Math.abs(k - 1 / 25.4) < 1e-9)) all = k;
      if (k !== 1 && all === null) { /* own file only */ }
      if (k !== 1) { const it = sketchItemsFromContours(p.contours, p.name); if (it) { p.items = it; const b = bbox(p.contours); p.size = [r1(b[2] - b[0]), r1(b[3] - b[1])]; } }
      continue;
    }
    if (k !== 1) {
      p.contours = H.scaleContours(p.contours, k);
      const it = sketchItemsFromContours(p.contours, p.name); if (it) { p.items = it; const b = bbox(p.contours); p.size = [r1(b[2] - b[0]), r1(b[3] - b[1])]; }
    }
  }
}
function paintAdd() {
  const box = $("addList");
  box.innerHTML = pending.length ? pending.map((p, i) => `<div class="addrow" data-i="${i}">
      <div class="grow"><b>${H.esc(p.name)}</b><div class="muted small">${p.size ? p.size[0] + " × " + p.size[1] + " mm" : "saved part"}${p.units ? " · " + H.esc(p.units) : ""}${p.note ? " · " + H.esc(p.note) : ""}</div></div>
      <label class="qty">Qty <input type="number" min="0" max="500" step="1" value="${p.qty}" data-qty="${i}" inputmode="numeric"></label>
      <button type="button" class="small" data-rm="${i}" aria-label="Remove">✕</button></div>`).join("")
    : `<p class="muted">Nothing chosen yet. Tick saved parts below, or choose drawing files.</p>`;
}
async function paintSaved() {
  const box = $("addSaved");
  if (!Acc.isSignedIn()) { box.innerHTML = `<p class="muted small">Sign in to pick from your saved parts.</p>`; return; }
  try {
    const rows = await Acc.listParts();
    const groups = groupParts(rows).filter((g) => g.rows.length);
    box.innerHTML = groups.length ? groups.map((g) => `<div class="addfolder" data-folder="${H.esc(g.name)}">
        <label class="savedrow folderrow"><input type="checkbox" data-folder-all="${H.esc(g.name)}"> <b>📁 ${H.esc(g.name)}</b> <span class="muted small">whole folder · ${g.rows.length} part${g.rows.length === 1 ? "" : "s"}</span></label>
        ${g.rows.map((p) => `<label class="savedrow"><input type="checkbox" data-saved="${H.esc(p.id)}" data-name="${H.esc(p.name)}" data-folder="${H.esc(g.name)}"> ${thumbSvg(p.meta, "pthumb sm")} ${H.esc(p.name)} <span class="muted small">${H.esc(sizeText(p.meta))}</span></label>`).join("")}
      </div>`).join("") : `<p class="muted small">No saved parts yet.</p>`;
  } catch (e) { box.innerHTML = `<p class="muted small">${H.esc(e.message)}</p>`; }
}
export function openAdd() {
  pending = []; paintAdd(); paintSaved();
  $("addFiles").value = "";
  $("addPartsDlg").classList.remove("hidden");
}
// a file chosen while a drawing is already open (Pro): open Add parts with it already read and size-checked
export async function addFilesToSheet(files) {
  openAdd();
  const notes = await readFiles(files); paintAdd();
  $("addNote").textContent = notes.join(" ");
  await checkSizes(0); paintAdd();
}
const closeAdd = () => { $("addPartsDlg").classList.add("hidden"); H.S.uiBlockUntil = Date.now() + 450; };
// put the chosen parts (qty copies each) on the sheet. `lists` = [{ items, qty, inches }]
export function addToSheet(lists) {
  const sk = H.sketch(); if (!sk) return { added: 0, failed: 0 };
  sk.remember();
  let added = 0, failed = 0, firstIds = [];
  for (const L of lists) {
    for (let q = 0; q < Math.max(0, L.qty | 0); q++) {
      const fresh = [];
      for (const src of L.items) {
        let it = sk.sanitizeItem(JSON.parse(JSON.stringify(src)));
        if (!it) continue;
        if (L.inches) it = scaleItem(sk, it, 25.4);
        it.id = sk.nextId++; sk.items.push(it); fresh.push(it);
      }
      if (!fresh.length) continue;
      if (placeFree(sk, fresh)) { added++; firstIds.push(...fresh.map((i) => i.id)); }
      else { failed++; for (const it of fresh) { it.x = r1(sheet.w + 10); it.y = 0; } }   // parked just off the sheet's right edge (red) so it can't be missed
    }
  }
  sk.pick(firstIds.slice(0, 1)); sk.commit(); sk.onSelect(); sk.fitView();
  paint(); H.useShapeSoon();
  return { added, failed };
}
function scaleItem(sk, it, k) {
  if (it.type === "custom") it.shape.cs = it.shape.cs.map((c) => ({ ...c, pts: c.pts.map(([x, y]) => [x * k, y * k]) }));
  it.x *= k; it.y *= k; return it;
}

// ------------------------------------------------------------------ the step's panel
export function paint(light) {
  const sk = H.sketch(); if (!sk || !layoutOn) return;
  if (sk._seen) for (const it of sk.items) sk._seen.add(it.id);
  const a = analyze(sk);
  $("layoutState").textContent = a.units.length ? (a.ok ? `${a.units.length} part${a.units.length > 1 ? "s" : ""} · all clear ✓` : `${a.problems.length} problem${a.problems.length > 1 ? "s" : ""}`) : "no parts yet";
  $("layoutState").className = "layoutstate " + (a.ok ? "good" : "bad");
  $("layProblems").innerHTML = a.problems.map((p) => `<li>${H.esc(p.text)}</li>`).join("");
  const wa = workArea();
  $("sheetNote").textContent = `Minimum gap between parts: ${r1(gapMm())} mm (kerf ${r1(H.kerf())} + clearance ${r1(sheet.clearance)}).` + (wa ? "" : " Machine edges aren't set up yet, so the work area isn't drawn.");
  const one = sk.selected();
  $("layoutSel").classList.toggle("hidden", !one);
  if (one) {
    const u = a.units.find((x) => x.id === one.id), sh = shapeDef(one.type);
    $("laySelName").textContent = (u ? `Part ${u.n}` : "Hole") + (sh ? " · " + sh.name : "");
    if (document.activeElement !== $("layAngle")) $("layAngle").value = r1(one.rot || 0);
  }
  if (!light) H.refresh();
}
function bind() {
  const sk = () => H.sketch();
  $("layAdd").onclick = openAdd;
  $("layAuto").onclick = arrangeAll;
  initNestUi({ sketch: sk, unitsOf, sheet, gapMm, region, kerf: () => H.kerf(), esc: (t) => H.esc(t), toast: (m, e) => H.toast(m, e), saveSheet, material: () => (H.S.material ? `${H.S.material} ${H.S.thickness} mm` : ""),
    repaint: () => paint(), after: () => H.useShapeSoon() });
  $("layFit").onclick = () => { zoomParts = false; paintZoomBtns(); sk().fitView(); };
  $("layZoom").onclick = () => { zoomParts = true; paintZoomBtns(); sk().fitView(); };
  paintZoomBtns();
  const sheetChange = () => {
    const w = Number($("sheetW").value), h = Number($("sheetH").value), c = Number($("sheetClr").value);
    if (w >= 50) sheet.w = w; if (h >= 50) sheet.h = h; if (c >= 0) sheet.clearance = c;
    saveSheet(); sk().fitView(); paint(); H.loadJob();
  };
  ["sheetW", "sheetH", "sheetClr"].forEach((id) => $(id).addEventListener("change", sheetChange));
  $("layGrid").onchange = () => { sk().opts.snap = Number($("layGrid").value) || 0; sk().saveOpts && sk().saveOpts(); sk().draw(); };
  $("layoutSel").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lay]"), n = e.target.closest("[data-nudge]"), s = sk();
    if (n) { const [x, y] = n.dataset.nudge.split(",").map(Number), st = Number($("layNudge").value) || 1; s.nudge(x * st, y * st); paint(); H.useShapeSoon(); return; }
    if (!b) return;
    const act = b.dataset.lay;
    if (act === "rot90") s.rotateBy(90); else if (act === "rotm90") s.rotateBy(-90);
    else if (act === "del") s.remove();
    else if (act === "dup") { const before = new Set(s.items.map((i) => i.id)); s.duplicate(); const fresh = s.items.filter((i) => !before.has(i.id)); if (placeFree(s, fresh)) { s.commit(); } else H.toast("No free room on the sheet for the copy; it sits next to the original (red).", true); }
    paint(); H.useShapeSoon();
  });
  $("layAngleSet").onclick = () => { const v = Number($("layAngle").value); if (Number.isFinite(v)) { sk().setAngle(v); paint(); H.useShapeSoon(); } };
  $("layAngle").addEventListener("keydown", (e) => { if (e.key === "Enter") $("layAngleSet").click(); });
  // add-parts dialog
  $("addCancel").onclick = closeAdd;
  $("addPartsDlg").addEventListener("click", (e) => { if (e.target === $("addPartsDlg")) closeAdd(); });
  $("addFiles").addEventListener("change", async (e) => {
    const from = pending.length;
    const notes = await readFiles([...e.target.files]); paintAdd();
    $("addNote").textContent = notes.join(" ");
    await checkSizes(from); paintAdd();
  });
  $("addList").addEventListener("input", (e) => { const q = e.target.dataset.qty; if (q != null) pending[Number(q)].qty = Math.max(0, Math.min(500, Math.floor(Number(e.target.value) || 0))); });
  $("addList").addEventListener("click", (e) => { const r = e.target.closest("[data-rm]"); if (r) { const i = Number(r.dataset.rm); const p = pending[i]; pending.splice(i, 1); if (p.savedId) { const c = document.querySelector(`#addSaved [data-saved="${p.savedId}"]`); if (c) c.checked = false; } paintAdd(); } });
  $("addSaved").addEventListener("change", async (e) => {
    const all = e.target.closest("[data-folder-all]");
    if (all) {     // a whole folder: tick every part in it (each one loads and is listed with its own quantity)
      const boxes = [...all.closest(".addfolder").querySelectorAll("[data-saved]")];
      for (const b of boxes) if (b.checked !== all.checked) { b.checked = all.checked; b.dispatchEvent(new Event("change", { bubbles: true })); }
      await new Promise((r) => setTimeout(r, 0));
      return;
    }
    const c = e.target.closest("[data-saved]"); if (!c) return;
    const id = c.dataset.saved;
    if (!c.checked) { pending = pending.filter((p) => p.savedId !== id); paintAdd(); return; }
    try {
      const p = await Acc.loadPart(id); const items = (p.data && (p.data.items || p.data)) || [];
      pending.push({ name: p.name, items: Array.isArray(items) ? items : [], qty: 1, savedId: id });
      paintAdd();
    } catch (err) { H.toast(err.message, true); c.checked = false; }
  });
  $("addOk").onclick = () => {
    const lists = pending.map((p) => ({ items: p.items, qty: p.qty, inches: false }));      // sizes were checked when each file was chosen
    const total = lists.reduce((n, l) => n + l.qty, 0);
    if (!total) { H.toast("Choose at least one part (quantity 1 or more).", true); return; }
    const r = addToSheet(lists); closeAdd();
    H.toast(r.failed ? `Added ${r.added}; ${r.failed} didn't fit on the sheet (shown red off the corner).` : `Added ${r.added} part${r.added === 1 ? "" : "s"} to the bed.`, !!r.failed);
    if (H.afterAdd) H.afterAdd(r);
  };
}
export { LAYOUT };

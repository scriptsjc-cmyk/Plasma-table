// "Get set up" > Put the parts on the bed: Nest to fit (true-shape packing) and saved remnants.
// The maths is in nest.js; this file reads the parts off the sketch, moves them, and keeps the list of saved remnants.
import { nestUnits, turnAngles, leftoverPieces, applyPlacement, ringsBox, ringsArea } from "./nest.js";

const KEY = "plasma.remnants";
const $ = (id) => document.getElementById(id);
const r1 = (v) => Math.round(v * 10) / 10;
let A = null, running = false, cancel = false;

export function loadRemnants() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(j) ? j.filter((r) => r && r.rings && r.rings.length && r.w > 0 && r.h > 0) : []; } catch { return []; }
}
function storeRemnants(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-30))); return true; } catch { return false; } }

// the parts as the packer sees them: each part with the holes that belong to it, and whether it is locked in place
export function groupsOf(sk, units) {
  const ids = new Set(units.map((u) => u.id));
  return units.map((u) => {
    const items = [u.it, ...sk.items.filter((i) => i !== u.it && !ids.has(i.id) && sk.isHole(i) && sk.hostPart && sk.hostPart(i) === u.it)];
    const rings = items.flatMap((i) => sk.contoursOf(i).map((c) => c.pts));
    return { id: u.id, items, rings, fixed: items.some((i) => i.lock) };
  });
}

// move one item the way the packer moved its part: p' = R(angle)(p - c) + t
export function moveItem(sk, it, pl) {
  const before = sk.contoursOf(it);
  if (!before.length) return;
  const anchor = before[0].pts[0];
  it.rot = (((it.rot || 0) + pl.angle) % 360 + 360) % 360;
  it.x = 0; it.y = 0;
  const at0 = sk.contoursOf(it)[0].pts[0], want = applyPlacement(anchor, pl);
  it.x = want[0] - at0[0]; it.y = want[1] - at0[1];
}

export function initNestUi(api) {
  A = api;
  const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
  on("nestGo", "onclick", () => runNest());
  on("nestStop", "onclick", () => { cancel = true; $("nestInfo").textContent = "Stopping…"; });
  on("remSave", "onclick", saveLeftover);
  on("remPick", "onchange", () => useRemnant($("remPick").value));
  on("remDel", "onclick", () => deleteRemnant($("remPick").value));
  paintNest();
}

export function paintNest() {
  if (!A || !$("remPick")) return;
  const list = loadRemnants(), cur = A.sheet.remnant ? A.sheet.remnant.id : "";
  $("remPick").innerHTML = `<option value="">Plain sheet (${r1(A.sheet.plain ? A.sheet.plain.w : A.sheet.w)} × ${r1(A.sheet.plain ? A.sheet.plain.h : A.sheet.h)} mm)</option>`
    + list.map((r) => `<option value="${A.esc(r.id)}">${A.esc(r.name)} · ${r1(r.w)} × ${r1(r.h)} mm</option>`).join("");
  $("remPick").value = list.some((r) => r.id === cur) ? cur : "";
  $("remDel").disabled = !$("remPick").value;
  $("remInfo").textContent = A.sheet.remnant
    ? `Cutting on the saved remnant “${A.sheet.remnant.name}”. Parts must stay inside its outline. Pick “Plain sheet” to go back.`
    : (list.length ? `${list.length} saved remnant${list.length > 1 ? "s" : ""} on this device. Pick one to use it as the sheet.` : "No saved remnants yet. After nesting, save what is left of the sheet to use it again.");
  for (const id of ["sheetW", "sheetH"]) if ($(id)) $(id).disabled = !!A.sheet.remnant;
}

async function runNest(o = {}) {
  if (running) return;
  const sk = A.sketch(); if (!sk) return;
  const units = A.unitsOf(sk);
  if (!units.length) { A.toast("Add some parts first.", true); return; }
  const turn = o.turn != null ? o.turn : Number($("nestTurn") ? $("nestTurn").value : 90);
  const holes = o.holes != null ? o.holes : ($("nestHoles") ? $("nestHoles").checked : true);
  const gap = A.gapMm() + 0.2;                                   // a hair more than the rule, so rounding to 0.1 mm can never break it
  const groups = groupsOf(sk, units);
  const region = A.region();
  running = true; cancel = false;
  $("nestGo").disabled = true; $("nestStop").classList.remove("hidden");
  const info = $("nestInfo");
  info.textContent = "Nesting…";
  let res;
  try {
    res = await nestUnits(groups.map((g) => ({ id: g.id, rings: g.rings, fixed: g.fixed })), region, {
      gap, angles: turnAngles(turn), pockets: holes, timeMs: 25000,
      onProgress: (d, n) => { info.textContent = `Nesting… ${d} of ${n} parts placed`; },
      shouldCancel: () => cancel,
    });
  } catch (e) { info.textContent = "Nesting failed: " + e.message; res = null; }
  running = false; $("nestGo").disabled = false; $("nestStop").classList.add("hidden");
  if (!res) return;
  sk.remember();
  const byId = new Map(res.placements.map((p) => [p.id, p]));
  const lost = [];
  let parkY = 0;
  for (const g of groups) {
    const pl = byId.get(g.id);
    if (g.fixed) continue;
    if (pl && pl.placed) { for (const it of g.items) moveItem(sk, it, pl); }
    else lost.push(g);
  }
  for (const g of lost) {                                        // what did not fit waits off the right-hand edge (shown red), out of the way
    const b = ringsBox(g.items.flatMap((i) => sk.contoursOf(i).map((c) => c.pts)));
    const dx = region.w + gap + 10 - b[0], dy = parkY - b[1];
    for (const it of g.items) { it.x += dx; it.y += dy; }
    parkY += b[3] - b[1] + gap + 5;
  }
  sk.commit(); sk.fitView(); A.repaint(); A.after();
  const placed = res.placements.filter((p) => p.placed && !p.fixed).length, total = groups.filter((g) => !g.fixed).length;
  const partArea = groups.reduce((s, g) => s + Math.max(0, ringsArea(g.rings)), 0);
  const top = Math.max(0, ...res.placements.filter((p) => p.placed).map((p) => ringsBox(p.rings)[3]));
  const msg = (cancel ? "Stopped. " : "") + `Nested ${placed} of ${total} part${total > 1 ? "s" : ""} in ${(res.ms / 1000).toFixed(1)} s`
    + (lost.length ? `. ${lost.length} did not fit (shown red off the right-hand edge): use a bigger sheet or fewer parts.` : `, using the bottom ${r1(top)} mm of the sheet (${Math.round(100 * partArea / Math.max(1, region.w * top))}% full).`);
  info.textContent = msg;
  A.toast(msg, !!lost.length);
  paintNest();
}
export const nestNow = (o) => runNest(o);

// ---- remnants
function saveLeftover() {
  const sk = A.sketch(); if (!sk) return;
  const rings = sk.items.flatMap((i) => sk.contoursOf(i).map((c) => c.pts));
  const reg = A.region(); const plain = { w: reg.w, h: reg.h, rings: reg.rings };           // the whole sheet, not just the machine's work area
  const pieces = leftoverPieces(plain, rings, { inset: Math.max(0, Number(A.kerf()) || 0) / 2, minArea: 5000, maxPieces: 6 });
  if (!pieces.length) { $("remInfo").textContent = "Nothing big enough is left to save (needs about 50 × 100 mm of clear sheet)."; A.toast("Nothing big enough is left to save.", true); return; }
  const list = loadRemnants(), stamp = new Date().toISOString().slice(0, 10);
  const mat = A.material ? A.material() : "";
  pieces.forEach((p, k) => list.push({
    id: "rem" + Date.now().toString(36) + k, name: `Leftover ${stamp}${pieces.length > 1 ? " #" + (k + 1) : ""}${mat ? " · " + mat : ""}`,
    w: p.w, h: p.h, area: p.area, rings: p.rings.map((r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])), created: Date.now(),
  }));
  if (!storeRemnants(list)) { A.toast("This device has no room to keep it.", true); return; }
  const biggest = pieces[0];
  const msg = `Saved ${pieces.length} remnant${pieces.length > 1 ? "s" : ""}: the biggest is ${r1(biggest.w)} × ${r1(biggest.h)} mm (${(biggest.area / 1e6).toFixed(2)} m²), kept half a cut width clear of the parts.`;
  paintNest(); $("remInfo").textContent = msg; A.toast(msg);
  return pieces.length;
}
function useRemnant(id) {
  const sk = A.sketch();
  if (!id) {                                                     // back to the plain sheet
    if (A.sheet.remnant) { const p = A.sheet.plain || { w: 1250, h: 2500 }; A.sheet.w = p.w; A.sheet.h = p.h; A.sheet.remnant = null; A.sheet.plain = null; }
  } else {
    const r = loadRemnants().find((x) => x.id === id); if (!r) return;
    if (!A.sheet.remnant) A.sheet.plain = { w: A.sheet.w, h: A.sheet.h };
    A.sheet.remnant = { id: r.id, name: r.name, w: r.w, h: r.h, rings: r.rings };
    A.sheet.w = r.w; A.sheet.h = r.h;
  }
  A.saveSheet(); paintNest();
  if (sk) sk.fitView();
  A.repaint(); A.after();
  if (id) A.toast("Now laying out on the remnant. Press Nest to fit to put the parts on it.");
}
function deleteRemnant(id) {
  if (!id) return;
  storeRemnants(loadRemnants().filter((r) => r.id !== id));
  if (A.sheet.remnant && A.sheet.remnant.id === id) useRemnant("");
  paintNest();
}
export const remnantApi = { saveLeftover, useRemnant, deleteRemnant };

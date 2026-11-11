// Work origins (round 5, item 36): saved start points, and the 9-point job origin. Pure logic + localStorage, no DOM.
//
// SAFETY MODEL (see tests/README / PR text)
//  - A saved start point is a position on the MACHINE (measured from the home corner, so it means the same place next time the machine is homed).
//  - Recalling one is the same kind of act as "Start here": it sets work zero without moving the torch (G10 L2, the existing set_origin command),
//    so it is explicit (confirm box), refused while the E-stop latch is on / a job runs / the machine is not Idle, and ONLY allowed when the machine
//    knows where it is (home corner known, no position-lost alarm since). After any stop or home work zero is cleared exactly as before; to cut
//    again you either press Start here or recall a start point AFTER the machine knows where it is (re-home first). Recalling never auto-starts anything.
//  - Changing which of the 9 points of the job sits at zero clears work zero (Start here is required again): the zero point would otherwise now mean something else.

export const ANCHORS = [   // row 0 = top of the job; the id is what is stored / shown
  { id: "tl", col: 0, row: 0, label: "Top left" }, { id: "tc", col: 1, row: 0, label: "Top middle" }, { id: "tr", col: 2, row: 0, label: "Top right" },
  { id: "ml", col: 0, row: 1, label: "Left middle" }, { id: "c", col: 1, row: 1, label: "Centre" }, { id: "mr", col: 2, row: 1, label: "Right middle" },
  { id: "bl", col: 0, row: 2, label: "Bottom left" }, { id: "bc", col: 1, row: 2, label: "Bottom middle" }, { id: "br", col: 2, row: 2, label: "Bottom right" },
];
export const anchorById = (id) => ANCHORS.find((a) => a.id === id) || null;

// bounds = [xmin, ymin, xmax, ymax] of the job's cutting path. Returns the point of the box that has to sit at the zero point.
export function anchorPoint(bounds, id) {
  const a = anchorById(id); if (!a || !bounds || bounds.length < 4) return null;
  const [x0, y0, x1, y1] = bounds.map(Number);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  return [x0 + (a.col * (x1 - x0)) / 2, y1 - (a.row * (y1 - y0)) / 2];
}
// how far the whole job has to move so that anchor lands on (0, 0)
export function anchorShift(bounds, id) {
  const p = anchorPoint(bounds, id); if (!p) return [0, 0];
  return [-p[0], -p[1]];
}

const num = (v) => { const s = (+v).toFixed(3); return s.replace(/\.?0+$/, "") || "0"; };
// Move every absolute X/Y target in a G-code text by (dx, dy). Arc centres (I, J) are relative to the start point, so they stay as they are
// (unless the file switches to absolute arc centres with G90.1, then they move too). Lines in relative mode (G91), machine coordinates (G53)
// and coordinate-system commands (G10, G28, G30, G52, G92) are never moved. Z, feed and everything else is untouched.
export function shiftGcode(text, dx, dy) {
  dx = Number(dx); dy = Number(dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Bad job origin shift.");
  let rel = false, arcAbs = false, moved = 0;
  const out = String(text).split(/\r?\n/).map((line) => {
    // code part only: drop (comments) and ; comments for analysis, but keep them in the output
    const code = line.replace(/\([^)]*\)/g, (m) => " ".repeat(m.length)).replace(/;.*$/, (m) => " ".repeat(m.length));
    const g = [...code.matchAll(/G\s*(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1]));
    if (g.includes(91)) rel = true;
    if (g.includes(90)) rel = false;
    if (g.includes(91.1)) arcAbs = false;
    if (g.includes(90.1)) arcAbs = true;
    if (rel || g.some((v) => [53, 10, 28, 30, 52, 92].includes(v))) return line;
    let changed = false;
    const re = /([XYIJ])(\s*)([-+]?\d*\.?\d+)/gi;
    const res = line.replace(re, (m, ax, sp, val, off) => {
      if (code.slice(off, off + m.length).trim() === "") return m;       // inside a comment
      const k = ax.toUpperCase();
      if ((k === "I" || k === "J") && !arcAbs) return m;
      changed = true;
      return ax + sp + num(parseFloat(val) + (k === "X" || k === "I" ? dx : dy));
    });
    if (changed) moved++;
    return res;
  });
  return { text: out.join("\n"), moved };
}

// ---------------------------------------------------------------- saved work origins (localStorage, with the other settings)
export const ORIGINS_KEY = "plasma.origins.v1";
const MAX_ORIGINS = 30;
const cleanName = (n) => String(n == null ? "" : n).replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
export function loadOrigins(store) {
  try {
    const raw = JSON.parse((store || localStorage).getItem(ORIGINS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((o) => o && typeof o === "object" && cleanName(o.name) && Number.isFinite(o.x) && Number.isFinite(o.y) && Math.abs(o.x) < 1e5 && Math.abs(o.y) < 1e5)
      .slice(0, MAX_ORIGINS).map((o) => ({ id: String(o.id || cleanName(o.name)).slice(0, 60), name: cleanName(o.name), x: o.x, y: o.y, savedAt: Number(o.savedAt) || 0 }));
  } catch (e) { return []; }
}
function persist(list, store) { try { (store || localStorage).setItem(ORIGINS_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ } return list; }
// x, y = where work zero is, measured from the machine's home corner (mm). Same name = replaces that entry.
export function saveOrigin(store, { name, x, y }, now = Date.now()) {
  const nm = cleanName(name);
  if (!nm) throw new Error("Give the start point a name.");
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) >= 1e5 || Math.abs(y) >= 1e5) throw new Error("That position isn't valid.");
  const list = loadOrigins(store), i = list.findIndex((o) => o.name.toLowerCase() === nm.toLowerCase());
  const rec = { id: i >= 0 ? list[i].id : "o" + now.toString(36) + Math.random().toString(36).slice(2, 5), name: nm, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, savedAt: now };
  if (i >= 0) list[i] = rec; else { if (list.length >= MAX_ORIGINS) throw new Error(`You can keep ${MAX_ORIGINS} start points. Delete one first.`); list.push(rec); }
  persist(list, store);
  return { list, rec, replaced: i >= 0 };
}
export function deleteOrigin(store, id) { const list = loadOrigins(store).filter((o) => o.id !== id); return persist(list, store); }

// r15 9.4 Back up / restore machine settings to a file: the app settings and material presets (checked by settings.js, as
// before) plus what this browser knows about the machine: the edges (work area from home), saved cut speeds, the material,
// the small-hole speed choice, saved start points and the sheet. A restore is checked as a whole first; if any part is bad,
// nothing at all is restored. No sign-in data is read or written.
export const BACKUP_KIND = "porta-plazma-machine-backup";
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const j = (store, key) => { try { return JSON.parse(store.getItem(key) || "null"); } catch (e) { return null; } };
const cleanName = (n) => String(n == null ? "" : n).replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

export function makeBackup(store, { app = null, presets = null, at = new Date().toISOString() } = {}) {
  let slow = null; try { slow = store.getItem("plasma.slowHoles"); } catch (e) { slow = null; }
  return {
    kind: BACKUP_KIND, v: 1, at, app, presets,
    machine: {
      limits: (j(store, "plasma.limits") || {}).limits || null,
      speeds: j(store, "plasma.speeds") || {},
      material: j(store, "plasma.material"),
      slowHoles: slow === "0" || slow === "1" ? slow : null,
      origins: j(store, "plasma.origins.v1") || [],
      sheet: j(store, "plasma.sheet"),
    },
  };
}

function checkLimits(l, errors) {
  if (l == null) return null;
  const why = "The saved edges are not valid";
  if (!isObj(l)) { errors.push(why + "."); return null; }
  const out = {};
  for (const a of ["x", "y", "z"]) {
    const v = l[a];
    if (!Array.isArray(v) || v.length !== 2 || !v.every(fin) || v.some((n) => Math.abs(n) > 10000) || !(v[0] < v[1])) { errors.push(`${why} (${a.toUpperCase()} must be two numbers within 10 m, low then high).`); return null; }
    out[a] = [v[0], v[1]];
  }
  if (out.x[1] - out.x[0] < 20 || out.y[1] - out.y[0] < 20) { errors.push(why + " (X and Y must each span at least 20 mm)."); return null; }
  return out;
}
function checkSpeeds(s, errors) {
  if (s == null) return {};
  if (!isObj(s)) { errors.push("The saved speeds are not valid."); return null; }
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof k !== "string" || k.length > 80) { errors.push("A saved speed has a bad name."); return null; }
    if (!fin(v) || v < 10 || v > 20000) { errors.push(`The saved speed for ${cleanName(k.replace("|", " ")) || "a material"} must be 10 to 20000 mm/min.`); return null; }
    out[k] = v;
  }
  return out;
}
function checkMaterial(m, errors) {
  if (m == null) return null;
  if (!isObj(m) || typeof m.m !== "string" || m.m.length > 40 || !fin(m.t) || m.t <= 0 || m.t >= 100) { errors.push("The saved material is not valid."); return null; }
  return { m: m.m, t: m.t };
}
function checkOrigins(o, errors) {
  if (o == null) return [];
  if (!Array.isArray(o) || o.length > 30) { errors.push("The saved start points are not valid."); return null; }
  const out = [];
  for (const p of o) {
    if (!isObj(p) || !cleanName(p.name) || !fin(p.x) || !fin(p.y) || Math.abs(p.x) >= 1e5 || Math.abs(p.y) >= 1e5) { errors.push("A saved start point is not valid."); return null; }
    out.push({ id: String(p.id || cleanName(p.name)).slice(0, 60), name: cleanName(p.name), x: p.x, y: p.y, savedAt: Number(p.savedAt) || 0 });
  }
  return out;
}
function checkSheet(s, errors) {
  if (s == null) return null;
  if (!isObj(s) || !fin(s.w) || !fin(s.h) || s.w < 10 || s.h < 10 || s.w > 10000 || s.h > 10000) { errors.push("The saved sheet size is not valid."); return null; }
  const c = s.clearance == null ? 2 : s.clearance;
  if (!fin(c) || c < 0 || c > 100) { errors.push("The saved sheet clearance is not valid."); return null; }
  const out = { w: s.w, h: s.h, clearance: c };
  if (s.remnant != null) {
    const rings = s.remnant && s.remnant.rings;
    const okRing = (r) => Array.isArray(r) && r.length >= 3 && r.length <= 5000 && r.every((p) => Array.isArray(p) && p.length === 2 && p.every(fin));
    if (!Array.isArray(rings) || !rings.length || rings.length > 50 || !rings.every(okRing)) { errors.push("The saved leftover sheet shape is not valid."); return null; }
    out.remnant = { ...s.remnant, rings }; if (s.plain && isObj(s.plain)) out.plain = s.plain;
  }
  return out;
}

// Returns { errors, parts, machine } — parts names what a restore will replace; errors empty means it is safe to apply.
export function checkBackup(data) {
  const errors = [];
  if (!isObj(data) || data.kind !== BACKUP_KIND) return { errors: ["That file is not a machine settings backup."], parts: [], machine: null };
  if (data.v !== 1) return { errors: ["That backup was made by a newer version of the app."], parts: [], machine: null };
  const m = isObj(data.machine) ? data.machine : {};
  const machine = {
    limits: checkLimits(m.limits, errors), speeds: checkSpeeds(m.speeds, errors), material: checkMaterial(m.material, errors),
    slowHoles: m.slowHoles === "0" || m.slowHoles === "1" ? m.slowHoles : null,
    origins: checkOrigins(m.origins, errors), sheet: checkSheet(m.sheet, errors),
  };
  const parts = [];
  if (data.app) parts.push("app settings");
  if (Array.isArray(data.presets) && data.presets.length) parts.push("material presets");
  if (machine.limits) parts.push("edges");
  if (machine.speeds && Object.keys(machine.speeds).length) parts.push("saved speeds");
  if (machine.material) parts.push("material");
  if (machine.slowHoles) parts.push("small-hole speed choice");
  if (machine.origins && machine.origins.length) parts.push("saved start points");
  if (machine.sheet) parts.push("sheet");
  return { errors, parts, machine: errors.length ? null : machine };
}

// Writes the machine part of a checked backup. Refuses (throws) if the check found anything wrong.
export function applyBackup(store, checked) {
  if (!checked || checked.errors.length || !checked.machine) throw new Error("Nothing was restored. " + ((checked && checked.errors[0]) || "The backup was not checked."));
  const m = checked.machine, set = (k, v) => store.setItem(k, v);
  if (m.limits) set("plasma.limits", JSON.stringify({ limits: m.limits, saved: new Date().toISOString(), restored: true }));
  set("plasma.speeds", JSON.stringify(m.speeds || {}));
  if (m.material) set("plasma.material", JSON.stringify(m.material));
  if (m.slowHoles) set("plasma.slowHoles", m.slowHoles);
  set("plasma.origins.v1", JSON.stringify(m.origins || []));
  if (m.sheet) set("plasma.sheet", JSON.stringify(m.sheet));
}

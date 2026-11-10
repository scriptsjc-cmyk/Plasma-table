// Settings menu: machine, speeds, torch, pierce/cut, materials, homing, I/O,
// units, backup/restore. Beginner sees the basics; Pro sees firmware tools
// (steps/mm, $ editor) behind a warning and an automatic $$ backup.

import * as Acc from "./account.js";
import { filterConsoleCommand, renderAdvancedMachine, fillSettingsFromText, setFirmwareText, appendConsole, parseBackup } from "./admin-machine.js";
import { fluidncBlockedByHttps, fluidncMixedContentMessage, looksLikeFluidNC } from "./fluidnc.js";
import { DIALECTS } from "./dialect.js";

const KEY = "plasma.settings.v1";

export const defaultSettings = () => ({
  units: "mm",
  dialect: "grbl",
  lineNumbers: false,
  bed: { x: 1300, y: 800, z: 60 },
  invert: { x: false, y: false, z: false },
  rates: { x: 8000, y: 8000, z: 1500 },
  accel: { x: 400, y: 400, z: 200 },
  torch: { pierceHeight: 3.5, cutHeight: 1.5, pierceDelay: 0.4, thcOn: false, thcVoltage: 0, thcNote: "" },
  homing: { enabled: true, pullOff: 2 },
  io: {},
  fluidnc: { host: "", port: 81 },
  firmwareWarned: false,
});

// ---- validation: every number has a sane range; a bad value is refused (form) or dropped (stored/restored file), never half-applied
const RANGES = {
  bed: { x: [50, 5000, "Bed X"], y: [50, 5000, "Bed Y"], z: [10, 500, "Bed Z"] },
  rates: { x: [100, 20000, "X max rate"], y: [100, 20000, "Y max rate"], z: [10, 5000, "Z max rate"] },
  accel: { x: [10, 2000, "X acceleration"], y: [10, 2000, "Y acceleration"], z: [10, 2000, "Z acceleration"] },
  torch: { pierceHeight: [0, 25, "Pierce height"], cutHeight: [0, 25, "Cut height"], pierceDelay: [0, 30, "Pierce delay"], thcVoltage: [0, 500, "THC voltage"] },
};
const UNITS = ["mm", "inch"];
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN));

// Returns { settings, errors }. `strict` collects errors; otherwise bad fields fall back to the default.
export function sanitizeSettings(raw, { strict = false } = {}) {
  const d = defaultSettings(), out = defaultSettings(), errors = [];
  const src = isObj(raw) ? raw : {};
  if (!isObj(raw)) errors.push("Settings must be an object.");
  for (const grp of Object.keys(RANGES)) {
    const g = isObj(src[grp]) ? src[grp] : {};
    if (src[grp] !== undefined && !isObj(src[grp])) errors.push(grp + " must be an object.");
    for (const k of Object.keys(RANGES[grp])) {
      const [lo, hi, label] = RANGES[grp][k];
      if (g[k] === undefined) continue;
      const v = num(g[k]);
      if (!Number.isFinite(v) || v < lo || v > hi) { errors.push(label + " must be a number from " + lo + " to " + hi + "."); out[grp][k] = d[grp][k]; }
      else out[grp][k] = v;
    }
  }
  if (src.torch && isObj(src.torch)) { out.torch.thcOn = src.torch.thcOn === true; out.torch.thcNote = typeof src.torch.thcNote === "string" ? src.torch.thcNote.slice(0, 200).replace(/[^\x20-\x7e]/g, "") : ""; }
  if (isObj(src.invert)) for (const a of ["x", "y", "z"]) if (src.invert[a] !== undefined) { if (typeof src.invert[a] === "boolean") out.invert[a] = src.invert[a]; else errors.push("Invert " + a.toUpperCase() + " must be on or off."); }
  if (src.units !== undefined) { if (UNITS.includes(src.units)) out.units = src.units; else errors.push("Units must be mm or inch."); }
  if (src.dialect !== undefined) { if (DIALECTS.some((x) => x.id === src.dialect)) out.dialect = src.dialect; else errors.push("Unknown G-code dialect."); }
  if (src.lineNumbers !== undefined) { if (typeof src.lineNumbers === "boolean") out.lineNumbers = src.lineNumbers; else errors.push("Line numbers must be on or off."); }
  if (isObj(src.homing)) {
    if (typeof src.homing.enabled === "boolean") out.homing.enabled = src.homing.enabled;
    if (src.homing.pullOff !== undefined) { const v = num(src.homing.pullOff); if (Number.isFinite(v) && v >= 0 && v <= 20) out.homing.pullOff = v; else errors.push("Homing pull-off must be 0 to 20 mm."); }
  }
  if (isObj(src.fluidnc)) {
    out.fluidnc.host = typeof src.fluidnc.host === "string" && /^[A-Za-z0-9.\-]{0,253}$/.test(src.fluidnc.host) ? src.fluidnc.host : "";
    const p = num(src.fluidnc.port); out.fluidnc.port = Number.isInteger(p) && p >= 1 && p <= 65535 ? p : 81;
  }
  out.io = {};
  out.firmwareWarned = false;      // the firmware warning is shown again after a restore / on a new device
  return { settings: out, errors: strict ? errors : [] };
}

export function sanitizePresets(list) {
  if (!Array.isArray(list)) return { presets: [], errors: ["Presets must be a list."] };
  if (list.length > 300) return { presets: [], errors: ["Too many presets."] };
  const errors = [], out = [];
  const rng = { thickness_mm: [0.1, 60], pierce_delay_s: [0, 30], pierce_height_mm: [0, 25], cut_speed_mm_min: [10, 20000], kerf_mm: [0, 10], amps: [5, 500] };
  list.forEach((p, i) => {
    if (!isObj(p) || typeof p.material !== "string" || !p.material.trim() || p.material.length > 60 || /[^\x20-\x7e]/.test(p.material)) { errors.push("Preset " + (i + 1) + " has no valid material name."); return; }
    const rec = { material: p.material.trim() };
    for (const k of Object.keys(rng)) {
      if (p[k] === null || p[k] === undefined || p[k] === "") { if (k === "thickness_mm") { errors.push("Preset " + (i + 1) + " needs a thickness."); } else rec[k] = null; continue; }
      const v = num(p[k]);
      if (!Number.isFinite(v) || v < rng[k][0] || v > rng[k][1]) { errors.push("Preset " + (i + 1) + ": " + k + " must be " + rng[k][0] + " to " + rng[k][1] + "."); continue; }
      rec[k] = v;
    }
    rec.notes = typeof p.notes === "string" ? p.notes.slice(0, 200).replace(/[^\x20-\x7e]/g, "") : "";
    out.push(rec);
  });
  return { presets: out, errors };
}

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && typeof s === "object") { const r = sanitizeSettings(s); r.settings.firmwareWarned = s.firmwareWarned === true; return r.settings; }
  } catch (e) { /* ignore */ }
  return defaultSettings();
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

let host = null; // { toast, machine, isPro, isAdmin, isFluidNC, canWrite, send, readSettings, writeSettings, calMove, firmwareText, getAppBackup, applyAppBackup }
let state = loadSettings();
let presets = []; // admin published + local overrides
const LOCAL_PRESETS = "plasma.cutPresets.local";

export function currentSettings() { return state; }
export function initSettings(opts) { host = opts || {}; state = loadSettings(); loadLocalPresets(); }

function loadLocalPresets() {
  try { presets = JSON.parse(localStorage.getItem(LOCAL_PRESETS) || "[]") || []; } catch (e) { presets = []; }
}
function saveLocalPresets() { try { localStorage.setItem(LOCAL_PRESETS, JSON.stringify(presets)); } catch (e) { /* ignore */ } }

export async function refreshPublishedPresets() {
  try {
    const pub = (await Acc.listCutPresets()) || [];
    // published are defaults; local edits (same material+thickness) win
    const local = presets.slice();
    const out = pub.map((p) => {
      const hit = local.find((l) => String(l.material).toLowerCase() === String(p.material).toLowerCase() && Number(l.thickness_mm) === Number(p.thickness_mm));
      return hit ? { ...p, ...hit, published: true, overridden: true } : { ...p, published: true };
    });
    for (const l of local) {
      if (!out.some((p) => String(p.material).toLowerCase() === String(l.material).toLowerCase() && Number(p.thickness_mm) === Number(l.thickness_mm))) {
        out.push({ ...l, published: false });
      }
    }
    return out;
  } catch (e) {
    return presets.slice();
  }
}

export function upsertLocalPreset(row) {
  const mat = String(row.material || "").trim();
  const th = Number(row.thickness_mm);
  if (!mat || !(th > 0)) throw new Error("Material and a positive thickness are required.");
  const chk = sanitizePresets([{ material: mat, thickness_mm: th, pierce_delay_s: row.pierce_delay_s, pierce_height_mm: row.pierce_height_mm, cut_speed_mm_min: row.cut_speed_mm_min, kerf_mm: row.kerf_mm, amps: row.amps, notes: row.notes }]);
  if (chk.errors.length) throw new Error(chk.errors[0].replace(/^Preset 1[: ]*/, ""));
  let rec = presets.find((p) => p.material.toLowerCase() === mat.toLowerCase() && Number(p.thickness_mm) === th);
  if (!rec) { rec = { material: mat, thickness_mm: th }; presets.push(rec); }
  Object.assign(rec, {
    pierce_delay_s: row.pierce_delay_s, pierce_height_mm: row.pierce_height_mm,
    cut_speed_mm_min: row.cut_speed_mm_min, kerf_mm: row.kerf_mm, amps: row.amps, notes: row.notes || "",
  });
  saveLocalPresets();
  return rec;
}

export function matchPreset(material, thickness, list) {
  const rows = list || presets;
  return rows.find((p) => String(p.material).toLowerCase() === String(material || "").toLowerCase() && Math.abs(Number(p.thickness_mm) - Number(thickness)) < 1e-6) || null;
}

function $(id) { return document.getElementById(id); }
function toast(m, e) { if (host && host.toast) host.toast(m, e); }

function field(label, help, input, beginnerOk) {
  const wrap = document.createElement("label");
  wrap.className = "set-field" + (beginnerOk ? "" : " pro-field");
  const t = document.createElement("span"); t.className = "set-lab"; t.textContent = label;
  wrap.append(t, input);
  if (help) { const h = document.createElement("small"); h.className = "muted"; h.textContent = help; wrap.appendChild(h); }
  return wrap;
}
function numInput(id, val, step) {
  const i = document.createElement("input");
  i.id = id; i.type = "number"; i.step = step || "any"; i.value = val == null ? "" : String(val);
  i.setAttribute("inputmode", "decimal");
  return i;
}
function check(id, on, label) {
  const l = document.createElement("label"); l.className = "check";
  const i = document.createElement("input"); i.type = "checkbox"; i.id = id; i.checked = !!on;
  l.append(i, document.createTextNode(" " + label));
  return l;
}

const TABS = [
  { id: "machine", name: "Machine & axes", beginner: true },
  { id: "speeds", name: "Speeds", beginner: true },
  { id: "torch", name: "Torch & THC", beginner: true },
  { id: "pierce", name: "Pierce & cut", beginner: true },
  { id: "materials", name: "Material library", beginner: true },
  { id: "homing", name: "Homing & limits", beginner: false },
  { id: "io", name: "I/O", beginner: true },
  { id: "units", name: "Units & export", beginner: true },
  { id: "backup", name: "Backup / restore", beginner: true },
  { id: "firmware", name: "Firmware (Pro)", beginner: false, pro: true },
];

export function openSettings(tab) {
  const dlg = $("settingsDlg"); if (!dlg) return;
  dlg.classList.remove("hidden");
  showTab(tab || "machine");
  paintSettings();
}

export function closeSettings() {
  const dlg = $("settingsDlg"); if (dlg) dlg.classList.add("hidden");
}

function showTab(id) {
  const isPro = !!(host && host.isPro && host.isPro());
  $$(".settab").forEach((b) => b.classList.toggle("sel", b.dataset.settab === id));
  $$(".setpane").forEach((p) => p.classList.toggle("hidden", p.dataset.setpane !== id));
  if (id === "firmware") mountFirmware();
  if (id === "materials") paintMaterials();
  if (id === "io") paintIo();
}

function $$(sel, root) { return [...(root || document).querySelectorAll(sel)]; }

function isPro() { return !!(host && host.isPro && host.isPro()); }

export function paintSettings() {
  const box = $("settingsTabs"); if (!box) return;
  const pro = isPro();
  box.replaceChildren();
  for (const t of TABS) {
    if (t.pro && !pro) continue;
    if (!t.beginner && !pro && t.id !== "io") continue;
    const b = document.createElement("button");
    b.type = "button"; b.className = "settab"; b.dataset.settab = t.id; b.textContent = t.name;
    b.onclick = () => showTab(t.id);
    box.appendChild(b);
  }
  const first = box.querySelector(".settab");
  if (first && !box.querySelector(".settab.sel")) first.classList.add("sel");
  fillBasics();
}

function fillBasics() {
  const s = state;
  const set = (id, v) => { const el = $(id); if (el && v != null) el.value = String(v); };
  set("setBedX", s.bed.x); set("setBedY", s.bed.y); set("setBedZ", s.bed.z);
  if ($("setInvX")) $("setInvX").checked = !!s.invert.x;
  if ($("setInvY")) $("setInvY").checked = !!s.invert.y;
  if ($("setInvZ")) $("setInvZ").checked = !!s.invert.z;
  set("setRateX", s.rates.x); set("setRateY", s.rates.y); set("setRateZ", s.rates.z);
  set("setAccX", s.accel.x); set("setAccY", s.accel.y); set("setAccZ", s.accel.z);
  set("setPierceH", s.torch.pierceHeight); set("setCutH", s.torch.cutHeight); set("setPierceD", s.torch.pierceDelay);
  set("setThcV", s.torch.thcVoltage);
  if ($("setThcOn")) $("setThcOn").checked = !!s.torch.thcOn;
  if ($("setUnits")) $("setUnits").value = s.units || "mm";
  if ($("setDialect")) $("setDialect").value = s.dialect || "grbl";
  if ($("setLineNo")) $("setLineNo").checked = !!s.lineNumbers;
  const thc = $("setThcNote");
  if (thc) {
    const has = host && host.hasThc && host.hasThc();
    thc.textContent = has
      ? "THC voltage is available on this controller."
      : "This controller has no torch-height (THC) voltage input the app can read. Pierce height, cut height and delay are still applied in the G-code. A THC add-on would be needed for automatic voltage following.";
  }
  const fw = $("setFirmwareHint");
  if (fw) {
    fw.textContent = (host && host.isFluidNC && host.isFluidNC())
      ? "Connected to FluidNC. Machine geometry lives in config.yaml, not GRBL $ settings. Download the template below, edit the GPIO to match your breakout, and copy it onto the ESP32."
      : "GRBL / grblHAL keeps these as $ settings. Pro users can open Firmware to read and write them (with a backup first).";
  }
}

export function readFormIntoState() {
  const raw = (id) => { const el = $(id); return el ? (el.value === "" ? NaN : Number(el.value)) : undefined; };
  const cand = JSON.parse(JSON.stringify(state));
  const put = (obj, k, id) => { const v = raw(id); if (v !== undefined) obj[k] = v; };
  put(cand.bed, "x", "setBedX"); put(cand.bed, "y", "setBedY"); put(cand.bed, "z", "setBedZ");
  if ($("setInvX")) cand.invert.x = $("setInvX").checked;
  if ($("setInvY")) cand.invert.y = $("setInvY").checked;
  if ($("setInvZ")) cand.invert.z = $("setInvZ").checked;
  put(cand.rates, "x", "setRateX"); put(cand.rates, "y", "setRateY"); put(cand.rates, "z", "setRateZ");
  put(cand.accel, "x", "setAccX"); put(cand.accel, "y", "setAccY"); put(cand.accel, "z", "setAccZ");
  put(cand.torch, "pierceHeight", "setPierceH"); put(cand.torch, "cutHeight", "setCutH"); put(cand.torch, "pierceDelay", "setPierceD"); put(cand.torch, "thcVoltage", "setThcV");
  if ($("setThcOn")) cand.torch.thcOn = $("setThcOn").checked;
  if ($("setUnits")) cand.units = $("setUnits").value;
  if ($("setDialect")) cand.dialect = $("setDialect").value;
  if ($("setLineNo")) cand.lineNumbers = $("setLineNo").checked;
  const r = sanitizeSettings(cand, { strict: true });
  if (r.errors.length) { toast(r.errors[0], true); return null; }   // nothing is saved or applied
  r.settings.firmwareWarned = state.firmwareWarned === true;
  r.settings.fluidnc = { ...state.fluidnc };
  state = r.settings;
  saveSettings(state);
  if (host && host.onChange) host.onChange(state);
  return state;
}

async function paintMaterials() {
  const box = $("setMatList"); if (!box) return;
  const rows = await refreshPublishedPresets();
  box.replaceChildren();
  if (!rows.length) {
    const p = document.createElement("p"); p.className = "muted";
    p.textContent = "No presets yet. Add one below, or ask the admin to publish defaults.";
    box.appendChild(p);
    return;
  }
  const table = document.createElement("table"); table.className = "accttable";
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const h of ["Material", "mm", "Amps", "Speed", "Kerf", "Pierce s", ""]) {
    const th = document.createElement("th"); th.textContent = h; hr.appendChild(th);
  }
  head.appendChild(hr); table.appendChild(head);
  const tb = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const v of [r.material, r.thickness_mm, r.amps ?? "—", r.cut_speed_mm_min ?? "—", r.kerf_mm ?? "—", r.pierce_delay_s ?? "—"]) {
      const td = document.createElement("td"); td.textContent = String(v); tr.appendChild(td);
    }
    const td = document.createElement("td");
    const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = "Use";
    b.onclick = () => { if (host && host.applyPreset) host.applyPreset(r); toast("Using " + r.material + " " + r.thickness_mm + " mm."); };
    td.appendChild(b); tr.appendChild(td);
    tb.appendChild(tr);
  }
  table.appendChild(tb); box.appendChild(table);
}

function paintIo() {
  const box = $("setIoLive"); if (!box) return;
  const st = host && host.status ? host.status() : {};
  const inp = st.inputs || {};
  const rows = [
    ["Torch relay (output)", !!(st.torch || inp.torch)],
    ["Probe / floating head (ohmic or switch)", !!inp.probe],
    ["X limit / home", !!inp.limX],
    ["Y limit / home", !!inp.limY],
    ["Z limit / home", !!inp.limZ],
    ["E-stop", !!inp.estop],
    ["Hold / pause input", !!inp.hold],
    ["Start input", !!inp.start],
  ];
  box.replaceChildren();
  for (const [lab, on] of rows) {
    const d = document.createElement("div");
    d.className = "lamp" + (on ? " on" : "");
    const b = document.createElement("b"); b.textContent = lab;
    const s = document.createElement("span"); s.textContent = on ? "ON" : "off";
    d.append(b, s); box.appendChild(d);
  }
}

function mountFirmware() {
  const box = $("setFirmwareHost"); if (!box) return;
  if (host && host.isFluidNC && host.isFluidNC()) {
    box.replaceChildren();
    const p = document.createElement("p");
    p.textContent = "FluidNC does not use the GRBL $ list for bed size, steps/mm or invert masks. Download the YAML template, edit the pins for your DevKitC breakout, and copy it to the ESP32 as config.yaml.";
    const a = document.createElement("a");
    a.href = "config/fluidnc-plasma.yaml"; a.download = "config.yaml"; a.className = "xl";
    a.textContent = "Download config.yaml template";
    box.append(p, a);
    return;
  }
  if (!isPro()) {
    box.replaceChildren();
    const p = document.createElement("p"); p.className = "muted";
    p.textContent = "Switch to Pro in your account to edit firmware settings ($ steps/mm, invert, homing).";
    box.appendChild(p);
    return;
  }
  if (!state.firmwareWarned) {
    box.replaceChildren();
    const w = document.createElement("div"); w.className = "adv-warn";
    w.textContent = "These change how the machine moves and homes. A wrong value can crash the torch or drive past the rails. The app will read and save the current $$ settings before any write. STOP always works. Hardware writes only go out when the machine is Idle and no job is running.";
    const b = document.createElement("button"); b.type = "button"; b.className = "go"; b.textContent = "I understand — show firmware tools";
    b.onclick = () => { state.firmwareWarned = true; saveSettings(state); mountFirmware(); };
    box.append(w, b);
    return;
  }
  box.replaceChildren();
  renderAdvancedMachine({}, host && host.firmwareText ? host.firmwareText() : "", { target: box, allowPro: true, hidePatterns: true });
}

export function bindSettings() {
  $("btnSettings") && ($("btnSettings").onclick = () => openSettings("machine"));
  $("settingsDlg") && $("settingsDlg").addEventListener("click", (e) => { if (e.target === $("settingsDlg")) closeSettings(); });
  $("settingsClose") && ($("settingsClose").onclick = closeSettings);
  $("btnSaveSettings") && ($("btnSaveSettings").onclick = () => { if (readFormIntoState()) toast("Settings saved."); });
  $("formSetPreset") && $("formSetPreset").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      upsertLocalPreset({
        material: $("setPreMat").value,
        thickness_mm: Number($("setPreThk").value),
        amps: $("setPreAmps").value === "" ? null : Number($("setPreAmps").value),
        cut_speed_mm_min: $("setPreSpeed").value === "" ? null : Number($("setPreSpeed").value),
        kerf_mm: $("setPreKerf").value === "" ? null : Number($("setPreKerf").value),
        pierce_delay_s: $("setPreDelay").value === "" ? null : Number($("setPreDelay").value),
        pierce_height_mm: $("setPreHeight").value === "" ? null : Number($("setPreHeight").value),
      });
      toast("Preset saved on this device.");
      paintMaterials();
    } catch (err) { toast(err.message, true); }
  });
  $("btnAppBackup") && ($("btnAppBackup").onclick = () => {
    if (!readFormIntoState()) return;
    const payload = { app: state, presets, at: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "plasma-app-settings.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("btnAppRestore") && ($("btnAppRestore").onclick = () => $("appRestoreFile").click());
  $("appRestoreFile") && ($("appRestoreFile").onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      if (f.size > 256 * 1024) throw new Error("That file is too big to be an app settings backup.");
      const text = await f.text();
      let data; try { data = JSON.parse(text); } catch (e2) { throw new Error("That file is not an app settings backup."); }
      if (!isObj(data) || !isObj(data.app)) throw new Error("That file is not an app settings backup.");
      const a = sanitizeSettings(data.app, { strict: true });
      if (a.errors.length) throw new Error("Nothing was restored. " + a.errors[0]);
      let list = presets;
      if (data.presets !== undefined) { const pr = sanitizePresets(data.presets); if (pr.errors.length) throw new Error("Nothing was restored. " + pr.errors[0]); list = pr.presets; }
      state = a.settings; presets = list; saveLocalPresets();
      saveSettings(state); fillBasics(); if (host && host.onChange) host.onChange(state);
      toast("App settings restored.");
    } catch (err) { toast(err.message, true); }
  });
}

export { filterConsoleCommand, looksLikeFluidNC, fluidncBlockedByHttps, fluidncMixedContentMessage };

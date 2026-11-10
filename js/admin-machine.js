// Admin-only Advanced Machine panel: GRBL $ settings, a filtered console,
// steps/mm calibration, axis invert, homing, soft limits, test patterns, firmware.
// These commands change how the table moves. STOP / ! / 0x18 are never blocked.

const SETTINGS = [
  [0, "Step pulse (µs)", 2, 20],
  [1, "Step idle delay (ms)", 0, 255],
  [2, "Step port invert mask", 0, 7],
  [3, "Direction invert mask (X=1 Y=2 Z=4)", 0, 7],
  [4, "Step enable invert", 0, 1],
  [5, "Limit pins invert", 0, 1],
  [6, "Probe pin invert", 0, 1],
  [10, "Status report mask", 0, 255],
  [11, "Junction deviation (mm)", 0.001, 1],
  [12, "Arc tolerance (mm)", 0.001, 1],
  [13, "Report inches", 0, 1],
  [20, "Soft limits (1 = on)", 0, 1],
  [21, "Hard limits (1 = on)", 0, 1],
  [22, "Homing cycle (1 = on)", 0, 1],
  [23, "Homing direction invert mask", 0, 7],
  [24, "Homing feed (mm/min)", 1, 2000],
  [25, "Homing seek (mm/min)", 10, 10000],
  [26, "Homing debounce (ms)", 0, 250],
  [27, "Homing pull-off (mm)", 0, 20],
  [30, "Max spindle RPM (or THC analog scale)", 0, 24000],
  [31, "Min spindle RPM", 0, 1000],
  [32, "Laser mode (leave 0 on a plasma table)", 0, 1],
  [100, "X steps/mm", 1, 1000],
  [101, "Y steps/mm", 1, 1000],
  [102, "Z steps/mm", 1, 1000],
  [110, "X max rate (mm/min)", 100, 20000],
  [111, "Y max rate (mm/min)", 100, 20000],
  [112, "Z max rate (mm/min)", 10, 5000],
  [120, "X acceleration (mm/s²)", 10, 2000],
  [121, "Y acceleration (mm/s²)", 10, 2000],
  [122, "Z acceleration (mm/s²)", 10, 2000],
  [130, "X max travel (mm)", 50, 5000],
  [131, "Y max travel (mm)", 50, 5000],
  [132, "Z max travel (mm)", 10, 500],
];

const BY_ID = new Map(SETTINGS.map((s) => [s[0], s]));
// masks, switches and whole-number settings: a fraction like $21=0.0001 is never valid
const INTEGER_IDS = new Set([0, 1, 2, 3, 4, 5, 6, 10, 13, 20, 21, 22, 23, 26, 30, 31, 32]);

// Settings whose wrong value can crash the torch or drive past the rails: always confirmed before they are sent.
const RISKY = new Set([3, 4, 5, 20, 21, 22, 23, 100, 101, 102, 110, 111, 112, 120, 121, 122, 130, 131, 132]);

function settingInfo(id) { return BY_ID.get(Number(id)); }
function fail(reason) { return { ok: false, reason }; }
const NUM = "-?(?:\\d+\\.?\\d*|\\.\\d+)";

// A line for the confirm box about a pending $ write.
export function riskNote(id, val, was) {
  id = Number(id);
  if (id === 21 && val === 0) return "$21=0 turns HARD LIMITS OFF (the table will not stop at the rail switches)";
  if (id === 20 && val === 0) return "$20=0 turns SOFT LIMITS OFF (nothing stops the torch driving past the bed)";
  if (id === 20 && val === 1) return "$20=1 turns soft limits ON (set $130-$132 to the bed size first or every move may alarm)";
  if (id === 22) return "$22=" + val + " changes the homing cycle";
  if (!RISKY.has(id)) return null;
  const info = settingInfo(id);
  return "$" + id + "=" + val + (was != null ? " (was " + was + ")" : "") + ": " + (info ? info[1] : "machine setting");
}
export function isRisky(id) { return RISKY.has(Number(id)); }

// The only things the console will send. It is judged the way the controller reads it (case and spaces are ignored),
// everything is plain ASCII on ONE line, and what is sent is rebuilt from the checked words, never the raw text.
// Anything that could light the torch (M3/M4/M7/M8 in any spelling), reset or sleep the controller ($RST $SLP $BOOT),
// change laser mode, or chain a second command is refused. STOP / ! / 0x18 are never blocked.
export function filterConsoleCommand(raw, opts = {}) {
  const s0 = String(raw == null ? "" : raw);
  if (s0 === "!" || s0 === "?" || s0 === "~" || s0 === "\x18") return { ok: true, send: s0 };
  const s = s0.trim();
  if (!s) return fail("Type a command first.");
  if (s.length > 80) return fail("That line is too long for this console.");
  if (/[^\x20-\x7e]/.test(s)) return fail("One line of plain text only (no new lines, tabs, control or special characters).");
  const c = s.replace(/\s+/g, "").toUpperCase();
  if (c.startsWith("$")) {
    if (c === "$$" || c === "$I" || c === "$G" || c === "$X" || c === "$H" || c === "$C") return { ok: true, send: c };
    const set = c.match(new RegExp("^\\$(\\d{1,3})=(" + NUM + ")$"));
    if (!set) return fail("Only $$, $I, $G, $X, $H, $C and $n=value are allowed here.");
    const id = Number(set[1]), val = Number(set[2]);
    const info = settingInfo(id);
    if (!info) return fail("Unknown $ setting. Use the list, or stick to a documented number.");
    if (!Number.isFinite(val)) return fail("That isn't a number.");
    if (id === 32 && val) return fail("Laser mode must stay off on a plasma table.");
    const [, , min, max] = info;
    if (val < min || val > max) return fail("$" + id + " must be between " + min + " and " + max + ".");
    if (INTEGER_IDS.has(id) && !Number.isInteger(val)) return fail("$" + id + " must be a whole number.");
    const note = riskNote(id, val);
    return { ok: true, send: "$" + id + "=" + val, confirm: note ? [note] : null };
  }
  // G-code: every word must be one we know, and nothing may be left over.
  const words = [];
  let rest = c;
  const re = new RegExp("^([A-Z])(" + NUM + ")");
  while (rest.length) {
    const m = rest.match(re);
    if (!m) return fail("Only $$ / $n= / ? / $I / $G / $X / short G0/G1 jogs (up to 50 mm), M5 and STOP are allowed in this console.");
    words.push([m[1], Number(m[2])]);
    rest = rest.slice(m[0].length);
    if (words.length > 10) return fail("Too many words on one line.");
  }
  // The torch is only ever lit by a bare M3 / M4 (confirmed), never together with a move: a rapid with the torch on is a crash.
  if (words.some(([w, v]) => w === "M" && (v === 3 || v === 4)) && words.length > 1) return fail("Send M3 on its own line. Moving with the torch lit is not allowed from the console.");
  const OKG = new Set([0, 1, 21, 90, 91, 92]);
  let moves = false;
  for (const [w, v] of words) {
    if (!Number.isFinite(v)) return fail("That isn't a number.");
    if (w === "G") {
      if (!OKG.has(v)) return fail(v === 20 ? "Inches (G20) are not allowed here: the 50 mm limit is in millimetres." : "G" + v + " isn't allowed in this console.");
      if (v === 0 || v === 1) moves = true;
    } else if (w === "M") {
      if (v === 3 || v === 4) {
        if (!opts.allowTorch) return { ok: false, reason: "That would fire the torch. Confirm first, or use the Torch test button on the Setup tab.", needsTorchConfirm: true };
      } else if (v !== 5) return fail([7, 8].includes(v) ? "That would fire the torch. Use the Torch test button on the Setup tab." : "M" + v + " isn't allowed in this console.");
    } else if (w === "S") {
      if (v !== 0) return fail("Only S0 is allowed here.");
    } else if (w === "F") {
      if (!(v >= 1 && v <= 5000)) return fail("Feed must be 1 to 5000 mm/min.");
    } else if (w === "X" || w === "Y" || w === "Z") {
      if (Math.abs(v) > 50) return fail("Console moves are limited to 50 mm. Use the calibration wizard or the Move tab for longer travel.");
    } else return fail(w + " words aren't allowed in this console.");
  }
  return { ok: true, send: words.map(([w, v]) => w + v).join(" "), moves };
}

// A backup / restore file must be nothing but "$n=value" lines (blank lines, ;comments, "ok" and [..] echoes are skipped).
// Nothing is loaded unless EVERY line is valid and inside the range this panel allows for that setting.
export const RESTORE_MAX_BYTES = 64 * 1024;
export function parseBackup(text) {
  const t = String(text == null ? "" : text);
  if (t.length > RESTORE_MAX_BYTES) return { ok: false, reason: "That file is too big to be a settings backup." };
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(t)) return { ok: false, reason: "That file isn't a plain-text settings backup." };
  const out = {};
  const lines = t.split(/\r?\n/);
  if (lines.length > 400) return { ok: false, reason: "That file has too many lines to be a settings backup." };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith(";") || line.startsWith("(") || line === "ok" || line.startsWith("[") || line.startsWith(">")) continue;
    const m = line.match(new RegExp("^\\$(\\d{1,3})\\s*=\\s*(" + NUM + ")\\s*(?:[;(].*)?$"));
    if (!m) return { ok: false, reason: "Line " + (i + 1) + " isn't a $ setting, so nothing was loaded." };
    const id = Number(m[1]), val = Number(m[2]);
    const info = settingInfo(id);
    if (!info) return { ok: false, reason: "Line " + (i + 1) + ": $" + id + " isn't a setting this panel knows, so nothing was loaded." };
    if (!Number.isFinite(val) || val < info[2] || val > info[3]) return { ok: false, reason: "Line " + (i + 1) + ": $" + id + "=" + m[2] + " is outside " + info[2] + " to " + info[3] + ", so nothing was loaded." };
    if (INTEGER_IDS.has(id) && !Number.isInteger(val)) return { ok: false, reason: "Line " + (i + 1) + ": $" + id + " must be a whole number, so nothing was loaded." };
    if (id === 32 && val) return { ok: false, reason: "Line " + (i + 1) + ": laser mode must stay off on a plasma table, so nothing was loaded." };
    if (id in out) return { ok: false, reason: "Line " + (i + 1) + ": $" + id + " is listed twice, so nothing was loaded." };
    out[id] = val;
  }
  if (!Object.keys(out).length) return { ok: false, reason: "No $ settings found in that file." };
  return { ok: true, map: out };
}

function parseDollar(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/\$(\d+)\s*=\s*(-?\d+(?:\.\d+)?)/);
    if (m) out[Number(m[1])] = Number(m[2]);
  }
  return out;
}

let baseline = null;   // what the controller last told us ($$), so "Write changed settings" really sends only the changes

let host = null; // { toast, machine, sketch, isAdmin, getSettingText, send, firmware }

export function initAdminMachine(opts) { host = opts || {}; }

function $(id) { return document.getElementById(id); }

function warnHtml() {
  const d = document.createElement("div");
  d.className = "adv-warn";
  d.textContent = "These settings change how the machine moves and homes. A wrong value can crash the torch or drive past the rails. Take a backup first. STOP always works.";
  return d;
}

function inputFor(id, val) {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.step = "any";
  inp.dataset.sid = String(id);
  if (val != null && Number.isFinite(Number(val))) inp.value = String(val);
  inp.setAttribute("inputmode", "decimal");
  inp.setAttribute("aria-label", "$" + id);
  return inp;
}

export function renderAdvancedMachine(values = {}, firmware = "", opts = {}) {
  const box = opts.target || $("advMachine");
  if (!box) return;
  box.replaceChildren();
  const allow = (host && host.isAdmin && host.isAdmin()) || (opts.allowPro && host && host.isPro && host.isPro());
  if (!allow) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = opts.allowPro ? "Switch to Pro in your account to edit firmware settings." : "Admin only.";
    box.appendChild(p);
    return;
  }
  box.appendChild(warnHtml());

  if (firmware) {
    const fw = document.createElement("p");
    fw.className = "muted small";
    fw.id = "advFirmware";
    fw.textContent = "Firmware: " + firmware;
    box.appendChild(fw);
  } else {
    const fw = document.createElement("p");
    fw.className = "muted small";
    fw.id = "advFirmware";
    fw.textContent = "Firmware: connect the table, then press Read $ settings.";
    box.appendChild(fw);
  }

  const row = document.createElement("div");
  row.className = "row wrap";
  const mk = (id, label) => { const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = "small"; b.textContent = label; return b; };
  row.append(mk("advRead", "Read $ settings"), mk("advApply", "Write changed settings"), mk("advBackup", "Backup to file"), mk("advRestoreBtn", "Restore from file"));
  const file = document.createElement("input");
  file.type = "file"; file.id = "advRestore"; file.accept = ".txt,.nc,.settings"; file.className = "hidden";
  file.setAttribute("aria-label", "Restore settings file");
  box.append(row, file);

  const list = document.createElement("div");
  list.id = "advSettings";
  for (const [id, desc] of SETTINGS) {
    const rowS = document.createElement("div");
    rowS.className = "adv-set";
    const lab = document.createElement("b"); lab.textContent = "$" + id;
    const d = document.createElement("span"); d.className = "muted"; d.textContent = desc;
    rowS.append(lab, d, inputFor(id, values[id]));
    list.appendChild(rowS);
  }
  box.appendChild(list);

  // invert / homing / rates shortcuts
  const hints = document.createElement("p");
  hints.className = "muted small";
  hints.textContent = "Direction invert is $3 (X=1, Y=2, Z=4, add them to invert more than one). Homing is $22 / $23. Soft limits need $20=1 and $130–$132 set to the bed size. Max rates are $110–$112, acceleration $120–$122.";
  box.appendChild(hints);

  // console
  const h3 = document.createElement("h3"); h3.textContent = "Console";
  const log = document.createElement("pre"); log.id = "advConsoleLog"; log.textContent = "";
  const form = document.createElement("form"); form.id = "formAdvConsole"; form.className = "row";
  const inp = document.createElement("input"); inp.id = "advConsole"; inp.className = "grow"; inp.autocomplete = "off"; inp.placeholder = "$$  or  $100=80";
  const go = document.createElement("button"); go.type = "submit"; go.className = "small go"; go.textContent = "Send";
  form.append(inp, go);
  box.append(h3, log, form);

  // calibration
  const cal = document.createElement("div");
  cal.id = "calWizard";
  const ch = document.createElement("h3"); ch.textContent = "Steps/mm calibration";
  const cp = document.createElement("p");
  cp.className = "muted small";
  cp.textContent = "The machine will move the chosen axis by the command distance. Measure what it actually travelled, then press Compute — $100 / $101 / $102 is updated (not written until you press Write changed settings).";
  const grid = document.createElement("div");
  grid.className = "grid3";
  grid.innerHTML = `<label>Axis<select id="calAxis"><option>X</option><option>Y</option><option>Z</option></select></label>
    <label>Command move (mm)<input id="calCmd" type="number" value="100" min="1" step="1" inputmode="decimal"></label>
    <label>Measured (mm)<input id="calMeas" type="number" min="0.1" step="0.01" inputmode="decimal"></label>`;
  const crow = document.createElement("div"); crow.className = "row wrap";
  crow.append(mk("calMove", "Move now"), mk("calCompute", "Compute new steps/mm"));
  const cres = document.createElement("p"); cres.id = "calResult"; cres.className = "muted";
  cal.append(ch, cp, grid, crow, cres);
  box.appendChild(cal);

  if (!opts.hidePatterns) {
    const pats = document.createElement("div");
    pats.className = "row wrap";
    const ph = document.createElement("h3"); ph.textContent = "Test patterns";
    pats.append(mk("patSquare", "100 mm square"), mk("patCircle", "50 mm circle"), mk("patKerf", "Kerf / speed ladder"));
    box.append(ph, pats);
  }

  bindAdvanced(box);
}

function settingInputs(root) {
  const scope = root || document;
  return [...scope.querySelectorAll("#advSettings input[data-sid], [data-adv-settings] input[data-sid]")];
}
function currentValues(root) {
  const out = {};
  settingInputs(root).forEach((el) => {
    if (el.value !== "") out[Number(el.dataset.sid)] = Number(el.value);
  });
  return out;
}

function applyValues(map) {
  settingInputs().forEach((el) => {
    const v = map[Number(el.dataset.sid)];
    if (v != null) el.value = String(v);
  });
}

function askConfirm(msg) { try { return host && host.confirm ? host.confirm(msg) : window.confirm(msg); } catch (e) { return false; } }

function logLine(text) {
  const pre = $("advConsoleLog");
  if (!pre) return;
  pre.textContent += (pre.textContent ? "\n" : "") + text;
  pre.scrollTop = pre.scrollHeight;
}

function q(root, id) { return (root && root.querySelector("#" + id)) || $(id); }

function bindAdvanced(root) {
  const read = q(root, "advRead");
  if (!read || read._bound) return;
  read._bound = true;
  q(root, "advRead").onclick = () => host && host.readSettings && host.readSettings();
  q(root, "advApply").onclick = () => {
    if (!(host && host.writeSettings)) return;
    if (!baseline) { if (host.toast) host.toast("Press Read $ settings first, so only real changes are written.", true); return; }
    const cur = currentValues(), changes = {}, notes = [];
    for (const k of Object.keys(cur)) {
      const id = Number(k), v = cur[k];
      if (baseline[id] === v) continue;
      const r = filterConsoleCommand("$" + id + "=" + v);
      if (!r.ok) { if (host.toast) host.toast(r.reason, true); return; }
      changes[id] = v;
      const n = riskNote(id, v, baseline[id]);
      if (n) notes.push(n);
    }
    const ids = Object.keys(changes);
    if (!ids.length) { if (host.toast) host.toast("Nothing has changed since the last read.", true); return; }
    const list = ids.map((k) => "$" + k + ": " + baseline[k] + " -> " + changes[k]).join("\n");
    if (!askConfirm("Write " + ids.length + " setting" + (ids.length > 1 ? "s" : "") + " to the controller?\n\n" + list + (notes.length ? "\n\nCheck these carefully:\n" + notes.join("\n") : "") + "\n\nSTOP stays available. Have you taken a backup?")) return;
    host.writeSettings(changes);
  };
  q(root, "advBackup").onclick = () => {
    const map = currentValues();
    const body = Object.keys(map).sort((a, b) => a - b).map((k) => `$${k}=${map[k]}`).join("\n") + "\n";
    const blob = new Blob([body], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "grbl-settings.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  q(root, "advRestoreBtn").onclick = () => q(root, "advRestore").click();
  q(root, "advRestore").onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > RESTORE_MAX_BYTES) { if (host && host.toast) host.toast("That file is too big to be a settings backup.", true); return; }
    const r = parseBackup(await f.text());
    if (!r.ok) { if (host && host.toast) host.toast(r.reason, true); logLine("Restore refused: " + r.reason); return; }
    applyValues(r.map);
    logLine("Loaded backup " + String(f.name).replace(/[^\x20-\x7e]/g, "?").slice(0, 60) + " (" + Object.keys(r.map).length + " settings; nothing is sent until you press Write changed settings)");
  };
  q(root, "formAdvConsole").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = q(root, "advConsole").value;
    let r = filterConsoleCommand(raw);
    if (r.needsTorchConfirm) {
      if (!askConfirm("Send " + String(raw).trim() + "?\n\nThis would fire the torch. Torch over scrap, earth clamp on, hands clear.\n\nSTOP stays available.")) return;
      r = filterConsoleCommand(raw, { allowTorch: true });
    }
    if (!r.ok) { if (host && host.toast) host.toast(r.reason, true); return; }
    if (r.confirm && !askConfirm("Send " + r.send + "?\n\n" + r.confirm.join("\n") + "\n\nSTOP stays available.")) return;
    logLine("> " + r.send);
    if (host && host.send) host.send(r.send, r);
    q(root, "advConsole").value = "";
  });
  q(root, "calMove").onclick = () => {
    const axis = q(root, "calAxis").value;
    const mm = Number(q(root, "calCmd").value);
    if (!(mm > 0)) { host.toast && host.toast("Enter a move distance.", true); return; }
    if (mm > 200) { host.toast && host.toast("Calibration moves are limited to 200 mm.", true); return; }
    if (host && host.calMove) host.calMove(axis, mm);
  };
  q(root, "calCompute").onclick = () => {
    const axis = q(root, "calAxis").value;
    const cmd = Number(q(root, "calCmd").value), meas = Number(q(root, "calMeas").value);
    if (!(cmd > 0) || !(meas > 0)) { host.toast && host.toast("Enter the commanded and measured distances.", true); return; }
    const sid = { X: 100, Y: 101, Z: 102 }[axis];
    const cur = currentValues()[sid];
    if (!(cur > 0)) { host.toast && host.toast("Read $ settings first so the current steps/mm is known.", true); return; }
    const next = cur * (cmd / meas);
    q(root, "calResult").textContent = `$${sid} ${cur} → ${next.toFixed(3)} steps/mm (commanded ${cmd} mm, measured ${meas} mm). Press Write changed settings to send it.`;
    const inp = document.querySelector(`#advSettings input[data-sid="${sid}"]`);
    if (inp) inp.value = String(Math.round(next * 1000) / 1000);
  };
  const patSq = q(root, "patSquare"), patCi = q(root, "patCircle"), patKe = q(root, "patKerf");
  if (patSq) patSq.onclick = () => host && host.addPattern && host.addPattern("square");
  if (patCi) patCi.onclick = () => host && host.addPattern && host.addPattern("circle");
  if (patKe) patKe.onclick = () => host && host.addPattern && host.addPattern("kerf");
}

export function fillSettingsFromText(text) {
  const map = parseDollar(text);
  if (!Object.keys(map).length) return map;
  baseline = { ...(baseline || {}), ...map };
  if (!$("advSettings")) renderAdvancedMachine(map);
  else applyValues(map);
  return map;
}

export function lastDollarMap() { return baseline ? { ...baseline } : null; }

export function setFirmwareText(s) {
  const el = $("advFirmware");
  if (el) el.textContent = "Firmware: " + (s || "unknown");
}

export function appendConsole(text) { logLine(text); }

export { SETTINGS, parseDollar };

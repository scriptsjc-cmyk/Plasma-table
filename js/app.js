// Plasma table operator screen (browser version).
// Guided flow: File -> Material -> Position -> Check -> Cut.
// Machine logic lives in machine.js; this file is only the screen.
import { Machine } from "./machine.js";
import { WebSerialTransport } from "./grbl.js";
import { SimTransport } from "./sim.js";
import { parseDXF } from "./dxf.js";
import { parseSVG } from "./svg.js";
import { designToGcode } from "./cam.js";
import { SHAPES, makeShape, copies } from "./shapes.js";

const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const S = {
  cfg: null, chart: null, jogStep: 10, status: { state: "Disconnected" }, job: null, prepared: null,
  gcode: null, design: null, fileName: "", safety: {}, shape: "rect", shapeVals: {}, cur: 1, material: null, thickness: null, connected: false,
  lastAlarm: null, speed: null, lastFeedOv: 100,
};
const MAT_TIPS = {
  "Mild steel": "Mild steel: the easiest to get right. Start at the recommended speed and adjust 10% at a time.",
  "Stainless steel": "Stainless: cuts about 20% slower than mild steel. A dark edge is normal with air plasma.",
  "Aluminium": "Aluminium: keep the speed up and the amps high – going slow makes a messy, melted edge. Never cut over water.",
};
let M = null;

// ------------------------------------------------------------------ small helpers
let toastTimer;
function toast(text, err = false) {
  const t = $("toast");
  t.textContent = text;
  t.className = "toast" + (err ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), err ? 6000 : 2500);
}
function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function log(text, level = "rx") {
  const el = $("log"), d = document.createElement("div");
  d.className = level; d.textContent = text; el.appendChild(d);
  while (el.childNodes.length > 300) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}
function cmd(name, extra = {}) {
  if (!M.grbl) { toast("Connect to the table first.", true); return null; }
  try {
    const r = M.command({ cmd: name, ...extra });
    if (r && r.note) toast(r.note);
    return r;
  } catch (e) { toast(e.message, true); return null; }
}

// ------------------------------------------------------------------ tabs & steps
function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("sel", t.dataset.tab === name));
  ["cut", "move", "setup"].forEach((v) => $(v + "View").classList.toggle("hidden", v !== name || !S.connected));
  S.tab = name;
  if (name === "cut") drawPreview();
}
function canGo(n) {
  if (n === 5) return !!S.job;
  if (n >= 2) return !!S.prepared;
  return true;
}
function goStep(n) {
  if (!canGo(n)) return;
  if (S.job && S.job.running && n !== 5) { toast("A job is running. Pause or stop it first.", true); return; }
  S.cur = n;
  $$(".step").forEach((el) => el.classList.toggle("hidden", Number(el.dataset.step) !== n));
  $$("#stepper li").forEach((li) => {
    const k = Number(li.dataset.step);
    li.classList.toggle("cur", k === n);
    li.classList.toggle("done", k < n);
  });
  if (n === 4) renderChecklist();
  refresh();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------------ jog pad (one template, used on 3 screens)
function mountJogPads() {
  for (const mount of $$(".jogmount")) {
    mount.appendChild($("jogTpl").content.cloneNode(true));
    const steps = mount.querySelector(".steps");
    steps.innerHTML = S.cfg.jog.steps_mm.map((s) => `<button data-step="${s}">${s} mm</button>`).join("");
  }
  document.addEventListener("click", (e) => {
    const sb = e.target.closest(".steps button");
    if (sb) { S.jogStep = Number(sb.dataset.step); syncSteps(); return; }
    const jb = e.target.closest(".j[data-axis]");
    if (jb) jog(jb.dataset.axis, Number(jb.dataset.dir));
  });
  syncSteps();
}
function syncSteps() {
  $$(".steps button").forEach((b) => b.classList.toggle("sel", Number(b.dataset.step) === S.jogStep));
}
function jog(axis, dir) {
  const step = axis === "Z" ? Math.min(S.jogStep, 10) : S.jogStep;
  cmd("jog", { axis, dist: step * dir });
}
function renderPos() {
  const w = S.status.WPos || [0, 0, 0];
  const html = `<div><span>X</span><b>${w[0].toFixed(1)}</b></div><div><span>Y</span><b>${w[1].toFixed(1)}</b></div><div><span>Z</span><b>${w[2].toFixed(1)}</b></div>`;
  $$(".small-pos").forEach((el) => (el.innerHTML = html));
  $("posMove").innerHTML = html;
}

// ------------------------------------------------------------------ step 1: file
function readFile(f) {
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => openText(f.name, String(rd.result), true);
  rd.readAsText(f);
}
function fileKind(name) {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "dxf" ? "dxf" : ext === "svg" ? "svg" : "gcode";
}
// open a file's text: DXF/SVG become a design (we make the cut paths), anything else is G-code
function openText(name, text, remember) {
  const kind = fileKind(name);
  try {
    if (kind === "gcode") { S.design = null; S.gcode = text; }
    else {
      const r = kind === "dxf" ? parseDXF(text) : parseSVG(text);
      S.design = { name, contours: r.contours, warnings: r.warnings, units: r.units };
      S.gcode = null;
    }
  } catch (e) {
    S.design = null; S.gcode = null; S.prepared = null;
    $("warnings").innerHTML = `<li>${esc(e.message)}</li>`;
    refresh();
    return;
  }
  S.fileName = name;
  $("dropTitle").textContent = "✓ " + name;
  $("drop").classList.add("loaded");
  if (remember) saveRecent(name, text);
  loadJob();
  if (S.prepared) goStep(2);
}
function setFile(name, text, remember) { openText(name, text, remember); }

// ------------------------------------------------------------------ shape maker
function renderShapeTiles() {
  $("shapeTiles").innerHTML = SHAPES.map((sh) =>
    `<button data-shape="${sh.id}" class="${sh.id === S.shape ? "sel" : ""}"><i>${sh.icon}</i>${esc(sh.name)}</button>`).join("");
  const sh = SHAPES.find((x) => x.id === S.shape);
  const vals = S.shapeVals[S.shape] || {};
  $("shapeForm").innerHTML = sh.params.map(([k, label, d]) =>
    `<label>${esc(label)}<input type="number" step="any" min="0" inputmode="decimal" data-p="${k}" value="${vals[k] ?? d}"></label>`).join("");
}
function shapeValues() {
  const v = {};
  $$("#shapeForm [data-p]").forEach((i) => (v[i.dataset.p] = i.value));
  S.shapeVals[S.shape] = v;
  return v;
}
function useShape() {
  const sh = SHAPES.find((x) => x.id === S.shape);
  try {
    let c = makeShape(S.shape, shapeValues());
    const nx = Number($("cpX").value) || 1, ny = Number($("cpY").value) || 1;
    if (nx * ny > 1) c = copies(c, nx, ny, Number($("cpGap").value) || 0);
    S.design = { name: sh.name + (nx * ny > 1 ? ` ×${nx * ny}` : ""), contours: c, warnings: [] };
    S.gcode = null; S.fileName = S.design.name;
    loadJob();
  } catch (e) { $("warnings").innerHTML = `<li>${esc(e.message)}</li>`; }
}
function showSource(src) {
  $$(".srcTab").forEach((b) => b.classList.toggle("sel", b.dataset.src === src));
  $("srcFile").classList.toggle("hidden", src !== "file");
  $("srcShape").classList.toggle("hidden", src !== "shape");
  if (src === "shape") useShape();
}

function recentList() {
  try { return JSON.parse(localStorage.getItem("plasma.recent") || "[]"); } catch (e) { return []; }
}
function saveRecent(name, text) {
  try {
    const list = recentList().filter((r) => r.name !== name);
    list.unshift({ name, text });
    while (list.length > 6 || JSON.stringify(list).length > 1500000) list.pop();
    localStorage.setItem("plasma.recent", JSON.stringify(list));
  } catch (e) { /* storage full - fine */ }
  renderRecent();
}
function renderRecent() {
  const list = recentList();
  $("recentWrap").classList.toggle("hidden", !list.length);
  $("recent").innerHTML = list.map((r, i) => `<button data-recent="${i}">${esc(r.name)}</button>`).join("");
}

// ------------------------------------------------------------------ step 2: material
function material() { return S.chart.materials.find((m) => m.name === S.material) || S.chart.materials[0]; }
function row() { return material().rows.find((r) => r.thickness_mm === S.thickness) || material().rows[0]; }
function renderMaterials() {
  $("materials").innerHTML = S.chart.materials.map((m) =>
    `<button data-mat="${esc(m.name)}" class="${m.name === S.material ? "sel" : ""}">${esc(m.name)}</button>`).join("");
  const mat = material();
  if (!mat.rows.some((r) => r.thickness_mm === S.thickness)) { S.thickness = mat.rows[0].thickness_mm; defaultSpeed(); }
  $("thicknesses").innerHTML = mat.rows.map((r) =>
    `<button data-th="${r.thickness_mm}" class="${r.thickness_mm === S.thickness ? "sel" : ""}">${r.thickness_mm} mm</button>`).join("");
  const r = row(), o = overrides();
  const ph = o.pierce_height_mm || (r.pierce_height_mm ?? S.chart.pierce_height_mm);
  const ch = o.cut_height_mm || (r.cut_height_mm ?? S.chart.cut_height_mm);
  $("ovDelay").placeholder = r.pierce_delay_s;
  $("ovKerf").placeholder = r.kerf_mm ?? S.chart.kerf_mm ?? 1.5; $("ovLead").placeholder = S.chart.lead_in_mm ?? 3;
  $("ovPierce").placeholder = r.pierce_height_mm ?? S.chart.pierce_height_mm; $("ovCut").placeholder = r.cut_height_mm ?? S.chart.cut_height_mm;
  $("ampsCard").innerHTML = `
    <div>Set the plasma to</div>
    <div class="big">${r.amps} A</div>
    <div class="sub"><span>Air <b>${S.chart.air_bar} bar</b></span><span>Pierce <b>${o.pierce_delay_s || r.pierce_delay_s} s</b> at <b>${ph} mm</b></span><span>Cut height <b>${ch} mm</b></span></div>`;
  try { localStorage.setItem("plasma.material", JSON.stringify({ m: S.material, t: S.thickness })); } catch (e) { /* ignore */ }
  renderSpeed();
}
function overrides() {
  const v = (id) => $(id).value.trim();
  return { feed_mm_min: S.speed || "", pierce_delay_s: v("ovDelay"), pierce_height_mm: v("ovPierce"), cut_height_mm: v("ovCut") };
}

// ------------------------------------------------------------------ cut speed (recommended, saved, chosen)
const speedKey = () => `${S.material}|${S.thickness}`;
function savedSpeeds() { try { return JSON.parse(localStorage.getItem("plasma.speeds") || "{}"); } catch (e) { return {}; } }
function savedSpeed() { return savedSpeeds()[speedKey()] || null; }
function saveSpeed(v) {
  try { const all = savedSpeeds(); all[speedKey()] = v; localStorage.setItem("plasma.speeds", JSON.stringify(all)); } catch (e) { /* ignore */ }
}
function defaultSpeed() { S.speed = savedSpeed() || row().feed_mm_min; }
function speedStep(rec) { return rec < 1000 ? 25 : 50; }
function renderSpeed() {
  const rec = row().feed_mm_min, lo = Math.round(rec * 0.85 / 10) * 10, hi = Math.round(rec * 1.15 / 10) * 10;
  const sl = $("spSlider");
  sl.min = Math.round(rec * 0.5 / 10) * 10; sl.max = Math.round(rec * 1.5 / 10) * 10; sl.step = 10; sl.value = S.speed;
  const pct = (x) => ((x - sl.min) / (sl.max - sl.min)) * 100;
  sl.style.background = `linear-gradient(90deg, #2a3038 ${pct(lo)}%, #14532d ${pct(lo)}%, #14532d ${pct(hi)}%, #2a3038 ${pct(hi)}%)`;
  sl.style.borderRadius = "8px";
  $("spVal").textContent = S.speed;
  $("spRange").textContent = `good: ${lo}–${hi}`;
  const mine = savedSpeed();
  let note = `Recommended for ${S.material.toLowerCase()} ${S.thickness} mm: <b>${rec}</b> mm/min.`;
  if (mine && mine === S.speed) note += " Using <b>your saved speed</b>.";
  const off = S.speed < rec * 0.75 || S.speed > rec * 1.25;
  if (off) note += " That's a long way from normal – test on scrap first.";
  $("spNote").innerHTML = note;
  $("spNote").className = "spnote" + (off ? " warn" : "");
  $("matTip").textContent = MAT_TIPS[S.material] || "";
}
function setSpeed(v) {
  const sl = $("spSlider");
  S.speed = Math.max(Number(sl.min), Math.min(Number(sl.max), Math.round(v / 10) * 10));
  renderSpeed();
  loadJob();
}

// ------------------------------------------------------------------ job prepare + preview
function kerfNow() { const v = Number($("ovKerf").value); return v > 0 ? v : (row().kerf_mm ?? S.chart.kerf_mm ?? 1.5); }
function leadNow() { const v = $("ovLead").value.trim(); return v !== "" && Number(v) >= 0 ? Number(v) : (S.chart.lead_in_mm ?? 3); }
function loadJob() {
  if (!S.gcode && !S.design) return;
  try {
    let gcode = S.gcode, cam = null, pre = [];
    if (S.design) {
      cam = designToGcode(S.design.contours, { kerf: kerfNow(), leadIn: leadNow(), name: S.fileName });
      gcode = cam.gcode;
      pre = [...(S.design.warnings || []), ...cam.warnings];
    }
    S.prepared = M.loadJob({ gcode, name: S.fileName, material: S.material, thickness: S.thickness,
      dry_run: $("dryRun").checked, overrides: overrides() });
    if (cam) { S.prepared.outline = cam.outline; S.prepared.summary = cam.summary; }
    // the "left of zero" warning doesn't apply to parts we laid out ourselves
    const ws = [...pre, ...S.prepared.warnings.filter((w) => !(cam && /zero point/.test(w)))];
    $("warnings").innerHTML = ws.map((w) => `<li>${esc(w)}</li>`).join("");
  } catch (e) {
    S.prepared = null;
    $("warnings").innerHTML = `<li>${esc(e.message)}</li>`;
  }
  refresh();
}
function wcoNow() {
  const st = S.status;
  return st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : [0, 0, 0];
}
const edgesOn = () => !!(S.safety.limits && S.safety.referenced);
function toView(mx, my) { return S.safety.referenced ? [mx - S.safety.ref[0], my - S.safety.ref[1]] : [mx, my]; }
function viewArea() {
  if (edgesOn()) return { x: S.safety.limits.x, y: S.safety.limits.y, label: "machine edges" };
  const t = S.cfg.travel_mm;
  return { x: [0, t.x], y: [0, t.y], label: "table" };
}
function fit() {
  if (!S.prepared) return { cls: "", text: "" };
  if (!S.safety.limits) return { cls: "unknown", text: "Edges not set up – can't check it fits (Setup tab)." };
  if (!S.safety.referenced) return { cls: "unknown", text: "Home the machine to check it fits." };
  const b = S.prepared.stats.bounds, w = wcoNow(), ref = S.safety.ref, L = S.safety.limits;
  const x0 = b[0] + w[0] - ref[0], x1 = b[2] + w[0] - ref[0], y0 = b[1] + w[1] - ref[1], y1 = b[3] + w[1] - ref[1];
  const over = [];
  if (x0 < L.x[0] - 0.05) over.push(`${Math.ceil(L.x[0] - x0)} mm too far left`);
  if (x1 > L.x[1] + 0.05) over.push(`${Math.ceil(x1 - L.x[1])} mm too far right`);
  if (y0 < L.y[0] - 0.05) over.push(`${Math.ceil(L.y[0] - y0)} mm too far forward`);
  if (y1 > L.y[1] + 0.05) over.push(`${Math.ceil(y1 - L.y[1])} mm too far back`);
  return over.length ? { cls: "bad", bad: true, text: `✗ Won't fit: ${over.join(", ")}. Move the start point.` }
    : { cls: "good", text: "✓ Fits on the machine" };
}
function drawPreview() {
  const cv = $("preview");
  if (!cv || !cv.offsetParent) return;
  const ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600;
  // steps 1-2: zoom in on the part. Step 3 onwards: the whole table, with the part where it will be cut.
  const zoom = S.prepared && S.cur <= 2;
  let A, ox = 0, oy = 0;
  if (zoom) {
    const b = S.prepared.stats.bounds, pad = Math.max(5, 0.06 * Math.max(b[2] - b[0], b[3] - b[1]));
    A = { x: [b[0] - pad, b[2] + pad], y: [b[1] - pad, b[3] + pad], label: "" };
  } else {
    A = viewArea();
    const w0 = wcoNow(); [ox, oy] = toView(w0[0], w0[1]);
  }
  const ax = A.x[1] - A.x[0], ay = A.y[1] - A.y[0];
  const h = Math.max(180, Math.min(520, Math.round(w * (ay / ax))));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  cv.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = 12, sc = Math.min((w - 2 * pad) / ax, (h - 2 * pad) / ay);
  const offX = (w - ax * sc) / 2, offY = (h - ay * sc) / 2;
  const X = (x) => offX + (x - A.x[0]) * sc, Y = (y) => h - offY - (y - A.y[0]) * sc;
  if (!zoom) {
    ctx.strokeStyle = edgesOn() ? "#16a34a" : "#3a424c"; ctx.lineWidth = edgesOn() ? 2 : 1;
    ctx.strokeRect(X(A.x[0]), Y(A.y[1]), ax * sc, ay * sc);
    ctx.fillStyle = "#6b7280"; ctx.font = "12px system-ui";
    ctx.fillText(`${A.label} ${Math.round(ax)} × ${Math.round(ay)} mm`, X(A.x[0]) + 6, Y(A.y[1]) + 16);
  }
  if (S.prepared) {
    const pv = S.prepared.preview;
    const path = (p) => { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + ox), Y(y + oy)) : ctx.moveTo(X(x + ox), Y(y + oy)))); ctx.stroke(); };
    if (S.prepared.outline) { ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; S.prepared.outline.forEach((p) => path([...p, p[0]])); }
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 1; pv.rapids.forEach(path);
    ctx.setLineDash([]); ctx.strokeStyle = fit().bad ? "#ef4444" : "#f97316"; ctx.lineWidth = zoom ? 2.5 : 2;
    for (const p of pv.cuts) { path(p); ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(X(p[0][0] + ox), Y(p[0][1] + oy), zoom ? 4 : 3, 0, 7); ctx.fill(); }
    if (zoom) {
      ctx.fillStyle = "#9aa4ae"; ctx.font = "12px system-ui";
      ctx.fillText("orange = torch path · grey = your part · dots = pierce points", 8, h - 8);
    }
  }
  ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(ox) - 9, Y(oy)); ctx.lineTo(X(ox) + 9, Y(oy)); ctx.moveTo(X(ox), Y(oy) - 9); ctx.lineTo(X(ox), Y(oy) + 9); ctx.stroke();
  if (!zoom && S.status.MPos) {
    const [tx, ty] = toView(S.status.MPos[0], S.status.MPos[1]);
    ctx.fillStyle = S.status.torch ? "#f97316" : "#e5e7eb";
    ctx.beginPath(); ctx.arc(X(tx), Y(ty), 6, 0, 7); ctx.fill();
  }
}

// ------------------------------------------------------------------ step 4: checks
function renderChecklist() {
  const dry = S.prepared && S.prepared.dry_run;
  const items = dry ? ["Practice run: torch will stay OFF", "Hands clear, e-stop within reach"]
    : [`Plasma ON and set to ${row().amps} A`, `Air on (${S.chart.air_bar} bar)`, "Earth clamp on the sheet", "Hands clear, e-stop within reach"];
  $("checklist").innerHTML = items.map((t, i) => `<li><label><input type="checkbox" data-chk="${i}"> ${esc(t)}</label></li>`).join("");
  refresh();
}
function blockers() {
  const b = [];
  if (!S.connected) b.push("Not connected to the table.");
  if (!S.prepared) b.push("No drawing loaded (step 1).");
  const st = S.status.state;
  if (S.connected && st === "Alarm") b.push("Machine is in alarm – press Unlock at the top.");
  else if (S.connected && st !== "Idle") b.push(`Machine is busy (${st}). Wait for it to stop.`);
  const inp = S.status.inputs || {};
  if (inp.estop) b.push("E-stop is pressed – release it and press Unlock.");
  if (inp.probe) b.push("Floating head is pushed up – check the torch isn't touching anything or stuck.");
  if (S.safety.limits && !S.safety.referenced) b.push("Machine needs homing – press Home.");
  if (fit().bad) b.push("The part doesn't fit – go back and move the start point.");
  const boxes = $$("#checklist input");
  if (boxes.some((x) => !x.checked)) b.push("Tick every box above.");
  return b;
}

// ------------------------------------------------------------------ refresh everything that depends on state
function refresh() {
  // stats + fit (preview pane)
  const f = fit();
  $("fit").className = "fit " + f.cls; $("fit").textContent = f.text;
  if (S.prepared) {
    const st = S.prepared.stats;
    $("jobStats").innerHTML = `<span><b>${esc(S.fileName)}</b></span><span>Size <b>${S.prepared.summary ? `${S.prepared.summary.width} × ${S.prepared.summary.height}` : `${st.width_mm} × ${st.height_mm}`} mm</b></span>
      ${S.prepared.summary ? `<span>Parts <b>${S.prepared.summary.parts}</b> · holes <b>${S.prepared.summary.holes}</b></span>` : `<span>Cuts <b>${st.pierces}</b></span>`}<span>About <b>${fmtTime(st.estimated_seconds)}</b></span>${S.prepared.dry_run ? "<span><b>PRACTICE RUN</b></span>" : ""}`;
  } else $("jobStats").innerHTML = "";
  $("next1").disabled = !S.prepared;
  $$("#stepper li").forEach((li) => (li.style.opacity = canGo(Number(li.dataset.step)) ? 1 : 0.4));

  // start button + reasons
  const b = blockers();
  $("btnStart").disabled = b.length > 0;
  $("blockers").innerHTML = b.length && S.cur === 4 ? `Can't start yet:<ul>${b.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";


  // banners
  $("homeBar").classList.toggle("hidden", !(S.connected && S.safety.limits && !S.safety.referenced && S.status.state !== "Home"));
  const estop = !!(S.status.inputs && S.status.inputs.estop);
  $("estopBar").classList.toggle("hidden", !(S.connected && estop));
  $("alarmBar").classList.toggle("hidden", !(S.connected && S.status.state === "Alarm" && !estop));

  // running / done panel
  if (S.job) {
    const j = S.job, pct = j.total ? Math.min(100, Math.round((100 * j.acked) / j.total)) : 0;
    const finished = !j.running && S.status.state === "Idle";
    $("pct").textContent = pct + "%";
    $("progBar").style.width = pct + "%";
    const est = S.prepared ? S.prepared.stats.estimated_seconds : 0;
    const left = pct > 3 ? (j.elapsed * (100 - pct)) / pct : est;
    $("runInfo").textContent = `Running ${fmtTime(j.elapsed)} · about ${fmtTime(left)} left`;
    $("runTitle").textContent = S.status.state === "Hold" ? "Paused" : j.running ? "Cutting…" : "Finishing last moves…";
    $("btnPause").textContent = S.status.state === "Hold" ? "▶ Resume" : "⏸ Pause";
    const ov = S.status.feedOv || 100;
    if (j.running) S.lastFeedOv = ov;
    $("liveSpeed").textContent = `${Math.round((S.speed * ov) / 100)} mm/min` + (ov !== 100 ? ` (${ov}% of ${S.speed})` : "");
    const showDone = (!j.running && j.result !== "done") || finished;
    $("running").classList.toggle("hidden", showDone);
    $("done").classList.toggle("hidden", !showDone);
    if (showDone) {
      const ok = j.result === "done";
      $("doneTitle").textContent = ok ? "Finished ✓" : "Stopped";
      $("doneInfo").textContent = ok ? `Took ${fmtTime(j.elapsed)}. Lift the part out when it's cool.`
        : (S.lastAlarm || "The job was stopped before the end.");
      const changed = S.lastFeedOv !== 100 && S.prepared && !S.prepared.dry_run;
      const v = Math.round((S.speed * S.lastFeedOv) / 100 / 10) * 10;
      $("btnSaveSpeed").textContent = `Save ${v} mm/min as my speed for ${S.material.toLowerCase()} ${S.thickness} mm`;
      if (changed) $("btnSaveSpeed").classList.remove("hidden");
    }
  }
  const t = $("torchBig");
  t.textContent = S.status.torch ? "TORCH ON" : "TORCH OFF";
  t.classList.toggle("on", !!S.status.torch);

  // movement controls are off while a job runs
  const busy = !!(S.job && S.job.running), idle = S.status.state === "Idle";
  $$(".j, .steps button, .do-home, .do-raise, #btnGoStart, #setupView button").forEach((el) => {
    if (el.id !== "btnDisconnect") el.disabled = busy;
  });
  $("btnTrace").disabled = busy || !(S.prepared && idle);
  $("btnZero").disabled = busy || !idle;
  drawPreview();
}

function onStatus(st) {
  S.status = st;
  const badge = $("stateBadge");
  const words = { Idle: "Ready", Run: "Moving", Jog: "Moving", Home: "Homing", Hold: "Paused", Alarm: "Alarm", Disconnected: "" };
  badge.textContent = words[st.state] ?? st.state;
  badge.className = "badge " + st.state;
  badge.classList.toggle("hidden", !S.connected);
  renderPos();
  renderLamps(st);
  refresh();
}
function renderLamps(st) {
  const inp = st.inputs || {};
  $$("[data-in]").forEach((el) => {
    const k = el.dataset.in;
    const on = k === "torch" ? !!st.torch : !!inp[k];
    el.classList.toggle("on", on);
    if (el.closest(".mini") && k === "estop") el.textContent = on ? "E-STOP!" : "E-stop OK";
  });
}
function onSafety(sf) {
  S.safety = sf || {};
  $("refState").textContent = sf.referenced ? (sf.ref_mode === "homed" ? "Homed ✓" : "Home corner set ✓") : "Unknown";
  $("refState").className = sf.referenced ? "good" : "bad";
  if (sf.limits) {
    const span = (a) => Math.round(Math.abs(sf.limits[a][1] - sf.limits[a][0]));
    $("limState").textContent = `${span("x")} × ${span("y")} mm` + (sf.referenced ? " ✓" : " (home first)");
    $("limState").className = sf.referenced ? "good" : "bad";
  } else { $("limState").textContent = "Not set"; $("limState").className = "bad"; }
  $("safetyHint").textContent = sf.limits
    ? "The machine checks every move against these edges. Jogs stop at the edge; parts that don't fit won't start."
    : "Do this once: it stops the torch ever being driven off the rails or into the slats.";
  const d = sf.draft || {};
  $("wz1").classList.toggle("done", !!sf.referenced);
  $("wz2").classList.toggle("done", d.x !== undefined);
  $("wz3").classList.toggle("done", d.z !== undefined);
  $("wzFar").textContent = d.x !== undefined ? `(${Math.abs(d.x).toFixed(0)} × ${Math.abs(d.y).toFixed(0)} mm)` : "";
  $("wzZ").textContent = d.z !== undefined ? `(${Math.abs(d.z).toFixed(0)} mm down)` : "";
  refresh();
}
function onEvent(kind, d) {
  if (kind === "status") {
    onStatus(d);
    if (d.state === "Disconnected") setConnected(false);
  } else if (kind === "log") log(d.text, d.level);
  else if (kind === "job") { S.job = d; if (!d.running) keepAwake(false); refresh(); }
  else if (kind === "alarm") { S.lastAlarm = d.message; $("alarmTitle").textContent = "Alarm"; $("alarmText").textContent = d.message; refresh(); }
  else if (kind === "safety") onSafety(d);
}

// ------------------------------------------------------------------ connection
function setConnected(on, label = "") {
  S.connected = on;
  $("connectView").classList.toggle("hidden", on);
  $$(".tabs").forEach((t) => t.classList.toggle("hidden", !on));
  $("connPill").textContent = on ? "● Connected" : "● Not connected";
  $("connPill").className = "pill " + (on ? "on" : "off");
  $("stateBadge").classList.toggle("hidden", !on);
  if (on) { showTab(S.tab || "cut"); if (label) toast("Connected to " + label); }
  else ["cut", "move", "setup"].forEach((v) => $(v + "View").classList.add("hidden"));
  $("demoInputs").classList.toggle("hidden", !(on && S.demo));
  refresh();
}
async function connectUSB() {
  if (!WebSerialTransport.supported()) { toast("This browser can't use USB. Use Chrome or Edge on a computer.", true); return; }
  try {
    const t = new WebSerialTransport();
    await t.open(S.cfg.serial.baud || 115200);
    await M.connect(t);
    S.demo = null;
    setConnected(true, "the table");
  } catch (e) {
    if (e && e.name === "NotFoundError") return; // picker closed
    toast("Couldn't open the port: " + e.message + " – is Mach3 or another program using it?", true);
  }
}
async function connectDemo() {
  const t = new SimTransport({ switchOffset: S.cfg.probe.switch_offset_mm, sheetZ: -15 });
  await t.open();
  await M.connect(t);
  S.demo = t;
  setConnected(true, "the demo (nothing real moves)");
}
async function disconnect() {
  if (M.jobRunning() && !confirm("A job is running. Disconnect anyway?")) return;
  await M.disconnect();
  setConnected(false);
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request("screen");
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* fine */ }
}

// ------------------------------------------------------------------ wiring
function bind() {
  $$(".tab").forEach((t) => (t.onclick = () => showTab(t.dataset.tab)));
  $$("#stepper li").forEach((li) => (li.onclick = () => goStep(Number(li.dataset.step))));
  $$("[data-go]").forEach((b) => (b.onclick = () => goStep(Number(b.dataset.go))));
  $("btnConnect").onclick = connectUSB;
  $("btnDemo").onclick = connectDemo;
  $("connPill").onclick = () => (S.connected ? showTab("setup") : connectUSB());
  $("btnDisconnect").onclick = disconnect;
  $("btnStop").onclick = () => { if (M.grbl) cmd("stop"); };
  $("btnUnlock").onclick = () => cmd("unlock");
  $("btnUnlock2").onclick = () => {
    if (S.status.inputs && S.status.inputs.estop) { toast("Release the e-stop first (twist it), then press Unlock.", true); return; }
    cmd("unlock");
  };
  $("btnDemoEstop").onclick = () => { if (S.demo) S.demo.setEstop(!S.demo.estop); };
  $$(".do-home").forEach((b) => (b.onclick = () => cmd("home")));
  $$(".do-raise").forEach((b) => (b.onclick = () => cmd("raise")));
  $("btnGoStart").onclick = () => cmd("goto_zero");
  $$("[data-cmd]").forEach((b) => (b.onclick = () => cmd(b.dataset.cmd)));
  $("btnRef").onclick = () => { if (confirm("Is the torch exactly at the home corner, raised right up?")) cmd("set_reference"); };
  $("btnClearLimits").onclick = () => { if (confirm("Clear the saved edges? Crash protection will be off until you set them again.")) cmd("limits_clear"); };
  $("btnTouchTest").onclick = () => cmd("touchoff_test", { material: S.material, thickness: S.thickness, overrides: overrides() });
  $("btnTorchTest").onclick = () => { if (confirm("Fire the torch for half a second?\nTorch over scrap, earth clamp on, hands clear.")) cmd("torch_test", { confirm: true }); };
  $("btnPushSettings").onclick = () => { if (confirm("Send the controller settings? Only after editing the CHANGE-ME values for your machine.")) cmd("push_settings"); };
  $("consoleForm").onsubmit = (e) => { e.preventDefault(); const l = $("consoleIn").value.trim(); if (l) cmd("console", { line: l }); $("consoleIn").value = ""; };

  // step 1
  $("file").onchange = () => readFile($("file").files[0]);
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  document.addEventListener("drop", (e) => {
    if (!S.connected || (S.job && S.job.running)) return;
    const f = e.dataTransfer.files[0];
    if (f) { showTab("cut"); goStep(1); readFile(f); }
  });
  $("recent").onclick = (e) => {
    const b = e.target.closest("[data-recent]");
    if (b) { const r = recentList()[Number(b.dataset.recent)]; if (r) setFile(r.name, r.text, false); }
  };

  // step 1: drawing or shape
  $$(".srcTab").forEach((b) => (b.onclick = () => showSource(b.dataset.src)));
  $("shapeTiles").onclick = (e) => { const b = e.target.closest("[data-shape]"); if (b) { shapeValues(); S.shape = b.dataset.shape; renderShapeTiles(); useShape(); } };
  $("shapeForm").addEventListener("input", useShape);
  ["cpX", "cpY", "cpGap"].forEach((id) => $(id).addEventListener("input", useShape));

  // step 2
  $("materials").onclick = (e) => {
    const b = e.target.closest("[data-mat]");
    if (b) { S.material = b.dataset.mat; if (!material().rows.some((r) => r.thickness_mm === S.thickness)) S.thickness = material().rows[0].thickness_mm; defaultSpeed(); renderMaterials(); loadJob(); }
  };
  $("thicknesses").onclick = (e) => { const b = e.target.closest("[data-th]"); if (b) { S.thickness = Number(b.dataset.th); defaultSpeed(); renderMaterials(); loadJob(); } };
  ["ovDelay", "ovPierce", "ovCut", "ovKerf", "ovLead", "dryRun"].forEach((id) => $(id).addEventListener("change", () => { renderMaterials(); loadJob(); }));
  $("spDown").onclick = () => setSpeed(S.speed - speedStep(row().feed_mm_min));
  $("spUp").onclick = () => setSpeed(S.speed + speedStep(row().feed_mm_min));
  $("spSlider").addEventListener("input", () => { S.speed = Number($("spSlider").value); $("spVal").textContent = S.speed; });
  $("spSlider").addEventListener("change", () => setSpeed(Number($("spSlider").value)));
  $("spReset").onclick = () => setSpeed(row().feed_mm_min);
  $("lsDown").onclick = () => cmd("feed_override", { step: "-10" });
  $("lsUp").onclick = () => cmd("feed_override", { step: "+10" });
  $("btnSaveSpeed").onclick = () => {
    const v = Math.round((S.speed * S.lastFeedOv) / 100 / 10) * 10;
    saveSpeed(v); S.speed = v; S.lastFeedOv = 100; cmd("feed_override", { step: "reset" });
    $("btnSaveSpeed").classList.add("hidden");
    renderSpeed(); loadJob();
    toast(`Saved ${v} mm/min for ${S.material.toLowerCase()} ${S.thickness} mm ✓`);
  };

  // step 3
  $("btnZero").onclick = () => { if (cmd("zero_xy")) toast("Start point set ✓"); };
  $("btnTrace").onclick = () => cmd("trace_outline");

  // step 4
  $("checklist").addEventListener("change", refresh);
  $("btnStart").onclick = () => {
    try {
      M.command({ cmd: "feed_override", step: "reset" });  // cut at exactly the speed chosen in step 2
      M.startJob(); S.job = M.grbl.jobProgress(); S.lastAlarm = null; keepAwake(true); goStep(5);
      $("btnSaveSpeed").classList.add("hidden");
    }
    catch (e) { toast(e.message, true); }
  };

  // step 5
  $("btnPause").onclick = () => cmd(S.status.state === "Hold" ? "resume" : "hold");
  $("btnAgain").onclick = () => { S.job = null; goStep(3); toast("Move to the next spot and press Start here."); };
  $("btnNewFile").onclick = () => {
    S.job = null; S.prepared = null; S.gcode = null; S.design = null; $("file").value = "";
    $("dropTitle").textContent = "Tap to choose a file"; $("drop").classList.remove("loaded"); goStep(1);
  };

  // keyboard: arrows = X/Y, Page Up/Down = Z. Tap = one step, hold = keep moving until released.
  const KEYS = { ArrowLeft: ["X", -1], ArrowRight: ["X", 1], ArrowUp: ["Y", 1], ArrowDown: ["Y", -1], PageUp: ["Z", 1], PageDown: ["Z", -1] };
  let held = null;
  const stopHeld = () => {
    if (!held) return;
    clearTimeout(held.timer);
    if (held.continuous) cmd("jog_cancel");
    held = null;
  };
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    if (e.key === "Escape") { if (M.grbl) cmd("stop"); return; }
    if (!S.connected) return;
    if (S.job && S.job.running) {
      if (e.key === " ") { e.preventDefault(); cmd(S.status.state === "Hold" ? "resume" : "hold"); }
      return;
    }
    const k = KEYS[e.key];
    if (!k) return;
    e.preventDefault();
    if (e.repeat || held) return;
    const [axis, dir] = k;
    jog(axis, dir);                                   // tap: one step
    held = { timer: setTimeout(() => {                // still held: keep going until key up
      if (!held) return;
      held.continuous = true;
      cmd("jog_cancel");
      const far = axis === "Z" ? S.cfg.travel_mm.z : Math.max(S.cfg.travel_mm.x, S.cfg.travel_mm.y);
      cmd("jog", { axis, dist: dir * far });          // stops at the machine edges if they're set
    }, 400) };
  });
  document.addEventListener("keyup", (e) => { if (KEYS[e.key]) stopHeld(); });
  window.addEventListener("blur", stopHeld);
  window.addEventListener("resize", drawPreview);
  window.addEventListener("beforeunload", (e) => { if (M.jobRunning()) { e.preventDefault(); e.returnValue = ""; } });
}

async function init() {
  const text = async (p) => { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p); return r.text(); };
  const [machine, chart, settings] = await Promise.all([
    text("config/machine.json").then(JSON.parse), text("config/cut_chart.json").then(JSON.parse), text("config/grblhal_settings.txt")]);
  S.cfg = machine; S.chart = chart;
  let store = null;
  try { store = window.localStorage; } catch (e) { /* private mode */ }
  M = new Machine(machine, chart, settings, store);
  M.on(onEvent);
  document.title = machine.name;
  $("machineName").textContent = machine.name;
  try {
    const saved = JSON.parse(localStorage.getItem("plasma.material") || "null");
    if (saved) { S.material = saved.m; S.thickness = saved.t; }
  } catch (e) { /* ignore */ }
  if (!chart.materials.some((m) => m.name === S.material)) S.material = chart.materials[0].name;
  mountJogPads();
  defaultSpeed();
  renderMaterials();
  renderRecent();
  renderShapeTiles();
  bind();
  if (!WebSerialTransport.supported()) {
    $("connectHelp").innerHTML = "This browser can't talk to USB. Open this page in <b>Chrome or Edge on a computer</b>. You can still try the demo.";
    $("btnConnect").disabled = true;
  }
  onSafety(M.safety.state());
  setConnected(false);
  goStep(1);
}
init().catch((e) => toast("Couldn't start: " + e.message, true));

// Plasma table operator screen - browser version.
// Talks to the grblHAL controller directly over USB (Web Serial, Chrome/Edge).
import { Machine } from "./machine.js";
import { WebSerialTransport } from "./grbl.js";
import { SimTransport } from "./sim.js";

const $ = (id) => document.getElementById(id);
const S = { cfg: null, chart: null, step: 10, status: {}, job: null, prepared: null, gcode: null, fileName: "", safety: {} };

// ------------------------------------------------------------------ helpers
let M = null; // the Machine (js/machine.js)

async function cmd(name, extra = {}) {
  try {
    const r = M.command({ cmd: name, ...extra });
    if (r && r.note) toast(r.note);
    return r;
  } catch (e) { toast(e.message, true); }
}
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
  return m ? `${m} min ${r}s` : `${r}s`;
}
function log(text, level = "rx") {
  const el = $("log");
  const div = document.createElement("div");
  div.className = level;
  div.textContent = text;
  el.appendChild(div);
  while (el.childNodes.length > 300) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

// ------------------------------------------------------------------ material
function currentMaterial() {
  return S.chart.materials.find((m) => m.name === $("material").value);
}
function currentRow() {
  const m = currentMaterial();
  return m && m.rows.find((r) => String(r.thickness_mm) === $("thickness").value);
}
function fillThickness() {
  const m = currentMaterial();
  const prev = $("thickness").value;
  $("thickness").innerHTML = m.rows.map((r) => `<option value="${r.thickness_mm}">${r.thickness_mm} mm</option>`).join("");
  if (m.rows.some((r) => String(r.thickness_mm) === prev)) $("thickness").value = prev;
  showCut();
}
function overrides() {
  const v = (id) => $(id).value.trim();
  return { feed_mm_min: v("ovFeed"), pierce_delay_s: v("ovDelay"), pierce_height_mm: v("ovPierce"), cut_height_mm: v("ovCut") };
}
function showCut() {
  const r = currentRow();
  if (!r) return;
  const ph = r.pierce_height_mm ?? S.chart.pierce_height_mm;
  const ch = r.cut_height_mm ?? S.chart.cut_height_mm;
  $("ovFeed").placeholder = r.feed_mm_min;
  $("ovDelay").placeholder = r.pierce_delay_s;
  $("ovPierce").placeholder = ph;
  $("ovCut").placeholder = ch;
  const o = overrides();
  $("cutInfo").innerHTML = `
    <div class="amps"><span>Set plasma to</span><b>${r.amps} A</b></div>
    <div><span>Air</span><b>${S.chart.air_bar} bar</b></div>
    <div><span>Cut speed</span><b>${o.feed_mm_min || r.feed_mm_min}</b> <span>mm/min</span></div>
    <div><span>Pierce delay</span><b>${o.pierce_delay_s || r.pierce_delay_s} s</b></div>
    <div><span>Pierce height</span><b>${o.pierce_height_mm || ph} mm</b></div>
    <div><span>Cut height</span><b>${o.cut_height_mm || ch} mm</b></div>`;
  try { localStorage.setItem("plasma.material", JSON.stringify({ m: $("material").value, t: $("thickness").value })); } catch (e) {}
}

// ------------------------------------------------------------------ job
function showPrepared(r) {
    S.prepared = r;
    const st = r.stats;
    $("jobStats").innerHTML = `
      <span>Size <b>${st.width_mm} × ${st.height_mm} mm</b></span>
      <span>Pierces <b>${st.pierces}</b></span>
      <span>Cut length <b>${(st.cut_length_mm / 1000).toFixed(2)} m</b></span>
      <span>About <b>${fmtTime(st.estimated_seconds)}</b></span>
      ${r.dry_run ? '<span><b>DRY RUN</b> – torch will not fire</span>' : ""}`;
    $("warnings").innerHTML = r.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("");
}
async function loadJob() {
  if (!S.gcode && !S.prepared) return;
  try {
    showPrepared(M.loadJob({
      gcode: S.gcode, reuse: !S.gcode, name: S.fileName, material: $("material").value,
      thickness: parseFloat($("thickness").value), dry_run: $("dryRun").checked, overrides: overrides(),
    }));
  } catch (e) {
    S.prepared = null;
    $("jobStats").textContent = "";
    $("warnings").innerHTML = `<li>${escapeHtml(e.message)}</li>`;
  }
  fitCheck();
  drawPreview();
  updateButtons();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ------------------------------------------------------------------ boundaries
function wcoNow() {
  const st = S.status;
  return st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : [0, 0, 0];
}
function boundsActive() { return !!(S.safety.limits && S.safety.referenced); }
// where things are drawn: relative to the home corner when known, else raw machine position
function toView(mx, my) {
  if (S.safety.referenced) return [mx - S.safety.ref[0], my - S.safety.ref[1]];
  return [mx, my];
}
function viewArea() {
  if (boundsActive()) return { x: S.safety.limits.x, y: S.safety.limits.y, label: "boundaries" };
  const t = S.cfg ? S.cfg.travel_mm : { x: 1300, y: 800 };
  return { x: [0, t.x], y: [0, t.y], label: "table (boundaries not active)" };
}
function fitCheck() {
  const el = $("fit");
  if (!S.prepared) { el.textContent = ""; return; }
  if (!S.safety.limits) { el.className = "fit unknown"; el.textContent = "Boundaries not set up – the machine can't check this job fits."; return; }
  if (!S.safety.referenced) { el.className = "fit unknown"; el.textContent = "Home the machine to check this job fits."; return; }
  const b = S.prepared.stats.bounds, w = wcoNow(), ref = S.safety.ref, L = S.safety.limits;
  const x0 = b[0] + w[0] - ref[0], x1 = b[2] + w[0] - ref[0], y0 = b[1] + w[1] - ref[1], y1 = b[3] + w[1] - ref[1];
  const over = [];
  if (x0 < L.x[0] - 0.05) over.push(`${Math.ceil(L.x[0] - x0)} mm past X−`);
  if (x1 > L.x[1] + 0.05) over.push(`${Math.ceil(x1 - L.x[1])} mm past X+`);
  if (y0 < L.y[0] - 0.05) over.push(`${Math.ceil(L.y[0] - y0)} mm past Y−`);
  if (y1 > L.y[1] + 0.05) over.push(`${Math.ceil(y1 - L.y[1])} mm past Y+`);
  el.className = "fit " + (over.length ? "bad" : "good");
  if (over.length) $("btnStart").disabled = true;
  el.textContent = over.length ? `✗ Won't fit: ${over.join(", ")}. Move the start point.` : "✓ Fits inside the boundaries";
}
function onSafety(sf) {
  S.safety = sf || {};
  const ref = $("refState"), lim = $("limState");
  ref.textContent = sf.referenced ? (sf.ref_mode === "homed" ? "Homed" : "Home corner set by hand") : "Unknown";
  ref.className = sf.referenced ? "good" : "bad";
  if (sf.limits) {
    const span = (a) => Math.round(Math.abs(sf.limits[a][1] - sf.limits[a][0]));
    lim.textContent = `${span("x")} × ${span("y")} mm, Z ${span("z")} mm` + (sf.referenced ? " · active" : " · waiting for home");
    lim.className = sf.referenced ? "good" : "bad";
  } else { lim.textContent = "Not set"; lim.className = "bad"; }
  $("safetyHint").textContent = sf.limits
    ? "Every jog, job and touch-off is checked against these boundaries before it's sent. Jogs stop at the edge; jobs that don't fit won't start."
    : "Set up boundaries once so the machine can never be driven off the end of its rails or into the slats.";
  $("refBar").classList.toggle("hidden", !(sf.limits && !sf.referenced));
  const d = sf.draft || {};
  $("wz1").classList.toggle("done", !!sf.referenced);
  $("wz2").classList.toggle("done", d.x !== undefined);
  $("wz3").classList.toggle("done", d.z !== undefined);
  $("wzFar").textContent = d.x !== undefined ? `(${Math.abs(d.x).toFixed(0)} × ${Math.abs(d.y).toFixed(0)} mm)` : "";
  $("wzZ").textContent = d.z !== undefined ? `(${Math.abs(d.z).toFixed(0)} mm down)` : "";
  fitCheck();
  drawPreview();
}

// ------------------------------------------------------------------ preview
function drawPreview() {
  const cv = $("preview"), ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 800;
  const A = viewArea();
  const ax = A.x[1] - A.x[0], ay = A.y[1] - A.y[0];
  const h = Math.max(160, Math.round(w * (ay / ax)));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  cv.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = 14;
  const sc = Math.min((w - 2 * pad) / ax, (h - 2 * pad) / ay);
  const X = (x) => pad + (x - A.x[0]) * sc, Y = (y) => h - pad - (y - A.y[0]) * sc;

  ctx.strokeStyle = boundsActive() ? "#16a34a" : "#3a424c"; ctx.lineWidth = boundsActive() ? 2 : 1; ctx.setLineDash([]);
  ctx.strokeRect(X(A.x[0]), Y(A.y[1]), ax * sc, ay * sc);
  ctx.fillStyle = "#6b7280"; ctx.font = "11px system-ui";
  ctx.fillText(`${A.label} ${Math.round(ax)} × ${Math.round(ay)} mm`, X(A.x[0]) + 4, Y(A.y[1]) + 14);

  const w0 = wcoNow();
  const [ox, oy] = toView(w0[0], w0[1]);
  if (S.prepared) {
    const pv = S.prepared.preview;
    const path = (p) => { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + ox), Y(y + oy)) : ctx.moveTo(X(x + ox), Y(y + oy)))); ctx.stroke(); };
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 1;
    pv.rapids.forEach(path);
    ctx.setLineDash([]); ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2;
    for (const p of pv.cuts) {
      path(p);
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(X(p[0][0] + ox), Y(p[0][1] + oy), 3, 0, 7); ctx.fill();
    }
  }
  ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(X(ox) - 8, Y(oy)); ctx.lineTo(X(ox) + 8, Y(oy)); ctx.moveTo(X(ox), Y(oy) - 8); ctx.lineTo(X(ox), Y(oy) + 8); ctx.stroke();
  if (S.status.MPos) {
    const [tx, ty] = toView(S.status.MPos[0], S.status.MPos[1]);
    ctx.fillStyle = S.status.torch ? "#f97316" : "#e5e7eb";
    ctx.beginPath(); ctx.arc(X(tx), Y(ty), 5, 0, 7); ctx.fill();
  }
}

// ------------------------------------------------------------------ status
function onStatus(st) {
  S.status = st;
  const state = st.state || "Unknown";
  const b = $("stateBadge");
  b.textContent = state;
  b.className = "badge " + state;
  $("conn").classList.toggle("on", state !== "Disconnected" && state !== "Unknown");
  const w = st.WPos || [0, 0, 0];
  $("posX").textContent = w[0].toFixed(1);
  $("posY").textContent = w[1].toFixed(1);
  $("posZ").textContent = w[2].toFixed(1);
  $("torchLamp").textContent = st.torch ? "TORCH ON" : "TORCH OFF";
  $("torchLamp").classList.toggle("on", !!st.torch);
  $("probeLamp").classList.toggle("on", (st.pins || "").includes("P"));
  if (state === "Alarm") $("alarmBar").classList.remove("hidden");
  else if (state === "Idle") $("alarmBar").classList.add("hidden");
  updateButtons();
  fitCheck();
  drawPreview();
}
function onJob(j) {
  S.job = j;
  if (!j) return;
  const pct = j.total ? Math.round((100 * j.acked) / j.total) : 0;
  $("progBar").style.width = pct + "%";
  const what = j.running ? `Cutting… ${pct}%` : j.result === "done" ? "Finished" : j.result ? `Stopped (${j.result})` : "";
  $("progText").textContent = `${what} · ${fmtTime(j.elapsed || 0)}`;
  updateButtons();
}
function updateButtons() {
  const state = S.status.state || "";
  const running = !!(S.job && S.job.running) || state === "Run" || state === "Hold";
  $("btnStart").disabled = !(S.prepared && state === "Idle" && !(S.job && S.job.running))
    || !!(S.safety.limits && !S.safety.referenced);
  $("btnPause").disabled = !running;
  $("btnPause").textContent = state === "Hold" ? "Resume" : "Pause";
  document.querySelectorAll("#moveCard button, #safetyCard button, [data-cmd=touchoff_test], #btnTorchTest").forEach((el) => {
    el.disabled = running;
  });
  $("btnTrace").disabled = !(S.prepared && state === "Idle") || running;
}

// ------------------------------------------------------------------ events
function handleEvent(kind, d) {
  if (kind === "status") {
    onStatus(d);
    if (d.state === "Disconnected") { $("connectPanel").classList.remove("hidden"); $("btnConnect").textContent = "Connect"; }
  }
  else if (kind === "log") log(d.text, d.level);
  else if (kind === "job") { onJob(d); if (!d.running) keepAwake(false); }
  else if (kind === "alarm") {
    $("alarmTitle").textContent = `Alarm ${d.code ?? ""}`;
    $("alarmText").textContent = d.message;
    $("alarmBar").classList.remove("hidden");
  }
  else if (kind === "safety") onSafety(d);
}

// ------------------------------------------------------------------ connection
function showConnected(on, label = "") {
  $("connectPanel").classList.toggle("hidden", on);
  $("btnConnect").textContent = on ? "Disconnect" : "Connect";
  if (!on) onStatus({ state: "Disconnected", MPos: [0, 0, 0], WPos: [0, 0, 0] });
  if (on && label) toast(`Connected to ${label}`);
}
async function connectUSB() {
  if (!WebSerialTransport.supported()) {
    toast("This browser can't use USB. Open this page in Chrome or Edge on a computer.", true);
    return;
  }
  try {
    const t = new WebSerialTransport();
    await t.open(S.cfg.serial.baud || 115200);
    await M.connect(t);
    showConnected(true, t.label);
  } catch (e) {
    if (e && e.name === "NotFoundError") return; // user closed the port picker
    toast("Couldn't open the port: " + e.message + (/(open|busy|access)/i.test(e.message) ? " – is another program (Mach3, a sender) using it?" : ""), true);
  }
}
async function connectDemo() {
  // pretend sheet sits 15 mm below the home height
  const t = new SimTransport({ switchOffset: S.cfg.probe.switch_offset_mm, sheetZ: -15 });
  await t.open();
  await M.connect(t);
  showConnected(true, "demo machine (nothing real will move)");
}
async function disconnect() {
  if (M.jobRunning() && !confirm("A job is running. Disconnecting stops sending it. Stop the machine first?")) return;
  await M.disconnect();
  showConnected(false);
}

// keep the laptop screen on while a job runs (a sleeping laptop stops sending the job)
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request("screen");
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* not supported - fine */ }
}

function bind() {
  document.querySelectorAll("[data-cmd]").forEach((el) => {
    el.addEventListener("click", () => {
      const c = el.dataset.cmd;
      if (c === "touchoff_test") return cmd(c, { material: $("material").value, thickness: parseFloat($("thickness").value), overrides: overrides() });
      if (c === "limits_clear" && !confirm("Clear the saved boundaries? The machine will no longer stop jogs and jobs at the edges.")) return;
      if (c === "set_reference" && !confirm("Is the torch exactly at the marked home corner, fully raised?")) return;
      cmd(c);
    });
  });
  document.querySelectorAll(".j[data-axis]").forEach((el) => {
    el.addEventListener("click", () => {
      const axis = el.dataset.axis;
      const step = axis === "Z" ? Math.min(S.step, 10) : S.step;
      cmd("jog", { axis, dist: step * parseFloat(el.dataset.dir) });
    });
  });
  $("btnStop").onclick = () => cmd("stop");
  $("btnPause").onclick = () => cmd((S.status.state || "") === "Hold" ? "resume" : "hold");
  $("btnStart").onclick = async () => {
    const r = currentRow();
    const dry = S.prepared && S.prepared.dry_run;
    const msg = dry
      ? "Dry run: the machine will trace the job with the torch OFF.\n\nStart?"
      : `Before cutting:\n• Plasma ON, set to ${r.amps} A\n• Air on (${S.chart.air_bar} bar)\n• Earth clamp on the sheet\n• Torch raised above the sheet\n• Hand on the e-stop\n\nStart cutting?`;
    if (!confirm(msg)) return;
    try { M.startJob(); toast("Job started"); keepAwake(true); } catch (e) { toast(e.message, true); }
  };
  $("btnTorchTest").onclick = () => {
    if (confirm(`Fire the torch for ${S.cfg.torch.test_seconds} s?\n\nTorch over scrap, earth clamp on, hands clear.`)) cmd("torch_test", { confirm: true });
  };
  $("btnPushSettings").onclick = async () => {
    if (!confirm("Send config/grblhal_settings.txt to the controller?\n\nOnly do this after you've edited the CHANGE-ME values for your machine.")) return;
    const r = await cmd("push_settings");
    if (r) toast(`Sent ${r.sent} settings`);
  };
  $("consoleForm").onsubmit = (e) => {
    e.preventDefault();
    const line = $("consoleIn").value.trim();
    if (line) cmd("console", { line });
    $("consoleIn").value = "";
  };
  $("material").onchange = () => { fillThickness(); loadJob(); };
  $("thickness").onchange = () => { showCut(); loadJob(); };
  $("dryRun").onchange = loadJob;
  ["ovFeed", "ovDelay", "ovPierce", "ovCut"].forEach((id) => $(id).addEventListener("change", () => { showCut(); loadJob(); }));
  $("file").onchange = () => {
    const f = $("file").files[0];
    if (!f) return;
    S.fileName = f.name;
    $("fileName").textContent = f.name;
    const rd = new FileReader();
    rd.onload = () => { S.gcode = rd.result; loadJob(); };
    rd.readAsText(f);
  };
  window.addEventListener("resize", drawPreview);
  $("btnWizard").onclick = () => $("wizard").classList.toggle("hidden");
}

async function loadText(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.text();
}

async function init() {
  const [machine, chart, settings] = await Promise.all([
    loadText("config/machine.json").then(JSON.parse),
    loadText("config/cut_chart.json").then(JSON.parse),
    loadText("config/grblhal_settings.txt"),
  ]);
  S.cfg = machine; S.chart = chart;
  let store = null;
  try { store = window.localStorage; } catch (e) { /* private mode */ }
  M = new Machine(machine, chart, settings, store);
  M.on(handleEvent);

  document.title = machine.name;
  $("machineName").textContent = machine.name;
  $("steps").innerHTML = machine.jog.steps_mm.map((s) => `<button data-step="${s}">${s} mm</button>`).join("");
  document.querySelectorAll("#steps button").forEach((b) => {
    b.onclick = () => { S.step = parseFloat(b.dataset.step); document.querySelectorAll("#steps button").forEach((x) => x.classList.toggle("sel", x === b)); };
    if (parseFloat(b.dataset.step) === S.step) b.classList.add("sel");
  });
  $("material").innerHTML = chart.materials.map((m) => `<option>${escapeHtml(m.name)}</option>`).join("");
  try {
    const saved = JSON.parse(localStorage.getItem("plasma.material") || "null");
    if (saved) { $("material").value = saved.m; fillThickness(); $("thickness").value = saved.t; }
  } catch (e) { /* ignore */ }
  fillThickness();
  bind();
  $("btnConnect").onclick = () => (M.grbl ? disconnect() : connectUSB());
  $("btnConnect2").onclick = connectUSB;
  $("btnDemo").onclick = connectDemo;
  $("btnDisconnect").onclick = disconnect;
  if (!WebSerialTransport.supported()) {
    $("connectHelp").innerHTML = "This browser can't talk to USB. Open this page in <b>Chrome or Edge on a computer</b>. You can still try the demo machine.";
    $("btnConnect2").disabled = true;
  }
  window.addEventListener("beforeunload", (e) => {
    if (M.jobRunning()) { e.preventDefault(); e.returnValue = ""; }
  });
  onSafety(M.safety.state());
  showConnected(false);
  fitCheck();
  drawPreview();
}
init().catch((e) => toast("Couldn't start: " + e.message, true));

// Plasma table operator screen (browser version).
// Guided flow: File -> Material -> Position -> Check -> Cut.
// Machine logic lives in machine.js; this file is only the screen.
import { Machine } from "./machine.js";
import { WebSerialTransport, WiFiTransport } from "./grbl.js";
import { SimTransport } from "./sim.js";
import { parseDXF } from "./dxf.js";
import { parseSVG } from "./svg.js";
import { designToGcode } from "./cam.js";
import { SHAPES, copies, SHAPE_GROUPS, shapeThumb } from "./shapes.js";
import { Sketch, shapeDef } from "./sketch.js";
import { variantsFor, variantKey } from "./variants.js";
import { evalExpr } from "./expr.js";
import { checkDesign, machineLimits } from "./check.js";
import * as Acc from "./account.js";
import { initAccountUi, openAccount, openClaim, openGate, closeAccountUi, acctOverlayOpen, saveCurrent } from "./account-ui.js";

const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const S = {
  cfg: null, chart: null, jogStep: 10, status: { state: "Disconnected" }, job: null, prepared: null,
  gcode: null, design: null, fileName: "", safety: {}, src: "file", showMachine: true, cur: 1, material: null, thickness: null, connected: false, designOnly: false, currentPart: null,
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
function clock(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + ":" + String(r).padStart(2, "0");
}
// ---- live progress while cutting: time-based estimate, re-synced every time the torch fires or stops
function trackProgress(st) {
  const plan = M && M.plan, j = S.job;
  if (!plan || !j) return;
  const now = Date.now();
  if (!S.run || S.run.plan !== plan) S.run = { plan, t: 0, last: now, start: now, torch: false, ons: 0, offs: 0 };
  const R = S.run, dt = Math.min(1, (now - R.last) / 1000);
  R.last = now;
  if (!j.running) return;
  const state = st.state || "";
  if (!/^(Hold|Alarm|Door)/.test(state)) R.t += dt * (st.torch ? (st.feedOv || 100) / 100 : 1);
  const torch = !!st.torch;
  if (torch && !R.torch) { R.ons++; const i = plan.torchOn[R.ons - 1]; if (i != null) R.t = plan.cum[i]; }
  if (!torch && R.torch) { R.offs++; const i = plan.torchOff[R.offs - 1]; if (i != null) R.t = plan.cum[i]; }
  R.torch = torch;
  const acked = j.acked > 0 ? plan.cum[Math.min(j.acked, plan.cum.length) - 1] : 0;
  R.t = Math.min(R.t, acked, plan.total * 0.995);
  R.shown = Math.max(R.shown || 0, R.t);          // never count backwards on screen
}
function liveProgress() {
  const R = S.run, plan = R && R.plan;
  if (!plan || !plan.total) {
    const j = S.job || {};
    return { pct: j.total ? (100 * j.acked) / j.total : 0, left: 0, elapsed: j.elapsed || 0, cut: 0 };
  }
  const ov = (S.status.feedOv || 100) / 100;
  const t = R.shown || 0;
  return { pct: Math.min(100, (100 * t) / plan.total), left: (plan.total - t) / (ov || 1),
    elapsed: (Date.now() - R.start) / 1000, cut: R.ons };
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

// ------------------------------------------------------------------ accounts / machine gate
function machineAllowed() {
  // The on-screen demo controller is free so people can look around and design.
  if (S.demo) return true;
  return Acc.hasLinkedMachine();
}
function requireMachine(why) {
  if (machineAllowed()) return true;
  openGate(why || "Link your machine to run jobs");
  return false;
}
function applyAccountMode(mode) {
  if (!sketch) {
    document.body.classList.toggle("beginner", mode === "beginner");
    return;
  }
  if (mode === "pro" || mode === "beginner") {
    sketch.setPro(mode === "pro");
    $("skPro").checked = mode === "pro";
    document.body.classList.toggle("beginner", mode === "beginner");
  } else {
    document.body.classList.remove("beginner");
  }
  renderProTools(); renderShapeForm(); renderQuickBar();
}
function refreshGate() {
  const needLink = !Acc.hasLinkedMachine();
  $("btnConnect").classList.toggle("locked", needLink);
  $("connectLock").classList.toggle("hidden", !needLink);
  const runLocked = needLink && !S.demo;
  $("btnStart").classList.toggle("locked", runLocked);
  $("startLock").classList.toggle("hidden", !runLocked);
  const send = $("btnConsoleSend");
  if (send) send.classList.toggle("locked", runLocked);
  document.body.classList.toggle("run-locked", runLocked);
}
function enterDesignOnly() {
  S.designOnly = true;
  S.demo = null;
  $("connectView").classList.add("hidden");
  $$(".tabs").forEach((t) => t.classList.remove("hidden"));
  $("cutView").classList.remove("hidden");
  $("moveView").classList.add("hidden");
  $("setupView").classList.add("hidden");
  showTab("cut");
  goStep(1);
  refreshGate();
  toast("Design and save freely. Link a machine when you want to cut.");
}
function exportGcode() {
  if (!Acc.allowExportWithoutMachine() && !Acc.hasLinkedMachine()) {
    openGate("Link your machine to download G-code");
    return;
  }
  if (!S.prepared) loadJob();
  let text = "";
  if (S.prepared && Array.isArray(S.prepared.lines) && S.prepared.lines.length) text = S.prepared.lines.join("\n") + "\n";
  else if (S.prepared && S.prepared.source) text = S.prepared.source;
  else if (S.gcode) text = S.gcode;
  if (!text) { toast("Nothing to export yet. Load or design a part first.", true); return; }
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ((S.fileName || "part").replace(/\.[^.]+$/, "") || "part") + ".nc";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ------------------------------------------------------------------ tabs & steps
function showTab(name) {
  if (!S.connected && S.designOnly && name !== "cut") {
    openGate("Link your machine to run jobs");
    name = "cut";
  }
  $$(".tab").forEach((t) => t.classList.toggle("sel", t.dataset.tab === name));
  ["cut", "move", "setup"].forEach((v) => $(v + "View").classList.toggle("hidden", v !== name || (!S.connected && !S.designOnly)));
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
  });
  syncSteps();
}
function syncSteps() {
  $$(".steps button").forEach((b) => b.classList.toggle("sel", Number(b.dataset.step) === S.jogStep));
}
function jog(axis, dir) {
  if (!machineAllowed()) { requireMachine("Link your machine to run jobs"); return; }
  const step = axis === "Z" ? Math.min(S.jogStep, 10) : S.jogStep;
  cmd("jog", { axis, dist: step * dir });
}
// ---- press-and-hold jogging
// press: one step straight away. Still held after a moment: glide towards the edge (absolute target,
// queued behind the step, so there's no stop-start). Change direction: cancel, wait for it to stop, go again.
// Let go: cancel (the controller decelerates and stops).
const J = { held: new Map(), timer: null, gliding: false, dir: null, seq: 0, slow: false };
function jogVector() {
  const v = [0, 0, 0];
  for (const [axis, dir] of J.held.values()) v["XYZ".indexOf(axis)] = dir;
  return v;
}
async function waitStopped(ms = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && ["Jog", "Run"].includes(S.status.state)) await new Promise((r) => setTimeout(r, 25));
}
async function glide() {
  const my = ++J.seq, v = jogVector();
  if (!v.some(Boolean)) return;
  if (J.gliding) { cmd("jog_cancel"); await waitStopped(); if (my !== J.seq || !J.held.size) return; }
  J.gliding = true; J.dir = v.join();
  try { M.command({ cmd: "jog_dir", dir: v, slow: J.slow }); }
  catch (e) { toast(e.message, true); }
}
function jogPress(id, axis, dir) {
  if (!M.grbl) return;
  const first = J.held.size === 0;
  J.held.set(id, [axis, dir]);
  if (first) {
    jog(axis, dir);                                  // tap = one step
    clearTimeout(J.timer);
    J.timer = setTimeout(() => { if (J.held.size) glide(); }, 220);
  } else if (J.gliding) glide();                     // second key: go diagonal
}
function jogRelease(id) {
  if (!J.held.delete(id)) return;
  if (J.held.size) { if (J.gliding && jogVector().join() !== J.dir) glide(); return; }
  clearTimeout(J.timer); J.seq++;
  if (J.gliding) { J.gliding = false; J.dir = null; cmd("jog_cancel"); }
}
function jogReleaseAll() { for (const id of [...J.held.keys()]) jogRelease(id); }
function renderPos() {
  const w = S.status.WPos || [0, 0, 0];
  const html = `<div><span>X</span><b>${w[0].toFixed(1)}</b></div><div><span>Y</span><b>${w[1].toFixed(1)}</b></div><div><span>Z</span><b>${w[2].toFixed(1)}</b></div>`;
  $$(".small-pos").forEach((el) => (el.innerHTML = html));
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

// ------------------------------------------------------------------ shape maker (drag-and-drop editor)
let sketch = null, shapeTimer = null, editBefore = null;
const QUICK_PARTS = ["rect", "plate", "disc", "ring", "flange", "triangle", "gusset", "slot"];
function renderShapeTiles() {
  const tile = (sh) => `<button data-shape="${esc(sh.id)}" title="${esc(sh.tip || "Add " + sh.name)}"><i>${shapeThumb(sh, 40, 28) || esc(sh.icon)}</i>${esc(sh.name)}</button>`;
  $("shapeTiles").innerHTML = QUICK_PARTS.map((id) => SHAPES.find((s) => s.id === id)).filter(Boolean).map(tile).join("")
    + `<button data-lib="1" class="libmore" title="Every shape, by category"><i>⋯</i>More shapes (${SHAPES.filter((s) => !s.hole).length})</button>`;
  $("holeTiles").innerHTML = SHAPES.filter((sh) => sh.hole).map(tile).join("");
  $("skSnap").value = String(sketch.opts.snap);
  $("skGuides").checked = !!sketch.opts.guides;
  $("skPro").checked = !!sketch.opts.pro;
  renderProTools();
}
const ALIGN = [["left", "⇤ Left"], ["centre", "↔ Centre"], ["right", "⇥ Right"], ["both", "◎ Dead centre"],
  ["bottom", "⤓ Bottom"], ["middle", "↕ Middle"], ["top", "⤒ Top"]];
function renderShapeForm() {
  const list = sketch.picked(), it = sketch.selected();
  $("skUndo").disabled = !sketch.past.length; $("skRedo").disabled = !sketch.future.length;
  $("skClear").disabled = !sketch.items.length; $("skAll").disabled = !sketch.items.length;
  if (!list.length) {
    $("shapeForm").innerHTML = sketch.items.length
      ? `<p class="muted">Click a shape on the drawing to change it. Shift-click or drag a box round several to move, copy, join or line them up.</p>` : "";
    return;
  }
  if (list.length > 1) {
    const pro = sketch.opts.pro ? `
      <h4>Pro</h4>
      <div class="skbtns">
        <button data-pro="subtract">✂ Subtract</button>
        <button data-pro="distx">↔ Space across</button>
        <button data-pro="disty">↕ Space up</button>
        <button data-pro="linarray">Linear array</button>
        <button data-pro="polar">Circular array</button>
        <button data-pro="lock">${list.every((i) => i.lock) ? "Unlock" : "🔒 Lock"}</button>
        <button data-sk="flipV">⇅ Flip up/down</button>
      </div>` : "";
    $("shapeForm").innerHTML = `
      <div class="selhead"><b>${list.length} shapes picked</b></div>
      <p class="tip">Drag any of them to move them all. <b>Join</b> makes touching shapes one part (with their holes).</p>
      <div class="skbtns">
        <button data-sk="join" class="join" title="Ctrl+J">⬟ Join into one part</button>
        <button data-sk="duplicate" title="Ctrl+D">⧉ Copy</button>
        <button data-sk="rotateBy" data-arg="90" title="R">⟳ Turn 90°</button>
        <button data-sk="mirror" title="M">⇋ Mirror</button>
        <button data-sk="remove" class="danger" title="Delete">🗑 Delete</button>
      </div>
      <h4>Line up with the biggest one</h4>
      <div class="alignrow">${ALIGN.map(([k, t]) => `<button data-sk="align" data-arg="${k}">${t}</button>`).join("")}</div>${pro}`;
    return;
  }
  const sh = shapeDef(it.type), b = sketch.boxOf(it);
  const moved = Object.keys(it.holes || {}).length;
  const curKey = sketch.currentVariantKey();
  const vars = variantsFor(it.type).map((v) => {
    const d = shapeDef(v.id); const label = v.label || (d ? d.name : v.id);
    return `<button type="button" data-var="${esc(variantKey(v))}" class="${variantKey(v) === curKey ? "sel" : ""}">${esc(label)}</button>`;
  }).join("");
  const varBox = vars ? `<div class="varbox"><h4>Versions of this shape</h4><div class="varrow">${vars}</div><p class="muted small">Keeps this size and place. Then edit holes, radii and so on below. Tap a blue size on the drawing to type an exact measurement.</p></div>` : `<p class="muted small">Tap a blue size on the drawing to type an exact measurement.</p>`;
  const proOne = sketch.opts.pro ? `
      <div class="skbtns">
        <button data-pro="linarray">Linear array</button>
        <button data-pro="polar">Circular array</button>
        <button data-pro="offset">Offset</button>
        <button data-pro="lock">${it.lock ? "Unlock" : "🔒 Lock"}</button>
        <button data-sk="flipV">⇅ Flip up/down</button>
      </div>` : "";
  $("shapeForm").innerHTML = `
    <div class="selhead"><b>${sh.icon} ${esc(sh.name)}</b>${it.lock ? " 🔒" : ""}${sketch.sel.hole != null ? ` <span class="muted">· hole picked – drag it or use the arrow keys</span>` : ""}</div>
    ${varBox}
    ${sh.tip ? `<p class="tip">${esc(sh.tip)}</p>` : ""}
    <div class="grid2">${sh.params.map(([k, label]) =>
      `<label>${esc(label)}<input type="number" step="any" min="0" inputmode="decimal" data-p="${k}" value="${esc(String(it.p[k]))}"></label>`).join("")}
      <label>Position X (left edge)<input type="number" step="any" inputmode="decimal" data-pos="x" value="${Math.round(b[0] * 10) / 10}"></label>
      <label>Position Y (bottom edge)<input type="number" step="any" inputmode="decimal" data-pos="y" value="${Math.round(b[1] * 10) / 10}"></label>
      <label>Angle °<input type="number" step="any" inputmode="decimal" data-angle="1" value="${Math.round((it.rot || 0) * 10) / 10}"></label>
      <label>Size<input type="text" disabled value="${Math.round((b[2] - b[0]) * 10) / 10} × ${Math.round((b[3] - b[1]) * 10) / 10} mm"></label>
    </div>
    <div class="skbtns">
      <button data-sk="rotateBy" data-arg="90" title="R">⟳ Turn 90°</button>
      <button data-sk="mirror" title="M">⇋ Mirror</button>
      <button data-sk="duplicate" title="Ctrl+D">⧉ Copy</button>
      ${moved ? `<button data-sk="resetHoles">↺ Holes back</button>` : ""}
      <button data-sk="remove" class="danger" title="Delete">🗑 Delete</button>
    </div>${proOne}`;
}
// keep the boxes in step while dragging, without rebuilding them


let libCat = "all";
function openLibrary() {
  $("shapeLib").classList.remove("hidden");
  $("libSearch").value = "";
  renderLibrary();
  setTimeout(() => { if (matchMedia("(pointer: fine)").matches) $("libSearch").focus(); }, 30);
}
function closeLibrary() { $("shapeLib").classList.add("hidden"); }
function renderLibrary() {
  const q = $("libSearch").value.trim().toLowerCase();
  const cats = [{ id: "all", name: "All" }, ...SHAPE_GROUPS];
  $("libCats").innerHTML = cats.map((c) => `<button type="button" data-cat="${esc(c.id)}" class="${c.id === libCat ? "on" : ""}">${esc(c.name)}</button>`).join("");
  let ids;
  if (libCat === "all") { const seen = new Set(); ids = SHAPE_GROUPS.flatMap((g) => g.ids).filter((id) => !seen.has(id) && seen.add(id)); }
  else ids = (SHAPE_GROUPS.find((g) => g.id === libCat) || { ids: [] }).ids;
  const list = ids.map((id) => SHAPES.find((s) => s.id === id)).filter(Boolean)
    .filter((s) => !q || (s.name + " " + (s.tip || "") + " " + s.id).toLowerCase().includes(q));
  $("libGrid").innerHTML = list.length ? list.map((s) => `<button type="button" data-shape="${esc(s.id)}" title="${esc(s.tip || s.name)}">${shapeThumb(s, 64, 44)}<span class="libname">${esc(s.name)}</span></button>`).join("")
    : `<p class="muted">No shapes match “${esc(q)}”.</p>`;
}

function openVersions() {
  const it = sketch.selected();
  if (!it) { toast("Tap a shape first, then Versions."); return; }
  const vs = variantsFor(it.type);
  if (!vs.length) { toast("This shape has no other versions."); return; }
  const cur = sketch.currentVariantKey();
  $("verTitle").textContent = "Versions of " + shapeDef(it.type).name.toLowerCase();
  $("verBody").innerHTML = vs.map((v) => { const d = shapeDef(v.id); return `<button type="button" data-var="${esc(variantKey(v))}" class="${variantKey(v) === cur ? "sel" : ""}">${d ? shapeThumb(d, 40, 28) : ""}<span>${esc(v.label || (d ? d.name : v.id))}</span></button>`; }).join("");
  $("verPop").classList.remove("hidden");
}
function closeVersions() { $("verPop").classList.add("hidden"); }

function sizeDimForSelection() {
  const it = sketch.selected(); if (!it) return null;
  sketch.draw();
  return sketch.dimHits.find((h) => h.kind === "w") || sketch.dimHits.find((h) => h.kind === "d") || null;
}

function renderQuickBar() {
  const qb = $("quickBar"); if (!qb || !sketch) return;
  const on = S.src === "shape" && S.cur === 1;
  qb.classList.toggle("hidden", !on);
  const grid = qb.closest(".cutgrid"); if (grid) grid.classList.toggle("with-qb", on);
  if (!on) return;
  const one = sketch.selected(), any = sketch.picked().length > 0;
  const locked = sketch.picked().some((i) => i.lock);
  const hasVer = !!(one && variantsFor(one.type).length);
  const B = (id, icon, label, opts = {}) => `<button type="button" data-qb="${id}" class="${opts.cls || ""}" ${opts.dis ? "disabled" : ""} title="${esc(opts.title || label)}" aria-label="${esc(opts.title || label)}"><i>${icon}</i>${esc(label)}</button>`;
  qb.innerHTML = [
    B("rect", "▭", "Rect"), B("disc", "◯", "Circle"), B("triangle", "△", "Triangle"), B("lib", "⋯", "More", { title: "Shape library" }),
    `<span class="qb-sep"></span>`,
    B("undo", "↶", "Undo", { dis: !sketch.past.length }), B("redo", "↷", "Redo", { dis: !sketch.future.length }),
    B("dup", "⧉", "Copy", { dis: !any }), B("del", "🗑", "Delete", { dis: !any || locked, cls: "danger" }),
    B("rot", "⟳", "Turn 90°", { dis: !any || locked }), B("mir", "⇋", "Mirror", { dis: !any || locked }),
    B("size", "↔", "Size", { dis: !one || locked, cls: one ? "on" : "", title: "Type an exact size" }),
    B("ver", "◈", "Versions", { dis: !hasVer || locked }),
    `<span class="qb-sep"></span>`,
    B("fit", "⤢", "Fit"), B("pro", "★", "Pro", { cls: sketch.opts.pro ? "on" : "", title: "Pro mode on/off" }),
  ].join("");
}

function quickAction(a) {
  switch (a) {
    case "rect": case "disc": case "triangle": sketch.add(a); break;
    case "lib": openLibrary(); break;
    case "undo": sketch.undo(); break;
    case "redo": sketch.redo(); break;
    case "dup": sketch.duplicate(); break;
    case "del": sketch.remove(); break;
    case "rot": sketch.rotateBy(90); break;
    case "mir": sketch.mirror(); break;
    case "size": { const d = sizeDimForSelection(); if (d) openNumPad(d); else toast("Tap one shape first."); break; }
    case "ver": openVersions(); break;
    case "fit": sketch.fitView(); break;
    case "pro": sketch.setPro(!sketch.opts.pro); $("skPro").checked = !!sketch.opts.pro; renderProTools(); renderShapeForm(); break;
  }
  renderQuickBar();
}

function renderProTools() {
  const box = $("proTools");
  if (!box) return;
  const on = !!(sketch && sketch.opts.pro);
  box.classList.toggle("hidden", !on);
  if (!on) { $("toolBar").classList.add("hidden"); return; }
  const tool = sketch.tool;
  box.innerHTML = `
    <button data-pro="draw" class="${tool === "draw" ? "on" : ""}">✎ Draw outline</button>
    <button data-pro="measure" class="${tool === "measure" ? "on" : ""}">📏 Measure</button>
    <button data-pro="nest">⊞ Auto-arrange</button>
    <button data-pro="points" class="${sketch.opts.pointSnap ? "on" : ""}">Snap to points</button>`;
  $("toolBar").classList.toggle("hidden", tool !== "draw");
  $("toolFinish").textContent = "Close outline";
}

function openNumPad(dim) {
  const pad = $("numPad");
  pad.classList.remove("hidden");
  $("numPadLabel").textContent = dim.label || "Value (mm)";
  const seed = { w: () => { const b = sketch.boxOf(dim.it); return b[2] - b[0]; },
    h: () => { const b = sketch.boxOf(dim.it); return b[3] - b[1]; },
    d: () => { const b = sketch.boxOf(dim.it); return b[2] - b[0]; },
    x: () => sketch.boxOf(dim.it)[0], y: () => sketch.boxOf(dim.it)[1],
    hx: () => dim._v, hy: () => dim._v }[dim.kind];
  let cur = "";
  $("numPadValue").textContent = "";
  $("numPadValue").dataset.seed = seed ? String(Math.round(seed() * 1000) / 1000) : "";
  if (!cur) $("numPadValue").textContent = $("numPadValue").dataset.seed;
  const keys = [["7","7"],["8","8"],["9","9"],["/","/"],["4","4"],["5","5"],["6","6"],["*","*"],["1","1"],["2","2"],["3","3"],["-","-"],["0","0"],[".","."],["(","("],[")",")"],["⌫","DEL"],["+","+"]];
  $("numPadKeys").innerHTML = keys.map(([k, lab]) => `<button type="button" data-k="${k}" class="${"+-*/⌫()".includes(k) ? "op" : ""}">${lab}</button>`).join("");
  const apply = () => {
    const raw = $("numPadValue").textContent.trim();
    const v = evalExpr(raw);
    if (!Number.isFinite(v)) { toast("Use a number, or something like 100/2 or (30+10)/2", true); return; }
    const isSize = dim.kind === "w" || dim.kind === "h" || dim.kind === "d";
    if (isSize && (v < 2 || v > (sketch.maxMm || 2600))) { toast("Size must be at least 2 mm and no bigger than the table.", true); return; }
    if (dim.kind === "w") sketch.setWidth(v);
    else if (dim.kind === "h") sketch.setHeight(v);
    else if (dim.kind === "d") sketch.setDiameter(v);
    else if (dim.kind === "x" || dim.kind === "y") sketch.setPos(dim.kind, v);
    else if (dim.kind === "hx" || dim.kind === "hy") sketch.setHoleOffset(dim.kind === "hx" ? "x" : "y", v);
    closeNumPad();
  };
  pad._apply = apply;
  pad._cur = true; // first key replaces the seed
  // iPhone: the tap that opened the pad can fall through onto a key — ignore keys briefly
  pad.style.pointerEvents = "none";
  clearTimeout(pad._ghost);
  pad._ghost = setTimeout(() => { pad.style.pointerEvents = ""; }, 350);
}

function closeNumPad() { $("numPad").classList.add("hidden"); $("numPad")._apply = null; }

function openCad(title, fields, onOk) {
  $("cadTitle").textContent = title;
  $("cadFields").innerHTML = fields.map((f) => `<label>${esc(f.label)}<input id="cad_${f.id}" type="${f.type || "number"}" inputmode="decimal" step="any" value="${esc(String(f.value ?? ""))}"></label>`).join("");
  $("cadDialog").classList.remove("hidden");
  $("cadDialog")._ok = () => {
    const vals = {};
    for (const f of fields) {
      const raw = $("cad_" + f.id).value;
      vals[f.id] = f.text ? raw : evalExpr(raw);
      if (!f.text && !Number.isFinite(vals[f.id])) { toast("Check the number in " + f.label, true); return; }
    }
    $("cadDialog").classList.add("hidden");
    onOk(vals);
  };
}
function closeCad() { $("cadDialog").classList.add("hidden"); $("cadDialog")._ok = null; }

function runPro(cmd) {
  const sheet = S.cfg && S.cfg.travel_mm ? S.cfg.travel_mm : { x: 1300, y: 800 };
  if (cmd === "draw") { sketch.setTool("draw"); renderProTools(); toast("Tap points on the drawing, then Close outline."); return; }
  if (cmd === "measure") { sketch.setTool("measure"); renderProTools(); toast("Tap two points to measure."); return; }
  if (cmd === "points") { sketch.setPointSnap(!sketch.opts.pointSnap); renderProTools(); return; }
  if (cmd === "lock") { sketch.toggleLock(); return; }
  if (cmd === "subtract") { sketch.subtract(); return; }
  if (cmd === "distx") { sketch.distribute("x"); return; }
  if (cmd === "disty") { sketch.distribute("y"); return; }
  if (cmd === "linarray") {
    openCad("Linear array", [
      { id: "n", label: "How many (including this one)", value: 3 },
      { id: "gx", label: "Gap across (mm)", value: 10 },
      { id: "gy", label: "Gap up (mm)", value: 0 },
    ], (v) => sketch.linearArray(v.n, v.gx, v.gy));
    return;
  }
  if (cmd === "polar") {
    openCad("Circular array", [
      { id: "n", label: "How many around the circle", value: 4 },
      { id: "pcd", label: "Circle Ø (PCD, mm) – 0 = auto", value: 0 },
    ], (v) => sketch.polarArray(v.n, v.pcd));
    return;
  }
  if (cmd === "offset") {
    openCad("Offset the outline", [
      { id: "d", label: "Offset (mm) – plus grows, minus shrinks", value: 5 },
    ], (v) => sketch.offsetBy(v.d));
    return;
  }
  if (cmd === "nest") {
    openCad("Auto-arrange on the sheet", [
      { id: "gap", label: "Gap between parts (mm)", value: 10 },
      { id: "sw", label: "Sheet width (mm)", value: sheet.x },
      { id: "sh", label: "Sheet height (mm)", value: sheet.y },
    ], (v) => sketch.nest(v.gap, v.sw, v.sh));
    return;
  }
}

function syncShapeForm() {
  const it = sketch.selected(); if (!it) return;
  const b = sketch.boxOf(it);
  $$("#shapeForm [data-p]").forEach((i) => { if (document.activeElement !== i) i.value = it.p[i.dataset.p]; });
  $$("#shapeForm [data-pos]").forEach((i) => { if (document.activeElement !== i) i.value = Math.round(b[i.dataset.pos === "x" ? 0 : 1] * 10) / 10; });
}
function useShapeSoon() { clearTimeout(shapeTimer); shapeTimer = setTimeout(useShape, 250); }
function useShape() {
  clearTimeout(shapeTimer);
  if (S.src !== "shape") return;
  let c = sketch.contours();
  if (!c.length) {
    S.design = null; S.prepared = null; S.fileName = "";
    $("warnings").innerHTML = ""; refresh(); return;
  }
  const nx = Number($("cpX").value) || 1, ny = Number($("cpY").value) || 1;
  if (nx * ny > 1) c = copies(c, nx, ny, Number($("cpGap").value) || 0);
  S.design = { name: sketch.name() + (nx * ny > 1 ? ` ×${nx * ny}` : ""), contours: c, warnings: [] };
  S.gcode = null; S.fileName = S.design.name;
  loadJob();
}
function showSource(src) {
  S.src = src;
  $$(".srcTab").forEach((b) => b.classList.toggle("sel", b.dataset.src === src));
  $("srcFile").classList.toggle("hidden", src !== "file");
  $("srcShape").classList.toggle("hidden", src !== "shape");
  if (src === "shape") { renderShapeForm(); useShape(); }
  drawPreview();
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
  $("ovKerf").placeholder = r.kerf_mm ?? S.chart.kerf_mm ?? 1.5; $("ovLead").placeholder = r.lead_in_mm ?? S.chart.lead_in_mm ?? 3;
  $("ovPierce").placeholder = r.pierce_height_mm ?? S.chart.pierce_height_mm; $("ovCut").placeholder = r.cut_height_mm ?? S.chart.cut_height_mm;
  $("ampsCard").innerHTML = `
    <div>Set the plasma to</div>
    <div class="big">${r.amps} A</div>
    <div class="sub"><span>Air <b>${r.air_bar ?? S.chart.air_bar} bar</b></span><span>Pierce <b>${o.pierce_delay_s || r.pierce_delay_s} s</b> at <b>${ph} mm</b></span><span>Cut height <b>${ch} mm</b></span></div>
    ${r.note ? `<div class="ampsnote">⚠ ${esc(r.note)}</div>` : ""}`;
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
function leadNow() { const v = $("ovLead").value.trim(); return v !== "" && Number(v) >= 0 ? Number(v) : (row().lead_in_mm ?? S.chart.lead_in_mm ?? 3); }
// ---- cut check + what the machine can do
function limitsNow() {
  const t = S.cfg.travel_mm, L = S.safety.limits;
  const table = L ? [Math.round(L.x[1] - L.x[0]), Math.round(L.y[1] - L.y[0])] : [t.x, t.y];
  return { thickness: S.thickness, kerf: kerfNow(), leadIn: leadNow(), table, accuracy: S.cfg.accuracy_mm ?? 0.5, slatPitch: S.cfg.slat_pitch_mm ?? 100 };
}
function runCheck(contours) {
  try { return checkDesign(contours, limitsNow()); } catch (e) { console.error(e); return null; }
}
function renderCutCheck() {
  const chk = S.check, mat = `${(S.material || "").toLowerCase()} ${S.thickness} mm`;
  const html = !chk ? "" : `
    <div class="cchead">Cut check <span>· ${esc(mat)}${S.cur === 1 ? " (change it in step 2)" : ""}</span></div>
    ${chk.groups.length ? `<ol>${chk.groups.map((g) => `<li class="${g.level}"><b>${g.n}</b><span>${g.spots.length > 1 ? `<i>${g.spots.length} places:</i> ` : ""}${esc(g.text)}</span></li>`).join("")}</ol>`
      : `<p class="ok">✓ Looks cuttable – nothing too small, thin or close for ${esc(mat)}.</p>`}`;
  $("cutCheck").innerHTML = S.src === "shape" ? html : "";
  $("cutCheck2").innerHTML = html;
  if (sketch) sketch.setMarks(S.src === "shape" && chk ? chk.issues : []);
  const L = machineLimits(limitsNow());
  const rows = [
    ["Cutting area", `${L.table[0]} × ${L.table[1]} mm${S.safety.limits ? " (your edges)" : ""}`],
    ["Accuracy", `about ±${L.accuracy} mm`],
    ["Cut width (kerf)", `${L.kerf} mm – allowed for automatically, parts come out the size you draw`],
    ["Smallest hole", `${L.minHole} mm for ${L.thickness} mm sheet (about 1½ × thickness) – smaller is better drilled`],
    ["Thinnest strip of metal", `${L.minStrip} mm between cuts`],
    ["Gap between parts", `${L.minPartGap} mm or more (lead-in + cut)`],
    ["Inside corners", `come out slightly round (about ${L.insideCorner} mm radius)`],
    ["Edges", "a little bevel and dross on thick plate – normal for plasma"],
    ["Small parts", `under about ${L.slatPitch} mm can tip between the slats – put scrap under them`],
  ];
  const body = `<table class="limits">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${esc(b)}</td></tr>`).join("")}</table>`;
  $$(".limitsBody").forEach((el) => (el.innerHTML = body));
}
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
    S.check = S.design ? runCheck(S.design.contours) : null;
    if (S.check && cam) S.prepared.marks = S.check.issues.map((m) => ({ ...m, at: [m.at[0] + cam.shift[0], m.at[1] + cam.shift[1]] }));
    // the "left of zero" warning doesn't apply to parts we laid out ourselves
    const ws = [...pre, ...S.prepared.warnings.filter((w) => !(cam && /zero point/.test(w)))];
    $("warnings").innerHTML = ws.map((w) => `<li>${esc(w)}</li>`).join("");
    renderCutCheck();
  } catch (e) {
    S.prepared = null;
    $("warnings").innerHTML = `<li>${esc(e.message)}</li>`;
  }
  refresh();
}
// where the start point is, in table view coordinates (the one being dragged wins)
function originView() { if (S.dragOrigin) return S.dragOrigin; const w = wcoNow(); return toView(w[0], w[1]); }
function fromView(vx, vy) { return S.safety.referenced ? [vx + S.safety.ref[0], vy + S.safety.ref[1]] : [vx, vy]; }
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
  const b = S.prepared.stats.bounds, w = S.dragOrigin ? fromView(...S.dragOrigin) : wcoNow(), ref = S.safety.ref, L = S.safety.limits;
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
  const grid = cv && cv.closest(".cutgrid");
  if (grid) grid.classList.toggle("nofile", S.cur === 1 && S.src === "file" && !S.prepared);
  drawCanvas($("moveMap"), false);
  if (!cv || !cv.offsetParent) return;
  const editing = !!sketch && S.src === "shape" && S.cur === 1;
  if (sketch) renderQuickBar();
  if (sketch && sketch.active !== editing) sketch.setActive(editing);
  $("showMachWrap").classList.toggle("hidden", editing || (!!S.prepared && S.cur <= 2));
  if (editing) { sketch.draw(); return; }
  drawCanvas(cv, true);
}
function drawCanvas(cv, main) {
  if (!cv || !cv.offsetParent) return;
  const ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600;
  // steps 1-2: zoom in on the part. Step 3 onwards (and the Move tab): the whole table, with the part where it will be cut.
  const zoom = main && S.prepared && S.cur <= 2;
  let A, ox = 0, oy = 0;
  if (zoom) {
    const b = S.prepared.stats.bounds, pad = Math.max(5, 0.06 * Math.max(b[2] - b[0], b[3] - b[1]));
    A = { x: [b[0] - pad, b[2] + pad], y: [b[1] - pad, b[3] + pad], label: "" };
  } else {
    const T = viewArea();
    // room around the table for the machine: X beam along the front, Y arm off its carriage
    const mg = S.showMachine ? [70, 190, 70, 140] : [0, 0, 0, 0];   // left, front, back, right
    A = { x: [T.x[0] - mg[0], T.x[1] + mg[3]], y: [T.y[0] - mg[1], T.y[1] + mg[2]], label: T.label, table: T };
    [ox, oy] = originView();
  }
  const ax = A.x[1] - A.x[0], ay = A.y[1] - A.y[0];
  let h = Math.max(180, Math.min(520, Math.round(w * (ay / ax))));
  if (document.body.classList.contains("short-land")) {
    const box = cv.closest(".previewPane") || cv.parentElement;
    h = Math.max(120, (box && box.clientHeight) || cv.clientHeight || 200);
  }
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  if (document.body.classList.contains("short-land")) cv.style.height = "";
  else cv.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = 12, sc = Math.min((w - 2 * pad) / ax, (h - 2 * pad) / ay);
  const offX = (w - ax * sc) / 2, offY = (h - ay * sc) / 2;
  const X = (x) => offX + (x - A.x[0]) * sc, Y = (y) => h - offY - (y - A.y[0]) * sc;
  if (main) cv.classList.toggle("placing", !zoom && canPlace());
  cv._map = zoom ? null : { toMm: (px, py) => [A.x[0] + (px - offX) / sc, A.y[0] + (h - offY - py) / sc], toPx: (x, y) => [X(x), Y(y)], sc, T: A.table };
  if (!zoom) drawMachineBed(ctx, A.table, X, Y, sc);
  if (S.prepared) {
    const pv = S.prepared.preview;
    const path = (p) => { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + ox), Y(y + oy)) : ctx.moveTo(X(x + ox), Y(y + oy)))); ctx.stroke(); };
    if (!zoom && main && canPlace() && !placeBlock()) {          // draggable: show the part's footprint
      const b = S.prepared.stats.bounds;
      ctx.fillStyle = S.dragging ? "rgba(227,167,60,.22)" : "rgba(227,167,60,.10)";
      ctx.strokeStyle = "rgba(227,167,60,.75)"; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.fillRect(X(b[0] + ox), Y(b[3] + oy), (b[2] - b[0]) * sc, (b[3] - b[1]) * sc);
      ctx.strokeRect(X(b[0] + ox), Y(b[3] + oy), (b[2] - b[0]) * sc, (b[3] - b[1]) * sc); ctx.setLineDash([]);
      if (S.dragging) {
        ctx.font = "600 13px Barlow, system-ui"; ctx.fillStyle = "#e8c46a";
        ctx.fillText(`start point X ${Math.round(ox)}  Y ${Math.round(oy)} mm`, X(b[0] + ox), Y(b[3] + oy) - 8);
      }
    }
    if (S.prepared.outline) { ctx.strokeStyle = "#c9d1d9"; ctx.lineWidth = 1; S.prepared.outline.forEach((p) => path([...p, p[0]])); }
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "#4a5868"; ctx.lineWidth = 1; pv.rapids.forEach(path);
    ctx.setLineDash([]); ctx.strokeStyle = fit().bad ? "#ef4444" : "#f08a3c"; ctx.lineWidth = zoom ? 2.5 : 2;
    for (const p of pv.cuts) { path(p); ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(X(p[0][0] + ox), Y(p[0][1] + oy), zoom ? 4 : 3, 0, 7); ctx.fill(); }
    if (zoom && S.prepared.marks) S.prepared.marks.forEach((m) => {     // cut check markers
      const col = m.level === "error" ? "#e0342b" : m.level === "warn" ? "#e3a73c" : "#4f7fe0";
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(m.at[0]), Y(m.at[1]), 10, 0, 7); ctx.fill();
      ctx.strokeStyle = "#121920"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = m.level === "warn" ? "#1d1406" : "#fff"; ctx.font = "bold 12px Barlow, system-ui"; ctx.textAlign = "center";
      ctx.fillText(String(m.n), X(m.at[0]), Y(m.at[1]) + 4); ctx.textAlign = "start";
    });
    if (zoom) {
      ctx.fillStyle = "#94a2b0"; ctx.font = "12px system-ui";
      ctx.fillText("orange: torch path   grey: your part   dots: where it pierces", 8, h - 8);
    }
  }
  ctx.strokeStyle = "#4f7fe0"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(ox) - 9, Y(oy)); ctx.lineTo(X(ox) + 9, Y(oy)); ctx.moveTo(X(ox), Y(oy) - 9); ctx.lineTo(X(ox), Y(oy) + 9); ctx.stroke();
  if (!zoom) drawGantry(ctx, A.table, X, Y, sc);
}

// ---- drag the part around the table (step 3/4): drop it = new start point, torch doesn't move
function placeBlock() {      // why the part can't be dragged right now (null = it can)
  if (!S.connected) return "Connect to the table first.";
  if (S.job && S.job.running) return "A job is running.";
  const st = S.status.state || "";
  if (st.startsWith("Alarm")) return "The machine is in alarm. Press Unlock at the top, then drag the part.";
  if (["Run", "Jog", "Home"].some((x) => st.startsWith(x))) return "Wait for the machine to stop moving, then drag the part.";
  if (st.startsWith("Hold") || st.startsWith("Door")) return "The machine is paused. Press Stop or Resume first.";
  return null;
}
function canPlace() {
  return !!S.prepared && (S.cur === 3 || S.cur === 4) && !!S.connected;
}
function bindPlacing() {
  const cv = $("preview");
  let drag = null;
  const at = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const where = (px, py) => {        // "part" | "table" | null
    const m = cv._map; if (!m || !canPlace()) return null;
    const [x, y] = m.toMm(px, py), [ox, oy] = originView(), b = S.prepared.stats.bounds, pad = 14 / m.sc;
    if (x > b[0] + ox - pad && x < b[2] + ox + pad && y > b[1] + oy - pad && y < b[3] + oy + pad) return "part";
    return null;
  };
  const clampOrigin = (ox, oy) => {
    const b = S.prepared.stats.bounds, T = cv._map.T;
    if (b[2] - b[0] <= T.x[1] - T.x[0]) ox = Math.min(Math.max(ox, T.x[0] - b[0]), T.x[1] - b[2]);
    if (b[3] - b[1] <= T.y[1] - T.y[0]) oy = Math.min(Math.max(oy, T.y[0] - b[1]), T.y[1] - b[3]);
    return [Math.round(ox), Math.round(oy)];
  };
  cv.addEventListener("pointerdown", (e) => {
    if (sketch && sketch.active) return;
    const [px, py] = at(e), hit = where(px, py);
    if (!hit) return;
    const why = placeBlock();
    if (why) { toast(why, true); return; }
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    drag = { start: cv._map.toMm(px, py), o0: originView(), moved: false };
    S.dragging = true; refresh();
  });
  cv.addEventListener("pointermove", (e) => {
    if (sketch && sketch.active) return;
    const [px, py] = at(e);
    if (!drag) { const h = where(px, py); cv.style.cursor = h === "part" ? "grab" : ""; return; }
    cv.style.cursor = "grabbing";
    const [x, y] = cv._map.toMm(px, py);
    const [ox, oy] = clampOrigin(drag.o0[0] + x - drag.start[0], drag.o0[1] + y - drag.start[1]);
    if (ox !== drag.o0[0] || oy !== drag.o0[1]) drag.moved = true;
    S.dragOrigin = [ox, oy];
    refresh();
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null; S.dragging = false; cv.style.cursor = "";
    if (!d.moved || !S.dragOrigin) { S.dragOrigin = null; refresh(); return; }
    const [mx, my] = fromView(...S.dragOrigin);
    if (cmd("set_origin", { x: mx, y: my })) {
      toast("Start point moved ✓");
      const want = S.dragOrigin;
      clearTimeout(S.dragTimer);
      S.dragTimer = setTimeout(() => { if (S.dragOrigin === want) { S.dragOrigin = null; refresh(); } }, 3000);
    } else S.dragOrigin = null;
    refresh();
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
}

// ---- bird's-eye view of the machine (HMM-style: X beam along the front, Y arm cantilevered across the table,
// torch on a plate on the left face of the arm). Sizes in mm.
const MACH = { beamH: 50, armW: 50, plate: 26, torchOff: 30, carW: 190, carD: 120, motor: 57 };
function drawMachineBed(ctx, T, X, Y, sc) {
  const [x0, x1] = T.x, [y0, y1] = T.y;
  const R = (x, y, w, h) => [X(x), Y(y + h), w * sc, h * sc];
  // water tray / table
  ctx.fillStyle = "#151d26"; ctx.fillRect(...R(x0, y0, x1 - x0, y1 - y0));
  if (S.showMachine) {
    ctx.strokeStyle = "#2a3542"; ctx.lineWidth = Math.max(1, 3 * sc);                 // slats every 100 mm
    ctx.beginPath();
    for (let x = Math.ceil((x0 + 1) / 100) * 100; x < x1; x += 100) { ctx.moveTo(X(x), Y(y0)); ctx.lineTo(X(x), Y(y1)); }
    ctx.stroke();
    ctx.strokeStyle = "#1e2833"; ctx.lineWidth = 1; ctx.beginPath();                  // slat teeth (light)
    for (let y = y0 + 50; y < y1; y += 50) for (let x = Math.ceil((x0 + 1) / 100) * 100; x < x1; x += 100) { ctx.moveTo(X(x) - 2, Y(y)); ctx.lineTo(X(x) + 2, Y(y)); }
    ctx.stroke();
  }
  ctx.strokeStyle = edgesOn() ? "#2f9e5b" : "#3d4c5c"; ctx.lineWidth = edgesOn() ? 2 : 1;
  ctx.strokeRect(...R(x0, y0, x1 - x0, y1 - y0));
  ctx.fillStyle = "#94a2b0"; ctx.font = "12px Barlow, system-ui";
  ctx.textAlign = "right"; ctx.fillText(`${T.label} ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} mm`, X(x1) - 8, Y(y1) - 8 + 20); ctx.textAlign = "start";
  if (!S.showMachine) return;
  // X beam: box section with the rail on top and end caps
  const bx0 = x0 - 40, bx1 = x1 + 110, by = y0 - 20 - MACH.beamH;
  ctx.fillStyle = "#262d36"; ctx.fillRect(...R(bx0, by, bx1 - bx0, MACH.beamH));
  ctx.fillStyle = "#3a4552"; ctx.fillRect(...R(bx0, by + MACH.beamH - 10, bx1 - bx0, 6));   // rail
  ctx.fillStyle = "#56677a"; ctx.fillRect(...R(bx0, by + MACH.beamH - 8, bx1 - bx0, 2));
  ctx.strokeStyle = "#465464"; ctx.lineWidth = 1; ctx.strokeRect(...R(bx0, by, bx1 - bx0, MACH.beamH));
  ctx.fillStyle = "#3557c9"; ctx.fillRect(...R(bx0 - 6, by - 4, 8, MACH.beamH + 8)); ctx.fillRect(...R(bx1 - 2, by - 4, 8, MACH.beamH + 8));
  ctx.fillStyle = "#6d7c8c"; ctx.font = "11px Barlow, system-ui";
  ctx.textAlign = "right"; ctx.fillText("X beam", X(bx1) - 8, Y(by + MACH.beamH / 2) + 4); ctx.textAlign = "start";
}
function drawGantry(ctx, T, X, Y, sc) {
  const has = !!S.status.MPos;
  const [tx, ty] = has ? toView(S.status.MPos[0], S.status.MPos[1]) : [T.x[0], T.y[0]];
  const r = Math.max(5, 9 * sc);
  if (!S.showMachine) {                      // just the torch dot
    if (!has) return;
    ctx.fillStyle = S.status.torch ? "#a98bff" : "#edeee8";
    ctx.beginPath(); ctx.arc(X(tx), Y(ty), 6, 0, 7); ctx.fill();
    return;
  }
  const M_ = MACH, R = (x, y, w, h) => [X(x), Y(y + h), w * sc, h * sc];
  const rr = (x, y, w, h, rad) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(...R(x, y, w, h), rad * sc); else ctx.rect(...R(x, y, w, h)); };
  const armX = tx + M_.torchOff, armC = armX + M_.armW / 2;          // arm's left face sits just right of the torch
  const by = T.y[0] - 20 - M_.beamH, top = T.y[1] + 30, carY = by - 25;
  ctx.globalAlpha = has ? 1 : 0.5;
  // cable chain from the left end of the beam to the carriage (in front of the beam)
  const chainY = by - 34, cx0 = T.x[0] - 30, cx1 = armC - M_.carW / 2;
  if (cx1 > cx0) {
    ctx.fillStyle = "#1b2027"; ctx.fillRect(...R(cx0, chainY, cx1 - cx0, 18));
    ctx.strokeStyle = "#3a4450"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = cx0; x < cx1; x += 14) { ctx.moveTo(X(x), Y(chainY)); ctx.lineTo(X(x), Y(chainY + 18)); }
    ctx.stroke();
  }
  // X carriage: blue plate with bearings and the X motor
  ctx.fillStyle = "#2f4fb8"; ctx.strokeStyle = "#5b7be0"; ctx.lineWidth = 1;
  rr(armC - M_.carW / 2, carY, M_.carW, M_.carD, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c9d1d9";
  for (const dx of [-70, 70]) for (const dy of [12, M_.carD - 12]) { ctx.beginPath(); ctx.arc(X(armC + dx), Y(carY + dy), Math.max(1.5, 7 * sc), 0, 7); ctx.fill(); }
  ctx.fillStyle = "#15191e"; ctx.fillRect(...R(armC + 40, carY - 30, M_.motor, M_.motor));        // X motor hangs off the front
  ctx.strokeStyle = "#3d4752"; ctx.strokeRect(...R(armC + 40, carY - 30, M_.motor, M_.motor));
  ctx.fillStyle = "#2a3038"; ctx.beginPath(); ctx.arc(X(armC + 40 + M_.motor / 2), Y(carY - 30 + M_.motor / 2), 14 * sc, 0, 7); ctx.fill();
  // Y arm: black box section with its rail, end cap and the Y motor at the back end
  const armLen = top - carY;
  ctx.fillStyle = "#1c2128"; ctx.fillRect(...R(armX, carY, M_.armW, armLen));
  ctx.fillStyle = "#2c333c"; ctx.fillRect(...R(armX, carY, 6, armLen));                            // lit edge
  ctx.fillStyle = "#56677a"; ctx.fillRect(...R(armX + M_.armW - 8, carY, 3, armLen));               // rail
  ctx.strokeStyle = "#465464"; ctx.strokeRect(...R(armX, carY, M_.armW, armLen));
  ctx.fillStyle = "#3557c9"; ctx.fillRect(...R(armX - 3, top - 6, M_.armW + 6, 8));                // end cap
  ctx.fillStyle = "#15191e"; ctx.fillRect(...R(armX + M_.armW + 2, carY + 10, M_.motor, M_.motor)); // Y motor
  ctx.strokeStyle = "#3d4752"; ctx.strokeRect(...R(armX + M_.armW + 2, carY + 10, M_.motor, M_.motor));
  // Z carriage: blue plate on the arm's left face, height sensor, torch body and red handle
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#2f4fb8"; ctx.strokeStyle = "#7aa2f0"; ctx.lineWidth = 1;
  rr(tx - 4, ty - 40, M_.torchOff + 4, 80, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c9d1d9"; ctx.beginPath(); ctx.arc(X(tx + 14), Y(ty + 26), Math.max(2, 7 * sc), 0, 7); ctx.fill();   // sensor
  ctx.save(); ctx.translate(X(tx), Y(ty)); ctx.rotate(Math.PI * 0.82);                                 // handle out to the front-left
  ctx.fillStyle = "#b5453f"; ctx.fillRect(0, -11 * sc, 130 * sc, 22 * sc);
  ctx.fillStyle = "#8f322e"; for (let k = 30; k < 120; k += 22) ctx.fillRect(k * sc, -11 * sc, 4 * sc, 22 * sc);
  ctx.restore();
  ctx.fillStyle = "#3d4752"; ctx.beginPath(); ctx.arc(X(tx), Y(ty), 16 * sc + 2, 0, 7); ctx.fill();   // torch body
  if (S.status.torch) { ctx.fillStyle = "rgba(169,139,255,.38)"; ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 2.4, 0, 7); ctx.fill(); }
  ctx.fillStyle = S.status.torch ? "#a98bff" : "#edeee8";
  ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 0.75, 0, 7); ctx.fill();
  ctx.strokeStyle = "#121920"; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(X(tx) - r, Y(ty)); ctx.lineTo(X(tx) + r, Y(ty)); ctx.moveTo(X(tx), Y(ty) - r); ctx.lineTo(X(tx), Y(ty) + r); ctx.stroke();
}

// ------------------------------------------------------------------ step 4: checks
function renderChecklist() {
  const dry = S.prepared && S.prepared.dry_run;
  const items = dry ? ["Practice run: torch will stay OFF", "Hands clear, e-stop within reach"]
    : [...(row().check ? [row().check] : []), `Plasma ON and set to ${row().amps} A`, `Air on, ${row().air_bar ?? S.chart.air_bar} bar at the plasma gauge`, "Earth clamp on the sheet", "Hands clear, e-stop within reach"];
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
  $("btnStart").disabled = b.length > 0 || !machineAllowed();
  $("blockers").innerHTML = b.length && S.cur === 4 ? `Can't start yet:<ul>${b.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";


  // banners
  $("homeBar").classList.toggle("hidden", !(S.connected && S.safety.limits && !S.safety.referenced && S.status.state !== "Home"));
  const estop = !!(S.status.inputs && S.status.inputs.estop);
  $("estopBar").classList.toggle("hidden", !(S.connected && estop));
  $("alarmBar").classList.toggle("hidden", !(S.connected && S.status.state === "Alarm" && !estop));

  // running / done panel
  if (S.job) {
    const j = S.job, P = liveProgress();
    const finished = !j.running && S.status.state === "Idle";
    const pct = j.result === "done" ? 100 : P.pct;
    $("pct").textContent = Math.floor(pct) + "%";
    $("progBar").style.width = pct.toFixed(1) + "%";
    $("timeLeft").textContent = j.running ? clock(P.left) : "0:00";
    const pierces = S.prepared ? S.prepared.stats.pierces : 0;
    $("runInfo").textContent = `${clock(P.elapsed)} so far` + (pierces ? ` · cut ${Math.max(1, Math.min(P.cut, pierces))} of ${pierces}` : "");
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
  trackProgress(st);
  if (S.dragOrigin && !S.dragging) {
    const [vx, vy] = (() => { const w = wcoNow(); return toView(w[0], w[1]); })();
    if (Math.abs(vx - S.dragOrigin[0]) < 0.05 && Math.abs(vy - S.dragOrigin[1]) < 0.05) S.dragOrigin = null;
  }
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
  if (on) S.designOnly = false;
  const work = on || S.designOnly;
  $("connectView").classList.toggle("hidden", work);
  $$(".tabs").forEach((t) => t.classList.toggle("hidden", !work));
  $("connPill").textContent = on ? "● Connected" : "● Not connected";
  $("connPill").className = "pill " + (on ? "on" : "off");
  $("stateBadge").classList.toggle("hidden", !on);
  if (on) { showTab(S.tab || "cut"); if (label) toast("Connected to " + label); }
  else if (S.designOnly) { showTab("cut"); }
  else ["cut", "move", "setup"].forEach((v) => $(v + "View").classList.add("hidden"));
  $("demoInputs").classList.toggle("hidden", !(on && S.demo));
  refreshGate();
  refresh();
}
async function connectUSB() {
  if (!requireMachine("Link your machine to run jobs")) return;
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
// ---- Wi-Fi (page served by the Pi at the table)
async function connectWiFi(quiet = false) {
  if (!quiet && !requireMachine("Link your machine to run jobs")) return;
  if (quiet && !machineAllowed()) return;
  if (S.wifiBusy) return;
  S.wifiBusy = true;
  try {
    const t = new WiFiTransport(null, S.wifiToken, Acc.accessToken());
    await t.open();
    await M.connect(t);
    S.demo = null; S.wifi = true; S.wifiUsed = true; S.userDisconnected = false;
    setConnected(true, quiet ? "" : "the table over Wi-Fi");
    if (quiet) toast("Wi-Fi back ✓");
    if (M.grbl.job && M.grbl.job.running) { S.job = M.grbl.jobProgress(); showTab("cut"); goStep(5); }
  } catch (e) {
    if (!quiet) toast(e.message, true);
  } finally { S.wifiBusy = false; }
}
// phone asleep / Wi-Fi blip: the Pi keeps cutting; we quietly reconnect
function wifiWatch() {
  setInterval(() => {
    if (S.wifiUsed && !S.connected && !S.userDisconnected && document.visibilityState === "visible") connectWiFi(true);
  }, 3000);
  document.addEventListener("visibilitychange", () => {
    if (S.wifiUsed && !S.connected && !S.userDisconnected && document.visibilityState === "visible") connectWiFi(true);
  });
}
async function connectDemo() {
  const t = new SimTransport({ switchOffset: S.cfg.probe.switch_offset_mm, sheetZ: -15, speedup: 1 });   // real speed
  await t.open();
  await M.connect(t);
  S.demo = t;
  setConnected(true, "the demo (nothing real moves)");
}
async function disconnect() {
  if (M.jobRunning() && !S.wifi && !confirm("A job is running. Disconnect anyway?")) return;
  S.userDisconnected = true;
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
  $("btnDesignOnly").onclick = enterDesignOnly;
  $("btnExport").onclick = exportGcode;
  $("btnSavePartQuick").onclick = () => saveCurrent().catch((e) => toast(e.message, true));
  $("connectLock").onclick = () => { if (!Acc.hasLinkedMachine()) openGate("Link your machine to run jobs"); };
  $("startLock").onclick = () => openGate("Link your machine to run jobs");
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
  $("btnTorchTest").onclick = () => { if (!requireMachine("Link your machine to run jobs")) return; if (confirm("Fire the torch for half a second?\nTorch over scrap, earth clamp on, hands clear.")) cmd("torch_test", { confirm: true }); };
  $("btnPushSettings").onclick = () => { if (confirm("Send the controller settings? Only after editing the CHANGE-ME values for your machine.")) cmd("push_settings"); };
  $("consoleForm").onsubmit = (e) => { e.preventDefault(); if (!requireMachine("Link your machine to run jobs")) return; const l = $("consoleIn").value.trim(); if (l) cmd("console", { line: l }); $("consoleIn").value = ""; };

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
  const addTile = (e) => {
    if (e.target.closest("[data-lib]")) { openLibrary(); return; }
    const b = e.target.closest("[data-shape]"); if (b) sketch.add(b.dataset.shape);
  };
  $("shapeTiles").onclick = addTile; $("holeTiles").onclick = addTile;
  $("quickBar").addEventListener("click", (e) => { const b = e.target.closest("[data-qb]"); if (b && !b.disabled) quickAction(b.dataset.qb); });
  $("libClose").onclick = closeLibrary;
  $("shapeLib").addEventListener("click", (e) => {
    if (e.target === $("shapeLib")) { closeLibrary(); return; }
    const c = e.target.closest("[data-cat]"); if (c) { libCat = c.dataset.cat; renderLibrary(); return; }
    const b = e.target.closest("[data-shape]"); if (b) { closeLibrary(); sketch.add(b.dataset.shape); }
  });
  $("libSearch").addEventListener("input", renderLibrary);
  $("verClose").onclick = closeVersions;
  $("verPop").addEventListener("click", (e) => {
    if (e.target === $("verPop")) { closeVersions(); return; }
    const v = e.target.closest("[data-var]"); if (!v) return;
    const it = sketch.selected(); if (!it) return;
    const spec = variantsFor(it.type).find((x) => variantKey(x) === v.dataset.var);
    if (spec) { sketch.applyVariant(spec); openVersions(); }
  });
  $("skAll").onclick = () => sketch.pickAll();
  $("skSnap").onchange = () => { sketch.setSnap(Number($("skSnap").value)); sketch.draw(); };
  $("skGuides").onchange = () => sketch.setGuides($("skGuides").checked);
  $("shapeForm").addEventListener("focusin", (e) => { if (e.target.matches("input")) editBefore = sketch.snapshot(); });
  $("shapeForm").addEventListener("input", (e) => {
    const i = e.target, v = evalExpr(i.value) ;
    if (i.value.trim() === "" || !Number.isFinite(v)) return;
    const it = sketch.selected(); if (!it) return;
    if (i.dataset.angle) return;                     // applied on change
    if (i.dataset.p) {
      if (it.lock) return;
      const k = i.dataset.p;
      const sizeKeys = ["w", "h", "d", "a", "b", "len", "wid", "s"];
      if (v < 0) return;
      if (sizeKeys.includes(k) && (v < 2 || v > (sketch.maxMm || 2600))) return;
      if (["n", "cols", "rows"].includes(k) && (v < 0 || v > 64)) return;
      if (v > (sketch.maxMm || 2600) * 4) return;
      it.p[k] = v;
    }
    else if (i.dataset.pos) {                // position = bottom-left corner of the shape
      const b = sketch.boxOf(it);
      if (i.dataset.pos === "x") it.x += v - b[0]; else it.y += v - b[1];
    }
    sketch.save(); sketch.draw(); useShapeSoon();
  });
  $("shapeForm").addEventListener("change", (e) => {
    if (e.target.dataset.angle) { sketch.setAngle(Number(e.target.value)); editBefore = sketch.snapshot(); renderShapeForm(); return; }
    if (editBefore && editBefore !== sketch.snapshot()) { sketch.past.push(editBefore); sketch.future = []; }
    editBefore = sketch.snapshot(); renderShapeForm();
  });
  $("shapeForm").addEventListener("click", (e) => {
    const v = e.target.closest("[data-var]");
    if (v) {
      const it = sketch.selected(); if (!it) return;
      const spec = variantsFor(it.type).find((x) => variantKey(x) === v.dataset.var);
      if (spec) sketch.applyVariant(spec);
      return;
    }
    const p = e.target.closest("[data-pro]");
    if (p) { runPro(p.dataset.pro); return; }
    const b = e.target.closest("[data-sk]"); if (!b) return;
    const a = b.dataset.arg; sketch[b.dataset.sk](a === undefined ? undefined : isNaN(Number(a)) ? a : Number(a));
  });
  $("proTools").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pro]"); if (b) runPro(b.dataset.pro);
  });
  $("skPro").onchange = () => { sketch.setPro($("skPro").checked); renderProTools(); renderShapeForm(); renderQuickBar(); if (Acc.isSignedIn()) Acc.setMode($("skPro").checked ? "pro" : "beginner").catch(() => {}); };
  $("numPadKeys").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    const k = b.dataset.k, el = $("numPadValue");
    if ($("numPad")._cur) { el.textContent = (k === "⌫" || k === ".") ? "" : ""; $("numPad")._cur = false; }
    let s = $("numPad")._cur === false ? el.textContent : "";
    if (k === "⌫") s = s.slice(0, -1);
    else s += k;
    el.textContent = s;
  });
  $("numPadEnter").onclick = () => { if ($("numPad")._apply) $("numPad")._apply(); };
  $("numPadCancel").onclick = closeNumPad;
  $("numPad").addEventListener("click", (e) => { if (e.target === $("numPad")) closeNumPad(); });
  $("cadOk").onclick = () => { if ($("cadDialog")._ok) $("cadDialog")._ok(); };
  $("cadCancel").onclick = closeCad;
  $("cadDialog").addEventListener("click", (e) => { if (e.target === $("cadDialog")) closeCad(); });
  $("toolFinish").onclick = () => { sketch.finishDraw(); renderProTools(); };
  $("toolCancel").onclick = () => { sketch.setTool(null); renderProTools(); };
  document.addEventListener("keydown", (e) => {
    if (acctOverlayOpen()) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); closeAccountUi(); }
      return;
    }
    if (!$("numPad").classList.contains("hidden")) {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if ($("numPad")._apply) $("numPad")._apply(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeNumPad(); }
      else if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); const el = $("numPadValue"); if ($("numPad")._cur) { el.textContent = ""; $("numPad")._cur = false; } else el.textContent = el.textContent.slice(0, -1); }
      else if (/^[0-9.+\-*/]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); const el = $("numPadValue"); if ($("numPad")._cur) { el.textContent = ""; $("numPad")._cur = false; } el.textContent += e.key; }
      else e.stopPropagation();
      return;
    }
    if (!$("cadDialog").classList.contains("hidden") && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); closeCad(); return; }
    if ((!$("shapeLib").classList.contains("hidden") || !$("verPop").classList.contains("hidden")) && e.key === "Escape") {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (!$("shapeLib").classList.contains("hidden")) closeLibrary();
      if (!$("verPop").classList.contains("hidden")) closeVersions();
      return;
    }
  }, true);
  $("skUndo").onclick = () => sketch.undo();
  $("skRedo").onclick = () => sketch.redo();
  $("skFit").onclick = () => sketch.fitView();
  $("skClear").onclick = () => { if (confirm("Remove every shape from the drawing?")) sketch.clear(); };
  ["cpX", "cpY", "cpGap"].forEach((id) => $(id).addEventListener("input", useShapeSoon));

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
  bindPlacing();

  // step 4
  $("checklist").addEventListener("change", refresh);
  $("btnStart").onclick = () => {
    if (!requireMachine("Link your machine to run jobs")) return;
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

  // keyboard + on-screen pad: tap = one step, hold = glide until released (diagonals too).
  // Arrows = X/Y, Page Up/Down = Z, hold Shift for slow.
  const KEYS = { ArrowLeft: ["X", -1], ArrowRight: ["X", 1], ArrowUp: ["Y", 1], ArrowDown: ["Y", -1], PageUp: ["Z", 1], PageDown: ["Z", -1] };
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    if (e.key === "Escape") { if (M.grbl) cmd("stop"); return; }
    if (e.key === "Shift") { J.slow = true; return; }
    if (!S.connected) return;
    if (S.job && S.job.running) {
      if (e.key === " ") { e.preventDefault(); cmd(S.status.state === "Hold" ? "resume" : "hold"); }
      return;
    }
    const k = KEYS[e.key];
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    J.slow = e.shiftKey;
    jogPress("key:" + e.key, k[0], k[1]);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Shift") J.slow = false;
    if (KEYS[e.key]) jogRelease("key:" + e.key);
  });
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".j[data-axis]");
    if (!b || !S.connected || b.disabled || (S.job && S.job.running)) return;
    e.preventDefault();
    const id = "pad:" + e.pointerId;
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    b.classList.add("down");
    const up = () => { b.classList.remove("down"); jogRelease(id); b.removeEventListener("pointerup", up); b.removeEventListener("pointercancel", up); };
    b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
    jogPress(id, b.dataset.axis, Number(b.dataset.dir));
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".j[data-axis]");
    if (b && e.detail === 0 && S.connected) jog(b.dataset.axis, Number(b.dataset.dir));   // keyboard "click"
  });
  window.addEventListener("blur", jogReleaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) jogReleaseAll(); });
  $("showMach").addEventListener("change", () => {
    S.showMachine = $("showMach").checked;
    try { localStorage.setItem("plasma.showMachine", S.showMachine ? "1" : "0"); } catch (e) { /* ignore */ }
    drawPreview();
  });
  let layoutTimer = null, lastShort = null;
  const relayout = () => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      const short = matchMedia("(orientation: landscape) and (max-height: 540px)").matches;
      document.body.classList.toggle("short-land", short);
      const changed = short !== lastShort; lastShort = short;
      drawPreview();
      if (sketch && sketch.active && changed) sketch.fitView();
    }, 60);
  };
  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", relayout);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", relayout);
  relayout();
  window.addEventListener("beforeunload", (e) => { if (M.jobRunning()) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("pagehide", () => {
    try { if (M && M.grbl) M.grbl.stop("Page closed."); } catch (e) { /* best effort */ }
  });
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
  try { S.showMachine = localStorage.getItem("plasma.showMachine") !== "0"; } catch (e) { /* ignore */ }
  $("showMach").checked = S.showMachine;
  mountJogPads();
  defaultSpeed();
  renderMaterials();
  renderRecent();
  sketch = new Sketch($("preview"), {
    onChange: (done) => { syncShapeForm(); if (done) { renderShapeForm(); useShape(); renderProTools(); renderQuickBar(); } },
    onSelect: () => { renderShapeForm(); renderProTools(); renderQuickBar(); },
    onMessage: (t) => toast(t),
    onDimTap: (dim) => {
      if (dim.kind === "hx" || dim.kind === "hy") {
        const it = sketch.selected(); if (!it) return;
        const cs = sketch.contoursOf(it);
        let hc = null, host = it;
        if (sketch.sel.hole != null && cs[sketch.sel.hole]) hc = cs[sketch.sel.hole];
        else if (sketch.isHole(it)) { hc = cs[0]; host = sketch.hostOf(it); }
        if (hc && host) {
          const hb = sketch.boxOf(host), cb = (function(){ const pts = hc.pts; let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; for (const [x,y] of pts) { x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y);} return [x0,y0,x1,y1]; })();
          dim._v = dim.kind === "hx" ? (cb[0] + cb[2]) / 2 - hb[0] : (cb[1] + cb[3]) / 2 - hb[1];
        }
      }
      setTimeout(() => openNumPad(dim), 280);
    },
  });
  const travel = machine.travel_mm || { x: 1300, y: 800 };
  sketch.maxMm = 2 * Math.max(Number(travel.x) || 1300, Number(travel.y) || 800);
  if (new URLSearchParams(location.search).has("test")) window.plasmaTest = { sketch, evalExpr, openNumPad, closeNumPad, runPro, S, account: Acc, openAccount, openClaim, openGate, saveCurrent, exportGcode, enterDesignOnly, applyAccountMode, machineAllowed, goStep, refreshGate };
  renderShapeTiles();
  bind();
  await initAccountUi({
    toast, esc,
    applyMode: applyAccountMode,
    refreshGate,
    getDesign: () => (sketch && sketch.items) ? sketch.items : [],
    fileName: () => S.fileName || "",
    currentPart: () => S.currentPart,
    rememberPart: (p) => { S.currentPart = p; S.fileName = (p && p.name) || S.fileName; },
    loadDesign: (p) => {
      if (!p || !p.data) return;
      const items = p.data.items || p.data;
      if (!Array.isArray(items)) return;
      sketch.items = items.map((it) => sketch.sanitizeItem(it)).filter(Boolean);
      sketch.nextId = Math.max(1, ...sketch.items.map((i) => i.id + 1), 1);
      sketch.sel = { ids: [], hole: null };
      sketch.commit();
      S.currentPart = p;
      S.fileName = p.name || S.fileName;
      S.src = "shape";
      if ($("partName")) $("partName").value = p.name || "";
      useShape();
    },
  });
  const pi = await WiFiTransport.available();
  if (pi) {
    S.wifi = true;
    S.wifiToken = pi.token;
    $("btnConnect").textContent = "Connect over Wi-Fi";
    $("btnConnect").onclick = () => { S.userDisconnected = false; connectWiFi(); };
    $("connectHelp").innerHTML = pi.serial
      ? "This page is coming from the Pi at the table. The Pi runs each cut itself, so the job carries on if your phone sleeps or the Wi-Fi drops."
      : "The Pi is on, but it can't see the controller. Check the USB cable from the Pi to the controller.";
    const steps = document.querySelector(".hero ol.plain"); if (steps) steps.classList.add("hidden");
    wifiWatch();
  } else if (!WebSerialTransport.supported()) {
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const phone = apple || /Android/.test(navigator.userAgent);
    $("connectHelp").innerHTML = apple
      ? "iPhones and iPads can't plug into the table by USB. With the Wi-Fi Pi fitted, open <b>http://plasma.local</b> instead. Otherwise run the table from the laptop in <b>Chrome or Edge</b>. You can still look around with the demo here."
      : phone
        ? "Phones can't plug into the table. Run it from a computer in <b>Chrome or Edge</b>. You can still look around with the demo here."
        : "This browser can't talk to USB. Open this page in <b>Chrome or Edge on a computer</b>. You can still try the demo.";
    $("btnConnect").classList.add("hidden");
    $("btnDemo").classList.add("go");
    const steps = document.querySelector(".hero ol.plain"); if (steps) steps.classList.add("hidden");
  }
  onSafety(M.safety.state());
  setConnected(false);
  goStep(1);
}
init().catch((e) => toast("Couldn't start: " + e.message, true));

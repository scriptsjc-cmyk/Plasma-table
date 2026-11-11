// Plasma table operator screen (browser version).
// Guided flow: File -> Material -> Get set up (lay the parts on the sheet, set the start point, check) -> Cut.
// Machine logic lives in machine.js; this file is only the screen.
import { Machine, POSITION_LOST_ALARMS } from "./machine.js";
import { WebSerialTransport, WiFiTransport, RT } from "./grbl.js";
import { SimTransport } from "./sim.js";
import { parseDXF } from "./dxf.js";
import { parseSVG } from "./svg.js";
import { designToGcode } from "./cam.js";
import { SHAPES, copies, SHAPE_GROUPS, shapeThumb, SHAPE_PRESETS, presetOrShape } from "./shapes.js";
import { Sketch, shapeDef } from "./sketch.js";
import { variantsFor, variantKey } from "./variants.js";
import { evalExpr } from "./expr.js";
import { checkDesign, machineLimits } from "./check.js";
import * as Acc from "./account.js";
import { initAccountUi, openAccount, openClaim, openGate, closeAccountUi, acctOverlayOpen, saveCurrent, openAdmin, paintAnnouncements } from "./account-ui.js";
import { fillSettingsFromText, setFirmwareText, appendConsole, filterConsoleCommand } from "./admin-machine.js";
import { FluidNCTransport, fluidncWsUrl, fluidncUrlProblem, fluidncBlockedByHttps, fluidncMixedContentMessage, looksLikeFluidNC } from "./fluidnc.js";
import { convertGcode, dialectExtension, DIALECTS } from "./dialect.js";
import { initSettings, bindSettings, openSettings, closeSettings, currentSettings, matchPreset, refreshPublishedPresets, paintSettings } from "./settings.js";
import { bindHowto, openHowto, closeHowto } from "./howto.js";
import * as R2 from "./r2ui.js";
import * as Setup from "./setup.js";
import { syncWhy, watchWhy } from "./whyoff.js";
import { makeInspector } from "./inspector-api.js";
import { contoursToEditable } from "./editable.js";
import { initPartsFolders, openImport, metaFromContours } from "./partsfolders.js";
import { initFlow, showScreen, screen, navLocked, estopOn, estopPaint, estopReset, estopPress, paintLock } from "./flow.js";

const $ = (id) => document.getElementById(id);
const themeColor = (name, fallback) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
  catch { return fallback; }
};
const $$ = (sel) => [...document.querySelectorAll(sel)];
const S = {
  cfg: null, chart: null, jogStep: 10, status: { state: "Disconnected" }, job: null, prepared: null,
  gcode: null, design: null, fileName: "", safety: {}, src: "file", showMachine: true, cur: 1, material: null, thickness: null, connected: false, currentPart: null, cutStep: 1,
  lastAlarm: null, lastAlarmCode: null, speed: null, lastFeedOv: 100,
  // work zero lives in the machine model (M.zeroConfirmed) so startJob can enforce it; STOP / reset / home / alarm clear it there
  get zeroSet() { return !!(M && M.zeroConfirmed); }, set zeroSet(v) { if (M) M.zeroConfirmed = !!v; },
  fluidnc: false, shapeFs: false,
  cam: { tabs: 0, tabW: 3, leadOut: 0, over: 0, starts: {}, tabOver: {} }, cutOrder: null, cutSkip: [], startCut: 1, resume: null, jobSeq: 0,
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
  return Acc.realControlAllowed();
}
// the wording has to match the account: never say "sign in" to someone who already is
const lockText = (what = "run jobs") => Acc.isSignedIn() ? `Locked: link a machine to ${what}. You are signed in; use Link a machine.` : `Locked: sign in, then link a machine to ${what}.`;
function requireMachine(why) {
  if (machineAllowed()) return true;
  if (Acc.hasLinkedMachine()) {
    // A demo/test-mode "link" is browser-only: it never unlocks real hardware on a site with accounts.
    toast("Demo accounts can't control a real machine. Open the site normally and sign in.", true);
    return false;
  }
  openGate(why || lockText());
  return false;
}
function isProMode() {
  return !!(sketch && sketch.opts.pro);
}
// Beginner / Pro only styles the Make-a-part screen. The cutting screen is the same for everyone, so it has neither class.
function applyBodyMode() {
  const cutting = screen() === "cut", pro = !!(sketch && sketch.opts.pro);
  document.body.classList.toggle("beginner", !cutting && !pro);
  document.body.classList.toggle("pro-mode", !cutting && pro);
}
function syncModeSwitch() {
  const pro = isProMode();
  const mode = pro ? "pro" : "beginner";
  $$("#modeSwitch [data-mode], .acct-modesw [data-mode]").forEach((b) => b.classList.toggle("sel", b.dataset.mode === mode));
  $$('input[name="acctMode"], input[name="suMode"]').forEach((r) => { r.checked = r.value === mode; });
}
function setAppMode(mode, opts) {
  const persist = !opts || opts.persist !== false;
  const autoFs = !opts || opts.autoFs !== false;
  const pro = mode === "pro";
  if ((mode === "pro" || mode === "beginner") && sketch) sketch.setPro(pro);
  applyBodyMode();
  syncModeSwitch();
  if (sketch) {
    renderProTools(); renderShapeForm(); renderQuickBar();
    if (autoFs && screen() === "make") {
      const dlgOpen = !!document.querySelector(".acctdlg:not(.hidden), .shapelib:not(.hidden)");
      if (isProMode() && S.src === "shape" && !dlgOpen) setShapeFs(true);
      else if (!isProMode() && S.shapeFs) setShapeFs(false);
    }
  }
  renderMatPreset();
  paintGuide(); R2.paintCutList(); R2.paintStartCut();
  try { paintSettings(); } catch (e) { /* settings not ready */ }
  if (persist && Acc.isSignedIn() && (mode === "pro" || mode === "beginner")) {
    Acc.setMode(mode).catch(() => {});
  }
  try { paintChrome(); } catch (e) { /* ignore */ }
}
function applyAccountMode(mode) {
  if (mode === "pro" || mode === "beginner") setAppMode(mode, { persist: false });
  else setAppMode(isProMode() ? "pro" : "beginner", { persist: false, autoFs: false });
}
// ---- why a control is greyed (aria-disabled + data-why); see whyoff.js
function whyOff(el) {
  const id = el.id, busy = S.connected && S.status && S.status.state && !/^(Idle|Check)$/i.test(S.status.state);
  const needConn = !S.connected ? "Connect to the table first." : null;
  if (el.matches && el.matches(".j[data-axis], .steps button")) return needConn || (S.job && S.job.running ? "Not while a job is running." : /alarm/i.test((S.status && S.status.state) || "") ? "Clear the alarm first." : "Not available right now.");
  if (el.hasAttribute && el.hasAttribute("data-mv")) return Number(el.dataset.mv) < 0 ? "Already first in the order." : "Already last in the order.";
  switch (id) {
    case "next1": return screen() === "make" ? "Pick a shape first." : "Upload a file or pick saved parts first.";
    case "btnStart": {
      if (!machineAllowed()) return Acc.isSignedIn() ? "Link a machine to run jobs." : "Sign in and link a machine to run jobs.";
      try { const b = blockers(); if (b && b.length) return String(b[0]).replace(/\s+/g, " ").slice(0, 90); } catch (e) { /* fall through */ }
      return "Not ready to start yet.";
    }
    case "btnZero": return needConn || (S.job && S.job.running ? "Not while a job is running." : "Wait until the machine is idle.");
    case "btnTrace": return !S.prepared ? "Make a shape or open a file first." : needConn || "Wait until the machine is idle.";
    case "btnGoStart": return needConn || (!S.zeroSet ? "Set the start point first." : "Wait until the machine is idle.");
    case "skUndo": return "Nothing to undo.";
    case "skRedo": return "Nothing to redo.";
    case "skClear": return "There is nothing on the sheet to clear.";
    case "skAll": return "There is nothing to select.";
    case "rsKeep": return "Only for imported drawings.";
    case "btnDemoEdges": return "The demo is finding the table edges now.";
    default: return needConn || (busy ? "Wait until the machine stops moving." : (S.job && S.job.running ? "Not while a job is running." : "Not available right now."));
  }
}
const padUnavailable = (el) => !!(el.matches && el.matches(".j[data-axis], .steps button")) && (!S.connected || !!(S.job && S.job.running));
const paintWhy = () => syncWhy(whyOff, padUnavailable);

function refreshGate() {
  const needLink = !Acc.hasLinkedMachine();
  $("btnConnect").classList.toggle("locked", needLink);
  $("connectLock").classList.toggle("hidden", !needLink);
  const runLocked = needLink && !S.demo;
  $("btnStart").classList.toggle("locked", runLocked);
  $("startLock").classList.toggle("hidden", !runLocked);
  $("startLock").textContent = "🔒 " + lockText();
  $("connectLock").textContent = "🔒 " + lockText();
  const send = $("btnConsoleSend");
  if (send) send.classList.toggle("locked", runLocked);
  document.body.classList.toggle("run-locked", runLocked);
  $$(".jogwrap, .jogmount").forEach((el) => el.classList.toggle("locked", runLocked && !S.connected));
}
function exportDialect() {
  const sel = $("exportDialect");
  if (sel && sel.value) return sel.value;
  try { return (currentSettings() && currentSettings().dialect) || "grbl"; } catch (e) { return "grbl"; }
}
function exportLineNumbers() {
  const c = $("exportN");
  if (c) return !!c.checked;
  try { return !!(currentSettings() && currentSettings().lineNumbers); } catch (e) { return false; }
}
function exportGcode() {
  if (!Acc.allowExportWithoutMachine() && !Acc.hasLinkedMachine()) {
    openGate(lockText("download G-code"));
    return;
  }
  if (!S.prepared) loadJob();
  let text = "";
  if (S.prepared && Array.isArray(S.prepared.lines) && S.prepared.lines.length) text = S.prepared.lines.join("\n") + "\n";
  else if (S.prepared && S.prepared.source) text = S.prepared.source;
  else if (S.gcode) text = S.gcode;
  if (!text) { toast("Nothing to export yet. Load or design a part first.", true); return; }
  const dialect = exportDialect();
  const numbered = exportLineNumbers();
  text = convertGcode(text, dialect, { lineNumbers: numbered });
  const ext = dialectExtension(dialect);
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ((S.fileName || "part").replace(/\.[^.]+$/, "") || "part") + ext;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Downloaded " + dialect.toUpperCase() + " file");
  const sm = scoreMarkCount();
  if (sm) toast(`Careful: ${sm} shape${sm === 1 ? " is" : "s are"} set to Score or Mark. The G-code cuts them through at full power.`, true);
}

// ------------------------------------------------------------------ screens (login -> menu -> make | cut)
// body[data-screen] is owned by flow.js; this is what each screen shows.
const testBypass = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && new URLSearchParams(location.search).has("test") && !new URLSearchParams(location.search).has("gate");
function paintMenu() {
  const u = Acc.currentUser();
  const nm = u && (u.display_name || (u.email || "").split("@")[0]);
  $("menuHello").textContent = nm ? `Hi ${nm}. What do you want to do?` : "What do you want to do?";
  $("menuMachine").textContent = Acc.hasLinkedMachine() ? "Your machine is linked." : (Acc.isSignedIn() ? "No machine linked yet. You can make parts now; linking a machine is needed to cut." : "");
}
function onScreen(name, prev) {
  if (prev === "cut") S.cutStep = S.cur;
  $("menuView").classList.toggle("hidden", name !== "menu");
  if (name !== "cut" && name !== "make") { $("cutView").classList.add("hidden"); $("setupView").classList.add("hidden"); }
  applyBodyMode();
  const gate = $("accountDlg");
  gate.classList.toggle("loginpage", name === "login");
  if (name === "login") openAccount("in");
  else if (prev === "login") closeAccountUi();
  if (name === "menu") paintMenu();
  if (name === "make") {
    S.tab = "cut"; showTab("cut");
    S.src = "shape";
    showSource("shape");
    goStep(1);
    syncModeSwitch(); renderProTools(); renderShapeForm(); renderQuickBar();
  } else if (name === "cut") {
    setShapeFs(false);
    showTab(S.tab === "setup" ? "setup" : "cut");
    goStep(S.prepared && S.cutStep >= 3 ? Math.min(S.cutStep, S.job ? 4 : 3) : 1);
    renderMaterials();
  }
  try { renderCutCheck(); } catch (e) { /* ignore */ }
  try { paintChrome(); refresh(); } catch (e) { /* ignore */ }
  window.scrollTo(0, 0);
}
// Make a part -> the cutting screen, straight onto the bed
function sendToCutting() {
  if (S.src === "shape" && sketch) useShape();
  if (!S.prepared) { toast("Pick or draw a part first.", true); return; }
  if (!showScreen("cut")) return;
  goStep(3);
}
// signed in -> menu; signed out -> the sign-in page
function routeAuth() {
  const signed = Acc.isSignedIn();
  if (testBypass()) { if (screen() === "boot") showScreen("menu", { force: true }); return; }
  if (signed && (screen() === "login" || screen() === "boot")) showScreen("menu", { force: true });
  else if (!signed && screen() !== "login") { S.cutStep = 1; showScreen("login", { force: true }); }
}

// ------------------------------------------------------------------ tabs & steps
function showTab(name) {
  if (name !== "setup") name = "cut";
  if (name !== S.tab && screen() === "cut" && navLocked()) { toast("Not while the machine is cutting. Press the red E-STOP first.", true); return; }
  const scr = screen();
  $$(".tab").forEach((t) => t.classList.toggle("sel", t.dataset.tab === name));
  $("cutView").classList.toggle("hidden", !(scr === "make" || (scr === "cut" && name === "cut")));
  $("setupView").classList.toggle("hidden", !(scr === "cut" && name === "setup"));
  S.tab = name;
  if (name === "cut") drawPreview();
}
function canGo(n) {
  if (n === 4) return !!S.job;
  if (n >= 2) return !!S.prepared;
  return true;
}
function goStep(n) {
  if (screen() === "make") n = 1;                // Make a part is one page; the numbered steps belong to the cutting screen
  if (n === 2) n = 3;                            // (the old Material step now lives on step 1)
  if (!canGo(n)) return;
  if (S.job && S.job.running && n !== 4) { toast("A job is running. Pause or stop it first.", true); return; }
  if (n !== 1 && S.shapeFs) setShapeFs(false);
  S.cur = n; document.body.dataset.step = String(n);
  $$(".step").forEach((el) => el.classList.toggle("hidden", Number(el.dataset.step) !== n));
  $$("#stepper li").forEach((li) => {
    const k = Number(li.dataset.step);
    li.classList.toggle("cur", k === n);
    li.classList.toggle("done", k < n);
  });
  if (n !== 3) Setup.leave();
  if (n === 3 && screen() === "cut") { Setup.enter(); renderChecklist(); }
  refresh();
  window.scrollTo({ top: 0, behavior: "smooth" });
  const sp = document.querySelector(".stepPane"); if (sp) sp.scrollTop = 0;
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
  const html = `<div><span>X</span><b>${Number(w[0]).toFixed(1)}</b></div><div><span>Y</span><b>${Number(w[1]).toFixed(1)}</b></div><div><span>Z</span><b>${Number(w[2]).toFixed(1)}</b></div>`;
  $$(".small-pos").forEach((el) => (el.innerHTML = html));
}

// ------------------------------------------------------------------ step 1: file
// A drawing is already on the bed: a second DXF/SVG asks whether it joins the sheet or replaces what is there (never silently throws work away)
function askAddOrReplace(f) {
  return new Promise((res) => {
    $("importAskText").textContent = `You already have parts on the bed. What should “${f.name}” do?`;
    const dlg = $("importAskDlg"); dlg.classList.remove("hidden");
    const done = (v) => { dlg.classList.add("hidden"); res(v); };
    $("importAskAdd").onclick = () => done("add"); $("importAskReplace").onclick = () => done("replace"); $("importAskCancel").onclick = () => done("cancel");
    setTimeout(() => $("importAskAdd").focus(), 30);
  });
}
const bedHasParts = () => !!((sketch && sketch.items.length) || (S.design && S.src === "file" && S.prepared) || (S.gcode && S.prepared));
// Everything that arrives on the cutting screen (file picker, drag-drop) comes through here.
async function handleFiles(list) {
  const fl = [...list].filter(Boolean);
  if (!fl.length || (S.job && S.job.running)) return;
  if (fl.length === 1) { await importOne(fl[0]); return; }
  const ok = fl.filter((f) => /\.(dxf|svg)$/i.test(f.name));
  if (ok.length < fl.length) toast("Only DXF or SVG files can be laid out together. G-code goes one file at a time.", true);
  if (ok.length) await addPartsFlow(ok);
}
// put more parts on the bed (saved parts and/or several drawing files, each with a quantity)
async function addPartsFlow(files) {
  if ((S.gcode && !S.design) || (S.design && S.design.straight)) { toast("A G-code file or a straight cut can't be mixed with drawings. Tap “Start over” first.", true); return; }
  if (S.prepared) goStep(3); else { S.src = "shape"; }          // step 3 turns a loaded drawing into movable parts first
  if (files) await Setup.addFilesToSheet(files); else Setup.openAdd();
}
function startOver() {
  S.job = null; S.prepared = null; S.gcode = null; S.design = null; S.currentPart = null; S.fileName = ""; S.startCut = 1; S.resume = null;
  if (sketch && sketch.items.length) { sketch.layout = null; sketch.remember(); sketch.items = []; sketch.pick([]); sketch.commit(); }
  S.src = "file"; $("file").value = "";
  $("dropTitle").textContent = "Upload a file"; $("drop").classList.remove("loaded");
  $("warnings").innerHTML = "";
  goStep(1); refresh();
}
async function importOne(f) {
  if (!f) return;
  const ext = f.name.toLowerCase().split(".").pop();
  if (bedHasParts() && (ext === "dxf" || ext === "svg") && !(S.job && S.job.running) && !(S.design && S.design.straight) && !(S.gcode && !S.design)) {
    const a = await askAddOrReplace(f);
    if (a === "cancel") return;
    if (a === "add") { await addPartsFlow([f]); return; }
  }
  readFile(f);
}
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
function openText(name, text, remember, scale) {
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
  S.src = "file";                                          // a freshly opened file: step 3 turns it into parts on the bed
  S.design && (S.design.straight = false);
  R2.designChanged(-1);                                    // a new file: forget old cut order, tabs and start points
  const finish = (k) => {
    $("dropTitle").textContent = "✓ " + name;
    $("drop").classList.add("loaded");
    if (remember) saveRecent(name, text, k);
    loadJob();
    if (S.prepared) goStep(3);                             // straight onto the bed
  };
  if (S.design && scale && scale !== 1) { S.design.contours = R2.scaleContours(S.design.contours, scale); }
  // "This drawing is W x H mm. Is that right?" – only for a file the person just opened (not a recent one with its scale remembered)
  if (S.design && remember && R2.sizeCheckWanted()) {
    S.prepared = null;
    R2.askSize(S.design, S.design.units, finish);
    return;
  }
  finish(scale || 1);
}
function setFile(name, text, remember, scale) { openText(name, text, remember, scale); }

// An imported drawing becomes shapes the editor understands (lines + true arcs; one part per outline, holes travel
// with their part) so every click-a-line tool works on it: set length, square up, angle, curve, move, resize, holes.
function editDrawing() {
  const d = S.design;
  if (!d || d.straight || !d.contours || !d.contours.length) { toast("Open a drawing first.", true); return; }
  const e = contoursToEditable(d.contours);
  if (!e) { toast("There is nothing in this drawing the editor can use.", true); return; }
  if (sketch.items.length && !confirm("The shape maker already has shapes on it. Replace them with this drawing? (Undo brings them back.)")) return;
  sketch.importParts(e.parts, true);
  S.currentPart = null;
  S.fileName = String(d.name || "Imported drawing").replace(/\.[^.]+$/, "");
  if ($("partName")) $("partName").value = S.fileName;
  S.src = "shape";
  if (!showScreen("make")) return;
  showSource("shape");
  useShape();
  setShapeFs(true);
  const cv = d.curveNote || (d.warnings || []).find((w) => /can't be edited as true curves/.test(w));
  toast(`Opened ${e.parts.length} part${e.parts.length > 1 ? "s" : ""} for editing (${e.arcs} arc${e.arcs === 1 ? "" : "s"}, ${e.lines} straight edge${e.lines === 1 ? "" : "s"}).` + (cv ? " " + cv : ""), !!cv);
}
// exact width x height for the picked part (custom parts can also be stretched)
function openResize() {
  const list = sketch.picked(), it = list.length === 1 ? list[0] : null;
  if (!it) { toast("Pick one part first, then use Width × height.", true); return; }
  if (!sketch.canResize(it)) { toast("This part is locked or turned at an odd angle, so it can't be resized here.", true); return; }
  const b = sketch.boxOf(it), W = Math.round((b[2] - b[0]) * 100) / 100, H = Math.round((b[3] - b[1]) * 100) / 100;
  const dlg = $("resizeDlg"); dlg._id = it.id; dlg._ratio = W / H; dlg._which = "w";
  $("resizeNow").textContent = `Now ${W} × ${H} mm.`;
  $("rsW").value = W; $("rsH").value = H; $("rsKeep").checked = it.type === "custom" ? S.keepProp !== false : true;
  $("rsKeep").disabled = it.type !== "custom";
  dlg.classList.remove("hidden");
  setTimeout(() => $("rsW").select(), 30);
}
function bindResize() {
  const dlg = $("resizeDlg"), close = () => { dlg.classList.add("hidden"); S.uiBlockUntil = Date.now() + 450; };
  $("rsW").addEventListener("input", () => { dlg._which = "w"; if ($("rsKeep").checked) { const v = evalExpr($("rsW").value); if (Number.isFinite(v)) $("rsH").value = Math.round(v / dlg._ratio * 100) / 100; } });
  $("rsH").addEventListener("input", () => { dlg._which = "h"; if ($("rsKeep").checked) { const v = evalExpr($("rsH").value); if (Number.isFinite(v)) $("rsW").value = Math.round(v * dlg._ratio * 100) / 100; } });
  $("rsKeep").addEventListener("change", () => { S.keepProp = $("rsKeep").checked; });
  $("rsCancel").onclick = close;
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  $("rsOk").onclick = () => {
    const it = sketch.item(dlg._id); if (!it) { close(); return; }
    const W = evalExpr($("rsW").value), H = evalExpr($("rsH").value);
    if (!(W > 0 && H > 0)) { toast("Type a width and a height in mm.", true); return; }
    let ok;
    if (it.type === "custom") ok = sketch.resizeCustomTo(it, W, H, $("rsKeep").checked, dlg._which);
    else { sketch.remember(); sketch.resizeTo(it, W, H); sketch.commit(); sketch.onSelect(); ok = true; }
    if (!ok) { toast("That size isn't possible for this part (too small, too big or locked).", true); return; }
    close(); useShapeSoon(); toast("Resized");
  };
}
function openEditor() { S.src = "shape"; if (screen() !== "make") showScreen("make"); showSource("shape"); useShape(); setShapeFs(true); }

// ------------------------------------------------------------------ shape maker (drag-and-drop editor)
let sketch = null, shapeTimer = null, editBefore = null;
const QUICK_PARTS = ["rect", "plate", "disc", "ring", "flange", "triangle", "gusset", "slot"];
function renderShapeTiles() {
  const tile = (sh) => `<button data-shape="${esc(sh.id)}" title="${esc(sh.tip || "Add " + sh.name)}"><i>${shapeThumb(sh, 40, 28) || esc(sh.icon)}</i>${esc(sh.name)}</button>`;
  $("shapeTiles").innerHTML = QUICK_PARTS.map((id) => SHAPES.find((s) => s.id === id)).filter(Boolean).map(tile).join("")
    + `<button data-lib="1" class="libmore" title="Every shape, by category"><i>⋯</i>More shapes (${SHAPES.filter((s) => !s.hole).length})</button>`;
  $("holeTiles").innerHTML = SHAPES.filter((sh) => sh.hole).map(tile).join("");
  renderBeginnerShapes();
  $("skSnap").value = String(sketch.opts.snap);
  $("skGuides").checked = !!sketch.opts.guides;
  syncModeSwitch();
  renderProTools();
}
// ---- Beginner: big plain shape buttons first, and a one-step-at-a-time guide
const BEGIN_SHAPES = [["rect", "Rectangle"], ["disc", "Circle"], ["plate", "Plate with holes"], ["ring", "Ring"], ["triangle", "Triangle"], ["slot", "Slot"]];
function renderBeginnerShapes() {
  const box = $("bgShapes"); if (!box) return;
  const cur = sketch && sketch.items.length === 1 ? sketch.items[0].type : null;
  box.innerHTML = BEGIN_SHAPES.map(([id, label]) => SHAPES.find((s) => s.id === id)
    ? `<button type="button" data-bshape="${esc(id)}" class="${cur === id ? "sel" : ""}"><i>${shapeThumb(SHAPES.find((s) => s.id === id), 72, 48)}</i><span>${esc(label)}</span></button>` : "").join("");
}
// add a shape by id; a library preset like "flange6" adds its base shape with its sizes already set
function addShapeId(id) {
  const pr = SHAPE_PRESETS[id];
  if (pr) sketch.add(pr.base, false, pr.p); else sketch.add(id);
}
function beginnerPick(id) {
  if (S.job && S.job.running) return;
  S.bgChoosing = false;
  if (S.src !== "shape") showSource("shape");
  if (sketch.items.length && !sketch.items.some((i) => i.lock)) sketch.clear();     // Beginner: tapping another shape swaps it (Undo brings it back)
  addShapeId(id);
  sketch.fitView();
  useShape();      // build the job now, not 250 ms later: a shape that is picked must enable Next straight away
}
// Make a part: one page. Beginner gets a plain two-line guide on top; Pro gets none.
function paintGuide() {
  const mk = screen() === "make", beg = document.body.classList.contains("beginner");
  const has = !!(sketch && sketch.items.length);
  document.body.classList.toggle("bg-picked", !!(mk && beg && S.src === "shape" && has && !S.bgChoosing && S.cur === 1));
  const nx = $("next1");
  if (nx) nx.textContent = mk ? (S.prepared ? "✂ Cut this part →" : (has ? "Getting it ready…" : "Pick a shape to continue")) : "Next: bed and start →";
  const mt = $("matLine"); if (mt) mt.textContent = S.material ? `Cutting ${S.material.toLowerCase()}, ${S.thickness} mm thick. Not right? Tap a different one.` : "";
  const t = $("step1Title"); if (t) t.textContent = mk ? "Make a part" : "What do you want to cut?";
  const gh = $("guideHead"); if (!gh || !mk || !beg) return;
  $("ghStep").textContent = "Make a part";
  $("ghTitle").textContent = has ? "Set the size" : "Pick a shape";
  $("ghHelp").textContent = has ? "Type how big it should be, turn it, add holes. When it looks right, press Cut this part." : "Tap a shape, or draw your own.";
  gh.style.setProperty("--prog", has ? "100%" : "0%");
}
const HOLE_ADDERS = [["slothole", "Slot hole"], ["cornerholes", "Corner holes (4)"], ["holerow", "Row of holes"], ["boltcircle", "Ring of holes"], ["holegrid", "Grid of holes"]];
const ALIGN = [["left", "⇤ Left"], ["centre", "↔ Centre"], ["right", "⇥ Right"], ["both", "◎ Dead centre"],
  ["bottom", "⤓ Bottom"], ["middle", "↕ Middle"], ["top", "⤒ Top"]];
function customSizeHtml(it, b) {
  if (!it || it.type !== "custom") return "";
  const W = Math.round((b[2] - b[0]) * 100) / 100, H = Math.round((b[3] - b[1]) * 100) / 100;
  return `<div class="grid2 custsize">
      <label>Width (mm)<input type="number" step="any" min="2" inputmode="decimal" data-cw="1" value="${W}"></label>
      <label>Height (mm)<input type="number" step="any" min="2" inputmode="decimal" data-ch="1" value="${H}"></label>
      <label class="check wide2"><input type="checkbox" id="keepProp" ${S.keepProp === false ? "" : "checked"}> Keep proportions</label>
    </div>`;
}
// Pro: where a picked hole (or hole pattern) sits in its part, measured from the part's edges
function holeHostHtml(it, sh) {
  const host = sketch.hostPart(it); if (!host) return "";
  const hb = sketch.boxOf(host), b = sketch.boxOf(it);
  const cx = Math.round(((b[0] + b[2]) / 2 - hb[0]) * 100) / 100, cy = Math.round(((b[1] + b[3]) / 2 - hb[1]) * 100) / 100;
  return `<h4>Where it sits in the part</h4>
    <div class="grid2">
      <label>Centre from the part's left edge<input type="number" step="any" inputmode="decimal" data-hrel="x" value="${cx}"></label>
      <label>Centre from the part's bottom edge<input type="number" step="any" inputmode="decimal" data-hrel="y" value="${cy}"></label>
    </div>
    <div class="skbtns"><button data-sk="centreInHost">◎ Centre in the part</button><button data-sk="pickHost">↩ Select the part</button><button data-pro="linarray">Row of copies</button><button data-pro="polar">Circle of copies</button></div>`;
}
function renderShapeForm() {
  const list = sketch.picked(), it = sketch.selected();
  $("skUndo").disabled = !sketch.past.length; $("skRedo").disabled = !sketch.future.length;
  $("skClear").disabled = !sketch.items.length; $("skAll").disabled = !sketch.items.length;
  paintGuide(); renderBeginnerShapes();
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
  if (!sketch.opts.pro) {                        // Beginner: just the sizes, turn, add a hole, remove
    $("shapeForm").innerHTML = `
      <div class="selhead"><b>${sh.icon} ${esc(sh.name)}</b></div>
      <p class="tip">Type the size in millimetres.</p>
      <div class="grid2">${(it.type === "custom" ? [] : sh.params).map(([k, label]) =>
        `<label>${esc(label)}<input type="number" step="any" min="0" inputmode="decimal" data-p="${k}" value="${esc(String(it.p[k]))}"></label>`).join("")}</div>${customSizeHtml(it, b)}
      <div class="skbtns bigbtns">
        <button data-sk="rotateBy" data-arg="90">⟳ Turn it</button>
        ${!sh.hole && !sh.sheet && shapeDef("hole") ? `<button data-sk="add" data-arg="hole">◦ Add a hole</button>` : ""}
        ${sh.hole && sketch.hostPart(it) ? `<button data-sk="pickHost">↩ Back to the part</button><button data-sk="centreInHost">◎ Centre it</button>` : ""}
        ${sh.sheet ? `<button data-sk="explode" title="Make each piece its own part, so you can place them on the bed one by one">✂ Split into parts</button>` : ""}
        <button data-sk="remove" class="danger">🗑 Remove</button>
      </div>
      ${!sh.hole && !sh.sheet ? `<p class="tip">More holes:</p><div class="skbtns holeadd">${HOLE_ADDERS.map(([id, label]) => shapeDef(id) ? `<button data-sk="add" data-arg="${id}">${esc(label)}</button>` : "").join("")}</div>` : ""}`;
    return;
  }
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
    ${customSizeHtml(it, b)}
    <div class="grid2">${(it.type === "custom" ? [] : sh.params).map(([k, label]) =>
      `<label>${esc(label)}<input type="number" step="any" min="0" inputmode="decimal" data-p="${k}" value="${esc(String(it.p[k]))}"></label>`).join("")}
      <label>Position X (left edge)<input type="number" step="any" inputmode="decimal" data-pos="x" value="${Math.round(b[0] * 10) / 10}"></label>
      <label>Position Y (bottom edge)<input type="number" step="any" inputmode="decimal" data-pos="y" value="${Math.round(b[1] * 10) / 10}"></label>
      <label>Angle °<input type="number" step="any" inputmode="decimal" data-angle="1" value="${Math.round((it.rot || 0) * 10) / 10}"></label>
      ${it.type === "custom" ? "" : `<label>Size<input type="text" disabled value="${Math.round((b[2] - b[0]) * 10) / 10} × ${Math.round((b[3] - b[1]) * 10) / 10} mm"></label>`}
    </div>
    <div class="skbtns">
      <button data-sk="rotateBy" data-arg="90" title="R">⟳ Turn 90°</button>
      <button data-sk="mirror" title="M">⇋ Mirror</button>
      <button data-sk="duplicate" title="Ctrl+D">⧉ Copy</button>
      ${moved ? `<button data-sk="resetHoles">↺ Holes back</button>` : ""}
      ${sh.sheet ? `<button data-sk="explode" title="Make each piece its own part, so you can place them on the bed one by one">✂ Split into parts</button>` : ""}
      <button data-sk="remove" class="danger" title="Delete">🗑 Delete</button>
    </div>${proOne}${holeHostHtml(it, sh)}`;
}
// keep the boxes in step while dragging, without rebuilding them


let libCat = "all";
function openLibrary() {
  $("shapeLib").classList.remove("hidden");
  $("libSearch").value = "";
  renderLibrary();
  setTimeout(() => { if (matchMedia("(pointer: fine)").matches) $("libSearch").focus(); }, 30);
}
function closeLibrary() { $("shapeLib").classList.add("hidden"); S.uiBlockUntil = Date.now() + 450; }
// "l bracket", "L-bracket" and "lbracket" all match: ignore case, spaces, hyphens and underscores
function normQ(s) { return String(s || "").toLowerCase().replace(/[\s\-_()/.,]+/g, " ").trim(); }
function matchesQuery(hay, q) {
  const h = normQ(hay), hs = h.replace(/ /g, "");
  const toks = normQ(q).split(" ").filter(Boolean);
  if (!toks.length) return true;
  if (hs.includes(toks.join(""))) return true;
  return toks.every((tk) => h.includes(tk) || hs.includes(tk));
}
function renderLibrary() {
  const q = $("libSearch").value.trim().toLowerCase();
  const cats = [{ id: "all", name: "All" }, ...SHAPE_GROUPS];
  $("libCats").innerHTML = cats.map((c) => `<button type="button" data-cat="${esc(c.id)}" class="${c.id === libCat ? "on" : ""}">${esc(c.name)}</button>`).join("");
  let ids;
  if (libCat === "all" || q) { const seen = new Set(); ids = SHAPE_GROUPS.flatMap((g) => g.ids).filter((id) => !seen.has(id) && seen.add(id)); }
  else ids = (SHAPE_GROUPS.find((g) => g.id === libCat) || { ids: [] }).ids;
  const list = ids.map((id) => presetOrShape(id)).filter(Boolean)
    .filter((s) => !q || matchesQuery((s.name + " " + (s.tip || "") + " " + s.id + " " + (s.aka || "")), q));
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
function closeVersions() { $("verPop").classList.add("hidden"); S.uiBlockUntil = Date.now() + 450; }

function sizeDimForSelection() {
  const it = sketch.selected(); if (!it) return null;
  sketch.draw();
  return sketch.dimHits.find((h) => h.kind === "w") || sketch.dimHits.find((h) => h.kind === "d") || null;
}

// Tool palette: labelled groups with a search box (replaces the icon-only rail)
const PALETTE = [
  { g: "Shapes", items: [["rect", "▭", "Rectangle"], ["disc", "◯", "Circle"], ["triangle", "△", "Triangle"], ["slot", "⊂⊃", "Slot"], ["sector", "◔", "Arc / sector"], ["lib", "⋯", "All shapes…"]] },
  { g: "Holes", items: [["hole", "◦", "Hole"], ["slothole", "⊖", "Slot hole"], ["boltcircle", "⁘", "Bolt circle"]] },
  { g: "Draw", items: [["draw", "✎", "Draw outline"], ["edge", "⟋", "Edit edge"], ["measure", "📏", "Measure"]] },
  { g: "Combine", items: [["join", "⊕", "Join (union)"], ["subtract", "⊖", "Cut out"], ["offset", "⧈", "Offset"]] },
  { g: "Arrange", items: [["rot", "⟳", "Turn 90°"], ["mir", "⇋", "Mirror"], ["linarray", "⋯", "Array"], ["polar", "✲", "Circle array"], ["alignl", "⇤", "Align left"], ["alignb", "⤓", "Align bottom"], ["nest", "⊞", "Auto-arrange"]] },
  { g: "Edit", items: [["size", "↔", "Size"], ["resize", "⤡", "Width × height"], ["dims", "↔ mm", "Dimensions"], ["fillet", "⌒", "Fillet"], ["chamfer", "⌜", "Chamfer"], ["ver", "◈", "Versions"], ["dup", "⧉", "Copy"], ["del", "🗑", "Delete"], ["undo", "↶", "Undo"], ["redo", "↷", "Redo"]] },
  { g: "View", items: [["fit", "⤢", "Zoom to fit"], ["snap", "⌗", "Snap"], ["fs", "⛶", "Full screen"]] },
];
let paletteQ = "";
function renderQuickBar() {
  const qb = $("quickBar"); if (!qb || !sketch) return;
  const on = screen() === "make" && S.src === "shape" && ((S.cur === 1 && isProMode()) || S.shapeFs);
  qb.classList.toggle("hidden", !on);
  const grid = qb.closest(".cutgrid"); if (grid) grid.classList.toggle("with-qb", on);
  if (!on) { qb.innerHTML = ""; return; }
  const one = sketch.selected(), any = sketch.picked().length > 0, many = sketch.picked().length > 1;
  const locked = sketch.picked().some((i) => i.lock);
  const hasVer = !!(one && variantsFor(one.type).length);
  const dis = {
    undo: !sketch.past.length, redo: !sketch.future.length,
    dup: !any, del: !any || locked, rot: !any || locked, mir: !any || locked,
    size: !one || locked, resize: !one || locked, ver: !hasVer || locked, join: !many || locked, subtract: !many || locked,
    offset: !one || locked, linarray: !one || locked, polar: !one || locked,
    alignl: !many, alignb: !many, edge: !(one && one.type === "custom"),
  };
  const onCls = { snap: !!sketch.opts.snap, draw: sketch.tool === "draw", measure: sketch.tool === "measure", fs: S.shapeFs, size: !!one };
  // UX2 fix: a greyed tool says why (tooltip + screen reader label)
  const whyOff = (id) => {
    if (id === "undo") return "nothing to undo"; if (id === "redo") return "nothing to redo";
    if (locked && !["undo", "redo"].includes(id) && any) return "the selected shape is locked";
    if (id === "join" || id === "subtract" || id === "alignl" || id === "alignb") return "select two or more shapes first";
    if (id === "edge") return "select a drawn or joined outline first (Draw outline, then tap it)";
    if (id === "ver") return "this shape has no versions";
    if (["size", "resize", "offset", "linarray", "polar"].includes(id)) return "select one shape first";
    return "select a shape first";
  };
  const HINTS = { rot: "R", mir: "M", undo: "Ctrl+Z", redo: "Ctrl+Y", del: "Del", dup: "Ctrl+D", fit: "F", fs: "Esc", join: "Ctrl+J", snap: "S", rect: "1", disc: "2" };
  const B = (id, icon, label) => {
    const hint = (sketch.opts.pro && HINTS[id]) ? HINTS[id] : "";
    const title = hint ? `${label} (${hint})` : label;
    const kbd = hint ? ` <kbd>${esc(hint)}</kbd>` : "";
    const why = dis[id] ? ` \u2013 ${whyOff(id)}` : "";
    return `<button type="button" data-qb="${id}" class="${onCls[id] ? "on" : ""}${id === "del" ? " danger" : ""}" ${dis[id] ? 'aria-disabled="true"' : ""} data-why="${esc(dis[id] ? whyOff(id) : "")}" data-label="${esc(label)}" title="${esc(title + why)}" aria-label="${esc(title + why)}"><i>${icon}</i><span>${esc(label)}${kbd}</span></button>`;
  };
  const q = paletteQ;
  const parts = [`<div class="qb-search"><input id="qbSearch" type="search" placeholder="Search tools" aria-label="Search tools" value="${esc(q)}" autocomplete="off"></div>`];
  for (const grp of PALETTE) {
    const items = grp.items.filter(([id, , lab]) => !q || matchesQuery(lab + " " + id + " " + grp.g, q));
    if (!items.length) continue;
    parts.push(`<div class="qb-group" role="heading" aria-level="3">${esc(grp.g)}</div>`);
    parts.push(...items.map(([id, ic, lab]) => B(id, ic, lab)));
  }
  if (parts.length === 1) parts.push(`<p class="muted small">No tool matches “${esc(q)}”.</p>`);
  const hadFocus = document.activeElement && document.activeElement.id === "qbSearch";
  qb.innerHTML = parts.join("");
  if (hadFocus) { const s = $("qbSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

function quickAction(a) {
  switch (a) {
    case "rect": case "disc": case "triangle": case "slot": case "sector": case "hole": case "slothole": case "boltcircle":
      if (shapeDef(a)) sketch.add(a); else toast("That shape isn't available.", true); break;
    case "lib": openLibrary(); break;
    case "undo": sketch.undo(); break;
    case "redo": sketch.redo(); break;
    case "dup": sketch.duplicate(); break;
    case "del": sketch.remove(); break;
    case "rot": sketch.rotateBy(90); break;
    case "mir": sketch.mirror(); break;
    case "size": { const d = sizeDimForSelection(); if (d) openDimEdit(d); else toast("Tap one shape first."); break; }
    case "resize": openResize(); break;
    case "ver": openVersions(); break;
    case "fit": sketch.fitView(); break;
    case "snap": sketch.opts.snap = sketch.opts.snap ? 0 : 1; try { sketch.saveOpts && sketch.saveOpts(); } catch (e) { /* ignore */ } sketch.draw(); toast(sketch.opts.snap ? "Snap on (1 mm)" : "Snap off"); break;
    case "draw": case "measure": case "nest": case "offset": case "linarray": case "polar": case "subtract":
      runPro(a); break;
    case "join": sketch.join(); break;
    case "alignl": sketch.align("left"); break;
    case "alignb": sketch.align("bottom"); break;
    case "edge": { const ep = $("edgePanel"); if (ep) { ep.classList.remove("hidden"); ep.scrollIntoView({ block: "nearest" }); } toast("Tap an edge on the outline, then change its length, angle or curve."); break; }
    case "fs": setShapeFs(!S.shapeFs); break;
    case "dims": { const d = sizeDimForSelection(); if (d) openDimEdit(d); else toast("Tap a blue size on the drawing, then type the new number."); break; }
    case "fillet":
      openCad("Fillet a corner", [{ id: "r", label: "Radius (mm)", value: 5 }], (v) => {
        if (!(v.r > 0)) { toast("Enter a radius.", true); return; }
        if (sketch.edgeInfo && sketch.edgeInfo()) { sketch.setEdgeCurve({ radius: v.r }); toast("Corner filleted."); }
        else toast("Tap an edge on a custom outline first (Draw outline, then Edit edge), then Fillet.");
      });
      break;
    case "chamfer":
      openCad("Chamfer / flatten an edge", [{ id: "none", label: "Tap an edge first. This makes that edge straight. Use a chamfered rectangle from the library for a ready-made chamfer.", value: "", text: true }], () => {
        if (sketch.edgeInfo && sketch.edgeInfo()) { sketch.setEdgeCurve({}); toast("Edge flattened. Adjust the corners by dragging."); }
        else toast("Tap an edge first, or add a Chamfer rectangle from All shapes.");
      });
      break;
  }
  renderQuickBar();
}
function syncProToAccount() {
  if (Acc.isSignedIn()) Acc.setMode(sketch.opts.pro ? "pro" : "beginner").catch(() => {});
}

// ---- full-screen "Make a shape" editor
function setShapeFs(on) {
  on = !!on;
  if (S.shapeFs === on && document.body.classList.contains("shape-fs") === on) {
    if (on && S.src !== "shape") showSource("shape");
    if (on && S.cur !== 1) goStep(1);
    renderQuickBar();
    return;
  }
  S.shapeFs = on;
  if (on && S.src !== "shape") { showSource("shape"); }
  if (on && S.cur !== 1) goStep(1);
  document.body.classList.toggle("shape-fs", on);
  const bar = $("fsBar"); if (bar) { bar.classList.toggle("hidden", !on); bar.hidden = !on; }
  if (on && !sketch.opts.pro) { /* every tool is in the palette; Pro only adds the side panel */ }
  renderQuickBar();
  setTimeout(() => { try { sketch.resize && sketch.resize(); } catch (e) { /* ignore */ } sketch.fitView(); drawPreview(); }, 30);
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

function dimSeedOf(dim) {
  const seed = { w: () => { const b = sketch.boxOf(dim.it); return b[2] - b[0]; },
    h: () => { const b = sketch.boxOf(dim.it); return b[3] - b[1]; },
    d: () => { const b = sketch.boxOf(dim.it); return b[2] - b[0]; },
    x: () => sketch.boxOf(dim.it)[0], y: () => sketch.boxOf(dim.it)[1],
    hx: () => dim._v, hy: () => dim._v,
    "edge-len": () => dim._v }[dim.kind];
  return seed ? seed() : null;
}
function applyDimValue(dim, v) {
  const isSize = dim.kind === "w" || dim.kind === "h" || dim.kind === "d";
  if (isSize && (v < 2 || v > (sketch.maxMm || 2600))) { toast("Size must be at least 2 mm and no bigger than the table.", true); return false; }
  if (dim.kind === "w") sketch.setWidth(v);
  else if (dim.kind === "h") sketch.setHeight(v);
  else if (dim.kind === "d") sketch.setDiameter(v);
  else if (dim.kind === "x" || dim.kind === "y") sketch.setPos(dim.kind, v);
  else if (dim.kind === "hx" || dim.kind === "hy") sketch.setHoleOffset(dim.kind === "hx" ? "x" : "y", v);
  else if (dim.kind === "edge-len") sketch.setEdgeLength(v, ($("edgeFixed") && $("edgeFixed").value) || "start");
  else return false;
  return true;
}
function positionDimEdit(dim) {
  const box = $("dimEdit"); if (!box) return;
  let x = 16, y = 80;
  if (dim && Number.isFinite(dim.x) && Number.isFinite(dim.y)) { x = dim.x; y = dim.y + 12; }
  else {
    const cv = $("preview");
    if (cv) { const r = cv.getBoundingClientRect(); x = r.left + 16; y = r.top + 16; }
  }
  const w = Math.min(280, innerWidth - 24), h = 120;
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  y = Math.max(8, Math.min(y, innerHeight - h - 8));
  box.style.left = x + "px"; box.style.top = y + "px";
}
function dimHitsList() {
  try { sketch.draw(); } catch (e) { /* ignore */ }
  return (sketch && sketch.dimHits) ? sketch.dimHits.slice() : [];
}
function openDimEdit(dim) {
  const box = $("dimEdit"), inp = $("dimEditInput");
  if (!box || !inp || !dim) return;
  box._dim = dim;
  $("dimEditLabel").textContent = dim.label || "Size (mm)";
  const seed = dimSeedOf(dim);
  inp.value = seed != null && Number.isFinite(seed) ? String(Math.round(seed * 1000) / 1000) : "";
  box.classList.remove("hidden"); box.hidden = false;
  positionDimEdit(dim);
  requestAnimationFrame(() => { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } });
}
function closeDimEdit() {
  const box = $("dimEdit"); if (!box) return;
  box.classList.add("hidden"); box.hidden = true; box._dim = null;
  S.uiBlockUntil = Date.now() + 450;
}
function applyDimEdit() {
  const box = $("dimEdit"), inp = $("dimEditInput");
  if (!box || !inp || !box._dim) return false;
  const raw = inp.value.trim();
  const v = evalExpr(raw);
  if (!Number.isFinite(v)) { toast("Use a number, or something like 100/2 or (30+10)/2", true); return false; }
  if (!applyDimValue(box._dim, v)) return false;
  closeDimEdit();
  return true;
}
function nudgeDimEdit(dir) {
  const box = $("dimEdit"), inp = $("dimEditInput");
  if (!box || !inp || !box._dim) return;
  const cur = evalExpr(inp.value.trim());
  if (!Number.isFinite(cur)) return;
  const step = (sketch && sketch.opts && sketch.opts.snap) ? sketch.opts.snap : 1;
  const next = Math.round((cur + dir * step) * 1000) / 1000;
  inp.value = String(next);
  applyDimValue(box._dim, next);
  inp.select();
}
function tabDimEdit() {
  const box = $("dimEdit"); if (!box || !box._dim) return;
  const hits = dimHitsList();
  if (!hits.length) return;
  const cur = box._dim;
  let i = hits.findIndex((h) => h.it === cur.it && h.kind === cur.kind);
  if (i < 0) i = 0;
  const next = hits[(i + 1) % hits.length];
  openDimEdit(next);
}
// Kept names so existing tests and onDimTap hooks still work. The on-screen
// calculator pad stays in the DOM but is no longer opened.
function openNumPad(dim) { openDimEdit(dim); }
function closeNumPad() { closeDimEdit(); }

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
  R2.designChanged(c.length);
  const nx = Number($("cpX").value) || 1, ny = Number($("cpY").value) || 1;
  if (nx * ny > 1) c = copies(c, nx, ny, Number($("cpGap").value) || 0);
  S.design = { name: sketch.name() + (nx * ny > 1 ? ` ×${nx * ny}` : ""), contours: c, warnings: [] };
  S.gcode = null; S.fileName = S.design.name;
  loadJob();
}
// "Straight cut / sheet trim": one line, no drawing. Optionally a typed start point (needs the machine homed).
function useStraight(dir, L, sx, sy) {
  if (S.shapeFs) setShapeFs(false);
  showSource("file");
  const pts = dir === "y" ? [[0, 0], [0, L]] : [[0, 0], [L, 0]];
  S.design = { name: `Straight cut ${L} mm along ${dir.toUpperCase()}`, contours: [{ pts, closed: false }], warnings: [], straight: true };
  S.gcode = null; S.fileName = S.design.name;
  R2.designChanged(-2);
  loadJob();
  if (!S.prepared) return;
  if (sx != null || sy != null) {
    if (!S.connected) toast("Connect (or try the demo) to type a start point. You can set it in Get set up instead.", true);
    else if (!S.safety.referenced) toast("Home the machine first, then a typed start point can be used.", true);
    else {
      const mp = S.status.MPos || [0, 0, 0], cur = toView(mp[0], mp[1]);
      const X = Number.isFinite(sx) ? sx : cur[0], Y = Number.isFinite(sy) ? sy : cur[1];
      const [mx, my] = fromView(X, Y);
      if (cmd("set_origin", { x: mx, y: my })) { S.zeroSet = true; toast(`Start point set at X ${Math.round(X)}, Y ${Math.round(Y)} mm. The torch did not move.`); }
    }
  }
  goStep(3);
}
function showSource(src, opts) {
  S.src = src; S.bgChoosing = false;
  $("srcShape").classList.toggle("hidden", src !== "shape");
  if (src === "shape") {
    renderShapeForm(); useShape();
    if (isProMode() && screen() === "make" && !S.shapeFs && !(opts && opts.noFs)) setShapeFs(true);
  }
  drawPreview();
}

function recentList() {
  try { return JSON.parse(localStorage.getItem("plasma.recent") || "[]"); } catch (e) { return []; }
}
function saveRecent(name, text, scale) {
  try {
    const list = recentList().filter((r) => r.name !== name);
    list.unshift({ name, text, scale: scale && scale !== 1 ? scale : undefined });
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
function chartPresetOptions() {
  const out = [];
  for (const m of (S.chart && S.chart.materials) || []) {
    for (const r of m.rows || []) {
      out.push({
        id: m.name + "|" + r.thickness_mm,
        label: m.name + " " + r.thickness_mm + " mm",
        material: m.name, thickness_mm: r.thickness_mm,
        cut_speed_mm_min: r.feed_mm_min, pierce_delay_s: r.pierce_delay_s,
        pierce_height_mm: r.pierce_height_mm, cut_height_mm: r.cut_height_mm, kerf_mm: r.kerf_mm,
      });
    }
  }
  return out;
}
function renderMatPreset(extra) {
  const sel = $("matPreset"); if (!sel) return;
  const opts = chartPresetOptions();
  for (const p of extra || []) {
    const id = (p.id || (p.material + "|" + p.thickness_mm));
    if (!opts.some((x) => x.material === p.material && Number(x.thickness_mm) === Number(p.thickness_mm))) {
      opts.push({ id, label: (p.name || p.material || "Preset") + " " + p.thickness_mm + " mm", ...p });
    }
  }
  const cur = String(S.material) + "|" + String(S.thickness);
  sel.innerHTML = opts.map((p) => {
    const id = p.id || (p.material + "|" + p.thickness_mm);
    const selc = p.material === S.material && Number(p.thickness_mm) === Number(S.thickness) ? " selected" : "";
    return `<option value="${esc(id)}"${selc}>${esc(p.label || id)}</option>`;
  }).join("");
  if (!opts.some((p) => p.material === S.material && Number(p.thickness_mm) === Number(S.thickness)) && cur) {
    sel.insertAdjacentHTML("afterbegin", `<option value="${esc(cur)}" selected>${esc(S.material + " " + S.thickness + " mm")}</option>`);
  }
  if (!extra) refreshPublishedPresets().then((rows) => { if (Array.isArray(rows) && rows.length) renderMatPreset(rows); }).catch(() => {});   // (only when not already given the rows: otherwise it re-asks forever and freezes the page once a local preset exists)
}
function applyMatPreset(id) {
  const all = chartPresetOptions();
  let p = all.find((x) => x.id === id || (x.material + "|" + x.thickness_mm) === id);
  if (!p) {
    const [mat, th] = String(id).split("|");
    p = { material: mat, thickness_mm: Number(th) };
  }
  applyPresetRow(p);
}
function sendConsoleLine(raw, inputEl) {
  const l = String(raw || "").trim();
  if (!l) return;
  // STOP / realtime bytes are never behind the account lock, the Idle check or a confirm
  const live = l === "!" || l === "?" || l === "~" || l === "\x18";
  if (!live && !requireMachine(lockText())) return;
  let f = filterConsoleCommand(l);
  if (!live && estopOn()) {
    const p = filterConsoleCommand(l, { allowTorch: true });
    if (p.send === "$H" || p.moves || p.needsTorchConfirm || /(^|\s)M0*[34](?!\d)/i.test(p.send || "")) { toast("E-STOP is ON. Press and hold the red button to reset it first.", true); return; }
  }
  if (!live) {
    // Same rules as the admin console: nothing is queued behind a running cut, and anything that moves the machine,
    // lights the torch or writes a $ setting needs the controller to be Idle.
    if (M.jobRunning()) { toast("A job is running. Press STOP, or wait until it finishes.", true); return; }
    const needsIdle = f.needsTorchConfirm || f.moves || /^\$\d/.test(f.send || "") || f.send === "$H";
    if (M.grbl && needsIdle && M.state() !== "Idle") { toast("The machine must be Idle (it is " + M.state() + ").", true); return; }
  }
  if (f.needsTorchConfirm) {
    if (!confirm("Send " + l + "?\n\nThis would fire the torch. Torch over scrap, earth clamp on, hands clear.\n\nSTOP stays available.")) return;
    f = filterConsoleCommand(l, { allowTorch: true });
  }
  if (!f.ok) { toast(f.reason, true); return; }
  if (f.confirm && !confirm("Send " + f.send + "?\n\n" + f.confirm.join("\n") + "\n\nSTOP stays available.")) return;
  if (f.send === "!") { cmd("stop"); }
  else if (f.send === "\x18") { cmd("reset"); }
  else cmd("console", { line: f.send, allowTorch: !!f.send && /M[34]/.test(f.send) });
  if (inputEl) inputEl.value = "";
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
  const auto = (v) => `Auto (${v})`;
  $("ovDelay").placeholder = auto(r.pierce_delay_s);
  $("ovKerf").placeholder = auto(r.kerf_mm ?? S.chart.kerf_mm ?? 1.5); $("ovLead").placeholder = auto(r.lead_in_mm ?? S.chart.lead_in_mm ?? 3);
  $("ovPierce").placeholder = auto(r.pierce_height_mm ?? S.chart.pierce_height_mm); $("ovCut").placeholder = auto(r.cut_height_mm ?? S.chart.cut_height_mm);
  $("ampsCard").innerHTML = `
    <div>Set the plasma to</div>
    <div class="big">${r.amps} A</div>
    <div class="sub"><span>Air <b>${r.air_bar ?? S.chart.air_bar} bar</b></span><span>Pierce <b>${o.pierce_delay_s || r.pierce_delay_s} s</b> at <b>${ph} mm</b></span><span>Cut height <b>${ch} mm</b></span></div>
    ${r.note ? `<div class="ampsnote">⚠ ${esc(r.note)}</div>` : ""}`;
  try { localStorage.setItem("plasma.material", JSON.stringify({ m: S.material, t: S.thickness })); } catch (e) { /* ignore */ }
  renderSpeed();
  renderMatPreset();
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
function applyMatchingPreset() {
  try {
    const p = matchPreset(S.material, S.thickness);
    if (!p) return;
    if (!savedSpeed() && p.cut_speed_mm_min) S.speed = Number(p.cut_speed_mm_min) || S.speed;
    const set = (id, v) => { const el = $(id); if (el && v != null && v !== "") el.value = String(v); };
    set("ovDelay", p.pierce_delay_s);
    set("ovPierce", p.pierce_height_mm);
    set("ovCut", p.cut_height_mm);
    set("ovKerf", p.kerf_mm);
    if (p.feed_mm_min && !savedSpeed()) S.speed = Number(p.feed_mm_min) || S.speed;
  } catch (e) { /* ignore */ }
}
function applyPresetRow(p) {
  if (!p) return;
  if (p.material) S.material = p.material;
  if (p.thickness_mm != null) S.thickness = Number(p.thickness_mm);
  if (p.cut_speed_mm_min) S.speed = Number(p.cut_speed_mm_min);
  else if (p.feed_mm_min) S.speed = Number(p.feed_mm_min);
  const set = (id, v) => { const el = $(id); if (el && v != null && v !== "") el.value = String(v); };
  set("ovDelay", p.pierce_delay_s);
  set("ovPierce", p.pierce_height_mm);
  set("ovCut", p.cut_height_mm);
  set("ovKerf", p.kerf_mm);
  renderMaterials();
  loadJob();
}
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
    <div class="cchead">Cut check <span>· ${esc(mat)}</span></div>
    ${chk.groups.length ? `<ol>${chk.groups.map((g) => `<li class="${g.level}"><b>${g.n}</b><span>${g.spots.length > 1 ? `<i>${g.spots.length} places:</i> ` : ""}${esc(g.text)}</span></li>`).join("")}</ol>`
      : `<p class="ok">✓ Looks cuttable – nothing too small, thin or close for ${esc(mat)}.</p>`}`;
  const tabBtn = chk && !S.cam.tabs && chk.groups.some((g) => /slats|tip/i.test(g.text))
    ? `<div class="row"><button type="button" class="small" data-r2act="tabs">Add 2 hold-down tabs per part</button></div>` : "";
  // Round 5: the cut check is for cutting, not for designing. While you make a part nothing is flagged (no panel, no marks on the
  // drawing); it is shown on the cutting screen, when a file is loaded or the part has been sent to be cut.
  const cutting = screen() === "cut";
  $("cutCheck").innerHTML = "";
  $("cutCheck2").innerHTML = html + tabBtn;
  if ($("cutCheck3")) $("cutCheck3").innerHTML = cutting ? html + tabBtn : "";
  if (sketch) sketch.setMarks(cutting && S.src === "shape" && chk ? chk.issues : []);
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
      cam = designToGcode(S.design.contours, { kerf: kerfNow(), leadIn: leadNow(), name: S.fileName, keepOrigin: !!(S.sheetMode && S.src === "shape" && !S.design.straight), ...R2.camOpts() });
      gcode = cam.gcode;
      pre = [...(S.design.warnings || []), ...cam.warnings];
      if (S.design.straight) pre = pre.filter((w) => !/aren't closed shapes/.test(w));
    }
    S.prepared = M.loadJob({ gcode, name: S.fileName, material: S.material, thickness: S.thickness,
      dry_run: $("dryRun").checked, overrides: overrides() });
    if (cam) { Object.assign(S.prepared, { outline: cam.outline, summary: cam.summary, shift: cam.shift, cutInfo: cam.cutInfo, allCuts: cam.allCuts, autoOrder: cam.autoOrder }); }
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
  R2.paintCutList(); R2.paintStartCut();
  refresh();
}
// where the start point is, in table view coordinates (the one being dragged wins)
function originView() { const w = wcoNow(); return toView(w[0], w[1]); }
function fromView(vx, vy) { return S.safety.referenced ? [vx + S.safety.ref[0], vy + S.safety.ref[1]] : [vx, vy]; }
function wcoNow() {
  const st = S.status;
  return st.MPos && st.WPos ? st.MPos.map((v, i) => v - st.WPos[i]) : [0, 0, 0];
}
const edgesOn = () => !!(S.safety.limits && S.safety.referenced);
function toView(mx, my) { return S.safety.referenced ? [mx - S.safety.ref[0], my - S.safety.ref[1]] : [mx, my]; }
// the machine's reachable area written in the sheet picture's coordinates (the work zero = the sheet's bottom-left corner)
function workAreaSheet() {
  if (!edgesOn()) return null;
  const w = wcoNow(), ref = S.safety.ref, L = S.safety.limits;
  return { x: [L.x[0] - w[0] + ref[0], L.x[1] - w[0] + ref[0]], y: [L.y[0] - w[1] + ref[1], L.y[1] - w[1] + ref[1]] };
}
function viewArea() {
  if (edgesOn()) return { x: S.safety.limits.x, y: S.safety.limits.y, label: "machine edges" };
  const t = S.cfg.travel_mm;
  return { x: [0, t.x], y: [0, t.y], label: "table" };
}
function fit() {
  if (!S.prepared) return { cls: "", text: "" };
  if (!S.safety.limits) return { cls: "unknown", text: S.demo ? "Demo: tap here and the edges are set up for you." : "Edges not set up – can't check it fits (Machine setup tab)." };
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
  const grid = cv && cv.closest(".cutgrid");
  if (grid) grid.classList.toggle("nofile", screen() === "cut" && S.cur === 1 && !S.prepared);
  if (!cv || !cv.offsetParent) return;
  const editing = !!sketch && S.src === "shape" && (screen() === "make" ? S.cur === 1 : (S.cur === 3 && Setup.layoutActive()));
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
  const fill = document.body.classList.contains("short-land") || document.body.classList.contains("app-shell") || document.body.classList.contains("shape-fs");
  if (fill) {
    const box = cv.closest(".previewPane") || cv.parentElement;
    const dock = box && box.querySelector(".previewDock");
    const avail = box ? (box.clientHeight - (dock ? dock.offsetHeight : 0)) : 0;
    h = Math.max(120, avail || cv.clientHeight || 200);
  }
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  if (fill) cv.style.height = "";
  else cv.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const C = {
    canvas: themeColor("--cad-canvas", "#FFFFFF"),
    partLine: themeColor("--cad-part-line", "#334155"),
    sel: themeColor("--cad-sel", "#0078D4"),
    lock: themeColor("--cad-lock", "#C05600"),
    label: themeColor("--cad-label", "#4B5563"),
    tagText: themeColor("--cad-tag-text", "#FFFFFF"),
    danger: themeColor("--cad-danger", "#C42B1C"),
    go: themeColor("--go", "#0F7B3A"),
    bed: themeColor("--cad-grid", "#ECEEF1"),
    slat: themeColor("--cad-grid-major", "#D5DAE0"),
  };
  ctx.fillStyle = C.canvas; ctx.fillRect(0, 0, w, h);
  const pad = 12, sc = Math.min((w - 2 * pad) / ax, (h - 2 * pad) / ay);
  const offX = (w - ax * sc) / 2, offY = (h - ay * sc) / 2;
  const X = (x) => offX + (x - A.x[0]) * sc, Y = (y) => h - offY - (y - A.y[0]) * sc;
  cv._zmap = main && zoom ? { toMm: (px, py) => [A.x[0] + (px - offX) / sc, A.y[0] + (h - offY - py) / sc], toPx: (x, y) => [X(x), Y(y)] } : null;
  cv._map = zoom ? null : { toMm: (px, py) => [A.x[0] + (px - offX) / sc, A.y[0] + (h - offY - py) / sc], toPx: (x, y) => [X(x), Y(y)], sc, T: A.table };
  if (!zoom) drawMachineBed(ctx, A.table, X, Y, sc);
  if (S.prepared) {
    const pv = S.prepared.preview;
    const path = (p) => { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + ox), Y(y + oy)) : ctx.moveTo(X(x + ox), Y(y + oy)))); ctx.stroke(); };
    if (S.prepared.outline) { ctx.strokeStyle = C.partLine; ctx.lineWidth = 1; S.prepared.outline.forEach((p) => path([...p, p[0]])); }
    if (pv && Array.isArray(pv.rapids)) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C.label; ctx.lineWidth = 1; pv.rapids.forEach(path);
    }
    ctx.setLineDash([]); ctx.strokeStyle = fit().bad ? C.danger : C.lock; ctx.lineWidth = zoom ? 2.5 : 2;
    const playing = main && R2.playActive();
    if (playing) ctx.globalAlpha = 0.22;
    for (const p of (pv && pv.cuts) || []) { path(p); ctx.fillStyle = C.lock; ctx.beginPath(); ctx.arc(X(p[0][0] + ox), Y(p[0][1] + oy), zoom ? 4 : 3, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (playing) R2.drawPlay(ctx, X, Y, ox, oy, C, zoom);
    if (main && !S.job) R2.drawNumbers(ctx, X, Y, ox, oy, C);
    if (main && zoom) R2.drawHandles(ctx, X, Y, C);
    if (zoom && S.prepared.marks) S.prepared.marks.forEach((m) => {     // cut check markers
      const col = m.level === "error" ? C.danger : m.level === "warn" ? C.lock : C.sel;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(m.at[0]), Y(m.at[1]), 10, 0, 7); ctx.fill();
      ctx.strokeStyle = C.canvas; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.tagText; ctx.font = "bold 12px Barlow, system-ui"; ctx.textAlign = "center";
      ctx.fillText(String(m.n), X(m.at[0]), Y(m.at[1]) + 4); ctx.textAlign = "start";
    });
    if (zoom) {
      ctx.fillStyle = C.label; ctx.font = "12px system-ui";
      ctx.fillText("orange: torch path   grey: your part   dots: where it pierces", 8, h - 8);
    }
  }
  ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(ox) - 9, Y(oy)); ctx.lineTo(X(ox) + 9, Y(oy)); ctx.moveTo(X(ox), Y(oy) - 9); ctx.lineTo(X(ox), Y(oy) + 9); ctx.stroke();
  if (!zoom) drawGantry(ctx, A.table, X, Y, sc);
}

// ---- bird's-eye view of the machine (HMM-style: X beam along the front, Y arm cantilevered across the table,
// torch on a plate on the left face of the arm). Sizes in mm.
const MACH = { beamH: 50, armW: 50, plate: 26, torchOff: 30, carW: 190, carD: 120, motor: 57 };
function drawMachineBed(ctx, T, X, Y, sc) {
  const [x0, x1] = T.x, [y0, y1] = T.y;
  const R = (x, y, w, h) => [X(x), Y(y + h), w * sc, h * sc];
  // water tray / table
  ctx.fillStyle = themeColor("--cad-grid", "#ECEEF1"); ctx.fillRect(...R(x0, y0, x1 - x0, y1 - y0));
  if (S.showMachine) {
    ctx.strokeStyle = themeColor("--cad-grid-major", "#D5DAE0"); ctx.lineWidth = Math.max(1, 3 * sc);                 // slats every 100 mm
    ctx.beginPath();
    for (let x = Math.ceil((x0 + 1) / 100) * 100; x < x1; x += 100) { ctx.moveTo(X(x), Y(y0)); ctx.lineTo(X(x), Y(y1)); }
    ctx.stroke();
    ctx.strokeStyle = themeColor("--line", "#D0D5DD"); ctx.lineWidth = 1; ctx.beginPath();                  // slat teeth (light)
    for (let y = y0 + 50; y < y1; y += 50) for (let x = Math.ceil((x0 + 1) / 100) * 100; x < x1; x += 100) { ctx.moveTo(X(x) - 2, Y(y)); ctx.lineTo(X(x) + 2, Y(y)); }
    ctx.stroke();
  }
  ctx.strokeStyle = edgesOn() ? themeColor("--go", "#0F7B3A") : themeColor("--line-strong", "#B8BFC9"); ctx.lineWidth = edgesOn() ? 2 : 1;
  ctx.strokeRect(...R(x0, y0, x1 - x0, y1 - y0));
  ctx.fillStyle = themeColor("--cad-label", "#4B5563"); ctx.font = "12px Barlow, system-ui";
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
    ctx.fillStyle = S.status.torch ? themeColor("--torch", "#C05600") : themeColor("--text", "#1F2A37");
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
  if (S.status.torch) { ctx.fillStyle = "rgba(192,86,0,.38)"; ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 2.4, 0, 7); ctx.fill(); }
  ctx.fillStyle = S.status.torch ? themeColor("--torch", "#C05600") : themeColor("--text", "#1F2A37");
  ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 0.75, 0, 7); ctx.fill();
  ctx.strokeStyle = "#121920"; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(X(tx) - r, Y(ty)); ctx.lineTo(X(tx) + r, Y(ty)); ctx.moveTo(X(tx), Y(ty) - r); ctx.lineTo(X(tx), Y(ty) + r); ctx.stroke();
}

// ------------------------------------------------------------------ step 3 (second half): checks
function renderChecklist() {
  const dry = S.prepared && S.prepared.dry_run;
  const w = wcoNow();
  const zeroLine = S.zeroSet
    ? `Start point set at ${Number(w[0]).toFixed(1)}, ${Number(w[1]).toFixed(1)} mm`
    : "Start point set (press Start here in “Connect, home and set the start point” above)";
  const items = dry ? [zeroLine, "Practice run: torch will stay OFF", "Hands clear, e-stop within reach"]
    : [zeroLine, ...(row().check ? [row().check] : []), `Plasma ON and set to ${row().amps} A`, `Air on, ${row().air_bar ?? S.chart.air_bar} bar at the plasma gauge`, "Earth clamp on the sheet", "Hands clear, e-stop within reach"];
  $("checklist").innerHTML = items.map((t, i) => {
    const auto = i === 0 && S.zeroSet;
    return `<li><label><input type="checkbox" data-chk="${i}" ${auto ? "checked disabled" : ""}> ${esc(t)}</label></li>`;
  }).join("");
  const cm = $("checkMat");
  if (cm) cm.textContent = S.material && S.thickness != null ? `${S.material} · ${S.thickness} mm` : "";
  const zw = $("zeroWarn");
  if (zw) zw.classList.toggle("hidden", !!S.zeroSet);
  refresh();
}
// Round 5 (safety): Score and Mark are only labels. The torch here is on/off (M3 S1000 / M5) and the plasma power is set by hand at the
// unit, so the G-code can't cut a line lighter. Rather than silently cut those lines through at full power, Start is blocked.
function scoreMarkCount() {
  if (!sketch || S.src !== "shape") return 0;
  return sketch.items.filter((it) => (it.op === "score" || it.op === "mark") && !sketch.layerHidden(it)).length;
}
export const SCORE_MARK_WHY = "can't be scored or marked: this table's torch only switches on and off (the plasma power is set at the unit), so the line would be cut right through at full power.";
function scoreMarkProblem() {
  const n = scoreMarkCount();
  return n ? `${n} shape${n === 1 ? " is" : "s are"} set to Score or Mark, which ${SCORE_MARK_WHY} Change ${n === 1 ? "it" : "them"} back to Cut, or hide the Score/Mark layer, in the shape settings.` : "";
}
function blockers() {
  const b = [];
  if (!S.connected) b.push("Not connected to the table.");
  if (!S.prepared) b.push("No part chosen yet (step 1).");
  if (estopOn()) b.push("E-STOP is ON – press and hold the red button to reset it first.");
  const sm = scoreMarkProblem(); if (sm) b.push(sm);
  if (S.connected && !S.zeroSet) b.push("Start point has not been set. Press Start here in “Connect, home and set the start point” above.");
  const st = S.status.state;
  if (S.connected && st === "Alarm") b.push("Machine is in alarm – press Unlock at the top.");
  else if (S.connected && st !== "Idle") b.push(`Machine is busy (${st}). Wait for it to stop.`);
  const inp = S.status.inputs || {};
  if (inp.estop) b.push("E-stop is pressed – release it and press Unlock.");
  if (inp.probe) b.push("Floating head is pushed up – check the torch isn't touching anything or stuck.");
  if (S.safety.limits && !S.safety.referenced) b.push("Machine needs homing – press Home.");
  if (fit().bad) b.push("The part doesn't fit the machine – move the parts or the sheet's start corner.");
  for (const t of Setup.blockText()) b.push(t);
  const boxes = $$("#checklist input");
  if (boxes.some((x) => !x.checked)) b.push("Tick every box above.");
  return b;
}

// ------------------------------------------------------------------ refresh everything that depends on state
// r3: nothing may cover STOP while this is true (job running or paused, machine doing anything, torch possibly on)
function overlayLive() {
  const st0 = (S.status && S.status.state) || "";
  const busyState = S.connected && !!st0 && !/^(Idle|Check|Sleep)$/i.test(st0);
  return !!(S.job && (S.job.running || S.job.paused)) || busyState || !!(S.status && S.status.torch);
}
// r4: the cutting screen can't be left while this is true: a job running or paused, the machine moving, the torch on,
// or the connection lost mid-cut (the lost-connection banner must be acknowledged first). An alarm alone does not lock it.
function navBusy() {
  const st = (S.status && S.status.state) || "";
  const moving = S.connected && /^(Run|Jog|Home|Cycle|Hold|Door)/i.test(st);
  const lost = $("lostBar") && !$("lostBar").classList.contains("hidden");
  return !!(S.job && (S.job.running || S.job.paused)) || moving || !!(S.connected && S.status && S.status.torch) || !!lost;
}
function paintChrome() {
  const b = document.querySelector(".topbar");
  if (b) document.documentElement.style.setProperty("--topbar-h", Math.ceil(b.getBoundingClientRect().height) + "px");
  const torch = !!(S.status && S.status.torch);
  const pill = $("torchPill");
  if (pill) {
    pill.hidden = !S.connected;       // no TORCH OFF until a machine is connected
    pill.textContent = torch ? "TORCH ON" : "TORCH OFF";
    pill.classList.toggle("on", torch);
    pill.classList.toggle("off", !torch);
  }
  const mode = $("modeChip");
  if (mode) {
    let label = "";
    if (S.connected && S.demo) label = "";
    else if (S.connected && S.fluidnc) label = "FluidNC";
    else if (S.connected) label = "Connected";
    mode.textContent = label;
    mode.classList.toggle("hidden", !label);
  }
  const pr = $("practiceChip");
  if (pr) {
    const on = !!(S.prepared && S.prepared.dry_run) || ($("dryRun") && $("dryRun").checked);
    pr.classList.toggle("hidden", !on);
  }
  const zs = $("zeroState");
  if (zs) {
    if (S.zeroSet) {
      const w = wcoNow();
      zs.textContent = "Start point set at " + Number(w[0]).toFixed(1) + ", " + Number(w[1]).toFixed(1) + " mm.";
      zs.classList.remove("warntext");
    } else {
      zs.textContent = S.connected ? "Not set yet. Put the torch on the sheet's bottom-left corner, then press Start here." : "Connect to the table to set it. On the layout the sheet's bottom-left corner is the start point.";
      zs.classList.add("warntext");
    }
  }
  const running = !!(S.job && S.job.running);
  for (const id of ["btnExport3", "btnExport4"]) if ($(id)) $(id).disabled = !S.prepared;
  document.body.classList.toggle("running-job", running);
  // Round 3 safety: while a job runs / is paused / the machine is doing anything / the torch could be on, the portrait
  // "turn sideways" overlay must stay away so STOP and pause are always on screen. It only shows when everything is idle.
  document.body.classList.toggle("job-live", overlayLive());
  document.body.classList.toggle("is-admin", !!Acc.isAdmin());
  paintLock(); estopPaint();
  const lost = S.lastAlarmCode != null && POSITION_LOST_ALARMS.has(S.lastAlarmCode);
  const again = $("btnAgain"), rezero = $("btnRezero");
  if (again && rezero) {
    again.classList.toggle("hidden", !!lost);
    rezero.classList.toggle("hidden", !lost);
  }
}
function refresh() {
  paintChrome();
  setTimeout(paintWhy, 0);
  try { const lt = "🔒 " + lockText(); if ($("startLock").textContent !== lt) { $("startLock").textContent = lt; $("connectLock").textContent = lt; } } catch (e) { /* ignore */ }
  // stats + fit (preview pane)
  const f = fit();
  $("fit").className = "fit " + f.cls;
  $("fit").textContent = f.text;
  $("fit").style.cursor = f.cls === "unknown" ? "pointer" : "";
  $("fit").title = f.cls === "unknown" ? "Open Machine setup" : "";
  if (S.prepared) {
    const st = S.prepared.stats;
    $("jobStats").innerHTML = `<span><b>${esc(S.fileName)}</b></span><span>Size <b>${S.prepared.summary ? `${S.prepared.summary.width} × ${S.prepared.summary.height}` : `${st.width_mm} × ${st.height_mm}`} mm</b></span>
      ${S.prepared.summary ? `<span>Parts <b>${(S.src !== "file" && sketch && sketch.items.length && Setup.partCount(sketch)) || S.prepared.summary.parts}</b> · holes <b>${S.prepared.summary.holes}</b></span>` : `<span>Cuts <b>${st.pierces}</b></span>`}<span>About <b>${fmtTime(st.estimated_seconds)}</b></span>${S.prepared.dry_run ? "<span><b>PRACTICE RUN</b></span>" : ""}`;
  } else $("jobStats").innerHTML = "";
  $("next1").disabled = !S.prepared;
  R2.updatePlayRow(); R2.paintRestart(); R2.paintDelay(); paintGuide();
  if ($("btnEditDrawing")) $("btnEditDrawing").classList.toggle("hidden", !(S.design && !S.design.straight && S.src === "file" && S.design.contours && S.design.contours.length));
  paintBedStatus();
  $$("#stepper li").forEach((li) => (li.style.opacity = canGo(Number(li.dataset.step)) ? 1 : 0.4));

  // start button + reasons
  const b = blockers();
  $("btnStart").disabled = b.length > 0 || !machineAllowed();
  $("blockers").innerHTML = b.length && S.cur === 3 ? `Can't start yet:<ul>${b.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";


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
    $("runInfo").textContent = `${clock(P.elapsed)} so far` + (pierces ? ` · cut ${Math.min(pierces, (M.runFrom || 1) - 1 + Math.max(1, P.cut))} of ${pierces}` : "");
    $("runTitle").textContent = S.status.state === "Hold" ? "Paused" : j.running ? "Cutting…" : "Finishing last moves…";
    const hold = S.status.state === "Hold";
    const pauseLabel = hold ? "Resume" : "Pause";
    if ($("btnPause").dataset.face !== pauseLabel) {
      $("btnPause").dataset.face = pauseLabel;
      $("btnPause").innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-${hold ? "play" : "pause"}"></use></svg> ${pauseLabel}`;
    }
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

function paintBedStatus() {
  const box = $("bedStatus"); if (!box) return;
  const n = (sketch && S.src === "shape") ? Setup.partCount(sketch) : 0;
  const what = S.prepared ? (S.src === "file" ? (S.design && S.design.straight ? "a straight cut" : "1 file loaded") : (n ? `${n} part${n === 1 ? "" : "s"} on the bed` : "a file loaded")) : "";
  box.classList.toggle("hidden", !what || screen() !== "cut");
  if (what) $("bedStatusText").textContent = "On the bed now: " + what + ".";
}
function onStatus(st) {
  S.status = st;
  trackProgress(st);
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
async function maybeLogJob(j) {
  if (!j || !Acc.isSignedIn()) return;
  const serial = (Acc.linkedSerials() || [])[0] || null;
  const stats = S.prepared && S.prepared.stats;
  const parts = (sketch && sketch.items && sketch.items.length) || 1;
  if (j.running) {
    // Job progress events arrive many times a second. Log the start ONCE per job (a request still in flight, or a
    // failed one, must not be retried on every event: that flooded job_events with duplicate 'started' rows).
    if (!S.jobLogP && !S.jobLogId) {
      S.jobLoggedEnd = false;
      S.jobLogP = Acc.logJobEvent({ status: "started", serial, partCount: parts, cutLengthMm: stats && stats.cut_length_mm })
        .then((r) => { S.jobLogId = r && r.id; })
        .catch(() => { /* privacy: never block a cut */ });
    }
  } else if (j.result && !S.jobLoggedEnd) {
    S.jobLoggedEnd = true;
    try { if (S.jobLogP) await S.jobLogP; } catch (e) { /* ignore */ }
    try {
      await Acc.logJobEvent({
        status: j.result === "done" ? "finished" : "aborted",
        serial,
        durationS: j.elapsed,
        cutLengthMm: stats && stats.cut_length_mm,
        partCount: parts,
        eventId: S.jobLogId,
      });
    } catch (e) { /* ignore */ }
    S.jobLogId = null; S.jobLogP = null;
  }
}

function onEvent(kind, d) {
  if (kind === "status") {
    const wasHot = d.state === "Disconnected" && S.connected && !S.userDisconnected && (M.jobRunning() || !!(S.status && S.status.torch) || ["Run", "Jog", "Hold", "Home"].includes(S.status && S.status.state));
    onStatus(d);
    if (d.state === "Disconnected") {
      setConnected(false);
      // a dropped link (Wi-Fi, USB pulled) cannot be told to switch the torch off: say so loudly
      if (wasHot && $("lostBar")) { $("lostBar").classList.remove("hidden"); toast("Connection lost while running. The torch may still be ON.", true); }
    }
  } else if (kind === "log") {
    log(d.text, d.level);
    if (S._settingsCapture) S._settingsCapture.push(d.text || "");
    if ($("advConsoleLog")) appendConsole(d.text || "");
    if (looksLikeFluidNC(d.text)) S.fluidnc = true;
  }
  else if (kind === "job") { S.job = d; if (!d.running) keepAwake(false); R2.noteJobEnded(d); maybeLogJob(d); refresh(); }
  else if (kind === "alarm") { S.lastAlarm = d.message; S.lastAlarmCode = d.code; $("alarmTitle").textContent = "Alarm"; $("alarmText").textContent = d.message; if (POSITION_LOST_ALARMS.has(d.code)) S.zeroSet = false; refresh(); }
  else if (kind === "safety") onSafety(d);
}

// ------------------------------------------------------------------ connection
function setConnected(on, label = "") {
  S.connected = on;
  if (on && $("lostBar")) $("lostBar").classList.add("hidden");
  const connLabel = on ? (S.fluidnc ? "FluidNC" : S.demo ? "Practice, nothing moves" : "Connected") : "Not connected";
  $("connPill").innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-dot"></use></svg> ${connLabel}`;
  document.body.classList.toggle("demo-on", !!(on && S.demo));
  $("connPill").className = "pill " + (on ? "on" : "off");
  if (!on) { S.fluidnc = false; S.zeroSet = false; }
  $("stateBadge").classList.toggle("hidden", !on);
  if (on && label) toast("Connected to " + label);
  // the connect card (step "Connect, home and set the start point"): connect buttons while disconnected, Disconnect once connected
  for (const id of ["btnConnect", "btnDemo", "fnBox", "connectHelp"]) if ($(id)) $(id).classList.toggle("hidden", on || (id === "btnConnect" && S.noUsb));
  if ($("btnDisconnect")) $("btnDisconnect").classList.toggle("hidden", !on);
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
    const t = new WiFiTransport(null, S.wifiToken, await Acc.freshAccessToken());
    await t.open();
    await M.connect(t);
    S.demo = null; S.wifi = true; S.wifiUsed = true; S.userDisconnected = false;
    setConnected(true, quiet ? "" : "the table over Wi-Fi");
    if (quiet) toast("Wi-Fi back ✓");
    if (M.grbl.job && M.grbl.job.running) { S.job = M.grbl.jobProgress(); showTab("cut"); goStep(4); }
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
async function connectFluidNC() {
  if (!requireMachine(lockText())) return;
  const host = ($("fnHost") && $("fnHost").value.trim()) || "";
  const port = $("fnPort") ? $("fnPort").value : 81;
  const url = fluidncWsUrl(host, port);
  const mixed = $("fnMixed");
  if (mixed) { mixed.classList.add("hidden"); mixed.textContent = ""; }
  const problem = fluidncUrlProblem(host, port);
  if (problem) { toast(problem, true); return; }
  if (fluidncBlockedByHttps(url)) {
    const msg = fluidncMixedContentMessage();
    if (mixed) { mixed.textContent = msg; mixed.classList.remove("hidden"); }
    toast(msg, true);
    return;
  }
  try {
    const t = new FluidNCTransport(host, port);
    await t.open();
    await M.connect(t);
    S.demo = null; S.fluidnc = true;
    try { localStorage.setItem("plasma.fluidnc.host", host); localStorage.setItem("plasma.fluidnc.port", String(port)); } catch (e) { /* ignore */ }
    setConnected(true, "FluidNC at " + host);
  } catch (e) {
    toast(e.message, true);
    if (mixed && /https|ws:\/\//i.test(e.message)) { mixed.textContent = e.message; mixed.classList.remove("hidden"); }
  }
}
async function connectDemo() {
  const t = new SimTransport({ switchOffset: S.cfg.probe.switch_offset_mm, sheetZ: -15, speedup: 1 });   // real speed
  await t.open();
  await M.connect(t);
  S.demo = t;
  setConnected(true, "the demo (nothing real moves)");
}
async function disconnect() {
  if (M.jobRunning() && !confirm(S.wifi
    ? "A job is running on the Pi. Disconnecting stops it, and the torch may stay on until the Pi stops the job. Disconnect anyway?"
    : "A job is running. Disconnecting now leaves the controller mid-cut — the torch may stay on. Press STOP first if you can. Disconnect anyway?")) return;
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

function fillEdgePanel() {
  const box = $("edgePanel");
  if (!box || !sketch) return;
  const info = sketch.edgeInfo && sketch.edgeInfo();
  const show = !!(info && sketch.isEditableCustom && sketch.isEditableCustom(info.it));
  box.classList.toggle("hidden", !show);
  if (show) box.removeAttribute("hidden"); else box.setAttribute("hidden", "");
  if (!show) return;
  if ($("edgeLen")) $("edgeLen").value = String(Math.round(info.length * 100) / 100);
  if ($("edgeAng")) $("edgeAng").value = String(Math.round((($("edgeAngMode") && $("edgeAngMode").value === "rel" ? info.relAngle : info.angle) || 0) * 10) / 10);
  if ($("edgeBulge")) $("edgeBulge").value = String(Math.round(info.bulge * 1000) / 1000);
  if ($("edgeRad")) $("edgeRad").value = info.radius && Number.isFinite(info.radius) ? String(Math.round(info.radius * 10) / 10) : "";
  if ($("edgeHint")) $("edgeHint").textContent = info.vi != null
    ? "Corner selected. Drag it, or press Delete to remove it (an outline needs at least three corners)."
    : "Edge selected. Set a length, square it up, type an angle, or turn it into a curve. Double-click to add a corner.";
}

function bindEdgePanel() {
  if (!$("edgePanel") || $("edgePanel")._bound) return;
  $("edgePanel")._bound = true;
  $("edgeLenApply") && ($("edgeLenApply").onclick = () => { sketch.setEdgeLength(Number($("edgeLen").value), $("edgeFixed").value); fillEdgePanel(); });
  $("edgeSquare") && ($("edgeSquare").onclick = () => { sketch.squareUpEdge("cardinal"); fillEdgePanel(); });
  $("edgeSquarePrev") && ($("edgeSquarePrev").onclick = () => { sketch.squareUpEdge("prev"); fillEdgePanel(); });
  $("edgeAngApply") && ($("edgeAngApply").onclick = () => { sketch.setEdgeAngle(Number($("edgeAng").value), $("edgeAngMode").value === "rel"); fillEdgePanel(); });
  $("edgeCurve") && ($("edgeCurve").onclick = () => {
    const r = Number($("edgeRad").value), b = Number($("edgeBulge").value);
    if (r > 0) sketch.setEdgeCurve({ radius: r });
    else if (Number.isFinite(b) && $("edgeBulge").value !== "") sketch.setEdgeCurve({ bulge: b });
    else sketch.setEdgeCurve({});
    fillEdgePanel();
  });
  $("edgeStraight") && ($("edgeStraight").onclick = () => { sketch.straightenEdge(); fillEdgePanel(); });
  $("edgeAddV") && ($("edgeAddV").onclick = () => { const e = sketch.edgeSel; if (e) sketch.addVertexOnEdge(e.ci, e.ei); fillEdgePanel(); });
  $("edgeDelV") && ($("edgeDelV").onclick = () => { sketch.deleteVertex(); fillEdgePanel(); });
}

// Admin console / settings: never while a job is cutting (a G-code line or $ write must not interleave with the job),
// and anything that moves the machine or writes a setting only when it is Idle.
// Read $$ from the controller right now and wait for the answer (it ends when no new line arrives for a moment).
async function readControllerSettings() {
  if (!M.grbl) return null;
  S._settingsCapture = [];
  try { M.grbl.send("$$"); M.grbl.send("$I"); } catch (e) { S._settingsCapture = null; return null; }
  const t0 = Date.now(); let last = 0, lastT = Date.now();
  while (Date.now() - t0 < 5000) {
    await new Promise((r) => setTimeout(r, 120));
    const n = (S._settingsCapture || []).length;
    if (n !== last) { last = n; lastT = Date.now(); }
    else if (n > 0 && Date.now() - lastT >= 450) break;
  }
  const lines = S._settingsCapture || [];
  S._settingsCapture = null;
  const map = {};
  for (const l of lines) { const m = String(l).match(/^\$(\d{1,3})=(-?\d+(?:\.\d+)?)\s*(?:\(.*)?$/); if (m) map[Number(m[1])] = Number(m[2]); }
  return { lines, map };
}
// Back up what the controller reports RIGHT NOW (not what the form last showed), check the copy reads back identically,
// save it as a file and keep a second copy on this device. Returns the snapshot, or null when it could not be made.
function takeVerifiedBackup(snap) {
  const ids = Object.keys((snap && snap.map) || {}).sort((a, b) => a - b);
  if (!ids.length) { toast("The controller didn't report any settings, so nothing was written.", true); return null; }
  const body = ids.map((k) => "$" + k + "=" + snap.map[k]).join("\n") + "\n";
  const back = {};
  for (const l of body.split("\n")) { const m = l.match(/^\$(\d+)=(.+)$/); if (m) back[m[1]] = Number(m[2]); }
  if (Object.keys(back).length !== ids.length || ids.some((k) => back[k] !== snap.map[k])) { toast("The settings backup didn't read back correctly, so nothing was written.", true); return null; }
  try { localStorage.setItem("plasma.fw.lastBackup", JSON.stringify({ at: new Date().toISOString(), body })); } catch (e) { /* storage full or blocked: the file is still saved */ }
  const blob = new Blob([body], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "grbl-settings-backup-" + new Date().toISOString().replace(/[:.]/g, "-") + ".txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return { body, count: ids.length };
}
function adminMayTalk(needsIdle) {
  if (M.jobRunning()) { toast("A job is running. Press STOP, or wait until it finishes.", true); return false; }
  if (needsIdle && M.state() !== "Idle") { toast("The machine must be Idle (it is " + M.state() + ").", true); return false; }
  return true;
}
function addTestPattern(kind) {
  if (!sketch) return;
  if (M && M.jobRunning()) { toast("A job is running. Add test patterns after it finishes.", true); return; }
  if (!showScreen("cut")) return;                 // test patterns are for cutting: they land on the bed
  showTab("cut");
  S.src = "shape";
  $("srcShape").classList.remove("hidden");
  goStep(1);
  if (kind === "square") {
    sketch.add("rect");
    const it = sketch.selected(); if (it) { it.p.w = 100; it.p.h = 100; it._key = null; sketch.commit(); sketch.onSelect(); }
    toast("Added a 100 mm calibration square.");
  } else if (kind === "circle") {
    sketch.add("circle");
    const it = sketch.selected();
    if (it) {
      if ("d" in (it.p || {})) it.p.d = 50;
      else if ("r" in (it.p || {})) it.p.r = 25;
      it._key = null; sketch.commit(); sketch.onSelect();
    }
    toast("Added a 50 mm calibration circle.");
  } else if (kind === "kerf") {
    for (let i = 0; i < 5; i++) {
      sketch.add("rect");
      const it = sketch.selected();
      if (!it) continue;
      it.p.w = 80; it.p.h = 8;
      it.x = 10; it.y = 10 + i * 20;
      it._key = null;
    }
    sketch.commit(); sketch.onSelect();
    toast("Added a kerf / speed ladder (five 80×8 mm bars). Cut each at a different speed.");
  }
  useShape(); goStep(3);
}

function bind() {
  $$(".tab").forEach((t) => (t.onclick = () => showTab(t.dataset.tab)));
  $$("#stepper li").forEach((li) => (li.onclick = () => goStep(Number(li.dataset.step))));
  $$("[data-go]").forEach((b) => (b.onclick = () => goStep(Number(b.dataset.go))));
  $("btnConnect").onclick = connectUSB;
  $("btnDemo").onclick = connectDemo;
  $("next1").onclick = () => (screen() === "make" ? sendToCutting() : goStep(3));
  $("btnChangeMat").onclick = () => goStep(1);
  $("btnEditParts").onclick = () => { showScreen("make"); };
  $("btnClearBed").onclick = () => { if (!bedHasParts() || confirm("Take everything off the bed and start over?")) startOver(); };
  $("btnPickSaved").onclick = () => addPartsFlow(null);
  $("layAdd").addEventListener("click", () => { /* Setup opens the Add parts dialog itself */ });
  if ($("bgDraw")) $("bgDraw").onclick = () => { if (S.src !== "shape") showSource("shape"); setShapeFs(true); };
  $("btnExport").onclick = exportGcode;
  if ($("btnExport3")) $("btnExport3").onclick = exportGcode;      // Beginner has no Download button on the preview: it is here on Get set up, and on the run screen
  if ($("btnExport4")) $("btnExport4").onclick = exportGcode;
  if ($("btnFluidNC")) $("btnFluidNC").onclick = connectFluidNC;
  if ($("btnLostOk")) $("btnLostOk").onclick = () => $("lostBar").classList.add("hidden");
  if ($("btnExportMenu")) $("btnExportMenu").onclick = (e) => {
    e.stopPropagation();
    const pop = $("exportPop"); if (!pop) return;
    const on = pop.classList.contains("hidden");
    pop.classList.toggle("hidden", !on); pop.hidden = !on;
    $("btnExportMenu").setAttribute("aria-expanded", on ? "true" : "false");
    try {
      const s = currentSettings();
      if ($("exportDialect") && !$("exportDialect").dataset.touched) $("exportDialect").value = s.dialect || "grbl";
      if ($("exportN") && !$("exportN").dataset.touched) $("exportN").checked = !!s.lineNumbers;
    } catch (err) { /* ignore */ }
  };
  if ($("exportDialect")) $("exportDialect").addEventListener("change", () => { $("exportDialect").dataset.touched = "1"; });
  if ($("exportN")) $("exportN").addEventListener("change", () => { $("exportN").dataset.touched = "1"; });
  document.addEventListener("click", (e) => {
    const pop = $("exportPop"); if (!pop || pop.classList.contains("hidden")) return;
    if (e.target.closest("#exportPop") || e.target.closest("#btnExportMenu")) return;
    pop.classList.add("hidden"); pop.hidden = true;
  });
  if ($("fit")) $("fit").addEventListener("click", () => {
    if (!$("fit").classList.contains("unknown")) return;
    if (S.demo && S.connected) { R2.demoEdges(); return; }
    if (screen() === "cut") showTab("setup");
  });
  if ($("fsDone")) $("fsDone").onclick = () => setShapeFs(false);
  if ($("fsSave")) $("fsSave").onclick = () => saveCurrent().catch((e) => toast(e.message, true));
  if ($("btnEditDrawing")) $("btnEditDrawing").onclick = editDrawing;
  bindResize();
  if ($("btnShapeFs")) $("btnShapeFs").onclick = () => setShapeFs(true);
  if ($("qbSearch") || $("quickBar")) {
    $("quickBar").addEventListener("input", (e) => {
      if (e.target && e.target.id === "qbSearch") { paletteQ = e.target.value; renderQuickBar(); }
    });
  }
  $("btnSavePartQuick").onclick = () => saveCurrent().catch((e) => toast(e.message, true));
  $("connectLock").onclick = () => { if (!Acc.hasLinkedMachine()) openGate("Link your machine to run jobs"); };
  $("startLock").onclick = () => openGate("Link your machine to run jobs");
  $("connPill").onclick = () => (S.connected ? showTab("setup") : connectUSB());
  $("btnDisconnect").onclick = disconnect;
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
  $("consoleForm").onsubmit = (e) => { e.preventDefault(); sendConsoleLine($("consoleIn").value, $("consoleIn")); };
  if ($("moveConsoleForm")) $("moveConsoleForm").onsubmit = (e) => { e.preventDefault(); sendConsoleLine($("moveConsoleIn").value, $("moveConsoleIn")); };

  // step 1
  $("file").onchange = () => { const fl = [...$("file").files]; $("file").value = ""; handleFiles(fl); };   // several files = they all go on the bed, each with a quantity
  const drop = $("drop");
  const cutDrop = () => screen() === "cut" && S.tab === "cut" && !navBusy();
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (cutDrop()) drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  document.addEventListener("drop", (e) => {
    if (!$("importDlg").classList.contains("hidden")) return;     // the Import DXFs dialog handles its own drops
    if (!cutDrop() || !e.dataTransfer) return;
    if (document.querySelector(".acctdlg:not(.hidden), .shapelib:not(.hidden), .numpad:not(.hidden)")) return;   // a dialog open: its own drop zone (if any) handles it
    handleFiles(e.dataTransfer.files);
  });
  $("recent").onclick = (e) => {
    const b = e.target.closest("[data-recent]");
    if (b) { const r = recentList()[Number(b.dataset.recent)]; if (r) setFile(r.name, r.text, false, r.scale); }
  };

  // step 1: Make a part
  if ($("bgShapes")) $("bgShapes").onclick = (e) => { const b = e.target.closest("[data-bshape]"); if (b) beginnerPick(b.dataset.bshape); };
  if ($("bgMore")) $("bgMore").onclick = () => openLibrary();
  if ($("bgChange")) $("bgChange").onclick = () => { S.bgChoosing = true; paintGuide(); };
  const addTile = (e) => {
    if (Date.now() < (S.uiBlockUntil || 0)) return;      // a second tap just after a sheet closed would hit whatever is under it
    if (e.target.closest("[data-lib]")) { openLibrary(); return; }
    const b = e.target.closest("[data-shape]"); if (b) addShapeId(b.dataset.shape);
  };
  $("shapeTiles").onclick = addTile; $("holeTiles").onclick = addTile;
  $("quickBar").addEventListener("click", (e) => { if (Date.now() < (S.uiBlockUntil || 0)) return; const b = e.target.closest("[data-qb]"); if (b && !b.disabled && b.getAttribute("aria-disabled") !== "true") quickAction(b.dataset.qb); });
  $("libClose").onclick = closeLibrary;
  $("shapeLib").addEventListener("click", (e) => {
    if (e.target === $("shapeLib")) { closeLibrary(); return; }
    const c = e.target.closest("[data-cat]"); if (c) { libCat = c.dataset.cat; renderLibrary(); return; }
    const b = e.target.closest("[data-shape]"); if (b) { closeLibrary(); if (!isProMode()) beginnerPick(b.dataset.shape); else addShapeId(b.dataset.shape); }
  });
  $("libSearch").addEventListener("input", renderLibrary);
  $("verClose").onclick = closeVersions;
  $("verPop").addEventListener("click", (e) => {
    if (e.target === $("verPop")) { closeVersions(); return; }
    const v = e.target.closest("[data-var]"); if (!v) return;
    const it = sketch.selected(); if (!it) return;
    const spec = variantsFor(it.type).find((x) => variantKey(x) === v.dataset.var);
    if (spec) { sketch.applyVariant(spec); closeVersions(); }
  });
  $("skAll").onclick = () => sketch.pickAll();
  $("skSnap").onchange = () => { sketch.setSnap(Number($("skSnap").value)); sketch.draw(); };
  $("skGuides").onchange = () => sketch.setGuides($("skGuides").checked);
  $("shapeForm").addEventListener("focusin", (e) => { if (e.target.matches("input")) editBefore = sketch.snapshot(); });
  $("shapeForm").addEventListener("input", (e) => {
    const i = e.target, v = evalExpr(i.value) ;
    if (i.value.trim() === "" || !Number.isFinite(v)) return;
    const it = sketch.selected(); if (!it) return;
    if (i.dataset.angle || i.dataset.cw || i.dataset.ch || i.dataset.hrel) return;     // applied on change
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
    if (e.target.id === "keepProp") { S.keepProp = e.target.checked; return; }
    if (e.target.dataset.cw || e.target.dataset.ch) {
      const it = sketch.selected(), box = it && sketch.boxOf(it);
      const W = evalExpr($("shapeForm").querySelector("[data-cw]").value), H = evalExpr($("shapeForm").querySelector("[data-ch]").value);
      const keep = !$("keepProp") || $("keepProp").checked;
      if (!it || !sketch.resizeCustomTo(it, W, H, keep, e.target.dataset.cw ? "w" : "h")) toast("That size isn't possible for this part (too small, too big, or locked).", true);
      editBefore = sketch.snapshot(); renderShapeForm(); useShapeSoon(); return;
    }
    if (e.target.dataset.hrel) {
      const v = evalExpr(e.target.value), it = sketch.selected();
      if (it && !it.lock && Number.isFinite(v)) sketch.setHoleOffset(e.target.dataset.hrel, v);
      editBefore = sketch.snapshot(); renderShapeForm(); useShapeSoon(); return;
    }
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
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#modeSwitch [data-mode], .acct-modesw [data-mode]");
    if (!b) return;
    e.preventDefault();
    setAppMode(b.dataset.mode);
  });
  if ($("matPreset")) $("matPreset").onchange = () => applyMatPreset($("matPreset").value);
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
      // (Esc only closes things. The space bar is the one STOP key: flow.js)
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); closeAccountUi(); }
      return;
    }
    if ($("dimEdit") && !$("dimEdit").classList.contains("hidden")) {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); applyDimEdit(); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeDimEdit(); return; }
      if (e.key === "Tab") { e.preventDefault(); e.stopPropagation(); tabDimEdit(); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); nudgeDimEdit(1); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); nudgeDimEdit(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); nudgeDimEdit(1); return; }
      if (e.target && e.target.id === "dimEditInput") return;
      e.stopPropagation();
      return;
    }
    if (S.shapeFs && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setShapeFs(false); return; }
    if (!$("numPad").classList.contains("hidden")) {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if ($("numPad")._apply) $("numPad")._apply(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeNumPad(); }
      else if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); const el = $("numPadValue"); if ($("numPad")._cur) { el.textContent = ""; $("numPad")._cur = false; } else el.textContent = el.textContent.slice(0, -1); }
      else if (/^[0-9.+\-*/()]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); const el = $("numPadValue"); if ($("numPad")._cur) { el.textContent = ""; $("numPad")._cur = false; } el.textContent += e.key; }
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
    if (b) { S.material = b.dataset.mat; if (!material().rows.some((r) => r.thickness_mm === S.thickness)) S.thickness = material().rows[0].thickness_mm; defaultSpeed(); applyMatchingPreset(); renderMaterials(); loadJob(); }
  };
  $("thicknesses").onclick = (e) => { const b = e.target.closest("[data-th]"); if (b) { S.thickness = Number(b.dataset.th); defaultSpeed(); applyMatchingPreset(); renderMaterials(); loadJob(); } };
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
  $("btnZero").onclick = () => { if (cmd("zero_xy")) { S.zeroSet = true; toast("Start point set ✓"); refresh(); } };
  $("btnTrace").onclick = () => cmd("trace_outline");

  // step 4
  $("checklist").addEventListener("change", refresh);
  $("btnStart").onclick = () => {
    if (!requireMachine("Link your machine to run jobs")) return;
    { const b = blockers(); if (b.length) { toast(b[0], true); return; } }   // a script/DOM-poke can't bypass the disabled button: zero, alarm, fit, checklist are re-checked here
    try {
      M.command({ cmd: "feed_override", step: "reset" });  // cut at exactly the speed chosen in step 2
      const fromCut = R2.startCut();
      if (fromCut > 1 && !confirm(`Continue from cut ${fromCut}?\n\nCuts 1 to ${fromCut - 1} are NOT cut again. The torch lifts, moves to the start of cut ${fromCut} with the arc off, then pierces there. Work zero is kept as it is now. Is the sheet still exactly where it was?`)) return;
      S.jobSeq++; S.run = null;
      S.jobLogId = null; S.jobLoggedEnd = false; M.startJob({ fromCut }); R2.afterStart(); S.job = M.grbl.jobProgress(); S.lastAlarm = null; keepAwake(true); goStep(4); maybeLogJob(S.job);
      $("btnSaveSpeed").classList.add("hidden");
    }
    catch (e) { toast(e.message, true); }
  };

  // step 5
  $("btnPause").onclick = () => cmd(S.status.state === "Hold" ? "resume" : "hold");
  $("btnAgain").onclick = () => { S.job = null; S.zeroSet = false; goStep(3); toast("Move to the next spot and press Start here."); };
  if ($("btnRezero")) $("btnRezero").onclick = () => { S.job = null; S.zeroSet = false; goStep(3); toast("Position was lost. Set a new start point before cutting again."); };
  $("btnNewFile").onclick = () => startOver();

  // keyboard + on-screen pad: tap = one step, hold = glide until released (diagonals too).
  // Arrows = X/Y, Page Up/Down = Z, hold Shift for slow.
  const KEYS = { ArrowLeft: ["X", -1], ArrowRight: ["X", 1], ArrowUp: ["Y", 1], ArrowDown: ["Y", -1], PageUp: ["Z", 1], PageDown: ["Z", -1] };
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    if (e.key === "Shift") { J.slow = true; return; }                     // (the space bar is the E-stop: see flow.js)
    if (!S.connected || screen() !== "cut") return;
    if (S.job && S.job.running) return;
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
    // The page is going away, so a delayed reset (stop() waits 250 ms) would never be sent and the controller would be
    // left in Hold with the torch lit. Send hold + reset back to back. Exception: a job the Pi is running by itself
    // carries on by design (reconnect and you see it again).
    try {
      const g = M && M.grbl; if (!g) return;
      if (g.t && g.t.remoteJobs && g.job && g.job.running) return;
      // only when something is actually moving or lit: a reset on an idle controller would make the next visit re-home
      const busy = (g.job && g.job.running) || g.status.torch || ["Run", "Jog", "Hold", "Home"].includes(g.status.state);
      if (!busy) return;
      g.pending = []; g.inflight = [];
      g.realtime(RT.HOLD); g.realtime(RT.RESET);
    } catch (e) { /* best effort */ }
  });
  bindEdgePanel();
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
  M.estopProvider = estopOn;
  M.startGuard = scoreMarkProblem;      // the machine refuses Start too, whatever the buttons say
  document.title = machine.name;
  R2.initR2({
    S, M: () => M, cfg: () => S.cfg, toast, cmd, refresh, drawPreview, loadJob, goStep, showSource, setShapeFs, row,
    isPro: () => true, camHandles: () => screen() === "cut" && !!$("advCut").open, jobRunning: () => !!(M && M.jobRunning()), sketchActive: () => !!(sketch && sketch.active),
    dirtyDesign: () => !!(sketch && sketch.items.length && !S.currentPart),
    useStraight, applyPresetsAndRender: () => { if (S.job && S.job.running) { renderMaterials(); return; } applyMatchingPreset(); renderMaterials(); loadJob(); },
  });
  try { if (new URLSearchParams(location.search).get("turn") !== "0" && localStorage.getItem("plasma.turnOverlay") !== "0") document.body.classList.add("turn-on"); } catch (e) { document.body.classList.add("turn-on"); }
  initPartsFolders({ toast, esc, openSignIn: () => openAccount("in"), uiBlock: () => { S.uiBlockUntil = Date.now() + 450; } });
  Setup.initSetup({
    S, sketch: () => sketch, toast, esc, refresh, loadJob, askSize: R2.askSize, sizeCheckWanted: R2.sizeCheckWanted, scaleContours: R2.scaleContours, useShape, useShapeSoon, showSource, kerf: kerfNow, workArea: workAreaSheet,
    afterAdd: () => { if (screen() === "cut" && S.cur === 1) { useShape(); goStep(3); } },   // parts picked on step 1 land straight on the bed
  });
  $("machineName").textContent = machine.name;
  try {
    const saved = JSON.parse(localStorage.getItem("plasma.material") || "null");
    if (saved) { S.material = saved.m; S.thickness = saved.t; }
  } catch (e) { /* ignore */ }
  if (!chart.materials.some((m) => m.name === S.material)) S.material = chart.materials[0].name;
  try { S.showMachine = localStorage.getItem("plasma.showMachine") !== "0"; } catch (e) { /* ignore */ }
  $("showMach").checked = S.showMachine;
  mountJogPads();
  initFlow({
    signedIn: () => Acc.isSignedIn(), bypass: testBypass(),
    stop: () => { if (M && M.grbl) cmd("stop"); },       // the same STOP path as always: soft reset, torch off
    jobLive: navBusy, dialogOpen: () => !!document.querySelector(".acctdlg:not(.hidden), .shapelib:not(.hidden), .numpad:not(.hidden)"),
    hardwareEstop: () => !!(S.connected && S.status && S.status.inputs && S.status.inputs.estop),
    toast, refresh, onScreen,
    // the E-stop may only be released when it is safe to: the machine's own E-stop is let go, the torch is off and nothing is moving
    canReset: () => {
      if (!(S.connected && M && M.grbl)) return "";
      const st = S.status || {};
      if (st.inputs && st.inputs.estop) return "The machine's own E-stop is still pressed. Twist it to release it first.";
      if (st.torch) return "The torch still shows ON. Wait until it shows TORCH OFF, then try again.";
      if (st.state && /^(Run|Jog|Home|Cycle)/i.test(st.state)) return `The machine is still moving (${st.state}). Wait until it has stopped, then try again.`;
      return "";
    },
  });
  initSettings({
    toast,
    isPro: () => !!(Acc.isPro() || Acc.isAdmin() || (sketch && sketch.opts.pro)),
    isFluidNC: () => !!S.fluidnc,
    hasThc: () => !!(S.cfg && S.cfg.thc),
    status: () => S.status || {},
    applyPreset: applyPresetRow,
    onChange: (s) => {
      if (s && s.bed && S.cfg && S.cfg.travel_mm) {
        S.cfg.travel_mm = { x: s.bed.x, y: s.bed.y, z: s.bed.z };
      }
      if ($("exportDialect") && !$("exportDialect").dataset.touched) $("exportDialect").value = (s && s.dialect) || "grbl";
    },
    firmwareText: () => "",
    paintAbout: R2.paintAbout,
  });
  bindSettings();
  watchWhy(paintWhy);
  try { const s0 = currentSettings(); if (s0 && s0.bed && S.cfg && S.cfg.travel_mm) S.cfg.travel_mm = { x: s0.bed.x, y: s0.bed.y, z: s0.bed.z }; } catch (e) { /* defaults stay */ }   // a saved bed size also applies after a reload
  bindHowto();
  try {
    const fh = localStorage.getItem("plasma.fluidnc.host");
    if (fh && $("fnHost")) $("fnHost").value = fh;
    const fp = localStorage.getItem("plasma.fluidnc.port");
    if (fp && $("fnPort")) $("fnPort").value = fp;
  } catch (e) { /* ignore */ }
  defaultSpeed();
  applyMatchingPreset();
  renderMaterials();
  renderRecent();
  sketch = new Sketch($("preview"), {
    onChange: (done) => { syncShapeForm(); if (done) { renderShapeForm(); useShape(); renderProTools(); renderQuickBar(); } Setup.paint(!done); if (done && window.ptInspector) window.ptInspector.emit(); },
    onSelect: () => { renderShapeForm(); renderProTools(); renderQuickBar(); fillEdgePanel(); Setup.paint(true); if (window.ptInspector) window.ptInspector.emit(); },
    onEdgeChange: () => { fillEdgePanel(); },
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
      if (dim.kind === "edge-len") {
        const info = sketch.edgeInfo(); if (info) dim._v = info.length;
      }
      setTimeout(() => openNumPad(dim), 280);
    },
  });
  // keep STOP (in the top bar) above every dialog and keep dialogs from covering the bar
  const fitBar = () => { const b = document.querySelector(".topbar"); if (b) document.documentElement.style.setProperty("--topbar-h", Math.ceil(b.getBoundingClientRect().height) + "px"); };
  fitBar(); window.addEventListener("resize", fitBar); window.addEventListener("orientationchange", () => setTimeout(fitBar, 200));
  const travel = machine.travel_mm || { x: 1300, y: 800 };
  sketch.maxMm = 2 * Math.max(Number(travel.x) || 1300, Number(travel.y) || 800);
  // Test hooks only on a local test server, never on the live site (they hand out S, the sketch and the account API).
  const localTestHost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (localTestHost && new URLSearchParams(location.search).has("test")) window.plasmaTest = { R2, Setup, openImport, refresh, editDrawing, openEditor, getM: () => M, sketch, evalExpr, openNumPad, closeNumPad, openDimEdit, closeDimEdit, applyDimEdit, runPro, S, account: Acc, openAccount, openClaim, openGate, openAdmin, saveCurrent, exportGcode, showScreen, screen, navLocked, estopOn, estopReset, estopPress, handleFiles, addPartsFlow, startOver, sendToCutting, navBusy, applyAccountMode, setAppMode, isProMode, machineAllowed, goStep, refreshGate, fillEdgePanel, filterConsoleCommand, convertGcode, openSettings, closeSettings, openHowto, closeHowto, setShapeFs, currentSettings, matchPreset, applyPresetRow, FluidNCTransport, fluidncWsUrl, fluidncBlockedByHttps };
  window.ptInspector = makeInspector({
    sketch: () => sketch, S, leadNow, jobRunning: () => !!(S.job && S.job.running),
    ampsNow: () => { try { return S.cutAmps != null ? S.cutAmps : (row().amps ?? null); } catch (e) { return null; } },
    setAmps: (v) => { S.cutAmps = v; },          // planning note only: the machine's amps are set on the power supply
    setLead: (v) => { $("ovLead").value = String(v); },
    setSpeed: (v) => setSpeed(v),
    loadJob,
    note: (m) => toast(m, true),
  });
  renderShapeTiles();
  setAppMode(sketch.opts.pro ? "pro" : "beginner", { persist: false, autoFs: false });
  bind();
  await initAccountUi({
    toast, esc,
    applyMode: applyAccountMode,
    refreshGate,
    confirm: (msg) => confirm(msg),
    startDesigning: () => { showScreen("make"); },
    sendAdvanced: (line, meta) => {
      if (!(Acc.isAdmin() || Acc.isPro())) { toast("Pro or admin only", true); return; }
      if (!M.grbl) { toast("Connect the table first.", true); return; }
      const f = (meta && meta.send) ? meta : filterConsoleCommand(line, { allowTorch: !!(meta && meta.allowTorch) });
      if (f && f.needsTorchConfirm) { toast(f.reason, true); return; }
      if (!f.ok) { toast(f.reason, true); return; }
      if (f.send === "!") { M.command({ cmd: "stop" }); return; }                  // STOP is never held back
      if (f.send === "\x18") { M.command({ cmd: "reset" }); return; }
      if (f.send === "?" || f.send === "~") { M.grbl.realtime(f.send); return; }
      if (!adminMayTalk(f.moves || /^\$\d/.test(f.send) || f.send === "$H")) return;
      M.grbl.send(f.send);
    },
    readSettings: async () => {
      if (!(Acc.isAdmin() || Acc.isPro())) { toast("Pro or admin only", true); return; }
      if (!M.grbl) { toast("Connect the table first.", true); return; }
      if (!adminMayTalk(false)) return;
      const snap = await readControllerSettings();
      if (!snap || !snap.lines.length) { toast("The controller didn't answer.", true); return; }
      fillSettingsFromText(snap.lines.join("\n"));
      const fw = snap.lines.filter((l) => /grbl|hal|ver/i.test(l)).join(" ");
      if (fw) setFirmwareText(fw);
      toast("Read $ settings");
    },
    writeSettings: async (map) => {
      if (S.fwWriting) { toast("A settings write is already in progress.", true); return; }
      if (!(Acc.isAdmin() || Acc.isPro())) { toast("Pro or admin only", true); return; }
      if (!M.grbl) { toast("Connect the table first.", true); return; }
      if (!adminMayTalk(true)) return;
      S.fwWriting = true;
      try {
        const bad = [];
        const lines = Object.keys(map).sort((a, b) => a - b).map((k) => {
          const r = filterConsoleCommand("$" + k + "=" + map[k]);
          if (!r.ok) { bad.push("$" + k); return null; }
          return r.send;
        }).filter(Boolean);
        if (bad.length) { toast("Not sent (outside the allowed range): " + bad.join(", "), true); return; }
        if (!lines.length) { toast("Nothing to write.", true); return; }
        // 1. backup what the controller has right now, and make sure it is a real, complete copy
        const snap = await readControllerSettings();
        if (!snap) { toast("Couldn't read the controller's settings, so nothing was written.", true); return; }
        const missing = Object.keys(map).filter((k) => !(Number(k) in snap.map));
        if (missing.length) { toast("The controller doesn't report $" + missing.join(", $") + ", so nothing was written.", true); return; }
        const bk = takeVerifiedBackup(snap);
        if (!bk) return;
        // 2. things may have changed while we waited
        if (!adminMayTalk(true)) return;
        // 3. write, then read back and compare
        M.grbl.sendLines(lines);
        toast("Backup saved (" + bk.count + " settings). Writing " + lines.length + "...");
        for (let i = 0; i < 40 && M.grbl && (M.grbl.pending.length || M.grbl.inflight.length); i++) await new Promise((r) => setTimeout(r, 100));
        const after = await readControllerSettings();
        if (!after || !Object.keys(after.map).length) { toast("Wrote the settings but couldn't read them back. Press Read $ settings and check.", true); return; }
        const diff = Object.keys(map).filter((k) => !(Math.abs((after.map[k] ?? NaN) - Number(map[k])) <= 1e-6 + 1e-4 * Math.abs(Number(map[k]))));
        fillSettingsFromText(after.lines.join("\n"));
        if (diff.length) toast("The controller kept different values for $" + diff.join(", $") + ". Your backup file has the old values.", true);
        else toast("Wrote and verified " + lines.length + " setting" + (lines.length > 1 ? "s" : "") + ". Backup saved first.");
      } finally { S.fwWriting = false; }
    },
    calMove: (axis, mm) => {
      if (!requireMachine("Link your machine to run calibration moves")) return;
      try { M.command({ cmd: "jog", axis, dist: mm }); }
      catch (e) { toast(e.message, true); }
    },
    addPattern: addTestPattern,
    getDesign: () => (sketch && sketch.items) ? sketch.items : [],
    designMeta: () => { try { return sketch && sketch.items.length ? metaFromContours(sketch.contours()) : null; } catch { return null; } },
    metaOfItems: (items) => { try { const cs = items.map((i) => sketch.sanitizeItem(JSON.parse(JSON.stringify(i)))).filter(Boolean).flatMap((i) => sketch.contoursOf(i)); return metaFromContours(cs); } catch { return null; } },
    fileName: () => S.fileName || "",
    currentPart: () => S.currentPart,
    rememberPart: (p) => { S.currentPart = p; S.fileName = (p && p.name) || S.fileName; },
    openEditor,
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
    S.noUsb = true;
    $("btnConnect").classList.add("hidden");
    $("btnDemo").classList.add("go");
    const steps = document.querySelector(".hero ol.plain"); if (steps) steps.classList.add("hidden");
  }
  onSafety(M.safety.state());
  setConnected(false);
  goStep(1);
  Acc.onAccountChange(routeAuth);
  routeAuth();
  refreshPublishedPresets().then(() => { applyMatchingPreset(); renderMaterials(); }).catch(() => {});
}
init().catch((e) => toast("Couldn't start: " + e.message, true));

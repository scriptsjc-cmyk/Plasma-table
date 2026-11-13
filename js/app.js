// Porta Plazma CNC operator screen (browser version): the entry point.
// It wires the modules together (init), binds the controls (bind) and starts the app. The screens themselves live in the
// folders next to this file: core/ make/ cut/ machine/ account/ ui/  (see docs/ARCHITECTURE.md).
import { demoEdges } from "./ui/demo.js";
import { provide } from "./core/hooks.js";
import { Machine } from "./machine/machine.js";
import { WebSerialTransport } from "./machine/usbserial.js";
import { Sketch } from "./make/sketch.js";
import { evalExpr } from "./core/expr.js";
import * as Acc from "./account/account.js";
import { initAccountUi } from "./account/account-ui.js";
import { openAccount, openAdmin, openClaim, openGate } from "./account/accounthome.js";
import { saveCurrent } from "./account/savepart.js";
import { fillSettingsFromText, setFirmwareText, filterConsoleCommand } from "./machine/admin-machine.js";
import { convertGcode } from "./machine/dialect.js";
import { initSettings, bindSettings, openSettings, closeSettings, currentSettings, matchPreset, refreshPublishedPresets } from "./machine/settings.js";
import { applyChrome, drawingSheet, getPrefs, savePrefs } from "./core/prefs.js";
import { initYours, bindYours, paintYours } from "./ui/yours.js";
import { bindScrollRows, refreshScrollRows } from "./ui/scrollrow.js";
import { bindPreviewNav, previewCam, resetPreviewCam } from "./cut/previewnav.js";
import { bindHowto, openHowto, closeHowto } from "./ui/howto.js";
import { askSize, scaleContours, sizeCheckWanted } from "./make/sizecheck.js";
import { continueFromCut } from "./cut/restart.js";
import { initFeatures } from "./ui/features.js";
import { paintAbout } from "./ui/about.js";
import * as Setup from "./cut/setup.js";
import { watchWhy } from "./ui/whyoff.js";
import * as CF from "./cut/cutfeatures-ui.js";
import { makeInspector } from "./ui/inspector-api.js";
import { connectInspector } from "./ui/inspector-ui.js";
import { initPartsFolders, openImport, metaFromContours } from "./account/partsfolders.js";
import { initFlow, showScreen, screen, navLocked, estopOn, estopReset, estopPress } from "./ui/flow.js";
import { CFH, M, S, inspectorApi, makeTools, setCFH, setInspectorApi, setM, setSketch, sketch } from "./core/state.js";
import { onEvent, onSafety } from "./machine/events.js";
import { navBusy, scoreMarkProblem } from "./cut/checklist.js";
import { $, esc, toast } from "./core/dom.js";
import { askConfirm } from "./core/safeprompt.js";
import { cmd, machineAllowed, requireMachine } from "./machine/access.js";
import { paintChrome, refresh } from "./ui/refresh.js";
import { drawPreview, fromView, toView, wcoNow, workAreaSheet } from "./cut/preview.js";
import { kerfNow, leadNow, loadJob } from "./cut/prepare.js";
import { bindNav, goStep, onScreen, routeAuth, sendToCutting, testBypass } from "./ui/nav.js";
import { bindSketchBar, showSource, syncShapeForm, useCoupon, useShape, useShapeSoon, useStraight } from "./make/useshape.js";
import { bindProTools, renderProTools, setShapeFs } from "./make/protools.js";
import { applyMatchingPreset, applyPresetRow, bindMaterial, defaultSpeed, renderMaterials, row, saveSpeed, setSpeed } from "./cut/material.js";
import { bindJog, bindJogKeys, mountJogPads } from "./machine/jog.js";
import { bindGate, paintWhy, refreshGate } from "./ui/gate.js";
import { addPartsFlow, bindFiles, clearRecent, editDrawing, handleFiles, openEditor, renderRecent, startOver } from "./make/files.js";
import { bindLibrary, openMakeTool } from "./make/library.js";
import { applyDimEdit, bindDimEdit, closeDimEdit, closeNumPad, openDimEdit, openNumPad } from "./make/dimedit.js";
import { bindCad, runPro } from "./make/cad.js";
import { bindExport, exportGcode } from "./cut/export.js";
import { applyAccountMode, bindMode, firmwareDenied, isProMode, setAppMode } from "./ui/mode.js";
import { addTestPattern, adminMayTalk, bindMachineControls, fillEdgePanel, readControllerSettings, takeVerifiedBackup } from "./machine/panels.js";
import { bindShapeForm, paintGuide, renderShapeForm, renderShapeTiles } from "./make/shapeform.js";
import { bindConnection, setConnected } from "./machine/connection.js";
import { bindQuickBar, renderQuickBar } from "./make/quickbar.js";
import { bindCadUi, publishCadTestHooks } from "./make/cadui.js";
import { bindHeader, setHeaderHidden } from "./ui/header.js";
import { clickVerb, clickVerbLower } from "./ui/laptop.js";
import { bindPhoneSheet } from "./make/phonesheet.js";
import { bindDialogKeys } from "./ui/dialogs.js";
import { bindRun } from "./cut/run.js";
import { bindTurnCover } from "./cut/turncover.js";
import { bindCutBar } from "./cut/cutbar.js";
import { bindCutStatus } from "./cut/cutstatus.js";
import { bindCheckCut } from "./make/checkcut.js";
import { bindHoverTips } from "./ui/hovertip.js";
import { bindMakeHeaderTools } from "./make/headertools.js";
import { bindCutPanels } from "./cut/cutpanels.js";
import { bindViewport } from "./ui/viewport.js";
import { bindPicture } from "./make/picture.js";
import { bindCutSummary } from "./make/cutsummary.js";

// Late-bound calls (see core/hooks.js): the real functions are registered here once, before anything runs.
provide({ goStep, loadJob, paintChrome, paintGuide, refresh, renderProTools, renderQuickBar, renderShapeForm, runPro, setShapeFs, showSource, useShape, useShapeSoon });

function bind() {
  bindDimEdit();
  bindNav();
  bindConnection();
  bindFiles();
  bindShapeForm();
  bindExport();
  bindQuickBar();
  bindCadUi();
  bindHeader();
  bindPhoneSheet();
  bindGate();
  bindMachineControls();
  bindLibrary();
  bindSketchBar();
  bindProTools();
  bindMode();
  bindMaterial();
  bindCad();
  bindDialogKeys();
  bindRun();
  bindTurnCover();
  bindCutBar();
  bindCutStatus();
  bindCheckCut();
  bindHoverTips();
  bindMakeHeaderTools();
  bindCutPanels();
  bindJog();
  bindViewport();
  bindPicture();
  bindCutSummary();
  bindYours();
  bindScrollRows();
  bindPreviewNav(drawPreview);
}

async function init() {
  const text = async (p) => { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p); return r.text(); };
  const [machine, chart, settings] = await Promise.all([
    text("config/machine.json").then(JSON.parse), text("config/cut_chart.json").then(JSON.parse), text("config/grblhal_settings.txt")]);
  S.cfg = machine; S.chart = chart;
  let store = null;
  try { store = window.localStorage; } catch (e) { /* private mode */ }
  setM(new Machine(machine, chart, settings, store));
  M.on(onEvent);
  M.estopProvider = estopOn;
  M.startGuard = scoreMarkProblem;      // the machine refuses Start too, whatever the buttons say
  document.title = "Porta Plazma CNC";
  initFeatures({
    S, M: () => M, cfg: () => S.cfg, toast, cmd, refresh, drawPreview, loadJob, goStep, showSource, setShapeFs, row,
    isPro: () => true, camHandles: () => screen() === "cut" && !!$("advCut").open, jobRunning: () => !!(M && M.jobRunning()), sketchActive: () => !!(sketch && sketch.active),
    dirtyDesign: () => !!(sketch && sketch.items.length && !S.currentPart),
    useStraight, applyPresetsAndRender: () => { if (S.job && S.job.running) { renderMaterials(); return; } applyMatchingPreset(); renderMaterials(); loadJob(); },
  });
  setCFH(CF.initCutFeatures({
    S, M: () => M, cfg: () => S.cfg, toast, cmd, refresh, loadJob, esc, row, setSpeed: (v) => { saveSpeed(v); S.speed = v; }, useCoupon, continueFromCut: continueFromCut,
    confirm: (m) => askConfirm({ body: String(m), ok: "OK", cancel: "Cancel" }), wcoNow, toView, fromView, applyPresetsAndRender: () => { if (S.job && S.job.running) { renderMaterials(); return; } applyMatchingPreset(); renderMaterials(); loadJob(); },
  }));
  try { if (new URLSearchParams(location.search).get("turn") !== "0" && localStorage.getItem("plasma.turnOverlay") !== "0") document.body.classList.add("turn-on"); } catch (e) { document.body.classList.add("turn-on"); }
  initPartsFolders({ toast, esc, openSignIn: () => openAccount("in"), uiBlock: () => { S.uiBlockUntil = Date.now() + 450; } });
  Setup.initSetup({
    S, sketch: () => sketch, toast, esc, refresh, loadJob, askSize: askSize, sizeCheckWanted: sizeCheckWanted, scaleContours: scaleContours, useShape, useShapeSoon, showSource, kerf: kerfNow, workArea: workAreaSheet,
    afterAdd: () => { if (screen() === "cut" && S.cur === 1) { useShape(); goStep(3); } },   // parts picked on step 1 land straight on the bed
  });
  $("machineName").textContent = "Porta Plazma";
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
    paintYours,
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
    paintAbout: paintAbout,
  });
  bindSettings();
  watchWhy(paintWhy);
  try { const s0 = currentSettings(); if (s0 && s0.bed && S.cfg && S.cfg.travel_mm) S.cfg.travel_mm = { x: s0.bed.x, y: s0.bed.y, z: s0.bed.z }; } catch (e) { /* defaults stay */ }   // a saved bed size also applies after a reload
  bindHowto();
  defaultSpeed();
  applyMatchingPreset();
  renderMaterials();
  renderRecent();
  bindJogKeys();                                  // before the editor: on the cutting screen the arrows jog the torch (r7 J4)
  setSketch(new Sketch($("preview"), {
    onChange: (done) => { syncShapeForm(); if (done) { renderShapeForm(); useShape(); renderProTools(); renderQuickBar(); } Setup.paint(!done); if (done && inspectorApi) inspectorApi.emit(); },
    onSelect: () => { renderShapeForm(); renderProTools(); renderQuickBar(); fillEdgePanel(); Setup.paint(true); if (inspectorApi) inspectorApi.emit(); },
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
  }));
  sketch.partCounter = (sk) => Setup.partCount(sk);       // one part count for the preview caption, the layout name and every status line
  // keep STOP (in the top bar) above every dialog and keep dialogs from covering the bar
  const fitBar = () => { const b = document.querySelector(".topbar"); if (b) document.documentElement.style.setProperty("--topbar-h", Math.ceil(b.getBoundingClientRect().height) + "px"); };
  fitBar(); window.addEventListener("resize", fitBar); window.addEventListener("orientationchange", () => setTimeout(fitBar, 200));
  const travel = machine.travel_mm || { x: 1300, y: 800 };
  sketch.maxMm = 2 * Math.max(Number(travel.x) || 1300, Number(travel.y) || 800);
  const localTestHost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  setInspectorApi(makeInspector({
    sketch: () => sketch, S, leadNow, jobRunning: () => !!(S.job && S.job.running),
    setLead: (v) => { $("ovLead").value = String(v); },
    setSpeed: (v) => setSpeed(v),
    loadJob,
    note: (m) => toast(m, true),
  }));
  connectInspector(inspectorApi);                         // the panel gets the API directly, not through a global
  // window.ptInspector (the test/admin handle) exists only on the local test server (?test=1) and for the signed-in admin.
  const publishInspector = () => {
    const allowed = (localTestHost && new URLSearchParams(location.search).has("test")) || !!Acc.isAdmin();
    try {
      if (allowed) { if (window.ptInspector !== inspectorApi) window.ptInspector = inspectorApi; }
      else if (window.ptInspector === inspectorApi) delete window.ptInspector;
    } catch (e) { /* ignore */ }
  };
  publishInspector();
  Acc.onAccountChange(publishInspector);
  renderShapeTiles();
  initYours();
  let startMode = getPrefs().mode || "simple";
  try {
    const raw = JSON.parse(localStorage.getItem("plasma.yours.v1") || "null");
    const hadMode = raw && (raw.mode === "beginner" || raw.mode === "pro" || raw.mode === "simple" || raw.mode === "advanced");
    if (!hadMode && localStorage.getItem("plasma.sketch.opts")) startMode = sketch.opts.pro ? "advanced" : "simple";
  } catch (e) { /* ignore */ }
  setAppMode(startMode, { persist: false, autoFs: false });
  bind();
  refreshScrollRows();
  await initAccountUi({
    toast, esc,
    applyMode: applyAccountMode,
    refreshGate,
    confirm: (msg) => askConfirm({ body: String(msg), ok: "OK", cancel: "Cancel" }),
    sendAdvanced: (line, meta) => {
      if (firmwareDenied()) return;
      if (!M.grbl) { toast("Connect the table first.", true); return; }
      const f = (meta && meta.send) ? meta : filterConsoleCommand(line, { allowTorch: !!(meta && meta.allowTorch) });
      if (f && f.needsTorchConfirm) { toast(f.reason, true); return; }
      if (!f.ok) { toast(f.reason, true); return; }
      if (f.send === "!") { M.command({ cmd: "stop" }); return; }                  // STOP is never held back
      if (f.send === "\x18") { M.command({ cmd: "reset" }); return; }
      if (!(f.send === "?" || f.send === "~") && !adminMayTalk(f.moves || /^\$\d/.test(f.send) || f.send === "$H")) return;
      // Everything else goes through the machine's own console path, which enforces the E-stop latch (no torch, move, cycle start or
      // homing while the E-stop is latched), the "job running" rule and the zero bookkeeping. The torch confirm was already answered above.
      try { M.command({ cmd: "console", line: f.send, allowTorch: true }); } catch (e) { toast(e.message || String(e), true); }
    },
    readSettings: async () => {
      if (firmwareDenied()) return;
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
      await Acc.refreshEntitlements();                  // ask the server again; a stale browser copy must not unlock a write
      if (S.fwWriting) { toast("A settings write is already in progress.", true); return; }
      if (firmwareDenied()) return;
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
    // round 5 item 10: a different account signed in and chose "Start fresh": no drawing (nor its undo history), recent files or material choice carries over
    startFresh: () => {
      if (sketch) { sketch.items.forEach((i) => { i.lock = false; }); sketch.clear(); sketch.past = []; sketch.future = []; sketch.save(); }
      clearRecent();
      S.currentPart = null; S.fileName = "";
      try { localStorage.removeItem("plasma.material"); } catch (e) { /* ignore */ }
      S.material = chart.materials[0].name; S.thickness = chart.materials[0].rows[0].thickness_mm; defaultSpeed();
      renderMaterials(); refresh();
    },
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
  if (!WebSerialTransport.supported()) {
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const phone = apple || /Android/.test(navigator.userAgent);
    $("connectHelp").innerHTML = apple
      ? "iPhones and iPads can't plug into the table by USB or Bluetooth. Run the table from a computer in <b>Chrome or Edge</b>. You can still look around with the demo here."
      : phone
        ? "Phones can't plug into the table. Run it from a computer in <b>Chrome or Edge</b>. You can still look around with the demo here."
        : "This browser can't talk to USB or Bluetooth serial. Open this page in <b>Chrome or Edge on a computer</b>. You can still try the demo.";
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
  // Test hooks only once the app has finished starting, so a test never talks to a half-ready page.
  if (localTestHost && new URLSearchParams(location.search).has("test")) window.plasmaTest = { demoEdges, Setup, openMakeTool, getPrefs, savePrefs, applyChrome, drawingSheet, setHeaderHidden, clickVerb, clickVerbLower, previewCam, resetPreviewCam, getMakeTools: () => makeTools, openImport, refresh, editDrawing, openEditor, getM: () => M, sketch, evalExpr, openNumPad, closeNumPad, openDimEdit, closeDimEdit, applyDimEdit, runPro, S, account: Acc, openAccount, openClaim, openGate, openAdmin, saveCurrent, exportGcode, showScreen, screen, navLocked, estopOn, estopReset, estopPress, handleFiles, addPartsFlow, startOver, sendToCutting, navBusy, applyAccountMode, setAppMode, isProMode, machineAllowed, goStep, refreshGate, fillEdgePanel, filterConsoleCommand, convertGcode, openSettings, closeSettings, openHowto, closeHowto, setShapeFs, currentSettings, matchPreset, applyPresetRow };
  if (window.plasmaTest) window.plasmaTest.CF = { ...CF, get h() { return CFH; } };      // B5 35-37 test hook (localhost ?test=1 only)
  if (window.plasmaTest) publishCadTestHooks();
}
init().catch((e) => toast("Couldn't start: " + e.message, true));

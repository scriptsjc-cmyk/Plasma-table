// Connect / disconnect (USB or Bluetooth serial, and the practice table), keep-awake, and the unload safety stop.
import { RT } from "./grbl.js";
import { WebSerialTransport } from "./usbserial.js";
import { SimTransport } from "./sim.js";
import { M, S } from "../core/state.js";
import { $, toast } from "../core/dom.js";
import { askConfirm } from "../core/safeprompt.js";
import { refreshGate } from "../ui/gate.js";
import { refresh } from "../ui/refresh.js";
import { requireMachine } from "./access.js";
import { showTab } from "../ui/nav.js";

// ------------------------------------------------------------------ connection
export function setConnected(on, label = "") {
  S.connected = on;
  if (on && $("lostBar")) $("lostBar").classList.add("hidden");
  const connLabel = on ? (S.demo ? "Practice table" : "Connected") : "Not connected";
  $("connPill").innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-dot"></use></svg> <span class="connword">${connLabel}</span>`;
  $("connPill").title = on && S.fluidnc ? "Connected (FluidNC)" : connLabel; $("connPill").setAttribute("aria-label", connLabel + (on ? ": open Machine setup" : ": connect"));
  document.body.classList.toggle("demo-on", !!(on && S.demo));
  $("connPill").className = "pill " + (on ? "on" : "off");
  if (!on) { S.fluidnc = false; S.zeroSet = false; }
  if (on && label) toast("Connected to " + label);
  // the connect card ("Connect and set the start point"): connect buttons while disconnected, Disconnect once connected
  for (const id of ["btnConnect", "btnDemo", "connectHelp"]) if ($(id)) $(id).classList.toggle("hidden", !!(on || (id === "btnConnect" && S.noUsb)));
  if ($("btnDisconnect")) $("btnDisconnect").classList.toggle("hidden", !on);
  $("demoInputs").classList.toggle("hidden", !(on && S.demo));
  refreshGate();
  refresh();
}
async function connectUSB() {
  if (!requireMachine("Link your machine to run jobs")) return;
  if (!WebSerialTransport.supported()) { toast("This browser can't use USB. Use Chrome or Edge on a computer.", true); return; }
  if (S.usbBusy) return;
  S.usbBusy = true;
  const t = new WebSerialTransport();
  try {
    // Always show Chrome's port list on Connect: silently reusing a remembered port fails when the board is on a
    // different port (or a different board is plugged in) and never lets the operator pick the right one.
    try { await t.open(S.cfg.serial.baud || 115200, false); } catch (e) {
      if (e && e.name === "NotFoundError") return; // picker closed
      toast("Couldn't open the port: " + e.message + " – is another program (FluidNC web installer, a serial terminal, Mach3) using it?", true);
      return;
    }
    toast("Port open – waiting for the controller to answer…");
    await M.connect(t);          // resolves only once the controller has replied (banner or status report)
    S.demo = null; S.userDisconnected = false;
    setConnected(true, "the table");
  } catch (e) {
    toast(e.message + (t.portHint ? t.portHint() : ""), true);      // e.g. no reply: wrong port / baud / firmware
  } finally { S.usbBusy = false; }
}
async function connectDemo() {
  const t = new SimTransport({ switchOffset: S.cfg.probe.switch_offset_mm, sheetZ: -15, speedup: 1 });   // real speed
  await t.open();
  await M.connect(t);
  S.demo = t; S.userDisconnected = false;
  setConnected(true, "the demo (nothing real moves)");
}
async function disconnect() {
  const board = M.boardRunLive && M.boardRunLive();
  if (M.jobRunning() && !(await askConfirm({
    title: "Disconnect while a job is running?",
    body: board
      ? "The table will keep cutting by itself. Reconnect to watch it or to stop it. Use the table's own E-stop if you need to stop it now."
      : "A job is running. Disconnecting now leaves the controller mid-cut — the torch may stay on. Press STOP first if you can. Disconnect anyway?",
    ok: "Disconnect", cancel: "Cancel", danger: true }))) return;
  S.userDisconnected = true;
  const hungUp = await M.disconnect(!board);   // a board run must not get a soft reset just because we hung up
  if (hungUp) setConnected(false);
}
let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request("screen");
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* fine */ }
}
export function bindConnection() {
  $("btnConnect").onclick = connectUSB;
  $("btnDemo").onclick = connectDemo;
  if ($("btnLostOk")) $("btnLostOk").onclick = () => $("lostBar").classList.add("hidden");
  $("connPill").onclick = () => (S.connected ? showTab("setup") : connectUSB());
  $("btnDisconnect").onclick = disconnect;
  window.addEventListener("beforeunload", (e) => { if (M.jobRunning()) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("pagehide", () => {
    // The page is going away, so a delayed reset (stop() waits 250 ms) would never be sent and the controller would be
    // left in Hold with the torch lit. Send hold + reset back to back.
    try {
      const g = M && M.grbl; if (!g) return;
      // only when something is actually moving or lit: a reset on an idle controller would make the next visit re-home
      // A cut already running on the FluidNC board must keep going if the laptop sleeps or the tab closes.
      if (g.job && g.job.running && g.job.boardRun && g.job.phase === "run") return;
      const busy = (g.job && g.job.running) || g.status.torch || ["Run", "Jog", "Hold", "Home"].includes(g.status.state);
      if (!busy) return;
      g.pending = []; g.inflight = [];
      g.realtime(RT.HOLD); g.realtime(RT.RESET);
    } catch (e) { /* best effort */ }
  });
}

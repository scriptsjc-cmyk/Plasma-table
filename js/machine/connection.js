// Connect / disconnect (USB, Wi-Fi, FluidNC, demo), keep-awake, and the unload safety stop.
import { RT, WebSerialTransport, WiFiTransport } from "./grbl.js";
import { FluidNCTransport, fluidncBlockedByHttps, fluidncMixedContentMessage, fluidncUrlProblem, fluidncWsUrl } from "./fluidnc.js";
import { SimTransport } from "./sim.js";
import * as Acc from "../account/account.js";
import { M, S } from "../core/state.js";
import { $, toast } from "../core/dom.js";
import { refreshGate } from "../ui/gate.js";
import { refresh } from "../ui/refresh.js";
import { lockText, machineAllowed, requireMachine } from "./access.js";
import { goStep, showTab } from "../ui/nav.js";

// ------------------------------------------------------------------ connection
export function setConnected(on, label = "") {
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
  for (const id of ["btnConnect", "btnDemo", "fnBox", "connectHelp"]) if ($(id)) $(id).classList.toggle("hidden", !!(on || (id === "btnConnect" && S.noUsb)));
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
    try { await t.open(S.cfg.serial.baud || 115200); } catch (e) {
      if (e && e.name === "NotFoundError") return; // picker closed
      toast("Couldn't open the port: " + e.message + " – is another program (FluidNC web installer, a serial terminal, Mach3) using it?", true);
      return;
    }
    toast("Port open – waiting for the controller to answer…");
    await M.connect(t);          // resolves only once the controller has replied (banner or status report)
    S.demo = null; S.userDisconnected = false;
    setConnected(true, "the table");
  } catch (e) {
    toast(e.message, true);      // e.g. no reply: wrong port / baud / firmware
  } finally { S.usbBusy = false; }
}
// ---- Wi-Fi (page served by the Pi at the table)
export async function connectWiFi(quiet = false) {
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
export function wifiWatch() {
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
    S.demo = null; S.fluidnc = true; S.userDisconnected = false;
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
  S.demo = t; S.userDisconnected = false;
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
export async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request("screen");
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* fine */ }
}
export function bindConnection() {
  $("btnConnect").onclick = connectUSB;
  $("btnDemo").onclick = connectDemo;
  if ($("btnFluidNC")) $("btnFluidNC").onclick = connectFluidNC;
  if ($("btnLostOk")) $("btnLostOk").onclick = () => $("lostBar").classList.add("hidden");
  $("connPill").onclick = () => (S.connected ? showTab("setup") : connectUSB());
  $("btnDisconnect").onclick = disconnect;
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
}

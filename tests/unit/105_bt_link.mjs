// Bluetooth serial: slower poll, no RX overflow, clean close, reconnect backoff, power-cycle hint.
import fs from "node:fs";
import { mod, SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";
import { installMockSerial } from "../lib/mock-serial.mjs";
if (typeof globalThis.window === "undefined") {
  const body = { dataset: { screen: "boot" } };
  globalThis.document = {
    body,
    documentElement: {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    activeElement: null,
  };
  globalThis.window = globalThis;
  if (typeof globalThis.addEventListener !== "function") globalThis.addEventListener = () => {};
  if (typeof globalThis.removeEventListener !== "function") globalThis.removeEventListener = () => {};
}
const t = new T("105_bt_link");
const G = await mod("usbserial"), Mm = await mod("machine");
const cfg = JSON.parse(fs.readFileSync(SITE + "config/machine.json", "utf8"));
const chart = JSON.parse(fs.readFileSync(SITE + "config/cut_chart.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return !!fn(); };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

G.resetSerialLinkMemory();

async function rig(opts = {}, tweak = {}) {
  const env = {}; const { serial, port } = installMockSerial(env, opts);
  const M = new Mm.Machine(cfg, chart, "", memStore());
  const ev = []; M.on((k, d) => ev.push([k, d]));
  const tr = new G.WebSerialTransport(serial);
  Object.assign(tr, tweak);
  let err = null;
  await tr.open(115200);
  try { await M.connect(tr); } catch (e) { err = e; }
  return { M, tr, port, serial, ev, err };
}

function commandsOf(port) {
  return port.sent.replace(/\?/g, "");
}

// 1) a Bluetooth COM port (no USB ids) gets the gentle profile
{
  const r = await rig({ answer: true, bluetooth: true });
  t.check("BT: connect succeeds", !r.err && r.M.grbl && r.M.grbl.ready, String(r.err));
  t.check("BT: transport kind is bluetooth", r.tr.kind === "bluetooth" && r.tr.label === "Bluetooth", `${r.tr.kind} ${r.tr.label}`);
  t.check("BT: poll is 4 Hz (250 ms)", r.tr.pollMs === G.BT_POLL_MS && G.BT_POLL_MS === 250, r.tr.pollMs);
  t.check("BT: watchdog is 5 s", r.tr.watchdogMs === G.BT_WATCHDOG_MS && G.BT_WATCHDOG_MS === 5000, r.tr.watchdogMs);
  t.check("BT: connected log names Bluetooth", r.ev.some(([k, d]) => k === "log" && /Connected to Bluetooth/.test(d.text)), JSON.stringify(r.ev.filter(([k]) => k === "log").map(([, d]) => d.text)));
  await r.M.disconnect(false);
}

// 2) USB still uses the fast profile
{
  const r = await rig({ answer: true });
  t.check("USB: kind is usb", r.tr.kind === "usb" && /^USB 10c4:ea60$/.test(r.tr.label), `${r.tr.kind} ${r.tr.label}`);
  t.check("USB: poll stays 10 Hz", r.tr.pollMs === G.USB_POLL_MS && G.USB_POLL_MS === 100, r.tr.pollMs);
  t.check("USB: watchdog stays 3 s", r.tr.watchdogMs === G.USB_WATCHDOG_MS, r.tr.watchdogMs);
  await r.M.disconnect(false);
}

// 3) reconnect backoff: 2 s, then 4 s, minus time already waited
{
  const now = 1_000_000;
  t.check("backoff: USB is immediate", G.reconnectWaitMs({ kind: "usb", droppedAt: now, attempts: 2, now }) === 0);
  t.check("backoff: first BT drop waits 2 s", G.reconnectWaitMs({ kind: "bluetooth", droppedAt: now, attempts: 1, now }) === 2000);
  t.check("backoff: already waited 1.5 s -> 0.5 s left", G.reconnectWaitMs({ kind: "bluetooth", droppedAt: now - 1500, attempts: 1, now }) === 500);
  t.check("backoff: second drop waits 4 s", G.reconnectWaitMs({ kind: "bluetooth", droppedAt: now, attempts: 2, now }) === 4000);
  t.check("backoff: later drops cap at 8 s", G.reconnectWaitMs({ kind: "bluetooth", droppedAt: now, attempts: 9, now }) === 8000);
  t.check("backoff: nothing to wait if it never dropped", G.reconnectWaitMs({ kind: "bluetooth", droppedAt: 0, attempts: 1, now }) === 0);
}

// 4) after a silent BT drop, the hint tells the operator to power-cycle the ESP32
{
  G.resetSerialLinkMemory();
  const tr = new G.WebSerialTransport({});
  tr.info = {};
  t.check("hint: first-time BT still mentions Bluetooth", /Bluetooth/.test(tr.portHint()) && !/wedged/.test(tr.portHint()), tr.portHint());
  G.noteSerialDrop("bluetooth", true);
  t.check("hint: after a silent drop, power-cycle the ESP32", /Power-cycle the ESP32/.test(tr.portHint()) && /wedged/.test(tr.portHint()), tr.portHint());
  t.check("hint: restarting the page is not enough", /Restarting only this page/.test(tr.portHint()), tr.portHint());
  G.resetSerialLinkMemory();
}

// 5) a small BT RX buffer dies on a 10 Hz '?' flood, and stays dead until a power-cycle
{
  const env = {}; const { serial, port } = installMockSerial(env, { answer: true, bluetooth: true, rxLimit: 6, rxDrainMs: 200 });
  const tr = new G.WebSerialTransport(serial);
  await tr.open(115200);
  t.check("flood setup: Bluetooth with a 6-byte RX buffer", tr.kind === "bluetooth" && port.rxQ);
  const t0 = Date.now();
  while (Date.now() - t0 < 1600) { tr.write("?"); await sleep(100); }  // 10 Hz, like the old poll
  t.check("10 Hz '?' flood overflows a 6-byte BT RX buffer", port.wedged === true, `wedged=${port.wedged} polls=${port.pollCount} q=${port.rxQ.length}`);
  await tr.close();
  // Re-open without a power-cycle: the radio stays silent (half-open SPP).
  const tr2 = new G.WebSerialTransport(serial);
  tr2.handshakeMs = 400;
  await tr2.open(115200);
  const M = new Mm.Machine(cfg, chart, "", memStore());
  let err = null; try { await M.connect(tr2); } catch (e) { err = e; }
  t.check("after overflow, reconnect gets no reply until the ESP32 is restarted", !!err && /No reply from the controller/.test(err.message), String(err));
  await tr2.close();
  port.powerCycle();
  const tr3 = new G.WebSerialTransport(serial);
  await tr3.open(115200);
  const M3 = new Mm.Machine(cfg, chart, "", memStore());
  let err3 = null; try { await M3.connect(tr3); } catch (e) { err3 = e; }
  t.check("after a power-cycle, Bluetooth connects again", !err3 && M3.grbl && M3.grbl.ready, String(err3));
  await M3.disconnect(false);
}

// 6) 4 Hz poll (the Bluetooth profile) does not overflow the same buffer
{
  const env = {}; const { serial, port } = installMockSerial(env, { answer: true, bluetooth: true, rxLimit: 6, rxDrainMs: 200 });
  const tr = new G.WebSerialTransport(serial);
  await tr.open(115200);
  const t0 = Date.now();
  while (Date.now() - t0 < 1600) { tr.write("?"); await sleep(250); }
  t.check("4 Hz poll stays inside the 6-byte BT RX buffer", port.wedged === false, `wedged=${port.wedged} polls=${port.pollCount} q=${port.rxQ.length}`);
  await tr.close();
}

// 7) GrblLink on Bluetooth uses the 4 Hz poll and does not wedge a tight RX buffer during a run
{
  const r = await rig({ answer: true, bluetooth: true, rxLimit: 6, rxDrainMs: 200, state: "Run" }, { watchdogMs: 8000 });
  t.check("BT run: connected", !r.err && r.M.grbl.ready, String(r.err));
  await sleep(1600);
  const polls = r.port.pollCount;
  t.check("BT run: poll stays near 4 Hz, not 10 Hz", polls >= 3 && polls <= 10, `polls=${polls} in ~1.6 s`);
  t.check("BT run: the small RX buffer did not overflow", r.port.wedged === false && r.M.grbl.running === true, `wedged=${r.port.wedged} running=${r.M.grbl.running}`);
  // Same board, same buffer, forced back to the old 10 Hz poll — that is what wedges it.
  await r.M.disconnect(false);
}

{
  // Even if the interval is left at the old 100 ms, Bluetooth still refuses to
  // pile a second '?' while one is unanswered — that is what used to overflow
  // FluidNC's small RX buffer. A raw 10 Hz write (test 5) does wedge it.
  const r = await rig({ answer: true, bluetooth: true, rxLimit: 6, rxDrainMs: 200, state: "Run" }, { pollMs: 100, watchdogMs: 30000 });
  t.check("100 ms interval on BT: connected", !r.err, String(r.err));
  await sleep(1600);
  t.check("100 ms interval on BT still does not overflow (one '?' in flight)", r.port.wedged === false && r.M.grbl.running === true, `wedged=${r.port.wedged} polls=${r.port.pollCount}`);
  t.check("100 ms interval on BT does not actually reach 10 Hz", r.port.pollCount <= 12, `polls=${r.port.pollCount}`);
  await r.M.disconnect(false);
  G.resetSerialLinkMemory();
}

// 8) closing the port blocks further writes (a write into a half-closed SPP socket hangs the ESP32)
{
  const env = {}; const { serial, port } = installMockSerial(env, { answer: true, bluetooth: true });
  const tr = new G.WebSerialTransport(serial);
  await tr.open(115200);
  const closing = tr.close();
  tr.write("M5\n");
  tr.write("?");
  await closing;
  t.check("close: writes during close never reach the port", !/M5/.test(port.sent) && port.lateWrites === 0, `sent=${JSON.stringify(port.sent)} late=${port.lateWrites}`);
  t.check("close: the port is actually closed", port.isOpen === false);
}

// 9) a short torch-off move over Bluetooth does not send a settings / filesystem burst at the end
{
  const r = await rig({ answer: true, bluetooth: true });
  r.port.sent = "";
  r.port.pollCount = 0;
  r.M.grbl.sendLines(["G90", "G0 X1 Y1", "M5", "G0 Z5"]);
  const ok = await until(() => !r.M.grbl.pending.length && !r.M.grbl.inflight.length, 2000);
  await sleep(200);
  const body = commandsOf(r.port);
  t.check("end of move: the four lines were sent", ok && /G90/.test(body) && /G0 X1 Y1/.test(body) && /M5/.test(body) && /G0 Z5/.test(body), body);
  t.check("end of move: no $$, $CD, $LocalFS/List, or XModem", !/\$\$/.test(body) && !/\$CD/.test(body) && !/\$LocalFS\/List/.test(body) && !/\$Xmodem/.test(body), body);
  t.check("end of move: no ctrl-X reset", !body.includes("\x18"), JSON.stringify(body));
  await r.M.disconnect(false);
}

// 10) a silent Bluetooth port is not nudged on DTR/RTS (those lines do nothing useful on SPP)
{
  const r = await rig({ answer: false, bluetooth: true }, { handshakeMs: 500 });
  t.check("silent BT: connect fails", !!r.err, String(r.err));
  t.check("silent BT: reset lines were not touched", r.port.signals.length === 0, JSON.stringify(r.port.signals));
}

// 11) watchdog wording still names Bluetooth; memory records a silent drop
{
  G.resetSerialLinkMemory();
  const r = await rig({ answer: true, bluetooth: true }, { watchdogMs: 600 });
  await sleep(200);
  r.port.answer = false;
  const ev = r.ev;
  const ok = await until(() => ev.some(([k, d]) => k === "status" && d.state === "Disconnected"), 4000);
  const st = [...ev].reverse().find(([k]) => k === "status")?.[1] || {};
  t.check("BT watchdog: link is lost after no reply", ok && st.state === "Disconnected", JSON.stringify(st));
  t.check("BT watchdog: reason mentions Bluetooth", /No reply from the controller for/.test(st.reason || "") && /Bluetooth/.test(st.reason || ""), st.reason);
  t.check("BT watchdog: serial memory records a silent drop", G.serialLinkMemory.silent === true && G.serialLinkMemory.kind === "bluetooth" && G.serialLinkMemory.attempts >= 1, JSON.stringify(G.serialLinkMemory));
  t.check("BT watchdog: the power-cycle hint is now armed", /Power-cycle the ESP32/.test(r.tr.portHint()), r.tr.portHint());
}

process.exit(t.done() ? 1 : 0);

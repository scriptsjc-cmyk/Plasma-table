// USB (Web Serial) link to a FluidNC board, against a pretend port: handshake, unplug, watchdog, Alarm + unlock, jog format.
import fs from "node:fs";
import { mod, SITE } from "../lib/site.mjs";
import { T } from "../lib/t.mjs";
import { installMockSerial } from "../lib/mock-serial.mjs";
const t = new T("10_usb_link");
const G = await mod("usbserial"), Mm = await mod("machine");
const cfg = JSON.parse(fs.readFileSync(SITE + "config/machine.json", "utf8"));
const chart = JSON.parse(fs.readFileSync(SITE + "config/cut_chart.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return !!fn(); };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// one fresh machine + pretend port; events are recorded
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
const lastStatus = (ev) => [...ev].reverse().find(([k]) => k === "status")?.[1];

// 1) a board that never answers is NOT connected
{
  const t0 = Date.now();
  const r = await rig({ answer: false }, { handshakeMs: 800 });
  t.check("silent board: connect fails", !!r.err, String(r.err));
  t.check("silent board: the error names baud / port / firmware", /No reply from the controller/.test(r.err?.message) && /115200/.test(r.err?.message) && /port/i.test(r.err?.message) && /FluidNC/.test(r.err?.message), r.err?.message);
  t.check("silent board: it waited for the timeout, not forever", Date.now() - t0 >= 750 && Date.now() - t0 < 3000, Date.now() - t0);
  t.check("silent board: no link is left behind", r.M.grbl === null);
  t.check("silent board: the port is closed again (Connect can retry)", r.port.isOpen === false);
  t.check("silent board: the ESP32 reset lines were released once (DTR and RTS off)", r.port.signals.length === 1 && r.port.signals[0].dataTerminalReady === false && r.port.signals[0].requestToSend === false, JSON.stringify(r.port.signals));
  t.check("silent board: it only ever sent '?' (no $X, no reset, no G-code)", /^\?*$/.test(r.port.sent), JSON.stringify(r.port.sent.slice(0, 40)));
}
// 1b) which port was it? a Bluetooth COM port has no USB ids
{
  const tr = new G.WebSerialTransport({});
  tr.info = {}; t.check("port hint: no USB ids -> says it may be a Bluetooth COM port", /Bluetooth/.test(tr.portHint()));
  tr.info = { usbVendorId: 0x1a86, usbProductId: 0x7523 }; tr.label = "USB 1a86:7523";
  t.check("port hint: another USB chip -> names it and the CP2102 ids", /1a86:7523/.test(tr.portHint()) && /10c4:ea60/.test(tr.portHint()));
  tr.info = { usbVendorId: 0x10c4, usbProductId: 0xea60 };
  t.check("port hint: the CP2102 -> no hint", tr.portHint() === "");
}
// 2) port opened with FluidNC settings
{
  const r = await rig({ answer: true });
  const o = r.port.openOpts || {};
  t.check("port opened at 115200 8N1, no flow control", o.baudRate === 115200 && o.dataBits === 8 && o.stopBits === 1 && o.parity === "none" && o.flowControl === "none", JSON.stringify(o));
  t.check("status reply: connected", !r.err && r.M.grbl && r.M.grbl.ready, String(r.err));
  t.check("status reply: state is known (Idle)", r.M.state() === "Idle", r.M.state());
  t.check("connected log only after the reply", r.ev.some(([k, d]) => k === "log" && /^Connected to USB 10c4:ea60/.test(d.text)), JSON.stringify(r.ev.filter(([k]) => k === "log").map(([, d]) => d.text)));
  t.check("a reply was what made it ready: no reset lines touched", r.port.signals.length === 0);
  await r.M.disconnect(false);
}
// 3) banner only (no status reply yet) also counts
{
  const env = {}; const { serial, port } = installMockSerial(env, { answer: false, banner: true });
  const M = new Mm.Machine(cfg, chart, "", memStore());
  const tr = new G.WebSerialTransport(serial); tr.handshakeMs = 1500;
  await tr.open(115200);
  let err = null; try { await M.connect(tr); } catch (e) { err = e; }
  t.check("FluidNC banner: connected", !err && M.grbl && M.grbl.ready, String(err));
  await M.disconnect(false);
}
// 4) a board held in reset wakes when the lines are released
{
  const r = await rig({ answer: false, wakeOnRelease: true }, { handshakeMs: 1200 });
  t.check("held in reset: releasing DTR/RTS lets it boot and connect", !r.err && r.M.grbl && r.M.grbl.ready, String(r.err));
  await r.M.disconnect(false);
}
// 5) unplug -> link lost, with a reason; the port is let go
{
  const r = await rig({ answer: true });
  r.port.unplug();
  const ok = await until(() => lastStatus(r.ev)?.state === "Disconnected", 1500);
  const st = lastStatus(r.ev) || {};
  t.check("unplug: status goes Disconnected", ok, JSON.stringify(st));
  t.check("unplug: the reason says the cable / power", /unplugged|lost/i.test(st.reason || ""), st.reason);
  t.check("unplug: Disconnected is reported once", r.ev.filter(([k, d]) => k === "status" && d.state === "Disconnected").length === 1);
  t.check("unplug: polling stops (link not running)", r.M.grbl.running === false);
  t.check("unplug: the machine's state reads Disconnected", r.M.state() === "Disconnected", r.M.state());
}
// 6) watchdog: the board stops answering without a clean unplug
{
  const r = await rig({ answer: true }, { watchdogMs: 500 });
  await sleep(300);
  t.check("watchdog: still connected while replies come in", r.M.grbl.running === true && lastStatus(r.ev)?.state === "Idle");
  r.port.answer = false;
  const ok = await until(() => lastStatus(r.ev)?.state === "Disconnected", 2500);
  const st = lastStatus(r.ev) || {};
  t.check("watchdog: no reply for the timeout -> link lost", ok, JSON.stringify(st));
  t.check("watchdog: the reason says there was no reply", /No reply from the controller for/.test(st.reason || ""), st.reason);
  t.check("watchdog: the port is closed", r.port.isOpen === false);
}
// 7) a hidden tab slows timers to about one a minute: a long gap alone must not count as lost, unanswered polls must
{
  const r = await rig({ answer: true }, { watchdogMs: 400 });
  const g = r.M.grbl;
  clearInterval(g.poll); r.port.answer = false;
  g.lastRx = Date.now() - 60000; g.pollsSinceRx = 1;           // one slow poll, still waiting for its answer
  g._tick();
  t.check("watchdog: one slow poll after a long gap is not a lost link", g.running === true);
  g.pollsSinceRx = 10; g._tick();
  t.check("watchdog: several unanswered polls past the timeout are", g.running === false);
}
// 8) Alarm at start-up: shown, moves refused with a reason, unlock ($X) works
{
  const r = await rig({ answer: true, state: "Alarm" });
  t.check("Alarm: the state reads Alarm", r.M.state() === "Alarm", r.M.state());
  let msg = ""; try { r.M.command({ cmd: "jog", axis: "X", dist: 10 }); } catch (e) { msg = e.message; }
  t.check("Alarm: jog is refused with a reason (Unlock)", /Alarm/.test(msg) && /Unlock/.test(msg), msg);
  t.check("Alarm: nothing was sent for that jog", !/\$J=/.test(r.port.sent), JSON.stringify(r.port.sent.replace(/\?/g, "")));
  let m2 = ""; try { r.M.command({ cmd: "jog_dir", dir: [1, 0, 0] }); } catch (e) { m2 = e.message; }
  t.check("Alarm: press-and-hold jog is refused too", /Alarm/.test(m2), m2);
  let m3 = ""; try { r.M.startJob(); } catch (e) { m3 = e.message; }
  t.check("Alarm: Start explains (load a job / Alarm), it never silently fails", m3.length > 0, m3);
  t.check("Alarm: $X is never sent by itself", !/\$X/.test(r.port.sent));
  r.M.command({ cmd: "unlock" });
  await until(() => r.M.state() === "Idle", 1500);
  t.check("Unlock sends $X with a \\n line ending", /\$X\n/.test(r.port.sent), JSON.stringify(r.port.sent.replace(/\?/g, "")));
  t.check("after Unlock the state is Idle", r.M.state() === "Idle", r.M.state());
  r.M.command({ cmd: "jog", axis: "X", dist: 10 });
  await sleep(100);
  const jl = r.port.sent.replace(/\?/g, "").split("\n").find((l) => l.startsWith("$J="));
  t.check("jog uses FluidNC's $J= format, relative, mm, with a feed", /^\$J=G91 G21 X10\.000 F\d+$/.test(jl || ""), jl);
  t.check("jog line ends with \\n", /\$J=[^\n]*\n/.test(r.port.sent.replace(/\?/g, "")));
  t.check("jog 'ok' is parsed (nothing left in flight)", r.M.grbl.inflight.length === 0, JSON.stringify(r.M.grbl.inflight));
  await r.M.disconnect(false);
}
// 9) error:N from the controller is parsed and acked
{
  const r = await rig({ answer: true });
  r.port.state = "Alarm";             // the controller alarmed on its own (e.g. a limit) before the app saw a status
  r.M.grbl.status.state = "Idle";
  r.M.grbl.send("$J=G91 G21 X1 F500");
  await sleep(150);
  t.check("error:9 is logged with its meaning", r.ev.some(([k, d]) => k === "log" && /error:9/.test(d.text) && /Unlock/.test(d.text)));
  t.check("error:9 is acked (nothing left in flight)", r.M.grbl.inflight.length === 0);
  await r.M.disconnect(false);
}
// 9b) FluidNC ConfigAlarm (a bad config.yaml) is named, because $X can't clear it
{
  const r = await rig({ answer: true });
  r.port.push("[MSG:ERR: Ignored key idle_disabel]\r\n");
  await sleep(100);
  const al = r.ev.find(([k]) => k === "alarm")?.[1];
  t.check("config error: reported as an alarm naming config.yaml", al && al.code === "config" && /config\.yaml/.test(al.message) && /idle_disabel/.test(al.message), JSON.stringify(al));
  t.check("config error: says Unlock won't clear it", /Unlock won't clear/.test(al?.message || ""));
  await r.M.disconnect(false);
}
// 10) a deliberate disconnect is not reported as a lost link
{
  const r = await rig({ answer: true });
  await r.M.disconnect(false);
  const st = lastStatus(r.ev) || {};
  t.check("Disconnect by the operator: Disconnected with no 'lost' reason", st.state === "Disconnected" && !st.reason, JSON.stringify(st));
  t.check("Disconnect by the operator: port closed", r.port.isOpen === false);
}
// 11) Connect always shows the port list, even when Chrome remembers a port
{
  const env = {}; const { serial, port } = installMockSerial(env, { answer: true });
  let asked = 0; const req = serial.requestPort; serial.requestPort = async (...a) => { asked++; return req(...a); };
  const tr = new G.WebSerialTransport(serial);
  await tr.open(115200, false);
  t.check("Connect (no reuse): Chrome's port list is shown even with a remembered port", asked === 1, asked);
  await tr.close();
  t.check("Connect (no reuse): port closed again", port.isOpen === false);
  const src = fs.readFileSync(SITE + "js/machine/connection.js", "utf8");
  t.check("Connect button opens the port without reusing a remembered one", /t\.open\([^)]*,\s*false\)/.test(src));
}
process.exit(t.done() ? 1 : 0);

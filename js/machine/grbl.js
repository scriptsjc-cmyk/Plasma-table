// The GRBL text protocol (FluidNC / grblHAL) for every link: character-counting streaming, status polling + watchdog,
// the connect handshake, real-time commands, and status parsing. USB / Bluetooth serial itself is usbserial.js.
// Same protocol handling as plasma/grbl.py.

export const RT = {
  STATUS: "?", HOLD: "!", RESUME: "~", RESET: "\x18",
  JOG_CANCEL: new Uint8Array([0x85]), SPINDLE_STOP: new Uint8Array([0x9e]),
  // live cut-speed (feed override): reset to 100%, +10%, -10%, +1%, -1%
  FEED_100: new Uint8Array([0x90]), FEED_UP10: new Uint8Array([0x91]), FEED_DOWN10: new Uint8Array([0x92]),
  FEED_UP1: new Uint8Array([0x93]), FEED_DOWN1: new Uint8Array([0x94]),
};

const ALARMS = {
  1: "Hard limit hit. Check the limit switches, then unlock and re-home.",
  2: "Move would go past the machine's travel (soft limit).",
  3: "Reset while moving - position may be lost. Unlock, then set the start point again.",
  4: "Probe already triggered before touch-off. Check the floating head isn't stuck up and the sensor light is off.",
  5: "No sheet found: the torch went down as far as allowed without touching. Check the sheet and the sensor.",
  6: "Homing reset.", 7: "Homing: door opened.", 8: "Homing: couldn't clear the switch.", 9: "Homing: switch not found.",
  10: "E-stop pressed. Release it, then unlock.", 11: "Homing required - press Home first.", 13: "Motors disabled / driver fault.",
};
const ERRORS = {
  1: "Unknown command letter.", 2: "Bad number in command.", 9: "Machine is locked (alarm). Press Unlock.",
  15: "Jog would go past travel limits.", 20: "Unsupported G-code.", 22: "Feed rate not set.",
  24: "Two G-codes from the same group on one line.", 33: "Invalid move target.", 79: "Command not allowed in this state.",
};

// ------------------------------------------------------------------ status parsing
// grblHAL's plasma plugin appends "|THC:<arc voltage>,<flag letters>" to the real-time report (Plugin_plasma thc.c onRealtimeReport).
// Flag letters: A arc OK, E THC enabled, R THC active, T torch on, O ohmic probe, V velocity lock, H void lock, D down, U up.
// Nothing else reports arc OK or arc voltage: plain grblHAL and FluidNC send no THC field, so those values stay "not connected".
export function parseThc(v) {
  const i = String(v).indexOf(",");
  const volts = Number(i < 0 ? v : String(v).slice(0, i));
  if (!Number.isFinite(volts)) return null;
  const flags = (i < 0 ? "" : String(v).slice(i + 1)).toUpperCase().replace(/[^A-Z]/g, "");
  const has = (c) => flags.includes(c);
  return { volts, flags, arcOk: has("A"), enabled: has("E"), active: has("R"), torchOn: has("T"), ohmic: has("O"), velLock: has("V"), voidLock: has("H"), down: has("D"), up: has("U") };
}
export function parseStatus(text) {
  const parts = text.split("|");
  const st = { state: parts[0].split(":")[0], substate: parts[0] };
  for (const p of parts.slice(1)) {
    const c = p.indexOf(":");
    if (c < 0) continue;
    const k = p.slice(0, c), v = p.slice(c + 1);
    if (k === "MPos" || k === "WPos" || k === "WCO") st[k] = v.split(",").slice(0, 3).map(Number);
    else if (k === "FS") { const n = v.split(","); st.feed = Number(n[0]); st.speed = Number(n[1] || 0); }
    else if (k === "F") st.feed = Number(v);
    else if (k === "Pn") st.pins = v;
    else if (k === "Bf") st.buffer = v;
    else if (k === "Ov") st.overrides = v;
    else if (k === "A") st.accessories = v;
    else if (k === "THC") st.thc = parseThc(v);   // grblHAL Plugin_plasma only: "|THC:<arc volts>,<flags>"
  }
  return st;
}

// grblHAL lists the inputs that are ACTIVE in the "Pn:" field (nothing listed = all off)
const PIN_NAMES = {
  P: "probe", E: "estop", X: "limX", Y: "limY", Z: "limZ", A: "limA",
  D: "door", H: "hold", S: "start", R: "reset", M: "motorFault",
};
function decodePins(pn = "") {
  const out = { probe: false, estop: false, limX: false, limY: false, limZ: false, limA: false,
    door: false, hold: false, start: false, reset: false, motorFault: false };
  for (const ch of pn) if (PIN_NAMES[ch]) out[PIN_NAMES[ch]] = true;
  return out;
}

// ------------------------------------------------------------------ controller link
const POLL_MS = 100;
const CONFIG_ERR = /Configuration is invalid|^\[MSG:ERR: (Ignored key|Configuration error|Pin .* cannot be used)/;
export const BOOT_WAIT_MS = 25000;
export const BOOT_STUCK_MSG = "The controller is talking but never finished starting up. Check its start-up messages in the FluidNC web installer's Terminal for errors (config.yaml), then restart the board.";
export const NO_REPLY_MSG = "No reply from the controller. Check the baud rate (115200), that you picked the right COM port, that the board is running FluidNC/grblHAL, and that no other program (FluidNC web installer, a serial terminal) has the port open.";

export class GrblLink {
  constructor(transport, rxSize = 127, onEvent = () => {}) {
    this.t = transport;
    this.rx = rxSize;
    this.onEvent = onEvent;
    this.pending = [];
    this.inflight = [];
    this.wco = [0, 0, 0];
    this.status = { state: "Unknown", MPos: [0, 0, 0], WPos: [0, 0, 0], pins: "" };
    this.feedOv = 100;
    this.job = null;
    this.running = true;
    this.ready = !transport.needsHandshake;   // USB: only after a banner or a <status> report (see handshake())
    this.lastRx = Date.now();
    this.pollsSinceRx = 0;
    this.heard = false;                 // any line at all: the board is alive (maybe still booting)
    this.t.onLine = (l) => this._line(l);
    this.t.onClose = (reason) => this._closed(reason);
    this.poll = setInterval(() => this._tick(), POLL_MS);
  }

  // status poll + watchdog. Polls are counted, not just timed: a hidden tab slows timers to one a minute, and that alone
  // must not look like a dead link. Lost = several '?' in a row went unanswered AND the watchdog time has passed.
  _tick() {
    if (!this.running) return;
    const wd = this.t.watchdogMs;
    if (wd && this.ready && this.pollsSinceRx >= Math.ceil(wd / POLL_MS) && Date.now() - this.lastRx > wd) {
      this._closed(`No reply from the controller for ${Math.round(wd / 1000)} s. Check the USB cable and the controller's power.`);
      this.t.close().catch?.(() => {});
      return;
    }
    this.pollsSinceRx++;
    this.t.write(RT.STATUS);
  }

  // Resolves once the controller has really answered: its start-up banner ("Grbl 3.7 [FluidNC v4.1.1 ...]") or a <...> status
  // report to '?'. FluidNC prints its boot log first and only answers once boot ends, which can take 10+ s. So once
  // any line has arrived we wait up to BOOT_WAIT_MS and never touch the reset lines (that would restart the boot).
  // A board that stays fully silent has its auto-reset lines released once (it may be held in reset), then we give up.
  handshake(timeoutMs = 6000) {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      let nudged = false;
      const check = setInterval(() => {
        if (this.ready) { clearInterval(check); resolve(); return; }
        if (!this.running) { clearInterval(check); reject(new Error(this.closeReason || "The controller disconnected.")); return; }
        const dt = Date.now() - t0;
        if (!nudged && !this.heard && dt > timeoutMs / 2 && this.t.releaseResetLines) { nudged = true; this.t.releaseResetLines(); }
        const limit = this.heard ? Math.max(timeoutMs, BOOT_WAIT_MS) : timeoutMs;
        if (dt > limit) { clearInterval(check); reject(new Error(this.heard ? BOOT_STUCK_MSG : NO_REPLY_MSG)); }
      }, 50);
    });
  }

  _closed(reason) {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.poll);
    this.closeReason = reason || "";
    this.status = { ...this.status, state: "Disconnected", reason: reason || "" };
    this._emit("status", this.status);
    this._emit("log", { text: reason ? `Controller disconnected: ${reason}` : "Controller disconnected.", level: "error" });
    if (this.job && this.job.running) this._finishJob("error", "Job stopped: controller disconnected.");
  }

  _emit(kind, data) { try { this.onEvent(kind, data); } catch (e) { console.error(e); } }

  realtime(x) { this.t.write(x); }

  send(line, source = "manual") {
    line = String(line).trim();
    if (!line) return;
    this.pending.push({ line, source });
    this._pump();
  }
  // send one line and wait for its ok / error, with the lines the controller printed before it (e.g. a $ setting's value).
  // masked: the console shows "> $Name=********" instead of the line (passwords).
  ask(line, { masked = false, timeout = 5000 } = {}) {
    line = String(line).trim();
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => finish({ ok: false, lines: item.got, error: "no answer" }), timeout);
      const item = { line, source: masked ? "masked" : "manual", got: [], done: (ok, text) => finish({ ok, lines: item.got, error: ok ? "" : text }) };
      this.pending.push(item);
      this._pump();
    });
  }
  sendLines(lines, source = "manual") {
    for (const l of lines) if (l.trim() && !l.trim().startsWith(";")) this.send(l, source);
  }

  startJob(lines) {
    if (this.job && this.job.running) throw new Error("A job is already running.");
    const body = lines.filter((l) => l.trim() && !l.trim().startsWith(";"));
    this.job = { total: body.length, sent: 0, acked: 0, errors: 0, running: true, started: Date.now(), finished: null, result: null };
    for (const l of body) this.pending.push({ line: l, source: "job" });
    this._pump();
    this._emit("job", this.jobProgress());
  }

  hold() {
    const torchWasOn = !!this.status.torch;
    this.realtime(RT.HOLD);
    if (!torchWasOn) return;
    // once stopped, switch the torch off so it doesn't burn a hole (grbl spindle-stop override)
    let tries = 0;
    const tick = () => {
      if ((this.status.state === "Hold" && this.status.substate.startsWith("Hold:0")) || tries++ > 20) this.realtime(RT.SPINDLE_STOP);
      else setTimeout(tick, 50);
    };
    tick();
  }
  resume() { this.realtime(RT.RESUME); }
  stop(reason = "Stopped by operator.") {
    // Drop everything still queued NOW. Before, the 250 ms between feed-hold and reset let each 'ok' pump more
    // job lines (even M3) into the controller after STOP had been pressed; reset flushed them, but nothing should be sent.
    this.pending = [];
    this.realtime(RT.HOLD);
    setTimeout(() => this.reset(reason), 250);
  }
  reset(reason) {
    this.pending = [];
    this.inflight = [];
    if (this.job && this.job.running) this._finishJob("stopped", reason || "Reset.");
    this.realtime(RT.RESET);
  }

  jobProgress() {
    const j = this.job;
    if (!j) return null;
    return { total: j.total, sent: j.sent, acked: j.acked, errors: j.errors, running: j.running, result: j.result,
      elapsed: Math.round(((j.finished || Date.now()) - j.started) / 1000) };
  }

  async close() {
    clearInterval(this.poll);
    try { await this.t.close(); } catch (e) { /* ignore */ }   // the transport reports the close through onClose -> _closed
    this.running = false;
  }

  _finishJob(result, message) {
    const j = this.job;
    if (j && j.running) {
      j.running = false; j.result = result; j.finished = Date.now();
      this._emit("job", this.jobProgress());
      this._emit("log", { text: message, level: result === "done" ? "info" : "warn" });
    }
  }

  _pump() {
    while (this.pending.length) {
      const { line, source, got, done } = this.pending[0];
      const n = line.length + 1;
      const used = this.inflight.reduce((a, x) => a + x.n, 0);
      if (used + n > this.rx && this.inflight.length) break;
      this.pending.shift();
      this.inflight.push({ n, source, line, got, done });
      this.t.write(line + "\n");
      if (source === "job" && this.job) this.job.sent++;
      else if (source === "manual") this._emit("log", { text: "> " + line, level: "tx" });
      else if (source === "masked") this._emit("log", { text: "> " + line.split("=")[0] + "=********", level: "tx" });
    }
  }

  _ack(ok, text) {
    const item = this.inflight.shift();
    if (!item) return;
    if (item.done) item.done(ok, text);
    if (item.source === "job" && this.job) {
      this.job.acked++;
      if (!ok) {
        this.job.errors++;
        this._emit("log", { text: `Job line rejected: '${item.line}' -> ${text}`, level: "error" });
        this.pending = [];
        this._finishJob("error", `Job stopped: controller rejected '${item.line}'.`);
        this.realtime(RT.HOLD);
        setTimeout(() => this.realtime(RT.RESET), 250);  // reset is what turns the torch off
      } else if (this.job.running && this.job.acked >= this.job.total) {
        this._finishJob("done", "Job sent. Waiting for the last moves to finish.");
      }
      this._emit("job", this.jobProgress());
    }
    this._pump();
  }

  _line(line) {
    this.heard = true;
    this.lastRx = Date.now();
    this.pollsSinceRx = 0;
    if (line.startsWith("<") && line.endsWith(">")) {
      this.ready = true;
      const st = parseStatus(line.slice(1, -1));
      if (st.WCO) this.wco = st.WCO;
      if (st.MPos) st.WPos = st.MPos.map((v, i) => v - this.wco[i]);
      else if (st.WPos) st.MPos = st.WPos.map((v, i) => v + this.wco[i]);
      st.torch = (st.accessories || "").includes("S");
      st.inputs = decodePins(st.pins);
      if (st.overrides) this.feedOv = Number(st.overrides.split(",")[0]) || 100;  // only sent now and then
      st.feedOv = this.feedOv;
      this.status = st;
      this._emit("status", st);
      return;
    }
    if (line === "ok") return this._ack(true, line);
    const code = () => { const n = parseInt(line.split(":")[1], 10); return Number.isNaN(n) ? null : n; };
    if (line.startsWith("error")) {
      const c = code();
      this._emit("log", { text: `${line} ${ERRORS[c] || ""}`.trim(), level: "error" });
      return this._ack(false, line);
    }
    if (line.startsWith("ALARM")) {
      const c = code(), msg = ALARMS[c] || "Alarm.";
      this._emit("alarm", { code: c, message: msg });
      this._emit("log", { text: `${line}: ${msg}`, level: "error" });
      this.pending = []; this.inflight = [];
      if (this.job && this.job.running) this._finishJob("alarm", `Job stopped by alarm ${c}: ${msg}`);
      return;
    }
    if (line.toLowerCase().startsWith("grbl")) {
      this.ready = true;
      this.inflight = [];
      this._emit("log", { text: line, level: "info" });
      return;
    }
    // FluidNC ConfigAlarm: config.yaml has an error. The status says plain "Alarm", but $X can't clear it, so say what it really is
    if (CONFIG_ERR.test(line)) this._emit("alarm", { code: "config", message: `FluidNC reports a problem in its config.yaml (${line.replace(/^\[MSG:(ERR: )?|\]$/g, "")}). Unlock won't clear this: fix config.yaml, then restart the board. Type $SS in the console to see its start-up messages.` });
    if (line.startsWith("[PRB:")) this._emit("probe", { text: line });
    if (this.inflight[0] && this.inflight[0].got) this.inflight[0].got.push(line);     // the answer to an ask() comes before its ok
    this._emit("log", { text: line, level: "rx" });
  }
}

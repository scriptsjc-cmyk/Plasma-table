// Talking to grblHAL over USB from the browser (Web Serial API, Chrome/Edge desktop).
// Same protocol handling as plasma/grbl.py: character-counting streaming,
// status polling, real-time commands.

export const RT = {
  STATUS: "?", HOLD: "!", RESUME: "~", RESET: "\x18",
  JOG_CANCEL: new Uint8Array([0x85]), SPINDLE_STOP: new Uint8Array([0x9e]),
};

export const ALARMS = {
  1: "Hard limit hit. Check the limit switches, then unlock and re-home.",
  2: "Move would go past the machine's travel (soft limit).",
  3: "Reset while moving - position may be lost. Unlock, then re-home or re-zero.",
  4: "Probe already triggered before touch-off. Check the floating head isn't stuck up and the sensor light is off.",
  5: "No sheet found: the torch went down as far as allowed without touching. Check the sheet and the sensor.",
  6: "Homing reset.", 7: "Homing: door opened.", 8: "Homing: couldn't clear the switch.", 9: "Homing: switch not found.",
  10: "E-stop pressed. Release it, then unlock.", 11: "Homing required - press Home first.", 13: "Motors disabled / driver fault.",
};
export const ERRORS = {
  1: "Unknown command letter.", 2: "Bad number in command.", 9: "Machine is locked (alarm). Press Unlock.",
  15: "Jog would go past travel limits.", 20: "Unsupported G-code.", 22: "Feed rate not set.",
  24: "Two G-codes from the same group on one line.", 33: "Invalid move target.", 79: "Command not allowed in this state.",
};

// ------------------------------------------------------------------ transport
export class WebSerialTransport {
  constructor() { this.onLine = null; this.onClose = null; this.port = null; this.buf = ""; this.label = "USB"; }
  static supported() { return typeof navigator !== "undefined" && "serial" in navigator; }

  async open(baud = 115200, reuse = true) {
    let port = null;
    if (reuse) {
      const known = await navigator.serial.getPorts();
      if (known.length === 1) port = known[0];
    }
    if (!port) port = await navigator.serial.requestPort();  // shows Chrome's port picker
    await port.open({ baudRate: baud });
    this.port = port;
    const info = port.getInfo ? port.getInfo() : {};
    this.label = info.usbVendorId ? `USB ${info.usbVendorId.toString(16)}:${(info.usbProductId || 0).toString(16)}` : "USB";
    this.writer = port.writable.getWriter();
    this.enc = new TextEncoder();
    this.readLoop();
  }

  async readLoop() {
    const dec = new TextDecoder();
    while (this.port && this.port.readable) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          this.buf += dec.decode(value, { stream: true });
          let i;
          while ((i = this.buf.indexOf("\n")) >= 0) {
            const line = this.buf.slice(0, i).replace(/\r$/, "").trim();
            this.buf = this.buf.slice(i + 1);
            if (line && this.onLine) this.onLine(line);
          }
        }
      } catch (e) {
        break; // unplugged or closed
      } finally {
        try { reader.releaseLock(); } catch (e) { /* ignore */ }
      }
      if (this.closing) break;
    }
    if (this.onClose) this.onClose();
  }

  write(data) {
    const bytes = typeof data === "string" ? this.enc.encode(data) : data;
    return this.writer.write(bytes).catch(() => {});
  }

  async close() {
    this.closing = true;
    try { await this.reader?.cancel(); } catch (e) { /* ignore */ }
    try { this.writer?.releaseLock(); } catch (e) { /* ignore */ }
    try { await this.port?.close(); } catch (e) { /* ignore */ }
    this.port = null;
  }
}

// ------------------------------------------------------------------ status parsing
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
  }
  return st;
}

// ------------------------------------------------------------------ controller link
export class GrblLink {
  constructor(transport, rxSize = 127, onEvent = () => {}) {
    this.t = transport;
    this.rx = rxSize;
    this.onEvent = onEvent;
    this.pending = [];
    this.inflight = [];
    this.wco = [0, 0, 0];
    this.status = { state: "Unknown", MPos: [0, 0, 0], WPos: [0, 0, 0], pins: "" };
    this.job = null;
    this.running = true;
    this.t.onLine = (l) => this._line(l);
    this.t.onClose = () => {
      this.status = { ...this.status, state: "Disconnected" };
      this._emit("status", this.status);
      this._emit("log", { text: "Controller disconnected.", level: "error" });
      if (this.job && this.job.running) this._finishJob("error", "Job stopped: controller disconnected.");
      this.running = false;
      clearInterval(this.poll);
    };
    this.poll = setInterval(() => { if (this.running) this.t.write(RT.STATUS); }, 200);
  }

  _emit(kind, data) { try { this.onEvent(kind, data); } catch (e) { console.error(e); } }

  realtime(x) { this.t.write(x); }

  send(line, source = "manual") {
    line = String(line).trim();
    if (!line) return;
    this.pending.push({ line, source });
    this._pump();
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
    this.running = false;
    clearInterval(this.poll);
    try { await this.t.close(); } catch (e) { /* ignore */ }
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
      const { line, source } = this.pending[0];
      const n = line.length + 1;
      const used = this.inflight.reduce((a, x) => a + x.n, 0);
      if (used + n > this.rx && this.inflight.length) break;
      this.pending.shift();
      this.inflight.push({ n, source, line });
      this.t.write(line + "\n");
      if (source === "job" && this.job) this.job.sent++;
      else if (source === "manual") this._emit("log", { text: "> " + line, level: "tx" });
    }
  }

  _ack(ok, text) {
    const item = this.inflight.shift();
    if (!item) return;
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
    if (line.startsWith("<") && line.endsWith(">")) {
      const st = parseStatus(line.slice(1, -1));
      if (st.WCO) this.wco = st.WCO;
      if (st.MPos) st.WPos = st.MPos.map((v, i) => v - this.wco[i]);
      else if (st.WPos) st.MPos = st.WPos.map((v, i) => v + this.wco[i]);
      st.torch = (st.accessories || "").includes("S");
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
      this.inflight = [];
      this._emit("log", { text: line, level: "info" });
      return;
    }
    if (line.startsWith("[PRB:")) this._emit("probe", { text: line });
    this._emit("log", { text: line, level: "rx" });
  }
}

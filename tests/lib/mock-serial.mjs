// A pretend Web Serial port with a FluidNC v4 behind it. Never touches a real device.
// installMockSerial(target, opts) puts target.mockSerial (a navigator.serial look-alike) and target.mockPort in place.
// It is self-contained on purpose: e2e suites inject it into the page with `(${installMockSerial})(window, {...})`.
//   opts.answer   reply to '?' with a <status> report (false = a silent board: wrong port/baud, or held in reset)
//   opts.banner   print the FluidNC banner as soon as the port opens (as after an ESP32 reset)
//   opts.state    "Idle" or "Alarm" at start-up
//   opts.slowBoot  ms of FluidNC boot log (no answer to '?') after opening, then the banner; reset lines restart it
//   opts.wakeOnRelease  silent until setSignals({dtr:false, rts:false}) releases the reset line, then boots
//   opts.xmodem     "ok" (default), "nohello", "cancel", "nospace" — FluidNC-like $Xmodem/Receive behaviour
//   opts.runningFile { path, pct }  already running a local file when the port opens (reconnect mid-cut)
//   opts.fileStep   percent added to a file run on each '?' (0 = tests drive setFileProgress themselves)
export function installMockSerial(target, opts = {}) {
  const o = { answer: true, banner: false, state: "Idle", wakeOnRelease: false, slowBoot: 0, xmodem: "ok", fileStep: 0, ...opts };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const BANNER = "Grbl 3.7 [FluidNC v4.1.1 (noradio) '$' for help]";
  // CRC-16/XMODEM, same poly as FluidNC xmodem.cpp
  const crc16 = (buf, start, len) => {
    let crc = 0;
    for (let i = 0; i < len; i++) {
      let x = ((crc >> 8) ^ buf[start + i]) & 0xff;
      crc = ((crc << 8) ^ [0x0000,0x1021,0x2042,0x3063,0x4084,0x50a5,0x60c6,0x70e7,0x8108,0x9129,0xa14a,0xb16b,0xc18c,0xd1ad,0xe1ce,0xf1ef,
        0x1231,0x0210,0x3273,0x2252,0x52b5,0x4294,0x72f7,0x62d6,0x9339,0x8318,0xb37b,0xa35a,0xd3bd,0xc39c,0xf3ff,0xe3de,
        0x2462,0x3443,0x0420,0x1401,0x64e6,0x74c7,0x44a4,0x5485,0xa56a,0xb54b,0x8528,0x9509,0xe5ee,0xf5cf,0xc5ac,0xd58d,
        0x3653,0x2672,0x1611,0x0630,0x76d7,0x66f6,0x5695,0x46b4,0xb75b,0xa77a,0x9719,0x8738,0xf7df,0xe7fe,0xd79d,0xc7bc,
        0x48c4,0x58e5,0x6886,0x78a7,0x0840,0x1861,0x2802,0x3823,0xc9cc,0xd9ed,0xe98e,0xf9af,0x8948,0x9969,0xa90a,0xb92b,
        0x5af5,0x4ad4,0x7ab7,0x6a96,0x1a71,0x0a50,0x3a33,0x2a12,0xdbfd,0xcbdc,0xfbbf,0xeb9e,0x9b79,0x8b58,0xbb3b,0xab1a,
        0x6ca6,0x7c87,0x4ce4,0x5cc5,0x2c22,0x3c03,0x0c60,0x1c41,0xedae,0xfd8f,0xcdec,0xddcd,0xad2a,0xbd0b,0x8d68,0x9d49,
        0x7e97,0x6eb6,0x5ed5,0x4ef4,0x3e13,0x2e32,0x1e51,0x0e70,0xff9f,0xefbe,0xdfdd,0xcffc,0xbf1b,0xaf3a,0x9f59,0x8f78,
        0x9188,0x81a9,0xb1ca,0xa1eb,0xd10c,0xc12d,0xf14e,0xe16f,0x1080,0x00a1,0x30c2,0x20e3,0x5004,0x4025,0x7046,0x6067,
        0x83b9,0x9398,0xa3fb,0xb3da,0xc33d,0xd31c,0xe37f,0xf35e,0x02b1,0x1290,0x22f3,0x32d2,0x4235,0x5214,0x6277,0x7256,
        0xb5ea,0xa5cb,0x95a8,0x8589,0xf56e,0xe54f,0xd52c,0xc50d,0x34e2,0x24c3,0x14a0,0x0481,0x7466,0x6447,0x5424,0x4405,
        0xa7db,0xb7fa,0x8799,0x97b8,0xe75f,0xf77e,0xc71d,0xd73c,0x26d3,0x36f2,0x0691,0x16b0,0x6657,0x7676,0x4615,0x5634,
        0xd94c,0xc96d,0xf90e,0xe92f,0x99c8,0x89e9,0xb98a,0xa9ab,0x5844,0x4865,0x7806,0x6827,0x18c0,0x08e1,0x3882,0x28a3,
        0xcb7d,0xdb5c,0xeb3f,0xfb1e,0x8bf9,0x9bd8,0xabbb,0xbb9a,0x4a75,0x5a54,0x6a37,0x7a16,0x0af1,0x1ad0,0x2ab3,0x3a92,
        0xfd2e,0xed0f,0xdd6c,0xcd4d,0xbdaa,0xad8b,0x9de8,0x8dc9,0x7c26,0x6c07,0x5c64,0x4c45,0x3ca2,0x2c83,0x1ce0,0x0cc1,
        0xef1f,0xff3e,0xcf5d,0xdf7c,0xaf9b,0xbfba,0x8fd9,0x9ff8,0x6e17,0x7e36,0x4e55,0x5e74,0x2e93,0x3eb2,0x0ed1,0x1ef0][x]) & 0xffff;
    }
    return crc;
  };
  class MockPort extends EventTarget {
    constructor() {
      super();
      this.sent = ""; this.signals = []; this.state = o.state; this.answer = o.answer;
      this.isOpen = false; this.openOpts = null; this.readable = null; this.writable = null;
      this.fs = {}; this.fileRun = null; this.xm = null; this.lineBuf = [];
      if (o.runningFile) {
        this.fileRun = { path: o.runningFile.path || "/littlefs/job.nc", pct: o.runningFile.pct || 0, sent: false };
        this.state = o.state && o.state !== "Idle" ? o.state : "Run";
      }
    }
    getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }   // CP2102
    async open(openOpts) {
      if (this.isOpen) throw new DOMException("The port is already open.", "InvalidStateError");
      this.openOpts = openOpts; this.isOpen = true;
      this.readable = new ReadableStream({ start: (c) => { this.ctl = c; } });
      this.writable = new WritableStream({ write: (chunk) => this._rx(chunk) });
      if (o.banner) setTimeout(() => this.boot(), 20);
      if (o.slowBoot) this.slow();
    }
    slow() {
      this.answer = false; clearInterval(this.bootTimer); const t0 = Date.now();
      this.bootTimer = setInterval(() => {
        if (!this.isOpen) { clearInterval(this.bootTimer); return; }
        if (Date.now() - t0 < o.slowBoot) { this.push("[MSG:INFO: Connecting to STA SSID:test]\r\n"); return; }
        clearInterval(this.bootTimer); this.answer = true; this.boot();
      }, 200);
    }
    async setSignals(s) { this.signals.push(s); if (o.slowBoot) this.slow(); if (o.wakeOnRelease && s.requestToSend === false) { this.answer = true; setTimeout(() => this.boot(), 20); } }
    boot() { this.push("[MSG:INFO: FluidNC v4.1.1 https://github.com/bdring/FluidNC]\r\n" + BANNER + "\r\n"); }
    push(text) { try { if (this.ctl) this.ctl.enqueue(typeof text === "string" ? enc.encode(text) : text); } catch (e) { /* closed */ } }
    pushByte(b) { this.push(new Uint8Array([b])); }
    status() {
      let s = `<${this.state}|MPos:0.000,0.000,0.000|FS:0,0`;
      if (this.fileRun && !this.fileRun.ended) {
        s += this.fileRun.sent ? `|SD: ${this.fileRun.path}: Sent` : `|SD:${Number(this.fileRun.pct).toFixed(2)},${this.fileRun.path}`;
      }
      return s + `>`;
    }
    setFileProgress(pct) { if (this.fileRun) this.fileRun.pct = Math.max(0, Math.min(100, pct)); }
    finishFile() {
      if (!this.fileRun) return;
      this.fileRun.pct = 100; this.fileRun.sent = true;
      this.push(this.status() + "\r\n");
      this.fileRun.ended = true; this.state = "Idle";
      this.push("ok\r\n");   // deferred ack of $LocalFS/Run
      const done = this.fileRun; this.fileRun = null;
      this.push(this.status() + "\r\n");
      return done;
    }
    _reset() {
      this.sent += "\x18";
      this.xm = null;
      if (this.fileRun) { this.fileRun = null; }
      this.state = "Idle";
      this.push(BANNER + "\r\n");
    }
    _rx(chunk) {
      const bytes = typeof chunk === "string" ? enc.encode(chunk)
        : chunk instanceof Uint8Array ? chunk
        : new Uint8Array(chunk.buffer ? chunk : enc.encode(String(chunk)));
      for (const b of bytes) this._byte(b);
    }
    _byte(b) {
      if (this.xm) { this._xmByte(b); return; }
      const ch = String.fromCharCode(b);
      if (ch === "?") {
        if (this.answer) {
          if (this.fileRun && !this.fileRun.ended && this.state === "Run" && o.fileStep) {
            this.fileRun.pct = Math.min(100, this.fileRun.pct + o.fileStep);
            if (this.fileRun.pct >= 100) { this.finishFile(); return; }
          }
          this.push(this.status() + "\r\n");
        }
        return;
      }
      if (ch === "!") { this.sent += ch; if (this.fileRun && this.state === "Run") this.state = "Hold:0"; return; }
      if (ch === "~") { this.sent += ch; if (this.fileRun && String(this.state).startsWith("Hold")) this.state = "Run"; return; }
      if (ch === "\x18") { this._reset(); return; }
      this.sent += ch;
      if (ch !== "\n" || !this.answer) return;
      const line = this.sent.slice(0, -1).split("\n").pop().replace(/\r$/, "").trim();
      this._line(line);
    }
    _line(line) {
      if (line === "$X") { this.state = "Idle"; this.push("[MSG:Caution: Unlocked]\r\nok\r\n"); return; }
      if (/^\$J=/.test(line) && this.state === "Alarm") { this.push("error:9\r\n"); return; }
      if (/^\$LocalFS\/Size/i.test(line)) { this.push("LocalFS  Total:1.50 MB Used:0.20 MB\r\nok\r\n"); return; }
      if (/^\$LocalFS\/Run=/i.test(line)) return this._runFile(line.split("=")[1] || "");
      if (/^\$Xmodem\/Receive=/i.test(line) || /^\$XR=/i.test(line)) return this._startXmodem(line.split("=")[1] || "uploaded");
      this.push("ok\r\n");
    }
    _canon(name) {
      const n = String(name || "job.nc").replace(/^\/+/, "");
      const base = n.split("/").pop();
      return "/littlefs/" + (base || "job.nc");
    }
    _runFile(name) {
      const path = this._canon(name);
      const body = this.fs[path] || this.fs["/" + (name || "").replace(/^\/+/, "")] || this.fs[name];
      if (body == null) { this.push("error:16\r\n"); return; }
      this.fileRun = { path, pct: 0, sent: false };
      this.state = "Run";
      // Error::Deferred: no ok until finishFile()
    }
    _startXmodem(name) {
      const path = this._canon(name);
      const mode = o.xmodem || "ok";
      if (mode === "nohello") return;   // never sends 'C'
      this.xm = { path, expect: 1, held: null, file: [], mode };
      setTimeout(() => { if (this.xm && this.isOpen) { if (mode === "cancel") { this.pushByte(0x18); this.pushByte(0x18); this.xm = null; this.push("[MSG:INFO: Reception failed or was canceled]\r\nerror:60\r\n"); } else this.pushByte(0x43); } }, 30);
    }
    _xmByte(b) {
      const xm = this.xm; if (!xm) return;
      if (!xm.buf) xm.buf = [];
      xm.buf.push(b);
      const buf = xm.buf;
      const SOH = 0x01, STX = 0x02, EOT = 0x04, ACK = 0x06, NAK = 0x15, CAN = 0x18, CTRLZ = 0x1A;
      if (buf.length === 1 && buf[0] === EOT) {
        if (xm.mode === "nospace") { this.pushByte(CAN); this.pushByte(CAN); this.pushByte(CAN); this.xm = null; this.push("[MSG:INFO: Reception failed: not enough free space on the target filesystem]\r\nerror:60\r\n"); return; }
        if (xm.held) {
          let n = xm.held.length; while (n > 0 && xm.held[n - 1] === CTRLZ) n--;
          for (let i = 0; i < n; i++) xm.file.push(xm.held[i]);
        }
        this.fs[xm.path] = Uint8Array.from(xm.file);
        this.pushByte(ACK);
        const n = xm.file.length;
        this.xm = null;
        this.push(`[MSG:INFO: Received ${n} bytes to file ${xm.path}]\r\nok\r\n`);
        return;
      }
      if (buf.length >= 2 && buf[0] === CAN && buf[1] === CAN) {
        this.pushByte(ACK); this.xm = null;
        this.push("[MSG:INFO: Reception failed or was canceled]\r\nerror:60\r\n");
        return;
      }
      const head = buf[0];
      if (head !== SOH && head !== STX) { if (buf.length > 8) xm.buf = []; return; }
      const size = head === STX ? 1024 : 128;
      const need = 3 + size + 2;
      if (buf.length < need) return;
      const pkt = new Uint8Array(buf.splice(0, need));
      const pktNo = pkt[1], inv = pkt[2];
      const ok = inv === ((~pktNo) & 0xff) && crc16(pkt, 3, size) === ((pkt[3 + size] << 8) | pkt[3 + size + 1]);
      if (!ok || (pktNo !== (xm.expect & 0xff) && pktNo !== ((xm.expect - 1) & 0xff))) { this.pushByte(NAK); return; }
      if (pktNo === (xm.expect & 0xff)) {
        if (xm.held) { for (let i = 0; i < xm.held.length; i++) xm.file.push(xm.held[i]); }
        xm.held = pkt.slice(3, 3 + size);
        xm.expect = (xm.expect + 1) & 0xff;
      }
      const ack = () => this.pushByte(ACK);
      if (o.xmodemAckDelay) setTimeout(ack, o.xmodemAckDelay);
      else ack();
    }
    unplug() {                       // what Chrome does when the cable comes out
      this.isOpen = false;
      try { this.ctl.error(new DOMException("The device has been lost.", "NetworkError")); } catch (e) { /* ignore */ }
      this.readable = null; this.writable = null;
      this.dispatchEvent(new Event("disconnect"));
      serial.dispatchEvent(Object.assign(new Event("disconnect"), { port: this }));
    }
    async close() { this.isOpen = false; clearInterval(this.bootTimer); try { this.ctl.close(); } catch (e) { /* ignore */ } this.readable = null; this.writable = null; }
  }
  const port = new MockPort();
  const serial = new EventTarget();
  serial.getPorts = async () => [port];
  serial.requestPort = async () => port;
  target.mockSerial = serial; target.mockPort = port;
  return { serial, port };
}

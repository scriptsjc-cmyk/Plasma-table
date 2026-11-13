// A pretend Web Serial port with a FluidNC v4 behind it. Never touches a real device.
// installMockSerial(target, opts) puts target.mockSerial (a navigator.serial look-alike) and target.mockPort in place.
// It is self-contained on purpose: e2e suites inject it into the page with `(${installMockSerial})(window, {...})`.
//   opts.answer   reply to '?' with a <status> report (false = a silent board: wrong port/baud, or held in reset)
//   opts.banner   print the FluidNC banner as soon as the port opens (as after an ESP32 reset)
//   opts.state    "Idle" or "Alarm" at start-up
//   opts.slowBoot  ms of FluidNC boot log (no answer to '?') after opening, then the banner; reset lines restart it
//   opts.wakeOnRelease  silent until setSignals({dtr:false, rts:false}) releases the reset line, then boots
export function installMockSerial(target, opts = {}) {
  const o = { answer: true, banner: false, state: "Idle", wakeOnRelease: false, slowBoot: 0, ...opts };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const BANNER = "Grbl 3.7 [FluidNC v4.1.1 (noradio) '$' for help]";
  class MockPort extends EventTarget {
    constructor() { super(); this.sent = ""; this.signals = []; this.state = o.state; this.answer = o.answer; this.isOpen = false; this.openOpts = null; this.readable = null; this.writable = null; }
    getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }   // CP2102
    async open(openOpts) {
      if (this.isOpen) throw new DOMException("The port is already open.", "InvalidStateError");
      this.openOpts = openOpts; this.isOpen = true;
      this.readable = new ReadableStream({ start: (c) => { this.ctl = c; } });
      this.writable = new WritableStream({ write: (chunk) => this._rx(typeof chunk === "string" ? chunk : dec.decode(chunk)) });
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
    push(text) { try { if (this.ctl) this.ctl.enqueue(enc.encode(text)); } catch (e) { /* closed */ } }
    status() { return `<${this.state}|MPos:0.000,0.000,0.000|FS:0,0>`; }
    _rx(text) {
      for (const ch of text) {
        if (ch === "?") { if (this.answer) this.push(this.status() + "\r\n"); continue; }
        if (ch === "\x18") { this.sent += ch; continue; }
        this.sent += ch;
        if (ch !== "\n" || !this.answer) continue;
        const line = this.sent.slice(0, -1).split("\n").pop().trim();
        if (line === "$X") { this.state = "Idle"; this.push("[MSG:Caution: Unlocked]\r\nok\r\n"); }
        else if (/^\$J=/.test(line) && this.state === "Alarm") this.push("error:9\r\n");
        else this.push("ok\r\n");
      }
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

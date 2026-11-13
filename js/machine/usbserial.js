// USB to the controller from the browser (Web Serial API, Chrome/Edge desktop): open the port, read lines, notice an unplug.
// FluidNC and grblHAL both talk 115200 8N1 with no flow control. Hardware flow control must stay off: on Windows Chrome then
// drives RTS itself, and on an ESP32 DevKitC (CP2102 auto-reset circuit) RTS is wired to EN, so it can hold the chip in reset.
export const SERIAL_OPTIONS = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none", bufferSize: 4096 };

export class WebSerialTransport {
  constructor(serial = typeof navigator !== "undefined" ? navigator.serial : null) {
    this.serial = serial;
    this.onLine = null; this.onClose = null; this.port = null; this.buf = ""; this.label = "USB"; this.kind = "usb";
    this.needsHandshake = true;   // "connected" only after the controller answers (GrblLink.handshake)
    this.handshakeMs = 8000;      // a silent board gets this long; once it prints anything GrblLink waits for boot to finish (BOOT_WAIT_MS)
    this.watchdogMs = 3000;       // no answer to '?' for this long = the link is lost (GrblLink)
    this.gone = false;
    this.raw = false;          // XModem: deliver bytes, don't split on newlines (packets may contain 0x0A)
    this.onBytes = null;
    this._onDisconnect = (e) => { if (!e || !e.target || e.target === this.port || e.port === this.port) this._lost("The USB cable was unplugged (or the controller lost power)."); };
  }
  static supported() { return typeof navigator !== "undefined" && "serial" in navigator; }

  async open(baud = 115200, reuse = true) {
    let port = null;
    if (reuse) {
      const known = await this.serial.getPorts();
      if (known.length === 1) port = known[0];
    }
    if (!port) port = await this.serial.requestPort();  // shows Chrome's port picker
    await port.open({ ...SERIAL_OPTIONS, baudRate: Number(baud) || SERIAL_OPTIONS.baudRate });
    this.port = port;
    const info = port.getInfo ? port.getInfo() : {};
    this.info = info;
    this.label = info.usbVendorId ? `USB ${info.usbVendorId.toString(16)}:${(info.usbProductId || 0).toString(16)}` : "USB";
    // unplug: Chrome fires 'disconnect' on navigator.serial and on the port itself (a pending read usually fails too)
    this.serial.addEventListener?.("disconnect", this._onDisconnect);
    port.addEventListener?.("disconnect", this._onDisconnect);
    this.writer = port.writable.getWriter();
    this.enc = new TextEncoder();
    this.readLoop();
  }

  // when the board never answered: was this even the ESP32's USB chip? (Windows laptops often list Bluetooth COM ports too)
  portHint() {
    const info = this.info || {};
    if (!info.usbVendorId) return " The port you picked isn't a USB device (it may be a Bluetooth COM port). Pick the 'CP210x' / 'Silicon Labs' one.";
    if (info.usbVendorId !== 0x10c4) return ` The port you picked is ${this.label}; an ESP32 DevKitC's CP2102 shows as USB 10c4:ea60.`;
    return "";
  }

  // ESP32 auto-reset lines: with DTR and RTS both released the chip runs normally. Only used when the board stays silent.
  async releaseResetLines() {
    try { await this.port?.setSignals?.({ dataTerminalReady: false, requestToSend: false }); return true; } catch (e) { return false; }
  }

  setRaw(on, onBytes) {
    if (on && this.buf) {
      const leftover = this.enc.encode(this.buf);
      this.buf = "";
      if (leftover.length && onBytes) onBytes(leftover);
    }
    this.raw = !!on;
    this.onBytes = on ? onBytes : null;
  }

  async readLoop() {
    const dec = new TextDecoder();
    let why = "The USB port closed.";
    while (this.port && this.port.readable && !this.gone) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (this.raw && this.onBytes) {
            if (this.buf) { const left = this.enc.encode(this.buf); this.buf = ""; if (left.length) this.onBytes(left); }
            if (value && value.length) this.onBytes(value);
            continue;
          }
          this.buf += dec.decode(value, { stream: true });
          if (this.buf.length > 65536 && !this.buf.includes("\n")) this.buf = "";   // noise at the wrong baud must not grow memory
          let i;
          while ((i = this.buf.indexOf("\n")) >= 0) {
            const line = this.buf.slice(0, i).replace(/\r$/, "").trim();
            this.buf = this.buf.slice(i + 1);
            if (line && this.onLine) this.onLine(line);
          }
        }
      } catch (e) {
        why = "USB connection lost" + (e && e.message ? ": " + e.message : ".");
        break; // unplugged or closed
      } finally {
        try { reader.releaseLock(); } catch (e) { /* ignore */ }
      }
      if (this.closing) break;
    }
    if (this.closing) this._closed(null);
    else this._lost(why);
  }

  write(data) {
    if (this.gone || !this.writer) return Promise.resolve();
    const bytes = typeof data === "string" ? this.enc.encode(data) : data;
    return this.writer.write(bytes).catch((e) => { if (!this.closing) this._lost("Couldn't write to the USB port" + (e && e.message ? ": " + e.message : ".")); });
  }

  // the link went away without the operator asking: tell GrblLink once, then let go of the port so Connect works again
  _lost(reason) {
    if (this.closing || this.gone) return;
    this._closed(reason);
    this._release();
  }
  _closed(reason) {
    if (this.gone) return;
    this.gone = true;
    this.serial?.removeEventListener?.("disconnect", this._onDisconnect);
    this.port?.removeEventListener?.("disconnect", this._onDisconnect);
    if (this.onClose) this.onClose(reason);
  }
  // Do not toggle DTR/RTS here. On a DevKitC the CP2102 auto-reset circuit treats an edge on either line as a
  // pulse on EN, and Windows closing the port can already do that — an extra setSignals would only add another edge.
  // Bluetooth has no DTR, so a drop there does not reset the ESP32.
  async _release() {
    const port = this.port;
    try { await this.reader?.cancel(); } catch (e) { /* ignore */ }
    try { this.writer?.releaseLock(); } catch (e) { /* ignore */ }
    try { await port?.close(); } catch (e) { /* ignore */ }
    if (this.port === port) this.port = null;
  }

  async close() {
    if (this.closing) return;
    this.closing = true;
    await this._release();
    this._closed(null);
  }
}

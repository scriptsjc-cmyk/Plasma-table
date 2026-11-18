// USB or Bluetooth serial to the controller from the browser (Web Serial API, Chrome/Edge desktop):
// open the port, read lines, notice an unplug. FluidNC and grblHAL both talk 115200 8N1 with no flow
// control. Hardware flow control must stay off: on Windows Chrome then drives RTS itself, and on an
// ESP32 DevKitC (CP2102 auto-reset circuit) RTS is wired to EN, so it can hold the chip in reset.
//
// A Windows "Standard Serial over Bluetooth link" port has no usbVendorId. The ESP32 Bluetooth SPP
// socket is easy to wedge (a close while the board is still writing often needs a power-cycle), so
// Bluetooth uses a slower status poll, a longer watchdog, a settled close, and a reconnect backoff.
export const SERIAL_OPTIONS = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none", bufferSize: 4096 };

export const USB_POLL_MS = 100;
export const BT_POLL_MS = 250;          // 4 Hz: FluidNC's Bluetooth RX is small (~256 bytes) and '?' is not flow-controlled
export const USB_WATCHDOG_MS = 3000;
export const BT_WATCHDOG_MS = 5000;     // a laggy SPP link can go quiet for longer than USB without being dead
export const BT_CLOSE_SETTLE_MS = 200;
export const BT_WEDGE_HINT = " The board stopped answering over Bluetooth. Power-cycle the ESP32 (unplug its power, wait a few seconds, and plug it back in), then press Connect. Restarting only this page will not clear a wedged Bluetooth radio.";

// Survives across Connect attempts in this page. Tests can reset it.
export const serialLinkMemory = { kind: "usb", droppedAt: 0, attempts: 0, silent: false };

export function isBluetoothInfo(info = {}) {
  return !info.usbVendorId;
}

export function noteSerialDrop(kind = "bluetooth", silent = true) {
  serialLinkMemory.kind = kind || "bluetooth";
  serialLinkMemory.droppedAt = Date.now();
  serialLinkMemory.silent = !!(silent || serialLinkMemory.silent);
  serialLinkMemory.attempts += 1;
}

export function noteSerialOk(kind = "usb") {
  serialLinkMemory.kind = kind;
  serialLinkMemory.droppedAt = 0;
  serialLinkMemory.attempts = 0;
  serialLinkMemory.silent = false;
}

export function resetSerialLinkMemory() {
  noteSerialOk("usb");
}

// How long to wait before opening Bluetooth again after a drop. 2 s, then 4 s, then 8 s, minus
// time already elapsed since the drop, so a delayed click is not held back twice.
export function reconnectWaitMs({ kind, droppedAt, attempts = 0, now = Date.now() } = serialLinkMemory) {
  if (kind !== "bluetooth" || !droppedAt) return 0;
  const wait = Math.min(8000, 2000 * (2 ** Math.max(0, attempts - 1)));
  return Math.max(0, wait - (now - droppedAt));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export class WebSerialTransport {
  constructor(serial = typeof navigator !== "undefined" ? navigator.serial : null) {
    this.serial = serial;
    this.onLine = null; this.onClose = null; this.port = null; this.buf = ""; this.label = "USB"; this.kind = "usb";
    this.needsHandshake = true;   // "connected" only after the controller answers (GrblLink.handshake)
    this.handshakeMs = 8000;      // a silent board gets this long; once it prints anything GrblLink waits for boot to finish (BOOT_WAIT_MS)
    this.watchdogMs = USB_WATCHDOG_MS;  // no answer to '?' for this long = the link is lost (GrblLink)
    this.pollMs = null;           // filled in open() from the port type (USB 100 ms, Bluetooth 250 ms)
    this.gone = false;
    this.raw = false;          // XModem: deliver bytes, don't split on newlines (packets may contain 0x0A)
    this.onBytes = null;
    this._onDisconnect = (e) => { if (!e || !e.target || e.target === this.port || e.port === this.port) this._lost(this._unplugReason()); };
  }
  static supported() { return typeof navigator !== "undefined" && "serial" in navigator; }

  _unplugReason() {
    return this.kind === "bluetooth"
      ? "The Bluetooth connection was lost (or the controller lost power)."
      : "The USB cable was unplugged (or the controller lost power).";
  }

  _applyLinkProfile(info) {
    this.info = info || {};
    if (isBluetoothInfo(this.info)) {
      this.kind = "bluetooth";
      this.label = "Bluetooth";
      if (this.pollMs == null) this.pollMs = BT_POLL_MS;
      if (this.watchdogMs == null || this.watchdogMs === USB_WATCHDOG_MS) this.watchdogMs = BT_WATCHDOG_MS;
    } else {
      this.kind = "usb";
      this.label = this.info.usbVendorId
        ? `USB ${this.info.usbVendorId.toString(16)}:${(this.info.usbProductId || 0).toString(16)}`
        : "USB";
      if (this.pollMs == null) this.pollMs = USB_POLL_MS;
    }
  }

  async open(baud = 115200, reuse = true) {
    let port = null;
    if (reuse) {
      const known = await this.serial.getPorts();
      if (known.length === 1) port = known[0];
    }
    if (!port) port = await this.serial.requestPort();  // shows Chrome's port picker
    await port.open({ ...SERIAL_OPTIONS, baudRate: Number(baud) || SERIAL_OPTIONS.baudRate });
    this.port = port;
    this.gone = false;
    this.closing = false;
    this._applyLinkProfile(port.getInfo ? port.getInfo() : {});
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
    if (isBluetoothInfo(info)) {
      if (serialLinkMemory.silent) return BT_WEDGE_HINT;
      return " The port you picked isn't a USB device (it may be a Bluetooth COM port). If you meant to use Bluetooth and the board was working, power-cycle the ESP32 and try again. For a USB cable, pick the 'CP210x' / 'Silicon Labs' one.";
    }
    if (info.usbVendorId !== 0x10c4) return ` The port you picked is ${this.label}; an ESP32 DevKitC's CP2102 shows as USB 10c4:ea60.`;
    return "";
  }

  // ESP32 auto-reset lines: with DTR and RTS both released the chip runs normally. Only used when the board stays silent.
  // Bluetooth SPP has no DTR/RTS, so a nudge there does nothing useful and is skipped by the handshake.
  async releaseResetLines() {
    if (this.kind === "bluetooth") return false;
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
    let why = this.kind === "bluetooth" ? "The Bluetooth port closed." : "The USB port closed.";
    while (this.port && this.port.readable && !this.gone && !this.closing) {
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
        why = (this.kind === "bluetooth" ? "Bluetooth connection lost" : "USB connection lost")
          + (e && e.message ? ": " + e.message : ".");
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
    // Never write once the port is closing: a write into a half-closed Bluetooth SPP
    // socket is a known way to hang the ESP32 radio until the board is power-cycled.
    if (this.gone || this.closing || !this.writer) return Promise.resolve();
    const bytes = typeof data === "string" ? this.enc.encode(data) : data;
    return this.writer.write(bytes).catch((e) => { if (!this.closing && !this.gone) this._lost((this.kind === "bluetooth" ? "Couldn't write to the Bluetooth port" : "Couldn't write to the USB port") + (e && e.message ? ": " + e.message : ".")); });
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
  // Bluetooth has no DTR, so a drop there does not reset the ESP32: a wedged SPP socket needs a power-cycle.
  async _release() {
    const port = this.port;
    try { await this.reader?.cancel(); } catch (e) { /* ignore */ }
    this.reader = null;
    const w = this.writer;
    this.writer = null;
    if (w) {
      try {
        await Promise.race([
          Promise.resolve(w.close()).catch(() => { try { w.releaseLock(); } catch (e) { /* ignore */ } }),
          sleep(500),
        ]);
      } catch (e) {
        try { w.releaseLock(); } catch (err) { /* ignore */ }
      }
    }
    if (this.kind === "bluetooth") await sleep(BT_CLOSE_SETTLE_MS);
    try { await port?.close(); } catch (e) { /* ignore */ }
    if (this.port === port) this.port = null;
  }

  async close() {
    if (this.closing) return;
    this.closing = true;          // blocks further writes before we touch the port
    await this._release();
    this._closed(null);
  }
}

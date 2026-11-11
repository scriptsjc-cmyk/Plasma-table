// FluidNC over Wi-Fi: a raw GRBL-compatible WebSocket (default ws://host:81).
// This is NOT the Pi JSON bridge. The controller talks the same text protocol
// as USB serial, so GrblLink can drive it unchanged.

const FLUIDNC_DEFAULT_PORT = 81;

// Host: an IPv4 address, a hostname (letters, digits, hyphens, dots; e.g. fluidnc.local) or a [bracketed IPv6]. Anything else
// (user:pass@, paths, query strings, spaces, unicode, look-alike characters) is refused rather than "cleaned up".
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
function fluidncParseHost(input) {
  let h = String(input == null ? "" : input).trim();
  h = h.replace(/^(?:ws|wss|http|https):\/\//i, "").replace(/\/+$/, "");
  let port = null;
  if (!h || h.length > 260 || /[^\x21-\x7e]/.test(h) || /[@?#\\\/%]/.test(h)) return null;
  const v6 = h.match(/^\[([0-9A-Fa-f:.]+)\](?::(\d{1,5}))?$/);
  if (v6) { if (!/^[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*$/.test(v6[1])) return null; const pp = v6[2] ? Number(v6[2]) : null; if (pp !== null && (pp < 1 || pp > 65535)) return null; return { host: "[" + v6[1] + "]", port: pp }; }
  const m = h.match(/^([^:]+)(?::(\d{1,5}))?$/);
  if (!m) return null;
  h = m[1]; if (m[2]) { port = Number(m[2]); if (port < 1 || port > 65535) return null; }
  if (/^[0-9.]+$/.test(h)) {
    const o = h.split(".");
    if (o.length !== 4 || o.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
    if (o.map(Number).every((x) => x === 0)) return null;
    return { host: o.map(Number).join("."), port };
  }
  if (h.length > 253 || !h.split(".").every((l) => LABEL.test(l))) return null;
  return { host: h.toLowerCase(), port };
}
export function fluidncUrlProblem(host, port) {
  if (!String(host || "").trim()) return "Enter the FluidNC IP address or hostname.";
  const ph = fluidncParseHost(host);
  if (!ph) return "That doesn't look like an IP address or hostname (for example 192.168.1.50 or fluidnc.local).";
  const p = port === "" || port == null ? (ph.port || FLUIDNC_DEFAULT_PORT) : Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return "The WebSocket port must be a whole number from 1 to 65535.";
  return "";
}
export function fluidncWsUrl(host, port) {
  if (fluidncUrlProblem(host, port)) return "";
  const ph = fluidncParseHost(host);
  const p = port === "" || port == null ? (ph.port || FLUIDNC_DEFAULT_PORT) : Number(port);
  return "ws://" + ph.host + (p === 80 ? "" : ":" + p) + "/";
}

// A page on https:// cannot open ws://. That is a browser mixed-content rule.
export function fluidncBlockedByHttps(url) {
  try {
    if (typeof location === "undefined") return false;
    if (location.protocol !== "https:") return false;
    return /^ws:\/\//i.test(url || "");
  } catch (e) { return false; }
}

export function fluidncMixedContentMessage() {
  return "This copy of the app is on a secure (https) page, and FluidNC only offers a plain ws:// socket on your Wi-Fi. The browser will block that combination. Serve this app over http on the same network (see Settings → How to use, or docs/FLUIDNC.md), open it from the ESP32 itself, or plug in USB instead.";
}

export class FluidNCTransport {
  constructor(host, port) {
    this.port = port;
    this.url = fluidncWsUrl(host, port);
    this.onLine = null;
    this.onClose = null;
    this.label = "FluidNC";
    this.remoteJobs = false;
    this.kind = "fluidnc";
    this.host = host;
    this.buf = "";
  }
  open() {
    if (!this.url) return Promise.reject(new Error(fluidncUrlProblem(this.host, this.port) || "Enter the FluidNC IP address or hostname."));
    if (fluidncBlockedByHttps(this.url)) return Promise.reject(new Error(fluidncMixedContentMessage()));
    return new Promise((resolve, reject) => {
      let ready = false;
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) {
        reject(new Error(fluidncBlockedByHttps(this.url) ? fluidncMixedContentMessage() : ("Couldn't open FluidNC: " + e.message)));
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        if (!ready) {
          try { ws.close(); } catch (e) { /* ignore */ }
          reject(new Error("FluidNC didn't answer at " + this.url + ". Check the IP, that you're on the same Wi-Fi, and that port 81 is the WebSocket (HTTP port + 1)."));
        }
      }, 8000);
      ws.binaryType = "arraybuffer";
      const dec = new TextDecoder();
      const take = (text) => {
        this.buf += text;
        if (this.buf.length > 65536 && !/[\r\n]/.test(this.buf)) this.buf = "";   // a peer that never ends a line must not grow memory without bound
        let i;
        while ((i = this.buf.search(/\r?\n/)) >= 0) {
          const line = this.buf.slice(0, i).replace(/\r$/, "").trim();
          this.buf = this.buf.slice(this.buf[i] === "\r" ? i + 2 : i + 1);
          if (line && this.onLine) this.onLine(line);
        }
        // FluidNC sometimes pushes a status report without a trailing newline mid-chunk
        if (this.buf.startsWith("<") && this.buf.includes(">") && !this.buf.includes("\n")) {
          const end = this.buf.indexOf(">") + 1;
          const line = this.buf.slice(0, end);
          this.buf = this.buf.slice(end);
          if (this.onLine) this.onLine(line);
        }
      };
      ws.onopen = () => {
        clearTimeout(timer);
        ready = true;
        this.label = "FluidNC (" + (this.host || "Wi-Fi") + ")";
        resolve();
        try { ws.send("?"); } catch (e) { /* ignore */ }
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") take(ev.data);
        else if (ev.data instanceof ArrayBuffer) take(dec.decode(new Uint8Array(ev.data)));
        else if (ev.data && ev.data.arrayBuffer) ev.data.arrayBuffer().then((b) => take(dec.decode(new Uint8Array(b))));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!ready) { reject(new Error("Couldn't reach FluidNC at " + this.url + ".")); return; }
        if (this.onClose) this.onClose();
      };
      ws.onerror = () => { /* onclose follows */ };
    });
  }
  write(data) {
    if (!this.ws || this.ws.readyState !== 1) return Promise.resolve();
    try {
      if (typeof data === "string") this.ws.send(data);
      else this.ws.send(data);
    } catch (e) { /* ignore */ }
    return Promise.resolve();
  }
  async close() {
    this.closing = true;
    try { this.ws.close(); } catch (e) { /* ignore */ }
  }
}

export function looksLikeFluidNC(text) {
  const t = String(text || "");
  return /fluidnc/i.test(t) || /\[MSG:INFO: FluidNC/i.test(t) || /\$\/ax/i.test(t);
}

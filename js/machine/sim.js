// Demo mode: a pretend grblHAL controller in the browser (same as plasma/sim.py).
// Status reports, jogging, G0-G3 with roughly real timing, G38.2 onto a pretend
// sheet, M3/M5, G4, G10 L20, $H, $X, $$, $pins.

const WORD = /([A-Z])([-+]?\d*\.?\d+)/g;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SimTransport {
  constructor({ sheetZ = -40, switchOffset = 1.5, speedup = 4, jogSpeedup = 1 } = {}) {
    this.jogSpeedup = jogSpeedup;
    this.onLine = null; this.onClose = null; this.label = "demo machine";
    this.mpos = [0, 0, 0]; this.wco = [0, 0, 0];
    this.settings = { 0: 5, 1: 255, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 10: 511, 11: 0.01, 12: 0.002, 13: 0, 20: 0, 21: 0, 22: 1, 23: 0, 24: 25, 25: 500, 26: 250, 27: 1, 30: 1000, 31: 0, 32: 0, 100: 40, 101: 40, 102: 400, 110: 8000, 111: 8000, 112: 1500, 120: 400, 121: 400, 122: 200, 130: 1300, 131: 800, 132: 60 };
    this.alarm = false; this.torch = false; this.hold = false; this.spindleStopped = false;
    this.homing = false; this.relative = false; this.feed = 1000; this.motion = 0;
    this.sheetZ = sheetZ; this.switchOffset = switchOffset; this.speedup = speedup;
    this.busyUntil = 0; this.queue = []; this.feedOv = 100; this.estop = false; this.inbuf = ""; this.log = [];
    this.torchOnCount = 0; this.thcReport = true; this.arcLost = false; this.moving = false; this.jogging = false; this.jogGen = 0; this.probeCount = 0; this.closed = false; this.resetGen = 0;
  }
  async open() {
    this._send("GrblHAL 1.1f ['$' or '$' for help] (demo)");
    this._loop();
  }
  async close() { this.closed = true; }

  write(data) {
    const s = typeof data === "string" ? data : String.fromCharCode(...data);
    for (const c of s) {
      if (c === "?") this._send(this._status());
      else if (c === "!") this.hold = true;
      else if (c === "~") { this.hold = false; this.spindleStopped = false; }
      else if (c === "\x18") this._reset();
      else if (c === "\x85") this._jogCancel();
      else if (c === "\x9e") { if (this.hold) this.spindleStopped = !this.spindleStopped; }
      else if (c === "\x90") this.feedOv = 100;
      else if (c === "\x91") this.feedOv = Math.min(200, this.feedOv + 10);
      else if (c === "\x92") this.feedOv = Math.max(10, this.feedOv - 10);
      else if (c === "\x93") this.feedOv = Math.min(200, this.feedOv + 1);
      else if (c === "\x94") this.feedOv = Math.max(10, this.feedOv - 1);
      else {
        this.inbuf += c;
        let i;
        while ((i = this.inbuf.indexOf("\n")) >= 0) {
          this.queue.push(this.inbuf.slice(0, i).trim());
          this.inbuf = this.inbuf.slice(i + 1);
        }
      }
    }
    return Promise.resolve();
  }

  _send(s) { setTimeout(() => this.onLine && this.onLine(s), 0); }
  _status() {
    let st = "Idle";
    if (this.alarm) st = "Alarm";
    else if (this.hold) st = "Hold:0";
    else if (this.homing) st = "Home";
    else if (this.jogging) st = "Jog";
    else if (this.moving || this.queue.length || this.executing) st = "Run";
    const acc = this.torch && !this.spindleStopped ? "|A:S" : "";
    let pn = "";
    if (this.mpos[2] <= this.sheetZ - this.switchOffset + 1e-6) pn += "P";   // floating head pushed up
    if (this.estop) pn += "E";
    if (pn) pn = "|Pn:" + pn;
    const f = (a) => a.map((v) => v.toFixed(3)).join(",");
    return `<${st}|MPos:${f(this.mpos)}|FS:${Math.round(this.feed * this.feedOv / 100)},0|WCO:${f(this.wco)}|Ov:${this.feedOv},100,100${pn}${acc}${this._thc()}>`;
  }
  // demo only: pretends to be a grblHAL with the plasma plugin, which adds "|THC:<arc volts>,<flags>" (A = arc OK, T = torch on).
  // The voltage is a fixed made-up 118.0 V while the pretend arc is up. Real controllers report their own numbers; set thcReport = false to act like one that has no THC.
  _thc() {
    if (!this.thcReport) return "";
    const on = this.torch && !this.spindleStopped, arc = on && !this.arcLost;
    return `|THC:${arc ? "118.0" : "0.0"}${on ? "," + (arc ? "A" : "") + "T" : ""}`;
  }
  // demo only: the pretend arc goes out while the torch is still switched on (what a lost arc looks like), and the controller pauses like grblHAL's plugin does
  demoLoseArc(msg = false) {
    if (!this.torch) return false;
    this.arcLost = true; this.hold = true;
    if (msg) this._send("[MSG:Warning: arc failed]");
    return true;
  }
  // demo only: put the pretend torch somewhere instantly (used by "set up the edges for me"). Only when nothing is moving.
  demoTeleport(p) {
    if (this.moving || this.queue.length || this.executing || this.homing) return false;
    this.mpos = [...p];
    return true;
  }
  // demo only: press / release the e-stop
  setEstop(on) {
    this.estop = on;
    if (on) { this.queue = []; this.torch = false; this.resetGen++; this.alarm = true; this._send("ALARM:10"); }
  }
  _reset() {
    const moving = this.moving;
    this.queue = []; this.torch = false; this.hold = false; this.arcLost = false; this.resetGen++;
    if (moving) { this.alarm = true; this._send("ALARM:3"); }
    this._send("GrblHAL 1.1f ['$' or '$' for help] (demo)");
  }
  // jog cancel: stop the jog where it is and throw away jogs waiting in the buffer
  _jogCancel() {
    if (!this.jogging && !this.queue.some((l) => /^\$J=/i.test(l))) return;
    this.jogGen++;
    const keep = [];
    for (const l of this.queue) { if (/^\$J=/i.test(l)) this._send("ok"); else keep.push(l); }
    this.queue = keep;
  }
  // straight move, in small steps so the position updates smoothly
  async _move(target, feed, jog = false) {
    const start = [...this.mpos];
    const dist = Math.hypot(...target.map((t, i) => t - start[i]));
    return this._path((f) => start.map((v, i) => v + (target[i] - v) * f), dist, feed, jog, target);
  }
  // arc (G2 clockwise / G3 anticlockwise) about centre start+(I,J); same start and end = full circle
  async _arc(target, I, J, cw, feed) {
    const s = [...this.mpos], cx = s[0] + I, cy = s[1] + J, r = Math.hypot(I, J);
    const a0 = Math.atan2(s[1] - cy, s[0] - cx), a1 = Math.atan2(target[1] - cy, target[0] - cx);
    let sweep = cw ? a0 - a1 : a1 - a0;
    while (sweep <= 1e-6) sweep += 2 * Math.PI;
    const dir = cw ? -1 : 1;
    return this._path((f) => {
      const a = a0 + dir * sweep * f;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a), s[2] + (target[2] - s[2]) * f];
    }, r * sweep, feed, false, target);
  }
  async _path(at, dist, feed, jog, target) {
    const gen = this.resetGen, jgen = this.jogGen;
    const dur = ((dist / Math.max(feed, 1)) * 60000) / (jog ? this.jogSpeedup : this.speedup);
    let done = 0, last = Date.now();
    this.moving = true; this.jogging = jog;
    try {
      while (done < dur) {
        await sleep(10);
        if (gen !== this.resetGen || (jog && jgen !== this.jogGen)) return false;
        const now = Date.now(); if (!this.hold) done += now - last; last = now;
        this.mpos = at(Math.min(1, done / dur));
      }
      this.mpos = [...target];
      return true;
    } finally { this.moving = false; this.jogging = false; }
  }
  async _loop() {
    while (!this.closed) {
      if (!this.queue.length) { await sleep(5); continue; }
      this.executing = true;
      const line = this.queue.shift();
      try { await this._exec(line); } catch (e) { this._send("error:1"); }
      this.executing = false;
    }
  }
  async _exec(line) {
    const u = line.toUpperCase().replace(/ /g, "");
    this.log.push(u);
    if (u.startsWith("$")) return this._dollar(u);
    if (this.alarm) return this._send("error:9");
    const words = [...u.matchAll(WORD)].map((m) => [m[1], parseFloat(m[2])]);
    const g = words.filter(([k]) => k === "G").map(([, v]) => v);
    const m = words.filter(([k]) => k === "M").map(([, v]) => Math.trunc(v));
    const ax = {};
    for (const [k, v] of words) if ("XYZIJ".includes(k)) ax[k] = v;
    const F = words.filter(([k]) => k === "F");
    if (F.length) this.feed = F[F.length - 1][1];
    if (g.includes(90)) this.relative = false;
    if (g.includes(91)) this.relative = true;
    if (g.includes(10)) {
      const L = (words.find(([k]) => k === "L") || [, 20])[1];
      "XYZ".split("").forEach((a, i) => { if (a in ax) this.wco[i] = L === 2 ? ax[a] : this.mpos[i] - ax[a]; });
      return this._send("ok");
    }
    if (g.includes(4)) {
      const P = words.find(([k]) => k === "P");
      await sleep(((P ? P[1] : 0) * 1000) / this.speedup);
      return this._send("ok");
    }
    if (g.includes(38.2)) return this._probe(ax);
    if (g.includes(53)) {
      const t = [...this.mpos];
      "XYZ".split("").forEach((a, i) => { if (a in ax) t[i] = ax[a]; });
      await this._move(t, 8000);
      return this._send("ok");
    }
    for (const gg of g) if ([0, 1, 2, 3].includes(gg)) this.motion = gg;
    if (m.includes(3) || m.includes(4)) { this.torch = true; this.arcLost = false; this.torchOnCount++; }
    if (m.includes(5)) { this.torch = false; this.arcLost = false; }
    if (["X", "Y", "Z"].some((a) => a in ax)) {
      const t = [...this.mpos];
      "XYZ".split("").forEach((a, i) => { if (a in ax) t[i] = this.relative ? this.mpos[i] + ax[a] : ax[a] + this.wco[i]; });
      this._send("ok");
      const feed = this.motion === 0 ? 8000 : (this.feed * this.feedOv) / 100;
      if ((this.motion === 2 || this.motion === 3) && ("I" in ax || "J" in ax)) await this._arc(t, ax.I || 0, ax.J || 0, this.motion === 2, feed);
      else await this._move(t, feed);
      return;
    }
    this._send("ok");
  }
  async _probe(ax) {
    this.probeCount++;
    const target = this.relative ? this.mpos[2] + (ax.Z || 0) : (ax.Z || 0) + this.wco[2];
    const trigger = this.sheetZ - this.switchOffset;
    if (this.mpos[2] <= trigger + 1e-6) { this.alarm = true; return this._send("ALARM:4"); }
    if (target > trigger) {
      await this._move([this.mpos[0], this.mpos[1], target], this.feed);
      this.alarm = true; return this._send("ALARM:5");
    }
    await this._move([this.mpos[0], this.mpos[1], trigger], this.feed);
    this._send(`[PRB:${this.mpos.map((v) => v.toFixed(3)).join(",")}:1]`);
    this._send("ok");
  }
  async _dollar(u) {
    if (u === "$X") {
      if (this.estop) return this._send("error:79");
      this.alarm = false; this._send("[MSG:Caution: Unlocked]");
    }
    else if (u === "$H") {
      this.homing = true;
      await this._move([0, 0, 0], 4000);
      await sleep(300);
      this.mpos = [0, 0, 0]; this.alarm = false; this.homing = false;
    } else if (u.startsWith("$J=")) {
      if (this.alarm) return this._send("error:9");
      const w = Object.fromEntries([...u.slice(3).matchAll(WORD)].map((m) => [m[1], parseFloat(m[2])]));
      const rel = u.includes("G91"), mach = u.includes("G53");
      const t = [...this.mpos];
      "XYZ".split("").forEach((a, i) => { if (a in w) t[i] = rel ? this.mpos[i] + w[a] : mach ? w[a] : w[a] + this.wco[i]; });
      this._send("ok");
      await this._move(t, w.F || 1000, true);
      return;
    } else if (u === "$$") {
      for (const k of Object.keys(this.settings).map(Number).sort((a, b) => a - b)) this._send("$" + k + "=" + this.settings[k]);
    } else if (/^\$\d+=/.test(u)) {
      const m = u.match(/^\$(\d+)=(-?[\d.]+)$/);
      if (!m || !(Number(m[1]) in this.settings)) return this._send("error:3");
      this.settings[Number(m[1])] = Number(m[2]);
    } else if (u === "$PINS") {
      for (const s of ["[PIN:PA0,X step]", "[PIN:PA1,Y step]", "[PIN:PA2,Z step]", "[PIN:PB0,Probe]", "[PIN:PB1,Spindle on]"]) this._send(s);
    }
    this._send("ok");
  }
}

// The machine: ties the controller link, job builder and safety checks together
// (same behaviour as the App class in plasma/server.py, without a server).

import { GrblLink, RT } from "./grbl.js";
import { JobError, prepareJob, touchoffTestLines, torchTestLines, fmt, jobPlan } from "./job.js";
import { Safety, SafetyError } from "./safety.js";

const POSITION_LOST_ALARMS = new Set([1, 3, 10, 13]);
export { JobError, SafetyError };

export class Machine {
  constructor(machineCfg, chart, settingsText, store) {
    this.cfg = machineCfg;
    this.chart = chart;
    this.settingsText = settingsText;
    this.safety = new Safety(store);
    this.requireReference = machineCfg.require_reference_to_cut !== false;
    this.listeners = [];
    this.grbl = null;
    this.prepared = null;
    this.prevState = null;
  }

  on(fn) { this.listeners.push(fn); }
  emit(kind, data) { for (const fn of this.listeners) { try { fn(kind, data); } catch (e) { console.error(e); } } }

  async connect(transport) {
    await this.disconnect();
    this.safety.clearReference();
    this.emit("safety", this.safety.state());
    this.grbl = new GrblLink(transport, this.cfg.rx_buffer_size || 127, (k, d) => this.onGrbl(k, d));
    this.emit("log", { text: `Connected to ${transport.label || "controller"}`, level: "info" });
  }
  async disconnect() {
    if (this.grbl) { await this.grbl.close(); this.grbl = null; }
  }

  onGrbl(kind, data) {
    if (kind === "status") {
      const st = data.state;
      if (this.prevState === "Home" && st === "Idle") {
        this.safety.setReference(data.MPos, "homed");
        this.emit("log", { text: this.safety.limits ? "Homed - boundaries active." : "Homed.", level: "info" });
        this.emit("safety", this.safety.state());
      }
      this.prevState = st;
    } else if (kind === "alarm" && POSITION_LOST_ALARMS.has(data.code) && this.safety.referenced) {
      this.loseReference("Position may be lost");
    } else if (kind === "log" && (data.text || "").toLowerCase().startsWith("grbl") && this.safety.referenced) {
      this.loseReference("Controller restarted");
    }
    this.emit(kind, data);
  }
  loseReference(why) {
    this.safety.clearReference();
    this.emit("log", { text: `${why}: home the machine again before cutting.`, level: "warn" });
    this.emit("safety", this.safety.state());
  }

  // ---------------------------------------------------------------- helpers
  state() { return this.grbl ? this.grbl.status.state || "Unknown" : "Disconnected"; }
  jobRunning() { return !!(this.grbl && this.grbl.job && this.grbl.job.running); }
  wco() {
    const st = this.grbl.status;
    return (st.MPos || [0, 0, 0]).map((m, i) => m - (st.WPos || [0, 0, 0])[i]);
  }
  raiseLines(fallback = true) {
    const top = this.safety.safeTopMachineZ();
    if (top !== null) return [`G53 G0 Z${top.toFixed(3)}`];
    return fallback ? ["G91", `G0 Z${this.cfg.torch.raise_mm}`, "G90"] : [];
  }
  boundedProbes(lines) {
    const bottom = this.safety.bottomMachineZ();
    if (bottom === null) return lines;
    const target = bottom - this.wco()[2];
    const out = [];
    for (const l of lines) {
      if (l.startsWith("G38.2")) out.push("G90", `G38.2 Z${target.toFixed(3)} F${l.split("F")[1]}`, "G91");
      else out.push(l);
    }
    return out;
  }
  findCut(material, thickness, overrides = {}) {
    for (const mat of this.chart.materials) {
      if (mat.name !== material) continue;
      for (const row of mat.rows) {
        if (Math.abs(row.thickness_mm - Number(thickness)) < 1e-6) {
          const cut = {
            feed_mm_min: row.feed_mm_min, pierce_delay_s: row.pierce_delay_s,
            pierce_height_mm: row.pierce_height_mm ?? this.chart.pierce_height_mm,
            cut_height_mm: row.cut_height_mm ?? this.chart.cut_height_mm, amps: row.amps,
          };
          for (const [k, v] of Object.entries(overrides || {})) if (k in cut && v !== null && v !== "" && v !== undefined) cut[k] = Number(v);
          return cut;
        }
      }
    }
    throw new JobError(`No cut chart entry for ${material} ${thickness} mm.`);
  }

  // ---------------------------------------------------------------- commands
  command(body) {
    const cmd = body.cmd, g = this.grbl, m = this.cfg;
    if (!g) throw new JobError("Not connected. Press Connect.");
    switch (cmd) {
      case "hold": g.hold(); return { ok: true };
      case "resume": g.resume(); return { ok: true };
      case "stop": g.stop(); return { ok: true };
      case "reset": g.reset(); return { ok: true };
      case "jog_cancel": g.realtime(RT.JOG_CANCEL); return { ok: true };
      case "feed_override": {
        const map = { "+10": RT.FEED_UP10, "-10": RT.FEED_DOWN10, "+1": RT.FEED_UP1, "-1": RT.FEED_DOWN1, reset: RT.FEED_100 };
        if (!map[body.step]) throw new JobError("Bad speed step.");
        g.realtime(map[body.step]);
        return { ok: true };
      }
    }
    if (this.jobRunning()) throw new JobError("A job is running. Pause or stop it first.");

    switch (cmd) {
      case "jog": {
        const axis = String(body.axis).toUpperCase();
        if (!"XYZ".includes(axis)) throw new JobError("Bad axis.");
        const dist = Number(body.dist);
        const safe = this.safety.clampJog(g.status.MPos, axis, dist);
        const feed = axis === "Z" ? m.jog.feed_z : m.jog.feed_xy;
        g.send(`$J=G91 G21 ${axis}${safe.toFixed(3)} F${feed}`);
        if (Math.abs(safe - dist) > 0.01) return { ok: true, note: `Stopped at the ${axis} boundary.` };
        break;
      }
      case "jog_dir": {
        // keep moving this way (dir = [x, y, z] each -1, 0 or 1) until jog_cancel.
        // Absolute machine target, so it can follow on from a step jog without overshooting the edge.
        const d = (body.dir || []).map((v) => Math.sign(Number(v) || 0));
        const mp = g.status.MPos || [0, 0, 0], sf = this.safety, on = sf.active(), parts = [];
        // how far each axis can go that way; diagonals go at 45° until either edge is reached
        // (an axis already at its edge drops out, so you slide along the edge)
        const roomOf = (i) => (on ? (sf.limits["xyz"[i]][d[i] > 0 ? 1 : 0] + sf.ref[i] - mp[i]) * d[i] : m.travel_mm["xyz"[i]]);
        for (const i of [0, 1, 2]) if (d[i] && roomOf(i) <= 0.05) d[i] = 0;
        const room = [0, 1, 2].filter((i) => d[i]).map(roomOf);
        const dist = room.length ? Math.min(...room) : 0;
        ["X", "Y", "Z"].forEach((a, i) => { if (d[i] && dist > 0.05) parts.push(`${a}${(mp[i] + d[i] * dist).toFixed(3)}`); });
        if (!parts.length) throw new JobError("At the edge – can't go further that way.");
        const onlyZ = d[2] && !d[0] && !d[1];
        const feed = Math.round((onlyZ ? m.jog.feed_z : m.jog.feed_xy) * (body.slow ? 0.25 : 1));
        g.send(`$J=G53 G21 ${parts.join(" ")} F${feed}`);
        break;
      }
      case "home": g.send("$H"); break;
      case "unlock": g.send("$X"); break;
      case "zero_xy": g.send("G10 L20 P1 X0 Y0"); break;
      case "set_origin": {      // put the start point anywhere (machine coordinates) without moving
        if (this.state() !== "Idle") throw new JobError("Wait for the machine to stop first.");
        const x = Number(body.x), y = Number(body.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new JobError("Bad start point.");
        g.send(`G10 L2 P1 X${x.toFixed(3)} Y${y.toFixed(3)}`);
        break;
      }
      case "goto_zero": {
        const w = this.wco();
        const problem = this.safety.checkPointsMachine([[w[0], w[1]]], "Going to the start point");
        if (problem) throw new JobError(problem);
        g.sendLines([...this.raiseLines(false), "G90 G0 X0 Y0"]);
        break;
      }
      case "raise": g.sendLines(this.raiseLines()); break;
      case "set_reference":
        if (this.state() !== "Idle") throw new JobError("Machine must be Idle.");
        this.safety.setReference(g.status.MPos, "manual");
        this.emit("log", { text: "Home corner set by hand.", level: "info" });
        this.emit("safety", this.safety.state());
        break;
      case "limits_far": this.safety.wizardFarCorner(g.status.MPos); this.emit("safety", this.safety.state()); break;
      case "limits_zbottom": this.safety.wizardZBottom(g.status.MPos); this.emit("safety", this.safety.state()); break;
      case "limits_save": {
        const limits = this.safety.wizardSave();
        let note = "Boundaries saved.";
        if (this.safety.refMode === "homed") {
          g.sendLines([...this.safety.grblTravelSettings(), "$20=1"]);
          note += " Controller soft limits switched on too.";
        }
        this.emit("log", { text: note, level: "info" });
        this.emit("safety", this.safety.state());
        return { ok: true, limits, note };
      }
      case "limits_clear": this.safety.clearLimits(); this.emit("safety", this.safety.state()); break;
      case "trace_outline": {
        if (!this.prepared) throw new JobError("Load a job first.");
        const b = this.prepared.stats.bounds;
        const problem = this.safety.jobCheck(b, this.wco());
        if (problem) throw new JobError(problem);
        const f = m.jog.feed_xy;
        g.sendLines([...this.raiseLines(false), `G90 G0 X${b[0].toFixed(2)} Y${b[1].toFixed(2)}`,
          `G1 X${b[2].toFixed(2)} F${f}`, `G1 Y${b[3].toFixed(2)}`, `G1 X${b[0].toFixed(2)}`, `G1 Y${b[1].toFixed(2)}`, "G0 X0 Y0"]);
        break;
      }
      case "touchoff_test": {
        const cut = this.findCut(body.material, body.thickness, body.overrides);
        g.sendLines(this.boundedProbes(touchoffTestLines(cut, m)));
        break;
      }
      case "torch_test":
        if (!body.confirm) throw new JobError("Torch test needs confirming.");
        g.sendLines(torchTestLines(m));
        break;
      case "pins": g.send("$pins"); break;
      case "settings_list": g.send("$$"); break;
      case "push_settings": {
        const lines = this.settingsText.split(/\r?\n/).map((l) => l.split(";")[0].trim()).filter((l) => l.startsWith("$"));
        g.sendLines(lines);
        return { ok: true, sent: lines.length, note: `Sent ${lines.length} settings` };
      }
      case "console": {
        const line = String(body.line || "").trim();
        if (["!", "~", "?"].includes(line)) g.realtime(line);
        else if (line) g.send(line);
        break;
      }
      default: throw new JobError(`Unknown command '${cmd}'.`);
    }
    return { ok: true };
  }

  loadJob(body) {
    if (this.jobRunning()) throw new JobError("A job is running.");
    const cut = this.findCut(body.material, body.thickness, body.overrides);
    let source = body.gcode, name = body.name || "job";
    if (body.reuse) {
      if (!this.prepared) throw new JobError("No file loaded. Choose the G-code file again.");
      source = this.prepared.source; name = this.prepared.name;
    }
    const r = prepareJob(source, cut, this.cfg, !!body.dry_run);
    Object.assign(r, { name, source, cut, dry_run: !!body.dry_run, material: body.material, thickness: Number(body.thickness) });
    this.prepared = r;
    return r;
  }

  startJob() {
    if (!this.grbl) throw new JobError("Not connected. Press Connect.");
    if (!this.prepared) throw new JobError("Load a job first.");
    if (this.state() !== "Idle") throw new JobError(`Machine must be Idle to start (it is ${this.state()}).`);
    const inp = this.grbl.status.inputs || {};
    if (inp.estop) throw new JobError("E-stop is pressed. Release it and press Unlock.");
    if (inp.probe) throw new JobError("The floating head is pushed up. Check the torch isn't touching anything or stuck.");
    if (this.safety.limits && !this.safety.referenced && this.requireReference)
      throw new JobError("The machine doesn't know where its edges are yet. Press Home (or 'Torch is at the home corner') first.");
    const problem = this.safety.jobCheck(this.prepared.stats.bounds, this.wco());
    if (problem) throw new JobError(problem);
    const lines = [...this.raiseLines(false), ...this.boundedProbes(this.prepared.lines), ...this.raiseLines(false)];
    this.plan = jobPlan(lines, this.cfg);
    this.grbl.startJob(lines);
    this.emit("log", { text: `Started ${this.prepared.name}${this.prepared.dry_run ? " (dry run)" : ""}`, level: "info" });
    return { ok: true };
  }
}

export { fmt };

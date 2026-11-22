// r15 9.6 cut history and 9.3 the last job's log and alarms, kept in this browser (nothing is sent anywhere).
// A history row: date, part, material, thickness, time, finished or stopped (and why), practice or real.
export const HISTORY_KEY = "plasma.cutHistory.v1", LASTJOB_KEY = "plasma.lastJob.v1", ALARMS_KEY = "plasma.alarms.v1";
export const MAX_HISTORY = 200, MAX_LOG_LINES = 300, MAX_ALARMS = 20;

const clean = (v, n) => String(v == null ? "" : v).replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
const RESULTS = { done: ["finished", ""], stopped: ["stopped", "stop"], alarm: ["stopped", "alarm"], error: ["stopped", "error"] };
const read = (store, key, dflt) => { try { const v = JSON.parse(store.getItem(key) || "null"); return v == null ? dflt : v; } catch (e) { return dflt; } };
const write = (store, key, v) => { try { store.setItem(key, JSON.stringify(v)); } catch (e) { /* storage full or blocked: never block a cut */ } };
const isoOf = (at) => { const d = at instanceof Date ? at : new Date(at == null ? Date.now() : at); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };

export function makeEntry({ at, part, material, thickness, seconds, result, practice } = {}) {
  const r = RESULTS[result]; if (!r) return null;
  const th = Number(thickness), s = Number(seconds);
  return { at: isoOf(at) || new Date().toISOString(), part: clean(part, 80) || "Untitled part", material: clean(material, 40),
    thickness: Number.isFinite(th) && th > 0 && th < 1000 ? th : null, seconds: Number.isFinite(s) && s >= 0 ? Math.round(s) : 0,
    result: r[0], why: r[1], practice: practice === true };
}
const goodRow = (e) => e && typeof e === "object" && isoOf(e.at) && typeof e.at === "string" && (e.result === "finished" || e.result === "stopped");
export function readHistory(store) {
  const v = read(store, HISTORY_KEY, []);
  return Array.isArray(v) ? v.filter(goodRow).slice(0, MAX_HISTORY) : [];
}
export function addEntry(store, e) {
  if (!goodRow(e)) return readHistory(store);
  const list = [e, ...readHistory(store)].slice(0, MAX_HISTORY);
  write(store, HISTORY_KEY, list); return list;
}
export function clearHistory(store) { try { store.removeItem(HISTORY_KEY); } catch (e) { /* ignore */ } }
export function readLastJob(store) { const v = read(store, LASTJOB_KEY, null); return v && Array.isArray(v.lines) ? v : null; }
export function readAlarms(store) { const v = read(store, ALARMS_KEY, []); return Array.isArray(v) ? v.slice(0, MAX_ALARMS) : []; }

// Fed by the machine events: job progress, log lines and alarms. One history row per job, however often the end repeats.
export class JobRecorder {
  constructor(store, context) { this.store = store; this.context = context || (() => ({})); this.open = false; this.lines = []; this.alarms = []; }
  onJob(d) {
    if (!d) return;
    if (d.running) { if (!this.open) { this.open = true; this.lines = []; this.alarms = []; this.started = Date.now(); } return; }
    if (!this.open || !d.result) return;
    this.open = false;
    const c = this.context() || {};
    const e = makeEntry({ at: new Date(), part: c.part, material: c.material, thickness: c.thickness, seconds: d.elapsed, result: d.result, practice: !!c.practice });
    if (e) addEntry(this.store, e);
    write(this.store, LASTJOB_KEY, { at: new Date().toISOString(), result: d.result, message: clean(d.message, 200), part: e ? e.part : "", practice: !!c.practice, lines: this.lines.slice(-MAX_LOG_LINES), alarms: this.alarms.slice() });
  }
  onLog(text) {
    if (!this.open) return;
    this.lines.push(clean(text, 200));
    if (this.lines.length > MAX_LOG_LINES * 2) this.lines = this.lines.slice(-MAX_LOG_LINES);
  }
  onAlarm(code, message) {
    const a = { at: new Date().toISOString(), code: Number.isFinite(Number(code)) ? Number(code) : null, message: clean(message, 200) };
    if (this.open) this.alarms.push(a);
    write(this.store, ALARMS_KEY, [a, ...readAlarms(this.store)].slice(0, MAX_ALARMS));
  }
}
export const resultText = (e) => e.result === "finished" ? "Finished" : e.why === "alarm" ? "Stopped (alarm)" : e.why === "error" ? "Stopped (error)" : "Stopped";

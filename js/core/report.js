// r15 9.3 "Send a problem report": what support needs to see what went wrong, as one readable JSON file the user saves and sends.
// It reads ONLY the keys listed here (never the sign-in session or anything else in storage), then scrubs again on the way out:
// any key named like a password, token or private key is dropped, and sign-in tokens, keys and e-mail addresses inside text are removed.
import { readHistory, readLastJob, readAlarms } from "./cuthistory.js";

export const REPORT_KIND = "porta-plasma-problem-report";
const DROP_KEY = /pass(word)?|secret|token|api_?key|service_?role|jwt|auth|session|cookie|credential|private/i;
const SCRUB = [
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[removed]"],          // a sign-in token (JWT)
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]+/g, "[removed]"],                           // a Supabase key
  [/\b(Bearer|Basic)\s+\S+/gi, "$1 [removed]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[e-mail removed]"],
];
export function scrub(v, depth = 0) {
  if (depth > 8) return null;
  if (typeof v === "string") return SCRUB.reduce((s, [re, to]) => s.replace(re, to), v).slice(0, 2000);
  if (Array.isArray(v)) return v.slice(0, 500).map((x) => scrub(x, depth + 1));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!DROP_KEY.test(k)) out[k] = scrub(x, depth + 1);
    return out;
  }
  return typeof v === "number" || typeof v === "boolean" || v == null ? v : null;
}
const j = (store, key) => { try { return JSON.parse(store.getItem(key) || "null"); } catch (e) { return null; } };
const raw = (store, key) => { try { return store.getItem(key); } catch (e) { return null; } };

// store: localStorage (or a stand-in); version / env / connected come from the running app
export function collectReport(store, { version = null, env = null, connected = null, note = "" } = {}) {
  const sheet = j(store, "plasma.sheet");
  const rep = {
    kind: REPORT_KIND, v: 1, made: new Date().toISOString(),
    note: String(note || "").slice(0, 2000),
    version, env, connected,
    settings: j(store, "plasma.settings.v1"),
    machine: {
      limits: (j(store, "plasma.limits") || {}).limits || null,
      material: j(store, "plasma.material"), speeds: j(store, "plasma.speeds"), slowHoles: raw(store, "plasma.slowHoles"),
      sheet: sheet && typeof sheet === "object" ? { w: sheet.w, h: sheet.h, clearance: sheet.clearance, remnant: !!sheet.remnant } : null,
      motorDirTest: j(store, "plasma.motorDir.guidedTest"), consumables: j(store, "plasma.pierces.v1"),
    },
    lastJob: readLastJob(store), alarms: readAlarms(store), history: readHistory(store).slice(0, 20),
  };
  return scrub(rep);
}
export const reportText = (rep) => JSON.stringify(rep, null, 2);
export const reportFileName = (d = new Date()) => "porta-plasma-problem-report-" + d.toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".json";

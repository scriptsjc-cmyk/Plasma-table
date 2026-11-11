// The practice (demo) account: everything is kept in localStorage in this browser, nothing leaves it.
import { CONFIG } from "./config.js";
import { DEMO_KEY, SESS_KEY, normCode, uid } from "./acctbase.js";
import { sha256hex } from "./acctcrypto.js";

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
export function writeJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
}
// ------------------------------------------------------------------ demo store
export function demoState() {
  let s = readJson(DEMO_KEY, null);
  if (!s || typeof s !== "object") s = { users: [], parts: [], machines: [], log: [] };
  if (!Array.isArray(s.users)) s.users = [];
  if (!Array.isArray(s.parts)) s.parts = [];
  if (!Array.isArray(s.machines)) s.machines = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (!Array.isArray(s.jobEvents)) s.jobEvents = [];
  if (!Array.isArray(s.announcements)) s.announcements = [];
  if (!s.announcementReads || typeof s.announcementReads !== "object") s.announcementReads = {};
  if (!Array.isArray(s.cutPresets)) s.cutPresets = [];
  for (const m of s.machines) if (m && m.practice == null && /practice table/i.test(m.notes || "")) m.practice = true;   // older saved data
  return s;
}
export function saveDemo(s) { writeJson(DEMO_KEY, s); }
export async function seedDemo() {
  const s = demoState();
  const builtIn = s.machines.find((m) => m.serial === CONFIG.DEMO_SERIAL);
  if (builtIn && !builtIn.practice) { builtIn.practice = true; saveDemo(s); }
  if (!builtIn) {
    s.machines.push({
      id: uid(),
      serial: CONFIG.DEMO_SERIAL,
      hash: await sha256hex(normCode(CONFIG.DEMO_CLAIM_CODE)),
      owner: null,
      claimed_at: null,
      notes: "Built-in practice table for local demo mode",
      practice: true,
    });
    saveDemo(s);
  }
}
export async function hashPin(pin, salt) {
  return sha256hex(salt + ":" + String(pin || ""));
}
export function demoSession() {
  const sess = readJson(SESS_KEY, null);
  if (!sess || !sess.id) return null;
  const u = demoState().users.find((x) => x.id === sess.id);
  return u || null;
}

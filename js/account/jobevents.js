// Records that the user is active and logs job events (start, finish, alarm) for the admin.
import { authFetch, readySession, refreshIfNeeded } from "./cloud.js";
import { cloudOn, nowIso, uid } from "./acctbase.js";
import { currentUser } from "./acctstate.js";
import { demoSession, demoState, saveDemo } from "./demostore.js";

export async function touchLastActive() {
  if (cloudOn()) {
    if (!(await readySession())) return;              // signed out: nothing to record (and no 401 from an anonymous call)
    try { await authFetch("/rest/v1/rpc/touch_last_active", { method: "POST", body: "{}" }); } catch (e) { /* ignore */ }
    return;
  }
  const u = demoSession(); if (!u) return;
  const s = demoState();
  const rec = s.users.find((x) => x.id === u.id);
  if (rec) { rec.last_active = nowIso(); saveDemo(s); }
}
export async function logJobEvent({ status, serial, durationS, cutLengthMm, partCount, eventId } = {}) {
  const u = currentUser();
  if (!u) return null;
  if (cloudOn()) {
    await refreshIfNeeded();
    const body = {
      p_status: status,
      p_serial: serial || null,
      p_duration_s: durationS ?? null,
      p_cut_length_mm: cutLengthMm ?? null,
      p_part_count: partCount ?? null,
      p_event_id: eventId || null,
    };
    return authFetch("/rest/v1/rpc/log_job_event", { method: "POST", body: JSON.stringify(body) });
  }
  const s = demoState();
  if (status === "started") {
    const row = { id: uid(), user_id: u.id, machine_serial: serial || null, status: "started", started_at: nowIso(), ended_at: null, duration_s: null, cut_length_mm: null, part_count: partCount ?? null };
    s.jobEvents.push(row);
    const rec = s.users.find((x) => x.id === u.id); if (rec) rec.last_active = nowIso();
    saveDemo(s);
    return { ok: true, id: row.id };
  }
  let row = eventId ? s.jobEvents.find((e) => e.id === eventId && e.user_id === u.id) : null;
  if (!row) {
    row = { id: uid(), user_id: u.id, machine_serial: serial || null, status, started_at: nowIso(), ended_at: nowIso(), duration_s: durationS ?? 0, cut_length_mm: cutLengthMm ?? null, part_count: partCount ?? null };
    s.jobEvents.push(row);
  } else {
    row.status = status;
    row.ended_at = nowIso();
    if (durationS != null) row.duration_s = durationS;
    if (cutLengthMm != null) row.cut_length_mm = cutLengthMm;
    if (partCount != null) row.part_count = partCount;
    if (serial) row.machine_serial = serial;
  }
  saveDemo(s);
  return { ok: true, id: row.id };
}

// Admin-only calls: users, usage stats, job events, cut presets.
import { authFetch, refreshIfNeeded } from "./cloud.js";
import { cloudOn, nowIso, uid } from "./acctbase.js";
import { currentUser, isAdmin } from "./acctstate.js";
import { demoState, saveDemo } from "./demostore.js";

export async function adminListUsers(query) {
  if (!isAdmin()) throw new Error("Admin only");
  const q = String(query || "").trim().toLowerCase();
  let rows;
  if (cloudOn()) {
    await refreshIfNeeded();
    rows = await authFetch("/rest/v1/rpc/admin_list_users", { method: "POST", body: "{}" });
  } else {
    const s = demoState();
    rows = s.users.map((u) => ({
      id: u.id,
      email: u.email,
      display_name: u.display_name || "",
      mode: u.mode || "beginner",
      role: u.role || "user",
      created_at: u.created_at || u.created || null,
      last_active: u.last_active || null,
      parts_count: s.parts.filter((p) => p.owner === u.id).length,
      machines: s.machines.filter((m) => m.owner === u.id).map((m) => ({ serial: m.serial, claimed_at: m.claimed_at })),
    }));
  }
  if (!q) return rows || [];
  return (rows || []).filter((r) => {
    const hay = [r.email, r.display_name, r.mode, r.role, ...(r.machines || []).map((m) => m.serial)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}
export async function adminUsageStats() {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_usage_stats", { method: "POST", body: "{}" });
  }
  const s = demoState();
  const now = Date.now();
  const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
  const active = (days) => s.users.filter((u) => u.last_active && now - Date.parse(u.last_active) < days * 86400000).length;
  const byDay = {};
  for (const u of s.users) {
    const d = day(u.created_at || u.created); if (!d) continue;
    byDay[d] = (byDay[d] || 0) + 1;
  }
  const ev = s.jobEvents;
  return {
    users: s.users.length,
    beginner: s.users.filter((u) => (u.mode || "beginner") !== "pro").length,
    pro: s.users.filter((u) => u.mode === "pro").length,
    active_7: active(7),
    active_30: active(30),
    machines_claimed: s.machines.filter((m) => m.owner).length,
    machines_total: s.machines.length,
    jobs_started: ev.filter((e) => e.status === "started" || e.started_at).length,
    jobs_finished: ev.filter((e) => e.status === "finished").length,
    jobs_aborted: ev.filter((e) => e.status === "aborted").length,
    cut_time_s: ev.filter((e) => e.status === "finished").reduce((a, e) => a + (Number(e.duration_s) || 0), 0),
    cut_length_mm: ev.reduce((a, e) => a + (Number(e.cut_length_mm) || 0), 0),
    signups: Object.keys(byDay).sort().map((d) => ({ day: d, n: byDay[d] })),
  };
}
export async function adminListJobEvents(limit) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_list_job_events", { method: "POST", body: JSON.stringify({ p_limit: limit || 200 }) });
  }
  return demoState().jobEvents.slice().sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, limit || 200);
}
export async function listCutPresets() {
  if (cloudOn()) {
    if (!currentUser()) return [];
    await refreshIfNeeded();
    return (await authFetch("/rest/v1/cut_presets?select=*&order=material,thickness_mm")) || [];
  }
  return demoState().cutPresets.slice();
}
export async function adminUpsertCutPreset(row) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_upsert_cut_preset", { method: "POST", body: JSON.stringify({
      p_material: row.material, p_thickness_mm: row.thickness_mm,
      p_pierce_delay_s: row.pierce_delay_s ?? null,
      p_pierce_height_mm: row.pierce_height_mm ?? null,
      p_cut_speed_mm_min: row.cut_speed_mm_min ?? null,
      p_notes: row.notes || "",
    }) });
  }
  const s = demoState();
  const mat = String(row.material || "").trim();
  const th = Number(row.thickness_mm);
  if (!mat || !(th > 0)) throw new Error("Material and a positive thickness are required.");
  let rec = s.cutPresets.find((p) => p.material.toLowerCase() === mat.toLowerCase() && Number(p.thickness_mm) === th);
  if (!rec) { rec = { id: uid(), material: mat, thickness_mm: th }; s.cutPresets.push(rec); }
  Object.assign(rec, { pierce_delay_s: row.pierce_delay_s, pierce_height_mm: row.pierce_height_mm, cut_speed_mm_min: row.cut_speed_mm_min, notes: row.notes || "", updated_at: nowIso() });
  saveDemo(s);
  return rec;
}
export async function adminDeleteCutPreset(id) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_delete_cut_preset", { method: "POST", body: JSON.stringify({ p_id: id }) });
  }
  const s = demoState();
  s.cutPresets = s.cutPresets.filter((p) => p.id !== id);
  saveDemo(s);
  return { ok: true };
}

// Announcements from the admin: list, mark read, create, delete.
import { authFetch, refreshIfNeeded } from "./cloud.js";
import { cloudOn, nowIso, uid } from "./acctbase.js";
import { currentUser, isAdmin } from "./acctstate.js";
import { demoState, saveDemo } from "./demostore.js";

function expiryOk(a) { return !a.expires_at || Date.parse(a.expires_at) > Date.now(); }
export async function listAnnouncements() {
  const u = currentUser();
  if (!u) return [];
  if (cloudOn()) {
    await refreshIfNeeded();
    return (await authFetch("/rest/v1/rpc/my_announcements", { method: "POST", body: "{}" })) || [];
  }
  const s = demoState();
  const reads = s.announcementReads[u.id] || {};
  return s.announcements.filter(expiryOk).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((a) => ({ ...a, read: !!reads[a.id] }));
}
export async function markAnnouncementRead(id) {
  const u = currentUser();
  if (!u || !id) return;
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/mark_announcement_read", { method: "POST", body: JSON.stringify({ p_id: id }) });
  }
  const s = demoState();
  s.announcementReads[u.id] = s.announcementReads[u.id] || {};
  s.announcementReads[u.id][id] = nowIso();
  saveDemo(s);
  return { ok: true };
}
export async function adminCreateAnnouncement({ title, body, severity, expiresAt } = {}) {
  if (!isAdmin()) throw new Error("Admin only");
  title = String(title || "").trim().slice(0, 200);
  body = String(body || "").trim().slice(0, 4000);
  severity = String(severity || "info").toLowerCase();
  if (!title || !body) throw new Error("Title and body are required.");
  if (!["info", "warning", "update"].includes(severity)) throw new Error("Pick a severity.");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_create_announcement", { method: "POST", body: JSON.stringify({ p_title: title, p_body: body, p_severity: severity, p_expires_at: expiresAt || null }) });
  }
  const s = demoState();
  const row = { id: uid(), title, body, severity, created_at: nowIso(), expires_at: expiresAt || null, created_by: currentUser().id };
  s.announcements.push(row);
  saveDemo(s);
  return row;
}
export async function adminDeleteAnnouncement(id) {
  if (!isAdmin()) throw new Error("Admin only");
  if (cloudOn()) {
    await refreshIfNeeded();
    return authFetch("/rest/v1/rpc/admin_delete_announcement", { method: "POST", body: JSON.stringify({ p_id: id }) });
  }
  const s = demoState();
  s.announcements = s.announcements.filter((a) => a.id !== id);
  saveDemo(s);
  return { ok: true };
}

// Saved parts: list, load, save (with conflict check), rename, delete, move local parts to the account.
import { authFetch, refreshIfNeeded } from "./cloud.js";
import { cloudOn, nowIso, uid } from "./acctbase.js";
import { currentUser } from "./acctstate.js";
import { demoState, saveDemo } from "./demostore.js";

// ------------------------------------------------------------------ parts
export function requireUser() {
  const u = currentUser();
  if (!u) throw new Error("Sign in to save parts to your account.");
  return u;
}
export async function listParts() {
  const u = requireUser();
  if (cloudOn()) {
    await refreshIfNeeded();
    // folder and preview/size live inside the part's own `data` (jsonb), so no new column is needed. If the server refuses the JSON path
    // select for any reason, fall back to the plain list (every part then shows under "My parts").
    const q = "/rest/v1/parts?owner=eq." + encodeURIComponent(u.id) + "&order=updated_at.desc&select=";
    let rows;
    try { rows = await authFetch(q + "id,name,updated_at,created_at,folder:data->>folder,meta:data->meta"); }
    catch (e) { rows = await authFetch(q + "id,name,updated_at,created_at"); }
    return rows || [];
  }
  return demoState().parts.filter((p) => p.owner === u.id)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .map(({ id, name, updated_at, created_at, data }) => ({ id, name, updated_at, created_at, folder: data && data.folder, meta: data && data.meta }));
}
export async function loadPart(id) {
  const u = requireUser();
  if (cloudOn()) {
    await refreshIfNeeded();
    const rows = await authFetch("/rest/v1/parts?id=eq." + encodeURIComponent(id) + "&owner=eq." + encodeURIComponent(u.id) + "&select=*");
    const p = rows && rows[0];
    if (!p) throw new Error("Part not found.");
    return p;
  }
  const p = demoState().parts.find((x) => x.id === id && x.owner === u.id);
  if (!p) throw new Error("Part not found.");
  return { ...p };
}
export async function savePart({ id, name, data, updated_at, keepBoth }) {
  const u = requireUser();
  name = String(name || "Untitled part").trim().slice(0, 120) || "Untitled part";
  const stamp = nowIso();
  // saving a part again must not lose its folder (or preview); moving it to another folder passes `folder` explicitly
  const keepFolder = (old) => {
    if (!data || typeof data !== "object" || !old || !old.data) return;
    const add = {};
    if (!("folder" in data) && old.data.folder) add.folder = old.data.folder;
    if (!("meta" in data) && old.data.meta) add.meta = old.data.meta;
    if (Object.keys(add).length) data = { ...data, ...add };
  };
  if (cloudOn()) {
    await refreshIfNeeded();
    if (id) {
      const existing = await authFetch("/rest/v1/parts?id=eq." + encodeURIComponent(id) + "&select=id,name,updated_at,data");
      const cur = existing && existing[0];
      keepFolder(cur);
      if (cur && updated_at && cur.updated_at && Date.parse(cur.updated_at) > Date.parse(updated_at) && !keepBoth) {
        const err = new Error("conflict");
        err.conflict = { remote: cur, local: { id, name, data, updated_at } };
        throw err;
      }
      if (keepBoth && cur) {
        const copy = await authFetch("/rest/v1/parts", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ owner: u.id, name: name + " (device)", data, updated_at: stamp }),
        });
        return Array.isArray(copy) ? copy[0] : copy;
      }
      const rows = await authFetch("/rest/v1/parts?id=eq." + encodeURIComponent(id) + "&owner=eq." + encodeURIComponent(u.id), {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name, data, updated_at: stamp }),
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error("That part is not on this account any more. Save it as a new part.");
      return row;
    }
    const rows = await authFetch("/rest/v1/parts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ owner: u.id, name, data, updated_at: stamp }),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  const s = demoState();
  if (id) {
    const cur = s.parts.find((x) => x.id === id && x.owner === u.id);
    if (!cur) throw new Error("Part not found.");
    keepFolder(cur);
    if (updated_at && Date.parse(cur.updated_at) > Date.parse(updated_at) && !keepBoth) {
      const err = new Error("conflict");
      err.conflict = { remote: { ...cur }, local: { id, name, data, updated_at } };
      throw err;
    }
    if (keepBoth) {
      const copy = { id: uid(), owner: u.id, name: name + " (device)", data, created_at: stamp, updated_at: stamp };
      s.parts.push(copy);
      saveDemo(s);
      return copy;
    }
    cur.name = name; cur.data = data; cur.updated_at = stamp;
    saveDemo(s);
    return { ...cur };
  }
  const row = { id: uid(), owner: u.id, name, data, created_at: stamp, updated_at: stamp };
  s.parts.push(row);
  saveDemo(s);
  return { ...row };
}
export async function renamePart(id, name) {
  const p = await loadPart(id);
  return savePart({ id, name, data: p.data, updated_at: p.updated_at });
}
export async function deletePart(id) {
  const u = requireUser();
  if (cloudOn()) {
    await refreshIfNeeded();
    await authFetch("/rest/v1/parts?id=eq." + encodeURIComponent(id) + "&owner=eq." + encodeURIComponent(u.id), { method: "DELETE" });
    return;
  }
  const s = demoState();
  s.parts = s.parts.filter((p) => !(p.id === id && p.owner === u.id));
  saveDemo(s);
}
export async function migrateLocalParts(items, name) {
  if (!items || !items.length) return null;
  return savePart({ name: name || "Imported from this device", data: { items } });
}

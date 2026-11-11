// Announcement bar and inbox.
import { $, closeAll, openDlg, when } from "./uibase.js";
import * as A from "./account.js";

export function announcementNode(a) {
  const div = document.createElement("div");
  div.className = "annrow sev-" + (a.severity || "info");
  const h = document.createElement("b"); h.textContent = a.title || "";
  const body = document.createElement("div"); body.textContent = a.body || "";
  const meta = document.createElement("div"); meta.className = "muted";
  meta.textContent = (a.severity || "info") + " · " + when(a.created_at) + (a.expires_at ? " · expires " + when(a.expires_at) : "");
  div.append(h, body, meta);
  return div;
}
export async function paintAnnouncements() {
  const bar = $("announceBar");
  if (!bar) return;
  if (!A.isSignedIn()) {
    bar.classList.add("hidden");
    return;
  }
  try {
    const rows = (await A.listAnnouncements()).filter((a) => !a.read);
    const a = rows[0];
    if (!a) { bar.classList.add("hidden"); return; }
    $("announceTitle").textContent = a.title || "";
    $("announceBody").textContent = a.body || "";
    bar.classList.remove("hidden", "sev-info", "sev-warning", "sev-update");
    bar.classList.add("sev-" + (a.severity || "info"));
    bar.dataset.id = a.id;
  } catch (e) { bar.classList.add("hidden"); }
}
export function openAnnounceInbox() {
  const dlg = $("announceDlg"); if (!dlg) return;
  openDlg("announceDlg");
  fillAnnounceInbox();
}
async function fillAnnounceInbox() {
  const box = $("announceInbox"); if (!box) return;
  box.replaceChildren();
  try {
    const rows = await A.listAnnouncements();
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No announcements."; box.appendChild(p); return; }
    for (const a of rows) {
      const n = announcementNode(a);
      if (!a.read) {
        const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = "Mark read";
        b.onclick = async () => { await A.markAnnouncementRead(a.id); await paintAnnouncements(); fillAnnounceInbox(); };
        n.appendChild(b);
      }
      box.appendChild(n);
    }
  } catch (e) { box.textContent = e.message; }
}
export function bindAnnounce() {
  $("announceDismiss") && ($("announceDismiss").onclick = async () => {
    const id = $("announceBar").dataset.id;
    if (id) await A.markAnnouncementRead(id);
    await paintAnnouncements();
  });
  $("announceOpen") && ($("announceOpen").onclick = () => openAnnounceInbox());
  $("announceDlg") && $("announceDlg").addEventListener("click", (e) => { if (e.target === $("announceDlg")) closeAll(); });
}

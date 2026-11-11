// Shared by the account dialogs: the host callbacks from app.js, dialog open/close, and the toast / esc helpers.
import * as A from "./account.js";

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
export let host = null; // { toast, esc, applyMode, getDesign, loadDesign, fileName, refreshGate }
export let pendingMigrate = false;
let migrateDeclined = false; // "Not now" was pressed: don't offer again this session
export function toast(msg, err) { if (host && host.toast) host.toast(msg, err); }
export function esc(s) { return host && host.esc ? host.esc(s) : String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function acctOverlayOpen() {
  return $$(".acctdlg").some((el) => !el.classList.contains("hidden"));
}
// Round 4: the sign-in page is the first screen and can't be dismissed until someone is signed in.
const loginGate = () => document.body.dataset.screen === "login" && !A.isSignedIn();
export function closeAll() {
  if (loginGate()) return;
  const shouldMigrate = pendingMigrate;
  pendingMigrate = false;
  $$(".acctdlg").forEach((el) => el.classList.add("hidden"));
  if (shouldMigrate && $("migrateDlg")) $("migrateDlg").classList.remove("hidden");
}
export function openDlg(id) {
  const migrateWait = pendingMigrate;
  pendingMigrate = false; // opening something else shouldn't immediately pop migrate
  $$(".acctdlg").forEach((el) => el.classList.add("hidden"));
  pendingMigrate = id === "accountDlg" ? migrateWait : false;
  const el = $(id);
  if (el) el.classList.remove("hidden");
}
export function pane(name) {
  $$("#acctBody [data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== name));
  $$('#acctBody .pwshow[aria-pressed="true"]').forEach((b) => b.click());     // a shown password goes back to dots when you move on
}
export function when(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString(); } catch (e) { return String(iso); } }
export const setHost = (h) => { host = h; };
export const setPendingMigrate = (v) => { pendingMigrate = v && !migrateDeclined; };
export function declineMigrate() { migrateDeclined = true; pendingMigrate = false; closeAll(); }

// Shared by the account dialogs: the host callbacks from app.js, dialog open/close, and the toast / esc helpers.
import * as A from "./account.js";

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
export let host = null; // { toast, esc, applyMode, getDesign, loadDesign, fileName, refreshGate }
let keepAsked = false;   // "Keep this drawing?" is waiting for an answer: it comes back whenever the other account dialogs close
export function toast(msg, err) { if (host && host.toast) host.toast(msg, err); }
export function esc(s) { return host && host.esc ? host.esc(s) : String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function acctOverlayOpen() {
  return $$(".acctdlg").some((el) => !el.classList.contains("hidden"));
}
// Round 4: the sign-in page is the first screen and can't be dismissed until someone is signed in.
const loginGate = () => document.body.dataset.screen === "login" && !A.isSignedIn();
export function closeAll() {
  if (loginGate()) return;
  $$(".acctdlg").forEach((el) => el.classList.add("hidden"));
  if (keepAsked && $("migrateDlg")) $("migrateDlg").classList.remove("hidden");
}
export function openDlg(id) {
  $$(".acctdlg").forEach((el) => el.classList.add("hidden"));     // an open "Keep this drawing?" waits behind it
  const el = $(id);
  if (el) el.classList.remove("hidden");
}
export function pane(name) {
  $$("#acctBody [data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== name));
  $$('#acctBody .pwshow[aria-pressed="true"]').forEach((b) => b.click());     // a shown password goes back to dots when you move on
}
export function when(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString(); } catch (e) { return String(iso); } }
export const setHost = (h) => { host = h; };
// a different account signed in: ask it once. Signing in on the sign-in page leaves no dialog open to close (the page has
// already gone to the menu), so the question comes up straight away; otherwise it waits for that dialog.
export function askKeepDrawing() {
  keepAsked = true;
  if (!acctOverlayOpen()) closeAll();
}
export function keepAnswered() { keepAsked = false; closeAll(); }

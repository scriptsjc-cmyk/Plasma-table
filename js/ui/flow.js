// Round 4: the app's four screens, the "can't leave while cutting" lock, and the E-stop (big red button and the space bar).
// Round 5 (safety): the space bar is the ONE STOP key (Esc only closes dialogs / leaves the editor). A latched E-stop is released
// only by a deliberate reset: press and HOLD the red button for HOLD_MS (never by a tap, a double tap, Space or Esc).
//   boot -> login (nothing works until someone is signed in) -> menu -> make (design) | cut (the one cutting screen)
// body[data-screen] says which one is showing. The E-stop here only ever calls the app's existing STOP path (host.stop),
// so a soft reset and torch-off are exactly what they were before: no new machine commands.
import { cancelConfirm } from "../core/safeprompt.js";
const $ = (id) => document.getElementById(id);
let H = null;

export const screen = () => document.body.dataset.screen || "boot";

// ---------------------------------------------------------------- keyboard E-stop
// Registered when this module loads (before the sketch editor adds its own window listener), so Esc and the space bar
// reach the E-stop first. The space bar stops on the cutting screen, except while typing into a box (but while a job is live it
// stops even then). Esc is NOT a stop key: it belongs to dialogs and the editor.
const TEXT_INPUTS = new Set(["text", "number", "email", "password", "search", "tel", "url", "date", "time", "datetime-local", "month", "week", "color", ""]);
function typingTarget(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has((el.getAttribute("type") || "text").toLowerCase());   // a tick-box or slider can't take a typed space
  return false;
}
const isSpace = (e) => e.key === " " || e.code === "Space";
window.addEventListener("keydown", (e) => {
  if (!H) return;
  if (!isSpace(e) || screen() !== "cut") return;
  if (!H.jobLive() && (typingTarget(e.target) || typingTarget(document.activeElement))) return;   // typing a space in a box is not an E-stop (unless a job is live)
  e.preventDefault(); e.stopImmediatePropagation();
  const a = document.activeElement;
  if (a && a !== document.body && /^(BUTTON|A|SUMMARY)$/.test(a.tagName)) a.blur();   // so the key can't also "click" the focused button
  if (!e.repeat) estopPress("space");
}, true);
window.addEventListener("keyup", (e) => {
  if (!H || !isSpace(e) || screen() !== "cut" || typingTarget(e.target)) return;
  e.preventDefault();
}, true);

// ---------------------------------------------------------------- E-stop button
const HOLD_MS = 1500;
let latched = false, holdTimer = 0, holdDone = false;
export const estopOn = () => latched;
function paintEstop() {
  const b = $("btnStop"); if (!b) return;
  const hw = !!(H && H.hardwareEstop && H.hardwareEstop());
  const on = latched || hw;
  b.classList.toggle("pressed", on);
  b.setAttribute("aria-pressed", on ? "true" : "false");
  b.title = on ? "E-STOP ON. To reset it, press and hold the red button for 1.5 seconds." : "Emergency stop (Space)";
  b.setAttribute("aria-label", on ? "E-STOP ON. Press and hold to reset." : "Emergency stop. The space bar also stops the machine.");
  if (!holdTimer) $("estopLabel").textContent = on ? "E-STOP ON" : "STOP";
  document.body.classList.toggle("estop-on", on);
}
export function estopPaint() { paintEstop(); }
export function estopPress(source) {
  if (!H) return;
  H.stop();                                    // the existing STOP path (soft reset + torch off); does nothing with no machine connected
  if (screen() === "cut") {
    const fresh = !latched;
    latched = true; paintEstop(); H.refresh && H.refresh();
    cancelConfirm();
    H.onEstop && H.onEstop(source);
    if (fresh && H.toast) H.toast("Stopped. To reset, hold the red button for 1.5 s.", true);   // short: the STOP button itself now reads E-STOP ON (r7 U29)
  }
}
export function estopReset() {
  if (!latched) return false;
  latched = false; paintEstop(); H.refresh && H.refresh();
  return true;
}
// A latched E-stop is released only by holding the button (pointer or Enter) for HOLD_MS, and only when it is safe to:
// the machine's own E-stop is released, the torch is off and nothing is moving (host.canReset returns a reason, or "" when fine).
function holdCancel() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
  const b = $("btnStop"); if (b) b.classList.remove("holding");
  paintEstop();
}
function holdStart() {
  if (!latched || holdTimer) return;
  const b = $("btnStop"); if (b) b.classList.add("holding");
  $("estopLabel").textContent = "KEEP HOLDING";
  holdTimer = setTimeout(() => {
    holdTimer = 0;
    holdCancel();
    holdDone = true; setTimeout(() => { holdDone = false; }, 600);     // swallow the click that follows this press
    const why = H.canReset ? H.canReset() : "";
    if (why) { H.toast && H.toast(why, true); return; }
    estopReset(); H.toast && H.toast("E-stop reset. Check everything is safe, then Unlock if the machine is in alarm. Set the start point again before cutting.");
  }, HOLD_MS);
}
function onEstopButton(e) {
  if (holdDone) { holdDone = false; return; }
  if (latched) {
    // a tap (or a double tap) never releases: it just stops again. Releasing takes a deliberate press-and-hold.
    H.stop();
    H.toast && H.toast("Still stopped. To reset the E-stop, press and hold the red button for 1.5 seconds.", true);
    return;
  }
  if (H.hardwareEstop && H.hardwareEstop()) { H.toast("The machine's own E-stop is pressed. Twist it to release it, then press Unlock.", true); return; }
  estopPress("button");
}

// ---------------------------------------------------------------- the lock
export const navLocked = () => !!(H && H.jobLive && H.jobLive());
const WHY = "Not while the machine is cutting. Press the red E-STOP first.";
export function paintLock() {
  const lock = navLocked();
  const home = $("btnHome");
  if (home) {
    home.disabled = lock;
    if (lock) { home.setAttribute("aria-disabled", "true"); home.dataset.why = WHY; }
    else { home.removeAttribute("aria-disabled"); home.removeAttribute("data-why"); }
  }
  document.body.classList.toggle("nav-locked", lock);
}
window.addEventListener("beforeunload", (e) => {
  if (!navLocked()) return;
  e.preventDefault(); e.returnValue = "The machine is cutting. Leaving this page can leave the torch on.";
  return e.returnValue;
});

// ---------------------------------------------------------------- screens
export function showScreen(name, opts = {}) {
  const prev = screen();
  if (!H) return false;
  const signedIn = H.signedIn();
  if (name !== "login" && name !== "boot" && !signedIn && !H.bypass) name = "login";
  if (name === prev && !opts.force) return true;
  if (prev === "cut" && name !== "cut" && navLocked()) { H.toast(WHY, true); return false; }
  document.body.dataset.screen = name;
  if (!opts.fromPop && !opts.noHistory && name !== "boot") {
    try { history.pushState({ s: name }, "", location.href); } catch (e) { /* ignore */ }
  }
  H.onScreen(name, prev);
  paintLock();
  return true;
}
export function initFlow(host) {
  H = host;
  const stopBtn = $("btnStop");
  if (stopBtn) {
    stopBtn.onclick = onEstopButton;
    stopBtn.addEventListener("pointerdown", (e) => { if (latched && (e.button === 0 || e.button == null)) holdStart(); });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) stopBtn.addEventListener(t, () => { if (holdTimer) holdCancel(); });
    stopBtn.addEventListener("keydown", (e) => {                       // keyboard: hold Enter on the focused button
      if (e.key !== "Enter" || !latched) return;
      e.preventDefault();
      if (!e.repeat) holdStart();
    });
    stopBtn.addEventListener("keyup", (e) => { if (e.key === "Enter" && holdTimer) holdCancel(); });
    stopBtn.addEventListener("contextmenu", (e) => { if (latched) e.preventDefault(); });   // a long press on a phone must not open a menu
    stopBtn.addEventListener("blur", () => { if (holdTimer) holdCancel(); });
  }
  $("btnHome").onclick = () => { if (!navLocked()) showScreen("menu"); };
  $("menuMake").onclick = () => showScreen("make");
  $("menuCut").onclick = () => showScreen("cut");
  try { history.replaceState({ s: "boot" }, "", location.href); } catch (e) { /* ignore */ }
  window.addEventListener("popstate", (e) => {
    const cur = screen();
    if (!H.signedIn() && !H.bypass) { try { history.pushState({ s: "login" }, "", location.href); } catch (err) { /* ignore */ } return; }
    if (navLocked()) {                                   // the browser's Back button can't pull someone off the cutting screen
      try { history.pushState({ s: cur }, "", location.href); } catch (err) { /* ignore */ }
      H.toast(WHY, true);
      return;
    }
    const s = e.state && e.state.s;
    showScreen(s === "make" || s === "cut" || s === "menu" ? s : "menu", { fromPop: true });
  });
  paintEstop(); paintLock();
}

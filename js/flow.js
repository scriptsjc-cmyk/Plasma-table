// Round 4: the app's four screens, the "can't leave while cutting" lock, and the E-stop (big red button, Esc and the space bar).
//   boot -> login (nothing works until someone is signed in) -> menu -> make (design) | cut (the one cutting screen)
// body[data-screen] says which one is showing. The E-stop here only ever calls the app's existing STOP path (host.stop),
// so a soft reset and torch-off are exactly what they were before: no new machine commands.
const $ = (id) => document.getElementById(id);
let H = null;

export const screen = () => document.body.dataset.screen || "boot";

// ---------------------------------------------------------------- keyboard E-stop
// Registered when this module loads (before the sketch editor adds its own window listener), so Esc and the space bar
// reach the E-stop first. Esc always stops. The space bar stops on the cutting screen, except while typing into a box.
const TEXT_INPUTS = new Set(["text", "number", "email", "password", "search", "tel", "url", "date", "time", "datetime-local", "month", "week", "color", ""]);
export function typingTarget(el) {
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
  if (e.key === "Escape") {                                                      // the page's own Esc handlers (close a dialog…) still run
    // Esc stops while a job is live, or on the cutting screen when it isn't just closing a dialog
    if (!e.repeat && (H.jobLive() || (screen() === "cut" && !H.dialogOpen()))) estopPress("esc");
    return;
  }
  if (!isSpace(e) || screen() !== "cut") return;
  if (typingTarget(e.target) || typingTarget(document.activeElement)) return;      // typing a space in a box is not an E-stop
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
let latched = false, pressedAt = 0;
export const estopOn = () => latched;
function paintEstop() {
  const b = $("btnStop"); if (!b) return;
  const hw = !!(H && H.hardwareEstop && H.hardwareEstop());
  const on = latched || hw;
  b.classList.toggle("pressed", on);
  b.setAttribute("aria-pressed", on ? "true" : "false");
  $("estopLabel").textContent = on ? "E-STOP ON" : "STOP";
  b.title = on ? "E-STOP ON. Tap to reset it." : "Emergency stop (Esc or Space)";
  document.body.classList.toggle("estop-on", on);
}
export function estopPaint() { paintEstop(); }
export function estopPress(source) {
  if (!H) return;
  H.stop();                                    // the existing STOP path (soft reset + torch off); does nothing with no machine connected
  if (screen() === "cut") {
    if (!latched) pressedAt = Date.now();
    latched = true; paintEstop(); H.refresh && H.refresh();
    H.onEstop && H.onEstop(source);
  }
}
export function estopReset() {
  if (!latched) return false;
  latched = false; paintEstop(); H.refresh && H.refresh();
  return true;
}
function onEstopButton() {
  if (latched) {
    // a second tap straight after the first is a panicked double-tap: stop again, don't release
    if (Date.now() - pressedAt < 1200) { H.stop(); return; }
    estopReset(); H.toast && H.toast("E-stop reset. Check everything is safe, then Unlock if the machine is in alarm.");
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
  const stopBtn = $("btnStop"); if (stopBtn) stopBtn.onclick = onEstopButton;
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

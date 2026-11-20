// r13 section 2: one small helper for screen, step, tab and popover transitions. It never delays the change itself: the DOM
// swaps at once (so clicks are never lost and every control behaves as before), then the new content gets a short CSS
// entrance class (about 0.15 s, opacity and transform only, so nothing around it moves). Skipped entirely while a job is
// running, paused or on E-stop, when the user prefers reduced motion, and for anything that is or contains STOP.
const KINDS = ["tx-fade", "tx-fwd", "tx-back", "tx-pop"];
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

// True when nothing may animate: a job is running or paused, the machine is latched on E-stop, or reduced motion is on.
export function still() {
  const b = document.body;
  if (!b) return true;
  return reduced() || b.classList.contains("running-job") || b.classList.contains("job-live") || b.classList.contains("estop-latched");
}

// Give el a short entrance. kind: "fade" (screens, tabs), "fwd" / "back" (steps), "pop" (popovers and menus).
export function enter(el, kind = "fade") {
  if (!el || still()) return;
  const stop = document.getElementById("btnStop");
  if (stop && (el === stop || el.contains(stop))) return;       // STOP never moves, fades or shrinks
  KINDS.forEach((k) => el.classList.remove(k));
  void el.offsetWidth;                                         // restart the animation if a second change comes in
  const cls = "tx-" + kind;
  el.classList.add(cls);
  const done = () => { el.classList.remove(cls); el.removeEventListener("animationend", done); };
  el.addEventListener("animationend", done);
  setTimeout(done, 400);                                       // never leave the class behind
}

// Run fn (the existing screen / step / tab change) straight away, then animate what it showed.
export function go(fn, kind, target) {
  const out = fn();
  const el = typeof target === "function" ? target() : target;
  enter(el, kind);
  return out;
}

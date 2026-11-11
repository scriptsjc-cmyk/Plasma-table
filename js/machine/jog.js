// Jogging: on-screen pad, arrow keys, hold-to-glide; and the position read-out.
import { screen } from "../ui/flow.js";
import { syncSteps } from "../ui/nav.js";
import { $, $$, toast } from "../core/dom.js";
import { M, S } from "../core/state.js";
import { cmd, machineAllowed, requireMachine } from "./access.js";

// ------------------------------------------------------------------ jog pad (one template, used on 3 screens)
export function mountJogPads() {
  for (const mount of $$(".jogmount")) {
    mount.appendChild($("jogTpl").content.cloneNode(true));
    const steps = mount.querySelector(".steps");
    steps.innerHTML = S.cfg.jog.steps_mm.map((s) => `<button data-step="${s}">${s} mm</button>`).join("");
  }
  document.addEventListener("click", (e) => {
    const sb = e.target.closest(".steps button");
    if (sb) { S.jogStep = Number(sb.dataset.step); syncSteps(); return; }
  });
  syncSteps();
}
function jog(axis, dir) {
  if (!machineAllowed()) { requireMachine("Link your machine to run jobs"); return; }
  const step = axis === "Z" ? Math.min(S.jogStep, 10) : S.jogStep;
  cmd("jog", { axis, dist: step * dir });
}
// ---- press-and-hold jogging
// press: one step straight away. Still held after a moment: glide towards the edge (absolute target,
// queued behind the step, so there's no stop-start). Change direction: cancel, wait for it to stop, go again.
// Let go: cancel (the controller decelerates and stops).
const J = { held: new Map(), timer: null, gliding: false, dir: null, seq: 0, slow: false };
function jogVector() {
  const v = [0, 0, 0];
  for (const [axis, dir] of J.held.values()) v["XYZ".indexOf(axis)] = dir;
  return v;
}
async function waitStopped(ms = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && ["Jog", "Run"].includes(S.status.state)) await new Promise((r) => setTimeout(r, 25));
}
async function glide() {
  const my = ++J.seq, v = jogVector();
  if (!v.some(Boolean)) return;
  if (J.gliding) { cmd("jog_cancel"); await waitStopped(); if (my !== J.seq || !J.held.size) return; }
  J.gliding = true; J.dir = v.join();
  try { M.command({ cmd: "jog_dir", dir: v, slow: J.slow }); }
  catch (e) { toast(e.message, true); }
}
function jogPress(id, axis, dir) {
  if (!M.grbl) return;
  const first = J.held.size === 0;
  J.held.set(id, [axis, dir]);
  if (first) {
    jog(axis, dir);                                  // tap = one step
    clearTimeout(J.timer);
    J.timer = setTimeout(() => { if (J.held.size) glide(); }, 220);
  } else if (J.gliding) glide();                     // second key: go diagonal
}
function jogRelease(id) {
  if (!J.held.delete(id)) return;
  if (J.held.size) { if (J.gliding && jogVector().join() !== J.dir) glide(); return; }
  clearTimeout(J.timer); J.seq++;
  if (J.gliding) { J.gliding = false; J.dir = null; cmd("jog_cancel"); }
}
function jogReleaseAll() { for (const id of [...J.held.keys()]) jogRelease(id); }
export function renderPos() {
  const w = S.status.WPos || [0, 0, 0];
  const html = `<div><span>X</span><b>${Number(w[0]).toFixed(1)}</b></div><div><span>Y</span><b>${Number(w[1]).toFixed(1)}</b></div><div><span>Z</span><b>${Number(w[2]).toFixed(1)}</b></div>`;
  $$(".small-pos").forEach((el) => (el.innerHTML = html));
}
export function bindJog() {
  // keyboard + on-screen pad: tap = one step, hold = glide until released (diagonals too).
  // Arrows = X/Y, Page Up/Down = Z, hold Shift for slow.
  const KEYS = { ArrowLeft: ["X", -1], ArrowRight: ["X", 1], ArrowUp: ["Y", 1], ArrowDown: ["Y", -1], PageUp: ["Z", 1], PageDown: ["Z", -1] };
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    if (e.key === "Shift") { J.slow = true; return; }                     // (the space bar is the E-stop: see flow.js)
    if (!S.connected || screen() !== "cut") return;
    if (S.job && S.job.running) return;
    const k = KEYS[e.key];
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    J.slow = e.shiftKey;
    jogPress("key:" + e.key, k[0], k[1]);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "Shift") J.slow = false;
    if (KEYS[e.key]) jogRelease("key:" + e.key);
  });
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".j[data-axis]");
    if (!b || !S.connected || b.disabled || (S.job && S.job.running)) return;
    e.preventDefault();
    const id = "pad:" + e.pointerId;
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    b.classList.add("down");
    const up = () => { b.classList.remove("down"); jogRelease(id); b.removeEventListener("pointerup", up); b.removeEventListener("pointercancel", up); };
    b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
    jogPress(id, b.dataset.axis, Number(b.dataset.dir));
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".j[data-axis]");
    if (b && e.detail === 0 && S.connected) jog(b.dataset.axis, Number(b.dataset.dir));   // keyboard "click"
  });
  window.addEventListener("blur", jogReleaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) jogReleaseAll(); });
}

// Playable preview: play / pause the cut on the preview, speed multipliers, numbered cut order.
import { $ } from "../core/dom.js";
import { H } from "../ui/host.js";
import { buildTimeline, clockText, stateAt } from "./timeline.js";

// ================================================================ playable preview
const P = { tl: null, src: null, t: 0, playing: false, mult: 0, raf: 0, last: 0, drag: false };
const MULTS = [1, 10, 30, 100];
function tlFor(prep) {
  if (!prep) return null;
  if (P.src === prep && P.tl) return P.tl;
  try {
    P.tl = buildTimeline(prep.lines, H.cfg(), prep.cutIndex || []);
    P.src = prep; P.t = 0; P.playing = false;
    if (!P.mult) P.mult = 0;
  } catch (e) { P.tl = null; P.src = prep; }
  return P.tl;
}
function autoMult(total) { return MULTS.find((m) => total / m <= 45) || 100; }
export function playActive() { return !!(P.tl && P.src === H.S.prepared && (P.playing || P.t > 0)); }
export function updatePlayRow() {
  const row = $("playRow"); if (!row) return;
  const S = H.S, prep = S.prepared;
  const show = !!prep && !(S.job && S.job.running) && S.cur <= 3 && !(S.src === "shape" && S.cur === 1) && !S.shapeFs;
  row.classList.toggle("hidden", !show);
  if (!show) { stopPlay(); return; }
  const tl = tlFor(prep); if (!tl) { row.classList.add("hidden"); return; }
  if (!P.mult) P.mult = autoMult(tl.total);
  $("playSpeed").textContent = "×" + P.mult;
  paintPlay();
}
function paintPlay() {
  const tl = P.tl; if (!tl) return;
  const playLabel = P.playing ? "Pause" : (P.t >= tl.total - 0.01 ? "Replay" : "Play");
  const playIcon = P.playing ? "pause" : (playLabel === "Replay" ? "undo" : "play");
  if ($("playBtn").dataset.face !== playLabel) {
    $("playBtn").dataset.face = playLabel;
    $("playBtn").innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-${playIcon}"></use></svg> ${playLabel}`;
  }
  $("playSlider").value = tl.total ? Math.round((P.t / tl.total) * 1000) : 0;
  const st = playActive() ? stateAt(tl, P.t) : null;
  const n = tl.pierces.length;
  $("playTime").textContent = `${clockText(P.t)} / ${clockText(tl.total)}` + (st && n ? ` · cut ${Math.max(1, Math.min(st.cut, n))} of ${n}` : "");
}
function stopPlay() { P.playing = false; cancelAnimationFrame(P.raf); }
function frame(ts) {
  if (!P.playing) return;
  const dt = Math.min(0.1, (ts - P.last) / 1000); P.last = ts;
  P.t += dt * P.mult;
  if (P.t >= P.tl.total) { P.t = P.tl.total; P.playing = false; }
  paintPlay(); H.drawPreview();
  if (P.playing) P.raf = requestAnimationFrame(frame);
}
function togglePlay() {
  const tl = P.tl; if (!tl || $("playRow").classList.contains("hidden")) return;
  if (P.playing) { stopPlay(); paintPlay(); return; }
  if (P.t >= tl.total - 0.01) P.t = 0;
  P.playing = true; P.last = performance.now(); P.raf = requestAnimationFrame(frame);
  paintPlay();
}
export function bindPlay() {
  $("playBtn").onclick = togglePlay;
  $("playSlider").addEventListener("input", () => {
    const tl = P.tl; if (!tl) return;
    stopPlay(); P.t = (Number($("playSlider").value) / 1000) * tl.total; paintPlay(); H.drawPreview();
  });
  $("playSpeed").onclick = () => { const i = MULTS.indexOf(P.mult); P.mult = MULTS[(i + 1) % MULTS.length]; $("playSpeed").textContent = "×" + P.mult; };
}
// draw the animation on top of the faded static preview. X/Y map job mm to pixels. Rapids dashed, cuts solid, pierces dots.
export function drawPlay(ctx, X, Y, ox, oy, C, zoom) {
  const tl = P.tl; if (!tl) return;
  const st = stateAt(tl, P.t);
  const line = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + ox), Y(y + oy)) : ctx.moveTo(X(x + ox), Y(y + oy)))); ctx.stroke(); };
  ctx.lineWidth = zoom ? 2.5 : 2;
  for (const s of st.done) {
    if (s.pts.length < 2) continue;
    if (s.kind === "rapid") { ctx.setLineDash([5, 4]); ctx.strokeStyle = C.label; ctx.lineWidth = 1; }
    else { ctx.setLineDash([]); ctx.strokeStyle = C.lock; ctx.lineWidth = zoom ? 2.5 : 2; }
    line(s.pts);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = C.lock;
  for (const d of st.dots) { ctx.beginPath(); ctx.arc(X(d[0] + ox), Y(d[1] + oy), zoom ? 4 : 3, 0, 7); ctx.fill(); }
  const tx = X(st.torch[0] + ox), ty = Y(st.torch[1] + oy);
  if (st.firing) { ctx.fillStyle = "rgba(192,86,0,.35)"; ctx.beginPath(); ctx.arc(tx, ty, 12, 0, 7); ctx.fill(); }
  ctx.fillStyle = st.firing ? C.lock : C.sel; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 7); ctx.fill();
  ctx.strokeStyle = C.canvas; ctx.lineWidth = 2; ctx.stroke();
}
// ---- cut numbers on the preview (start dots) and the "restart here" highlight
export function drawNumbers(ctx, X, Y, ox, oy, C) {
  const S = H.S, ci = S.prepared && S.prepared.cutIndex;
  if (!ci || ci.length < 2 || ci.length > 80) return;
  const mark = S.startCut > 1 ? S.startCut : (S.resume && S.resume.n > 1 ? S.resume.n : 0);
  ctx.save();
  ctx.font = "bold 11px Barlow, system-ui"; ctx.textAlign = "left";
  for (const c of ci) {
    const x = X(c.at[0] + ox), y = Y(c.at[1] + oy);
    if (c.n === mark) { ctx.strokeStyle = C.go; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke(); }
    ctx.fillStyle = c.n === mark ? C.go : C.label;
    ctx.fillText(String(c.n), x + 7, y - 6);
  }
  ctx.restore();
}

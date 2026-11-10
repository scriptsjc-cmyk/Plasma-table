// Round 2 screen features, kept out of app.js so that file stays readable:
//   new-version banner + About, playable preview, Pro cut list / tabs / start points, restart from cut N,
//   live pierce delay, size check after DXF/SVG import, straight cut, demo "set up the edges" and Pro shortcuts.
// Nothing here talks to the machine except through the same commands the rest of the screen uses (host.cmd / host.M()).
import { VERSION } from "./version.js";
import { buildTimeline, stateAt, clockText } from "./timeline.js";
import { nearestOnRing } from "./cam.js";
import { upsertLocalPreset, currentSettings } from "./settings.js";

let H = null;
const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function initR2(host) {
  H = host;
  bindVersion(); bindPlay(); bindCam(); bindCutList(); bindSize(); bindStraight(); bindRestart(); bindDelay(); bindDemo(); bindKeys(); bindWhy();
  paintVersionLines();
}

// ================================================================ version + update banner
async function fetchLatest() {
  try {
    const r = await fetch("version.json?" + Date.now(), { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.id ? j : null;
  } catch (e) { return null; }
}
function showUpdate(info) {
  const bar = $("updateBar"); if (!bar) return;
  $("updateText").textContent = `Version ${info.id} is ready${H.jobRunning() ? ". Finish the cut first, then reload." : ". Reload to get it."}`;
  bar.classList.remove("hidden");
  if ($("aboutNote")) $("aboutNote").textContent = `A newer version (${info.id}) is available. You are on ${VERSION.id}.`;
}
function doReload() {
  if (H.jobRunning()) { H.toast("A job is running. Reload after it finishes.", true); return; }
  if (H.dirtyDesign() && !confirm("Reload now? The shape you are drawing is not saved to your account.")) return;
  navigator.serviceWorker && navigator.serviceWorker.getRegistration && navigator.serviceWorker.getRegistration()
    .then((r) => { if (r && r.waiting) r.waiting.postMessage("skip"); }).catch(() => {});
  location.reload();
}
export async function checkVersion(manual) {
  const j = await fetchLatest();
  if (j && j.id !== VERSION.id) { showUpdate(j); return "new"; }
  if (manual && $("aboutNote")) $("aboutNote").textContent = j ? `You are on the latest version (${VERSION.id}).` : "Couldn't check right now (offline?). You are on " + VERSION.id + ".";
  return j ? "same" : "offline";
}
function versionText() { return `Version ${VERSION.id}${VERSION.commit && VERSION.commit !== "pending" ? " · " + VERSION.commit : ""}`; }
function paintVersionLines() {
  const t = versionText();
  if ($("verLine")) $("verLine").textContent = t;
  if ($("footVer")) $("footVer").textContent = t;
}
export function paintAbout() {
  if ($("aboutVer")) $("aboutVer").innerHTML = `<b>${VERSION.id}</b><br><span class="muted small">commit ${VERSION.commit} · built ${VERSION.built}</span>`;
}
function bindVersion() {
  window.addEventListener("pt-new-version", (e) => showUpdate((e && e.detail) || { id: "new" }));
  if ($("btnReload")) $("btnReload").onclick = doReload;
  if ($("btnAboutReload")) $("btnAboutReload").onclick = doReload;
  if ($("btnCheckVer")) $("btnCheckVer").onclick = async () => {
    $("aboutNote").textContent = "Checking…";
    try { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch (e) { /* offline */ }
    checkVersion(true);
  };
  setTimeout(() => checkVersion(false), 5000);
  setInterval(() => { if (document.visibilityState === "visible") checkVersion(false); }, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkVersion(false); });
}

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
  $("playBtn").textContent = P.playing ? "⏸ Pause" : (P.t >= tl.total - 0.01 ? "↺ Replay" : "▶ Play");
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
export function togglePlay() {
  const tl = P.tl; if (!tl || $("playRow").classList.contains("hidden")) return;
  if (P.playing) { stopPlay(); paintPlay(); return; }
  if (P.t >= tl.total - 0.01) P.t = 0;
  P.playing = true; P.last = performance.now(); P.raf = requestAnimationFrame(frame);
  paintPlay();
}
function bindPlay() {
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

// ================================================================ Pro CAM: tabs, lead-out, overcut, start points
export function camOpts() {            // what the job builder gets. Beginner always gets the plain defaults.
  const S = H.S;
  if (!H.isPro()) return {};
  const c = S.cam;
  return {
    order: S.cutOrder || null, skip: S.cutSkip || [], starts: c.starts || {},
    tabs: c.tabs > 0 ? { count: c.tabs, width: c.tabW } : null, tabOver: c.tabOver || {},
    leadOut: c.leadOut || 0, overcut: c.over || 0,
  };
}
export function resetCam(keepOrder) {
  const S = H.S;
  S.cam.starts = {}; S.cam.tabOver = {};
  if (!keepOrder) { S.cutOrder = null; S.cutSkip = []; }
}
export function designChanged(count) {            // a different drawing: the old cut numbers mean nothing
  const S = H.S;
  if (S._camCount !== count) { S._camCount = count; resetCam(false); }
}
function bindCam() {
  const num = (id, def, lo, hi) => { const v = Number($(id).value); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  const read = () => {
    const c = H.S.cam;
    c.tabs = Math.round(num("camTabs", 0, 0, 12)); c.tabW = num("camTabW", 3, 1, 30);
    c.leadOut = num("camOut", 0, 0, 30); c.over = num("camOver", 0, 0, 30);
    c.tabOver = {};       // a new count means "place them again"
    H.loadJob();
  };
  ["camTabs", "camTabW", "camOut", "camOver"].forEach((id) => $(id).addEventListener("change", read));
  $("camReset").onclick = () => {
    resetCam(true); const c = H.S.cam; c.tabs = 0; c.leadOut = 0; c.over = 0;
    $("camTabs").value = 0; $("camOut").value = 0; $("camOver").value = 0; H.loadJob();
  };
  // delegated button in the cut check: "Add 2 hold-down tabs"
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-r2act='tabs']"); if (!b) return;
    $("camTabs").value = 2; read(); H.toast("Added 2 hold-down tabs per part. Drag the orange dots to move them.");
  });
  bindHandles();
}
// handles on the zoomed preview (step 2): green dot = where each cut starts, orange squares = hold-down tabs
function handleList() {
  const S = H.S, p = S.prepared;
  if (!H.isPro() || !p || !p.cutInfo || S.cur !== 2 || !p.shift) return [];
  const out = [];
  for (const c of p.cutInfo) {
    if (c.open) continue;
    out.push({ kind: "start", key: c.key, ring: c.ring, at: c.start });
    (c.tabs || []).forEach((t, i) => out.push({ kind: "tab", key: c.key, i, ring: c.ring, at: t, all: c.tabs }));
  }
  return out;
}
let hdrag = null;
export function drawHandles(ctx, X, Y, C) {
  const p = H.S.prepared; if (!p) return;
  for (const h of handleList()) {
    const at = hdrag && hdrag.h.kind === h.kind && hdrag.h.key === h.key && hdrag.h.i === h.i ? hdrag.cur : h.at;
    const x = X(at[0] + p.shift[0]), y = Y(at[1] + p.shift[1]);
    if (h.kind === "start") { ctx.fillStyle = C.go; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = C.lock; ctx.fillRect(x - 6, y - 6, 12, 12); }
    ctx.strokeStyle = C.canvas; ctx.lineWidth = 2; if (h.kind === "start") ctx.stroke(); else ctx.strokeRect(x - 6, y - 6, 12, 12);
  }
}
function bindHandles() {
  const cv = $("preview");
  const at = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener("pointerdown", (e) => {
    const m = cv._zmap, p = H.S.prepared; if (!m || !p || H.sketchActive()) return;
    const [px, py] = at(e);
    let best = null, bd = 16;
    for (const h of handleList()) {
      const [hx, hy] = m.toPx(h.at[0] + p.shift[0], h.at[1] + p.shift[1]);
      const d = Math.hypot(hx - px, hy - py);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    e.preventDefault(); e.stopImmediatePropagation(); cv.setPointerCapture(e.pointerId);
    hdrag = { h: best, cur: best.at };
  }, true);
  cv.addEventListener("pointermove", (e) => {
    if (!hdrag) return;
    const m = cv._zmap, p = H.S.prepared, [px, py] = at(e), [x, y] = m.toMm(px, py);
    const q = nearestOnRing(hdrag.h.ring, [x - p.shift[0], y - p.shift[1]]);
    if (q) { hdrag.cur = q; H.drawPreview(); }
  }, true);
  const end = () => {
    if (!hdrag) return;
    const { h, cur } = hdrag; hdrag = null;
    const c = H.S.cam;
    if (h.kind === "start") c.starts[h.key] = cur;
    else {
      const pts = h.all.map((t, i) => (i === h.i ? cur : t));
      c.tabOver[h.key] = { count: pts.length, width: c.tabW, pts };
    }
    H.loadJob();
  };
  cv.addEventListener("pointerup", end, true);
  cv.addEventListener("pointercancel", () => { hdrag = null; H.drawPreview(); }, true);
}

// ================================================================ Pro cut list (reorder + skip)
function fullOrder(p) {
  const S = H.S;
  if (S.cutOrder) return S.cutOrder.filter((k) => p.allCuts.some((c) => c.key === k)).concat(p.allCuts.map((c) => c.key).filter((k) => !S.cutOrder.includes(k)));
  return (p.autoOrder || []).concat(p.allCuts.filter((c) => c.skipped).map((c) => c.key));
}
export function paintCutList() {
  const card = $("cutListCard"), S = H.S, p = S.prepared;
  if (!card) return;
  const show = H.isPro() && !!p && !!p.allCuts && p.allCuts.length > 1;
  card.classList.toggle("hidden", !show);
  if (!show) return;
  const order = fullOrder(p), skipped = new Set(S.cutSkip || []);
  let n = 0;
  const html = order.map((k, i) => {
    const c = p.allCuts.find((x) => x.key === k); if (!c) return "";
    const off = skipped.has(k); if (!off) n++;
    const name = c.open ? "Line" : c.hole ? "Hole" : "Part";
    return `<li draggable="true" data-key="${k}" class="${off ? "off" : ""}">
      <span class="grip" aria-hidden="true">≡</span>
      <label><input type="checkbox" data-cutkey="${k}" ${off ? "" : "checked"} aria-label="Cut ${name} ${k + 1}"> <b>${off ? "–" : n}</b> ${name} ${c.size[0]} × ${c.size[1]} mm</label>
      <span class="mv"><button type="button" data-mv="-1" data-key="${k}" aria-label="Move earlier" ${i === 0 ? "disabled" : ""}>▲</button><button type="button" data-mv="1" data-key="${k}" aria-label="Move later" ${i === order.length - 1 ? "disabled" : ""}>▼</button></span></li>`;
  }).join("");
  // status updates call this many times a second; touching the DOM when nothing changed would swallow a click half-way through
  if ($("cutList")._html !== html) { $("cutList")._html = html; $("cutList").innerHTML = html; }
}
function applyOrder(order) { H.S.cutOrder = order; H.loadJob(); }
function bindCutList() {
  const list = $("cutList");
  list.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-cutkey]"); if (!cb) return;
    const k = Number(cb.dataset.cutkey), s = new Set(H.S.cutSkip || []);
    if (cb.checked) s.delete(k); else s.add(k);
    H.S.cutSkip = [...s];
    if (!H.S.cutOrder) H.S.cutOrder = fullOrder(H.S.prepared);
    H.loadJob();
  });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mv]"); if (!b) return;
    const o = fullOrder(H.S.prepared), k = Number(b.dataset.key), i = o.indexOf(k), j = i + Number(b.dataset.mv);
    if (i < 0 || j < 0 || j >= o.length) return;
    o.splice(j, 0, o.splice(i, 1)[0]); applyOrder(o);
  });
  let dragKey = null;
  list.addEventListener("dragstart", (e) => { const li = e.target.closest("li"); if (!li) return; dragKey = Number(li.dataset.key); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(dragKey)); } catch (x) { /* ignore */ } });
  list.addEventListener("dragover", (e) => { if (dragKey != null) e.preventDefault(); });
  list.addEventListener("drop", (e) => {
    const li = e.target.closest("li"); if (!li || dragKey == null) return;
    e.preventDefault();
    const o = fullOrder(H.S.prepared), to = o.indexOf(Number(li.dataset.key)), from = o.indexOf(dragKey);
    dragKey = null; if (from < 0 || to < 0 || from === to) return;
    o.splice(to, 0, o.splice(from, 1)[0]); applyOrder(o);
  });
  $("cutAuto").onclick = () => { H.S.cutOrder = null; H.S.cutSkip = []; H.loadJob(); };
}

// ================================================================ size check after DXF / SVG import
export function designSize(contours) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const c of contours) {
    if (c.circle) { add(c.circle.cx - c.circle.r, c.circle.cy - c.circle.r); add(c.circle.cx + c.circle.r, c.circle.cy + c.circle.r); }
    for (const p of c.pts || []) add(p[0], p[1]);
  }
  return Number.isFinite(x0) ? { w: x1 - x0, h: y1 - y0 } : { w: 0, h: 0 };
}
export function scaleContours(contours, k) {
  return contours.map((c) => {
    const o = { ...c, pts: (c.pts || []).map(([x, y, ...rest]) => [x * k, y * k, ...rest]) };
    if (c.circle) o.circle = { ...c.circle, cx: c.circle.cx * k, cy: c.circle.cy * k, r: c.circle.r * k };
    return o;
  });
}
export function sizeCheckWanted() {
  if (!H.isPro()) return true;                   // Beginner always gets asked; Pro can switch it off in Settings
  try { return currentSettings().sizeCheck !== false; } catch (e) { return true; }
}
let sizePending = null;
const r1 = (v) => Math.round(v * 10) / 10;
export function askSize(design, unitsNote, done) {
  const sz = designSize(design.contours);
  const dlg = $("sizeDlg");
  sizePending = { design, done, sz, k: 1 };
  $("sizeText").innerHTML = `This drawing is <b>${r1(sz.w)} × ${r1(sz.h)} mm</b>. Is that right?`;
  const hint = [];
  if (unitsNote) hint.push(`The file says its units are ${unitsNote}.`);
  if (sz.w < 25 && sz.h < 25) hint.push("That is very small. If you drew it in inches, pick the inches button.");
  if (sz.w > 1500 || sz.h > 1500) hint.push("That is bigger than most tables. If it came from a program that uses inches by mistake, try ÷ 25.4.");
  $("sizeUnits").textContent = hint.join(" ");
  $("sizeTo").value = "";
  dlg.classList.remove("hidden");
  setTimeout(() => $("sizeYes").focus(), 30);
}
function sizeFinish(k) {
  const pend = sizePending; if (!pend) return;
  sizePending = null; $("sizeDlg").classList.add("hidden");
  if (k !== 1) pend.design.contours = scaleContours(pend.design.contours, k);
  pend.done(k);
}
function bindSize() {
  $("sizeYes").onclick = () => sizeFinish(1);
  $("sizeInch").onclick = () => sizeFinish(25.4);
  $("sizeMm").onclick = () => sizeFinish(1 / 25.4);
  $("sizeScale").onclick = () => {
    const v = Number($("sizeTo").value), pend = sizePending; if (!pend) return;
    if (!(v > 0)) { H.toast("Type the size you want, in mm.", true); return; }
    const base = $("sizeAxis").value === "h" ? pend.sz.h : pend.sz.w;
    if (!(base > 0)) { H.toast("This drawing has no width to scale from.", true); return; }
    sizeFinish(v / base);
  };
  $("sizeTo").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("sizeScale").click(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sizePending) { e.stopPropagation(); sizeFinish(1); }
  }, true);
}

// ================================================================ straight cut / sheet trim
function bindStraight() {
  const open = () => {
    if (H.jobRunning()) { H.toast("A job is running.", true); return; }
    $("straightDlg").classList.remove("hidden"); setTimeout(() => $("stLen").focus(), 30);
  };
  ["btnStraight", "bgStraight", "pbStraight"].forEach((id) => { if ($(id)) $(id).onclick = open; });
  $("stCancel").onclick = () => $("straightDlg").classList.add("hidden");
  $("stOk").onclick = () => {
    const L = Number($("stLen").value), dir = $("stDir").value;
    const max = dir === "x" ? H.cfg().travel_mm.x : H.cfg().travel_mm.y;
    if (!(L >= 1) || L > max * 2) { H.toast(`Length must be between 1 and ${Math.round(max * 2)} mm.`, true); return; }
    const sx = $("stX").value.trim(), sy = $("stY").value.trim();
    $("straightDlg").classList.add("hidden");
    H.useStraight(dir, L, sx === "" ? null : Number(sx), sy === "" ? null : Number(sy));
  };
}

// ================================================================ restart from cut N
function pierceCount() { const p = H.S.prepared; return p && p.cutIndex ? p.cutIndex.length : 0; }
export function noteJobEnded(j) {      // called on every job event; works out which cut we were in when it stopped
  const S = H.S;
  if (j.running) { S.resume = null; return; }
  if (!j.result || j.result === "done") { if (j.result === "done") S.resume = null; return; }
  if (S.resume && S.resume.jobId === S.jobSeq) return;
  const R = S.run, from = H.M().runFrom || 1;
  const local = R ? (R.torch ? R.ons : R.offs + 1) : 1;
  const total = pierceCount();
  if (total < 1) { S.resume = null; return; }
  const n = Math.max(1, Math.min(total, from - 1 + Math.max(1, local)));
  S.resume = { n, total, jobId: S.jobSeq, reason: j.result };
}
export function paintRestart() {
  const S = H.S, box = $("restartBox"); if (!box) return;
  const r = S.resume, total = pierceCount();
  const show = !!r && total > 1 && !!S.prepared && !!S.prepared.cutIndex;
  box.classList.toggle("hidden", !show);
  if (!show) return;
  const sel = $("restartCut");
  if (sel.options.length !== total || sel.dataset.n !== String(total)) {
    sel.innerHTML = Array.from({ length: total }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(""); sel.dataset.n = String(total);
    sel.value = String(r.n);
  }
  $("restartHead").textContent = `Stopped during cut ${r.n} of ${total}.`;
  $("btnRestart").textContent = `Continue from cut ${sel.value}`;
}
export function paintStartCut() {
  const S = H.S, row = $("startCutRow"); if (!row) return;
  const total = pierceCount();
  const show = total > 1 && (H.isPro() || !!S.resume);
  row.classList.toggle("hidden", !show);
  if (!show) return;
  const sel = $("startCut");
  if (sel.dataset.n !== String(total)) { sel.innerHTML = Array.from({ length: total }, (_, i) => `<option value="${i + 1}">${i + 1} of ${total}</option>`).join(""); sel.dataset.n = String(total); }
  sel.value = String(Math.min(total, S.startCut || 1));
}
function bindRestart() {
  $("restartCut").onchange = () => { $("btnRestart").textContent = `Continue from cut ${$("restartCut").value}`; };
  $("btnRestart").onclick = () => {
    const n = Number($("restartCut").value) || 1, S = H.S;
    S.startCut = n; S.zeroSet = true;     // work zero is kept on purpose: the machine was only stopped, never moved by us
    H.goStep(3);
    H.toast(`Ready to continue from cut ${n}. Check the boxes, then press Start.`);
  };
  $("startCut").onchange = () => { H.S.startCut = Number($("startCut").value) || 1; H.drawPreview(); };
}
export function startCut() { return Math.max(1, Math.trunc(H.S.startCut || 1)); }
export function afterStart() { H.S.startCut = 1; H.S.resume = null; paintStartCut(); }

// ================================================================ live pierce delay (Pro)
function delayNow() { const M = H.M(); return M.liveDelay != null ? M.liveDelay : Number(H.S.prepared && H.S.prepared.cut ? H.S.prepared.cut.pierce_delay_s : H.row().pierce_delay_s); }
export function paintDelay() {
  const el = $("liveDelay"); if (!el) return;
  const d = delayNow();
  el.textContent = Number.isFinite(d) ? `${d.toFixed(1)} s` : "–";
}
function bindDelay() {
  const bump = (dir) => {
    try {
      const d = Math.round((delayNow() + dir * 0.1) * 10) / 10;
      const n = H.M().setPierceDelay(d);
      paintDelay();
      $("delNote").textContent = n ? `Pierce delay ${d.toFixed(1)} s. Applies to the next ${n} pierce${n === 1 ? "" : "s"} that haven't started yet.` : "No more pierces left in this job.";
    } catch (e) { H.toast(e.message, true); }
  };
  $("delDown").onclick = () => bump(-1);
  $("delUp").onclick = () => bump(1);
  $("delSave").onclick = () => {
    const S = H.S, r = H.row(), d = delayNow();
    try {
      upsertLocalPreset({ material: S.material, thickness_mm: S.thickness, pierce_delay_s: d, pierce_height_mm: r.pierce_height_mm ?? S.chart.pierce_height_mm,
        cut_speed_mm_min: S.speed, kerf_mm: r.kerf_mm ?? S.chart.kerf_mm, amps: r.amps, notes: "Saved from the live pierce delay buttons" });
      H.toast(`Saved pierce delay ${d.toFixed(1)} s for ${S.material.toLowerCase()} ${S.thickness} mm ✓`);
      H.applyPresetsAndRender();
    } catch (e) { H.toast(e.message, true); }
  };
}

// ================================================================ demo: "set up the edges for me"
function bindDemo() {
  const b = $("btnDemoEdges"); if (b) b.onclick = demoEdges;
}
export async function demoEdges() {
  const S = H.S, sim = S.demo, M = H.M();
  if (!sim || !M.grbl) { H.toast("This only works in the demo.", true); return; }
  if (S.job && S.job.running) { H.toast("A job is running.", true); return; }
  const btn = $("btnDemoEdges"); if (btn) btn.disabled = true;
  const tp = async (p) => { for (let i = 0; i < 40; i++) { if (sim.demoTeleport(p)) return true; await wait(100); } throw new Error("The demo didn't settle. Try again in a moment."); };
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(80); } return false; };
  try {
    H.toast("Demo: finding home…");
    if (M.state() === "Alarm") H.cmd("unlock");
    await wait(150);
    if (!S.safety.referenced) {
      H.cmd("home");
      if (!await until(() => S.safety.referenced && M.state() === "Idle", 20000)) throw new Error("The demo didn't finish homing.");
    }
    const t = H.cfg().travel_mm;
    await tp([t.x - 10, t.y - 10, 0]);
    await until(() => Math.abs((S.status.MPos || [0])[0] - (t.x - 10)) < 1, 3000);
    H.cmd("limits_far");
    // pretend the floating head is pushed up by a slat: the demo's simulated probe input turns on
    const sheet = sim.sheetZ - sim.switchOffset - 0.5;
    await tp([t.x - 10, t.y - 10, sheet]);
    await until(() => S.status.inputs && S.status.inputs.probe, 3000);
    H.cmd("limits_zbottom");
    await tp([t.x - 10, t.y - 10, 0]);
    await wait(200);
    H.cmd("limits_save");
    await tp([0, 0, 0]);
    await until(() => S.safety.limits && S.safety.referenced, 3000);
    H.toast("Demo edges set up ✓ (nothing real moved)");
  } catch (e) { H.toast(e.message, true); }
  finally { if (btn) btn.disabled = false; }
}

// ================================================================ Pro keyboard shortcuts + toolbar
function bindKeys() {
  const pro = { pbOpen: () => { H.showSource("file"); $("file").click(); }, pbShape: () => { H.showSource("shape"); H.setShapeFs(true); },
    pbPlay: togglePlay, pbRun: () => H.checkAndRun() };
  for (const [id, fn] of Object.entries(pro)) if ($(id)) $(id).onclick = fn;
  document.addEventListener("keydown", (e) => {
    if (!H.isPro() || e.defaultPrevented) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !H.jobRunning()) { e.preventDefault(); H.checkAndRun(); return; }
    if (typing || e.ctrlKey || e.metaKey) return;
    if (e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); H.goStep(Number(e.key)); return; }
    if (e.key === " " && !H.jobRunning() && !H.sketchActive() && !$("playRow").classList.contains("hidden")) { e.preventDefault(); togglePlay(); }
  });
}

// ================================================================ greyed-out tools say why (inline, and on tap)
let whyTimer = 0;
export function showWhy(text) {
  const el = $("qbWhy"); if (!el) { H.toast(text); return; }
  el.textContent = text; el.classList.remove("hidden");
  clearTimeout(whyTimer); whyTimer = setTimeout(() => el.classList.add("hidden"), 4500);
}
function bindWhy() {
  $("quickBar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-qb][aria-disabled='true']"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    showWhy((b.dataset.label || "This tool") + " is off: " + (b.dataset.why || "select a shape first") + ".");
  }, true);
}

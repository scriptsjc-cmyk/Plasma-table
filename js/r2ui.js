import { POSITION_LOST_ALARMS } from "./machine.js";
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

// The version this page is running. The deploy writes version.json (commit id) next to the files, so the page reads the id
// from there when it starts (js/version.js is only the fallback). That way the footer/About always show the deployed commit
// and the "New version" banner only appears when version.json changes AFTER this page loaded.
let RUN = VERSION;
export function initR2(host) {
  H = host;
  fetchLatest().then((j) => { if (j) { RUN = { id: j.id, commit: j.commit || VERSION.commit, built: j.built || VERSION.built }; paintVersionLines(); paintAbout(); } });
  bindVersion(); bindPlay(); bindCam(); bindCutList(); bindSize(); bindStraight(); bindRestart(); bindDelay(); bindDemo(); bindKeys(); bindWhy(); bindDemoFit(); bindTopMenu(); bindPierceJump(); installLabelGuard(); installIcons();
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
  if ($("aboutNote")) $("aboutNote").textContent = `A newer version (${info.id}) is available. You are on ${RUN.id}.`;
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
  if (j && j.id !== RUN.id) { showUpdate(j); return "new"; }
  if (manual && $("aboutNote")) $("aboutNote").textContent = j ? `You are on the latest version (${RUN.id}).` : "Couldn't check right now (offline?). You are on " + RUN.id + ".";
  return j ? "same" : "offline";
}
function versionText() { return `Version ${RUN.id}${RUN.commit && RUN.commit !== "pending" && !String(RUN.id).includes(RUN.commit) ? " · " + RUN.commit : ""}`; }
function paintVersionLines() {
  const t = versionText();
  if ($("verLine")) $("verLine").textContent = t;
  if ($("footVer")) $("footVer").textContent = t;
}
export function paintAbout() {
  if ($("aboutVer")) $("aboutVer").innerHTML = `<b>${RUN.id}</b><br><span class="muted small">commit ${RUN.commit} · built ${RUN.built}</span>`;
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
    const up = `<svg class="ico" aria-hidden="true"><use href="#i-arrow-up"></use></svg>`;
    const dn = `<svg class="ico" aria-hidden="true"><use href="#i-arrow-down"></use></svg>`;
    return `<li draggable="true" data-key="${k}" class="${off ? "off" : ""}">
      <span class="grip" aria-hidden="true">≡</span>
      <label class="cuttick"><input type="checkbox" data-cutkey="${k}" ${off ? "" : "checked"} aria-label="Cut ${name} ${k + 1}"><b>${off ? "–" : n}</b><span class="cutname">${name} ${c.size[0]} × ${c.size[1]} mm</span></label>
      <span class="mv"><button type="button" data-mv="-1" data-key="${k}" aria-label="Move earlier" ${i === 0 ? "disabled" : ""}>${up}</button><button type="button" data-mv="1" data-key="${k}" aria-label="Move later" ${i === order.length - 1 ? "disabled" : ""}>${dn}</button></span></li>`;
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
export function askSize(design, unitsNote, done, opts = {}) {
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
  if ($("sizeAllRow")) {      // several files: one answer can cover the rest
    $("sizeAll").checked = false;
    $("sizeAllRow").classList.toggle("hidden", !(opts.left > 0));
    if (opts.name) $("sizeText").innerHTML = `<b>${String(opts.name).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}</b> is <b>${r1(sz.w)} × ${r1(sz.h)} mm</b>. Is that right?`;
    if (opts.left > 0) $("sizeAllText").textContent = `Use the same answer for the other ${opts.left} file${opts.left === 1 ? "" : "s"} (apply to all)`;
  }
  dlg.classList.remove("hidden");
  setTimeout(() => $("sizeYes").focus(), 30);
}
function sizeFinish(k) {
  const pend = sizePending; if (!pend) return;
  sizePending = null; $("sizeDlg").classList.add("hidden");
  if (k !== 1) pend.design.contours = scaleContours(pend.design.contours, k);
  const all = !!($("sizeAll") && $("sizeAll").checked && !$("sizeAllRow").classList.contains("hidden"));
  pend.done(k, all);
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
  const why = $("resumeWhy");
  if (why) {
    const need = (S.startCut || 1) > 1 || S.resume ? resumeNeeds() : [];
    why.classList.toggle("hidden", !need.length);
    why.textContent = need.length ? `The machine was stopped, so it may have lost its place. Before you continue: ${need.join(", then ")}. Start stays locked until then.` : "";
  }
}
function bindRestart() {
  $("restartCut").onchange = () => { $("btnRestart").textContent = `Continue from cut ${$("restartCut").value}`; };
  $("btnRestart").onclick = () => {
    const n = Number($("restartCut").value) || 1, S = H.S;
    S.startCut = n;
    // Round 3 safety: Continue NEVER marks work zero as set. A STOP (soft reset), an alarm (ALARM 3 too) or a lost reference means the
    // controller may no longer know where it is, so work zero has to be confirmed again (and the machine homed if edges are on).
    // Work zero is only kept when the machine is still homed with edges on and no position-lost alarm has come in since.
    if (!positionStillKnown()) S.zeroSet = false;
    H.goStep(3);
    H.toast(S.zeroSet ? `Ready to continue from cut ${n}. Check the boxes, then press Start.` : `Before continuing from cut ${n}: ${resumeNeeds().join(", then ")}.`, !S.zeroSet);
  };
  $("startCut").onchange = () => { H.S.startCut = Number($("startCut").value) || 1; H.drawPreview(); };
}
export function positionStillKnown() {
  const S = H.S;
  return !!(S.safety && S.safety.limits && S.safety.referenced) && !(S.lastAlarmCode != null && POSITION_LOST_ALARMS.has(S.lastAlarmCode)) && !!S.zeroSet;
}
// what still has to happen before a resumed cut may start, in plain words (empty = nothing)
export function resumeNeeds() {
  const S = H.S, need = [];
  if (S.safety && S.safety.limits && !S.safety.referenced) need.push("press Home so the table finds its edges again");
  if (!S.zeroSet) need.push("move the torch over the start of the work and press Start here to confirm work zero");
  return need;
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

// ================================================================ greyed-out controls say why (tap anywhere)
// Reasons already live on the control as data-why + aria-disabled="true" (whyOff() stays private in app.js).
let whyTimer = 0;
function whyMessage(el) {
  const why = (el.getAttribute("data-why") || "").trim();
  if (!why) return "";
  const label = (el.dataset.label || "").trim();
  if (!label) return why.endsWith(".") ? why : why + ".";
  const short = label.replace(/\s*\([^)]*\)\s*$/, "");
  return short + " is off: " + (why.endsWith(".") ? why : why + ".");
}
function placeWhyTip(el, anchor) {
  const stop = $("btnStop");
  const sr = stop ? stop.getBoundingClientRect() : null;
  el.style.left = "0px"; el.style.top = "0px";
  const w = el.offsetWidth, h = el.offsetHeight;
  const r = anchor.getBoundingClientRect();
  let left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  const hits = (t, l) => sr && !(l + w < sr.left || l > sr.right || t + h < sr.top || t > sr.bottom);
  if (hits(top, left)) {
    const below = sr.bottom + 6;
    const above = sr.top - h - 6;
    top = below + h <= innerHeight - 8 ? below : Math.max(8, above);
    if (hits(top, left)) left = Math.max(8, sr.left - w - 8);
  }
  el.style.left = left + "px";
  el.style.top = top + "px";
}
export function showWhy(text, anchor) {
  const tip = $("whyTip");
  const inline = $("qbWhy");
  if (inline) {
    const inBar = anchor && anchor.closest("#quickBar");
    if (inBar) { inline.textContent = text; inline.classList.remove("hidden"); }
    else inline.classList.add("hidden");
  }
  if (!tip) { if (H) H.toast(text); return; }
  tip.textContent = text;
  tip.classList.remove("hidden");
  if (anchor && anchor.getBoundingClientRect) placeWhyTip(tip, anchor);
  else { tip.style.left = "50%"; tip.style.top = ""; tip.style.bottom = "24px"; tip.style.transform = "translateX(-50%)"; }
  if (anchor) tip.style.transform = "";
  clearTimeout(whyTimer);
  whyTimer = setTimeout(() => { tip.classList.add("hidden"); if (inline) inline.classList.add("hidden"); }, 4500);
}
function bindWhy() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[aria-disabled='true'][data-why]");
    if (!b) return;
    const text = whyMessage(b);
    if (!text) return;
    e.preventDefault();
    e.stopPropagation();
    showWhy(text, b);
  }, true);
}

// The demo fit line is plain text rewritten by refresh(). Turn that one sentence into a real button.
let fitDressing = false;
function dressDemoFit() {
  const el = $("fit"); if (!el || fitDressing) return;
  if (el.querySelector(".fit-demo-btn")) return;
  const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!/edges are set up for you/i.test(raw)) return;
  fitDressing = true;
  el.textContent = "";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "secondary fit-demo-btn";
  b.id = "btnFitDemoEdges";
  b.textContent = "Set up the edges for me";
  b.title = "Demo: nothing real moves";
  b.setAttribute("aria-label", "Set up the edges for me. Demo only, nothing real moves.");
  el.appendChild(b);
  fitDressing = false;
}
function bindPierceJump() {
  const toTorch = $("btnPierceJump");
  if (toTorch) toTorch.onclick = () => {
    const tab = document.querySelector('#settingsTabs [data-settab="torch"]');
    if (tab) tab.click();
    const el = $("setPierceH");
    if (el) { el.scrollIntoView({ block: "center" }); el.focus(); }
  };
  const toSpeed = $("btnPierceSpeed");
  if (toSpeed) toSpeed.onclick = () => {
    const dlg = $("settingsDlg");
    if (dlg) dlg.classList.add("hidden");
    const cut = document.querySelector('.tab[data-tab="cut"]');
    if (cut) cut.click();
    if (H && H.goStep) H.goStep(2);
    const el = $("spSlider");
    if (el) setTimeout(() => { el.scrollIntoView({ block: "center" }); el.focus(); }, 60);
  };
}
function bindDemoFit() {
  const el = $("fit"); if (!el) return;
  new MutationObserver(() => dressDemoFit()).observe(el, { childList: true, attributes: true, attributeFilter: ["class"] });
  dressDemoFit();
}

// Narrow header: pills collapse into one menu. STOP and a lit torch stay on the bar.
function closeTopMenu() {
  const bar = document.querySelector(".topbar");
  const btn = $("btnTopMenu");
  if (bar) bar.classList.remove("menu-open");
  if (btn) btn.setAttribute("aria-expanded", "false");
}
function bindTopMenu() {
  const btn = $("btnTopMenu");
  const bar = document.querySelector(".topbar");
  const menu = $("topMenu");
  if (!btn || !bar || !menu) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const on = !bar.classList.contains("menu-open");
    bar.classList.toggle("menu-open", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
  });
  document.addEventListener("click", (e) => {
    if (!bar.classList.contains("menu-open")) return;
    if (e.target.closest("#btnTopMenu")) return;
    if (e.target.closest("#topMenu")) {
      if (e.target.closest("button, a")) closeTopMenu();
      return;
    }
    closeTopMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTopMenu(); });
}

// Sheet-map captions are drawn in sketch.js / setup.js. On a narrow canvas the footer
// pair shares one baseline and the start-point caption sits on the sheet title.
// Nudge only those known strings; leave every other canvas label where it was drawn.
let mapSheetY = null, mapMachineY = null;
function nudgePreviewLabel(text, x, y, w, h) {
  if (typeof text !== "string" || !(w > 0)) return { x, y };
  if (/^grid /.test(text)) { mapSheetY = null; mapMachineY = null; return { x, y }; }
  if (/shape/.test(text) && /overall/.test(text) && w < 560) return { x: 8, y: Math.max(14, h - 22) };
  if (text.startsWith("Sheet ")) { mapSheetY = y; return { x, y }; }
  if (text === "Machine work area") {
    let yy = y;
    if (mapSheetY != null && Math.abs(yy - mapSheetY) < 22) yy = mapSheetY + 22;
    if ((w < 560 || h < 220) && yy > h - 32) yy = Math.max(14, h - 32);
    mapMachineY = yy;
    return { x, y: yy };
  }
  if (text.startsWith("Start point")) {
    let yy = y;
    const block = Math.max(mapSheetY || 0, mapMachineY || 0);
    if (block && yy < block + 22) yy = block + 22;
    if ((w < 560 || h < 220) && yy > h - 36) yy = Math.max(14, h - 36);
    const moved = yy !== y;
    const xx = moved ? Math.max(4, Math.min(x, Math.max(4, w - 130))) : x;
    return { x: xx, y: yy };
  }
  return { x, y };
}
function installLabelGuard() {
  const orig = CanvasRenderingContext2D.prototype.fillText;
  if (orig.__ptLabel) return;
  function wrapped(text, x, y, maxWidth) {
    const cv = this.canvas;
    if (!cv || cv.id !== "preview") return maxWidth == null ? orig.call(this, text, x, y) : orig.call(this, text, x, y, maxWidth);
    const w = cv.clientWidth || 0, h = cv.clientHeight || 0;
    const p = nudgePreviewLabel(String(text), x, y, w, h);
    return maxWidth == null ? orig.call(this, text, p.x, p.y) : orig.call(this, text, p.x, p.y, maxWidth);
  }
  wrapped.__ptLabel = true;
  CanvasRenderingContext2D.prototype.fillText = wrapped;
}

// One stroke icon set. Emoji in buttons, tabs and status pills are swapped for these symbols.
const ICON_GLYPHS = [
  ["🗑", "trash"], ["🔍", "search"], ["📍", "pin"], ["📂", "folder"], ["📏", "ruler"],
  ["⊂⊃", "slot"], ["⟳", "rotate-cw"], ["⟲", "rotate-ccw"], ["⤢", "expand"], ["⤡", "resize"],
  ["⛶", "fullscreen"], ["⇤", "align-left"], ["⤓", "arrow-down"], ["⤒", "arrow-up"], ["⌂", "home"],
  ["⚠", "warning"], ["⚙", "gear"], ["✂", "cut"], ["✥", "move"], ["🔒", "lock"], ["▶", "play"],
  ["⏸", "pause"], ["✏", "pencil"], ["✎", "pencil"], ["↺", "undo"], ["↻", "rotate-cw"], ["➖", "minus"],
  ["⊞", "arrange"], ["⇋", "flip"], ["⧉", "copy"], ["✕", "close"], ["●", "dot"], ["▣", "square"],
  ["▭", "rect"], ["◯", "circle"], ["△", "triangle"], ["◔", "sector"], ["⊖", "minus-circle"],
  ["⊕", "plus"], ["⁘", "dots"], ["⟋", "slash"], ["⧈", "offset"], ["↔", "arrows-h"], ["⌒", "arc"],
  ["⌜", "corner"], ["◈", "diamond"], ["⌗", "grid"], ["✲", "asterisk"], ["⋯", "more"],
  ["↶", "undo"], ["↷", "redo"], ["▲", "arrow-up"], ["▼", "arrow-down"], ["◀", "arrow-left"],
  ["←", "arrow-left"], ["→", "arrow-right"], ["↑", "arrow-up"], ["↓", "arrow-down"],
].sort((a, b) => b[0].length - a[0].length);

function iconForGlyph(ch, el) {
  if (ch === "▶" && el.closest(".jog")) return "arrow-right";
  if (ch === "●" && !el.closest("#connPill")) return null;
  if (ch === "▲" && el.closest(".selhead")) return null;
  const hit = ICON_GLYPHS.find(([g]) => g === ch);
  return hit ? hit[1] : null;
}
function iconSvg(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ico");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#i-" + name);
  svg.appendChild(use);
  return svg;
}
function shouldDressIcon(el) {
  if (!el || el.closest("script, style, textarea, input, .ico, #log, #advConsoleLog, #whyTip, .selhead, [data-shape], [data-bshape], .libgrid")) return false;
  return !!el.closest("button, .tab, .pill, .locknote, .turnicon, .jog, .ampsnote, .quickbar");
}
function replaceEmojiText(node) {
  const raw = node.nodeValue;
  const parent = node.parentElement;
  if (!raw || !shouldDressIcon(parent)) return;
  const segs = [];
  let i = 0, buf = "", changed = false;
  while (i < raw.length) {
    let hit = null;
    for (const pair of ICON_GLYPHS) {
      if (raw.startsWith(pair[0], i)) { hit = pair; break; }
    }
    if (!hit) {
      const cp = raw.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      buf += ch;
      i += ch.length;
      continue;
    }
    const name = iconForGlyph(hit[0], parent);
    if (!name) { buf += hit[0]; i += hit[0].length; continue; }
    if (buf) segs.push({ t: buf });
    buf = "";
    segs.push({ i: name });
    changed = true;
    i += hit[0].length;
  }
  if (buf) segs.push({ t: buf });
  if (!changed) return;
  const frag = document.createDocumentFragment();
  for (const s of segs) frag.appendChild(s.t != null ? document.createTextNode(s.t) : iconSvg(s.i));
  node.parentNode.replaceChild(frag, node);
}
function dressIcons(root) {
  if (!root || root.nodeType !== 1) return;
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) replaceEmojiText(node);
}
function installIcons() {
  let queued = [];
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const list = queued;
    queued = [];
    for (const el of list) dressIcons(el);
  };
  const queue = (el) => {
    if (!el || el.nodeType !== 1) return;
    queued.push(el);
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
  };
  dressIcons(document.body);
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === "characterData" && r.target.parentElement) queue(r.target.parentElement);
      for (const node of r.addedNodes) {
        if (node.nodeType === 1) queue(node);
        else if (node.nodeType === 3 && node.parentElement) queue(node.parentElement);
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

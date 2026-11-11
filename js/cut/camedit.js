// Pro cut options (tabs, lead-out, overcut) and the start-point / tab handles you drag on the preview.
import { $ } from "../core/dom.js";
import { H } from "../ui/host.js";
import { nearestOnRing } from "./cam.js";

// ================================================================ CAM: tabs, lead-out, overcut, start points (under "More cut options"; every default is off)
export function camOpts() {            // what the job builder gets
  const S = H.S;
  const c = S.cam;
  return {
    order: S.cutOrder || null, skip: S.cutSkip || [], starts: c.starts || {},
    tabs: c.tabs > 0 ? { count: c.tabs, width: c.tabW } : null, tabOver: c.tabOver || {},
    leadOut: c.leadOut || 0, overcut: c.over || 0,
  };
}
function resetCam(keepOrder) {
  const S = H.S;
  S.cam.starts = {}; S.cam.tabOver = {};
  if (!keepOrder) { S.cutOrder = null; S.cutSkip = []; }
}
export function designChanged(count) {            // a different drawing: the old cut numbers mean nothing
  const S = H.S;
  if (S._camCount !== count) { S._camCount = count; resetCam(false); }
}
export function bindCam() {
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
// handles on the zoomed preview (cutting screen step 1, "More cut options" open): green dot = where each cut starts, orange squares = hold-down tabs
function handleList() {
  const S = H.S, p = S.prepared;
  if (!p || !p.cutInfo || S.cur !== 1 || !p.shift || !H.camHandles()) return [];
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

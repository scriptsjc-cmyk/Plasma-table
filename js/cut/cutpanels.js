// r7 J14: the laptop cutting screen's panels can be swapped round and resized. Bed & start has three columns (the side cards, the
// bed picture, the start-point card); Cut has two (the picture and the run panel). Drag a divider (or focus it and use the arrows)
// to resize; press Layout to move panels left or right (buttons, or drag one panel onto another), Reset layout to go back.
// The bed picture always keeps at least BED_MIN of the window's width. STOP is in the header, outside all of this, and never moves.
// Saved on the same per-account prefs path as Customise toolbar (plasma.yours.v1, keyed by user id).
import { $ } from "../core/dom.js";
import { S } from "../core/state.js";
import * as Acc from "../account/account.js";
import { getPrefs, loadPrefs, savePrefs } from "../core/prefs.js";
import { isLaptopCut, LAPTOP_CUT_MQ } from "./cutbar.js";

const BED_MIN = 0.36;
const PANELS = {
  side: { name: "Cut check, parts and checks", def: "minmax(290px, 22vw)", min: 260 },
  main: { name: "Connect and start point", def: "minmax(340px, 27vw)", min: 330 },
  run: { name: "Run panel", def: "minmax(480px, 40vw)", min: 420 },
  bed: { name: "Bed picture", def: "minmax(0, 1fr)" },
};
const DEFAULT = () => ({ s3: { order: ["side", "bed", "main"], w: {} }, s4: { order: ["bed", "run"], w: {} } });
const userId = () => (Acc.currentUser() || {}).id || "";
const legacyKey = () => "plasma.cutLayout.v1." + (userId() || "guest");
let L = DEFAULT(), grid = null, dividers = [], covers = [];

function fromStore(j) {
  const d = DEFAULT();
  const ok = (o, want) => o && Array.isArray(o.order) && o.order.length === want.length && want.every((p) => o.order.includes(p));
  return { s3: ok(j && j.s3, d.s3.order) ? { order: j.s3.order, w: j.s3.w || {} } : d.s3, s4: ok(j && j.s4, d.s4.order) ? { order: j.s4.order, w: j.s4.w || {} } : d.s4 };
}
function load() {
  loadPrefs(userId());
  let j = getPrefs().cutLayout;
  if (!j) {
    try { j = JSON.parse(localStorage.getItem(legacyKey()) || "null"); } catch (e) { j = null; }
    if (j) { savePrefs({ cutLayout: j }, userId()); try { localStorage.removeItem(legacyKey()); } catch (e) { /* ignore */ } j = getPrefs().cutLayout; }
  }
  L = fromStore(j);
}
const save = () => { savePrefs({ cutLayout: L }, userId()); };
const stepKey = () => (S.cur === 4 ? "s4" : S.cur === 3 ? "s3" : null);
const active = () => !!grid && isLaptopCut() && document.body.dataset.screen === "cut" && !!stepKey();
const liveJob = () => !!(S.job && S.job.running);

// the widest a side panel may be: the bed keeps BED_MIN of the window, the other side panel keeps its current width
function maxWidth(sk, p) {
  const edges = colEdges(), o = L[sk].order;
  const others = o.filter((q) => q !== p && q !== "bed").reduce((a, q) => a + (L[sk].w[q] || (edges[o.indexOf(q)] ? edges[o.indexOf(q)][1] - edges[o.indexOf(q)][0] : PANELS[q].min)), 0);
  const gaps = (L[sk].order.length - 1) * gapPx();
  return Math.max(PANELS[p].min, grid.clientWidth - BED_MIN * window.innerWidth - others - gaps - 24);
}
const gapPx = () => parseFloat(getComputedStyle(grid).columnGap) || 0;
const clampW = (sk, p, v) => Math.round(Math.min(maxWidth(sk, p), Math.max(PANELS[p].min, v)));

// CSS custom properties on the grid: the column list, and which column each panel sits in (css/screen-cut.css)
function apply() {
  if (!grid) return;
  for (const sk of ["s3", "s4"]) {
    const o = L[sk];
    for (const p of o.order) if (o.w[p]) o.w[p] = clampW(sk, p, o.w[p]);
    grid.style.setProperty(`--${sk}-cols`, o.order.map((p) => (o.w[p] ? o.w[p] + "px" : PANELS[p].def)).join(" "));
    o.order.forEach((p, i) => grid.style.setProperty(`--${sk}-${p}`, String(i + 1)));
  }
  paintDividers(); paintCovers();
}
function colEdges() {
  const cs = getComputedStyle(grid), cols = cs.gridTemplateColumns.split(" ").map(parseFloat), gap = gapPx();
  let x = parseFloat(cs.paddingLeft) || 0; const out = [];
  cols.forEach((w) => { out.push([x, x + w]); x += w + gap; });
  return out;
}
function paintDividers() {
  const on = active() && !liveJob(), sk = stepKey(), edges = on ? colEdges() : [];
  dividers.forEach((d, i) => {
    const show = on && i < edges.length - 1;
    d.hidden = !show; if (!show) return;
    const [l, r] = L[sk].order.slice(i, i + 2), p = l !== "bed" ? l : r;
    d.style.left = (edges[i][1] + edges[i + 1][0]) / 2 + "px";
    d.dataset.panel = p; d.dataset.i = String(i);
    d.setAttribute("aria-label", "Resize: " + PANELS[p].name);
    d.setAttribute("aria-valuenow", String(Math.round(edges[L[sk].order.indexOf(p)][1] - edges[L[sk].order.indexOf(p)][0])));
  });
}
// a divider resizes the side panel next to it (the one that isn't the bed; between two side panels, the left one)
function resizeBy(i, dx) {
  const sk = stepKey(); if (!sk) return;
  const [l, r] = L[sk].order.slice(i, i + 2), edges = colEdges();
  const cur = (p) => L[sk].w[p] || Math.round(edges[L[sk].order.indexOf(p)][1] - edges[L[sk].order.indexOf(p)][0]);
  if (l !== "bed") L[sk].w[l] = clampW(sk, l, cur(l) + dx);
  else L[sk].w[r] = clampW(sk, r, cur(r) - dx);
  apply();
}
function bindDivider(d, i) {
  d.addEventListener("pointerdown", (e) => {
    e.preventDefault(); d.setPointerCapture(e.pointerId); d.classList.add("dragging");
    let x0 = e.clientX;
    const move = (ev) => { const dx = ev.clientX - x0; if (Math.abs(dx) >= 1) { resizeBy(i, dx); x0 = ev.clientX; } };
    const up = () => { d.classList.remove("dragging"); d.removeEventListener("pointermove", move); d.removeEventListener("pointerup", up); d.removeEventListener("pointercancel", up); save(); };
    d.addEventListener("pointermove", move); d.addEventListener("pointerup", up); d.addEventListener("pointercancel", up);
  });
  d.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 64 : 16, dx = { ArrowLeft: -step, ArrowRight: step }[e.key];
    if (!dx) return;
    e.preventDefault(); e.stopPropagation(); resizeBy(i, dx); save();
  });
}

// ---------------------------------------------------------------- Layout mode: move panels
const arranging = () => document.body.classList.contains("cut-arrange");
function move(p, dir) {
  const sk = stepKey(), o = L[sk].order, i = o.indexOf(p), j = i + dir;
  if (j < 0 || j >= o.length) return;
  [o[i], o[j]] = [o[j], o[i]]; apply(); save();
  const cover = covers.find((c) => c.dataset.panel === p);                 // keep the focus on the panel that moved
  const btn = cover && (cover.querySelector(`[data-dir="${dir}"]:not([disabled])`) || cover.querySelector("button:not([disabled])"));
  if (btn) btn.focus();
}
function paintCovers() {
  const on = arranging() && active(), sk = stepKey(), edges = on ? colEdges() : [];
  covers.forEach((c, i) => {
    const show = on && i < edges.length; c.hidden = !show; if (!show) return;
    const p = L[sk].order[i];
    c.dataset.panel = p; c.style.left = edges[i][0] + "px"; c.style.width = edges[i][1] - edges[i][0] + "px";
    c.querySelector(".arrname").textContent = PANELS[p].name;
    c.querySelector('[data-dir="-1"]').disabled = i === 0;
    c.querySelector('[data-dir="1"]').disabled = i === edges.length - 1;
  });
}
function makeCover() {
  const c = document.createElement("div");
  c.className = "arrcover"; c.hidden = true; c.draggable = true;
  c.innerHTML = `<b class="arrname"></b><span class="row"><button type="button" class="small" data-dir="-1">← Move left</button><button type="button" class="small" data-dir="1">Move right →</button></span><span class="muted small">or drag it onto another panel</span>`;
  c.addEventListener("click", (e) => { const b = e.target.closest("button[data-dir]"); if (b) move(c.dataset.panel, Number(b.dataset.dir)); });
  c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", c.dataset.panel); c.classList.add("dragging"); });
  c.addEventListener("dragend", () => c.classList.remove("dragging"));
  c.addEventListener("dragover", (e) => { e.preventDefault(); c.classList.add("dropon"); });
  c.addEventListener("dragleave", () => c.classList.remove("dropon"));
  c.addEventListener("drop", (e) => {
    e.preventDefault(); c.classList.remove("dropon");
    const from = e.dataTransfer.getData("text/plain"), sk = stepKey(), o = L[sk].order, i = o.indexOf(from), j = o.indexOf(c.dataset.panel);
    if (i < 0 || j < 0 || i === j) return;
    [o[i], o[j]] = [o[j], o[i]]; apply(); save();
  });
  return c;
}
export function setArrange(on) {
  on = !!on && active() && !liveJob();
  document.body.classList.toggle("cut-arrange", on);
  const b = $("btnLayout"); if (b) { b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Done" : "Layout"; }
  const r = $("btnLayoutReset"); if (r) r.classList.toggle("hidden", !on);
  paintCovers();
}
export function resetLayout() { L = DEFAULT(); savePrefs({ cutLayout: null }, userId()); try { localStorage.removeItem(legacyKey()); } catch (e) { /* ignore */ } apply(); }

// every refresh: no Layout while a job is live (and leave it if one starts), dividers follow the step
export function paintCutPanels() {
  const b = $("btnLayout"); if (!b) return;
  b.disabled = liveJob();
  b.title = liveJob() ? "Not while a job is running" : "Move and resize the panels";
  if (arranging() && (liveJob() || !active())) setArrange(false);
  if (grid) { paintDividers(); paintCovers(); }
}
export function bindCutPanels() {
  grid = document.querySelector("#cutView .cutgrid"); if (!grid) return;
  load();
  for (let i = 0; i < 2; i++) {
    const d = document.createElement("div");
    d.className = "coldivider"; d.hidden = true; d.tabIndex = 0;
    d.setAttribute("role", "separator"); d.setAttribute("aria-orientation", "vertical");
    bindDivider(d, i); grid.appendChild(d); dividers.push(d);
  }
  for (let i = 0; i < 3; i++) { const c = makeCover(); grid.appendChild(c); covers.push(c); }
  $("btnLayout").onclick = () => setArrange(!arranging());
  $("btnLayoutReset").onclick = () => resetLayout();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && arranging()) setArrange(false); });
  new ResizeObserver(() => apply()).observe(grid);
  try { window.matchMedia(LAPTOP_CUT_MQ).addEventListener("change", () => { if (!isLaptopCut()) setArrange(false); apply(); }); } catch (e) { /* placed once */ }
  Acc.onAccountChange(() => { load(); apply(); });
  apply();
}

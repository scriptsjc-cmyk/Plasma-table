// r15 Round 2: the Features list in the inspector's Features tab (the old Holes tab, id data-insp="holes").
// One row per feature: icon, type, summary, ⚠ when a live check fails, eye (show / hide) and ⋯ (Duplicate, Mirror,
// Pattern, Move, Unlink, Delete). Clicking a row opens it in place for typing. Every edit is one undo step.
// The model lives in part-features.js; the sketch flattens features to plain contours before anything is cut.
import { $, esc, toast } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { CUTOUT_SHAPES, FEATURE_KINDS, PATTERNABLE, adoptableHoles, featureOps, isHoleFeature, exact, featureIssues, featureSummary, mirrored, newFeature, patternOf, setFeatureValue, syncLinks } from "./part-features.js";

const ADD_ORDER = [["hole", "Hole"], ["slot", "Slot"], ["bolt", "Bolt circle"], ["grid", "Grid of holes"], ["edge", "Holes in a line"],
  ["rect", "Rectangle cut-out"], ["shape", "Shape cut-out"], ["text", "Text"], ["etch", "Etch line"], ["corner", "Corners"]];
let openId = null, menuFor = null;

const part = () => {
  const it = sketch && sketch.selected();
  if (!it || it.type === "custom" && !it.shape) return null;
  if (sketch.isHole && sketch.isHole(it)) return null;
  return it;
};
function frame(it) {                                    // the outline in the part's own frame, bottom-left = 0,0
  let c = null; try { c = sketch.baseContours(it)[0]; } catch (e) { c = null; }
  if (!c) return { W: 0, H: 0, outline: null };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { W: x1 - x0, H: y1 - y0, outline: c.pts.map(([x, y]) => [x - x0, y - y0]) };
}
// holes that are part of the shape itself (a plate's corner holes, a flange's bolt holes): listed, changed on the Size tab
function shapeHoles(it) {
  let cs = []; try { cs = sketch.baseContours(it); } catch (e) { return []; }
  if (!cs.length || it.type === "custom") return [];
  const hs = sketch.holeStart(it); if (!Number.isFinite(hs)) return [];
  let x0 = Infinity, y0 = Infinity;
  for (const [x, y] of cs[0].pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
  const out = [];
  for (let i = hs; i < cs.length; i++) {
    const c = cs[i]; if (!c || c.closed === false || c.op || c.role) continue;
    const o = (it.holes && it.holes[i]) || [0, 0];
    let a = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of c.pts) a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)];
    const w = a[2] - a[0], h = a[3] - a[1], cx = exact((a[0] + a[2]) / 2 + o[0] - x0), cy = exact((a[1] + a[3]) / 2 + o[1] - y0);
    const round = Math.abs(w - h) < 0.05;
    out.push({ i, round, text: round ? `Ø${exact(Math.round(w * 100) / 100)} at ${cx}, ${cy}` : `${exact(Math.round(w * 100) / 100)} × ${exact(Math.round(h * 100) / 100)} at ${cx}, ${cy}` });
  }
  return out;
}
function shapeHoleRows(it) {
  const hs = shapeHoles(it); if (!hs.length) return "";
  return hs.map((h) => `<li class="feat-row feat-builtin" data-builtin="${h.i}"><div class="feat-head"><span class="feat-open" title="Part of the shape: change it on the Size tab"><span class="feat-ico" aria-hidden="true">${h.round ? "○" : "▭"}</span><span class="feat-type">${h.round ? "Hole" : "Cut-out"}</span><span class="feat-sum">${esc(h.text)}</span><span class="muted small">· part of the shape (Size tab)</span></span></div></li>`).join("");
}
const thickness = () => { const t = Number(S.thickness); return Number.isFinite(t) && t > 0 ? t : 3; };
const fromCentre = (f) => f.from === "centre";
const shownXY = (f, fr) => (fromCentre(f) ? [exact(f.x - fr.W / 2), exact(f.y - fr.H / 2)] : [f.x, f.y]);

function field(f, key, label, fr) {
  if (key === "shape") return `<label>${esc(label)}<select data-ff="shape">${(f.pts ? [...CUTOUT_SHAPES, "drawn"] : CUTOUT_SHAPES).map((s) => `<option value="${s}"${f.shape === s ? " selected" : ""}>${s === "drawn" ? "drawn shape" : s}</option>`).join("")}</select></label>`;
  if (key === "text") return `<label class="wide2">${esc(label)}<input type="text" data-ff="text" maxlength="80" value="${esc(f.text)}"></label>`;
  const v = key === "x" ? shownXY(f, fr)[0] : key === "y" ? shownXY(f, fr)[1] : f[key];
  return `<label>${esc(label)}<input type="number" step="any" inputmode="decimal" data-ff="${key}" value="${esc(String(v))}"></label>`;
}
// pattern of this feature (plan 2.6): one row, its copies
function patternFields(f) {
  const p = f.pat, t = p ? p.t : "none";
  const types = [["none", "None"], ["grid", "Grid"], ["circle", "Circle"], ["line", "In a line"]];
  const num = (key, label) => `<label>${esc(label)}<input type="number" step="any" inputmode="decimal" data-ff="p${key}" value="${esc(String(p[key]))}"></label>`;
  const more = !p ? "" : p.t === "grid" ? num("cols", "Across") + num("rows", "Up") + num("px", "Pitch across") + num("py", "Pitch up")
    : p.t === "circle" ? num("n", "Count") + num("cx", "Centre X") + num("cy", "Centre Y") : num("n", "Count") + num("pitch", "Pitch") + num("ang", "Angle °");
  return `<label title="Copies of this feature, kept as one row">Pattern<select data-ff="pt">${types.map(([v, l]) => `<option value="${v}"${t === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>${more}`;
}
// a Corners row that shapes the outline (plan 2.12): kind, size, which corners
function cornerEditor(f) {
  const size = f.kind === "chamfer" ? "Distance" : f.kind === "relief" ? "Circle Ø" : "Radius";
  const kinds = [["round", "Round"], ["chamfer", "Chamfer"], ["relief", "Relief cut (inside corners)"]];
  const at = Array.isArray(f.at) ? `<option value="picked" selected disabled>The ${f.at.length} picked corner${f.at.length === 1 ? "" : "s"}</option>` : "";
  return `<div class="feat-edit grid2"><label>Kind<select data-ff="kind">${kinds.map(([v, l]) => `<option value="${v}"${f.kind === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    ${field(f, "r", size)}${f.kind === "chamfer" ? field(f, "ang", "Angle °") : ""}
    <label>Which corners<select data-ff="at">${at}<option value="all"${f.at === "all" ? " selected" : ""}>All corners</option><option value="inside"${f.at === "inside" ? " selected" : ""}>All inside corners</option></select></label></div>`;
}
function editor(f, fr) {
  const k = FEATURE_KINDS[f.k];
  if (f.k === "corner" && f.at != null) return cornerEditor(f);
  const pos = f.k === "corner" ? "" : `${field(f, "x", fromCentre(f) ? "X from centre" : "X (by centre)", fr)}${field(f, "y", fromCentre(f) ? "Y from centre" : "Y (by centre)", fr)}
      <label title="Corner = the part's bottom-left corner; Centre = the middle of the part">Measured from<select data-ff="from"><option value="corner"${fromCentre(f) ? "" : " selected"}>Corner</option><option value="centre"${fromCentre(f) ? " selected" : ""}>Centre</option></select></label>`;
  const op = f.k === "corner" ? "" : `<label>How it's made<select data-ff="op">${featureOps(f).map(([v, l]) => `<option value="${v}"${(f.op || "cut") === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
  return `<div class="feat-edit grid2">${k.keys.map(([key, label]) => field(f, key, label, fr)).join("")}${pos}${op}${PATTERNABLE.has(f.k) ? patternFields(f) : ""}</div>`;
}
function rowHtml(f, fr, issues) {
  const k = FEATURE_KINDS[f.k], warn = issues.get(f.id), open = f.id === openId;
  const linked = f.link ? ` <span class="muted small feat-link" title="Mirrored copy: follows the original until you Unlink it">⇋</span>` : "";
  return `<li class="feat-row${open ? " open" : ""}${f.hide ? " off" : ""}" data-fid="${f.id}">
    <div class="feat-head">
      <button type="button" class="feat-open" data-fopen="${f.id}" aria-expanded="${open}"><span class="feat-ico" aria-hidden="true">${esc(k.icon)}</span><span class="feat-type">${esc(k.label)}</span><span class="feat-sum">${esc(featureSummary(f))}</span>${linked}</button>
      ${warn ? `<span class="feat-warn" role="img" aria-label="${esc(warn.join(" "))}" title="${esc(warn.join(" "))}">⚠</span>` : ""}
      <button type="button" class="feat-eye" aria-pressed="${!f.hide}" title="${f.hide ? "Hidden: not cut. Click to show" : "Shown. Click to hide (it won't be cut)"}" aria-label="${f.hide ? "Show" : "Hide"} ${esc(k.label)}">${f.hide ? "◌" : "👁"}</button>
      <button type="button" class="feat-more" aria-haspopup="menu" aria-label="More for ${esc(k.label)}" title="Duplicate, mirror, pattern, move, delete">⋯</button>
    </div>${open ? editor(f, fr) : ""}${open && warn ? `<p class="feat-why small">${esc(warn.join(" "))}${isHoleFeature(f) && warn.some((m) => /1\.5 × thickness/.test(m)) ? ` <button type="button" class="small" data-fdrill="${f.id}">Mark for drilling</button>` : ""}</p>` : ""}
  </li>`;
}

export function renderFeatureList() {
  const host = $("featPanel"); if (!host) return;
  syncFeatureSheet();
  const list = $("featList"), empty = host.querySelector(".feat-empty"), add = $("featAdd");
  const it = part();
  add.disabled = !it || !!it.lock;
  if (!it) { list.innerHTML = ""; empty.textContent = "Pick a part to see and add its features."; empty.hidden = false; closeMenus(); return; }
  const feats = it.feats || [], fr = frame(it);
  if (openId != null && !feats.some((f) => f.id === openId)) openId = null;
  const builtin = shapeHoleRows(it);
  const adopt = adoptableHoles(sketch, it), banner = host.querySelector(".feat-adopt");
  banner.hidden = !adopt.length;
  if (adopt.length) banner.querySelector("span").textContent = `${adopt.length} loose ${adopt.length === 1 ? "hole sits" : "holes sit"} inside this part.`;
  banner.querySelector("button").textContent = adopt.length === 1 ? "Put it into this part" : `Put ${adopt.length} loose holes into this part`;
  empty.hidden = feats.length > 0 || !!builtin; empty.textContent = "No features yet. + Add puts one in the middle of the part.";
  const issues = featureIssues(feats, fr.outline, thickness());
  const sig = feats.map((f) => `${f.id}:${f.k}:${f.id === openId}`).join(",") + "|" + builtin;
  // while typing in an open row keep the fields (and focus); only refresh summaries, ⚠ and the other values
  if (list.dataset.sig === sig && list.contains(document.activeElement)) {
    for (const f of feats) {
      const li = list.querySelector(`.feat-row[data-fid="${f.id}"]`); if (!li) continue;
      const fresh = document.createElement("template"); fresh.innerHTML = rowHtml(f, fr, issues).trim();
      const nf = fresh.content.firstElementChild;
      li.querySelector(".feat-sum").textContent = featureSummary(f);
      const oldW = li.querySelector(".feat-warn"), newW = nf.querySelector(".feat-warn");
      if (oldW) oldW.remove(); if (newW) li.querySelector(".feat-eye").before(newW);
      const oldWhy = li.querySelector(".feat-why"), newWhy = nf.querySelector(".feat-why");
      if (oldWhy) oldWhy.remove(); if (newWhy) li.append(newWhy);
      li.querySelectorAll(".feat-edit [data-ff]").forEach((inp) => {
        if (inp === document.activeElement) return;
        const n = nf.querySelector(`.feat-edit [data-ff="${inp.dataset.ff}"]`); if (n) inp.value = n.value;
      });
    }
    return;
  }
  if (sketch.featOpen !== openId) { sketch.featOpen = openId; sketch.draw(); }   // the open row's centre handle is filled
  list.dataset.sig = sig;
  list.innerHTML = builtin + feats.map((f) => rowHtml(f, fr, issues)).join("");
}

function closeMenus() {
  const m = $("featAddMenu"); if (m) m.classList.add("hidden"); if ($("featAdd")) $("featAdd").setAttribute("aria-expanded", "false");
  const r = $("featRowMenu"); if (r) r.classList.add("hidden"); menuFor = null;
}
function placeMenu(menu, btn) {
  const host = $("featPanel"), hb = host.getBoundingClientRect(), b = btn.getBoundingClientRect();
  menu.classList.remove("hidden");
  const mh = menu.offsetHeight, below = b.bottom - hb.top + 2;
  menu.style.top = `${Math.max(0, b.bottom + mh > innerHeight - 4 ? b.top - hb.top - mh - 2 : below)}px`;
  menu.style.right = `${Math.max(0, hb.right - b.right)}px`;
}

// one undoable change to the picked part's features
function change(fn) {
  const it = part(); if (!it) return false;
  if (it.lock) { toast("This part is locked. Unlock it to change its features.", true); return false; }
  const before = sketch.snapshot();
  it.feats = it.feats || [];
  const ok = fn(it, frame(it));
  if (ok === false) return false;
  if (!it.feats.length) delete it.feats;
  sketch.past.push(before); sketch.future = [];                 // same as sketch.remember(), taken before the change
  if (sketch.past.length > 150) { sketch.past.shift(); if (sketch.layoutBase) sketch.layoutBase--; }
  it._key = undefined;
  sketch.commit();
  renderFeatureList();
  return true;
}
const nextId = (it) => Math.max(0, ...(it.feats || []).map((f) => f.id)) + 1;

function addFeature(kind) {
  closeMenus();
  if (kind === "corner") {
    const it = part(); const have = it && "r" in it.p && (it.feats || []).find((f) => f.k === "corner" && f.at == null);
    if (have) { openId = have.id; renderFeatureList(); return; }
  }
  change((it, fr) => {
    const f = newFeature(kind, nextId(it), fr.W, fr.H);
    if (kind === "corner") {                            // a shape with a corner radius: the row sets it; any other outline: a Corners row (plan 2.12)
      if ("r" in it.p) f.r = Number(it.p.r) || 0;
      else { f.r = 5; f.kind = "round"; f.at = "all"; }
    }
    it.feats.push(f); openId = f.id;
  });
  focusFirst();
}
function focusFirst() {
  requestAnimationFrame(() => { const i = document.querySelector("#featList .feat-row.open .feat-edit [data-ff]"); if (i) i.focus({ preventScroll: false }); });
}

function setValue(fid, key, raw, inp) {
  const ok = change((it, fr) => {
    const f = it.feats.find((x) => x.id === fid); if (!f) return false;
    if (key === "from") { if (raw === "centre") f.from = "centre"; else delete f.from; return true; }
    let v = raw;
    if ((key === "x" || key === "y") && fromCentre(f)) { const n = Number(raw); if (!Number.isFinite(n)) return false; v = n + (key === "x" ? fr.W : fr.H) / 2; }
    if (!setFeatureValue(f, key, v, fr)) return false;
    if (f.k === "corner" && f.at == null && key === "r" && "r" in it.p) it.p.r = f.r;
    syncLinks(it.feats, f, fr.W);
    return true;
  });
  if (!ok && inp) { inp.classList.add("bad"); toast("That value can't be used here.", true); renderFeatureList(); }
  else if (inp) inp.classList.remove("bad");
}

// plan 2.16: loose hole items inside the part become its feature rows (one undo step)
function adoptLoose() {
  const it = part(); if (!it) return;
  const list = adoptableHoles(sketch, it); if (!list.length) return;
  const gone = new Set(list.map((x) => x.item.id));
  change((p) => {
    p.feats.push(...list.map((x) => x.feat));
    sketch.items = sketch.items.filter((o) => !gone.has(o.id));
  });
  toast(`${list.length} loose ${list.length === 1 ? "hole is" : "holes are"} now features of this part (Undo puts ${list.length === 1 ? "it" : "them"} back).`);
}

function act(fid, what) {
  closeMenus();
  if (what === "move") { openId = fid; renderFeatureList(); requestAnimationFrame(() => { const i = document.querySelector(`#featList .feat-row[data-fid="${fid}"] [data-ff="x"]`); if (i) { i.focus(); i.select && i.select(); } }); return; }
  change((it, fr) => {
    const i = it.feats.findIndex((x) => x.id === fid); if (i < 0) return false;
    const f = it.feats[i];
    if (what === "del") { it.feats.splice(i, 1); for (const x of it.feats) if (x.link === fid) delete x.link; if (openId === fid) openId = null; return true; }
    if (what === "unlink") { if (!f.link && !it.feats.some((x) => x.link === fid)) return false; delete f.link; for (const x of it.feats) if (x.link === fid) delete x.link; return true; }
    if (what === "dup") { const d = { ...f, id: nextId(it), x: exact(f.x + 10) }; delete d.link; it.feats.splice(i + 1, 0, d); openId = d.id; return true; }
    if (what === "mirror") {
      if (f.link) { toast("This is already a mirrored copy. Mirror the original, or Unlink this one first.", true); return false; }
      const m = { ...mirrored(f, fr.W), id: nextId(it), link: f.id }; delete m.hide; it.feats.splice(i + 1, 0, m); return true;
    }
    if (what === "pattern") {
      const p = patternOf(f, f.id, fr);
      if (!p) { toast("This feature can't be made into a pattern. Use Duplicate.", true); return false; }
      it.feats[i] = p; openId = f.id; return true;
    }
    return false;
  });
}

export function bindFeatureList() {
  const host = $("featPanel"); if (!host || host.dataset.bound) return;
  host.dataset.bound = "1";
  $("featAddMenu").innerHTML = ADD_ORDER.map(([k, l]) => `<button type="button" role="menuitem" data-fadd="${k}"><span aria-hidden="true">${esc(FEATURE_KINDS[k].icon)}</span> ${esc(l)}</button>`).join("");
  host.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#featAdd")) {
      const m = $("featAddMenu"), opening = m.classList.contains("hidden");
      closeMenus(); if (opening) { placeMenu(m, $("featAdd")); $("featAdd").setAttribute("aria-expanded", "true"); }
      return;
    }
    const a = t.closest("[data-fadd]"); if (a) { addFeature(a.dataset.fadd); return; }
    if (t.closest("#featAdopt")) { adoptLoose(); return; }
    const fa = t.closest("[data-fact]"); if (fa) { if (menuFor != null) act(menuFor, fa.dataset.fact); return; }
    const row = t.closest(".feat-row"); if (!row) return;
    const fid = Number(row.dataset.fid);
    if (t.closest(".feat-more")) {
      const m = $("featRowMenu"), same = menuFor === fid && !m.classList.contains("hidden");
      closeMenus(); if (same) return;
      const it = part(), f = it && (it.feats || []).find((x) => x.id === fid);
      m.querySelector('[data-fact="unlink"]').hidden = !(f && (f.link || it.feats.some((x) => x.link === fid)));
      m.querySelector('[data-fact="pattern"]').hidden = !(f && (f.k === "hole" || (PATTERNABLE.has(f.k) && !f.pat)));
      menuFor = fid; placeMenu(m, t.closest(".feat-more")); return;
    }
    if (t.closest("[data-fdrill]")) { setValue(fid, "op", "drill"); return; }     // r15 6.3: the small-hole alternative
    if (t.closest(".feat-eye")) { change((it) => { const f = it.feats.find((x) => x.id === fid); if (!f) return false; if (f.hide) delete f.hide; else f.hide = true; }); return; }
    if (t.closest(".feat-open")) { closeMenus(); openId = openId === fid ? null : fid; renderFeatureList(); if (openId != null) focusFirst(); }
  });
  host.addEventListener("change", (e) => {
    const inp = e.target.closest("[data-ff]"); if (!inp) return;
    const row = inp.closest(".feat-row"); if (!row) return;
    setValue(Number(row.dataset.fid), inp.dataset.ff, inp.value, inp);
  });
  host.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeMenus(); return; }
    const row = e.target.closest && e.target.closest(".feat-row");
    if (!row) return;
    const fid = Number(row.dataset.fid);
    // r15 2.15: Ctrl+D also works while typing in the open row (the typed value is applied first); Delete there still edits the text
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D") && e.target.matches("[data-ff]")) {
        e.preventDefault(); e.stopPropagation();
        e.target.dispatchEvent(new Event("change", { bubbles: true }));
        act(fid, "dup");
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); act(fid, "del"); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) { e.preventDefault(); e.stopPropagation(); act(fid, "dup"); }
  });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest || !e.target.closest("#featPanel")) closeMenus(); });
  renderFeatureList();
}

// ---------------------------------------------------------------- plan 2.16: offer loose holes once when a drawing is opened
// A small non-blocking bar over the Make canvas: "Put N loose holes into this part?" [No] [Yes]. Yes is one undo step.
// Yes or No is remembered for that drawing (this device), so it is never asked twice. Never shown while a job runs.
const NO_KEY = "plasma.looseOffer.done";
let offerKey = null;
const doneKeys = () => { try { const a = JSON.parse(localStorage.getItem(NO_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const markDone = (k) => { if (!k) return; try { const a = doneKeys().filter((x) => x !== k); a.push(k); localStorage.setItem(NO_KEY, JSON.stringify(a.slice(-200))); } catch (e) { /* private mode */ } };
const jobRunning = () => !!(S.job && S.job.running);
function looseByHost() {
  if (!sketch || sketch.layout) return [];
  return sketch.items.filter((h) => !sketch.isHole(h)).map((h) => ({ host: h, list: adoptableHoles(sketch, h) })).filter((x) => x.list.length);
}
function hideOffer() { const el = $("looseOffer"); if (el) el.classList.add("hidden"); offerKey = null; }
// key: the saved part's id, else a short hash of the drawing itself
export function drawingKey(p) {
  if (p && p.id) return "part:" + p.id;
  let h = 2166136261; const s = JSON.stringify((sketch && sketch.items) || []);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "drawing:" + (h >>> 0).toString(36);
}
// ---------------------------------------------------------------- phone: the same list as a bottom sheet (plan 2.18)
// "Features (N)" on the drawing opens #featSheet, which holds the very same #featPanel (moved in, moved back on close).
let panelHome = null;
const phoneMake = () => document.body.classList.contains("phone-ui") && document.body.dataset.screen === "make";
function syncFeatureSheet() {
  const btn = $("featSheetBtn"); if (!btn) return;
  const it = part(), on = !!it && phoneMake() && !jobRunning();
  btn.hidden = !on; btn.classList.toggle("hidden", !on);
  if (!on) { closeFeatureSheet(); return; }
  $("featSheetN").textContent = String((it.feats || []).length);
  const cv = $("preview"), r = cv && cv.getBoundingClientRect();
  if (r && r.width) { btn.style.left = `${Math.round(r.left + 8)}px`; btn.style.top = `${Math.round(r.top + 8)}px`; }
  if (!$("featSheet").hidden) $("featSheetTitle").textContent = it.name ? `Features · ${it.name}` : "Features";
}
export function openFeatureSheet() {
  const sheet = $("featSheet"), panel = $("featPanel"); if (!sheet || !panel || !part() || jobRunning()) return;
  if (!panelHome) { panelHome = document.createComment("featPanel home"); panel.parentNode.insertBefore(panelHome, panel); }
  $("featSheetBody").appendChild(panel);
  sheet.hidden = false; sheet.classList.remove("hidden");
  document.body.classList.add("feat-sheet-open");
  renderFeatureList();
  const c = $("featSheetClose"); if (c) c.focus({ preventScroll: true });
}
export function closeFeatureSheet() {
  const sheet = $("featSheet"); if (!sheet || sheet.hidden) return;
  closeMenus();
  const panel = $("featPanel");
  if (panel && panelHome && panelHome.parentNode) panelHome.parentNode.insertBefore(panel, panelHome);
  sheet.hidden = true; sheet.classList.add("hidden");
  document.body.classList.remove("feat-sheet-open");
}
export function bindFeatureSheet() {
  const btn = $("featSheetBtn"); if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", openFeatureSheet);
  $("featSheetClose").addEventListener("click", () => { closeFeatureSheet(); syncFeatureSheet(); });
  $("featSheet").addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.target.closest(".featmenu:not(.hidden)")) closeFeatureSheet(); });
  window.addEventListener("resize", syncFeatureSheet);
}

export function offerLooseHoles(key) {
  hideOffer();
  const el = $("looseOffer"); if (!el || !key || jobRunning() || doneKeys().includes(key)) return false;
  const groups = looseByHost(); const n = groups.reduce((s, g) => s + g.list.length, 0);
  if (!n) return false;
  $("looseText").textContent = groups.length === 1 ? `Put ${n} loose ${n === 1 ? "hole" : "holes"} into this part?` : `Put ${n} loose holes into their ${groups.length} parts?`;
  offerKey = key;
  el.classList.remove("hidden");
  placeOffer();
  return true;
}
function placeOffer() {                                   // top centre of the Make canvas, whatever the layout around it
  const el = $("looseOffer"), cv = $("preview"); if (!el || !cv || el.classList.contains("hidden")) return;
  const r = cv.getBoundingClientRect();
  el.style.top = `${Math.round(r.top + 8)}px`; el.style.left = `${Math.round(r.left + r.width / 2)}px`;
  el.style.maxWidth = `${Math.max(200, Math.round(r.width - 16))}px`;
}
function acceptOffer() {
  const key = offerKey; hideOffer(); markDone(key);
  if (jobRunning()) return;
  const groups = looseByHost(); if (!groups.length) return;
  sketch.remember();
  let n = 0; const gone = new Set();
  for (const { host, list } of groups) {
    if (host.lock) continue;
    host.feats = [...(host.feats || []), ...list.map((x) => x.feat)]; host._key = undefined;
    for (const x of list) gone.add(x.item.id);
    n += list.length;
  }
  sketch.items = sketch.items.filter((o) => !gone.has(o.id));
  sketch.commit(); sketch.onSelect && sketch.onSelect();
  toast(`${n} loose ${n === 1 ? "hole is" : "holes are"} now features of ${groups.length === 1 ? "the part" : "their parts"} (Undo puts them back).`);
}
export function bindLooseOffer() {
  const el = $("looseOffer"); if (!el || el.dataset.bound) return;
  el.dataset.bound = "1";
  $("looseYes").addEventListener("click", acceptOffer);
  $("looseNo").addEventListener("click", () => { markDone(offerKey); hideOffer(); });
  addEventListener("resize", placeOffer);
}

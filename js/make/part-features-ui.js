// r15 Round 2: the Features list in the inspector's Features tab (the old Holes tab, id data-insp="holes").
// One row per feature: icon, type, summary, ⚠ when a live check fails, eye (show / hide) and ⋯ (Duplicate, Mirror,
// Pattern, Move, Unlink, Delete). Clicking a row opens it in place for typing. Every edit is one undo step.
// The model lives in part-features.js; the sketch flattens features to plain contours before anything is cut.
import { $, esc, toast } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { CUTOUT_SHAPES, FEATURE_KINDS, FEATURE_OPS, exact, featureIssues, featureSummary, mirrored, newFeature, patternOf, setFeatureValue, syncLinks } from "./part-features.js";

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
  if (key === "shape") return `<label>${esc(label)}<select data-ff="shape">${CUTOUT_SHAPES.map((s) => `<option value="${s}"${f.shape === s ? " selected" : ""}>${s}</option>`).join("")}</select></label>`;
  if (key === "text") return `<label class="wide2">${esc(label)}<input type="text" data-ff="text" maxlength="80" value="${esc(f.text)}"></label>`;
  const v = key === "x" ? shownXY(f, fr)[0] : key === "y" ? shownXY(f, fr)[1] : f[key];
  return `<label>${esc(label)}<input type="number" step="any" inputmode="decimal" data-ff="${key}" value="${esc(String(v))}"></label>`;
}
function editor(f, fr) {
  const k = FEATURE_KINDS[f.k];
  const pos = f.k === "corner" ? "" : `${field(f, "x", fromCentre(f) ? "X from centre" : "X (by centre)", fr)}${field(f, "y", fromCentre(f) ? "Y from centre" : "Y (by centre)", fr)}
      <label title="Corner = the part's bottom-left corner; Centre = the middle of the part">Measured from<select data-ff="from"><option value="corner"${fromCentre(f) ? "" : " selected"}>Corner</option><option value="centre"${fromCentre(f) ? " selected" : ""}>Centre</option></select></label>`;
  const op = f.k === "corner" ? "" : `<label>How it's made<select data-ff="op">${FEATURE_OPS.map(([v, l]) => `<option value="${v}"${(f.op || "cut") === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
  return `<div class="feat-edit grid2">${k.keys.map(([key, label]) => field(f, key, label, fr)).join("")}${pos}${op}</div>`;
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
    </div>${open ? editor(f, fr) : ""}${open && warn ? `<p class="feat-why small">${esc(warn.join(" "))}</p>` : ""}
  </li>`;
}

export function renderFeatureList() {
  const host = $("featPanel"); if (!host) return;
  const list = $("featList"), empty = host.querySelector(".feat-empty"), add = $("featAdd");
  const it = part();
  add.disabled = !it || !!it.lock;
  if (!it) { list.innerHTML = ""; empty.textContent = "Pick a part to see and add its features."; empty.hidden = false; closeMenus(); return; }
  const feats = it.feats || [], fr = frame(it);
  if (openId != null && !feats.some((f) => f.id === openId)) openId = null;
  const builtin = shapeHoleRows(it);
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
    const it = part(); const have = it && (it.feats || []).find((f) => f.k === "corner");
    if (have) { openId = have.id; renderFeatureList(); return; }
    if (it && !("r" in it.p)) { toast("This outline has no corner radius to set. Use Edit corner on the Part tab.", true); return; }
  }
  change((it, fr) => {
    const f = newFeature(kind, nextId(it), fr.W, fr.H);
    if (kind === "corner") f.r = Number(it.p.r) || 0;
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
    if (!setFeatureValue(f, key, v)) return false;
    if (f.k === "corner" && key === "r" && "r" in it.p) it.p.r = f.r;
    syncLinks(it.feats, f, fr.W);
    return true;
  });
  if (!ok && inp) { inp.classList.add("bad"); toast("That value can't be used here.", true); renderFeatureList(); }
  else if (inp) inp.classList.remove("bad");
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
      const p = patternOf(f, f.id);
      if (!p) { toast("Pattern turns a single hole into a row of holes. For other features use Duplicate.", true); return false; }
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
    const fa = t.closest("[data-fact]"); if (fa) { if (menuFor != null) act(menuFor, fa.dataset.fact); return; }
    const row = t.closest(".feat-row"); if (!row) return;
    const fid = Number(row.dataset.fid);
    if (t.closest(".feat-more")) {
      const m = $("featRowMenu"), same = menuFor === fid && !m.classList.contains("hidden");
      closeMenus(); if (same) return;
      const it = part(), f = it && (it.feats || []).find((x) => x.id === fid);
      m.querySelector('[data-fact="unlink"]').hidden = !(f && (f.link || it.feats.some((x) => x.link === fid)));
      m.querySelector('[data-fact="pattern"]').hidden = !(f && f.k === "hole");
      menuFor = fid; placeMenu(m, t.closest(".feat-more")); return;
    }
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
    if (!row || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    const fid = Number(row.dataset.fid);
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); act(fid, "del"); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) { e.preventDefault(); e.stopPropagation(); act(fid, "dup"); }
  });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest || !e.target.closest("#featPanel")) closeMenus(); });
  renderFeatureList();
}

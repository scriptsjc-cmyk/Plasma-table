// Material, thickness, cut settings, speed and the saved-speed memory (step: material).
import { matchPreset, refreshPublishedPresets } from "../machine/settings.js";
import { S } from "../core/state.js";
import { $, esc, toast } from "../core/dom.js";
import { cmd } from "../machine/access.js";
import { loadJob } from "../core/hooks.js";

const MAT_TIPS = {
  "Mild steel": "Mild steel: the easiest to get right. Start at the recommended speed and adjust 10% at a time.",
  "Stainless steel": "Stainless: cuts about 20% slower than mild steel. A dark edge is normal with air plasma.",
  "Aluminium": "Aluminium: keep the speed up and the amps high – going slow makes a messy, melted edge. Never cut over water.",
};
function chartPresetOptions() {
  const out = [];
  for (const m of (S.chart && S.chart.materials) || []) {
    for (const r of m.rows || []) {
      out.push({
        id: m.name + "|" + r.thickness_mm,
        label: m.name + " " + r.thickness_mm + " mm",
        material: m.name, thickness_mm: r.thickness_mm,
        cut_speed_mm_min: r.feed_mm_min, pierce_delay_s: r.pierce_delay_s,
        pierce_height_mm: r.pierce_height_mm, cut_height_mm: r.cut_height_mm, kerf_mm: r.kerf_mm,
      });
    }
  }
  return out;
}
export function renderMatPreset(extra) {
  const sel = $("matPreset"); if (!sel) return;
  const opts = chartPresetOptions();
  for (const p of extra || []) {
    const id = (p.id || (p.material + "|" + p.thickness_mm));
    if (!opts.some((x) => x.material === p.material && Number(x.thickness_mm) === Number(p.thickness_mm))) {
      opts.push({ id, label: (p.name || p.material || "Preset") + " " + p.thickness_mm + " mm", ...p });
    }
  }
  const cur = String(S.material) + "|" + String(S.thickness);
  sel.innerHTML = opts.map((p) => {
    const id = p.id || (p.material + "|" + p.thickness_mm);
    const selc = p.material === S.material && Number(p.thickness_mm) === Number(S.thickness) ? " selected" : "";
    return `<option value="${esc(id)}"${selc}>${esc(p.label || id)}</option>`;
  }).join("");
  if (!opts.some((p) => p.material === S.material && Number(p.thickness_mm) === Number(S.thickness)) && cur) {
    sel.insertAdjacentHTML("afterbegin", `<option value="${esc(cur)}" selected>${esc(S.material + " " + S.thickness + " mm")}</option>`);
  }
  if (!extra) refreshPublishedPresets().then((rows) => { if (Array.isArray(rows) && rows.length) renderMatPreset(rows); }).catch(() => {});   // (only when not already given the rows: otherwise it re-asks forever and freezes the page once a local preset exists)
}
function applyMatPreset(id) {
  const all = chartPresetOptions();
  let p = all.find((x) => x.id === id || (x.material + "|" + x.thickness_mm) === id);
  if (!p) {
    const [mat, th] = String(id).split("|");
    p = { material: mat, thickness_mm: Number(th) };
  }
  applyPresetRow(p);
}
// ------------------------------------------------------------------ step 2: material
function material() { return S.chart.materials.find((m) => m.name === S.material) || S.chart.materials[0]; }
export function row() { return material().rows.find((r) => r.thickness_mm === S.thickness) || material().rows[0]; }
export function renderMaterials() {
  $("materials").innerHTML = S.chart.materials.map((m) =>
    `<button data-mat="${esc(m.name)}" class="${m.name === S.material ? "sel" : ""}">${esc(m.name)}</button>`).join("");
  const mat = material();
  if (!mat.rows.some((r) => r.thickness_mm === S.thickness)) { S.thickness = mat.rows[0].thickness_mm; defaultSpeed(); }
  $("thicknesses").innerHTML = mat.rows.map((r) =>
    `<button data-th="${r.thickness_mm}" class="${r.thickness_mm === S.thickness ? "sel" : ""}">${r.thickness_mm} mm</button>`).join("");
  const r = row(), o = overrides();
  const ph = o.pierce_height_mm || (r.pierce_height_mm ?? S.chart.pierce_height_mm);
  const ch = o.cut_height_mm || (r.cut_height_mm ?? S.chart.cut_height_mm);
  const auto = (v) => `Auto (${v})`;
  $("ovDelay").placeholder = auto(r.pierce_delay_s);
  $("ovKerf").placeholder = auto(r.kerf_mm ?? S.chart.kerf_mm ?? 1.5); $("ovLead").placeholder = auto(r.lead_in_mm ?? S.chart.lead_in_mm ?? 3);
  $("ovPierce").placeholder = auto(r.pierce_height_mm ?? S.chart.pierce_height_mm); $("ovCut").placeholder = auto(r.cut_height_mm ?? S.chart.cut_height_mm);
  const kerf = o.kerf_mm || (r.kerf_mm ?? S.chart.kerf_mm ?? 1.5);
  const feed = S.speed || r.feed_mm_min;
  const delay = o.pierce_delay_s || r.pierce_delay_s;
  const maxT = r.max_cuttable_mm || material().max_cuttable_mm || S.chart.max_cuttable_mm;
  const est = (src) => /estimate|interpolated|user-reported/i.test(src || "") ? ' <span class="est">(estimate)</span>' : "";
  $("ampsCard").innerHTML = `
    <div>Set the plasma to</div>
    <div class="big">${ampsNow()} A</div>
    <dl class="ampsdl">
      <div><dt>Cut speed</dt><dd>${esc(String(feed))} mm/min${est(r.feed_source)}</dd></div>
      <div><dt>Pierce</dt><dd>${esc(String(delay))} s at ${esc(String(ph))} mm${est(r.pierce_delay_source || r.pierce_height_source)}</dd></div>
      <div><dt>Cut height</dt><dd>${esc(String(ch))} mm${est(r.cut_height_source)}</dd></div>
      <div><dt>Kerf</dt><dd>${esc(String(kerf))} mm${est(r.kerf_source)}</dd></div>
      <div><dt>Air</dt><dd>${esc(String(r.air_bar ?? S.chart.air_bar))} bar</dd></div>
      ${maxT ? `<div><dt>Max cuttable</dt><dd>${esc(String(maxT))} mm on this 60 A / P-80</dd></div>` : ""}
    </dl>
    <p class="ampssrc muted small">Starting points from the PrimeWeld CUT60 chart (a close 60 A equivalent) and P-80 pierce-height notes. Values marked estimate are not in those charts — test on scrap.</p>
    ${r.note ? `<div class="ampsnote">⚠ ${esc(r.note)}</div>` : ""}`;
  try { localStorage.setItem("plasma.material", JSON.stringify({ m: S.material, t: S.thickness })); } catch (e) { /* ignore */ }
  renderSpeed();
  renderMatPreset();
}
export function overrides() {
  const v = (id) => $(id).value.trim();
  return { feed_mm_min: S.speed || "", pierce_delay_s: v("ovDelay"), pierce_height_mm: v("ovPierce"), cut_height_mm: v("ovCut") };
}
// ------------------------------------------------------------------ cut speed (recommended, saved, chosen)
const speedKey = () => `${S.material}|${S.thickness}`;
// amps to set on the plasma: the cut chart row, unless a saved cut-chart entry (e.g. from a cut-test coupon) says otherwise
export function ampsNow() { const p = matchPreset(S.material, S.thickness); return (p && Number(p.amps) > 0 ? Number(p.amps) : row().amps); }
function savedSpeeds() { try { return JSON.parse(localStorage.getItem("plasma.speeds") || "{}"); } catch (e) { return {}; } }
function savedSpeed() { return savedSpeeds()[speedKey()] || null; }
export function saveSpeed(v) {
  try { const all = savedSpeeds(); all[speedKey()] = v; localStorage.setItem("plasma.speeds", JSON.stringify(all)); } catch (e) { /* ignore */ }
}
export function defaultSpeed() { S.speed = savedSpeed() || row().feed_mm_min; }
export function applyMatchingPreset() {
  try {
    const p = matchPreset(S.material, S.thickness);
    if (!p) return;
    if (!savedSpeed() && p.cut_speed_mm_min) S.speed = Number(p.cut_speed_mm_min) || S.speed;
    const set = (id, v) => { const el = $(id); if (el && v != null && v !== "") el.value = String(v); };
    set("ovDelay", p.pierce_delay_s);
    set("ovPierce", p.pierce_height_mm);
    set("ovCut", p.cut_height_mm);
    set("ovKerf", p.kerf_mm);
    if (p.feed_mm_min && !savedSpeed()) S.speed = Number(p.feed_mm_min) || S.speed;
  } catch (e) { /* ignore */ }
}
export function applyPresetRow(p) {
  if (!p) return;
  if (p.material) S.material = p.material;
  if (p.thickness_mm != null) S.thickness = Number(p.thickness_mm);
  if (p.cut_speed_mm_min) S.speed = Number(p.cut_speed_mm_min);
  else if (p.feed_mm_min) S.speed = Number(p.feed_mm_min);
  const set = (id, v) => { const el = $(id); if (el && v != null && v !== "") el.value = String(v); };
  set("ovDelay", p.pierce_delay_s);
  set("ovPierce", p.pierce_height_mm);
  set("ovCut", p.cut_height_mm);
  set("ovKerf", p.kerf_mm);
  renderMaterials();
  loadJob();
}
function speedStep(rec) { return rec < 1000 ? 25 : 50; }
function renderSpeed() {
  const rec = row().feed_mm_min, lo = Math.round(rec * 0.85 / 10) * 10, hi = Math.round(rec * 1.15 / 10) * 10;
  const sl = $("spSlider");
  sl.min = Math.round(rec * 0.5 / 10) * 10; sl.max = Math.round(rec * 1.5 / 10) * 10; sl.step = 10; sl.value = S.speed;
  const pct = (x) => ((x - sl.min) / (sl.max - sl.min)) * 100;
  sl.style.background = `linear-gradient(90deg, #2a3038 ${pct(lo)}%, #14532d ${pct(lo)}%, #14532d ${pct(hi)}%, #2a3038 ${pct(hi)}%)`;
  sl.style.borderRadius = "8px";
  $("spVal").textContent = S.speed;
  $("spRange").textContent = `good: ${lo}–${hi}`;
  const mine = savedSpeed();
  let note = `Recommended for ${S.material.toLowerCase()} ${S.thickness} mm: <b>${rec}</b> mm/min.`;
  if (mine && mine === S.speed) note += " Using <b>your saved speed</b>.";
  const off = S.speed < rec * 0.75 || S.speed > rec * 1.25;
  if (off) note += " That's a long way from normal – test on scrap first.";
  $("spNote").innerHTML = note;
  $("spNote").className = "spnote" + (off ? " warn" : "");
  $("matTip").textContent = MAT_TIPS[S.material] || "";
}
export function setSpeed(v) {
  const sl = $("spSlider");
  S.speed = Math.max(Number(sl.min), Math.min(Number(sl.max), Math.round(v / 10) * 10));
  renderSpeed();
  loadJob();
}
export function bindMaterial() {
  if ($("matPreset")) $("matPreset").onchange = () => applyMatPreset($("matPreset").value);
  // step 2
  $("materials").onclick = (e) => {
    const b = e.target.closest("[data-mat]");
    if (b) { S.material = b.dataset.mat; if (!material().rows.some((r) => r.thickness_mm === S.thickness)) S.thickness = material().rows[0].thickness_mm; defaultSpeed(); applyMatchingPreset(); renderMaterials(); loadJob(); }
  };
  $("thicknesses").onclick = (e) => { const b = e.target.closest("[data-th]"); if (b) { S.thickness = Number(b.dataset.th); defaultSpeed(); applyMatchingPreset(); renderMaterials(); loadJob(); } };
  ["ovDelay", "ovPierce", "ovCut", "ovKerf", "ovLead", "dryRun"].forEach((id) => $(id).addEventListener("change", () => { renderMaterials(); loadJob(); }));
  $("dryRun").addEventListener("change", () => { if (!$("dryRun").checked && $("dryFirstNote")) $("dryFirstNote").classList.add("hidden"); });
  $("spDown").onclick = () => setSpeed(S.speed - speedStep(row().feed_mm_min));
  $("spUp").onclick = () => setSpeed(S.speed + speedStep(row().feed_mm_min));
  $("spSlider").addEventListener("input", () => { S.speed = Number($("spSlider").value); $("spVal").textContent = S.speed; });
  $("spSlider").addEventListener("change", () => setSpeed(Number($("spSlider").value)));
  $("spReset").onclick = () => setSpeed(row().feed_mm_min);
  $("lsDown").onclick = () => cmd("feed_override", { step: "-10" });
  $("lsUp").onclick = () => cmd("feed_override", { step: "+10" });
  $("btnSaveSpeed").onclick = () => {
    const v = Math.round((S.speed * S.lastFeedOv) / 100 / 10) * 10;
    saveSpeed(v); S.speed = v; S.lastFeedOv = 100; cmd("feed_override", { step: "reset" });
    $("btnSaveSpeed").classList.add("hidden");
    renderSpeed(); loadJob();
    toast(`Saved ${v} mm/min for ${S.material.toLowerCase()} ${S.thickness} mm ✓`);
  };
}

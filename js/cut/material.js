// Material, thickness, cut settings, speed and the saved-speed memory (step: material).
import { matchPreset, refreshPublishedPresets } from "../machine/settings.js";
import { S } from "../core/state.js";
import { $, esc, toast } from "../core/dom.js";
import { cmd } from "../machine/access.js";
import { loadJob } from "../core/hooks.js";
import { syncCutPrefsToAccount } from "../core/prefs.js";
import { setInfoText, markAllInfoFull } from "../ui/hovertip.js";
import { rowFor, capRow, cutStatus, dutyCheck, materialMax, profileOf, suppliesOf, supplyOf, supplyCap, ecoAdvised, parseThickness, DEFAULT_SUPPLY } from "./plasmaprofile.js";

const MAT_TIPS = {
  "Mild steel": "Mild steel: the easiest to get right. Start at the recommended speed and adjust 10% at a time.",
  "Stainless steel": "Stainless: cuts about 20% slower than mild steel. A dark edge is normal with air plasma.",
  "Aluminium": "Aluminium: keep the speed up and the amps high – going slow makes a messy, melted edge. Never cut over water.",
};
function tipFor() { const m = material(); return (m && m.tip) || MAT_TIPS[S.material] || ""; }
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
// r16 B: the row for any thickness (between rows too), with the amps the power supply can give
export function row() {
  const m = material();
  return capRow(S.chart, rowFor(m, S.thickness) || m.rows[m.rows.length - 1], supplyId());
}
// r16 B1: the power supply the plasma is plugged into (16 A blue plug unless the user says otherwise)
export function supplyId() { try { return localStorage.getItem("plasma.supply") || DEFAULT_SUPPLY; } catch (e) { return DEFAULT_SUPPLY; } }
export function setSupply(id) {
  try { localStorage.setItem("plasma.supply", id); } catch (e) { /* ignore */ }
  const s = supplyOf(S.chart, id);
  if (s && s.limited) supplyNotice(s);
  defaultSpeed(); renderMaterials(); loadJob();
}
export function supplyNoticeText(s) {
  const p = profileOf(S.chart) || {}, cap = supplyCap(S.chart, s.id), name = p.short || "plasma";
  return (s.v110
    ? `On 110 V your ${name} gives ${p.amps_max_110v || cap} A at most, and your transformer may limit it more (about ${cap} A here). Piercing stops at about ${p.pierce_max_mm_110v || 6} mm. Going over this will trip the transformer part-way through a cut.`
    : `On a 13 A plug your ${name} is limited to about ${cap} A. That's good for sheet up to about 3 mm mild steel (2 mm stainless or aluminium). For thicker metal use a 16 A blue plug or bigger. Going over this will trip your fuse or breaker part-way through a cut.`)
    + " Never run a plasma through an extension reel.";
}
function supplyNotice(s) {
  const box = $("supplyNotice");
  if (!box) { toast(supplyNoticeText(s)); return; }
  $("supplyNoticeText").textContent = supplyNoticeText(s);
  box.classList.remove("hidden"); floatUnderChips(box);
  const ok = $("supplyNoticeOk"); if (ok) ok.focus();
}
const MAIN_MATS = 3;   // r16 B2: the first three materials are buttons; the rest sit under "More…"
export function renderMaterials() {
  const mats = S.chart.materials, mat = material();
  const main = mats.slice(0, MAIN_MATS), more = mats.slice(MAIN_MATS);
  const moreSel = more.some((m) => m.name === S.material);
  $("materials").innerHTML = main.map((m) =>
    `<button data-mat="${esc(m.name)}" class="${m.name === S.material ? "sel" : ""}">${esc(m.name)}</button>`).join("") +
    (more.length ? `<select id="matMore" class="matmore${moreSel ? " sel" : ""}" aria-label="More materials"><option value="">More…</option>${more.map((m) =>
      `<option value="${esc(m.name)}"${m.name === S.material ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</select>` : "");
  const maxT = materialMax(mat);
  if (!(Number(S.thickness) > 0) || Number(S.thickness) > maxT) { S.thickness = mat.rows[0].thickness_mm; defaultSpeed(); }
  const sup = supplyId();
  const chipCls = (t) => {
    const k = cutStatus(S.chart, mat, t, sup).map((x) => x.kind);
    return k.includes("supply") || k.includes("edge") ? " limit" : k.includes("rough") ? " rough" : "";
  };
  const onRow = mat.rows.some((r) => r.thickness_mm === Number(S.thickness));
  $("thicknesses").innerHTML = mat.rows.map((r) =>
    `<button data-th="${r.thickness_mm}" class="${r.thickness_mm === Number(S.thickness) ? "sel" : ""}${chipCls(r.thickness_mm)}">${r.thickness_mm} mm</button>`).join("") +
    (onRow ? "" : `<button data-th="${Number(S.thickness)}" class="sel${chipCls(S.thickness)}">${Number(S.thickness)} mm</button>`) +
    `<button type="button" id="thOtherBtn" data-other="1" aria-label="Type another thickness">Other…</button>`;
  const r = row(), o = overrides(), prof = profileOf(S.chart) || {};
  const ph = o.pierce_height_mm || (r.pierce_height_mm ?? S.chart.pierce_height_mm);
  const ch = o.cut_height_mm || (r.cut_height_mm ?? S.chart.cut_height_mm);
  const auto = (v) => `Auto (${v})`;
  $("ovDelay").placeholder = auto(r.pierce_delay_s);
  $("ovKerf").placeholder = auto(r.kerf_mm ?? S.chart.kerf_mm ?? 1.5); $("ovLead").placeholder = auto(r.lead_in_mm ?? S.chart.lead_in_mm ?? 3);
  $("ovPierce").placeholder = auto(r.pierce_height_mm ?? S.chart.pierce_height_mm); $("ovCut").placeholder = auto(r.cut_height_mm ?? S.chart.cut_height_mm);
  const kerf = (Number.isFinite(Number(o.kerf_mm)) && Number(o.kerf_mm) >= 0) ? Number(o.kerf_mm) : (r.kerf_mm ?? S.chart.kerf_mm ?? 1.5);
  const delay = o.pierce_delay_s || r.pierce_delay_s;
  const est = (src) => /estimate|interpolated|user-reported/i.test(src || "") ? ' <span class="est">(estimate)</span>' : "";
  const psi = r.air_psi, bar = r.air_bar ?? S.chart.air_bar;
  const air = prof.air_unit_on_display === "psi" && psi ? `${psi} PSI <span class="muted">(${esc(String(bar))} bar)</span>` : `${esc(String(bar))} bar`;
  const amps = ampsNow(), s = supplyOf(S.chart, sup);
  const capNote = r.capped ? `<span class="capnote">${s && s.v110 ? "110 V" : esc(((s && (s.short || s.label)) || "").replace(/ plug$/, ""))} max</span>` : "";
  const ampsMore = `${S.chart.note || ""} Kerf ${kerf} mm. Values marked estimate are not in a published chart – test on scrap.`;
  const status = cutStatus(S.chart, mat, S.thickness, sup);
  const between = r.between ? `<div class="ampsnote small">Between the ${r.between[0]} and ${r.between[1]} mm settings: thicker setting's amps, a speed in between.</div>` : "";
  $("ampsCard").innerHTML = `
    <div>Set your ${esc(prof.short || "plasma")} to <button type="button" class="info-i srci" data-tip="${esc(ampsMore)}" aria-label="Where the cut settings come from"></button></div>
    <div class="big">${amps} A${capNote}</div>
    <dl class="ampsdl">
      <div><dt>Air</dt><dd>${air}</dd></div>
      ${r.nozzle_mm ? `<div><dt>Nozzle</dt><dd>${esc(Number(r.nozzle_mm).toFixed(1))} mm</dd></div>` : ""}
      ${prof.eco_mode ? `<div><dt>Mode</dt><dd>2T${ecoAdvised(S.chart, amps) ? ", ECO on" : ", ECO off"}</dd></div>` : ""}
      <div><dt>Pierce</dt><dd>${esc(String(delay))} s at ${esc(String(ph))} mm${est(r.pierce_delay_source || r.pierce_height_source)}</dd></div>
      <div><dt>Cut height</dt><dd>${esc(String(ch))} mm${est(r.cut_height_source)}</dd></div>
      <div><dt>Kerf</dt><dd>${esc(String(kerf))} mm${est(r.kerf_source)}</dd></div>
    </dl>
    <ul id="cutStatusList" class="cutstatus">${status.map((x) => `<li class="cs-${x.kind}">${x.kind === "ok" ? "✔" : x.kind === "over" ? "⛔" : "⚠"} ${esc(x.text)}</li>`).join("")}</ul>
    <p id="dutyLine" class="dutyline small"></p>
    ${between}
    <label class="supplyrow small">Plugged into
      <select id="supplySel" aria-label="Power supply">${suppliesOf(S.chart).map((x) => `<option value="${esc(x.id)}"${x.id === (s && s.id) ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
    </label>
    <p class="ampssrc muted small has-info"><span class="info-label">Where these numbers come from</span><button type="button" class="info-i" data-tip="${esc(ampsMore)}" aria-label="Where the cut settings come from"></button><span class="info-body"> ${esc(ampsMore)}</span></p>
    ${r.note ? `<div class="ampsnote">⚠ ${esc(r.note)}</div>` : ""}`;
  markAllInfoFull($("ampsCard"));   // r15 (checker N1): the kerf / air line re-words its tip, so a phone shows the tip only
  renderDuty();
  try { localStorage.setItem("plasma.material", JSON.stringify({ m: S.material, t: S.thickness })); } catch (e) { /* ignore */ }
  try { syncCutPrefsToAccount(); } catch (e) { /* ignore */ }
  renderSpeed();
  renderMatPreset();
}
// r16 B6: will the job's arc time fit the plasma's duty cycle at these amps? (worked out once the job is built)
export function renderDuty() {
  const el = $("dutyLine"); if (!el) return;
  const st = S.prepared && S.prepared.stats;
  const prof = profileOf(S.chart);
  if (!st || !prof || !(prof.duty || []).length || !(st.cut_length_mm > 0) || !(S.speed > 0)) { el.textContent = ""; el.className = "dutyline small"; return; }
  const amps = ampsNow(), arc = (st.cut_length_mm / S.speed) * 60;
  const d = dutyCheck(S.chart, amps, arc, st.estimated_seconds);
  const mins = (x) => x < 90 ? `${Math.max(1, Math.round(x))} s` : `${Math.round(x / 60)} min`;
  if (d.pct >= 100) { el.textContent = `Arc on for about ${mins(arc)} – fine at ${amps} A (it can run all day).`; el.className = "dutyline small ok"; return; }
  el.textContent = d.ok
    ? `Arc on for about ${mins(arc)} at ${amps} A. The ${prof.short || "plasma"} can do about ${mins(d.allowedSeconds)} in every 10 min at that setting – fine.`
    : `Arc on for about ${mins(d.busiestSeconds)} in 10 min at ${amps} A, but the ${prof.short || "plasma"} only manages about ${mins(d.allowedSeconds)} – it may stop to cool. ${d.safeAmps ? `At ${d.safeAmps} A it never stops (slower).` : ""}`;
  el.className = "dutyline small" + (d.ok ? " ok" : " warn");
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
  try { const all = savedSpeeds(); all[speedKey()] = v; localStorage.setItem("plasma.speeds", JSON.stringify(all)); syncCutPrefsToAccount(); } catch (e) { /* ignore */ }
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
  const sum = $("spValSum"); if (sum) sum.textContent = S.speed;
  $("spRange").textContent = `good: ${lo}–${hi}`;
  const mine = savedSpeed();
  let note = `Recommended for ${S.material.toLowerCase()} ${S.thickness} mm: <b>${rec}</b> mm/min.`;
  if (mine && mine === S.speed) note += " Using <b>your saved speed</b>.";
  const off = S.speed < rec * 0.75 || S.speed > rec * 1.25;
  if (off) note += " That's a long way from normal – test on scrap first.";
  const sp = $("spNote");
  if (sp) {
    const short = `Recommended: ${rec} mm/min`;
    const full = note.replace(/<[^>]+>/g, "");
    setInfoText(sp, short, full, "More about the recommended cut speed");
    sp.className = "spnote has-info" + (off ? " warn" : "");
    markAllInfoFull(sp.parentNode || document);   // className above reset .info-full
  }
  let warn = $("spWarn");
  if (!warn && $("speedBox")) {
    warn = document.createElement("p");
    warn.id = "spWarn";
    warn.className = "warntext small";
    $("speedBox").appendChild(warn);
  }
  if (warn) {
    warn.textContent = off ? "That's a long way from normal – test on scrap first." : "";
    warn.hidden = !off;
  }
  $("matTip").textContent = tipFor();
  const tipBtn = $("matTipInfo");
  if (tipBtn) {
    const tip = tipFor();
    tipBtn.dataset.tip = tip;
    tipBtn.classList.toggle("hidden", !tip);
  }
}
export function setSpeed(v) {
  const sl = $("spSlider");
  S.speed = Math.max(Number(sl.min), Math.min(Number(sl.max), Math.round(v / 10) * 10));
  renderSpeed();
  loadJob();
}

function syncSpeedBox() {
  const el = $("speedBox");
  if (!el || el.tagName !== "DETAILS") return;
  let laptop = false;
  try { laptop = window.matchMedia("(min-width: 1200px) and (min-height: 560px) and (hover: hover) and (pointer: fine)").matches; } catch (e) {}
  el.open = !laptop;
}
export function bindMaterial() {
  syncSpeedBox();
  try { window.matchMedia("(min-width: 1200px) and (min-height: 560px) and (hover: hover) and (pointer: fine)").addEventListener("change", syncSpeedBox); } catch (e) {}

  if ($("matPreset")) $("matPreset").onchange = () => applyMatPreset($("matPreset").value);
  // step 2
  const pickMat = (name) => {
    S.material = name;
    const m = material();
    if (!(Number(S.thickness) <= materialMax(m)) || !rowFor(m, S.thickness)) S.thickness = m.rows[0].thickness_mm;
    defaultSpeed(); applyMatchingPreset(); renderMaterials(); loadJob();
  };
  $("materials").onclick = (e) => { const b = e.target.closest("[data-mat]"); if (b) pickMat(b.dataset.mat); };
  $("materials").addEventListener("change", (e) => { if (e.target.id === "matMore" && e.target.value) pickMat(e.target.value); });
  $("thicknesses").onclick = (e) => {
    if (e.target.closest("[data-other]")) { openThOther(); return; }
    const b = e.target.closest("[data-th]"); if (b) setThickness(Number(b.dataset.th));
  };
  if ($("thOtherOk")) $("thOtherOk").onclick = applyThOther;
  if ($("thOther")) $("thOther").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyThOther(); } if (e.key === "Escape") closeThOther(); });
  if ($("thOtherCancel")) $("thOtherCancel").onclick = closeThOther;
  $("ampsCard").addEventListener("change", (e) => { if (e.target.id === "supplySel") setSupply(e.target.value); });
  if ($("supplyNoticeOk")) $("supplyNoticeOk").onclick = () => $("supplyNotice").classList.add("hidden");
  const spQ = $("spQuality");
  if (spQ) spQ.onclick = (e) => { const b = e.target.closest("[data-q]"); if (b) setSpeed(Math.round(row().feed_mm_min * Number(b.dataset.q) / 10) * 10); };
  ["ovDelay", "ovPierce", "ovCut", "ovKerf", "ovLead", "dryRun", "penRun"].forEach((id) => $(id).addEventListener("change", () => { renderMaterials(); loadJob(); }));
  // r18: the Marker pen switch sits inside More cut options, so its summary says when the pen is on
  $("penRun").addEventListener("change", () => { const tag = $("penOnTag"); if (tag) tag.classList.toggle("hidden", !$("penRun").checked); });
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

// the "Other…" box and the supply notice float just under the thickness buttons, over the settings card (never pushing it under Next)
function floatUnderChips(el) {
  try { const th = $("thicknesses"); el.style.top = (th.offsetTop + th.offsetHeight + 4) + "px"; } catch (e) { /* ignore */ }
}
// r16 B4: any thickness, typed in mm, inches (3/16", 0.125in) or UK sheet gauge (16 swg)
export function setThickness(t) {
  S.thickness = Number(t); defaultSpeed(); applyMatchingPreset(); renderMaterials(); loadJob();
}
function openThOther() {
  const row = $("thOtherRow"); if (!row) return;
  row.classList.remove("hidden"); floatUnderChips(row); $("thOtherMsg").textContent = "";
  $("thOther").value = ""; $("thOther").focus();
}
function closeThOther() { const row = $("thOtherRow"); if (row) row.classList.add("hidden"); }
export function applyThOther() {
  const v = parseThickness($("thOther").value), m = material(), max = materialMax(m), msg = $("thOtherMsg");
  if (v == null) { msg.textContent = "Type a thickness, for example 2.5, 3/16\" or 16 swg."; return false; }
  if (v > max) { msg.textContent = `Over ${max} mm is beyond this plasma for ${m.name.toLowerCase()} – use a saw or waterjet.`; return false; }
  if (v < 0.5) { msg.textContent = "Thinner than 0.5 mm is too thin to plasma cut cleanly."; return false; }
  closeThOther(); setThickness(v); return true;
}

// r16 B2: moving on with a thickness over the power supply's limit asks once (per material, thickness and supply).
const askedSupply = new Set();
function supplyIssue() {
  try {
    const st = cutStatus(S.chart, material(), S.thickness, supplyId()).find((x) => x.kind === "supply");
    return st && !askedSupply.has(`${S.material}|${S.thickness}|${supplyId()}`) ? st : null;
  } catch (e) { return null; }
}
export function supplyNeedsAsk() { return !!supplyIssue(); }
export async function supplyOkToGo() {
  try {
    const st = supplyIssue();
    if (!st) return true;
    const key = `${S.material}|${S.thickness}|${supplyId()}`;
    const { askConfirm } = await import("../core/safeprompt.js");
    const ok = await askConfirm({ title: "Over your power supply's limit", body: `${st.text} It may trip your supply part-way through the cut.`, ok: "Cut anyway", cancel: "Change thickness" });
    if (ok) askedSupply.add(key);
    return !!ok;
  } catch (e) { return true; }
}

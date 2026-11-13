// Cutting-screen extras (round 5, items 35-37): live torch/arc panel with lost-arc resume, saved work origins + 9-point job origin,
// cut-test coupon + pierce counter. The logic is in cutlive.js / origins.js / coupon.js; this file only wires it to the page.
// Nothing here moves the machine or fires the torch by itself: every action goes through the app's own commands (cmd / startJob), so the
// E-stop latch, work-zero rule, torch confirm and pre-flight checklist all still apply.
import { ArcWatch, liveView, cutNumber, NOT_CONNECTED } from "./cutlive.js";
import { ANCHORS, anchorById, anchorShift, shiftGcode as shiftGcodeText, loadOrigins, saveOrigin, deleteOrigin } from "./origins.js";
import { couponContours, couponHole, couponPresetRow, RESULTS, COUPON, PierceCounter } from "./coupon.js";
import { upsertLocalPreset } from "../machine/settings.js";

const $ = (id) => document.getElementById(id);
let H = null, watch = new ArcWatch(), pierces = null, lastJobObj = null;

export { ANCHORS, NOT_CONNECTED };

// ================================================================ 35. live panel
const paintCell = (id, v) => { const el = $(id); if (!el) return; const b = el.querySelector("b"); b.textContent = v.text; el.className = "lp " + (v.cls || ""); };
export function paintLive() {
  if (!$("livePanel")) return;
  const M = H.M(), S = H.S, st = S.status || {};
  const connected = !!(S.connected && M && M.grbl && st.state !== "Disconnected");
  const v = liveView(watch, st, { connected, demo: !!S.demo, switchOffset: H.cfg() && H.cfg().probe ? H.cfg().probe.switch_offset_mm : NaN });
  paintCell("lpArc", v.arc); paintCell("lpVolts", v.volts); paintCell("lpZ", v.height);
  const tot = S.prepared && S.prepared.stats ? S.prepared.stats.pierces : 0;
  const job = pierces ? pierces.job : 0, life = pierces ? pierces.lifetime : 0;
  $("lpPierce").querySelector("b").textContent = `${job}${tot ? " of " + tot : ""} this job · ${life.toLocaleString("en-GB")} total`;
  $("lpPierce").title = S.demo ? "Practice runs are counted for this job only, never in the total." : "Lifetime total of arc starts on this machine, kept in this browser.";
  const anyNC = [v.arc, v.volts, v.height].some((c) => c.text === NOT_CONNECTED);
  const note = connected ? v.note : "Connect the table to see live readings.";
  $("lpNote").textContent = anyNC ? note : "";            // the explanation only takes room while something is "not connected"
  $("livePanel").title = note;
  paintLost();
}
function paintLost() {
  const box = $("lostArc"); if (!box) return;
  const L = watch.lost, M = H.M();
  box.classList.toggle("hidden", !L);
  if (!L) return;
  const n = L.cut || 1, running = !!(M && M.jobRunning());
  $("lostArcHead").textContent = `Arc lost during cut ${n}.`;
  $("lostArcText").textContent = running
    ? `${L.reason} Press STOP (or the space bar) now if the machine hasn't stopped. Nothing restarts by itself.`
    : `${L.reason} The job has stopped. You can carry on from cut ${n}: you will set the start point again and confirm, and the torch only fires when you press Start.`;
  const b = $("btnLostResume");
  b.textContent = `Continue from cut ${n}…`;
  b.disabled = running; b.setAttribute("aria-disabled", running ? "true" : "false");
  b.title = running ? "Stop the job first (STOP or space bar)." : "";
}
function onMachineEvent(kind, d) {
  const M = H.M(), S = H.S;
  if (kind === "status") {
    if (d.state === "Disconnected") { watch.reset(); }
    const running = !!(M && M.jobRunning());
    const jobObj = M && M.grbl ? M.grbl.job : null;
    if (running && jobObj !== lastJobObj) { lastJobObj = jobObj; watch.clear(); hideCouponResult(); }
    const total = S.prepared && S.prepared.stats ? S.prepared.stats.pierces : 0;
    watch.update(d, Date.now(), running, cutNumber(M.runFrom, S.run ? S.run.ons : 0, total));
    pierces.feed(d, { running, demo: !!S.demo, jobRef: jobObj });
    paintLive();
  } else if (kind === "log") {
    const total = S.prepared && S.prepared.stats ? S.prepared.stats.pierces : 0;
    if (watch.noteMessage(d.text, Date.now(), cutNumber(M.runFrom, S.run ? S.run.ons : 0, total))) paintLost();
  } else if (kind === "probe") { watch.noteProbe(d.text); }
  else if (kind === "safety") { paintSaved(); }
  else if (kind === "job") { paintLive(); if (!d.running) maybeAskCouponResult(d); }
}
function bindLive() {
  $("btnLostResume").onclick = async () => {
    const M = H.M(); if (M.jobRunning()) { H.toast("Stop the job first (STOP or the space bar).", true); return; }
    const n = (watch.lost && watch.lost.cut) || 1;
    if (!(await H.confirm(`The arc was lost during cut ${n}.\n\nGo on from cut ${n}? You will check the sheet, set the start point again and tick the checklist first. The torch only fires when you press Start. Nothing starts now.`))) return;
    // the same road as "Continue from cut N" after any stop: work zero is NOT kept unless the machine still knows where it is,
    // Start asks its confirm box, the checklist and every start check apply, and nothing fires until Start is pressed
    H.continueFromCut(n);
  };
}

// ================================================================ 36. work origins + 9-point job origin
let origin9 = null, origin9For = "";
export const originActive = () => !!origin9 && origin9For === H.S.fileName;
export function originId() { return originActive() ? origin9 : null; }
// bounds = the job's cutting bounds BEFORE the shift. Returns [dx, dy] or null when the default origin is in use.
export function jobOriginShift(bounds) {
  if (!originActive() || !bounds) return null;
  const s = anchorShift(bounds, origin9);
  return Math.abs(s[0]) < 1e-9 && Math.abs(s[1]) < 1e-9 ? null : s;
}
export const shiftGcode = (text, dx, dy) => shiftGcodeText(text, dx, dy).text;
export const shiftOutline = (outline, s) => (s && outline ? outline.map((p) => p.map(([x, y]) => [Math.round((x + s[0]) * 100) / 100, Math.round((y + s[1]) * 100) / 100])) : outline);

function setOrigin9(id) {
  const M = H.M(), S = H.S;
  if (M && M.jobRunning()) { H.toast("Not while a job is running.", true); return; }
  const next = originActive() && origin9 === id ? null : id;
  const before = originId();
  origin9 = next; origin9For = S.fileName;
  if (before === next) return;
  // The start point would now mean something else, so the confirmed work zero is dropped: Start here is needed again.
  const hadZero = !!(M && M.grbl && M.zeroConfirmed);
  if (M) M.zeroConfirmed = false;
  H.loadJob(); H.refresh(); paintOrigin();
  const a = next ? anchorById(next) : null;
  H.toast(next
    ? `Job origin: ${a.label.toLowerCase()} of the job goes at the start point.${hadZero ? " Start point cleared: move the torch there and press Start here again." : ""}`
    : `Job origin back to the default.${hadZero ? " Start point cleared: press Start here again." : ""}`, hadZero);
}
export function paintOrigin() {
  if (!$("origin9")) return;
  const cur = originId();
  for (const b of $("origin9").querySelectorAll("button")) { const on = b.dataset.anchor === cur; b.classList.toggle("sel", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }
  const a = cur ? anchorById(cur) : null;
  $("originNow").textContent = a ? `${a.label} of the job is at the start point.` : "Default: the job's bottom-left corner (or the sheet's corner) is at the start point.";
  const help = $("originHelp"); if (help) { help.classList.toggle("hidden", !a); help.innerHTML = a ? `Move the torch over the <b>${a.label.toLowerCase()}</b> of the job, then press <b>Start here</b>.` : ""; }
  $("originDefault").classList.toggle("hidden", !a);
  paintSaved();
}
const originStore = () => { try { return window.localStorage; } catch (e) { return null; } };
function paintSaved() {
  const ul = $("woList"); if (!ul) return;
  const list = loadOrigins(originStore() || undefined);
  const M = H.M(), S = H.S, can = !!(S.connected && M && M.grbl && S.safety && S.safety.referenced);
  ul.innerHTML = list.length ? list.map((o) => `<li data-id="${H.esc(o.id)}"><span class="woname"><b>${H.esc(o.name)}</b> <span class="muted small">X ${o.x} · Y ${o.y} mm from the home corner</span></span>
    <button type="button" class="small" data-wo="recall" ${can ? "" : 'aria-disabled="true"'} title="${can ? "Set the start point here (the torch does not move)" : "Connect and Home first"}">Use</button>
    <button type="button" class="small danger" data-wo="del" aria-label="Delete ${H.esc(o.name)}">Delete</button></li>`).join("")
    : `<li class="muted small">No saved start points yet.</li>`;
  $("woNeed").classList.toggle("hidden", can);
}
function saveHere() {
  const M = H.M(), S = H.S;
  if (!(S.connected && M && M.grbl)) { H.toast("Connect the table first.", true); return; }
  if (!(S.safety && S.safety.referenced)) { H.toast("Home the machine (or set the home corner) first. A saved start point is measured from the home corner.", true); return; }
  if (!M.zeroConfirmed) { H.toast("Put the torch on the sheet's bottom-left corner and press Start here first. Then save it. The part already cuts where you placed it.", true); return; }
  const w = H.wcoNow(), v = H.toView(w[0], w[1]);
  try {
    const { rec, replaced } = saveOrigin(originStore() || undefined, { name: $("woName").value, x: v[0], y: v[1] });
    $("woName").value = ""; paintSaved();
    H.toast(`${replaced ? "Updated" : "Saved"} start point “${rec.name}” (X ${rec.x}, Y ${rec.y} mm from the home corner).`);
  } catch (e) { H.toast(e.message, true); }
}
async function recall(id) {
  const M = H.M(), S = H.S, o = loadOrigins(originStore() || undefined).find((x) => x.id === id);
  if (!o) return;
  if (!(S.connected && M && M.grbl)) { H.toast("Connect the table first.", true); return; }
  if (M.estopLatched()) { H.toast("E-STOP is ON. Press and hold the red button to reset it first.", true); return; }
  if (M.jobRunning()) { H.toast("Not while a job is running.", true); return; }
  if (M.state() !== "Idle") { H.toast(`Wait until the machine is idle (it is ${M.state()}).`, true); return; }
  // machine position is only trustworthy while the home corner is known (Home, or the home corner set by hand, and no position-lost alarm since)
  if (!(S.safety && S.safety.referenced)) { H.toast("The table doesn't know where it is right now (after a stop or alarm). Press Home first, then use the saved start point. Or just press Start here.", true); return; }
  const [mx, my] = H.fromView(o.x, o.y);
  const problem = M.safety.checkPointsMachine ? M.safety.checkPointsMachine([[mx, my]], "That start point") : "";
  if (problem) { H.toast(problem, true); return; }
  if (!(await H.confirm(`Set the start point to “${o.name}”?\n\nX ${o.x}, Y ${o.y} mm from the home corner. The torch does NOT move. Check the torch is where you expect before you cut.`))) return;
  const r = H.cmd("set_origin", { x: mx, y: my });       // same as Start here: G10 L2, work zero confirmed; refused while the E-stop is latched
  if (r) { H.toast(`Start point set to “${o.name}”. The torch did not move.`); H.refresh(); }
}
function bindOrigins() {
  const g = $("origin9");
  g.innerHTML = ANCHORS.map((a) => `<button type="button" data-anchor="${a.id}" aria-label="${a.label}" title="${a.label}" aria-pressed="false"><i></i></button>`).join("");
  g.onclick = (e) => { const b = e.target.closest("button[data-anchor]"); if (b) setOrigin9(b.dataset.anchor); };
  $("originDefault").onclick = () => { if (originActive()) setOrigin9(origin9); };
  $("woSave").onclick = saveHere;
  $("woList").onclick = async (e) => {
    const b = e.target.closest("button[data-wo]"); if (!b) return;
    const id = b.closest("li").dataset.id;
    if (b.dataset.wo === "recall") await recall(id);
    else if (b.dataset.wo === "del") { const o = loadOrigins(originStore() || undefined).find((x) => x.id === id); if (o && (await H.confirm(`Delete the saved start point “${o.name}”?`))) { deleteOrigin(originStore() || undefined, id); paintSaved(); H.toast("Deleted."); } }
  };
  $("woName").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveHere(); } e.stopPropagation(); });
}

// ================================================================ 37. cut-test coupon + pierce counter
function bindCoupon() {
  $("btnCoupon").onclick = () => {
    const M = H.M(), S = H.S;
    if (M && M.jobRunning()) { H.toast("Not while a job is running.", true); return; }
    const t = S.thickness, hole = couponHole(t);
    H.useCoupon(couponContours(t), "Cut-test coupon", { material: S.material, thickness: t });
    H.toast(`Test coupon ready: ${COUPON.w} × ${COUPON.h} mm with a Ø${hole} mm hole, for ${String(S.material).toLowerCase()} ${t} mm. Set the start point, then Start.`);
  };
  const wrap = $("couponResult");
  wrap.querySelector(".resbtns").innerHTML = RESULTS.map((r) => `<button type="button" data-res="${r.id}">${r.label}</button>`).join("");
  wrap.querySelector(".resbtns").onclick = (e) => { const b = e.target.closest("button[data-res]"); if (!b) return; wrap.dataset.res = b.dataset.res; for (const x of wrap.querySelectorAll(".resbtns button")) x.classList.toggle("sel", x === b); $("cpSave").disabled = false; };
  $("cpSave").onclick = saveCouponResult;
  $("cpSkip").onclick = () => hideCouponResult();
}
function effRow() {
  const r = H.row(), S = H.S, num = (id) => { const el = $(id), v = el ? el.value.trim() : ""; return v !== "" && Number.isFinite(Number(v)) ? Number(v) : null; };
  return { ...r, pierce_delay_s: num("ovDelay") ?? r.pierce_delay_s, pierce_height_mm: num("ovPierce") ?? r.pierce_height_mm ?? S.chart.pierce_height_mm, kerf_mm: num("ovKerf") ?? r.kerf_mm ?? S.chart.kerf_mm };
}
export function maybeAskCouponResult(job) {
  const S = H.S, c = S.design && S.design.coupon;
  if (!c || c.asked || job.result !== "done") return;
  c.asked = true; c.usedSpeed = S.speed;
  const w = $("couponResult"); w.classList.remove("hidden"); w.dataset.res = ""; $("cpSave").disabled = true;
  for (const x of w.querySelectorAll(".resbtns button")) x.classList.remove("sel");
  $("cpSpeed").value = ""; $("cpAmps").value = "";
  $("cpSpeed").placeholder = `${Math.round(S.speed)} (as cut)`; $("cpAmps").placeholder = `${H.row().amps} A (as chart)`;
  $("cpHead").textContent = `How did the test coupon cut? (${S.material}, ${S.thickness} mm)`;
}
function hideCouponResult() { const w = $("couponResult"); if (w) w.classList.add("hidden"); }
function saveCouponResult() {
  const S = H.S, c = S.design && S.design.coupon, w = $("couponResult");
  if (!c || !w.dataset.res) return;
  try {
    const row = effRow();
    const rec = couponPresetRow({ material: S.material, thickness: S.thickness, row, chart: S.chart, usedSpeed: c.usedSpeed || S.speed, result: w.dataset.res, speed: $("cpSpeed").value.trim(), amps: $("cpAmps").value.trim() });
    upsertLocalPreset(rec);                  // the local cut-chart entry for this material and thickness (what "Save to cut chart" writes)
    if (H.setSpeed) H.setSpeed(rec.cut_speed_mm_min);       // the saved speed wins over the chart, so it has to follow too
    hideCouponResult();
    H.applyPresetsAndRender();
    H.toast(`Saved to the cut chart: ${S.material.toLowerCase()} ${S.thickness} mm at ${Math.round(rec.cut_speed_mm_min)} mm/min, ${rec.amps} A ✓`);
  } catch (e) { H.toast(e.message, true); }
}

// ================================================================ init
export function initCutFeatures(host) {
  H = host;
  let store = null; try { store = window.localStorage; } catch (e) { /* private mode */ }
  pierces = new PierceCounter(store || undefined);
  bindLive(); bindOrigins(); bindCoupon();
  H.M().on(onMachineEvent);
  paintLive(); paintOrigin();
  return { watch, pierces, paintLive, paintOrigin, setOrigin9, originId, recall, saveHere, ANCHORS, couponContours, maybeAskCouponResult };
}

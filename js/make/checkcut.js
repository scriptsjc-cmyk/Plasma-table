// r8 item 13: Check cut on the Make header. Asks material and thickness, then runs the
// same cuttability check used on the cutting screen (holes too small, parts too close, etc.).
import { $ } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { checkDesign, machineLimits } from "../cut/check.js";
import { kerfNow, leadNow } from "../cut/prepare.js";

function contours() {
  if (sketch && sketch.items && sketch.items.length) return sketch.contours();
  if (S.design && S.design.contours) return S.design.contours;
  return [];
}

function fillPick() {
  const mat = $("makeCheckMat"), th = $("makeCheckTh");
  if (!mat || !th || !S.chart) return;
  const materials = S.chart.materials || [];
  mat.innerHTML = materials.map((m) => `<option value="${m.name}"${m.name === S.material ? " selected" : ""}>${m.name}</option>`).join("");
  const fillTh = () => {
    const m = materials.find((x) => x.name === mat.value) || materials[0];
    const rows = (m && m.rows) || [];
    th.innerHTML = rows.map((r) => `<option value="${r.thickness_mm}"${Number(r.thickness_mm) === Number(S.thickness) ? " selected" : ""}>${r.thickness_mm} mm</option>`).join("");
  };
  mat.onchange = fillTh;
  fillTh();
}

function runCheck() {
  const cs = contours();
  const out = $("makeCheckOut"), ask = $("makeCheckAsk");
  if (!out) return;
  if (!cs.length) {
    out.innerHTML = `<p class="warntext">There's no drawing to check yet. Add a shape first.</p>`;
    return;
  }
  const mat = $("makeCheckMat").value, th = Number($("makeCheckTh").value);
  S.material = mat; S.thickness = th;
  const t = S.cfg.travel_mm, L = S.safety && S.safety.limits;
  const table = L ? [Math.round(L.x[1] - L.x[0]), Math.round(L.y[1] - L.y[0])] : [t.x, t.y];
  const limits = machineLimits({
    thickness: th,
    kerf: kerfNow(),
    leadIn: leadNow(),
    table,
    accuracy: (S.cfg && S.cfg.accuracy_mm) || 0.5,
    slatPitch: (S.cfg && S.cfg.slat_pitch_mm) || 100,
  });
  let chk;
  try { chk = checkDesign(cs, limits); } catch (e) { out.innerHTML = `<p class="warntext">${e.message}</p>`; return; }
  const html = !chk ? "<p>Couldn't run the check.</p>" : `
    <div class="cchead">Cut check <span>· ${mat.toLowerCase()} ${th} mm</span></div>
    ${chk.groups.length
      ? `<ol>${chk.groups.map((g) => `<li class="${g.level}"><b>${g.n || ""}</b><span>${g.text}</span></li>`).join("")}</ol>`
      : `<p class="ok">✓ Looks cuttable – nothing too small, thin or close for ${th} mm ${mat.toLowerCase()}.</p>`}`;
  out.innerHTML = html;
  if (ask) ask.textContent = "Results for this drawing, at the material and thickness you picked.";
}

function openDlg() {
  const dlg = $("makeCheckDlg"); if (!dlg) return;
  fillPick();
  $("makeCheckOut").innerHTML = "";
  $("makeCheckAsk").textContent = "Choose the material and thickness, then we'll check this drawing.";
  dlg.classList.remove("hidden"); dlg.hidden = false;
}

function closeDlg() {
  const dlg = $("makeCheckDlg"); if (!dlg) return;
  dlg.classList.add("hidden"); dlg.hidden = true;
}

export function bindCheckCut() {
  const btn = $("btnMakeCheckCut"); if (!btn) return;
  btn.onclick = openDlg;
  if ($("makeCheckGo")) $("makeCheckGo").onclick = runCheck;
  if ($("makeCheckClose")) $("makeCheckClose").onclick = closeDlg;
  const dlg = $("makeCheckDlg");
  if (dlg) dlg.addEventListener("click", (e) => { if (e.target === dlg) closeDlg(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && dlg && !dlg.classList.contains("hidden")) closeDlg(); });
}

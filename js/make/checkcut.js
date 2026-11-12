// r8 item 13: Check cut on the Make header. Asks material and thickness, then runs the
// same cuttability check used on the cutting screen (holes too small, parts too close, etc.).
// Thickness and material are clickable chips (same idea as the Cut screen), not a <select>:
// a closed dropdown listed every size in the dialog's text, so clicking "3 mm" did nothing
// and the check ran at the first size (1 mm).
import { $ } from "../core/dom.js";
import { S, sketch } from "../core/state.js";
import { checkDesign, machineLimits } from "../cut/check.js";
import { kerfNow, leadNow } from "../cut/prepare.js";

function contours() {
  if (sketch && sketch.items && sketch.items.length) return sketch.contours();
  if (S.design && S.design.contours) return S.design.contours;
  return [];
}

function pickedMat() {
  const on = $("makeCheckMat") && $("makeCheckMat").querySelector("[data-mat].sel");
  return (on && on.dataset.mat) || S.material || "";
}
function pickedTh() {
  const on = $("makeCheckTh") && $("makeCheckTh").querySelector("[data-th].sel");
  if (on) return Number(on.dataset.th);
  return S.thickness != null ? Number(S.thickness) : NaN;
}

function fillPick() {
  const mat = $("makeCheckMat"), th = $("makeCheckTh");
  if (!mat || !th || !S.chart) return;
  const materials = S.chart.materials || [];
  const curMat = materials.some((m) => m.name === S.material) ? S.material : (materials[0] && materials[0].name);
  mat.innerHTML = materials.map((m) =>
    `<button type="button" role="option" data-mat="${m.name}" class="${m.name === curMat ? "sel" : ""}" aria-selected="${m.name === curMat ? "true" : "false"}">${m.name}</button>`).join("");
  const fillTh = (keep) => {
    const name = pickedMat();
    const m = materials.find((x) => x.name === name) || materials[0];
    const rows = (m && m.rows) || [];
    const want = keep != null && Number.isFinite(Number(keep)) ? Number(keep)
      : (S.thickness != null ? Number(S.thickness) : NaN);
    const picked = rows.some((r) => Number(r.thickness_mm) === want) ? want
      : (rows[0] ? Number(rows[0].thickness_mm) : NaN);
    th.innerHTML = rows.map((r) => {
      const on = Number(r.thickness_mm) === picked;
      return `<button type="button" role="option" data-th="${r.thickness_mm}" class="${on ? "sel" : ""}" aria-selected="${on ? "true" : "false"}">${r.thickness_mm} mm</button>`;
    }).join("");
  };
  mat.onclick = (e) => {
    const b = e.target.closest("[data-mat]"); if (!b) return;
    mat.querySelectorAll("[data-mat]").forEach((x) => {
      const on = x === b;
      x.classList.toggle("sel", on);
      x.setAttribute("aria-selected", on ? "true" : "false");
    });
    fillTh(pickedTh());
  };
  th.onclick = (e) => {
    const b = e.target.closest("[data-th]"); if (!b) return;
    th.querySelectorAll("[data-th]").forEach((x) => {
      const on = x === b;
      x.classList.toggle("sel", on);
      x.setAttribute("aria-selected", on ? "true" : "false");
    });
  };
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
  const mat = pickedMat(), th = pickedTh();
  if (!mat || !Number.isFinite(th)) {
    out.innerHTML = `<p class="warntext">Pick a material and a thickness, then check the drawing.</p>`;
    return;
  }
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

// Live pierce delay: change it while cutting.
import { $ } from "../core/dom.js";
import { H } from "../ui/host.js";
import { upsertLocalPreset } from "../machine/settings.js";

// ================================================================ live pierce delay (Pro)
function delayNow() { const M = H.M(); return M.liveDelay != null ? M.liveDelay : Number(H.S.prepared && H.S.prepared.cut ? H.S.prepared.cut.pierce_delay_s : H.row().pierce_delay_s); }
export function paintDelay() {
  const el = $("liveDelay"); if (!el) return;
  const d = delayNow();
  el.textContent = Number.isFinite(d) ? `${d.toFixed(1)} s` : "–";
}
export function bindDelay() {
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

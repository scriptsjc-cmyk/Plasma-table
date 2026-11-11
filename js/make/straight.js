// Straight cut: one line across the sheet.
import { $ } from "../core/dom.js";
import { H } from "../ui/host.js";

// ================================================================ straight cut / sheet trim
export function bindStraight() {
  const open = () => {
    if (H.jobRunning()) { H.toast("A job is running.", true); return; }
    $("straightDlg").classList.remove("hidden"); setTimeout(() => $("stLen").focus(), 30);
  };
  ["btnStraight", "bgStraight", "pbStraight"].forEach((id) => { if ($(id)) $(id).onclick = open; });
  $("stCancel").onclick = () => $("straightDlg").classList.add("hidden");
  $("stOk").onclick = () => {
    const L = Number($("stLen").value), dir = $("stDir").value;
    const max = dir === "x" ? H.cfg().travel_mm.x : H.cfg().travel_mm.y;
    if (!(L >= 1) || L > max * 2) { H.toast(`Length must be between 1 and ${Math.round(max * 2)} mm.`, true); return; }
    const sx = $("stX").value.trim(), sy = $("stY").value.trim();
    $("straightDlg").classList.add("hidden");
    H.useStraight(dir, L, sx === "" ? null : Number(sx), sy === "" ? null : Number(sy));
  };
}

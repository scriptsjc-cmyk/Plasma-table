// Size check after a DXF/SVG import: shows the size and asks before scaling (inches vs mm).
import { $ } from "../core/dom.js";
import { H } from "../ui/host.js";
import { currentSettings } from "../machine/settings.js";

// ================================================================ size check after DXF / SVG import
function designSize(contours) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const c of contours) {
    if (c.circle) { add(c.circle.cx - c.circle.r, c.circle.cy - c.circle.r); add(c.circle.cx + c.circle.r, c.circle.cy + c.circle.r); }
    for (const p of c.pts || []) add(p[0], p[1]);
  }
  return Number.isFinite(x0) ? { w: x1 - x0, h: y1 - y0 } : { w: 0, h: 0 };
}
export function scaleContours(contours, k) {
  return contours.map((c) => {
    const o = { ...c, pts: (c.pts || []).map(([x, y, ...rest]) => [x * k, y * k, ...rest]) };
    if (c.circle) o.circle = { ...c.circle, cx: c.circle.cx * k, cy: c.circle.cy * k, r: c.circle.r * k };
    return o;
  });
}
export function sizeCheckWanted() {            // everyone is asked "is this the right size?"; Settings can switch it off
  try { return currentSettings().sizeCheck !== false; } catch (e) { return true; }
}
let sizePending = null;
const r1 = (v) => Math.round(v * 10) / 10;
export function askSize(design, unitsNote, done, opts = {}) {
  const sz = designSize(design.contours);
  const dlg = $("sizeDlg");
  sizePending = { design, done, sz, k: 1 };
  $("sizeText").innerHTML = `This drawing is <b>${r1(sz.w)} × ${r1(sz.h)} mm</b>. Is that right?`;
  const hint = [];
  if (unitsNote) hint.push(`The file says its units are ${unitsNote}.`);
  if (sz.w < 25 && sz.h < 25) hint.push("That is very small. If you drew it in inches, pick the inches button.");
  if (sz.w > 1500 || sz.h > 1500) hint.push("That is bigger than most tables. If it came from a program that uses inches by mistake, try ÷ 25.4.");
  $("sizeUnits").textContent = hint.join(" ");
  $("sizeTo").value = "";
  if ($("sizeAllRow")) {      // several files: one answer can cover the rest
    $("sizeAll").checked = false;
    $("sizeAllRow").classList.toggle("hidden", !(opts.left > 0));
    if (opts.name) $("sizeText").innerHTML = `<b>${String(opts.name).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}</b> is <b>${r1(sz.w)} × ${r1(sz.h)} mm</b>. Is that right?`;
    if (opts.left > 0) $("sizeAllText").textContent = `Use the same answer for the other ${opts.left} file${opts.left === 1 ? "" : "s"} (apply to all)`;
  }
  dlg.classList.remove("hidden");
  setTimeout(() => $("sizeYes").focus(), 30);
}
function sizeFinish(k) {
  const pend = sizePending; if (!pend) return;
  sizePending = null; $("sizeDlg").classList.add("hidden");
  if (k !== 1) pend.design.contours = scaleContours(pend.design.contours, k);
  const all = !!($("sizeAll") && $("sizeAll").checked && !$("sizeAllRow").classList.contains("hidden"));
  pend.done(k, all);
}
export function bindSize() {
  $("sizeYes").onclick = () => sizeFinish(1);
  $("sizeInch").onclick = () => sizeFinish(25.4);
  $("sizeMm").onclick = () => sizeFinish(1 / 25.4);
  $("sizeScale").onclick = () => {
    const v = Number($("sizeTo").value), pend = sizePending; if (!pend) return;
    if (!(v > 0)) { H.toast("Type the size you want, in mm.", true); return; }
    const base = $("sizeAxis").value === "h" ? pend.sz.h : pend.sz.w;
    if (!(base > 0)) { H.toast("This drawing has no width to scale from.", true); return; }
    sizeFinish(v / base);
  };
  $("sizeTo").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("sizeScale").click(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sizePending) { e.stopPropagation(); sizeFinish(1); }
  }, true);
}

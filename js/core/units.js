// r15 10.8: inch units for what the drawing shows. Everything is stored, cut and sent in millimetres; this only changes
// how a length is written on screen. Typed values accept in / " / mm / cm anywhere (core/expr.js).
export const MM_PER_IN = 25.4;
export const unitsFrom = (prefs) => (prefs && prefs.units === "in" ? "in" : "mm");
export function fmtLen(mm, units = "mm") {
  const v = Number(mm);
  if (!Number.isFinite(v)) return "";
  if (units === "in") return (v / MM_PER_IN).toFixed(2) + '"';
  return String(Math.round(v * 10) / 10) + " mm";
}

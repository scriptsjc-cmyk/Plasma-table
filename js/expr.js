// Safe numeric expressions for the size keypad: 100/2, 50+12.5, 80-5, 25*4, (30+10)/2
export function evalExpr(raw) {
  const s = String(raw ?? "").trim().replace(/,/g, ".").replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/");
  if (!s) return NaN;
  if (!/^[-+*/().\d]+$/.test(s)) return NaN;
  if (/[*/]{2,}|\+{2,}|--|\(\)/.test(s)) return NaN;
  try {
    const v = Function(`"use strict"; return (${s})`)();
    return typeof v === "number" && Number.isFinite(v) ? v : NaN;
  } catch (e) {
    return NaN;
  }
}

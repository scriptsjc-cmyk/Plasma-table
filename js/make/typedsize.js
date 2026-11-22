// r15 10.7: a size typed straight into the Rectangle / Circle tools: "120 × 80", "120x80", "120 by 80", "60" (a square);
// "Ø40", "D40", "dia 40", "40" or "R20" (a radius) for a circle. Each number may carry a unit (2in, 1", 5cm).
import { evalExpr } from "../core/expr.js";

const pos = (s) => { const v = evalExpr(String(s || "").trim()); return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : null; };

export function parseTypedSize(kind, text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  if (kind === "rect") {
    const parts = s.split(/\s*(?:×|\*|\bby\b|,|(?<=[\d."a-z])\s*[xX]\s*(?=[\d.(]))\s*/i).filter((p) => p !== "");
    if (/(^|[^\d.])[xX×*,]\s*$|^\s*[xX×*,]/.test(s)) return null;      // "10 x" / "x 10": half a size
    if (parts.length === 1) { const v = pos(parts[0]); return v ? { w: v, h: v } : null; }
    if (parts.length !== 2) return null;
    const w = pos(parts[0]), h = pos(parts[1]);
    return w && h ? { w, h } : null;
  }
  if (kind === "disc") {
    const m = /^(ø|Ø|⌀|dia(?:meter)?|d|r|rad(?:ius)?)?\s*(.+)$/i.exec(s);
    if (!m) return null;
    const v = pos(m[2]);
    if (!v) return null;
    const radius = m[1] && /^r/i.test(m[1]);
    return { d: radius ? Math.round(v * 2000) / 1000 : v };
  }
  return null;
}

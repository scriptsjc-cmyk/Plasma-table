// Safe numeric expressions for the size keypad: 100/2, 50+12.5, 80-5, 25*4, (30+10)/2
export function evalExpr(raw) {
  const original = String(raw ?? "");
  if (/\d\s+\d/.test(original)) return NaN; // "1 2" is not a number
  let s = original.trim();
  if ((s.match(/,/g) || []).length === 1 && !s.includes(".")) s = s.replace(",", ".");
  else if (s.includes(",")) return NaN;
  s = s.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/");
  if (!s || s.length > 200) return NaN;
  if (!/^[-+*/().\d]+$/.test(s)) return NaN;
  if (/[*/]{2,}|\+{2,}|--|\/\/|\(\)/.test(s)) return NaN;
  let i = 0;
  const eat = (c) => { if (s[i] === c) { i++; return true; } return false; };
  function num() {
    const start = i;
    let dots = 0;
    while (i < s.length && ((s[i] >= "0" && s[i] <= "9") || s[i] === ".")) {
      if (s[i] === ".") { dots++; if (dots > 1) return NaN; }
      i++;
    }
    if (i === start) return NaN;
    const v = parseFloat(s.slice(start, i));
    return Number.isFinite(v) ? v : NaN;
  }
  function factor() {
    if (eat("+")) return factor();
    if (eat("-")) { const v = factor(); return Number.isFinite(v) ? -v : NaN; }
    if (eat("(")) {
      const v = expr();
      if (!eat(")")) return NaN;
      return v;
    }
    return num();
  }
  function term() {
    let v = factor();
    if (!Number.isFinite(v)) return NaN;
    for (;;) {
      if (eat("*")) { const r = factor(); if (!Number.isFinite(r)) return NaN; v *= r; }
      else if (eat("/")) { const r = factor(); if (!Number.isFinite(r) || r === 0) return NaN; v /= r; }
      else break;
    }
    return v;
  }
  function expr() {
    let v = term();
    if (!Number.isFinite(v)) return NaN;
    for (;;) {
      if (eat("+")) { const r = term(); if (!Number.isFinite(r)) return NaN; v += r; }
      else if (eat("-")) { const r = term(); if (!Number.isFinite(r)) return NaN; v -= r; }
      else break;
    }
    return v;
  }
  const v = expr();
  if (i !== s.length) return NaN;
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}

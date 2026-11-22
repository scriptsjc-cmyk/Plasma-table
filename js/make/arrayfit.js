// r15 10.5: "as many as fit on the sheet": how many copies of a w × h box fit across and up, starting at (x0, y0),
// a gap apart, inside the sheet (less an optional margin). Capped at max copies (and says so).
export function fitGrid({ x0 = 0, y0 = 0, w, h, gap = 10, sheetW, sheetH, margin = 0, max = 500 }) {
  gap = Math.max(0, Number(gap) || 0); margin = Math.max(0, Number(margin) || 0);
  const sx = Math.max(Number(x0) || 0, margin), sy = Math.max(Number(y0) || 0, margin);
  const room = (start, size, sheet) => (size > 0 ? Math.floor((sheet - margin - start + gap + 1e-6) / (size + gap)) : 0);
  let cols = Math.max(0, room(sx, w, sheetW)), rows = Math.max(0, room(sy, h, sheetH));
  let limited = false;
  if (cols * rows > max) { limited = true; rows = Math.max(1, Math.min(rows, Math.floor(max / Math.max(1, cols)))); if (cols > max) cols = max; }
  return { cols, rows, n: cols * rows, x0: sx, y0: sy, limited };
}

// r15 10.4: numbered copies from one line of text: "TAG 001–050" is TAG 001 … TAG 050. The last range in the text counts
// (up or down); the width of the first number (001) keeps the leading zeros. Returns null when there is no range.
export const MAX_NUMBERED = 200;
export function expandNumbered(text) {
  const s = String(text ?? "");
  const re = /(\d+)\s*[-–—]\s*(\d+)/g;
  let m, last = null;
  while ((m = re.exec(s))) last = m;
  if (!last) return null;
  const a = parseInt(last[1], 10), b = parseInt(last[2], 10);
  if (a === b) return null;
  const count = Math.abs(b - a) + 1;
  if (count > MAX_NUMBERED) return { error: `That is ${count} copies. Numbered copies stop at ${MAX_NUMBERED}.` };
  const width = last[1].length > 1 && last[1][0] === "0" ? last[1].length : (last[1].length === last[2].length ? last[1].length : 0);
  const head = s.slice(0, last.index), tail = s.slice(last.index + last[0].length), step = b > a ? 1 : -1;
  const out = [];
  for (let k = a; ; k += step) { out.push(head + String(k).padStart(width, "0") + tail); if (k === b) break; }
  return out;
}

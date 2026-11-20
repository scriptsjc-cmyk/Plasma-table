import { boxesOf, boxesAdd, boxesHit } from "../ui/labelboxes.js";
// r7 J15: where the cut begins, marked on the bed (the first pierce). The mark follows its part while you
// drag; the G-code is rebuilt on drop so the job cuts at that bed position. Work zero is the sheet's
// bottom-left corner, not the part: nothing here sends a zero, origin or move command to the hardware.
let anchor = null;                  // { prep, id, off }: the first pierce, relative to the lower-left corner of its part's box

function firstPierce(prep) {
  const j = prep && prep.cutIndex && prep.cutIndex[0] && prep.cutIndex[0].at;
  if (j) return j;                  // the XY in the G-code where the torch actually comes on
  const c = prep && prep.cutInfo && prep.cutInfo.find((ci) => ci.start);
  return c ? c.start : null;
}
const boxDist = (p, b) => Math.hypot(Math.max(0, b[0] - p[0], p[0] - b[2]), Math.max(0, b[1] - p[1], p[1] - b[3]));

// the first pierce on the sheet (mm from the sheet's bottom-left corner), following its part; null when there is no job yet
export function startMarkAt(prep, units) {
  if (!prep || !units.length) return null;
  if (!anchor || anchor.prep !== prep) {
    const at = firstPierce(prep); if (!at) return null;
    const u = units.reduce((best, v) => (boxDist(at, v.box) < boxDist(at, best.box) ? v : best));
    anchor = { prep, id: u.id, off: [at[0] - u.box[0], at[1] - u.box[1]] };
  }
  const u = units.find((v) => v.id === anchor.id);
  return u ? [u.box[0] + anchor.off[0], u.box[1] + anchor.off[1]] : null;
}

export function drawStartMark(sk, ctx, S, prep, units) {
  const at = startMarkAt(prep, units); if (!at) return;
  const [x, y] = S(at[0], at[1]);
  const GO = getComputedStyle(document.documentElement).getPropertyValue("--go").trim() || "#0A6A32";   // Start here's green, per theme
  ctx.strokeStyle = GO; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke();
  const text = `Touch off, then cut starts here · ${Math.round(at[0])}, ${Math.round(at[1])} mm`;
  // r13: the tag (28 px pill) goes under the mark, else over it, else further down — never on another label
  ctx.font = "600 14px Barlow, system-ui";
  const tw = Math.max(44, ctx.measureText(text).width + 16), cv = ctx.canvas;
  const [cw] = sk.size(), px = Math.max(tw / 2 + 2, Math.min(cw - tw / 2 - 2, x));   // tag() keeps the pill inside the canvas the same way
  const pill = (cy) => ({ l: px - tw / 2, r: px + tw / 2, t: cy - 14, b: cy + 14 });
  const clear = (cy) => !boxesOf(cv).some((o) => boxesHit(o, pill(cy), 2));
  let cy = [y + 24, y - 24, y + 52, y + 80, y - 52].find(clear);
  if (cy == null) cy = y + 24;
  const r = sk.tag(ctx, text, x, cy, GO);
  if (r) boxesAdd(cv, { l: r.x, r: r.x + r.w, t: r.y, b: r.y + r.h });
}

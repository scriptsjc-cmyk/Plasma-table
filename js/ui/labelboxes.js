// r13 done-when ("nothing overlaps"): canvas labels drawn in this frame, so a later label can step clear of
// an earlier one instead of being painted on top of it. Boxes are in the canvas's drawing units.
export function boxesReset(cv) { if (cv) cv._labelBoxes = []; }
export function boxesAdd(cv, b) { if (cv && b) (cv._labelBoxes || (cv._labelBoxes = [])).push(b); return b; }
export const boxesOf = (cv) => (cv && cv._labelBoxes) || [];
// the box a fillText would cover with the context's current font, align and baseline
export function textBox(ctx, text, x, y) {
  const m = ctx.measureText(text);
  return { l: x - m.actualBoundingBoxLeft, r: x + m.actualBoundingBoxRight, t: y - m.actualBoundingBoxAscent, b: y + m.actualBoundingBoxDescent };
}
export const boxesHit = (a, b, pad = 2) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > -pad && Math.min(a.b, b.b) - Math.max(a.t, b.t) > -pad;
export const hitsAny = (cv, b, pad = 2) => boxesOf(cv).some((o) => boxesHit(o, b, pad));

// r7 J15: where the cut begins, marked on the bed. Moving a part updates the job start (the first pierce
// in the prepared job / G-code) so the origin of the cut follows the part. Work zero on the machine is
// unchanged: nothing here sends a zero, origin or move command to the hardware.
let anchor = null;                  // { prep, id, off }: the first pierce, relative to the lower-left corner of its part's box

function firstPierce(prep) {
  const c = prep && prep.cutInfo && prep.cutInfo.find((ci) => ci.start);
  return c ? c.start : null;        // design coordinates = sheet coordinates on the bed
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

// write the mark position onto the prepared job so Start cutting / G-code use the same start
export function applyJobStart(prep, units) {
  const at = startMarkAt(prep, units);
  if (prep) prep.jobStart = at ? at.slice() : null;
  return at;
}

export function drawStartMark(sk, ctx, S, prep, units) {
  const at = applyJobStart(prep, units); if (!at) return;
  const [x, y] = S(at[0], at[1]);
  const GO = getComputedStyle(document.documentElement).getPropertyValue("--go").trim() || "#0A6A32";   // Start here's green, per theme
  ctx.strokeStyle = GO; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke();
  sk.tag(ctx, `Cut starts here · ${Math.round(at[0])}, ${Math.round(at[1])} mm`, x, y + 24, GO);    // below: the pierce sits just outside the part
}

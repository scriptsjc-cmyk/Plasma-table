// Live previews for CAD dialogs and fillet hover (C49). Pure geometry, no DOM.
export function filletPreviewGeom(A, P, Q, r, mode) {
  const v1 = [A[0] - P[0], A[1] - P[1]], v2 = [Q[0] - P[0], Q[1] - P[1]];
  const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
  if (!(r > 0) || l1 < 0.05 || l2 < 0.05) return null;
  const u1 = [v1[0] / l1, v1[1] / l1], u2 = [v2[0] / l2, v2[1] / l2];
  const dot = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
  const ang = Math.acos(dot);
  if (!(ang > 1e-3) || Math.PI - ang < 1e-3) return null;
  const kind = mode === "relief" ? "relief" : mode === "chamfer" ? "chamfer" : "round";
  if (kind === "relief") {
    const d = r; // diameter entered as size; centre sits along the bisector, into the material
    const b = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(b[0], b[1]);
    if (bl < 1e-9) return null;
    const C = [P[0] + b[0] / bl * (d / 2), P[1] + b[1] / bl * (d / 2)];
    return { kind, T1: P, T2: P, C, r: d / 2 };
  }
  const t = r / Math.tan(ang / 2);
  if (t > l1 - 0.05 || t > l2 - 0.05) return null;
  const T1 = [P[0] + u1[0] * t, P[1] + u1[1] * t];
  const T2 = [P[0] + u2[0] * t, P[1] + u2[1] * t];
  if (kind === "chamfer") return { kind, T1, T2, C: null, r };
  const b = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(b[0], b[1]);
  if (bl < 1e-9) return null;
  const d = r / Math.sin(ang / 2);
  const C = [P[0] + b[0] / bl * d, P[1] + b[1] / bl * d];
  return { kind, T1, T2, C, r };
}

export function linearArrayShifts(n, gapX, gapY, box) {
  const want = Math.max(2, Math.min(50, Math.round(n || 2)));
  const gx = Number(gapX), gy = Number(gapY);
  if (!box || !Number.isFinite(gx) || !Number.isFinite(gy)) return [];
  const dx = gx === 0 ? 0 : (box[2] - box[0]) + gx;
  const dy = gy === 0 ? 0 : (box[3] - box[1]) + gy;
  const out = [];
  for (let k = 1; k < want; k++) out.push([k * dx, k * dy]);
  return out;
}

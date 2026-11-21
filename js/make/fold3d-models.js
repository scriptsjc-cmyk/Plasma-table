// r15 8.5 (split from fold3d.js): which 3D each preset gets (FOLD_MODELS, flat3d FOLD), pipe-end flanges, foldModel.
import { pipeEnds, flangeOn, flangeDims } from "./pipeflanges.js";
import { reducingElbow } from "./redelbow.js";
import { FOLD } from "./flat3d.js";
import { assemble, attach, face, flangeFrame3, foldAngle, foldBritches, foldC, foldCuboid, foldElbow, foldFishmouth, foldFrustum, foldHopper, foldLiddedCross, foldOpenBox, foldOpenHem, foldPipeOnFlat, foldRectElbow, foldRedElbow, foldS2r, foldSaddleHole, foldScoop, foldTakeoff, foldTee, foldTube, foldU, foldYBranch, hole, holes, rectElbowDims, redElbowDims, takeoffCollarH } from "./fold3d-geom.js";
import { V, add, scl, norm } from "./vec3.js";

// ------------------------------------------------------------------ registry for existing fold / formed presets (make() is not touched)

function coneOf(p) { return foldFrustum(p.d, p.d2 || p.d, p.h); }
function s2rOf(p) { return foldS2r(p.a, p.b, p.d, p.h, undefined, p.ox || 0, p.oy || 0); }

export const FOLD_MODELS = {
  openbox: (p) => foldOpenHem(p.len, p.wid, p.ht, p.hem || 0, p.tab || 0),
  liddedbox: (p) => foldLiddedCross(p.len, p.wid, p.ht, p.tab || 0),
  trayflat: (p) => foldOpenHem(p.len, p.wid, p.ht, 0, p.tab || 0),
  uchannel: (p) => foldU(p.len, p.web, p.leg, [], p.ends),
  cchannel: (p) => foldC(p.len, p.web, p.leg, p.flange, p.ends),
  angleiron: (p) => foldAngle(p.len, p.a, p.b),
  cuboidwrap: (p) => foldCuboid(p.len, p.wid, p.ht),
  fiveside: (p) => {
    const bot = face(p.wid, p.dep);
    attach(bot, 3, 90, face(p.dep, p.ht));
    attach(bot, 1, 90, face(p.dep, p.ht));
    const back = face(p.wid, p.ht);
    attach(back, 2, 80, face(p.wid, p.dep));         // lid, slightly open
    attach(bot, 2, 90, back);
    return assemble(bot);
  },
  totebox: (p) => foldOpenHem(p.len, p.wid, p.ht, 0, 0),
  enclfront: (p) => {
    const iw = p.iw, ih = p.ih;
    const holes = (iw > 8 && ih > 8) ? [{ pts: [[(p.w - iw) / 2, (p.h - ih) / 2], [(p.w + iw) / 2, (p.h - ih) / 2], [(p.w + iw) / 2, (p.h + ih) / 2], [(p.w - iw) / 2, (p.h + ih) / 2]] }] : [];
    const bot = face(p.w, p.d);
    const front = face(p.w, p.h, holes);
    const back = face(p.w, p.h);
    attach(back, 2, 70, face(p.w, p.d));
    attach(bot, 0, 90, front);
    attach(bot, 2, 90, back);
    attach(bot, 3, 90, face(p.d, p.h));
    attach(bot, 1, 90, face(p.d, p.h));
    return assemble(bot);
  },
  jbox: (p) => {
    const hs = p.hole > 0 ? [
      { cx: p.inset, cy: p.inset, r: p.hole / 2 }, { cx: p.s - p.inset, cy: p.inset, r: p.hole / 2 },
      { cx: p.s - p.inset, cy: p.s - p.inset, r: p.hole / 2 }, { cx: p.inset, cy: p.s - p.inset, r: p.hole / 2 },
    ] : [];
    return foldLiddedCross(p.s, p.s, p.ht, 0, hs);
  },
  drawerbox: (p) => {
    const bot = face(p.w, p.d);
    attach(bot, 3, 90, face(p.d, p.h));
    attach(bot, 1, 90, face(p.d, p.h));
    attach(bot, 2, 90, face(p.w, p.h));
    attach(bot, 0, 90, face(p.w, Math.max(p.front, p.h)));
    return assemble(bot);
  },
  shoebox: (p) => {
    const base = foldOpenBox(p.len, p.wid, p.ht);
    const lid = foldOpenBox(p.len + 2 * Math.max(0.5, p.clear), p.wid + 2 * Math.max(0.5, p.clear), p.lidht);
    lid.faces.forEach((f) => f.pts.forEach((q) => { q[0] -= 10; q[1] += p.ht + 8; }));
    return { faces: base.faces.concat(lid.faces), panels: base.panels.concat(lid.panels) };
  },
  crateflaps: (p) => {
    const bot = face(p.len, p.wid);
    const wall = face(p.len, p.ht);
    attach(wall, 2, 60, face(p.len, p.wid / 2));
    const wall2 = face(p.len, p.ht);
    attach(wall2, 2, 60, face(p.len, p.wid / 2));
    const side = face(p.wid, p.ht);
    attach(side, 2, 60, face(p.wid, p.len / 2));
    const side2 = face(p.wid, p.ht);
    attach(side2, 2, 60, face(p.wid, p.len / 2));
    attach(bot, 0, 90, wall);
    attach(bot, 2, 90, wall2);
    attach(bot, 3, 90, side);
    attach(bot, 1, 90, side2);
    return assemble(bot);
  },
  lidonly: (p) => foldOpenHem(p.len, p.wid, p.ht, 0, 0),
  s2r: s2rOf, s2roffset: s2rOf, r2s: s2rOf,
  cone: coneOf, conesteep: coneOf, coneshallow: coneOf, silocone: coneOf,
  conecentric: (p) => foldFrustum(p.d, p.d2, p.h),
  coneecc: (p) => foldFrustum(p.d, p.d2, p.h),
  r2roffset: (p) => foldFrustum(p.d, p.d2, p.h),
  cyclonehop: (p) => foldFrustum(p.d, p.d2, p.h),
  coneadapter: (p) => foldFrustum(p.d, p.d2, p.h),
  tube: (p) => foldTube(p.d, p.h),
  recttrans: (p) => foldHopper(p.a, p.b, p.a2, p.b2, p.h),
  recttransoff: (p) => foldHopper(p.a, p.b, p.a2, p.b2, p.h, p.ox || 0, p.oy || 0),
  hopperrect: (p) => foldHopper(p.a, p.b, p.a2, p.b2, p.h),
  sqrpyramid: (p) => foldHopper(p.a, p.a, Math.max(4, p.a2), Math.max(4, p.a2), p.h),
  elbow2: (p) => foldElbow(p.d, p.bend, p.n || 2, 48, p.clr),
  elbow3: (p) => foldElbow(p.d, p.bend, p.n || 3, 48, p.clr),
  elbow4: (p) => foldElbow(p.d, p.bend, p.n || 4, 48, p.clr),
  elbow5: (p) => foldElbow(p.d, p.bend, p.n || 5, 48, p.clr),
  elbow45: (p) => foldElbow(p.d, p.bend, p.n || 3, 48, p.clr),
  redelbow: (p) => foldRedElbow(p),
  rectelbow: (p) => foldRectElbow(p.w, p.h, p.r, p.bend),
  scoop: (p) => foldScoop(p.w, p.d, p.h, p.r),
  valleyflash: (p) => foldAngle(p.len, p.leg, p.leg),
  fishmouth: (p) => foldFishmouth(p.d, p.d2 || p.d, p.skirt || 30),
  fishflat: (p) => foldPipeOnFlat(p.d, p.rise || 25, p.skirt || 30),
  saddlehole: (p) => foldSaddleHole(p.d, p.len, p.branch),
  takeoff: (p) => foldTakeoff(p),
  britches: (p) => foldBritches(p.d, p.d2, p.len),
  teetemp: (p) => foldTee(p.d, p.d2, p.len, p.skirt || 25),
  ybranch: (p) => foldYBranch(p.d, p.d2, p.len, p.rise || 20),
  ductcap: (p) => foldDisc(p.d, p.hole > 8 ? p.hole : 0),
  rectcap: (p) => flangeFrame3(p.w, p.h, p.lip),
};


function circleRing(origin, xA, yA, rad, segs = 64) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i * 2 * Math.PI) / segs;
    pts.push(add(origin, add(scl(xA, rad * Math.cos(a)), scl(yA, rad * Math.sin(a)))));
  }
  return pts;
}
export function foldDisc(d, hole = 0, segs = 64) {
  const R = Math.max(0, d) / 2;
  const origin = V(0, 0, 0), xA = V(1, 0, 0), yA = V(0, 0, 1);
  const pts = circleRing(origin, xA, yA, R, segs);
  const holes = hole > 0 ? [circleRing(origin, xA, yA, hole / 2, 48)] : [];
  const area = Math.PI * (R * R - (hole / 2) * (hole / 2));
  const faces = [{ pts, n: V(0, 1, 0), holes, w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)) }];
  return { faces, panels: [{ w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)) }] };
}
function existingLip(id, p, end) {
  const lip = Number(p && p.lip) || 0;
  if (!(lip > 0.5)) return 0;
  if (id === "s2r" || id === "s2roffset" || id === "r2s") {
    if (end.key === "fl1") return lip;
    if (end.key === "fl2") return Math.round(p.ring == null ? 1 : p.ring) >= 1 ? lip : 0;
    return 0;
  }
  if (id === "fanduct") return end.key === "fl1" ? lip : 0;
  if (id === "takeoff" || id === "ductcap") return end.key === "fl1" ? lip : 0;
  if (id === "cyclonehop") return end.key === "fl1" ? lip : 0;      // r15 5.3: only the top (big-end) ring is cut
  if (id === "conecentric" || id === "coneadapter") return lip;
  return 0;
}
function endFrames(id, p) {
  const h = Number(p && (p.h != null ? p.h : p.len)) || 0;
  const x = V(1, 0, 0), z = V(0, 0, 1), up = V(0, 1, 0), dn = V(0, -1, 0);
  // r15 7.5: only the top opening is offset (foldS2r, foldHopper); the bottom stays on the origin (it was moved too)
  const pairY = (o2, ox = 0, oy = 0) => ([
    { origin: V(0, 0, 0), xA: x, yA: z, outward: dn },
    { origin: V(ox, o2, oy), xA: x, yA: z, outward: up },
  ]);
  switch (id) {
    case "tube":
    case "cone":
    case "conesteep":
    case "coneshallow":
    case "conecentric":
    case "coneecc":
    case "r2roffset":
    case "silocone":
    case "cyclonehop":
    case "coneadapter":
    case "recttransoff":
      return pairY(h, p.ox || 0, p.oy || 0);
    case "recttrans":
    case "hopperrect":
    case "hopflange":
    case "sqrpyramid":
      return pairY(h);
    case "s2r":
    case "s2roffset":
    case "r2s":
    case "fanduct":
      return pairY(h, p.ox || 0, p.oy || 0);
    case "takeoff":   // r15 7.5: the flange sits on the tube's top, above the saddle collar
      return [{ origin: V(0, takeoffCollarH(p) + (p.len || 0), 0), xA: x, yA: z, outward: up }];
    case "ductcap":
    case "rectcap":
      return [{ origin: V(0, 0, 0), xA: x, yA: z, outward: dn }];
    case "elbow2":
    case "elbow3":
    case "elbow4":
    case "elbow5": {   // unchanged (r15 7.5): the two mitred ends from redElbowDims with one Ø
      const { ta, hc, L1, L2 } = redElbowDims(p), k = Math.hypot(1, ta);
      return [
        { origin: V(0, -L1, 0), xA: V(1 / k, -ta / k, 0), yA: V(0, 0, 1), outward: V(-ta / k, -1 / k, 0) },
        { origin: V(0, hc + L2, 0), xA: V(1 / k, ta / k, 0), yA: V(0, 0, 1), outward: V(-ta / k, 1 / k, 0) },
      ];
    }
    case "redelbow": {   // r15 7.5-redelbow (Josh 21 Nov): the big and small openings of the tapering gores
      const e = reducingElbow(p);
      return e.ok ? e.ends.map((f) => ({ origin: f.origin, xA: f.xA, yA: f.yA, outward: f.outward })) : [];
    }
    case "elbow45": {
      const bend = ((p.bend || 90) * Math.PI) / 180;
      const rad = (Number(p.clr) > 0 ? Number(p.clr) : 1.5 * p.d);
      const o2 = V(rad * Math.sin(bend), rad * (1 - Math.cos(bend)), 0);
      const ax = V(Math.cos(bend), Math.sin(bend), 0);
      const yA2 = V(Math.sin(bend), -Math.cos(bend), 0);
      return [
        { origin: V(0, 0, 0), xA: V(0, 0, 1), yA: V(0, 1, 0), outward: V(-1, 0, 0) },
        { origin: o2, xA: V(0, 0, 1), yA: yA2, outward: ax },
      ];
    }
    case "rectelbow": {   // r15 7.5: the two duct openings of the cheek-and-wrapper elbow (see foldRectElbow)
      const { ang, ri, ro, w } = rectElbowDims(p.w || 0, p.h || 0, p.r, p.bend), rm = (ri + ro) / 2;
      const end = (a, out) => ({ origin: V(rm * Math.cos(a), w / 2, rm * Math.sin(a)), xA: V(Math.cos(a), 0, Math.sin(a)), yA: V(0, 1, 0), outward: out });
      return [end(0, V(0, 0, -1)), end(ang, V(-Math.sin(ang), 0, Math.cos(ang)))];
    }
    case "britches":
    case "ybranch":
    case "teetemp":
      return pairY(p.len || h);
    default:
      return [];
  }
}
function flangeFace(end, p, bolts, lip, frame) {
  const outward = norm(frame.outward);
  const midOf = (thk) => add(frame.origin, scl(outward, thk / 2));
  if (end.kind === "round") {
    const dim = bolts ? flangeDims(end.d, p) : { od: end.d + 2 * lip, bore: end.d, pcd: 0, n: 0, hole: 0, thk: (Number(p.flthk) > 0.05 ? Number(p.flthk) : 8), lip };
    const mid = midOf(dim.thk);
    const outer = circleRing(mid, frame.xA, frame.yA, dim.od / 2);
    const holes = [circleRing(mid, frame.xA, frame.yA, dim.bore / 2)];
    if (bolts) {
      for (let i = 0; i < dim.n; i++) {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / dim.n;
        const c = add(mid, add(scl(frame.xA, (dim.pcd / 2) * Math.cos(a)), scl(frame.yA, (dim.pcd / 2) * Math.sin(a))));
        holes.push(circleRing(c, frame.xA, frame.yA, dim.hole / 2, 48));
      }
    }
    const area = Math.PI * ((dim.od / 2) ** 2 - (dim.bore / 2) ** 2);
    return { face: { pts: outer, n: outward, holes, w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)), flange: true, thk: dim.thk },
      panel: { w: Math.PI * ((dim.od + dim.bore) / 2), h: (dim.od - dim.bore) / 2 } };
  }
  const dim = bolts ? flangeDims(Math.min(end.w, end.h), p) : { lip, thk: (Number(p.flthk) > 0.05 ? Number(p.flthk) : 8) };
  const L = dim.lip, thk = dim.thk, mid = midOf(thk);
  const pt = (u, v) => add(mid, add(scl(frame.xA, u), scl(frame.yA, v)));
  const hw = end.w / 2 + L, hh = end.h / 2 + L, iw = end.w / 2, ih = end.h / 2;
  const outer = [pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)];
  const inner = [pt(-iw, -ih), pt(-iw, ih), pt(iw, ih), pt(iw, -ih)];
  const holes = [inner];
  if (bolts) {
    const n = dim.n, hole = dim.hole;
    const x0 = -(end.w / 2 + L / 2), y0 = -(end.h / 2 + L / 2);
    const x1 = end.w / 2 + L / 2, y1 = end.h / 2 + L / 2;
    const pw = x1 - x0, ph = y1 - y0, peri = 2 * (pw + ph);
    for (let i = 0; i < n; i++) {
      let s = (i / n) * peri, u, v;
      if (s <= pw) { u = x0 + s; v = y0; }
      else if ((s -= pw) <= ph) { u = x1; v = y0 + s; }
      else if ((s -= ph) <= pw) { u = x1 - s; v = y1; }
      else { s -= pw; u = x0; v = y1 - s; }
      holes.push(circleRing(pt(u, v), frame.xA, frame.yA, hole / 2, 48));
    }
  }
  const area = (end.w + 2 * L) * (end.h + 2 * L) - end.w * end.h;
  return { face: { pts: outer, n: outward, holes, w: Math.sqrt(Math.max(0, area)), h: Math.sqrt(Math.max(0, area)), flange: true, thk },
    panel: { w: 2 * (end.w + end.h) + 4 * L, h: L } };
}
export function addPipeFlanges3d(sh, model, p) {
  if (!model || !sh) return model;
  const ends = pipeEnds(sh.id, p);
  if (!ends || !ends.length) return model;
  const frames = endFrames(sh.id, p);
  const faces = model.faces.slice();
  const panels = (model.panels || []).slice();
  ends.forEach((end, i) => {
    const frame = frames[i] || frames[0];
    if (!frame) return;
    const bolts = flangeOn(p, end.key);
    const lip = bolts ? 0 : existingLip(sh.id, p, end);
    if (!bolts && !(lip > 0.5)) return;
    if ((end.kind === "round" && !(end.d > 8)) || (end.kind === "rect" && !(end.w > 8 && end.h > 8))) return;
    const built = flangeFace(end, p, bolts, lip, frame);
    if (!built) return;
    faces.push(built.face);
    panels.push(built.panel);
  });
  return { ...model, faces, panels };
}

export function isFoldPart(sh) {
  return !!(sh && (typeof sh.fold === "function" || FOLD_MODELS[sh.id]));
}
// opts.fold: how far to fold (1 folded, the default; 0 flat) for the Unfold slider (r15 5.7)
export function foldModel(sh, p, opts = {}) {
  if (!sh) return null;
  const t = Number(opts && opts.fold);
  FOLD.t = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 1;
  FOLD.used = false;
  try {
    const mid = typeof sh.fold === "function" ? sh.fold(p) : (FOLD_MODELS[sh.id] ? FOLD_MODELS[sh.id](p) : null);
    const m = mid ? addPipeFlanges3d(sh, mid, p) : null;
    if (m) m.unfoldable = FOLD.used;
    return m;
  } catch (e) { return null; } finally { FOLD.t = 1; FOLD.used = false; }
}

// r15 5.7: the part's overall sizes and where to label them on the 3D view
export function modelDims(model) {
  const fs = ((model && model.faces) || []).filter((f) => !f.ghost);
  if (!fs.length) return { x: 0, y: 0, z: 0, box: null };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of fs) for (const q of f.pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  return { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2], box: [lo, hi] };
}
export const mmText = (v) => `${Math.round(v * 10) / 10} mm`;

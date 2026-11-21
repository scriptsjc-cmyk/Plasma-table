// r15 8.5 (split from fold3d.js): drawing a 3D model - projection, shading, sharp edges, sizes in 3D, SVG thumbnails.
// No external library: painter's-algorithm polygons on canvas (and the same projection as SVG thumbs).
import { attachSmoothNormals, edgeKey, isSharpPair } from "./fold3d-geom.js";
import { mmText, modelDims } from "./fold3d-models.js";
import { V, add, scl, dot, norm } from "./vec3.js";

export function dimLabels(model, cam, w, h, pad = Math.max(16, Math.round(Math.min(w, h) * 0.06)), sizes) {
  const d = modelDims(model);
  if (!d.box) return [];
  const sz = sizes || d, [lo, hi] = d.box;
  const fs = model.faces.filter((f) => !f.ghost);
  const { xy } = projector(fs.length ? fs : model.faces, cam, w, h, pad);
  const depth = (p) => rotCam(p, cam)[2];
  // bottom corners; the edges along x and z nearest the viewer, and the upright at the left-most bottom corner
  const zNear = depth(V((lo[0] + hi[0]) / 2, lo[1], hi[2])) > depth(V((lo[0] + hi[0]) / 2, lo[1], lo[2])) ? hi[2] : lo[2];
  const xNear = depth(V(hi[0], lo[1], (lo[2] + hi[2]) / 2)) > depth(V(lo[0], lo[1], (lo[2] + hi[2]) / 2)) ? hi[0] : lo[0];
  const corners = [V(lo[0], lo[1], lo[2]), V(hi[0], lo[1], lo[2]), V(lo[0], lo[1], hi[2]), V(hi[0], lo[1], hi[2])];
  const left = corners.reduce((a, b) => (xy(b)[0] < xy(a)[0] ? b : a));
  const edges = [
    { a: V(lo[0], lo[1], zNear), b: V(hi[0], lo[1], zNear), v: sz.x },
    { a: V(xNear, lo[1], lo[2]), b: V(xNear, lo[1], hi[2]), v: sz.z },
    { a: left, b: V(left[0], hi[1], left[2]), v: sz.y },
  ];
  const c = xy(V((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2));
  return edges.filter((e) => e.v > 0.05).map((e) => {
    const A = xy(e.a), B = xy(e.b), m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    let ox = m[0] - c[0], oy = m[1] - c[1];
    const L = Math.hypot(ox, oy) || 1;
    ox /= L; oy /= L;
    const text = mmText(e.v), half = text.length * 3.4 + 6;      // keep the pill inside the canvas
    const x = Math.max(half, Math.min(w - half, m[0] + ox * 16)), y = Math.max(10, Math.min(h - 10, m[1] + oy * 16));
    return { text, x, y, a: [A[0] + ox * 7, A[1] + oy * 7], b: [B[0] + ox * 7, B[1] + oy * 7] };
  });
}
function drawDims(ctx, cv, model, cam, w, h, pad) {
  const base = model.base || model, d = modelDims(base);
  const labels = dimLabels(model, cam, w, h, pad, d);
  cv._dims = labels;
  if (w < 220 || !labels.length) return;
  ctx.save();
  ctx.strokeStyle = "rgba(43, 49, 56, 0.7)";   // neutral ink: blue means "the template you cut" ctx.lineWidth = 1;
  ctx.font = "600 11px Barlow, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const l of labels) {
    ctx.beginPath(); ctx.moveTo(l.a[0], l.a[1]); ctx.lineTo(l.b[0], l.b[1]); ctx.stroke();
    const tw = ctx.measureText(l.text).width + 8;
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillRect(l.x - tw / 2, l.y - 8, tw, 16);
    ctx.fillStyle = "#2b3138"; ctx.fillText(l.text, l.x, l.y);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ projection / drawing

export const DEFAULT_CAM = { yaw: 0.85, pitch: 0.52 };

const KEY_L = norm(V(0.42, 0.78, 0.48));
const FILL_L = norm(V(-0.55, 0.28, 0.22));
const STEEL = [188, 196, 204], EDGE = "#2c333c";

function rotCam(p, cam) {
  const y = cam.yaw, x = cam.pitch;
  const cy = Math.cos(y), sy = Math.sin(y), cx = Math.cos(x), sx = Math.sin(x);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cx - z1 * sx;
  const z2 = p[1] * sx + z1 * cx;
  return [x1, y2, z2];
}

function boundsOf(faces, cam) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of faces) for (const p of f.pts) {
    const q = rotCam(p, cam);
    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
    z0 = Math.min(z0, q[2]); z1 = Math.max(z1, q[2]);
  }
  return [x0, y0, x1, y1, z0, z1];
}

function shadeN(n) {
  const nd = n[2] < 0 ? scl(n, -1) : n;
  const key = Math.max(0, dot(nd, KEY_L));
  const fill = Math.max(0, dot(nd, FILL_L));
  const half = norm(add(KEY_L, V(0, 0, 1)));
  const spec = Math.pow(Math.max(0, dot(nd, half)), 28);
  return Math.max(0.2, Math.min(1.18, 0.24 + 0.66 * key + 0.22 * fill + 0.26 * spec));
}

const ACCENT_RGB = [38, 122, 196];              // the app's accent (CAD blue), a touch lighter so it still shades
function accentRgb(c) {
  const k = Math.max(0.3, Math.min(1.15, c));
  return `rgb(${Math.round(ACCENT_RGB[0] * k)},${Math.round(ACCENT_RGB[1] * k)},${Math.round(ACCENT_RGB[2] * k)})`;
}
function steelRgb(c) {
  const k = Math.max(0.18, Math.min(1.15, c));
  return `rgb(${Math.round(STEEL[0] * k)},${Math.round(STEEL[1] * k)},${Math.round(STEEL[2] * k)})`;
}

function collectEdges(faces) {
  const map = new Map();
  for (const f of faces) {
    const pts = f.pts, n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const k = edgeKey(a, b);
      let e = map.get(k);
      if (!e) map.set(k, e = { a, b, faces: [] });
      e.faces.push(f);
    }
  }
  return [...map.values()];
}

function projector(faces, cam, w, h, pad = 10) {
  const [x0, y0, x1, y1] = boundsOf(faces, cam);
  const bw = Math.max(1e-6, x1 - x0), bh = Math.max(1e-6, y1 - y0);
  const s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = (w - bw * s) / 2 - x0 * s, oy = (h + bh * s) / 2 + y0 * s;
  const xy = (p) => {
    const q = rotCam(p, cam);
    return [ox + q[0] * s, oy - q[1] * s, q[2]];
  };
  return { xy, s, ox, oy };
}

// frame: the faces the view is fitted to (default: these faces). r15 7.5: ghosts are drawn in the part's frame.
function projectFaces(faces, cam, w, h, pad = 10, frame = faces) {
  attachSmoothNormals(faces);
  const { xy } = projector(frame, cam, w, h, pad);
  const out = faces.map((f) => {
    const qs = f.pts.map((p) => rotCam(p, cam));
    const depth = qs.reduce((a, p) => a + p[2], 0) / qs.length;
    const nCam = rotCam(f.n, cam);
    const vnCam = (f.vn || f.pts.map(() => f.n)).map((v) => rotCam(v, cam));
    const lits = vnCam.map(shadeN);
    const lit = lits.reduce((a, v) => a + v, 0) / lits.length;
    const path = qs.map((p, i) => {
      const q = xy(f.pts[i]);
      return [q[0], q[1]];
    });
    const holes = (f.holes || []).map((ring) => ring.map((p) => {
      const q = xy(p);
      return [q[0], q[1]];
    }));
    return { path, holes, depth, lit, lits, back: nCam[2] < -0.02, nCam, src: f };
  });
  out.sort((a, b) => a.depth - b.depth);
  return out;
}

function fillShaded(ctx, path, holes, lits, back, src) {
  if (path.length < 3) return;
  const rgb = src && src.accent ? accentRgb : steelRgb;
  ctx.beginPath();
  path.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.closePath();
  for (const hole of holes || []) {
    if (hole.length < 3) continue;
    hole.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
  }
  const cols = (lits && lits.length) ? lits : [1];
  let lo = 0, hi = 0;
  for (let i = 1; i < cols.length; i++) {
    if (cols[i] < cols[lo]) lo = i;
    if (cols[i] > cols[hi]) hi = i;
  }
  const spread = cols[hi] - cols[lo];
  if (!back && spread > 0.04 && path[lo] && path[hi]) {
    const g = ctx.createLinearGradient(path[lo][0], path[lo][1], path[hi][0], path[hi][1]);
    g.addColorStop(0, rgb(cols[lo]));
    g.addColorStop(1, rgb(cols[hi]));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = rgb(back ? Math.min(0.5, (cols[0] || 0.5) * 0.72) : (cols.reduce((a, v) => a + v, 0) / cols.length));
  }
  ctx.fill("evenodd");
}

function drawGroundShadow(ctx, faces, cam, w, h, pad) {
  const { xy } = projector(faces, cam, w, h, pad);
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const f of faces) for (const p of f.pts) {
    minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
    minz = Math.min(minz, p[2]); maxz = Math.max(maxz, p[2]);
  }
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  const rx = Math.max(4, (maxx - minx) / 2) * 1.18, rz = Math.max(4, (maxz - minz) / 2) * 1.18;
  ctx.save();
  ctx.filter = "blur(7px)";
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#1a222c";
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const q = xy(V(cx + rx * Math.cos(a), 0, cz + rz * Math.sin(a)));
    i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSharpEdges(ctx, faces, cam, w, h, pad, strokeW, ghostPass = false, frame = faces) {
  const { xy } = projector(frame, cam, w, h, pad);
  ctx.save();
  ctx.strokeStyle = ghostPass ? "rgba(70, 90, 110, 0.55)" : EDGE;
  ctx.lineWidth = ghostPass ? strokeW * 0.8 : strokeW;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (ghostPass) ctx.setLineDash([3, 2.2]);
  ctx.beginPath();
  for (const e of collectEdges(faces)) {
    const walls = e.faces.filter((f) => f.holeWall);
    if (walls.length === e.faces.length) continue;
    const allGhost = e.faces.every((f) => f.ghost);
    const anyGhost = e.faces.some((f) => f.ghost);
    if (ghostPass ? !allGhost : allGhost) continue;
    if (!ghostPass && anyGhost && allGhost) continue;
    const ncs = e.faces.map((f) => rotCam(f.n, cam));
    let sharp = e.faces.length !== 2;
    if (e.faces.length === 2) sharp = isSharpPair(e.faces[0], e.faces[1]);
    const front = ncs.map((n) => n[2] > 0.0);
    const sil = e.faces.length === 1 ? front[0] : (front[0] !== front[1]);
    if (!sharp && !sil) continue;
    if (front.every((v) => !v) && !sil) continue;
    const a = xy(e.a), b = xy(e.b);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawFoldCanvas(cv, model, cam = DEFAULT_CAM) {
  if (!cv || !model || !model.faces || !model.faces.length) return;
  const dpr = Math.max(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const w = cv.clientWidth || cv.width || 320, h = cv.clientHeight || cv.height || 180;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#eef3f7");
  bg.addColorStop(1, "#cfd8e2");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const pad = Math.max(16, Math.round(Math.min(w, h) * 0.06));
  const solidFaces = model.faces.filter((f) => !f.ghost);
  const ghostFaces = model.faces.filter((f) => f.ghost);
  // r15 7.5: one frame for the whole picture, fitted to the part; the ghost (context) parts used to be fitted on their own,
  // so they were drawn at another size and place (the take-off looked as if it hung under its duct)
  const frame = solidFaces.length ? solidFaces : model.faces;
  drawGroundShadow(ctx, frame, cam, w, h, pad);
  if (ghostFaces.length) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    for (const p of projectFaces(ghostFaces, cam, w, h, pad, frame)) fillShaded(ctx, p.path, p.holes, p.lits, p.back, p.src);
    ctx.restore();
    drawSharpEdges(ctx, ghostFaces, cam, w, h, pad, Math.max(0.9, Math.min(w, h) / 280), true, frame);
  }
  const polys = projectFaces(solidFaces.length ? solidFaces : model.faces, cam, w, h, pad);
  for (const p of polys) fillShaded(ctx, p.path, p.holes, p.lits, p.back, p.src);
  drawSharpEdges(ctx, solidFaces.length ? solidFaces : model.faces, cam, w, h, pad, Math.max(0.9, Math.min(w, h) / 280));
  drawDims(ctx, cv, model, cam, w, h, pad);              // r15 5.7
}

export function foldThumbSvg(model, w = 96, h = 72, cam = DEFAULT_CAM) {
  if (!model || !model.faces || !model.faces.length) return "";
  const pad = 6;
  const polys = projectFaces(model.faces, cam, w, h, pad);
  const { xy } = projector(model.faces, cam, w, h, pad);
  let body = "";
  for (const p of polys) {
    const ring = (pts) => pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ") + "Z";
    const fill = (p.src && p.src.accent ? accentRgb : steelRgb)(p.back ? 0.5 : p.lit);
    const op = p.src && p.src.ghost ? ' fill-opacity="0.32"' : "";
    body += `<path d="${ring(p.path)}${p.holes.map(ring).join("")}" fill="${fill}" fill-rule="evenodd"${op}/>`;
  }
  let edges = "";
  for (const e of collectEdges(model.faces)) {
    if (e.faces.every((f) => f.holeWall)) continue;
    const ncs = e.faces.map((f) => rotCam(f.n, cam));
    let sharp = e.faces.length !== 2;
    if (e.faces.length === 2) sharp = isSharpPair(e.faces[0], e.faces[1]);
    const front = ncs.map((n) => n[2] > 0);
    const sil = e.faces.length === 1 ? front[0] : (front[0] !== front[1]);
    if (!sharp && !sil) continue;
    if (front.every((v) => !v) && !sil) continue;
    const a = xy(e.a), b = xy(e.b);
    edges += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  }
  if (edges) body += `<path d="${edges}" fill="none" stroke="#2c333c" stroke-width="0.7" stroke-linejoin="round"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`;
}

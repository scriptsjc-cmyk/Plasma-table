// Raster to outline engine, shared by the text tool and the photo / logo trace.
// Pure maths (no DOM) so it runs the same in the browser and in the node tests.
//   march(field, nx, ny)      marching squares on a grid of values (negative = material), with sub-cell interpolation
//   simplifyRing(pts, tol)    Douglas-Peucker for a closed ring
//   ringArea(pts)             signed area (positive = counter-clockwise)
//   traceImage(img, opts)     RGBA picture -> closed outlines in mm (holes included), ready for contoursToEditable

export function ringArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

// Marching squares. field[j * nx + i] < 0 means material. The outermost ring of nodes is treated as empty so every outline closes.
// Rings come back in node units (x = i, y = j); material is on the left of each ring (outer rings counter-clockwise, holes clockwise).
export function march(field, nx, ny) {
  const N = nx * ny;
  const F = field;
  const val = (i, j) => (i <= 0 || j <= 0 || i >= nx - 1 || j >= ny - 1) ? 1e9 : F[j * nx + i];
  const next = new Int32Array(2 * N).fill(-1);
  const hk = (i, j) => (j * nx + i) * 2, vk = (i, j) => (j * nx + i) * 2 + 1;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const va = val(i, j), vb = val(i + 1, j), vc = val(i + 1, j + 1), vd = val(i, j + 1);
      const idx = (va < 0 ? 1 : 0) | (vb < 0 ? 2 : 0) | (vc < 0 ? 4 : 0) | (vd < 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const B = hk(i, j), R = vk(i + 1, j), T = hk(i, j + 1), L = vk(i, j);
      switch (idx) {
        case 1: next[B] = L; break;
        case 2: next[R] = B; break;
        case 3: next[R] = L; break;
        case 4: next[T] = R; break;
        case 6: next[T] = B; break;
        case 7: next[T] = L; break;
        case 8: next[L] = T; break;
        case 9: next[B] = T; break;
        case 11: next[R] = T; break;
        case 12: next[L] = R; break;
        case 13: next[B] = R; break;
        case 14: next[L] = B; break;
        case 5: if ((va + vb + vc + vd) < 0) { next[B] = R; next[T] = L; } else { next[B] = L; next[T] = R; } break;
        case 10: if ((va + vb + vc + vd) < 0) { next[L] = B; next[R] = T; } else { next[R] = B; next[L] = T; } break;
        default: break;
      }
    }
  }
  const point = (key) => {
    const n = key >> 1, i = n % nx, j = (n - i) / nx;
    if (key & 1) { const v0 = val(i, j), v1 = val(i, j + 1); return [i, j + v0 / (v0 - v1)]; }
    const v0 = val(i, j), v1 = val(i + 1, j);
    return [i + v0 / (v0 - v1), j];
  };
  const rings = [];
  for (let s = 0; s < next.length; s++) {
    if (next[s] < 0) continue;
    const pts = [];
    let k = s;
    while (k >= 0 && next[k] >= 0) {
      pts.push(point(k));
      const n = next[k]; next[k] = -1; k = n;
      if (k === s) break;
    }
    if (pts.length >= 3) rings.push(pts);
  }
  return rings;
}

// Douglas-Peucker on a closed ring (iterative; keeps the two most distant points as anchors)
export function simplifyRing(pts, tol) {
  const n = pts.length;
  if (n <= 4 || !(tol > 0)) return pts.slice();
  let a = 0, b = 0, best = -1;
  for (let i = 1; i < n; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > best) { best = d; b = i; } }
  const keep = new Uint8Array(n); keep[a] = 1; keep[b] = 1;
  const segDist = (p, s, e) => {
    const dx = e[0] - s[0], dy = e[1] - s[1], l2 = dx * dx + dy * dy;
    if (l2 < 1e-18) return Math.hypot(p[0] - s[0], p[1] - s[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / l2));
    return Math.hypot(p[0] - s[0] - t * dx, p[1] - s[1] - t * dy);
  };
  const stack = [[a, b], [b, a + n]];
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;
    let md = -1, mi = -1;
    for (let k = s + 1; k < e; k++) { const d = segDist(pts[k % n], pts[s % n], pts[e % n]); if (d > md) { md = d; mi = k; } }
    if (md > tol) { keep[mi % n] = 1; stack.push([s, mi], [mi, e]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out.length >= 3 ? out : pts.slice();
}

export function otsu(hist, total) {
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sB = 0, wB = 0;
  const score = new Float64Array(256);
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; const wF = total - wB;
    sB += t * hist[t];
    if (!wB || !wF) { score[t] = 0; continue; }
    const mB = sB / wB, mF = (sum - sB) / wF;
    score[t] = wB * wF * (mB - mF) * (mB - mF);
  }
  let best = 0; for (let t = 0; t < 256; t++) if (score[t] > best) best = score[t];
  if (best <= 0) return 128;
  let lo = -1, hi = -1;                                  // a flat top (two clean colours) -> the middle of it
  for (let t = 0; t < 256; t++) if (score[t] >= best * 0.9999) { if (lo < 0) lo = t; hi = t; }
  return Math.round((lo + hi + 1) / 2);
}

// RGBA -> brightness 0..255 (transparent counts as white paper), scaled down by box averaging so the longest side is <= maxSide
export function toGray(img, maxSide = 1200) {
  const { data, width: w, height: h } = img;
  const f = Math.max(1, Math.ceil(Math.max(w, h) / maxSide));
  const ow = Math.max(1, Math.floor(w / f)), oh = Math.max(1, Math.floor(h / f));
  const g = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let s = 0, c = 0;
      for (let yy = y * f; yy < Math.min(h, y * f + f); yy++) {
        for (let xx = x * f; xx < Math.min(w, x * f + f); xx++) {
          const o = (yy * w + xx) * 4, a = data[o + 3] / 255;
          s += (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) * a + 255 * (1 - a); c++;
        }
      }
      g[y * ow + x] = c ? s / c : 255;
    }
  }
  return { g, w: ow, h: oh };
}

function boxBlur(g, w, h, r) {
  if (r < 1) return g;
  const tmp = new Float32Array(g.length), out = new Float32Array(g.length), k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += g[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = s / k; s += g[y * w + Math.min(w - 1, x + r + 1)] - g[y * w + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / k; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}

export function grayHistogram(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.g.length; i++) hist[Math.max(0, Math.min(255, Math.round(gray.g[i])))]++;
  return hist;
}

// opts: widthMm (finished width of the picture), threshold 0..255 (null = automatic), invert (light parts instead of dark),
//       blur (px), minArea (mm2, specks and pin-holes smaller than this are dropped), simplify (mm), maxSide (px)
export function traceImage(img, opts = {}) {
  const o = { widthMm: 100, threshold: null, invert: false, blur: 0, minArea: 1, simplify: 0.15, maxSide: 1200, ...opts };
  const gray = toGray(img, o.maxSide);
  const hist = grayHistogram(gray);
  const auto = otsu(hist, gray.g.length);
  const thr = o.threshold == null ? auto : o.threshold;
  const pad = 2, W = gray.w + pad * 2, H = gray.h + pad * 2;
  const g = o.blur >= 1 ? boxBlur(gray.g, gray.w, gray.h, Math.round(o.blur)) : gray.g;
  const F = new Float32Array(W * H).fill(1);
  for (let y = 0; y < gray.h; y++) {
    for (let x = 0; x < gray.w; x++) {
      // pixel centres sit half a cell inside the picture edge; inside = darker than the threshold (or lighter when inverted)
      const v = g[y * gray.w + x] - thr;
      F[(y + pad) * W + x + pad] = o.invert ? -v : v;
    }
  }
  const mm = o.widthMm / gray.w;                       // mm per pixel
  const heightMm = gray.h * mm;
  const raw = march(F, W, H);
  const out = [];
  let dropped = 0;
  for (const r of raw) {
    // node (x,y) -> mm: image y runs down, the sketch y runs up
    const pts = r.map(([x, y]) => [(x - pad + 0.5) * mm, heightMm - (y - pad + 0.5) * mm]);
    if (Math.abs(ringArea(pts)) < o.minArea) { dropped++; continue; }
    const s = simplifyRing(pts, o.simplify);
    if (Math.abs(ringArea(s)) < o.minArea) { dropped++; continue; }
    out.push({ pts: s, closed: true });
  }
  const outers = out.filter((c) => ringArea(c.pts) < 0).length;          // (mm y runs up, so material outlines come out clockwise)
  return { contours: out, outers, holes: out.length - outers, dropped, widthMm: o.widthMm, heightMm, threshold: thr, autoThreshold: auto, pixels: [gray.w, gray.h] };
}
